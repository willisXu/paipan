/* 瀏覽器測試共用：找 Playwright、開瀏覽器、組出模擬發布環境的外層骨架、把 CDN 請求導到 node_modules、固定時鐘。
   測的是建置後的 dist/paipan.html，所以要先跑 node scripts/build.js。 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright 列在 devDependencies（版本寫死）。用 require 而不是 import：沒裝的時候才印得出下面這句說明，而不是一串模組載入錯誤
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('找不到 Playwright。請先執行 npm install；瀏覽器本體另外用 npx playwright install --only-shell chromium 安裝。'); process.exit(2); }

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const deps = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies;
const LIBS = { // 頁面載入的網址片段 → 本機檔案
  [`lunar-javascript@${deps['lunar-javascript']}/lunar.js`]: 'node_modules/lunar-javascript/lunar.js',
  [`iztro@${deps.iztro}/dist/iztro.min.js`]: 'node_modules/iztro/dist/iztro.min.js',
};
// 瀏覽器的時鐘固定在這一刻，「今年」相關的檢查與畫面才不會隨著日子過去而失效
const NOW = new Date('2026-11-11T12:00:00+08:00');
// 模擬發布時外層的骨架。刻意不給 lang，頁面要自己標
const SKELETON = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: 'zh-TW', timezoneId: 'Asia/Taipei' };

export const launch = () => chromium.launch();

// 把建置好的頁面包進外層骨架，寫成 dir/harness.html，回傳檔案路徑
export function writeHarness(dir) {
  const dist = path.join(root, 'dist', 'paipan.html');
  if (!fs.existsSync(dist)) { console.error('找不到 dist/paipan.html。瀏覽器測試測的是建置後的頁面，請先執行 npm run build。'); process.exit(2); }
  fs.mkdirSync(dir, { recursive: true });
  const harness = path.join(dir, 'harness.html');
  fs.writeFileSync(harness, SKELETON + fs.readFileSync(dist, 'utf8'));
  return harness;
}

/* 開一個全新的瀏覽器情境（不帶任何存檔）並載入頁面。
   CDN 函式庫改由本機 node_modules 提供（同一個檔案），其餘外部請求一律放掉。
   context：覆寫情境設定（視窗大小、深色、權限…）；hash：接在網址後面的 #…；
   init：頁面自己的腳本執行之前，先在頁面裡跑的函式（用來換掉瀏覽器的 API）；libs: false 連函式庫也不給（模擬 CDN 連不上）。
   回傳的 errors 是頁面丟出的例外加上 console.error，pageErrors 只有例外的原始訊息。 */
export async function openPage(browser, harness, { context = {}, hash = '', init = [], libs = true } = {}) {
  const ctx = await browser.newContext({ ...DESKTOP, ...context });
  const page = await ctx.newPage();
  const errors = [], pageErrors = [];
  page.on('pageerror', e => { pageErrors.push(e.message); errors.push('pageerror: ' + e.message); });
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route('**/*', route => {
    const url = route.request().url();
    const lib = libs && Object.keys(LIBS).find(k => url.includes(k));
    // 頁面的 <script> 帶完整性雜湊與 crossorigin，所以回應要有 CORS 標頭，瀏覽器才會核對並執行（CDN 也是這樣回的）
    if (lib) return route.fulfill({ path: path.join(root, LIBS[lib]), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
    return url.startsWith('file:') ? route.continue() : route.abort();
  });
  for (const fn of init) await page.addInitScript(fn);
  await page.clock.setFixedTime(NOW);
  await page.goto('file://' + harness + hash);
  return { ctx, page, errors, pageErrors };
}

/* 把一個資料夾用本機的 HTTP 伺服器送出去（只聽 127.0.0.1，埠號由系統挑），給「放上網站的那一版」的測試用：
   帶完整性雜湊的 <script> 在 file:// 底下不會執行，要走 HTTP 才是網站上真正的樣子。
   tamper：路徑 → 要接在檔案後面的內容，模擬檔案被換掉。回傳 { url, close }。 */
export async function serveDir(dir, { tamper = {} } = {}) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2' };
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html');
    const file = path.join(dir, rel);
    if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(Buffer.concat([fs.readFileSync(file), Buffer.from(tamper[rel] || '')]));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) };
}

/* 開「放上網站的那一版」（serveDir 送出來的網址）。同一個來源的請求照常送，其餘外部請求一律擋掉並記在 external 裡，
   測試才能確認頁面沒有去連 CDN。時鐘和 openPage 一樣固定；init 也一樣，是頁面自己的腳本執行之前先在頁面裡跑的函式
   （要帶參數的寫成 [函式, 參數]）。
   網站版會註冊 service worker（第 13 版的網頁 App）：一般的測試把它擋掉（sw: false），每次開頁都直接向伺服器要檔案、彼此不互相影響；
   測網頁 App 的那一支（pwa.test.js）才打開。 */
export async function openSite(browser, url, { context = {}, init = [], sw = false } = {}) {
  const ctx = await browser.newContext({ ...DESKTOP, serviceWorkers: sw ? 'allow' : 'block', ...context });
  const page = await ctx.newPage();
  const errors = [], external = [], responses = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('response', r => responses.push({ url: r.url(), status: r.status() }));
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(url)) return route.continue();
    external.push(u);
    return route.abort();
  });
  for (const fn of init) await page.addInitScript(...[].concat(fn));
  await page.clock.setFixedTime(NOW);
  await page.goto(url);
  return { ctx, page, errors, external, responses };
}

// 常用的頁面操作。setVal 填完再補一個 change，文字、日期這類欄位才會立刻觸發重排
export const text = (page, sel) => page.locator(sel).innerText();
export const setVal = async (page, sel, v) => { await page.locator(sel).fill(v); await page.locator(sel).dispatchEvent('change'); };
/* 按鈕的無障礙名稱：瀏覽器實際算出來、讀屏會唸的那一串（不是我們寫在屬性裡的字）。去掉空白，免得受排版影響。
   loc 可以是按鈕本身，也可以是裝著一排按鈕的容器；回傳陣列，一個按鈕一個名稱 */
export const buttonNames = async loc => [...(await loc.ariaSnapshot()).matchAll(/^\s*- button "((?:[^"\\]|\\.)*)"/gm)].map(m => m[1].replace(/\s+/g, ''));
// 給 openPage 的 init 用：讓「複製文字盤」走選取文字的路，才讀得到內容
export const blockClipboard = () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true }); };
