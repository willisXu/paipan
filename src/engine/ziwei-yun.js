/* 紫微斗數的運限：大限、童限、小限、流年、流月、流日、流時各自落在本命盤的哪一宮，連同干支、十二宮名、四化與流曜；流年另有歲前、將前十二神。
   本命盤（宮位、宮干支、大限起訖、小限歲數）讀 ziwei() 的結果。運限怎麼推、流曜安在哪裡，用這裡的公式與表格，
   測試中和 iztro 自己的運限查詢逐項比對。農曆每個月從哪一天到哪一天，用全域的 LunarYear、Solar（lunar-javascript）。

   採用的排法：
     大限    宮干支就是大限干支，起訖歲數由 iztro 排在各宮上
     童限    第一個大限之前：一歲命宮、二歲財帛、三歲疾厄、四歲夫妻、五歲福德
     小限    一歲起在哪一宮、順行逆行由 iztro 排在各宮上（寅午戌年生人起辰、申子辰起戌、巳酉丑起未、亥卯未起丑；男順女逆）
     流年    流年地支所在的宮是流年命宮
     流月    流年斗君起正月：從流年命宮起正月，逆數到生月，再從那一宮起子時順數到生時；之後每月順行一宮。月干用五虎遁
     流日    從流月命宮起初一，每日順行一宮
     流時    從流日命宮起子時，每個時辰順行一宮。時干用五鼠遁。一天照鐘錶的 0 點到 24 點排十三格：早子時、丑時到亥時、晚子時；
             晚子時的命宮和早子時相同，時干用次日的子時（夜子時不換日的排法，iztro 也是這樣）
     閏月    跟著本命盤的設定：月中分界時，閏月上半（初一到十五）算本月、下半算下個月；否則整個閏月算本月
   年界只決定生年（也就是虛歲從哪一年算起）；流月、流日一律照農曆的月和日，歸在農曆那一年底下。 */
import { GAN, ZHI, gi, zi, yearGZ } from './ganzhi.js';
import { fromMs, pad, lunarMonthName, lunarDayName } from './time.js';

/**
 * 一段運限疊在本命盤上的樣子。下面各個函式的結果都帶這幾欄，再各自加上自己的欄位。
 * @typedef {object} YunLayer
 * @property {number} index 這段運限的命宮在本命盤的哪一宮（宮位序號：寅宮 0、卯宮 1 … 丑宮 11）
 * @property {string} gz 干支。大限、童限、小限是所在那一宮的宮干支；流年、流月、流日、流時是那一年、那個月、那一天、那個時辰的干支
 * @property {string[]} names 本命十二宮各自的運限宮名，照宮位序號排；names[index] 是「命宮」
 * @property {string[]} hua 這段運限的四化星，依序是化祿、化權、化科、化忌
 * @property {string[][]} stars 流曜：本命十二宮各有哪幾顆，照宮位序號排。小限沒有流曜，十二格都是空的
 */

const md = n => ((n % 12) + 12) % 12;
const palOf = b => md(b - 2); // 地支序（子 0）→ 宮位序號（寅 0）
const ymd = ms => { const t = fromMs(ms); return `${t.y}-${pad(t.m)}-${pad(t.d)}`; };

/* 流曜安在哪個地支（地支序，子是 0）。前五張表以天干查，順序是甲到癸；
   LU 祿存（羊、陀在它的前後一宮）、KUI 天魁、YUE 天鉞、CHANG 流昌、QU 流曲。 */
