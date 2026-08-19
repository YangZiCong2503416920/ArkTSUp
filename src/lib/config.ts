/**
 * config — .arktsuprc 配置文件支持（D6 扩展：规则级别覆盖 + 声明式自定义规则）。
 *
 * 查找顺序：目标目录下的 .arktsuprc.json / .arktsuprc，再到当前目录（合并，目标目录优先）。
 * 格式示例：
 * {
 *   "ignore": {
 *     "rules": ["propsByIndex"],   // 忽略的规则
 *     "dirs": ["ohosTest"]          // 额外跳过的目录（追加到默认跳过列表）
 *   },
 *   "rules": {
 *     "propsByIndex": "error",      // 内置规则级别覆盖：off | error | warning | info
 *     "noFuncBind": "off"
 *   },
 *   "customRules": [                // 声明式自定义规则（D6，DSL 见 src/lib/custom-rules.ts）
 *     {
 *       "name": "noDebugger",
 *       "message": "禁止 debugger 语句",
 *       "severity": "error",
 *       "selector": "DebuggerStatement",
 *       "fix": "删除 debugger;"
 *     }
 *   ]
 * }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { isBuiltinRuleName } from './arkts-check';
import type { CustomRuleSpec } from './custom-rules';

/** rules 覆盖的取值：off 关闭，其余为报告级别 */
export type RuleSeveritySetting = 'off' | 'error' | 'warning' | 'info';

export interface ArktsUpConfig {
  ignore?: {
    rules?: string[];
    dirs?: string[];
  };
  /** 内置规则（及自定义规则）级别覆盖，按规则名生效 */
  rules?: Record<string, RuleSeveritySetting>;
  /** 声明式自定义规则（AST 选择器 DSL） */
  customRules?: CustomRuleSpec[];
}

const CONFIG_NAMES = ['.arktsuprc.json', '.arktsuprc'];

/** 从目录向上查找配置（targetDir -> cwd），返回合并结果（目标目录优先） */
export function loadConfig(targetDir: string): ArktsUpConfig {
  const merged: ArktsUpConfig = {};
  const visited = new Set<string>();
  const candidates = [targetDir, process.cwd()];
  for (const dir of candidates) {
    const abs = path.resolve(dir);
    if (visited.has(abs)) continue;
    visited.add(abs);
    for (const name of CONFIG_NAMES) {
      const file = path.join(abs, name);
      if (!fs.existsSync(file)) continue;
      try {
        const cfg = JSON.parse(fs.readFileSync(file, 'utf8')) as ArktsUpConfig;
        merged.ignore = merged.ignore ?? {};
        merged.ignore.rules = [...new Set([...(merged.ignore.rules ?? []), ...(cfg.ignore?.rules ?? [])])];
        merged.ignore.dirs = [...new Set([...(merged.ignore.dirs ?? []), ...(cfg.ignore?.dirs ?? [])])];
        // 级别覆盖：先加载的（目标目录）优先
        merged.rules = { ...(cfg.rules ?? {}), ...(merged.rules ?? {}) };
        // 自定义规则：先加载的（目标目录）优先，按名去重
        const list = [...(merged.customRules ?? []), ...(cfg.customRules ?? [])];
        const seen = new Set<string>();
        merged.customRules = list.filter((c) => {
          if (seen.has(c.name)) return false;
          seen.add(c.name);
          return true;
        });
      } catch {
        console.error(`警告: 配置文件 ${file} 解析失败，已忽略（请检查 JSON 语法）`);
      }
    }
  }
  return merged;
}

export function isRuleIgnored(cfg: ArktsUpConfig, rule: string): boolean {
  return cfg.ignore?.rules?.includes(rule) ?? false;
}

/**
 * 校验配置（D6）：rules 级别取值、customRules 字段/命名/与内置规则冲突。
 * 返回全部错误；check 命令遇错即 exit 2，不静默忽略。
 */
export function validateConfig(cfg: ArktsUpConfig): string[] {
  const errors: string[] = [];
  const VALID = new Set<RuleSeveritySetting>(['off', 'error', 'warning', 'info']);
  if (cfg.rules) {
    for (const [name, v] of Object.entries(cfg.rules)) {
      if (!VALID.has(v)) {
        errors.push(`rules.${name}: 级别 ${JSON.stringify(v)} 非法（off | error | warning | info）`);
      }
    }
  }
  if (cfg.customRules) {
    const seen = new Set<string>();
    for (const c of cfg.customRules) {
      if (!c || typeof c.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(c.name)) {
        errors.push(`customRules: 规则名非法（${JSON.stringify(c?.name)}，需以字母/下划线开头，仅含字母数字 _ -）`);
        continue;
      }
      if (seen.has(c.name)) {
        errors.push(`customRules: 规则名重复 "${c.name}"`);
        continue;
      }
      seen.add(c.name);
      if (isBuiltinRuleName(c.name)) {
        errors.push(`customRules: 规则名 "${c.name}" 与内置规则冲突（自定义规则不能覆盖内置规则名）`);
      }
      if (typeof c.message !== 'string' || !c.message) errors.push(`customRules.${c.name}: 缺少 message`);
      if (typeof c.selector !== 'string' || !c.selector) errors.push(`customRules.${c.name}: 缺少 selector`);
      if (c.severity !== undefined && !(c.severity === 'error' || c.severity === 'warning' || c.severity === 'info')) {
        errors.push(`customRules.${c.name}: severity 非法（error | warning | info）`);
      }
    }
  }
  return errors;
}
