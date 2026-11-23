/* 八字、紫微斗數兩個分頁的切換，以及和網址 hash 的同步。 */
import { $ } from './dom.js';

export function setTab(t) {
  const zw = t === 'ziwei';
  $('#t-bazi').setAttribute('aria-selected', String(!zw));
  $('#t-ziwei').setAttribute('aria-selected', String(zw));
  $('#p-bazi').hidden = zw;
  $('#p-ziwei').hidden = !zw;
  $('#goto-label').textContent = zw ? '看星曜解讀' : '看讀盤'; // 分頁列那顆「看讀盤 ↓」：捲到目前分頁最下面那張卡
}
function go(t) {
  setTab(t);
  try { if (location.hash !== '#' + t) location.hash = t; } catch (e) { /* 有些檢視不允許改網址，分頁照常切換 */ }
}

export function initTabs() {
  $('#t-bazi').addEventListener('click', () => go('bazi'));
  $('#t-ziwei').addEventListener('click', () => go('ziwei'));
  document.querySelector('.tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const t = $('#t-bazi').getAttribute('aria-selected') === 'true' ? 'ziwei' : 'bazi';
    go(t); $('#t-' + t).focus();
  });
  window.addEventListener('hashchange', () => setTab(location.hash.slice(1)));
}
