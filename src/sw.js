/* 網頁 App 的 service worker：讓放上網站的那一版（dist/site/）可以加到主畫面、沒有網路也能排盤。
   建置時 scripts/build.js 把下面兩個標記換掉：VERSION 是預先快取的檔案內容算出來的雜湊，PRECACHE 是那些檔案的路徑（相對於這個檔）。
   任何一個檔的內容變了，這個檔就跟著變，瀏覽器才會裝新版本。發布平台用的片段（dist/paipan.html）不用這個檔。

   做法
   - 安裝：把頁面、兩個函式庫、manifest、圖示放進這一版自己的快取。一律向網路重新要（cache: 'reload'），不拿瀏覽器 HTTP 快取裡的舊檔。
   - 啟用：刪掉舊版本的快取，並接管已經開著的頁面（第一次裝好，不必重新整理就能離線）。
   - 新版本裝好之後不自動接手：頁面顯示「有新版本」，使用者按了才換（送 SKIP_WAITING），免得正在看的盤被打斷。
   - 取檔：開這個頁面（網站的根或 index.html，不論查詢字串）一律給快取裡的頁面，離線也開得起來；
     同一個網站的其他檔先看快取，快取沒有的（例如授權條款）照常向網路要。
     網頁字型（Google Fonts）第一次照常向網路要，要到了存起來，下次先用存的、背景再更新；連不上時頁面改用系統字型。
     其他網站的請求不經手。 */
const VERSION = '/*@VERSION@*/';
const PRECACHE = [/*@PRECACHE@*/];
const CACHE = `paipan-${VERSION}`, FONTS = 'paipan-fonts';
const PAGE = new URL('./', self.location).href; // 頁面在快取裡的鍵：網站的根（GitHub Pages 上是 /paipan/）
const PAGE_PATHS = [new URL(PAGE).pathname, new URL('index.html', PAGE).pathname]; // 這兩個網址開的都是同一個頁面

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(p => new Request(new URL(p, self.location).href, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('paipan-') && k !== CACHE && k !== FONTS) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// 先用存的、背景再更新；存的沒有就等網路。只存成功的回應
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName), hit = await cache.match(request);
  const fresh = fetch(request).then(r => { if (r.ok) cache.put(request, r.clone()); return r; });
  if (hit) { fresh.catch(() => {}); return hit; }
  return fresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' && PAGE_PATHS.includes(url.pathname)) {
      e.respondWith(caches.open(CACHE).then(c => c.match(PAGE)).then(hit => hit || fetch(req)));
    } else {
      e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true })).then(hit => hit || fetch(req)));
    }
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONTS));
  }
});
