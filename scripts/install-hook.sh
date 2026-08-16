#!/usr/bin/env bash
# ArkTSUp pre-commit hook 一键安装
# 作用: git commit 前自动跑 arktsup check，有 error 就拒绝提交（坏代码进不了仓库）
# 用法: bash scripts/install-hook.sh [要检查的目录，默认 src/main/ets]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-src/main/ets}"
HOOK="$ROOT/.git/hooks/pre-commit"

cat > "$HOOK" <<EOF
#!/usr/bin/env bash
# ArkTSUp pre-commit: 提交前 ArkTS 严格语法检查（安装脚本生成）
# 跳过检查: git commit --no-verify
cd "$(git rev-parse --show-toplevel)" || exit 1
if ! command -v npx >/dev/null 2>&1; then
  echo '[ArkTSUp] 未找到 npx，跳过检查'
  exit 0
fi
if [ ! -d "$TARGET" ]; then
  echo "[ArkTSUp] 目录 $TARGET 不存在，跳过检查（可用 bash scripts/install-hook.sh <dir> 重新指定）"
  exit 0
fi
echo '[ArkTSUp] 检查 $TARGET ...'
npx --yes arktsup check "$TARGET" --min-severity error || {
  echo '[ArkTSUp] 发现 ArkTS 错误，提交已阻止。修复后重试，或 git commit --no-verify 强制跳过。'
  exit 1
}
EOF
chmod +x "$HOOK"
echo "pre-commit hook 已安装: $HOOK"
echo "检查目录: $TARGET（提交前自动运行 npx arktsup check --min-severity error）"
