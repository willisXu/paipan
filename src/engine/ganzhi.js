/* 天干地支的基本表與查詢：干支、五行、陰陽、年干支、藏干、十神、十二長生、納音與六十甲子序、空亡、月令與旺相休囚死。
   全部是查表和取餘數，不用函式庫，也不 import 其他模組；引擎其餘模組都以這裡為底。 */

/**
 * 一柱。原局四柱與行運（大運、流年）共用這個形狀；relations()、shensha()、strength()、wuxingCount() 的輸入都是它的陣列。
 * @typedef {object} Pillar
 * @property {string} pos 柱名，一個字。bazi() 排出的四柱是「年」「月」「日」「時」；
 *   頁面接上行運時用「運」（大運）、「歲」（流年）
 * @property {string} gan 天干，一個字
 * @property {string} zhi 地支，一個字
 * @property {boolean} natal 是否屬於原局四柱：原局為 true，大運、流年為 false。只有 relations() 會看這一欄
 */

/**
 * 十天干。序號甲 0 … 癸 9。
 * @type {string[]}
 */
const GAN = [...'甲乙丙丁戊己庚辛壬癸'];
/**
 * 十二地支。序號子 0 … 亥 11。
 * @type {string[]}
 */
const ZHI = [...'子丑寅卯辰巳午未申酉戌亥'];
/**
 * 五行名稱。序號 0 木、1 火、2 土、3 金、4 水；引擎裡說的「五行序號」都是這個順序。
 * @type {string[]}
 */
const WX = [...'木火土金水'];
/**
 * 五行的英文代號，順序同 WX。頁面拿來組 CSS 的 class 名稱（wx-wood 之類）。
 * @type {string[]}
 */
const WX_KEY = ['wood', 'fire', 'earth', 'metal', 'water'];
const ZHI_WX = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];
// gi、zi：天干、地支的序號，不是干支字時為 -1。ganWxI、zhiWxI：天干、地支的五行序號（地支以本身論，不看藏干）
const gi = g => GAN.indexOf(g);
const zi = z => ZHI.indexOf(z);
const ganWxI = g => gi(g) >> 1;
const zhiWxI = z => ZHI_WX[zi(z)];
/**
 * 一個天干或地支字的五行序號，可直接當 WX、WX_KEY 的索引。
 * @param {string} c 天干或地支，一個字
 * @returns {number} 0 木、1 火、2 土、3 金、4 水
 */
const wxOf = c => (gi(c) >= 0 ? ganWxI(c) : zhiWxI(c));
/**
 * 一個天干或地支字的陰陽。
 * @param {string} c 天干或地支，一個字
 * @returns {'陽'|'陰'}
 */
const yinyang = c => ((gi(c) >= 0 ? gi(c) : zi(c)) % 2 === 0 ? '陽' : '陰');
/**
 * 公曆年數對應的干支（1984 是甲子）。只換算年數；這一年從立春還是正月初一起算，由呼叫端決定。
 * @param {number} y 公曆年
 * @returns {string} 干支，兩個字
 */
const yearGZ = y => GAN[((y - 4) % 10 + 10) % 10] + ZHI[((y - 4) % 12 + 12) % 12];

// 地支藏干：首位為本氣
/** @type {Record<string, string[]>} */
const CANG = {
  子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'], 未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
};

const TEN = [['比肩', '劫財'], ['食神', '傷官'], ['偏財', '正財'], ['七殺', '正官'], ['偏印', '正印']];
/**
 * 十神：以日干為「我」，看另一個天干。地支的十神要先取藏干再查。
 * @param {string} day 日干
 * @param {string} g 要看的天干
 * @returns {string} 比肩、劫財、食神、傷官、偏財、正財、七殺、正官、偏印、正印之一
 */
function tenGod(day, g) {
  const d = gi(day), o = gi(g);
  const rel = ((o >> 1) - (d >> 1) + 5) % 5; // 0 同我 1 我生 2 我剋 3 剋我 4 生我
  return TEN[rel][(d % 2) === (o % 2) ? 0 : 1];
}

// 十二長生：陽干順行、陰干逆行，火土同宮
const CS = ['長生', '沐浴', '冠帶', '臨官', '帝旺', '衰', '病', '死', '墓', '絕', '胎', '養'];
const CS_START = { 甲: 11, 乙: 6, 丙: 2, 丁: 9, 戊: 2, 己: 9, 庚: 5, 辛: 0, 壬: 8, 癸: 3 };
/**
 * 天干在某個地支的十二長生。
 * @param {string} g 天干
 * @param {string} z 地支
 * @returns {string} 長生、沐浴、冠帶、臨官、帝旺、衰、病、死、墓、絕、胎、養之一
 */
function changSheng(g, z) {
  const s = CS_START[g], k = zi(z);
  return CS[gi(g) % 2 === 0 ? (k - s + 12) % 12 : (s - k + 12) % 12];
}

const NAYIN = ['海中金', '爐中火', '大林木', '路旁土', '劍鋒金', '山頭火', '澗下水', '城頭土', '白蠟金', '楊柳木',
  '泉中水', '屋上土', '霹靂火', '松柏木', '長流水', '沙中金', '山下火', '平地木', '壁上土', '金箔金',
  '覆燈火', '天河水', '大驛土', '釵釧金', '桑柘木', '大溪水', '沙中土', '天上火', '石榴木', '大海水'];
/**
 * 六十甲子的序號。
 * @param {string} g 天干
 * @param {string} z 地支；要和天干同陰陽，才是六十甲子裡有的組合
 * @returns {number} 0（甲子）到 59（癸亥）
 */
const jz = (g, z) => (((6 * gi(g) - 5 * zi(z)) % 60) + 60) % 60; // 六十甲子序，甲子為 0
/**
 * 納音。
 * @param {string} gz 干支，兩個字
 * @returns {string} 納音名稱，例如甲子是「海中金」
 */
const nayin = gz => NAYIN[jz(gz[0], gz[1]) >> 1];
/**
 * 空亡：干支所在的那一旬裡輪空的兩個地支。
 * @param {string} gz 干支，兩個字
 * @returns {string} 兩個地支連寫，例如甲子旬是「戌亥」
 */
function xunKong(gz) {
  const i = jz(gz[0], gz[1]);
  const s = (i - (i % 10)) % 12; // 旬首地支
  return ZHI[(s + 10) % 12] + ZHI[(s + 11) % 12];
}

// 月令：寅卯木、巳午火、申酉金、亥子水，辰戌丑未土
/**
 * @param {string} z 月支
 * @returns {number} 當令的五行序號
 */
function seasonOf(z) {
  const k = zi(z);
  if (k === 2 || k === 3) return 0;
  if (k === 5 || k === 6) return 1;
  if (k === 8 || k === 9) return 3;
  if (k === 11 || k === 0) return 4;
  return 2;
}
// 當令者旺、令生者相、令剋者死、剋令者囚、生令者休
/**
 * @param {number} elem 要看的五行序號
 * @param {number} season 當令的五行序號，即 seasonOf() 的結果
 * @returns {string} 旺、相、休、囚、死之一
 */
const wangXiang = (elem, season) => ['旺', '相', '死', '囚', '休'][(elem - season + 5) % 5];

// 對外，由 index.js 轉出
export { GAN, ZHI, WX, WX_KEY, CANG, wxOf, yinyang, yearGZ, tenGod, changSheng, nayin, xunKong, jz, seasonOf, wangXiang };
// 只給引擎內的其他模組用
export { gi, zi, ganWxI, zhiWxI };
