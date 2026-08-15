import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig, isRuleIgnored } from '../src/lib/config';

function makeTree(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-cfg-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.mkdirSync(path.join(root, 'ohosTest'), { recursive: true });
  fs.writeFileSync(path.join(root, '.arktsuprc.json'), JSON.stringify({
    ignore: { rules: ['propsByIndex'], dirs: ['ohosTest'] },
  }));
  fs.writeFileSync(path.join(root, 'src', 'a.ets'), "const v = obj['key'];");
  fs.writeFileSync(path.join(root, 'ohosTest', 'b.ets'), 'let x: any = 1;');
  return root;
}

test('loadConfig: 读取 .arktsuprc.json 的忽略项', () => {
  const root = makeTree();
  const cfg = loadConfig(root);
  assert.deepEqual(cfg.ignore?.rules, ['propsByIndex']);
  assert.deepEqual(cfg.ignore?.dirs, ['ohosTest']);
  assert.ok(isRuleIgnored(cfg, 'propsByIndex'));
  assert.ok(!isRuleIgnored(cfg, 'noAny'));
});

test('check 命令: .arktsuprc 忽略规则与目录生效', () => {
  const { execSync } = require('node:child_process');
  const root = makeTree();
  const out = execSync('node dist/src/cli.js check ' + root + ' --format json', {
    cwd: path.join(__dirname, '..', '..'),
    encoding: 'utf8',
  });
  const report = JSON.parse(out);
  // propsByIndex 被忽略；ohosTest 目录被跳过（其 noAny 不应出现）
  assert.ok(!report.findings.some((f: { rule: string }) => f.rule === 'propsByIndex'));
  assert.ok(!report.findings.some((f: { file: string }) => f.file.includes('ohosTest')));
  assert.equal(report.findings.length, 0);
});
