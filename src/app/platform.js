/* 平台差異：網頁（網站版、發布平台的片段）用這一份。
   iPhone、iPad 的 App（第 14 版）建置 dist/app 時，scripts/build.js 把這個檔換成 platform-app.js；兩份要匯出同樣的名字。 */

// 存起來的盤放在哪裡（提示訊息用）
export const HERE = '這個瀏覽器';

/* 列印：交給瀏覽器的列印對話框。不回傳東西，印完由 afterprint 收尾（print.js）。
   App 版改用 iOS 的列印面板，回傳面板關掉時才結束的 Promise */
export function printPage() { window.print(); }

// 存盤以後另外保留一份：網頁沒有別的地方可放
export function mirror() {}

// 啟動時要做的事：網頁沒有。回傳 Promise（App 版要等原生那份讀回來，帳號的同步才開始）
export function initPlatform() { return Promise.resolve(); }

/* ── 帳號（第 15 版）：用 Apple 登入 ──
   網頁走 Apple 的網頁登入：整頁換到 appleid.apple.com，登入完 Apple 把結果接在網址 # 後面帶回網站（response_mode=fragment，
   不要求姓名與電子郵件，所以可以這樣帶回來）。不載入 Apple 的 JavaScript，網站不多一個外部腳本。
   nonce 交給 Apple 的是它的 SHA-256（Apple 原樣放進身分權杖，後端比對）；state 是這一頁自己產生的亂數，回來時比對，
   擋掉不是從這裡發起的登入結果。兩者都只放在這個分頁的 sessionStorage */
export const AUTH_CLIENT = 'web';
const PENDING = 'paipan-apple-pending';
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

export async function appleSignIn({ nonce, clientId, redirect }) {
  const hashed = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce)));
  const state = hex(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(PENDING, JSON.stringify({ state, nonce, at: Date.now() }));
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code id_token', response_mode: 'fragment', state, nonce: hashed });
  location.assign(`https://appleid.apple.com/auth/authorize?${q}`);
  return new Promise(() => {}); // 頁面換到 Apple 的登入頁，這裡不會再有結果
}

/* 從 Apple 登入回來：網址 # 後面是 state、code、id_token（或 error）。收走（網址列和瀏覽紀錄裡不留權杖），比對 state。
   不是登入回來的網址回傳 null；回傳 { identityToken, authorizationCode, nonce } 或 { error } */
export function appleReturn() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.has('state') || !(h.has('id_token') || h.has('error'))) return null;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 改不了網址也照常處理 */ }
  let pending = null;
  try { pending = JSON.parse(sessionStorage.getItem(PENDING)); sessionStorage.removeItem(PENDING); } catch (e) { /* 沒有就是不符 */ }
  if (!pending || pending.state !== h.get('state') || Date.now() - pending.at > 15 * 60e3) return { error: 'state_mismatch' };
  if (h.has('error')) return { error: h.get('error') };
  return { identityToken: h.get('id_token'), authorizationCode: h.get('code'), nonce: pending.nonce };
}

// 登入憑證放在這個瀏覽器的 localStorage（API 用 Authorization 標頭帶，不用 cookie）
const SESSION = 'paipan-session-v1';
export async function sessionGet() { try { return localStorage.getItem(SESSION); } catch (e) { return null; } }
export async function sessionSet(value) { try { localStorage.setItem(SESSION, value); } catch (e) { /* 不允許儲存：這一頁照樣登入著 */ } }
export async function sessionClear() { try { localStorage.removeItem(SESSION); } catch (e) { /* 同上 */ } }

// 網頁問不到 Apple 那邊的授權狀態（App 才問得到）；使用者在 Apple 那邊停用時，由後端收到通知、登入憑證失效
export async function appleCredentialState() { return 'unknown'; }
