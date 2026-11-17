/* 紫微斗數的本命盤：用通行的安星公式獨立計算，對 iztro 排出的盤（正月初一、立春兩種年界都算）；
   流派設定換一種寫法排同一張盤，整張要相同；再查 iztro 的大限、流年查詢。
   執行：node test/engine/ziwei.test.js（約 1 分鐘） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { chartOf, md, zwFace } from '../helpers/charts.js';

const { rnd, pick, rndBirth } = seeded(2026111104);

const pal = br => md(br - 2); // 地支序（子=0）→ 宮位序（寅=0）
// 不一致的項目只印第一筆，最後統計各項的次數
const tally = () => { const bad = {}; return { bad, note: (k, msg) => { bad[k] = (bad[k] || 0) + 1; if (bad[k] === 1) console.log('   ', k, msg); } }; };

/* 安星公式。只寫口訣本身，不看引擎和 iztro 怎麼算 */
const JU = { 水: 2, 木: 3, 金: 4, 土: 5, 火: 6 }, JU_NAME = ['', '', '水二局', '木三局', '金四局', '土五局', '火六局'];
const LU = [2, 3, 5, 6, 5, 6, 8, 9, 11, 0];                                                   // 祿存：甲寅 乙卯 丙戊巳 丁己午 庚申 辛酉 壬亥 癸子
const KUI = [1, 0, 11, 11, 1, 0, 1, 6, 3, 3], YUE = [7, 8, 9, 9, 7, 8, 7, 2, 5, 5];           // 天魁天鉞：甲戊庚牛羊 乙己鼠猴 丙丁豬雞 辛馬虎 壬癸兔蛇
const grp = yb => ['申子辰', '寅午戌', '巳酉丑', '亥卯未'].findIndex(g => g.includes(PP.ZHI[yb])); // 生年支的三合局
const MA = [2, 8, 11, 5], HUO = [2, 1, 3, 9], LING = [10, 3, 10, 10];                         // 天馬；火星、鈴星起子時的宮
const SOUL = ['貪狼', '巨門', '祿存', '文曲', '廉貞', '武曲', '破軍', '武曲', '廉貞', '文曲', '祿存', '巨門']; // 命主：依命宮地支
const BODY = ['火星', '天相', '天梁', '天同', '文昌', '天機', '火星', '天相', '天梁', '天同', '文昌', '天機']; // 身主：依生年地支
const CS_AT = { 2: 8, 3: 11, 4: 5, 5: 8, 6: 2 };                                              // 長生：水土申、木亥、金巳、火寅
// 照生年支安的雜曜（依三合局的四顆、依年支的孤寡破碎蜚廉）
const HUAGAI = [4, 10, 1, 7], XIANCHI = [9, 3, 6, 0];                                         // 華蓋在三合的墓庫、咸池在沐浴
const GUCHEN = [2, 2, 5, 5, 5, 8, 8, 8, 11, 11, 11, 2], GUASU = [10, 10, 1, 1, 1, 4, 4, 4, 7, 7, 7, 10]; // 亥子丑年寅戌、寅卯辰年巳丑、巳午未年申辰、申酉戌年亥未
const POSUI = [5, 1, 9], FEILIAN = [8, 9, 10, 5, 6, 7, 2, 3, 4, 11, 0, 1];                    // 破碎：子午卯酉巳、寅申巳亥酉、辰戌丑未丑；蜚廉：子丑寅年申酉戌、卯辰巳年巳午未、午未申年寅卯辰、酉戌亥年亥子丑
// 照生年干安的雜曜
const TIANGUAN = [7, 4, 5, 2, 3, 9, 11, 9, 10, 6], TIANFU = [9, 8, 0, 11, 3, 2, 6, 5, 6, 5], TIANCHU = [5, 6, 0, 5, 6, 8, 2, 6, 9, 11];
const JIEKONG = [[8, 9], [6, 7], [4, 5], [2, 3], [0, 1]];                                     // 截路空亡：甲己申酉、乙庚午未、丙辛辰巳、丁壬寅卯、戊癸子丑
// 歲前十二神從生年支起歲建、將前十二神從三合局的帝旺位起將星，都順行
const SUI12 = ['歲建', '晦氣', '喪門', '貫索', '官符', '小耗', '大耗', '龍德', '白虎', '天德', '弔客', '病符'];
const JIANG12 = ['將星', '攀鞍', '歲驛', '息神', '華蓋', '劫煞', '災煞', '天煞', '指背', '咸池', '月煞', '亡神'];
const JIANG_AT = [0, 6, 9, 3], XIAO_AT = [10, 4, 7, 1];                                       // 將星：申子辰子、寅午戌午、巳酉丑酉、亥卯未卯；小限一歲：申子辰戌、寅午戌辰、巳酉丑未、亥卯未丑
// 那一個公曆年的立春在哪一天（YYYY-MM-DD）。六月一日所在的農曆年，節氣表裡的立春就是當年二月初的那一個
const lichunDay = y => Solar.fromYmd(y, 6, 1).getLunar().getJieQiTable()['立春'].toYmd();

