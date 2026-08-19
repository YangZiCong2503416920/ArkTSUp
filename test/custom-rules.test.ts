/**
 * D6 规则自定义测试：选择器 DSL 编译/匹配、scanSource 集成、级别覆盖、
 * 配置加载/校验、CLI 端到端、增量缓存配置指纹失效。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as ts from 'typescript';
import { scanSource, applyRuleConfig, isBuiltinRuleName, Finding } from '../src/lib/arkts-check';
import { compileSelector, compileCustomRules, compileCustomRule, nodeNameOf } from '../src/lib/custom-rules';
import { loadConfig, validateConfig } from '../src/lib/config';

const ROOT = path.join(__dirname, '..', '..');

function runCli(args: string[]): { stdout: string; stderr: string; status: number | null } {
  const r = spawnSync(process.execPath, ['dist/src/cli.js', ...args], { cwd: ROOT, encoding: 'utf8' });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status };
}

/** 建一个带 .arktsuprc.json 与 a.ets 的临时目录 */
function makeTree(cfg: unknown, src = 'debugger;\nconst x: any = 1;\nconsole.log(x);\n'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-d6-'));
  fs.writeFileSync(path.join(root, '.arktsuprc.json'), JSON.stringify(cfg));
  fs.writeFileSync(path.join(root, 'a.ets'), src);
  return root;
}

function nodesOf(src: string): { sf: ts.SourceFile; nodes: ts.Node[] } {
  const sf = ts.createSourceFile('t.ets', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const nodes: ts.Node[] = [];
  const w = (n: ts.Node): void => { nodes.push(n); ts.forEachChild(n, w); };
  w(sf);
  return { sf, nodes };
}

// ---------- 选择器 DSL ----------

test('compileSelector: 关键字小写别名（true -> TrueKeyword）与大小写类型名', () => {
  const t = compileSelector('true');
  assert.ok(t.ok, t.ok ? '' : (t as { error: string }).error);
  assert.ok(compileSelector('DebuggerStatement').ok);
  assert.ok(compileSelector('StringKeyword').ok);
  assert.ok(compileSelector('string').ok);
  assert.ok(compileSelector('CallExpression').ok);
});

test('compileSelector: 未知类型名 / 语法错误 / 非法正则 / 未知属性均报错', () => {
  assert.ok(!compileSelector('NotARealKind').ok);
  assert.ok(!compileSelector('CallExpression[').ok);
  assert.ok(!compileSelector('Identifier[name~=/[/]').ok);
  assert.ok(!compileSelector('Identifier[foo=bar]').ok);
  assert.ok(!compileSelector('').ok);
});

test('compileSelector: 祖先链匹配（CallExpression > Identifier[name=alert]）', () => {
  const { sf, nodes } = nodesOf('alert(1); foo(2); obj.alert(3);');
  const sel = compileSelector('CallExpression > Identifier[name=alert]');
  assert.ok(sel.ok);
  if (!sel.ok) return;
  const hits = nodes.filter((n) => sel.matches(n, sf));
  // 只应命中 alert(1) 的 callee Identifier；obj.alert 的 callee 是 PropertyAccessExpression
  assert.equal(hits.length, 1);
  assert.equal(hits[0].getText(sf), 'alert');
});

test('compileSelector: text 正则（PropertyAccessExpression[text~=console...]）', () => {
  const { sf, nodes } = nodesOf('console.log(x); console.debug(y); console.error(z); foo.log(a);');
  const sel = compileSelector('PropertyAccessExpression[text~=/^console\\.(log|debug)$/]');
  assert.ok(sel.ok);
  if (!sel.ok) return;
  const hits = nodes.filter((n) => sel.matches(n, sf));
  assert.equal(hits.length, 2); // console.log / console.debug；error 与 foo.log 不匹配
  assert.equal(hits[0].getText(sf), 'console.log');
});

test('compileSelector: name 属性（含属性赋值字符串键与下划线开头）', () => {
  const { sf, nodes } = nodesOf("const o = { _private: 1, ok: 2, 'str-key': 3 };");
  const sel = compileSelector('PropertyAssignment[name~=/^_/]');
  assert.ok(sel.ok);
  if (!sel.ok) return;
  const hits = nodes.filter((n) => sel.matches(n, sf));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].getText(sf), '_private: 1');
  const strKey = compileSelector("PropertyAssignment[name='str-key']");
  assert.ok(strKey.ok);
  if (strKey.ok) {
    assert.equal(nodes.filter((n) => strKey.matches(n, sf)).length, 1);
  }
});

