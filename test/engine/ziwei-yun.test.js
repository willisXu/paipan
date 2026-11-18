/* 紫微運限與流派設定：引擎自己推的大限、童限、小限、流年、流月、流日、流時（宮位、干支、宮名、四化、流曜、十二神），
   一邊對 iztro 的運限查詢，一邊對照口訣寫的獨立表格；再驗四化版本、年界、閏月算法三個設定。
   執行：node test/engine/ziwei-yun.test.js（約半分鐘，時間花在 iztro 的運限查詢上） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { chartOf, md, jdn, gzOf, zwJSON } from '../helpers/charts.js';

const { rnd, pick, rndBirth } = seeded(2026111701);
const { GAN, ZHI } = PP;
const pal = br => md(br - 2); // 地支序（子 0）→ 宮位序號（寅 0）
const pad2 = n => String(n).padStart(2, '0');
const iso = s => `${s.getYear()}-${pad2(s.getMonth())}-${pad2(s.getDay())}`;
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`; };
const starNames = stars => stars.map(list => list.map(s => s.name));
// 不一致的項目只印第一筆，最後統計各項的次數
const tally = () => { const bad = {}; return { bad, note(k, msg) { bad[k] = (bad[k] || 0) + 1; if (bad[k] === 1) console.log('   ', k, msg); } }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 一段運限和 iztro 給的那一項比：命宮所在、干支、十二宮名、四化、流曜
function diffLayer(L, it, withStars = true) {
  const out = [];
  if (!L) return ['引擎沒有排出來'];
  if (L.index !== it.index) out.push(`宮位 ${L.index}≠${it.index}`);
  if (L.gz !== it.heavenlyStem + it.earthlyBranch) out.push(`干支 ${L.gz}≠${it.heavenlyStem}${it.earthlyBranch}`);
  if (!same(L.names, it.palaceNames)) out.push('宮名');
  if (!same(L.hua, it.mutagen)) out.push(`四化 ${L.hua}≠${it.mutagen}`);
  if (withStars && !same(L.stars, starNames(it.stars))) out.push(`流曜 ${JSON.stringify(L.stars)}≠${JSON.stringify(starNames(it.stars))}`);
  return out;
}

section('運限對 iztro（預設設定，160 張盤、每張 12 個日期）：大限或童限、小限、流年與歲前將前、流月、流日、流時');
{
  const { bad, note } = tally();
  let n = 0, child = 0, leapDates = 0, leapBirths = 0, late = 0;
  const hourSeen = Array(13).fill(0); // 流時十三格各比了幾次
  for (let k = 0; k < 160; k++) {
    let b = rndBirth(1900, 2100);
    if (k % 8 === 0) { // 每八張有一張生在閏月，上半月、下半月都要抽到
      let ly; do { ly = rnd(1900, 2099); } while (!LunarYear.fromYear(ly).getLeapMonth());
      const s = Lunar.fromYmd(ly, -LunarYear.fromYear(ly).getLeapMonth(), k % 16 === 0 ? rnd(1, 15) : rnd(16, 29)).getSolar();
      b = { ...b, y: s.getYear(), m: s.getMonth(), d: s.getDay() }; leapBirths++;
    }
    const { zw, rt } = chartOf({ ...b, clock: 'std', gender: k % 2 ? '男' : '女', ziRule: k % 3 ? 'next' : 'same' });
    if (rt.lateZi) late++;
    const c = zw.chart, lunarBirth = c.rawDates.lunarDate.lunarYear, first = Math.min(...c.palaces.map(p => p.decadal.range[0]));
    const tag = `${zw.dateUsed} ${rt.hourIndex}支 ${k % 2 ? '男' : '女'}`;
    eqq('生年就是農曆年', zw.birthYear, lunarBirth); eqq('生年干支', zw.yearGZ, PP.yearGZ(lunarBirth));
    for (let j = 0; j < 12; j++) {
      // 目標日期：多半隨機，另外刻意抽童限那幾年、閏月的上下半月、出生那一年
      let ly = lunarBirth + (j === 0 ? 0 : j === 1 ? rnd(0, first - 1) : rnd(0, 105)), date;
      if (j === 2 || j === 3) {
        do { ly = lunarBirth + rnd(0, 105); } while (!LunarYear.fromYear(ly).getLeapMonth());
        date = iso(Lunar.fromYmd(ly, -LunarYear.fromYear(ly).getLeapMonth(), j === 2 ? rnd(1, 15) : rnd(16, 29)).getSolar()); leapDates++;
      } else {
        const months = LunarYear.fromYear(ly).getMonthsInYear(), lm = pick(months);
        date = iso(Lunar.fromYmd(ly, lm.getMonth(), rnd(1, lm.getDayCount())).getSolar());
      }
      const h = c.horoscope(date, 6), age = ly - zw.birthYear + 1, where = `${tag} → ${date}（${age} 歲）`;
      n++;
      eqq('虛歲', h.age.nominalAge, age);
      // 大限或童限
      const isChild = age < first;
      if (isChild) child++;
      const dec = isChild ? PP.zwTongXian(zw, age) : h.decadal.index >= 0 ? PP.zwDaXian(zw, h.decadal.index) : null;
      if (h.decadal.index >= 0) {
        const d = diffLayer(dec, h.decadal); if (d.length) note(isChild ? '童限' : '大限', `${where}：${d.join('；')}`);
        if (!isChild) eqq('大限歲數', [dec.ages[0] <= age && age <= dec.ages[1], dec.child], [true, false]);
        else eqq('童限', [dec.child, dec.ages], [true, [age, age]]);
        eqq('另一種查法為空', isChild ? PP.zwSpans(zw).find(s => !s.child && s.ages[0] <= age && age <= s.ages[1]) : PP.zwTongXian(zw, age), isChild ? undefined : null);
      }
      // 小限（沒有流曜）
      { const d = diffLayer(PP.zwXiaoXian(zw, age), h.age, false); if (h.age.index >= 0 && d.length) note('小限', `${where}：${d.join('；')}`); }
      if (h.age.index >= 0) eqq('小限沒有流曜', PP.zwXiaoXian(zw, age)?.stars.flat().length, 0);
      // 流年
      const yr = PP.zwLiuNian(zw, ly);
      { const d = diffLayer(yr, h.yearly); if (d.length) note('流年', `${where}：${d.join('；')}`); }
      eqq('流年歲前十二神', yr?.sui12, h.yearly.yearlyDecStar.suiqian12); eqq('流年將前十二神', yr?.jiang12, h.yearly.yearlyDecStar.jiangqian12);
      eqq('流年的歲數', [yr?.year, yr?.age], [ly, age]);
      // 流月：找出涵蓋這一天的那一段
      const mo = PP.zwLiuYue(zw, ly).find(m => m.from <= date && date <= m.to);
      { const d = diffLayer(mo, h.monthly); if (d.length) note('流月', `${where}：${d.join('；')}`); }
      // 流日
      const day = mo && PP.zwLiuRi(zw, mo).find(x => x.date === date);
      { const d = diffLayer(day, h.daily); if (d.length) note('流日', `${where}：${d.join('；')}`); }
      // 流時：每三個日期查一次（iztro 一次查詢要十毫秒），十三格輪流查，早子時、晚子時都輪得到
      if (j % 3 === 0 && day) {
        const ti = (k + j / 3) % 13, hours = PP.zwLiuShi(zw, day);
        const d = diffLayer(hours[ti], c.horoscope(date, ti).hourly); if (d.length) note('流時', `${where} 第 ${ti} 格：${d.join('；')}`);
        eqq('流時共十三格', hours.length, 13);
        hourSeen[ti]++;
      }
      function eqq(name, a, w) { if (!same(a, w)) note(name, `${where}：引擎 ${JSON.stringify(a)}，iztro ${JSON.stringify(w)}`); }
    }
    function eqq(name, a, w) { if (!same(a, w)) note(name, `${tag}：${JSON.stringify(a)} ≠ ${JSON.stringify(w)}`); }
  }
  eq(bad, {}, `${n} 次查詢，不一致的項目與次數`);
  ok(child > 100 && leapDates === 320 && leapBirths === 20 && late > 3, `抽樣含童限 ${child} 次、閏月裡的日期 ${leapDates} 次、閏月出生 ${leapBirths} 張、晚子時 ${late} 張`);
  ok(hourSeen.every(c => c >= 40) && hourSeen.reduce((a, b) => a + b) === 640, `流時查了 640 次，十三格每一格至少 ${Math.min(...hourSeen)} 次`);
}

section('流曜與十二神對口訣（六十甲子全部）');
{
  // 和引擎不同的寫法：照口訣把「哪個天干、地支在哪裡」寫成字串來查
  const at = (table, key) => ZHI.indexOf(table[table.indexOf(key) + 1]); // 「甲寅乙卯…」這種字串：找到天干，下一個字是所在地支
  const LU = '甲寅乙卯丙巳丁午戊巳己午庚申辛酉壬亥癸子';                     // 甲祿在寅、乙祿在卯、丙戊祿在巳、丁己祿在午、庚祿在申、辛祿在酉、壬祿在亥、癸祿在子
  const KUI = '甲丑戊丑庚丑乙子己子丙亥丁亥壬卯癸卯辛午', YUE = '甲未戊未庚未乙申己申丙酉丁酉壬巳癸巳辛寅'; // 甲戊庚牛羊，乙己鼠猴鄉，丙丁豬雞位，壬癸兔蛇藏，六辛逢馬虎
  const CHANG = '甲巳乙午丙申丁酉戊申己酉庚亥辛子壬寅癸卯';                   // 流昌起巳位，甲乙順流去，不用四墓宮（丙戊同、丁己同）
  const QU = '甲酉乙申丙午丁巳戊午己巳庚卯辛寅壬子癸亥';                      // 流曲起酉位，甲乙逆行蹤，亦不用四墓
  const san = z => ['申子辰', '寅午戌', '巳酉丑', '亥卯未'].find(g => g.includes(z));
  const MA = { 申子辰: '寅', 寅午戌: '申', 巳酉丑: '亥', 亥卯未: '巳' };       // 天馬在三合局長生位的對宮
  const JIANG = { 申子辰: '子', 寅午戌: '午', 巳酉丑: '酉', 亥卯未: '卯' };    // 將星在三合局的帝旺位
  const SUI = '歲建 晦氣 喪門 貫索 官符 小耗 大耗 龍德 白虎 天德 弔客 病符'.split(' ');
  const JQ = '將星 攀鞍 歲驛 息神 華蓋 劫煞 災煞 天煞 指背 咸池 月煞 亡神'.split(' ');
  const { zw } = chartOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 });
  let bad = 0; const badList = [];
  for (let year = 1984; year < 2044; year++) {
    const L = PP.zwLiuNian(zw, year), [g, z] = PP.yearGZ(year), b = ZHI.indexOf(z);
    const want = Array.from({ length: 12 }, () => []);
    const put = (branch, name) => want[pal(md(branch))].push(name);
    put(10 - b, '年解');                                                       // 解神從戌上起子，逆數到太歲
    put(at(KUI, g), '流魁'); put(at(YUE, g), '流鉞'); put(at(CHANG, g), '流昌'); put(at(QU, g), '流曲');
    put(at(LU, g), '流祿'); put(at(LU, g) + 1, '流羊'); put(at(LU, g) - 1, '流陀'); // 祿前擎羊、祿後陀羅
    put(ZHI.indexOf(MA[san(z)]), '流馬');
    put(3 - b, '流鸞'); put(3 - b + 6, '流喜');                                // 紅鸞卯上起子逆數，天喜在對宮
    const sui = [], jq = [];
    SUI.forEach((name, k) => { sui[pal(md(b + k))] = name; });
    JQ.forEach((name, k) => { jq[pal(md(ZHI.indexOf(JIANG[san(z)]) + k))] = name; });
    if (!same(L.stars, want) || !same(L.sui12, sui) || !same(L.jiang12, jq) || L.index !== pal(b) || L.gz !== g + z) { bad++; badList.push(g + z); }
  }
  ok(bad === 0, `流年六十個干支的流曜、歲前、將前都和口訣相同${bad ? `；不同的：${badList.join('、')}` : ''}`);
  // 其他層用同一套安法，只是名字的頭一個字不同、沒有年解
  const strip = stars => stars.map(list => list.filter(s => s !== '年解').map(s => s.slice(1)));
  const yr = PP.zwLiuNian(zw, 2026), mos = PP.zwLiuYue(zw, 2032);
  const m5 = mos.find(m => m.gz === yr.gz); // 2032 壬子年的五月是丙午，和 2026 丙午年同干支
  ok(m5 && m5.month === 5 && same(strip(m5.stars), strip(yr.stars)), '同干支的月和年，流曜位置相同');
  ok(mos.every(m => m.stars.flat().every(s => s[0] === '月') && m.stars.flat().length === 10), '流月的流曜十顆，名字都以「月」開頭');
  const days = PP.zwLiuRi(zw, mos[3]);
  ok(days.every(d => d.stars.flat().every(s => s[0] === '日') && d.stars.flat().length === 10), '流日的流曜十顆，名字都以「日」開頭');
  const dx = PP.zwDaXian(zw, 6);
  ok(dx.stars.flat().every(s => s[0] === '運') && dx.stars.flat().length === 10 && yr.stars.flat().length === 11, '大限的流曜十顆、以「運」開頭；流年多一顆年解');
  const hrs = days.flatMap(d => PP.zwLiuShi(zw, d));
  ok(hrs.length === days.length * 13 && hrs.every(h => h.stars.flat().every(s => s[0] === '時') && h.stars.flat().length === 10), '流時的流曜十顆，名字都以「時」開頭');
  const h5 = hrs.find(h => h.gz === yr.gz); // 丙午時（丙辛日的午時）和 2026 丙午年同干支
  ok(h5 && h5.label === '午時' && same(strip(h5.stars), strip(yr.stars)), '同干支的時辰和年，流曜位置相同');
}

// 頁面列得到的流年：最早是 1900 年初、過年前出生的人的生年 1899；最晚是 2100 年出生、火六局的第十個大限，到 2204 年
section('流月與流日的曆法（1899 到 2205 年每一年）：月份接得起來、日期換回農曆相同、月干照五虎遁、日干支照儒略日');
{
  const { zw } = chartOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 });
  const TIGER = { 甲: '丙', 己: '丙', 乙: '戊', 庚: '戊', 丙: '庚', 辛: '庚', 丁: '壬', 壬: '壬', 戊: '甲', 癸: '甲' }; // 甲己之年丙作首，乙庚之歲戊為頭，丙辛必定尋庚起，丁壬壬位順行流，戊癸甲寅好追求
  const { bad, note } = tally();
  let months = 0, days = 0, split = 0;
  for (let year = 1899; year <= 2205; year++) {
    const list = PP.zwLiuYue(zw, year), leapMonth = LunarYear.fromYear(year).getLeapMonth();
    months += list.length;
    if (list.length !== (leapMonth ? 14 : 12)) note('段數', `${year} 年 ${list.length} 段`);
    if (list[0].from !== iso(Lunar.fromYmd(year, 1, 1).getSolar())) note('正月初一', `${year}：${list[0].from}`);
    if (addDays(list[list.length - 1].to, 1) !== iso(Lunar.fromYmd(year + 1, 1, 1).getSolar())) note('年底', `${year}：${list[list.length - 1].to}`);
    const stem0 = GAN.indexOf(TIGER[PP.yearGZ(year)[0]]);
    list.forEach((m, k) => {
      if (k > 0 && addDays(list[k - 1].to, 1) !== m.from) note('相鄰兩段沒有接上', `${year} ${m.label}`);
      if (m.k !== k || m.year !== year) note('序號', `${year} ${m.label}`);
      // 月干支：閏月上半跟本月、下半跟下個月；地支從寅起
      const seq = m.month + (m.part === '下半' ? 1 : 0);
      if (m.gz !== GAN[(stem0 + seq - 1) % 10] + ZHI[(seq + 1) % 12]) note('月干支', `${year} ${m.label} ${m.gz}`);
      if (m.label !== `${m.leap ? '閏' : ''}${['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][m.month - 1]}月${m.part}`) note('月份寫法', `${year} ${m.label}`);
      if (m.part) split++;
      if (m.index !== md(list[0].index + seq - 1)) note('每月順行一宮', `${year} ${m.label}`);
      // 只有一部分的年份逐日檢查（每一天都換回農曆要花時間）
      if (year % 7 === 0 || leapMonth) {
        const ds = PP.zwLiuRi(zw, m);
        days += ds.length;
        if (ds.length !== m.days[1] - m.days[0] + 1 || ds[0].date !== m.from || ds[ds.length - 1].date !== m.to) note('日數與頭尾', `${year} ${m.label}`);
        ds.forEach((d, i) => {
          const [y, mm, dd] = d.date.split('-').map(Number), lu = Solar.fromYmd(y, mm, dd).getLunar();
          if (lu.getYear() !== year || lu.getMonth() !== (m.leap ? -m.month : m.month) || lu.getDay() !== d.day) note('換回農曆不是同一天', `${d.date} ${m.label}${d.label}`);
          if (d.gz !== lu.getDayInGanZhi() || d.gz !== gzOf(jdn(y, mm, dd) + 49)) note('日干支', `${d.date} ${d.gz}`);
          if (d.index !== md(m.index + d.day - 1) || d.day !== m.days[0] + i) note('每日順行一宮', `${d.date}`);
        });
      }
    });
  }
  eq(bad, {}, `${months} 段流月、${days} 天流日，不一致的項目與次數`);
  ok(split > 200, `含拆成上下半的閏月 ${split} 段`);
  const names = PP.zwLiuRi(zw, PP.zwLiuYue(zw, 2026)[0]).map(d => d.label);
  eq([names[0], names[9], names[10], names[19], names[20], names[29]], ['初一', '初十', '十一', '二十', '廿一', '三十'], '農曆日的寫法');
}

section('流時：十三格的時干支對函式庫、命宮順行、鐘點首尾相接（500 天）');
{
  /* 引擎的寫法是五鼠遁加上「晚子時用次日的日干」。這裡不用口訣，直接問 lunar-javascript 那個鐘點的時柱：
     每一格問頭一分鐘和最後一分鐘（丑時是 01:00 和 02:59），兩個答案都要和引擎那一格的干支相同，等於同時核對了每一格的起訖鐘點。 */
  const { zw } = chartOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 });
  const LABELS = ['早子時', ...[...'丑寅卯辰巳午未申酉戌亥'].map(z => z + '時'), '晚子時'];
  const { bad, note } = tally();
  const stems = new Set();
  let n = 0;
  for (let i = 0; i < 500; i++) {
    const year = rnd(1984, 2090), mos = PP.zwLiuYue(zw, year), mo = pick(mos), days = PP.zwLiuRi(zw, mo), di = rnd(0, days.length - 1), day = days[di];
    const hours = PP.zwLiuShi(zw, day), [y, m, d] = day.date.split('-').map(Number), where = `${day.date} ${day.gz}日`;
    const libGZ = (h, mi) => (h >= 0 && h <= 23 ? Solar.fromYmdHms(y, m, d, h, mi, 0).getLunar().getTimeInGanZhi() : `（${h} 點不存在）`); // 鐘點寫錯時要報成不一致，不要讓函式庫丟例外
    if (!same(hours.map(h => h.label), LABELS) || !same(hours.map(h => h.k), [...Array(13).keys()])) note('十三格的名稱與序號', where);
    if (hours[0].from !== '00:00' || hours[12].to !== '24:00' || hours.some((h, k) => k && h.from !== hours[k - 1].to)) note('鐘點首尾相接', where);
    hours.forEach((h, k) => {
      n++;
      const [h0, h1] = [Number(h.from.slice(0, 2)), Number(h.to.slice(0, 2)) - 1]; // 這一格的頭一個小時與最後一個小時
      if (libGZ(h0, 0) !== h.gz || libGZ(h1, 59) !== h.gz) note('時干支', `${where} ${h.label}：引擎 ${h.gz}，函式庫 ${libGZ(h0, 0)}／${libGZ(h1, 59)}`);
      if (h.index !== md(day.index + (k % 12)) || h.names[h.index] !== '命宮' || !same(h.hua, zw.sihua[h.gz[0]])) note('命宮順行、宮名、四化', `${where} ${h.label}`);
      if (k % 12 === 0) stems.add(day.gz[0] + (k ? '晚' : '早') + h.gz);
    });
    // 晚子時的命宮和早子時相同；它的干支、四化、流曜就是次日早子時的（次日在同一個月裡時才比；次日的命宮則往前走了一宮）
    const next = days[di + 1] && PP.zwLiuShi(zw, days[di + 1])[0];
    if (hours[12].index !== hours[0].index) note('晚子時的命宮同早子時', where);
    if (next && (next.gz !== hours[12].gz || !same(next.hua, hours[12].hua) || !same(next.stars, hours[12].stars) || next.index !== md(hours[12].index + 1))) note('晚子時用次日子時的干支', where);
  }
  eq(bad, {}, `${n} 格（500 天 × 13），不一致的項目與次數`);
  ok(stems.size === 20, `十個日干的早子時、晚子時都抽到了：${[...stems].filter(x => x[0] === '甲' || x[0] === '己').sort().join('、')}…`);
  const five = Object.fromEntries([...stems].filter(x => x[1] === '早').map(x => [x[0], x.slice(2)]));
  eq([five.甲, five.己, five.乙, five.庚, five.丙, five.辛, five.丁, five.壬, five.戊, five.癸], ['甲子', '甲子', '丙子', '丙子', '戊子', '戊子', '庚子', '庚子', '壬子', '壬子'], '五鼠遁：甲己還加甲，乙庚丙作初，丙辛從戊起，丁壬庚子居，戊癸何方發，壬子是真途');
}

