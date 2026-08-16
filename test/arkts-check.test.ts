import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, fixAnyInSource, Finding } from '../src/lib/arkts-check';

const rulesOf = (src: string, rule: string): Finding[] =>
  scanSource('t.ets', src).filter((f) => f.rule === rule);

test('noAny: any/unknown 各形态（含去重）', () => {
  const src = `
let a: any = 1;
let b = (1 as any);
let c: any[] = [];
let d: Array<any> = [];
let e: unknown = null;
let f = (1 as unknown);
`;
  const f = rulesOf(src, 'noAny');
  assert.equal(f.length, 6);
});

test('untypedObjectLiteral: 无类型/带 Object 注解报错，带具体类型不报', () => {
  const src = `
interface P { x: number }
let untyped = { x: 1 };
let objTyped: Object = { x: 1 };
let typed: P = { x: 1 };
const fn = (): P => ({ x: 1 });
function g(): P { return { x: 1 }; }
`;
  const f = rulesOf(src, 'untypedObjectLiteral');
  assert.equal(f.length, 2); // untyped 与 Object 注解两处
  assert.ok(f.every((x) => x.severity === 'error'));
});

test('nonInferrableArray: 对象字面量数组/空数组报错，带类型不报', () => {
  const src = `
interface P { x: number }
let a = [{ x: 1 }, { x: 2 }];
let b = [];
let c: P[] = [{ x: 1 }];
let d: number[] = [];
let e = [1, 2];
let oo: Object[] = [{ x: 1 }];   // recipe38: Object[] 初始化字面量禁止
let oo2: object[] = [];           // 空数组带类型合法
`;
  const f = rulesOf(src, 'nonInferrableArray');
  assert.equal(f.length, 3); // a、b、oo
});

test('解构：对象/数组声明与赋值', () => {
  const src = `
const user = { name: 'a' };
const { name } = user;
const [x, y] = [1, 2];
let n = '';
({ n } = user);
let h = 0;
[h, x] = [x, h];
`;
  assert.equal(rulesOf(src, 'objectDestructuring').length, 1);
  assert.equal(rulesOf(src, 'arrayDestructuring').length, 1);
  assert.equal(rulesOf(src, 'destructuringAssignment').length, 2);
});

test('objectSpread（数组展开不报）', () => {
  assert.equal(rulesOf('const m = { ...a, x: 1 };', 'objectSpread').length, 1);
  assert.equal(rulesOf('const arr = [...a, 1];', 'objectSpread').length, 0);
});

test('官方示例模式不误报：done: Function / 元组 / 回调返回字面量 / 字符串键', () => {
  const src = `
it('test', 0, async (done: Function) => { done(); });
type TestList = [name: string, func: (() => string)][];
const list: TestList = [['a', () => 'x']];
Select(listAllTests().map<SelectOption>((v) => { return { value: v[0] } }));
startAbility({ want: { 'deviceId': 'dev', 'bundleName': 'com.x' } });
let timezoneList: object[] = [];
const arr = [1, 2];
`;
  const findings = scanSource('t.ets', src);
  const rules = findings.map((f) => f.rule);
  assert.ok(!rules.includes('functionType'), 'Function 类型在官方示例中合法');
  assert.ok(!rules.includes('tupleType'), '元组类型在官方示例中合法');
  assert.ok(!rules.includes('nonIdentifierProps'), '字符串键合法（官方 §226 例外）');
  assert.ok(!rules.includes('untypedObjectLiteral'), '回调返回字面量有上下文类型');
  assert.ok(!rules.includes('nonInferrableArray'), '带类型空数组合法');
});

test('symbolType: 类型与 Symbol() 调用，Symbol.iterator 不报', () => {
  assert.equal(rulesOf('const s: symbol = Symbol();', 'symbolType').length, 2);
  assert.equal(rulesOf('const i = Symbol.iterator;', 'symbolType').length, 0);
});

