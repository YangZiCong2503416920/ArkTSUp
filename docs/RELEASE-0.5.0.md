# ArkTSUp 0.5.0 发布报告

> 日期：2026-08-16 · 状态：**待发布**（版本已 bump 0.5.0，未 push / 未 npm publish）
> 本报告是 0.5.0 整版升级的完整功能与质量记录。

## 1. 核心功能（0.5.0 新增）

| 功能 | 说明 | 验证 |
| --- | --- | --- |
| check --fix 解构拆分 | const { a, b } = obj 自动拆成逐字段声明（对象/数组/重命名/hole；rest/默认值/嵌套/多声明器保守跳过） | 单测覆盖 8 种形态 |
| check --watch | 监听目录（递归）变更，防抖 400ms 自动重查，Ctrl+C 退出 | 实测：新增 .ets 自动触发重查 |
| check --staged | 只检查 git 暂存区 .ets（pre-commit 天然搭配） | 实测 + git init 冒烟 |
| check --format markdown | 输出 Markdown 报告（CI 注释/issue 用） | 实测输出合法表格 |
| json2ts --gen-comments | 字段生成示例值注释（取首个非空样本，截断 40 字符） | id: number // 示例: 1 |
| template preview | 生成 @Preview 预览组件（F5 单独预览） | 实测生成合法 ArkTS |

## 2. 小功能与维护（0.1.7 → 0.5.0 累计）

- check 规则 65 → **77**（12 个 recipe：noJsx/noWith/noInferredGenericParams/noPolymorphicUnops/noClassesAsObj/extendsOnlyClass/implementsOnlyIface/noNsAsObj/noFuncProps/instanceofRefTypes/noImplicitReturnTypes/noExtendSameProp）
- fuzz/属性测试上线：600 次随机+变异，抓出并修复 TS 解析器畸形输入崩溃
- recipe 演进追踪：scripts/track-recipes.js + 每周 CI 自动告警官方新增规则
- 回归脚本 scripts/regress-samples.sh、pre-commit 一键安装 scripts/install-hook.sh
- 修复 6 个误报源：lazy import / JSX 断言 / 类引用 / @Type 实参 / Promise<C> 错误恢复 / misplaced 碎片
- noImplicitReturnTypes 降级 warning（静态达不到 ets2panda 精度，诚实记录）
- 文档：CONTRIBUTING / 英文概述 / 快速上手 / CI 指南同步

## 3. 测试结果（0.5.0 全量）

| 测试项 | 结果 |
| --- | --- |
| 单元测试 + fuzz（node:test） | **98/98 全绿**（+2 解构拆分测试） |
| 官方 samples 回归（applications_app_samples master，剔测试模板） | **4585 文件，12 条新规则 0 误报**（错误级命中 414 处均为官方历史代码真阳性） |
| 真实工程基线 | **9 工程 2869 文件**：新规则 0 误报；老规则命中全部真阳性 |
| bad.ets 回归基准 | 36 命中与注释声明一致 ✓ |
| --fix 解构拆分 | 修复后重扫不再报 objectDestructuring ✓ |
| --watch / --staged / markdown / gen-comments / preview | 全部冒烟通过 ✓ |
| --version | 0.5.0（CLI / VSIX 包内一致）✓ |

## 4. 已知局限（不隐瞒）

- 无类型解析器：propsByIndex 启发式、untypedObjectLiteral 部分上下文漏报、utilityType 自定义类型名
- noGlobalThis 对照 recipe137 保持 error；官方系统应用大量命中属官方代码未过 linter，非工具误报
- recipe30（structural typing）/ recipe147（.ts 依赖 .ets）需完整类型检查器，未实现
- 解构拆分 --fix 为保守子集：rest/默认值/嵌套/多声明器不修（避免生成错误代码）
- 未在真机/DevEco 编译验证（静态分析器，不替代编译）

## 5. 发布状态

- 版本号：npm 包 arktsup **0.5.0** / VS Code 插件 **0.5.0** / DevEco 骨架 **0.5.0**（package.json + lockfile + gradle 已同步）
- 标签：v0.5.0、vscode-v0.5.0（本地，**未推送**）
- 产物：plugin/arktsup-vscode.vsix（4.4 MB，175 文件，包内 version 0.5.0，CLI --version 0.5.0）
- 待办：git push origin main --tags 触发 npm 自动发布；插件网页上传（可选）
