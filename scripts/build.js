/* 建置。執行：node scripts/build.js
   用 esbuild 把 src/app/main.js 連同它 import 的引擎、介面模組打包成一段腳本，和 src/styles.css 一起內嵌進 src/index.html，輸出三種成品：
     dist/paipan.html     單一檔案的頁面片段，外層骨架由發布平台補；函式庫從 CDN 載入；沒有列印按鈕（平台的檢視框不能列印）
     dist/site/           可以直接放上網站的完整網頁（GitHub Pages 用）；函式庫和網頁放在一起，不靠 CDN；有列印按鈕
     dist/app/            iPhone、iPad App 裡的網頁（第 14 版，npx cap sync ios 複製進 Xcode 專案）；完全不連網路，字型自帶；列印、存檔備份接到原生 */
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

/* 不壓縮，發布出去的頁面原始碼仍然讀得懂；charset 設 utf8，中文才不會被轉成 \u 跳脫碼。
   App 版另外打包一次：src/app/platform.js 換成 platform-app.js（列印開 iOS 的列印面板、存起來的盤在原生那邊留備份），其餘完全相同 */
async function bundle({ app = false } = {}) {
  const result = await build({
    entryPoints: [path.join(root, 'src/app/main.js')],
    bundle: true, format: 'iife', target: 'es2020', charset: 'utf8', legalComments: 'none',
    write: false, logLevel: 'silent',
    plugins: app ? [{ name: 'platform-app', setup(b) { b.onResolve({ filter: /^\.\/platform\.js$/ }, a => ({ path: path.join(a.resolveDir, 'platform-app.js') })); } }] : [],
  });
  // 警告一律當錯誤：例如用了引擎沒有匯出的名字，esbuild 只會警告，但執行時就是 undefined
  if (result.warnings.length) throw new Error('打包時有警告：\n' + result.warnings.map(w => `  ${w.location ? `${w.location.file}:${w.location.line} ` : ''}${w.text}`).join('\n'));
  return result.outputFiles[0].text;
}
const webScript = await bundle();
const appScript = await bundle({ app: true });
if (webScript.includes('PaipanApp') || !appScript.includes('"PaipanApp"')) throw new Error('App 版的腳本應該換成 platform-app.js（原生外掛 PaipanApp），網頁版不應該有');

/* 只給某幾種成品的內容，在 src/index.html 裡用成對的標記包起來，標記各自獨佔一行：
     <!--@SITE--> … <!--@/SITE-->  網站版和 App 版都有：列印按鈕（發布平台的檢視框不允許開列印對話框，片段裡整段拿掉）
     <!--@WEB--> … <!--@/WEB-->    只有網站版：講瀏覽器列印對話框的說明
     <!--@APP--> … <!--@/APP-->    只有 App 版：講 iOS 列印面板的說明、資料存在哪裡、開放原始碼授權
   留下的只拿掉標記那兩行，不留的連內容整段拿掉。標記不可以套疊 */
const BLOCKS = ['SITE', 'WEB', 'APP'];
const blockRe = name => new RegExp(`^[ \\t]*<!--@${name}-->\\n([\\s\\S]*?)^[ \\t]*<!--@\\/${name}-->\\n`, 'gm');
for (const name of BLOCKS) {
  const n = (page.match(blockRe(name)) || []).length;
  if (!n || page.split(`<!--@${name}-->`).length - 1 !== n || page.split(`<!--@/${name}-->`).length - 1 !== n) {
    throw new Error(`src/index.html 的 <!--@${name}--> 和 <!--@/${name}--> 要成對、各自獨佔一行`);
  }
}
function keepBlocks(html, keep) {
  for (const name of BLOCKS) html = html.replace(blockRe(name), keep.includes(name) ? '$1' : '');
  if (/<!--@\/?(SITE|WEB|APP)-->/.test(html)) throw new Error('src/index.html 的 @SITE、@WEB、@APP 區塊不可以套疊');
  return html;
}

// 佔位標記 → 要內嵌的內容。內容照原樣放入，所以不可出現會提早結束標籤的字串
function inline(html, script) {
  const parts = {
    '/*@STYLES@*/': { text: styles, forbid: '</style' },
    '/*@APP@*/': { text: script, forbid: '</script' },
  };
  for (const [mark, { text, forbid }] of Object.entries(parts)) {
    if (html.split(mark).length !== 2) throw new Error(`src/index.html 裡的 ${mark} 標記必須恰好出現一次`);
    if (text.toLowerCase().includes(forbid)) throw new Error(`${mark} 的內容不可含 ${forbid}`);
    html = html.replace(mark, () => text);
  }
  return html;
}
const out = inline(keepBlocks(page, []), webScript);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'paipan.html');
fs.writeFileSync(file, out);
console.log('已輸出', path.relative(root, file), (fs.statSync(file).size / 1024).toFixed(1) + ' KB');

