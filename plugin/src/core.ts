/**
 * 插件核心逻辑（与 VS Code API 解耦，便于单测）。
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as cp from 'node:child_process';

export interface FindingJson {
  file: string; line: number; column: number; severity: string; rule: string;
  message: string; fix: string; snippet: string;
}

export interface CheckReport {
  findings: FindingJson[];
  errors: number;
  warnings: number;
}

export interface Diag {
  line: number;       // 0-based
  column: number;     // 0-based
  endColumn: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/** 定位 CLI：配置路径 > 插件 lib > 仓库 dist */
export function resolveCli(cliPathSetting: string, extensionPath: string): string | null {
  if (cliPathSetting && fs.existsSync(cliPathSetting)) return cliPathSetting;
  const candidates = [
    path.join(extensionPath, 'lib', 'cli.js'),
    path.join(extensionPath, '..', 'dist', 'src', 'cli.js'),
    path.join(extensionPath, '..', '..', 'dist', 'src', 'cli.js'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/** 子进程调用 CLI */
export function runCli(cli: string, args: string[], stdin?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = cp.spawn(process.execPath, [cli, ...args], { cwd: path.dirname(cli) });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

/** 把 check 的 JSON 报告映射为编辑器诊断（行/列转 0-based） */
export function reportToDiagnostics(report: CheckReport, basePath: string): Map<string, Diag[]> {
  const map = new Map<string, Diag[]>();
  for (const f of report.findings) {
    const abs = path.resolve(basePath, f.file);
    const sev: Diag['severity'] = f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info';
    const diag: Diag = {
      line: f.line - 1,
      column: f.column - 1,
      endColumn: f.column - 1 + Math.max(f.snippet.length, 1),
      severity: sev,
      message: `[${f.rule}] ${f.message}。建议: ${f.fix}`,
    };
    if (!map.has(abs)) map.set(abs, []);
    map.get(abs)!.push(diag);
  }
  return map;
}
