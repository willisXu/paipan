# 帳號與同步的後端（第 15 版）

用 Apple 登入後，「已存的盤」在 iPhone、iPad、網頁之間同步。跑在 Cloudflare Workers，資料放在 Cloudflare D1。
不登入的人完全用不到這裡；網頁和 App 在 `account.config.json` 的 `apiBase` 是空字串時，連登入的按鈕都不會出現。

- `src/index.js`：API（路徑與規則寫在檔案開頭）。注意這個檔只能 `export default`，Workers 會把主模組的每個具名匯出都當成進入點
- `src/apple.js`：驗證 Apple 的身分權杖與伺服器通知、用 .p8 私鑰簽用戶端密鑰、換授權碼、撤銷授權
- `src/util.js`：base64url、雜湊、HMAC、AES-GCM
- `migrations/`：資料表
- `test/workerd.test.js`：在 Cloudflare 的執行環境（Miniflare）跑完整情境，部署前跑

存什麼：Apple 給的使用者代號（不要姓名、電子郵件）、已存的盤（整份清單一列，帶版本號）、登入憑證的雜湊、加密過的 Apple refresh token（刪帳號時撤銷用）。

## 第一次部署

需要：Apple Developer Program 的付費會員資格、Cloudflare 帳號（免費方案就夠）、Mac 上的 Node.js 22 以上。
下面的祕密（私鑰、隨機字串）都由你自己在終端機裡輸入或用指令產生，不要貼到聊天裡，也不要存進版本庫。

### 1. Apple 開發者網站（Certificates, Identifiers & Profiles）

1. **App ID** `io.github.willisxu.paipan`：勾選 Sign in with Apple（Enable as a primary App ID）。
   Xcode 的自動簽署看到 `ios/App/App/App.entitlements` 也會替你勾。
2. **Services ID**（網頁版登入用）：Identifiers → ＋ → Services IDs，識別碼 `io.github.willisxu.paipan.web`。
   建好後勾 Sign in with Apple → Configure：Primary App ID 選上面那個；Domains 填 `willisxu.github.io`；
   Return URLs 填 `https://willisxu.github.io/paipan/`（結尾的斜線要有，和 `account.config.json` 的 `webRedirect` 一字不差）。
   不必上傳驗證檔。
3. **Key**：Keys → ＋，勾 Sign in with Apple → Configure 選上面的 Primary App ID → 註冊 → 下載 `AuthKey_XXXXXXXXXX.p8`
   （只能下載一次，存在安全的地方）。記下 **Key ID**。
4. **Team ID**：在 Membership details 頁面。

### 2. Cloudflare

```sh
cd server
npm install
npx wrangler login                      # 開瀏覽器登入 Cloudflare
npx wrangler d1 create paipan --location apac   # 資料庫放在亞太區（使用者在台灣）；印出 database_id
```

編輯 `wrangler.toml`：`database_id` 換成剛才印出來的那一串，`APPLE_TEAM_ID`、`APPLE_KEY_ID` 填上一步記下的值。然後：

```sh
npm test                                # 在 Cloudflare 的執行環境跑一次完整的測試
npm run migrate                         # 建資料表（d1 migrations apply paipan --remote）
npm run deploy                          # 部署，最後會印出網址 https://paipan-api.<你的子網域>.workers.dev
openssl rand -base64 32 | npx wrangler secret put SESSION_SECRET
openssl rand -base64 32 | npx wrangler secret put TOKEN_KEY
npx wrangler secret put APPLE_PRIVATE_KEY < ~/Downloads/AuthKey_XXXXXXXXXX.p8
curl https://paipan-api.<你的子網域>.workers.dev/v1/health
# 應該看到 {"ok":true,"configured":true,"revoke":true}
```

### 3. 回到 Apple 開發者網站：伺服器通知

App ID `io.github.willisxu.paipan` → Sign in with Apple → Configure → Server-to-Server Notification Endpoint 填
`https://paipan-api.<你的子網域>.workers.dev/v1/apple/notifications`。使用者在 Apple 帳號設定裡停用這個 App 的登入、或刪除 Apple 帳號時，
Apple 通知這裡，後端刪掉他的資料。

### 4. 網站與 App

1. `account.config.json` 的 `apiBase` 填部署的網址（不帶結尾的斜線）。
2. `npm run check`（全部測試）→ `npx cap sync ios` → Xcode 封存、上傳。網站推上 GitHub 後由 GitHub Actions 部署。
3. App Store Connect 的「App 隱私權」改成：收集「使用者 ID」與「其他使用者內容」，兩者都和身分連結、用途是 App 功能、不用於追蹤
   （和 `ios/App/App/PrivacyInfo.xcprivacy` 一致）。

## 之後更新後端

```sh
cd server && npm test && npm run deploy
```

資料表要改時，新增 `migrations/0002_*.sql`（不要改已經套用過的檔），再 `npm run migrate`。

## 祕密與金鑰

| 名稱 | 放哪裡 | 換掉會怎樣 |
|---|---|---|
| `SESSION_SECRET` | `wrangler secret put` | 簽 nonce 用。換掉只影響十分鐘內發出、還沒用掉的 nonce；已登入的人不受影響 |
| `TOKEN_KEY` | `wrangler secret put` | 加密 Apple refresh token。換掉後舊的解不開，那些人刪帳號時後端撤銷不了 Apple 授權（App 會請他自己到設定裡停用）。不要隨便換 |
| `APPLE_PRIVATE_KEY` | `wrangler secret put` | .p8 私鑰的內容。遺失或外流：到 Apple 開發者網站撤銷那把金鑰、建新的，更新 `APPLE_KEY_ID` 與這個祕密 |
| `APPLE_TEAM_ID`、`APPLE_KEY_ID` | `wrangler.toml` | 不是祕密 |

沒設 Apple 私鑰時登入照常，只是刪除帳號時沒辦法替使用者撤銷授權（健康檢查的 `revoke` 會是 `false`）。
本機用 `npx wrangler dev` 試跑時，祕密放在 `server/.dev.vars`（已在 `.gitignore` 裡）。

## 費用

個人使用的量在 Workers 與 D1 的免費額度內。額度以 Cloudflare 的價格頁為準。