/* 排一張盤，用上面的公式逐項核對。生年自己定：年界是正月初一就是農曆年；年界是立春，起盤日到了當年的立春日（含）算當年、還沒到算前一年。
   除了主星、輔星、十二神，也核對照生年安的雜曜、歲前與將前十二神、小限、生年四化，以及引擎回報的生年。
   回傳排出來的盤，給呼叫的人接著用 */
function verify(o, note) {
  const male = o.gender === '男', R = chartOf(o), { zw, rt } = R;
  const c = zw.chart, P = c.palaces, [uy, um, ud] = zw.dateUsed.split('-').map(Number);
  const lu = Solar.fromYmd(uy, um, ud).getLunar(), day = lu.getDay();
  const mon = Math.abs(lu.getMonth()) + (lu.getMonth() < 0 && day > 15 ? 1 : 0);              // 閏月十五日後算下月
  const year = o.zwYear === 'lichun' ? (zw.dateUsed >= lichunDay(uy) ? uy : uy - 1) : lu.getYear();
  const hb = rt.hourIndex, ys = (year - 4) % 10, yb = (year - 4) % 12;                              // 生年的天干序、地支序
  const ming = md(mon - 1 - hb), shen = md(mon - 1 + hb);                                     // 寅起正月順數到生月，逆數生時為命宮、順數為身宮
  const mingGan = PP.GAN[((ys % 5) * 2 + 2 + ming) % 10], mingZhi = PP.ZHI[(ming + 2) % 12];  // 五虎遁定宮干
  const ju = JU[PP.nayin(mingGan + mingZhi).slice(-1)];                                       // 命宮干支納音定局
  const q = Math.ceil(day / ju), r = q * ju - day;
  const z = md((r % 2 === 0 ? q + r : q - r) - 1), t = md(12 - z), g = grp(yb), lc = LU[ys];  // 紫微；天府與紫微以寅申為軸對稱
  const fwd = (ys % 2 === 0) === male, dir = fwd ? 1 : -1;                                    // 陽男陰女順行
  const tag = `${uy}-${um}-${ud} ${hb}支 ${male ? '男' : '女'} 年${PP.GAN[ys]}${PP.ZHI[yb]} 農${mon}月${day}`;
  const eqq = (name, a, w) => { if (JSON.stringify(a) !== JSON.stringify(w)) note(name, `${tag}：盤上 ${JSON.stringify(a)}，公式 ${JSON.stringify(w)}`); };
  eqq('引擎回報的生年', [zw.yearGZ, zw.birthYear], [PP.GAN[ys] + PP.ZHI[yb], year]);
  eqq('命宮', P.findIndex(p => p.name === '命宮'), ming); eqq('身宮', P.findIndex(p => p.isBodyPalace), shen);
  eqq('命宮干支', P[ming].heavenlyStem + P[ming].earthlyBranch, mingGan + mingZhi); eqq('五行局', c.fiveElementsClass, JU_NAME[ju]);
  const want = {
    紫微: z, 天機: md(z - 1), 太陽: md(z - 3), 武曲: md(z - 4), 天同: md(z - 5), 廉貞: md(z - 8),
    天府: t, 太陰: md(t + 1), 貪狼: md(t + 2), 巨門: md(t + 3), 天相: md(t + 4), 天梁: md(t + 5), 七殺: md(t + 6), 破軍: md(t + 10),
    左輔: pal(md(4 + mon - 1)), 右弼: pal(md(10 - (mon - 1))), 文昌: pal(md(10 - hb)), 文曲: pal(md(4 + hb)), 地劫: pal(md(11 + hb)), 地空: pal(md(11 - hb)),
    祿存: pal(lc), 擎羊: pal(md(lc + 1)), 陀羅: pal(md(lc - 1)), 天魁: pal(KUI[ys]), 天鉞: pal(YUE[ys]), 天馬: pal(MA[g]), 火星: pal(md(HUO[g] + hb)), 鈴星: pal(md(LING[g] + hb)),
  };
  const got = {}, hua = {}; P.forEach(p => p.majorStars.concat(p.minorStars).forEach(s => { got[s.name] = p.index; if (s.mutagen) hua[s.name] = s.mutagen; }));
  eqq('主輔星總數', Object.keys(got).length, 28);
  for (const name of Object.keys(want)) eqq(name, got[name], want[name]);
  eqq('生年四化', [PP.SIHUA[PP.GAN[ys]].map(name => hua[name]).join(''), Object.keys(hua).length], ['祿權科忌', 4]);                              // 年干的四顆星各化祿權科忌，別的星不帶生年四化
  eqq('命主', c.soul, SOUL[PP.ZHI.indexOf(mingZhi)]); eqq('身主', c.body, BODY[yb]);
  for (let i = 0; i < 12; i++) eqq('大限', P[md(ming + dir * i)].decadal.range, [ju + 10 * i, ju + 10 * i + 9]);
  const csAt = P.findIndex(p => p.changsheng12 === '長生'), bsAt = P.findIndex(p => p.boshi12 === '博士');
  eqq('長生十二神', [csAt, P.findIndex(p => p.changsheng12 === '沐浴')], [pal(CS_AT[ju]), md(csAt + dir)]);
  eqq('博士十二神', [bsAt, P.findIndex(p => p.boshi12 === '力士')], [pal(lc), md(bsAt + dir)]);
  // 照生年安的雜曜
  const adj = {}; P.forEach(p => p.adjectiveStars.forEach(s => { adj[s.name] = p.index; }));
  const wantAdj = {
    紅鸞: pal(md(3 - yb)), 天喜: pal(md(9 - yb)), 天哭: pal(md(6 - yb)), 天虛: pal(md(6 + yb)), 龍池: pal(md(4 + yb)), 鳳閣: pal(md(10 - yb)),   // 卯起子年逆數是紅鸞，對宮天喜；午起子年，逆數天哭、順數天虛；辰起順數龍池、戌起逆數鳳閣
    天德: pal(md(9 + yb)), 月德: pal(md(5 + yb)), 天空: pal(md(yb + 1)), 年解: pal(md(10 - yb)),                                               // 酉起子年順數天德、巳起月德；天空在生年支的下一位；戌起子年逆數年解
    華蓋: pal(HUAGAI[g]), 咸池: pal(XIANCHI[g]), 孤辰: pal(GUCHEN[yb]), 寡宿: pal(GUASU[yb]), 破碎: pal(POSUI[yb % 3]), 蜚廉: pal(FEILIAN[yb]),
    天才: md(ming + yb), 天壽: md(shen + yb),                                                                                                   // 命宮起子年順數到生年支是天才，身宮起是天壽
    天官: pal(TIANGUAN[ys]), 天福: pal(TIANFU[ys]), 天廚: pal(TIANCHU[ys]),
  };
  for (const name of Object.keys(wantAdj)) eqq(name, adj[name], wantAdj[name]);
  eqq('截路與空亡', [adj.截路, adj.空亡].sort(), JIEKONG[ys % 5].map(pal).sort());
  eqq('旬空', PP.xunKong(PP.GAN[ys] + PP.ZHI[yb]).includes(PP.ZHI[(adj.旬空 + 2) % 12]), true);                                                // 落在生年干支那一旬空亡的兩支之一
  // 歲前、將前十二神，小限
  eqq('歲前十二神', P.map(p => p.suiqian12), P.map((p, i) => SUI12[md(i - pal(yb))]));
  eqq('將前十二神', P.map(p => p.jiangqian12), P.map((p, i) => JIANG12[md(i - pal(JIANG_AT[g]))]));
  for (const age of [1, 2, 13, 60]) eqq('小限', P.findIndex(p => p.ages.includes(age)), md(pal(XIAO_AT[g]) + (male ? 1 : -1) * (age - 1)));   // 男順女逆，一年一宮
  return R;
}

