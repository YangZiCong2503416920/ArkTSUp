/**
 * ArkTSUp VS Code 插件入口（v0.2.0）。
 *
 * 功能：
 *   - 检查工程 / 检查当前文件 / 保存 .ets 自动检查（防抖 500ms，实时诊断）
 *   - 从剪贴板 JSON 生成 ArkTS 类型
 *   - 废弃 API 迁移（dry-run 报告 + 一键应用修复）
 *   - 资源引用检查
 *
 * 设计：通过子进程调用 arktsup CLI（--format json），映射为 VS Code Diagnostics。
 */

import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { resolveCli, runCli, reportToDiagnostics, CheckReport } from './core';

const DIAG_COLLECTION = 'arktsup';
let debounceTimer: NodeJS.Timeout | undefined;
let diagCollection: vscode.DiagnosticCollection;

export function activate(context: vscode.ExtensionContext): void {
  diagCollection = vscode.languages.createDiagnosticCollection(DIAG_COLLECTION);
  context.subscriptions.push(diagCollection);
  context.subscriptions.push(
    vscode.commands.registerCommand('arktsup.checkWorkspace', () => runCheck(context, 'workspace')),
    vscode.commands.registerCommand('arktsup.checkActiveFile', () => runCheck(context, 'file')),
    vscode.commands.registerCommand('arktsup.json2tsFromClipboard', () => runJson2Ts()),
    vscode.commands.registerCommand('arktsup.migrate', () => runMigrate(context)),
    vscode.commands.registerCommand('arktsup.resourceCheck', () => runResourceCheck(context))
  );

  // 保存 .ets 自动检查（防抖）
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.fileName.endsWith('.ets')) return;
      if (!vscode.workspace.getConfiguration('arktsup').get<boolean>('checkOnSave', true)) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        runCheck(context, 'file', doc.uri.fsPath);
      }, 500);
    })
  );
}

export function deactivate(): void { /* 无清理逻辑 */ }

function resolveCliFor(context: vscode.ExtensionContext): string | null {
  const configured = vscode.workspace.getConfiguration('arktsup').get<string>('cliPath', '');
  return resolveCli(configured, context.extensionPath);
}

function renderDiagnostics(report: CheckReport, basePath: string): void {
  diagCollection.clear();
  const byFile = reportToDiagnostics(report, basePath);
  for (const [fp, list] of byFile) {
    diagCollection.set(vscode.Uri.file(fp), list.map((d) => {
      const sev = d.severity === 'error' ? vscode.DiagnosticSeverity.Error
        : d.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
      const range = new vscode.Range(d.line, d.column, d.line, d.endColumn);
      const diag = new vscode.Diagnostic(range, d.message, sev);
      diag.source = 'ArkTSUp';
      return diag;
    }));
  }
}

async function runCheck(context: vscode.ExtensionContext, mode: 'workspace' | 'file', explicitFile?: string): Promise<void> {
  const cli = resolveCliFor(context);
  if (!cli) {
    vscode.window.showErrorMessage('未找到 arktsup CLI。请在设置 arktsup.cliPath 中指定，或先构建项目(npm run build)');
    return;
  }
  const target = explicitFile ?? (mode === 'file' ? vscode.window.activeTextEditor?.document.uri.fsPath
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath);
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
  renderDiagnostics(report, target);
  if (!explicitFile) {
    vscode.window.showInformationMessage(`ArkTSUp 检查完成: ${report.errors} 错误，${report.warnings} 警告（详见 Problems 面板）`);
  }
}

async function runMigrate(context: vscode.ExtensionContext): Promise<void> {
  const cli = resolveCliFor(context);
  if (!cli) { vscode.window.showErrorMessage('未找到 arktsup CLI'); return; }
  const target = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!target) { vscode.window.showWarningMessage('请先打开一个工程文件夹'); return; }

  const res = await runCli(cli, ['migrate', target, '--dry-run', '--format', 'json']);
  let report: { findings: unknown[] };
  try {
    report = JSON.parse(res.stdout);
  } catch {
    vscode.window.showErrorMessage('migrate 输出解析失败: ' + res.stderr.slice(0, 200));
    return;
  }
  const n = report.findings.length;
  if (n === 0) {
    vscode.window.showInformationMessage('没有发现废弃的 @ohos.* 模块导入，工程已 kit 化 ✓');
    return;
  }
  const choice = await vscode.window.showInformationMessage(
    `发现 ${n} 处废弃模块导入（@ohos.* -> @kit.*）`,
    { modal: true },
    '应用自动修复'
  );
  if (choice !== '应用自动修复') return;
  const fix = await runCli(cli, ['migrate', target, '--format', 'json']);
  vscode.window.showInformationMessage(`已自动修复 ${report.findings.length} 处废弃导入（建议用 arktsup check 复查）`);
  void fix;
}

async function runResourceCheck(context: vscode.ExtensionContext): Promise<void> {
  const cli = resolveCliFor(context);
  if (!cli) { vscode.window.showErrorMessage('未找到 arktsup CLI'); return; }
  const target = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!target) { vscode.window.showWarningMessage('请先打开一个工程文件夹'); return; }
  const res = await runCli(cli, ['resource', 'check', target, '--format', 'json']);
  let report: CheckReport;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    vscode.window.showErrorMessage('resource 输出解析失败: ' + res.stderr.slice(0, 200));
    return;
  }
  renderDiagnostics(report, target);
  vscode.window.showInformationMessage(`资源检查完成: ${report.errors} 错误，${report.warnings} 警告`);
}

async function runJson2Ts(): Promise<void> {
  const text = await vscode.env.clipboard.readText();
  if (!text.trim()) {
    vscode.window.showWarningMessage('剪贴板为空');
    return;
  }
  try {
    JSON.parse(text);
  } catch (e) {
    vscode.window.showErrorMessage('剪贴板内容不是合法 JSON: ' + (e as Error).message);
    return;
  }
  const name = await vscode.window.showInputBox({ prompt: '根类型名（默认 Root）', value: 'Root' });
  if (name === undefined) return;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const cliCandidates = root ? [path.join(root, 'node_modules', 'arktsup', 'dist', 'src', 'cli.js')] : [];
  const localCli = cliCandidates.find((c) => fs.existsSync(c));
  if (!localCli) {
    vscode.window.showErrorMessage('未找到 arktsup CLI（需要在工程里安装 arktsup 包）。json2ts 仅支持安装了 arktsup 的工程');
    return;
  }
  const res = await runCli(localCli, ['json2ts', '--name', name], text);
  const doc = await vscode.workspace.openTextDocument({ language: 'typescript', content: res.stdout });
  await vscode.window.showTextDocument(doc, { preview: false });
}
