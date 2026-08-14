# ArkTSUp — 给 ArkTS 提效的命令行小工具集

> A CLI toolkit for HarmonyOS ArkTS developers: JSON → ArkTS type generation, and strict-syntax checking against official ArkTS rules.

[![CI](https://github.com/YangZiCong2503416920/ArkTSUp/actions/workflows/ci.yml/badge.svg)](https://github.com/YangZiCong2503416920/ArkTSUp/actions) <!-- 创建仓库后把 YangZiCong2503416920 换成你的 GitHub 用户名 -->

面向鸿蒙（HarmonyOS）ArkTS 开发者的痛点解决方案集合。全部工具为本地 CLI，不依赖 DevEco Studio，可直接对工程文件做转换、扫描、修复。生成/修复的结果严格贴合 ArkTS 语法限制（无 any、无任意联合、对象字面量必须显式声明类型等）。

> 质量保障：质检过程与证据见 [docs/QUALITY-REPORT.md](docs/QUALITY-REPORT.md)，规则溯源见 [docs/RULES.md](docs/RULES.md)。

## 已包含的工具

| 命令 | 作用 | 解决的痛点 |
| --- | --- | --- |
| arktsup json2ts | JSON → 符合 ArkTS 限制的类型声明（interface/class） | 后端接口 JSON 手写类型很痛苦；生成的类型天然避开 ArkTS 不支持的写法 |
| arktsup check | 扫描 .ets 中的 ArkTS 不兼容写法并给出修复建议（可 --fix 自动修 any） | 迁移/新人代码里到处是 any、无类型对象字面量、解构等编译报错 |

## 安装

```bash
# 克隆后在项目根目录
npm install
npm run build
npm link          # 全局可用 arktsup 命令（或直接 node dist/src/cli.js ...）
```

要求 Node.js >= 18。

## json2ts — JSON 转 ArkTS 类型

```bash
# 从文件
arktsup json2ts api/user.json --name User --out src/model/User.ets

# 从 stdin（也支持交互式粘贴，Ctrl+D 结束）
cat data.json | arktsup json2ts --name User

# 生成 class 风格 / 字段按字母序 / 全部可选
arktsup json2ts data.json --style class --sort --optional
```

### 选项

| 选项 | 说明 | 默认 |
| --- | --- | --- |
| --name <Name> | 根类型名（默认取文件名或 Root） | 文件名 / Root |
| --style <style> | interface 或 class | interface |
| --indent <n> | 缩进空格数 | 2 |
| --sort | 字段按字母序 | 关闭 |
| --optional | 所有字段标记可选 | 关闭 |
| --max-depth <n> | 最大嵌套深度 | 20 |
| --out <file> | 输出到文件 | stdout |

### 特性

- **数组单数化命名**：addresses: Address[]、orders: Order[]
- **对象数组合并键**：数组元素缺少的键自动标记可选（key?: T）
- **null 处理**：字段值为 null 时生成 T | null（ArkTS 允许）；纯 null 字段标记 ?:
- **类型冲突回退**：混合类型字段回退 unknown 并打印警告，绝不生成 ArkTS 不允许的任意联合
- **递归/共享引用**：自引用结构安全生成递归类型，不会爆栈
- **非法键名净化**：如 'user-name' 自动转为 user_name 并给出警告（ArkTS 不支持非标识符属性名）

## check — ArkTS 兼容性检查

```bash
# 扫描整个目录（自动跳过 node_modules / oh_modules / .hvigor / build 等）
arktsup check src/main/ets

# 扫描单个文件 / 机器可读输出 / 只看 error
arktsup check src/entry/Index.ets
arktsup check src/main/ets --format json
arktsup check src/main/ets --min-severity error

# 自动修复：把 any/unknown 替换为 Object（ArkTS 迁移第一步，需再手动收窄为具体类型）
arktsup check src/main/ets --fix
```

退出码：存在 error 时返回 1，只有 warning 返回 0。

### 已覆盖规则

共 27 条规则，全部对照官方文档逐条核验（来源与证据见 [docs/RULES.md](docs/RULES.md)），
并在 3327 个官方示例文件上验证过误报率（错误级误报 1/3327，为 NDK 互操作边界案例）。

| 规则 | 级别 | 说明 |
| --- | --- | --- |
| noAny | error | 禁止 any / unknown（arkts-no-any-unknown） |
| untypedObjectLiteral | error | 无类型对象字面量；Object/object 注解也不能初始化字面量（arkts-no-untyped-obj-literals） |
| objectDestructuring / arrayDestructuring | error | 不支持解构变量声明（arkts-no-destruct-decls） |
| destructuringAssignment | error | 不支持解构赋值（arkts-no-destruct-assignment） |
| objectSpread | error | 不支持对象展开，仅数组可展开（arkts-no-spread） |
| symbolType | error | 不支持 symbol 类型 / Symbol() API（arkts-no-symbol） |
| staticObjectLiteral | error | 静态属性不能用无类型对象字面量初始化 |
| indexSignature | error | 不支持 index signature（arkts-no-indexed-signatures） |
| propsByIndex | warning | obj['key'] 索引访问（arkts-no-props-by-index；Record/Map/枚举/类型化数组允许，需人工确认） |
| catchWithType | error | 不支持 catch 类型标注（arkts-no-types-in-catch，与直觉相反） |
| forIn | error | 不支持 for..in（arkts-no-for-in） |
| tsSuppress | error | 不允许 @ts-ignore / @ts-nocheck 等注释（arkts-strict-typing-required） |
| asConst | error | 不支持 as const（arkts-no-as-const） |
| utilityType | error | 不支持的 utility 类型，仅 Partial/Required/Readonly/Record 可用（arkts-no-utility-types） |
| intersection | error | 不支持交叉类型 A & B（arkts-no-intersection-types） |
| conditionalType | error | 不支持条件类型（arkts-no-conditional-types） |
| objLiteralAsType | error | 不支持内联对象类型 { a: number }（arkts-no-obj-literals-as-types） |
| deleteOp | error | 不支持 delete（arkts-no-delete） |
| typeQuery | error | typeof 只能用于表达式（arkts-no-type-query） |
| angleCast | error | 不支持 <T>expr 断言，仅 as T（arkts-as-casts） |
| nonInferrableArray | error | 数组字面量元素不可推断 / 空数组无类型（arkts-no-noninferrable-arr-literals） |
| nonIdentifierProps | error | 不支持数字属性名（arkts-identifiers-as-prop-names；字符串键是官方例外） |
| inOperator | error | 不支持 in 运算符（arkts-no-in） |
| varDecl | error | 不支持 var（arkts-no-var） |
| privateIdentifiers | error | 不支持 # 私有字段（arkts-no-private-identifiers） |
| stdlibRestricted | error | 受限标准库 API：eval、Object.assign/freeze、hasOwnProperty 等（arkts-limited-stdlib） |

**有意不做检查**（都有官方证据，详见 RULES.md）：Function 类型、元组类型、任意联合类型（如 string \| number）、字符串键属性名。

## 作为库使用

```ts
import { jsonToArkTs } from 'arktsup';
import { scanDirectory, fixAnyInSource } from 'arktsup';

const { code, warnings } = jsonToArkTs(jsonData, { rootName: 'User' });
const report = scanDirectory('src/main/ets');
```

## 开发

```bash
npm run build   # tsc 编译到 dist/
npm test        # 构建 + 单元测试（node:test）
```

## 规划中的工具（Roadmap）

- [ ] **模板代码生成器**：页面/组件/@State 状态管理/路由注册等样板代码
- [ ] **资源文件管理**：string.json 与代码引用同步、未使用资源检测
- [ ] **API 版本迁移助手**：废弃 API 检测与替换建议
- [ ] **IDE 插件封装**：把 check / json2ts 接到 DevEco Studio / VS Code

## License

MIT
