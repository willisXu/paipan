/* 引擎輸出快照比對：node test/engine/snapshot.test.js [--update] [--show=編號]
   用固定種子產生幾千組生辰設定，把引擎的完整輸出（時間換算、八字、紫微、干支關係、神煞、各種表格）
   各自算成雜湊，和 test/snapshots/engine-golden.json.gz 比對。
   用途：重構、搬程式時確認引擎輸出一個位元都沒變。它不判斷對錯（對錯由同資料夾的其他各支用獨立公式驗），只抓「變了」。
   輸出是「故意」改的時候，確認差異符合預期後用 --update 重新產生基準檔。
   --show=12 會印出第 12 筆的輸入與目前的完整輸出，方便對照。 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { seeded, dim } from '../helpers/random.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GOLDEN = path.join(root, 'test', 'snapshots', 'engine-golden.json.gz');
const UPDATE = process.argv.includes('--update');
const SHOW = (process.argv.find(a => a.startsWith('--show=')) || '').slice(7);

// 浮點數取到小數九位再比：不同版本的數學函式庫末位可能差一點，那不算引擎變了
const json = v => JSON.stringify(v, (k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1e9) / 1e9 : x));
const hash = v => crypto.createHash('sha256').update(json(v)).digest('hex').slice(0, 12);

// 亂數：mulberry32，種子固定（演算法與理由見 helpers/random.js）。種子和取亂數的順序都不可改，否則輸入就和基準檔對不上
const { rand, rnd, pick } = seeded(20261111);

const PLACES = [
  [121.56, 8, 'Asia/Taipei'], [120.31, 8, 'Asia/Taipei'], [121.47, 8, 'Asia/Shanghai'], [104.07, 8, 'Asia/Shanghai'], [114.17, 8, 'Asia/Hong_Kong'],
  [113.54, 8, 'Asia/Macau'], [103.82, 8, 'Asia/Singapore'], [101.69, 8, 'Asia/Kuala_Lumpur'], [120.98, 8, 'Asia/Manila'], [139.69, 9, 'Asia/Tokyo'], [126.98, 9, 'Asia/Seoul'],
];
// 一筆隨機的生辰設定。刻意多抽子時前後，也混進農曆（含閏月與不存在的日子）和自訂經度時區
function randomInput() {
  const inp = { gender: pick(['男', '女']), ziRule: pick(['next', 'next', 'same']), useTST: rand() < 0.3 };
  const edge = rand();
  inp.h = edge < 0.12 ? 23 : edge < 0.2 ? 0 : rnd(0, 23);
  inp.mi = rnd(0, 59);
  if (rand() < 0.15) {
    inp.calendar = 'lunar'; inp.ly = rnd(1900, 2100); inp.lm = rnd(1, 12); inp.ld = rnd(1, 30); inp.leap = false;
    const leapMonth = LunarYear.fromYear(inp.ly).getLeapMonth();
    if (leapMonth && rand() < 0.4) { inp.lm = leapMonth; inp.leap = true; } else if (rand() < 0.05) inp.leap = true;
  } else {
    inp.calendar = 'solar'; inp.y = rnd(1900, 2100); inp.m = rnd(1, 12); inp.d = rnd(1, dim(inp.y, inp.m));
  }
  if (rand() < 0.2) {
    inp.lon = Math.round((rand() * 360 - 180) * 100) / 100; inp.tz = rnd(-24, 28) / 2; inp.clock = pick(['std', 'dst']);
  } else {
    [inp.lon, inp.tz, inp.zone] = pick(PLACES); inp.clock = pick(['auto', 'auto', 'std', 'dst']);
  }
  return inp;
}
const attempt = fn => { try { return fn(); } catch (e) { return { error: e.message, user: e.user === true }; } };
const chartOf = inp => attempt(() => { const rt = PP.resolveTime(inp); return { rt, bz: PP.bazi(inp, rt) }; });
const ziweiOf = inp => attempt(() => { const zw = PP.ziwei(inp, PP.resolveTime(inp)); return { rolled: zw.rolled, dateUsed: zw.dateUsed, lunarText: zw.lunarText, chart: zw.chart }; });

const { GAN, ZHI } = PP;
const JIAZI = Array.from({ length: 60 }, (_, k) => GAN[k % 10] + ZHI[k % 12]);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
const pillarsOf = (list, natal) => list.map((s, i) => ({ pos: '年月日時運歲'[i], gan: s[0], zhi: s[1], natal: i < natal }));

function compute() {
  const out = { tables: {}, charts: [], ziwei: [], pillars: [] };
  const T = out.tables;
  // 常數表與純函式：整個定義域都算一遍
  for (const name of ['GAN', 'ZHI', 'WX', 'WX_KEY', 'CANG', 'SHICHEN', 'SIHUA']) T[name] = hash(PP[name]);
  T.wxOf = hash([...GAN, ...ZHI].map(PP.wxOf));
  T.yinyang = hash([...GAN, ...ZHI].map(PP.yinyang));
  T.yearGZ = hash(range(1700, 2300).map(PP.yearGZ));
  T.tenGod = hash(GAN.map(a => GAN.map(b => PP.tenGod(a, b))));
  T.changSheng = hash(GAN.map(g => ZHI.map(z => PP.changSheng(g, z))));
  T.jz = hash(JIAZI.map(s => PP.jz(s[0], s[1])));
  T.nayin = hash(JIAZI.map(PP.nayin));
  T.xunKong = hash(JIAZI.map(PP.xunKong));
  T.seasonOf = hash(ZHI.map(PP.seasonOf));
  T.wangXiang = hash(range(0, 4).map(e => range(0, 4).map(s => PP.wangXiang(e, s))));
  T.equationOfTime = hash(range(0, 730).map(k => PP.equationOfTime(PP.fromMs(Date.UTC(2023, 0, 1, 0, 0) + k * 12 * 3600e3))));
  // 鐘面時間取整到分鐘（實際輸入只到分）：帶小數的毫秒會讓偏移算出浮點雜訊，那不是引擎的行為
  T.zoneOffset = hash([...new Set(PLACES.map(p => p[2]))].map(zone => range(0, 600).map(k => PP.zoneOffset(zone, Math.round((Date.UTC(1900, 0, 1, 3, 30) + k * 122.37 * 864e5) / 6e4) * 6e4))));
  T.fromMs = hash(range(0, 400).map(k => PP.fromMs(Date.UTC(1890, 0, 1) + k * 191.3 * 864e5)));
  T.toMs = hash(range(0, 400).map(k => PP.toMs({ y: 1890 + k % 220, m: 1 + k % 12, d: 1 + k % 28, h: k % 24, mi: k % 60 })));
  T.fmt = hash(range(0, 400).map(k => PP.fmt({ y: 1890 + k % 220, m: 1 + k % 12, d: 1 + k % 28, h: k % 24, mi: k % 60 })));
  T.pad = hash(range(0, 120).map(PP.pad));
  T.userError = hash((e => [e.message, e.user, e instanceof Error])(PP.userError('測試訊息')));
  // 任兩柱的關係（原局對原局、原局對運、運對歲）
  T.relations2 = hash(JIAZI.map(a => JIAZI.map(b => [[2, false], [1, false], [1, true], [0, false]].map(([natal, only]) => PP.relations(pillarsOf([a, b], natal), only)))));
  // 輸入檢查的錯誤訊息
  const base = { calendar: 'solar', gender: '男', y: 1984, m: 11, d: 20, h: 14, mi: 0, lon: 121.56, tz: 8, zone: 'Asia/Taipei', clock: 'auto', useTST: false, ziRule: 'next' };
  T.errors = hash([
    { h: 24 }, { h: -1 }, { h: 1.5 }, { mi: 60 }, { mi: NaN }, { tz: 15 }, { tz: -13 }, { tz: NaN }, { tz: undefined }, { useTST: true, lon: 181 }, { useTST: true, lon: NaN },
    { m: 2, d: 30 }, { y: 1985, m: 2, d: 29 }, { m: 13 }, { d: 0 }, { y: 99 }, { y: 10000 }, { y: 1984.5 }, { m: 4, d: 31 },
    { calendar: 'lunar', ly: 1984, lm: 5, ld: 3, leap: true }, { calendar: 'lunar', ly: 1984, lm: 10, ld: 30, leap: true }, { calendar: 'lunar', ly: 2023, lm: 2, ld: 30, leap: true }, { calendar: 'lunar', ly: 50, lm: 1, ld: 1, leap: false },
    { calendar: 'lunar', ly: NaN, lm: 1, ld: 1, leap: false }, { calendar: 'lunar', ly: 1984, lm: 13, ld: 1, leap: false }, { calendar: 'lunar', ly: 1984, lm: 1, ld: 31, leap: false },
    { zone: 'Not/AZone' }, { zone: 'Not/AZone', clock: 'std' },
    // 可排的範圍（公曆 1900 到 2100 年）兩端，公曆與農曆各一組
    { y: 1899, m: 12, d: 31 }, { y: 1900, m: 1, d: 1 }, { y: 2100, m: 12, d: 31 }, { y: 2101, m: 1, d: 1 },
    { calendar: 'lunar', ly: 1899, lm: 11, ld: 29, leap: false }, { calendar: 'lunar', ly: 1899, lm: 12, ld: 1, leap: false }, { calendar: 'lunar', ly: 2100, lm: 11, ld: 1, leap: false }, { calendar: 'lunar', ly: 2100, lm: 12, ld: 10, leap: false },
    { calendar: 'lunar', ly: 1898, lm: 12, ld: 1, leap: false }, { calendar: 'lunar', ly: 2101, lm: 1, ld: 1, leap: false },
    // 農曆年月日的型別與正負號、性別
    { calendar: 'lunar', ly: 1984, lm: -10, ld: 3, leap: false }, { calendar: 'lunar', ly: 1984, lm: '10', ld: 3, leap: true }, { calendar: 'lunar', ly: 1984, lm: 10, ld: '3', leap: false }, { calendar: 'lunar', ly: 1984, lm: 10, ld: 3.5, leap: false },
    { gender: 'male' }, { gender: undefined },
    // 重複與不存在的鐘面時間（台灣 1975 年夏令時間的結束與開始）
    { y: 1975, m: 9, d: 30, h: 23, mi: 30 }, { y: 1975, m: 4, d: 1, h: 0, mi: 30 },
  ].map(o => chartOf({ ...base, ...o })));

  // 任意六柱（四柱加運、歲）與任意四柱：關係、神煞、旺衰、五行統計
  for (let k = 0; k < 6000; k++) {
    const six = range(0, 5).map(() => pick(JIAZI));
    if (k % 7 === 0) six[4] = six[5]; // 歲運並臨
    if (k % 11 === 0) six[pick([4, 5])] = six[rnd(0, 3)]; // 伏吟
    const P6 = pillarsOf(six, 4), P4 = P6.slice(0, 4);
    out.pillars.push(hash([PP.relations(P4), PP.relations(P6, true), PP.relations(P6), PP.shensha(P4), PP.strength(P4), PP.wuxingCount(P4)]));
  }
  // 完整排盤
  const inputs = [];
  for (let k = 0; k < 3000; k++) {
    const inp = randomInput();
    inputs.push(inp);
    out.charts.push(hash(chartOf(inp)));
    if (k < 600) out.ziwei.push(hash(ziweiOf(inp)));
  }
  return { out, inputs };
}

const { out: actual, inputs } = compute();
if (SHOW !== '') {
  const k = Number(SHOW), inp = inputs[k];
  console.log(`第 ${k} 筆輸入：`, JSON.stringify(inp));
  console.log(json(chartOf(inp)));
  if (k < actual.ziwei.length) console.log(json(ziweiOf(inp)));
  process.exit(0);
}
const count = o => Object.keys(o.tables).length + o.pillars.length + o.charts.length + o.ziwei.length;
if (UPDATE) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, zlib.gzipSync(JSON.stringify(actual)));
  console.log(`已更新引擎基準檔：${count(actual)} 筆雜湊（表格 ${Object.keys(actual.tables).length}、任意柱組合 ${actual.pillars.length}、八字 ${actual.charts.length}、紫微 ${actual.ziwei.length}），${(fs.statSync(GOLDEN).size / 1024).toFixed(0)} KB`);
  process.exit(0);
}
if (!fs.existsSync(GOLDEN)) { console.error('沒有基準檔。先用 --update 產生。'); process.exit(2); }
const golden = JSON.parse(zlib.gunzipSync(fs.readFileSync(GOLDEN)).toString());
let fail = 0;
const report = msg => { fail++; if (fail <= 12) console.log('  ✗', msg); };
for (const name of new Set([...Object.keys(golden.tables), ...Object.keys(actual.tables)])) if (golden.tables[name] !== actual.tables[name]) report(`表格或函式 ${name} 的輸出和基準不同`);
for (const [key, label] of [['pillars', '任意柱組合'], ['charts', '八字'], ['ziwei', '紫微']]) {
  if (golden[key].length !== actual[key].length) report(`${label}的筆數和基準不同（${actual[key].length}／${golden[key].length}）`);
  actual[key].forEach((h, k) => { if (h !== golden[key][k]) report(`${label}第 ${k} 筆和基準不同${key === 'pillars' ? '' : `：${JSON.stringify(inputs[k])}（用 --show=${k} 看完整輸出）`}`); });
}
const total = count(actual);
console.log(`\n${fail ? '✗' : '✓'} 引擎輸出 ${total} 筆雜湊：${total - fail} 筆相同，${fail} 筆不同`);
process.exit(fail ? 1 : 0);
