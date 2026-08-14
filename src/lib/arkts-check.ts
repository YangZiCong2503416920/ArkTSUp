/**
 * arkts-check — 用 TypeScript AST 扫描 .ets 源码，找出 ArkTS 不支持/不推荐的写法。
 *
 * 覆盖的 ArkTS 限制（依据官方《TypeScript 与 ArkTS 差异》）：
 *  1. any 类型（注解 / as any / 泛型实参等）        -> error
 *  2. 无类型声明的对象字面量（无上下文类型）          -> error
 *  3. 对象解构（变量声明解构 / 解构赋值）            -> error
 *  4. Function 类型注解                             -> error
 *  5. 非 null/undefined 参与的联合类型              -> error
 *  6. 对象展开 {...obj}                             -> error
 *  7. symbol 类型                                  -> error
 *  8. 静态属性对象字面量初始化                       -> error
 *  9. 接口索引签名                                  -> warning
 * 10. catch 参数无显式类型                           -> warning
 */

import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  file: string;
  line: number;   // 1-based
  column: number; // 1-based
  severity: Severity;
  rule: string;
  message: string;
  fix: string;
  snippet: string;
}

export interface CheckOptions {
  /** 需要跳过的目录名（默认覆盖 node_modules / oh_modules / .hvigor / .git / build / .idea / dist） */
  skipDirs?: string[];
  /** 最小展示级别，默认 'warning' */
  minSeverity?: Severity;
}

const DEFAULT_SKIP = new Set(['node_modules', 'oh_modules', '.hvigor', '.git', 'build', '.idea', 'dist', '.cxx', 'ohTest']);

/** 收集一个目录下所有 .ets 文件（跳过构建产物目录） */
export function collectEtsFiles(root: string, skipDirs?: Set<string>): string[] {
  const skip = skipDirs ?? DEFAULT_SKIP;
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(path.join(dir, e.name));
      } else if (e.name.endsWith('.ets')) {
        out.push(path.join(dir, e.name));
      }
    }
  };
  walk(root);
  return out.sort();
}

export interface ScanReport {
  findings: Finding[];
  filesScanned: number;
  errors: number;
  warnings: number;
  infos: number;
}

const RULE_INFO: Record<string, { severity: Severity; message: string; fix: string }> = {
  noAny: {
    severity: 'error',
    message: 'ArkTS 禁止使用 any 类型',
    fix: '改为具体类型；无法确定时用 unknown 替代',
  },
  untypedObjectLiteral: {
    severity: 'error',
    message: 'ArkTS 要求对象字面量必须对应显式声明的类/接口类型（无上下文类型推断）',
    fix: '先定义 interface/class，再声明变量并标注类型，如 let x: Foo = { ... }',
  },
  objectDestructuring: {
    severity: 'error',
    message: 'ArkTS 不支持对象解构',
    fix: '改为逐字段取值，如 const a = obj.a; const b = obj.b',
  },
  destructuringAssignment: {
    severity: 'error',
    message: 'ArkTS 不支持对象解构赋值',
    fix: '改为逐字段赋值，如 a = obj.a; b = obj.b',
  },
  functionType: {
    severity: 'error',
    message: 'ArkTS 不支持 Function 类型注解',
    fix: '改用具体函数签名，如 () => void 或定义接口方法',
  },
  illegalUnion: {
    severity: 'error',
    message: 'ArkTS 只允许与 null/undefined 组成联合类型',
    fix: '用 unknown 替代，或提取公共基类/接口后使用其类型',
  },
  objectSpread: {
    severity: 'error',
    message: 'ArkTS 不支持对象展开运算符',
    fix: '用 Object.assign(target, ...) 或逐字段复制',
  },
  symbolType: {
    severity: 'error',
    message: 'ArkTS 不支持 symbol 类型',
    fix: '改用字符串枚举或字符串常量',
  },
  staticObjectLiteral: {
    severity: 'error',
    message: 'ArkTS 静态属性不能直接用对象字面量初始化',
    fix: '改为 new 实例或在构造函数/静态块中初始化',
  },
  indexSignature: {
    severity: 'warning',
    message: 'ArkTS 接口索引签名支持受限',
    fix: '建议改用 Record<string, T> 类型',
  },
  catchWithoutType: {
    severity: 'warning',
    message: 'catch 参数未标注类型（ArkTS 不允许隐式 any）',
    fix: '显式标注类型，如 catch (err: BusinessError)',
  },
};

