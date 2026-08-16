import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { analyzeSemantics } from '../src/lib/semantic';
import { scanSource } from '../src/lib/arkts-check';

function setup(files: Record<string, string>): { dir: string; paths: string[] } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-sem-'));
  const paths: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    paths.push(p);
  }
  return { dir, paths };
}

test('D3 propsByIndex: Record/数组豁免，接口升级 error', () => {
  const { dir, paths } = setup({
    'a.ets': [
      'interface X { a: string }',
      "const r: Record<string, string> = {};",
      "const v1 = r['k'];",      // Record → 豁免
      'const arr: string[] = [];',
      "const v2 = arr['k'];",    // 数组 → 豁免
      "const x: X = { a: '1' };",
      "const v4 = x['a'];",      // 接口 X → 升级 error
    ].join('\n'),
  });
  const src = fs.readFileSync(paths[0], 'utf8');
  const syntactic = scanSource(paths[0], src).filter((f) => f.rule === 'propsByIndex');
  assert.equal(syntactic.length, 3, '语法层应报 3 处');
  const sem = analyzeSemantics(paths);
  const exemptCount = syntactic.filter((f) => sem.propsByIndexExempt.has(f.file + ':' + f.line + ':' + f.column)).length;
  assert.equal(exemptCount, 2, 'Record/数组 2 处豁免');
  assert.equal(sem.propsByIndexErrors.length, 1, '接口 X 1 处升级');
  assert.ok(sem.propsByIndexErrors[0].message.includes('X'));
  assert.equal(sem.propsByIndexErrors[0].file, paths[0], '升级 finding 的文件路径为原始 .ets');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('D3 propsByIndex: 跨文件 import 的 interface 类型也能判定（影子方案）', () => {
  const { dir, paths } = setup({
    'a.ets': [
      "import { B } from './b';",
      "const b: B = { k: 'x' }; const v = b['k'];",  // B 是 interface → 升级
    ].join('\n'),
    'b.ets': 'export interface B { k: string }',
  });
  const sem = analyzeSemantics(paths);
  assert.equal(sem.propsByIndexErrors.length, 1, '跨文件 interface 类型索引访问升级');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('D3 propsByIndex: any/未标注类型保守不处理', () => {
  const { dir, paths } = setup({
    'a.ets': [
      "const v = obj['k'];",      // obj 无类型（隐式 any）→ 不豁免不升级
      "let o: any = {}; const w = o['k'];", // any → 保守
    ].join('\n'),
  });
  const sem = analyzeSemantics(paths);
  assert.equal(sem.propsByIndexExempt.size, 0);
  assert.equal(sem.propsByIndexErrors.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('D3 untypedObjectLiteral: 无上下文字面量不误豁免', () => {
  const { dir, paths } = setup({
    'a.ets': 'const o = { a: 1 };',  // 无类型上下文 → 语法层报，语义不豁免
  });
  const src = fs.readFileSync(paths[0], 'utf8');
  const syntactic = scanSource(paths[0], src).filter((f) => f.rule === 'untypedObjectLiteral');
  assert.ok(syntactic.length >= 1);
  const sem = analyzeSemantics(paths);
  const exempt = syntactic.filter((f) => sem.literalExempt.has(f.file + ':' + f.line + ':' + f.column));
  assert.equal(exempt.length, 0, '无上下文不豁免（保持报错）');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('D3 utilityType: 用户自定义 Omit 豁免，内置 Pick 仍报', () => {
  const { dir, paths } = setup({
    'a.ets': [
      'import { X } from \'./b\';',       // 模块模式（ArkTS 工程常态）
      'type Omit<T> = Partial<T>;',        // 用户自定义 Omit（遮蔽内置）
      'let o: Omit<string>;',              // → 语义豁免
      "let p: Pick<{ a: string }, 'a'>;",  // 内置 Pick → 仍报
    ].join('\n'),
    'b.ets': 'export class X { }',
  });
  const src = fs.readFileSync(paths[0], 'utf8');
  const syntactic = scanSource(paths[0], src).filter((f) => f.rule === 'utilityType');
  assert.equal(syntactic.length, 2);
  const sem = analyzeSemantics(paths);
  const exempt = syntactic.filter((f) => sem.utilityExempt.has(f.file + ':' + f.line + ':' + f.column));
  assert.equal(exempt.length, 1, '用户自定义 Omit 豁免');
  assert.ok(exempt[0].snippet.includes('Omit<string>'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('D3 analyzeSemantics: 空文件/畸形输入/空列表不崩溃', () => {
  const { dir, paths } = setup({
    'a.ets': '@Entry struct P { build() {} }',
    'b.ets': '',
  });
  const sem = analyzeSemantics(paths);
  assert.equal(sem.propsByIndexExempt.size + sem.propsByIndexErrors.length + sem.utilityExempt.size, 0);
  const empty = analyzeSemantics([]);
  assert.equal(empty.propsByIndexExempt.size + empty.propsByIndexErrors.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});