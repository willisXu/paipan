-- 帳號與同步的資料表（第 15 版）。套用：npx wrangler d1 migrations apply paipan --remote
-- 時間一律是 Unix 毫秒。

-- 帳號：只記 Apple 給的使用者代號（apple_sub，每個開發者看到的都不同），不記姓名、電子郵件。
-- apple_refresh 是加密過的 Apple refresh token（刪除帳號時撤銷授權用），apple_client_id 是取得它的用戶端（App 或網站）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  apple_sub TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  apple_client_id TEXT,
  apple_refresh TEXT
);

-- 登入憑證：只存雜湊（SHA-256），資料庫外流也拿不到可以用的憑證
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);

-- 已存的盤：一個帳號一列，整份清單存成 JSON；version 每寫一次加一，防止兩台裝置互相蓋掉
CREATE TABLE charts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  items TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 用過的 nonce（登入時的一次性亂數），到期後由排程清掉
CREATE TABLE used_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
