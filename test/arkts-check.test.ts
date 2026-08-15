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
