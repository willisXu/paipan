/* 存起來的盤（只存在這個瀏覽器的 localStorage）：讀回時的檢查、已存清單、載入、刪除、儲存。 */
import { pad, resolveTime } from '../engine/index.js';
import { $, esc, showError, toast } from './dom.js';
import { PLACE } from './places.js';
import { readForm, writeForm } from './form.js';
import { run } from './run.js';

const KEY = 'paipan-saved-v1';
const num = (v, lo, hi, int) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi && (!int || Number.isInteger(n)) ? n : null; };
// 讀回來的資料一律重新檢查，格式不對的整筆丟掉
function clean(s) {
  if (!s || typeof s !== 'object') return null;
  const o = {
    name: String(s.name || '').slice(0, 20), gender: s.gender === '女' ? '女' : '男', calendar: s.calendar === 'lunar' ? 'lunar' : 'solar',
    h: num(s.h, 0, 23, true), mi: num(s.mi, 0, 59, true), place: PLACE.has(s.place) ? s.place : 'custom',
    clock: ['auto', 'std', 'dst'].includes(s.clock) ? s.clock : 'auto', useTST: s.useTST === true, ziRule: s.ziRule === 'same' ? 'same' : 'next',
  };
  if (o.place === 'custom') Object.assign(o, { lon: num(s.lon, -180, 180), tz: num(s.tz, -12, 14) });
  if (o.calendar === 'lunar') Object.assign(o, { ly: num(s.ly, 1900, 2100, true), lm: num(s.lm, 1, 12, true), ld: num(s.ld, 1, 30, true), leap: s.leap === true });
  else Object.assign(o, { y: num(s.y, 1900, 2100, true), m: num(s.m, 1, 12, true), d: num(s.d, 1, 31, true) });
  return Object.values(o).includes(null) ? null : o;
}
// 一筆壞資料只丟那一筆，不連累其他筆（否則清單看起來是空的，再按儲存就把其他筆蓋掉）
const loadSaved = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.map(s => { try { return clean(s); } catch (e) { return null; } }).filter(Boolean) : []; } catch (e) { return []; } };
const storeSaved = list => { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; } };
const labelOf = s => `${s.name || '未命名'} · ${s.calendar === 'lunar' ? `農曆 ${s.ly}/${s.leap ? '閏' : ''}${s.lm}/${s.ld}` : `${s.y}/${s.m}/${s.d}`} ${pad(s.h)}:${pad(s.mi)}`;
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
    let inp;
    try { const full = readForm(); resolveTime(full); inp = clean(full); } catch (e) { showError(e.message); return; }
    if (!inp) { showError('這份生辰資料不完整，沒有儲存。'); return; }
    const same = JSON.stringify(inp);
    const list = loadSaved().filter(s => JSON.stringify(s) !== same);
    list.unshift(inp);
    if (storeSaved(list.slice(0, 20))) { renderSaved(); toast('已存在這個瀏覽器'); } else toast('這個瀏覽器不允許儲存');
  });
}
