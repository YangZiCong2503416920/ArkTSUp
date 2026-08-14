# 规则溯源（Rule Sources）

本文件记录 `arktsup check` 每一条规则的官方依据。任何规则都必须能在下面找到出处，
**没有出处的规则不允许存在**——这是本项目"反水 PR"的第一道防线。

## 权威来源

1. **华为官方《从 TypeScript 到 ArkTS 的适配规则》（迁移指南）**
   - 中文: https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/typescript-to-arkts-migration-guide
   - 源码: https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/quick-start/typescript-to-arkts-migration-guide.md
   - 每条规则含官方错误码（如 10605008）与"规则名 / 级别"标注
2. **OpenHarmony 官方 linter（ets2panda）逐条规则文档**
   - https://github.com/openharmony/arkcompiler_ets_frontend/tree/master/ets2panda/linter/docs/rules
   - 共 80 个 recipe 文件，本表按 recipe 编号引用
3. **官方《ArkTS 语言入门》文档（联合类型支持示例）**
   - https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/quick-start/introduction-to-arkts.md

## 规则对照表

| arktsup 规则 | 官方规则 | 级别 | 出处 |
| --- | --- | --- | --- |
| noAny | arkts-no-any-unknown | error | 迁移指南 §365；recipe8 |
| untypedObjectLiteral | arkts-no-untyped-obj-literals | error | 迁移指南 §400；recipe38 |
| objectDestructuring | arkts-no-destruct-decls | error | 迁移指南 §683；recipe74 |
| arrayDestructuring | arkts-no-destruct-decls | error | 迁移指南 §683（解构声明含数组）；recipe74 |
| destructuringAssignment | arkts-no-destruct-assignment | error | 迁移指南 §640；recipe69 |
| objectSpread | arkts-no-spread | error | recipe99（仅数组可展开） |
| symbolType | arkts-no-symbol | error | recipe2（Symbol() API 与 symbol 类型） |
| staticObjectLiteral | arkts-no-untyped-obj-literals | error | 迁移指南 §400（静态字段无类型标注即无上下文） |
| indexSignature | arkts-no-indexed-signatures | error | 迁移指南 §1574；recipe17 |
| propsByIndex | arkts-no-props-by-index | error | 迁移指南 §1615；recipe29 |
| catchWithType | arkts-no-types-in-catch | error | 迁移指南 §2302；recipe79 |
| forIn | arkts-no-for-in | error | 迁移指南 §2336；recipe80 |
| tsSuppress | arkts-strict-typing-required | error | recipe146；迁移指南 §856 |
| asConst | arkts-no-as-const | error | 迁移指南 §2196；recipe142 |
| utilityType | arkts-no-utility-types | error | 迁移指南 §2182；recipe138 |
| intersection | arkts-no-intersection-types | error | 迁移指南 §1816；recipe19 |
| conditionalType | arkts-no-conditional-types | error | 迁移指南 §1908；recipe22 |
| objLiteralAsType | arkts-no-obj-literals-as-types | error | 迁移指南 §1688；recipe40 |
| tupleType | arkts-no-tuples | error | recipe8 See also（Use Object[] instead of tuples） |
| deleteOp | arkts-no-delete | error | recipe59 |
| typeQuery | arkts-no-type-query | error | recipe60 |
| angleCast | arkts-as-casts | error | 迁移指南 §2242 |
| nonInferrableArray | arkts-no-noninferrable-arr-literals | error | 迁移指南 §608；recipe43 |
| nonIdentifierProps | arkts-identifiers-as-prop-names | error | 迁移指南 §226；recipe1（**只查数字键**：字符串字面量属性名是官方明确的例外） |
| inOperator | arkts-no-in | error | recipe66 |
| varDecl | arkts-no-var | error | recipe5 |
| privateIdentifiers | arkts-no-private-identifiers | error | recipe3 |
| stdlibRestricted | arkts-limited-stdlib | error | recipe144（本工具只实现其中高频项，见代码注释） |

> propsByIndex 降级为 **warning** 的原因：recipe29 明确豁免 Record / Map / 枚举 / 类型化数组的索引访问，
> 而静态检测无法分辨索引对象的类型。warning 不阻塞 CI，仅提示人工确认。
> 在 3327 个官方示例文件上，该规则的 75 条命中全部属于豁免场景。

## 已删除/不检查的规则（含踩坑记录）

| 规则 | 曾做 | 删除原因（证据） |
| --- | --- | --- |
| illegalUnion（非 nullish 联合） | error | **官方支持任意联合类型**：introduction-to-arkts.md §225 示例 `type Animal = Cat \| Dog \| Frog \| number \| string \| null \| undefined`；linter 无此规则 |
| functionType（Function 类型注解） | error | 官方测试模板（Ability.test.ets）大量使用 `done: Function` 并通过编译；官方 linter 无此规则 |
| tupleType（元组类型） | error | 官方示例（manager.ets）使用 `type TestList = [name: string, func: TestFunction][]` 并通过编译；recipe13 内容为空（规则已废弃） |
| catchWithoutType（catch 无类型标注） | warning | 方向完全相反：recipe79 明确要求**省略** catch 类型标注 |

## 明确不做检查的项（重要）

| 写法 | 为什么不做 |
| --- | --- |
| 任意联合类型（如 string | number） | **ArkTS 官方支持任意联合类型**：官方入门文档示例 `type Animal = Cat | Dog | Frog | number | string | null | undefined`（introduction-to-arkts.md §225）。linter 规则表中也无对应规则。早期版本曾错误检查此项，已删除 |
| catch 无类型标注 | catch 无类型标注是**合法**写法（recipe79 明确要求省略类型标注），不做检查 |

## 校验日期与方法

- 2026-07（本会话）：逐条对照迁移指南原文与 ets2panda recipe 文件核对。
- 方法：拉取 openharmony/docs 迁移指南原始 markdown + 稀疏克隆 arkcompiler_ets_frontend 的 linter/docs/rules 目录（80 个 recipe）。
- 注意：recipe 与指南以 master 分支为准，API 版本演进可能调整规则，使用前可复查上述链接。