section('小限、童限、運限分段對獨立公式（400 張盤）');
{
  const START = { 寅午戌: '辰', 申子辰: '戌', 巳酉丑: '未', 亥卯未: '丑' }; // 小限一歲起在哪一宮：寅午戌人起辰、申子辰人起戌、巳酉丑人起未、亥卯未人起丑
  const san = z => Object.keys(START).find(g => g.includes(z));
  const { bad, note } = tally();
  for (let k = 0; k < 400; k++) {
    const male = k % 2 === 1;
    const { zw } = chartOf({ ...rndBirth(), clock: 'std', gender: male ? '男' : '女', zwYear: k % 5 === 0 ? 'lichun' : 'lunar' });
    const P = zw.chart.palaces, ming = P.findIndex(p => p.name === '命宮'), first = Math.min(...P.map(p => p.decadal.range[0]));
    const tag = `${zw.dateUsed} ${male ? '男' : '女'} ${zw.yearGZ}`;
    // 小限：男順女逆，一歲一宮
    const start = pal(ZHI.indexOf(START[san(zw.yearGZ[1])]));
    for (const age of [1, 2, 13, rnd(1, 120), 120]) {
      const L = PP.zwXiaoXian(zw, age), want = md(start + (male ? 1 : -1) * (age - 1));
      if (!L || L.index !== want || L.gz !== P[want].heavenlyStem + P[want].earthlyBranch || L.age !== age || L.names[want] !== '命宮') note('小限', `${tag} ${age} 歲：${L && L.index}，應在 ${want}`);
    }
    if (PP.zwXiaoXian(zw, 121) !== null || PP.zwXiaoXian(zw, 0) !== null) note('小限範圍', tag);
    // 童限：一命二財三疾四夫五福
    const CHILD = ['命宮', '財帛', '疾厄', '夫妻', '福德'];
    for (let age = 1; age < first; age++) {
      const L = PP.zwTongXian(zw, age);
      if (!L || P[L.index].name !== CHILD[age - 1] || L.gz !== P[L.index].heavenlyStem + P[L.index].earthlyBranch || L.names[L.index] !== '命宮') note('童限', `${tag} ${age} 歲`);
    }
    if ([0, first, first + 1, 1.5, NaN].some(a => PP.zwTongXian(zw, a) !== null)) note('童限範圍', tag);
    // 分段：童限一段加十二個大限，歲數相連，年份從生年起算；大限順逆看生年陰陽與性別
    const spans = PP.zwSpans(zw), fwd = (GAN.indexOf(zw.yearGZ[0]) % 2 === 0) === male;
    if (spans.length !== 13 || !spans[0].child || spans[0].palace !== null || spans[0].gz !== '' || !same(spans[0].ages, [1, first - 1])) note('童限分段', tag);
    spans.forEach((s, i) => {
      if (!same(s.years, s.ages.map(a => zw.birthYear + a - 1))) note('分段年份', tag);
      if (i > 0 && (s.ages[0] !== spans[i - 1].ages[1] + 1 || s.ages[1] - s.ages[0] !== 9 || s.child)) note('分段歲數', `${tag} 第 ${i} 段`);
      if (i > 0 && (s.palace !== md(ming + (fwd ? 1 : -1) * (i - 1)) || s.gz !== P[s.palace].heavenlyStem + P[s.palace].earthlyBranch || s.gz !== P[s.palace].decadal.heavenlyStem + P[s.palace].decadal.earthlyBranch)) note('大限所在的宮', `${tag} 第 ${i} 段`);
    });
    // 十二宮名：每一層都是把本命十二宮的順序整個轉過去
    const L = PP.zwDaXian(zw, rnd(0, 11));
    if (!same(L.names.map((_, i) => L.names[md(L.index - i)]), P.map((_, i) => P[md(ming - i)].name)) || new Set(L.names).size !== 12) note('運限宮名', tag);
    if (!same(L.ages, P[L.index].decadal.range) || L.child) note('大限歲數', tag);
  }
  eq(bad, {}, '不一致的項目與次數');
}

