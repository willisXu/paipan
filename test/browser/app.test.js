/* 瀏覽器測試（iPhone、iPad App 裡的網頁，第 14 版）：node test/browser/app.test.js。先跑 node scripts/build.js。
   測的是 dist/app/，也就是 npx cap sync ios 複製進 Xcode 專案、App 實際開的那一份，用本機的 HTTP 伺服器送出去。
   原生的那一半（ios/App/App/PaipanAppPlugin.swift）這裡跑不到，改用一個假的 Capacitor 原生橋代替：
   和真的一樣在網頁腳本之前放好 window.Capacitor（外掛清單、nativePromise）與 webkit.messageHandlers.bridge，記下網頁叫了什麼。
   - 完全不連網路：沒有任何外部請求、內容安全政策沒有擋到東西、霞鶩文楷從 App 自帶的字型檔載入
   - 不是 App 才有的東西都不在：manifest、主畫面圖示、service worker
   - 列印：在 App 裡交給原生的列印面板（帶著按鈕的位置），面板關掉才收掉「兩個都印」；不在 App 裡照網頁的做法
   - 存起來的盤：存的時候原生那邊也存一份；頁面那份不見了從原生補回；兩邊不同以頁面為準
   - 頁尾：列印的說明換成 iOS 的版本、附開放原始碼授權（紙上不印） */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { root, launch, serveDir, openSite, text } from '../helpers/browser.js';

const appDir = path.join(root, 'dist', 'app');
if (!fs.existsSync(path.join(appDir, 'index.html'))) { console.error('找不到 dist/app/index.html，請先執行 npm run build。'); process.exit(2); }
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const deps = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies;
const KEY = 'paipan-saved-v1';
const sample = page => text(page, '#bz-sub').then(t => t.replace(/\s+/g, ' ').trim());

/* 假的原生橋。store：原生那份備份（localStorage 鍵 → 內容）；plugin: false 模擬外掛沒有註冊；local：頁面那份 localStorage 先放的內容。
   網頁叫的每一次都記在 window.__native；printPage 要等測試呼叫 window.__finishPrint(true／false) 才結束（面板關掉） */
const inApp = (opts = {}) => [({ store = {}, plugin = true, local = null, key }) => {
  if (local !== null) localStorage.setItem(key, local);
  window.__native = []; window.__printed = 0; window.__store = { ...store };
  window.print = () => { window.__printed++; };
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  window.Capacitor = {
    PluginHeaders: plugin ? [{ name: 'PaipanApp', methods: ['printPage', 'getAll', 'setItem'].map(name => ({ name, rtype: 'promise' })) }] : [],
    nativePromise(name, method, options) {
      window.__native.push([name, method, options]);
      if (method === 'getAll') return Promise.resolve({ values: { ...window.__store } });
      if (method === 'setItem') { window.__store[options.key] = options.value; return Promise.resolve(); }
      if (method === 'printPage') return new Promise((resolve, reject) => { window.__finishPrint = done => (done ? resolve({ completed: true }) : reject(new Error('取消'))); });
      return Promise.reject(new Error(`沒有 ${method}`));
    },
  };
}, { ...opts, key: KEY }];
const inBrowser = () => { window.__printed = 0; window.print = () => { window.__printed++; }; };
const calls = (page, method) => page.evaluate(m => window.__native.filter(c => c[1] === m).map(c => c[2] ?? null), method);
const hasBoth = page => page.evaluate(() => document.body.classList.contains('print-both'));

