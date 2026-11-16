/* DOM 小工具：選取元素、跳脫 HTML、顯示錯誤與提示訊息、捲動與焦點。
   不含排盤邏輯，也不讀共用狀態；每個模組都可以 import。 */
export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const showError = msg => { const e = $('#err'); e.hidden = false; e.textContent = msg; };

let toastTimer;
export function toast(msg) {
  let t = $('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
}

// 橫向捲動的列：把選到的項目捲到中間。只改該列的 scrollLeft，不捲動頁面
export function reveal(rowSel) {
  const row = $(rowSel), el = row && row.querySelector('[aria-pressed=true]');
  if (el && row.scrollWidth > row.clientWidth) row.scrollLeft = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
}
// 重繪後把焦點放回同一顆按鈕，鍵盤操作才不會掉到頁首
export const refocus = sel => { const el = document.querySelector(sel); if (el) el.focus({ preventScroll: true }); };
