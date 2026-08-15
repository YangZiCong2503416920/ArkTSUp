/**
 * resource — HarmonyOS 资源文件管理。
 *
 * 检查内容：
 *  1. missingResource（error）：代码/配置引用了不存在的资源（$r / getStringByName / $media: 等）
 *  2. unusedResource（warning）：资源文件中定义了但从未被引用的键
 *
 * 资源文件格式（HarmonyOS 标准）：
 *   resources/[qualifier]/element/string.json  ->  { "string": [ { "name": "foo", "value": "bar" } ] }
 *   resources/[qualifier]/element/color.json   ->  { "color":  [ { "name": "primary", "value": "#FF0000" } ] }
 *   resources/[qualifier]/media/*.png          ->  key = 文件名（去扩展名）
 *
 * 引用来源：.ets 代码（$r(...)/getStringByName）与配置文件（module.json5/app.json5 的 $media:/$string: 等）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { Finding } from './arkts-check';

export type ResourceType = 'string' | 'color' | 'float' | 'media';

export interface ResourceDef {
  type: ResourceType;
  name: string;
  /** 定义所在的资源文件（用于提示） */
  file: string;
}

export interface ResourceReference {
  file: string;
  line: number;
  column: number;
  type: ResourceType;
  name: string;
  snippet: string;
}

const ELEMENT_TYPES: ResourceType[] = ['string', 'color', 'float'];
const SKIP_DIRS = new Set(['node_modules', 'oh_modules', '.hvigor', '.git', 'build', '.idea', 'dist', '.cxx']);

/** 递归列出目录下所有文件（相对 root 的路径，forward slash） */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (cur: string) => {
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(path.join(cur, e.name));
      } else {
        out.push(path.relative(root, path.join(cur, e.name)).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return out.sort();
}

/** 收集所有已定义的资源键 */
export function collectResourceDefs(root: string): ResourceDef[] {
  const defs: ResourceDef[] = [];
  const files = listFiles(root);
  for (const f of files) {
    const dirName = path.posix.dirname(f).split('/').pop();
    if (dirName !== 'element') continue;
    if (!/\.json$/.test(f)) continue;
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
    } catch {
      continue;
    }
    for (const type of ELEMENT_TYPES) {
      const arr = json[type];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        const obj = item as { name?: unknown };
        if (obj && typeof obj.name === 'string') {
          defs.push({ type, name: obj.name, file: f });
        }
      }
    }
  }
  // media 文件（resources/[qualifier]/media/*.png 等）
  for (const f of files) {
    if (!/\/media\//.test('/' + f)) continue;
    if (!/\.(png|jpg|jpeg|webp|gif|svg|mp3|json)$/i.test(f)) continue;
    const base = f.split('/').pop()!.replace(/\.(png|jpg|jpeg|webp|gif|svg|mp3|json)$/i, '');
    defs.push({ type: 'media', name: base, file: f });
  }
  return defs;
}

function posOf(lines: string[], index: number): { line: number; column: number } {
  let acc = 0;
  for (let i = 0; i < lines.length; i++) {
    if (acc + lines[i].length + 1 > index) return { line: i + 1, column: index - acc + 1 };
    acc += lines[i].length + 1;
  }
  return { line: lines.length, column: 1 };
}

