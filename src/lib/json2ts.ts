/**
 * json2ts — 把 JSON 转成符合 ArkTS 限制的类型声明（interface / class）。
 *
 * ArkTS 限制适配：
 *  - 不使用 any / 任意联合类型；类型冲突时回退到 unknown 并给警告
 *  - 只生成 null/undefined 参与的联合（ArkTS 允许 T | null）
 *  - 对象字面量必须显式声明类型 -> 这里直接生成具名 interface/class
 *  - 不生成索引签名、泛型默认值等 ArkTS 不支持的写法
 *
 * 设计：字段类型基于"所有样本值"推断（对象数组合并键、可选字段、可空字段），
 * 而不是按对象身份一一对应，避免同构数组元素被误判为混合类型。
 */

export type TypeStyle = 'interface' | 'class';

export interface Json2TsOptions {
  /** 根类型名，默认 'Root' */
  rootName?: string;
  /** 输出风格：interface（默认）或 class */
  style?: TypeStyle;
  /** 缩进空格数，默认 2 */
  indent?: number;
  /** 字段按字母排序，默认 false（保留 JSON 顺序） */
  sort?: boolean;
  /** 所有字段标记为可选，默认 false */
  optional?: boolean;
  /** 最大嵌套深度（防止异常数据爆栈），默认 20 */
  maxDepth?: number;
}

export interface Json2TsResult {
  /** 生成的 ArkTS 代码 */
  code: string;
  /** 生成过程中的警告（类型冲突、空数组等） */
  warnings: string[];
  /** 生成的类型名（按定义顺序） */
  typeNames: string[];
}

const RESERVED = new Set(['Root', 'Object', 'String', 'Number', 'Boolean', 'Array', 'Function']);

/** 安全单数化（带长度保护，避免 list->lis 这类误伤） */
function singularize(key: string): string {
  if (/ies$/i.test(key)) return key.slice(0, -3) + 'y';
  if (/sses$/i.test(key)) return key.slice(0, -2);
  if (key.length <= 4) return key;
  if (/ss$/i.test(key)) return key;
  if (/s$/i.test(key) && !/us$/i.test(key)) return key.slice(0, -1);
  return key;
}

/** 强制单数化（根数组用，不设长度保护） */
function singularizeForce(key: string): string {
  if (/ies$/i.test(key)) return key.slice(0, -3) + 'y';
  if (/sses$/i.test(key)) return key.slice(0, -2);
  if (/ss$/i.test(key)) return key;
  if (/s$/i.test(key) && !/us$/i.test(key)) return key.slice(0, -1);
  return key;
}

interface PendingType {
  name: string;
  /** key -> { samples: 该 key 观察到的所有值; optional: 是否在部分样本中缺失 } */
  fields: Map<string, { samples: unknown[]; optional: boolean }>;
  depth: number;
}

interface Resolved {
  type: string;
  nullable: boolean;
}

