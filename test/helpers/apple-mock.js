/* 假的 Apple（appleid.apple.com），後端測試用：自己產生一把 RSA 金鑰當 Apple 的簽章金鑰（公鑰從 /auth/keys 發出去），
   用它簽身分權杖；再產生一把 P-256 金鑰當我們向 Apple 申請的 .p8 私鑰，檢查後端送來的用戶端密鑰簽得對不對。
   /auth/token 只認 code() 發出的授權碼（一次性，用戶端、redirect_uri 都要對）；/auth/revoke 照單全收並記下來。
   handle(request) 是 appleid.apple.com 的請求就回應，其他回 null。 */
const b64url = data => Buffer.from(typeof data === 'string' ? data : new Uint8Array(data)).toString('base64url');
const APPLE = 'https://appleid.apple.com';

export async function appleMock({ teamId, keyId, appId, webId, webRedirect }) {
  const rsa = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const kid = 'TEST-KID-1';
  const pub = await crypto.subtle.exportKey('jwk', rsa.publicKey);
  const jwks = { keys: [{ kty: 'RSA', kid, use: 'sig', alg: 'RS256', n: pub.n, e: pub.e }] };
  const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', ec.privateKey)).toString('base64');
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  const log = { keyFetches: 0, exchanges: [], revokes: [] };
  const codes = new Map();
  const now = () => Math.floor(Date.now() / 1000);

  async function sign(payload, { key = rsa.privateKey, header = { alg: 'RS256', kid } } = {}) {
    const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
    return `${input}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, Buffer.from(input)))}`;
  }
  // Apple 簽發的身分權杖；over 覆寫任何欄位（測試簽發者、對象、過期…）
  const idToken = (over = {}) => sign({ iss: APPLE, aud: appId, exp: now() + 600, iat: now(), sub: 'apple-user-1', ...over });
  // 發一個授權碼，記住是給誰（sub）、哪個用戶端的
  const code = (sub, clientId) => { const c = `code-${log.exchanges.length}-${codes.size}-${Math.random().toString(36).slice(2, 8)}`; codes.set(c, { sub, clientId }); return c; };

  async function secretOk(secret, clientId) {
    try {
      const [h, p, s] = String(secret).split('.');
      const header = JSON.parse(Buffer.from(h, 'base64url')), claims = JSON.parse(Buffer.from(p, 'base64url'));
      const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, Buffer.from(s, 'base64url'), Buffer.from(`${h}.${p}`));
      return valid && header.alg === 'ES256' && header.kid === keyId && claims.iss === teamId && claims.sub === clientId && claims.aud === APPLE && claims.exp > now() && claims.exp - claims.iat <= 15777000;
    } catch (e) { return false; }
  }

  async function handle(request) {
    const url = new URL(request.url);
    if (url.origin !== APPLE) return null;
    if (request.method === 'GET' && url.pathname === '/auth/keys') { log.keyFetches++; return Response.json(jwks); }
    const form = Object.fromEntries(new URLSearchParams(await request.text()));
    if (request.method === 'POST' && url.pathname === '/auth/token') {
      const entry = { ...form, secretOk: await secretOk(form.client_secret, form.client_id) };
      log.exchanges.push(entry);
      const c = codes.get(form.code);
      const redirectRight = form.client_id === webId ? form.redirect_uri === webRedirect : form.redirect_uri === undefined;
      if (!entry.secretOk || !c || c.clientId !== form.client_id || form.grant_type !== 'authorization_code' || !redirectRight) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      codes.delete(form.code);
      return Response.json({ access_token: 'access', token_type: 'Bearer', expires_in: 3600, refresh_token: `refresh-${form.code}`, id_token: await idToken({ sub: c.sub, aud: form.client_id }) });
    }
    if (request.method === 'POST' && url.pathname === '/auth/revoke') {
      log.revokes.push({ ...form, secretOk: await secretOk(form.client_secret, form.client_id) });
      return new Response(null, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }

  // 另一把 RSA 金鑰：拿來簽「代號對、簽章不對」的權杖
  const forger = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const forge = (payload, header) => sign(payload, { key: forger.privateKey, header });
  return { pem, kid, sign, forge, idToken, code, handle, log };
}
