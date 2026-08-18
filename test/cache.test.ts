import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CheckCache, buildFingerprints, countFindings, fingerprintOf, isCacheFresh, loadCache, saveCache } from '../src/lib/cache';

test('D4 cache: 保存/加载/指纹命中与失效', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-cache-'));
  const f1 = path.join(dir, 'a.ets');
  const f2 = path.join(dir, 'b.ets');
  fs.writeFileSync(f1, 'let a: any = 1;');
  fs.writeFileSync(f2, 'let b: any = 2;');
  const files = [f1, f2];
  const cacheFile = path.join(dir, '.arktsup-cache.json');
  const finding = { file: f1, line: 1, column: 8, severity: 'error' as const, rule: 'noAny', message: 'x', fix: 'y', snippet: 'any' };
  const cache: CheckCache = { version: 1, toolVersion: '0.5.0', files: buildFingerprints(files), findings: [finding] };
  saveCache(cacheFile, cache);
  assert.ok(fs.existsSync(cacheFile));
  // 命中
  const loaded = loadCache(cacheFile, '0.5.0');
  assert.ok(loaded);
  assert.ok(isCacheFresh(loaded!, files));
  // 版本不匹配失效
  assert.equal(loadCache(cacheFile, '9.9.9'), null);
  // 文件变更失效
  fs.writeFileSync(f1, 'let a: number = 1;');
  assert.equal(isCacheFresh(loaded!, files), false);
  // 新文件不命中
  const f3 = path.join(dir, 'c.ets');
  fs.writeFileSync(f3, 'let c: any = 3;');
  assert.equal(isCacheFresh(loaded!, [f1, f2, f3]), false);
  // 损坏缓存
  fs.writeFileSync(cacheFile, '{bad json');
  assert.equal(loadCache(cacheFile, '0.5.0'), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('D4 cache: countFindings 统计', () => {
  const findings = [
    { file: 'a', line: 1, column: 1, severity: 'error' as const, rule: 'r', message: 'm', fix: 'f', snippet: 's' },
    { file: 'a', line: 2, column: 1, severity: 'warning' as const, rule: 'r2', message: 'm', fix: 'f', snippet: 's' },
    { file: 'a', line: 3, column: 1, severity: 'info' as const, rule: 'r3', message: 'm', fix: 'f', snippet: 's' },
  ];
  assert.deepEqual(countFindings(findings), { errors: 1, warnings: 1, infos: 1 });
  assert.deepEqual(countFindings([]), { errors: 0, warnings: 0, infos: 0 });
});

test('D4 cache: fingerprintOf 缺失文件返回 null', () => {
  assert.equal(fingerprintOf('/nonexistent/x.ets'), null);
});