/** 扫描 .ets 代码与配置文件中的资源引用（.ets 用 TS AST，注释/字符串内的 $r() 不会误报） */
export function collectReferences(root: string): ResourceReference[] {
  const refs: ResourceReference[] = [];
  const files = listFiles(root).filter((f) => f.endsWith('.ets'));
  for (const f of files) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    function walk(n: ts.Node): void {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const name = ts.isIdentifier(callee) ? callee.text
          : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
        const arg = n.arguments[0];
        const argText = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : '';
        if (name === '$r' && argText) {
          const m = /^app\.(string|color|float|media)\.([A-Za-z0-9_\-.]*)$/.exec(argText);
          if (m) {
            const pos = sf.getLineAndCharacterOfPosition(n.getStart(sf));
            refs.push({ file: f, line: pos.line + 1, column: pos.character + 1, type: m[1] as ResourceType, name: m[2], snippet: argText });
          }
        } else if ((name === 'getStringByName' || name === 'getStringSync') && argText) {
          const pos = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          refs.push({ file: f, line: pos.line + 1, column: pos.character + 1, type: 'string', name: argText, snippet: 'app.string.' + argText });
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(sf);
  }
  // 配置文件（module.json5 / app.json5 等）中的引用：$media:icon、$string:name 等
  const json5Files = listFiles(root).filter((f) => f.endsWith('.json5'));
  for (const f of json5Files) {
    let text: string;
    try { text = fs.readFileSync(path.join(root, f), 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    const re = /\$(string|color|float|media):([A-Za-z0-9_.-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const pos = posOf(lines, m.index);
      refs.push({ file: f, line: pos.line, column: pos.column, type: m[1] as ResourceType, name: m[2], snippet: '$' + m[1] + ':' + m[2] });
    }
  }
  return refs;
}

export interface ResourceReport {
  findings: Finding[];
  filesScanned: number;
  errors: number;
  warnings: number;
  /** type -> 已定义键（供 gen 使用） */
  resourceKeys: Record<string, string[]>;
}

export function checkResources(root: string): ResourceReport {
  const defs = collectResourceDefs(root);
  const byType: Record<string, Map<string, ResourceDef>> = { string: new Map(), color: new Map(), float: new Map(), media: new Map() };
  for (const d of defs) byType[d.type].set(d.name, d);

  const refs = collectReferences(root);
  const findings: Finding[] = [];
  const usedKeys = new Set<string>();

  for (const ref of refs) {
    usedKeys.add(ref.type + ':' + ref.name);
    const def = byType[ref.type].get(ref.name);
    if (!def) {
      findings.push({
        file: ref.file,
        line: ref.line,
        column: ref.column,
        severity: 'error',
        rule: 'missingResource',
        message: `引用了不存在的资源 app.${ref.type}.${ref.name}`,
        fix: `在 resources/**/element/${ref.type}.json（或 media/）中定义 ${ref.name}，或修正引用`,
        snippet: ref.snippet,
      });
    }
  }

  for (const d of defs) {
    if (!usedKeys.has(d.type + ':' + d.name)) {
      findings.push({
        file: d.file,
        line: 1,
        column: 1,
        severity: 'warning',
        rule: 'unusedResource',
        message: `资源 app.${d.type}.${d.name} 未被任何代码引用`,
        fix: '确认无用后从资源文件中删除',
        snippet: d.name,
      });
    }
  }

  findings.sort((a, b) => (a.file + a.line).localeCompare(b.file + b.line));
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const resourceKeys: Record<string, string[]> = { string: [], color: [], float: [], media: [] };
  for (const [t, m] of Object.entries(byType)) resourceKeys[t] = [...m.keys()].sort();
  return { findings, filesScanned: filesCount(root), errors, warnings, resourceKeys };
}

function filesCount(root: string): number {
  return listFiles(root).filter((f) => f.endsWith('.ets') || f.endsWith('.json') || f.endsWith('.json5')).length;
}

/** 生成 R.ets 常量表（Record<string,string> 显式标注，符合 ArkTS） */
export function generateConstants(root: string): string {
  const report = checkResources(root);
  const lines = [
    '/**',
    ' * 资源路径常量表（由 arktsup resource gen 生成，请勿手改；资源变更后重新生成）',
    ' */',
    'export class R {',
  ];
  const CAT: [string, string][] = [
    ['strings', 'string'],
    ['colors', 'color'],
    ['floats', 'float'],
    ['media', 'media'],
  ];
  for (const [prop, type] of CAT) {
    const keys = report.resourceKeys[type];
    lines.push(`  /** ${type} 资源路径 */`);
    lines.push(`  static readonly ${prop}: Record<string, string> = {`);
    for (const k of keys) {
      lines.push(`    '${k}': 'app.${type}.${k}',`);
    }
    lines.push('  }');
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** 向 base element json 添加资源条目（创建文件/数组如不存在） */
export function addResource(root: string, type: ResourceType, name: string, value: string): string {
  if (!ELEMENT_TYPES.includes(type)) {
    throw new Error(`add 仅支持 string|color|float，不支持 media（请直接放入 media 目录）`);
  }
  const dir = path.join(root, 'resources', 'base', 'element');
  const file = path.join(dir, type + '.json');
  fs.mkdirSync(dir, { recursive: true });
  let json: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try { json = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) {
      throw new Error(`${file} 不是合法的 JSON（${(e as Error).message}），请先修复再添加`);
    }
  }
  const arr = (json[type] as { name: string; value: string }[]) ?? [];
  if (arr.some((x) => x.name === name)) {
    throw new Error(`资源 ${type}.${name} 已存在于 ${file}`);
  }
  arr.push({ name, value });
  json[type] = arr;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  return file;
}
