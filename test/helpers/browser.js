/* 瀏覽器測試共用：找 Playwright、開瀏覽器、組出模擬發布環境的外層骨架、把 CDN 請求導到 node_modules、固定時鐘。
   測的是建置後的 dist/paipan.html，所以要先跑 node scripts/build.js。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Playwright 裝在專案外（靠 NODE_PATH 找到），import 不會去那裡找，所以用 require
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('找不到 Playwright。這支測試需要另外安裝 playwright 與 Chromium（不在 package.json 的相依套件裡）。'); process.exit(2); }

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
    if (lib) return route.fulfill({ path: path.join(root, LIBS[lib]), contentType: 'application/javascript' });
    return url.startsWith('file:') ? route.continue() : route.abort();
  });
  for (const fn of init) await page.addInitScript(fn);
  await page.clock.setFixedTime(NOW);
  await page.goto('file://' + harness + hash);
  return { ctx, page, errors, pageErrors };
}

// 常用的頁面操作。setVal 填完再補一個 change，文字、日期這類欄位才會立刻觸發重排
export const text = (page, sel) => page.locator(sel).innerText();
export const setVal = async (page, sel, v) => { await page.locator(sel).fill(v); await page.locator(sel).dispatchEvent('change'); };
// 給 openPage 的 init 用：讓「複製文字盤」走選取文字的路，才讀得到內容
export const blockClipboard = () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) }, configurable: true }); };
