/* 把輸入與排盤結果轉成顯示用文字的小函式，命主資訊、紫微中宮、文字盤共用。
   都是純函式：不碰 DOM，也不讀共用狀態。 */
import { fmt, pad, ZW_OPTIONS } from '../engine/index.js';
import { SAMPLE } from './places.js';

const signed1 = n => { const r = Math.round(n * 10) / 10; return (r < 0 ? '−' : '+') + Math.abs(r).toFixed(1); }; // 先取到一位小數再判正負，不出現「−0.0」
export const fmtOff = min => { const a = Math.abs(Math.round(min)); return `UTC${min < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`; };
// 節氣前後的間隔。不到一分鐘的不寫成「0 分鐘」：出生時間只到分，這種情況其實分不出先後
export const dur = days => {
  const secs = Math.round(days * 86400), mins = Math.floor(secs / 60); // 先取整到秒，避免浮點誤差讓整數分鐘少算一分
  return mins < 1 ? '不到 1 分鐘' : mins < 60 ? `${mins} 分鐘` : mins < 1440 ? `${Math.floor(mins / 60)} 小時` : `${Math.floor(mins / 1440)} 天`;
};
// 交節時刻寫到秒（引擎就是拿它和出生時間比先後）
export const jieTime = j => `${fmt(j.t)}:${pad(j.sec)}`;
export const placeLabel = inp => (inp.place !== 'custom' ? inp.place : inp.lon < 0 ? `西經 ${-inp.lon}°` : `東經 ${inp.lon}°`);
export const isSample = inp => ['gender', 'calendar', 'y', 'm', 'd', 'h', 'mi', 'place', 'useTST', 'ziRule'].every(k => inp[k] === SAMPLE[k]) && inp.clock !== 'dst';
export const nameOf = inp => inp.name || (isSample(inp) ? '教材範例盤' : '未命名');
const ziNote = (inp, rt) => (rt.hourIndex !== 0 ? '' : !rt.lateZi ? '早子時' : inp.ziRule === 'same' ? '晚子時，採夜子時不換日（日柱不換，時干用次日子時）' : '晚子時，採換日換柱');

export function usedNotes(inp, rt) {
  const notes = [];
  notes.push(inp.useTST ? `真太陽時：經度 ${signed1(rt.lonMin)} 分、均時差 ${signed1(rt.eotMin)} 分` : '未校正真太陽時');
  if (rt.shiftMin) notes.push(`當時鐘錶為 ${fmtOff(rt.offsetMin)}，已換回 ${fmtOff(rt.nominalMin)}`);
  const z = ziNote(inp, rt);
  if (z) notes.push(z);
  return notes;
}

// 紫微流派設定各個選項的短說明：中宮、文字盤、表單、存檔清單共用
const ZW_LABEL = {
  hua: { tongxing: '通行版四化', gengTongYin: '庚干陽武同陰', gengTongXiang: '庚干陽武同相', zhongzhou: '中州派四化' },
  year: { lunar: '生年以正月初一為界', lichun: '生年以立春為界' },
  leap: { mid: '閏月月中分界', current: '閏月算本月' },
};
const ZW_KEYS = ['hua', 'year', 'leap'];
// 三項設定各一句，順序固定：四化版本、年界、閏月算法
export const zwOptLabels = opts => ZW_KEYS.map(k => ZW_LABEL[k][opts[k]]);
// 只列和預設（坊間通行的排法）不同的那幾項；全是預設就是空陣列
export const zwOptChanges = opts => ZW_KEYS.filter(k => opts[k] !== ZW_OPTIONS[k][0]).map(k => ZW_LABEL[k][opts[k]]);
