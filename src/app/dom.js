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

// 複製到剪貼簿，成功時顯示 done。有些檢視（例如發布平台的內嵌框）不允許寫剪貼簿：改成把文字放進備用文字框並選取，
// 讓使用者自己按複製。label 是文字框的讀屏名稱。文字盤、讀盤紀錄、星曜解讀三顆複製按鈕共用
export function copyText(text, done, label) {
  const box = $('#copyfallback');
  const fallback = () => {
    box.hidden = false;
    box.innerHTML = `<p class="note" style="margin:0 0 6px">這個檢視不允許直接寫入剪貼簿。文字已選取，請按 Ctrl/⌘ + C 複製。</p><textarea class="copybox" id="copytext" readonly aria-label="${esc(label)}"></textarea>`;
    const ta = $('#copytext'); ta.value = text; ta.focus(); ta.select();
  };
  try { navigator.clipboard.writeText(text).then(() => { box.hidden = true; toast(done); }, fallback); } catch (e) { fallback(); }
}

// 橫向捲動的列：把選到的項目捲到中間；沒有選到的（八字的流月、紫微的流時可以不選），捲到標了「今」的那一顆
// （八字的籤裡是 .now，紫微的籤本身帶 .cur）。只改該列的 scrollLeft，不捲動頁面
export function reveal(rowSel) {
  const row = $(rowSel), el = row && (row.querySelector('[aria-pressed=true]') || row.querySelector('.cur') || row.querySelector('.now')?.parentElement);
  if (el && row.scrollWidth > row.clientWidth) row.scrollLeft = el.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
}
// 重繪後把焦點放回同一顆按鈕，鍵盤操作才不會掉到頁首
export const refocus = sel => { const el = document.querySelector(sel); if (el) el.focus({ preventScroll: true }); };
