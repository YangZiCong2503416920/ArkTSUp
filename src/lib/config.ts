/**
 * config — .arktsuprc 配置文件支持。
 *
 * 查找顺序：目标目录下的 .arktsuprc.json / .arktsuprc，再到当前目录。
 * 格式示例：
 * {
 *   "ignore": {
 *     "rules": ["propsByIndex"],   // 忽略的规则
 *     "dirs": ["ohosTest"]          // 额外跳过的目录（追加到默认跳过列表）
 *   }
 * }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ArktsUpConfig {
  ignore?: {
    rules?: string[];
    dirs?: string[];
  };
}

const CONFIG_NAMES = ['.arktsuprc.json', '.arktsuprc'];

/** 从目录向上查找配置（targetDir -> cwd），返回合并结果 */
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
      } catch {
        // 配置损坏时忽略，保持工具可用
      }
    }
  }
  return merged;
}

export function isRuleIgnored(cfg: ArktsUpConfig, rule: string): boolean {
  return cfg.ignore?.rules?.includes(rule) ?? false;
}
