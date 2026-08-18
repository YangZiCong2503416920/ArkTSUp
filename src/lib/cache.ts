/**
 * 增量缓存（D4）：check 目录模式的报告缓存。
 * 原理：记录每个 .ets 的 mtime+size 指纹与完整检查结果；
 * 全部文件未变时直接复用缓存（跳过语法扫描与 TypeChecker 语义分析，秒出），
 * 任一文件变更则全量重跑并更新缓存。
 * 竞品空白：oxc-ark 快但无缓存语义；缓存让 ArkTSUp 在重复检查场景（CI/开发循环）追上性能。
 */
import * as fs from 'node:fs';
import { Finding } from './arkts-check';

export const CACHE_VERSION = 1;
export const CACHE_FILE = '.arktsup-cache.json';

export interface CheckCache {
  version: number;
  toolVersion: string;
  /** 文件路径 -> 指纹（mtime + size） */
  files: Record<string, { mtime: number; size: number }>;
  /** 完整检查结果（语法 + 语义后） */
  findings: Finding[];
}

export function fingerprintOf(p: string): { mtime: number; size: number } | null {
  try {
    const s = fs.statSync(p);
    return { mtime: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

export function loadCache(cacheFile: string, toolVersion: string): CheckCache | null {
  try {
    const j = JSON.parse(fs.readFileSync(cacheFile, 'utf8')) as CheckCache;
    if (j.version !== CACHE_VERSION || j.toolVersion !== toolVersion) return null;
    if (!j.files || !Array.isArray(j.findings)) return null;
    return j;
  } catch {
    return null;
  }
}

export function saveCache(cacheFile: string, cache: CheckCache): void {
  try {
    fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
  } catch { /* 缓存写失败不影响检查 */ }
}

/** 缓存是否对当前文件集合仍然有效（全部文件指纹一致） */
export function isCacheFresh(cache: CheckCache, files: string[]): boolean {
  if (files.length === 0) return false;
  if (Object.keys(cache.files).length !== files.length) return false;
  for (const f of files) {
    const cached = cache.files[f];
    if (!cached) return false;
    const cur = fingerprintOf(f);
    if (!cur || cur.mtime !== cached.mtime || cur.size !== cached.size) return false;
  }
  return true;
}

export function buildFingerprints(files: string[]): Record<string, { mtime: number; size: number }> {
  const out: Record<string, { mtime: number; size: number }> = {};
  for (const f of files) {
    const fp = fingerprintOf(f);
    if (fp) out[f] = fp;
  }
  return out;
}

export function countFindings(findings: Finding[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: findings.filter((f) => f.severity === 'error').length,
    warnings: findings.filter((f) => f.severity === 'warning').length,
    infos: findings.filter((f) => f.severity === 'info').length,
  };
}

export type { Finding };
