import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkResources, generateConstants, addResource, collectResourceDefs } from '../src/lib/resource-check';

/** 构造一个最小资源工程 fixture */
function makeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-res-'));
  const element = path.join(root, 'resources', 'base', 'element');
  fs.mkdirSync(element, { recursive: true });
  const media = path.join(root, 'resources', 'base', 'media');
  fs.mkdirSync(media, { recursive: true });
  fs.writeFileSync(path.join(element, 'string.json'), JSON.stringify({
    string: [
      { name: 'hello', value: '你好' },
      { name: 'old_key', value: '没人用' },
    ],
  }, null, 2));
  fs.writeFileSync(path.join(element, 'color.json'), JSON.stringify({
    color: [{ name: 'primary', value: '#FF007DFF' }],
  }, null, 2));
  fs.writeFileSync(path.join(media, 'logo.png'), 'fake');
  const etsDir = path.join(root, 'entry', 'src', 'main', 'ets');
  fs.mkdirSync(etsDir, { recursive: true });
  fs.writeFileSync(path.join(etsDir, 'Index.ets'), [
    "import { router } from '@kit.ArkUI';",
    '',
    '@Entry',
    '@Component',
    'struct Index {',
    "  @State msg: string = $r('app.string.hello');",
    "  @State color: string = $r('app.color.primary');",
    "  @State img: string = $r('app.media.logo');",
    "  @State bad: string = $r('app.string.not_exist');",
    '',
    '  build() {',
    "    Text(this.msg).fontColor(this.color)",
    '  }',
    '}',
    '',
  ].join('\n'));
  return root;
}

test('checkResources: 缺失引用为 error，未使用资源为 warning', () => {
  const root = makeFixture();
  const report = checkResources(root);
  const missing = report.findings.filter((f) => f.rule === 'missingResource');
  const unused = report.findings.filter((f) => f.rule === 'unusedResource');
  assert.equal(missing.length, 1);
  assert.equal(missing[0].severity, 'error');
  assert.match(missing[0].message, /not_exist/);
  assert.equal(unused.length, 1); // old_key（hello/primary/logo 都被引用）
  assert.equal(unused[0].severity, 'warning');
  assert.match(unused[0].message, /old_key/);
  assert.equal(report.errors, 1);
});

test('generateConstants: 生成 R.ets 且不含未引用的错误', () => {
  const root = makeFixture();
  const code = generateConstants(root);
  assert.match(code, /export class R/);
  assert.match(code, /static readonly strings: Record<string, string> =/);
  assert.match(code, /'hello': 'app.string.hello',/);
  assert.match(code, /'primary': 'app.color.primary',/);
  assert.match(code, /'logo': 'app.media.logo',/);
  // 生成的常量表必须通过 ArkTS 检查（无 any、无未类型对象字面量）
  const { scanSource } = require('../src/lib/arkts-check') as typeof import('../src/lib/arkts-check');
  const findings = scanSource('R.ets', code);
  assert.deepEqual(findings, []);
});

test('addResource: 添加条目到 base element json', () => {
  const root = makeFixture();
  const file = addResource(root, 'string', 'welcome', '欢迎');
  assert.ok(fs.existsSync(file));
  const json = JSON.parse(fs.readFileSync(file, 'utf8')) as { string: { name: string; value: string }[] };
  assert.ok(json.string.some((x) => x.name === 'welcome' && x.value === '欢迎'));
  // 重复添加报错
  assert.throws(() => addResource(root, 'string', 'welcome', 'x'), /已存在/);
  // media 不支持 add
  assert.throws(() => addResource(root, 'media', 'x', 'y'), /media/);
});

test('collectResourceDefs: 读取 element json 与 media 文件', () => {
  const root = makeFixture();
  const defs = collectResourceDefs(root);
  const names = defs.map((d) => d.type + ':' + d.name).sort();
  assert.deepEqual(names, ['color:primary', 'media:logo', 'string:hello', 'string:old_key']);
});
