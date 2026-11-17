/* 干支關係：五合、相沖、六合、六沖、三合、三會、半合、刑、害、破的表，以及找出這些關係的 relations()。
   每一筆都帶採信標籤（共識／參考／存疑）；存疑的照教材的政策列出，但註明權重低。 */
import { gi, ganWxI } from './ganzhi.js';

/**
 * relations() 找到的一筆關係。
 * @typedef {object} Relation
 * @property {string} type 關係的種類：天干五合、天干相沖、地支六合、地支六沖、地支相刑、自刑、六害、六破、
 *   天剋地沖、伏吟、歲運並臨、三合、三會、半合
 * @property {string} text 給人讀的寫法，例如「甲己合（化土）」「申子辰三合水局」
 * @property {string[]} where 牽涉到哪幾柱：各柱的 pos，依柱序，例如 ['年', '時']、['月', '時', '運']、['日', '流月']
 * @property {string} dist 兩柱的遠近：「相鄰」或「遙隔」。兩柱都屬原局才標；牽涉運、歲的，以及三合、三會、半合，都是空字串
 * @property {string} tag 採信標籤：共識、參考、存疑之一
 * @property {string} note 補充說明；沒有就是空字串
 */

const pairIn = (list, a, b) => list.includes(a + b) || list.includes(b + a);
const keyOf = (obj, a, b) => (obj[a + b] !== undefined ? a + b : obj[b + a] !== undefined ? b + a : null);
const GAN_HE = { 甲己: '土', 乙庚: '金', 丙辛: '水', 丁壬: '木', 戊癸: '火' };
const GAN_CHONG = ['甲庚', '乙辛', '丙壬', '丁癸'];
const ZHI_HE = { 子丑: '土', 寅亥: '木', 卯戌: '火', 辰酉: '金', 巳申: '水', 午未: '土' };
const ZHI_CHONG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const SAN_HE = [['申子辰', '水'], ['亥卯未', '木'], ['寅午戌', '火'], ['巳酉丑', '金']];
const SAN_HUI = [['寅卯辰', '木'], ['巳午未', '火'], ['申酉戌', '金'], ['亥子丑', '水']];
const XING = { 寅巳: '無恩之刑', 巳申: '無恩之刑', 寅申: '無恩之刑', 丑戌: '恃勢之刑', 戌未: '恃勢之刑', 丑未: '恃勢之刑', 子卯: '無禮之刑' };
const ZI_XING = '辰午酉亥';
const HAI = ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'];
const PO = ['子酉', '卯午', '巳申', '寅亥', '丑辰', '戌未'];
const LOW = '權重低，僅作古籍閱讀。';
// 天剋：同陰陽的天干相剋（甲戊、丙庚…，含甲庚等四沖）
const ganKe = (a, b) => gi(a) % 2 === gi(b) % 2 && ((ganWxI(a) + 2) % 5 === ganWxI(b) || (ganWxI(b) + 2) % 5 === ganWxI(a));

/**
 * @param {import('./ganzhi.js').Pillar[]} pillars 要互相比對的柱，照柱序排：年、月、日、時，後面才接運、歲、流月
 *   （原局四柱 natal 為 true，大運、流年、流月為 false）
 * @param {boolean} [onlyWithExtra=false] 為 true 時只回報牽涉運、歲或流月的關係
 * @returns {Relation[]} 先是兩兩之間的關係（依柱序），最後是三合、三會、半合
 */
