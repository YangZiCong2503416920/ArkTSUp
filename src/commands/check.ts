/**
 * arktsup check — 扫描 .ets 源码中的 ArkTS 不兼容写法。
 *
 * 用法:
 *   arktsup check [path] [options]
 *
 * 选项:
 *   --format <fmt>        text | json（默认 text）
 *   --min-severity <s>    error | warning（默认 warning）
 *   --exclude <dirs>      额外跳过的目录（逗号分隔，追加到默认列表）
 *   -h, --help            显示帮助
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import { scanSource, applyAutoFixes, DEFAULT_SKIP, ScanReport, Severity, Finding } from '../lib/arkts-check';
import { loadConfig, isRuleIgnored } from '../lib/config';
import { checkApiVersionInSource, detectMinApiVersion } from '../lib/api-check';
import { renderHtmlReport, renderJsonReport, FixStats } from '../lib/report';
import { analyzeSemantics } from '../lib/semantic';

const SEV_COLOR: Record<string, string> = {
  error: '\x1b[31m',   // red
  warning: '\x1b[33m', // yellow
  info: '\x1b[36m',    // cyan
};
const RESET = '\x1b[0m';

export function runCheck(argv: string[]): number {
  let target = '.';
  let format: 'text' | 'json' | 'markdown' = 'text';
  let minSeverity: Severity = 'warning';
  let fix = false;
  let watch = false;
  let staged = false;
  let apiVersion: number | undefined;
  let reportFile: string | undefined;
  let semantic = true;
  const extraSkip: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--format': {
        const v = argv[++i];
        if (v !== 'text' && v !== 'json' && v !== 'markdown') { console.error('错误: --format 只支持 text | json | markdown'); return 2; }
        format = v;
        break;
      }
      case '--min-severity': {
        const v = argv[++i];
        if (v !== 'error' && v !== 'warning') { console.error('错误: --min-severity 只支持 error | warning'); return 2; }
        minSeverity = v;
        break;
      }
      case '--exclude':
        extraSkip.push(...argv[++i].split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case '--fix':
        fix = true;
        break;
      case '--watch':
        watch = true;
        break;
      case '--staged':
        staged = true;
        break;
      case '--api-version': {
        const v = parseInt(argv[++i], 10);
        if (Number.isNaN(v) || v < 5) { console.error('错误: --api-version 需要有效 API 版本号（如 10）'); return 2; }
        apiVersion = v;
        break;
      }
      case '--report':
        reportFile = argv[++i];
        break;
      case '--no-semantic':
        semantic = false;
        break;
      case '-h': case '--help':
        console.log(HELP);
        return 0;
      default:
        if (a.startsWith('-')) { console.error(`错误: 未知选项 "${a}"`); console.log(HELP); return 2; }
        if (target === '.') target = a;
        else { console.error(`错误: 多余的位置参数 "${a}"`); return 2; }
    }
  }

  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) {
    console.error(`错误: 路径不存在 ${abs}`);
    return 2;
  }
  const isFile = fs.statSync(abs).isFile();
  const config = loadConfig(isFile ? path.dirname(abs) : abs);
  const skip = new Set([...DEFAULT_SKIP, ...extraSkip, ...(config.ignore?.dirs ?? [])]);

  /** 构造一次检查运行（含 --fix 写入），返回处理器与修复统计 */
  const makeProcessor = (): {
    processFileContent: (f: string, t: string) => Finding[];
    getTotalFixed: () => number;
    getFixStats: () => FixStats;
  } => {
    let totalFixed = 0;
    const fixStats: FixStats = { byRule: {}, total: 0, perFile: {} };
    const processFileContent = (file: string, text: string): Finding[] => {
      let src = text;
      if (fix) {
        const res = applyAutoFixes(src);
        if (res.total > 0) {
          fs.writeFileSync(file, res.text);
          totalFixed += res.total;
          fixStats.total += res.total;
          const pf = (fixStats.perFile[file] = fixStats.perFile[file] || {});
          for (const [r, n] of Object.entries(res.byRule)) {
            if (n > 0) {
              fixStats.byRule[r] = (fixStats.byRule[r] || 0) + n;
              pf[r] = (pf[r] || 0) + n;
            }
          }
          src = res.text;
        }
      }
      return scanSource(file, src, minSeverity);
    };
    return { processFileContent, getTotalFixed: () => totalFixed, getFixStats: () => fixStats };
  };

  /** 对一组文件跑检查并汇总报告 */
  const runOnFiles = (files: string[], proc: { processFileContent: (f: string, t: string) => Finding[] }): ScanReport => {
    const findings: Finding[] = [];
    for (const f of files) {
      try {
        findings.push(...proc.processFileContent(f, fs.readFileSync(f, 'utf8')));
      } catch (e) {
        console.error(`跳过 ${f}: ${(e as Error).message}`);
      }
    }
    return summarize(findings, files.length, config);
  };

  // ---- --staged：只检查 git 暂存区的 .ets（pre-commit 场景） ----
  if (staged) {
    const stagedFiles = getStagedEtsFiles(process.cwd());
    if (stagedFiles === null) {
      console.error('错误: --staged 需要 git 仓库（当前目录或父目录不是 git 仓库）');
      return 2;
    }
    if (stagedFiles.length === 0) {
      process.stdout.write('暂存区没有 .ets 文件\n');
      return 0;
    }
    const proc = makeProcessor();
    const report = runOnFiles(stagedFiles, proc);
    return outputReport(report, proc.getTotalFixed(), format, isRuleIgnored);
  }

  // ---- --watch：监听目录变更自动重查 ----
  if (watch) {
    if (isFile) {
      console.error('错误: --watch 需要目录路径');
      return 2;
    }
    return runWatch(abs, { minSeverity, fix, skip, config, format, makeProcessor, runOnFiles });
  }

  // ---- 单次检查 ----
  const proc = makeProcessor();
  let report: ScanReport;
  let scannedFiles: string[] = [];
  if (isFile) {
    let findings: Finding[];
    try {
      findings = proc.processFileContent(abs, fs.readFileSync(abs, 'utf8'));
    } catch (e) {
      console.error(`错误: 无法处理 ${abs}: ${(e as Error).message}`);
      return 2;
    }
    report = summarize(findings, 1, config);
    scannedFiles = [abs];
  } else {
    const { collectEtsFiles } = require('../lib/arkts-check') as typeof import('../lib/arkts-check');
    const files = collectEtsFiles(abs, skip);
    scannedFiles = files;
    report = runOnFiles(files, proc);
  }

  // ---- API 版本兼容检查（D1）：--api-version 显式指定，或从 module.json5/app.json5 自动探测 ----
  const minV = apiVersion ?? (isFile ? null : detectMinApiVersion(abs));
  if (minV !== null && minV !== undefined) {
    for (const f of scannedFiles) {
      try {
        report.findings.push(...checkApiVersionInSource(f, fs.readFileSync(f, 'utf8'), minV, minSeverity));
      } catch { /* 跳过无法读取的文件 */ }
    }
    report = summarize(report.findings, report.filesScanned, config);
  }

  // ---- 语义分析增强（D3）：类型信息精确判定 propsByIndex/untypedObjectLiteral/utilityType ----
  // 目录模式默认开启；--no-semantic 关闭；watch/staged 因性能/快照语义跳过
  if (semantic && !isFile && !watch && !staged && scannedFiles.length > 0) {
    const sem = analyzeSemantics(scannedFiles);
    const exempt = (f: Finding): boolean => {
      const k = f.file + ':' + f.line + ':' + f.column;
      if (f.rule === 'propsByIndex' && sem.propsByIndexExempt.has(k)) return true;
      if (f.rule === 'untypedObjectLiteral' && sem.literalExempt.has(k)) return true;
      if (f.rule === 'utilityType' && sem.utilityExempt.has(k)) return true;
      return false;
    };
    report.findings = report.findings.filter((f) => !exempt(f));
    // 升级为 error 的位置：移除语法层对应的 warning，避免重复报告
    const upgradeKeys = new Set(sem.propsByIndexErrors.map((e) => e.file + ':' + e.line + ':' + e.column));
    report.findings = report.findings.filter((f) => {
      if (f.rule === 'propsByIndex' && upgradeKeys.has(f.file + ':' + f.line + ':' + f.column)) return false;
      return true;
    });
    report.findings.push(...sem.propsByIndexErrors);
    report = summarize(report.findings, report.filesScanned, config);
  }

  // ---- 工程迁移报告（D2）：--report <file.html|file.json> ----
  if (reportFile) {
    const fixStats = proc.getFixStats();
    const isJson = reportFile.endsWith('.json');
    const outText = isJson
      ? renderJsonReport(report, fixStats.total > 0 ? fixStats : undefined)
      : renderHtmlReport({
          title: 'ArkTSUp 检查/迁移报告',
          report,
          fixStats: fixStats.total > 0 ? fixStats : undefined,
          apiVersion: minV ?? undefined,
        });
    try {
      fs.writeFileSync(reportFile, outText);
      process.stdout.write(`报告已生成: ${reportFile}\n`);
    } catch (e) {
      console.error(`错误: 无法写入报告 ${reportFile}: ${(e as Error).message}`);
      return 2;
    }
  }

  return outputReport(report, proc.getTotalFixed(), format, isRuleIgnored);
}

