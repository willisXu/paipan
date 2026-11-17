/* 八字排盤規則：日柱、月干、時柱、大運順逆與起運用獨立公式驗算，再查大運流年的年份、干支、虛歲，以及交運日與流年的重疊。
   執行：node test/engine/bazi.test.js（約 10 秒） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { baziOf, jdn, gzOf } from '../helpers/charts.js';

const { rndBirth } = seeded(2026111103);

/* 教材第 04 課的排盤規則，獨立公式對函式庫 */
section('日柱 JDN 公式、五虎遁、五鼠遁、大運順逆與起運（3,000 組，含晚子時）');
{
  eq(jdn(1900, 1, 1), 2415021, 'JDN 錨點');
  const bad = { day: 0, month: 0, hour: 0, yun: 0, start: 0 };
  for (let k = 0; k < 3000; k++) {
    const b = rndBirth(), male = k % 2 === 0, late = b.h === 23;
    const bz = baziOf({ ...b, clock: 'std', gender: male ? '男' : '女' });
    const [Y, M, D, H] = bz.gz;
    if (gzOf((jdn(b.y, b.m, b.d) + 49 + (late ? 1 : 0)) % 60) !== D) bad.day++;                        // 日柱 = (JDN + 49) mod 60；23 時起算次日
    const mb = (PP.ZHI.indexOf(M[1]) + 10) % 12;                                                      // 月支距寅
    if (PP.GAN[(PP.GAN.indexOf(Y[0]) % 5 * 2 + 2 + mb) % 10] !== M[0]) bad.month++;                   // 五虎遁
    const hb = Math.floor((b.h + 1) / 2) % 12;
    if (PP.GAN[(PP.GAN.indexOf(D[0]) % 5 * 2 + hb) % 10] + PP.ZHI[hb] !== H) bad.hour++;              // 五鼠遁
    const fwd = (PP.GAN.indexOf(Y[0]) % 2 === 0) === male, start = PP.jz(M[0], M[1]);                 // 陽男陰女順、陰男陽女逆
    if (bz.forward !== fwd || bz.dayun.some((dy, i) => dy.gz !== gzOf(((start + (fwd ? 1 : -1) * (i + 1)) % 60 + 60) % 60))) bad.yun++;
    const years = (fwd ? bz.jie.toNext : bz.jie.sincePrev) / 3;                                       // 三天折一年
    if (Math.abs(bz.yun.y + bz.yun.m / 12 + bz.yun.d / 360 - years) > 0.01) bad.start++;
  }
  eq(bad, { day: 0, month: 0, hour: 0, yun: 0, start: 0 }, '不一致組數');
}

/* 大運流年的年份、干支、虛歲 */
section('大運流年：流年干支、虛歲（立春年）、標示的年份');
{
  // 每年在立春、春節前後各取幾天，男女輪流
  let bad = 0, n = 0;
  for (let y = 1900; y <= 2100; y++) for (const [m, d] of [[1, 1], [1, 20], [2, 3], [2, 6], [2, 12], [2, 25], [7, 1], [12, 31]]) {
    const bz = baziOf({ y, m, d, h: 12, mi: 0, clock: 'std', gender: (y + d) % 2 ? '男' : '女' }); n++;
    const yrs = bz.dayun.flatMap(dy => dy.years);
    if (PP.yearGZ(bz.baseYear) !== bz.gz[0] || bz.dayun.length !== 10 || yrs.some(x => x.gz !== PP.yearGZ(x.year) || x.age !== x.year - bz.baseYear + 1)
      || bz.dayun.some((dy, i) => dy.endYear !== dy.startYear + 9 || dy.startAge !== dy.startYear - bz.baseYear + 1 || dy.endAge !== dy.startAge + 9 || (i && dy.startYear !== bz.dayun[i - 1].startYear + 10)
        || dy.years.some((x, k) => k && x.year !== dy.years[k - 1].year + 1))) bad++;
  }
  ok(bad === 0, `${n} 張盤中有 ${bad} 張的流年干支、虛歲或年份不對`);
  let diff = 0;
  for (let k = 0; k < 500; k++) {
    const b = rndBirth(1901, 2090); if (b.m < 3) b.m += 2; b.d = Math.min(b.d, 28); if (b.h === 23) b.h = 22;
    const bz = baziOf({ ...b, mi: 0, clock: 'std' });
    const lib = Solar.fromYmdHms(b.y, b.m, b.d, b.h, 0, 0).getLunar().getEightChar().getYun(1, 2).getDaYun(3)[1];
    const first = bz.dayun[0].years.find(x => x.year === bz.dayun[0].startYear);
    if (bz.dayun[0].startAge !== lib.getStartAge() || first.age !== lib.getLiuNian()[0].getAge()) diff++;
  }
  ok(diff === 0, `立春後出生者的虛歲應與函式庫一致，有 ${diff} 組不同`);
  const jan = baziOf({ y: 1985, m: 1, d: 15, h: 12, mi: 0 });
  eq(jan.dayun[0].startAge, jan.dayun[0].startYear - 1984 + 1, '立春前出生：虛歲從年柱所屬的 1984 年起算');
}

