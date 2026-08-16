# 贡献指南（Contributing）

欢迎参与 ArkTSUp。本项目的核心规矩是**反水 PR**：每个改动都要有可核验的证据，否则会被打回。
请先读完本指南再提交，避免返工。

## 1. 开发环境

```bash
npm install && npm run build   # tsc 编译到 dist/
npm test                       # 构建 + 单元测试（node:test，当前 81 个用例）
```

要求 Node.js >= 18。

## 2. 代码结构

```
src/cli.ts                  # CLI 入口与参数解析
src/commands/*.ts           # 各命令（check/json2ts/template/resource/migrate）
src/lib/arkts-check.ts      # check 规则引擎（65 条规则，AST 遍历）
src/lib/*.ts                # 各命令核心逻辑
test/*.test.ts              # node:test 单测（新增规则必须带反例测试）
examples/bad.ets            # check 回归基准（注释声明违规 → 检出必须一致）
docs/RULES.md               # 规则溯源表（无出处的规则不允许存在）
```

## 3. 新增/修改 check 规则的门禁（必须全部满足）

1. **先补出处**：在 docs/RULES.md 添加该规则的官方依据（华为迁移指南章节号或 ets2panda recipe 编号），
   **没有出处的规则不合并**——这是第一道防线。
2. **实现 + 反例测试**：在 test/arkts-check.test.ts 加反例（模式取自官方指南原文），`npm test` 全绿。
3. **官方示例回归**：在官方 samples（3327 个 .ets）上重跑 `arktsup check`，
   错误级误报目标 < 0.1%（目前基线 1/3327）。回归方法见 docs/QUALITY-REPORT.md §3 与 scripts/（见下方 P1-6 回归脚本）。
4. **examples/bad.ets 自检**：若规则涉及 bad.ets 中的违规行，确认注释声明与检出一致（可用回归脚本核对）。
5. **真实工程抽查**（新增规则时强烈建议）：在 1~2 个社区鸿蒙工程上验证，确认无误报。

## 4. 修改非 check 功能（json2ts/migrate/resource/template）

- 必须带对应单测（见 test/ 下对应文件）；
- 若修改 json2ts 输出，用 examples/sample.json 人工核验输出无误；
- migrate 修改需核对 src/lib/deprecations.ts 的 doc 字段（官方文档出处）。

## 5. 提交规范

提交信息用中文、conventional 前缀，参考现有历史：

```
feat(check): 规则 61 -> 65（decl/enum merging、uniqueNames、ESObject）
fix(check): noMethodReassignment 降级 warning（真实工程抓出的误报）
docs: 真实工程验证基线达成 5 个社区工程
chore(plugin): bump to 0.5.0（与 CLI 整版对齐）
```

## 6. 发布流程

- **npm 包**：改版本号 → 打 `v*` tag → GitHub Actions 自动发布（Trusted Publishing，见 docs/RELEASE.md §1）
- **VS Code 插件**：见 docs/RELEASE.md §2（网页上传无需 PAT；CI 发布需配置 Entra ID 或 VSCE_PAT）

## 7. 常见问题

- **改规则后 CI 红**：先跑 `npm test`；再对照 docs/RULES.md 检查出处；最后在官方 samples 上回归。
- **不确定某写法是否违规**：查官方迁移指南原文（链接见 docs/RULES.md §权威来源），不要凭记忆。