/* 存起來的盤的資料本身（不碰畫面）：讀回時的檢查、清單上限、同步時的三方合併。
   saved.js（已存清單）和 account.js（帳號與同步，第 15 版）共用；不碰 DOM，Node 的測試也直接 import。 */
import { resolveTime, ZW_OPTIONS } from '../engine/index.js';
import { PLACE } from './places.js';

// 已存清單最多幾個盤（後端 server/src/index.js 的 MAX_ITEMS 也是這個數，測試會核對）。
// 第 15 版由 20 改成 100：登入後幾台裝置的盤合在一起，上限太小會在合併時被擠掉
export const MAX_SAVED = 100;

const num = (v, lo, hi, int) => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) && n >= lo && n <= hi && (!int || Number.isInteger(n)) ? n : null; };
const opt = (k, v) => (ZW_OPTIONS[k].includes(v) ? v : ZW_OPTIONS[k][0]);
/* 讀回來的資料一律重新檢查（瀏覽器裡存的、雲端同步下來的都一樣）：只留認得的欄位，格式不對、或引擎排不出來（日期不存在、超出範圍）的整筆不要。
   回傳整理好的一筆，不要的回傳 null；任何例外也當作不要，一筆壞資料不可以連累其他筆。
   整理好的一筆，欄位順序固定，所以 JSON 字串可以直接拿來比對是不是同一個盤（keyOf） */
export function clean(s) {
  try {
    return check(s);
  } catch (e) { return null; }
}
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

export const keyOf = item => JSON.stringify(item);
export const sameList = (a, b) => a.length === b.length && a.every((x, i) => keyOf(x) === keyOf(b[i]));

/* 同步時的三方合併。base 是上次同步完雙方一致的那份（還沒同步過是 null），local 是這台裝置現在的，server 是雲端現在的。
   - 這台在 base 之後新存的（local 有、base 沒有）加進去，放在最前面（和「存」一樣，新的在前）
   - 這台在 base 之後刪掉的（base 有、local 沒有）從雲端那份拿掉
   - 其餘照雲端那份（別台裝置的新增、刪除都在裡面），順序也照雲端
   還沒同步過（base 是 null）就是兩邊合起來，什麼都不刪：第一次登入時，這台原本存的盤會併進帳號。
   重複的只留一筆；超過上限時留前面的（最新的）。同一個函式也用來把「同步途中使用者又改了清單」接回去：
   merge(同步開始時的清單, 現在的清單, 同步的結果) */
export function merge(base, local, server) {
  const baseKeys = new Set((base || []).map(keyOf)), localKeys = new Set(local.map(keyOf));
  const removed = new Set([...baseKeys].filter(k => !localKeys.has(k)));
  const out = [], seen = new Set();
  for (const item of [...local.filter(it => !baseKeys.has(keyOf(it))), ...server]) {
    const k = keyOf(item);
    if (seen.has(k) || removed.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out.slice(0, MAX_SAVED);
}
