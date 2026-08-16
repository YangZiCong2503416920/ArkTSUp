/**
 * 语义分析增强层（D3）：基于 TypeScript TypeChecker 的类型信息，
 * 对三个启发式规则做精确的豁免/升级判定（对标 ets2panda 的语义能力）。
 *
 * 解决的问题（docs/QUALITY-REPORT.md §5 已知局限）：
 *  1. propsByIndex：obj['key'] 无法区分 Record/Map/枚举/类型化数组（recipe29 豁免）——
 *     语义层确认豁免则移除 warning；确认非豁免则升级为 error。
 *  2. untypedObjectLiteral：无法判断类上下文（recipe38）——
 *     上下文类型是具体类/接口时豁免。
 *  3. utilityType：无法区分用户自定义的 Omit 等类型名——
 *     符号声明在用户代码（非 lib.d.ts）时豁免。
 *
 * 原则（防水 PR / 防误报）：
 *  - 只有类型信息确认时才改判定；any/unknown/error/union 一律保守不处理
 *  - 升级为 error 仅发生在类型明确非豁免时，否则保留原 warning
 */
import * as ts from 'typescript';
import { Finding } from './arkts-check';

export interface SemanticEnhance {
  /** propsByIndex：确认豁免的位置（移除 warning） */
  propsByIndexExempt: Set<string>;
  /** propsByIndex：确认违规（升级为 error） */
  propsByIndexErrors: Finding[];
  /** untypedObjectLiteral：确认豁免的位置 */
  literalExempt: Set<string>;
  /** utilityType：确认用户自定义类型名（豁免）的位置 */
  utilityExempt: Set<string>;
}

const posKey = (file: string, line: number, col: number): string => file + ':' + line + ':' + col;

/** 索引访问的对象类型是否属于 recipe29 豁免（Record/Map/枚举/类型化数组） */
function isExemptIndexType(t: ts.Type, checker: ts.TypeChecker): boolean {
  // any/unknown/error/never：保守不处理（调用方据此保留原判定）
  if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return false;
  const alias = t.aliasSymbol?.name;
  if (alias === 'Record') return true;
  const symName = t.symbol?.name;
  if (symName === 'Map' || symName === 'ReadonlyMap' || symName === 'WeakMap') return true;
  // 枚举：枚举字面量类型或枚举符号
  if (t.flags & ts.TypeFlags.EnumLiteral) return true;
  if (t.symbol && (t.symbol.flags & ts.SymbolFlags.Enum)) return true;
  // 数组 / 元组
  if (checker.isArrayType(t) || checker.isTupleType(t)) return true;
  // 类型化数组（Int32Array 等）
  if (symName && /^[A-Za-z]+Array$/.test(symName) && symName !== 'Object' && symName !== 'Array') {
    const sym = t.symbol;
    if (sym && sym.flags & ts.SymbolFlags.Interface) return true;
  }
  return false;
}

/** 类型是否'足够确定'可升级判定（排除 any/unknown/union/object/类/原始类型） */
function isDeterminateType(t: ts.Type): boolean {
  if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)) return false;
  if (t.flags & ts.TypeFlags.NonPrimitive) return false; // lowercase object（Sendable 等官方场景）
  if (t.flags & ts.TypeFlags.Union) return false; // 联合类型保守不升级
  const n = t.symbol?.name;
  if (n === 'Object' || n === 'object' || n === 'Function') return false; // 大 Object 保守
  if (t.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike)) return false;
  // 类类型保守不升级：官方 samples 存在 class 实例索引访问（Game2048 等），避免对官方代码误报
  if (t.symbol && (t.symbol.flags & ts.SymbolFlags.Class)) return false;
  return true;
}

/** 上下文类型是否为可豁免的类/接口（recipe38：类上下文对象字面量合法） */
function isClassLikeContext(t: ts.Type): boolean {
  if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Union)) return false;
  const n = t.symbol?.name;
  if (n === 'Object' || n === 'object' || n === 'Function') return false;
  return !!(t.symbol && (t.symbol.flags & (ts.SymbolFlags.Class | ts.SymbolFlags.Interface)));
}

/** 类型参数名是否由用户代码声明（非 lib.d.ts 内置） */
function isUserDeclaredName(typeName: ts.EntityName, checker: ts.TypeChecker): boolean {
  const sym = checker.getSymbolAtLocation(typeName);
  if (!sym) return false;
  if (!sym.declarations || sym.declarations.length === 0) return false;
  // 全部声明都在 .d.ts（lib/模块声明）则视为内置；有任何用户声明则视为自定义
  return sym.declarations.some((d) => !d.getSourceFile().isDeclarationFile);
}

