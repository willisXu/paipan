/* 共用狀態 S（全頁只有這一份）、「今年」，以及紫微運限的查詢快取。
   S 由 run.js 在每次排盤後更新；兩個分頁的點擊處理只改「選到哪一個」的那幾個欄位。 */
import { pad, yearGZ } from '../engine/index.js';

/* full、key：上次排盤的輸入（JSON 字串；key 不含姓名），用來判斷要不要重畫、要不要保留選到的項目
   inp、rt、bz、zw：輸入、時間換算結果、八字、紫微（引擎回傳的原樣）；c：zw.chart，iztro 的命盤物件
   dy、ln：八字分頁選到的大運（序號）與流年（年份）
   pal：紫微分頁選到的宮位；dec、yr：疊上的大限（宮位序號）與流年（年份），null 表示沒有疊
   curDec：今年所在大限的宮位序號，沒有則為 null；hCache：年份 → 該年運限（查不到為 null） */
export const S = { full: '', key: '', inp: null, rt: null, bz: null, zw: null, c: null, curDec: null, hCache: new Map(), dy: 0, ln: null, pal: 0, dec: null, yr: null };

// 「今年」在兩套系統的分界不同：八字流年以立春換年，紫微流年以正月初一換年
// today 是啟動當天的公曆日期（YYYY-MM-DD），用來判斷大運交到哪一步了
export let bzYear, zwYear, today;
export function initYears() {
  const now = new Date();
  today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const nowLunar = Solar.fromDate(new Date()).getLunar();
  const calYear = new Date().getFullYear();
  bzYear = yearGZ(calYear) === nowLunar.getYearInGanZhiExact() ? calYear : calYear - 1;
  zwYear = nowLunar.getYear();
}

export function horoscopeOf(year) {
  if (!S.hCache.has(year)) {
    let h = null;
    try { h = S.c.horoscope(`${year}-7-1`); } catch (e) { h = null; } // 年中必在該農曆年內
    S.hCache.set(year, h);
  }
  return S.hCache.get(year);
}
