# ArkTSUp — 给 ArkTS 提效的命令行小工具集

面向鸿蒙（HarmonyOS）ArkTS 开发者的痛点解决方案集合。全部工具为本地 CLI，不依赖 DevEco Studio，可直接对工程文件做转换、扫描、修复。生成/修复的结果严格贴合 ArkTS 语法限制（无 any、无任意联合、对象字面量必须显式声明类型等）。

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
- **非法键名加引号**：如 'user-name': string

## check — ArkTS 兼容性检查

```bash
# 扫描整个目录（自动跳过 node_modules / oh_modules / .hvigor / build 等）
arktsup check src/main/ets

# 扫描单个文件 / 机器可读输出 / 只看 error
arktsup check src/entry/Index.ets
arktsup check src/main/ets --format json
arktsup check src/main/ets --min-severity error

# 自动修复：把 any 替换为 unknown（ArkTS 迁移第一步）
arktsup check src/main/ets --fix
```

退出码：存在 error 时返回 1，只有 warning 返回 0。

### 已覆盖规则

| 规则 | 级别 | 说明 |
| --- | --- | --- |
| noAny | error | 禁止 any（any、any[]、as any、Array<any>），建议改具体类型或 unknown |
| untypedObjectLiteral | error | 无类型声明的对象字面量，需先定义 interface/class 并标注类型 |
| objectDestructuring | error | 不支持对象解构 |
| destructuringAssignment | error | 不支持对象解构赋值 |
| functionType | error | 不支持 Function 类型，改具体函数签名 |
| illegalUnion | error | 只允许与 null/undefined 组成联合（string \| number 报错，number \| null 合法） |
| objectSpread | error | 不支持对象展开，用 Object.assign 或逐字段复制 |
| symbolType | error | 不支持 symbol，改用字符串枚举 |
| staticObjectLiteral | error | 静态属性不能用对象字面量初始化 |
| indexSignature | warning | 接口索引签名支持受限，建议 Record<string, T> |
| catchWithoutType | warning | catch 参数需显式类型，如 catch (err: BusinessError) |

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
