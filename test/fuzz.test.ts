import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanSource } from '../src/lib/arkts-check';

// ---------- P3-2 fuzz / 属性测试 ----------
// 1) 随机 token 组合的任意输入，scanSource 必须不崩溃且输出结构合法
// 2) 真实代码（examples/bad.ets）随机变异，同样必须不崩溃
// 用确定性伪随机（固定 seed），失败可复现。

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ArkTS/TS 语法元素池（含 struct/@Entry 等鸿蒙特有写法，覆盖错误恢复路径）
const TOKENS = [
  'let', 'const', 'var', 'function', 'class', 'interface', 'enum', 'namespace', 'module',
  'import', 'export', 'return', 'if', 'else', 'for', 'while', 'switch', 'try', 'catch',
  'throw', 'new', 'this', 'typeof', 'instanceof', 'as', 'in', 'delete', 'void',
  'any', 'unknown', 'number', 'string', 'boolean', 'Object', 'Array', 'Record', 'Partial',
  'Readonly', 'Required', 'Omit', 'symbol', 'never', 'null', 'undefined',
  '=>', '(', ')', '{', '}', '[', ']', '<', '>', ';', ',', ':', '?', '!', '=', '+', '-',
  '*', '/', '&', '|', '~', '.', '...', '\'str\'', '"str"', '0', '1', '42', 'true', 'false',
  'foo', 'bar', 'T', 'X', 'Y', 'U', 'E', 'K', 'V', 'C', 'I', 'N',
  '@Entry', '@Component', '@ComponentV2', 'struct', 'build', '@State', '@Prop', '@Builder',
  '@Type', '@Trace', '@Local', '@Provide', '$r', 'await', 'async', 'get', 'set', 'static',
  'readonly', 'abstract', 'public', 'private', 'protected', 'constructor', 'extends',
  'implements', 'default', 'lazy', 'require', 'globalThis', 'with', 'yield', 'as const',
];

test('fuzz: 400 组随机代码片段不崩溃且输出合法', () => {
  const rand = mulberry32(20260816);
  for (let i = 0; i < 400; i++) {
    const len = 3 + Math.floor(rand() * 30);
    const parts: string[] = [];
    for (let j = 0; j < len; j++) parts.push(TOKENS[Math.floor(rand() * TOKENS.length)]);
    const src = parts.join(rand() < 0.3 ? '\n' : ' ');
    let findings;
    try {
      findings = scanSource('fuzz.ets', src);
    } catch (e) {
      assert.fail('scanSource 崩溃 on: ' + JSON.stringify(src.slice(0, 120)) + ' — ' + (e as Error).message);
    }
    assert.ok(Array.isArray(findings), 'findings 应为数组');
    for (const f of findings) {
      assert.ok(f.line >= 1 && f.column >= 1, '位置必须 >= 1: ' + f.rule);
      assert.ok(f.message.length > 0, '消息非空: ' + f.rule);
      assert.ok(f.severity === 'error' || f.severity === 'warning' || f.severity === 'info', 'severity 合法');
    }
  }
});

test('fuzz: 真实代码随机变异 200 次不崩溃', () => {
  const base = fs.readFileSync(path.join(__dirname, '..', '..', 'examples', 'bad.ets'), 'utf8');
  const rand = mulberry32(7);
  const mutChars = ['\n', ' ', '{', '}', '<', '>', '(', ')', ';', '\'', '"', '`', '0', 'a', '*', '/', '\\', '\t'];
  for (let i = 0; i < 200; i++) {
    let src = base;
    const ops = 1 + Math.floor(rand() * 5);
    for (let k = 0; k < ops; k++) {
      const pos = Math.floor(rand() * src.length);
      const op = rand();
      const ch = mutChars[Math.floor(rand() * mutChars.length)];
      if (op < 0.4) src = src.slice(0, pos) + ch + src.slice(pos);      // 插入
      else if (op < 0.8) src = src.slice(0, pos) + src.slice(pos + 1);  // 删除
      else src = src.slice(0, pos) + ch + src.slice(pos + 1);           // 替换
    }
    try {
      scanSource('mut.ets', src);
    } catch (e) {
      assert.fail('变异后崩溃: ' + JSON.stringify(src.slice(0, 150)) + ' — ' + (e as Error).message);
    }
  }
});

test('fuzz: 空输入/极短输入边界', () => {
  assert.deepEqual(scanSource('t.ets', ''), []);
  assert.deepEqual(scanSource('t.ets', '\n'), []);
  assert.deepEqual(scanSource('t.ets', ';'), []);
  assert.deepEqual(scanSource('t.ets', '()'), []);
  assert.deepEqual(scanSource('t.ets', '{}'), []);
  assert.ok(Array.isArray(scanSource('t.ets', '<')));
  assert.ok(Array.isArray(scanSource('t.ets', '\'\'\'')));
  assert.ok(Array.isArray(scanSource('t.ets', 'import lazy { a } from \'./b\';')));
});