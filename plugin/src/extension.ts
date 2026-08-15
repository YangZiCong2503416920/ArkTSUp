/**
 * ArkTSUp VS Code 插件入口。
 *
 * 设计：通过子进程调用 arktsup CLI（--format json），把结果映射为 VS Code
 * Diagnostics（Problems 面板）与编辑器插入。这样插件不直接依赖 typescript 包，
 * 打包体积小、运行稳定。
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { resolveCli, runCli, reportToDiagnostics, CheckReport } from './core';

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('arktsup.checkWorkspace', () => runCheck(context, 'workspace')),
    vscode.commands.registerCommand('arktsup.checkActiveFile', () => runCheck(context, 'file')),
    vscode.commands.registerCommand('arktsup.json2tsFromClipboard', () => runJson2Ts())
  );
}

export function deactivate(): void { /* 无清理逻辑 */ }

/** 定位 arktsup CLI（优先用户配置，其次插件内 lib，其次项目内 dist） */
function resolveCliFor(context: vscode.ExtensionContext): string | null {
  const configured = vscode.workspace.getConfiguration('arktsup').get<string>('cliPath', '');
  return resolveCli(configured, context.extensionPath);
}

async function runCheck(context: vscode.ExtensionContext, mode: 'workspace' | 'file'): Promise<void> {
  const cli = resolveCliFor(context);
  if (!cli) {
    vscode.window.showErrorMessage('未找到 arktsup CLI。请在设置 arktsup.cliPath 中指定，或先构建项目(npm run build)');
    return;
  }
  const target = mode === 'file' ? vscode.window.activeTextEditor?.document.uri.fsPath
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!target) {
    vscode.window.showWarningMessage(mode === 'file' ? '请先打开一个 .ets 文件' : '请先打开一个工程文件夹');
    return;
  }
  const res = await runCli(cli, ['check', target, '--format', 'json']);
  let report: CheckReport;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    vscode.window.showErrorMessage('arktsup check 输出解析失败: ' + res.stderr.slice(0, 200));
    return;
  }
  const diags = vscode.languages.createDiagnosticCollection('arktsup');
  context.subscriptions.push(diags);
  diags.clear();
  const byFile = reportToDiagnostics(report, target);
  for (const [fp, list] of byFile) {
    diags.set(vscode.Uri.file(fp), list.map((d) => {
      const sev = d.severity === 'error' ? vscode.DiagnosticSeverity.Error
        : d.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
      const range = new vscode.Range(d.line, d.column, d.line, d.endColumn);
      const diag = new vscode.Diagnostic(range, d.message, sev);
      diag.source = 'ArkTSUp';
      return diag;
    }));
  }
  vscode.window.showInformationMessage(
    `ArkTSUp 检查完成: ${report.errors} 错误，${report.warnings} 警告（详见 Problems 面板）`
  );
}

async function runJson2Ts(): Promise<void> {
  const text = await vscode.env.clipboard.readText();
  if (!text.trim()) {
    vscode.window.showWarningMessage('剪贴板为空');
    return;
  }
  // 校验是 JSON
  try {
    JSON.parse(text);
  } catch (e) {
    vscode.window.showErrorMessage('剪贴板内容不是合法 JSON: ' + (e as Error).message);
    return;
  }
  const name = await vscode.window.showInputBox({ prompt: '根类型名（默认 Root）', value: 'Root' });
  if (name === undefined) return;
  // 在项目里找 cli.js
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const cliCandidates = root
    ? [path.join(root, 'node_modules', 'arktsup', 'dist', 'src', 'cli.js')]
    : [];
  const localCli = cliCandidates.find((c) => fs.existsSync(c));
  if (!localCli) {
    // 回退：从 ArkTSUp 仓库路径（开发模式）
    vscode.window.showErrorMessage('未找到 arktsup CLI（需要在工程里安装 arktsup 包）。json2ts 仅支持安装了 arktsup 的工程');
    return;
  }
  const res = await runCli(localCli, ['json2ts', '--name', name], text);
  const doc = await vscode.workspace.openTextDocument({ language: 'typescript', content: res.stdout });
  await vscode.window.showTextDocument(doc, { preview: false });
}
