/* 網頁 App：註冊 service worker（src/sw.js），以及「有新版本」的提示。
   只有放上網站的那一版（dist/site/）會動：建置時只在那一版的 <head> 放 <link rel="manifest">，這裡看不到它就什麼都不做
   ——發布平台的片段沒有 sw.js，那個檢視框也不該裝 service worker。
   新版本在背景裝好以後，畫面底下出現一條「有新版本」，按了才換、換完重新整理；不按就照舊用目前這一版。
   主畫面的 App 第一次裝好（頁面第一次被 service worker 接管）時，提示一次「已可離線使用」。 */
import { $, toast } from './dom.js';

// 從主畫面開的（獨立視窗）。iOS 的 Safari 另外有 navigator.standalone；有些版本把主畫面 App 回報成 fullscreen
export const standalone = () => navigator.standalone === true || ['standalone', 'fullscreen'].some(m => typeof matchMedia === 'function' && matchMedia(`(display-mode: ${m})`).matches);

let updating = false; // 使用者按了「更新」：接下來換手時要重新整理
function offerUpdate(reg) {
  if (!reg.waiting || $('#update')) return;
  const bar = document.createElement('div');
  bar.id = 'update'; bar.className = 'update'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>有新版本</span><button class="btn primary" type="button">更新</button>';
  bar.querySelector('button').addEventListener('click', () => {
    updating = true;
    bar.querySelector('button').disabled = true;
    (reg.waiting || reg.installing)?.postMessage({ type: 'SKIP_WAITING' });
  });
  document.body.appendChild(bar);
}

export function initPwa() {
  if (!document.querySelector('link[rel=manifest]') || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker, hadController = !!sw.controller;
  sw.addEventListener('controllerchange', () => {
    if (updating) { location.reload(); return; }
    if (!hadController && standalone()) toast('已可離線使用：沒有網路也能排盤');
  });
  const register = () => sw.register('sw.js').then(reg => {
    offerUpdate(reg); // 上次就下載好、還在等的新版本
    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      // 第一次安裝（還沒有任何版本在管這個頁面）不必提示更新
      next?.addEventListener('statechange', () => { if (next.state === 'installed' && sw.controller) offerUpdate(reg); });
    });
  }).catch(() => { /* 不能註冊（例如瀏覽器設定、私密瀏覽）：照常當網頁用 */ });
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register, { once: true });
}
