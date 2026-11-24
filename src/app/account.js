/* 帳號與同步（第 15 版）：用 Apple 登入後，已存的盤在 iPhone、iPad、網頁之間同步。後端在 server/（Cloudflare Workers ＋ D1）。
   不登入一切照舊（盤只存在這台裝置）；登入是為了同步，不是使用的條件。
   建置時設了後端網址（account.config.json）才有這個功能：網站版、App 版的 <head> 才有 <meta name="paipan-api">，頁面上才有 #acct 這一塊；
   發布平台的片段兩樣都沒有，這個模組什麼都不做。
   同步是整份清單對整份清單：上次同步完、雙方一致的那份（SYNC_KEY）、這台現在的、雲端現在的三方合併（saved-data.js 的 merge），
   寫回雲端時帶上次看到的版本號，被別台裝置搶先就重新讀、重新合併。
   登入憑證：網頁放 localStorage，App 放鑰匙圈；Apple 登入本身網頁走重新導向、App 走原生面板（platform.js、platform-app.js）。 */
import { $, esc, toast } from './dom.js';
import { HERE, AUTH_CLIENT, appleSignIn, appleReturn, sessionGet, sessionSet, sessionClear, appleCredentialState, mirror } from './platform.js';
import { loadSaved, storeSaved, renderSaved } from './saved.js';
import { clean, keyOf, merge, sameList } from './saved-data.js';

/* 上次同步完的那份：{ sid, version, items }。sid 是這次登入時產生的亂數，和登入憑證存在一起：
   不是這次登入的（例如登出前的、從備份補回來的舊資料）一律不用，當作還沒同步過——那樣合併只會把兩邊合起來，不會刪掉任何一個盤 */
export const SYNC_KEY = 'paipan-sync-v1';
const STATE = { idle: '還沒同步', syncing: '同步中…', synced: '已同步', offline: '離線中，連上網路後會同步', error: '同步沒有成功，稍後會再試' };
const RETRY_MS = 30e3, STALE_MS = 60e3;

let cfg = null, session = null, state = 'idle', note = '', busy = false;
let returned = null; // 網頁版：剛從 Apple 登入回來的結果，等 startAccount 處理
let inflight = null, again = false, timer = 0, lastSync = 0;

function readConfig() {
  const meta = name => document.querySelector(`meta[name="${name}"]`)?.content || '';
  const base = meta('paipan-api');
  // 後端是 https 的網址（只有來源，不帶路徑）；測試時是本機的 http
  if (!/^https:\/\/[\w.-]+(:\d+)?$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) return null;
  return { api: base, clientId: meta('paipan-apple-client'), redirect: meta('paipan-apple-redirect') };
}

/* ── 和後端說話 ── 錯誤分三種：offline（連不上）、expired（登入憑證失效，401）、http（其他）。409 不算錯誤，交給同步處理 */
class ApiError extends Error {
  constructor(kind, status, code) { super(code || kind); this.kind = kind; this.status = status; this.code = code; }
}
async function request(method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(cfg.api + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit' });
  } catch (e) { throw new ApiError('offline'); }
  let data = {};
  try { data = await res.json(); } catch (e) { /* 沒有內容 */ }
  if (res.status === 401 && token) throw new ApiError('expired', 401, data.error);
  if (!res.ok && res.status !== 409) throw new ApiError('http', res.status, data.error);
  return { ...data, status: res.status };
}
async function api(method, path, body) {
  try {
    return await request(method, path, session?.token, body);
  } catch (e) {
    if (e.kind === 'expired' && session) await expired();
    throw e;
  }
}

