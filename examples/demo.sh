#!/usr/bin/env bash
# ArkTSUp 一键体验脚本 —— 跑一遍 5 个工具，看完就懂它是干什么的
# 用法: bash examples/demo.sh   （在项目根目录执行）
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$ROOT/dist/src/cli.js"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==============================================================="
echo " 工具1: json2ts —— 后端接口 JSON 自动生成 ArkTS 类型"
echo " 痛点: 接口返回的 JSON 手写成 interface 又慢又容易错"
echo "==============================================================="
echo '{"id":1,"name":"Alice","tags":["vip","dev"],"profile":{"age":18}}' | node "$CLI" json2ts --name User

echo
echo "==============================================================="
echo " 工具2: check —— 扫描 .ets 代码里的 ArkTS 不兼容写法"
echo " 痛点: 很多 TypeScript 习惯写法(any/对象字面量/解构)在鸿蒙里编译不过"
echo "==============================================================="
cat > "$TMP/bad.ets" <<'EOF'
let x: any = 1;
let obj = { a: 1 };
const { a } = obj;
EOF
node "$CLI" check "$TMP/bad.ets"

echo
echo "==============================================================="
echo " 工具3: template —— 一条命令生成页面/组件样板代码"
echo " 痛点: 每个页面都要手敲 @Entry/@Component/@State，容易敲错"
echo "==============================================================="
node "$CLI" template page MyFirstPage --dir "$TMP" > /dev/null 2>&1
cat "$TMP/MyFirstPage.ets"

echo
echo "==============================================================="
echo " 工具4: resource —— 查代码引用的资源是否存在(防运行时空资源)"
echo " 痛点: $r('app.string.xxx') 引用不存在的资源，运行时报错"
echo "==============================================================="
mkdir -p "$TMP/res/resources/base/element" "$TMP/res/entry/src/main/ets"
cat > "$TMP/res/resources/base/element/string.json" <<'EOF'
{"string":[{"name":"hello","value":"你好"}]}
EOF
cat > "$TMP/res/entry/src/main/ets/Index.ets" <<'EOF'
@State m: string = $r('app.string.hello');
@State bad: string = $r('app.string.not_exist');
EOF
node "$CLI" resource check "$TMP/res" 2>&1 | grep -E 'error|warning|扫描'

echo
echo "==============================================================="
echo " 工具5: migrate —— 废弃 API(@ohos.*)自动迁移到 @kit.*"
echo " 痛点: 鸿蒙 API 升级时，手动改一堆 import 和调用"
echo "==============================================================="
echo "--- 修复前 ---"
echo "import prompt from '@ohos.prompt';"
echo "prompt.showToast({ message: 'hi' });"
cat > "$TMP/mig.ets" <<'EOF'
import prompt from '@ohos.prompt';
prompt.showToast({ message: 'hi' });
EOF
node "$CLI" migrate "$TMP/mig.ets" > /dev/null 2>&1
echo "--- migrate 自动修复后 ---"
cat "$TMP/mig.ets"

echo
echo "==============================================================="
echo " 5 个工具看完啦。想深入了解某个工具: node dist/src/cli.js <工具名> --help"
echo "==============================================================="
