/* 共用狀態 S（全頁只有這一份），以及「今天」與「今年」。
   S 由 run.js 在每次排盤後更新；兩個分頁的點擊處理只改「選到哪一個」的那幾個欄位。 */
import { pad, yearGZ } from '../engine/index.js';

/* full：上次排盤的輸入（JSON 字串），沒變就不重畫
   key：排出來的是哪一張盤（出生瞬間、排盤用時、性別、子時立場），沒變就保留八字分頁選到的項目
   zkey：紫微排出來的是哪一張盤（key 加上生年干支、閏月算法；換四化版本不動宮位，不算換盤），沒變就保留紫微分頁選到的項目
   inp、rt、bz、zw：輸入、時間換算結果、八字、紫微（引擎回傳的原樣）；c：zw.chart，iztro 的命盤物件
   dy、ln：八字分頁選到的那一格運（-1 是起運前，0 到 9 是十步大運）與流年（年份）
   lm：八字分頁選到的流月（那個流年裡的第幾個節氣月，0 是寅月），沒有選是 null。換了運或流年就取消
   pal：紫微分頁選到的宮位
   dec、yr、mo、day：紫微分頁疊上的大限（宮位序號，或 'child' 表示童限）、流年（年份）、流月（那一年裡的第幾段）、流日（農曆日）；
     null 表示沒有疊。選了後面的，前面的一定也選了
   curDec：今年所在的大限（宮位序號，童限是 'child'），不在畫面列出的範圍內則為 null */
export const S = { full: '', key: '', zkey: '', inp: null, rt: null, bz: null, zw: null, c: null, curDec: null, dy: 0, ln: null, lm: null, pal: 0, dec: null, yr: null, mo: null, day: null };

/* 「現在」只在啟動時取一次。today：今天的公曆日期（YYYY-MM-DD），用來判斷大運交到哪一步、今天在哪個流月流日。
   「今年」在兩套系統的分界不同：bzYear 是八字的今年（流年以立春換年），zwYear 是紫微的今年（以正月初一換年）。 */
export let today, bzYear, zwYear;
export function initNow() {
  const now = new Date(), calYear = now.getFullYear(), nowLunar = Solar.fromDate(now).getLunar();
  today = `${calYear}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  bzYear = yearGZ(calYear) === nowLunar.getYearInGanZhiExact() ? calYear : calYear - 1;
  zwYear = nowLunar.getYear();
}
