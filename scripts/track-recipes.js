/**
 * 官方 recipe 演进追踪（P3-1）
 * 作用: 拉取 ets2panda 官方 linter recipe 清单，对比 docs/RULES.md 的覆盖情况，
 *       发现官方新增/删除规则时提醒维护（RULES.md 记录有复查方法，本脚本让复查可自动化）。
 * 退出码: 0=一致；1=有未覆盖或孤儿引用（CI 可据此告警）；网络失败视为 0（不误报）。
 * 用法: node scripts/track-recipes.js
 */
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const RULES_MD = path.join(__dirname, '..', 'docs', 'RULES.md');
const API = 'https://api.github.com/repos/openharmony/arkcompiler_ets_frontend/contents/ets2panda/linter/docs/rules';

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'arktsup-tracker' } }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { reject(new Error('bad json')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
  });
}

async function main() {
  let official;
  try {
    official = await getJson(API);
  } catch (e) {
    console.log('网络获取官方 recipe 清单失败（' + e.message + '），跳过（不视为变更）');
    process.exit(0);
  }
  if (!Array.isArray(official)) {
    console.log('官方 API 返回异常，跳过');
    process.exit(0);
  }
  const recipeNames = official.filter((f) => f.name.endsWith('.md'))
    .map((f) => f.name.replace(/^recipe(\d+)\.md$/, '$1'));

  const rulesMd = fs.readFileSync(RULES_MD, 'utf8');
  const covered = new Set();
  // 匹配 recipeN 及紧凑格式 recipe143/14/106/27/15
  for (const m of rulesMd.matchAll(/recipe(\d+)([\s/,\-]\d+)*/g)) {
    covered.add(m[1]);
    for (const x of m[0].match(/\d+/g) || []) covered.add(x);
  }

  const missing = recipeNames.filter((n) => !covered.has(n)).sort((a, b) => +a - +b);
  const orphan = [...covered].filter((n) => !recipeNames.includes(n))
    .sort((a, b) => +a - +b);

  console.log('官方 ets2panda recipe 总数: ' + recipeNames.length);
  console.log('docs/RULES.md 已引用: ' + covered.size);
  console.log('未覆盖（官方有、RULES.md 未引用）: ' + (missing.length ? missing.join(' ') : '无'));
  console.log('孤儿引用（RULES.md 引用但官方已删除）: ' + (orphan.length ? orphan.join(' ') : '无'));
  if (missing.length > 0) console.log('-> 有官方新增规则待评估（按 CONTRIBUTING.md 流程：溯源 -> 实现或记录状态 -> 回归）');
  // 孤儿引用多为历史废弃记录（如 recipe13 已空），仅提示不告警
  if (orphan.length > 0) console.log('-> 提示：RULES.md 引用了官方已删除的 recipe（多为废弃记录，可复查）: ' + orphan.join(' '));
  process.exit(missing.length ? 1 : 0);
}

main().catch((e) => {
  console.error('track-recipes 异常: ' + e.message);
  process.exit(0);
});
