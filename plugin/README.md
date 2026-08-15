# ArkTSUp for VS Code

[ArkTSUp](https://github.com/YangZiCong2503416920/ArkTSUp) 的 VS Code 插件：在编辑器里直接做 ArkTS 严格语法检查与 JSON→类型生成。

## 功能

- **ArkTSUp: 检查工程** — 对当前工作区运行 `arktsup check`，问题显示在 Problems 面板（支持跳转）
- **ArkTSUp: 检查当前文件** — 只检查当前打开的 .ets
- **ArkTSUp: 从剪贴板 JSON 生成 ArkTS 类型** — 复制接口 JSON 到剪贴板，生成类型文档

## 使用

1. 在工程中安装 arktsup：`npm i -D arktsup`（或构建本仓库后 `npm run build`）
2. 打开命令面板（Ctrl+Shift+P）执行 ArkTSUp 命令

## 配置

| 设置 | 说明 |
| --- | --- |
| `arktsup.cliPath` | arktsup CLI 绝对路径（默认自动查找） |

## 开发

```bash
cd plugin
npm install
npm run build      # 编译 + 复制 arktsup lib
npm run package    # 产出 .vsix
```