/* 另外輸出一份可以直接放上網站的完整網頁（GitHub Pages 用），放在 dist/site/。和上面的片段有四點不同：
   1. 外層骨架自己補，而且 <title>、樣式放進 <head>。片段是整段接在 <body> 後面的，那樣的網頁瀏覽器照樣能開，但不合規格。
   2. 兩個函式庫不走 CDN，改成和網頁放在一起的檔案（同一份檔案、同一個完整性雜湊，授權條款一併附上）：
      少一個外部相依，CDN 連不上的地方也能用。
   3. 補上網站才需要的東西：說明文字、分頁圖示、分享連結時的標題。
   4. 留著 @SITE（列印按鈕）和 @WEB（列印的說明）區塊的內容。 */
const siteDir = path.join(root, 'dist', 'site');
fs.rmSync(siteDir, { recursive: true, force: true }); // 整個重建，免得留著上一版的函式庫檔
fs.mkdirSync(path.join(siteDir, 'lib'), { recursive: true });
let site = inline(keepBlocks(page, ['SITE', 'WEB']), webScript);
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

/* 第 14 版：iPhone、iPad 的 App 裡的網頁，放在 dist/app/。npx cap sync ios 把它複製進 Xcode 專案（ios/App/App/public/），App 從那裡開。
   App 是 Capacitor 包起來的同一份網頁（capacitor.config.json），和網站版有四點不同：
   1. 完全不連網路。函式庫和網站版一樣放在一起；字型不向 Google 要，改帶霞鶩文楷 TC（只帶 400、700 兩個字重，
      照 Unicode 範圍切成小檔，用到哪一段才讀哪一段）；內文的 Noto Sans TC 不帶，iPhone、iPad 上接著用系統的蘋方（字型清單的下一個）。
      頁首再加一道內容安全政策：除了 App 自己的檔案，什麼都載不進來、也連不出去。
   2. 腳本是 App 版的那一份（列印開 iOS 的列印面板、存起來的盤在原生那邊留備份，見 src/app/platform-app.js）。
   3. 沒有 manifest、主畫面圖示、service worker：App 本身就裝在裝置上，新版本跟著 App 一起更新。
   4. 留 @SITE（列印按鈕）和 @APP（列印與資料的說明、開放原始碼授權）區塊，拿掉 @WEB。 */
const appDir = path.join(root, 'dist', 'app');
fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(path.join(appDir, 'lib'), { recursive: true });
fs.mkdirSync(path.join(appDir, 'fonts'));
let app = inline(keepBlocks(page, ['SITE', 'APP']), appScript);
for (const lib of libs) {
  const local = `lib/${lib.name}-${lib.version}${lib.ext}`;
  if (app.split(lib.url).length !== 2) throw new Error(`頁面裡 ${lib.url} 應該恰好出現一次`);
  app = app.replace(lib.url, local);
  fs.copyFileSync(lib.from, path.join(appDir, local));
}

// 字型：@fontsource 的 400.css、700.css 各有一百多個 @font-face（每個管一段 Unicode 範圍），只留 woff2，連檔案一起複製
const FONT = '@fontsource/lxgw-wenkai-tc';
const fontPkg = path.join(root, 'node_modules', FONT);
const fontVersion = require(`${FONT}/package.json`).version;
if (fontVersion !== deps[FONT]) throw new Error(`${FONT} 版本不一致：package.json ${deps[FONT]}、node_modules ${fontVersion}`);
let fontCss = `/* 霞鶩文楷 TC（LXGW WenKai TC），SIL Open Font License 1.1。由 ${FONT} ${fontVersion} 的 400.css、700.css 產生，只留 woff2 */\n`;
let fontFiles = 0;
for (const weight of [400, 700]) {
  const faces = fs.readFileSync(path.join(fontPkg, `${weight}.css`), 'utf8').match(/@font-face\s*\{[^}]*\}/g) || [];
  if (faces.length < 50) throw new Error(`${FONT}/${weight}.css 的 @font-face 只有 ${faces.length} 個，套件的格式可能變了`);
  for (const face of faces) {
    const woff2 = (face.match(/url\(\.\/files\/([\w.-]+\.woff2)\) format\('woff2'\)/) || [])[1];
    if (!woff2 || !face.includes("font-family: 'LXGW WenKai TC'") || !face.includes(`font-weight: ${weight};`) || !/unicode-range:/.test(face)) throw new Error(`${FONT}/${weight}.css 有一個 @font-face 看不懂：${face.slice(0, 120)}`);
    fs.copyFileSync(path.join(fontPkg, 'files', woff2), path.join(appDir, 'fonts', woff2));
    fontCss += face.replace(/src:[^;]+;/, `src: url(${woff2}) format('woff2');`) + '\n';
    fontFiles++;
  }
}
fs.writeFileSync(path.join(appDir, 'fonts', 'fonts.css'), fontCss);