const LU = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];    // 甲寅 乙卯 丙戊巳 丁己午 庚申 辛酉 壬亥 癸子
const KUI = [1, 0, 11, 11, 1, 0, 1, 6, 3, 3];  // 甲戊庚丑 乙己子 丙丁亥 辛午 壬癸卯
const YUE = [7, 8, 9, 9, 7, 8, 7, 2, 5, 5];    // 甲戊庚未 乙己申 丙丁酉 辛寅 壬癸巳
const CHANG = [5, 6, 8, 9, 8, 9, 11, 0, 2, 3]; // 甲巳 乙午 丙戊申 丁己酉 庚亥 辛子 壬寅 癸卯
const QU = [9, 8, 6, 5, 6, 5, 3, 2, 0, 11];    // 甲酉 乙申 丙戊午 丁己巳 庚卯 辛寅 壬子 癸亥
// 以地支查的，用地支序除以 4 的餘數：0 是申子辰、1 是巳酉丑、2 是寅午戌、3 是亥卯未
const MA = [2, 11, 8, 5];                      // 天馬：申子辰在寅、巳酉丑在亥、寅午戌在申、亥卯未在巳
const JIANG_AT = [0, 9, 6, 3];                 // 將星：申子辰在子、巳酉丑在酉、寅午戌在午、亥卯未在卯
const FLOW = [...'魁鉞昌曲祿羊陀馬鸞喜'];       // 一宮裡有好幾顆時照這個順序排
const SUI12 = ['歲建', '晦氣', '喪門', '貫索', '官符', '小耗', '大耗', '龍德', '白虎', '天德', '弔客', '病符'];
const JIANG12 = ['將星', '攀鞍', '歲驛', '息神', '華蓋', '劫煞', '災煞', '天煞', '指背', '咸池', '月煞', '亡神'];

// 一組干支帶出的流曜。prefix 是名稱的頭一個字：運（大限、童限）、流（流年）、月、日、時
function flowStars(gz, prefix) {
  const g = gi(gz[0]), b = zi(gz[1]), out = Array.from({ length: 12 }, () => []);
  if (prefix === '流') out[palOf(10 - b)].push('年解'); // 年解只有流年有：子年在戌，逐年逆行
  const luan = 3 - b;                                   // 紅鸞：子年在卯，逐年逆行；天喜在它的對宮
  [KUI[g], YUE[g], CHANG[g], QU[g], LU[g], LU[g] + 1, LU[g] - 1, MA[b % 4], luan, luan + 6].forEach((at, k) => out[palOf(at)].push(prefix + FLOW[k]));
  return out;
}

// 命宮落在 index 那一宮、干支是 gz 的一段運限。prefix 給空字串表示沒有流曜
function layer(zw, index, gz, prefix) {
  const P = zw.chart.palaces, ming = P.findIndex(p => p.name === '命宮');
  return {
    index, gz,
    names: P.map((p, i) => P[md(ming - index + i)].name), // 運限命宮在 index，其餘各宮照本命十二宮的順序排過去
    hua: zw.sihua[gz[0]],
    stars: prefix ? flowStars(gz, prefix) : P.map(() => []),
  };
}
const firstAge = zw => Math.min(...zw.chart.palaces.map(p => p.decadal.range[0])); // 第一個大限從幾歲開始，也就是五行局的局數

/**
 * 一生的運限分段：童限一段，加上十二個大限，照歲數排。
 * @param {import('./ziwei.js').ZiweiChart} zw ziwei() 的結果
 * @returns {{child: boolean, palace: number|null, ages: number[], years: number[], gz: string}[]}
 *   child 是否為童限；palace 大限所在的宮位序號（童限每年走的宮不同，為 null）；
 *   ages 起訖虛歲；years 起訖年份（生年加上虛歲減一）；gz 大限干支（童限為空字串）
 */
function zwSpans(zw) {
  const B = zw.birthYear, years = ages => ages.map(a => B + a - 1);
  const decs = zw.chart.palaces.map(p => ({ child: false, palace: p.index, ages: [...p.decadal.range], years: years(p.decadal.range), gz: p.heavenlyStem + p.earthlyBranch }))
    .sort((a, b) => a.ages[0] - b.ages[0]);
  const child = [1, decs[0].ages[0] - 1];
  return [{ child: true, palace: null, ages: child, years: years(child), gz: '' }, ...decs];
}

