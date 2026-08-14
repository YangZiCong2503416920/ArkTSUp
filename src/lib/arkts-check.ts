/**
 * arkts-check — 用 TypeScript AST 扫描 .ets 源码，找出 ArkTS 不支持的写法。
 *
 * 每条规则都对照了官方文档（来源见 docs/RULES.md）：
 *   - 华为《从TypeScript到ArkTS的适配规则》
 *     https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/typescript-to-arkts-migration-guide
 *   - OpenHarmony 官方 linter (ets2panda) 逐条规则文档
 *     https://github.com/openharmony/arkcompiler_ets_frontend/tree/master/ets2panda/linter/docs/rules
 *
 * 注意（曾踩过的坑，防止回退）：
 *   - ArkTS 支持任意联合类型（官方入门文档示例 type Animal = Cat | Dog | number | string），
 *     所以"非 nullish 联合"不是错误，本工具不检查该规则。
 *   - ArkTS 禁止 any 和 unknown 两种类型（arkts-no-any-unknown）。
 *   - catch 子句不允许类型标注（arkts-no-types-in-catch），与直觉相反。
 *   - 数组解构与对象解构同样被禁止（arkts-no-destruct-decls / -assignment）。
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

export const DEFAULT_SKIP = new Set(['node_modules', 'oh_modules', '.hvigor', '.git', 'build', '.idea', 'dist', '.cxx', 'ohTest']);

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

interface RuleMeta {
  severity: Severity;
  message: string;
  fix: string;
}

const RULE_INFO: Record<string, RuleMeta> = {
  noAny: {
    severity: 'error',
    message: 'ArkTS 禁止使用 any 和 unknown 类型（arkts-no-any-unknown）',
    fix: '改用具体类型；确实无法确定时用 Object，随后尽快收窄为具体类型',
  },
  untypedObjectLiteral: {
    severity: 'error',
    message: 'ArkTS 要求对象字面量必须对应显式声明的类/接口类型（arkts-no-untyped-obj-literals）',
    fix: '先定义 interface/class 再标注类型，如 let x: Foo = { ... }；不能用 Object/object/any/unknown 初始化字面量',
  },
  objectDestructuring: {
    severity: 'error',
    message: 'ArkTS 不支持对象解构变量声明（arkts-no-destruct-decls）',
    fix: '改为逐字段取值，如 const a = obj.a; const b = obj.b',
  },
  arrayDestructuring: {
    severity: 'error',
    message: 'ArkTS 不支持数组解构变量声明（arkts-no-destruct-decls）',
    fix: '改为下标取值，如 const first = arr[0]; const second = arr[1]',
  },
  destructuringAssignment: {
    severity: 'error',
    message: 'ArkTS 不支持解构赋值（arkts-no-destruct-assignment）',
    fix: '改为逐字段赋值，如 a = obj.a; b = obj.b（数组用临时变量交换）',
  },
  objectSpread: {
    severity: 'error',
    message: 'ArkTS 不支持对象展开（arkts-no-spread，仅数组可展开）',
    fix: '逐字段复制到目标对象；注意 Object.assign 也被禁止（arkts-limited-stdlib）',
  },
  symbolType: {
    severity: 'error',
    message: 'ArkTS 不支持 symbol 类型与 Symbol() API（arkts-no-symbol）',
    fix: '改用字符串常量或字符串枚举',
  },
  staticObjectLiteral: {
    severity: 'error',
    message: 'ArkTS 静态属性不能用无类型对象字面量初始化（arkts-no-untyped-obj-literals）',
    fix: '显式标注类型（如 static o: Foo = {...}）或在构造函数/静态块中初始化',
  },
  indexSignature: {
    severity: 'error',
    message: 'ArkTS 不支持 index signature（arkts-no-indexed-signatures）',
    fix: '改用数组（T[]），或声明具名类字段',
  },
  propsByIndex: {
    severity: 'warning',
    message: '疑似通过索引访问字段（arkts-no-props-by-index；Record/Map/枚举/类型化数组允许索引访问，需人工确认）',
    fix: '若是类实例字段，改用点操作符 obj.field',
  },
  catchWithType: {
    severity: 'error',
    message: 'ArkTS 不支持在 catch 子句标注类型（arkts-no-types-in-catch）',
    fix: '省略类型标注，直接写 catch (e)',
  },
  forIn: {
    severity: 'error',
    message: 'ArkTS 不支持 for..in 循环（arkts-no-for-in）',
    fix: '改用普通 for 循环或 for..of + Object.keys()',
  },
  tsSuppress: {
    severity: 'error',
    message: 'ArkTS 不允许用注释关闭类型检查（arkts-strict-typing-required）',
    fix: '删除 @ts-ignore / @ts-nocheck / @ts-expect-error，修正代码类型',
  },
  asConst: {
    severity: 'error',
    message: 'ArkTS 不支持 as const 断言（arkts-no-as-const）',
    fix: "显式声明类型，如 let x: string = 'hello'",
  },
  utilityType: {
    severity: 'error',
    message: 'ArkTS 仅支持 Partial/Required/Readonly/Record 等少数 utility 类型（arkts-no-utility-types）',
    fix: '改用支持的 utility 类型，或显式定义新的 interface/class',
  },
  intersection: {
    severity: 'error',
    message: 'ArkTS 不支持交叉类型 A & B（arkts-no-intersection-types）',
    fix: '改用接口继承，如 interface C extends A, B {}',
  },
  conditionalType: {
    severity: 'error',
    message: 'ArkTS 不支持条件类型（arkts-no-conditional-types）',
    fix: '显式定义约束类型，或用 Object 重写逻辑',
  },
  objLiteralAsType: {
    severity: 'error',
    message: 'ArkTS 不支持用对象字面量声明类型（arkts-no-obj-literals-as-types）',
    fix: '显式声明 interface/class 后再引用',
  },
  deleteOp: {
    severity: 'error',
    message: 'ArkTS 不支持 delete 操作符（arkts-no-delete）',
    fix: '把字段声明为可空并赋 null，如 x: T | null = null',
  },
  typeQuery: {
    severity: 'error',
    message: 'ArkTS 的 typeof 只能用于表达式，不能用于类型标注（arkts-no-type-query）',
    fix: '显式写出类型，如 let n: number',
  },
  angleCast: {
    severity: 'error',
    message: 'ArkTS 类型转换仅支持 as T 语法（arkts-as-casts）',
    fix: '把 <T>expr 改写为 expr as T',
  },
  nonInferrableArray: {
    severity: 'error',
    message: '数组字面量元素类型无法推断（arkts-no-noninferrable-arr-literals）',
    fix: '给数组标注类型（如 let a: C[] = [...]），或为空数组指定元素类型',
  },
  nonIdentifierProps: {
    severity: 'error',
    message: 'ArkTS 不支持数字属性名（arkts-identifiers-as-prop-names；字符串字面量属性名是例外，允许）',
    fix: '用类字段 + 点访问，或用 Map/Record/枚举',
  },
  inOperator: {
    severity: 'error',
    message: 'ArkTS 不支持 in 运算符（arkts-no-in）',
    fix: '改用 instanceof 或显式类型判断',
  },
  varDecl: {
    severity: 'error',
    message: 'ArkTS 不支持 var，请使用 let（arkts-no-var）',
    fix: '把 var 改为 let',
  },
  privateIdentifiers: {
    severity: 'error',
    message: 'ArkTS 不支持 # 私有字段（arkts-no-private-identifiers）',
    fix: '改用 private 关键字',
  },
  stdlibRestricted: {
    severity: 'error',
    message: '该标准库 API 在 ArkTS 中受限制（arkts-limited-stdlib）',
    fix: '改用静态类型友好的替代方案（如 Object.keys/Map 等）',
  },
};

function snippetOf(sourceFile: ts.SourceFile, node: ts.Node): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const text = sourceFile.text.slice(start, end).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}

/** ArkTS 中禁止用字面量初始化的"类型标注"（Object/object/any/unknown 及其数组形式） */
function isBannedLiteralContextType(typeNode: ts.TypeNode): boolean {
  if (typeNode.kind === ts.SyntaxKind.AnyKeyword || typeNode.kind === ts.SyntaxKind.UnknownKeyword
    || typeNode.kind === ts.SyntaxKind.ObjectKeyword) {
    return true;
  }
  if (ts.isTypeReferenceNode(typeNode)) {
    const name = typeNode.typeName.getText();
    return name === 'Object' || name === 'any' || name === 'unknown';
  }
  if (ts.isArrayTypeNode(typeNode)) return isBannedLiteralContextType(typeNode.elementType);
  return false;
}