section('紫微安星獨立驗算（2,000 組，正月初一為界）：命身宮、五行局、十四主星、十四輔星、生年四化、命主身主、大限、長生與博士十二神、照生年安的雜曜、歲前與將前十二神、小限');
{
  const { bad, note } = tally();
  let lateZi = 0;
  for (let k = 0; k < 2000; k++) {
    const { rt } = verify({ ...rndBirth(), clock: 'std', gender: k % 2 === 1 ? '男' : '女', ziRule: k % 4 < 2 ? 'next' : 'same' }, note);
    if (rt.lateZi) lateZi++;
  }
  eq(bad, {}, '不一致的項目與次數');
  ok(lateZi > 50, `抽樣含晚子時 ${lateZi} 組`);
}

/* 比整張盤用的：引擎回報的欄位、盤面（宮位、星曜與亮度、四化、十二神、大限、小限）、幾層運限。
   兩張盤應該相同的時候，這一串字就要一模一樣 */
const whole = zw => JSON.stringify([zw.yearGZ, zw.birthYear, zw.month, zw.hourIndex, zw.sihua, zwFace(zw.chart), PP.zwSpans(zw),
  PP.zwLiuNian(zw, zw.birthYear + 40), PP.zwLiuYue(zw, zw.birthYear + 40), PP.zwXiaoXian(zw, 41)]);
