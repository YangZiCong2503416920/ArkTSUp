/**
 * 打包辅助：把 arktsup 构建产物 dist/src 复制到插件 lib/，使 .vsix 自包含。
 */
const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, '..', '..', 'dist', 'src');
const dst = path.join(__dirname, '..', 'lib');
if (!fs.existsSync(src)) {
  console.error('未找到 ' + src + '，请先在项目根目录执行 npm run build');
  process.exit(1);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
function copyDir(s, d) {
  for (const e of fs.readdirSync(s, { withFileTypes: true })) {
    if (e.isDirectory()) {
      fs.mkdirSync(path.join(d, e.name), { recursive: true });
      copyDir(path.join(s, e.name), path.join(d, e.name));
    } else {
      fs.copyFileSync(path.join(s, e.name), path.join(d, e.name));
    }
  }
}
copyDir(src, dst);
console.log('lib/ 已就绪（' + dst + '）');