// 開放原始碼授權：App 裡帶著這些程式與字型（iztro 的打包檔裡另外含四個函式庫），照各自的授權條款把原文放進頁尾
const escHtml = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const licenseOf = f => fs.readFileSync(path.join(root, f), 'utf8').trim();
const LICENSES = [
  [`lunar-javascript ${deps['lunar-javascript']}`, '節氣、四柱、大運的曆法計算', 'node_modules/lunar-javascript/LICENSE'],
  [`iztro ${deps.iztro}`, '紫微斗數安星', 'node_modules/iztro/LICENSE'],
  ['dayjs', 'iztro 內含', 'node_modules/dayjs/LICENSE'],
  ['i18next', 'iztro 內含', 'node_modules/i18next/LICENSE'],
  ['lunar-lite', 'iztro 內含', 'node_modules/lunar-lite/LICENSE'],
  ['lunar-typescript', 'iztro 內含', 'node_modules/lunar-typescript/LICENSE'],
  ['霞鶩文楷 TC（LXGW WenKai TC）', '標題與命盤用的字型', `node_modules/${FONT}/LICENSE`],
  [`Capacitor ${deps['@capacitor/core']}`, '把網頁包成 iOS App 的框架', 'node_modules/@capacitor/core/LICENSE'],
  ['Apache Cordova', 'Capacitor 內含', ['src/licenses/cordova-NOTICE.txt', 'src/licenses/Apache-2.0.txt']],
];
const licenseHtml = LICENSES.map(([name, use, files]) => {
  const text = [].concat(files).map(licenseOf).join('\n\n');
  return `      <h3>${escHtml(name)}</h3>\n      <p>${escHtml(use)}</p>\n      <pre>${escHtml(text)}</pre>\n`;
}).join('');
if (app.split('<!--@LICENSES-->\n').length !== 2) throw new Error('src/index.html 的 @APP 區塊裡要有一行 <!--@LICENSES-->（開放原始碼授權放這裡）');
app = app.replace('<!--@LICENSES-->\n', () => licenseHtml);

const appCut = app.indexOf('<header');
const GOOGLE_FONTS = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/[^"]*">\n/;
if (!GOOGLE_FONTS.test(app.slice(0, appCut))) throw new Error('src/index.html 的 <head> 部分找不到 Google 字型的 <link>：App 版要把它換成自帶的字型');
const appHeadPart = app.slice(0, appCut).replace(/<meta name="claude:[^>]*>\n?/, '').replace(GOOGLE_FONTS, '').trim();
const CSP = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "font-src 'self'", "img-src 'self' data:", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"].join('; ');
const appHead = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
  '<link rel="stylesheet" href="fonts/fonts.css">',
  // 基本樣式和網站版相同（含瀏海、Home 指示條的安全區域）
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>',
  appHeadPart,
].join('\n');
const appDoc = `<!doctype html>\n<html lang="zh-Hant">\n<head>\n${appHead}\n</head>\n<body>\n${app.slice(appCut)}</body>\n</html>\n`;
// 內容安全政策之外再自己查一次：網頁和字型樣式裡沒有任何從網路載入的寫法
const remote = [...(appDoc + fontCss).matchAll(/<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="(?:https?:)?\/\/[^"]*"|url\(\s*['"]?(?:https?:)?\/\/[^)]*\)|@import\b[^;]*/gi)].map(m => m[0]);
if (remote.length) throw new Error(`App 版的網頁不可以從網路載入任何東西：${remote.join('、')}`);
fs.writeFileSync(path.join(appDir, 'index.html'), appDoc);
console.log(`已輸出 dist/app/（index.html、lib/ 裡的 ${libs.length} 個檔、fonts/ 裡的 ${fontFiles} 個字型檔，授權條款 ${LICENSES.length} 份）`);
