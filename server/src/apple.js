/* 和 Apple 有關的部分：驗證 Apple 簽發的權杖（登入時的身分權杖、伺服器對伺服器的通知），
   以及用 Apple 給的私鑰（.p8）簽「用戶端密鑰」，向 Apple 換授權碼、撤銷授權。
   文件：Sign in with Apple REST API（/auth/keys、/auth/token、/auth/revoke）與 TN3194（刪除帳號時要撤銷權杖）。 */
import { b64url, fromB64, fromUtf8, utf8, HttpError } from './util.js';

export const APPLE = 'https://appleid.apple.com';

/* Apple 的公鑰（JWKS）。快取一小時；權杖用的金鑰代號（kid）在快取裡找不到時（Apple 換了金鑰）重抓一次，
   但一分鐘最多強制重抓一次，免得有人亂送代號，讓我們一直去敲 Apple */
let cache = { keys: [], at: 0, forcedAt: 0 };
export function resetAppleKeys() { cache = { keys: [], at: 0, forcedAt: 0 }; } // 測試用
async function appleKeys({ force = false } = {}) {
  const now = Date.now();
  if (cache.keys.length && now - cache.at < 3600e3 && !force) return cache.keys;
  if (force && now - cache.forcedAt < 60e3) return cache.keys;
  if (force) cache.forcedAt = now;
  const res = await fetch(`${APPLE}/auth/keys`);
  if (!res.ok) throw new HttpError(502, 'apple_unavailable');
  const body = await res.json();
  cache = { ...cache, keys: Array.isArray(body?.keys) ? body.keys : [], at: now };
  return cache.keys;
}

// 拆開 JWT（不驗證）。格式不對丟出 HttpError 401
export function decodeJwt(token) {
  const parts = typeof token === 'string' && token.length <= 8192 ? token.split('.') : [];
  if (parts.length !== 3) throw new HttpError(401, 'bad_token');
  try {
    return {
      header: JSON.parse(fromUtf8(fromB64(parts[0]))),
      payload: JSON.parse(fromUtf8(fromB64(parts[1]))),
      signed: utf8(`${parts[0]}.${parts[1]}`),
      signature: fromB64(parts[2]),
    };
  } catch (e) { throw new HttpError(401, 'bad_token'); }
}

/* 驗證 Apple 簽發的 JWT：簽章（RS256，用 Apple 公布的公鑰）、簽發者、對象（必須是我們的 App 或網站的識別碼）、
   還沒過期。通過回傳內容（claims），不通過丟出 HttpError 401。nonce 由呼叫的人自己比對 */
export async function verifyAppleJwt(token, { audiences }) {
  const { header, payload, signed, signature } = decodeJwt(token);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new HttpError(401, 'bad_token');
  let jwk = (await appleKeys()).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await appleKeys({ force: true })).find(k => k.kid === header.kid);
  if (!jwk || jwk.kty !== 'RSA') throw new HttpError(401, 'unknown_key');
  const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed))) throw new HttpError(401, 'bad_signature');
  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== APPLE) throw new HttpError(401, 'bad_issuer');
  if (!audiences.includes(payload.aud)) throw new HttpError(401, 'bad_audience');
  if (typeof payload.exp !== 'number' || payload.exp + 60 < now) throw new HttpError(401, 'expired');
  if (typeof payload.iat !== 'number' || payload.iat - 300 > now) throw new HttpError(401, 'bad_time');
  return payload;
}

// 換授權碼、撤銷都要用 Apple 給的私鑰。三樣都設好了才做；沒設時登入照常，只是刪除帳號時沒辦法替使用者撤銷授權
export const appleKeyReady = env => Boolean(env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY);

/* 用戶端密鑰：用 .p8 私鑰（ES256）簽的 JWT，五分鐘有效。sub 是這次要代表的用戶端（App 的 Bundle ID 或網站的 Services ID），
   必須和取得授權碼時的用戶端相同 */
async function clientSecret(env, clientId) {
  const der = fromB64(String(env.APPLE_PRIVATE_KEY).replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, ''));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(utf8(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID })));
  const body = b64url(utf8(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 300, aud: APPLE, sub: clientId })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}

async function post(path, form) {
  const res = await fetch(`${APPLE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() });
  let body = {};
  try { body = await res.json(); } catch (e) { /* 撤銷成功時是空的回應 */ }
  return { ok: res.ok, status: res.status, body };
}

/* 用登入時拿到的授權碼（五分鐘內、只能用一次）向 Apple 換權杖，留下 refresh token：刪除帳號時拿它撤銷授權。
   網站來的授權碼要帶當初的 redirect_uri；App 來的不帶 */
export async function exchangeCode(env, { clientId, code, redirectUri }) {
  const form = { client_id: clientId, client_secret: await clientSecret(env, clientId), code, grant_type: 'authorization_code' };
  if (redirectUri) form.redirect_uri = redirectUri;
  const r = await post('/auth/token', form);
  if (!r.ok || typeof r.body.refresh_token !== 'string') return { ok: false, error: r.body.error || `http_${r.status}` };
  return { ok: true, refreshToken: r.body.refresh_token, idToken: r.body.id_token };
}

export async function revokeToken(env, { clientId, token }) {
  const r = await post('/auth/revoke', { client_id: clientId, client_secret: await clientSecret(env, clientId), token, token_type_hint: 'refresh_token' });
  return r.ok;
}
