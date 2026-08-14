/**
 * arktsup json2ts — 把 JSON 转成符合 ArkTS 限制的类型声明。
 *
 * 用法:
 *   arktsup json2ts <file.json> [options]
 *   cat data.json | arktsup json2ts --name User
 *   arktsup json2ts            # 交互式粘贴（Ctrl+D 结束）
 *
 * 选项:
 *   --name <Name>      根类型名（默认取文件名或 Root）
 *   --style <style>    interface | class（默认 interface）
 *   --indent <n>       缩进空格数（默认 2）
 *   --sort             字段按字母序排列
 *   --optional         所有字段标记为可选
 *   --max-depth <n>    最大嵌套深度（默认 20）
 *   --out <file>       输出到文件（默认打印到 stdout）
 */

import * as fs from 'node:fs';
import { jsonToArkTs, Json2TsOptions } from '../lib/json2ts';

export function runJson2Ts(argv: string[]): number {
  const options: Json2TsOptions = {};
  let file: string | undefined;
  let outFile: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--name': options.rootName = argv[++i]; break;
      case '--style': {
        const v = argv[++i];
        if (v !== 'interface' && v !== 'class') {
          console.error(`错误: --style 只支持 interface 或 class，收到 "${v}"`);
          return 2;
        }
        options.style = v;
        break;
      }
      case '--indent': options.indent = parseInt(argv[++i], 10); break;
      case '--sort': options.sort = true; break;
      case '--optional': options.optional = true; break;
      case '--max-depth': options.maxDepth = parseInt(argv[++i], 10); break;
      case '--out': outFile = argv[++i]; break;
      case '-h': case '--help':
        console.log(HELP);
        return 0;
      default:
        if (a.startsWith('-')) {
          console.error(`错误: 未知选项 "${a}"`);
          console.log(HELP);
          return 2;
        }
        if (file === undefined) file = a;
        else { console.error(`错误: 多余的位置参数 "${a}"`); return 2; }
    }
  }

  // 读取输入
  let raw: string;
  if (file) {
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch (e) {
      console.error(`错误: 无法读取文件 ${file}: ${(e as Error).message}`);
      return 2;
    }
    if (!options.rootName) {
      const base = file.split(/[\\/]/).pop()?.replace(/\.(json|json5|txt)$/i, '') ?? 'Root';
      options.rootName = base || 'Root';
    }
  } else {
    if (process.stdin.isTTY) {
      console.error('请在下方粘贴 JSON，然后按 Ctrl+D 结束：');
    }
    raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) {
      console.error('错误: 没有输入内容。用法: arktsup json2ts <file.json>');
      return 2;
    }
    options.rootName = options.rootName ?? 'Root';
  }

  // 解析 JSON
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error(`错误: JSON 解析失败 — ${(e as Error).message}`);
    return 2;
  }

  const result = jsonToArkTs(data, options);
  for (const w of result.warnings) console.error(w);

  const out = result.code;
  if (outFile) {
    try {
      fs.writeFileSync(outFile, out);
      console.error(`已写入 ${outFile}（${result.typeNames.length} 个类型）`);
    } catch (e) {
      console.error(`错误: 无法写入 ${outFile}: ${(e as Error).message}`);
      return 2;
    }
  } else {
    process.stdout.write(out);
  }
  return 0;
}

const HELP = `arktsup json2ts — 把 JSON 转成符合 ArkTS 限制的类型声明

用法:
  arktsup json2ts <file.json> [options]
  cat data.json | arktsup json2ts --name User

选项:
  --name <Name>      根类型名（默认取文件名或 Root）
  --style <style>    interface | class（默认 interface）
  --indent <n>       缩进空格数（默认 2）
  --sort             字段按字母序排列
  --optional         所有字段标记为可选
  --max-depth <n>    最大嵌套深度（默认 20）
  --out <file>       输出到文件（默认打印到 stdout）
  -h, --help         显示帮助
`;