/* ── 登入狀態 ── */
const randomHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
function parseSession(raw) {
  try {
    const s = JSON.parse(raw);
    return s && typeof s.token === 'string' && typeof s.user === 'string' && typeof s.sid === 'string' ? s : null;
  } catch (e) { return null; }
}
function loadBase() {
  try {
    const b = JSON.parse(localStorage.getItem(SYNC_KEY));
    return b && session && b.sid === session.sid && Array.isArray(b.items) ? b.items.map(clean).filter(Boolean) : null;
  } catch (e) { return null; }
}
function saveBase(version, items) {
  const v = JSON.stringify({ sid: session.sid, version, items });
  try { localStorage.setItem(SYNC_KEY, v); } catch (e) { /* 存不了：下次當成還沒同步過，只會合起來，不會刪 */ }
  mirror(SYNC_KEY, v);
}
function clearBase() {
  try { localStorage.removeItem(SYNC_KEY); } catch (e) { /* 沒有就算了 */ }
  mirror(SYNC_KEY, null);
}

/* 這台裝置離開登入狀態。wipe：把從帳號同步來的盤（上次同步完的那份）從這台移除，還沒上傳的留著。
   登出、刪除帳號、使用者在 Apple 那邊停用時都會 wipe（TN3194：撤銷授權時，裝置上這個帳號的資料也要清掉）；
   登入過期不 wipe（只是要重新登入） */
async function forget({ wipe }) {
  const base = wipe ? loadBase() : null;
  if (base) {
    const synced = new Set(base.map(keyOf));
    storeSaved(loadSaved().filter(it => !synced.has(keyOf(it))));
    renderSaved();
  }
  clearTimeout(timer);
  again = false;
  clearBase();
  session = null;
  state = 'idle';
  await sessionClear();
  render();
}
async function expired() {
  await forget({ wipe: false });
  note = `登入已經失效，請重新登入。已存的盤還在${HERE}。`;
  render();
}

/* ── 畫面 ── */
// Apple 標誌用系統字型裡的那個字（U+F8FF，蘋果裝置的系統字型才有）；別的系統沒有這個字，就只放文字
const appleLogo = () => AUTH_CLIENT === 'app' || /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
function render() {
  const box = $('#acct');
  if (!box) return;
  if (!session) {
    box.innerHTML = `<p class="acct-note">${esc(note || `登入後，已存的盤會在 iPhone、iPad 與網頁之間同步。不登入也能照常使用，盤只存在${HERE}。`)}</p>`
      + `<button type="button" class="siwa" id="acct-in"${busy ? ' disabled aria-busy="true"' : ''}>${appleLogo() ? '<span class="siwa-logo" aria-hidden="true"></span>' : ''}使用 Apple 登入</button>`;
  } else {
    box.innerHTML = `<p class="acct-note"><b>已用 Apple 登入</b> · <span id="acct-state" role="status">${STATE[state]}</span>${note ? `<br>${esc(note)}` : ''}</p>`
      + '<span class="acct-acts"><button type="button" class="btn ghost" id="acct-sync">立即同步</button><button type="button" class="btn ghost" id="acct-out">登出</button><button type="button" class="btn ghost danger" id="acct-del">刪除帳號…</button></span>';
  }
}
function setState(s) {
  state = s;
  const el = $('#acct-state');
  if (el) el.textContent = STATE[s];
}

// 確認對話框（登出、刪除帳號）。預設的焦點在「取消」上；按 Esc 也是取消
function confirmDialog({ title, body, ok, danger = false }) {
  return new Promise(resolve => {
    const d = document.createElement('dialog');
    d.className = 'confirm';
    d.setAttribute('aria-labelledby', 'cf-title');
    d.setAttribute('aria-describedby', 'cf-body');
    d.innerHTML = `<h2 id="cf-title">${esc(title)}</h2><p id="cf-body">${esc(body)}</p>`
      + `<div class="actions"><button type="button" class="btn" value="cancel">取消</button><button type="button" class="btn ${danger ? 'danger' : 'primary'}" value="ok">${esc(ok)}</button></div>`;
    d.addEventListener('click', e => { const b = e.target.closest('button'); if (b) d.close(b.value); });
    d.addEventListener('close', () => { d.remove(); resolve(d.returnValue === 'ok'); });
    document.body.appendChild(d);
    d.showModal();
  });
}

