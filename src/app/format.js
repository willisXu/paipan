/* 把輸入與排盤結果轉成顯示用文字的小函式，命主資訊、紫微中宮、文字盤共用。
   都是純函式：不碰 DOM，也不讀共用狀態。 */
import { pad } from '../engine/index.js';
import { SAMPLE } from './places.js';

const signed1 = n => { const r = Math.round(n * 10) / 10; return (r < 0 ? '−' : '+') + Math.abs(r).toFixed(1); }; // 先取到一位小數再判正負，不出現「−0.0」
export const fmtOff = min => { const a = Math.abs(Math.round(min)); return `UTC${min < 0 ? '−' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + pad(a % 60) : ''}`; };
export const dur = days => { const mins = Math.round(days * 1440); return mins < 60 ? `${mins} 分鐘` : mins < 1440 ? `${Math.floor(mins / 60)} 小時` : `${Math.floor(days)} 天`; };
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
