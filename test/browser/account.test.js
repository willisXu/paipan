/* 帳號與同步（第 15 版）的瀏覽器測試：node test/browser/account.test.js。先跑 node scripts/build.js。
   真的後端程式（server/src/index.js）在本機跑（D1 換成 node:sqlite、Apple 換成假的），網站版與 App 版另外建一份指到它的
   （PAIPAN_ACCOUNT_CONFIG、PAIPAN_OUT，見 scripts/build.js），瀏覽器開幾個情境當不同的裝置：
   - 預設的建置（account.config.json 沒設後端網址時）沒有帳號功能；有設的那一份才有，App 版的內容安全政策只多開那一個網址
   - 網頁版登入：換到 Apple 的登入頁（攔下來檢查參數）、帶著結果回到網站；第一次登入把這台的盤併進帳號
   - 第二台裝置看到同一份；存、刪會同步過去；兩台都離線各改各的，連上網路後合起來
   - 從 Apple 回來時 state 對不上、使用者按了取消：都不登入
   - 登出先確認，帳號的盤從這台移除，再登入就回來；登入失效回到沒登入、盤留著
   - 刪除帳號先確認，雲端清空、撤銷 Apple 授權
   - App 版：iOS 原生的 Apple 登入（假的原生橋）、登入憑證放鑰匙圈、使用者在 Apple 那邊停用了就登出 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { root, launch, serveDir, openSite, setVal, buttonNames } from '../helpers/browser.js';
import { createD1 } from '../helpers/d1.js';
import { appleMock } from '../helpers/apple-mock.js';
import { ENV, CHART_A, client } from '../helpers/server-scenario.js';
import worker from '../../server/src/index.js';
import { resetAppleKeys } from '../../server/src/apple.js';

for (const f of ['paipan.html', 'site/index.html', 'app/index.html']) if (!fs.existsSync(path.join(root, 'dist', f))) { console.error(`找不到 dist/${f}，請先執行 npm run build。`); process.exit(2); }
const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const SESSION = 'paipan-session-v1', SYNC = 'paipan-sync-v1';
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };
const sorted = list => list.slice().sort();

// 已存清單上的名字（標籤是「名字 · 日期 時間…」）
const chips = page => page.$$eval('#saved [data-load]', bs => bs.map(b => b.textContent.split(' · ')[0]));
const waitState = (page, s) => page.waitForFunction(want => document.querySelector('#acct-state')?.textContent === want, s, { timeout: 15000 });
const waitChips = (page, names) => page.waitForFunction(want => JSON.stringify([...document.querySelectorAll('#saved [data-load]')].map(b => b.textContent.split(' · ')[0])) === want, JSON.stringify(names), { timeout: 15000 });
const note = page => page.locator('#acct .acct-note').innerText();
async function save(page, name, date, time = '12:00') {
  await setVal(page, '#nm', name); await setVal(page, '#date', date); await setVal(page, '#time', time);
  await page.locator('#save').click();
}
const del = (page, name) => page.locator('#saved .chip').filter({ hasText: `${name} · ` }).locator('[data-del]').click();
// 提示訊息 1.8 秒後就收起來：在頁面裡掛觀察器，把每一則依序記在 window.toasts（和 form.test.js 的做法相同；每換一頁重新記）
const logToasts = () => {
  window.toasts = [];
  new MutationObserver(records => { for (const r of records) if (r.target.className === 'toast' && !r.target.hidden) window.toasts.push(r.target.textContent); }).observe(document, { subtree: true, childList: true });
};
const toasts = page => page.evaluate(() => window.toasts);
/* 假的原生橋（和 app.test.js 的同一種），多了第 15 版的方法：signInWithApple 交給 Node 這邊的假 Apple 簽身分權杖，
   getSecret／setSecret／clearSecret 是鑰匙圈，appleCredentialState 回傳 window.__cred */
