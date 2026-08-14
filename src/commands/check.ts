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
import { scanSource, fixAnyInSource, DEFAULT_SKIP, ScanReport, Severity, Finding } from '../lib/arkts-check';

const SEV_COLOR: Record<string, string> = {
  error: '\x1b[31m',   // red
  warning: '\x1b[33m', // yellow
  info: '\x1b[36m',    // cyan
};
const RESET = '\x1b[0m';

export function runCheck(argv: string[]): number {
  let target = '.';
  let format: 'text' | 'json' = 'text';
  let minSeverity: Severity = 'warning';
  let fix = false;
  const extraSkip: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--format': {
        const v = argv[++i];
        if (v !== 'text' && v !== 'json') { console.error('错误: --format 只支持 text | json'); return 2; }
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

  let report: ScanReport;
  let totalFixed = 0;
  const processFileContent = (file: string, text: string): Finding[] => {
    let src = text;
    if (fix) {
      const res = fixAnyInSource(src);
      if (res.fixed > 0) {
        fs.writeFileSync(file, res.text);
        totalFixed += res.fixed;
        src = res.text;
      }
    }
    return scanSource(file, src, minSeverity);
  };
  if (isFile) {
    const findings = processFileContent(abs, fs.readFileSync(abs, 'utf8'));
    report = {
      findings,
      filesScanned: 1,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      infos: findings.filter((f) => f.severity === 'info').length,
    };
  } else {
    const { collectEtsFiles } = require('../lib/arkts-check') as typeof import('../lib/arkts-check');
    const skip = extraSkip.length ? new Set([...DEFAULT_SKIP, ...extraSkip]) : undefined;
    const files = collectEtsFiles(abs, skip);
    const findings: Finding[] = [];
    for (const f of files) {
      try {
        findings.push(...processFileContent(f, fs.readFileSync(f, 'utf8')));
      } catch (e) {
        console.error(`跳过 ${f}: ${(e as Error).message}`);
      }
    }
    report = {
      findings,
      filesScanned: files.length,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      infos: findings.filter((f) => f.severity === 'info').length,
    };
  }
  if (totalFixed > 0) {
    process.stdout.write(`已自动修复 ${totalFixed} 处 any/unknown -> Object（请再手动改为具体类型）\n`);
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
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

  process.stdout.write(
    `\n扫描 ${report.filesScanned} 个 .ets 文件：${report.errors} 错误，${report.warnings} 警告，${report.infos} 提示\n`
  );
  return report.errors > 0 ? 1 : 0;
}

const HELP = `arktsup check — 扫描 .ets 源码中的 ArkTS 不兼容写法

用法:
  arktsup check [path] [options]
  arktsup check src/main/ets/pages

选项:
  --format <fmt>        text | json（默认 text）
  --min-severity <s>    error | warning（默认 warning）
  --exclude <dirs>      额外跳过的目录（逗号分隔，追加到默认列表）
  --fix                 自动修复 noAny（把 any 替换为 unknown）
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

注意（有意不做检查）:
  Function 类型 / 元组类型   官方示例中存在合法用法（如 hypium 测试模板 done: Function），不做检查
  任意联合类型（string | number） 官方支持任意联合类型
  非标识符字符串键（如 'deviceId': x） 官方文档 §226 明确是例外，允许
`;