/* 大運在交運日換、流年在立春換：每步運列出的流年，是和它在時間上有重疊的那些。
   這裡不用引擎的做法（比對年干支），改拿函式庫的起運時刻和立春時刻直接比先後。 */
section('交運日與流年的重疊（2,500 組，對函式庫的起運時刻與立春時刻）');
{
  const pad2 = v => String(v).padStart(2, '0');
  const ymd = s => `${s.getYear()}-${pad2(s.getMonth())}-${pad2(s.getDay())}`;
  const sec = s => Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute(), s.getSecond());
  // 某個公曆年的立春時刻：取那年年中的農曆年節氣表。每年只算一次
  const lichunOf = new Map();
  const lichun = y => {
    if (!lichunOf.has(y)) { const t = Solar.fromYmd(y, 6, 1).getLunar().getJieQiTable()['立春']; if (t.getYear() !== y) throw new Error(`拿到的不是 ${y} 年的立春`); lichunOf.set(y, sec(t)); }
    return lichunOf.get(y);
  };
  // 時刻 s 落在哪個流年
  const flowYear = s => (sec(s) < lichun(s.getYear()) ? s.getYear() - 1 : s.getYear());
  // 起運時刻加 10k 年：同月同日同時刻，2 月 29 日遇平年取 2 月 28 日
  const plus = (s, years) => { const y = s.getYear() + years, leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; return Solar.fromYmdHms(y, s.getMonth(), s.getMonth() === 2 && s.getDay() === 29 && !leap ? 28 : s.getDay(), s.getHour(), s.getMinute(), s.getSecond()); };
  const bad = { date: 0, span: 0, shared: 0, lib: 0, label: 0, pre: 0 };
  let early = 0, late = 0, n = 0;
  const preLen = new Set();
  const check = (b, male) => {
    const inp = { ...b, clock: 'std', gender: male ? '男' : '女' }, bz = baziOf(inp); n++;
    const yun = Solar.fromYmdHms(b.y, b.m, b.d, b.h, b.mi, 0).getLunar().getEightChar().getYun(male ? 1 : 0, 2), start = yun.getStartSolar(), libDayun = yun.getDaYun(11).slice(1);
    if (bz.yun.date !== ymd(start)) bad.date++;
    bz.dayun.forEach((dy, k) => {
      const from = plus(start, 10 * k), to = plus(start, 10 * k + 10);
      if (dy.startDate !== ymd(from) || dy.endDate !== ymd(to)) bad.date++;
      const years = dy.years.map(x => x.year), want = []; for (let y = flowYear(from); y <= flowYear(to); y++) want.push(y);
      if (JSON.stringify(years) !== JSON.stringify(want)) bad.span++;
      if (k && years[0] !== bz.dayun[k - 1].years.at(-1).year) bad.shared++; // 交運的那一年，前後兩步運都要列
      // 函式庫每步運列十個流年（從交運那個公曆年起）：都要在我們的清單裡，干支也相同
      if (libDayun[k].getLiuNian().some(x => !dy.years.some(o => o.year === x.getYear() && o.gz === x.getGanZhi()))) bad.lib++;
      if (dy.startYear !== from.getYear() || dy.startYear !== libDayun[k].getStartYear()) bad.label++;
      if (years[0] === dy.startYear - 1) early++; else late++;
    });
    // 起運之前：從出生的那個流年（就是年柱那一年，虛歲 1 歲）列到起運當下的流年；標示的年、歲接在第一步運前面
    const born = Solar.fromYmdHms(b.y, b.m, b.d, b.h, b.mi, 0), p = bz.pre, d0 = bz.dayun[0];
    const want = []; for (let y = flowYear(born); y <= flowYear(start); y++) want.push(y);
    preLen.add(want.length);
    if (JSON.stringify(p.years.map(x => x.year)) !== JSON.stringify(want) || p.years.some((x, i) => x.age !== i + 1 || x.gz !== PP.yearGZ(x.year)) || p.years[0].gz !== bz.gz[0]
      || p.years.at(-1).year !== d0.years[0].year || p.startDate !== ymd(born) || p.endDate !== d0.startDate || p.startDate > p.endDate
      || p.startYear !== b.y || p.endYear !== Math.max(b.y, d0.startYear - 1) || p.startAge !== 1 || p.endAge !== Math.max(1, d0.startAge - 1)) bad.pre++;
  };
  for (let k = 0; k < 2500; k++) check(rndBirth(), k % 2 === 0);
  // 刻意補上交運時刻落在立春當天前後的盤：這種盤一步運可能重疊十個或十二個流年
  check({ y: 1960, m: 7, d: 19, h: 10, mi: 0 }, true);
  check({ y: 1960, m: 6, d: 25, h: 10, mi: 0 }, false);
  eq(bad, { date: 0, span: 0, shared: 0, lib: 0, label: 0, pre: 0 }, `${n} 張盤的交運日、流年範圍、相鄰兩步共用的年、函式庫的流年、標示年、起運前那一段，不一致的組數`);
  ok(preLen.has(1) && preLen.has(11), `起運前的流年從 1 個到 11 個都抽到了：${[...preLen].sort((x, y) => x - y).join('、')}`);
  ok(early > 1500 && late > 15000, `抽樣裡交運日在立春之前（第一個流年是標示年的前一年）有 ${early} 步、之後有 ${late} 步，兩種都要夠多`);
  // 兩張實際的盤：交運日在立春之前、之後各一
  const a = baziOf({ y: 1960, m: 7, d: 19, h: 10, mi: 0, gender: '男' }).dayun[5];
  eq([a.gz, a.startDate, a.endDate, a.startYear, a.endYear, a.years[0].year, a.years.at(-1).year, a.years.length], ['己丑', '2017-01-18', '2027-01-18', 2017, 2026, 2016, 2026, 11], '男 1960-07-19 10:00：己丑運 2017-01-18 交入（立春前），流年從 2016 到 2026，不含 2027');
  const c = baziOf({ y: 1960, m: 6, d: 25, h: 10, mi: 0, gender: '女' }).dayun[5];
  eq([c.gz, c.startDate, c.endDate, c.startYear, c.endYear, c.years[0].year, c.years.at(-1).year, c.years.length], ['丙子', '2016-12-06', '2026-12-06', 2016, 2025, 2016, 2026, 11], '女 1960-06-25 10:00：丙子運 2016-12-06 交入（立春後），流年從 2016 到 2026');
  // 起運前：一般的盤、立春前出生的盤（第一個流年是出生那個公曆年的前一年）、出生第二天就起運的盤
  const pre = o => { const q = baziOf(o).pre; return [q.startDate, q.endDate, q.startYear, q.endYear, q.startAge, q.endAge, q.years.map(x => x.year + x.gz).join(' ')]; };
  eq(pre({ y: 1984, m: 11, d: 20, h: 14, mi: 0 }), ['1984-11-20', '1990-06-11', 1984, 1989, 1, 6, '1984甲子 1985乙丑 1986丙寅 1987丁卯 1988戊辰 1989己巳 1990庚午'], '教材範例盤：1990-06-11 起運，起運前列 1984 到 1990 年');
  eq(pre({ y: 1985, m: 1, d: 15, h: 12, mi: 0 }).slice(0, 6).concat(baziOf({ y: 1985, m: 1, d: 15, h: 12, mi: 0 }).pre.years[0].year), ['1985-01-15', '1991-08-10', 1985, 1990, 1, 7, 1984], '立春前出生：標示從出生的 1985 年起，流年從年柱所屬的 1984 甲子年起');
  eq(pre({ y: 1990, m: 2, d: 4, h: 10, mi: 30, gender: '女' }), ['1990-02-04', '1990-02-05', 1990, 1990, 1, 1, '1990庚午'], '出生第二天就起運：起運前只有出生那一年');
}

