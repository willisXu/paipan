/* 存起來的盤：已存清單、載入、刪除、儲存。存在這個瀏覽器的 localStorage（App 版另外在原生那邊留一份，見 platform-app.js）；
   用 Apple 登入後另外和雲端同步（第 15 版，見 account.js）。讀回時的檢查與同步的合併在 saved-data.js。 */
import { pad } from '../engine/index.js';
import { $, esc, showError, toast } from './dom.js';
import { S } from './state.js';
import { zwOptChanges } from './format.js';
import { writeForm } from './form.js';
import { run } from './run.js';
import { HERE, mirror } from './platform.js';
import { clean, keyOf, MAX_SAVED } from './saved-data.js';

export const SAVED_KEY = 'paipan-saved-v1'; // localStorage 的鍵（App 版的備份也用這個名字）
export const loadSaved = () => { try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(v) ? v.map(clean).filter(Boolean) : []; } catch (e) { return []; } };
export const storeSaved = list => { try { const v = JSON.stringify(list); localStorage.setItem(SAVED_KEY, v); mirror(SAVED_KEY, v); return true; } catch (e) { return false; } };
// 使用者自己存、刪之後發出的事件：登入時，帳號那邊（account.js）聽到就安排同步。同步本身改清單不發，免得來回觸發
const changed = () => document.dispatchEvent(new CustomEvent('paipan-saved'));
// 同一個生辰可以用不同的紫微流派設定各存一筆：改過的那幾項寫在後面，幾筆才分得出來（刪除鈕的名稱也用這一串）
const labelOf = s => {
  const changes = zwOptChanges({ hua: s.zwHua, year: s.zwYear, leap: s.zwLeap });
  return `${s.name || '未命名'} · ${s.calendar === 'lunar' ? `農曆 ${s.ly}/${s.leap ? '閏' : ''}${s.lm}/${s.ld}` : `${s.y}/${s.m}/${s.d}`} ${pad(s.h)}:${pad(s.mi)}${changes.length ? ` · ${changes.join('、')}` : ''}`;
};
// 存的盤多了（登入後幾台裝置合在一起，最多 100 個），清單先只列最前面的幾個，其餘收在「全部 N 個」後面
const FOLD_AT = 12;
let showAll = false;
export function renderSaved() {
  const list = loadSaved();
  const folded = !showAll && list.length > FOLD_AT + 1;
  const shown = folded ? list.slice(0, FOLD_AT) : list;
  const toggle = list.length > FOLD_AT + 1 ? `<button type="button" class="more" data-more aria-expanded="${!folded}">${folded ? `全部 ${list.length} 個` : '收起'}</button>` : '';
  $('#saved').innerHTML = list.length ? '<span class="muted" style="font-size:12px">已存</span>' + shown.map((s, i) => `<span class="chip"><button type="button" data-load="${i}">${esc(labelOf(s))}</button><button type="button" data-del="${i}" aria-label="刪除 ${esc(labelOf(s))}">×</button></span>`).join('') + toggle : '';
}

export function initSaved() {
  $('#saved').addEventListener('click', e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    if (e.target.closest('[data-more]')) { showAll = !showAll; renderSaved(); $('#saved [data-more]')?.focus(); return; }
    const list = loadSaved();
    if (l && list[Number(l.dataset.load)]) { writeForm(list[Number(l.dataset.load)]); run(); }
    if (d && list[Number(d.dataset.del)]) { list.splice(Number(d.dataset.del), 1); storeSaved(list); renderSaved(); changed(); }
  });
  $('#save').addEventListener('click', () => {
    if (!run()) return; // 先照目前的表單排一次：排不出來的生辰不存，錯誤訊息由 run() 顯示
    const inp = clean(S.inp);
    if (!inp) { showError('這份生辰資料不完整，沒有儲存。'); return; }
    const same = keyOf(inp);
    const list = loadSaved().filter(s => keyOf(s) !== same);
    list.unshift(inp);
    if (storeSaved(list.slice(0, MAX_SAVED))) { renderSaved(); toast(`已存在${HERE}`); changed(); } else toast(`${HERE}不允許儲存`);
  });
}