function snippetOf(sourceFile: ts.SourceFile, node: ts.Node): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const text = sourceFile.text.slice(start, end).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}

export function scanSource(file: string, sourceText: string, minSeverity: Severity = 'warning'): Finding[] {
  const sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const findings: Finding[] = [];
  const add = (rule: string, node: ts.Node) => {
    const meta = RULE_INFO[rule];
    if (!meta) return;
    if (minSeverity === 'error' && meta.severity !== 'error') return;
    if (minSeverity === 'warning' && meta.severity === 'info') return;
    const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    findings.push({
      file,
      line: pos.line + 1,
      column: pos.character + 1,
      severity: meta.severity,
      rule,
      message: meta.message,
      fix: meta.fix,
      snippet: snippetOf(sf, node),
    });
  };

  /** 判断一个类型节点是否就是 any（含 any[]、Array<any> 等内部 any） */
  function isAnyTypeNode(n: ts.Node): boolean {
    if (n.kind === ts.SyntaxKind.AnyKeyword) return true;
    if (ts.isArrayTypeNode(n)) return isAnyTypeNode(n.elementType);
    if (ts.isTypeReferenceNode(n)) {
      const name = n.typeName.getText(sf);
      if (name === 'Array' && n.typeArguments && n.typeArguments.length === 1) {
        return isAnyTypeNode(n.typeArguments[0]);
      }
      return false;
    }
    if (ts.isUnionTypeNode(n) || ts.isIntersectionTypeNode(n)) {
      return n.types.some((t) => isAnyTypeNode(t));
    }
    if (ts.isParenthesizedTypeNode(n)) return isAnyTypeNode(n.type);
    if (ts.isTypeOperatorNode(n)) return isAnyTypeNode(n.type);
    return false;
  }

  /** 判断类型节点是否为 nullish（null / undefined，含字面量形式） */
  function isNullishType(n: ts.Node): boolean {
    if (n.kind === ts.SyntaxKind.NullKeyword || n.kind === ts.SyntaxKind.UndefinedKeyword) return true;
    if (ts.isLiteralTypeNode(n)) {
      const lit = n.literal;
      return lit.kind === ts.SyntaxKind.NullKeyword || lit.kind === ts.SyntaxKind.UndefinedKeyword;
    }
    return false;
  }

  /** 是否一个含非 nullish 成员的非法联合 */
  function isIllegalUnion(n: ts.UnionTypeNode): boolean {
    const nonNullish = n.types.filter((t) => !isNullishType(t));
    return nonNullish.length > 1;
  }

  /** 找到最近的函数节点并判断其是否声明了返回类型 */
  function enclosingFunctionHasReturnType(node: ts.Node): boolean {
    let cur: ts.Node | undefined = node.parent;
    while (cur) {
      if (
        ts.isArrowFunction(cur) || ts.isFunctionExpression(cur) ||
        ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur) ||
        ts.isConstructorDeclaration(cur)
      ) {
        return !!cur.type;
      }
      cur = cur.parent;
    }
    return true; // 没找到函数上下文（如顶层 return），保守视为有类型
  }

  /** 对象字面量是否处于"有上下文类型"的位置 */
  function objectLiteralHasContext(node: ts.Node): boolean {
    if (!ts.isObjectLiteralExpression(node)) return true;
    const parent = node.parent;
    // 解构赋值左值由 destructuringAssignment 规则单独处理
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.left === node
    ) {
      return true;
    }
    // 变量声明：有类型注解即有上下文（无注解 => 报 untypedObjectLiteral）
    if (ts.isVariableDeclaration(parent)) return !!parent.type;
    // 类字段：静态场景交给 staticObjectLiteral 规则；非静态字段需显式类型
    if (ts.isPropertyDeclaration(parent)) {
      const isStatic = parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
      if (isStatic) return true;
      return !!parent.type;
    }
    // 嵌套在另一个对象字面量里：继承外层字面量的上下文
    if (ts.isPropertyAssignment(parent)) {
      const outer = parent.parent;
      return ts.isObjectLiteralExpression(outer) ? objectLiteralHasContext(outer) : true;
    }
    if (ts.isParenthesizedExpression(parent)) return objectLiteralHasContext(parent);
    if (ts.isAsExpression(parent) || ts.isTypeAssertionExpression(parent)) return true;
    // 箭头函数表达式体（=> ({...})）：看返回类型注解
    if (ts.isArrowFunction(parent) && !ts.isBlock(parent.body)) return !!parent.type;
    // return {...}：看外层函数是否有返回类型注解
    if (ts.isReturnStatement(parent)) return enclosingFunctionHasReturnType(parent);
    // 其余位置（函数实参、数组元素、赋值右值等）保守视为有上下文，避免误报
    return true;
  }

  function walk(node: ts.Node): void {
    // 1. any（命中后跳过其子树，避免 any[] / Array<any> 重复计数）
    if (ts.isTypeNode(node) && isAnyTypeNode(node)) {
      add('noAny', node);
      return;
    }
    // 2. 无类型上下文的对象字面量
    if (ts.isObjectLiteralExpression(node) && !objectLiteralHasContext(node)) {
      // 排除解构赋值左值（单独规则处理）
      const isAssignLhs =
        ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        node.parent.left === node;
      if (!isAssignLhs) {
        add('untypedObjectLiteral', node);
      }
    }
    // 3. 对象解构：BindingPattern
    if (ts.isObjectBindingPattern(node)) {
      add('objectDestructuring', node);
    }
    // 3b. 对象解构赋值：{a, b} = obj
    if (
      ts.isObjectLiteralExpression(node) &&
      ts.isBinaryExpression(node.parent) &&
      node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.parent.left === node
    ) {
      add('destructuringAssignment', node);
    }
    // 4. Function 类型
    if (ts.isTypeReferenceNode(node) && node.typeName.getText(sf) === 'Function' && !node.typeArguments) {
      add('functionType', node);
    }
    // 5. 非法联合类型
    if (ts.isUnionTypeNode(node) && isIllegalUnion(node)) {
      add('illegalUnion', node);
    }
    // 6. 对象展开
    if (ts.isSpreadAssignment(node)) {
      add('objectSpread', node);
    }
    // 7. symbol
    if (node.kind === ts.SyntaxKind.SymbolKeyword) {
      add('symbolType', node);
    }
    // 8. 静态属性对象字面量初始化
    if (
      ts.isPropertyDeclaration(node) &&
      (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      add('staticObjectLiteral', node.initializer);
    }
    // 9. 索引签名
    if (ts.isIndexSignatureDeclaration(node)) {
      add('indexSignature', node);
    }
    // 10. catch 无类型
    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration &&
      !node.variableDeclaration.type
    ) {
      add('catchWithoutType', node.variableDeclaration.name);
    }
    ts.forEachChild(node, walk);
  }

  walk(sf);
  return findings;
}

