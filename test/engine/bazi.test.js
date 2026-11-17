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
  const bad = { date: 0, span: 0, shared: 0, lib: 0, label: 0 };
  let early = 0, late = 0, n = 0;
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
  };
  for (let k = 0; k < 2500; k++) check(rndBirth(), k % 2 === 0);
  // 刻意補上交運時刻落在立春當天前後的盤：這種盤一步運可能重疊十個或十二個流年
  check({ y: 1960, m: 7, d: 19, h: 10, mi: 0 }, true);
  check({ y: 1960, m: 6, d: 25, h: 10, mi: 0 }, false);
  eq(bad, { date: 0, span: 0, shared: 0, lib: 0, label: 0 }, `${n} 張盤的交運日、流年範圍、相鄰兩步共用的年、函式庫的流年、標示年，不一致的組數`);
  ok(early > 1500 && late > 15000, `抽樣裡交運日在立春之前（第一個流年是標示年的前一年）有 ${early} 步、之後有 ${late} 步，兩種都要夠多`);
  // 兩張實際的盤：交運日在立春之前、之後各一
  const a = baziOf({ y: 1960, m: 7, d: 19, h: 10, mi: 0, gender: '男' }).dayun[5];
  eq([a.gz, a.startDate, a.endDate, a.startYear, a.endYear, a.years[0].year, a.years.at(-1).year, a.years.length], ['己丑', '2017-01-18', '2027-01-18', 2017, 2026, 2016, 2026, 11], '男 1960-07-19 10:00：己丑運 2017-01-18 交入（立春前），流年從 2016 到 2026，不含 2027');
  const c = baziOf({ y: 1960, m: 6, d: 25, h: 10, mi: 0, gender: '女' }).dayun[5];
  eq([c.gz, c.startDate, c.endDate, c.startYear, c.endYear, c.years[0].year, c.years.at(-1).year, c.years.length], ['丙子', '2016-12-06', '2026-12-06', 2016, 2025, 2016, 2026, 11], '女 1960-06-25 10:00：丙子運 2016-12-06 交入（立春後），流年從 2016 到 2026');
}

finish();
