/**
 * custom-rules — .arktsuprc 声明式自定义规则引擎（D6）。
 *
 * 竞品（CodeLinter / oxc-ark / ets2panda）的规则集全部封闭，本模块让用户
 * 在 .arktsuprc.json 里用「AST 选择器」声明自己的规则，这是 v1.0.0 路线
 * 的差异化能力（依据见 docs/COMPETITOR-ANALYSIS.md D6）。
 *
 * 选择器 DSL（eslint selector 子集）：
 *   selector := compound ( '>' compound )*
 *   compound := kindName attr*
 *   attr     := '[' attrName '=' value ']' | '[' attrName '~=' /regex/flags ']'
 *
 * 语义：
 *   - 最右侧 compound 决定「报告点」：匹配该 compound 的节点即命中位置；
 *   - 每个 '>' 要求左侧 compound 匹配它的直接父节点（祖先链，自下而上）。
 *
 * kindName 取值：TypeScript SyntaxKind 成员名（CallExpression、
 *   PropertyAccessExpression、Identifier、StringLiteral、DebuggerStatement…），
 *   关键字可用小写别名（string / number / any / unknown / true / false / null /
 *   this / const / let / var / in / as / new / typeof …）。
 *
 * attr：
 *   name — 节点名：Identifier 文本 / 声明名 / 属性名（字符串字面量属性名取其文本）
 *   text — 节点源码文本（getText）
 *   kind — 节点 kind 的 SyntaxKind 名
 * 运算符：= 字符串相等；~= 正则匹配（值必须是 /pattern/flags 字面量）
 *
 * 配置校验失败（selector 无法解析等）在 check 命令入口直接报错退出（exit 2），
 * 绝不静默忽略 —— 延续「反水 PR」门禁：每个功能都有测试 + 回归证据。
 */

import * as ts from 'typescript';
import type { Severity } from './arkts-check';

/** 用户在 .arktsuprc.json customRules 里声明的规则 */
export interface CustomRuleSpec {
  /** 规则名：唯一，不能与内置规则重名（校验见 src/lib/config.ts） */
  name: string;
  /** 命中后展示的问题描述 */
  message: string;
  /** AST 选择器（见文件头 DSL 说明） */
  selector: string;
  /** error | warning | info，默认 error */
  severity?: Severity;
  /** 修复建议文案（自定义规则暂不提供自动修复） */
  fix?: string;
}

/** 编译后的自定义规则：matches 直接用于 AST 遍历 */
export interface CompiledCustomRule {
  name: string;
  message: string;
  fix: string;
  severity: Severity;
  selector: string;
  matches(node: ts.Node, sf: ts.SourceFile): boolean;
}

interface AttrCheck {
  attr: string;
  op: '=' | '~=';
  value: string;
  /** ~= 时编译好的正则（去 g，避免 test 状态化） */
  re?: RegExp;
}

interface CompoundSel {
  kind: ts.SyntaxKind | undefined;
  attrs: AttrCheck[];
}

export interface ParsedSelector {
  compounds: CompoundSel[];
  raw: string;
}

/**
 * SyntaxKind 索引：成员名（CallExpression…）+ 关键字小写别名
 * （StringKeyword → string、TrueKeyword → true …）。
 */
const KIND_INDEX = (() => {
  const m = new Map<string, ts.SyntaxKind>();
  const e = ts.SyntaxKind as unknown as Record<string, number | string>;
  for (const [k, v] of Object.entries(e)) {
    if (typeof v !== 'number') continue; // 枚举的反向映射（数字->名字）跳过
    if (m.has(k)) continue;
    m.set(k, v);
    if (k.endsWith('Keyword') && k.length > 'Keyword'.length) {
      const alias = k.slice(0, -'Keyword'.length).toLowerCase();
      if (!m.has(alias)) m.set(alias, v);
    }
  }
  return m;
})();