/** 汇总 findings 为报告并应用 .arktsuprc 规则忽略 */
function summarize(findings: Finding[], filesScanned: number, config: ReturnType<typeof loadConfig>): ScanReport {
  const filtered = findings.filter((f) => !isRuleIgnored(config, f.rule));
  return {
    findings: filtered,
    filesScanned,
    errors: filtered.filter((f) => f.severity === 'error').length,
    warnings: filtered.filter((f) => f.severity === 'warning').length,
    infos: filtered.filter((f) => f.severity === 'info').length,
  };
}

/** 输出报告（text/json/markdown）并返回退出码 */
function outputReport(report: ScanReport, totalFixed: number, format: 'text' | 'json' | 'markdown', _ignored: unknown): number {
  if (totalFixed > 0) {
    process.stdout.write(`已自动修复 ${totalFixed} 处（any->Object、var->let、<T>expr->as T、解构拆分；解构/断言后请编译验证）\n`);
  }
  if (format === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.errors > 0 ? 1 : 0;
  }
  if (format === 'markdown') {
    process.stdout.write(`## ArkTSUp 检查报告\n\n扫描 ${report.filesScanned} 个 .ets 文件：${report.errors} 错误，${report.warnings} 警告，${report.infos} 提示\n\n`);
    if (report.findings.length === 0) {
      process.stdout.write('✅ 未发现问题\n');
      return 0;
    }
    process.stdout.write('| 文件 | 行:列 | 级别 | 规则 | 问题 |\n| --- | --- | --- | --- | --- |\n');
    for (const f of report.findings) {
      const rel = path.relative(process.cwd(), f.file) || f.file;
      const msg = f.message.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      process.stdout.write(`| ${rel} | ${f.line}:${f.column} | ${f.severity} | ${f.rule} | ${msg} |\n`);
    }
    return report.errors > 0 ? 1 : 0;
  }
  for (const f of report.findings) {
    const color = SEV_COLOR[f.severity] ?? '';
    const rel = path.relative(process.cwd(), f.file) || f.file;
    process.stdout.write(
      `${color}${f.severity.padEnd(7)}${RESET} ${rel}:${f.line}:${f.column} [${f.rule}] ${f.message}\n` +
      `        ${f.snippet}\n` +
      `        建议: ${f.fix}\n`
    );
  }
  process.stdout.write(`\n扫描 ${report.filesScanned} 个 .ets 文件：${report.errors} 错误，${report.warnings} 警告，${report.infos} 提示\n`);
  return report.errors > 0 ? 1 : 0;
}

