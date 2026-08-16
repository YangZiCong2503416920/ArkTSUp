#!/usr/bin/env bash
# 官方 samples 误报回归脚本（P1-6）
# 用法:
#   1) 首次准备样本（sparse 只取 .ets，仓库大时耐心等）:
#      ./scripts/regress-samples.sh prepare /path/to/samples
#   2) 跑回归:
#      ./scripts/regress-samples.sh run /path/to/samples [--min-severity error]
# 判定: 错误级误报目标 < 0.1%（当前基线 1/3327，为 NDK 互操作边界案例）
set -euo pipefail

SAMPLES_DIR=${2:-/tmp/app_samples}
CMD=${1:-run}
ARGS=${3:---min-severity error}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

case "$CMD" in
  prepare)
    rm -rf "$SAMPLES_DIR"
    git clone --depth 1 --filter=blob:none --sparse https://github.com/openharmony/applications_app_samples.git "$SAMPLES_DIR"
    (cd "$SAMPLES_DIR" && git sparse-checkout set --no-cone '*.ets')
    echo "样本就绪: $(find "$SAMPLES_DIR" -name '*.ets' | wc -l) 个 .ets"
    ;;
  run)
    [ -d "$SAMPLES_DIR" ] || { echo "请先运行 prepare"; exit 1; }
    cd "$ROOT"
    npm run build >/dev/null
    FILES=$(find "$SAMPLES_DIR" -name '*.ets' | wc -l)
    echo "扫描 $FILES 个官方示例 .ets ...（默认剔除 test/ohosTest 测试模板）"
    # --exclude test,ohosTest：官方测试模板(Ability.test.ets)用旧写法(any/function)，非迁移目标
    # 剔除后才是纯示例基线；如需含测试模板可传空 exclude，如: run <dir> --exclude '' --min-severity error
    node dist/src/cli.js check "$SAMPLES_DIR" --exclude test,ohosTest $ARGS --format json > /tmp/samples-report.json || true
    node -e "
      const j = require('/tmp/samples-report.json');
      const byRule = {};
      for (const f of j.findings) byRule[f.rule] = (byRule[f.rule] || 0) + 1;
      console.log('filesScanned:', j.filesScanned);
      console.log('errors:', j.errors, '| warnings:', j.warnings, '| infos:', j.infos);
      console.log('byRule:', JSON.stringify(byRule));
      const rate = (j.errors / j.filesScanned * 100).toFixed(3) + '%';
      console.log('错误级误报率: ' + rate + '（目标 < 0.1%）');
    "
    ;;
  *)
    echo "用法: $0 {prepare|run} [samples-dir] [check-args]"; exit 1;;
esac