section('流派設定：四化版本');
{
  const DIFF = { tongxing: {}, gengTongYin: { 庚: '太陽武曲天同太陰' }, gengTongXiang: { 庚: '太陽武曲天同天相' }, zhongzhou: { 戊: '貪狼太陰太陽天機', 庚: '太陽武曲天府天同', 壬: '天梁紫微天府武曲' } };
  eq(PP.ZW_OPTIONS, { hua: Object.keys(DIFF), year: ['lunar', 'lichun'], leap: ['mid', 'current'] }, '設定的選項，每一項的第一個是預設值');
  const HUA = ['祿', '權', '科', '忌'];
  const { bad, note } = tally();
  let n = 0;
  for (const hua of PP.ZW_OPTIONS.hua) {
    for (let k = 0; k < 40; k++) {
      // 生年天干輪流取十干：2000 到 2009 年年中出生
      const { zw } = chartOf({ y: 2000 + k % 10, m: 6, d: rnd(1, 28), h: rnd(0, 23), mi: 0, clock: 'std', gender: pick(['男', '女']), zwHua: hua });
      const c = zw.chart, g = zw.yearGZ[0]; n++;
      if (zw.opts.hua !== hua) note('opts', hua);
      // 四化表：和通行版只差在說好的那幾干
      for (const stem of GAN) {
        const want = DIFF[hua][stem] || PP.SIHUA[stem].join('');
        if (zw.sihua[stem].join('') !== want) note('四化表', `${hua} ${stem}干：${zw.sihua[stem]}`);
      }
      // 本命盤上的生年四化（iztro 標的）和四化表相同：每顆化星都標對，沒有多標
      const marks = {};
      c.palaces.forEach(p => p.majorStars.concat(p.minorStars, p.adjectiveStars).forEach(s => { if (s.mutagen) marks[s.name] = s.mutagen; }));
      const want = Object.fromEntries(zw.sihua[g].map((name, i) => [name, HUA[i]]));
      if (!same(Object.entries(marks).sort(), Object.entries(want).sort())) note('生年四化', `${hua} ${g}年：盤上 ${JSON.stringify(marks)}，表 ${JSON.stringify(want)}`);
      // 運限四化查同一張表
      const L = PP.zwLiuNian(zw, 2030 + k % 10), D = PP.zwDaXian(zw, k % 12), M = PP.zwLiuYue(zw, 2030 + k % 10)[k % 12];
      const dayK = PP.zwLiuRi(zw, M)[k % 13];
      for (const x of [L, D, M, dayK, PP.zwLiuShi(zw, dayK)[k % 13], PP.zwXiaoXian(zw, 30 + k)]) if (!same(x.hua, zw.sihua[x.gz[0]])) note('運限四化', `${hua} ${x.gz}`);
      // iztro 自己的運限也跟著這張盤的四化設定
      if (k < 10) { const h = c.horoscope(`${2030 + k}-7-1`, 6); if (!same(h.yearly.mutagen, L.hua)) note('iztro 的流年四化', `${hua} ${L.gz}`); }
    }
  }
  eq(bad, {}, `${n} 張盤，不一致的項目與次數`);
  const z0 = chartOf({ y: 1990, m: 6, d: 15, h: 10, mi: 0 }).zw; // 庚午年
  eq([z0.opts, z0.sihua.庚], [{ hua: 'tongxing', year: 'lunar', leap: 'mid' }, ['太陽', '武曲', '太陰', '天同']], '沒給設定時用預設值');
  ok(z0.sihua !== PP.SIHUA && same(z0.sihua, PP.SIHUA), '預設的四化表和 SIHUA 內容相同（另一份物件）');
  const a = JSON.stringify(chartOf({ y: 1990, m: 6, d: 15, h: 10, mi: 0, zwHua: 'tongxing', zwYear: 'lunar', zwLeap: 'mid' }).zw.chart);
  eq(a, JSON.stringify(z0.chart), '明寫預設值和不寫，排出來的盤相同');
  const zz = chartOf({ y: 1990, m: 6, d: 15, h: 10, mi: 0, zwHua: 'zhongzhou' }).zw.chart;
  const stars = c => c.palaces.map(p => p.majorStars.concat(p.minorStars, p.adjectiveStars).map(s => s.name + (s.brightness || '')).join(' '));
  eq(stars(zz), stars(z0.chart), '換四化版本不動星曜的位置和亮度');
  eq(chartOf({ y: 1990, m: 6, d: 15, h: 10, mi: 0, zwHua: undefined, zwYear: null }).zw.opts, z0.opts, '設定給 undefined 或 null 等同沒給');
  for (const [key, v] of [['zwHua', 'foo'], ['zwYear', 'solar'], ['zwLeap', 'next'], ['zwHua', ''], ['zwYear', 0], ['zwLeap', 1], ['zwHua', 'constructor']]) {
    let err; try { chartOf({ y: 1990, m: 6, d: 15, h: 10, mi: 0, [key]: v }); } catch (e) { err = e; }
    ok(err && err.user === true && /紫微斗數的.+設定不對/.test(err.message), `${key} 給了不認得的值（${JSON.stringify(v)}）時丟出寫給使用者的錯誤`);
  }
}

