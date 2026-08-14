/**
 * arktsup migrate — 废弃 API / 模块迁移助手。
 *
 * 用法:
 *   arktsup migrate [dir]              扫描并自动修复 @ohos.* -> @kit.* 导入
 *   arktsup migrate [dir] --dry-run    只报告不修改
 *   arktsup migrate [dir] --format json
 *
 * 对照表来源为 OpenHarmony 官方 API 参考文档（见 src/lib/deprecations.ts 的 doc 字段）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanMigrateFile, fixMigrateFile } from '../lib/migrate';
import { collectEtsFiles } from '../lib/arkts-check';

const SEV_COLOR: Record<string, string> = { error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m' };
const RESET = '\x1b[0m';

export function runMigrate(argv: string[]): number {
  let dir = '.';
  let dryRun = false;
  let format: 'text' | 'json' = 'text';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dry-run': dryRun = true; break;
      case '--format': {
        const v = argv[++i];
        if (v !== 'text' && v !== 'json') { console.error('错误: --format 只支持 text | json'); return 2; }
        format = v;
        break;
      }
      case '-h': case '--help': console.log(HELP); return 0;
      default:
        if (a.startsWith('-')) { console.error(`错误: 未知选项 "${a}"`); console.log(HELP); return 2; }
        dir = a;
    }
  }

  const root = path.resolve(dir);
  if (!fs.existsSync(root)) { console.error(`错误: 路径不存在 ${root}`); return 2; }
  const isFile = fs.statSync(root).isFile();

  const files = isFile ? [root] : collectEtsFiles(root);
  const findings = [];
  let totalFixed = 0;

  for (const f of files) {
    let text: string;
    try { text = fs.readFileSync(f, 'utf8'); } catch (e) { console.error(`跳过 ${f}: ${(e as Error).message}`); continue; }
    if (!dryRun) {
      const res = fixMigrateFile(f, text);
      if (res.fixed > 0) {
        fs.writeFileSync(f, res.text);
        totalFixed += res.fixed;
      }
      if (res.skipped) {
        console.error(`跳过 ${f}: ${res.skipped}`);
      }
      findings.push(...scanMigrateFile(f, fs.readFileSync(f, 'utf8')));
    } else {
      findings.push(...scanMigrateFile(f, text));
    }
  }

  if (format === 'json') {
    process.stdout.write(JSON.stringify({ findings, filesScanned: files.length, fixed: totalFixed }, null, 2) + '\n');
    return 0;
  }

  for (const f of findings) {
    const color = SEV_COLOR[f.severity] ?? '';
    const rel = path.relative(process.cwd(), f.file) || f.file;
    process.stdout.write(
      `${color}${f.severity.padEnd(7)}${RESET} ${rel}:${f.line}:${f.column} [${f.rule}] ${f.message}\n` +
      `        建议: ${f.fix}\n`
    );
  }
  if (!dryRun && totalFixed > 0) {
    process.stdout.write(`已自动修复 ${totalFixed} 处导入/引用（请确认后提交）\n`);
  }
  process.stdout.write(`\n扫描 ${files.length} 个 .ets 文件：${findings.length} 处废弃模块${dryRun ? '（dry-run，未修改）' : ''}\n`);
  return 0;
}

const HELP = `arktsup migrate — 废弃 API / 模块迁移助手（@ohos.* -> @kit.*）

用法:
  arktsup migrate [dir]               扫描并自动修复废弃导入
  arktsup migrate [dir] --dry-run     只报告不修改
  arktsup migrate <file.ets>          处理单个文件

选项:
  --dry-run        只报告，不修改文件
  --format <fmt>   text | json
  -h, --help       显示帮助

说明:
  对照表（约 60 个模块）来自 OpenHarmony 官方 API 参考文档，逐条标注出处（src/lib/deprecations.ts）。
  自动修复会改写 import 为 @kit.*，并把代码中旧导入名的引用一并替换（如 fs -> fileIo、prompt -> promptAction）。
  修复后建议用 arktsup check 复查。
`;