/* ── 同步 ── */
export function scheduleSync(ms = 1500) {
  if (!session) return;
  clearTimeout(timer);
  timer = setTimeout(sync, ms);
}
// 同一時間只跑一個。跑的途中又有人要同步（使用者又存了一個），跑完這一輪接著再跑一輪；等的人等到全部跑完
async function sync() {
  if (!session) return;
  if (inflight) { again = true; return inflight; }
  clearTimeout(timer);
  inflight = (async () => {
    do { again = false; await syncOnce(); } while (again && session && state === 'synced');
  })();
  try { await inflight; } finally { inflight = null; }
}
async function syncOnce() {
  setState('syncing');
  try {
    for (let round = 0; round < 4; round++) {
      const local = loadSaved(), base = loadBase();
      const remote = await api('GET', '/v1/charts');
      const items = Array.isArray(remote.items) ? remote.items : [];
      const merged = merge(base, local, items.map(clean).filter(Boolean));
      let version = remote.version;
      if (!sameList(merged, items)) {
        const put = await api('PUT', '/v1/charts', { baseVersion: remote.version, items: merged });
        if (put.status === 409) continue; // 別台裝置剛好也寫了：重新讀、重新合併
        version = put.version;
      }
      if (!session) return; // 同步途中登出了
      // 同步途中使用者又存、刪了：把那些改動接在同步的結果上，下一輪再上傳
      const now = loadSaved();
      const next = sameList(now, local) ? merged : merge(local, now, merged);
      if (!sameList(now, next)) { storeSaved(next); renderSaved(); }
      saveBase(version, merged);
      lastSync = Date.now();
      if (!sameList(next, merged)) again = true;
      setState('synced');
      return;
    }
    setState('error');
    scheduleSync(RETRY_MS);
  } catch (e) {
    if (e.kind === 'expired' || !session) return;
    setState(e.kind === 'offline' ? 'offline' : 'error');
    if (e.kind !== 'offline') scheduleSync(RETRY_MS); // 離線的等 online 事件
  }
}

/* ── 登入、登出、刪除帳號 ── */
async function finishSignIn({ identityToken, authorizationCode, nonce, appleUser }) {
  const r = await request('POST', '/v1/auth/apple', null, { identityToken, authorizationCode, nonce });
  // appleUser：Apple 給的使用者代號（只有 App 拿得到），之後拿來問 Apple 這個人有沒有在設定裡停用
  session = { token: r.token, user: r.user.id, sid: randomHex(12), appleUser: appleUser || null };
  await sessionSet(JSON.stringify(session));
  clearBase(); // 新的一次登入：第一次同步把這台原本存的和帳號裡的合起來
  note = '';
  state = 'idle';
  render();
  toast('已登入');
  await sync();
}
async function signIn() {
  if (busy) return;
  busy = true;
  note = '';
  render();
  try {
    const { nonce } = await request('POST', '/v1/auth/nonce');
    // 網頁版：頁面換到 Apple 的登入頁，這個 Promise 不會有結果；回來時由 startAccount 接著做
    const r = await appleSignIn({ nonce, clientId: cfg.clientId, redirect: cfg.redirect });
    await finishSignIn({ identityToken: r.identityToken, authorizationCode: r.authorizationCode, nonce, appleUser: r.user });
  } catch (e) {
    if (e.code !== 'canceled') toast(e.kind === 'offline' ? '連不上網路，請稍後再登入' : '登入沒有成功，請再試一次');
  } finally {
    busy = false;
    render();
  }
}
async function signOut() {
  if (!await confirmDialog({ title: '登出', body: `登出後，帳號裡的盤會從${HERE}移除，再登入就會回來。`, ok: '登出' })) return;
  await sync(); // 先同步一次：這台剛存、還沒上傳的盤不會因為登出而不見
  if (!session) return; // 同步時發現登入已經失效
  const synced = state === 'synced', token = session.token;
  await forget({ wipe: synced });
  request('POST', '/v1/auth/logout', token).catch(() => { /* 連不上也照樣登出這台；憑證到期後自然失效 */ });
  note = synced ? '' : `剛才沒能同步，已存的盤先留在${HERE}。`;
  render();
  toast('已登出');
}
async function deleteAccount() {
  const yes = await confirmDialog({
    title: '刪除帳號', ok: '刪除帳號', danger: true,
    body: `刪除後，雲端上的帳號和帳號裡所有的盤都會清除，無法復原；${HERE}上從帳號同步來的盤也會一起移除。只想停止同步，用「登出」就好。`,
  });
  if (!yes) return;
  try {
    const r = await api('DELETE', '/v1/account');
    await forget({ wipe: true });
    note = r.revoked ? '帳號已刪除。' : '帳號已刪除。另外請到 Apple 帳號的設定（iPhone、iPad 的「設定」→ 你的名字 →「登入與安全性」→「使用 Apple 登入」），停止讓「排盤」使用 Apple 登入。';
    render();
    toast('帳號已刪除');
  } catch (e) {
    if (e.kind !== 'expired') toast(e.kind === 'offline' ? '連不上網路，帳號沒有刪除' : '刪除沒有成功，請稍後再試');
  }
}

