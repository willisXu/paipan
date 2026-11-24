/* 在 Node 裡模擬 Cloudflare D1（後端的資料庫），給 test/engine/server.test.js 用：底下是 Node 內建的 SQLite（node:sqlite），
   外面包成 D1 的樣子：prepare(sql).bind(...).first() / all() / run()、batch([...])（一個交易）。
   只做後端用到的部分。真正的 D1 另外在 server/test/workerd.test.js 用 Miniflare 測（Cloudflare 自己的執行環境）。 */
import fs from 'node:fs';

// node:sqlite 還標著實驗性，載入時會印一行警告；只濾掉這一則，其他警告照常
const emit = process.emitWarning;
process.emitWarning = (w, ...rest) => (String(w).includes('SQLite is an experimental feature') ? undefined : emit.call(process, w, ...rest));
const { DatabaseSync } = await import('node:sqlite');

// migration 檔：拿掉註解，照分號拆成一句一句（D1 的 exec 不收多行的語句，Miniflare 那邊也這樣拆）
export const statements = file => fs.readFileSync(file, 'utf8').replace(/--.*$/gm, '').split(';').map(s => s.trim()).filter(Boolean);

export function createD1(migrationFiles = []) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON'); // D1 預設開著外鍵檢查
  for (const f of migrationFiles) for (const s of statements(f)) db.exec(s);
  const plain = row => (row === undefined ? null : { ...row });
  const statement = (sql, args = []) => ({
    bind: (...values) => statement(sql, values),
    first: async column => { const row = plain(db.prepare(sql).get(...args)); return row && column ? row[column] : row; },
    all: async () => ({ success: true, results: db.prepare(sql).all(...args).map(plain), meta: {} }),
    run: async () => { const r = db.prepare(sql).run(...args); return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  });
  return {
    prepare: sql => statement(sql),
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
