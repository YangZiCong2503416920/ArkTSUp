# ArkTSUp for VS Code

[![Marketplace version](https://img.shields.io/visual-studio-marketplace/v/yanceecha.arktsup-vscode)](https://marketplace.visualstudio.com/items?itemName=yanceecha.arktsup-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/yanceecha.arktsup-vscode)](https://marketplace.visualstudio.com/items?itemName=yanceecha.arktsup-vscode)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/yanceecha.arktsup-vscode)](https://marketplace.visualstudio.com/items?itemName=yanceecha.arktsup-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/yanceecha.arktsup-vscode)](https://marketplace.visualstudio.com/items?itemName=yanceecha.arktsup-vscode)
[![CI](https://github.com/YangZiCong2503416920/ArkTSUp/actions/workflows/ci.yml/badge.svg)](https://github.com/YangZiCong2503416920/ArkTSUp/actions)

[ArkTSUp](https://github.com/YangZiCong2503416920/ArkTSUp) 的 VS Code 插件：在编辑器里直接做 ArkTS 严格语法检查与 JSON→类型生成。

> **English**: The VS Code extension of [ArkTSUp](https://github.com/YangZiCong2503416920/ArkTSUp) — run ArkTS strict-syntax checks and generate ArkTS types from JSON right inside the editor, powered by the `arktsup` CLI.
>
> Features: auto-check `.ets` files on save (500 ms debounce) with live Problems-panel diagnostics · check the whole workspace or the active file · generate ArkTS interfaces from clipboard JSON · migrate deprecated `@ohos.*` imports to `@kit.*` (dry-run report + one-click fix) · verify `$r` resource references.

## 功能

- **保存自动检查** — 保存 .ets 文件自动运行检查（防抖 500ms），问题实时显示在 Problems 面板
- **ArkTSUp: 检查工程** — 对当前工作区运行 `arktsup check`
- **ArkTSUp: 检查当前文件** — 只检查当前打开的 .ets
- **ArkTSUp: 从剪贴板 JSON 生成 ArkTS 类型** — 复制接口 JSON 到剪贴板，生成类型文档
- **ArkTSUp: 迁移废弃 API** — 扫描 @ohos.* 废弃导入（dry-run 报告，可一键应用修复）
- **ArkTSUp: 检查资源引用** — 缺失资源(error)与未使用资源(warning)诊断

## 使用

1. 在工程中安装 arktsup：`npm i -D arktsup`（或构建本仓库后 `npm run build`）
2. 打开命令面板（Ctrl+Shift+P）执行 ArkTSUp 命令

## 配置

| 设置 | 说明 |
| --- | --- |
| `arktsup.cliPath` | arktsup CLI 绝对路径（默认自动查找） |
| `arktsup.checkOnSave` | 保存 .ets 时自动检查（默认 true） |

## 开发

```bash
cd plugin
npm install
npm run build      # 编译 + 复制 arktsup lib
npm run package    # 产出 .vsix
```

## Marketplace 上架

**无需 PAT**：在 https://marketplace.visualstudio.com/manage 用微软账号登录并创建发布者 **yanceecha**，
然后 `npm run package` 产出的 `arktsup-vscode.vsix` 直接在管理页 **New Extension 上传**即可。
详见 [docs/RELEASE.md](https://github.com/YangZiCong2503416920/ArkTSUp/blob/main/docs/RELEASE.md#2-vs-code-插件marketplace-上架)。

- **网页上传（推荐，无需任何令牌）**：

  ```bash
  cd plugin
  npm run package   # 产出 plugin/arktsup-vscode.vsix
  ```

  打开 https://marketplace.visualstudio.com/manage → 登录发布者 → New Extension → 上传该 .vsix。

- **CI 自动发布（可选）**：配置发布凭据后，打 `vscode-v*` 标签即触发 [publish-vscode.yml](https://github.com/YangZiCong2503416920/ArkTSUp/blob/main/.github/workflows/publish-vscode.yml)：

  ```bash
  cd plugin && npm version patch
  git tag vscode-v0.5.0 && git push origin main --tags
  ```

  凭据二选一：Entra ID 托管身份（官方长期方案，`vsce publish --azure-credential`，无需 PAT）或
  Secret `VSCE_PAT`（PAT 已于 2026-12-01 被 Azure DevOps 停用）。

> .vscodeignore 已配置，发布包只含入口与 arktsup lib（含 typescript/json5 运行时依赖），不含源码/测试。
> 徽章（版本/下载/评分）会在首次发布后自动点亮。

## 使用示例

打开命令面板：**Ctrl+Shift+P**（macOS: Cmd+Shift+P），输入以下任一命令：

| 命令 | 输入 | 效果 |
| --- | --- | --- |
| 检查工程 | `ArkTSUp: 检查工程` | 扫描工作区，问题进 Problems 面板 |
| 检查当前文件 | `ArkTSUp: 检查当前文件` | 只扫当前 .ets |
| 生成类型 | `ArkTSUp: 从剪贴板 JSON 生成 ArkTS 类型` | 复制接口 JSON → 输入类型名 → 新文档生成 |
| 迁移 API | `ArkTSUp: 迁移废弃 API` | 报告 @ohos.* 数量 → 一键应用修复 |
| 查资源 | `ArkTSUp: 检查资源引用` | 缺失/未用资源诊断 |

**保存自动检查**：打开任意 .ets 保存，500ms 后自动出诊断（可 `arktsup.checkOnSave` 关闭）。

## 常见问题

- **找不到 arktsup CLI**：设置 `arktsup.cliPath` 指向 cli.js；或在工程里 `npm i -D arktsup`（推荐，插件会自动发现）
- **检查结果没刷新**：确认保存的是 .ets 文件；检查 Problems 面板右下角过滤
- **json2ts 不可用**：该命令需要工程内安装 arktsup 包

## 界面截图

> 待补充：装好插件后在鸿蒙工程上执行检查，把截图放到本目录（`docs/screenshots/*.png`）并在此插入。
> 可参考输出样式：
> - Problems 面板：`[noAny] ArkTS 禁止使用 any 类型 ...`（可点击跳转到对应行）
> - 状态栏/通知：`ArkTSUp 检查完成: 2 错误，1 警告`
