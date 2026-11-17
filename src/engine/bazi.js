/* 八字：bazi() 排四柱、節氣位置、大運流年、胎元，並附上原局的干支關係、神煞、旺衰觀察、五行字數。
   四柱、節氣、起運由 lunar-javascript（全域的 Solar）計算；十神、十二長生、納音、空亡用 ganzhi.js 的表。 */
import { GAN, ZHI, CANG, gi, zi, yearGZ, tenGod, changSheng, nayin, xunKong } from './ganzhi.js';
import { pad, toMs, lunarMonthDay, userError } from './time.js';
import { relations } from './relations.js';
import { shensha } from './shensha.js';
import { strength, wuxingCount } from './strength.js';

/**
 * 原局的一柱，連同畫命盤要用的各項查表結果。前四欄和 Pillar 相同。
 * @typedef {object} BaziPillar
 * @property {string} pos 柱名：年、月、日、時
 * @property {string} gan 天干
 * @property {string} zhi 地支
 * @property {boolean} natal 固定為 true
 * @property {string} ganGod 天干的十神。日柱沒有十神，放「元男」或「元女」
 * @property {{gan: string, god: string}[]} cang 地支的藏干與各自的十神，首位是本氣
 * @property {string} star 星運：日主在這一柱地支的十二長生
 * @property {string} self 自坐：這一柱的天干在自己地支的十二長生
 * @property {string} nayin 納音
 * @property {string} kong 這一柱所在旬的空亡，兩個地支連寫
 */

/**
 * 一個「節」（十二節，不含中氣）和它的交節時刻。
 * @typedef {object} JieTime
 * @property {string} name 節的名稱，繁體字
 * @property {import('./time.js').TimeParts} t 交節時刻的年月日時分，UTC+8
 * @property {number} sec 交節時刻的秒，0–59。出生時間只到分，同一分鐘內的先後靠它判斷（出生時間當作那一分鐘的 0 秒）
 */

/**
 * 一個流年。
 * @typedef {object} LiuNian
 * @property {number} year 公曆年
 * @property {string} gz 流年干支
 * @property {number} age 虛歲，也就是 year − baseYear + 1
 * @property {string} ganGod 天干的十神
 * @property {string} zhiGod 地支本氣的十神
 */

/**
 * 一步大運，十年。大運在交運日換（每十年同月同日），流年在立春換，兩者的交界不在同一天，
 * 所以交運那一年前後兩步運各佔一段。
 * @typedef {object} DaYun
 * @property {string} gz 大運干支
 * @property {string} startDate 交入這步運的公曆日期，YYYY-MM-DD。約略值：起運日起每十年同月同日（2 月 29 日遇平年取 2 月 28 日）
 * @property {string} endDate 交出這步運的公曆日期，也就是下一步運的 startDate
 * @property {number} startYear 習慣上標示這步運的起始年：交入那一天所在的公曆年
 * @property {number} endYear 習慣上標示的結束年，也就是 startYear + 9
 * @property {number} startAge startYear 那一年的虛歲
 * @property {number} endAge endYear 那一年的虛歲
 * @property {string} ganGod 天干的十神
 * @property {string} zhiGod 地支本氣的十神
 * @property {LiuNian[]} years 和這步運在時間上有重疊的流年，通常十一個：第一個是交入當下的流年（交入之前屬上一步運），
 *   最後一個是交出當下的流年（交出之後屬下一步運），所以相鄰兩步運共用交運的那一年。
 *   交運日在立春之前時，第一個流年是 startYear 的前一年
 */

/**
 * bazi() 的結果。
 * @typedef {object} BaziChart
 * @property {string[]} gz 四柱干支，依年、月、日、時，每個兩個字
 * @property {import('./ganzhi.js').Pillar[]} P 四柱的最小形狀，natal 都是 true。頁面在後面接上運、歲，再交給 relations()
 * @property {BaziPillar[]} pillars 四柱加上十神、藏干、星運、自坐、納音、空亡
 * @property {string} dm 日主，也就是日干
 * @property {boolean} male 是否為男命
 * @property {boolean} forward 大運是否順行：年干屬陽的男命、年干屬陰的女命順行，其餘逆行
 * @property {number} baseYear 年柱所屬的那個公曆年（立春前出生的，是出生那年的前一年）。虛歲從這一年算 1 歲
 * @property {string} lunarText 排盤用時那一天的農曆日期，例如「甲子年 閏十月初三」。年干支以正月初一分界，可能和年柱不同
 * @property {{prev: JieTime, next: JieTime, sincePrev: number, toNext: number, near: boolean}} jie 節氣位置：
 *   prev、next 是出生瞬間的前一個節、下一個節；sincePrev、toNext 是離兩者各幾天（帶小數，算到秒）；
 *   near 表示離其中一個不到一天
 * @property {{y: number, m: number, d: number, date: string}} yun 起運（不是大運列表，大運在 dayun）：
 *   出生後 y 年 m 個月 d 天起運；date 是交入第一步運的公曆日期，YYYY-MM-DD，也就是 dayun[0].startDate
 * @property {DaYun[]} dayun 十步大運
 * @property {string} taiYuan 胎元干支
 * @property {import('./relations.js').Relation[]} relations 原局四柱之間的干支關係
 * @property {import('./shensha.js').ShenshaItem[]} shensha 原局的神煞
 * @property {import('./strength.js').StrengthFacts} strength 旺衰觀察
 * @property {number[]} wuxing 原局八個字的五行字數，依木、火、土、金、水
 */

const JIE_T = { 惊蛰: '驚蟄', 芒种: '芒種' };
const lunarOf = t => Solar.fromYmdHms(t.y, t.m, t.d, t.h, t.mi, 0).getLunar();

