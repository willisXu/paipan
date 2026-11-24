/* 平台差異：iPhone、iPad 的 App（第 14 版）。建置 dist/app 時，scripts/build.js 用這一份取代 platform.js。
   App 是 Capacitor 包起來的同一份網頁，原生的那一半在 ios/App/App/PaipanAppPlugin.swift（外掛名稱 PaipanApp），兩邊的方法名稱要對得上：
     printPage  用 iOS 的列印面板印目前的頁面（面板裡也能存成 PDF、分享）；面板關掉才回覆
     getAll、setItem  存起來的盤（和同步的紀錄）在 App 自己的設定檔（UserDefaults）另外留一份：
       WKWebView 的 localStorage 在裝置空間不足時可能被系統清掉，啟動時發現不見了，就從這一份補回來
     signInWithApple、appleCredentialState  使用 Apple 登入（第 15 版），見檔案最後
     getSecret、setSecret、clearSecret  登入憑證放在鑰匙圈（Keychain）
   不是在 App 裡開的（測試時用瀏覽器直接開 dist/app/），一律照網頁的做法。 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const NAME = 'PaipanApp';
const native = registerPlugin(NAME);
let warned = false;
function inApp() {
  if (!Capacitor.isNativePlatform()) return false;
  if (Capacitor.isPluginAvailable(NAME)) return true;
  // 在 App 裡卻找不到原生外掛：多半是 Main.storyboard 沒有指到 PaipanViewController（外掛在那裡註冊）
  if (!warned) { warned = true; console.warn(`找不到原生外掛 ${NAME}：列印、存檔備份改用網頁的做法`); }
  return false;
}

export const HERE = '這台裝置';

/* anchor：按下去的那顆按鈕。iPad 的列印面板是從按鈕旁邊彈出的小視窗，要把按鈕在畫面上的位置交給原生
   （頁面的座標就是 WKWebView 的座標：App 的網頁不縮放，安全區域由頁面自己的 padding 處理） */
export function printPage(anchor) {
  if (!inApp()) { window.print(); return undefined; }
  const r = anchor?.getBoundingClientRect();
  const at = r ? { x: r.left, y: r.top, width: r.width, height: r.height } : {};
  return native.printPage({ jobName: document.title || '八字紫微排盤', ...at }).catch(e => console.warn('列印面板開不起來', e));
}

// 存盤以後，原生那邊也存一份同樣的內容（失敗不影響頁面：localStorage 已經存好了）。value 是 null：頁面那份刪掉了，原生那份也刪
export function mirror(key, value) {
  if (inApp()) native.setItem({ key, value: value ?? null }).catch(() => {});
}

/* 啟動：keys 是要備份的 localStorage 鍵。
   原生有、頁面沒有（被系統清掉了）→ 補回頁面，再呼叫 restored() 重畫；兩邊不同 → 以頁面為準更新原生那份。
   回傳的 Promise 在補完之後才結束（失敗也算結束）：帳號的同步要等清單補回來才開始，不然會把被清掉的當成使用者刪的 */
export function initPlatform({ keys = [], restored = () => {} } = {}) {
  if (!inApp()) return Promise.resolve();
  return native.getAll().then(({ values } = {}) => {
    let back = false;
    for (const key of keys) {
      const saved = values?.[key], local = localStorage.getItem(key);
      if (local === null && typeof saved === 'string') { localStorage.setItem(key, saved); back = true; }
      else if (local !== null && local !== saved) mirror(key, local);
    }
    if (back) restored();
  }).catch(() => {});
}

/* ── 帳號（第 15 版）：使用 Apple 登入 ──
   App 用 iOS 原生的「使用 Apple 登入」面板（AuthenticationServices），不要求姓名與電子郵件。
   nonce 交給 Apple 的是它的 SHA-256，由原生計算（Apple 原樣放進身分權杖，後端比對）。
   登入憑證放在鑰匙圈（Keychain），不放 localStorage；Apple 那邊的授權狀態（使用者有沒有在設定裡停用）也問原生。
   原生拒絕時帶 code：canceled（使用者按了取消）、failed、busy、keychain */
export const AUTH_CLIENT = 'app';
export function appleSignIn({ nonce }) {
  if (!inApp()) return Promise.reject(Object.assign(new Error('這裡沒有原生的 Apple 登入'), { code: 'unavailable' }));
  return native.signInWithApple({ nonce });
}
// 網頁版才有「從 Apple 的登入頁回來」這件事
export function appleReturn() { return null; }
export async function sessionGet() {
  if (!inApp()) return null;
  try { return (await native.getSecret())?.value ?? null; } catch (e) { return null; }
}
export async function sessionSet(value) { if (inApp()) await native.setSecret({ value }).catch(() => {}); }
export async function sessionClear() { if (inApp()) await native.clearSecret().catch(() => {}); }
// authorized、revoked（使用者在設定裡停用了）、notFound、transferred；問不到回 unknown
export async function appleCredentialState(user) {
  if (!inApp() || !user) return 'unknown';
  try { return (await native.appleCredentialState({ user }))?.state || 'unknown'; } catch (e) { return 'unknown'; }
}
