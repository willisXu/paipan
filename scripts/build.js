/* 組出可直接發布的單一檔案 dist/paipan.html。
   用 esbuild 把 src/app/main.js 連同它 import 的引擎、介面模組打包成一段腳本，
   和 src/styles.css 一起內嵌進 src/index.html。執行：node scripts/build.js */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

// 頁面從 CDN 載入的函式庫版本，必須和測試用的 node_modules、package.json 是同一版，
// 否則測試驗的和使用者實際跑的就不是同一份程式
const deps = JSON.parse(read('package.json')).dependencies;
const page = read('src/index.html');
for (const name of ['lunar-javascript', 'iztro']) {
  const inPage = (page.match(new RegExp(`cdn\\.jsdelivr\\.net/npm/${name}@([\\d.]+)/`)) || [])[1];
  const installed = require(`${name}/package.json`).version;
  if (inPage !== deps[name] || installed !== deps[name]) throw new Error(`${name} 版本不一致：頁面 ${inPage}、package.json ${deps[name]}、node_modules ${installed}`);
  // 頁尾說明文字裡也寫了版本號，升版時容易漏改
  const mentioned = [...page.matchAll(new RegExp(`${name} (\\d+\\.\\d+\\.\\d+)`, 'g'))].map(m => m[1]);
  if (!mentioned.length || mentioned.some(v => v !== deps[name])) throw new Error(`src/index.html 的說明文字寫的 ${name} 版本（${mentioned.join('、') || '沒寫'}）和 package.json 的 ${deps[name]} 不同`);
}

// 深色配色要寫兩次（跟隨系統的 media query，以及使用者明確選深色的 data-theme），兩段必須一模一樣
const styles = read('src/styles.css');
const darkBlocks = [...styles.matchAll(/\{([^{}]*color-scheme: dark;[^{}]*)\}/g)].map(m => m[1].replace(/\s+/g, ' ').trim());
if (darkBlocks.length !== 2 || darkBlocks[0] !== darkBlocks[1]) throw new Error('src/styles.css 的兩段深色配色不一致（或找不到恰好兩段），請讓 media query 與 [data-theme="dark"] 兩處的內容相同');

// 不壓縮，發布出去的頁面原始碼仍然讀得懂；charset 設 utf8，中文才不會被轉成 \u 跳脫碼
const bundle = await build({
  entryPoints: [path.join(root, 'src/app/main.js')],
  bundle: true, format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none',
  write: false, logLevel: 'silent',
});
// 警告一律當錯誤：例如用了引擎沒有匯出的名字，esbuild 只會警告，但執行時就是 undefined
if (bundle.warnings.length) throw new Error('打包時有警告：\n' + bundle.warnings.map(w => `  ${w.location ? `${w.location.file}:${w.location.line} ` : ''}${w.text}`).join('\n'));

// 佔位標記 → 要內嵌的內容。內容照原樣放入，所以不可出現會提早結束標籤的字串
const parts = {
  '/*@STYLES@*/': { text: styles, forbid: '</style' },
  '/*@APP@*/': { text: bundle.outputFiles[0].text, forbid: '</script' },
};
let out = page;
for (const [mark, { text, forbid }] of Object.entries(parts)) {
  if (out.split(mark).length !== 2) throw new Error(`src/index.html 裡的 ${mark} 標記必須恰好出現一次`);
  if (text.toLowerCase().includes(forbid)) throw new Error(`${mark} 的內容不可含 ${forbid}`);
  out = out.replace(mark, () => text);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'paipan.html');
fs.writeFileSync(file, out);
console.log('已輸出', path.relative(root, file), (fs.statSync(file).size / 1024).toFixed(1) + ' KB');

// 另外輸出一份可以直接放上網站的完整網頁（GitHub Pages 用）。
// dist/paipan.html 是給發布平台的片段，外層骨架由平台補；這裡自己補上同樣的骨架
const shell = '<!doctype html>\n<html lang="zh-Hant">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n</head>\n<body>\n';
fs.mkdirSync(path.join(root, 'dist', 'site'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'site', 'index.html'), shell + out + '</body>\n</html>\n');
console.log('已輸出 dist/site/index.html');
