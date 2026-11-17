/* 紫微斗數起盤：ziwei() 決定起盤用的日期與時辰，連同流派設定（四化版本、年界、閏月算法）交給 iztro（全域變數）安星。
   另有十干四化表 SIHUA，和流派設定有哪些選項 ZW_OPTIONS。運限（大限到流日）在 ziwei-yun.js。 */
import { fromMs, toMs, pad, lunarMonthDay, userError } from './time.js';
import { jz, yearGZ } from './ganzhi.js';

/**
 * ziwei() 的結果。
 * @typedef {object} ZiweiChart
 * @property {object} chart iztro 排好的星盤物件（FunctionalAstrolabe），原樣交給頁面；宮位、星曜、生年四化都在上面。
 *   上面的四柱（chineseDate、rawDates.chineseDate）是 iztro 自己算的副產品，年界設成立春時月柱會改照節氣算；四柱一律用 bazi() 的，生年干支用下面的 yearGZ
 * @property {boolean} rolled 起盤日期是否進到次日：排盤用時在晚子時，而且立場是換日（ziRule 不是 'same'）時為 true
 * @property {string} lunarText 起盤日的農曆日期，例如「1984 年十月廿八」「2023 年閏二月初十」
 * @property {string} dateUsed 實際拿去起盤的公曆日期，YYYY-MM-DD：平常是排盤用時那一天，rolled 時是次日
 * @property {{hua: string, year: string, leap: string}} opts 這張盤採用的流派設定（輸入沒給的已補上預設值），值都在 ZW_OPTIONS 裡
 * @property {Record<string, string[]>} sihua 這張盤用的十干四化表：天干 → 祿、權、科、忌四顆星。生年四化、宮干飛化、運限四化都查它
 * @property {string} yearGZ 生年干支。年界是正月初一時為農曆年的干支；年界是立春時，從起盤日那一天是否已到立春日來定
 * @property {number} birthYear 生年的年數，虛歲從這一年算一歲。平常是農曆年；年界是立春、又生在立春和正月初一之間時，會比農曆年多一年或少一年
 * @property {number} month 安命宮用的生月，1–12。閏月怎麼算依 opts.leap
 * @property {number} hourIndex 生時的地支序：0 子 … 11 亥（就是 ResolvedTime 的 hourIndex）
 */

/**
 * 紫微斗數的流派設定有哪些選項；每一項的第一個是預設值，也就是坊間通行的排法。
 *   hua 四化版本：'tongxing' 通行版（戊貪陰右機、庚陽武陰同、壬梁紫左武）；'gengTongYin' 庚干改陽武同陰；
 *     'gengTongXiang' 庚干改陽武同相；'zhongzhou' 中州派（戊貪陰陽機、庚陽武府同、壬梁紫府武）
 *   year 年界：'lunar' 正月初一換年；'lichun' 立春當天換年（以日為單位，不看交節的時刻）
 *   leap 閏月算法：'mid' 閏月十五日（含）以前算本月、十六日起算下月；'current' 整個閏月算本月
 * @type {{hua: string[], year: string[], leap: string[]}}
 */
const ZW_OPTIONS = {
  hua: ['tongxing', 'gengTongYin', 'gengTongXiang', 'zhongzhou'],
  year: ['lunar', 'lichun'],
  leap: ['mid', 'current'],
};

// 十干四化（祿權科忌）的通行版，與 iztro 預設表一致；戊、庚、壬三干各派有異，見 SIHUA_ALT
/** @type {Record<string, string[]>} */
const SIHUA = {
  甲: ['廉貞', '破軍', '武曲', '太陽'], 乙: ['天機', '天梁', '紫微', '太陰'], 丙: ['天同', '天機', '文昌', '廉貞'],
  丁: ['太陰', '天同', '天機', '巨門'], 戊: ['貪狼', '太陰', '右弼', '天機'], 己: ['武曲', '貪狼', '天梁', '文曲'],
  庚: ['太陽', '武曲', '太陰', '天同'], 辛: ['巨門', '太陽', '文曲', '文昌'], 壬: ['天梁', '紫微', '左輔', '武曲'],
  癸: ['破軍', '巨門', '太陰', '貪狼'],
};
// 其他版本和通行版不同的那幾干
/** @type {Record<string, Record<string, string[]>>} */
const SIHUA_ALT = {
  tongxing: {},
  gengTongYin: { 庚: ['太陽', '武曲', '天同', '太陰'] },
  gengTongXiang: { 庚: ['太陽', '武曲', '天同', '天相'] },
  zhongzhou: { 戊: ['貪狼', '太陰', '太陽', '天機'], 庚: ['太陽', '武曲', '天府', '天同'], 壬: ['天梁', '紫微', '天府', '武曲'] },
};

