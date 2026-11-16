/* 不變量隨機測試：地點、夏令時間模式、真太陽時、子時立場隨機混搭，四柱與紫微起盤都要守住同一套規則。
   執行：node test/engine/invariants.test.js（約 30 秒） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { base, jdn, gzOf, md } from '../helpers/charts.js';

const { rnd, rndBirth } = seeded(2026111105);

/* 各時區、真太陽時、兩種子時立場混在一起的不變量 */
section('不變量隨機測試（3,000 組：十三種地點、夏令時三種模式、真太陽時、子時兩種立場）');
{
  const places = [['Asia/Taipei', 121.56, 8], ['Asia/Shanghai', 104.07, 8], ['Asia/Hong_Kong', 114.17, 8], ['Asia/Macau', 113.54, 8], ['Asia/Singapore', 103.82, 8], ['Asia/Kuala_Lumpur', 101.69, 8], ['Asia/Manila', 120.98, 8], ['Asia/Tokyo', 139.69, 9], ['Asia/Seoul', 126.98, 9], [undefined, -73.9, -5], [undefined, 0, 0], [undefined, 179.5, 12], [undefined, 77.2, 5.5]];
  const bad = { thrown: 0, day: 0, hour: 0, yearMonth: 0, shift: 0, ziwei: 0 }; let late = 0;
  for (let k = 0; k < 3000; k++) {
    const [zone, lon, tz] = places[rnd(0, places.length - 1)];
    const inp = { ...base, ...rndBirth(), gender: k % 2 ? '男' : '女', lon, tz, zone, clock: zone ? ['auto', 'std', 'dst'][rnd(0, 2)] : ['std', 'dst'][rnd(0, 1)], useTST: k % 3 === 0, ziRule: rnd(0, 1) ? 'next' : 'same' };
    if (k % 5 === 0) inp.h = 23;
    try {
      const rt = PP.resolveTime(inp), bz = PP.bazi(inp, rt), t = rt.local, lz = t.h === 23;
      if (lz) late++;
      // 日柱看排盤用時的日期：換日派 23 時起用次日，夜子時派用當日
      if (gzOf((jdn(t.y, t.m, t.d) + 49 + (lz && inp.ziRule === 'next' ? 1 : 0)) % 60) !== bz.gz[2]) bad.day++;
      // 時支看排盤用時；時干五鼠遁，晚子時兩派都取次日日干
      const hb = Math.floor((t.h + 1) / 2) % 12, stemDay = (jdn(t.y, t.m, t.d) + 49 + (lz ? 1 : 0)) % 10;
      if (PP.GAN[(stemDay % 5 * 2 + hb) % 10] + PP.ZHI[hb] !== bz.gz[3]) bad.hour++;
      // 年柱月柱只看出生瞬間：把同一瞬間換成 UTC+8 直接排，應相同
      const ref = Solar.fromYmdHms(rt.instant8.y, rt.instant8.m, rt.instant8.d, rt.instant8.h, rt.instant8.mi, 0).getLunar().getEightChar();
      if (ref.getYear() !== bz.gz[0] || ref.getMonth() !== bz.gz[1] || Math.abs(PP.toMs(rt.instant8) - (PP.toMs(rt.clock) - rt.offsetMin * 6e4 + 480 * 6e4)) > 6e4) bad.yearMonth++;
      if ((inp.clock === 'std' && rt.shiftMin !== 0) || (inp.clock === 'dst' && rt.shiftMin !== -60) || (!inp.useTST && Math.abs(PP.toMs(t) - PP.toMs(rt.clock) - rt.shiftMin * 6e4) > 6e4)) bad.shift++;
      if (k % 10 === 0) { // 紫微：起盤日與命宮位置
        const zw = PP.ziwei(inp, rt), used = lz && inp.ziRule === 'next' ? PP.fromMs(PP.toMs(t) + 3600e3) : t;
        const lu = Solar.fromYmd(used.y, used.m, used.d).getLunar(), mon = Math.abs(lu.getMonth()) + (lu.getMonth() < 0 && lu.getDay() > 15 ? 1 : 0);
        if (zw.chart.palaces.findIndex(p => p.name === '命宮') !== md(mon - 1 - hb) || zw.rolled !== (lz && inp.ziRule === 'next') || zw.chart.rawDates.chineseDate.yearly.join('') !== lu.getYearInGanZhi()) bad.ziwei++;
      }
    } catch (e) { bad.thrown++; if (bad.thrown < 3) console.log('   ', JSON.stringify(inp), e.message); }
  }
  eq(bad, { thrown: 0, day: 0, hour: 0, yearMonth: 0, shift: 0, ziwei: 0 }, '違反次數');
  ok(late > 400, `含晚子時 ${late} 組`);
}

finish();