/* 流月：一個流年裡的十二個節氣月。每一年都查：首尾相接、月柱和函式庫照節氣排的月柱相同、交節時刻就是函式庫的節氣時刻、
   交節前一分鐘還是上個月。月干另外用五虎遁的口訣核對 */
section('流月（1899 到 2215 年每一年）：十二個節氣月首尾相接，月柱、交節時刻對函式庫，月干對五虎遁');
{
  const bz = baziOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 }); // 範例盤，日主戊
  const at = (date, time, addMin) => { const [y, m, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number); return PP.fromMs(PP.toMs({ y, m, d, h, mi }) + addMin * 6e4); };
  const lunarAt = t => Solar.fromYmdHms(t.y, t.m, t.d, t.h, t.mi, 0).getLunar();
  const JIE = ['立春', '驚蟄', '清明', '立夏', '芒種', '小暑', '立秋', '白露', '寒露', '立冬', '大雪', '小寒'];
  const TIGER = { 甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲' }; // 甲己之年丙作首…
  const bad = { shape: 0, chain: 0, pillar: 0, cut: 0, before: 0, tiger: 0, god: 0 }; let months = 0;
  for (let year = 1899; year <= 2215; year++) {
    const ms = PP.bzLiuYue(bz, year), yg = PP.yearGZ(year);
    if (ms.length !== 12 || ms.some((m, k) => m.k !== k || m.year !== year || m.jie !== JIE[k]) || !/-02-0[345]$/.test(ms[0].from) || ms[11].to.slice(0, 7) !== `${year + 1}-02`) bad.shape++;
    ms.forEach((m, k) => {
      months++;
      if (k && ms[k - 1].to !== m.from) bad.chain++;
      // 月中（交節後十二天）函式庫照節氣排的年柱、月柱
      const mid = lunarAt(at(m.from, m.time, 12 * 1440));
      if (mid.getMonthInGanZhiExact() !== m.gz || mid.getYearInGanZhiExact() !== yg) bad.pillar++;
      // 交節時刻：函式庫說月中的前一個節就是這個節，時刻相同（引擎只留到分）
      const pj = mid.getPrevJie(), ps = pj.getSolar();
      if (`${ps.getYear()}-${PP.pad(ps.getMonth())}-${PP.pad(ps.getDay())} ${PP.pad(ps.getHour())}:${PP.pad(ps.getMinute())}` !== `${m.from} ${m.time}`) bad.cut++;
      // 交節的前一分鐘還是上個月；交節的下一分鐘已經是這個月
      const want = k ? ms[k - 1].gz : PP.GAN[(PP.GAN.indexOf(m.gz[0]) + 9) % 10] + '丑';
      if (lunarAt(at(m.from, m.time, -1)).getMonthInGanZhiExact() !== want || lunarAt(at(m.from, m.time, 1)).getMonthInGanZhiExact() !== m.gz) bad.before++;
      if (m.gz[1] !== PP.ZHI[(k + 2) % 12] || (k === 0 && m.gz[0] !== TIGER[yg[0]]) || (k && PP.GAN.indexOf(m.gz[0]) !== (PP.GAN.indexOf(ms[k - 1].gz[0]) + 1) % 10)) bad.tiger++;
      if (m.ganGod !== PP.tenGod('戊', m.gz[0]) || m.zhiGod !== PP.tenGod('戊', PP.CANG[m.gz[1]][0])) bad.god++;
    });
  }
  eq(bad, { shape: 0, chain: 0, pillar: 0, cut: 0, before: 0, tiger: 0, god: 0 }, `${months} 個月，違反次數`);
  const y26 = PP.bzLiuYue(bz, 2026);
  eq([y26[0], y26[9], y26[11]].map(m => `${m.gz} ${m.ganGod} ${m.zhiGod} ${m.jie} ${m.from} ${m.time} 到 ${m.to}`),
    ['庚寅 食神 七殺 立春 2026-02-04 04:02 到 2026-03-05', '己亥 劫財 偏財 立冬 2026-11-07 17:52 到 2026-12-07', '辛丑 傷官 劫財 小寒 2027-01-05 22:09 到 2027-02-04'], '範例盤 2026 丙午年：寅月庚寅從立春起，亥月己亥從立冬起，丑月辛丑到下一個立春為止');
}

