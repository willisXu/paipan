/* 帳號與同步（第 15 版）的建置設定：讀 account.config.json，給 scripts/build.js 用（瀏覽器測試也用它產生同樣的 <meta>）。
     apiBase      後端的網址（server/ 部署到 Cloudflare 之後的網址，只有來源、不帶路徑與結尾的斜線）。空字串＝這一版沒有帳號功能：
                  頁面上沒有登入那一塊（index.html 的 @SYNC 區塊拿掉、留 @LOCAL），頁尾的說明是「不收集任何資料」那一版
     webClientId  網站用的 Apple Services ID（網頁版的「使用 Apple 登入」用它，不是 App 的 Bundle ID）
     webRedirect  網站登入完 Apple 帶回來的網址，必須和 Apple 開發者網站登記的「Return URL」一字不差 */
import fs from 'node:fs';
import path from 'node:path';

/* testFile：瀏覽器測試換用的設定檔（環境變數 PAIPAN_ACCOUNT_CONFIG）。只有這種情況才允許本機的 http 網址
   （測試在本機開後端和網站）；正式的 account.config.json 一律要 https */
export function readAccountConfig(root, testFile) {
  const file = testFile || path.join(root, 'account.config.json');
  const name = testFile ? path.basename(testFile) : 'account.config.json';
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keys = Object.keys(cfg).sort().join(',');
  const site = testFile ? '(?:https:\\/\\/[a-z0-9.-]+|http:\\/\\/(?:127\\.0\\.0\\.1|localhost))(?::\\d+)?' : 'https:\\/\\/[a-z0-9.-]+(?::\\d+)?';
  if (keys !== 'apiBase,webClientId,webRedirect') throw new Error(`${name} 要剛好有 apiBase、webClientId、webRedirect 三項，現在是 ${keys}`);
  if (cfg.apiBase !== '' && !new RegExp(`^${site}$`, 'i').test(cfg.apiBase)) throw new Error(`${name} 的 apiBase 要是空字串，或 https:// 開頭、只有網域的網址（不帶路徑、不帶結尾的斜線）：${cfg.apiBase}`);
  if (!/^[a-z0-9.-]+$/i.test(cfg.webClientId)) throw new Error(`${name} 的 webClientId 不像 Services ID：${cfg.webClientId}`);
  if (!new RegExp(`^${site}\\/[\\w./-]*$`, 'i').test(cfg.webRedirect)) throw new Error(`${name} 的 webRedirect 要是 https:// 開頭的完整網址：${cfg.webRedirect}`);
  return cfg;
}

// 網站版、App 版 <head> 裡的設定（account.js 從這裡讀）。沒有後端網址就什麼都不放，頁面上的帳號功能整個不啟動
export function accountMeta({ apiBase, webClientId, webRedirect }) {
  if (!apiBase) return [];
  return [
    `<meta name="paipan-api" content="${apiBase}">`,
    `<meta name="paipan-apple-client" content="${webClientId}">`,
    `<meta name="paipan-apple-redirect" content="${webRedirect}">`,
  ];
}
