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
| deleteOp | arkts-no-delete | error | recipe59 |
| typeQuery | arkts-no-type-query | error | recipe60 |
| angleCast | arkts-as-casts | error | 迁移指南 §2242；recipe53 |
| nonInferrableArray | arkts-no-noninferrable-arr-literals | error | 迁移指南 §608；recipe43 |
| nonIdentifierProps | arkts-identifiers-as-prop-names | error | 迁移指南 §226；recipe1（**只查数字键**：字符串字面量属性名是官方明确的例外） |
| inOperator | arkts-no-in | error | recipe66 |
| varDecl | arkts-no-var | error | recipe5 |
| privateIdentifiers | arkts-no-private-identifiers | error | recipe3 |
| stdlibRestricted | arkts-limited-stdlib | error | recipe144（本工具只实现其中高频项，见代码注释） |
| noFuncExpressions | arkts-no-func-expressions | error | recipe46（注意：DevEco 旧版测试模板的 function() 会被标记，属迁移目标，新模板用箭头函数） |
| noGenerators | arkts-no-generators | error | recipe94 |
| noFuncApplyCall | arkts-no-func-apply-call | error | recipe152 |
| noFuncBind | arkts-no-func-bind | warning | recipe140 |
| noDestructParams | arkts-no-destruct-params | error | recipe91 |
| noTypingWithThis | arkts-no-typing-with-this | error | recipe21 |
| noStandaloneThis | arkts-no-standalone-this | error | recipe93 |
| noPrototypeAssignment | arkts-no-prototype-assignment | error | recipe136 |
| noMethodReassignment | arkts-no-method-reassignment | error | recipe52 |
| noNewTarget | arkts-no-new-target | error | recipe132 |
| noMultipleStaticBlocks | arkts-no-multiple-static-blocks | error | recipe16 |
| noDefiniteAssignment | arkts-no-definite-assignment | warning | recipe134 |
| noGlobalThis | arkts-no-globalthis | error | recipe137 |
| noMappedTypes | arkts-no-mapped-types | error | recipe83 |
| noNestedFuncs | arkts-no-nested-funcs | error | recipe92 |
| noEnumMixedTypes | arkts-no-enum-mixed-types | error | recipe111 |
| noCommaOutsideLoops | arkts-no-comma-outside-loops | error | recipe71 |
| noCtorPropDecls | arkts-no-ctor-prop-decls | error | recipe25 |
| noClassLiterals | arkts-no-class-literals | error | recipe50 |
| noImportAssertions | arkts-no-import-assertions | error | recipe143 |
| noCallSignatures | arkts-no-call-signatures | error | recipe14 |
| noCtorSignatures | arkts-no-ctor-signatures-funcs | error | recipe106/27/15（函数/接口/对象类型中的构造签名） |
| noRequire | arkts-no-require | error | recipe121（require 与 import 赋值） |
| noExportAssignment | arkts-no-export-assignment | error | recipe126 |
| noUmd | arkts-no-umd | error | recipe130（export as namespace） |
| noNsStatements | arkts-no-ns-statements | error | recipe116 |
| noGenericLambdas | arkts-no-generic-lambdas | error | recipe49 |
| noIs | arkts-no-is | error | recipe96 |
| noAliasesByIndex | arkts-no-aliases-by-index | error | recipe28 |
| noImportDefaultAs | arkts-no-import-default-as | error | recipe120 |
| noModuleWildcards | arkts-no-module-wildcards | error | recipe129 |
| noAmbientDecls | arkts-no-ambient-decls | error | recipe128 |
| noMisplacedImports | arkts-no-misplaced-imports | error | recipe150 |
| noLimitedThrow | arkts-limited-throw | error | recipe87 |
| noDeclMerging | arkts-no-decl-merging | error | recipe103（同文件 class+interface 同名） |
| noEnumMerging | arkts-no-enum-merging | error | recipe113（同文件重复 enum） |
| uniqueNames | arkts-unique-names | error | recipe4（类型名唯一；**不查变量/函数名**——ArkTS struct 关键字会让 TS 解析器产生错误恢复 AST，变量级检查会误报） |
| noLimitedESObject | arkts-limited-esobj | warning | recipe151 |
| noJsx | arkts-no-jsx | error | recipe54（TSX 双解析：TS 模式在 JSX 区域有解析错误才报，避免与 <T>expr 断言混淆） |
| noWith | arkts-no-with | error | recipe84 |
| noInferredGenericParams | arkts-no-inferred-generic-params | error | recipe34（保守子集：本文件泛型函数无参调用且返回类型引用类型参数） |
| noPolymorphicUnops | arkts-no-polymorphic-unops | error | recipe55（保守子集：一元 + - ~ 作用于字符串字面量） |
| noClassesAsObj | arkts-no-classes-as-obj | error | recipe149（文件内符号表，只报明确值上下文） |
| extendsOnlyClass | arkts-extends-only-class | error | recipe104（文件内符号表：interface extends 本文件 class） |
| implementsOnlyIface | arkts-implements-only-iface | error | recipe51（文件内符号表：implements 本文件 class） |
| noNsAsObj | arkts-no-ns-as-obj | error | recipe114（文件内符号表：namespace 名用作值；限定访问合法） |
| noFuncProps | arkts-no-func-props | error | recipe139（文件内符号表：对函数名赋值属性） |
| instanceofRefTypes | arkts-instanceof-ref-types | error | recipe65（instanceof 左操作数直接是本文件类名） |
| noImplicitReturnTypes | arkts-no-implicit-return-types | warning | recipe90（return 调用返回类型省略的本文件函数；静态无法达到 ets2panda 精度，官方 sample 存在合法反例，故降级 warning） |
| noExtendSameProp | arkts-no-extend-same-prop | error | recipe102（interface extends 多个含同名方法的接口） |
| （未实现）structural typing | - | - | recipe30 需完整类型检查器（TypeChecker）判断类型结构等价，超出纯 AST 扫描范围 |
| （未实现）no-ts-deps | - | - | recipe147 需目录级跨文件 import 图分析（.ts 依赖 .ets），check 为单文件扫描 |
| （有意不做）strict-typing | - | - | recipe145 是编译器整体严格性要求（noImplicitReturns 等），非单一可查规则；相关规则见 recipe8/146 |

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