export function jsonToArkTs(input: unknown, options: Json2TsOptions = {}): Json2TsResult {
  const style = options.style ?? 'interface';
  const indent = options.indent ?? 2;
  const sort = options.sort ?? false;
  const allOptional = options.optional ?? false;
  const maxDepth = options.maxDepth ?? 20;
  const warnings: string[] = [];
  const typeNames: string[] = [];
  const ind = (n: number): string => ' '.repeat(n * indent);

  const pending: PendingType[] = [];
  const usedNames = new Set<string>(RESERVED);
  // 对象身份 -> 已登记类型名（支持共享引用与递归结构，防止无限展开）
  const registered = new Map<object, string>();

  function pascal(part: string): string {
    const cleaned = part.replace(/[^A-Za-z0-9_$]/g, ' ').trim();
    if (!cleaned) return '';
    return cleaned
      .split(/\s+/)
      .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
      .join('');
  }

  function uniqueName(base: string): string {
    let name = pascal(base) || 'Type';
    if (!/^[A-Za-z_$]/.test(name)) name = '_' + name;
    let candidate = name;
    let i = 2;
    while (usedNames.has(candidate)) {
      candidate = name + i;
      i++;
    }
    usedNames.add(candidate);
    return candidate;
  }

  function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
  }

  /**
   * 根据一组样本值推断字段类型。
   *  - 样本含 null/undefined -> nullable
   *  - 对象 -> 合并所有样本的键（缺失键标可选），注册一个具名类型
   *  - 数组 -> 拍平元素递归推断，元素可空时生成 (T | null)[]
   *  - 混合类型 -> unknown + 警告
   */
  function resolveSamples(samples: unknown[], hint: string, depth: number): Resolved {
    const nonNull: unknown[] = [];
    for (const s of samples) {
      if (s !== null && s !== undefined) nonNull.push(s);
    }
    const nullable = nonNull.length !== samples.length;
    if (nonNull.length === 0) return { type: 'null', nullable: true };

    const kinds = new Set<string>();
    for (const v of nonNull) kinds.add(Array.isArray(v) ? 'array' : typeof v);
    if (kinds.size > 1) {
      // ArkTS 支持任意联合类型：按实际出现的类型生成联合（如 number | string）
      const parts: string[] = [];
      const seen = new Set<string>();
      for (const v of nonNull) {
        const r = resolveSamples([v], hint, depth + 1);
        if (!seen.has(r.type) && r.type !== 'null') {
          seen.add(r.type);
          parts.push(r.type);
        }
      }
      if (parts.length === 0) return { type: 'Object', nullable };
      if (parts.length > 4) {
        warnings.push(`警告: 字段 ${hint} 混合类型过多 (${parts.join(', ')}...)，已回退为 Object`);
        return { type: 'Object', nullable };
      }
      return { type: parts.join(' | '), nullable };
    }
    const kind = [...kinds][0];

    if (kind === 'array') {
      if (depth > maxDepth) {
        warnings.push("警告: " + hint + " 嵌套深度超过 " + maxDepth + "，已用 Object[] 截断");
        return { type: 'Object[]', nullable };
      }
      const elements: unknown[] = [];
      for (const v of nonNull) elements.push(...(v as unknown[]));
      const inner = resolveSamples(elements, singularize(hint), depth + 1);
      if (inner.type === 'null') {
        warnings.push(`警告: 数组 ${hint} 元素为空或全为 null，无法推断元素类型，已生成 Object[]，请替换为具体类型`);
        return { type: 'Object[]', nullable };
      }
      let itemType = inner.type;
      if (inner.nullable && inner.type !== 'null') itemType = `(${inner.type} | null)`;
      else if (itemType.includes(' | ')) itemType = `(${itemType})`;
      return { type: `${itemType}[]`, nullable };
    }

    if (kind === 'object') {
      // 所有样本都已被登记（递归/共享引用再次出现）：若为同一类型名则直接复用
      if (nonNull.every((v) => registered.has(v as object))) {
        const names = new Set(nonNull.map((v) => registered.get(v as object)!));
        if (names.size === 1) return { type: [...names][0], nullable };
        warnings.push(`警告: 字段 ${hint} 引用了多个已定义类型 (${[...names].join(', ')})，已回退为 unknown`);
        return { type: 'unknown', nullable };
      }
      if (depth > maxDepth) {
        warnings.push(`警告: ${hint} 嵌套深度超过 ${maxDepth}，已用 Record<string, Object> 截断`);
        return { type: 'Record<string, Object>', nullable };
      }
      const fields = new Map<string, { samples: unknown[]; optional: boolean }>();
      const total = nonNull.length;
      const counts = new Map<string, number>();
      for (const v of nonNull) {
        const obj = v as Record<string, unknown>;
        for (const [k, val] of Object.entries(obj)) {
          const arr = fields.get(k);
          if (arr) {
            arr.samples.push(val);
            counts.set(k, (counts.get(k) ?? 1) + 1);
          } else {
            fields.set(k, { samples: [val], optional: false });
            counts.set(k, 1);
          }
        }
      }
      for (const [k, c] of counts) {
        if (c < total) {
          const f = fields.get(k)!;
          f.optional = true;
        }
      }
      const name = uniqueName(hint);
      for (const v of nonNull) registered.set(v as object, name);
      pending.push({ name, fields, depth });
      return { type: name, nullable };
    }

    if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') {
      return { type: kind, nullable };
    }
    warnings.push(`警告: 字段 ${hint} 存在无法映射的类型 ${kind}，已回退为 Object`);
    return { type: 'Object', nullable };
  }

  function emitBlocks(): string {
    const blocks: string[] = [];
    while (pending.length > 0) {
      const { name, fields, depth } = pending.shift()!;
      let keys = [...fields.keys()];
      if (sort) keys = keys.sort((a, b) => a.localeCompare(b));
      const fieldLines: string[] = [];
      for (const key of keys) {
        const { samples, optional } = fields.get(key)!;
        const resolved = resolveSamples(samples, pascal(key), depth + 1);
        const isOpt = allOptional || optional || resolved.nullable;
        const q = isOpt ? '?' : '';
        // ArkTS 不支持非标识符属性名（arkts-identifiers-as-prop-names），非法键名转换为合法标识符
        let safeKey = key;
        if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
          safeKey = key.replace(/[^A-Za-z0-9_$]/g, '_');
          if (!/^[A-Za-z_$]/.test(safeKey)) safeKey = '_' + safeKey;
          warnings.push(`警告: 字段名 '${key}' 不是合法标识符，已转换为 '${safeKey}'（注意与后端字段名的对应关系）`);
        }
        const type = resolved.nullable && resolved.type !== 'null'
          ? `${resolved.type} | null`
          : resolved.type;
        fieldLines.push(`${ind(1)}${safeKey}${q}: ${type}`);
      }
      const decl = style === 'class' ? `export class ${name} {` : `export interface ${name} {`;
      blocks.push([decl, ...fieldLines, ind(0) + '}'].join('\n'));
      typeNames.push(name);
    }
    return blocks.length ? blocks.join('\n\n') + '\n' : '';
  }

  // ---------- 根节点处理 ----------
  const rootName = uniqueName(options.rootName ?? 'Root');
  let rootAlias: string | null = null;

  if (Array.isArray(input)) {
    const itemHint = singularizeForce(rootName) === rootName ? rootName + 'Item' : singularizeForce(rootName);
    const inner = resolveSamples(input, itemHint, 0);
    rootAlias = (inner.type === 'null' ? 'Object' : inner.type) + '[]';
  } else if (isPlainObject(input)) {
    const fields = new Map<string, { samples: unknown[]; optional: boolean }>();
    for (const [k, v] of Object.entries(input)) fields.set(k, { samples: [v], optional: false });
    registered.set(input, rootName);
    pending.push({ name: rootName, fields, depth: 0 });
  } else {
    const inner = resolveSamples([input], rootName, 0);
    rootAlias = inner.type;
  }

  const blocks = emitBlocks();
  if (rootAlias !== null) {
    return {
      code: `export type ${rootName} = ${rootAlias}\n` + (blocks ? '\n' + blocks : ''),
      warnings,
      typeNames: [rootName, ...typeNames],
    };
  }
  return { code: blocks, warnings, typeNames };
}
