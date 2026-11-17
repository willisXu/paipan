/* 紫微斗數：ziwei() 決定起盤用的日期與時辰，交給 iztro（全域變數）安星；另有十干四化表 SIHUA。 */
import { fromMs, toMs, pad, lunarMonthDay, userError } from './time.js';

/**
 * ziwei() 的結果。
 * @typedef {object} ZiweiChart
 * @property {object} chart iztro 排好的星盤物件（FunctionalAstrolabe），原樣交給頁面；
 *   宮位、星曜、四化、運限查詢 horoscope() 都在上面
 * @property {boolean} rolled 起盤日期是否進到次日：排盤用時在晚子時，而且立場是換日（ziRule 不是 'same'）時為 true
 * @property {string} lunarText 起盤日的農曆日期，例如「1984 年十月廿八」「2023 年閏二月初十」
 * @property {string} dateUsed 實際拿去起盤的公曆日期，YYYY-MM-DD：平常是排盤用時那一天，rolled 時是次日
 */

// 晚子時（23:00–24:00）不交給 iztro 的 timeIndex 12 處理：它只把農曆日加一，月底不會進到下個月。
// 換日立場直接改用次日早子時起盤；不換日立場用當日子時。
/**
 * @param {import('./time.js').BirthInput} inp 生辰設定；這裡讀 ziRule（晚子時換不換日）和 gender
 * @param {import('./time.js').ResolvedTime} rt resolveTime(inp) 的結果；這裡讀 local（起盤日期）、hourIndex（時辰）、lateZi
 * @returns {ZiweiChart}
 * @throws {Error} gender 不是「男」或「女」時丟出 userError
 */
function ziwei(inp, rt) {
  // 和 bazi() 用同一個標準：iztro 自己還認得英文等其他寫法，兩邊各自解讀會排成不同性別
  if (inp.gender !== '男' && inp.gender !== '女') throw userError('性別請填「男」或「女」。');
  const rolled = rt.lateZi && inp.ziRule !== 'same';
  const t = rolled ? fromMs(toMs(rt.local) + 3600e3) : rt.local;
  const chart = iztro.astro.withOptions({
    type: 'solar', dateStr: `${t.y}-${t.m}-${t.d}`, timeIndex: rt.hourIndex, gender: inp.gender, fixLeap: true, language: 'zh-TW',
    config: { yearDivide: 'normal', horoscopeDivide: 'normal', ageDivide: 'normal', dayDivide: 'forward', algorithm: 'default' },
  });
  // 農曆日期自己組字：iztro 給的字串在繁體設定下仍寫「闰」「腊月」
  const ld = chart.rawDates.lunarDate;
  const lunarText = `${ld.lunarYear} 年${lunarMonthDay(ld.lunarMonth, ld.lunarDay, ld.isLeap)}`;
  return { chart, rolled, dateUsed: `${t.y}-${pad(t.m)}-${pad(t.d)}`, lunarText };
}

// 十干四化（祿權科忌），與 iztro 預設表一致；庚、戊、壬三干各派有異
/** @type {Record<string, string[]>} */
const SIHUA = {
  甲: ['廉貞', '破軍', '武曲', '太陽'], 乙: ['天機', '天梁', '紫微', '太陰'], 丙: ['天同', '天機', '文昌', '廉貞'],
  丁: ['太陰', '天同', '天機', '巨門'], 戊: ['貪狼', '太陰', '右弼', '天機'], 己: ['武曲', '貪狼', '天梁', '文曲'],
  庚: ['太陽', '武曲', '太陰', '天同'], 辛: ['巨門', '太陽', '文曲', '文昌'], 壬: ['天梁', '紫微', '左輔', '武曲'],
  癸: ['破軍', '巨門', '太陰', '貪狼'],
};

export { ziwei, SIHUA };