/* 流月接進干支關係：位置寫「流月」；和原局同干支是伏吟；和大運或流年同干支不另外列（歲運並臨只指大運和流年） */
section('流月和原局、運、歲的關係');
{
  const P = (s, names) => s.split(' ').map((x, i) => ({ pos: names[i], gan: x[0], zhi: x[1], natal: i < 4 }));
  const names = ['年', '月', '日', '時', '運', '歲', '流月'];
  const rel = (s, only = true) => PP.relations(P(s, names), only).map(r => `${r.type}:${r.where.join('×')}`);
  const a = rel('甲子 乙亥 戊午 己未 己卯 丙午 己亥');
  eq(a.filter(t => t.includes('流月')), ['天干五合:年×流月', '自刑:月×流月', '三合:月×時×運×流月'], '範例盤、己卯運、丙午年、己亥月：牽涉流月的有甲己合、亥亥自刑，和湊齊的亥卯未三合');
  ok(rel('甲子 乙亥 戊午 己未 己卯 丙午 乙亥').includes('伏吟:月×流月'), '流月和月柱同干支：伏吟，位置寫 月×流月');
  const same = rel('甲子 乙亥 戊午 己未 甲戌 甲戌 甲戌');
  ok(same.filter(t => t.startsWith('歲運並臨')).join() === '歲運並臨:運×歲' && !same.some(t => t.startsWith('伏吟')), `大運、流年、流月三個都是甲戌：只列運和歲的歲運並臨，流月不另外列。${same.filter(t => /並臨|伏吟/.test(t)).join(' ')}`);
  ok(rel('甲子 乙亥 戊午 己未 己卯 丙午 己亥').every(t => /運|歲|流月/.test(t)), '只列牽涉運、歲或流月的關係');
}

finish();
