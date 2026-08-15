# ArkTSUp for DevEco Studio

在 DevEco Studio 里运行 `arktsup check`（ArkTS 严格语法检查），结果展示在底部工具窗口，双击可跳转到问题行。

## 前提

- DevEco Studio 3.1+（IntelliJ Platform 2023.x）
- Node.js 18+（运行 CLI）
- `npm i -g arktsup`（或工程内安装）

## 构建

```bash
gradle buildPlugin    # 产出 build/distributions/arktsup-deveco-0.1.0.zip
```

## 安装

DevEco Studio → Settings → Plugins → ⚙️ → Install Plugin from Disk → 选择 zip → 重启 IDE。
菜单 Tools → ArkTSUp: 检查工程。

## 配置

Settings → Tools → ArkTSUp：`cliPath` 可指定 arktsup CLI 绝对路径（默认自动查找）。

> 说明：本目录为原型骨架，由 arktsup 主仓库维护（docs/DEVECO-PLUGIN.md 有架构与构建说明）。
