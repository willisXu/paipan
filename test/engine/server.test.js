/* 帳號與同步的後端（第 15 版，server/）：node test/engine/server.test.js。不需要網路、不需要 Cloudflare。
   後端程式原封不動在 Node 跑：D1 換成 node:sqlite（test/helpers/d1.js），對 Apple 的連線換成假的 Apple（test/helpers/apple-mock.js），
   其他任何對外連線都算失敗。共用的情境在 test/helpers/server-scenario.js（Cloudflare 的執行環境那一份也跑同一套）；
   這裡另外測 Node 才方便做的：沒設金鑰、沒設祕密、Apple 換授權碼失敗、登入憑證的效期、每天的清理排程，以及設定檔和其他地方一致。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../helpers/libs.js'; // 網頁的檢查（saved-data.js）會用到曆法函式庫，要先掛上
import { ok, eq, section, finish } from '../helpers/harness.js';
import { createD1 } from '../helpers/d1.js';
import { appleMock } from '../helpers/apple-mock.js';
import { scenario, client, ENV, WEB, APP, CHART_A, CHART_B } from '../helpers/server-scenario.js';
import { clean, MAX_SAVED } from '../../src/app/saved-data.js';
import worker from '../../server/src/index.js';
import { resetAppleKeys } from '../../server/src/apple.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'server/migrations')).filter(f => f.endsWith('.sql')).sort().map(f => path.join(root, 'server/migrations', f));

// 一套全新的後端：空的資料庫、新的假 Apple。over 覆寫設定
async function setup(over = {}) {
  const DB = createD1(migrations);
  const apple = await appleMock({ teamId: ENV.APPLE_TEAM_ID, keyId: ENV.APPLE_KEY_ID, appId: ENV.APPLE_APP_ID, webId: ENV.APPLE_WEB_CLIENT_ID, webRedirect: ENV.APPLE_WEB_REDIRECT });
  const env = { ...ENV, APPLE_PRIVATE_KEY: apple.pem, DB, ...over };
  const pending = [];
  const ctx = { waitUntil: p => pending.push(p), passThroughOnException() {} };
  globalThis.fetch = async (input, init) => {
    const req = new Request(input, init);
    const res = await apple.handle(req);
    if (res) return res;
    throw new Error(`後端連到了不該連的地方：${req.url}`);
  };
  resetAppleKeys();
  const call = async (method, p, { body, token, origin, raw } = {}) => {
    const headers = new Headers();
    if (origin) headers.set('Origin', origin);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    if (payload !== undefined) headers.set('Content-Type', 'application/json');
    const res = await worker.fetch(new Request(`https://paipan-api.test${p}`, { method, headers, body: payload }), env, ctx);
    await Promise.all(pending.splice(0));
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  const sql = async (q, ...args) => (await DB.prepare(q).bind(...args).all()).results;
  return { env, apple, call, sql, ctx, pending, ...client({ call, apple, env }) };
}

{
  const s = await setup();
  await scenario({ ...s, t: { ok, eq, section } });
}

section('（Node）沒有設 Apple 的私鑰：登入照常，刪除帳號時沒辦法替使用者撤銷');
{
  const { call, apple, sql, signIn } = await setup({ APPLE_PRIVATE_KEY: '' });
  ok((await call('GET', '/v1/health', { origin: WEB })).body.revoke === false, '健康檢查說不能撤銷');
  const r = await signIn();
  ok(r.status === 200 && apple.log.exchanges.length === 0, '登入照常，沒有去向 Apple 換授權碼');
  ok((await sql('SELECT apple_refresh FROM users'))[0].apple_refresh === null, '沒有存 refresh token');
  const d = await call('DELETE', '/v1/account', { origin: APP, token: r.body.token });
  ok(d.status === 200 && d.body.deleted === true && d.body.revoked === false && apple.log.revokes.length === 0, '刪除帳號照樣刪，回覆說沒有撤銷（App 會請使用者自己到設定裡停用）');
}

section('（Node）Apple 換授權碼失敗：登入照常，只是沒有權杖可以撤銷');
{
  const { call, apple, sql, signIn } = await setup();
  const r = await signIn({ code: 'code-that-apple-never-issued' });
  ok(r.status === 200 && apple.log.exchanges.length === 1 && (await sql('SELECT apple_refresh FROM users'))[0].apple_refresh === null, '授權碼換不到：登入成功，不存權杖');
  const d = await call('DELETE', '/v1/account', { origin: APP, token: r.body.token });
  ok(d.body.deleted === true && d.body.revoked === false, '刪除帳號：刪了，沒有撤銷');
  const noCode = await signIn({ code: false });
  ok(noCode.status === 200 && apple.log.exchanges.length === 1, '沒帶授權碼：登入成功，不去換');
}

section('（Node）還沒設祕密：除了健康檢查都回 503');
{
  const { call } = await setup({ SESSION_SECRET: '' });
  const n = await call('POST', '/v1/auth/nonce', { origin: WEB });
  ok(n.status === 503 && n.body.error === 'not_configured', `要 nonce：503 ${n.body.error}`);
  const h = await call('GET', '/v1/health', { origin: WEB });
  ok(h.status === 200 && h.body.configured === false, '健康檢查照常回應，說還沒設定好');
}

section('（Node）登入憑證的效期：過期作廢，有在用就往後延');
{
  const { call, sql, signIn } = await setup();
  const a = await signIn();
  await sql('UPDATE sessions SET expires_at = ?1', Date.now() - 1);
  ok((await call('GET', '/v1/me', { origin: APP, token: a.body.token })).status === 401, '過期的憑證：401');
  ok((await sql('SELECT COUNT(*) AS n FROM sessions'))[0].n === 0, '過期的憑證順手刪掉');
  const b = await signIn();
  const old = Date.now() - 2 * 864e5;
  await sql('UPDATE sessions SET last_used_at = ?1, expires_at = ?2', old, Date.now() + 10 * 864e5);
  ok((await call('GET', '/v1/me', { origin: APP, token: b.body.token })).status === 200, '快到期但還沒到期：照常');
  const [row] = await sql('SELECT last_used_at, expires_at FROM sessions');
  ok(row.last_used_at > old && row.expires_at > Date.now() + 179 * 864e5, '用了一次：效期從今天起重新算 180 天');
  await call('GET', '/v1/me', { origin: APP, token: b.body.token });
  const [row2] = await sql('SELECT last_used_at FROM sessions');
  ok(row2.last_used_at === row.last_used_at, '同一天內再用：不再寫資料庫');
}

section('（Node）每天的排程：清掉過期的 nonce 紀錄和登入憑證');
{
  const { env, ctx, pending, sql, signIn, call } = await setup();
  const keep = await signIn(), gone = await signIn({ sub: 'apple-user-9' });
  await sql('UPDATE sessions SET expires_at = ?1 WHERE user_id = (SELECT id FROM users WHERE apple_sub = ?2)', Date.now() - 1, 'apple-user-9');
  await sql('INSERT INTO used_nonces (nonce, expires_at) VALUES (?1, ?2), (?3, ?4)', 'old', Date.now() - 1, 'fresh', Date.now() + 60e3);
  await worker.scheduled({ cron: '17 19 * * *', scheduledTime: Date.now() }, env, ctx);
  await Promise.all(pending.splice(0));
  eq((await sql('SELECT nonce FROM used_nonces ORDER BY nonce')).map(r => r.nonce).filter(n => n === 'old' || n === 'fresh'), ['fresh'], '過期的 nonce 紀錄清掉，沒過期的留著');
  ok((await sql('SELECT COUNT(*) AS n FROM sessions'))[0].n === 1 && (await call('GET', '/v1/me', { origin: APP, token: keep.body.token })).status === 200, '過期的登入憑證清掉，有效的留著');
  ok(gone.status === 200, '（被清掉的那份原本是有效登入的）');
}

section('（Node）一個盤的欄位：後端和網頁的檢查一致');
{
  const server = read('server/src/index.js');
  const fields = Object.keys(Function(`return ${server.match(/const FIELDS = (\{[\s\S]*?\});/)[1]}`)()).sort();
  eq(clean(CHART_A), CHART_A, '測試用的盤 A（公曆、台北）就是網頁整理過的樣子（欄位、順序都相同）');
  eq(clean(CHART_B), CHART_B, '測試用的盤 B（農曆、自訂經度與時區）也是');
  eq([...new Set([...Object.keys(CHART_A), ...Object.keys(CHART_B)])].sort(), fields, '後端接受的欄位，就是網頁整理出來的欄位（兩種曆法、自訂地點合起來）');
  const maxServer = Number(server.match(/^const MAX_ITEMS = (\d+);$/m)[1]);
  ok(maxServer === MAX_SAVED, `已存清單的上限兩邊相同：後端 ${maxServer}、網頁 ${MAX_SAVED}`);
}

section('（Node）wrangler.toml 和 App、網站的設定一致');
{
  // Workers 把主模組的每個具名匯出都當成進入點：匯出別的東西，部署後啟動不了
  eq(Object.keys(await import('../../server/src/index.js')), ['default'], '後端的主模組只匯出 default（fetch 與 scheduled）');
  const toml = read('server/wrangler.toml');
  const v = name => (toml.match(new RegExp(`^${name} = "([^"]*)"$`, 'm')) || [])[1];
  const cap = JSON.parse(read('capacitor.config.json'));
  eq(v('APPLE_APP_ID'), cap.appId, 'Apple 登入的 App 識別碼就是 App 的 Bundle ID');
  eq(v('ALLOWED_ORIGINS'), ENV.ALLOWED_ORIGINS, '允許的來源：網站和 App 裡的網頁（測試用的也是這兩個）');
  for (const k of ['APPLE_WEB_CLIENT_ID', 'APPLE_WEB_REDIRECT']) eq(v(k), ENV[k], `${k} 和測試的設定相同`);
  const account = JSON.parse(read('account.config.json'));
  ok(account.webClientId === v('APPLE_WEB_CLIENT_ID') && account.webRedirect === v('APPLE_WEB_REDIRECT'), '網頁建置用的 Services ID、redirect 網址和後端的一樣（account.config.json）');
  ok(/^binding = "DB"$/m.test(toml) && /^migrations_dir = "migrations"$/m.test(toml) && /^main = "src\/index\.js"$/m.test(toml), '資料庫綁定叫 DB、migration 在 migrations/、進入點是 src/index.js');
  ok(!/SESSION_SECRET|TOKEN_KEY|PRIVATE KEY/.test(toml.replace(/^#.*$/gm, '')), '祕密不寫在設定檔裡');
}

finish();