section('流派設定：年界（立春當天換年）');
{
  const { bad, note } = tally();
  let differ = 0, plus = 0, minus = 0, n = 0;
  for (let k = 0; k < 500; k++) {
    // 七成抽在一月下旬到二月下旬（立春和正月初一都在這一段），其餘整年
    const y = rnd(1900, 2100), near = k % 10 < 7;
    const m = near ? pick([1, 2, 2]) : rnd(1, 12), d = near ? (m === 1 ? rnd(20, 31) : rnd(1, 21)) : rnd(1, 28);
    const o = { y, m, d, h: rnd(0, 23), mi: rnd(0, 59), clock: 'std', gender: k % 2 ? '男' : '女', ziRule: k % 3 ? 'next' : 'same' };
    const A = chartOf(o).zw, B = chartOf({ ...o, zwYear: 'lichun' }).zw; n++;
    const [uy, um, ud] = B.dateUsed.split('-').map(Number), lu = Solar.fromYmd(uy, um, ud).getLunar(), tag = `${B.dateUsed} ${o.h}時`;
    // 生年干支：起盤日那一天到了立春日就是新的一年（以日為單位）
    if (B.yearGZ !== lu.getYearInGanZhiByLiChun()) note('立春年界的生年干支', `${tag}：${B.yearGZ}，立春日算法 ${lu.getYearInGanZhiByLiChun()}`);
    if (A.yearGZ !== lu.getYearInGanZhi()) note('正月初一年界的生年干支', tag);
    if (PP.yearGZ(B.birthYear) !== B.yearGZ || Math.abs(B.birthYear - lu.getYear()) > 1 || A.birthYear !== lu.getYear()) note('生年的年數', `${tag}：${B.birthYear}`);
    if (B.opts.year !== 'lichun' || B.dateUsed !== A.dateUsed || B.lunarText !== A.lunarText || B.month !== A.month) note('其餘不變的欄位', tag);
    if (A.yearGZ === B.yearGZ) {
      if (zwJSON(A.chart) !== zwJSON(B.chart) || A.birthYear !== B.birthYear) note('生年相同時整張盤相同', tag);
    } else {
      differ++; if (B.birthYear > A.birthYear) plus++; else minus++;
      // 生年不同：年干四化、年干支帶的星跟著變，命宮的位置（看月和時）不變
      const ming = c => c.palaces.findIndex(p => p.name === '命宮');
      if (ming(A.chart) !== ming(B.chart)) note('命宮位置不受年界影響', tag);
      const lucun = c => c.palaces.findIndex(p => p.minorStars.some(s => s.name === '祿存'));
      if (lucun(B.chart) !== pal([2, 3, 5, 6, 5, 6, 8, 9, 11, 0][GAN.indexOf(B.yearGZ[0])])) note('祿存跟著立春年的年干', tag);
      // 虛歲從立春年算起：生年那一年一歲
      const L = PP.zwLiuNian(B, B.birthYear);
      if (!L || L.age !== 1 || L.gz !== B.yearGZ || PP.zwLiuNian(B, B.birthYear - 1) !== null) note('虛歲從生年起算', tag);
      if (PP.zwSpans(B)[0].years[0] !== B.birthYear) note('分段年份從生年起算', tag);
    }
  }
  eq(bad, {}, `${n} 組，不一致的項目與次數`);
  ok(differ > 60 && plus > 15 && minus > 15, `兩種年界排出不同生年的有 ${differ} 組（立春先到 ${plus}、正月初一先到 ${minus}）`);
  // 具體例子：1985 年立春 2 月 4 日、正月初一 2 月 20 日；1984 年正月初一 2 月 2 日、立春 2 月 4 日
  const one = (o, year) => { const z = chartOf({ h: 10, mi: 0, ...o, zwYear: year }).zw; return [z.yearGZ, z.birthYear]; };
  eq([one({ y: 1985, m: 2, d: 10 }, 'lunar'), one({ y: 1985, m: 2, d: 10 }, 'lichun')], [['甲子', 1984], ['乙丑', 1985]], '1985-02-10（立春後、過年前）');
  eq([one({ y: 1984, m: 2, d: 3 }, 'lunar'), one({ y: 1984, m: 2, d: 3 }, 'lichun')], [['甲子', 1984], ['癸亥', 1983]], '1984-02-03（過年後、立春前）');
  eq([one({ y: 1984, m: 2, d: 4 }, 'lichun'), one({ y: 1984, m: 2, d: 3, h: 23, mi: 30 }, 'lichun')], [['甲子', 1984], ['甲子', 1984]], '立春當天整天都算新的一年；前一天的晚子時換日後也落在立春日');
  eq(one({ y: 1984, m: 2, d: 3, h: 23, mi: 30, ziRule: 'same' }, 'lichun'), ['癸亥', 1983], '夜子時不換日：前一天的晚子時還在立春之前');
  // 立春日看的是起盤日（當地日期）：倫敦 1985-02-03 22:00 是 UTC+8 的 2 月 4 日 06:00，八字已過立春交節（05:12），紫微的起盤日還在立春日之前
  const west = chartOf({ y: 1985, m: 2, d: 3, h: 22, mi: 0, lon: 0, tz: 0, zone: undefined, clock: 'std', zwYear: 'lichun' });
  eq([west.zw.yearGZ, west.zw.birthYear, west.zw.dateUsed, west.bz.gz[0]], ['甲子', 1984, '1985-02-03', '乙丑'], '出生地在 UTC+8 以西：紫微照當地日期還沒到立春日（甲子），八字照交節時刻已經換年（乙丑）');
}