// 晚子時（23:00–24:00）不交給 iztro 的 timeIndex 12 處理：它只把農曆日加一，月底不會進到下個月。
// 換日立場直接改用次日早子時起盤；不換日立場用當日子時。
/**
 * @param {import('./time.js').BirthInput} inp 生辰設定；這裡讀 ziRule（晚子時換不換日）、gender，以及三個流派設定 zwHua、zwYear、zwLeap
 * @param {import('./time.js').ResolvedTime} rt resolveTime(inp) 的結果；這裡讀 local（起盤日期）、hourIndex（時辰）、lateZi
 * @returns {ZiweiChart}
 * @throws {Error} gender 不是「男」或「女」、或流派設定不是 ZW_OPTIONS 裡的值時，丟出 userError
 */
function ziwei(inp, rt) {
  // 和 bazi() 用同一個標準：iztro 自己還認得英文等其他寫法，兩邊各自解讀會排成不同性別
  if (inp.gender !== '男' && inp.gender !== '女') throw userError('性別請填「男」或「女」。');
  const opts = { hua: inp.zwHua ?? ZW_OPTIONS.hua[0], year: inp.zwYear ?? ZW_OPTIONS.year[0], leap: inp.zwLeap ?? ZW_OPTIONS.leap[0] };
  for (const [k, what] of [['hua', '四化版本'], ['year', '年界'], ['leap', '閏月算法']]) {
    if (!ZW_OPTIONS[k].includes(opts[k])) throw userError(`紫微斗數的${what}設定不對，請重新選一次。`);
  }
  const rolled = rt.lateZi && inp.ziRule !== 'same';
  const t = rolled ? fromMs(toMs(rt.local) + 3600e3) : rt.local;
  /* 年界要同時交給 iztro 的兩個設定：yearDivide 管主星、輔星、宮干、五行局、長生與博士十二神、大限、小限、紅鸞天喜；
     其餘照生年安的雜曜（咸池、華蓋、孤辰寡宿、天哭天虛、龍池鳳閣、天官天福、天德月德、旬空截空…）和歲前、將前十二神，
     iztro 看的是 horoscopeDivide。只設前一個，生在立春和正月初一之間的人會排出半張照立春年、半張照農曆年的盤。
     運限不向 iztro 查（見 ziwei-yun.js），所以 horoscopeDivide 在這裡只影響本命盤；ageDivide 只是寫明不要跟著函式庫的全域設定走 */
  const divide = opts.year === 'lichun' ? 'exact' : 'normal';
  const chart = iztro.astro.withOptions({
    type: 'solar', dateStr: `${t.y}-${t.m}-${t.d}`, timeIndex: rt.hourIndex, gender: inp.gender, fixLeap: opts.leap === 'mid', language: 'zh-TW',
    config: { mutagens: SIHUA_ALT[opts.hua], yearDivide: divide, horoscopeDivide: divide, ageDivide: 'normal', dayDivide: 'forward', algorithm: 'default' },
  });
  // 農曆日期自己組字：iztro 給的字串在繁體設定下仍寫「闰」「腊月」
  const ld = chart.rawDates.lunarDate;
  const lunarText = `${ld.lunarYear} 年${lunarMonthDay(ld.lunarMonth, ld.lunarDay, ld.isLeap)}`;
  /* 生年的年數。iztro 只給生年干支：正月初一為界時它就是農曆年；立春為界時，生在立春和正月初一之間的人會是前一年或後一年，
     從干支和農曆年的干支差一位來認 */
  const year = chart.rawDates.chineseDate.yearly.join('');
  const lunarGZ = yearGZ(ld.lunarYear), off = (jz(year[0], year[1]) - jz(lunarGZ[0], lunarGZ[1]) + 60) % 60;
  if (off !== 0 && off !== 1 && off !== 59) throw new Error(`生年干支 ${year} 和農曆 ${ld.lunarYear} 年對不上`);
  // 安命宮用的生月：月中分界時，閏月十六日起算下個月
  const month = (ld.lunarMonth - 1 + (ld.isLeap && opts.leap === 'mid' && ld.lunarDay > 15 ? 1 : 0)) % 12 + 1;
  return {
    chart, rolled, dateUsed: `${t.y}-${pad(t.m)}-${pad(t.d)}`, lunarText, opts, sihua: { ...SIHUA, ...SIHUA_ALT[opts.hua] },
    yearGZ: year, birthYear: ld.lunarYear + (off === 1 ? 1 : off === 59 ? -1 : 0), month, hourIndex: rt.hourIndex,
  };
}

export { ziwei, SIHUA, ZW_OPTIONS };
