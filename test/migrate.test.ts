import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanMigrateFile, fixMigrateFile } from '../src/lib/migrate';

test('scanMigrateFile: 检测 @ohos.* 废弃导入', () => {
  const src = [
    "import hilog from '@ohos.hilog';",
    "import { http } from '@ohos.net.http';",
    "import { preferences } from '@ohos.data.preferences';",
    "import { router } from '@kit.ArkUI';",   // 已是 kit，不报
    '',
    'hilog.info(0, "tag", "msg");',
  ].join('\n');
  const f = scanMigrateFile('t.ets', src);
  assert.equal(f.length, 3);
  assert.ok(f.every((x) => x.rule === 'deprecatedModule' && x.severity === 'warning'));
  assert.ok(f.some((x) => x.message.includes('@ohos.hilog')));
});

test('fixMigrateFile: 默认导入 hilog 改为具名 kit 导入', () => {
  const src = [
    "import hilog from '@ohos.hilog';",
    '',
    'hilog.info(0, "tag", "hello");',
    'const s = "hilog is fine in strings";',
    '// hilog in comment',
  ].join('\n');
  const { text, fixed } = fixMigrateFile('t.ets', src);
  assert.ok(fixed > 0);
  assert.match(text, /import \{ hilog \} from '@kit.PerformanceAnalysisKit';/);
  assert.match(text, /hilog.info\(0, "tag", "hello"\);/);
  assert.match(text, /"hilog is fine in strings"/);
  assert.match(text, /\/\/ hilog in comment/);
});

test('fixMigrateFile: fs -> fileIo 改名并替换引用', () => {
  const src = [
    "import { fs } from '@ohos.file.fs';",
    '',
    'const data = fs.readTextSync("/tmp/x");',
    'const stat = fs.statSync("/tmp/x");',
    'const obj = { fs: 1 };',           // 属性名不替换
    'const n = obj.fs;',                // 属性访问不替换
  ].join('\n');
  const { text, fixed } = fixMigrateFile('t.ets', src);
  assert.ok(fixed > 0);
  assert.match(text, /import \{ fileIo \} from '@kit.CoreFileKit';/);
  assert.match(text, /fileIo.readTextSync\(/);
  assert.match(text, /fileIo.statSync\(/);
  assert.match(text, /const obj = \{ fs: 1 \};/);
  assert.match(text, /const n = obj.fs;/);
  assert.ok(!text.includes('@ohos.file.fs'));
});

test('fixMigrateFile: prompt -> promptAction 典型迁移', () => {
  const src = [
    "import prompt from '@ohos.prompt';",
    '',
    'prompt.showToast({ message: "hi" });',
  ].join('\n');
  const { text, fixed } = fixMigrateFile('t.ets', src);
  assert.ok(fixed > 0);
  assert.match(text, /import \{ promptAction \} from '@kit.ArkUI';/);
  assert.match(text, /promptAction.showToast\(/);
});

test('fixMigrateFile: 具名导入且名字不变时保持', () => {
  const src = [
    "import { preferences } from '@ohos.data.preferences';",
    'preferences.getPreferencesSync({});',
  ].join('\n');
  const { text } = fixMigrateFile('t.ets', src);
  assert.match(text, /import \{ preferences \} from '@kit.ArkData';/);
  assert.match(text, /preferences.getPreferencesSync\(/);
});

test('fixMigrateFile: 无废弃导入时不动', () => {
  const src = [
    "import { router } from '@kit.ArkUI';",
    'router.back();',
  ].join('\n');;
  const { text, fixed } = fixMigrateFile('t.ets', src);
  assert.equal(fixed, 0);
  assert.equal(text, src);
});

test('fixMigrateFile: 导入名冲突时跳过并提示，不生成坏代码', () => {
  const src = [
    "import { fs } from '@ohos.file.fs';",
    "import fs from '@ohos.prompt';",
    '',
    'fs.readTextSync("/x");',
    'fs.showToast({ message: "x" });',
  ].join('\n');
  const { text, fixed, skipped } = fixMigrateFile('t.ets', src);
  assert.equal(fixed, 0);
  assert.equal(text, src); // 文件原样保留
  assert.ok(skipped?.includes('冲突'), '应说明冲突原因');
  assert.ok(skipped?.includes('fileIo'));
});

test('fixMigrateFile: 命名空间导入 * as fs', () => {
  const src = [
    "import * as fs from '@ohos.file.fs';",
    'fs.mkdirSync("/tmp/x");',
  ].join('\n');
  const { text, fixed } = fixMigrateFile('t.ets', src);
  assert.ok(fixed > 0);
  assert.match(text, /import \* as fileIo from '@kit.CoreFileKit';/);
  assert.match(text, /fileIo.mkdirSync\(/);
});
