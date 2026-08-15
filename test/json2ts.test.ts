import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { jsonToArkTs } from '../src/lib/json2ts';

test('基本对象生成 interface', () => {
  const r = jsonToArkTs({ id: 1, name: 'a', ok: true }, { rootName: 'User' });
  assert.equal(r.code, [
    'export interface User {',
    '  id: number',
    '  name: string',
    '  ok: boolean',
    '}',
    '',
  ].join('\n'));
  assert.deepEqual(r.typeNames, ['User']);
  assert.deepEqual(r.warnings, []);
});

test('嵌套对象生成子类型', () => {
  const r = jsonToArkTs({ user: { name: 'a', addr: { city: 'bj' } } }, { rootName: 'Resp' });
  assert.match(r.code, /export interface Resp \{/);
  assert.match(r.code, /user: User/);
  assert.match(r.code, /export interface User \{/);
  assert.match(r.code, /addr: Addr/);
  assert.match(r.code, /export interface Addr \{/);
  assert.deepEqual(r.typeNames, ['Resp', 'User', 'Addr']);
});

test('数组映射为 T[]', () => {
  const r = jsonToArkTs({ tags: ['a', 'b'], nums: [1, 2] }, { rootName: 'R' });
  assert.match(r.code, /tags: string\[\]/);
  assert.match(r.code, /nums: number\[\]/);
});

test('空数组 -> Object[] + 警告', () => {
  const r = jsonToArkTs({ items: [] }, { rootName: 'R' });
  assert.match(r.code, /items: Object\[\]/);
  assert.ok(r.warnings.length > 0);
});

test('对象数组合并键，缺失键变为可选', () => {
  const r = jsonToArkTs(
    { list: [{ a: 1, b: 'x' }, { a: 2 }] },
    { rootName: 'R' }
  );
  assert.match(r.code, /list: List\[\]/);
  assert.match(r.code, /export interface List \{/);
  assert.match(r.code, /a: number/);
  assert.match(r.code, /b\?: string/);
});

test('null 字段标记可空', () => {
  const r = jsonToArkTs({ a: null, b: 1 }, { rootName: 'R' });
  assert.match(r.code, /a\?: null/);
  assert.match(r.code, /b: number/);
});

test('混合类型生成联合（ArkTS 支持任意联合）', () => {
  const r = jsonToArkTs({ arr: [1, 'x'] }, { rootName: 'R' });
  assert.match(r.code, /arr: \(number \| string\)\[\]/);
  assert.deepEqual(r.warnings, []);
});

test('class 风格', () => {
  const r = jsonToArkTs({ a: 1 }, { rootName: 'C', style: 'class' });
  assert.match(r.code, /export class C \{/);
});

test('--sort 按字母序', () => {
  const r = jsonToArkTs({ b: 1, a: 2, c: 3 }, { rootName: 'R', sort: true });
  const idxA = r.code.indexOf('a: number');
  const idxB = r.code.indexOf('b: number');
  const idxC = r.code.indexOf('c: number');
  assert.ok(idxA < idxB && idxB < idxC);
});

test('--optional 全部可选', () => {
  const r = jsonToArkTs({ a: 1, b: 'x' }, { rootName: 'R', optional: true });
  assert.match(r.code, /a\?: number/);
  assert.match(r.code, /b\?: string/);
});

test('共享对象引用去重（同一类型名）', () => {
  const shared = { v: 1 };
  const r = jsonToArkTs({ x: shared, y: shared }, { rootName: 'R' });
  assert.match(r.code, /x: X/);
  assert.match(r.code, /y: X/);
  assert.equal((r.code.match(/export interface X/g) || []).length, 1);
});

test('数组中含 null 元素生成 (T | null)[]', () => {
  const r = jsonToArkTs({ scores: [88, null, 95] }, { rootName: 'R' });
  assert.match(r.code, /scores: \(number \| null\)\[\]/);
});

test('递归结构不爆栈且生成递归引用', () => {
  const node: Record<string, unknown> = { val: 1 };
  node['child'] = node;
  const r = jsonToArkTs(node, { rootName: 'Node' });
  assert.match(r.code, /child: Node/);
  assert.ok(!r.code.includes('undefined'));
});

test('非常规键名转换为合法标识符并警告', () => {
  const r = jsonToArkTs({ 'user-name': 1, '2fa': true }, { rootName: 'R' });
  assert.match(r.code, /user_name: number/);
  assert.match(r.code, /_2fa: boolean/);
  assert.ok(r.warnings.some((w) => w.includes('user-name')));
});

test('根为对象数组', () => {
  const r = jsonToArkTs([{ a: 1 }, { a: 2, b: 3 }], { rootName: 'Rows' });
  assert.match(r.code, /export type Rows = Row\[\]/);
  assert.match(r.code, /export interface Row \{/);
  assert.match(r.code, /a: number/);
  assert.match(r.code, /b\?: number/);
});

test('根为原始值', () => {
  const r = jsonToArkTs('hello', { rootName: 'Msg' });
  assert.equal(r.code, 'export type Msg = string\n');
});

test('CLI: json2ts 接受 JSON5（注释/尾逗号/单引号）', () => {
  const { execSync } = require('node:child_process');
  const json5 = [
    "// 这是注释",
    "{",
    "  id: 1,        // 无引号键",
    "  name: 'Alice',",
    "  tags: ['a', 'b',],   // 尾逗号",
    "}",
  ].join('\n');
  const out = execSync('node dist/src/cli.js json2ts --name J5', {
    cwd: path.join(__dirname, '..', '..'),
    input: json5,
    encoding: 'utf8',
  });
  assert.match(out, /export interface J5/);
  assert.match(out, /id: number/);
  assert.match(out, /name: string/);
  assert.match(out, /tags: string\[\]/);
});
