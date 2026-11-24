/* 瀏覽器測試（網頁 App，第 13 版）：node test/browser/pwa.test.js。先跑 node scripts/build.js。
   測的是放上網站的那一版（dist/site/），複製到暫存資料夾再用本機的 HTTP 伺服器送出去（service worker 只在 https 或本機能用）。
   - 可以安裝：manifest 的欄位、四個圖示的實際大小、<head> 裡 iOS 要的標籤
   - 離線：第一次開完，service worker 接管頁面；斷網重新開，頁面、函式庫都從快取來，照樣排得出教材範例盤
   - 更新：網站換了新版本，背景裝好後畫面底下出現「有新版本」；不按就照舊，按了才換、重新整理成新版本
   - 主畫面 App 第一次裝好時提示一次「已可離線使用」；在一般的瀏覽器分頁裡不提示
   - 發布平台的片段（dist/paipan.html）沒有 manifest，不註冊 service worker */
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { root, launch, writeHarness, openPage, serveDir, openSite } from '../helpers/browser.js';

const siteDir = path.join(root, 'dist', 'site');
if (!fs.existsSync(path.join(siteDir, 'sw.js'))) { console.error('找不到 dist/site/sw.js，請先執行 npm run build。'); process.exit(2); }
// 每一節用自己的一份網站：更新那一節會改檔
const copySite = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-pwa-')); fs.cpSync(siteDir, dir, { recursive: true }); return dir; };
const pngSize = buf => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
const sample = page => page.locator('#bz-sub').innerText().then(t => t.replace(/\s+/g, ' ').trim());
// 等 service worker 接管頁面（第一次開頁時 clients.claim() 之後）
const controlled = page => page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
// 連其他網站的請求（Google 字型）在情境層擋掉：service worker 發出去的請求也擋得到，測試不碰外面的網路
const hermetic = async ctx => { await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort()); };