/** 对一批 .ets 文件做工程级语义分析（影子 .ts + createProgram 一次） */
export function analyzeSemantics(files: string[]): SemanticEnhance {
  const result: SemanticEnhance = {
    propsByIndexExempt: new Set(),
    propsByIndexErrors: [],
    literalExempt: new Set(),
    utilityExempt: new Set(),
  };
  if (files.length === 0) return result;
  // createProgram 不识别 .ets 扩展名（根文件会被丢弃），
  // 因此把 .ets 镜像为临时 .ts（保留相对目录结构，使相对 import 也能解析）。
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const os = require('node:os') as typeof import('node:os');
  let shadowRoot = '';
  let shadowToRoot = new Map<string, string>();
  let shadowFiles: string[] = [];
  try {
    // 公共根目录（所有文件的最近公共父目录）
    let common = path.dirname(files[0]);
    for (const f of files) {
      let d = path.dirname(f);
      while (!d.startsWith(common)) common = path.dirname(common);
    }
    shadowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'arktsup-sem-'));
    for (const f of files) {
      const rel = path.relative(common, f).replace(/\.ets$/, '.ts');
      const target = path.join(shadowRoot, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, fs.readFileSync(f, 'utf8'));
      shadowToRoot.set(target, f);
      shadowFiles.push(target);
    }
  } catch {
    if (shadowRoot) fs.rmSync(shadowRoot, { recursive: true, force: true });
    return result;
  }
  let program: ts.Program;
  try {
    program = ts.createProgram(shadowFiles, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      skipLibCheck: true,
      allowJs: false,
    });
  } catch {
    fs.rmSync(shadowRoot, { recursive: true, force: true });
    return result; // 解析失败则退回纯语法层，不误报
  }
  const checker = program.getTypeChecker();
  const realFile = (shadow: string): string => shadowToRoot.get(shadow) ?? shadow;

  const visit = (node: ts.Node, sf: ts.SourceFile): void => {
    // 1) propsByIndex：对象类型已知时判定豁免/升级
    if (ts.isElementAccessExpression(node)) {
      const arg = node.argumentExpression;
      if (arg && (arg.kind === ts.SyntaxKind.StringLiteral || arg.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral)) {
        const objType = checker.getTypeAtLocation(node.expression);
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const k = posKey(sf.fileName, pos.line + 1, pos.character + 1);
        if (isExemptIndexType(objType, checker)) {
          result.propsByIndexExempt.add(k);
        } else if (isDeterminateType(objType)) {
          // 类型明确且非豁免：升级为 error
          const tn = objType.symbol?.name ?? objType.aliasSymbol?.name ?? '该类型';
          result.propsByIndexErrors.push({
            file: sf.fileName,
            line: pos.line + 1,
            column: pos.character + 1,
            severity: 'error',
            rule: 'propsByIndex',
            message: '对象类型 ' + tn + ' 不支持索引访问 obj[\'key\']（仅 Record/Map/枚举/类型化数组允许，arkts-no-props-by-index）',
            fix: '改用属性访问 obj.key，或用 Record/Map 承载索引语义',
            snippet: node.getText(sf).slice(0, 80),
          });
        }
      }
    }
    // 2) untypedObjectLiteral：上下文类型是类/接口时豁免（recipe38）
    if (ts.isObjectLiteralExpression(node)) {
      const ctx = checker.getContextualType(node);
      if (ctx && isClassLikeContext(ctx)) {
        const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        result.literalExempt.add(posKey(sf.fileName, pos.line + 1, pos.character + 1));
      }
    }
    // 3) utilityType：用户自定义的 Omit/Pick 等不报
    if (ts.isTypeReferenceNode(node)) {
      const name = node.typeName.getText(sf);
      if (name && isBannedUtility(name)) {
        if (isUserDeclaredName(node.typeName, checker)) {
          const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          result.utilityExempt.add(posKey(sf.fileName, pos.line + 1, pos.character + 1));
        }
      }
    }
    ts.forEachChild(node, (c) => visit(c, sf));
  };

  try {
    for (const sf of program.getSourceFiles()) {
      if (sf.isDeclarationFile || !sf.fileName.endsWith('.ts')) continue;
      if (!shadowToRoot.has(sf.fileName)) continue;
      visit(sf, sf);
    }
  } finally {
    fs.rmSync(shadowRoot, { recursive: true, force: true });
  }
  // 位置键与 errors 的文件路径映射回原始 .ets 路径
  const remap = (s: Set<string>): Set<string> => {
    const out2 = new Set<string>();
    for (const k of s) {
      const i = k.indexOf(':');
      out2.add(realFile(k.slice(0, i)) + k.slice(i));
    }
    return out2;
  };
  result.propsByIndexExempt = remap(result.propsByIndexExempt);
  result.literalExempt = remap(result.literalExempt);
  result.utilityExempt = remap(result.utilityExempt);
  for (const e of result.propsByIndexErrors) e.file = realFile(e.file);
  return result;
}

/** 与语法层 BANNED_UTILITY 保持一致的判定（内置禁止的 utility 类型名） */
const BANNED_UTILITY_SET = new Set([
  'Omit', 'Pick', 'Exclude', 'Extract', 'NonNullable', 'ReturnType', 'Parameters',
  'InstanceType', 'ConstructorParameters', 'Awaited', 'Uppercase', 'Lowercase',
  'Capitalize', 'Uncapitalize', 'ThisType', 'NoInfer', 'RequiredByKeys', 'ReadonlyByKeys',
]);
function isBannedUtility(name: string): boolean {
  return BANNED_UTILITY_SET.has(name);
}

export type { Finding };
