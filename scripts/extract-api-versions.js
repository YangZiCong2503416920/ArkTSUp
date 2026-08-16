/**
 * 从 OpenHarmony 官方 SDK 类型定义（interface_sdk-js）提取系统 API 模块引入版本表。
 * 数据来源: https://github.com/openharmony/interface_sdk-js （api/*.d.ts 的 @since 标注）
 * 用法: node scripts/extract-api-versions.js [sdk-dir] [--write]
 *   默认输出到 stdout；--write 写入 src/lib/api-versions.ts
 * 模块引入版本 = 该文件内所有 @since 数字的最小值（模块最早可用版本）。
 */
const fs = require('node:fs');
const path = require('node:path');

let sdkDir = '/tmp/interface_sdk';
let writeFile = false;
for (const a of process.argv.slice(2)) {
  if (a === '--write') writeFile = true;
  else if (!a.startsWith('-')) sdkDir = a;
}
const apiDir = path.join(sdkDir, 'api');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const files = walk(apiDir, []);
const versions = {};
const skipped = [];
for (const f of files) {
  const rel = path.relative(apiDir, f).replace(/\\/g, '/');
  const mod = rel.slice(0, -5); // 文件名已含 @，如 @ohos.prompt.d.ts -> @ohos.prompt
  if (!mod.startsWith('@ohos.')) { skipped.push(mod); continue; }
  const text = fs.readFileSync(f, 'utf8');
  const since = [...text.matchAll(/@since\s+(\d+)/g)].map((m) => parseInt(m[1], 10));
  if (since.length === 0) { skipped.push(mod); continue; }
  versions[mod] = Math.min(...since);
}

const keys = Object.keys(versions).sort();
const lines = [
  '/**',
  ' * 系统 API 模块引入版本表（模块最早可用的 API 版本）。',
  ' * 数据来源: OpenHarmony interface_sdk-js（https://github.com/openharmony/interface_sdk-js）',
  ' * 各 .d.ts 的 @since 标注；模块引入版本取文件内 @since 最小值。',
  ' * 生成脚本: scripts/extract-api-versions.js（数据采集日期 2026-08-16）',
  ' * 用途: arktsup check --api-version <n> 检查 import 的模块是否在工程最低版本可用。',
  ' */',
  'export const API_VERSIONS: Record<string, number> = {',
];
for (const k of keys) lines.push("  '" + k + "': " + versions[k] + ",");
lines.push('};', '');

if (writeFile) {
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'lib', 'api-versions.ts'), lines.join('\n'));
  console.log('已写入 src/lib/api-versions.ts（' + keys.length + ' 个模块，跳过 ' + skipped.length + ' 个）');
} else {
  process.stdout.write(lines.join('\n'));
  console.error('// 模块数: ' + keys.length + '，跳过: ' + skipped.length);
}
