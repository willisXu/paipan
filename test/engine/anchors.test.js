/* 教材錨點：日柱的兩個已知日期、教材範例盤與對照盤，答案都印在教材上。
   執行：node test/engine/anchors.test.js */
import { ok, eq, section, finish } from '../helpers/harness.js';
import { chartOf } from '../helpers/charts.js';

/* 教材錨點 */
section('教材錨點：日柱雙錨點、範例盤、對照盤');
{
  eq(chartOf({ y: 1900, m: 1, d: 1, h: 12, mi: 0 }).bz.gz[2], '甲戌', '1900-01-01 日柱');
  eq(chartOf({ y: 2000, m: 1, d: 1, h: 12, mi: 0 }).bz.gz[2], '戊午', '2000-01-01 日柱');
  const { bz, zw, rt } = chartOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 });
  eq(bz.gz, ['甲子', '乙亥', '戊午', '己未'], '範例盤四柱');
  eq(bz.dayun.slice(0, 6).map(d => d.gz), ['丙子', '丁丑', '戊寅', '己卯', '庚辰', '辛巳'], '範例盤大運');
  ok(bz.forward, '陽男順行');
  eq([bz.yun.y, bz.yun.m], [5, 6], '起運 5 年 6 個多月（教材：約 5 歲 7 個月）');
  eq([bz.strength.ling, bz.strength.deLing], ['囚', false], '戊土生亥月失令');
  eq(bz.pillars[2].star, '帝旺', '日支午為帝旺');
  ok(bz.strength.roots.some(r => r.pos === '日'), '日支有根');
  eq(bz.dayun.find(d => d.gz === '己卯').years.find(n => n.year === 2026).gz, '丙午', '2026 流年丙午');
  eq(rt.shiftMin, 0, '1984 年台灣無夏令時');
  eq(zw.chart.fiveElementsClass, '木三局', '範例盤五行局');
  // 對照盤：壬寅 庚戌 己丑 己巳（女）——在 1962 年戌月找己丑日
  let found = null;
  for (let d = 9; d <= 31 && !found; d++) { const c = chartOf({ y: 1962, m: 10, d, h: 10, mi: 0, gender: '女' }); if (c.bz.gz.join(' ') === '壬寅 庚戌 己丑 己巳') found = c; }
  ok(!!found, '對照盤 壬寅 庚戌 己丑 己巳 可由 1962 年 10 月某日巳時排出');
  if (found) { eq(found.bz.strength.ling, '旺', '己土生戌月得令'); ok(found.bz.forward === false, '陽年女命逆行'); }
}

finish();
