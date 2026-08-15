import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { checkResources, generateConstants, addResource, collectResourceDefs, collectReferences } from '../src/lib/resource-check';
import { runResource } from '../src/commands/resource';

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

test('CLI: resource check 传文件路径时干净报错（exit 2），不抛栈', () => {
  const root = makeFixture();
  const file = path.join(root, 'entry', 'src', 'main', 'ets', 'Index.ets');
  const origErr = console.error;
  const errs: string[] = [];
  console.error = (m: unknown) => { errs.push(String(m)); };
  const code = runResource(['check', file]);
  console.error = origErr;
  assert.equal(code, 2);
  assert.ok(errs.some((e) => e.includes('目录')));
  assert.ok(!errs.some((e) => e.includes('ENOTDIR')), '不应出现未捕获的堆栈');
});

test('CLI: resource add 非法键名/非法类型报错（exit 2），合法键成功', () => {
  const root = makeFixture();
  const origErr = console.error;
  const origOut = process.stdout.write.bind(process.stdout);
  let out = '';
  const errs: string[] = [];
  process.stdout.write = (m: unknown) => { out += String(m); return true; };
  console.error = (m: unknown) => { errs.push(String(m)); };
  const bad = runResource(['add', 'app.string.bad key!', '--value', 'v', '--dir', root]);
  const badType = runResource(['add', 'app.media.pic', '--value', 'v', '--dir', root]);
  const ok = runResource(['add', 'app.string.ok_key', '--value', 'v', '--dir', root]);
  console.error = origErr;
  process.stdout.write = origOut;
  assert.equal(bad, 2);
  assert.equal(badType, 2);
  assert.equal(ok, 0);
  assert.ok(errs.some((e) => e.includes('ok_key')), '成功添加的输出走 console.error');
});

test('collectReferences: 注释/字符串内的 $r() 不产生引用', () => {
  const root = makeFixture();
  const etsDir = path.join(root, 'entry', 'src', 'main', 'ets');
  fs.writeFileSync(path.join(etsDir, 'Index.ets'), [
    "// TODO: use $r('app.string.never_defined')",
    "const doc = \"See $r('app.string.also_never') in string\";",
    "@State m: string = $r('app.string.hello');",
  ].join('\n'));
  const refs = collectReferences(root);
  assert.deepEqual(refs.map((x) => x.name), ['hello']);
});

test('resource check --min-severity error 时汇总与输出一致', () => {
  const root = makeFixture();
  const origOut = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (m: unknown) => { out += String(m); return true; };
  const code = runResource(['check', root, '--min-severity', 'error']);
  process.stdout.write = origOut;
  assert.equal(code, 1); // 有 missingResource
  assert.ok(!out.includes('warning'), 'error 级别下不应输出 warning 行');
});

test('module.json5 中的 $media/$string 引用算作使用，不误报 unused', () => {
  const root = makeFixture();
  // 加一个仅被 module.json5 引用的图标
  fs.writeFileSync(path.join(root, 'resources', 'base', 'media', 'app_icon.png'), 'x');
  fs.writeFileSync(path.join(root, 'module.json5'), [
    '{',
    '  "abilities": [{',
    '    "icon": "$media:app_icon",',
    '    "label": "$string:app_label",',
    '  }]',
    '}',
  ].join('\n'));
  fs.writeFileSync(path.join(root, 'resources', 'base', 'element', 'string.json'), JSON.stringify({
    string: [{ name: 'app_label', value: 'KTM' }, { name: 'old_key', value: '没人用' }],
  }, null, 2));
  const report = checkResources(root);
  const unused = report.findings.filter((f) => f.rule === 'unusedResource').map((f) => f.message);
  assert.ok(!unused.some((m) => m.includes('app_icon')), '图标被 module.json5 引用，不应报 unused: ' + unused.join('|'));
  assert.ok(!unused.some((m) => m.includes('app_label')), '字符串被 module.json5 引用，不应报 unused');
  assert.ok(unused.some((m) => m.includes('old_key')), '真没用的键仍应报 unused');
});