function relations(pillars, onlyWithExtra = false) {
  const out = [];
  const P = pillars.map((p, i) => ({ ...p, i }));
  const want = ps => !onlyWithExtra || ps.some(p => !p.natal);
  const whereOf = ps => [...ps].sort((a, b) => a.i - b.i).map(p => p.pos);
  for (let x = 0; x < P.length; x++) {
    for (let y = x + 1; y < P.length; y++) {
      const a = P[x], b = P[y];
      if (!want([a, b])) continue;
      const where = [a.pos, b.pos];
      const dist = a.natal && b.natal ? (y - x === 1 ? '相鄰' : '遙隔') : '';
      const add = (type, text, tag, note = '') => out.push({ type, text, where, dist, tag, note });
      let k = keyOf(GAN_HE, a.gan, b.gan);
      if (k) add('天干五合', `${a.gan}${b.gan}合（化${GAN_HE[k]}）`, '共識', '合而能否化，要看月令與全局，不能見合就說化。');
      if (pairIn(GAN_CHONG, a.gan, b.gan)) add('天干相沖', `${a.gan}${b.gan}沖`, '共識', `天干的沖只有${GAN_CHONG.join('、')}四組：方位相對、同陰陽相剋；戊己居中，不沖。`);
      k = keyOf(ZHI_HE, a.zhi, b.zhi);
      if (k) add('地支六合', `${a.zhi}${b.zhi}合（${ZHI_HE[k]}）`, '共識', k === '午未' ? '午未合化土或化火，古籍說法不一。' : '');
      const chong = pairIn(ZHI_CHONG, a.zhi, b.zhi);
      if (chong) add('地支六沖', `${a.zhi}${b.zhi}沖`, '共識');
      k = keyOf(XING, a.zhi, b.zhi);
      if (k) add('地支相刑', `${a.zhi}${b.zhi}刑（${XING[k]}）`, '參考');
      if (a.zhi === b.zhi && ZI_XING.includes(a.zhi)) add('自刑', `${a.zhi}${b.zhi}自刑`, '存疑', LOW);
      if (pairIn(HAI, a.zhi, b.zhi)) add('六害', `${a.zhi}${b.zhi}害`, '存疑', LOW);
      if (pairIn(PO, a.zhi, b.zhi)) add('六破', `${a.zhi}${b.zhi}破`, '存疑', LOW);
      if (chong && ganKe(a.gan, b.gan)) add('天剋地沖', `${a.gan}${a.zhi}與${b.gan}${b.zhi}`, '參考', '這裡的天剋是同陰陽的天干相剋（含甲庚等四沖），再加上地支相沖；也有只認四沖的說法。');
      if (a.gan === b.gan && a.zhi === b.zhi && !(a.natal && b.natal)) {
        // 運、歲、流月和原局的某一柱同干支是伏吟；大運和流年同干支是歲運並臨。流月和大運或流年同干支不另外列
        if (a.natal || b.natal) add('伏吟', `${a.gan}${a.zhi}重見`, '參考');
        else if (a.pos === '運' && b.pos === '歲') add('歲運並臨', `運與歲同為${a.gan}${a.zhi}`, '存疑', '坊間有重話說法，教材列為存疑、不主張使用。');
      }
    }
  }
  // 三合、三會：三字齊全才成局；半合須有中神
  const groups = [...SAN_HE.map(([set, el]) => ({ set, el, type: '三合' })), ...SAN_HUI.map(([set, el]) => ({ set, el, type: '三會' }))];
  for (const g of groups) {
    const hits = [...g.set].map(c => P.filter(p => p.zhi === c));
    const all = hits.flat();
    const present = hits.filter(h => h.length).length;
    if (present === 3) {
      if (want(all)) out.push({ type: g.type, text: `${g.set}${g.type}${g.el}局`, where: whereOf(all), dist: '', tag: '共識', note: '三字齊全才成局；是否「化」仍看月令與透干。' });
    } else if (present === 2 && g.type === '三合' && hits[1].length) {
      if (want(all)) out.push({ type: '半合', text: `${[...g.set].filter((c, i) => hits[i].length).join('')}半合${g.el}`, where: whereOf(all), dist: '', tag: '參考', note: '有中神（子午卯酉）才算半合；缺中神的拱合不列。' });
    }
  }
  return out;
}

export { relations };
// 只給引擎內的其他模組用：shensha.js 查驛馬、桃花、華蓋要用三合局
export { SAN_HE };
