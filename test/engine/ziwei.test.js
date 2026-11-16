/* 紫微斗數：用通行的安星公式獨立計算，對 iztro 排出的盤；再查大限、流年的運限與四化。
   執行：node test/engine/ziwei.test.js（約 1 分鐘，引擎驗算裡最久的一支） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { chartOf, md } from '../helpers/charts.js';

const { rndBirth } = seeded(2026111104);

const pal = br => md(br - 2); // 地支序（子=0）→ 宮位序（寅=0）

/* 紫微：用通行安星公式獨立計算，對 iztro */
section('紫微安星獨立驗算（2,000 組）：命身宮、五行局、十四主星、十四輔星、命主身主、大限、長生與博士十二神');
{
  const JU = { 水: 2, 木: 3, 金: 4, 土: 5, 火: 6 }, JU_NAME = ['', '', '水二局', '木三局', '金四局', '土五局', '火六局'];
  const LU = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];                                                   // 祿存：甲寅 乙卯 丙戊巳 丁己午 庚申 辛酉 壬亥 癸子
  const KUI = [1, 0, 11, 11, 1, 0, 1, 6, 3, 3], YUE = [7, 8, 9, 9, 7, 8, 7, 2, 5, 5];           // 天魁天鉞：甲戊庚牛羊 乙己鼠猴 丙丁豬雞 辛馬虎 壬癸兔蛇
  const grp = yb => ['申子辰', '寅午戌', '巳酉丑', '亥卯未'].findIndex(g => g.includes(PP.ZHI[yb]));
  const MA = [2, 8, 11, 5], HUO = [2, 1, 3, 9], LING = [10, 3, 10, 10];                         // 天馬；火星、鈴星起子時的宮
  const SOUL = ['貪狼', '巨門', '祿存', '文曲', '廉貞', '武曲', '破軍', '武曲', '廉貞', '文曲', '祿存', '巨門']; // 命主：依命宮地支
  const BODY = ['火星', '天相', '天梁', '天同', '文昌', '天機', '火星', '天相', '天梁', '天同', '文昌', '天機']; // 身主：依生年地支
  const CS_AT = { 2: 8, 3: 11, 4: 5, 5: 8, 6: 2 };                                              // 長生：水土申、木亥、金巳、火寅
  const bad = {}; const note = (k, msg) => { bad[k] = (bad[k] || 0) + 1; if (bad[k] === 1) console.log('   ', k, msg); };
  let lateZi = 0;
  for (let k = 0; k < 2000; k++) {
    const b = rndBirth(), male = k % 2 === 1;
    const { zw, rt } = chartOf({ ...b, clock: 'std', gender: male ? '男' : '女', ziRule: k % 4 < 2 ? 'next' : 'same' });
    if (rt.lateZi) lateZi++;
    const c = zw.chart, P = c.palaces, [uy, um, ud] = zw.dateUsed.split('-').map(Number);
    const lu = Solar.fromYmd(uy, um, ud).getLunar(), day = lu.getDay();
    const mon = Math.abs(lu.getMonth()) + (lu.getMonth() < 0 && day > 15 ? 1 : 0);              // 閏月十五日後算下月
    const hb = rt.hourIndex, ys = PP.GAN.indexOf(lu.getYearGan()), yb = PP.ZHI.indexOf(lu.getYearZhi());
    const ming = md(mon - 1 - hb), shen = md(mon - 1 + hb);                                     // 寅起正月順數到生月，逆數生時為命宮、順數為身宮
    const mingGan = PP.GAN[((ys % 5) * 2 + 2 + ming) % 10], mingZhi = PP.ZHI[(ming + 2) % 12];  // 五虎遁定宮干
    const ju = JU[PP.nayin(mingGan + mingZhi).slice(-1)];                                       // 命宮干支納音定局
    const q = Math.ceil(day / ju), r = q * ju - day;
    const z = md((r % 2 === 0 ? q + r : q - r) - 1), t = md(12 - z), g = grp(yb), lc = LU[ys];  // 紫微；天府與紫微以寅申為軸對稱
    const fwd = (ys % 2 === 0) === male, dir = fwd ? 1 : -1;                                    // 陽男陰女順行
    const tag = `${uy}-${um}-${ud} ${hb}支 ${male ? '男' : '女'} 年${PP.GAN[ys]}${PP.ZHI[yb]} 農${mon}月${day}`;
    eqq('命宮', P.findIndex(p => p.name === '命宮'), ming); eqq('身宮', P.findIndex(p => p.isBodyPalace), shen);
    eqq('命宮干支', P[ming].heavenlyStem + P[ming].earthlyBranch, mingGan + mingZhi); eqq('五行局', c.fiveElementsClass, JU_NAME[ju]);
    const want = {
      紫微: z, 天機: md(z - 1), 太陽: md(z - 3), 武曲: md(z - 4), 天同: md(z - 5), 廉貞: md(z - 8),
      天府: t, 太陰: md(t + 1), 貪狼: md(t + 2), 巨門: md(t + 3), 天相: md(t + 4), 天梁: md(t + 5), 七殺: md(t + 6), 破軍: md(t + 10),
      左輔: pal(md(4 + mon - 1)), 右弼: pal(md(10 - (mon - 1))), 文昌: pal(md(10 - hb)), 文曲: pal(md(4 + hb)), 地劫: pal(md(11 + hb)), 地空: pal(md(11 - hb)),
      祿存: pal(lc), 擎羊: pal(md(lc + 1)), 陀羅: pal(md(lc - 1)), 天魁: pal(KUI[ys]), 天鉞: pal(YUE[ys]), 天馬: pal(MA[g]), 火星: pal(md(HUO[g] + hb)), 鈴星: pal(md(LING[g] + hb)),
    };
    const got = {}; P.forEach(p => p.majorStars.concat(p.minorStars).forEach(s => { got[s.name] = p.index; }));
    eqq('主輔星總數', Object.keys(got).length, 28);
    for (const name of Object.keys(want)) eqq(name, got[name], want[name]);
    eqq('命主', c.soul, SOUL[PP.ZHI.indexOf(mingZhi)]); eqq('身主', c.body, BODY[yb]);
    for (let i = 0; i < 12; i++) eqq('大限', P[md(ming + dir * i)].decadal.range, [ju + 10 * i, ju + 10 * i + 9]);
    const csAt = P.findIndex(p => p.changsheng12 === '長生'), bsAt = P.findIndex(p => p.boshi12 === '博士');
    eqq('長生十二神', [csAt, P.findIndex(p => p.changsheng12 === '沐浴')], [pal(CS_AT[ju]), md(csAt + dir)]);
    eqq('博士十二神', [bsAt, P.findIndex(p => p.boshi12 === '力士')], [pal(lc), md(bsAt + dir)]);
    function eqq(name, a, w) { if (JSON.stringify(a) !== JSON.stringify(w)) note(name, `${tag}：iztro ${JSON.stringify(a)}，公式 ${JSON.stringify(w)}`); }
  }
  eq(bad, {}, '不一致的項目與次數');
  ok(lateZi > 50, `抽樣含晚子時 ${lateZi} 組`);
}