/**
 * 大限：所在的那一宮是大限命宮，宮干支是大限干支。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {number} palace 大限所在的宮位序號，0–11
 * @returns {YunLayer & {child: boolean, ages: number[]}} child 固定為 false；ages 是這個大限的起訖虛歲
 */
function zwDaXian(zw, palace) {
  const p = zw.chart.palaces[palace];
  return { ...layer(zw, palace, p.heavenlyStem + p.earthlyBranch, '運'), child: false, ages: [...p.decadal.range] };
}

const CHILD_PALACE = ['命宮', '財帛', '疾厄', '夫妻', '福德']; // 一命二財三疾厄，四歲夫妻五福德
/**
 * 童限：第一個大限開始之前，每一歲走一個宮。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {number} age 虛歲
 * @returns {(YunLayer & {child: boolean, ages: number[]})|null} child 固定為 true；ages 起訖都是這一歲。這一歲不在童限裡時為 null
 */
function zwTongXian(zw, age) {
  if (!(Number.isInteger(age) && age >= 1 && age < firstAge(zw))) return null;
  const p = zw.chart.palaces.find(q => q.name === CHILD_PALACE[age - 1]);
  return { ...layer(zw, p.index, p.heavenlyStem + p.earthlyBranch, '運'), child: true, ages: [age, age] };
}

/**
 * 小限：這一歲的小限走到哪一宮。那一宮是小限命宮，用它的宮干起四化；沒有流曜。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {number} age 虛歲
 * @returns {(YunLayer & {age: number})|null} 超出各宮排到的歲數（1 到 120）時為 null
 */
function zwXiaoXian(zw, age) {
  const p = zw.chart.palaces.find(q => q.ages.includes(age));
  return p ? { ...layer(zw, p.index, p.heavenlyStem + p.earthlyBranch, ''), age } : null;
}

/**
 * 流年：流年地支所在的宮是流年命宮。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {number} year 年數（它的干支就是流年干支；這一年從哪一天算起，看年界）
 * @returns {(YunLayer & {year: number, age: number, sui12: string[], jiang12: string[]})|null}
 *   age 這一年的虛歲；sui12、jiang12 流年的歲前、將前十二神，照宮位序號排。還沒出生的年份為 null
 */
function zwLiuNian(zw, year) {
  const age = year - zw.birthYear + 1;
  if (!(Number.isInteger(year) && age >= 1)) return null;
  const gz = yearGZ(year), b = zi(gz[1]), sui12 = [], jiang12 = [];
  SUI12.forEach((name, k) => { sui12[palOf(b + k)] = name; });                    // 流年支起歲建，順行
  JIANG12.forEach((name, k) => { jiang12[palOf(JIANG_AT[b % 4] + k)] = name; });  // 三合局的帝旺位起將星，順行
  return { ...layer(zw, palOf(b), gz, '流'), year, age, sui12, jiang12 };
}

/**
 * 流月：農曆這一年的每個月。閏月在「月中分界」的設定下拆成上半、下半兩段，其餘一個月一段。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {number} year 農曆年
 * @returns {(YunLayer & {k: number, year: number, month: number, leap: boolean, part: string, label: string, days: number[], from: string, to: string})[]}
 *   k 這一年裡的第幾段，從 0 起；month 農曆月 1–12；leap 是否為閏月；part 閏月拆開時是「上半」「下半」，否則為空字串；
 *   label 寫法，例如「正月」「閏六月上半」；days 這一段涵蓋的農曆日起訖；from、to 這一段頭尾兩天的公曆日期 YYYY-MM-DD
 */
