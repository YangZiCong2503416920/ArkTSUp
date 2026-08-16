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
  noFuncExpressions: {
    severity: 'error',
    message: 'ArkTS 不支持函数表达式（arkts-no-func-expressions）',
    fix: '改用箭头函数，如 const f = (s: string): void => {...}',
  },
  noGenerators: {
    severity: 'error',
    message: 'ArkTS 不支持生成器函数（arkts-no-generators）',
    fix: '改用 async/await 实现异步多任务',
  },
  noFuncApplyCall: {
    severity: 'error',
    message: 'ArkTS 不支持 Function.apply / Function.call（arkts-no-func-apply-call）',
    fix: '改用普通方法调用',
  },
  noFuncBind: {
    severity: 'warning',
    message: 'ArkTS 不支持 Function.bind（arkts-no-func-bind）',
    fix: '改用箭头函数捕获 this 或显式传参',
  },
  noDestructParams: {
    severity: 'error',
    message: 'ArkTS 不支持参数解构（arkts-no-destruct-params）',
    fix: '参数直接传递，函数体内逐字段取值',
  },
  noTypingWithThis: {
    severity: 'error',
    message: 'ArkTS 不支持 this 类型标注（arkts-no-typing-with-this）',
    fix: '改用显式具体类型',
  },
  noStandaloneThis: {
    severity: 'error',
    message: 'ArkTS 不支持在独立函数/静态方法中使用 this（arkts-no-standalone-this）',
    fix: '仅实例方法内使用 this',
  },
  noPrototypeAssignment: {
    severity: 'error',
    message: 'ArkTS 不支持原型赋值（arkts-no-prototype-assignment）',
    fix: '用类/接口静态组合方法',
  },
  noMethodReassignment: {
    severity: 'warning',
    message: '疑似给对象方法重新赋值（arkts-no-method-reassignment；函数类型字段的赋值是合法的，需人工确认）',
    fix: '若确为方法重赋值，改用包装函数或继承',
  },
  noNewTarget: {
    severity: 'error',
    message: 'ArkTS 不支持 new.target（arkts-no-new-target）',
    fix: '改用其他方式判断构造上下文',
  },
  noMultipleStaticBlocks: {
    severity: 'error',
    message: 'ArkTS 一个类只允许一个静态块（arkts-no-multiple-static-blocks）',
    fix: '把多个静态块合并为一个',
  },
  noDefiniteAssignment: {
    severity: 'warning',
    message: 'ArkTS 不支持确定赋值断言 x!: T（arkts-no-definite-assignment）',
    fix: '声明时初始化，如 let x: number = 0',
  },
  noGlobalThis: {
    severity: 'error',
    message: 'ArkTS 不支持 globalThis（arkts-no-globalthis）',
    fix: '避免全局可变状态',
  },
  noMappedTypes: {
    severity: 'error',
    message: 'ArkTS 不支持映射类型（arkts-no-mapped-types）',
    fix: '用显式类型/类实现',
  },
  noNestedFuncs: {
    severity: 'error',
    message: 'ArkTS 不支持函数内嵌套函数声明（arkts-no-nested-funcs）',
    fix: '改用箭头函数 lambda',
  },
  noEnumMixedTypes: {
    severity: 'error',
    message: '枚举成员只能用编译期常量同类型初始化（arkts-no-enum-mixed-types）',
    fix: '移除运行时表达式初始化，保持成员类型一致',
  },
  noCommaOutsideLoops: {
    severity: 'error',
    message: '逗号运算符只允许用于 for 循环（arkts-no-comma-outside-loops）',
    fix: '拆成多条语句',
  },
  noCtorPropDecls: {
    severity: 'error',
    message: 'ArkTS 不支持在 constructor 参数中声明字段（arkts-no-ctor-prop-decls）',
    fix: '在类体内显式声明字段',
  },
  noClassLiterals: {
    severity: 'error',
    message: 'ArkTS 不支持类表达式（arkts-no-class-literals）',
    fix: '显式声明具名类',
  },
  noImportAssertions: {
    severity: 'error',
    message: 'ArkTS 不支持 import 断言（arkts-no-import-assertions）',
    fix: '使用普通 import 语法',
  },
  noCallSignatures: {
    severity: 'error',
    message: 'ArkTS 不支持对象类型中的调用签名（arkts-no-call-signatures）',
    fix: '用类替代，如 class X { invoke(...): ... }',
  },
  noCtorSignatures: {
    severity: 'error',
    message: 'ArkTS 不支持构造签名类型（arkts-no-ctor-signatures-funcs）',
    fix: '改用 lambda 或类',
  },
  noRequire: {
    severity: 'error',
    message: 'ArkTS 不支持 require 导入与 import 赋值（arkts-no-require）',
    fix: '改用常规 import 语法',
  },
  noExportAssignment: {
    severity: 'error',
    message: 'ArkTS 不支持 export = 语法（arkts-no-export-assignment）',
    fix: '改用常规 export / import',
  },
  noNsStatements: {
    severity: 'error',
    message: 'ArkTS 命名空间中不支持非声明语句（arkts-no-ns-statements）',
    fix: '把可执行语句放进函数',
  },
  noGenericLambdas: {
    severity: 'error',
    message: 'ArkTS 不支持泛型箭头函数（arkts-no-generic-lambdas）',
    fix: '改用普通泛型函数',
  },
  noIs: {
    severity: 'error',
    message: 'ArkTS 不支持 is 类型守卫（arkts-no-is）',
    fix: '改用 instanceof 配合 as 收窄',
  },
  noAliasesByIndex: {
    severity: 'error',
    message: 'ArkTS 不支持索引访问类型 T[K]（arkts-no-aliases-by-index）',
    fix: '直接使用具体类型名',
  },
  noImportDefaultAs: {
    severity: 'error',
    message: 'ArkTS 不支持 import { default as x } 语法（arkts-no-import-default-as）',
    fix: '改用 import x from ...',
  },
  noModuleWildcards: {
    severity: 'error',
    message: 'ArkTS 不支持模块名通配符（arkts-no-module-wildcards）',
    fix: '使用常规 export 语法',
  },
  noAmbientDecls: {
    severity: 'error',
    message: 'ArkTS 不支持 ambient module 声明（arkts-no-ambient-decls）',
    fix: '使用 ArkTS 自己的 JS 互操作机制',
  },
  noUmd: {
    severity: 'error',
    message: 'ArkTS 不支持 UMD 定义（arkts-no-umd）',
    fix: '使用常规 export / import 语法',
  },
  noMisplacedImports: {
    severity: 'error',
    message: 'import 语句必须在其他语句之前（arkts-no-misplaced-imports）',
    fix: '把所有 import 移到文件顶部',
  },
  noLimitedThrow: {
    severity: 'error',
    message: 'ArkTS 只允许 throw Error 及其子类（arkts-limited-throw）',
    fix: 'throw new Error(...) 或自定义 Error 子类',
  },
  noDeclMerging: {
    severity: 'error',
    message: 'ArkTS 不支持声明合并（arkts-no-decl-merging）',
    fix: '把类/接口定义保持在一个紧凑的声明中',
  },
  noEnumMerging: {
    severity: 'error',
    message: 'ArkTS 不支持 enum 声明合并（arkts-no-enum-merging）',
    fix: '每个枚举只声明一次',
  },
  uniqueNames: {
    severity: 'error',
    message: '类型/命名空间名称必须唯一（arkts-unique-names）',
    fix: '重命名冲突的声明',
  },
  noLimitedESObject: {
    severity: 'warning',
    message: 'ESObject 类型使用受限（arkts-limited-esobj）',
    fix: '改用具体类型（仅互操作局部变量场景允许 ESObject）',
  },
  noJsx: {
    severity: 'error',
    message: 'ArkTS 不支持 JSX 表达式（arkts-no-jsx）',
    fix: '用 ArkUI 声明式 UI 语法（@Component struct + build()）替代',
  },
  noWith: {
    severity: 'error',
    message: 'ArkTS 不支持 with 语句（arkts-no-with）',
    fix: '用完全限定名替代，如 Math.PI',
  },
  noInferredGenericParams: {
    severity: 'error',
    message: '泛型函数调用不能仅靠返回类型推断类型参数（arkts-no-inferred-generic-params）',
    fix: '显式指定类型参数，如 greet<string>()',
  },
  noPolymorphicUnops: {
    severity: 'error',
    message: '一元运算符 + - ~ 只支持数值类型（arkts-no-polymorphic-unops）',
    fix: '先显式转换，如 Number("5")',
  },
  noClassesAsObj: {
    severity: 'error',
    message: 'ArkTS 不支持把类当作对象值使用（arkts-no-classes-as-obj）',
    fix: '类只能用于实例化（new C()）或静态访问（C.method()）',
  },
  extendsOnlyClass: {
    severity: 'error',
    message: 'interface 只能继承 interface，不能 extends class（arkts-extends-only-class）',
    fix: '把基类改为 interface，或改用 class 继承',
  },
  implementsOnlyIface: {
    severity: 'error',
    message: 'implements 子句只能指定 interface（arkts-implements-only-iface）',
    fix: '把基类改为 interface，或改用 extends',
  },
  noNsAsObj: {
    severity: 'error',
    message: 'ArkTS 不支持把 namespace 当作对象值（arkts-no-ns-as-obj）',
    fix: '直接使用命名空间限定访问，如 MyNamespace.x',
  },
  noFuncProps: {
    severity: 'error',
    message: 'ArkTS 不支持在函数上声明属性（arkts-no-func-props）',
    fix: '把附属功能拆成独立函数或对象',
  },
  instanceofRefTypes: {
    severity: 'error',
    message: 'instanceof 左操作数不能是类型（arkts-instanceof-ref-types）',
    fix: '用实例表达式，如 new X() instanceof X',
  },
  noImplicitReturnTypes: {
    severity: 'warning',
    message: 'return 调用了返回类型省略的函数（arkts-no-implicit-return-types；静态推断存在边界误报，故降级 warning）',
    fix: '给被调用函数显式声明返回类型',
  },
  noExtendSameProp: {
    severity: 'error',
    message: 'interface 不能继承含同名方法的多个接口（arkts-no-extend-same-prop）',
    fix: '合并方法或重命名冲突方法',
  },
};