/** 是否一个 any/unknown 类型节点（含 any[]、Array<any>、联合内部等） */
function isAnyOrUnknownTypeNode(n: ts.Node, sf: ts.SourceFile): boolean {
  if (n.kind === ts.SyntaxKind.AnyKeyword || n.kind === ts.SyntaxKind.UnknownKeyword) return true;
  if (ts.isArrayTypeNode(n)) return isAnyOrUnknownTypeNode(n.elementType, sf);
  if (ts.isTypeReferenceNode(n)) {
    const name = n.typeName.getText(sf);
    if (name === 'Array' && n.typeArguments && n.typeArguments.length === 1) {
      return isAnyOrUnknownTypeNode(n.typeArguments[0], sf);
    }
    return false;
  }
  if (ts.isUnionTypeNode(n) || ts.isIntersectionTypeNode(n)) {
    return n.types.some((t) => isAnyOrUnknownTypeNode(t, sf));
  }
  if (ts.isParenthesizedTypeNode(n)) return isAnyOrUnknownTypeNode(n.type, sf);
  if (ts.isTypeOperatorNode(n)) return isAnyOrUnknownTypeNode(n.type, sf);
  return false;
}

/** ArkTS 仅支持的 utility 类型 */
const ALLOWED_UTILITY = new Set(['Partial', 'Required', 'Readonly', 'Record']);
const BANNED_UTILITY = new Set([
  'Omit', 'Pick', 'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'Parameters',
  'InstanceType', 'ConstructorParameters', 'Awaited', 'Uppercase', 'Lowercase',
  'Capitalize', 'Uncapitalize', 'ThisType', 'NoInfer', 'RequiredByKeys', 'ReadonlyByKeys',
]);

