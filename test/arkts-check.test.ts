import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanSource, Finding } from '../src/lib/arkts-check';

const rulesOf = (src: string, rule: string): Finding[] =>
  scanSource('t.ets', src).filter((f) => f.rule === rule);

test('any 注解 / as any / any[] / Array<any>', () => {
  const findings = rulesOf(`
let a: any = 1;
let b = (1 as any);
let c: any[] = [];
let d: Array<any> = [];
`, 'noAny');
  assert.equal(findings.length, 4);
});

test('无类型对象字面量 -> error；有类型标注 -> 不报', () => {
  const src = `
interface P { x: number }
let untyped = { x: 1 };
let typed: P = { x: 1 };
const fn = (): P => ({ x: 1 });
`;
  const f = rulesOf(src, 'untypedObjectLiteral');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
});

test('对象解构与解构赋值', () => {
  const src = `
const user = { name: 'a' };
const { name } = user;
let n = '';
({ n } = user);
`;
  assert.equal(rulesOf(src, 'objectDestructuring').length, 1);
  assert.equal(rulesOf(src, 'destructuringAssignment').length, 1);
});

test('Function 类型', () => {
  const f = rulesOf('let h: Function = () => {};', 'functionType');
  assert.equal(f.length, 1);
});

test('非法联合（string | number）报错，T | null 合法', () => {
  const src = `
let bad: string | number = 1;
let ok: number | null = null;
`;
  const f = rulesOf(src, 'illegalUnion');
  assert.equal(f.length, 1);
  assert.match(f[0].snippet, /string \| number/);
});

test('对象展开', () => {
  const f = rulesOf('const m = { ...a, x: 1 };', 'objectSpread');
  assert.equal(f.length, 1);
});

test('symbol 类型', () => {
  const f = rulesOf('const s: symbol = Symbol();', 'symbolType');
  assert.equal(f.length, 1);
});

test('静态属性对象字面量', () => {
  const f = rulesOf('class C { static o = { a: 1 }; }', 'staticObjectLiteral');
  assert.equal(f.length, 1);
});

test('索引签名（警告）', () => {
  const f = rulesOf('interface D { [k: string]: string }', 'indexSignature');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
});

test('catch 无类型（警告）', () => {
  const f = rulesOf('try { } catch (e) { }', 'catchWithoutType');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
});

test('minSeverity=error 时过滤警告', () => {
  const src = 'try { } catch (e) { }\nlet a: any = 1;';
  const f = scanSource('t.ets', src, 'error');
  assert.ok(f.every((x) => x.severity === 'error'));
  assert.ok(f.some((x) => x.rule === 'noAny'));
  assert.ok(!f.some((x) => x.rule === 'catchWithoutType'));
});

test('行号列号正确', () => {
  const f = rulesOf('let a = 1;\nlet b: any = 2;', 'noAny');
  assert.equal(f.length, 1);
  assert.equal(f[0].line, 2);
  assert.equal(f[0].column, 8);
});
