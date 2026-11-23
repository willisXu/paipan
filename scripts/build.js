/* 建置。執行：node scripts/build.js
   用 esbuild 把 src/app/main.js 連同它 import 的引擎、介面模組打包成一段腳本，和 src/styles.css 一起內嵌進 src/index.html，輸出兩種成品：
     dist/paipan.html     單一檔案的頁面片段，外層骨架由發布平台補；函式庫從 CDN 載入；沒有列印按鈕（平台的檢視框不能列印）
     dist/site/           可以直接放上網站的完整網頁（GitHub Pages 用）；函式庫和網頁放在一起，不靠 CDN；有列印按鈕 */
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

/* 只有網站版才有的內容，在 src/index.html 裡用 <!--@SITE--> 和 <!--@/SITE--> 各佔一行包起來（列印按鈕和它的說明）：
   發布平台的檢視框不允許開列印對話框，所以片段裡整段拿掉；網站版留著內容，只拿掉這兩行標記 */
const SITE_BLOCK = /^[ \t]*<!--@SITE-->\n([\s\S]*?)^[ \t]*<!--@\/SITE-->\n/gm;
const siteBlocks = (page.match(SITE_BLOCK) || []).length;
if (!siteBlocks || page.split('<!--@SITE-->').length - 1 !== siteBlocks || page.split('<!--@/SITE-->').length - 1 !== siteBlocks) {
  throw new Error('src/index.html 的 <!--@SITE--> 和 <!--@/SITE--> 要成對、各自獨佔一行');
}

// 佔位標記 → 要內嵌的內容。內容照原樣放入，所以不可出現會提早結束標籤的字串
const parts = {
  '/*@STYLES@*/': { text: styles, forbid: '</style' },
  '/*@APP@*/': { text: bundle.outputFiles[0].text, forbid: '</script' },
};
function inline(html) {
  for (const [mark, { text, forbid }] of Object.entries(parts)) {
    if (html.split(mark).length !== 2) throw new Error(`src/index.html 裡的 ${mark} 標記必須恰好出現一次`);
    if (text.toLowerCase().includes(forbid)) throw new Error(`${mark} 的內容不可含 ${forbid}`);
    html = html.replace(mark, () => text);
  }
  return html;
}
const out = inline(page.replace(SITE_BLOCK, ''));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'paipan.html');
fs.writeFileSync(file, out);
console.log('已輸出', path.relative(root, file), (fs.statSync(file).size / 1024).toFixed(1) + ' KB');

/* 另外輸出一份可以直接放上網站的完整網頁（GitHub Pages 用），放在 dist/site/。和上面的片段有四點不同：
   1. 外層骨架自己補，而且 <title>、樣式放進 <head>。片段是整段接在 <body> 後面的，那樣的網頁瀏覽器照樣能開，但不合規格。
   2. 兩個函式庫不走 CDN，改成和網頁放在一起的檔案（同一份檔案、同一個完整性雜湊，授權條款一併附上）：
      少一個外部相依，CDN 連不上的地方也能用。
   3. 補上網站才需要的東西：說明文字、分頁圖示、分享連結時的標題。
   4. 留著 @SITE 區塊的內容（列印按鈕和說明）。 */
const siteDir = path.join(root, 'dist', 'site');
fs.rmSync(siteDir, { recursive: true, force: true }); // 整個重建，免得留著上一版的函式庫檔
fs.mkdirSync(path.join(siteDir, 'lib'), { recursive: true });
let site = inline(page.replace(SITE_BLOCK, '$1'));
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
const DESC = '輸入生辰，同時排出子平八字（四柱、十神、大運流年流月）與紫微斗數十二宮命盤，並照規則寫出讀盤紀錄與星曜解讀。可以加到主畫面，沒有網路也能排盤。';
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
  // 網頁 App（第 13 版）：manifest 與主畫面圖示。iOS 從 manifest 讀名稱、圖示、獨立視窗；主畫面上的名稱另外給短的
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  '<meta name="apple-mobile-web-app-title" content="排盤">',
  '<meta name="mobile-web-app-capable" content="yes">',
  // 和發布平台補的骨架相同的基本樣式（含瀏海、Home 指示條的安全區域）；頁面的樣式接在後面
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>',
  headPart,
].join('\n');
fs.writeFileSync(path.join(siteDir, 'index.html'), `<!doctype html>\n<html lang="zh-Hant">\n<head>\n${head}\n</head>\n<body>\n${site.slice(cut)}</body>\n</html>\n`);

