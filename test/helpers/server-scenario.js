/* 後端的測試情境，兩個地方共用：
     test/engine/server.test.js   在 Node 跑（D1 換成 node:sqlite），npm run check 每次都跑
     server/test/workerd.test.js  在 Cloudflare 自己的執行環境跑（Miniflare：workerd ＋ 真的 D1），部署前在 server/ 裡 npm test
   call(method, path, { body, token, origin, raw }) 送一個請求，回傳 { status, headers, body }（body 已解析 JSON）；
   sql(query, ...args) 直接查資料庫（回傳列的陣列）；apple 是 test/helpers/apple-mock.js 的假 Apple；env 是後端的設定。 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/* 後端的設定檔 server/wrangler.jsonc：JSON 加上整行的 // 註解（設定檔裡的註解都寫在自己的一行，網址裡的 // 不受影響） */
export function readWrangler() {
  const text = fs.readFileSync(fileURLToPath(new URL('../../server/wrangler.jsonc', import.meta.url)), 'utf8');
  return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
}

export const WEB = 'https://willisxu.github.io', APP = 'capacitor://localhost';
export const ENV = {
  ALLOWED_ORIGINS: `${WEB},${APP}`,
  APPLE_APP_ID: 'io.github.willisxu.paipan', APPLE_WEB_CLIENT_ID: 'io.github.willisxu.paipan.web', APPLE_WEB_REDIRECT: 'https://willisxu.github.io/paipan/',
  APPLE_TEAM_ID: 'TEAM123456', APPLE_KEY_ID: 'KEY1234567',
  SESSION_SECRET: 'test-session-secret-not-for-production', TOKEN_KEY: 'test-token-key-not-for-production',
};
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
// 兩個盤：和網頁 saved.js 的 check 整理出來的樣子相同
export const CHART_A = { name: '甲', gender: '男', calendar: 'solar', h: 9, mi: 30, place: '台北', clock: 'auto', useTST: false, ziRule: 'next', zwHua: 'tongxing', zwYear: 'lunar', zwLeap: 'mid', y: 1984, m: 2, d: 4 };
export const CHART_B = { name: '乙', gender: '女', calendar: 'lunar', h: 23, mi: 5, place: 'custom', clock: 'std', useTST: true, ziRule: 'same', zwHua: 'zhongzhou', zwYear: 'lichun', zwLeap: 'current', lon: 121.5, tz: 8, ly: 1975, lm: 8, ld: 26, leap: false };

// 照用戶端的做法登入：先要 nonce，Apple 的身分權杖裡放 nonce 的 SHA-256，連同授權碼送給後端。code 可以是 true（發一個對的）、false（不帶）或字串（照送）
export function client({ call, apple, env }) {
  const nonce = async () => (await call('POST', '/v1/auth/nonce', { origin: WEB })).body.nonce;
  async function signIn({ sub = 'apple-user-1', client: kind = 'app', code = true, over = {}, n, origin } = {}) {
    n = n || await nonce();
    const aud = kind === 'web' ? env.APPLE_WEB_CLIENT_ID : env.APPLE_APP_ID;
    const identityToken = await apple.idToken({ sub, aud, nonce: sha(n), ...over });
    const authorizationCode = code === true ? apple.code(sub, aud) : code || undefined;
    return call('POST', '/v1/auth/apple', { origin: origin || (kind === 'web' ? WEB : APP), body: { identityToken, authorizationCode, nonce: n } });
  }
  return { nonce, signIn };
}