// 兩張盤哪幾類欄位不同（印出來好找原因）
const differs = (A, B) => {
  const a = A.chart.palaces, b = B.chart.palaces, kinds = new Set();
  const stars = list => JSON.stringify(list.map(s => [s.name, s.brightness, s.mutagen]));
  a.forEach((p, i) => {
    const q = b[i];
    if (p.name !== q.name || p.heavenlyStem !== q.heavenlyStem) kinds.add('宮名或宮干');
    if (stars(p.majorStars) !== stars(q.majorStars) || stars(p.minorStars) !== stars(q.minorStars)) kinds.add('主星或輔星');
    if (stars(p.adjectiveStars) !== stars(q.adjectiveStars)) kinds.add('雜曜');
    if (p.changsheng12 !== q.changsheng12 || p.boshi12 !== q.boshi12) kinds.add('長生或博士十二神');
    if (p.suiqian12 !== q.suiqian12 || p.jiangqian12 !== q.jiangqian12) kinds.add('歲前或將前十二神');
    if (JSON.stringify([p.decadal, p.ages]) !== JSON.stringify([q.decadal, q.ages])) kinds.add('大限或小限');
  });
  return [...kinds].join('、') || '其他欄位';
};
const lunarInput = (ly, lm, ld, leap, o, extra = {}) => ({ calendar: 'lunar', ly, lm, ld, leap, h: o.h, mi: o.mi, clock: 'std', gender: o.gender, ziRule: o.ziRule, ...extra });
const monthDays = (ly, lm) => LunarYear.fromYear(ly).getMonthsInYear().find(m => m.getMonth() === lm)?.getDayCount() || 0; // 那一年那個農曆月有幾天；閏月的月份給負數

/* 年界設成立春：生在立春和正月初一之間的人，生年換成前一年或後一年。
   一、用公式核對（生年照立春日定），照生年安的每一樣都要跟著立春年；
   二、另找一個人：農曆同月同日同時辰、生年正好是那個立春年，用預設的正月初一年界排。兩張盤要完全相同。
   iztro 把年界拆成兩個設定，各管一部分的星；只設一個，就會排出半張照立春年、半張照農曆年的盤，這裡兩種檢查都會抓到 */