function snippetOf(sourceFile: ts.SourceFile, node: ts.Node): string {
  const start = node.getStart(sourceFile);
  const end = node.getEnd();
  const text = sourceFile.text.slice(start, end).replace(/\s+/g, ' ').trim();
  return text.length > 120 ? text.slice(0, 117) + '...' : text;
}

/** 判断表达式是否为编译期常量（字面量/一元/二元运算） */
function isConstantExpression(n: ts.Expression): boolean {
  if (ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isPrefixUnaryExpression(n)
    || ts.isParenthesizedExpression(n)
    || n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword || n.kind === ts.SyntaxKind.NullKeyword) {
    return true;
  }
  if (ts.isBinaryExpression(n)) {
    return isConstantExpression(n.left) && isConstantExpression(n.right);
  }
  return false;
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
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    // TS 解析器对极端畸形输入会抛内部断言（Debug Failure），跳过该文件而不是让 CLI 崩溃
    return [];
  }
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

  /**
   * 文件级符号表（仅顶层声明；struct 关键字会让 TS 解析器错误恢复，
   * 不会生成 ClassDeclaration，因此不会误入符号表——设计如此，避免对鸿蒙 UI 组件误报）。
   */
  const symbols = (() => {
    const classes = new Set<string>();
    const namespaces = new Set<string>();
    const functions = new Set<string>();
    const genericFunctions = new Set<string>();
    const funcReturnUsesT = new Map<string, boolean>();
    const funcReturnExplicit = new Map<string, boolean>();
    const ifaceMethods = new Map<string, Set<string>>();
    /** 函数返回类型是否引用其第一个类型参数（recipe34：只有这种才必须显式指定） */
    const returnUsesTypeParam = (fn: ts.FunctionDeclaration): boolean => {
      const tp = fn.typeParameters?.[0];
      if (!tp || !fn.type) return false;
      const name = tp.name.text;
      let found = false;
      const w = (n: ts.Node): void => {
        if (found) return;
        if (ts.isTypeReferenceNode(n) && ts.isIdentifier(n.typeName) && n.typeName.text === name) { found = true; return; }
        ts.forEachChild(n, w);
      };
      w(fn.type);
      return found;
    };
    for (const stmt of sf.statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name) {
        classes.add(stmt.name.text);
      } else if (ts.isInterfaceDeclaration(stmt) && stmt.name) {
        const methods = new Set<string>();
        for (const m of stmt.members) {
          if ((ts.isMethodSignature(m) || ts.isMethodDeclaration(m)) && m.name && ts.isIdentifier(m.name)) {
            methods.add(m.name.text);
          }
        }
        ifaceMethods.set(stmt.name.text, methods);
      } else if (ts.isModuleDeclaration(stmt) && stmt.name && ts.isIdentifier(stmt.name)) {
        namespaces.add(stmt.name.text);
      } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
        functions.add(stmt.name.text);
        if (stmt.typeParameters && stmt.typeParameters.length > 0) genericFunctions.add(stmt.name.text);
        funcReturnUsesT.set(stmt.name.text, returnUsesTypeParam(stmt));
        funcReturnExplicit.set(stmt.name.text, !!stmt.type);
      }
    }
    return { classes, namespaces, functions, genericFunctions, funcReturnUsesT, funcReturnExplicit, ifaceMethods };
  })();

  /** 提取 extends/implements 后面的类型名（忽略泛型参数） */
  function heritageName(t: ts.ExpressionWithTypeArguments): string | undefined {
    return ts.isIdentifier(t.expression) ? t.expression.text : undefined;
  }

  /** 类/命名空间名是否被当作"值"使用（只报明确的值上下文，其余保守跳过防误报） */
  function isClassRefAsValue(id: ts.Identifier): boolean {
    const p = id.parent;
    if (!p) return false;
    // 类型上下文与声明位置
    if (ts.isTypeReferenceNode(p) || ts.isExpressionWithTypeArguments(p) || ts.isTypeQueryNode(p)) return false;
    if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamedImports(p)) return false;
    // 实例化/静态访问/调用
    if (ts.isNewExpression(p) && p.expression === id) return false;
    if (ts.isPropertyAccessExpression(p) && p.expression === id) return false;
    if (ts.isElementAccessExpression(p) && p.expression === id) return false;
    if (ts.isCallExpression(p) && p.expression === id) return false;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword) return false;
    if (ts.isAsExpression(p) || ts.isTypeAssertionExpression(p)) return false;
    // 明确的值上下文
    // 注意：不做"函数实参传类"——ArkTS 官方 API（@Type(Task)、AppStorageV2.connect(Setting)）合法要求传类引用，
    // 静态无法区分哪些 API 接受类，误报代价大于漏报
    if (ts.isVariableDeclaration(p) && p.initializer === id) return true;
    if (ts.isPropertyAssignment(p) && p.initializer === id) return true;
    // 只认 `=` 赋值右值；`Promise<C>` 等泛型类型在 struct 错误恢复下会被拆成 `<`/`>` 比较表达式，需跳过
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === id) return true;
    if (ts.isReturnStatement(p) && p.expression === id) return true;
    if (ts.isArrowFunction(p) && p.body === id) return true;
    return false;
  }

  /** import 必须在其他语句之前 */
  function checkMisplacedImports(): void {
    let seenNonImport = false;
    let inLazyImport = false; // ArkTS lazy import 的错误恢复碎片（from / 'module';）不视为语句
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt)) {
        if (seenNonImport && !inLazyImport) add('noMisplacedImports', stmt);
        inLazyImport = false;
        continue;
      }
      // `import lazy { x } from '...'`：TS 解析为 ImportEqualsDeclaration + 错误恢复碎片
      if (ts.isImportEqualsDeclaration(stmt) && stmt.name.text === 'lazy') {
        inLazyImport = true;
        continue;
      }
      if (inLazyImport && (ts.isExpressionStatement(stmt) || ts.isBlock(stmt))) continue; // 碎片
      inLazyImport = false;
      seenNonImport = true;
    }
  }

  /** 类型/命名空间/变量/函数名称唯一性（文件级） */
  function checkNameUniqueness(): void {
    const seen = new Map<string, { kind: string; node: ts.Node }>();
    for (const stmt of sf.statements) {
      let name: string | undefined;
      let kind = '';
      if (ts.isClassDeclaration(stmt) && stmt.name) { name = stmt.name.text; kind = 'class'; }
      else if (ts.isInterfaceDeclaration(stmt) && stmt.name) { name = stmt.name.text; kind = 'interface'; }
      else if (ts.isEnumDeclaration(stmt) && stmt.name) { name = stmt.name.text; kind = 'enum'; }
      else if (ts.isTypeAliasDeclaration(stmt) && stmt.name) { name = stmt.name.text; kind = 'type'; }
      else if (ts.isModuleDeclaration(stmt) && stmt.name && ts.isIdentifier(stmt.name)) { name = stmt.name.text; kind = 'namespace'; }
      // 注意：不检查变量/函数名——ArkTS 的 struct 关键字会让 TS 解析器产生
      // 错误恢复 AST（类体被拆成顶层 Block/ExpressionStatement），变量级检查会误报
      if (name) {
        const prev = seen.get(name);
        if (prev) {
          if (prev.kind === 'enum' && kind === 'enum') add('noEnumMerging', stmt);
          else if ((prev.kind === 'class' && kind === 'interface') || (prev.kind === 'interface' && kind === 'class')) {
            add('noDeclMerging', stmt);
          } else {
            add('uniqueNames', stmt);
          }
        } else {
          seen.set(name, { kind, node: stmt });
        }
      }
    }
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
    // 7. 静态属性无类型标注的对象字面量初始化（带类型标注是合法的，如 static x: Record<string,string> = {...}）
    if (
      ts.isPropertyDeclaration(node) &&
      (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)) &&
      !node.type &&
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

    // 26. 函数表达式（箭头函数允许）
    if (ts.isFunctionExpression(node)) add('noFuncExpressions', node);
    // 27. 生成器函数
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node)) && node.asteriskToken) {
      add('noGenerators', node);
    }
    // 28. Function.apply / call / bind
    if (ts.isPropertyAccessExpression(node) && node.parent && ts.isCallExpression(node.parent) && node.parent.expression === node) {
      if (node.name.text === 'apply' || node.name.text === 'call') add('noFuncApplyCall', node);
      if (node.name.text === 'bind') add('noFuncBind', node);
    }
    // 29. 参数解构
    if (ts.isParameter(node) && (ts.isObjectBindingPattern(node.name) || ts.isArrayBindingPattern(node.name))) {
      add('noDestructParams', node);
    }
    // 30. this 类型标注
    if (ts.isThisTypeNode(node)) add('noTypingWithThis', node);
    // 31. 独立函数/静态方法中的 this
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      let cur = node.parent;
      while (cur) {
        if (ts.isMethodDeclaration(cur)) {
          const isStatic = cur.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
          if (isStatic) add('noStandaloneThis', node);
          break;
        }
        if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur)) {
          add('noStandaloneThis', node);
          break;
        }
        if (ts.isClassDeclaration(cur)) break; // 类字段初始化里的 this 属于实例，放行
        cur = cur.parent;
      }
    }
    // 32. 原型赋值
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'prototype'
      && node.parent && ts.isBinaryExpression(node.parent) && node.parent.left === node
      && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      add('noPrototypeAssignment', node);
    }
    // 33. 方法重新赋值（给对象属性赋函数）
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && (ts.isArrowFunction(node.right) || ts.isFunctionExpression(node.right))) {
      add('noMethodReassignment', node);
    }
    // 34. new.target（AST 中是 MetaProperty 节点）
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.NewKeyword) {
      add('noNewTarget', node);
    }
    // 35. 多个静态块
    if (ts.isClassDeclaration(node)) {
      const staticBlocks = node.members.filter((m) => ts.isClassStaticBlockDeclaration(m));
      if (staticBlocks.length > 1) {
        for (let i = 1; i < staticBlocks.length; i++) add('noMultipleStaticBlocks', staticBlocks[i]);
      }
    }
    // 36. 确定赋值断言
    if (ts.isVariableDeclaration(node) && node.exclamationToken) add('noDefiniteAssignment', node);
    // 37. globalThis
    if (ts.isIdentifier(node) && node.text === 'globalThis') add('noGlobalThis', node);
    // 38. 映射类型
    if (ts.isMappedTypeNode(node)) add('noMappedTypes', node);
    // 39. 嵌套函数声明
    if (ts.isFunctionDeclaration(node)) {
      let cur = node.parent;
      let nested = false;
      while (cur) {
        if (ts.isFunctionDeclaration(cur) || ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) { nested = true; break; }
        if (ts.isSourceFile(cur) || ts.isClassDeclaration(cur) || ts.isBlock(cur) && ts.isSourceFile(cur.parent)) break;
        cur = cur.parent;
      }
      if (nested) add('noNestedFuncs', node);
    }
    // 40. 枚举成员非常量初始化
    if (ts.isEnumMember(node) && node.initializer && !isConstantExpression(node.initializer)) {
      add('noEnumMixedTypes', node);
    }
    // 41. for 循环外的逗号运算符
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      let cur = node.parent;
      let inFor = false;
      while (cur) {
        if (ts.isForStatement(cur)) { inFor = true; break; }
        if (ts.isStatement(cur) || ts.isSourceFile(cur)) break;
        cur = cur.parent;
      }
      if (!inFor) add('noCommaOutsideLoops', node);
    }
    // 42. constructor 参数属性（public/private/protected/readonly 修饰的参数）
    if (ts.isParameter(node) && node.modifiers && node.modifiers.length > 0) {
      add('noCtorPropDecls', node);
    }
    // 43. 类表达式
    if (ts.isClassExpression(node)) add('noClassLiterals', node);
    // 44. import 断言
    if (ts.isImportDeclaration(node) && (node.attributes || (node as unknown as { assertClause?: unknown }).assertClause)) {
      add('noImportAssertions', node);
    }
    // 45. 调用签名 / 构造签名
    if (ts.isCallSignatureDeclaration(node)) add('noCallSignatures', node);
    if (ts.isConstructSignatureDeclaration(node) || ts.isConstructorTypeNode(node)) add('noCtorSignatures', node);

    // 47. require 导入 / import 赋值
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      add('noRequire', node);
    }
    if (ts.isImportEqualsDeclaration(node)) {
      // ArkTS lazy import 新特性 `import lazy { x } from '...'`：解析为 ImportEqualsDeclaration(name=lazy, moduleRef=Identifier)，合法
      const isLazyImport = node.name.text === 'lazy' && ts.isIdentifier(node.moduleReference);
      if (!isLazyImport) add('noRequire', node);
    }
    // 48. export = / export as namespace
    // export = 是 ExportAssignment(isExportEquals=true)；export default x as T 也是 ExportAssignment 但合法
    if (ts.isExportAssignment(node) && node.isExportEquals) {
      add('noExportAssignment', node);
    }
    if (ts.isNamespaceExportDeclaration(node)) add('noUmd', node);
    // 49. 命名空间中的非声明语句
    if (ts.isModuleBlock(node)) {
      const parent = node.parent;
      if (parent && ts.isModuleDeclaration(parent)) {
        for (const stmt of node.statements) {
          if (!(ts.isVariableStatement(stmt) || ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)
            || ts.isInterfaceDeclaration(stmt) || ts.isModuleDeclaration(stmt) || ts.isImportDeclaration(stmt)
            || ts.isEnumDeclaration(stmt) || ts.isTypeAliasDeclaration(stmt))) {
            add('noNsStatements', stmt);
          }
        }
      }
    }
    // 50. 泛型箭头函数
    if (ts.isArrowFunction(node) && node.typeParameters && node.typeParameters.length > 0) {
      add('noGenericLambdas', node);
    }
    // 51. is 类型守卫
    if (ts.isTypePredicateNode(node)) add('noIs', node);
    // 52. 索引访问类型
    if (ts.isIndexedAccessTypeNode(node)) add('noAliasesByIndex', node);
    // 53. import { default as x }
    if (ts.isImportSpecifier(node) && node.propertyName && node.propertyName.text === 'default') {
      add('noImportDefaultAs', node);
    }
    // 54. ambient module / 通配符模块名
    if (ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name)) {
      add(node.name.text.includes('*') ? 'noModuleWildcards' : 'noAmbientDecls', node);
    }
    // 55. throw 非 Error
    if (ts.isThrowStatement(node)) {
      const e = node.expression;
      const bad = ts.isStringLiteral(e) || ts.isNumericLiteral(e)
        || e.kind === ts.SyntaxKind.TrueKeyword || e.kind === ts.SyntaxKind.FalseKeyword
        || ts.isBinaryExpression(e) || ts.isPrefixUnaryExpression(e) || ts.isArrayLiteralExpression(e);
      if (bad) add('noLimitedThrow', node);
    }

    // 56. ESObject 类型（受限）
    if (ts.isTypeReferenceNode(node) && node.typeName.getText(sf) === 'ESObject') {
      add('noLimitedESObject', node);
    }
    // 58. with 语句（recipe84）
    if (ts.isWithStatement(node)) add('noWith', node);
    // 59. 泛型函数无参调用：仅靠返回类型推断类型参数（recipe34，保守子集）
    if (
      ts.isCallExpression(node) && !node.typeArguments && node.arguments.length === 0 &&
      ts.isIdentifier(node.expression) &&
      symbols.genericFunctions.has(node.expression.text) &&
      symbols.funcReturnUsesT.get(node.expression.text) === true
    ) {
      add('noInferredGenericParams', node);
    }
    // 60. 一元 + - ~ 作用于字符串字面量（recipe55，保守子集：只查字面量）
    if (
      ts.isPrefixUnaryExpression(node) &&
      (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken ||
        node.operator === ts.SyntaxKind.TildeToken) &&
      ts.isStringLiteral(node.operand)
    ) {
      add('noPolymorphicUnops', node);
    }
    // 61. 类被当作对象值（recipe149，只报明确值上下文）
    if (ts.isIdentifier(node) && symbols.classes.has(node.text) && isClassRefAsValue(node)) {
      add('noClassesAsObj', node);
    }
    // 62. interface extends class（recipe104）
    if (ts.isInterfaceDeclaration(node) && node.heritageClauses) {
      for (const h of node.heritageClauses) {
        if (h.token !== ts.SyntaxKind.ExtendsKeyword) continue;
        for (const t of h.types) {
          const n = heritageName(t);
          if (n && symbols.classes.has(n)) add('extendsOnlyClass', t);
        }
      }
    }
    // 63. implements 指定了 class（recipe51）
    if (ts.isClassDeclaration(node) && node.heritageClauses) {
      for (const h of node.heritageClauses) {
        if (h.token !== ts.SyntaxKind.ImplementsKeyword) continue;
        for (const t of h.types) {
          const n = heritageName(t);
          if (n && symbols.classes.has(n)) add('implementsOnlyIface', t);
        }
      }
    }
    // 64. namespace 被当作对象值（recipe114）
    if (ts.isIdentifier(node) && symbols.namespaces.has(node.text) && isClassRefAsValue(node)) {
      add('noNsAsObj', node);
    }
    // 65. 在函数上声明属性（recipe139）
    if (
      ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression) &&
      symbols.functions.has(node.left.expression.text)
    ) {
      add('noFuncProps', node);
    }
    // 66. instanceof 左操作数是类型（recipe65）
    if (
      ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword &&
      ts.isIdentifier(node.left) && symbols.classes.has(node.left.text)
    ) {
      add('instanceofRefTypes', node);
    }
    // 67. return 调用返回类型省略的函数（recipe90）
    if (
      ts.isReturnStatement(node) && node.expression && ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      symbols.funcReturnExplicit.get(node.expression.expression.text) === false
    ) {
      add('noImplicitReturnTypes', node);
    }
    // 68. interface 继承多个含同名方法的接口（recipe102）
    if (ts.isInterfaceDeclaration(node) && node.heritageClauses) {
      for (const h of node.heritageClauses) {
        if (h.token !== ts.SyntaxKind.ExtendsKeyword || h.types.length < 2) continue;
        const seen = new Set<string>();
        for (const t of h.types) {
          const n = heritageName(t);
          if (!n) continue;
          const methods = symbols.ifaceMethods.get(n);
          if (!methods) continue;
          for (const m of methods) {
            if (seen.has(m)) add('noExtendSameProp', node);
            seen.add(m);
          }
        }
      }
    }

    ts.forEachChild(node, walk);
  }

  checkTsSuppress();
  checkMisplacedImports();
  checkNameUniqueness();
  walk(sf);

  // 57. JSX 表达式（recipe54）：TS 模式下 <div> 会被解析成类型断言/泛型箭头，不会产生 JsxElement，
  // 因此用 TSX 模式单独解析；只有 TS 模式在 JSX 区域内有解析错误才判定为真 JSX——
  // 合法断言（<T>expr）、泛型箭头、泛型调用（foo<Bar>()）在 TS 模式下均无错误，不会误报。
  {
    let tsxSf: ts.SourceFile;
    try {
      tsxSf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch {
      tsxSf = sf;
    }
    const jsxNodes: ts.Node[] = [];
    const walkJsx = (n: ts.Node): void => {
      if (ts.isJsxElement(n) || ts.isJsxFragment(n) || ts.isJsxSelfClosingElement(n)) jsxNodes.push(n);
      ts.forEachChild(n, walkJsx);
    };
    walkJsx(tsxSf);
    const tsDiags = (sf as unknown as { parseDiagnostics: readonly { start: number }[] }).parseDiagnostics;
    for (const jn of jsxNodes) {
      // 只认有真实闭合标签的 JSX（<div>...</div> / <img /> / <></>）；
      // `<T>expr` 断言在 TSX 下错误恢复出的 JsxElement 只有空 closingElement（文本为空），跳过
      const isRealJsx = ts.isJsxSelfClosingElement(jn) || ts.isJsxFragment(jn) ||
        (ts.isJsxElement(jn) && !!jn.closingElement && jn.closingElement.getText(tsxSf).trim().length > 0);
      if (!isRealJsx) continue;
      const s = jn.getStart(tsxSf);
      const e = jn.getEnd();
      const relatedError = tsDiags.some((d) => d.start >= s - 1 && d.start <= e + 2);
      if (!relatedError) continue;
      add('noJsx', jn);
    }
  }

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
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile('fix.ets', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return { text: sourceText, fixed: 0 };
  }
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

/**
 * 自动修复集合：目前支持
 *  1. any/unknown -> Object（arkts-no-any-unknown）
 *  2. var -> let（arkts-no-var）
 *  3. <T>expr -> expr as T（arkts-as-casts）
 *  4. 解构拆分：{ a, b } = obj -> 逐字段（arkts-no-destruct-decls）
 * 全部基于 AST 精确替换，不影响字符串/注释。
 */
export interface FixSummary {
  text: string;
  total: number;
  /** 各类修复的计数，如 { noAny: 3, varDecl: 2 } */
  byRule: Record<string, number>;
}

export function applyAutoFixes(sourceText: string): FixSummary {
  const anyRes = fixAnyInSource(sourceText);
  const byRule: Record<string, number> = { noAny: anyRes.fixed };
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile('fix.ets', anyRes.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return { text: anyRes.text, total: anyRes.fixed, byRule };
  }
  const varPositions: { start: number; end: number }[] = [];
  const castReplacements: { start: number; end: number; text: string }[] = [];
  const destrReplacements: { start: number; end: number; text: string }[] = [];
  function walk(n: ts.Node): void {
    if (ts.isVariableDeclarationList(n) && !(n.flags & ts.NodeFlags.BlockScoped)) {
      varPositions.push({ start: n.getStart(sf), end: n.getStart(sf) + 3 });
    }
    // <T>expr -> expr as T（官方 arkts-as-casts 的推荐写法）
    if (ts.isTypeAssertionExpression(n)) {
      const expr = n.expression;
      const typeText = n.type.getText(sf);
      const exprText = expr.getText(sf);
      const simple = ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr) || ts.isCallExpression(expr)
        || ts.isElementAccessExpression(expr) || ts.isParenthesizedExpression(expr) || ts.isNewExpression(expr)
        || expr.kind === ts.SyntaxKind.ThisKeyword;
      castReplacements.push({
        start: n.getStart(sf),
        end: n.getEnd(),
        text: (simple ? exprText : '(' + exprText + ')') + ' as ' + typeText,
      });
    }
    // 解构声明拆分：const { a, b } = obj -> const a = obj.a; const b = obj.b;
    if (ts.isVariableDeclaration(n) && (ts.isObjectBindingPattern(n.name) || ts.isArrayBindingPattern(n.name))) {
      const r = buildDestructureReplacement(n, sf);
      if (r) destrReplacements.push(r);
      return; // 不深入绑定模式内部（绑定元素由替换整体处理；不支持的形态跳过）
    }
    ts.forEachChild(n, walk);
  }
  walk(sf);

  // 合并应用（从后往前；区间重叠的替换跳过，避免文本错位）
  let text = anyRes.text;
  let fixed = 0;
  const applied: { start: number; end: number; rule: string }[] = [];
  const overlaps = (s: number, e: number): boolean => applied.some((a) => s < a.end && e > a.start);
  for (const r of destrReplacements.concat(castReplacements).sort((a, b) => b.start - a.start)) {
    if (overlaps(r.start, r.end)) continue;
    if (text.slice(r.start, r.end) === r.text) continue;
    text = text.slice(0, r.start) + r.text + text.slice(r.end);
    applied.push({ start: r.start, end: r.end, rule: destrReplacements.indexOf(r) >= 0 ? 'objectDestructuring' : 'angleCast' });
    fixed++;
  }
  for (const { start, end } of varPositions.sort((a, b) => b.start - a.start)) {
    if (overlaps(start, end)) continue;
    if (text.slice(start, end) !== 'var') continue;
    text = text.slice(0, start) + 'let' + text.slice(end);
    applied.push({ start, end, rule: 'varDecl' });
    fixed++;
  }
  for (const a of applied) byRule[a.rule] = (byRule[a.rule] || 0) + 1;
  return { text, total: fixed, byRule };
}

