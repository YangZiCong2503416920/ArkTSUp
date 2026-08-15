#!/usr/bin/env node
/**
 * arktsup — 给 ArkTS 提效的命令行小工具集
 *
 *   arktsup json2ts <file.json>    JSON -> 符合 ArkTS 限制的类型声明
 *   arktsup check [path]           扫描 .ets 中的 ArkTS 不兼容写法
 */

import { runJson2Ts } from './commands/json2ts';
import { runCheck } from './commands/check';
import { runTemplate } from './commands/template';
import { runResource } from './commands/resource';
import { runMigrate } from './commands/migrate';

// 版本号与 package.json 保持同步（npm 安装后从包内读取）
const VERSION: string = (() => {
  try { return require('../../package.json').version; } catch { return '0.1.0'; }
})();

const HELP = `arktsup v${VERSION} — 给 ArkTS 提效的命令行小工具集

用法:
  arktsup <command> [options]

命令:
  json2ts   把 JSON 转成符合 ArkTS 限制的类型声明（interface/class）
  check     扫描 .ets 源码中的 ArkTS 不兼容写法
  template  生成页面/组件/数据模型/路由常量表等样板代码
  resource  HarmonyOS 资源文件管理：缺失引用检查、R.ets 常量生成、条目添加
  migrate   废弃 API 迁移：@ohos.* -> @kit.* 检测与自动修复

通用:
  -h, --help      显示帮助
  -v, --version   显示版本

示例:
  arktsup json2ts api/user.json --name User --out src/model/User.ets
  arktsup json2ts < data.json
  arktsup check src/main/ets
`;

function main(): number {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(HELP);
    return 0;
  }
  const [cmd, ...rest] = args;
  switch (cmd) {
    case 'json2ts': return runJson2Ts(rest);
    case 'check': return runCheck(rest);
    case 'template': return runTemplate(rest);
    case 'resource': return runResource(rest);
    case 'migrate': return runMigrate(rest);
    case '-h': case '--help': console.log(HELP); return 0;
    case '-v': case '--version': console.log(VERSION); return 0;
    default:
      console.error(`错误: 未知命令 "${cmd}"`);
      console.log(HELP);
      return 2;
  }
}

process.exit(main());