section('流派設定：閏月算法');
{
  const { bad, note } = tally();
  let upper = 0, lower = 0;
  for (let k = 0; k < 120; k++) {
    let ly; do { ly = rnd(1900, 2099); } while (!LunarYear.fromYear(ly).getLeapMonth());
    const lm = LunarYear.fromYear(ly).getLeapMonth(), ld = k % 2 ? rnd(16, 29) : rnd(1, 15);
    const o = { calendar: 'lunar', ly, lm, ld, leap: true, h: rnd(0, 22), mi: rnd(0, 59), clock: 'std', gender: k % 4 < 2 ? '男' : '女' };
    const A = chartOf(o), B = chartOf({ ...o, zwLeap: 'current' }), tag = `${ly} 閏${lm}月${ld}日`;
    const ming = z => z.chart.palaces.findIndex(p => p.name === '命宮');
    if (ld > 15) lower++; else upper++;
    if (A.zw.month !== (ld > 15 ? lm % 12 + 1 : lm) || B.zw.month !== lm) note('生月', `${tag}：月中分界 ${A.zw.month}、算本月 ${B.zw.month}`);
    // 命宮：寅起正月順數到生月，逆數生時
    for (const [name, z] of [['月中分界', A.zw], ['算本月', B.zw]]) if (ming(z) !== md(z.month - 1 - z.hourIndex)) note('命宮跟著生月', `${tag} ${name}`);
    if (ld <= 15 && JSON.stringify(A.zw.chart) !== JSON.stringify(B.zw.chart)) note('上半月兩種算法的盤相同', tag);
    if (ld > 15 && ming(A.zw) === ming(B.zw)) note('下半月兩種算法的命宮不同', tag);
    // 流年斗君跟著生月：正月的命宮 = 流年支宮逆數到生月、順數到生時
    const year = ly + rnd(0, 80), b = ZHI.indexOf(PP.yearGZ(year)[1]);
    for (const z of [A.zw, B.zw]) if (PP.zwLiuYue(z, year)[0].index !== md(pal(b) - (z.month - 1) + z.hourIndex)) note('流年斗君', `${tag} → ${year}`);
    // 流月的閏月：月中分界拆兩段，算本月不拆、和本月同宮同干支
    let fy; do { fy = ly + rnd(0, 80); } while (!LunarYear.fromYear(fy).getLeapMonth());
    const fa = PP.zwLiuYue(A.zw, fy), fb = PP.zwLiuYue(B.zw, fy), flm = LunarYear.fromYear(fy).getLeapMonth();
    const leapA = fa.filter(m => m.leap), leapB = fb.filter(m => m.leap), prev = fb.find(m => m.month === flm && !m.leap);
    if (fa.length !== 14 || fb.length !== 13 || leapA.length !== 2 || leapB.length !== 1) note('閏年的段數', `${tag} → ${fy}`);
    else {
      if (!same(leapA.map(m => m.part), ['上半', '下半']) || !same(leapA[0].days, [1, 15]) || leapA[1].days[0] !== 16 || leapB[0].part !== '' || leapB[0].days[0] !== 1) note('閏月拆法', `${fy}`);
      if (leapB[0].gz !== prev.gz || leapB[0].index !== prev.index || leapB[0].label !== `閏${prev.label}`) note('算本月時閏月和本月同宮同干支', `${fy}`);
      if (leapB[0].from !== leapA[0].from || leapB[0].to !== leapA[1].to) note('閏月起訖', `${fy}`);
      // 兩種算法下，同一天的流日都從那一段的流月命宮起初一
      const dayB = PP.zwLiuRi(B.zw, leapB[0]), dayA = PP.zwLiuRi(A.zw, leapA[1]);
      const last = dayB[dayB.length - 1], lastA = dayA[dayA.length - 1];
      if (last.date !== lastA.date || last.gz !== lastA.gz || last.day !== lastA.day || last.index !== md(leapB[0].index + last.day - 1) || lastA.index !== md(leapA[1].index + lastA.day - 1)) note('閏月的流日', `${fy}`);
    }
  }
  eq(bad, {}, '不一致的項目與次數');
  ok(upper === 60 && lower === 60, `閏月上半月出生 ${upper} 張、下半月 ${lower} 張`);
  // 不是閏月出生的人，兩種算法的本命盤相同
  const o = { y: 1984, m: 11, d: 20, h: 14, mi: 0 };
  eq(JSON.stringify(chartOf({ ...o, zwLeap: 'current' }).zw.chart), JSON.stringify(chartOf(o).zw.chart), '不在閏月出生：兩種算法的本命盤相同');
}