/* 網頁 App（第 13 版）：主畫面圖示、manifest、service worker，只有網站版有。
   圖示由 scripts/icons.js 產生、提交在 src/icons/，這裡只複製。service worker 的原始檔是 src/sw.js：
   把要預先快取的檔案清單，和這些檔案內容的雜湊（版本）填進去；任何一個檔變了，sw.js 就跟著變，瀏覽器才會裝新版本 */
const icons = fs.readdirSync(path.join(root, 'src', 'icons')).filter(f => f.endsWith('.png')).sort();
const ICON_SIZES = { 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512, 'maskable-512.png': 512 };
if (JSON.stringify(icons) !== JSON.stringify(Object.keys(ICON_SIZES).sort())) throw new Error(`src/icons/ 的圖示應該是 ${Object.keys(ICON_SIZES).join('、')}，現在是 ${icons.join('、')}。用 node scripts/icons.js 重新產生`);
fs.mkdirSync(path.join(siteDir, 'icons'));
for (const f of icons) {
  const png = fs.readFileSync(path.join(root, 'src', 'icons', f));
  if (png.readUInt32BE(16) !== ICON_SIZES[f] || png.readUInt32BE(20) !== ICON_SIZES[f]) throw new Error(`src/icons/${f} 應該是 ${ICON_SIZES[f]}×${ICON_SIZES[f]}`);
  fs.writeFileSync(path.join(siteDir, 'icons', f), png);
}
const manifest = {
  id: './', name: '八字紫微排盤', short_name: '排盤', description: DESC, lang: 'zh-Hant', dir: 'ltr',
  start_url: './', scope: './', display: 'standalone', background_color: '#ECEFED', theme_color: '#F9FAF9', categories: ['education', 'utilities'],
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
  ],
};
fs.writeFileSync(path.join(siteDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
// 預先快取：頁面（網站的根，也就是 index.html）、manifest、兩個函式庫、四個圖示。授權條款不必離線
const precache = ['./', 'manifest.webmanifest', ...libs.map(l => `lib/${l.name}-${l.version}${l.ext}`), ...icons.map(f => `icons/${f}`)];
const fileOf = p => path.join(siteDir, p === './' ? 'index.html' : p);
const shipped = fs.readdirSync(siteDir, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => /\.(html|js|png|webmanifest)$/.test(f) && f !== 'sw.js');
const notCached = shipped.filter(f => !precache.map(p => (p === './' ? 'index.html' : p)).includes(f));
if (notCached.length) throw new Error(`網站裡有檔案沒有預先快取，離線時會缺：${notCached.join('、')}`);
const hash = crypto.createHash('sha256');
for (const p of precache) hash.update(p).update('\0').update(fs.readFileSync(fileOf(p)));
const version = hash.digest('hex').slice(0, 12);
const swSrc = read('src/sw.js');
for (const mark of ["'/*@VERSION@*/'", '[/*@PRECACHE@*/]']) if (swSrc.split(mark).length !== 2) throw new Error(`src/sw.js 裡的 ${mark} 標記必須恰好出現一次`);
fs.writeFileSync(path.join(siteDir, 'sw.js'), swSrc.replace("'/*@VERSION@*/'", `'${version}'`).replace('[/*@PRECACHE@*/]', `[${precache.map(p => `'${p}'`).join(', ')}]`));
console.log('已輸出 dist/site/（index.html、lib/ 裡的 ' + fs.readdirSync(path.join(siteDir, 'lib')).length + ' 個檔、' + icons.length + ' 個圖示、manifest、service worker 版本 ' + version + '）');
