/* 旺衰觀察與五行字數：strength() 列出得令、通根、天干幫扶，只列事實、不計分；
   wuxingCount() 數五行字數，只數干支本身的字。 */
import { WX, CANG, ganWxI, zhiWxI, tenGod, seasonOf, wangXiang } from './ganzhi.js';

/**
 * strength() 的結果：日主得令、得地（通根）、得勢（天干幫扶）三方面的事實，不下身強身弱的結論。
 * @typedef {object} StrengthFacts
 * @property {string} dm 日主，也就是日干
 * @property {string} dmWx 日主的五行名
 * @property {string} month 月支
 * @property {string} seasonWx 月令當令的五行名
 * @property {string} ling 日主的五行在這個月令的狀態：旺、相、休、囚、死之一
 * @property {boolean} deLing 是否得令：ling 是旺或相時為 true
 * @property {{pos: string, zhi: string, gan: string, main: boolean}[]} roots 通根：
 *   四柱地支的藏干裡，和日主同五行的每一個。pos 柱名、zhi 那一柱的地支、gan 那個藏干、main 是否為本氣
 * @property {{yin: string[], bi: string[]}} helpers 年、月、時三個天干裡幫扶日主的：
 *   yin 印星、bi 比劫，每個寫成「時干己」這樣
 */

/**
 * @param {import('./ganzhi.js').Pillar[]} P 原局四柱，順序必須是年、月、日、時
 * @returns {StrengthFacts}
 */
function strength(P) {
  const dm = P[2].gan, dmW = ganWxI(dm);
  const month = P[1].zhi;
  const season = seasonOf(month);
  const ling = wangXiang(dmW, season);
  const roots = [];
  P.forEach(p => CANG[p.zhi].forEach((c, k) => {
    if (ganWxI(c) === dmW) roots.push({ pos: p.pos, zhi: p.zhi, gan: c, main: k === 0 });
  }));
  const helpers = { yin: [], bi: [] };
  P.forEach((p, i) => {
    if (i === 2) return;
    const t = tenGod(dm, p.gan);
    if (t.includes('印')) helpers.yin.push(`${p.pos}干${p.gan}`);
    if (t === '比肩' || t === '劫財') helpers.bi.push(`${p.pos}干${p.gan}`);
  });
  return { dm, dmWx: WX[dmW], month, seasonWx: WX[season], ling, deLing: ling === '旺' || ling === '相', roots, helpers };
}

/**
 * 五行字數：每一柱的天干、地支各算一個字；地支以本身的五行計，不看藏干。
 * @param {import('./ganzhi.js').Pillar[]} P 要數的柱；原局四柱就是八個字
 * @returns {number[]} 五個數，依木、火、土、金、水
 */
function wuxingCount(P) {
  const c = [0, 0, 0, 0, 0];
  P.forEach(p => { c[ganWxI(p.gan)]++; c[zhiWxI(p.zhi)]++; });
  return c;
}

export { strength, wuxingCount };