/** 取节点的"名字"（Identifier 文本 / 声明名 / 属性名），取不到返回 undefined */
export function nodeNameOf(node: ts.Node): string | undefined {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
  const anyNode = node as unknown as { name?: ts.Node };
  const nm = anyNode.name;
  if (!nm) return undefined;
  if (ts.isIdentifier(nm) || ts.isPrivateIdentifier(nm)) return nm.text;
  if (ts.isStringLiteral(nm) || ts.isNumericLiteral(nm)) return nm.text;
  return undefined;
}

/** 解析选择器字符串；失败返回带位置/原因的错误信息 */
export function parseSelector(raw: string): { ok: true; sel: ParsedSelector } | { ok: false; error: string } {
  const compounds: CompoundSel[] = [];
  let i = 0;
  const n = raw.length;
  const skipWs = (): void => { while (i < n && /\s/.test(raw[i])) i++; };

  while (true) {
    skipWs();
    if (i >= n) break;
    const kindStart = i;
    while (i < n && /[A-Za-z0-9_]/.test(raw[i])) i++;
    if (i === kindStart) {
      return { ok: false, error: `位置 ${i} 期望节点类型名，实际 "${raw[i] ?? '<EOF>'}"` };
    }
    const kindName = raw.slice(kindStart, i);
    const kind = KIND_INDEX.get(kindName);
    if (kind === undefined) {
      return { ok: false, error: `未知节点类型 "${kindName}"（应为 TypeScript SyntaxKind 成员名或关键字别名）` };
    }
    skipWs();
    const attrs: AttrCheck[] = [];
    while (i < n && raw[i] === '[') {
      i++;
      skipWs();
      const aStart = i;
      while (i < n && /[A-Za-z_]/.test(raw[i])) i++;
      const attr = raw.slice(aStart, i);
      if (!attr) return { ok: false, error: `位置 ${i} 属性名为空` };
      skipWs();
      let op: '=' | '~=' | undefined;
      if (raw[i] === '=') { op = '='; i++; }
      else if (raw[i] === '~' && raw[i + 1] === '=') { op = '~='; i += 2; }
      else return { ok: false, error: `属性 ${attr} 缺少运算符（= 或 ~=）` };
      skipWs();
      if (op === '~=') {
        if (raw[i] !== '/') return { ok: false, error: `属性 ${attr} 的 ~= 值必须是 /pattern/flags 正则字面量` };
        i++;
        const pStart = i;
        let esc = false;
        while (i < n && (esc || raw[i] !== '/')) {
          if (!esc && raw[i] === '\\') esc = true;
          else esc = false;
          i++;
        }
        if (i >= n) return { ok: false, error: `属性 ${attr} 的正则缺少闭合 /` };
        const pattern = raw.slice(pStart, i);
        i++; // 跳过闭合 /
        const fStart = i;
        while (i < n && /[a-z]/.test(raw[i])) i++;
        const flags = raw.slice(fStart, i);
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags.replace('g', '')); // 去 g：避免 test() 的 lastIndex 状态化
        } catch (err) {
          return { ok: false, error: `属性 ${attr} 的正则无效: ${(err as Error).message}` };
        }
        attrs.push({ attr, op, value: pattern, re });
      } else {
        const vStart = i;
        while (i < n && raw[i] !== ']') i++;
        let value = raw.slice(vStart, i).trim();
        // 支持带引号的值：[name='str-key'] / [text="x y"]（去一层引号）
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        attrs.push({ attr, op, value });
      }
      skipWs();
      if (raw[i] !== ']') return { ok: false, error: `属性 ${attr} 缺少闭合 ]` };
      i++;
      skipWs();
    }
    compounds.push({ kind, attrs });
    skipWs();
    if (i >= n) break;
    if (raw[i] === '>') { i++; continue; }
    return { ok: false, error: `位置 ${i} 期望 > 或结尾，实际 "${raw[i]}"` };
  }
  if (compounds.length === 0) return { ok: false, error: '选择器为空' };
  return { ok: true, sel: { compounds, raw } };
}