/**
 * 生成解构声明的逐字段替换（保守子集：支持简单标识符/重命名绑定；
 * 嵌套解构、剩余属性、默认值、数组 hole、多声明器、带类型注解一律跳过）。
 * 返回 null 表示无法安全修复（调用方记录跳过）。
 */
function buildDestructureReplacement(n: ts.VariableDeclaration, sf: ts.SourceFile): { start: number; end: number; text: string } | null {
  const declList = n.parent;
  if (!ts.isVariableDeclarationList(declList) || declList.declarations.length !== 1 || n.type) return null;
  const stmt = declList.parent;
  if (!ts.isVariableStatement(stmt)) return null;
  const initText = n.initializer ? n.initializer.getText(sf) : null;
  if (!initText) return null;
  const keyword = (declList.flags & ts.NodeFlags.Let) ? 'let' : (declList.flags & ts.NodeFlags.Const) ? 'const' : 'var';
  const indentMatch = stmt.getText(sf).match(/^[ \t]*/);
  const indent = indentMatch ? indentMatch[0] : '';
  const lines: string[] = [];
  const isObj = ts.isObjectBindingPattern(n.name);
  if (isObj) {
    for (const el of n.name.elements) {
      if (!ts.isBindingElement(el)) continue;
      if (el.dotDotDotToken) return null;                       // ...rest 跳过
      if (el.initializer) return null;                          // 默认值跳过
      if (!ts.isIdentifier(el.name)) return null;               // 嵌套绑定跳过
      const prop = el.propertyName ? el.propertyName.getText(sf) : el.name.text;
      lines.push(keyword + ' ' + el.name.text + ' = ' + initText + '.' + prop + ';');
    }
  } else {
    let idx = 0;
    for (const el of (n.name as ts.ArrayBindingPattern).elements) {
      if (ts.isOmittedExpression(el)) { idx++; continue; }      // hole 占位
      if (!ts.isBindingElement(el)) continue;
      if (el.dotDotDotToken) return null;
      if (el.initializer) return null;
      if (!ts.isIdentifier(el.name)) return null;
      lines.push(keyword + ' ' + el.name.text + ' = ' + initText + '[' + idx + '];');
      idx++;
    }
  }
  if (lines.length === 0) return null;
  return { start: stmt.getStart(sf), end: stmt.getEnd(), text: lines.map((l) => indent + l).join('\n') };
}
