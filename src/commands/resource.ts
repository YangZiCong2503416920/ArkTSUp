/**
 * arktsup resource — HarmonyOS 资源文件管理。
 *
 * 用法:
 *   arktsup resource check [dir]                检查缺失引用 / 未使用资源
 *   arktsup resource gen [dir] --out R.ets      生成资源路径常量表
 *   arktsup resource add app.string.foo --value "你好"  添加资源条目
 *
 * 选项:
 *   --dir <dir>       工程目录（默认当前目录）
 *   --out <file>      gen 输出文件名（默认 R.ets）
 *   --value <text>    add 的资源值
 *   --format <fmt>    check 输出格式 text | json
 *   -h, --help        显示帮助
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { checkResources, generateConstants, addResource, ResourceType } from '../lib/resource-check';
import { Severity } from '../lib/arkts-check';

const SEV_COLOR: Record<string, string> = { error: '\x1b[31m', warning: '\x1b[33m', info: '\x1b[36m' };
const RESET = '\x1b[0m';

export function runResource(argv: string[]): number {
  const positional: string[] = [];
  let dir = '.';
  let out = 'R.ets';
  let value: string | undefined;
  let format: 'text' | 'json' = 'text';
  let minSeverity: Severity = 'warning';

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dir': dir = argv[++i]; break;
      case '--out': out = argv[++i]; break;
      case '--value': value = argv[++i]; break;
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
      case '-h': case '--help': console.log(HELP); return 0;
      default:
        if (a.startsWith('-')) { console.error(`错误: 未知选项 "${a}"`); console.log(HELP); return 2; }
        positional.push(a);
    }
  }

  const sub = positional[0];
  // check/gen 的第二个位置参数是目标目录（add 的第二个位置参数是资源 key）
  if ((sub === 'check' || sub === 'gen') && positional[1]) {
    dir = positional[1];
  }
  const root = path.resolve(dir);
  if (!fs.existsSync(root)) { console.error(`错误: 目录不存在 ${root}`); return 2; }

  switch (sub) {
    case 'check': {
      const report = checkResources(root);
      const findings = report.findings.filter(
        (f) => (minSeverity === 'error' ? f.severity === 'error' : true)
      );
      if (format === 'json') {
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        return report.errors > 0 ? 1 : 0;
      }
      for (const f of findings) {
        const color = SEV_COLOR[f.severity] ?? '';
        const rel = path.relative(process.cwd(), path.join(root, f.file)) || f.file;
        process.stdout.write(
          `${color}${f.severity.padEnd(7)}${RESET} ${rel}:${f.line}:${f.column} [${f.rule}] ${f.message}\n` +
          `        ${f.snippet}\n` +
          `        建议: ${f.fix}\n`
        );
      }
      const used = Object.values(report.resourceKeys).reduce((s, arr) => s + arr.length, 0);
      process.stdout.write(
        `\n扫描 ${report.filesScanned} 个文件、${used} 个资源键：${report.errors} 错误，${report.warnings} 警告\n`
      );
      return report.errors > 0 ? 1 : 0;
    }
    case 'gen': {
      try {
        const code = generateConstants(root);
        const target = path.join(root, out);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, code);
        console.error(`已生成 ${target}`);
        return 0;
      } catch (e) {
        console.error(`错误: ${(e as Error).message}`);
        return 2;
      }
    }
    case 'add': {
      const key = positional[1];
      if (!key || value === undefined) {
        console.error('用法: arktsup resource add app.string.foo --value "你好"');
        return 2;
      }
      let type: ResourceType;
      let name: string;
      const m = /^(?:app\.)?(string|color|float)(?:\.([A-Za-z0-9_]+))?$/.exec(key);
      if (m && m[2]) { type = m[1] as ResourceType; name = m[2]; }
      else if (m && !m[2]) { type = m[1] as ResourceType; name = positional[2] ?? ''; }
      else { type = 'string'; name = key; }
      if (!name) { console.error('错误: 缺少资源名，如 app.string.foo'); return 2; }
      try {
        const file = addResource(root, type, name, value);
        console.error(`已添加 ${type}.${name} = ${value} -> ${file}`);
        return 0;
      } catch (e) {
        console.error(`错误: ${(e as Error).message}`);
        return 2;
      }
    }
    default:
      console.error('错误: 请指定子命令 check | gen | add');
      console.log(HELP);
      return 2;
  }
}

const HELP = `arktsup resource — HarmonyOS 资源文件管理

用法:
  arktsup resource check [dir]             检查缺失引用 / 未使用资源
  arktsup resource gen [dir] --out R.ets   生成资源路径常量表（R.strings.foo 替代魔法字符串）
  arktsup resource add <key> --value <v>   添加资源条目（key 形如 app.string.foo）

选项:
  --dir <dir>       工程目录（默认当前目录）
  --out <file>      gen 输出文件名（默认 R.ets）
  --value <text>    add 的资源值
  --format <fmt>    check 输出格式 text | json
  --min-severity    check 最低级别 error | warning
  -h, --help        显示帮助

示例:
  arktsup resource check src/main/resources
  arktsup resource gen --out ets/common/R.ets
  arktsup resource add app.string.welcome --value "欢迎回来"
  arktsup resource add app.color.primary --value "#FF007DFF"
`;
