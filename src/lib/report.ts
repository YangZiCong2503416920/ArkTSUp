/**
 * 工程检查/迁移报告生成（D2）。
 * 竞品空白：CodeLinter/oxc-ark 只检查不修复、无工程级报告；本报告让 CI/开发者可追溯
 * 检查发现与 --fix 修复结果（含按规则统计）。
 */
import { ScanReport, Finding } from './arkts-check';

export interface FixStats {
  /** 规则名 -> 修复次数 */
  byRule: Record<string, number>;
  total: number;
  /** 文件 -> 该文件的修复规则统计 */
  perFile: Record<string, Record<string, number>>;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 生成 HTML 迁移报告 */
export function renderHtmlReport(opts: {
  title: string;
  report: ScanReport;
  fixStats?: FixStats;
  apiVersion?: number;
}): string {
  const { title, report, fixStats, apiVersion } = opts;
  const sevClass = (s: string): string => s === 'error' ? 'sev-error' : s === 'warning' ? 'sev-warning' : 'sev-info';
  const rows = report.findings.map((f) => {
    const rel = f.file.split('/').pop() || f.file;
    return '<tr><td>' + esc(rel) + '</td><td>' + f.line + ':' + f.column + '</td>'
      + '<td><span class="' + sevClass(f.severity) + '">' + f.severity + '</span></td>'
      + '<td>' + esc(f.rule) + '</td><td>' + esc(f.message) + '</td><td>' + esc(f.fix) + '</td></tr>';
  }).join('\n');
  const fixRows = fixStats ? Object.entries(fixStats.byRule)
    .map(([rule, n]) => '<tr><td>' + esc(rule) + '</td><td>' + n + '</td></tr>').join('\n') : '';
  const fixBlock = fixStats ? [
    '<h2>自动修复统计（--fix）</h2>',
    '<p>共修复 <strong>' + fixStats.total + '</strong> 处</p>',
    '<table><tr><th>规则</th><th>修复数</th></tr>' + fixRows + '</table>',
  ].join('\n') : '';
  const apiBlock = apiVersion ? '<p>API 最低版本：' + apiVersion + '</p>' : '';
  return [
    '<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>' + esc(title) + '</title>',
    '<style>',
    'body{font-family:system-ui,sans-serif;margin:24px;color:#1a1a1a}',
    'h1{font-size:22px} h2{font-size:17px;margin-top:28px}',
    'table{border-collapse:collapse;width:100%;font-size:13px}',
    'th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}',
    'th{background:#f5f5f5}',
    '.sev-error{color:#c0392b;font-weight:600} .sev-warning{color:#b9770e;font-weight:600} .sev-info{color:#2471a3}',
    '.summary{background:#f8f9fa;padding:12px 16px;border-radius:6px}',
    '</style></head><body>',
    '<h1>' + esc(title) + '</h1>',
    '<div class="summary">扫描 <strong>' + report.filesScanned + '</strong> 个 .ets 文件：'
    + '<strong class="sev-error">' + report.errors + '</strong> 错误，'
    + '<strong class="sev-warning">' + report.warnings + '</strong> 警告，'
    + report.infos + ' 提示' + apiBlock + '</div>',
    fixBlock,
    '<h2>问题明细（' + report.findings.length + ' 条）</h2>',
    report.findings.length ? '<table><tr><th>文件</th><th>位置</th><th>级别</th><th>规则</th><th>问题</th><th>建议</th></tr>'
      + rows + '</table>' : '<p>✅ 未发现问题</p>',
    '</body></html>',
  ].join('\n');
}

export function renderJsonReport(report: ScanReport, fixStats?: FixStats): string {
  return JSON.stringify({
    meta: { generatedAt: new Date().toISOString(), tool: 'arktsup' },
    summary: { filesScanned: report.filesScanned, errors: report.errors, warnings: report.warnings, infos: report.infos },
    fix: fixStats ? { total: fixStats.total, byRule: fixStats.byRule, perFile: fixStats.perFile } : undefined,
    findings: report.findings,
  }, null, 2);
}

export type { Finding };
