/* 神煞（參考）：天乙貴人、文昌、祿神、羊刃、驛馬、桃花、華蓋的起例表，連同空亡，由 shensha() 在原局四柱裡查。 */
import { xunKong } from './ganzhi.js';
import { SAN_HE } from './relations.js';

/**
 * shensha() 回傳的一列：某個神煞依某個起例要找哪些地支，原局哪幾柱有。
 * @typedef {object} ShenshaItem
 * @property {string} name 神煞名稱：天乙貴人、文昌、祿神、羊刃、驛馬、桃花（咸池）、華蓋、空亡
 * @property {string} basis 起例，例如「日干戊」「年支子、日支午」「日柱戊午」
 * @property {string} targets 要找的地支，一到兩個字連寫，例如「丑未」
 * @property {string[]} hits 原局裡找到的位置，每個寫成「時支未」這樣；沒找到是空陣列
 */

/* ---------- 神煞（參考） ---------- */
const TIANYI = { 甲: '丑未', 戊: '丑未', 庚: '丑未', 乙: '子申', 己: '子申', 丙: '亥酉', 丁: '亥酉', 壬: '卯巳', 癸: '卯巳', 辛: '寅午' };
const WENCHANG = { 甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' };
const LU = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
const YANGREN = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };
const sanheOf = z => SAN_HE.map(s => s[0]).find(s => s.includes(z));
const YIMA = { 申子辰: '寅', 寅午戌: '申', 巳酉丑: '亥', 亥卯未: '巳' };
const TAOHUA = { 申子辰: '酉', 寅午戌: '卯', 巳酉丑: '午', 亥卯未: '子' };
const HUAGAI = { 申子辰: '辰', 寅午戌: '戌', 巳酉丑: '丑', 亥卯未: '未' };

// P：原局四柱（年月日時）。skip 是起例所在的柱，查支時不算自己。
// 驛馬、桃花、華蓋以年支、日支各查一次：兩支同屬一個三合局時所查相同，併成一列且兩柱互為對方的查找對象，
// 所以不排除任何一柱（年辰日申時，年支辰是從日支申查到的華蓋）。
/**
 * @param {import('./ganzhi.js').Pillar[]} P 原局四柱，順序必須是年、月、日、時
 * @returns {ShenshaItem[]} 每個起例一列；沒找到的也列出（hits 是空陣列），怎麼顯示由頁面決定
 */
function shensha(P) {
  const Y = P[0], D = P[2];
  const list = [];
  const add = (name, basis, targets, skip = -1) => list.push({
    name, basis, targets,
    hits: P.filter((p, i) => i !== skip && targets.includes(p.zhi)).map(p => `${p.pos}支${p.zhi}`),
  });
  add('天乙貴人', `日干${D.gan}`, TIANYI[D.gan]);
  if (TIANYI[Y.gan] !== TIANYI[D.gan]) add('天乙貴人', `年干${Y.gan}`, TIANYI[Y.gan]);
  add('文昌', `日干${D.gan}`, WENCHANG[D.gan]);
  add('祿神', `日干${D.gan}`, LU[D.gan]);
  if (YANGREN[D.gan]) add('羊刃', `日干${D.gan}`, YANGREN[D.gan]);
  for (const [name, tbl] of [['驛馬', YIMA], ['桃花（咸池）', TAOHUA], ['華蓋', HUAGAI]]) {
    if (sanheOf(D.zhi) === sanheOf(Y.zhi)) add(name, `年支${Y.zhi}、日支${D.zhi}`, tbl[sanheOf(Y.zhi)]);
    else {
      add(name, `年支${Y.zhi}`, tbl[sanheOf(Y.zhi)], 0);
      add(name, `日支${D.zhi}`, tbl[sanheOf(D.zhi)], 2);
    }
  }
  add('空亡', `日柱${D.gan}${D.zhi}`, xunKong(D.gan + D.zhi), 2);
  add('空亡', `年柱${Y.gan}${Y.zhi}`, xunKong(Y.gan + Y.zhi), 0);
  return list;
}

export { shensha };
