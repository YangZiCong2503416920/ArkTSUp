# ArkTS 避坑清单（从 TypeScript 迁移必读）

> 本文由 ArkTSUp 的 27 条 check 规则整理而成，全部对照华为官方《从 TypeScript 到 ArkTS 的适配规则》与
> OpenHarmony 官方 linter（ets2panda）逐条核验。写完代码用 `npx arktsup check` 自动扫描，比人工记忆可靠。
> 每条规则给出：错误示例 → 正确写法 → 官方规则名。

## 1. 类型系统

### 1.1 不要用 any / unknown
```typescript
// ✗ 编译错误：arkts-no-any-unknown
let value1: any = 42;
let value2: unknown = 'x';

// ✓ 用具体类型；确实无法确定时用 Object（官方兜底）
let value1: number = 42;
let value2: Object = 'x';
```

### 1.2 对象字面量必须有显式类型
```typescript
// ✗ 编译错误：arkts-no-untyped-obj-literals
let o = { n: 42, s: 'foo' };
let o2: Object = { n: 42 };      // Object 类型也不行

// ✓ 先声明类型再使用
interface O { n: number; s: string }
let o: O = { n: 42, s: 'foo' };
let oo: O[] = [{ n: 1, s: 'a' }, { n: 2, s: 'b' }];  // 数组也要带类型
```

### 1.3 联合类型支持，但别乱用
ArkTS **支持**联合类型（`type Animal = Cat | Dog | number | string | null | undefined` 是官方示例），
所以 `string | number` 是合法的。常见误区是把"联合类型"当"任意类型"用——联合是精确的，any 才是危险。

### 1.4 不支持的 TypeScript 类型特性
| 特性 | 规则 | 替代 |
| --- | --- | --- |
| 交叉类型 `A & B` | arkts-no-intersection-types | 接口继承 `interface C extends A, B {}` |
| 条件类型 `T extends U ? X : Y` | arkts-no-conditional-types | 显式约束或 Object |
| 内联对象类型 `{ a: number }` | arkts-no-obj-literals-as-types | 显式 interface/class |
| utility 类型（除 Partial/Required/Readonly/Record） | arkts-no-utility-types | 手写类型 |
| `as const` | arkts-no-as-const | 显式声明 `let x: string = 'hi'` |
| `typeof` 用于类型标注 | arkts-no-type-query | 写出具体类型 |
| `<T>expr` 断言 | arkts-as-casts | `expr as T` |

## 2. 解构与操作符

### 2.1 解构（声明和赋值都不支持）
```typescript
// ✗ 编译错误：arkts-no-destruct-decls / arkts-no-destruct-assignment
const { name, age } = user;
const [first, second] = arr;
let n = '';
({ n } = user);

// ✓ 逐字段
const name = user.name;
const first = arr[0];
```

### 2.2 对象展开（数组展开允许）
```typescript
// ✗ arkts-no-spread：对象展开不支持（注意 Object.assign 也被禁，见 arkts-limited-stdlib）
const merged = { ...a, z: 3 };
// ✓ 逐字段复制
const merged = { x: a.x, y: a.y, z: 3 };
// ✓ 数组展开是允许的
const list = [...arr, 4];
```

### 2.3 其他禁用操作符
- `delete`（arkts-no-delete）→ 赋 null：`x: T | null = null`
- `in`（arkts-no-in）→ `instanceof`
- `for..in`（arkts-no-for-in）→ 普通 for / for..of
- `var`（arkts-no-var）→ `let`
- `#私有字段`（arkts-no-private-identifiers）→ `private`
- `Symbol()` API（arkts-no-symbol）→ 字符串常量/枚举（Symbol.iterator 例外）

## 3. 类与对象

### 3.1 静态属性不能用无类型对象字面量
```typescript
// ✗ 编译错误
class C { static opts = { debug: true }; }
// ✓ 显式标注类型
class C { static opts: Record<string, boolean> = { debug: true }; }
```

### 3.2 索引签名 / 索引访问
```typescript
// ✗ arkts-no-indexed-signatures：接口不允许索引签名
interface Dict { [key: string]: string }
// ✓ 用数组或具名类字段

// ✗ arkts-no-props-by-index：类实例不能用 obj['key'] 访问（Record/Map/枚举/类型化数组例外）
console.log(p['x']);
// ✓ p.x
```

## 4. 函数与异常

### 4.1 catch 不要写类型标注（与直觉相反！）
```typescript
// ✗ arkts-no-types-in-catch：catch 只能标 any/unknown，而它们都被禁
catch (e: BusinessError) { }
// ✓ 直接省略
catch (e) { }
```

### 4.2 Function 类型是允许的
官方测试模板大量使用 `done: Function` 且编译通过——**不要**给 `Function` 报错（早期版本的常见误判）。

## 5. 资源与模块

- 资源名必须是合法标识符（`arkts-identifiers-as-prop-names`）：数字键禁止，字符串键是官方例外
- 禁止用注释关掉类型检查（`arkts-strict-typing-required`）：`@ts-ignore`/`@ts-nocheck` 都会报错
- 迁移 API 用 `npx arktsup migrate`：自动把 `@ohos.*` 改成 `@kit.*`（现覆盖 103 个模块）

## 6. 自查工具

```bash
npx --yes arktsup check src/main/ets --min-severity error   # 全量扫描
npx --yes arktsup check src/main/ets --fix                  # 自动修 any/var/断言
```