const fakeNative = () => {
  window.__native = []; window.__store = {}; window.__secret = null; window.__cred = 'authorized'; window.__cancel = false;
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  const methods = ['printPage', 'getAll', 'setItem', 'signInWithApple', 'appleCredentialState', 'getSecret', 'setSecret', 'clearSecret'];
  window.Capacitor = {
    PluginHeaders: [{ name: 'PaipanApp', methods: methods.map(name => ({ name, rtype: 'promise' })) }],
    nativePromise(name, method, o) {
      window.__native.push([method, o]);
      if (method === 'getAll') return Promise.resolve({ values: { ...window.__store } });
      if (method === 'setItem') { if (o.value === null) delete window.__store[o.key]; else window.__store[o.key] = o.value; return Promise.resolve(); }
      if (method === 'getSecret') return Promise.resolve({ value: window.__secret });
      if (method === 'setSecret') { window.__secret = o.value; return Promise.resolve(); }
      if (method === 'clearSecret') { window.__secret = null; return Promise.resolve(); }
      if (method === 'appleCredentialState') return Promise.resolve({ state: window.__cred });
      if (method === 'signInWithApple') return window.__cancel ? Promise.reject(Object.assign(new Error('已取消'), { code: 'canceled' })) : window.__appleNative(o.nonce);
      return Promise.reject(new Error(`沒有 ${method}`));
    },
  };
};
// 頁面換了一份新的（從 Apple 那邊回來）：開頁前做個記號，新的那一頁沒有這個記號
const mark = page => page.evaluate(() => { window.__old = true; });
const reloaded = page => page.waitForFunction(() => !window.__old && document.readyState === 'complete' && document.querySelector('#acct:not([hidden])'), null, { timeout: 15000 });