## 配置忽略（.arktsuprc.json）

在工程根目录放 `.arktsuprc.json` 可忽略指定规则与目录：

```json
{
  "ignore": { "rules": ["propsByIndex"], "dirs": ["ohosTest"] }
}
```

## 规则自定义（D6，v0.9）

`.arktsuprc.json` 支持两层规则自定义。竞品（CodeLinter / oxc-ark / ets2panda）的规则集
全部封闭，这是 ArkTSUp 的差异化能力（依据见 docs/COMPETITOR-ANALYSIS.md D6）。

### 1. 内置规则级别覆盖 `rules`

```json
{
  "rules": { "propsByIndex": "off", "noFuncBind": "error" }
}
```

取值 `off | error | warning | info`（默认取内置级别）。`off` 等价于 `ignore.rules`，
但与 D3 语义升级、D4 缓存、D6 自定义规则统一生效；对自定义规则名同样有效（改自定义规则级别）。

### 2. 声明式自定义规则 `customRules`

每个规则 = 一个 AST 选择器（eslint selector 子集）+ 描述文案：

```json
{
  "customRules": [
    {
      "name": "noDebugger",
      "message": "禁止 debugger 语句（调试残留）",
      "severity": "error",
      "selector": "DebuggerStatement",
      "fix": "删除 debugger;"
    },
    {
      "name": "noConsoleLog",
      "message": "禁止 console.log/debug（调试输出请用 hilog）",
      "severity": "warning",
      "selector": "PropertyAccessExpression[text~=/^console\\.(log|debug)$/]",
      "fix": "改用 hilog.info(...)"
    }
  ]
}
```