/** git 暂存区的 .ets 文件（相对 cwd 解析为绝对路径） */
function getStagedEtsFiles(cwd: string): string[] | null {
  const cp = require('node:child_process') as typeof import('node:child_process');
  const r = cp.spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8', cwd });
  if (r.status !== 0) return null;
  return r.stdout.split('\n')
    .map((f) => f.trim())
    .filter((f) => f.endsWith('.ets'))
    .map((f) => path.resolve(cwd, f))
    .filter((f) => fs.existsSync(f));
}

/** --watch：监听目录（递归）变更，防抖 400ms 重跑；Ctrl+C 退出 */
function runWatch(
  abs: string,
  opts: {
    minSeverity: Severity; fix: boolean; skip: Set<string>;
    config: ReturnType<typeof loadConfig>; format: 'text' | 'json' | 'markdown';
    makeProcessor: () => { processFileContent: (f: string, t: string) => Finding[]; getTotalFixed: () => number };
    runOnFiles: (files: string[], proc: { processFileContent: (f: string, t: string) => Finding[] }) => ScanReport;
  },
): number {
  const { collectEtsFiles } = require('../lib/arkts-check') as typeof import('../lib/arkts-check');
  const runOnce = (reason: string): void => {
    const proc = opts.makeProcessor();
    const files = collectEtsFiles(abs, opts.skip);
    const report = opts.runOnFiles(files, proc);
    process.stdout.write(`\n[watch] ${reason} —— `);
    outputReport(report, proc.getTotalFixed(), opts.format, null);
  };
  runOnce('初始检查');
  let timer: NodeJS.Timeout | undefined;
  let watcher: fs.FSWatcher;
  try {
    watcher = fs.watch(abs, { recursive: true }, (_ev, name) => {
      const n = String(name ?? '');
      if (!n.endsWith('.ets') && !n.includes('.')) return; // 只关心 .ets 与目录事件
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => runOnce('检测到变更 ' + n), 400);
    });
  } catch (e) {
    console.error(`错误: 无法监听 ${abs}: ${(e as Error).message}（当前平台可能不支持递归 watch，请用普通模式）`);
    return 2;
  }
  process.stdout.write('[watch] 监听中（Ctrl+C 退出）...\n');
  process.on('SIGINT', () => {
    watcher.close();
    process.stdout.write('\n[watch] 已退出\n');
    process.exit(0);
  });
  // 常驻模式：返回 -1 让 cli.ts 跳过 process.exit（watcher 事件循环保持进程存活）
  return -1;
}