test('compileCustomRule / compileCustomRules: 字段校验与批量错误收集', () => {
  assert.ok(!compileCustomRule({ name: '1bad', message: 'm', selector: 'Identifier' }).ok); // 名字非法
  assert.ok(!compileCustomRule({ name: 'ok', message: '', selector: 'Identifier' }).ok); // 缺 message
  assert.ok(!compileCustomRule({ name: 'ok', message: 'm', selector: '' }).ok); // 缺 selector
  assert.ok(!compileCustomRule({ name: 'ok', message: 'm', selector: 'Identifier', severity: 'fatal' as never }).ok); // severity 非法
  const dup = compileCustomRules([
    { name: 'r', message: 'm1', selector: 'Identifier' },
    { name: 'r', message: 'm2', selector: 'StringLiteral' },
  ]);
  assert.equal(dup.rules.length, 1);
  assert.equal(dup.errors.length, 1);
  assert.match(dup.errors[0], /重复/);
});

// ---------- scanSource 集成 ----------

test('scanSource: 自定义规则命中（错误级，行列正确，不干扰内置规则）', () => {
  const { rules } = compileCustomRules([
    { name: 'noDebugger', message: '禁止 debugger', severity: 'error', selector: 'DebuggerStatement', fix: '删除' },
  ]);
  const findings = scanSource('t.ets', 'debugger;\nlet a: any = 1;', 'warning', { customRules: rules });
  const f = findings.find((x) => x.rule === 'noDebugger');
  assert.ok(f);
  assert.equal(f!.severity, 'error');
  assert.equal(f!.message, '禁止 debugger');
  assert.equal(f!.line, 1);
  assert.equal(f!.column, 1);
  assert.equal(f!.fix, '删除');
  assert.equal(findings.filter((x) => x.rule === 'noAny').length, 1); // 内置规则照常
});

test('scanSource: 自定义规则默认级别 error；warning 被 minSeverity=error 过滤', () => {
  const { rules } = compileCustomRules([
    { name: 'noAlert', message: 'm', selector: 'CallExpression > Identifier[name=alert]' },
  ]);
  assert.equal(scanSource('t.ets', 'alert(1);', 'warning', { customRules: rules }).length, 1);
  assert.equal(scanSource('t.ets', 'alert(1);', 'error', { customRules: rules }).length, 1);
  const warn = compileCustomRules([
    { name: 'noAlert', message: 'm', severity: 'warning', selector: 'CallExpression > Identifier[name=alert]' },
  ]);
  assert.equal(scanSource('t.ets', 'alert(1);', 'error', { customRules: warn.rules }).length, 0);
  assert.equal(scanSource('t.ets', 'alert(1);', 'warning', { customRules: warn.rules }).length, 1);
});

test('scanSource: rules 覆盖对自定义规则生效（off 隐藏 / info 被默认级别过滤）', () => {
  const { rules } = compileCustomRules([
    { name: 'noDebugger', message: 'm', selector: 'DebuggerStatement' },
  ]);
  assert.equal(scanSource('t.ets', 'debugger;', 'warning', { customRules: rules, ruleOverrides: { noDebugger: 'off' } }).length, 0);
  assert.equal(scanSource('t.ets', 'debugger;', 'warning', { customRules: rules, ruleOverrides: { noDebugger: 'info' } }).length, 0);
});

