/**
 * templates — 样板代码生成器。
 *
 * 生成 ArkTS 合规的页面/组件/数据模型/状态类/路由常量表。
 * 所有模板遵守 ArkTS 限制：无 any、无对象字面量无类型、类字段有初值（strictPropertyInitialization）。
 */

export type TemplateType = 'page' | 'component' | 'dialog' | 'model' | 'state' | 'route-list';

export interface FieldSpec {
  name: string;
  type: string;
}

export interface TemplateOptions {
  /** 类型名（PascalCase） */
  name?: string;
  /** 字段列表（model/state 用）：'id:number' 或 'id:number,name:string' */
  fields?: FieldSpec[];
  /** 输出目录，默认当前目录 */
  dir?: string;
  /** 输出文件名，默认 <Name>.ets / RouteConstants.ets */
  out?: string;
  /** model 风格：interface | class */
  style?: 'interface' | 'class';
}

export interface TemplateResult {
  fileName: string;
  code: string;
  /** route-list 等场景的警告（如同名 struct 冲突） */
  warnings?: string[];
}

function pascal(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, ' ').trim();
  if (!cleaned) return 'Component';
  return cleaned.split(/\s+/).map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

/** 校验类型名是合法 ArkTS 标识符，否则抛错 */
function assertValidName(name: string, kind: string): void {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(`${kind}名 '${name}' 不是合法标识符（应以字母/下划线开头，仅含字母/数字/下划线）`);
  }
}

/** 解析 'id:number,name:string' 形式的字段串 */
export function parseFields(input: string | undefined): FieldSpec[] {
  if (!input) return [];
  return input.split(',').map((f) => f.trim()).filter(Boolean).map((f) => {
    const idx = f.indexOf(':');
    if (idx < 0) return { name: f, type: 'string' };
    return { name: f.slice(0, idx).trim(), type: f.slice(idx + 1).trim() };
  });
}

/** 字段类型对应的 ArkTS 默认值 */
function defaultValue(type: string): string {
  const t = type.replace(/\s*\|\s*null$/, '').replace(/\[\]$/, '');
  switch (t) {
    case 'number': case 'int': case 'double': return '0';
    case 'boolean': return 'false';
    case 'string': case 'String': return "''";
    default: return 'new ' + t + '()';
  }
}

export function renderTemplate(type: TemplateType, opts: TemplateOptions): TemplateResult {
  const name = pascal(opts.name ?? 'Sample');
  const fields = opts.fields ?? [];
  assertValidName(name, '类型');
  for (const f of fields) {
    assertValidName(f.name, '字段');
  }

  switch (type) {
    case 'page':
      return {
        fileName: name + '.ets',
        code: pageTemplate(name),
      };
    case 'component':
      return {
        fileName: name + '.ets',
        code: componentTemplate(name),
      };
    case 'dialog':
      return {
        fileName: name + '.ets',
        code: dialogTemplate(name),
      };
    case 'model':
      return {
        fileName: name + '.ets',
        code: modelTemplate(name, fields, opts.style ?? 'interface'),
      };
    case 'state':
      return {
        fileName: name + '.ets',
        code: stateTemplate(name, fields),
      };
    case 'route-list': {
      throw new Error('route-list 需要扫描目录，请使用 renderRouteList()');
    }
  }
}

function pageTemplate(name: string): string {
  return [
    "import { router } from '@kit.ArkUI';",
    '',
    '@Entry',
    '@Component',
    'struct ' + name + ' {',
    "  @State message: string = 'Hello " + name + "';",
    '',
    '  build() {',
    '    Column({ space: 12 }) {',
    '      Text(this.message)',
    '        .fontSize(24)',
    '        .fontWeight(FontWeight.Bold)',
    '        .textAlign(TextAlign.Center)',
    '',
    "      Button('返回')",
    '        .onClick(() => {',
    '          router.back();',
    '        })',
    '    }',
    "    .width('100%')",
    "    .height('100%')",
    '    .justifyContent(FlexAlign.Center)',
    '  }',
    '}',
    '',
  ].join('\n');
}

