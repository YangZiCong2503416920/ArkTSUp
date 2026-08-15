# CI 集成指南（30 秒接入质量门禁）

arktsup 是 npm 包，任何 CI 都可以用 `npx arktsup` 直接调用，**不需要安装任何插件**。

## GitHub Actions（推荐）

把下面这段加到你的 workflow（如 `.github/workflows/ci.yml`）：

```yaml
  - name: ArkTS 语法检查
    run: npx --yes arktsup check src/main/ets --min-severity error
```

有 error 时命令退出码为 1，CI 自动失败——坏代码进不了 main。

## 完整示例（可直接复制）

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - name: ArkTS 严格语法检查（禁止 any/解构/无类型字面量等）
        run: npx --yes arktsup check src/main/ets --min-severity error
      - name: 资源引用检查（可选）
        run: npx --yes arktsup resource check src/main/resources --min-severity error
```

> 也提供了可直接复用的示例文件：`.github/workflows/arktsup-check.example.yml`

## 其他 CI

```bash
# GitLab CI / Jenkins / 任意 shell
npx --yes arktsup check src/main/ets --min-severity error

# 本地 pre-commit（可选）
# .git/hooks/pre-commit
#   npx --yes arktsup check src/main/ets --min-severity error || exit 1
```

## 检查项说明

- `check`：27 条 ArkTS 限制规则（any/unknown、对象字面量、解构、for..in、var、catch 类型等），全部对照官方文档
- `migrate --dry-run`：API 升级时检查遗留的 @ohos.* 导入
- `resource check`：资源引用缺失/冗余检查