/** 编译单个 compound 为谓词 */
function compileCompound(c: CompoundSel): { ok: true; fn: (node: ts.Node, sf: ts.SourceFile) => boolean } | { ok: false; error: string } {
  const checks: ((node: ts.Node, sf: ts.SourceFile) => boolean)[] = [];
  if (c.kind !== undefined) {
    checks.push((node) => node.kind === c.kind);
  }
  for (const a of c.attrs) {
    if (a.attr === 'name') {
      checks.push((node) => {
        const nm = nodeNameOf(node);
        if (nm === undefined) return false;
        return a.op === '=' ? nm === a.value : (a.re as RegExp).test(nm);
      });
    } else if (a.attr === 'text') {
      checks.push((node, sf) => {
        const t = node.getText(sf);
        return a.op === '=' ? t === a.value : (a.re as RegExp).test(t);
      });
    } else if (a.attr === 'kind') {
      const kind = KIND_INDEX.get(a.value);
      if (kind === undefined) return { ok: false, error: `未知 kind 值 "${a.value}"` };
      checks.push((node) => node.kind === kind);
    } else {
      return { ok: false, error: `未知属性 "${a.attr}"（支持 name / text / kind）` };
    }
  }
  return {
    ok: true,
    fn: (node, sf) => {
      for (const f of checks) if (!f(node, sf)) return false;
      return true;
    },
  };
}

/** 编译选择器为匹配谓词（最右侧 compound 匹配报告点，'<' 方向为祖先链） */
export function compileSelector(raw: string): { ok: true; matches: (node: ts.Node, sf: ts.SourceFile) => boolean } | { ok: false; error: string } {
  const p = parseSelector(raw);
  if (!p.ok) return p;
  const fns: ((node: ts.Node, sf: ts.SourceFile) => boolean)[] = [];
  for (const c of p.sel.compounds) {
    const r = compileCompound(c);
    if (!r.ok) return r;
    fns.push(r.fn);
  }
  return {
    ok: true,
    matches: (node, sf) => {
      let cur: ts.Node | undefined = node;
      for (let idx = fns.length - 1; idx >= 0; idx--) {
        if (!cur || !fns[idx](cur, sf)) return false;
        cur = cur.parent; // 左侧 compound 匹配直接父节点
      }
      return true;
    },
  };
}

/** 编译一条自定义规则；失败返回错误原因 */
export function compileCustomRule(spec: CustomRuleSpec): { ok: true; rule: CompiledCustomRule } | { ok: false; error: string } {
  if (!spec.name || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(spec.name)) {
    return { ok: false, error: `自定义规则名 "${spec.name}" 非法（需以字母/下划线开头，仅含字母数字 _ -）` };
  }
  if (!spec.message) return { ok: false, error: `规则 ${spec.name} 缺少 message` };
  if (!spec.selector) return { ok: false, error: `规则 ${spec.name} 缺少 selector` };
  const severity: Severity = spec.severity ?? 'error';
  if (severity !== 'error' && severity !== 'warning' && severity !== 'info') {
    return { ok: false, error: `规则 ${spec.name} 的 severity 非法（error | warning | info）` };
  }
  const c = compileSelector(spec.selector);
  if (!c.ok) return { ok: false, error: `规则 ${spec.name} 的 selector 无法解析：${c.error}` };
  return {
    ok: true,
    rule: {
      name: spec.name,
      message: spec.message,
      fix: spec.fix ?? '',
      severity,
      selector: spec.selector,
      matches: c.matches,
    },
  };
}

/** 批量编译；返回全部可用规则与全部错误（不中断，便于一次性报告） */
export function compileCustomRules(specs: readonly CustomRuleSpec[] | undefined): { rules: CompiledCustomRule[]; errors: string[] } {
  if (!specs || specs.length === 0) return { rules: [], errors: [] };
  const rules: CompiledCustomRule[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const s of specs) {
    if (!s || seen.has(s.name)) {
      if (s) errors.push(`自定义规则名重复: ${s.name}`);
      continue;
    }
    seen.add(s.name);
    const r = compileCustomRule(s);
    if (r.ok) rules.push(r.rule);
    else errors.push(r.error);
  }
  return { rules, errors };
}
