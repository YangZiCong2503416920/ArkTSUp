// 打包辅助：清理旧的编译产物，避免把过期的 out/ 打进 .vsix。
const fs = require('node:fs');
const path = require('node:path');
const outDir = path.join(__dirname, '..', 'out');
fs.rmSync(outDir, { recursive: true, force: true });
console.log('out/ 已清理');
