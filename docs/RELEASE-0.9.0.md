# ArkTSUp v0.9.0

从 v0.1.7 到 v0.9.0 的积累：检查规则 65 → **77 条**，并补上语义级分析与工程级报告能力。

## 新增能力

- **`check --report`** — 输出 HTML / JSON 工程迁移报告（含 `--fix` 修复统计），可直接交给团队或客户看升级进度；竞品目前没有这个形态。
- **语义分析（TypeChecker）** — `propsByIndex` 从语法层升级为类型感知：`Record` / 数组豁免，自定义 interface 精确判定；支持跨文件 `import` 的类型（影子 `.ts` 方案）；识别用户自定义 `Omit` / `Pick` 等工具类型，内置同名类型仍按官方语义报错。
- **`check --api-version`** — 内建 527 个 `@ohos` 模块的最低版本表（数据源 `interface_sdk-js`），升级 HarmonyOS NEXT 之前就能知道哪个 API 会挂。
- **增量缓存** — `.arktsup-cache.json`，大工程二次扫描接近秒出。
- **`.arktsuprc`** — 声明式规则自定义：按级别覆盖内置规则；`customRules` 提供 AST 选择器 DSL，可自行扩展规则。
- **`--fix` 扩展** — 解构拆分、索引写法转点号、`catch` 去类型标注；另增 `--watch` / `--staged` / `--format markdown` / `gen-comments` / `preview`。
- **fuzz 测试** — 修复 TypeScript 解析器在畸形输入下的崩溃。

## 数字

- 规则 **77 条**，逐条溯源到官方文档与官方样本（见 [RULES.md](RULES.md)、[ARKTS-PITFALLS.md](ARKTS-PITFALLS.md)）
- 测试：130+ 用例，含 fuzz、回归脚本与真实工程基线（9 个开源鸿蒙工程）
- 随附 DevEco Studio 插件（0.2.1）与 VS Code 扩展
- 竞品对比与 1.0.0 路线：[COMPETITOR-ANALYSIS.md](COMPETITOR-ANALYSIS.md)

## 安装

```bash
npm install -g arktsup
arktsup check src/main/ets              # 扫描
arktsup check src/main/ets --fix        # 自动修复可修的项
arktsup check src/main/ets --report out/report.html
```

> **关于 npm**：registry 上的 `arktsup` 目前仍停在 `0.1.7`，本 tag 的源码与能力已在 GitHub 上。下一版会同步发布到 npm。

## 升级提示

- `propsByIndex` 由语法层改为类型感知后，`Record` / 数组的误报不再出现；如果你之前用 `// arktsup-disable` 压过这类告警，可以移除。
- `.review-tmp/` 与 `*.tgz` 已不再入库，本地调试目录不会污染 diff。

**Full Changelog**: https://github.com/YangZiCong2503416920/ArkTSUp/compare/v0.1.7...v0.9.0