function componentTemplate(name: string): string {
  return [
    '@Component',
    'export struct ' + name + ' {',
    "  @Prop title: string = '';",
    '  @State count: number = 0;',
    '',
    '  build() {',
    '    Column({ space: 8 }) {',
    '      Text(this.title)',
    '        .fontSize(20)',
    '        .fontWeight(FontWeight.Medium)',
    '',
    '      Button(this.count.toString())',
    '        .onClick(() => {',
    '          this.count++;',
    '        })',
    '    }',
    '    .padding(16)',
    '  }',
    '}',
    '',
  ].join('\n');
}

function dialogTemplate(name: string): string {
  return [
    '@CustomDialog',
    'export struct ' + name + ' {',
    '  controller: CustomDialogController;',
    "  @Prop message: string = '';",
    "  @Prop onConfirm: (() => void) | null = null;",
    '',
    '  build() {',
    '    Column({ space: 16 }) {',
    '      Text(this.message)',
    '        .fontSize(18)',
    '        .fontWeight(FontWeight.Medium)',
    '        .textAlign(TextAlign.Center)',
    '',
    '      Row({ space: 16 }) {',
    "        Button('取消')",
    '          .backgroundColor(Color.Gray)',
    '          .onClick(() => {',
    '            this.controller.close();',
    '          })',
    '',
    "        Button('确定')",
    '          .onClick(() => {',
    '            this.onConfirm?.();',
    '            this.controller.close();',
    '          })',
    '      }',
    '    }',
    '    .padding(24)',
    '  }',
    '}',
    '',
  ].join('\n');
}

function modelTemplate(name: string, fields: FieldSpec[], style: 'interface' | 'class'): string {
  if (fields.length === 0) {
    throw new Error('model 模板需要 --fields "a:number,b:string"，如：arktsup template model User --fields "id:number,name:string"');
  }
  if (style === 'class') {
    const lines = ['export class ' + name + ' {'];
    for (const f of fields) {
      lines.push('  ' + f.name + ': ' + f.type + ' = ' + defaultValue(f.type) + ';');
    }
    lines.push('}', '');
    return lines.join('\n');
  }
  const lines = ['export interface ' + name + ' {'];
  for (const f of fields) {
    lines.push('  ' + f.name + ': ' + f.type);
  }
  lines.push('}', '');
  return lines.join('\n');
}

function stateTemplate(name: string, fields: FieldSpec[]): string {
  if (fields.length === 0) {
    throw new Error('state 模板需要 --fields，如：arktsup template state AppState --fields "count:number,userName:string"');
  }
  const lines = [
    '@Observed',
    'export class ' + name + ' {',
  ];
  for (const f of fields) {
    lines.push('  ' + f.name + ': ' + f.type + ' = ' + defaultValue(f.type) + ';');
  }
  lines.push('}', '');
  return lines.join('\n');
}

/** 扫描目录中的 @Entry 页面并生成路由常量表（RouteConstants.ets） */
export function renderRouteList(pagesDir: string, readFile: (p: string) => string, listFiles: (d: string) => string[]): TemplateResult {
  const files = listFiles(pagesDir).filter((f) => f.endsWith('.ets'));
  const entries: { name: string; path: string }[] = [];
  for (const f of files) {
    const text = readFile(f);
    if (!text.includes('@Entry')) continue;
    const m = /struct\s+([A-Za-z_$][A-Za-z0-9_$]*)/.exec(text);
    if (!m) continue;
    const rel = f.replace(/\\/g, '/').replace(/^\.\//, '');
    entries.push({ name: m[1], path: '/' + rel.replace(/\.ets$/, '') });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  // 同名 struct 去重：保留第一个，警告其余（重复成员无法编译）
  const seen = new Set<string>();
  const warnings: string[] = [];
  const unique: typeof entries = [];
  for (const e of entries) {
    if (seen.has(e.name)) {
      warnings.push(`警告: struct '${e.name}' 在多个文件中出现（${e.path}），路由表只保留第一处，请重命名页面`);
      continue;
    }
    seen.add(e.name);
    unique.push(e);
  }
  const lines = [
    '/**',
    ' * 路由常量表（由 arktsup template route-list 生成，请勿手改；页面增删后重新生成）',
    ' */',
    'export class RouteConstants {',
  ];
  for (const e of unique) {
    lines.push("  static readonly " + e.name + " = '" + e.path + "';");
  }
  lines.push('}', '');
  return { fileName: 'RouteConstants.ets', code: lines.join('\n'), warnings };
}
