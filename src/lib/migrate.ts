/**
 * migrate — 废弃 API / 模块迁移检测与自动修复。
 *
 * 检测：import 声明中的 @ohos.* 废弃模块（对照 src/lib/deprecations.ts，来源为官方文档）。
 * 修复：改写 import 为 @kit.*（含导入名映射，如 fs -> fileIo、prompt -> promptAction），
 *       并把代码中旧导入名的引用一并替换（AST 级，不影响字符串/注释/属性名）。
 */

import * as ts from 'typescript';
import * as fs from 'node:fs';
import { collectEtsFiles, Finding } from './arkts-check';
import { findDeprecation } from './deprecations';

export interface MigrateReport {
  findings: Finding[];
  filesScanned: number;
  fixed: number;
}

export function scanMigrateFile(file: string, text: string): Finding[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings: Finding[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const mod = stmt.moduleSpecifier.text;
    const dep = findDeprecation(mod);
    if (!dep) continue;
    const pos = sf.getLineAndCharacterOfPosition(stmt.getStart(sf));
    const names = dep.names ? Object.entries(dep.names).map(([o, n]) => o + ' -> ' + n).join(', ') : '';
    findings.push({
      file,
      line: pos.line + 1,
      column: pos.character + 1,
      severity: 'warning',
      rule: 'deprecatedModule',
      message: `已废弃的模块导入 '${mod}'${dep.note ? '（' + dep.note + '）' : ''}`,
      fix: `改为 import ... from '${dep.kit}'${names ? '（导入名 ' + names + '）' : ''}。出处: ${dep.doc}`,
      snippet: mod,
    });
  }
  return findings;
}

interface Replacement { start: number; end: number; text: string }

/** 判断一个标识符节点是否处于"名称位置"（属性名/方法名/导入名等，不应替换） */
function isNamePosition(node: ts.Identifier): boolean {
  const p = node.parent;
  if (!p) return false;
  if (ts.isPropertyAccessExpression(p) && p.name === node) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isPropertyDeclaration(p) && p.name === node) return true;
  if (ts.isMethodDeclaration(p) && p.name === node) return true;
  if (ts.isImportSpecifier(p) && p.name === node) return true;
  if (ts.isNamespaceImport(p) && p.name === node) return true;
  if (ts.isImportClause(p) && p.name === node) return true;
  if (ts.isExportSpecifier(p) && p.name === node) return true;
  if (ts.isShorthandPropertyAssignment(p) && p.name === node) {
    // { fs } 简写是变量引用，需要替换；但对象解构 { fs } = x 同样应替换
    return false;
  }
  if (ts.isBindingElement(p) && p.name === node) {
    // 解构绑定 let { fs } = ... 是变量引用，替换为 fileIo（保持语义）
    return false;
  }
  return false;
}

export function fixMigrateFile(file: string, text: string): { text: string; fixed: number; skipped?: string } {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const repls: Replacement[] = [];
  const handledModules = new Set<string>();
  const deprecatedNames: { old: string; newName: string }[] = [];

  // 1) 改写 import 声明
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const mod = stmt.moduleSpecifier.text;
    const dep = findDeprecation(mod);
    if (!dep) continue;
    handledModules.add(mod);

    // 模块路径
    repls.push({
      start: stmt.moduleSpecifier.getStart(sf),
      end: stmt.moduleSpecifier.getEnd(),
      text: `'${dep.kit}'`,
    });

    const clause = stmt.importClause;
    if (!clause) continue;

    // 默认导入 -> 具名导入
    if (clause.name) {
      const oldName = clause.name.text;
      const newName = dep.names?.[oldName] ?? oldName;
      deprecatedNames.push({ old: oldName, newName });
      repls.push({
        start: clause.getStart(sf),
        end: clause.getEnd(),
        text: `{ ${newName} }`,
      });
      continue;
    }

    // 具名导入 / 命名空间导入
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const spec of bindings.elements) {
        const oldName = spec.name.text;
        const newName = dep.names?.[oldName] ?? oldName;
        if (newName !== oldName) {
          deprecatedNames.push({ old: oldName, newName });
          repls.push({ start: spec.name.getStart(sf), end: spec.name.getEnd(), text: newName });
        }
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      const oldName = bindings.name.text;
      const newName = dep.names?.[oldName] ?? oldName;
      deprecatedNames.push({ old: oldName, newName });
      repls.push({ start: bindings.name.getStart(sf), end: bindings.name.getEnd(), text: newName });
    }
  }

  if (repls.length === 0) return { text, fixed: 0 };

  // 冲突检测：同一旧名被映射到不同新名（如两个废弃模块都绑定 fs），自动修复会生成错误代码 -> 跳过并提示
  const nameTargets = new Map<string, Set<string>>();
  for (const { old, newName } of deprecatedNames) {
    if (!nameTargets.has(old)) nameTargets.set(old, new Set());
    nameTargets.get(old)!.add(newName);
  }
  const conflicts = [...nameTargets.entries()].filter(([, s]) => s.size > 1);
  if (conflicts.length > 0) {
    return {
      text,
      fixed: 0,
      skipped: '导入名冲突: ' + conflicts.map(([o, s]) => o + ' -> ' + [...s].join('/')).join(', ') + '，请手动处理',
    };
  }

  // 2) 替换代码中旧导入名的引用（跳过 import 声明子树与名称位置）
  const importRanges: [number, number][] = [];
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && handledModules.has(stmt.moduleSpecifier.text)) {
      importRanges.push([stmt.getFullStart(), stmt.getEnd()]);
    }
  }
  function walk(n: ts.Node): void {
    for (const { old, newName } of deprecatedNames) {
      if (ts.isIdentifier(n) && n.text === old && !isNamePosition(n)) {
        const start = n.getStart(sf);
        const end = n.getEnd();
        const inImport = importRanges.some(([s, e]) => start >= s && end <= e);
        if (!inImport) {
          repls.push({ start, end, text: newName });
        }
      }
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);

  // 3) 从后往前应用替换
  repls.sort((a, b) => b.start - a.start);
  let result = text;
  let count = 0;
  let lastStart = -1;
  for (const r of repls) {
    if (r.start === lastStart) continue; // 同一位置去重
    if (result.slice(r.start, r.end) === r.text) continue; // 内容未变
    result = result.slice(0, r.start) + r.text + result.slice(r.end);
    lastStart = r.start;
    count++;
  }
  return { text: result, fixed: count };
}

export function scanMigrateDir(root: string): MigrateReport {
  const files = collectEtsFiles(root);
  const findings: Finding[] = [];
  let fixed = 0;
  for (const f of files) {
    let text: string;
    try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const fixResult = fixMigrateFile(f, text);
    if (fixResult.fixed > 0) {
      fs.writeFileSync(f, fixResult.text);
      fixed += fixResult.fixed;
    }
    findings.push(...scanMigrateFile(f, fs.readFileSync(f, 'utf8')));
  }
  return { findings, filesScanned: files.length, fixed };
}
