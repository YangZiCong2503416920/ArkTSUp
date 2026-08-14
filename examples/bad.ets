// examples/bad.ets — 故意包含 ArkTS 不兼容写法的示例
import { BusinessError } from '@kit.BasicServicesKit';

interface Point {
  x: number;
  y: number;
}

let anything: any = 1;                 // noAny
const arr: any[] = [1, 2];             // noAny (any[])
const cast = (1 as any) + 1;           // noAny (as any)
const box: Array<any> = [];            // noAny (Array<any>)

// untypedObjectLiteral: 无类型声明的对象字面量
let untyped = { a: 1, b: 'x' };

// 有类型上下文则合法
const typed: Point = { x: 1, y: 2 };

// objectDestructuring
const user = { name: 'Alice', age: 18 };
const { name, age } = user;

// destructuringAssignment
let n = '';
({ n } = user);

// functionType
let handler: Function = () => {};

// illegalUnion: 非 nullish 联合
let code: string | number = 1;
let ok: number | null = null;          // 合法

// objectSpread
const merged = { ...typed, z: 3 };

// symbolType
const sym: symbol = Symbol('s');

// staticObjectLiteral
class Config {
  static map: Record<string, string> = { a: '1' };
  static opts: { debug: boolean } = { debug: true };
}

// indexSignature (warning)
interface Dict {
  [key: string]: string;
}

// catchWithoutType (warning)
function risky(): void {
  try {
    const x = JSON.parse('{}');
  } catch (e) {
    console.error(e);
  }
}

