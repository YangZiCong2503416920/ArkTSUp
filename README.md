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

## template — 样板代码生成器

```bash
# 生成 @Entry 页面
arktsup template page LoginPage --dir entry/src/main/ets/pages

# 生成可复用组件（@Prop/@State）
arktsup template component UserCard

# 生成数据模型（interface / class）
arktsup template model User --fields "id:number,name:string,isVip:boolean"
arktsup template model User --fields "id:number" --style class

# 生成 @Observed 状态类（字段自动带初值，满足 strictPropertyInitialization）
arktsup template state CartState --fields "items:number,totalPrice:number"

# 扫描页面目录生成路由常量表（自动识别 @Entry struct）
arktsup template route-list --dir entry/src/main/ets/pages
```

生成的代码遵守 ArkTS 限制（无 any、无未类型对象字面量、字段有初值），并可通过 `arktsup check` 自检。
路由常量表示例：

```typescript
export class RouteConstants {
  static readonly LoginPage = '/LoginPage';
  static readonly HomePage = '/HomePage';
}
```

## resource — 资源文件管理

```bash
# 检查：代码引用缺失的资源（error）+ 定义了但没人用的资源（warning）
arktsup resource check src/main/resources

# 生成资源路径常量表 R.ets（Record<string,string> 显式标注，符合 ArkTS）
arktsup resource gen src/main --out ets/common/R.ets

# 添加资源条目（自动写入 resources/base/element/<type>.json）
arktsup resource add app.string.welcome --value "欢迎"
arktsup resource add app.color.primary --value "#FF007DFF"
```

R.ets 用法：代码里用 `R.strings.welcome` 替代魔法字符串 `$r('app.string.welcome')`，资源改名后重新生成即可。

检查示例：

```
error   Index.ets:5:24 [missingResource] 引用了不存在的资源 app.string.nope
        建议: 在 resources/**/element/string.json（或 media/）中定义 nope，或修正引用
warning string.json:1:1 [unusedResource] 资源 app.string.old 未被任何代码引用
        建议: 确认无用后从资源文件中删除
```

## migrate — 废弃 API 迁移助手

```bash
# 先看报告（dry-run 不修改文件）
arktsup migrate src/main/ets --dry-run

# 自动修复：改写 import 为 @kit.*，并同步替换代码中的调用
arktsup migrate src/main/ets

# 处理单个文件 / JSON 输出
arktsup migrate src/entry/Index.ets --format json
```

自动修复示例（fs -> fileIo、prompt -> promptAction）：

```typescript
// 修复前
import { fs } from '@ohos.file.fs';
import prompt from '@ohos.prompt';
const t = fs.readTextSync('/tmp/a');
prompt.showToast({ message: 'hi' });

// 修复后
import { fileIo } from '@kit.CoreFileKit';
import { promptAction } from '@kit.ArkUI';
const t = fileIo.readTextSync('/tmp/a');
promptAction.showToast({ message: 'hi' });
```

对照表覆盖约 60 个高频模块（hilog / http / preferences / UIAbility / cryptoFramework / taskpool / webview / wifiManager 等），
每条都标注了 OpenHarmony 官方 API 文档出处（见 src/lib/deprecations.ts 的 doc 字段），可据此复核或自行扩展。

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

## Roadmap

### ✅ 已完成

- [x] **模板代码生成器**：`arktsup template` — 页面 / 组件 / 数据模型 / @Observed 状态类 / 路由常量表
- [x] **资源文件管理**：`arktsup resource` — 缺失引用检查、未使用资源检测、R.ets 常量生成、条目添加
- [x] **API 版本迁移助手**：`arktsup migrate` — @ohos.* → @kit.* 检测与自动修复

### ⏳ 待做

- [ ] **IDE 插件封装**：把 check / json2ts 接到 DevEco Studio / VS Code

## License

MIT
