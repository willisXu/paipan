/* 交界處的立場：節氣前後的年柱月柱、立春與正月初一兩種年界，以及子時換不換日。
   執行：node test/engine/boundaries.test.js */
import '../helpers/libs.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { chartOf } from '../helpers/charts.js';

/* 節氣邊界 */
section('節氣邊界（1984 立冬 11-07 13:45 UTC+8）');
{
  const a = chartOf({ y: 1984, m: 11, d: 7, h: 13, mi: 30 }), b = chartOf({ y: 1984, m: 11, d: 7, h: 14, mi: 0 });
  eq([a.bz.gz[1], b.bz.gz[1]], ['甲戌', '乙亥'], '立冬前後月柱');
  ok(a.bz.jie.near && a.bz.jie.next.name === '立冬', '交節前標示近節氣');
  const tk = chartOf({ y: 1984, m: 11, d: 7, h: 14, mi: 30, zone: 'Asia/Tokyo', lon: 139.69, tz: 9 });
  eq(tk.bz.gz[1], '甲戌', '東京 14:30 = UTC+8 13:30，仍在立冬前');
  const c = chartOf({ y: 1985, m: 2, d: 3, h: 12, mi: 0 }), d = chartOf({ y: 1985, m: 2, d: 5, h: 12, mi: 0 });
  eq([c.bz.gz[0], d.bz.gz[0]], ['甲子', '乙丑'], '立春前後年柱（1985 立春 02-04）');
  eq([c.bz.baseYear, d.bz.baseYear], [1984, 1985], '虛歲起算年跟著年柱');
  eq(c.zw.chart.rawDates.chineseDate.yearly.join(''), '甲子', '紫微生年以正月初一分界：1985-02-03 仍是甲子年');
  eq(chartOf({ y: 1985, m: 2, d: 21, h: 12, mi: 0 }).zw.chart.rawDates.chineseDate.yearly.join(''), '乙丑', '1985 春節 02-20 之後為乙丑年');
  eq([chartOf({ y: 1985, m: 1, d: 15, h: 12, mi: 0 }).bz.jie.prev.name, chartOf({ y: 2024, m: 1, d: 5, h: 12, mi: 0 }).bz.jie.prev.name, chartOf({ y: 2024, m: 3, d: 10, h: 12, mi: 0 }).bz.jie.prev.name], ['小寒', '大雪', '驚蟄'], '節氣名稱（年初跨年的節、繁體字）');
}

/* 子時 */
section('子時立場');
{
  const n = chartOf({ y: 1990, m: 5, d: 15, h: 23, mi: 30 }), s = chartOf({ y: 1990, m: 5, d: 15, h: 23, mi: 30, ziRule: 'same' });
  const z = chartOf({ y: 1990, m: 5, d: 16, h: 0, mi: 30 }), e = chartOf({ y: 1990, m: 5, d: 15, h: 0, mi: 30 });
  eq(n.bz.gz, z.bz.gz, '換日換柱：23:30 與次日 00:30 四柱相同');
  eq([s.bz.gz[2], s.bz.gz[3]], [e.bz.gz[2], z.bz.gz[3]], '夜子時：日柱同當日、時柱同次日子時');
  const stars = c => c.palaces.map(p => p.name + ':' + p.majorStars.concat(p.minorStars, p.adjectiveStars).map(x => x.name).join(',')).join('|');
  eq(stars(n.zw.chart), stars(z.zw.chart), '紫微換日：23:30 的盤等於次日早子時的盤');
  eq(stars(s.zw.chart), stars(e.zw.chart), '紫微不換日：23:30 的盤等於當日早子時的盤');
  // 與 iztro 內建晚子時（timeIndex 12）比對：月中應相同
  const lib = iztro.astro.withOptions({ type: 'solar', dateStr: '1990-5-15', timeIndex: 12, gender: '男', language: 'zh-TW', config: { dayDivide: 'forward' } });
  eq(stars(n.zw.chart), stars(lib), '月中：與 iztro 內建晚子時換日結果相同');
  // 農曆月底的晚子時：換日後應進到下個月初一
  const eom = chartOf({ y: 1990, m: 5, d: 23, h: 23, mi: 30 }); // 1990-05-23 為四月廿九（月底），次日五月初一
  eq(Solar.fromYmd(1990, 5, 24).getLunar().getDay(), 1, '前提：1990-05-24 為農曆初一');
  eq(stars(eom.zw.chart), stars(chartOf({ y: 1990, m: 5, d: 24, h: 0, mi: 30 }).zw.chart), '月底晚子時換日後以次月初一起盤');
  ok(eom.zw.rolled && eom.zw.dateUsed === '1990-05-24', '標記已換日');
}

finish();
