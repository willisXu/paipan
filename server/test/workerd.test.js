/* 後端在 Cloudflare 自己的執行環境跑（Miniflare：workerd ＋ 真的 D1）：cd server && npm install && npm test。部署前跑一次。
   和 test/engine/server.test.js 跑同一套情境（test/helpers/server-scenario.js）。那一支把同一份程式放在 Node 裡跑，npm run check 每次都跑；
   這一支確認在 Workers 上也一樣：Web Crypto（RS256、ES256、AES-GCM、HMAC）、D1 的 SQL 與 batch、回應的標頭、每天的排程。
   後端對 Apple 的連線由 Miniflare 的 outboundService 接到假的 Apple（test/helpers/apple-mock.js），其他對外連線一律擋下。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { ok, eq, section, finish } from '../../test/helpers/harness.js';
import { appleMock } from '../../test/helpers/apple-mock.js';
import { scenario, client, ENV, APP } from '../../test/helpers/server-scenario.js';

const server = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const toml = fs.readFileSync(path.join(server, 'wrangler.toml'), 'utf8');
const compatibilityDate = toml.match(/^compatibility_date = "([\d-]+)"$/m)[1];
const apple = await appleMock({ teamId: ENV.APPLE_TEAM_ID, keyId: ENV.APPLE_KEY_ID, appId: ENV.APPLE_APP_ID, webId: ENV.APPLE_WEB_CLIENT_ID, webRedirect: ENV.APPLE_WEB_REDIRECT });
const env = { ...ENV, APPLE_PRIVATE_KEY: apple.pem };
const blocked = [];

const mf = new Miniflare({
  modules: true,
  scriptPath: path.join(server, 'src/index.js'),
  modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
  compatibilityDate,
  d1Databases: ['DB'],
  bindings: env,
  outboundService: async request => (await apple.handle(request)) || (blocked.push(request.url), new Response('blocked', { status: 599 })),
});

try {
  const db = await mf.getD1Database('DB');
  for (const f of fs.readdirSync(path.join(server, 'migrations')).filter(n => n.endsWith('.sql')).sort()) {
    const sqlText = fs.readFileSync(path.join(server, 'migrations', f), 'utf8').replace(/--.*$/gm, '');
    for (const stmt of sqlText.split(';').map(x => x.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
  const call = async (method, p, { body, token, origin, raw } = {}) => {
    const headers = {};
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = `Bearer ${token}`;
    const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    const res = await mf.dispatchFetch(`https://paipan-api.test${p}`, { method, headers, body: payload });
    const text = await res.text();
    return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : null };
  };
  const sql = async (q, ...args) => (await db.prepare(q).bind(...args).all()).results;

  await scenario({ call, sql, apple, env, t: { ok, eq, section } });

  section('（workerd）每天的排程');
  {
    const { signIn } = client({ call, apple, env });
    const s = await signIn({ sub: 'apple-user-cron' });
    await sql('INSERT INTO used_nonces (nonce, expires_at) VALUES (?1, ?2)', 'stale', Date.now() - 1);
    await sql('UPDATE sessions SET expires_at = ?1 WHERE user_id = ?2', Date.now() - 1, s.body.user.id);
    const worker = await mf.getWorker();
    await worker.scheduled({ cron: (toml.match(/^crons = \["([^"]+)"\]$/m) || [])[1] });
    ok((await sql('SELECT COUNT(*) AS n FROM used_nonces WHERE nonce = ?1', 'stale'))[0].n === 0, '過期的 nonce 紀錄清掉了');
    ok((await sql('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?1', s.body.user.id))[0].n === 0 && (await call('GET', '/v1/me', { origin: APP, token: s.body.token })).status === 401, '過期的登入憑證清掉了');
  }
  ok(blocked.length === 0, `後端沒有連到 Apple 以外的地方${blocked.length ? '：' + blocked.join('、') : ''}`);
} finally {
  await mf.dispose();
}
finish(`（workerd，相容日期 ${compatibilityDate}）`);
