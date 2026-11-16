/* 八字排盤規則：日柱、月干、時柱、大運順逆與起運用獨立公式驗算，再查大運流年的年份、干支、虛歲。
   執行：node test/engine/bazi.test.js（約 35 秒） */
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
section('大運流年：流年干支、虛歲（立春年）、年份銜接');
{
  // 每年在立春、春節前後各取幾天，男女輪流
  let bad = 0, n = 0;
  for (let y = 1900; y <= 2100; y++) for (const [m, d] of [[1, 1], [1, 20], [2, 3], [2, 6], [2, 12], [2, 25], [7, 1], [12, 31]]) {
    const bz = baziOf({ y, m, d, h: 12, mi: 0, clock: 'std', gender: (y + d) % 2 ? '男' : '女' }); n++;
    const yrs = bz.dayun.flatMap(dy => dy.years);
    if (PP.yearGZ(bz.baseYear) !== bz.gz[0] || bz.dayun.length !== 10 || yrs.length !== 100 || yrs.some((x, i) => x.gz !== PP.yearGZ(x.year) || x.age !== x.year - bz.baseYear + 1 || (i && x.year !== yrs[i - 1].year + 1))
      || bz.dayun.some(dy => dy.startYear !== dy.years[0].year || dy.endYear !== dy.years[9].year || dy.startAge !== dy.years[0].age || dy.endAge !== dy.years[9].age)) bad++;
  }
  ok(bad === 0, `${n} 張盤中有 ${bad} 張的流年干支、虛歲或年份不對`);
  let diff = 0;
  for (let k = 0; k < 500; k++) {
    const b = rndBirth(1901, 2090); if (b.m < 3) b.m += 2; b.d = Math.min(b.d, 28); if (b.h === 23) b.h = 22;
    const bz = baziOf({ ...b, mi: 0, clock: 'std' });
    const lib = Solar.fromYmdHms(b.y, b.m, b.d, b.h, 0, 0).getLunar().getEightChar().getYun(1, 2).getDaYun(3)[1];
    if (bz.dayun[0].startAge !== lib.getStartAge() || bz.dayun[0].years[0].age !== lib.getLiuNian()[0].getAge()) diff++;
  }
  ok(diff === 0, `立春後出生者的虛歲應與函式庫一致，有 ${diff} 組不同`);
  const jan = baziOf({ y: 1985, m: 1, d: 15, h: 12, mi: 0 });
  eq(jan.dayun[0].years[0].age, jan.dayun[0].startYear - 1984 + 1, '立春前出生：虛歲從年柱所屬的 1984 年起算');
}

finish();