test('scanSource: 内置规则级别覆盖（noFuncBind 升级 error 后 minSeverity=error 可见；noAny off 隐藏）', () => {
  const src = 'const f = fn.bind(this);\nlet a: any = 1;';
  // 默认 noFuncBind 是 warning，minSeverity=error 时不可见
  assert.equal(scanSource('t.ets', src, 'error').filter((x) => x.rule === 'noFuncBind').length, 0);
  const up = scanSource('t.ets', src, 'error', { ruleOverrides: { noFuncBind: 'error' } });
  assert.equal(up.filter((x) => x.rule === 'noFuncBind').length, 1);
  assert.equal(up.filter((x) => x.rule === 'noFuncBind')[0].severity, 'error');
  assert.equal(scanSource('t.ets', src, 'warning', { ruleOverrides: { noAny: 'off' } }).filter((x) => x.rule === 'noAny').length, 0);
});

test('applyRuleConfig: 丢弃 off / 改写 severity / 未覆盖保持原样', () => {
  const f: Finding[] = [
    { file: 'a', line: 1, column: 1, severity: 'error', rule: 'noAny', message: 'm', fix: 'f', snippet: 's' },
    { file: 'a', line: 2, column: 1, severity: 'warning', rule: 'noFuncBind', message: 'm', fix: 'f', snippet: 's' },
  ];
  const out = applyRuleConfig(f, { noAny: 'off', noFuncBind: 'error' });
  assert.equal(out.length, 1);
  assert.equal(out[0].rule, 'noFuncBind');
  assert.equal(out[0].severity, 'error');
  assert.deepEqual(applyRuleConfig(f), f);
});

test('默认行为不变：无配置时 scanSource 结果与空选项一致（官方样本回归防线）', () => {
  const src = 'let a: any = 1;\nconst { name } = user;\nconst v = obj[\'key\'];\ndebugger;\n';
  assert.deepEqual(scanSource('t.ets', src), scanSource('t.ets', src, 'warning', {}));
});

test('isBuiltinRuleName: 内置与自定义规则名区分', () => {
  assert.ok(isBuiltinRuleName('noAny'));
  assert.ok(isBuiltinRuleName('propsByIndex'));
  assert.ok(!isBuiltinRuleName('noDebugger'));
});

// ---------- 配置加载/校验 ----------

