/* 後端共用的小工具：base64url、雜湊、HMAC、亂數、加解密、JSON 回應、錯誤。
   只用 Web 標準的 API（crypto.subtle、TextEncoder、btoa…），Cloudflare Workers 和 Node 都有，測試才能在 Node 直接跑同一份程式。 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = s => encoder.encode(s);
export const fromUtf8 = bytes => decoder.decode(bytes);

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
// 標準 base64 與 base64url 都收（PEM 用標準的，JWT 用 url 版）；格式不對丟出例外
export function fromB64(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('not base64');
  const bin = atob(s.replace(/=+$/, '') + '='.repeat((4 - (s.replace(/=+$/, '').length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export const random = n => crypto.getRandomValues(new Uint8Array(n));
export const randomId = (n = 16) => b64url(random(n));
export const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async data => new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? utf8(data) : data));
export const sha256hex = async data => hex(await sha256(data));

export async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', utf8(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(data)));
}

// 比對兩個字串，花的時間和內容無關（比對簽章、雜湊時用，免得從回應時間猜出對了幾個字）
export function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* 存進資料庫的 Apple 權杖（撤銷授權時要用）加密保存：AES-GCM，金鑰由祕密 TOKEN_KEY 雜湊而來。
   密文的樣子是「iv.密文」兩段 base64url；資料庫外流時，沒有 TOKEN_KEY 就拿不到權杖 */
async function aesKey(secret) {
  return crypto.subtle.importKey('raw', await sha256(`paipan-token-key:${secret}`), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(secret, plain) {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), utf8(plain));
  return `${b64url(iv)}.${b64url(ct)}`;
}
export async function unseal(secret, sealed) {
  const [iv, ct] = String(sealed).split('.');
  return fromUtf8(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, await aesKey(secret), fromB64(ct)));
}

// 給用戶端看的錯誤：status 是 HTTP 狀態碼，code 是固定的英文代號（用戶端照代號決定怎麼處理，訊息不外露細節）
export class HttpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
