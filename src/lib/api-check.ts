/**
 * API 版本兼容检查（D1，对标 oxc-ark system-api-version / 华为 apiCompatibilityCheck）。
 * 检查工程 import 的 @ohos.* 模块是否在工程最低 API 版本可用。
 * 模块引入版本表 API_VERSIONS 来自 OpenHarmony 官方 SDK 类型定义（interface_sdk-js 的 @since）。
 */
import * as ts from 'typescript';
import { API_VERSIONS } from './api-versions';
import { Finding, Severity } from './arkts-check';

/** 从文件文本解析 import 的 @ohos.* 模块并做版本兼容检查 */
export function checkApiVersionInSource(
  file: string,
  sourceText: string,
  minVersion: number,
  minSeverity: Severity = 'warning',
): Finding[] {
  let sf: ts.SourceFile;
  try {
    sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  } catch {
    return [];
  }
  const findings: Finding[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const mod = stmt.moduleSpecifier.text;
    if (!mod.startsWith('@ohos.')) continue;
    const since = API_VERSIONS[mod];
    if (since === undefined) continue; // 未收录模块不报（保守，避免编造数据）
    if (since > minVersion) {
      const pos = sf.getLineAndCharacterOfPosition(stmt.moduleSpecifier.getStart(sf));
      findings.push({
        file,
        line: pos.line + 1,
        column: pos.character + 1,
        severity: 'error',
        rule: 'apiVersion',
        message: '模块 ' + mod + ' 自 API ' + since + ' 才引入，工程最低 API ' + minVersion + ' 不兼容',
        fix: '升级 minAPIVersion 到 ' + since + '+，或改用低版本 API（见官方 API 参考文档）',
        snippet: mod,
      });
    }
  }
  return minSeverity === 'error' ? findings.filter((f) => f.severity === 'error') : findings;
}

/** 从工程目录向上查找 module.json5 / app.json5 的 minAPIVersion（找不到返回 null） */
export function detectMinApiVersion(root: string): number | null {
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  let dir = root;
  for (let i = 0; i < 6; i++) {
    for (const name of ['module.json5', 'app.json5']) {
      const p = path.join(dir, name);
      if (fs.existsSync(p)) {
        try {
          const json5 = require('json5');
          const j = json5.parse(fs.readFileSync(p, 'utf8')) as Record<string, Record<string, unknown>>;
          const v = (j.module?.minAPIVersion ?? j.app?.minAPIVersion) as number | undefined;
          if (typeof v === 'number') return v;
        } catch { /* 解析失败跳过 */ }
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
