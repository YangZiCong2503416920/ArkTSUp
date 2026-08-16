import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkApiVersionInSource, detectMinApiVersion } from '../src/lib/api-check';

test('apiVersion: import 的 @ohos 模块版本高于最低版本时 error', () => {
  const src = [
    "import { promptAction } from '@ohos.prompt';",   // since 8
    "import { hilog } from '@ohos.hilog';",           // since 7
  ].join('\n');
  const f = checkApiVersionInSource('t.ets', src, 6);
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => x.severity === 'error' && x.rule === 'apiVersion'));
  assert.ok(f[0].message.includes('@ohos.prompt'));
  // minVersion 足够高时不报
  assert.equal(checkApiVersionInSource('t.ets', src, 9).length, 0);
});

test('apiVersion: 未收录模块 / 非 @ohos 模块不报（保守）', () => {
  const src = [
    "import { a } from '@ohos.unknownModule';",   // 未收录
    "import { router } from '@kit.ArkUI';",       // @kit 不在检查范围
    "import { b } from 'relative/path';",
  ].join('\n');
  assert.equal(checkApiVersionInSource('t.ets', src, 5).length, 0);
});

test('apiVersion: 畸形输入不崩溃', () => {
  assert.deepEqual(checkApiVersionInSource('t.ets', '@Entry struct P { }', 5), []);
  assert.deepEqual(checkApiVersionInSource('t.ets', '', 5), []);
  assert.deepEqual(checkApiVersionInSource('t.ets', 'import lazy { c } from \'./C\';', 5), []);
});

test('detectMinApiVersion: 从 module.json5 / app.json5 探测', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-api-'));
  assert.equal(detectMinApiVersion(dir), null);
  fs.writeFileSync(path.join(dir, 'module.json5'), '{ module: { minAPIVersion: 12 } }');
  assert.equal(detectMinApiVersion(dir), 12);
  // 子目录向上查找
  const sub = path.join(dir, 'entry', 'src', 'main', 'ets');
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(detectMinApiVersion(sub), 12);
  // app.json5
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-api2-'));
  fs.writeFileSync(path.join(dir2, 'app.json5'), '{ app: { minAPIVersion: 9 } }');
  assert.equal(detectMinApiVersion(dir2), 9);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(dir2, { recursive: true, force: true });
});