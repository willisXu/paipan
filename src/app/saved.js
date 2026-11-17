/* 存起來的盤（只存在這個瀏覽器的 localStorage）：讀回時的檢查、已存清單、載入、刪除、儲存。 */
import { pad, resolveTime, ZW_OPTIONS } from '../engine/index.js';
import { $, esc, showError, toast } from './dom.js';
import { S } from './state.js';
import { PLACE } from './places.js';
import { zwOptChanges } from './format.js';
import { writeForm } from './form.js';
import { run } from './run.js';

const KEY = 'paipan-saved-v1';
const num = (v, lo, hi, int) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi && (!int || Number.isInteger(n)) ? n : null; };
/* 讀回來的資料一律重新檢查：只留認得的欄位，格式不對、或引擎排不出來（日期不存在、超出範圍）的整筆不要。
   回傳整理好的一筆，不要的回傳 null；任何例外也當作不要，一筆壞資料不可以連累其他筆。 */
function clean(s) {
  try {
    return check(s);
  } catch (e) { return null; }
}
const opt = (k, v) => (ZW_OPTIONS[k].includes(v) ? v : ZW_OPTIONS[k][0]);
function check(s) {
  if (!s || typeof s !== 'object') return null;
  const o = {
    name: String(s.name || '').slice(0, 20), gender: s.gender === '女' ? '女' : '男', calendar: s.calendar === 'lunar' ? 'lunar' : 'solar',
    h: num(s.h, 0, 23, true), mi: num(s.mi, 0, 59, true), place: PLACE.has(s.place) ? s.place : 'custom',
    clock: ['auto', 'std', 'dst'].includes(s.clock) ? s.clock : 'auto', useTST: s.useTST === true, ziRule: s.ziRule === 'same' ? 'same' : 'next',
    // 紫微的流派設定：不認得的值、以及加上這幾欄之前存的盤，都當成預設
    zwHua: opt('hua', s.zwHua), zwYear: opt('year', s.zwYear), zwLeap: opt('leap', s.zwLeap),
  };
  if (o.place === 'custom') Object.assign(o, { lon: num(s.lon, -180, 180), tz: num(s.tz, -12, 14) });
  if (o.calendar === 'lunar') Object.assign(o, { ly: num(s.ly, 1, 9999, true), lm: num(s.lm, 1, 12, true), ld: num(s.ld, 1, 30, true), leap: s.leap === true });
  else Object.assign(o, { y: num(s.y, 1, 9999, true), m: num(s.m, 1, 12, true), d: num(s.d, 1, 31, true) });
  if (Object.values(o).includes(null)) return null;
  resolveTime({ ...o, ...PLACE.get(o.place) }); // 日期存不存在、年份在不在範圍內，以引擎為準；不行就丟出例外
  return o;
}
const loadSaved = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.map(clean).filter(Boolean) : []; } catch (e) { return []; } };
const storeSaved = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
// 同一個生辰可以用不同的紫微流派設定各存一筆：改過的那幾項寫在後面，幾筆才分得出來（刪除鈕的名稱也用這一串）
const labelOf = s => {
  const changed = zwOptChanges({ hua: s.zwHua, year: s.zwYear, leap: s.zwLeap });
  return `${s.name || '未命名'} · ${s.calendar === 'lunar' ? `農曆 ${s.ly}/${s.leap ? '閏' : ''}${s.lm}/${s.ld}` : `${s.y}/${s.m}/${s.d}`} ${pad(s.h)}:${pad(s.mi)}${changed.length ? ` · ${changed.join('、')}` : ''}`;
};
export function renderSaved() {
  const list = loadSaved();
  $('#saved').innerHTML = list.length ? '<span class="muted" style="font-size:12px">已存</span>' + list.map((s, i) => `<span class="chip"><button type="button" data-load="${i}">${esc(labelOf(s))}</button><button type="button" data-del="${i}" aria-label="刪除 ${esc(labelOf(s))}">×</button></span>`).join('') : '';
}

export function initSaved() {
  $('#saved').addEventListener('click', e => {
    const l = e.target.closest('[data-load]'), d = e.target.closest('[data-del]');
    const list = loadSaved();
    if (l && list[Number(l.dataset.load)]) { writeForm(list[Number(l.dataset.load)]); run(); }
    if (d) { list.splice(Number(d.dataset.del), 1); storeSaved(list); renderSaved(); }
  });
  $('#save').addEventListener('click', () => {
    if (!run()) return; // 先照目前的表單排一次：排不出來的生辰不存，錯誤訊息由 run() 顯示
    const inp = clean(S.inp);
    if (!inp) { showError('這份生辰資料不完整，沒有儲存。'); return; }
    const same = JSON.stringify(inp);
    const list = loadSaved().filter(s => JSON.stringify(s) !== same);
    list.unshift(inp);
    if (storeSaved(list.slice(0, 20))) { renderSaved(); toast('已存在這個瀏覽器'); } else toast('這個瀏覽器不允許儲存');
  });
}
