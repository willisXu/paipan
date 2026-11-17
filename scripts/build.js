/* 建置。執行：node scripts/build.js
   用 esbuild 把 src/app/main.js 連同它 import 的引擎、介面模組打包成一段腳本，和 src/styles.css 一起內嵌進 src/index.html，輸出兩種成品：
     dist/paipan.html     單一檔案的頁面片段，外層骨架由發布平台補；函式庫從 CDN 載入
     dist/site/           可以直接放上網站的完整網頁（GitHub Pages 用）；函式庫和網頁放在一起，不靠 CDN */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
const libs = []; // 頁面載入的兩個函式庫：CDN 網址，以及它在 node_modules 裡的同一個檔
for (const name of ['lunar-javascript', 'iztro']) {
  const tag = page.match(new RegExp(`<script src="(https://cdn\\.jsdelivr\\.net/npm/${name}@([\\d.]+)/([^"]+))"([^>]*)>`)) || [];
  const [, url, inPage, file, attrs = ''] = tag;
  const installed = require(`${name}/package.json`).version;
  if (inPage !== deps[name] || installed !== deps[name]) throw new Error(`${name} 版本不一致：頁面 ${inPage}、package.json ${deps[name]}、node_modules ${installed}`);
  // 完整性雜湊（SRI）：瀏覽器只執行和這個雜湊相符的檔案，CDN 上的內容被換掉就不會載入。
  // 雜湊要和 node_modules 裡同一個檔相符，也就是和測試驗過的那一份相符；升版時照這裡印出的值更新
  const sri = 'sha384-' + crypto.createHash('sha384').update(fs.readFileSync(path.join(root, 'node_modules', name, file))).digest('base64');
  if (!attrs.includes(`integrity="${sri}"`) || !attrs.includes('crossorigin="anonymous"')) throw new Error(`src/index.html 載入 ${name} 的 <script> 要帶 integrity="${sri}" crossorigin="anonymous"`);
  // 頁尾說明文字裡也寫了版本號，升版時容易漏改
  const mentioned = [...page.matchAll(new RegExp(`${name} (\\d+\\.\\d+\\.\\d+)`, 'g'))].map(m => m[1]);
  if (!mentioned.length || mentioned.some(v => v !== deps[name])) throw new Error(`src/index.html 的說明文字寫的 ${name} 版本（${mentioned.join('、') || '沒寫'}）和 package.json 的 ${deps[name]} 不同`);
  libs.push({ name, url, version: deps[name], from: path.join(root, 'node_modules', name, file), ext: file.endsWith('.min.js') ? '.min.js' : '.js' });
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

/* 另外輸出一份可以直接放上網站的完整網頁（GitHub Pages 用），放在 dist/site/。和上面的片段有三點不同：
   1. 外層骨架自己補，而且 <title>、樣式放進 <head>。片段是整段接在 <body> 後面的，那樣的網頁瀏覽器照樣能開，但不合規格。
   2. 兩個函式庫不走 CDN，改成和網頁放在一起的檔案（同一份檔案、同一個完整性雜湊，授權條款一併附上）：
      少一個外部相依，CDN 連不上的地方也能用。
   3. 補上網站才需要的東西：說明文字、分頁圖示、分享連結時的標題。 */
const siteDir = path.join(root, 'dist', 'site');
fs.rmSync(siteDir, { recursive: true, force: true }); // 整個重建，免得留著上一版的函式庫檔
fs.mkdirSync(path.join(siteDir, 'lib'), { recursive: true });
let site = out;
for (const lib of libs) {
  const local = `lib/${lib.name}-${lib.version}${lib.ext}`;
  if (site.split(lib.url).length !== 2) throw new Error(`頁面裡 ${lib.url} 應該恰好出現一次`);
  site = site.replace(lib.url, local);
  fs.copyFileSync(lib.from, path.join(siteDir, local));
  fs.copyFileSync(path.join(root, 'node_modules', lib.name, 'LICENSE'), path.join(siteDir, 'lib', `${lib.name}-LICENSE.txt`));
}
// 片段開頭到 <header> 之前是 <title>、字型與樣式，屬於 <head>；發布平台專用的那個 meta 網站用不到
const cut = site.indexOf('<header');
if (cut < 0 || site.indexOf('<header', cut + 1) >= 0) throw new Error('src/index.html 應該恰好有一個 <header>，建置靠它分出 <head> 的內容');
const headPart = site.slice(0, cut).replace(/<meta name="claude:[^>]*>\n?/, '').trim();
const DESC = '輸入生辰，同時排出子平八字（四柱、十神、大運流年）與紫微斗數十二宮命盤。只排盤，不解盤。';
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#5A3D6E"/><text x="32" y="47" font-size="42" text-anchor="middle" fill="#fff" font-family="serif">命</text></svg>')}`;
const head = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  `<meta name="description" content="${DESC}">`,
  '<meta name="theme-color" content="#F9FAF9" media="(prefers-color-scheme: light)">',
  '<meta name="theme-color" content="#161D23" media="(prefers-color-scheme: dark)">',
  '<meta property="og:type" content="website">',
  '<meta property="og:locale" content="zh_TW">',
  '<meta property="og:title" content="八字紫微排盤">',
  `<meta property="og:description" content="${DESC}">`,
  `<link rel="icon" href="${ICON}">`,
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  // 和發布平台補的骨架相同的基本樣式；頁面的樣式接在後面
  '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>',
  headPart,
].join('\n');
fs.writeFileSync(path.join(siteDir, 'index.html'), `<!doctype html>\n<html lang="zh-Hant">\n<head>\n${head}\n</head>\n<body>\n${site.slice(cut)}</body>\n</html>\n`);
console.log('已輸出 dist/site/（index.html 與 lib/ 裡的 ' + fs.readdirSync(path.join(siteDir, 'lib')).length + ' 個檔）');
