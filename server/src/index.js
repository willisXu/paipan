/* 八字紫微排盤的帳號與同步後端（第 15 版）：Cloudflare Workers ＋ D1。部署步驟見 server/README.md。
   只做一件事：讓用 Apple 登入的人，在 iPhone、iPad、網頁之間同步「已存的盤」。
     POST   /v1/auth/nonce          發一次性的 nonce（登入前先拿，十分鐘內有效、只能用一次）
     POST   /v1/auth/apple          用 Apple 的身分權杖登入，回傳登入憑證（token）
     POST   /v1/auth/logout         登出這台裝置
     GET    /v1/me                  目前登入的帳號
     GET    /v1/charts              已存的盤（整份清單和版本號）
     PUT    /v1/charts              整份換掉；要帶上次看到的版本號，期間被別台裝置改過就回 409 和最新的那份
     DELETE /v1/account             刪除帳號：撤銷 Apple 授權、刪掉帳號和所有已存的盤
     POST   /v1/apple/notifications Apple 的伺服器通知：使用者停用了 Apple 登入、刪除了 Apple 帳號 → 刪掉他的資料
     GET    /v1/health              檢查服務是否設定完成
   不收姓名、電子郵件；帳號只記 Apple 給的使用者代號（每個開發者看到的都不同）。
   登入憑證只存雜湊；Apple 的 refresh token 加密後才存。 */
import { HttpError, json, randomId, hmac, b64url, same, sha256hex, seal, unseal } from './util.js';
import { verifyAppleJwt, exchangeCode, revokeToken, appleKeyReady } from './apple.js';

const DAY = 864e5;
const SESSION_DAYS = 180; // 登入憑證的效期；有在用就往後延（一天最多延一次，免得每個請求都寫資料庫）
const NONCE_MS = 10 * 60e3;
// 一個帳號最多存幾個盤（網頁那邊的上限也是這個數）。注意：這個檔只能匯出 default——Workers 把主模組的每個具名匯出都當成進入點，
// 匯出數字或一般函式，部署後根本啟動不了（Miniflare 的測試抓到過）
const MAX_ITEMS = 100;
const MAX_ITEM_CHARS = 600, MAX_BODY = 96 * 1024;
// 一個盤只能有這些欄位、這些型別（和網頁 src/app/saved.js 的 check 一致）；字串最長 40 字
const FIELDS = {
  name: 'string', gender: 'string', calendar: 'string', h: 'number', mi: 'number', place: 'string', clock: 'string', useTST: 'boolean', ziRule: 'string',
  zwHua: 'string', zwYear: 'string', zwLeap: 'string', lon: 'number', tz: 'number', ly: 'number', lm: 'number', ld: 'number', leap: 'boolean', y: 'number', m: 'number', d: 'number',
};

const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const clientIds = env => [env.APPLE_APP_ID, env.APPLE_WEB_CLIENT_ID].filter(Boolean);

async function readBody(request) {
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) throw new HttpError(413, 'too_large');
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, 'too_large');
  let v;
  try { v = JSON.parse(raw); } catch (e) { throw new HttpError(400, 'bad_json'); }
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'bad_json');
  return v;
}

/* nonce：亂數、到期時間、HMAC 簽章三段。發的時候不寫資料庫（誰都可以要），登入用掉時才記下來，同一個不能用第二次。
   用戶端把它的 SHA-256 交給 Apple，Apple 原樣寫進身分權杖；我們比對兩者，確定這張權杖是為這一次登入簽的，不是別處偷來重送的 */
async function nonceSig(env, r, exp) { return b64url(await hmac(env.SESSION_SECRET, `nonce.${r}.${exp}`)).slice(0, 32); }
async function newNonce(request, env) {
  const r = randomId(16), exp = Date.now() + NONCE_MS;
  return json({ nonce: `${r}.${exp}.${await nonceSig(env, r, exp)}`, expiresAt: exp });
}
async function checkNonce(env, nonce) {
  const [r, exp, sig, extra] = typeof nonce === 'string' && nonce.length <= 100 ? nonce.split('.') : [];
  if (!r || !/^\d+$/.test(exp || '') || !sig || extra !== undefined) throw new HttpError(400, 'bad_nonce');
  if (!same(sig, await nonceSig(env, r, exp))) throw new HttpError(401, 'bad_nonce');
  if (Number(exp) < Date.now()) throw new HttpError(401, 'nonce_expired');
  return Number(exp);
}