section('教材範例盤的運限（1984-11-20 14:00 男）');
{
  const { zw } = chartOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0 });
  eq([zw.yearGZ, zw.birthYear, zw.month, zw.hourIndex], ['甲子', 1984, 10, 7], '生年、生月、生時');
  eq(PP.zwSpans(zw).slice(0, 3).map(s => [s.child, s.ages.join('–'), s.years.join('–'), s.gz]), [[true, '1–2', '1984–1985', ''], [false, '3–12', '1986–1995', '戊辰'], [false, '13–22', '1996–2005', '己巳']], '童限兩年，之後十年一個大限');
  const P = zw.chart.palaces, at = L => P[L.index].name + P[L.index].earthlyBranch;
  eq([at(PP.zwTongXian(zw, 1)), at(PP.zwTongXian(zw, 2)), PP.zwTongXian(zw, 3)], ['命宮辰', '財帛子', null], '童限一歲命宮、二歲財帛');
  const dx = PP.zwDaXian(zw, 6), yr = PP.zwLiuNian(zw, 2026), xx = PP.zwXiaoXian(zw, 43);
  eq([dx.gz, at(dx), dx.ages, dx.hua], ['壬申', '官祿申', [43, 52], ['天梁', '紫微', '左輔', '武曲']], '43 到 52 歲的大限在申宮');
  eq([yr.gz, at(yr), yr.age, yr.hua, yr.sui12[yr.index], yr.jiang12[yr.index]], ['丙午', '福德午', 43, ['天同', '天機', '文昌', '廉貞'], '歲建', '將星'], '2026 丙午年：流年命宮在午');
  eq([xx.gz, at(xx)], ['戊辰', '命宮辰'], '43 歲的小限在辰宮');
  // 流年斗君：午宮起正月逆數到十月是酉宮，酉宮起子時順數到未時是辰宮
  const mos = PP.zwLiuYue(zw, 2026), oct = mos[9], d9 = PP.zwLiuRi(zw, oct)[8];
  eq([mos.length, mos[0].label, mos[0].gz, P[mos[0].index].earthlyBranch, mos[0].from], [12, '正月', '庚寅', '辰', '2026-02-17'], '2026 年正月在辰宮，從 2 月 17 日起');
  eq([oct.label, oct.gz, P[oct.index].earthlyBranch, oct.from, oct.to, oct.days], ['十月', '己亥', '丑', '2026-11-09', '2026-12-08', [1, 30]], '十月己亥在丑宮');
  eq([d9.label, d9.date, d9.gz, P[d9.index].earthlyBranch], ['初九', '2026-11-17', '乙未', '酉'], '十月初九（2026-11-17）乙未日在酉宮');
  // 流時：乙庚日起丙子時；從流日命宮（酉）起子時順數，午時在卯宮。晚子時的命宮同早子時，時干用次日（丙申日）的戊子
  const hs = PP.zwLiuShi(zw, d9);
  eq(hs.map(h => h.gz).join(' '), '丙子 丁丑 戊寅 己卯 庚辰 辛巳 壬午 癸未 甲申 乙酉 丙戌 丁亥 戊子', '乙未日的十三格：早子時丙子，到亥時丁亥，晚子時戊子');
  eq([hs[6].label, hs[6].from, hs[6].to, P[hs[6].index].earthlyBranch, hs[6].hua], ['午時', '11:00', '13:00', '卯', ['天梁', '紫微', '左輔', '武曲']], '午時（11 到 13 點）壬午在卯宮，四化照壬干');
  eq([hs[0].label, hs[0].from, hs[0].to, P[hs[0].index].earthlyBranch, hs[12].label, hs[12].from, hs[12].to, P[hs[12].index].earthlyBranch], ['早子時', '00:00', '01:00', '酉', '晚子時', '23:00', '24:00', '酉'], '早子時 0 到 1 點、晚子時 23 到 24 點，都在流日命宮酉宮');
  eq(PP.zwLiuYue(zw, 2025).filter(m => m.leap).map(m => [m.label, m.gz, m.from, m.to]), [['閏六月上半', '癸未', '2025-07-25', '2025-08-08'], ['閏六月下半', '甲申', '2025-08-09', '2025-08-22']], '2025 年閏六月拆成兩段');
  eq([PP.zwLiuNian(zw, 1983), PP.zwLiuNian(zw, 1984)?.age, PP.zwLiuNian(zw, 2026.5)], [null, 1, null], '出生前的年份、不是整數的年份排不出流年');
  // 斗君的教科書算法，換一張盤：三月寅時生的人，子年從子宮起正月，逆數到三月是戌宮，戌宮起子時順數到寅時是子宮
  const book = chartOf({ calendar: 'lunar', ly: 1960, lm: 3, ld: 10, leap: false, h: 4, mi: 0, clock: 'std' }).zw, bp = book.chart.palaces;
  eq([book.month, PP.SHICHEN[book.hourIndex], bp[PP.zwLiuNian(book, 1984).index].earthlyBranch, bp[PP.zwLiuYue(book, 1984)[0].index].earthlyBranch], [3, '寅', '子', '子'], '三月寅時生的人，甲子年的流年斗君（正月）在子宮');
}

finish();
