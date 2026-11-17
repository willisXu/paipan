/* 共用狀態 S（全頁只有這一份）、「今天」與「今年」，以及紫微運限的查詢快取。
   S 由 run.js 在每次排盤後更新；兩個分頁的點擊處理只改「選到哪一個」的那幾個欄位。 */
import { pad, yearGZ } from '../engine/index.js';

/* full：上次排盤的輸入（JSON 字串），沒變就不重畫；key：排出來的是哪一張盤（出生瞬間、排盤用時、性別、子時立場），沒變就保留選到的項目
   inp、rt、bz、zw：輸入、時間換算結果、八字、紫微（引擎回傳的原樣）；c：zw.chart，iztro 的命盤物件
   dy、ln：八字分頁選到的大運（序號）與流年（年份）
   pal：紫微分頁選到的宮位；dec、yr：疊上的大限（宮位序號）與流年（年份），null 表示沒有疊
   curDec：今年所在大限的宮位序號，沒有則為 null；hCache：年份 → 該年運限（查不到為 null） */
export const S = { full: '', key: '', inp: null, rt: null, bz: null, zw: null, c: null, curDec: null, hCache: new Map(), dy: 0, ln: null, pal: 0, dec: null, yr: null };

/* 「現在」只在啟動時取一次。today：今天的公曆日期（YYYY-MM-DD），用來判斷大運交到哪一步了。
   「今年」在兩套系統的分界不同：bzYear 是八字的今年（流年以立春換年），zwYear 是紫微的今年（以正月初一換年）。 */
export let today, bzYear, zwYear;
export function initNow() {
  const now = new Date(), calYear = now.getFullYear(), nowLunar = Solar.fromDate(now).getLunar();
  today = `${calYear}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