/** arkts-limited-stdlib 中被禁止的常见 API（收窄到高频项，避免误报） */
const OBJECT_BANNED = new Set([
  'assign', 'create', 'defineProperties', 'defineProperty', 'freeze', 'fromEntries',
  'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors', 'getOwnPropertySymbols',
  'getPrototypeOf', 'is', 'isExtensible', 'isFrozen', 'isSealed', 'preventExtensions',
  'seal', 'setPrototypeOf', '__proto__', '__defineGetter__', '__defineSetter__',
  '__lookupGetter__', '__lookupSetter__',
]);
const PROTOTYPE_BANNED = new Set(['hasOwnProperty', 'propertyIsEnumerable', 'isPrototypeOf']);
const REFLECT_BANNED = new Set([
  'apply', 'construct', 'defineProperty', 'deleteProperty', 'getOwnPropertyDescriptor',
  'getPrototypeOf', 'isExtensible', 'preventExtensions', 'setPrototypeOf',
]);

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
  const addAt = (rule: string, startPos: number, endPos: number) => {
    const meta = RULE_INFO[rule];
    if (!meta) return;
    if (minSeverity === 'error' && meta.severity !== 'error') return;
    const pos = sf.getLineAndCharacterOfPosition(startPos);
    findings.push({
      file,
      line: pos.line + 1,
      column: pos.character + 1,
      severity: meta.severity,
      rule,
      message: meta.message,
      fix: meta.fix,
      snippet: sourceText.slice(startPos, endPos).replace(/\s+/g, ' ').trim().slice(0, 120),
    });
  };

  /** 判断函数是否为回调实参（回调的返回类型由调用点上下文推断） */
  function isCallbackFunction(fn: ts.Node): boolean {
    let cur: ts.Node | undefined = fn.parent;
    while (cur) {
      if (ts.isCallExpression(cur) || ts.isNewExpression(cur)) return true;
      if (ts.isSourceFile(cur) || ts.isBlock(cur) || ts.isClassDeclaration(cur) || ts.isStatement(cur)) return false;
      cur = cur.parent;
    }
    return false;
  }

  /** 找到最近的函数节点并判断其是否声明了返回类型 */
  function enclosingFunctionHasReturnType(node: ts.Node): boolean {
    let cur: ts.Node | undefined = node.parent;
    while (cur) {
      if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
        // 回调实参：返回类型由调用点上下文推断；独立箭头函数：看显式标注
        return !!cur.type || isCallbackFunction(cur);
      }
      if (
        ts.isFunctionDeclaration(cur) || ts.isMethodDeclaration(cur) ||
        ts.isConstructorDeclaration(cur)
      ) {
        return !!cur.type;
      }
      cur = cur.parent;
    }
    return true; // 没找到函数上下文（如顶层 return），保守视为有类型
  }

  /** 对象/数组字面量是否处于"有上下文类型"的位置 */
  function literalHasContext(node: ts.Node): boolean {
    if (!ts.isObjectLiteralExpression(node) && !ts.isArrayLiteralExpression(node)) return true;
    const parent = node.parent;
    // 解构赋值左值由 destructuringAssignment 规则单独处理
    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.left === node
    ) {
      return true;
    }
    // 变量声明：有类型注解即有上下文（Object/object/any/unknown 注解不算）
    if (ts.isVariableDeclaration(parent)) {
      if (!parent.type) return false;
      return !isBannedLiteralContextType(parent.type);
    }
    // 类字段：静态场景交给 staticObjectLiteral；非静态字段需显式类型
    if (ts.isPropertyDeclaration(parent)) {
      const isStatic = parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
      if (isStatic) return true;
      if (!parent.type) return false;
      return !isBannedLiteralContextType(parent.type);
    }
    // 嵌套在另一个字面量里：继承外层上下文
    if (ts.isPropertyAssignment(parent)) {
      const outer = parent.parent;
      return ts.isObjectLiteralExpression(outer) || ts.isArrayLiteralExpression(outer)
        ? literalHasContext(outer)
        : true;
    }
    if (ts.isParenthesizedExpression(parent)) return literalHasContext(parent);
    if (ts.isAsExpression(parent) || ts.isTypeAssertionExpression(parent)) return true;
    // 箭头函数表达式体（=> ({...})）：看返回类型注解
    if (ts.isArrowFunction(parent) && !ts.isBlock(parent.body)) return !!parent.type;
    // return {...}：看外层函数是否有返回类型注解
    if (ts.isReturnStatement(parent)) return enclosingFunctionHasReturnType(parent);
    // 其余位置（函数实参、数组元素、赋值右值等）保守视为有上下文，避免误报
    return true;
  }

  /** @ts-ignore / @ts-nocheck / @ts-expect-error 注释检测 */
  function checkTsSuppress(): void {
    const re = /@ts-(?:ignore|nocheck|expect-error)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sourceText)) !== null) {
      addAt('tsSuppress', m.index, m.index + m[0].length);
    }
  }

  function walk(node: ts.Node): void {
    // 1. any / unknown
    if (ts.isTypeNode(node) && isAnyOrUnknownTypeNode(node, sf)) {
      add('noAny', node);
      return;
    }
    // 2. 无类型上下文的对象字面量
    if (ts.isObjectLiteralExpression(node) && !literalHasContext(node)) {
      add('untypedObjectLiteral', node);
    }
    // 2b. 数组字面量元素不可推断（含空数组）
    if (ts.isArrayLiteralExpression(node)) {
      const parent = node.parent;
      let noContext: boolean;
      if (ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent)) {
        if (!parent.type) {
          noContext = true;
        } else if (isBannedLiteralContextType(parent.type)) {
          // Object[]/object[]/any[]/unknown[] 类型：空数组合法，初始化字面量才禁止（recipe38）
          noContext = node.elements.length > 0;
        } else {
          noContext = false;
        }
      } else {
        noContext = !literalHasContext(node);
      }
      const hasObjectElements = node.elements.some((e) => ts.isObjectLiteralExpression(e));
      if (noContext && (node.elements.length === 0 || hasObjectElements)) {
        add('nonInferrableArray', node);
      }
    }
    // 3. 解构：对象/数组绑定模式
    if (ts.isObjectBindingPattern(node)) add('objectDestructuring', node);
    if (ts.isArrayBindingPattern(node)) add('arrayDestructuring', node);
    // 3b. 解构赋值：{a,b} = x 或 [a,b] = x
    if (
      (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) &&
      ts.isBinaryExpression(node.parent) &&
      node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      node.parent.left === node
    ) {
      add('destructuringAssignment', node);
    }
    // 5. 对象展开（数组展开允许）
    if (ts.isSpreadAssignment(node)) {
      add('objectSpread', node);
    }
    // 6. symbol 类型 / Symbol() 调用
    if (node.kind === ts.SyntaxKind.SymbolKeyword) add('symbolType', node);
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Symbol'
    ) {
      add('symbolType', node);
    }
    // 7. 静态属性对象字面量初始化
    if (
      ts.isPropertyDeclaration(node) &&
      (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      add('staticObjectLiteral', node.initializer);
    }
    // 8. 索引签名
    if (ts.isIndexSignatureDeclaration(node)) add('indexSignature', node);
    // 9. catch 带类型标注
    if (ts.isCatchClause(node) && node.variableDeclaration && node.variableDeclaration.type) {
      add('catchWithType', node.variableDeclaration.type);
    }
    // 10. for..in
    if (ts.isForInStatement(node)) add('forIn', node);
    // 11. as const（AST 中类型节点可能是 ConstKeyword 或 TypeReference('const')）
    if (ts.isAsExpression(node)) {
      const isConst = node.type.kind === ts.SyntaxKind.ConstKeyword ||
        (ts.isTypeReferenceNode(node.type) && node.type.typeName.getText(sf) === 'const');
      if (isConst) add('asConst', node);
    }
    // 12. 不支持的 utility 类型
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText(sf);
      if (BANNED_UTILITY.has(name) && !ALLOWED_UTILITY.has(name)) add('utilityType', node);
    }
    // 13. 交叉类型
    if (ts.isIntersectionTypeNode(node)) add('intersection', node);
    // 14. 条件类型
    if (ts.isConditionalTypeNode(node)) add('conditionalType', node);
    // 15. 对象字面量作类型声明（内联类型字面量）
    if (ts.isTypeLiteralNode(node)) add('objLiteralAsType', node);
    // 17. delete 操作符
    if (ts.isDeleteExpression(node)) add('deleteOp', node);
    // 18. typeof 类型查询
    if (ts.isTypeQueryNode(node)) add('typeQuery', node);
    // 19. <T>expr 类型断言
    if (ts.isTypeAssertionExpression(node)) add('angleCast', node);
    // 20. 非标识符属性名（官方文档 §226：字符串字面量属性名是例外，允许；数字键禁止）
    if (
      ts.isPropertyAssignment(node) &&
      !ts.isComputedPropertyName(node.name) &&
      node.name.kind === ts.SyntaxKind.NumericLiteral
    ) {
      add('nonIdentifierProps', node);
    }
    // 21. in 运算符
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword) {
      add('inOperator', node);
    }
    // 22. var 声明
    if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.BlockScoped)) {
      add('varDecl', node);
    }
    // 23. # 私有字段
    if (node.kind === ts.SyntaxKind.PrivateIdentifier) {
      add('privateIdentifiers', node);
    }
    // 24. 通过索引访问字段（仅字符串键，避免数组下标误报）
    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression;
      if (arg && (arg.kind === ts.SyntaxKind.StringLiteral || arg.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral)) {
        add('propsByIndex', node);
      }
    }
    // 25. 受限标准库 API
    if (ts.isPropertyAccessExpression(node)) {
      const objText = node.expression.getText(sf);
      const name = node.name.text;
      if (objText === 'Object' && OBJECT_BANNED.has(name)) add('stdlibRestricted', node);
      if (objText === 'Reflect' && REFLECT_BANNED.has(name)) add('stdlibRestricted', node);
      if (PROTOTYPE_BANNED.has(name)) add('stdlibRestricted', node);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
      add('stdlibRestricted', node);
    }

    ts.forEachChild(node, walk);
  }

  checkTsSuppress();
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
 * 自动修复：把 any / unknown 替换为 Object（ArkTS 迁移第一步，官方推荐的兜底类型）。
 * 基于 AST 精确替换，不影响字符串/注释里的 "any"。
 * 注意：这只是机械替换，最终仍需手动改成具体类型。
 */
export function fixAnyInSource(sourceText: string): { text: string; fixed: number } {
  const sf = ts.createSourceFile('fix.ets', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const positions: { start: number; end: number; kind: 'any' | 'unknown' }[] = [];
  function walk(n: ts.Node): void {
    if (n.kind === ts.SyntaxKind.AnyKeyword || n.kind === ts.SyntaxKind.UnknownKeyword) {
      positions.push({ start: n.getStart(sf), end: n.getEnd(), kind: n.kind === ts.SyntaxKind.AnyKeyword ? 'any' : 'unknown' });
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);
  if (positions.length === 0) return { text: sourceText, fixed: 0 };
  positions.sort((a, b) => b.start - a.start);
  let text = sourceText;
  let fixed = 0;
  for (const { start, end, kind } of positions) {
    const seg = text.slice(start, end);
    if (seg !== kind) continue;
    text = text.slice(0, start) + 'Object' + text.slice(end);
    fixed++;
  }
  return { text, fixed };
}
