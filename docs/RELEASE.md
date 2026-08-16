# 发布流程（Release Guide）

本文档记录 arktsup 的发布流程，覆盖 **npm 包** 与 **VS Code 插件** 两种产物。

## 1. npm 包发布

### 1.1 前置（只需做一次）

- npm 账号：https://www.npmjs.com/settings/yanceecha/ 已启用 2FA（写操作要求）
- 包名 `arktsup` 已被本账号持有

### 1.2 自动发布（推荐：Trusted Publishing）

npm 官方推荐的自动化方式，**无需令牌、无需验证码**：

1. **npm 侧配置（一次性）**：npmjs.com → 包 `arktsup` → Manage Access → Add trusted publisher
   - GitHub 仓库：`YangZiCong2503416920/ArkTSUp`
   - Workflow 名称：`publish.yml`
2. **每次发版**（两条命令）：
   ```bash
   # 1) 改版本号（必须与 package.json 一致）
   npm version patch    # 或 minor / major，自动 bump 并打 v* tag
   git push origin main --tags
   ```
3. GitHub Actions 自动：跑测试 → `npm publish --provenance`（带来源证明，透明度日志可查）

> 若版本已存在于 registry（如手动发过），workflow 会自动跳过发布，保持 CI 绿。

### 1.3 手动发布（备用）

仅当 Trusted Publishing 未配置时使用，需要带 Bypass-2FA 的 Granular Token：

```bash
# 准备: npmjs.com -> Access Tokens -> Granular Access Token
#   - Package access: All packages
#   - Permissions: Read and write
#   - 勾选 Bypass 2FA
#   - 生成后写入 /tmp/publish.npmrc（注意：~/.npmrc 里 login 的旧令牌优先级更高，必须用独立文件）
npm publish --userconfig /tmp/publish.npmrc
```

### 1.4 回滚/弃用

- **弃用（推荐）**：`npm deprecate arktsup@<坏版本> "原因"`
- **删除**：bypass-2FA 令牌**禁止删除**操作（npm 安全策略），需在 npmjs 网页或普通令牌+OTP 下执行

## 2. VS Code 插件（Marketplace 上架）

插件目录 `plugin/`（name: `arktsup-vscode`，publisher: `yanceecha`）。构建产物自包含：编译后的入口 `out/extension.js` + 复制的 arktsup CLI `lib/`，全部打进 .vsix。

### 2.1 本地构建与校验

```bash
cd plugin
npm install
npm run build        # 清理 out/ -> tsc 编译(src -> out/) -> 复制 arktsup lib 到 plugin/lib
npm run package      # vsce 打包校验 -> 产出 plugin/arktsup-vscode.vsix
npx @vscode/vsce ls  # 查看 .vsix 内容（应只有 package.json/icon/README/LICENSE/CHANGELOG/out/lib）
```

> 注意：`plugin/tsconfig.json` 的 `rootDir: src`、`outDir: out`，确保 `main` 指向的
> `out/extension.js` 由 tsc 直接产出；`npm run build` 会先清理 out/，避免过期产物进包。

### 2.2 上架前置（只需做一次，需要你的微软账号）

1. **创建发布者**：https://marketplace.visualstudio.com/manage → 用微软账号登录 → 创建发布者，名称必须与 `plugin/package.json` 的 `publisher` 一致：`yanceecha`
2. **生成 PAT**：https://marketplace.visualstudio.com/manage/publishers/yanceecha/pat
   - Organization: All accessible organizations
   - Scopes: **Marketplace → Manage**
   - 复制生成的 PAT（仅显示一次）
3. **把 PAT 写入 GitHub Secrets**：仓库 Settings → Secrets and variables → Actions → New repository secret，名称 **`VSCE_PAT`**，值粘贴 PAT

### 2.3 自动发布（推荐）

每次发版打 tag 即自动上架（workflow: `.github/workflows/publish-vscode.yml`）：

```bash
# 1) 改插件版本号（必须与 plugin/package.json 一致）
cd plugin && npm version patch   # 或 minor / major
git add plugin/package.json plugin/package-lock.json && git commit -m "chore(plugin): bump v0.2.x"
# 2) 打 vscode-v* 标签并推送
git tag vscode-v0.2.1 && git push origin main --tags
```

GitHub Actions 自动：构建根 CLI → 编译插件 → `vsce publish --skip-duplicate`。
已发布的版本会自动跳过，CI 保持绿。

### 2.4 手动发布（备用，本地有 PAT 时）

```bash
cd plugin
export VSCE_PAT=<你的 PAT>        # 或先 vsce login yanceecha
npx --yes @vscode/vsce publish --skip-duplicate
```

### 2.5 本地安装（不上架时）

VS Code 扩展面板 → ⋯ → 从 VSIX 安装 → 选择 `plugin/arktsup-vscode.vsix`。

### 2.6 回滚/下架

- 下架某版本：Marketplace 管理页 → 对应版本 → Unpublish
- 下线整个扩展：Marketplace 管理页 → 扩展 → ⋯ → Remove

## 3. 版本历史

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| 0.1.0 | 2026-08-15 | 首个 npm 发布（**已弃用**：缺少 typescript 运行时依赖） |
| 0.1.1 | 2026-08-15 | 修复 typescript 依赖，latest |
| v0.1.1 (tag) | 2026-08-15 | GitHub 对应 tag |
| 0.1.2 | 2026-08-15 | 验证 Trusted Publishing 自动发布（README 增加 npm 徽章） |
| 0.1.3 | 2026-08-15 | 修复 --version 从 package.json 读取 |
| 0.1.4 | 2026-08-15 | json2ts 支持 JSON5、check --fix var→let、template dialog |
| 0.1.5 | 2026-08-15 | check --fix 增加 angleCast、resource check --i18n 多语言键覆盖 |
| 0.1.6 | 2026-08-15 | check 规则扩至 61 条、.arktsuprc 配置、migrate 103 模块、避坑清单 |
| 0.1.7 | 2026-08-15 | check 规则扩至 65 条（decl/enum merging、uniqueNames、ESObject） |
