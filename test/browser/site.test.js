/* 瀏覽器測試（放上網站的那一版）：node test/browser/site.test.js。先跑 node scripts/build.js。
   其他幾支測的是 dist/paipan.html（發布平台用的片段，函式庫走 CDN）；這一支測 dist/site/，也就是 GitHub Pages 上實際的網頁：
   函式庫和網頁放在一起、不連 CDN，完整性雜湊照樣把關，網頁本身是結構完整的文件。 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { ok, section, finish } from '../helpers/harness.js';
import { root, launch, serveDir, openSite, text, setVal } from '../helpers/browser.js';

const siteDir = path.join(root, 'dist', 'site');
if (!fs.existsSync(path.join(siteDir, 'index.html'))) { console.error('找不到 dist/site/index.html，請先執行 npm run build。'); process.exit(2); }
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const deps = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies;
const LIBS = [ // 網站上的檔名 → node_modules 裡測試驗過的同一個檔
  [`lib/lunar-javascript-${deps['lunar-javascript']}.js`, 'node_modules/lunar-javascript/lunar.js'],
  [`lib/iztro-${deps.iztro}.min.js`, 'node_modules/iztro/dist/iztro.min.js'],
];
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

(async () => {
  const browser = await launch();

  section('網站版：函式庫和網頁放在一起，不連 CDN');
  {
    const server = await serveDir(siteDir);
    const { ctx, page, errors, external, responses } = await openSite(browser, server.url);
    ok((await text(page, '#bz-sub')).replace(/\s+/g, ' ') === '甲子 乙亥 戊午 己未' && await page.locator('#zw .cell').count() === 12, '開頁就排出教材範例盤（八字與紫微都有）');
    const libOk = LIBS.every(([name]) => responses.some(r => r.url === server.url + name && r.status === 200));
    ok(libOk && !external.some(u => u.includes('jsdelivr')), `兩個函式庫都從同一個網站載入，沒有去連 CDN：${external.filter(u => !/fonts\.g/.test(u)).join('、') || '沒有其他外部請求'}`);
    ok(external.every(u => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)), `唯一的外部請求是字型（載不到時用系統字型）：${[...new Set(external.map(u => new URL(u).host))].join('、')}`);
    ok(LIBS.every(([name, from]) => sha(path.join(siteDir, name)) === sha(path.join(root, from))), '網站上的函式庫檔和測試驗過的是同一份（逐位元相同）');
    const licences = await page.evaluate(names => Promise.all(names.map(n => fetch(n).then(r => r.text()))), ['lib/lunar-javascript-LICENSE.txt', 'lib/iztro-LICENSE.txt']);
    ok(licences.every(t => t.startsWith('MIT License')), '兩個函式庫的授權條款一併放在網站上');
    // 換一張盤、切分頁，確認不是只有第一張盤能排
    await setVal(page, '#date', '1975-09-30'); await setVal(page, '#time', '23:05');
    await page.locator('#t-ziwei').click();
    ok((await text(page, '#bz-sub')).replace(/\s+/g, ' ') === '乙卯 乙酉 庚辰 丙子' && await page.locator('#p-ziwei').isVisible(), '換生辰、切到紫微分頁都正常');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close(); await server.close();
  }

  section('網站版：完整的網頁文件');
  {
    const server = await serveDir(siteDir);
    const { ctx, page, errors } = await openSite(browser, server.url);
    const doc = await page.evaluate(() => ({
      lang: document.documentElement.lang, title: document.title, compat: document.compatMode,
      titleInHead: document.head.querySelectorAll('title').length, strayInBody: document.body.querySelectorAll('title, meta, link, style').length,
      desc: document.head.querySelector('meta[name=description]')?.content || '', og: document.head.querySelector('meta[property="og:title"]')?.content || '',
      icon: document.head.querySelector('link[rel=icon]')?.href.slice(0, 19) || '', charsetFirst: document.head.firstElementChild.getAttribute('charset'),
      platformMeta: document.querySelectorAll('meta[name^="claude:"]').length,
    }));
    ok(doc.lang === 'zh-Hant' && doc.compat === 'CSS1Compat' && doc.charsetFirst === 'utf-8', `標準模式、語言標成繁體中文、編碼宣告排在最前面：${JSON.stringify([doc.lang, doc.compat, doc.charsetFirst])}`);
    ok(doc.title === '八字紫微排盤' && doc.titleInHead === 1 && doc.strayInBody === 0, `標題與樣式都在 <head> 裡，<body> 裡沒有：${doc.titleInHead}／${doc.strayInBody}`);
    ok(doc.desc.includes('讀盤紀錄與星曜解讀') && doc.desc.includes('沒有網路也能排盤') && doc.og === '八字紫微排盤' && doc.icon === 'data:image/svg+xml,' && doc.platformMeta === 0, '有說明文字、分享用的標題、分頁圖示；沒有帶著發布平台專用的標記');
    await page.evaluate(AXE);
    const { violations } = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
    ok(violations.length === 0, `axe-core 掃整份文件沒有違規${violations.length ? '：' + violations.map(v => v.id).join('、') : ''}`);
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close(); await server.close();
  }

  section('網站版：函式庫檔被換掉就不執行');
  {
    // 在其中一個檔後面多接一行，模擬網站上的檔案被動過。完整性雜湊對不上，瀏覽器不該執行它
    const server = await serveDir(siteDir, { tamper: { ['/' + LIBS[1][0]]: '\n;window.TAMPERED = true;' } });
    const { ctx, page } = await openSite(browser, server.url);
    await page.waitForSelector('#err:not([hidden])');
    ok(await page.evaluate(() => window.TAMPERED !== true && typeof window.iztro === 'undefined') && (await text(page, '#err')).includes('排盤函式庫沒有載入'), '被動過的檔案沒有執行，頁面顯示函式庫沒有載入');
    await ctx.close(); await server.close();
  }

  await browser.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });
