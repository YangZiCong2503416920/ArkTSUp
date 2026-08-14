// examples/bad.ets — 故意包含 ArkTS 不兼容写法的示例（每处都对照官方文档，见 docs/RULES.md）
import { BusinessError } from '@kit.BasicServicesKit';

interface Point {
  x: number;
  y: number;
}

// --- noAny: any / unknown 都被禁止 ---
let anything: any = 1;                 // arkts-no-any-unknown
const arr: any[] = [1, 2];
const cast = (1 as any) + 1;
const box: Array<any> = [];
let unknownVal: unknown = null;

// --- untypedObjectLiteral: 无类型对象字面量 ---
let untyped = { a: 1, b: 'x' };
let objTyped: Object = { a: 1 };       // Object 类型也不允许初始化字面量

// 有类型上下文则合法
const typed: Point = { x: 1, y: 2 };

// --- 解构：对象/数组声明与赋值都不支持 ---
const user = { name: 'Alice', age: 18 };
const { name, age } = user;            // objectDestructuring
let n = '';
({ n } = user);                        // destructuringAssignment
const [first, second] = [1, 2];        // arrayDestructuring
let head = 0;
[head, second] = [second, head];       // destructuringAssignment (array)

// --- functionType ---
let handler: Function = () => {};

// --- objectSpread（对象展开禁止；数组展开允许）---
const merged = { ...typed, z: 3 };
const okArr = [...[1, 2], 3];          // 数组展开合法，不报

// --- symbolType ---
const sym: symbol = Symbol('s');

// --- staticObjectLiteral ---
class Config {
  static map: Record<string, string> = { a: '1' };
  static opts = { debug: true };       // 无类型标注
}

// --- indexSignature ---
interface Dict {
  [key: string]: string;
}

// --- propsByIndex: obj['key'] 索引访问 ---
console.log(typed['x']);

// --- catchWithType: catch 不允许类型标注 ---
function risky(): void {
  try {
    const x = JSON.parse('{}');
  } catch (e: BusinessError) {
    console.error(e);
  }
}

// --- forIn / in / delete / var / as const / utility type / 交叉类型 / 元组 / 内联对象类型 ---
function more(): void {
  const obj: Record<string, number> = { a: 1 };
  for (const k in obj) {               // forIn
    console.log(k);
  }
  if ('a' in obj) {                    // inOperator
    console.log('has a');
  }
  var legacy = 1;                      // varDecl
  const frozen = Object.freeze(obj);   // stdlibRestricted
  const src = { x: 1 };
  delete (src as { x?: number }).x;    // deleteOp
  const lit = 'hi' as const;           // asConst
  type PickName = Omit<Point, 'y'>;    // utilityType
  type Both = Point & { z: number };   // intersection
  type Flag = number extends number ? true : false; // conditionalType
  let inline: { a: number } = { a: 1 };            // objLiteralAsType
  const pair: [number, string] = [1, 'a'];         // tupleType
  // @ts-ignore                            // tsSuppress
  const suppressed: number = 'x';
  const c = <Point>{ x: 1, y: 2 };      // angleCast
  const t1 = typeof 'x';                // typeof 表达式合法
  let t2: typeof user;                  // typeQuery（typeof 用于类型标注）
}