test('staticObjectLiteral / indexSignature（错误级）/ propsByIndex', () => {
  assert.equal(rulesOf('class C { static o = { a: 1 }; }', 'staticObjectLiteral').length, 1);
  assert.equal(rulesOf('class C { static o: Record<string, string> = { a: "1" }; }', 'staticObjectLiteral').length, 0);
  const idx = rulesOf('interface D { [k: string]: string }', 'indexSignature');
  assert.equal(idx.length, 1);
  assert.equal(idx[0].severity, 'error');
  const pi = rulesOf("const v = obj['key'];", 'propsByIndex');
  assert.equal(pi.length, 1);
  assert.equal(pi[0].severity, 'warning');
  assert.equal(rulesOf('const v = arr[0];', 'propsByIndex').length, 0);
  assert.equal(rulesOf('const v = arr[i];', 'propsByIndex').length, 0);
});

test('catchWithType: 带类型报错，省略不报', () => {
  assert.equal(rulesOf('try { } catch (e: BusinessError) { }', 'catchWithType').length, 1);
  assert.equal(rulesOf('try { } catch (e) { }', 'catchWithType').length, 0);
});

test('forIn / tsSuppress / asConst / utilityType', () => {
  assert.equal(rulesOf('for (const k in obj) { }', 'forIn').length, 1);
  assert.equal(rulesOf('// @ts-ignore\nlet a = 1;', 'tsSuppress').length, 1);
  assert.equal(rulesOf('const x = "hi" as const;', 'asConst').length, 1);
  assert.equal(rulesOf('type T = Omit<Point, "y">;', 'utilityType').length, 1);
  assert.equal(rulesOf('type T = Partial<Point>;', 'utilityType').length, 0);
  assert.equal(rulesOf('type T = Record<string, number>;', 'utilityType').length, 0);
});

test('intersection / conditionalType / objLiteralAsType', () => {
  assert.equal(rulesOf('type T = A & B;', 'intersection').length, 1);
  assert.equal(rulesOf('type T = number extends string ? true : false;', 'conditionalType').length, 1);
  assert.equal(rulesOf('let o: { a: number } = { a: 1 };', 'objLiteralAsType').length, 1);
});

test('nonIdentifierProps: 数字键报错，字符串键合法', () => {
  assert.equal(rulesOf("const o = { 2: 'x' };", 'nonIdentifierProps').length, 1);
  assert.equal(rulesOf("const o = { 'name': 'x' };", 'nonIdentifierProps').length, 0);
});

test('deleteOp / typeQuery / angleCast / inOperator / varDecl / privateIdentifiers', () => {
  assert.equal(rulesOf('delete o.x;', 'deleteOp').length, 1);
  assert.equal(rulesOf('let t: typeof x = x;', 'typeQuery').length, 1);
  assert.equal(rulesOf('const c = <Foo>x;', 'angleCast').length, 1);
  assert.equal(rulesOf('if ("a" in o) { }', 'inOperator').length, 1);
  assert.equal(rulesOf('var x = 1;', 'varDecl').length, 1);
  assert.equal(rulesOf('class C { #x: number = 1 }', 'privateIdentifiers').length, 1);
});

test('stdlibRestricted: Object.freeze / hasOwnProperty / eval', () => {
  assert.equal(rulesOf('const o = Object.freeze({});', 'stdlibRestricted').length, 1);
  assert.equal(rulesOf('if (obj.hasOwnProperty("k")) { }', 'stdlibRestricted').length, 1);
  assert.equal(rulesOf('eval("1+1");', 'stdlibRestricted').length, 1);
  assert.equal(rulesOf('Object.keys(obj);', 'stdlibRestricted').length, 0);
});

test('minSeverity 过滤（当前规则全是 error，warning 级别下不丢）', () => {
  const src = 'let a: any = 1;\nconst x = "hi" as const;';
  const f = scanSource('t.ets', src, 'error');
  assert.equal(f.length, 2);
});

test('行号列号正确', () => {
  const f = rulesOf('let a = 1;\nlet b: any = 2;', 'noAny');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 2);
  assert.equal(f[0].column, 8);
});