字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| name | ✅ | 规则名：唯一，不能与内置规则重名 |
| message | ✅ | 命中后展示的问题描述 |
| selector | ✅ | AST 选择器（见下） |
| severity | - | `error`（默认）\| `warning` \| `info` |
| fix | - | 修复建议文案（自定义规则暂不自动修复） |

### 选择器语法

```
selector := compound ( '>' compound )*
compound := kindName attr*
attr     := '[' attrName '=' value ']' | '[' attrName '~=' /regex/flags ']'
```

- **kindName**：TypeScript SyntaxKind 成员名（`CallExpression` / `PropertyAccessExpression`
  / `Identifier` / `StringLiteral` / `DebuggerStatement` / `PropertyAssignment` …），
  关键字可用小写别名（`string` / `number` / `any` / `unknown` / `true` / `false` / `null`
  / `this` / `const` / `let` / `var` / `in` / `as` / `new` / `typeof` …）。
- **报告点**：最右侧 compound 匹配的节点（位置/片段取自该节点）；
  每个 `>` 要求左侧 compound 匹配它的直接父节点（祖先链）。
- **属性**：`name`（节点名：Identifier 文本 / 声明名 / 属性名，字符串键取其文本）、
  `text`（节点源码文本）、`kind`（SyntaxKind 名）。
- **运算符**：`=` 相等（值可带引号，如 `[name='str-key']`）；`~=` 正则匹配
  （值必须是 `/pattern/flags` 字面量）。

示例：

| 想做的检查 | selector |
| --- | --- |
| 禁止 debugger | `DebuggerStatement` |
| 禁止 `alert(...)` 调用 | `CallExpression > Identifier[name=alert]` |
| 禁止 `console.log/debug` | `PropertyAccessExpression[text~=/^console\\.(log|debug)$/]` |
| 禁止下划线开头的属性名 | `PropertyAssignment[name~=/^_/]` |
| 禁止 `any` 关键字 | `any`（关键字别名） |

### 校验与联动

- 配置校验失败（selector 无法解析、缺字段、与内置规则重名、级别非法）时
  `arktsup check` 直接报错退出（exit 2），**绝不静默忽略**。
- 自定义规则在 `--watch` / `--staged` / 单文件 / 目录模式全链路生效；
  `--fix` 不处理自定义规则（无自动修复引擎），但报告照常。
- 增量缓存（D4）：`.arktsuprc` 的 `ignore/rules/customRules` 任一变化都会使
  配置指纹失效，缓存自动重算，不会复用过期结果。

## 明确不做检查的项（重要）

| 写法 | 为什么不做 |
| --- | --- |
| 任意联合类型（如 string | number） | **ArkTS 官方支持任意联合类型**：官方入门文档示例 `type Animal = Cat | Dog | Frog | number | string | null | undefined`（introduction-to-arkts.md §225）。linter 规则表中也无对应规则。早期版本曾错误检查此项，已删除 |
| catch 无类型标注 | catch 无类型标注是**合法**写法（recipe79 明确要求省略类型标注），不做检查 |

## 校验日期与方法

- 2026-07（本会话）：逐条对照迁移指南原文与 ets2panda recipe 文件核对。
- 2026-08-16（P1-5 扩充）：规则 65 → 77 条，补齐 recipe54/84/34/55/149/104/51/114/139/65/90/102，
  全部以 ets2panda 官方 recipe 原文为准（recipe 清单经 GitHub API 拉取比对，80 个 recipe 全覆盖/已记录状态）。
- 2026-08-16（P3）：新增 `scripts/track-recipes.js` 自动追踪官方 recipe 清单变更（每周 CI），
  fuzz 测试（test/fuzz.test.ts）抓出并修复 TS 解析器对畸形输入的崩溃（createSourceFile 容错）。
- 方法：拉取 openharmony/docs 迁移指南原始 markdown + 稀疏克隆 arkcompiler_ets_frontend 的 linter/docs/rules 目录（80 个 recipe）。
- 注意：recipe 与指南以 master 分支为准，API 版本演进可能调整规则，使用前可复查上述链接。