(async () => {
  const browser = await launch();

  section('可以安裝：manifest、圖示、<head> 的標籤');
  {
    const dir = copySite(), server = await serveDir(dir);
    const { ctx, page, errors } = await openSite(browser, server.url);
    const head = await page.evaluate(() => ({
      manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'),
      touch: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'),
      title: document.querySelector('meta[name=apple-mobile-web-app-title]')?.content,
      capable: document.querySelector('meta[name=mobile-web-app-capable]')?.content,
      viewport: document.querySelector('meta[name=viewport]')?.content,
      themes: [...document.querySelectorAll('meta[name=theme-color]')].map(m => m.getAttribute('media')),
    }));
    eq(head, { manifest: 'manifest.webmanifest', touch: 'icons/apple-touch-icon.png', title: '排盤', capable: 'yes', viewport: 'width=device-width,initial-scale=1,viewport-fit=cover', themes: ['(prefers-color-scheme: light)', '(prefers-color-scheme: dark)'] },
      '<head>：manifest、主畫面圖示、主畫面上的短名稱、可以獨立開啟；版面延伸到瀏海與 Home 指示條；淺色深色各一個主題色');
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.webmanifest'), 'utf8'));
    eq([m.name, m.short_name, m.lang, m.id, m.start_url, m.scope, m.display], ['八字紫微排盤', '排盤', 'zh-Hant', './', './', './', 'standalone'], 'manifest：名稱、短名稱、語言；起始網址與範圍都是網站的根（GitHub Pages 上是 /paipan/）；獨立視窗');
    const icons = m.icons.map(i => [i.src, i.sizes, i.purpose, (([w, h]) => `${w}x${h}`)(pngSize(fs.readFileSync(path.join(dir, i.src))))]);
    ok(icons.length === 4 && icons.every(([, sizes, , real]) => sizes === real) && icons.some(i => i[2] === 'maskable') && icons.some(i => i[1] === '512x512' && i[2] === 'any'),
      `四個圖示，標的大小和實際的 PNG 相同，有可裁切（maskable）的 512：${icons.map(i => `${i[0]} ${i[3]} ${i[2]}`).join('、')}`);
    // sw.js 的版本要跟著檔案內容走：這裡照同樣的規則另外算一次（清單裡每個檔的路徑與內容），和建置填進去的比
    const sw = fs.readFileSync(path.join(dir, 'sw.js'), 'utf8');
    const list = JSON.parse(sw.match(/const PRECACHE = (\[[^\]]*\]);/)[1].replace(/'/g, '"')), version = sw.match(/const VERSION = '([0-9a-f]+)';/)?.[1];
    const files = fs.readdirSync(dir, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => /\.(html|js|png|webmanifest)$/.test(f) && f !== 'sw.js').sort();
    eq(list.map(p => (p === './' ? 'index.html' : p)).sort(), files, '預先快取的清單涵蓋網站裡全部的頁面、程式、圖示與 manifest');
    const h = crypto.createHash('sha256');
    for (const p of list) h.update(p).update('\0').update(fs.readFileSync(path.join(dir, p === './' ? 'index.html' : p)));
    eq(version, h.digest('hex').slice(0, 12), 'sw.js 的版本是這些檔案內容的雜湊：任何一個檔變了，版本就變');
    const res = await page.request.get(server.url + 'manifest.webmanifest');
    ok(res.ok() && (await page.request.get(server.url + head.touch)).ok(), 'manifest 和主畫面圖示都拿得到');
    eq(errors, [], '沒有錯誤');
    await ctx.close(); await server.close();
  }

  section('離線：第一次開完，斷網也能排盤');
  {
    const dir = copySite(), server = await serveDir(dir);
    const { ctx, page, errors } = await openSite(browser, server.url, { sw: true, context: { serviceWorkers: 'allow' } });
    await hermetic(ctx);
    await controlled(page);
    // 網站裡不是這個頁面的檔（授權條款）：開它拿到的是它自己，不是被換成頁面
    const lic = await ctx.newPage();
    await lic.goto(server.url + 'lib/lunar-javascript-LICENSE.txt');
    ok(!(await lic.content()).includes('八字紫微排盤') && (await lic.evaluate(() => document.body.innerText)).length > 100, '開網站裡的其他檔（授權條款）拿到的是那個檔，不是頁面');
    await lic.close();
    const cached = await page.evaluate(async () => { const keys = await caches.keys(); const c = await caches.open(keys.find(k => k.startsWith('paipan-') && k !== 'paipan-fonts')); return (await c.keys()).map(r => new URL(r.url).pathname); });
    eq(cached.sort(), ['/', '/icons/apple-touch-icon.png', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/lib/iztro-2.6.3.min.js', '/lib/lunar-javascript-1.7.7.js', '/manifest.webmanifest', '/privacy.html', '/support.html'],
      '預先快取了頁面、manifest、兩個函式庫、四個圖示、支援頁與隱私權政策');
    await server.close(); // 伺服器整個關掉，比斷網更徹底
    await ctx.setOffline(true);
    await page.reload();
    eq(await sample(page), '甲子 乙亥 戊午 己未', '斷網重新開：頁面與函式庫都從快取來，排出教材範例盤');
    await page.goto(new URL('index.html?from=homescreen#ziwei', page.url()).href);
    ok((await sample(page)) === '甲子 乙亥 戊午 己未' && await page.locator('#p-ziwei').isVisible(), '從別的網址（index.html、帶查詢字串、#ziwei）開也拿到同一個頁面，直接進紫微分頁');
    await page.locator('#decs [data-today]').click();
    ok(await page.locator('#zw .ly.day').count() === 12 && await page.locator('#zr .rs').count() === 5, '離線時照常疊運限、寫星曜解讀');
    eq(errors.filter(e => !/Failed to fetch|net::ERR/.test(e)), [], '沒有錯誤（連不上字型不算）');
    await ctx.close();
  }

  section('更新：新版本裝好才提示，按了才換');
  {
    const dir = copySite(), server = await serveDir(dir);
    const { ctx, page, errors } = await openSite(browser, server.url, { sw: true });
    await hermetic(ctx);
    await controlled(page);
    ok(await page.locator('#update').count() === 0, '第一次裝好不提示更新');
    // 網站換成新版本：頁面多一個記號，sw.js 的版本跟著換（照建置的做法：內容變了版本就變）
    fs.writeFileSync(path.join(dir, 'index.html'), fs.readFileSync(path.join(dir, 'index.html'), 'utf8').replace('</body>', '<p id="v2" hidden>新版本</p></body>'));
    fs.writeFileSync(path.join(dir, 'sw.js'), fs.readFileSync(path.join(dir, 'sw.js'), 'utf8').replace(/const VERSION = '[0-9a-f]+'/, "const VERSION = 'test-v2'"));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    await page.waitForSelector('#update', { timeout: 15000 });
    ok((await page.locator('#update').innerText()).replace(/\s+/g, '') === '有新版本更新' && await page.locator('#update').getAttribute('role') === 'status', '新版本裝好了：底下出現「有新版本」與「更新」，讀屏會唸');
    ok(await page.locator('#v2').count() === 0, '還沒按更新：頁面照舊是目前這一版');
    const box = await page.locator('#update').boundingBox(), vp = page.viewportSize();
    ok(box.y + box.height <= vp.height && box.x >= 0 && box.x + box.width <= vp.width, '提示條在畫面裡');
    await Promise.all([page.waitForEvent('load'), page.locator('#update button').click()]);
    await page.waitForFunction(() => document.querySelector('#bz-sub')?.textContent.trim());
    ok(await page.locator('#v2').count() === 1 && await page.locator('#update').count() === 0, '按了更新：換成新版本並重新整理，提示條不見了');
    const keys = await page.evaluate(() => caches.keys());
    eq(keys.filter(k => k.startsWith('paipan-') && k !== 'paipan-fonts'), ['paipan-test-v2'], '舊版本的快取刪掉了，只留新版本的');
    eq(errors, [], '沒有錯誤');
    await ctx.close(); await server.close();
  }

  section('主畫面 App 第一次裝好：提示一次「已可離線使用」');
  {
    const dir = copySite(), server = await serveDir(dir);
    const asApp = () => { Object.defineProperty(navigator, 'standalone', { value: true, configurable: true }); };
    const a = await openSite(browser, server.url, { sw: true, init: [asApp] });
    await hermetic(a.ctx);
    await controlled(a.page);
    await a.page.waitForSelector('.toast:not([hidden])');
    eq(await a.page.locator('.toast').innerText(), '已可離線使用：沒有網路也能排盤', '從主畫面開（獨立視窗）：第一次裝好時提示');
    await a.page.reload();
    await a.page.waitForTimeout(300);
    ok(await a.page.locator('.toast').count() === 0 || await a.page.locator('.toast').isHidden(), '之後再開不再提示');
    await a.ctx.close();
    const b = await openSite(browser, server.url, { sw: true });
    await hermetic(b.ctx);
    await controlled(b.page);
    await b.page.waitForTimeout(300);
    ok(await b.page.locator('.toast').count() === 0, '一般的瀏覽器分頁：照樣在背景裝好，但不提示');
    await b.ctx.close(); await server.close();
  }

  section('發布平台的片段：不註冊 service worker');
  {
    const harness = writeHarness(fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-pwa-frag-')));
    // 記下頁面有沒有叫過 register（file:// 底下查不了已註冊的清單，改成看有沒有去註冊）
    const spy = () => { window.__reg = 0; const sw = navigator.serviceWorker; if (sw) { const orig = sw.register.bind(sw); sw.register = (...a) => { window.__reg++; return orig(...a); }; } };
    const { ctx, page, errors } = await openPage(browser, harness, { init: [spy] });
    await page.waitForTimeout(300);
    ok(await page.locator('link[rel=manifest]').count() === 0 && await page.locator('#update').count() === 0, '片段沒有 manifest，也沒有更新提示');
    eq(await page.evaluate(() => window.__reg), 0, '沒有去註冊 service worker');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  await browser.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });
