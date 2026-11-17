#!/usr/bin/env node
/* 命令列排盤：印出和頁面「複製文字盤」逐字相同的文字盤，給不開瀏覽器的場合用（例如 Claude 的 Skill）。用法見 --help：
     node scripts/paipan.js --date 1984-11-20 --time 14:00 --gender 男 --place 台北
     node scripts/paipan.js --sample --at 2026-11-18
   這裡只管把參數組成表單的值、印出結果。輸入檢查（inputFrom 與引擎）、文字盤的寫法（textChart）、
   「某一天」走到哪一格運限（nowSel、pickToday），都直接用頁面的程式，不另外寫一份；test/browser/cli.test.js 把兩邊逐字比對。
   函式庫和測試一樣從 node_modules 掛到全域，用的是頁面載入的同一個檔（iztro 是 dist/iztro.min.js，不是 require('iztro')）。
   狀態碼：0 排好了；1 生辰有誤（訊息和頁面上的相同）；2 參數用錯；3 程式本身出錯。 */
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { resolveTime, bazi, ziwei, ZW_OPTIONS, pad } from '../src/engine/index.js';
import { S, initNow } from '../src/app/state.js';
import { inputFrom } from '../src/app/form.js';
import { zwOptLabels } from '../src/app/format.js';
import { PLACES, PLACE, SAMPLE } from '../src/app/places.js';
import { nowSel } from '../src/app/view-bazi.js';
import { currentDecade, pickToday } from '../src/app/view-ziwei.js';
import { textChart } from '../src/app/text-chart.js';

const require = createRequire(import.meta.url);
Object.assign(globalThis, require('lunar-javascript'));
globalThis.self = globalThis; // iztro 的瀏覽器版以 self 為全域物件
globalThis.iztro = require('iztro/dist/iztro.min.js');

// 頁面下拉選單的選項（src/index.html）。引擎不檢查這兩欄，所以在這裡擋；紫微的三項照引擎的 ZW_OPTIONS
const CHOICES = {
  clock: ['auto', 'std', 'dst'],
  zi: ['next', 'same'],
  'zw-hua': ZW_OPTIONS.hua, 'zw-year': ZW_OPTIONS.year, 'zw-leap': ZW_OPTIONS.leap,
};
const zwList = k => ZW_OPTIONS[k].map(v => `${v}＝${zwOptLabels({ hua: ZW_OPTIONS.hua[0], year: ZW_OPTIONS.year[0], leap: ZW_OPTIONS.leap[0], [k]: v })[['hua', 'year', 'leap'].indexOf(k)]}`).join('、');
const USAGE = `用法：node scripts/paipan.js --date 1984-11-20 --time 14:00 --gender 男 --place 台北 [選項]

印出和網頁「複製文字盤」相同的文字盤：八字、紫微斗數、要複核的提醒。只排盤，不解盤。

出生（必填）
  --date 年-月-日        公曆生日，例如 1984-11-20
  --lunar 年-月-日       改填農曆生日（和 --date 二擇一），月、日用數字，例如 1984-10-28；閏月另加 --leap
  --time 時:分           出生時間，24 小時制。填當時鐘錶上的時間（出生證明上寫的），夏令時間會自動換算
  --gender 男|女
  --place 地名           出生地；可選的地名用 --places 列出
  --lon 經度 --tz 時區   不在清單上的出生地（和 --place 二擇一）：東經為正、西經為負；時區填現行標準時，台灣是 8

排盤設定（不給就和網頁的預設相同）
  --clock auto|std|dst   夏令時間：auto 依時區資料把當時的鐘錶換回現行標準時（預設）；std 輸入的已是現行標準時；
                         dst 輸入的是夏令時間，減 1 小時。自訂出生地沒有時區資料，auto 當成 std
  --tst                  校正真太陽時（經度與均時差）。預設不校正
  --zi next|same         子時立場：next 23:00 換日換柱（預設）；same 夜子時不換日
  --zw-hua 值            紫微四化版本：${zwList('hua')}
  --zw-year 值           紫微年界：${zwList('year')}
  --zw-leap 值           紫微閏月：${zwList('leap')}
  --name 名字            寫在文字盤開頭

運限
  --at 年-月-日          加印這一天的運限：八字的大運、流年、流月與原局的關係；紫微的大限（或童限）、流年、小限、流月、流日。
                         以整天計：交節、交運、立春當天都算新的

其他
  --sample               教材範例盤（1984-11-20 14:00 台北 男）；可以再加排盤設定與 --at
  --places               列出可選的出生地
  -h, --help             這份說明

狀態碼：0 排好了；1 生辰有誤（訊息和網頁上的相同）；2 參數用錯；3 程式本身出錯`;

const usageError = msg => { process.stderr.write(`${msg}\n用 --help 看用法。\n`); process.exit(2); };
const ymd = (s, what) => {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) usageError(`${what}請寫成 年-月-日，例如 1984-11-20。`);
  return { y: +m[1], m: +m[2], d: +m[3] };
};

// 西經、西半球的時區是負數：「--lon -71.06」的 -71.06 會被當成另一個參數，這裡先併成「--lon=-71.06」
const argv = [];
for (let i = 2; i < process.argv.length; i++) {
  const x = process.argv[i], next = process.argv[i + 1];
  if ((x === '--lon' || x === '--tz') && /^-\d/.test(next ?? '')) { argv.push(`${x}=${next}`); i++; } else argv.push(x);
}
let a;
try {
  ({ values: a } = parseArgs({
    args: argv, strict: true, allowPositionals: false,
    options: {
      date: { type: 'string' }, lunar: { type: 'string' }, leap: { type: 'boolean' }, time: { type: 'string' }, gender: { type: 'string' },
      place: { type: 'string' }, lon: { type: 'string' }, tz: { type: 'string' }, name: { type: 'string' },
      clock: { type: 'string' }, tst: { type: 'boolean' }, zi: { type: 'string' }, 'zw-hua': { type: 'string' }, 'zw-year': { type: 'string' }, 'zw-leap': { type: 'string' },
      at: { type: 'string' }, sample: { type: 'boolean' }, places: { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    },
  }));
} catch (e) {
  const opt = (/'(-[^' ]+)/.exec(e.message) || [])[1] || '';
  usageError(e.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION' ? `不認得的參數：${opt}。`
    : e.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' ? (/does not take/.test(e.message) ? `參數 ${opt} 不接值，直接寫 ${opt} 就好。` : `參數 ${opt} 後面要接一個值。`)
      : e.code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL' ? '有一個值前面沒有參數名稱（例如日期前面少了 --date）。'
        : e.message);
}

if (a.help) { process.stdout.write(USAGE + '\n'); process.exit(0); }
if (a.places) {
  const tz = t => (t !== 8 ? `（UTC+${t}）` : '');
  process.stdout.write(PLACES.map(([g, list]) => `${g}：${list.map(([n, , t]) => n + tz(t)).join('、')}`).join('\n') +
    '\n不在清單上的：用 --lon 經度 --tz 時區 自訂。自訂的地點沒有時區資料可查，出生時正值夏令時間的話要加 --clock dst。\n');
  process.exit(0);
}
for (const [k, list] of Object.entries(CHOICES)) if (a[k] !== undefined && !list.includes(a[k])) usageError(`--${k} 只能是 ${list.join('、')}。`);

// 參數 → 表單上各欄的值（形狀見 src/app/form.js 的 inputFrom）
const v = {
  name: a.name ?? '', gender: a.gender ?? '', calendar: 'solar', date: '', time: a.time ?? '', ly: '', lm: '', ld: '', leap: false,
  place: '', lon: '', tz: '', clock: a.clock ?? 'auto', tst: a.tst ? '1' : '0', zi: a.zi ?? 'next',
  zwHua: a['zw-hua'] ?? ZW_OPTIONS.hua[0], zwYear: a['zw-year'] ?? ZW_OPTIONS.year[0], zwLeap: a['zw-leap'] ?? ZW_OPTIONS.leap[0],
};
if (a.sample) {
  const given = ['date', 'lunar', 'leap', 'time', 'gender', 'place', 'lon', 'tz', 'name'].filter(k => a[k] !== undefined);
  if (given.length) usageError(`--sample 已經是一份完整的生辰，不能再給 ${given.map(k => '--' + k).join('、')}。`);
  Object.assign(v, { gender: SAMPLE.gender, date: `${SAMPLE.y}-${pad(SAMPLE.m)}-${pad(SAMPLE.d)}`, time: `${pad(SAMPLE.h)}:${pad(SAMPLE.mi)}`, place: SAMPLE.place });
} else {
  if (a.date !== undefined && a.lunar !== undefined) usageError('--date（公曆）和 --lunar（農曆）只能給一個。');
  if (a.leap && a.lunar === undefined) usageError('--leap 是農曆閏月，要和 --lunar 一起用。');
  if (a.lunar !== undefined) {
    const l = ymd(a.lunar, '農曆生日');
    Object.assign(v, { calendar: 'lunar', ly: String(l.y), lm: String(l.m), ld: String(l.d), leap: !!a.leap });
  } else v.date = a.date ?? '';
  if (a.lon !== undefined || a.tz !== undefined) {
    if (a.place !== undefined && a.place !== 'custom') usageError('--place 和 --lon、--tz 只能擇一：清單上的地名用 --place，不在清單上的用 --lon、--tz。');
    Object.assign(v, { place: 'custom', lon: a.lon ?? '', tz: a.tz ?? '' });
  } else if (a.place === undefined) {
    usageError('請用 --place 指定出生地（可選的地名用 --places 列出），不在清單上的用 --lon、--tz 自訂。');
  } else if (!PLACE.has(a.place)) {
    usageError(`不認得出生地「${a.place}」。可選的地名用 --places 列出；不在清單上的用 --lon、--tz 自訂。`);
  } else v.place = a.place;
}

// --at：那一天的 23:59（本機時區）。以整天計，交節、交運、立春當天都已經算新的，和畫面上「今」的標示一致
let at = '';
if (a.at !== undefined) {
  const t = ymd(a.at, '--at 的日期'), chk = new Date(Date.UTC(t.y, t.m - 1, t.d));
  if (chk.getUTCMonth() !== t.m - 1 || chk.getUTCDate() !== t.d) usageError(`--at：公曆沒有 ${a.at} 這一天。`);
  if (t.y < 1900 || t.y > 2200) usageError('--at 的日期要在 1900 到 2200 年之間。');
  at = `${t.y}-${pad(t.m)}-${pad(t.d)}`;
  initNow(new Date(t.y, t.m - 1, t.d, 23, 59));
} else initNow();

try {
  const inp = inputFrom(v), rt = resolveTime(inp), bz = bazi(inp, rt), zw = ziwei(inp, rt);
  Object.assign(S, { inp, rt, bz, zw, c: zw.chart, dy: null, ln: null, lm: null, curDec: null, dec: null, yr: null, mo: null, day: null });
  if (at) {
    Object.assign(S, nowSel(bz)); // 八字：那一天走的那一格運、流年、流月
    S.curDec = currentDecade(); // 紫微：等於畫面上按「看今天」
    if (S.curDec !== null) pickToday();
  }
  process.stdout.write(textChart({ atDate: at }) + '\n');
} catch (e) {
  if (e.user) { process.stderr.write(e.message + '\n'); process.exit(1); }
  process.stderr.write(`排盤時發生沒有預期到的錯誤：${e.stack || e}\n`);
  process.exit(3);
}