/**
 * @param {import('./time.js').BirthInput} inp 生辰設定；這裡讀 ziRule（子時立場）和 gender（大運順逆）
 * @param {import('./time.js').ResolvedTime} rt resolveTime(inp) 的結果；
 *   這裡讀 instant8（年柱、月柱、節氣、起運）和 local（日柱、時柱、農曆日期）
 * @returns {BaziChart}
 * @throws {Error} gender 不是「男」或「女」時丟出 userError
 */
function bazi(inp, rt) {
  // 性別決定大運順逆，沒有預設值：給錯不可以默默當成另一種
  if (inp.gender !== '男' && inp.gender !== '女') throw userError('性別請填「男」或「女」。');
  // sect 1：23:00 換日換柱；sect 2：夜子時日柱不換、時干用次日子時
  const sect = inp.ziRule === 'same' ? 2 : 1;
  const li = lunarOf(rt.instant8), ll = lunarOf(rt.local);
  const eI = li.getEightChar(); eI.setSect(sect);
  const eL = ll.getEightChar(); eL.setSect(sect);
  // 年柱月柱看出生瞬間落在哪個節氣之後；日柱時柱看排盤用時
  const gz = [eI.getYear(), eI.getMonth(), eL.getDay(), eL.getTime()];
  const POS = ['年', '月', '日', '時'];
  const P = gz.map((s, i) => ({ pos: POS[i], gan: s[0], zhi: s[1], natal: true }));
  const dm = P[2].gan;
  const male = inp.gender === '男';
  const pillars = P.map((p, i) => ({
    ...p,
    ganGod: i === 2 ? (male ? '元男' : '元女') : tenGod(dm, p.gan),
    cang: CANG[p.zhi].map(c => ({ gan: c, god: tenGod(dm, c) })),
    star: changSheng(dm, p.zhi),
    self: changSheng(p.gan, p.zhi),
    nayin: nayin(p.gan + p.zhi),
    kong: xunKong(p.gan + p.zhi),
  }));

  const jt = j => { const s = j.getSolar(); return { name: JIE_T[j.getName()] || j.getName(), t: { y: s.getYear(), m: s.getMonth(), d: s.getDay(), h: s.getHour(), mi: s.getMinute() }, sec: s.getSecond() }; };
  const pj = jt(li.getPrevJie()), nj = jt(li.getNextJie());
  const instMs = toMs(rt.instant8), jieMs = j => toMs(j.t) + j.sec * 1000;
  const sincePrev = (instMs - jieMs(pj)) / 864e5, toNext = (jieMs(nj) - instMs) / 864e5;

  // 虛歲以立春年起算：年柱所屬的那一年為 1 歲
  const baseYear = yearGZ(rt.instant8.y) === gz[0] ? rt.instant8.y : rt.instant8.y - 1;
  const ageIn = year => year - baseYear + 1;
  const yun = eI.getYun(male ? 1 : 0, 2); // 起運按分鐘折算（3 天折 1 年）
  const forward = (gi(P[0].gan) % 2 === 0) === male;
  const god2 = s => ({ ganGod: tenGod(dm, s[0]), zhiGod: tenGod(dm, CANG[s[1]][0]) });
  // 大運在交運日換：第 k 步運交入的時刻是起運時刻加 10k 年
  const ss = yun.getStartSolar();
  const transit = k => ss.nextYear(10 * k);
  const ymd = s => `${s.getYear()}-${pad(s.getMonth())}-${pad(s.getDay())}`;
  // 某個時刻落在哪個流年：流年在立春換，立春之前還算前一年。立春落在 2 月 3 到 5 日，只有這幾天需要問函式庫確切的交節時刻
  const beforeLichun = s => (s.getMonth() === 2 && s.getDay() >= 3 && s.getDay() <= 5 ? yearGZ(s.getYear()) !== s.getLunar().getYearInGanZhiExact() : s.getMonth() === 1 || (s.getMonth() === 2 && s.getDay() < 3));
  const flowYear = s => (beforeLichun(s) ? s.getYear() - 1 : s.getYear());
  const liuNian = year => ({ year, gz: yearGZ(year), age: ageIn(year), ...god2(yearGZ(year)) });
  const dayun = yun.getDaYun(11).slice(1).map((dy, k) => {
    const from = transit(k), to = transit(k + 1), years = [];
    for (let y = flowYear(from); y <= flowYear(to); y++) years.push(liuNian(y));
    return {
      gz: dy.getGanZhi(), startDate: ymd(from), endDate: ymd(to), startYear: dy.getStartYear(), endYear: dy.getEndYear(),
      startAge: ageIn(dy.getStartYear()), endAge: ageIn(dy.getEndYear()), ...god2(dy.getGanZhi()), years,
    };
  });
  const lm = ll.getMonth();
  const mg = P[1];
  return {
    gz, P, pillars, dm, male, forward, baseYear,
    lunarText: `${ll.getYearInGanZhi()}年 ${lunarMonthDay(Math.abs(lm), ll.getDay(), lm < 0)}`,
    jie: { prev: pj, next: nj, sincePrev, toNext, near: Math.min(sincePrev, toNext) < 1 },
    yun: { y: yun.getStartYear(), m: yun.getStartMonth(), d: yun.getStartDay(), date: ymd(ss) },
    dayun,
    taiYuan: GAN[(gi(mg.gan) + 1) % 10] + ZHI[(zi(mg.zhi) + 3) % 12], // 月干進一、月支進三
    relations: relations(P),
    shensha: shensha(P),
    strength: strength(P),
    wuxing: wuxingCount(P),
  };
}

export { bazi };