test('loadConfig: 读取 rules 与 customRules，目标目录优先于 cwd 合并', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-d6cwd-'));
  const target = path.join(cwd, 'sub');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(cwd, '.arktsuprc.json'), JSON.stringify({
    rules: { noAny: 'off', noFuncBind: 'warning' },
    customRules: [{ name: 'r1', message: 'cwd', selector: 'Identifier' }],
  }));
  fs.writeFileSync(path.join(target, '.arktsuprc.json'), JSON.stringify({
    rules: { noAny: 'error' },
    customRules: [{ name: 'r1', message: 'target', selector: 'StringLiteral' }, { name: 'r2', message: 'm', selector: 'Identifier' }],
  }));
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    const cfg = loadConfig(target);
    // 目标目录优先：noAny=error 覆盖 cwd 的 off
    assert.equal(cfg.rules?.noAny, 'error');
    assert.equal(cfg.rules?.noFuncBind, 'warning');
    // 自定义规则按名去重，目标目录优先
    assert.equal(cfg.customRules?.length, 2);
    assert.equal(cfg.customRules?.[0].name, 'r1');
    assert.equal(cfg.customRules?.[0].message, 'target');
    assert.equal(cfg.customRules?.[1].name, 'r2');
  } finally {
    process.chdir(prev);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('validateConfig: 非法级别 / 缺字段 / 重名 / 与内置规则冲突', () => {
  assert.deepEqual(validateConfig({ rules: { noAny: 'fatal' as never } }), ['rules.noAny: 级别 "fatal" 非法（off | error | warning | info）']);
  assert.equal(validateConfig({ customRules: [{ name: 'noAny', message: 'm', selector: 'Identifier' }] }).length, 1); // 与内置冲突
  assert.equal(validateConfig({ customRules: [{ name: 'a', message: '', selector: 'Identifier' }] }).length, 1); // 缺 message
  assert.equal(validateConfig({ customRules: [{ name: 'a', message: 'm', selector: '' }] }).length, 1); // 缺 selector
  assert.deepEqual(validateConfig({}), []);
  assert.deepEqual(validateConfig({ rules: { noAny: 'error' }, customRules: [{ name: 'ok', message: 'm', selector: 'Identifier' }] }), []);
});

// ---------- CLI 端到端 ----------

test('CLI: customRules 端到端（no-debugger 报错、行列正确、exit 1）', () => {
  const root = makeTree({
    customRules: [{ name: 'noDebugger', message: '禁止 debugger', severity: 'error', selector: 'DebuggerStatement', fix: '删除 debugger;' }],
  });
  const r = runCli(['check', root, '--format', 'json']);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  const f = report.findings.find((x: Finding) => x.rule === 'noDebugger');
  assert.ok(f);
  assert.equal(f.severity, 'error');
  assert.equal(f.message, '禁止 debugger');
  assert.equal(f.line, 1);
  assert.match(f.file, /a\.ets$/);
  assert.ok(report.findings.some((x: Finding) => x.rule === 'noAny')); // 内置规则不受影响
  fs.rmSync(root, { recursive: true, force: true });
});

test('CLI: rules 级别覆盖（noAny off + noFuncBind 升级 error -> exit 1）', () => {
  const root = makeTree({ rules: { noAny: 'off', noFuncBind: 'error' } }, 'const x: any = 1;\nconst f = fn.bind(this);\n');
  const r = runCli(['check', root, '--format', 'json']);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.ok(!report.findings.some((x: Finding) => x.rule === 'noAny'));
  const b = report.findings.find((x: Finding) => x.rule === 'noFuncBind');
  assert.ok(b);
  assert.equal(b.severity, 'error');
  fs.rmSync(root, { recursive: true, force: true });
});

test('CLI: 非法自定义规则配置 -> exit 2（不静默忽略）', () => {
  const root = makeTree({ customRules: [{ name: 'x', message: 'm', selector: 'NotARealKind' }] });
  const r = runCli(['check', root, '--format', 'json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /自定义规则/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('D6: 配置指纹 —— 自定义规则变更后增量缓存自动失效', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-d6cache-'));
  fs.writeFileSync(path.join(root, 'a.ets'), 'debugger;\n');
  fs.writeFileSync(path.join(root, '.arktsuprc.json'), JSON.stringify({
    customRules: [{ name: 'noDebugger', message: 'm1', selector: 'DebuggerStatement' }],
  }));
  const r1 = runCli(['check', root, '--format', 'json']);
  assert.equal(r1.status, 1);
  assert.ok(JSON.parse(r1.stdout).findings.some((f: Finding) => f.rule === 'noDebugger'));
  // 文件未变 -> 第二次应命中缓存（结果一致）
  const r2 = runCli(['check', root, '--format', 'json']);
  assert.equal(r2.status, 1);
  assert.ok(JSON.parse(r2.stdout).findings.some((f: Finding) => f.rule === 'noDebugger'));
  assert.match(r2.stderr, /\[cache\] 命中/);
  // 清空配置 -> 配置指纹变化，缓存必须失效
  fs.writeFileSync(path.join(root, '.arktsuprc.json'), JSON.stringify({}));
  const r3 = runCli(['check', root, '--format', 'json']);
  assert.equal(r3.status, 0);
  assert.ok(!JSON.parse(r3.stdout).findings.some((f: Finding) => f.rule === 'noDebugger'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('nodeNameOf: 标识符/属性名/字符串键', () => {
  const { nodes } = nodesOf("obj.key; const o = { 'k': 1 };");
  const id = nodes.find((n) => ts.isIdentifier(n) && n.text === 'obj');
  assert.ok(id);
  assert.equal(nodeNameOf(id!), 'obj');
  const pa = nodes.find((n) => ts.isPropertyAssignment(n));
  assert.ok(pa);
  assert.equal(nodeNameOf(pa!), 'k');
});