test('fixAnyInSource: any/unknown -> Object', () => {
  const src = `
let a: any = 1;
let b: unknown = 2;
const c: any[] = [];
const d: Array<any> = [];
const e = (1 as any);
`;
  const { text, fixed } = fixAnyInSource(src);
  assert.equal(fixed, 5);
  assert.ok(!text.includes('any'));
  assert.ok(!text.includes('unknown'));
  assert.match(text, /let a: Object = 1/);
  assert.match(text, /let b: Object = 2/);
  assert.match(text, /const c: Object\[\] = \[\]/);
  assert.match(text, /const d: Array<Object> = \[\]/);
  assert.match(text, /const e = \(1 as Object\);/);
});

test('applyAutoFixes: any/unknown->Object 且 var->let', () => {
  const { applyAutoFixes } = require('../src/lib/arkts-check') as typeof import('../src/lib/arkts-check');
  const src = [
    'var x: any = 1;',
    'let y: unknown = 2;',
    'for (var i = 0; i < 3; i++) { }',
    'const s = "var is just text";',
  ].join('\n');
  const res = applyAutoFixes(src);
  assert.equal(res.byRule.noAny, 2);
  assert.equal(res.byRule.varDecl, 2);
  assert.match(res.text, /let x: Object = 1;/);
  assert.match(res.text, /let y: Object = 2;/);
  assert.match(res.text, /for \(let i = 0;/);
  assert.match(res.text, /"var is just text"/);
  assert.ok(!res.text.includes('var x'));
});

test('applyAutoFixes: angleCast <T>expr -> expr as T', () => {
  const { applyAutoFixes } = require('../src/lib/arkts-check') as typeof import('../src/lib/arkts-check');
  const src = [
    'const a = <Point>x;',
    'const b = <Foo>(a + b);',
    'const c = x as Bar;   // 已是 as 写法，不变',
  ].join('\n');
  const res = applyAutoFixes(src);
  assert.equal(res.byRule.angleCast, 2);
  assert.match(res.text, /const a = x as Point;/);
  assert.match(res.text, /const b = \(a \+ b\) as Foo;/);
  assert.match(res.text, /const c = x as Bar;/);
});

// ---------- 新增规则（第二轮扩充，全部对照官方 recipe）----------

test('noFuncExpressions / noGenerators', () => {
  assert.equal(rulesOf('const f = function (s: string) { };', 'noFuncExpressions').length, 1);
  assert.equal(rulesOf('const f = (s: string): void => { };', 'noFuncExpressions').length, 0);
  assert.equal(rulesOf('function* gen() { yield 1; }', 'noGenerators').length, 1);
});

test('noFuncApplyCall / noFuncBind', () => {
  assert.equal(rulesOf('fn.apply(this, args);', 'noFuncApplyCall').length, 1);
  assert.equal(rulesOf('fn.call(this, 1);', 'noFuncApplyCall').length, 1);
  assert.equal(rulesOf('const g = fn.bind(this);', 'noFuncBind').length, 1);
});

test('noDestructParams / noTypingWithThis', () => {
  assert.equal(rulesOf('function f({ a, b }: P) { }', 'noDestructParams').length, 1);
  assert.equal(rulesOf('interface I { getHead(): this }', 'noTypingWithThis').length, 1);
});

test('noStandaloneThis', () => {
  assert.equal(rulesOf('function f() { this.x = 1; }', 'noStandaloneThis').length, 1);
  assert.equal(rulesOf('class C { m() { this.x = 1; } }', 'noStandaloneThis').length, 0);
  assert.equal(rulesOf('class C { static m() { this.x = 1; } }', 'noStandaloneThis').length, 1);
});

test('noPrototypeAssignment / noMethodReassignment', () => {
  assert.equal(rulesOf('C.prototype = { };', 'noPrototypeAssignment').length, 1);
  const mr = rulesOf('obj.method = () => { };', 'noMethodReassignment');
  assert.equal(mr.length, 1);
  assert.equal(mr[0].severity, 'warning', '函数字段赋值与方法重赋值无法静态区分，降级为 warning');
  // 常见的回调字段赋值模式不应报 error
  assert.equal(rulesOf('this.controller.loaded = () => this.loading = false;', 'noMethodReassignment')[0]?.severity, 'warning');
});

test('noNewTarget / noMultipleStaticBlocks / noDefiniteAssignment', () => {
  assert.equal(rulesOf('class E extends Error { constructor() { super(); new.target; } }', 'noNewTarget').length, 1);
  assert.equal(rulesOf('class C { static { } static { } }', 'noMultipleStaticBlocks').length, 1);
  const da = rulesOf('let x!: number;', 'noDefiniteAssignment');
  assert.equal(da.length, 1);
  assert.equal(da[0].severity, 'warning');
});

test('noGlobalThis / noMappedTypes / noNestedFuncs', () => {
  assert.equal(rulesOf('globalThis.x = 1;', 'noGlobalThis').length, 1);
  assert.equal(rulesOf('type T = { [K in keyof U]: boolean };', 'noMappedTypes').length, 1);
  assert.equal(rulesOf('function a() { function b() { } }', 'noNestedFuncs').length, 1);
});

test('noEnumMixedTypes / noCommaOutsideLoops / noCtorPropDecls', () => {
  assert.equal(rulesOf('enum E { A = Math.random() }', 'noEnumMixedTypes').length, 1);
  assert.equal(rulesOf('const x = (1, 2);', 'noCommaOutsideLoops').length, 1);
  assert.equal(rulesOf('for (let i = 0, j = 0; i < 1; i++, j++) { }', 'noCommaOutsideLoops').length, 0);
  assert.equal(rulesOf('class P { constructor(private name: string) { } }', 'noCtorPropDecls').length, 1);
});

test('noClassLiterals / noImportAssertions / noCallSignatures / noCtorSignatures', () => {
  assert.equal(rulesOf('const C = class { };', 'noClassLiterals').length, 1);
  assert.equal(rulesOf('import { a } from "x" assert { type: "json" };', 'noImportAssertions').length, 1);
  assert.equal(rulesOf('type F = { (arg: number): string };', 'noCallSignatures').length, 1);
  assert.equal(rulesOf('type C = new (name: string) => P;', 'noCtorSignatures').length, 1);
});

// ---------- 第三轮扩充（13 条）----------

test('noRequire / noExportAssignment / noUmd', () => {
  assert.equal(rulesOf('const m = require("mod");', 'noRequire').length, 1);
  assert.equal(rulesOf('export default pageViewModel as PageViewModel;', 'noExportAssignment').length, 0, 'export default x as T 是合法默认导出');
  assert.equal(rulesOf('import m = require("mod");', 'noRequire').length, 1);
  assert.equal(rulesOf('export = Point;', 'noExportAssignment').length, 1);
  assert.equal(rulesOf('export as namespace X;', 'noUmd').length, 1);
});

test('noNsStatements / noGenericLambdas / noIs / noAliasesByIndex', () => {
  assert.equal(rulesOf('namespace A { export let x: number = 1; x = 2; }', 'noNsStatements').length, 1);
  assert.equal(rulesOf('const f = <T>(x: T) => x;', 'noGenericLambdas').length, 1);
  assert.equal(rulesOf('function g(x: unknown): x is Foo { return true; }', 'noIs').length, 1);
  assert.equal(rulesOf('type N = Point["x"];', 'noAliasesByIndex').length, 1);
});

test('noImportDefaultAs / noAmbientDecls / noModuleWildcards / noLimitedThrow', () => {
  assert.equal(rulesOf('import { default as d } from "mod";', 'noImportDefaultAs').length, 1);
  assert.equal(rulesOf('declare module "someModule" { }', 'noAmbientDecls').length, 1);
  assert.equal(rulesOf('declare module "*!text" { }', 'noModuleWildcards').length, 1);
  assert.equal(rulesOf('throw 4;', 'noLimitedThrow').length, 1);
  assert.equal(rulesOf('throw "";', 'noLimitedThrow').length, 1);
  assert.equal(rulesOf('throw new Error("x");', 'noLimitedThrow').length, 0);
});

test('noMisplacedImports: import 必须在其他语句之前', () => {
  const src = [
    "import { router } from '@kit.ArkUI';",
    'const x = 1;',
    "import { http } from '@kit.NetworkKit';",   // 在语句之后 -> 报错
  ].join('\n');
  const f = rulesOf(src, 'noMisplacedImports');
  assert.equal(f.length, 1);
});

// ---------- 第四轮扩充（4 条）----------

test('noDeclMerging / noEnumMerging / uniqueNames', () => {
  const dm = 'interface C { a: number }\nclass C { b: number = 0 }';
  assert.equal(rulesOf(dm, 'noDeclMerging').length, 1);
  assert.equal(rulesOf('enum E { A }\nenum E { B }', 'noEnumMerging').length, 1);
  assert.equal(rulesOf('type X = number;\nclass X { }', 'uniqueNames').length, 1);
  assert.equal(rulesOf('class Y { }\nclass Z { }', 'uniqueNames').length, 0);
  // struct 场景不误报（TS 解析器错误恢复，变量级不检查）
  assert.equal(rulesOf('@Entry\n@Component\nstruct P { build() { const token = 1; } }', 'uniqueNames').length, 0);
});

test('noLimitedESObject', () => {
  const f = rulesOf('let o: ESObject = foo();', 'noLimitedESObject');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
});


// ---------- 第五轮扩充（12 条，recipe54/84/34/55/149/104/51/114/139/65/90/102）----------

test('noJsx: JSX 表达式（recipe54）', () => {
  assert.equal(rulesOf('const el = <div>hi</div>;', 'noJsx').length, 1);
  assert.equal(rulesOf('const el = <><span/></>;', 'noJsx').length, 2); // fragment + 嵌套 self-closing
  assert.equal(rulesOf('const el = <img src="x" />;', 'noJsx').length, 1);
  assert.equal(rulesOf('const s = "<div>text</div>";', 'noJsx').length, 0);
});

test('noWith: with 语句（recipe84）', () => {
  assert.equal(rulesOf('with (Math) { let r: number = 42; }', 'noWith').length, 1);
  assert.equal(rulesOf('const x = Math.PI;', 'noWith').length, 0);
});

test('noInferredGenericParams: 泛型函数无参调用（recipe34）', () => {
  const src = [
    'function greet<T>(): T { return \'x\' as T; }',
    'let z = greet();',                    // 仅靠返回类型推断 -> 报
    'let ok = greet<string>();',           // 显式指定 -> 不报
    'function choose<T>(x: T, y: T): T { return x; }',
    'let c = choose(1, 2);',               // 参数可推断 -> 不报
    'function noop<T>(): void { }',
    'noop();',                             // 返回类型不引用 T -> 不报
  ].join('\n');
  const f = rulesOf(src, 'noInferredGenericParams');
  assert.equal(f.length, 1);
  assert.ok(f[0].snippet.includes('greet()'));
});

test('noPolymorphicUnops: 一元 + - ~ 作用于字符串字面量（recipe55）', () => {
  assert.equal(rulesOf('const a = +"5";', 'noPolymorphicUnops').length, 1);
  assert.equal(rulesOf('const b = -"5";', 'noPolymorphicUnops').length, 1);
  assert.equal(rulesOf('const c = ~"5";', 'noPolymorphicUnops').length, 1);
  assert.equal(rulesOf('const d = +5; const e = -5; const f = ~5;', 'noPolymorphicUnops').length, 0);
});

test('noClassesAsObj: 类被当作对象值（recipe149）', () => {
  const bad = [
    'class C { s: string = \'\' }',
    'let c = C;',              // 类名赋值给变量 -> 报
    'let d: C = c;',           // 类型上下文 -> 不报（TypeReference）
    'let e = new C();',        // 实例化 -> 不报
    'C.prototype = {};',       // 静态/原型访问 -> 不报
  ].join('\n');
  const f = rulesOf(bad, 'noClassesAsObj');
  assert.equal(f.length, 1);
  assert.ok(f[0].snippet.includes('C'));
  // 函数实参传类：有意不做（@Type(Task)/AppStorageV2.connect(Setting) 等官方 API 合法传类，静态无法区分）
  assert.equal(rulesOf('class K { }\nfunction take(x: Object): void { }\ntake(K);', 'noClassesAsObj').length, 0);
});

test('extendsOnlyClass: interface extends class（recipe104）', () => {
  const f = rulesOf('class C { state: number = 0 }\ninterface I extends C { select(): void }', 'extendsOnlyClass');
  assert.equal(f.length, 1);
  assert.equal(rulesOf('interface A { f(): void }\ninterface B extends A { g(): void }', 'extendsOnlyClass').length, 0);
});

test('implementsOnlyIface: implements 指定 class（recipe51）', () => {
  const f = rulesOf('class C { foo(): void {} }\nclass D implements C { foo(): void {} }', 'implementsOnlyIface');
  assert.equal(f.length, 1);
  assert.equal(rulesOf('interface I { foo(): void }\nclass D implements I { foo(): void {} }', 'implementsOnlyIface').length, 0);
});

test('noNsAsObj: namespace 被当作对象值（recipe114）', () => {
  const f = rulesOf('namespace N { export let x: number = 1 }\nlet m = N;', 'noNsAsObj');
  assert.equal(f.length, 1);
  // 命名空间限定访问合法
  assert.equal(rulesOf('namespace N { export let x: number = 1 }\nN.x = 2;', 'noNsAsObj').length, 0);
});

test('noFuncProps: 函数上声明属性（recipe139）', () => {
  const f = rulesOf('function readImage(p: string): void { }\nreadImage.sync = () => { };', 'noFuncProps');
  assert.equal(f.length, 1);
  assert.equal(rulesOf('const obj = { sync: 1 };\nobj.sync = 2;', 'noFuncProps').length, 0);
});

test('instanceofRefTypes: instanceof 左操作数是类型（recipe65）', () => {
  const f = rulesOf('class X { }\nlet b = X instanceof Object;', 'instanceofRefTypes');
  assert.equal(f.length, 1);
  assert.equal(rulesOf('class X { }\nlet c = (new X()) instanceof X;', 'instanceofRefTypes').length, 0);
});

test('noImplicitReturnTypes: return 调用返回类型省略的函数（recipe90）', () => {
  const bad = [
    'function g(x: number): number { return x; }',  // 有显式返回类型
    'function f(x: number) { return g(x); }',       // f 无返回类型且调用有类型的 g -> 不报
    'function h(x: number) { return x; }',          // 无返回类型
    'function k(x: number) { return h(x); }',       // 调用无返回类型的 h -> 报
  ].join('\n');
  const f = rulesOf(bad, 'noImplicitReturnTypes');
  assert.equal(f.length, 1);
  assert.ok(f[0].snippet.includes('return h(x)'));
  // 被调用函数有返回类型 -> 不报
  assert.equal(rulesOf('function g(x: number): number { return x; }\nfunction f(x: number) { return g(x); }', 'noImplicitReturnTypes').length, 0);
});

test('noExtendSameProp: interface 继承多个同名方法接口（recipe102）', () => {
  const bad = [
    'interface Mover { getStatus(): number }',
    'interface Shaker { getStatus(): number }',
    'interface MoverShaker extends Mover, Shaker { }',
  ].join('\n');
  const f = rulesOf(bad, 'noExtendSameProp');
  assert.equal(f.length, 1);
  // 无同名方法 -> 不报
  const ok = [
    'interface A { f(): void }',
    'interface B { g(): void }',
    'interface AB extends A, B { }',
  ].join('\n');
  assert.equal(rulesOf(ok, 'noExtendSameProp').length, 0);
});