export async function scenario({ call, sql, apple, env, t }) {
  const { ok, eq, section } = t;
  const { nonce, signIn } = client({ call, apple, env });
  const userOf = async sub => (await sql('SELECT * FROM users WHERE apple_sub = ?1', sub))[0];
  const countFor = async userId => {
    const n = {};
    for (const table of ['users', 'sessions', 'charts']) n[table] = (await sql(`SELECT COUNT(*) AS n FROM ${table} WHERE ${table === 'users' ? 'id' : 'user_id'} = ?1`, userId))[0].n;
    return n;
  };
  const notify = async (type, sub, over = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const payload = await apple.sign({ iss: 'https://appleid.apple.com', aud: env.APPLE_APP_ID, iat: now, exp: now + 300, jti: crypto.randomUUID(), events: JSON.stringify({ type, sub, event_time: Date.now() }), ...over });
    return call('POST', '/v1/apple/notifications', { origin: null, body: { payload } });
  };

  section('服務狀態、跨來源');
  {
    const h = await call('GET', '/v1/health', { origin: WEB });
    ok(h.status === 200 && h.body.ok && h.body.configured && h.body.revoke, `健康檢查：設定完成、可以撤銷 Apple 授權：${JSON.stringify(h.body)}`);
    ok(h.headers.get('access-control-allow-origin') === WEB && h.headers.get('cache-control') === 'no-store' && /origin/i.test(h.headers.get('vary') || ''), '網站來的請求：回應帶跨來源標頭、不快取');
    const pre = await call('OPTIONS', '/v1/charts', { origin: APP });
    ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === APP && /authorization/i.test(pre.headers.get('access-control-allow-headers')) && /PUT/.test(pre.headers.get('access-control-allow-methods')), 'App 裡的網頁（capacitor://localhost）預檢通過：可以帶登入憑證、可以用 PUT');
    const evil = await call('GET', '/v1/health', { origin: 'https://evil.example' });
    ok(evil.status === 403 && !evil.headers.get('access-control-allow-origin'), `不在名單上的網站：拒絕，也不給跨來源標頭（${evil.status}）`);
    const fileOrigin = await call('POST', '/v1/auth/nonce', { origin: 'null' });
    ok(fileOrigin.status === 403, '來源是 null（本機檔案、沙盒框架）：拒絕');
    const none = await call('GET', '/v1/health', { origin: null });
    ok(none.status === 200 && !none.headers.get('access-control-allow-origin'), '沒有來源標頭（伺服器、命令列工具）：照常回應，不帶跨來源標頭');
    const nf = await call('GET', '/v1/nothing', { origin: WEB });
    ok(nf.status === 404 && nf.body.error === 'not_found', '沒有的路徑：404');
    ok((await call('DELETE', '/v1/charts', { origin: WEB })).status === 404, '沒有的方法：404');
  }

  section('登入：nonce、Apple 的身分權杖、授權碼');
  let appToken, userId, firstCode;
  {
    const n = await nonce();
    ok(/^[\w-]{22}\.\d{13}\.[\w-]{32}$/.test(n), `nonce 是「亂數.到期時間.簽章」：${n}`);
    const r = await signIn({ n });
    appToken = r.body.token; userId = r.body.user?.id;
    ok(r.status === 200 && /^[\w-]{43}$/.test(appToken) && /^[\w-]{22}$/.test(userId) && r.body.expiresAt > Date.now() + 170 * 864e5, `用 App 登入：拿到登入憑證和帳號代號（${r.status} ${JSON.stringify(r.body).slice(0, 80)}）`);
    const ex = apple.log.exchanges.at(-1);
    firstCode = ex?.code;
    ok(ex && ex.client_id === env.APPLE_APP_ID && ex.redirect_uri === undefined && ex.grant_type === 'authorization_code' && ex.secretOk, '授權碼拿去向 Apple 換權杖：用戶端是 App 的 Bundle ID、不帶 redirect_uri、用戶端密鑰簽得對（ES256、團隊、金鑰代號）');
    const u = await userOf('apple-user-1');
    ok(u && u.id === userId && u.apple_client_id === env.APPLE_APP_ID && typeof u.apple_refresh === 'string' && !u.apple_refresh.includes('refresh-'), 'Apple 的 refresh token 存起來了，而且是加密過的（資料庫裡看不到原文）');
    const s = await sql('SELECT * FROM sessions WHERE user_id = ?1', userId);
    ok(s.length === 1 && s[0].token_hash === sha(appToken) && s[0].client === 'app' && !JSON.stringify(s).includes(appToken), '登入憑證只存雜湊；記下是 App 登入的');
    ok(!JSON.stringify(await sql('SELECT * FROM users')).match(/@|name/i), '帳號資料裡沒有電子郵件、姓名');
    const replay = await call('POST', '/v1/auth/apple', { origin: APP, body: { identityToken: await apple.idToken({ nonce: sha(n) }), nonce: n } });
    ok(replay.status === 401 && replay.body.error === 'nonce_used', `同一個 nonce 不能用第二次（防止身分權杖被拿去重送）：${replay.body.error}`);
  }

  section('登入：各種不該通過的權杖');
  {
    const expect = async (what, res, status, code) => ok(res.status === status && res.body.error === code, `${what}：${res.status} ${res.body.error}（應為 ${status} ${code}）`);
    await expect('身分權杖裡的 nonce 不是這次的', await signIn({ over: { nonce: sha('別的') } }), 401, 'nonce_mismatch');
    await expect('身分權杖裡沒有 nonce', await signIn({ over: { nonce: undefined } }), 401, 'nonce_mismatch');
    await expect('對象不是我們的 App 或網站', await signIn({ over: { aud: 'com.example.other' } }), 401, 'bad_audience');
    await expect('簽發者不是 Apple', await signIn({ over: { iss: 'https://evil.example' } }), 401, 'bad_issuer');
    await expect('已經過期', await signIn({ over: { exp: Math.floor(Date.now() / 1000) - 120 } }), 401, 'expired');
    await expect('簽發時間在未來', await signIn({ over: { iat: Math.floor(Date.now() / 1000) + 3600 } }), 401, 'bad_time');
    {
      const n = await nonce();
      const forged = await apple.forge({ iss: 'https://appleid.apple.com', aud: env.APPLE_APP_ID, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), sub: 'apple-user-1', nonce: sha(n) }, { alg: 'RS256', kid: apple.kid });
      await expect('金鑰代號對、簽章是別把金鑰簽的', await call('POST', '/v1/auth/apple', { origin: APP, body: { identityToken: forged, nonce: n } }), 401, 'bad_signature');
    }
    {
      const n = await nonce(), before = apple.log.keyFetches;
      const unknown = await apple.forge({ iss: 'https://appleid.apple.com', aud: env.APPLE_APP_ID, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), sub: 'apple-user-1', nonce: sha(n) }, { alg: 'RS256', kid: 'NEW-KID' });
      await expect('沒見過的金鑰代號', await call('POST', '/v1/auth/apple', { origin: APP, body: { identityToken: unknown, nonce: n } }), 401, 'unknown_key');
      ok(apple.log.keyFetches === before + 1, `沒見過的代號：重抓一次 Apple 的公鑰（Apple 換金鑰時才登入得了），只抓一次（抓了 ${apple.log.keyFetches - before} 次）`);
      const again = await apple.forge({ iss: 'https://appleid.apple.com', aud: env.APPLE_APP_ID, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), sub: 'apple-user-1', nonce: sha(await nonce()) }, { alg: 'RS256', kid: 'NEWER-KID' });
      await call('POST', '/v1/auth/apple', { origin: APP, body: { identityToken: again, nonce: await nonce() } });
      ok(apple.log.keyFetches === before + 1, '一分鐘內再來一個沒見過的代號：不再重抓（免得被拿來一直敲 Apple）');
    }
    {
      const n = await nonce();
      const [r, exp, sig] = n.split('.');
      await expect('nonce 的簽章被改過', await signIn({ n: `${r}.${exp}.${sig.slice(0, -1)}${sig.endsWith('A') ? 'B' : 'A'}` }), 401, 'bad_nonce');
      await expect('nonce 的到期時間被改過', await signIn({ n: `${r}.${Number(exp) + 3600e3}.${sig}` }), 401, 'bad_nonce');
      const past = Date.now() - 1000;
      const pastSig = crypto.createHmac('sha256', env.SESSION_SECRET).update(`nonce.${r}.${past}`).digest('base64url').slice(0, 32);
      await expect('nonce 過期了（簽章是對的）', await signIn({ n: `${r}.${past}.${pastSig}` }), 401, 'nonce_expired');
      await expect('nonce 格式不對', await signIn({ n: 'abc' }), 400, 'bad_nonce');
    }
    await expect('身分權杖不是 JWT', await call('POST', '/v1/auth/apple', { origin: APP, body: { identityToken: 'not-a-jwt', nonce: await nonce() } }), 401, 'bad_token');
    await expect('身分權杖的演算法不是 RS256', await call('POST', '/v1/auth/apple', { origin: APP, body: { identityToken: await apple.sign({ sub: 'x' }, { header: { alg: 'none', kid: apple.kid } }), nonce: await nonce() } }), 401, 'bad_token');
    await expect('內容不是 JSON', await call('POST', '/v1/auth/apple', { origin: APP, raw: '{oops' }), 400, 'bad_json');
    await expect('內容太大', await call('POST', '/v1/auth/apple', { origin: APP, raw: JSON.stringify({ pad: 'x'.repeat(100 * 1024) }) }), 413, 'too_large');
    const users = await sql('SELECT COUNT(*) AS n FROM users');
    ok(users[0].n === 1, `上面這些都沒有建立帳號（帳號數 ${users[0].n}）`);
  }

  section('登入憑證');
  {
    const r = await call('GET', '/v1/me', { origin: APP, token: appToken });
    ok(r.status === 200 && r.body.user.id === userId && r.body.charts.version === 0 && r.body.charts.count === 0, `帶憑證查帳號：${JSON.stringify(r.body)}`);
    for (const [what, token] of [['沒帶憑證', undefined], ['憑證不對', appToken.slice(0, -2) + 'xx'], ['憑證格式不對', 'short']]) {
      const x = await call('GET', '/v1/me', { origin: APP, token });
      ok(x.status === 401 && x.body.error === 'no_session', `${what}：401`);
    }
  }

  section('已存的盤：版本號防止兩台裝置互相蓋掉');
  {
    const get = () => call('GET', '/v1/charts', { origin: APP, token: appToken });
    const put = (baseVersion, items, token = appToken) => call('PUT', '/v1/charts', { origin: APP, token, body: { baseVersion, items } });
    eq((await get()).body, { version: 0, items: [], updatedAt: null }, '還沒存過：版本 0、空清單');
    const p1 = await put(0, [CHART_A]);
    ok(p1.status === 200 && p1.body.version === 1, `第一次寫入：版本 1（${p1.status}）`);
    const stale = await put(0, [CHART_B]);
    ok(stale.status === 409 && stale.body.error === 'conflict' && stale.body.version === 1 && JSON.stringify(stale.body.items) === JSON.stringify([CHART_A]), '拿舊的版本號寫：409，回傳最新的那份（用戶端合併後再送）');
    const p2 = await put(1, [CHART_B, CHART_A]);
    ok(p2.status === 200 && p2.body.version === 2, '帶對的版本號：寫入，版本 2');
    const stale2 = await put(1, [CHART_A]);
    ok(stale2.status === 409 && stale2.body.version === 2 && stale2.body.items.length === 2, '已經有資料之後，拿舊的版本號（1）寫：一樣 409，資料不動');
    const ahead = await put(7, [CHART_A]);
    ok(ahead.status === 409 && ahead.body.version === 2, '版本號比雲端的還新（不可能的情況）：409');
    const g = await get();
    ok(g.body.version === 2 && JSON.stringify(g.body.items) === JSON.stringify([CHART_B, CHART_A]) && g.body.updatedAt > 0, '讀回來就是寫進去的那份，順序不變');
    const bad = async (what, body, code = 'bad_items') => { const r = await call('PUT', '/v1/charts', { origin: APP, token: appToken, body }); ok(r.status === 400 && r.body.error === code, `${what}：400 ${r.body.error}`); };
    await bad('清單不是陣列', { baseVersion: 2, items: { a: 1 } });
    await bad('超過 100 個', { baseVersion: 2, items: Array.from({ length: 101 }, (_, i) => ({ ...CHART_A, name: String(i) })) });
    await bad('不認得的欄位', { baseVersion: 2, items: [{ ...CHART_A, note: '備註' }] });
    await bad('欄位叫 __proto__', { baseVersion: 2, items: [JSON.parse(`{"__proto__":"x","name":"a"}`)] });
    await bad('欄位叫 constructor', { baseVersion: 2, items: [{ constructor: 'x' }] });
    await bad('型別不對（時辰是字串）', { baseVersion: 2, items: [{ ...CHART_A, h: '9' }] });
    await bad('字串太長', { baseVersion: 2, items: [{ ...CHART_A, name: '長'.repeat(41) }] });
    await bad('裡面再包物件', { baseVersion: 2, items: [{ ...CHART_A, name: { x: 1 } }] });
    await bad('空物件', { baseVersion: 2, items: [{}] });
    await bad('版本號是字串', { baseVersion: '2', items: [] }, 'bad_version');
    await bad('版本號是負的', { baseVersion: -1, items: [] }, 'bad_version');
    ok((await get()).body.version === 2, '不合格的寫入都沒有改到資料');
    const full = Array.from({ length: 100 }, (_, i) => ({ ...CHART_A, name: `第${i}` }));
    const p3 = await put(2, full);
    ok(p3.status === 200 && (await get()).body.items.length === 100, '剛好 100 個可以存');
    ok((await put(3, [CHART_B, CHART_A])).body.version === 4, '改回兩個（版本 4）');
    const me = await call('GET', '/v1/me', { origin: APP, token: appToken });
    ok(me.body.charts.version === 4 && me.body.charts.count === 2, '帳號資料裡看得到版本與數量');
  }

  section('同一個 Apple 帳號從網站登入：同一個帳號、同一份盤');
  let webToken;
  {
    const r = await signIn({ client: 'web' });
    webToken = r.body.token;
    ok(r.status === 200 && r.body.user.id === userId, `網站登入（Services ID），Apple 給的使用者代號相同 → 同一個帳號`);
    const ex = apple.log.exchanges.at(-1);
    ok(ex.client_id === env.APPLE_WEB_CLIENT_ID && ex.redirect_uri === env.APPLE_WEB_REDIRECT && ex.secretOk, '網站的授權碼：用戶端是 Services ID，帶當初的 redirect_uri');
    const g = await call('GET', '/v1/charts', { origin: WEB, token: webToken });
    ok(g.body.version === 4 && JSON.stringify(g.body.items) === JSON.stringify([CHART_B, CHART_A]), '網站讀到的就是 App 存的那份');
    ok((await userOf('apple-user-1')).apple_client_id === env.APPLE_WEB_CLIENT_ID, '撤銷授權用最後一次拿到的權杖（網站的）');
    const sessions = await sql('SELECT client FROM sessions WHERE user_id = ?1 ORDER BY client', userId);
    eq(sessions.map(s => s.client), ['app', 'web'], '兩台裝置各有一份登入憑證');
  }

  section('登出只登出那一台');
  {
    const r = await call('POST', '/v1/auth/logout', { origin: WEB, token: webToken });
    ok(r.status === 200 && r.body.ok, '網站登出');
    ok((await call('GET', '/v1/me', { origin: WEB, token: webToken })).status === 401, '網站的憑證失效了');
    ok((await call('GET', '/v1/me', { origin: APP, token: appToken })).status === 200, 'App 的還能用');
  }

  section('Apple 的伺服器通知（停用 Apple 登入、刪除 Apple 帳號）');
  {
    const two = await signIn({ sub: 'apple-user-2' });
    await call('PUT', '/v1/charts', { origin: APP, token: two.body.token, body: { baseVersion: 0, items: [CHART_A] } });
    const r1 = await notify('email-disabled', 'apple-user-2');
    ok(r1.status === 200 && (await call('GET', '/v1/me', { origin: APP, token: two.body.token })).status === 200, '電子郵件轉寄的通知：收下，帳號不動');
    const forged = await apple.forge({ iss: 'https://appleid.apple.com', aud: env.APPLE_APP_ID, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300, events: JSON.stringify({ type: 'consent-revoked', sub: 'apple-user-2' }) }, { alg: 'RS256', kid: apple.kid });
    const r2 = await call('POST', '/v1/apple/notifications', { origin: null, body: { payload: forged } });
    ok(r2.status === 400 && (await userOf('apple-user-2')), '簽章不對的通知：400，什麼都不刪');
    const r3 = await notify('consent-revoked', 'apple-user-2', { aud: 'com.example.other' });
    ok(r3.status === 400 && (await userOf('apple-user-2')), '給別的 App 的通知：400，什麼都不刪');
    const twoId = (await userOf('apple-user-2')).id;
    const r4 = await notify('consent-revoked', 'apple-user-2');
    eq([r4.status, await countFor(twoId)], [200, { users: 0, sessions: 0, charts: 0 }], '停用 Apple 登入（consent-revoked）：帳號、登入憑證、已存的盤全刪');
    ok((await call('GET', '/v1/me', { origin: APP, token: two.body.token })).status === 401, '那個人的登入憑證失效了');
    for (const [type, sub] of [['account-deleted', 'apple-user-3'], ['account-delete', 'apple-user-4']]) {
      const s = await signIn({ sub });
      const id = s.body.user.id;
      const r = await notify(type, sub);
      eq([r.status, await countFor(id)], [200, { users: 0, sessions: 0, charts: 0 }], `刪除了 Apple 帳號（${type}）：資料全刪`);
    }
    ok((await notify('consent-revoked', 'nobody')).status === 200, '不認得的使用者：照樣回 200（Apple 才不會一直重送）');
    ok((await call('POST', '/v1/apple/notifications', { origin: null, body: { payload: 'x' } })).status === 400, '內容不是權杖：400');
    ok((await call('GET', '/v1/me', { origin: APP, token: appToken })).status === 200, '別人的通知不影響第一個帳號');
  }

  section('刪除帳號');
  {
    const again = await signIn({ client: 'app' });
    const code = apple.log.exchanges.at(-1).code;
    ok(again.body.user.id === userId && (await userOf('apple-user-1')).apple_client_id === env.APPLE_APP_ID, '再從 App 登入一次：撤銷授權改用 App 的權杖');
    const r = await call('DELETE', '/v1/account', { origin: APP, token: again.body.token });
    ok(r.status === 200 && r.body.deleted === true && r.body.revoked === true, `刪除帳號：${JSON.stringify(r.body)}`);
    const rv = apple.log.revokes.at(-1);
    ok(rv && rv.client_id === env.APPLE_APP_ID && rv.token === `refresh-${code}` && rv.token_type_hint === 'refresh_token' && rv.secretOk, '向 Apple 撤銷授權：用存起來的 refresh token（解密後的原文）、對應的用戶端、簽得對的用戶端密鑰');
    ok(firstCode && rv.token !== `refresh-${firstCode}`, '撤銷的是最後一次拿到的權杖');
    eq(await countFor(userId), { users: 0, sessions: 0, charts: 0 }, '帳號、所有裝置的登入憑證、已存的盤全刪');
    ok((await call('GET', '/v1/me', { origin: APP, token: appToken })).status === 401, '另一份 App 的登入憑證也失效了');
    const fresh = await signIn();
    const g = await call('GET', '/v1/charts', { origin: APP, token: fresh.body.token });
    ok(fresh.status === 200 && fresh.body.user.id !== userId && g.body.version === 0 && g.body.items.length === 0, '同一個 Apple 帳號再登入：是全新的帳號，沒有舊的盤');
  }
}
