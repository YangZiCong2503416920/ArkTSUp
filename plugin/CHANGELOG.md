# Change Log

本文件记录 ArkTSUp for VS Code 插件的版本变更（Marketplace 展示用）。

## 0.2.1 — 2026-08-16

- **正式上架 VS Code Marketplace（首个发布版本）**
- 打包自包含运行时依赖（typescript/json5 随包分发，离线可用）
- 修复 CLI 版本读取：VSIX 布局下 --version 正确显示 0.2.1

## 0.2.0 — 2026-08-16

- **首次上架 VS Code Marketplace**
- 修复打包布局：main 入口 out/extension.js 由 tsc 直接产出，不再携带过期编译产物
- 新增扩展图标与 Marketplace 徽章/横幅
- 功能：保存 .ets 自动检查（防抖 500ms）、检查工程/当前文件、剪贴板 JSON→ArkTS 类型、废弃 @ohos.* → @kit.* 迁移（dry-run + 一键修复）、资源引用检查
