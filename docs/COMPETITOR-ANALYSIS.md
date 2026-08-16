# ArkTS 开发工具竞品对比与 ArkTSUp 1.0.0 差异化路线

> 调研日期：2026-08-16 · 目的：为 v1.0.0 落地前确定差异化功能（避免水 PR——每个功能需有竞品空白依据 + 测试 + 回归证据）

## 1. 竞品地图

| 竞品 | 类型 | 规则引擎 | 自动修复 | 迁移工具 | API 版本检查 | 生态/分发 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **CodeLinter**（华为官方） | DevEco Studio 内置 + 命令行 | 内置规则集（可配置） | 有限 | 无 | ✅ apiCompatibilityCheck | IDE 内置 / 命令行 codelinter | [官方文档](https://developer.huawei.com/consumer/en/doc/harmonyos-guides-V2/hos-code-linter-0000001363071681-V2) |
| **ets2panda**（OpenHarmony 官方） | 编译器内置 linter | 80 recipe（ArkTSUp 规则来源） | 无 | 无 | 无 | 编译器组件，不可独立分发 | [arkcompiler_ets_frontend](https://github.com/openharmony/arkcompiler_ets_frontend) |
| **oxc-ark / oxk**（ohos-rs） | Rust CLI + NAPI | oxlint + arkts 插件规则（需配置启用） | 无 | 无 | ✅ system-api-version | npm @ohos-rs/oxk / cargo | [oxc-ark](https://github.com/ohos-rs/oxc-ark) |
| **ohosvscode/arkTS** | VSCode 插件 | 集成 codelinter（非自研） | 无 | 无 | 无 | VSCode 市场 | [arkTS](https://github.com/ohosvscode/arkTS) |
| **ArkTSUp**（本项目） | npm CLI + CI Action + pre-commit | **77 条（全部官方溯源 + 误报率验证）** | ✅ 多规则（any/var/断言/解构拆分） | ✅ migrate @ohos→@kit | ❌ 缺 | npm + GitHub Action + VS Code 插件 | 本仓库 docs/QUALITY-REPORT.md |

## 2. 逐竞品要点

### CodeLinter（华为官方，最强 IDE 集成）
- 内置规则集 + 可配置（json 规则文件），含 API 兼容性检查（apiCompatibilityCheck）与 @kit 迁移建议
- 命令行 codelinter 可脱离 IDE，但依赖 DevEco 工具链；修复能力有限（多为手动确认）
- 定位：IDE 内实时体验。**弱项：无独立 CLI 一键修复、无工程级迁移、无 CI 友好输出**

### ets2panda（官方编译器 linter）
- 80 个 recipe 是 ArkTS 限制的权威来源（ArkTSUp 规则全部溯源到它）
- 不可独立分发：随编译器运行，仅 IDE 构建链路可见；无 CLI/无修复/无 CI 集成

### oxc-ark / oxk（Rust/OXC 超快 lint）
- 基于 oxlint（Rust），arkts 插件注册 ArkTS 迁移规则；规则需在配置中显式启用
- **system-api-version**：检查 @ohos.*/@kit.* 导入 API 的 minApiVersion 兼容（ArkTSUp 缺失）
- 明确声明类型敏感规则采用保守实现（与 ArkTSUp 当前一致）
- 弱项：规则少、需自建配置、无修复/迁移/资源工具、16★ 生态早期

### ohosvscode/arkTS（VSCode 生态插件）
- 补全/跳转/代码浏览 + 集成 codelinter 检测；861★，VSCode 鸿蒙体验先行者
- 不自研规则引擎；无 CLI

## 3. ArkTSUp 现状优势（已确立）

1. **规则可信度**：77 条全部官方 recipe 溯源 + 4585 官方样本 0 误报 + 9 真实工程基线（竞品均无此证据文化）
2. **自动修复**：any→Object / var→let / 断言改写 / 解构拆分——竞品无
3. **工程工具链**：migrate（@ohos→@kit 一键）/ resource / template / json2ts——竞品无
4. **CI/DevOps 生态**：npm CLI + 可复用 GitHub Action + pre-commit 一键——CodeLinter 需 DevEco 工具链

## 4. 竞品空白 → 1.0.0 差异化功能（按优先级）

| # | 差异化功能 | 竞品依据（空白点） | 1.0.0 前落地版本 |
| --- | --- | --- | --- |
| D1 | **API 版本兼容检查**（check --api-version，结合 migrate 给升级路径） | oxc-ark system-api-version 有但规则少；CodeLinter 仅 IDE 内 | v0.6 |
| D2 | **工程迁移报告**（--fix 后生成 HTML/JSON 迁移前后 diff 报告） | 全部竞品只检查不修、无报告 | v0.6 |
| D3 | **TypeChecker 语义分析**（propsByIndex 豁免 / untypedObjectLiteral 完整上下文 / utilityType 自定义类型） | oxc-ark 明言保守启发式；这是技术壁垒 | v0.7 |
| D4 | **增量扫描/缓存**（大工程只扫变更文件，性能对标 oxc-ark 的 Rust 速度） | oxc-ark 快但无缓存语义；ArkTSUp 用缓存追平体验 | v0.8 |
| D5 | **--fix 全面化**（索引访问转点号 / 对象字面量补类型 / import 清理） | 竞品修复能力为零 | v0.8 |
| D6 | **规则自定义**（.arktsuprc 声明式自定义规则） | 竞品规则集均封闭 | v0.9 |

## 5. 1.0.0 版本路线

- **v0.6.0**：D1 API 版本兼容检查 + D2 工程迁移报告
- **v0.7.0**：D3 TypeChecker 语义分析（三大局限修复）
- **v0.8.0**：D4 增量缓存 + D5 --fix 全面化
- **v0.9.0**：D6 规则自定义 + 生态完善
- **v1.0.0**：稳定性打磨、全量回归、官方文档、正式发布

> 防"水 PR"门禁（延续）：每个功能必须有竞品依据（本报告）+ 单测 + 官方 samples 回归 + 真实工程验证，缺一不可。