(async () => {
  const browser = await launch();
  const server = await serveDir(appDir);

  section('App 版：完全不連網路，字型自帶');
  {
    const warnings = [];
    const { ctx, page, errors, external, responses } = await openSite(browser, server.url, { init: [inApp()] });
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.reload(); // 開頁時的警告要聽得到：掛上監聽之後重開一次
    ok(await sample(page) === '甲子 乙亥 戊午 己未' && await page.locator('#zw .cell').count() === 12, '開頁就排出教材範例盤（八字與紫微都有）');
    await page.evaluate(() => document.fonts.ready);
    ok(external.length === 0, `沒有任何對外的請求：${external.join('、') || '沒有'}`);
    const faces = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family}|${f.weight}`));
    ok(faces.some(f => f === 'LXGW WenKai TC|400') && faces.some(f => f === 'LXGW WenKai TC|700'), `霞鶩文楷的 400、700 兩個字重都從 App 裡的字型檔載入了：${[...new Set(faces)].join('、')}`);
    const fontFiles = responses.filter(r => /\/fonts\/lxgw-wenkai-tc-[\w-]+\.woff2$/.test(r.url));
    ok(fontFiles.length > 0 && fontFiles.length < 100 && fontFiles.every(r => r.status === 200 && r.url.startsWith(server.url)), `只載入畫面用得到的那幾段字型檔（${fontFiles.length} 個），都從 App 自己的檔案來`);
    // 實際畫出標題的字型（不是樣式裡寫的那一串）
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
    const { root: doc } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'h1' });
    const used = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName);
    ok(used.includes('LXGW WenKai TC'), `標題「八字紫微排盤」用霞鶩文楷畫出來：${used.join('、')}`);
    const head = await page.evaluate(() => ({
      csp: document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || '',
      manifest: !!document.querySelector('link[rel=manifest]'), touch: !!document.querySelector('link[rel=apple-touch-icon]'),
      remote: [...document.querySelectorAll('script[src], link[href]')].map(e => e.src || e.href).filter(u => !u.startsWith(location.origin)),
      lang: document.documentElement.lang, charsetFirst: document.head.firstElementChild.getAttribute('charset'),
    }));
    // 第 15 版：有帳號功能時，連出去（connect-src）只多開帳號的後端那一個網址；其他一律只准 App 自己的檔案
    const api = JSON.parse(fs.readFileSync(path.join(root, 'account.config.json'), 'utf8')).apiBase;
    const others = head.csp.replace(/connect-src [^;]*/, '');
    const connect = (head.csp.match(/connect-src ([^;]*)/) || [])[1];
    ok(/default-src 'self'/.test(head.csp) && /font-src 'self'/.test(head.csp) && !/https?:/.test(others) && connect === (api ? `'self' ${api}` : "'self'"), `頁首有內容安全政策，只准載入 App 自己的檔案${api ? '，連出去只准帳號的後端' : ''}：${head.csp}`);
    ok(!head.manifest && !head.touch && head.remote.length === 0, `沒有 manifest、主畫面圖示，也沒有指向別處的 <script>、<link>：${head.remote.join('、') || '沒有'}`);
    ok(head.lang === 'zh-Hant' && head.charsetFirst === 'utf-8', '語言標成繁體中文、編碼宣告排在最前面');
    const shipped = fs.readdirSync(appDir, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => fs.statSync(path.join(appDir, f)).isFile());
    const odd = shipped.filter(f => !(f === 'index.html' || /^lib\/[\w.-]+\.js$/.test(f) || /^fonts\/(fonts\.css|lxgw-wenkai-tc-[\w-]+\.woff2)$/.test(f)));
    ok(odd.length === 0 && !shipped.includes('sw.js'), `App 的網頁只有頁面、兩個函式庫、字型：${odd.join('、') || '沒有多的檔案'}`);
    const libs = [[`lib/lunar-javascript-${deps['lunar-javascript']}.js`, 'node_modules/lunar-javascript/lunar.js'], [`lib/iztro-${deps.iztro}.min.js`, 'node_modules/iztro/dist/iztro.min.js']];
    ok(libs.every(([a, b]) => fs.readFileSync(path.join(appDir, a)).equals(fs.readFileSync(path.join(root, b)))), '兩個函式庫和測試驗過的是同一份（逐位元相同）');
    const css = fs.readFileSync(path.join(appDir, 'fonts', 'fonts.css'), 'utf8');
    const urls = [...css.matchAll(/url\(([^)]+)\)/g)].map(m => m[1]);
    ok(urls.length > 100 && urls.every(u => /^[\w.-]+\.woff2$/.test(u) && fs.existsSync(path.join(appDir, 'fonts', u))) && !/\.woff\)/.test(css), `字型樣式的 ${urls.length} 個檔都在 App 裡，只用 woff2`);
    ok(warnings.length === 0, `沒有警告（原生外掛找得到）${warnings.length ? '：' + warnings.join(' | ') : ''}`);
    ok(errors.length === 0, `無錯誤（包括內容安全政策擋下的東西）${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('App 版：不註冊 service worker');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, {
      init: [inApp(), () => { window.__sw = 0; if (navigator.serviceWorker) navigator.serviceWorker.register = () => { window.__sw++; return new Promise(() => {}); }; }],
    });
    await page.waitForLoadState('load');
    await page.waitForTimeout(300);
    eq(await page.evaluate(() => window.__sw), 0, '開完頁沒有去註冊 service worker（App 本身就裝在裝置上，新版本跟著 App 更新）');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('App 裡的列印：交給 iOS 的列印面板');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inApp()] });
    const btn = await page.locator('#print').boundingBox();
    await page.locator('#print').click();
    const [first] = await calls(page, 'printPage');
    ok(first && first.jobName === '八字紫微排盤', `按「列印／存 PDF」叫原生的 printPage，工作名稱是頁面標題：${JSON.stringify(first)}`);
    ok(first && Math.abs(first.x - btn.x) < 1 && Math.abs(first.y - btn.y) < 1 && Math.abs(first.width - btn.width) < 1 && Math.abs(first.height - btn.height) < 1, '帶著按鈕在畫面上的位置（iPad 的面板從按鈕旁邊彈出）');
    ok(await page.evaluate(() => window.__printed) === 0, '沒有叫網頁的 window.print()（WKWebView 不理它）');
    ok(!await hasBoth(page), '只印目前的分頁：<body> 沒有 print-both');
    await page.evaluate(() => window.__finishPrint(true));

    await page.locator('#print-both').click();
    ok(await hasBoth(page), '按「八字、紫微一起印」：面板開著的時候 <body> 帶 print-both');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    ok(await hasBoth(page), '面板還開著時收到 afterprint（WebKit 排版面時可能會發）也不拿掉：真正印的時候兩個分頁都要在');
    await page.evaluate(() => window.__finishPrint(true));
    await page.waitForFunction(() => !document.body.classList.contains('print-both'));
    ok(!await hasBoth(page), '面板關掉（印完或取消）才拿掉 print-both');

    await page.locator('#print-both').click();
    await page.evaluate(() => window.__finishPrint(false));
    await page.waitForFunction(() => !document.body.classList.contains('print-both'));
    ok(!await hasBoth(page) && (await calls(page, 'printPage')).length === 3, '面板開不起來（原生回報錯誤）：一樣收掉記號，頁面照常');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('不在 App 裡（用瀏覽器直接開 dist/app）：照網頁的做法');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inBrowser] });
    await page.locator('#print-both').click();
    ok(await page.evaluate(() => window.__printed) === 1 && await hasBoth(page), '按「八字、紫微一起印」：叫瀏覽器的列印，<body> 帶 print-both');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    ok(!await hasBoth(page), '印完（afterprint）就拿掉');
    await page.locator('#save').click();
    ok((await page.locator('.toast').innerText()).includes('已存在這台裝置'), '存盤的提示說的是裝置（App 版的字），存起來照常');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('外掛沒有註冊（例如畫面沒有指到 PaipanViewController）：退回網頁的做法，並留下警告');
  {
    const warnings = [];
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inApp({ plugin: false })] });
    page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); });
    await page.reload(); // 警告在開頁時就發了：掛上監聽之後重開一次
    await page.locator('#print').click();
    ok(await page.evaluate(() => window.__printed) === 1 && (await calls(page, 'printPage')).length === 0, '列印改叫 window.print()，沒有去叫不存在的外掛');
    ok(warnings.some(w => w.includes('PaipanApp')), `留下一則找不到外掛的警告，除錯時看得到：${warnings.join(' | ')}`);
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('存起來的盤：原生那邊另外留一份');
  let savedValue;
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inApp()] });
    await page.waitForFunction(() => window.__native.some(c => c[1] === 'getAll'));
    eq(await calls(page, 'setItem'), [], '開頁時兩邊都沒有存過盤：不寫原生那份');
    await page.locator('#save').click();
    savedValue = await page.evaluate(k => localStorage.getItem(k), KEY);
    const [set] = await calls(page, 'setItem');
    ok(savedValue && set && set.key === KEY && set.value === savedValue, '按「存」：localStorage 存好後，原生那邊也存一份同樣的內容');
    ok((await page.locator('.toast').innerText()).includes('已存在這台裝置'), `提示說的是「已存在這台裝置」：${await page.locator('.toast').innerText()}`);
    await page.locator('#saved [data-del]').first().click();
    const sets = await calls(page, 'setItem');
    ok(sets.length === 2 && sets[1].value === '[]', '刪掉一筆：原生那份跟著更新（不會在下次開 App 時把刪掉的補回來）');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inApp({ store: { [KEY]: savedValue } })] });
    await page.waitForFunction(() => document.querySelectorAll('#saved .chip').length > 0, null, { timeout: 5000 }).catch(() => {});
    ok(await page.locator('#saved .chip').count() === 1 && await page.evaluate(k => localStorage.getItem(k), KEY) === savedValue, '頁面那份被清掉了（新的情境，localStorage 是空的）：從原生那份補回來，已存清單重畫出來');
    eq(await calls(page, 'setItem'), [], '補回來的時候不必再寫原生那份');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inApp({ store: { [KEY]: '[]' }, local: savedValue })] });
    await page.waitForFunction(() => window.__native.some(c => c[1] === 'setItem'), null, { timeout: 5000 }).catch(() => {});
    const [set] = await calls(page, 'setItem');
    ok(set && set.key === KEY && set.value === savedValue && await page.locator('#saved .chip').count() === 1, '兩邊不同（上次寫原生失敗之類）：以頁面那份為準，更新原生那份');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('頁尾：列印說明換成 iOS 的版本，附開放原始碼授權');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [inApp()] });
    const foot = await page.locator('footer.colophon').innerText();
    ok(foot.includes('iOS 的列印面板') && foot.includes('存到「檔案」') && !foot.includes('另存為 PDF') && !foot.includes('瀏覽器自己的列印'), '列印的說明講 iOS 的列印面板和怎麼存成 PDF，沒有網站版講瀏覽器的那一段');
    ok(foot.includes('不連網路') && foot.includes('不收集任何資料'), '說明資料只存在裝置上、不連網路、不收集資料');
    const links = await page.locator('footer.colophon a').evaluateAll(as => as.map(a => a.getAttribute('href')));
    ok(links.includes('https://willisxu.github.io/paipan/privacy.html') && links.includes('https://willisxu.github.io/paipan/support.html'), `App 裡看得到隱私權政策與支援頁的連結（App Store 要求 App 內也找得到隱私權政策；點了在 Safari 打開）：${links.join('、')}`);
    ok(!await page.locator('details.licenses pre').first().isVisible(), '授權條款平常收著');
    await page.locator('details.licenses summary').click();
    const lic = await page.evaluate(() => [...document.querySelectorAll('details.licenses h3')].map(h => [h.textContent, h.nextElementSibling.nextElementSibling.textContent]));
    const names = lic.map(([n]) => n);
    ok([`lunar-javascript ${deps['lunar-javascript']}`, `iztro ${deps.iztro}`, `Capacitor ${deps['@capacitor/core']}`].every(n => names.includes(n)) && names.some(n => n.includes('霞鶩文楷')) && names.includes('Apache Cordova'), `列出 App 裡帶的程式與字型（${lic.length} 項）：${names.join('、')}`);
    ok(lic.every(([, t]) => t.length > 500) && lic.some(([, t]) => t.includes('SIL OPEN FONT LICENSE')) && lic.some(([, t]) => t.includes('Apache License') && t.includes('Version 2.0')), '每一項都附條款原文（MIT、SIL OFL 1.1、Apache 2.0）');
    await page.evaluate(AXE);
    const { violations } = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
    ok(violations.length === 0, `授權條款展開時，axe-core 掃整頁沒有違規${violations.length ? '：' + violations.map(v => v.id).join('、') : ''}`);
    await page.emulateMedia({ media: 'print' });
    ok(!await page.locator('details.licenses').isVisible(), '授權條款不印在紙上');
    await page.emulateMedia({ media: null });
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('網站版不受影響：沒有 App 的說明與授權，腳本裡沒有原生外掛');
  {
    const site = fs.readFileSync(path.join(root, 'dist', 'site', 'index.html'), 'utf8');
    const fragment = fs.readFileSync(path.join(root, 'dist', 'paipan.html'), 'utf8');
    ok(site.includes('另存為 PDF') && !site.includes('iOS 的列印面板') && !site.includes('class="licenses"'), '網站版的頁尾還是講瀏覽器的列印，沒有 App 的說明與授權');
    ok([site, fragment].every(s => !s.includes('PaipanApp') && !s.includes('registerPlugin')), '網站版、發布平台的片段都沒有打包進 Capacitor 與原生外掛');
    ok(fs.readFileSync(path.join(appDir, 'index.html'), 'utf8').includes('"PaipanApp"'), 'App 版的腳本是接原生的那一份');
  }

  await server.close();
  await browser.close();
  finish();
})();