// App：問 Apple 這個人有沒有在設定裡停用了這個 App 的 Apple 登入。停用了就登出、移除帳號的盤（TN3194）
async function revokedByApple() {
  if (!session?.appleUser) return false;
  const st = await appleCredentialState(session.appleUser);
  if (!session || (st !== 'revoked' && st !== 'notFound')) return false;
  const token = session.token;
  await forget({ wipe: true });
  request('POST', '/v1/auth/logout', token).catch(() => { /* 後端多半已經收到 Apple 的通知刪掉了 */ });
  note = '這個 App 的 Apple 登入已在 Apple 帳號的設定裡停用：已登出，帳號的盤也從這台裝置移除。';
  render();
  return true;
}

/* ── 啟動 ── 分兩段：initAccount 在畫第一張盤之前（網頁版從 Apple 登入回來時，結果接在網址 # 後面，要在分頁讀網址之前收走），
   startAccount 等平台準備好（App 版要等原生那份已存清單補回來）才讀登入狀態、開始同步 */
export function initAccount() {
  cfg = readConfig();
  const box = $('#acct');
  if (!cfg || !box) return;
  returned = appleReturn();
  box.addEventListener('click', e => {
    const id = e.target.closest('button')?.id;
    if (id === 'acct-in') signIn();
    else if (id === 'acct-sync') sync();
    else if (id === 'acct-out') signOut();
    else if (id === 'acct-del') deleteAccount();
  });
  document.addEventListener('paipan-saved', () => scheduleSync());
  window.addEventListener('online', () => sync());
  window.addEventListener('offline', () => { if (session && !inflight) setState('offline'); });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !session) return;
    if (await revokedByApple()) return;
    if (Date.now() - lastSync > STALE_MS) sync();
  });
}

export async function startAccount(ready) {
  if (!cfg || !$('#acct')) return;
  await ready;
  session = parseSession(await sessionGet());
  $('#acct').hidden = false;
  render();
  const back = returned;
  returned = null;
  if (back?.error) {
    if (back.error !== 'user_cancelled_authorize') toast('登入沒有完成，請再試一次');
  } else if (back) {
    busy = true;
    render();
    try {
      await finishSignIn(back); // 裡面已經同步過了
      return;
    } catch (e) {
      toast(e.kind === 'offline' ? '連不上網路，登入沒有完成' : '登入沒有成功，請再試一次');
    } finally { busy = false; render(); }
  }
  if (session && !(await revokedByApple())) sync();
}