section('年界設成立春：生在立春和正月初一之間的人，整張盤都照立春年（公式核對，再和「農曆同月同日、生年就是那一年」的人比整張盤）');
{
  const { bad, note } = tally();
  let n = 0, plus = 0, minus = 0, paired = 0, lateZi = 0, tried = 0;
  while (n < 160 && tried++ < 5000) {
    const y = rnd(1901, 2099), m = pick([1, 2]), d = m === 1 ? rnd(20, 31) : rnd(1, 21);
    const o = { y, m, d, h: n % 8 === 0 ? 23 : rnd(0, 22), mi: rnd(0, 59), clock: 'std', gender: pick(['男', '女']), ziRule: n % 3 ? 'next' : 'same', zwYear: 'lichun' };
    // 先用曆法挑出兩種年界生年不同的日子，不必每個都排盤。晚子時換日的看次日
    const used = PP.fromMs(PP.toMs({ y, m, d, h: 12, mi: 0 }) + (o.h === 23 && o.ziRule === 'next' ? 864e5 : 0)), lu = Solar.fromYmd(used.y, used.m, used.d).getLunar();
    if (lu.getYearInGanZhi() === lu.getYearInGanZhiByLiChun()) continue;
    n++;
    const { zw, rt } = verify(o, note), tag = `${zw.dateUsed} ${rt.hourIndex}支 ${o.gender}`;
    if (rt.lateZi) lateZi++;
    if (zw.birthYear > lu.getYear()) plus++; else minus++;
    if (zw.birthYear === lu.getYear()) note('這一天兩種年界的生年應該不同', tag);
    // 本命的歲前、將前十二神，和引擎排「生年那一年的流年」的歲前、將前是同一套
    const L = PP.zwLiuNian(zw, zw.birthYear);
    if (!L || JSON.stringify([L.sui12, L.jiang12]) !== JSON.stringify([zw.chart.palaces.map(p => p.suiqian12), zw.chart.palaces.map(p => p.jiangqian12)])) note('本命的歲前將前和生年那一年的流年歲前將前相同', tag);
    // 換一個人來比。閏月出生的、那一年同一個月沒有這一天的，找不到這樣的人，只做公式核對
    const lm = lu.getMonth(), ld = lu.getDay();
    if (lm < 0 || monthDays(zw.birthYear, lm) < ld) continue;
    paired++;
    const B = chartOf(lunarInput(zw.birthYear, lm, ld, false, { ...o, h: zw.rolled ? 0 : o.h })).zw;
    if (B.yearGZ !== zw.yearGZ || B.opts.year !== 'lunar') note('拿來比的那張盤，生年要是同一年、年界是正月初一', tag);
    if (whole(zw) !== whole(B)) note(`整張盤和「農曆 ${zw.birthYear} 年同月同日」的人相同`, `${tag}：不同的是${differs(zw, B)}`);
  }
  eq(bad, {}, `${n} 組，不一致的項目與次數`);
  ok(n === 160 && plus > 30 && minus > 30 && paired > 130 && lateZi > 10, `立春先到（生年往後一年）${plus} 組、正月初一先到（往前一年）${minus} 組；其中 ${paired} 組找得到人比整張盤，晚子時 ${lateZi} 組`);
  // 立春日的定點：2021 年立春在 2 月 3 日（深夜交節），春節 2 月 12 日
  const one = (o, year) => { const z = chartOf({ h: 10, mi: 0, ...o, zwYear: year }).zw; return [z.yearGZ, z.birthYear]; };
  eq([lichunDay(1984), lichunDay(2021)], ['1984-02-04', '2021-02-03'], '立春日：1984 年 2 月 4 日、2021 年 2 月 3 日');
  eq([one({ y: 2021, m: 2, d: 2 }, 'lichun'), one({ y: 2021, m: 2, d: 3 }, 'lichun'), one({ y: 2021, m: 2, d: 3 }, 'lunar')], [['庚子', 2020], ['辛丑', 2021], ['庚子', 2020]], '2021-02-02 還是庚子年，02-03 立春當天起算辛丑年；照正月初一仍是庚子年');
}

/* 閏月出生：兩種算法各自排出來的盤，要和「同一年、算成的那個月、同一日同一時辰」出生的人完全相同。
   月中分界的下半月算下個月，其餘算本月 */
section('閏月出生：整張盤和「生在算成的那個月、同日同時辰」的人相同（月中分界與算本月兩種算法）');
{
  const { bad, note } = tally();
  let n = 0, upper = 0, lower = 0, cur = 0;
  for (let k = 0; k < 80; k++) {
    let ly; do { ly = rnd(1900, 2099); } while (!LunarYear.fromYear(ly).getLeapMonth());
    const lm = LunarYear.fromYear(ly).getLeapMonth(), ld = k % 2 ? rnd(16, monthDays(ly, -lm)) : rnd(1, 15);
    const o = { h: rnd(0, 22), mi: rnd(0, 59), gender: pick(['男', '女']), ziRule: 'next' }, tag = `${ly} 年閏 ${lm} 月 ${ld} 日 ${o.h} 時 ${o.gender}`;
    n++;
    // 算本月：和本月同一日出生的人相同
    if (monthDays(ly, lm) >= ld) {
      cur++;
      // 拿來比的人不是閏月生的，閏月算法不動他的本命盤；設成同一種，流月遇到閏月的分段才會一樣
      const A = chartOf(lunarInput(ly, lm, ld, true, o, { zwLeap: 'current' })).zw, B = chartOf(lunarInput(ly, lm, ld, false, o, { zwLeap: 'current' })).zw;
      if (A.month !== lm || whole(A) !== whole(B)) note('算本月：和本月同日出生的人相同', `${tag}：不同的是${differs(A, B)}`);
    }
    // 月中分界：上半月同本月，下半月同下個月
    const to = ld <= 15 ? lm : lm + 1;
    if (to > 12 || monthDays(ly, to) < ld) continue;
    if (ld <= 15) upper++; else lower++;
    const A = chartOf(lunarInput(ly, lm, ld, true, o)).zw, B = chartOf(lunarInput(ly, to, ld, false, o)).zw;
    if (A.month !== to || whole(A) !== whole(B)) note(`月中分界：${ld <= 15 ? '上半月和本月' : '下半月和下個月'}同日出生的人相同`, `${tag}：不同的是${differs(A, B)}`);
  }
  eq(bad, {}, `${n} 組，不一致的項目與次數`);
  ok(upper > 30 && lower > 25 && cur > 60, `月中分界上半月 ${upper} 組、下半月 ${lower} 組，算本月 ${cur} 組`);
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