async function signIn(request, env, ctx) {
  const { identityToken, authorizationCode, nonce } = await readBody(request);
  const nonceExp = await checkNonce(env, nonce);
  const claims = await verifyAppleJwt(identityToken, { audiences: clientIds(env) });
  if (typeof claims.nonce !== 'string' || !same(claims.nonce, await sha256hex(nonce))) throw new HttpError(401, 'nonce_mismatch');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new HttpError(401, 'bad_token');
  const db = env.DB, now = Date.now();
  const used = await db.prepare('INSERT INTO used_nonces (nonce, expires_at) VALUES (?1, ?2) ON CONFLICT DO NOTHING').bind(nonce, nonceExp).run();
  if (!used.meta.changes) throw new HttpError(401, 'nonce_used');

  await db.prepare('INSERT INTO users (id, apple_sub, created_at, last_login_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(apple_sub) DO UPDATE SET last_login_at = ?3').bind(randomId(16), claims.sub, now).run();
  const user = await db.prepare('SELECT id, created_at FROM users WHERE apple_sub = ?1').bind(claims.sub).first();

  /* 授權碼換 refresh token，加密存起來，刪除帳號時用它向 Apple 撤銷授權（TN3194）。
     換不到（Apple 那邊暫時有問題、私鑰沒設）不擋登入：身分權杖已經證明了是誰；只是刪帳號時改請使用者自己到設定裡停用 */
  const clientId = claims.aud, web = clientId === env.APPLE_WEB_CLIENT_ID;
  if (typeof authorizationCode === 'string' && authorizationCode && authorizationCode.length <= 1024 && appleKeyReady(env)) {
    try {
      const r = await exchangeCode(env, { clientId, code: authorizationCode, redirectUri: web ? env.APPLE_WEB_REDIRECT : undefined });
      const again = r.ok ? await verifyAppleJwt(r.idToken, { audiences: clientIds(env) }).catch(() => null) : null;
      if (again && again.sub === claims.sub) {
        await db.prepare('UPDATE users SET apple_client_id = ?2, apple_refresh = ?3 WHERE id = ?1').bind(user.id, clientId, await seal(env.TOKEN_KEY, r.refreshToken)).run();
      } else console.warn('apple code exchange failed:', r.ok ? 'id_token mismatch' : r.error);
    } catch (e) { console.warn('apple code exchange error:', e.message); }
  }

  const token = randomId(32), expiresAt = now + SESSION_DAYS * DAY;
  await db.prepare('INSERT INTO sessions (token_hash, user_id, client, created_at, last_used_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5)').bind(await sha256hex(token), user.id, web ? 'web' : 'app', now, expiresAt).run();
  ctx.waitUntil(purge(env).catch(e => console.warn('purge failed:', e.message)));
  return json({ token, user: { id: user.id, createdAt: user.created_at }, expiresAt });
}

// 帶著登入憑證的請求：Authorization: Bearer <token>。資料庫只存憑證的雜湊
async function session(request, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(request.headers.get('Authorization') || '');
  if (!m) throw new HttpError(401, 'no_session');
  const hash = await sha256hex(m[1]), now = Date.now();
  const s = await env.DB.prepare('SELECT s.user_id, s.expires_at, s.last_used_at, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1').bind(hash).first();
  if (!s || s.expires_at < now) {
    if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(hash).run();
    throw new HttpError(401, 'no_session');
  }
  if (now - s.last_used_at > DAY) await env.DB.prepare('UPDATE sessions SET last_used_at = ?2, expires_at = ?3 WHERE token_hash = ?1').bind(hash, now, now + SESSION_DAYS * DAY).run();
  return { userId: s.user_id, createdAt: s.created_at, tokenHash: hash };
}

async function me(request, env, who) {
  const row = await env.DB.prepare('SELECT version, items FROM charts WHERE user_id = ?1').bind(who.userId).first();
  return json({ user: { id: who.userId, createdAt: who.createdAt }, charts: { version: row?.version || 0, count: row ? JSON.parse(row.items).length : 0 } });
}

async function current(env, userId) {
  const row = await env.DB.prepare('SELECT version, items, updated_at FROM charts WHERE user_id = ?1').bind(userId).first();
  return row ? { version: row.version, items: JSON.parse(row.items), updatedAt: row.updated_at } : { version: 0, items: [], updatedAt: null };
}
const getCharts = async (request, env, who) => json(await current(env, who.userId));

// 存進來的盤只檢查形狀和大小（欄位、型別、長度），內容對不對由網頁讀回時的檢查負責；這裡要擋的是被拿來當隨便存東西的空間
function checkItems(items) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new HttpError(400, 'bad_items');
  for (const it of items) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) throw new HttpError(400, 'bad_items');
    const keys = Object.keys(it);
    const bad = !keys.length || keys.some(k => !Object.hasOwn(FIELDS, k) || typeof it[k] !== FIELDS[k] || (typeof it[k] === 'number' && !Number.isFinite(it[k])) || (typeof it[k] === 'string' && it[k].length > 40));
    if (bad || JSON.stringify(it).length > MAX_ITEM_CHARS) throw new HttpError(400, 'bad_items');
  }
  return items;
}

/* 整份換掉，用版本號防止兩台裝置互相蓋掉：帶上次看到的版本號，資料庫裡還是那一版才寫入（寫入時順便 +1）；
   不是的話回 409 和最新的那份，用戶端合併後再送一次 */
