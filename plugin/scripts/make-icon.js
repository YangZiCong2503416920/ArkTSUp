// 生成插件图标 plugin/icon.png（128x128 PNG，零依赖：node:zlib 手写 PNG 编码）
// 设计：深蓝渐变底 + 白色上箭头 + 青色底杠（ArkTSUp 的 “Up”）
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 128;
const R = 22; // 圆角半径

// ---- 像素绘制 ----
const px = new Uint8Array(SIZE * SIZE * 4); // RGBA

function inside(x, y) {
  // 圆角矩形
  const cx = Math.min(Math.max(x, R), SIZE - 1 - R);
  const cy = Math.min(Math.max(y, R), SIZE - 1 - R);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= R * R;
}
function inTri(px_, py_, ax, ay, bx, by, cx, cy) {
  const d1 = (px_ - bx) * (ay - by) - (ax - bx) * (py_ - by);
  const d2 = (px_ - cx) * (by - cy) - (bx - cx) * (py_ - cy);
  const d3 = (px_ - ax) * (cy - ay) - (cx - ax) * (py_ - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

// 顶部亮、底部暗的渐变
const top = [20, 50, 79];   // #14324F
const bot = [8, 24, 44];    // #08182C
const white = [255, 255, 255];
const accent = [79, 195, 247]; // #4FC3F7

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    if (!inside(x, y)) { px[i + 3] = 0; continue; }
    const t = y / (SIZE - 1);
    let c = [
      Math.round(top[0] + (bot[0] - top[0]) * t),
      Math.round(top[1] + (bot[1] - top[1]) * t),
      Math.round(top[2] + (bot[2] - top[2]) * t)
    ];
    // 上箭头：三角头 (32,58) (64,24) (96,58) + 杆 x∈[58,70] y∈[52,98]
    if (inTri(x, y, 32, 58, 64, 24, 96, 58)) c = white;
    else if (x >= 58 && x <= 70 && y >= 52 && y <= 98) c = white;
    // 底杠：y∈[104,112] x∈[30,98]
    else if (y >= 104 && y <= 112 && x >= 30 && x <= 98) c = accent;
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
}

// ---- PNG 编码 ----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  raw[y * (1 + SIZE * 4)] = 0; // filter: none
  px.subarray(y * SIZE * 4, (y + 1) * SIZE * 4).forEach((v, j) => { raw[y * (1 + SIZE * 4) + 1 + j] = v; });
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);
const outFile = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(outFile, png);
console.log('icon.png 已生成: ' + outFile + ' (' + png.length + ' bytes)');