/* 運限查詢 */
section('紫微運限：大限、流年查詢與宮位對應');
{
  let bad = 0, n = 0;
  for (let k = 0; k < 30; k++) {
    const { zw } = chartOf({ ...rndBirth(1900, 2090), clock: 'std', gender: k % 2 ? '男' : '女' });
    const c = zw.chart, birthY = c.rawDates.lunarDate.lunarYear;
    for (const p of c.palaces) {
      for (const age of [p.decadal.range[0], p.decadal.range[1]]) {
        const year = birthY + age - 1;
        const h = c.horoscope(`${year}-7-1`);
        n++;
        const yrZhi = PP.yearGZ(year)[1];
        if (h.decadal.index !== p.index || h.age.nominalAge !== age || h.yearly.heavenlyStem + h.yearly.earthlyBranch !== PP.yearGZ(year) || c.palaces[h.yearly.index].earthlyBranch !== yrZhi || h.yearly.palaceNames[h.yearly.index] !== '命宮' || h.decadal.palaceNames[p.index] !== '命宮' || h.decadal.mutagen.join() !== PP.SIHUA[p.decadal.heavenlyStem].join() || h.yearly.mutagen.join() !== PP.SIHUA[PP.yearGZ(year)[0]].join()) bad++;
      }
    }
  }
  ok(bad === 0, `${n} 次查詢中有 ${bad} 次不一致`);
  const a = chartOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 }).zw.chart, seen = {};
  for (let y = 1990; y < 2000; y++) { const h = a.horoscope(`${y}-7-1`); seen[h.yearly.heavenlyStem] = h.yearly.mutagen.join(); }
  ok(PP.GAN.every(g => seen[g] === PP.SIHUA[g].join()), '十干四化表與 iztro 一致');
}

finish();