export function scanFile(file: string, minSeverity: Severity = 'warning'): Finding[] {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return [];
  }
  return scanSource(file, text, minSeverity);
}

export function scanDirectory(root: string, options: CheckOptions = {}): ScanReport {
  const minSeverity = options.minSeverity ?? 'warning';
  const files = collectEtsFiles(root, options.skipDirs ? new Set(options.skipDirs) : undefined);
  const findings: Finding[] = [];
  for (const f of files) {
    findings.push(...scanFile(f, minSeverity));
  }
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  return { findings, filesScanned: files.length, errors, warnings, infos };
}


/**
 * 自动修复：把源码中所有 any 关键字替换为 unknown（ArkTS 迁移第一步）。
 * 基于 AST 精确替换，不影响字符串/注释里的 "any"。
 */
export function fixAnyInSource(sourceText: string): { text: string; fixed: number } {
  const sf = ts.createSourceFile('fix.ets', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const positions: { start: number; end: number }[] = [];
  function walk(n: ts.Node): void {
    if (n.kind === ts.SyntaxKind.AnyKeyword) {
      positions.push({ start: n.getStart(sf), end: n.getEnd() });
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
  if (positions.length === 0) return { text: sourceText, fixed: 0 };
  // 从后往前替换，避免位置偏移
  positions.sort((a, b) => b.start - a.start);
  let text = sourceText;
  for (const { start, end } of positions) {
    const seg = text.slice(start, end);
    if (seg !== 'any') continue;
    text = text.slice(0, start) + 'unknown' + text.slice(end);
  }
  return { text, fixed: positions.length };
}
