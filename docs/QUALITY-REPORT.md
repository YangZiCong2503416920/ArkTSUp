# 质量报告（QA Report）

本报告记录 ArkTSUp 的质检过程与结论，回答"凭什么这不是水 PR"。
结论先行：**工具的核心规则经官方文档逐条核验、在真实代码上验证过误报率、并修正了多处置自己于死地的错误判断。**

## 1. 规则准确性：逐条对照官方文档

所有 check 规则以两份权威来源为准（见 [RULES.md](RULES.md) 逐条溯源）：
- 华为《从 TypeScript 到 ArkTS 的适配规则》：https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/typescript-to-arkts-migration-guide
- OpenHarmony 官方 linter（ets2panda）80 个 recipe 文档：https://github.com/openharmony/arkcompiler_ets_frontend/tree/master/ets2panda/linter/docs/rules

校验方式：拉取官方文档原始 markdown + 稀疏克隆官方 linter 规则目录，逐条比对，**不是凭记忆**。

## 2. 本工具曾经写错、并已纠正的判断（诚实记录）

这些是"水 PR"最容易藏的地方——看起来对的规则其实是错的：

| 曾实现的规则 | 错误 | 证据 | 处理 |
| --- | --- | --- | --- |
| illegalUnion（非 nullish 联合报错） | ArkTS **支持**任意联合类型 | 官方入门文档示例 `type Animal = Cat \| Dog \| Frog \| number \| string \| null \| undefined` | 删除 |
| functionType（Function 类型报错） | 官方测试模板大量使用 `done: Function` 且编译通过 | 3327 个官方示例中命中 880 处 | 删除 |
| tupleType（元组类型报错） | 官方示例 `type TestList = [name: string, func: TestFunction][]` 编译通过；官方 recipe13 已空 | 3327 个官方示例命中 14 处 | 删除 |
| catchWithoutType（catch 无类型警告） | 方向完全相反：官方要求**省略** catch 类型标注 | recipe79 | 反转为 catchWithType |
| nonIdentifierProps 查字符串键 | 官方 §226 明确字符串字面量属性名是例外 | 官方示例 `'deviceId': ...` 编译通过 | 只查数字键 |
| untypedObjectLiteral 报回调返回字面量 | 回调实参的返回类型由调用点上下文推断，合法 | 官方示例 `.onScrollFrameBegin(...)` 编译通过 | 识别回调上下文 |
| nonInferrableArray 报 `let x: object[] = []` | 空数组带类型标注合法 | 官方示例编译通过 | 修正上下文判断 |
| propsByIndex 报 Record/Map 索引访问 | recipe29 明确豁免 Record/Map/枚举/类型化数组 | 官方示例命中 75 处全属豁免 | 降级为 warning |
| --fix 把 any 替换为 unknown | unknown 同样被 ArkTS 禁止 | recipe8 | 改为替换为 Object |

## 3. 真实代码验证（黄金标准：官方示例）

在 **3327 个官方示例 .ets 文件**上运行 `arktsup check`：

- **错误级误报：1 处**（NodeAPI NDK 互操作代码中的 `hasOwnProperty`，符合官方规则文本但属互操作边界场景）
- **警告级：75 处**，全部为 Record/Map/枚举/类型化数组索引访问（官方明确豁免的模式），按设计不阻塞 CI
- 官方示例中 noAny / 解构 / 展开 / for..in / index signature 等**零误报**

真阳性验证：33 个单元测试覆盖每条规则的反例（模式取自官方指南原文）；`examples/bad.ets` 的每行注释声明的违规与实测检出**完全一致**（24 规则 / 36 命中），可作回归基准。

## 3.5 社区工程验证（2026-08-15 补充）

| 工程 | 规模 | 结果 |
| --- | --- | --- |
| open_neteasy_cloud（鸿蒙仿网易云，367★） | 13 个 .ets | 4 错误（var/any，位于 DevEco 旧版测试模板 TestAbility.ets），**0 误报** |
| KTMStudio-Harmony（你的工程） | 23 个 .ets | 0 错误 0 警告 |
| 官方 applications_app_samples | 3327 个 .ets | 错误级误报 1/3327（NDK 互操作边界） |

> 说明：2026-08-15 当轮尝试克隆 ClashBox(4.1k★)/HarmoneyOpenEye(621★)/interview-handbook(539★) 时 GitHub 网络持续故障（HTTP2 协议错误、tarball 超时），仅完成 1 个社区工程。
> 基线目标：累计 ≥5 个非官方社区工程，错误级误报率 < 0.5%。

## 4. 独立评审

启动了一个全新上下文的子代理做独立代码审查（要求只报问题不表扬），但其运行超过 40 分钟未产出，已中止。
由主代理以同等标准完成了替代核验，并实际修复了以下问题：

- json2ts：可空字段错误地同时加 `?` 与 `| null`（改为 `? `只表缺失、null 用 `| null`、纯 null 字段用 `?: null`）
- json2ts：多处兜底类型使用 `unknown`（ArkTS 禁止），统一改为 `Object`
- check `--exclude`：错误地替换默认跳过列表而非追加，已修复
- check 单文件模式：无 try/catch，读/写失败会抛栈，已修复
- `--fix` 安全性：基于 AST 精确替换，实测不影响字符串和注释里的 "any"
- 全链路回归：33/33 测试通过，CLI 各命令/退出码/参数校验正常

## 5. 已知局限（不隐瞒）

- 无类型解析器：propsByIndex 只能启发式检测（Record 豁免无法静态区分）；untypedObjectLiteral 无法判断"带方法的类/自定义构造函数的类/readonly 类"（recipe38 的四类上下文之二），会漏报
- utilityType 无法区分用户自定义的 `Omit` 等类型名（罕见，误报概率低）
- 规则以官方 master 分支为准，API 版本演进后需复查（RULES.md 记录有复查方法）
- 未在真机/DevEco 编译验证（本工具是静态分析器，不替代编译）

## 6. 防"水 PR"的持续机制（写进项目的规矩）

1. **规则必须有出处**：任何新 check 规则必须先在 docs/RULES.md 补官方依据，无出处不合并
2. **官方示例回归**：改规则后必须在官方 samples（3327 文件）上重跑，错误级误报目标 <0.1%
3. **示例自验证**：examples/bad.ets 的注释声明必须与检出完全一致（有脚本可核对）
4. **测试门禁**：`npm test`（33 用例）全绿才提交
5. **诚实报告**：每条规则的状态（已验证/启发式/有意不做）写进 RULES.md，不夸大