const HELP = `arktsup check — 扫描 .ets 源码中的 ArkTS 不兼容写法

用法:
  arktsup check [path] [options]
  arktsup check src/main/ets/pages

选项:
  --format <fmt>        text | json | markdown（默认 text）
  --min-severity <s>    error | warning（默认 warning）
  --exclude <dirs>      额外跳过的目录（逗号分隔，追加到默认列表）
  --fix                 自动修复：any->Object、var->let、<T>expr->as T、解构拆分（保守子集）
  --watch               监听目录变更自动重查（Ctrl+C 退出）
  --staged              只检查 git 暂存区的 .ets（配合 pre-commit）
  --api-version <n>     检查 import 的 @ohos.* 模块是否在最低 API 版本可用（默认自动读 module.json5/app.json5）
  --report <file>       生成 HTML（或 .json）迁移报告：扫描统计 + --fix 修复明细 + 问题表
  -h, --help            显示帮助

已覆盖规则（全部对照官方文档，详见 docs/RULES.md）:
  noAny                 禁止 any / unknown（arkts-no-any-unknown）
  untypedObjectLiteral  对象字面量必须显式声明类型（arkts-no-untyped-obj-literals）
  objectDestructuring / arrayDestructuring
                        不支持解构变量声明（arkts-no-destruct-decls）
  destructuringAssignment 不支持解构赋值（arkts-no-destruct-assignment）
  objectSpread          不支持对象展开（arkts-no-spread）
  symbolType            不支持 symbol 类型 / Symbol()（arkts-no-symbol）
  staticObjectLiteral   静态属性不能用无类型对象字面量初始化
  indexSignature        不支持 index signature（arkts-no-indexed-signatures）
  propsByIndex          不支持 obj['key'] 索引访问（arkts-no-props-by-index）
  catchWithType         不支持 catch 类型标注（arkts-no-types-in-catch）
  forIn                 不支持 for..in（arkts-no-for-in）
  tsSuppress            不允许 @ts-ignore 等注释（arkts-strict-typing-required）
  asConst               不支持 as const（arkts-no-as-const）
  utilityType           不支持的 utility 类型（arkts-no-utility-types）
  intersection          不支持交叉类型（arkts-no-intersection-types）
  conditionalType       不支持条件类型（arkts-no-conditional-types）
  objLiteralAsType      不支持内联对象类型（arkts-no-obj-literals-as-types）
  tupleType             不支持元组（arkts-no-tuples）
  deleteOp              不支持 delete（arkts-no-delete）
  typeQuery             typeof 不能用于类型标注（arkts-no-type-query）
  angleCast             不支持 <T>expr 断言（arkts-as-casts）
  nonInferrableArray    数组字面量元素不可推断（arkts-no-noninferrable-arr-literals）
  nonIdentifierProps    不支持非标识符属性名（arkts-identifiers-as-prop-names）
  inOperator            不支持 in 运算符（arkts-no-in）
  varDecl               不支持 var（arkts-no-var）
  privateIdentifiers    不支持 # 私有字段（arkts-no-private-identifiers）
  stdlibRestricted      受限标准库 API（arkts-limited-stdlib）
  +34 条（v0.2 新增）: 函数表达式/生成器/apply-call-bind/参数解构/this 类型/
                     原型赋值/方法重赋值/new.target/多静态块/确定赋值断言/
                     globalThis/映射类型/嵌套函数/枚举混合/循环外逗号/
                     ctor 参数属性/类表达式/import 断言/调用与构造签名

注意（有意不做检查）:
  Function 类型 / 元组类型   官方示例中存在合法用法（如 hypium 测试模板 done: Function），不做检查
  任意联合类型（string | number） 官方支持任意联合类型
  非标识符字符串键（如 'deviceId': x） 官方文档 §226 明确是例外，允许
`;
