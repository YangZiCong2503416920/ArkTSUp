import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtmlReport, renderJsonReport, FixStats } from '../src/lib/report';
import { ScanReport, Finding } from '../src/lib/arkts-check';

const report: ScanReport = {
  findings: [
    { file: '/proj/a.ets', line: 3, column: 8, severity: 'error', rule: 'noAny', message: '禁止 any', fix: '改具体类型', snippet: 'any' },
  ],
  filesScanned: 1, errors: 1, warnings: 0, infos: 0,
};
const fixStats: FixStats = {
  byRule: { noAny: 2, varDecl: 1 }, total: 3,
  perFile: { '/proj/a.ets': { noAny: 2, varDecl: 1 } },
};

test('renderHtmlReport: 结构完整且统计正确', () => {
  const html = renderHtmlReport({ title: 'T', report, fixStats, apiVersion: 9 });
  assert.ok(html.includes('<title>T</title>'));
  assert.ok(html.includes('扫描 <strong>1</strong> 个 .ets 文件'));
  assert.ok(html.includes('共修复 <strong>3</strong> 处'));
  assert.ok(html.includes('noAny') && html.includes('varDecl'));
  assert.ok(html.includes('API 最低版本：9'));
  assert.ok(html.includes('禁止 any'));
});

test('renderHtmlReport: XSS 转义', () => {
  const evil: Finding = { file: 'x.ets', line: 1, column: 1, severity: 'error', rule: 'noAny', message: '<script>alert(1)</script>', fix: '"&<>', snippet: 'x' };
  const html = renderHtmlReport({ title: '<h1>x</h1>', report: { findings: [evil], filesScanned: 1, errors: 1, warnings: 0, infos: 0 } });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<h1>x</h1>') || html.includes('&lt;h1&gt;'));
});

test('renderHtmlReport: 无问题时显示通过', () => {
  const clean: ScanReport = { findings: [], filesScanned: 5, errors: 0, warnings: 0, infos: 0 };
  const html = renderHtmlReport({ title: 'T', report: clean });
  assert.ok(html.includes('未发现问题'));
});

test('renderJsonReport: 含 meta/summary/findings', () => {
  const j = JSON.parse(renderJsonReport(report, fixStats));
  assert.equal(j.meta.tool, 'arktsup');
  assert.equal(j.summary.filesScanned, 1);
  assert.equal(j.fix.total, 3);
  assert.equal(j.findings.length, 1);
});