async function putCharts(request, env, who) {
  const { baseVersion, items } = await readBody(request);
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new HttpError(400, 'bad_version');
  const text = JSON.stringify(checkItems(items)), now = Date.now();
  const res = baseVersion === 0
    ? await env.DB.prepare('INSERT INTO charts (user_id, version, items, updated_at) VALUES (?1, 1, ?2, ?3) ON CONFLICT(user_id) DO NOTHING').bind(who.userId, text, now).run()
    : await env.DB.prepare('UPDATE charts SET version = version + 1, items = ?2, updated_at = ?3 WHERE user_id = ?1 AND version = ?4').bind(who.userId, text, now, baseVersion).run();
  if (!res.meta.changes) return json({ error: 'conflict', ...(await current(env, who.userId)) }, 409);
  return json({ version: baseVersion + 1, updatedAt: now });
}

async function logout(request, env, who) {
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(who.tokenHash).run();
  return json({ ok: true });
}

async function removeUser(env, userId) {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM charts WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(userId),
  ]);
}

// 刪除帳號：先向 Apple 撤銷授權（做得到的話），再刪光這個帳號的資料。撤銷失敗也照樣刪，回覆裡告訴用戶端，讓它請使用者自己到設定裡停用
async function deleteAccount(request, env, who) {
  const u = await env.DB.prepare('SELECT apple_client_id, apple_refresh FROM users WHERE id = ?1').bind(who.userId).first();
  let revoked = false;
  if (u?.apple_refresh && u.apple_client_id && appleKeyReady(env)) {
    try { revoked = await revokeToken(env, { clientId: u.apple_client_id, token: await unseal(env.TOKEN_KEY, u.apple_refresh) }); } catch (e) { console.warn('apple revoke error:', e.message); }
  }
  await removeUser(env, who.userId);
  return json({ deleted: true, revoked });
}

/* Apple 的伺服器對伺服器通知（在 Apple 開發者網站的 App ID 設定裡登記這個網址）：
   使用者在設定裡停用了「使用 Apple 登入」（consent-revoked）或刪除了 Apple 帳號（account-delete，實際送來的是 account-deleted），
   照 TN3194 當成刪除帳號處理。電子郵件轉寄的通知用不到（我們不收電子郵件） */
async function appleNotification(request, env) {
  const { payload } = await readBody(request);
  const claims = await verifyAppleJwt(payload, { audiences: clientIds(env) }).catch(() => { throw new HttpError(400, 'bad_payload'); });
  let event;
  try { event = typeof claims.events === 'string' ? JSON.parse(claims.events) : claims.events; } catch (e) { throw new HttpError(400, 'bad_payload'); }
  if (!event || typeof event.sub !== 'string' || !event.sub) throw new HttpError(400, 'bad_payload');
  if (['consent-revoked', 'account-delete', 'account-deleted'].includes(event.type)) {
    const u = await env.DB.prepare('SELECT id FROM users WHERE apple_sub = ?1').bind(event.sub).first();
    if (u) await removeUser(env, u.id);
  }
  return json({ ok: true });
}

// 清掉過期的 nonce 紀錄和登入憑證。登入時順手做，每天的排程也做一次
async function purge(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM used_nonces WHERE expires_at < ?1').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
  ]);
}

const health = (request, env) => json({ ok: true, configured: Boolean(env.SESSION_SECRET && env.TOKEN_KEY), revoke: appleKeyReady(env) });

// 路由：[處理函式, 要不要登入]
const ROUTES = {
  'GET /v1/health': [health, false],
  'POST /v1/auth/nonce': [newNonce, false],
  'POST /v1/auth/apple': [signIn, false],
  'POST /v1/auth/logout': [logout, true],
  'GET /v1/me': [me, true],
  'GET /v1/charts': [getCharts, true],
  'PUT /v1/charts': [putCharts, true],
  'DELETE /v1/account': [deleteAccount, true],
  'POST /v1/apple/notifications': [appleNotification, false],
};

/* 跨來源：只回應名單上的來源（網站、App 裡的網頁 capacitor://localhost）。
   瀏覽器送來的請求一定帶 Origin；不在名單上的直接拒絕。沒有 Origin 的（Apple 的通知、命令列工具）照常處理：
   登入憑證放在 Authorization 標頭，不用 cookie，所以不會被別的網站借用身分 */
async function handle(request, env, ctx) {
  const origin = request.headers.get('Origin');
  const allowed = origin !== null && list(env.ALLOWED_ORIGINS).includes(origin);
  if (origin !== null && !allowed) return json({ error: 'origin_not_allowed' }, 403);
  const cors = allowed ? { 'Access-Control-Allow-Origin': origin } : {};
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' } });
  }
  const route = ROUTES[`${request.method} ${new URL(request.url).pathname}`];
  let res;
  try {
    if (!route) throw new HttpError(404, 'not_found');
    const [fn, needsSession] = route;
    if (fn !== health && !(env.SESSION_SECRET && env.TOKEN_KEY)) throw new HttpError(503, 'not_configured');
    res = await fn(request, env, needsSession ? await session(request, env) : ctx);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error('unexpected error:', e && e.stack || e);
    res = e instanceof HttpError ? json({ error: e.code }, e.status) : json({ error: 'server_error' }, 500);
  }
  for (const [k, v] of Object.entries({ ...cors, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' })) res.headers.set(k, v);
  return res;
}

export default {
  fetch: handle,
  async scheduled(event, env, ctx) { ctx.waitUntil(purge(env)); },
};