(async () => {
  section('預設的建置：沒設後端網址就沒有帳號功能，設了才有');
  {
    const on = JSON.parse(read('account.config.json')).apiBase;
    const site = read('dist/site/index.html'), app = read('dist/app/index.html'), fragment = read('dist/paipan.html');
    const csp = (app.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
    if (!on) {
      ok(!site.includes('id="acct"') && !site.includes('<meta name="paipan-api"') && site.includes('隱私權政策</a>：不收集任何資料，存的盤只在這個瀏覽器裡') && !site.includes('用 Apple 登入後'), '網站版：沒有登入那一塊、沒有後端的設定，頁尾是「不收集任何資料」那一版');
      ok(!app.includes('id="acct"') && !app.includes('<meta name="paipan-api"') && app.includes('這個 App 不連網路，也不收集任何資料') && /connect-src 'self';/.test(csp), 'App 版：同樣沒有；內容安全政策只能連自己');
    } else {
      ok(site.includes('id="acct"') && site.includes(`<meta name="paipan-api" content="${on}">`) && site.includes('用 Apple 登入後'), `網站版：有登入那一塊、後端是 ${on}，頁尾說明同步`);
      ok(app.includes('id="acct"') && csp.includes(`connect-src 'self' ${on};`), 'App 版：同樣有；內容安全政策只多開後端那一個網址');
    }
    ok(!fragment.includes('id="acct"') && !fragment.includes('<meta name="paipan-api"'), '發布平台的片段一律沒有帳號功能（檢視框裡連不了外面）');
  }

  // ── 在本機開後端和兩個網站（網站版、App 版），網站版與 App 版另外建一份指到這個後端的 ──
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-account-'));
  for (const d of ['site', 'app']) fs.mkdirSync(path.join(tmp, d));
  const site = await serveDir(path.join(tmp, 'site')), appSite = await serveDir(path.join(tmp, 'app'));
  const apple = await appleMock({ teamId: ENV.APPLE_TEAM_ID, keyId: ENV.APPLE_KEY_ID, appId: ENV.APPLE_APP_ID, webId: ENV.APPLE_WEB_CLIENT_ID, webRedirect: site.url });
  const migrations = fs.readdirSync(path.join(root, 'server/migrations')).filter(f => f.endsWith('.sql')).sort().map(f => path.join(root, 'server/migrations', f));
  const DB = createD1(migrations);
  const env = { ...ENV, DB, APPLE_PRIVATE_KEY: apple.pem, APPLE_WEB_REDIRECT: site.url, ALLOWED_ORIGINS: `${site.url.slice(0, -1)},${appSite.url.slice(0, -1)}` };
  globalThis.fetch = async (input, init) => { // 後端對 Apple 的連線接到假的 Apple
    const req = new Request(input, init);
    const res = await apple.handle(req);
    if (res) return res;
    throw new Error(`後端連到了不該連的地方：${req.url}`);
  };
  resetAppleKeys();
  const pending = [], waitCtx = { waitUntil: p => pending.push(p), passThroughOnException() {} };
  const apiServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const headers = new Headers();
    for (const h of ['origin', 'authorization', 'content-type', 'access-control-request-method', 'access-control-request-headers']) if (req.headers[h]) headers.set(h, req.headers[h]);
    const r = await worker.fetch(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env, waitCtx);
    await Promise.all(pending.splice(0));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(resolve => apiServer.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${apiServer.address().port}`;
  const sql = async (q, ...args) => (await DB.prepare(q).bind(...args).all()).results;
  const count = async table => (await sql(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
  const serverNames = async () => { const rows = await sql('SELECT items FROM charts'); return rows.length === 1 ? JSON.parse(rows[0].items).map(i => i.name) : rows.length ? ['（不只一個帳號）'] : []; };
  const cfgFile = path.join(tmp, 'account.test.json');
  fs.writeFileSync(cfgFile, JSON.stringify({ apiBase: apiUrl, webClientId: ENV.APPLE_WEB_CLIENT_ID, webRedirect: site.url }));
  const built = spawnSync(process.execPath, [path.join(root, 'scripts/build.js')], { cwd: root, env: { ...process.env, PAIPAN_OUT: tmp, PAIPAN_ACCOUNT_CONFIG: cfgFile }, encoding: 'utf8' });
  if (built.status !== 0) { console.error('建置有帳號功能的那一份失敗：\n' + built.stdout + built.stderr); process.exit(1); }

  /* 假的 Apple 登入頁：網站換到 appleid.apple.com/auth/authorize 時攔下來，記下參數，照 Apple 的格式把結果接在 redirect_uri 的 # 後面帶回去。
     appleMode：ok（登入成功）、cancel（使用者按取消）、bad-state（帶回不對的 state） */
  const authorizeLog = [];
  let appleMode = 'ok';
  const appleRoute = async route => {
    const p = Object.fromEntries(new URL(route.request().url()).searchParams);
    authorizeLog.push(p);
    const sub = 'apple-user-1';
    const frag = appleMode === 'cancel'
      ? new URLSearchParams({ error: 'user_cancelled_authorize', state: p.state })
      : new URLSearchParams({ state: appleMode === 'bad-state' ? `0${p.state.slice(1)}` : p.state, code: apple.code(sub, p.client_id), id_token: await apple.idToken({ sub, aud: p.client_id, nonce: p.nonce }) });
    await route.fulfill({ status: 302, headers: { location: `${p.redirect_uri}#${frag}` } });
  };
  const routes = [[apiUrl, route => route.continue()], ['https://appleid.apple.com/auth/authorize', appleRoute]];
  const browser = await launch();
  const device = (opts = {}) => openSite(browser, site.url, { routes, ...opts });
  const allErrors = [];

  section('有帳號功能的那一份：隱私權政策、支援頁換成提到登入與同步的那一版');
  {
    const privacy = fs.readFileSync(path.join(tmp, 'site/privacy.html'), 'utf8'), support = fs.readFileSync(path.join(tmp, 'site/support.html'), 'utf8');
    const must = ['Apple 給的帳號代號', '不要你的姓名、電子郵件', 'Cloudflare', '刪除帳號', '向 Apple 撤銷', '最長 30 天', '只存在這台裝置上', '完全不連網路', 'We do not collect any data unless you sign in'];
    const miss = must.filter(t => !privacy.includes(t));
    ok(miss.length === 0 && !privacy.includes('我們不收集任何資料。你輸入的生辰') && !/<!--@/.test(privacy), `隱私權政策：寫明登入後存什麼、放在哪、怎麼刪，不再說「不收集任何資料」${miss.length ? '；缺：' + miss.join('、') : ''}`);
    ok(['使用 Apple 登入', '刪除帳號…', '登出會怎樣', '最多保留 100 筆'].every(t => support.includes(t)) && !support.includes('不會。資料只存在原本那台裝置上') && !/<!--@/.test(support), '支援頁：常見問題講登入、同步、登出、刪除帳號');
    const fragment = fs.readFileSync(path.join(tmp, 'paipan.html'), 'utf8');
    ok(!fragment.includes('id="acct"') && !fragment.includes('<meta name="paipan-api"'), '同一次建置的發布平台片段：照樣沒有帳號功能');
  }

  section('有帳號功能的那一份：沒登入時照舊，說明登入的用處');
  const A = await device();
  {
    const { page } = A;
    await page.waitForSelector('#acct:not([hidden]) #acct-in');
    eq(await buttonNames(page.locator('#acct')), ['使用Apple登入'], '表單下面有「使用 Apple 登入」');
    const text = await note(page);
    ok(text.includes('同步') && text.includes('不登入也能照常使用') && text.includes('這個瀏覽器'), `說明登入的用處，也說不登入照樣能用：${text}`);
    ok(await page.locator('.siwa-logo').count() === 0, '不是蘋果裝置（測試的瀏覽器在 Linux 上）：不放 Apple 標誌那個字（別的系統沒有那個字，會變成方框）');
    ok((await page.locator('footer').innerText()).includes('用 Apple 登入後，已存的盤會同步到雲端'), '頁尾的隱私說明換成提到同步的那一版');
    await page.evaluate(AXE);
    const { violations } = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
    ok(violations.length === 0, `axe-core 掃整份文件沒有違規${violations.length ? '：' + violations.map(v => v.id).join('、') : ''}`);
    await save(page, 'A1', '1984-02-04', '09:30');
    eq(await chips(page), ['A1'], '沒登入照樣存盤');
    ok(await count('users') === 0, '還沒有任何帳號');
  }
  {
    const { ctx, page } = await device({ context: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' } });
    await page.waitForSelector('#acct-in');
    ok(await page.locator('#acct-in .siwa-logo').count() === 1 && await page.locator('#acct-in .siwa-logo').getAttribute('aria-hidden') === 'true', '蘋果裝置：按鈕前面放 Apple 標誌（系統字型裡的那個字，讀屏不唸）');
    await ctx.close();
  }

  section('網頁版登入：換到 Apple 的登入頁，帶著結果回到網站');
  {
    const { page } = A;
    await mark(page);
    await page.locator('#acct-in').click();
    await reloaded(page);
    await waitState(page, '已同步');
    const p = authorizeLog.at(-1) || {};
    ok(p.client_id === ENV.APPLE_WEB_CLIENT_ID && p.redirect_uri === site.url && p.response_type === 'code id_token' && p.response_mode === 'fragment' && !('scope' in p),
      `送到 Apple 的參數：Services ID、登記的 redirect、結果接在 # 後面、不要姓名與電子郵件：${JSON.stringify({ ...p, nonce: '…', state: '…' })}`);
    ok(/^[0-9a-f]{64}$/.test(p.nonce) && /^[0-9a-f]{32}$/.test(p.state), 'nonce 交給 Apple 的是 SHA-256，state 是 128 位元的亂數');
    ok(page.url() === site.url, `回到網站後，網址列不留權杖（# 後面清掉了）：${page.url()}`);
    eq(await serverNames(), ['A1'], '第一次登入：這台原本存的盤併進帳號');
    const ex = apple.log.exchanges.at(-1) || {};
    ok(ex.client_id === ENV.APPLE_WEB_CLIENT_ID && ex.redirect_uri === site.url && ex.secretOk, '後端拿網站的授權碼向 Apple 換權杖（同一個 Services ID、同一個 redirect）');
    const [sess, base, left] = await page.evaluate(([a, b]) => [JSON.parse(localStorage.getItem(a)), JSON.parse(localStorage.getItem(b)), sessionStorage.length], [SESSION, SYNC]);
    ok(sess?.token && sess.sid && base?.sid === sess.sid && base.version === 1 && base.items.length === 1, '登入憑證和上次同步完的那份記在這個瀏覽器，用同一個 sid 綁在一起');
    ok(left === 0, '登入用的 state、nonce 用完就丟');
    eq(await buttonNames(page.locator('#acct')), ['立即同步', '登出', '刪除帳號…'], '登入後：立即同步、登出、刪除帳號');
  }

  section('第二台裝置：同一個 Apple 帳號、同一份盤；存、刪都會同步過去');
  const B = await device();
  {
    await save(B.page, 'B1', '1975-09-30', '23:05');
    await mark(B.page);
    await B.page.locator('#acct-in').click();
    await reloaded(B.page);
    await waitState(B.page, '已同步');
    eq(await chips(B.page), ['B1', 'A1'], '第二台登入：原本存的 B1 併進帳號，帳號裡的 A1 也下來了（這台的在前）');
    eq(await serverNames(), ['B1', 'A1'], '雲端也是這兩個');
    await A.page.locator('#acct-sync').click();
    await waitChips(A.page, ['B1', 'A1']).catch(() => {});
    eq(await chips(A.page), ['B1', 'A1'], '第一台按「立即同步」：B1 也到了');
    await del(A.page, 'A1');
    ok(await until(async () => (await serverNames()).join() === 'B1'), '第一台刪掉 A1：一會兒之後雲端也沒有了（存、刪之後自動同步）');
    await B.page.locator('#acct-sync').click();
    await waitChips(B.page, ['B1']).catch(() => {});
    eq(await chips(B.page), ['B1'], '第二台同步：A1 不見了');
    await save(B.page, 'B2', '1990-05-05');
    ok(await until(async () => (await serverNames()).join() === 'B2,B1'), '第二台存 B2：雲端也有了');
    await A.page.locator('#acct-sync').click();
    await waitChips(A.page, ['B2', 'B1']).catch(() => {});
    eq(await chips(A.page), ['B2', 'B1'], '第一台同步：B2 也到了');
  }

  section('兩台都離線各改各的，連上網路後合起來');
  {
    await A.ctx.setOffline(true); await B.ctx.setOffline(true);
    await save(A.page, 'A3', '2000-01-01');
    await del(A.page, 'B1');
    await save(B.page, 'B3', '2001-02-03');
    await waitState(A.page, '離線中，連上網路後會同步').catch(() => {});
    await waitState(B.page, '離線中，連上網路後會同步').catch(() => {});
    ok(await A.page.locator('#acct-state').innerText() === '離線中，連上網路後會同步' && sorted(await chips(A.page)).join() === 'A3,B2', `離線時狀態寫「離線中」，盤照樣存在這台：${await A.page.locator('#acct-state').innerText()}`);
    await A.ctx.setOffline(false);
    ok(await until(async () => sorted(await serverNames()).join() === 'A3,B2'), '第一台連上網路：自動同步，A3 上去、B1 刪掉');
    await B.ctx.setOffline(false);
    ok(await until(async () => sorted(await serverNames()).join() === 'A3,B2,B3'), '第二台連上網路：B3 併進去，B1 照樣是刪掉的');
    await A.page.locator('#acct-sync').click();
    await waitChips(A.page, await serverNames()).catch(() => {});
    await waitChips(B.page, await serverNames()).catch(() => {});
    const want = await serverNames();
    ok(JSON.stringify(await chips(A.page)) === JSON.stringify(want) && JSON.stringify(await chips(B.page)) === JSON.stringify(want), `兩台和雲端一模一樣（連順序）：${want.join('、')}`);
  }

  section('從 Apple 回來時 state 對不上、或使用者按了取消：都不登入');
  {
    const C = await device({ init: [logToasts] });
    const sessions = await count('sessions');
    appleMode = 'bad-state';
    await mark(C.page);
    await C.page.locator('#acct-in').click();
    await reloaded(C.page);
    await C.page.waitForFunction(() => window.toasts.some(t => t.includes('登入沒有完成')), null, { timeout: 10000 }).catch(() => {});
    ok((await toasts(C.page)).some(t => t.includes('登入沒有完成')), `state 對不上：提示「登入沒有完成，請再試一次」：${(await toasts(C.page)).join('、') || '沒有提示'}`);
    ok(await C.page.locator('#acct-in').isVisible() && C.page.url() === site.url, `沒有登入，網址也清乾淨了：${C.page.url()}`);
    appleMode = 'cancel';
    await mark(C.page);
    await C.page.locator('#acct-in').click();
    await reloaded(C.page);
    await C.page.waitForTimeout(300);
    ok(await C.page.locator('#acct-in').isVisible() && (await toasts(C.page)).length === 0, `按了取消：不登入，也不跳錯誤：${(await toasts(C.page)).join('、') || '沒有提示'}`);
    ok(await count('sessions') === sessions, '兩次都沒有在後端建立登入憑證');
    appleMode = 'ok';
    allErrors.push(...C.errors);
    await C.ctx.close();
  }

  section('登出：先確認；帳號的盤從這台移除，再登入就回來');
  {
    const { page } = B;
    await page.locator('#acct-out').click();
    const dlg = page.locator('dialog.confirm');
    ok(await dlg.isVisible() && await dlg.locator('h2').innerText() === '登出' && (await dlg.innerText()).includes('再登入就會回來'), '先跳出確認，說明登出會怎樣');
    ok(await page.evaluate(() => document.activeElement?.textContent) === '取消', '焦點預設在「取消」上');
    await page.evaluate(AXE);
    const { violations } = await page.evaluate(() => window.axe.run(document.querySelector('dialog.confirm'), { resultTypes: ['violations'] }));
    ok(violations.length === 0, `確認對話框：axe-core 沒有違規${violations.length ? '：' + violations.map(v => v.id).join('、') : ''}`);
    await page.keyboard.press('Escape');
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {}); // close 事件排在下一輪才觸發
    ok(await dlg.count() === 0 && await page.locator('#acct-out').isVisible(), '按 Esc：取消，還是登入著');
    const sessions = await count('sessions');
    await page.locator('#acct-out').click();
    await page.locator('dialog.confirm button[value=ok]').click();
    await page.waitForSelector('#acct-in');
    eq(await chips(page), [], '登出：從帳號同步來的盤從這台移除');
    ok(await until(async () => await count('sessions') === sessions - 1), '後端那份登入憑證也作廢了');
    const left = await page.evaluate(([a, b]) => [localStorage.getItem(a), localStorage.getItem(b)], [SESSION, SYNC]);
    eq(left, [null, null], '這個瀏覽器裡的登入憑證、同步紀錄都清掉了');
    eq(sorted(await serverNames()), ['A3', 'B2', 'B3'], '雲端的盤不動');
    await mark(page);
    await page.locator('#acct-in').click();
    await reloaded(page);
    await waitState(page, '已同步');
    eq(sorted(await chips(page)), ['A3', 'B2', 'B3'], '再登入：盤回來了');
  }

  section('登入失效（後端的憑證沒了）：回到沒登入，盤留在這台');
  {
    const { page } = A;
    const token = (await page.evaluate(k => JSON.parse(localStorage.getItem(k)), SESSION)).token;
    await sql('DELETE FROM sessions WHERE token_hash = ?1', sha(token));
    await page.locator('#acct-sync').click();
    await page.waitForSelector('#acct-in');
    ok((await note(page)).includes('登入已經失效'), `說明登入已經失效、請重新登入：${await note(page)}`);
    eq(sorted(await chips(page)), ['A3', 'B2', 'B3'], '盤都還在');
    ok(await page.evaluate(k => localStorage.getItem(k), SESSION) === null, '失效的憑證從這個瀏覽器清掉');
  }

  section('刪除帳號：確認後才刪；雲端清空、撤銷 Apple 授權、這台的帳號的盤移除');
  {
    const { page } = B;
    await page.locator('#acct-del').click();
    const dlg = page.locator('dialog.confirm');
    ok((await dlg.innerText()).includes('無法復原') && await dlg.locator('button[value=ok]').innerText() === '刪除帳號', '確認的說明寫清楚無法復原，按鈕就叫「刪除帳號」');
    await dlg.locator('button[value=cancel]').click();
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
    ok(await dlg.count() === 0 && await count('users') === 1 && await count('charts') === 1, '取消：對話框關掉，什麼都沒刪');
    await page.locator('#acct-del').click();
    await page.locator('dialog.confirm button[value=ok]').click();
    await page.waitForSelector('#acct-in');
    eq([await count('users'), await count('charts'), await count('sessions')], [0, 0, 0], '雲端的帳號、盤、所有裝置的登入憑證全刪');
    const rv = apple.log.revokes.at(-1) || {};
    ok(rv.client_id === ENV.APPLE_WEB_CLIENT_ID && rv.token_type_hint === 'refresh_token' && rv.secretOk, '向 Apple 撤銷了授權（用網站那次登入拿到的權杖）');
    ok(await note(page) === '帳號已刪除。', `告訴使用者帳號已刪除：${await note(page)}`);
    eq(await chips(page), [], '這台從帳號同步來的盤一起移除');
  }
  allErrors.push(...A.errors, ...B.errors);
  const strays = [...A.external, ...B.external].filter(u => !/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u));
  ok(strays.length === 0, `網站版除了字型（網站版本來就向 Google 要字型），沒有連到後端與 Apple 以外的地方${strays.length ? '：' + strays.join('、') : ''}`);
  await A.ctx.close(); await B.ctx.close();

  section('App 版：iOS 原生的 Apple 登入、登入憑證放鑰匙圈、在 Apple 那邊停用了就登出');
  {
    const SUB = 'apple-user-7';
    const { ctx, page, errors, external } = await openSite(browser, appSite.url, {
      routes, init: [fakeNative, logToasts],
      // 原生用 nonce 的 SHA-256 向 Apple 要身分權杖（AuthenticationServices 會把 request.nonce 原樣放進權杖）
      before: p => p.exposeFunction('__appleNative', async nonce => ({ identityToken: await apple.idToken({ sub: SUB, aud: ENV.APPLE_APP_ID, nonce: sha(nonce) }), authorizationCode: apple.code(SUB, ENV.APPLE_APP_ID), user: SUB })),
    });
    const calls = m => page.evaluate(x => window.__native.filter(c => c[0] === x).map(c => c[1] ?? null), m);
    await page.waitForSelector('#acct:not([hidden]) #acct-in');
    ok(await page.locator('#acct-in .siwa-logo').count() === 1 && (await note(page)).includes('這台裝置'), 'App：按鈕前面有 Apple 標誌，說明裡講的是「這台裝置」');
    await page.evaluate(() => { window.__cancel = true; });
    await page.locator('#acct-in').click();
    await page.waitForFunction(() => window.__native.some(c => c[0] === 'signInWithApple'));
    await page.waitForTimeout(200);
    ok(await page.locator('#acct-in').isVisible() && (await toasts(page)).length === 0, `在原生面板按了取消：不登入，也不跳錯誤：${(await toasts(page)).join('、') || '沒有提示'}`);
    await page.evaluate(() => { window.__cancel = false; });
    await save(page, 'X1', '1966-06-06');
    await page.locator('#acct-in').click();
    await waitState(page, '已同步');
    const [sign] = (await calls('signInWithApple')).slice(-1);
    ok(/^[\w-]+\.\d+\.[\w-]+$/.test(sign?.nonce || ''), '交給原生的是後端發的 nonce 原文（SHA-256 由原生算）');
    const ex = apple.log.exchanges.at(-1) || {};
    ok(ex.client_id === ENV.APPLE_APP_ID && ex.redirect_uri === undefined && ex.secretOk, '後端拿 App 的授權碼向 Apple 換權杖（Bundle ID，不帶 redirect）');
    const secret = JSON.parse(await page.evaluate(() => window.__secret) || 'null');
    ok(secret?.token && secret.appleUser === SUB && await page.evaluate(k => localStorage.getItem(k), SESSION) === null, '登入憑證放在鑰匙圈（連同 Apple 的使用者代號），不放 localStorage');
    eq(await serverNames(), ['X1'], 'App 原本存的盤併進帳號');
    ok(await page.evaluate(k => typeof window.__store[k] === 'string', SYNC), '同步紀錄和已存清單一樣在原生留備份');
    const sessions = await count('sessions');
    await page.evaluate(() => { window.__cred = 'revoked'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForSelector('#acct-in');
    ok((await note(page)).includes('停用'), `回到 App 時發現在 Apple 那邊停用了：登出並說明：${await note(page)}`);
    eq(await chips(page), [], '帳號的盤從這台移除（TN3194）');
    ok(await page.evaluate(() => window.__secret) === null && await page.evaluate(k => !(k in window.__store), SYNC), '鑰匙圈裡的憑證、原生那份同步紀錄都清掉');
    ok(await until(async () => await count('sessions') === sessions - 1), '後端那份登入憑證也作廢了');
    ok(external.length === 0, `App 版沒有連到後端以外的地方${external.length ? '：' + external.join('、') : ''}`);
    allErrors.push(...errors);
    await ctx.close();
  }

  section('App 版：從備份補回來的同步紀錄不是這次登入的，就不拿來刪盤');
  {
    /* 情境：系統清掉了 App 的網頁資料，原生的備份裡剩一份舊的同步紀錄（上一次登入的，裡面有「甲」），
       這台的已存清單是空的，鑰匙圈裡是這一次登入的憑證。舊紀錄若被拿來合併，「甲」會被當成這台刪掉的、從雲端刪掉。
       同步紀錄和登入憑證用 sid 綁在一起（account.js），不是同一次登入的一律不用：只會合起來，不會刪 */
    const direct = async (method, p, { body, token } = {}) => {
      const headers = new Headers();
      if (token) headers.set('Authorization', `Bearer ${token}`);
      if (body !== undefined) headers.set('Content-Type', 'application/json');
      const r = await worker.fetch(new Request(`http://127.0.0.1${p}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, waitCtx);
      await Promise.all(pending.splice(0));
      return { status: r.status, body: await r.json() };
    };
    const s = await client({ call: direct, apple, env }).signIn({ sub: 'apple-user-8' });
    await direct('PUT', '/v1/charts', { token: s.body.token, body: { baseVersion: 0, items: [CHART_A] } });
    const seed = { stale: JSON.stringify({ sid: 'earlier-sign-in', version: 1, items: [CHART_A] }), secret: JSON.stringify({ token: s.body.token, user: s.body.user.id, sid: 'this-sign-in', appleUser: null }) };
    const { ctx, page, errors } = await openSite(browser, appSite.url, { routes, init: [fakeNative, [x => { window.__store['paipan-sync-v1'] = x.stale; window.__secret = x.secret; }, seed]] });
    await waitState(page, '已同步').catch(() => {});
    const rows = await sql('SELECT items FROM charts WHERE user_id = ?1', s.body.user.id);
    ok(rows.length === 1 && JSON.parse(rows[0].items).map(i => i.name).join() === '甲', `雲端的「甲」還在：${rows.map(r => r.items).join()}`);
    eq(await chips(page), ['甲'], '這台的清單從雲端補回「甲」');
    ok(await page.evaluate(k => JSON.parse(localStorage.getItem(k))?.sid, SYNC) === 'this-sign-in', '同步紀錄換成這一次登入的');
    allErrors.push(...errors);
    await ctx.close();
  }

  ok(allErrors.length === 0, `無錯誤${allErrors.length ? '：' + allErrors.join(' | ') : ''}`);
  await browser.close();
  await site.close(); await appSite.close();
  await new Promise(resolve => apiServer.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
  finish();
})();
