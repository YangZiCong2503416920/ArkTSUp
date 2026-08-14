/**
 * arktsup template — 样板代码生成器。
 *
 * 用法:
 *   arktsup template page <Name>           生成 @Entry 页面
 *   arktsup template component <Name>      生成可复用组件
 *   arktsup template model <Name> --fields "id:number,name:string" [--style class]
 *                                         生成数据模型
 *   arktsup template state <Name> --fields "count:number,userName:string"
 *                                         生成 @Observed 状态类
 *   arktsup template route-list --dir <pagesDir>
 *                                         扫描页面目录生成路由常量表 RouteConstants.ets
 *
 * 选项:
 *   --dir <dir>        输出目录（默认当前目录）
 *   --out <file>       输出文件名（默认 <Name>.ets / RouteConstants.ets）
 *   --fields <f>       字段列表（model/state 必填），如 "id:number,name:string"
 *   --style <s>        model 风格：interface | class
 *   --overwrite        覆盖已存在的文件
 *   -h, --help         显示帮助
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { TemplateType, parseFields, renderTemplate, renderRouteList, FieldSpec } from '../lib/templates';

export function runTemplate(argv: string[]): number {
  const positional: string[] = [];
  let dir = '.';
  let out: string | undefined;
  let fields: FieldSpec[] = [];
  let style: 'interface' | 'class' = 'interface';
  let overwrite = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dir': dir = argv[++i]; break;
      case '--out': out = argv[++i]; break;
      case '--fields': fields = parseFields(argv[++i]); break;
      case '--style': {
        const v = argv[++i];
        if (v !== 'interface' && v !== 'class') { console.error('错误: --style 只支持 interface | class'); return 2; }
        style = v;
        break;
      }
      case '--overwrite': overwrite = true; break;
      case '-h': case '--help': console.log(HELP); return 0;
      default:
        if (a.startsWith('-')) { console.error(`错误: 未知选项 "${a}"`); console.log(HELP); return 2; }
        positional.push(a);
    }
  }

  const type = positional[0] as TemplateType | undefined;
  const name = positional[1];

  if (!type || !['page', 'component', 'model', 'state', 'route-list'].includes(type)) {
    console.error('错误: 请指定模板类型 page | component | model | state | route-list');
    console.log(HELP);
    return 2;
  }

  let result: { fileName: string; code: string };
  try {
    if (type === 'route-list') {
      const pagesDir = path.resolve(dir);
      if (!fs.existsSync(pagesDir)) {
        console.error(`错误: 目录不存在 ${pagesDir}`);
        return 2;
      }
      const readFile = (rel: string): string => fs.readFileSync(path.join(pagesDir, rel), 'utf8');
      const listFiles = (d: string): string[] => {
        const outArr: string[] = [];
        const walk = (cur: string) => {
          for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
            if (e.isDirectory()) walk(path.join(cur, e.name));
            else if (e.name.endsWith('.ets')) {
              // 返回相对 pagesDir 的路径（forward slash），保证路由路径可预测
              outArr.push(path.relative(d, path.join(cur, e.name)).split(path.sep).join('/'));
            }
          }
        };
        walk(d);
        return outArr;
      };
      result = renderRouteList(pagesDir, readFile, listFiles);
    } else {
      if (!name) {
        console.error(`错误: 缺少模板名称，如 arktsup template ${type} MyPage`);
        return 2;
      }
      result = renderTemplate(type, { name, fields, style });
    }
  } catch (e) {
    console.error(`错误: ${(e as Error).message}`);
    return 2;
  }
  const rl = result as { warnings?: string[] };
  if (rl.warnings) for (const w of rl.warnings) console.error(w);

  const outDir = path.resolve(dir);
  if (!fs.existsSync(outDir)) {
    console.error(`错误: 目录不存在 ${outDir}`);
    return 2;
  }
  const target = path.join(outDir, out ?? result.fileName);
  if (fs.existsSync(target) && !overwrite) {
    console.error(`错误: 文件已存在 ${target}（用 --overwrite 覆盖）`);
    return 2;
  }
  try {
    fs.writeFileSync(target, result.code);
  } catch (e) {
    console.error(`错误: 无法写入 ${target}: ${(e as Error).message}`);
    return 2;
  }
  console.error(`已生成 ${target}`);
  return 0;
}

const HELP = `arktsup template — 样板代码生成器

用法:
  arktsup template page <Name>            生成 @Entry 页面
  arktsup template component <Name>       生成可复用组件（@Prop/@State）
  arktsup template model <Name> --fields "id:number,name:string"
                                         生成数据模型（interface/class）
  arktsup template state <Name> --fields "count:number,userName:string"
                                         生成 @Observed 状态类
  arktsup template route-list --dir <pagesDir>
                                         扫描 @Entry 页面生成 RouteConstants.ets

选项:
  --dir <dir>        输出目录（默认当前目录）
  --out <file>       输出文件名（默认 <Name>.ets / RouteConstants.ets）
  --fields <f>       字段列表（model/state 必填），如 "id:number,name:string"
  --style <s>        model 风格：interface | class（默认 interface）
  --overwrite        覆盖已存在的文件
  -h, --help         显示帮助

示例:
  arktsup template page LoginPage --dir entry/src/main/ets/pages
  arktsup template component UserCard
  arktsup template model User --fields "id:number,name:string,isVip:boolean"
  arktsup template state CartState --fields "items:number,totalPrice:number"
  arktsup template route-list --dir entry/src/main/ets/pages
`;