function zwLiuYue(zw, year) {
  const yg = yearGZ(year), first = (gi(yg[0]) % 5) * 2 + 2; // 五虎遁：正月（寅月）的天干序
  const dou = palOf(zi(yg[1])) - (zw.month - 1) + zw.hourIndex; // 流年斗君：正月的命宮
  const split = zw.opts.leap === 'mid', out = [];
  for (const lm of LunarYear.fromYear(year).getMonthsInYear()) {
    const month = Math.abs(lm.getMonth()), leap = lm.getMonth() < 0, n = lm.getDayCount();
    const s = Solar.fromJulianDay(lm.getFirstJulianDay()), t0 = Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay());
    for (const [part, d0, d1, add] of leap && split ? [['上半', 1, 15, 0], ['下半', 16, n, 1]] : [['', 1, n, 0]]) {
      const seq = month + add; // 照第幾個月算
      out.push({
        ...layer(zw, md(dou + seq - 1), GAN[(first + seq - 1) % 10] + ZHI[(seq + 1) % 12], '月'),
        k: out.length, year, month, leap, part, label: lunarMonthName(month, leap) + part,
        days: [d0, d1], from: ymd(t0 + (d0 - 1) * 864e5), to: ymd(t0 + (d1 - 1) * 864e5),
      });
    }
  }
  return out;
}

/**
 * 流日：流月那一段裡的每一天。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {{index: number, days: number[], from: string}} month zwLiuYue() 回傳的其中一段
 * @returns {(YunLayer & {day: number, label: string, date: string})[]} day 農曆日 1–30；label 寫法，例如「初九」；date 公曆日期 YYYY-MM-DD
 */
function zwLiuRi(zw, month) {
  const [d0, d1] = month.days, [y, m, d] = month.from.split('-').map(Number), t0 = Date.UTC(y, m - 1, d);
  const out = [];
  for (let day = d0; day <= d1; day++) {
    const ms = t0 + (day - d0) * 864e5, k = ((Math.round(ms / 864e5) + 17) % 60 + 60) % 60; // 日干支：1970-01-01 是辛巳日（六十甲子第 17）
    out.push({ ...layer(zw, md(month.index + day - 1), GAN[k % 10] + ZHI[k % 12], '日'), day, label: lunarDayName(day), date: ymd(ms) });
  }
  return out;
}

/**
 * 流時：流日那一天的十三格。從流日命宮起子時，每個時辰順行一宮；時干照日干用五鼠遁（甲己日起甲子時）。
 * 一天照鐘錶的 0 點到 24 點算，所以子時拆成頭尾兩格：早子時（0 到 1 點）和晚子時（23 到 24 點）。
 * 晚子時的命宮和早子時相同，時干用次日的子時——這是「夜子時不換日」的排法；採 23 點換日的看法時，
 * 這一個小時整個算次日的子時，也就是次日那一天的早子時那一格（命宮、干支、四化、流曜都一樣，只是從前一晚 23 點算起）。
 * @param {import('./ziwei.js').ZiweiChart} zw
 * @param {{index: number, gz: string}} day zwLiuRi() 回傳的其中一天
 * @returns {(YunLayer & {k: number, label: string, from: string, to: string})[]}
 *   k 第幾格：0 早子時、1 丑時 … 11 亥時、12 晚子時；label 寫法「早子時」「丑時」…「晚子時」；from、to 這一格的起訖鐘點 HH:MM（晚子時到 24:00）
 */
function zwLiuShi(zw, day) {
  const dg = gi(day.gz[0]), out = [];
  for (let k = 0; k <= 12; k++) {
    const late = k === 12, b = k % 12;         // b 時支的地支序；晚子時也是子
    const zi0 = ((dg + (late ? 1 : 0)) % 5) * 2; // 五鼠遁：子時的天干序。甲己日甲子、乙庚日丙子、丙辛日戊子、丁壬日庚子、戊癸日壬子；晚子時看次日的日干
    out.push({
      ...layer(zw, md(day.index + b), GAN[(zi0 + b) % 10] + ZHI[b], '時'),
      k, label: k === 0 ? '早子時' : late ? '晚子時' : `${ZHI[b]}時`,
      from: `${pad(k === 0 ? 0 : 2 * k - 1)}:00`, to: `${pad(late ? 24 : 2 * k + 1)}:00`,
    });
  }
  return out;
}

export { zwSpans, zwDaXian, zwTongXian, zwXiaoXian, zwLiuNian, zwLiuYue, zwLiuRi, zwLiuShi };
