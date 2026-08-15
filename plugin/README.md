# ArkTSUp for VS Code

[ArkTSUp](https://github.com/YangZiCong2503416920/ArkTSUp) 的 VS Code 插件：在编辑器里直接做 ArkTS 严格语法检查与 JSON→类型生成。

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
