/* 命令列（scripts/paipan.js）：node test/engine/cli.test.js [種子]。不需要瀏覽器。
   文字盤和頁面逐字相同，由 test/browser/cli.test.js 比對；這一支測命令列自己的事：
   說明與地名表、參數用錯和生辰有誤時的狀態碼與訊息、輸出不隨執行環境的時區改變，
   以及 --at 選的那一天走到哪裡——八字的流年、流月對 lunar-javascript 自己的「精確」干支（看交節時刻），
   大運對交運日，紫微的流年、流月、流日對農曆日期，各自另外算一次。 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { chartOf } from '../helpers/charts.js';
import { PLACE, LM, SAMPLE } from '../../src/app/places.js';

const SEED = Number(process.argv[2]) || 2026111803;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = path.join(root, 'scripts', 'paipan.js');
const pad = n => String(n).padStart(2, '0');
function run(args, tz = 'Asia/Taipei') {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, TZ: tz }, stdio: ['ignore', 'pipe', 'pipe'] }), err: '' };
  } catch (e) { return { code: e.status, out: e.stdout, err: e.stderr }; }
}
const block = (text, head) => (text.replace(/\n$/, '').split('\n\n').find(b => b.startsWith(head)) || '').split('\n');

section('說明、地名表、教材範例盤');
{
  const help = run(['--help']);
  eq(help.code, 0, '--help 的狀態碼');
  const flags = ['--date', '--lunar', '--leap', '--time', '--gender', '--place', '--lon', '--tz', '--clock', '--tst', '--zi', '--zw-hua', '--zw-year', '--zw-leap', '--name', '--at', '--sample', '--places', '--help'];
  eq(flags.filter(f => !help.out.includes(f)), [], '--help 列出了每一個參數（沒列到的）');
  for (const [k, list] of Object.entries(PP.ZW_OPTIONS)) eq(list.filter(v => !help.out.includes(v)), [], `--help 列出了紫微 ${k} 的每一個選項（沒列到的）`);
  const places = run(['--places']);
  eq([places.code, [...PLACE.keys()].filter(n => !places.out.includes(n))], [0, []], '--places 列出了每一個地名（狀態碼、沒列到的）');
  const sample = run(['--sample']), explicit = run(['--date', '1984-11-20', '--time', '14:00', '--gender', '男', '--place', '台北']);
  eq(sample.code, 0, '--sample 的狀態碼');
  // 教材錨點：1984-11-20 14:00 男命，甲子 乙亥 戊午 己未；紫微木三局、命宮戊辰
  ok(sample.out.startsWith('【八字】教材範例盤　乾造\n') && sample.out.includes('四柱：年 甲子　月 乙亥　日 戊午　時 己未') &&
    sample.out.includes('【紫微斗數】木三局') && sample.out.includes('命宮 戊辰'), '教材範例盤的四柱、五行局、命宮');
  eq(explicit.out, sample.out, '--sample 和照樣填出生資料印的相同');
  ok(!sample.out.includes('【八字運限】') && !sample.out.includes('【紫微運限】'), '沒加 --at 就沒有運限');
}

section('參數用錯（狀態碼 2）與生辰有誤（狀態碼 1）');
{
  const base = ['--time', '10:00', '--gender', '男', '--place', '台北'];
  const cases = [
    [['--bogus'], 2, '不認得的參數'],
    [['--date', '1984-11-20', '--time'], 2, '後面要接一個值'],
    [['--sample', '--tst=1'], 2, '不接值'],
    [['1984-11-20'], 2, '前面沒有參數名稱'],
    [['--date', '1984-11-20', '--time', '10:00', '--gender', '男'], 2, '請用 --place'],
    [['--date', '1984-11-20', ...base.slice(0, 4), '--place', '台中市'], 2, '不認得出生地「台中市」'],
    [['--date', '1984-11-20', '--lunar', '1984-10-28', ...base], 2, '只能給一個'],
    [['--date', '1984-11-20', '--leap', ...base], 2, '要和 --lunar 一起用'],
    [['--lunar', '1984/10/28', ...base], 2, '農曆生日請寫成 年-月-日'],
    [['--date', '1984-11-20', ...base, '--lon', '120'], 2, '只能擇一'],
    [['--date', '1984-11-20', ...base, '--zi', 'late'], 2, '--zi 只能是 next、same'],
    [['--date', '1984-11-20', ...base, '--clock', 'summer'], 2, '--clock 只能是 auto、std、dst'],
    [['--date', '1984-11-20', ...base, '--zw-hua', 'quanshu'], 2, `--zw-hua 只能是 ${PP.ZW_OPTIONS.hua.join('、')}`],
    [['--sample', '--date', '1990-01-01'], 2, '不能再給 --date'],
    [['--sample', '--at', '2026-2-30'], 2, '公曆沒有 2026-2-30 這一天'],
    [['--sample', '--at', '2300-01-01'], 2, '1900 到 2200 年'],
    [['--sample', '--at', 'today'], 2, '--at 的日期請寫成 年-月-日'],
    [['--date', '1984-11-20', '--gender', '男', '--place', '台北'], 1, '請填出生時間'],
    [['--time', '10:00', '--gender', '男', '--place', '台北'], 1, '請填出生日期'],
    [['--date', '1984-02-30', ...base], 1, '公曆沒有 1984 年 2 月 30 日'],
    [['--date', '1899-12-31', ...base], 1, '出生日期要在公曆 1900 到 2100 年之間'],
    [['--date', '1984-11-20', '--time', '10:00', '--gender', 'M', '--place', '台北'], 1, '性別請填「男」或「女」'],
    [['--lunar', '2023-3-20', '--leap', ...base], 1, '農曆 2023 年沒有閏 3 月'],
    [['--date', '1984-11-20', '--time', '10:00', '--gender', '男', '--lon', '121.5'], 1, '自訂出生地：請填標準時區'],
  ];
  const bad = cases.map(([args, code, msg]) => [args.join(' '), run(args), code, msg]).filter(([, r, code, msg]) => r.code !== code || !r.err.includes(msg) || r.out !== '');
  for (const [args, r, code, msg] of bad) console.log(`    ${args}｜狀態碼 ${r.code}（應為 ${code}），訊息：${r.err.trim()}（應含「${msg}」）`);
  eq(bad.length, 0, `${cases.length} 種錯誤，狀態碼或訊息不對的`);
  // 看的那一天還沒出生、或已過了列出的運限：兩邊各寫一句說明，不疊運限
  const note = '這一天不在列出的運限範圍內（還沒出生，或已過了第十個大限），沒有疊運限。';
  const young = run(['--date', '2024-03-01', '--time', '08:00', '--gender', '男', '--place', '高雄', '--at', '2020-01-01']);
  const old = run(['--date', '1900-03-01', '--time', '08:00', '--gender', '女', '--place', '台北', '--at', '2026-11-18']);
  eq([block(young.out, '【八字運限】'), block(young.out, '【紫微運限】')], [['【八字運限】2020-01-01', '這一天還沒出生。'], ['【紫微運限】', note]], '--at 在出生之前');
  eq([block(old.out, '【八字運限】'), block(old.out, '【紫微運限】')], [['【八字運限】2026-11-18', '這一天已經走完十步大運，沒有可列的運限。'], ['【紫微運限】', note]], '--at 已過了十步大運與第十個大限');
  // 西經、西半球的時區可以照一般的寫法給負數
  const west = run(['--date', '1975-04-29', '--time', '05:57', '--gender', '女', '--lon', '-71.06', '--tz', '-5']);
  ok(west.code === 0 && west.out.includes('出生：1975-04-29 05:57（西經 71.06°，當時鐘錶 UTC−5）'), '--lon -71.06 --tz -5（西經、UTC−5）');
}

section('不給的設定和網頁的預設相同');
{
  // 預設值照頁面的教材範例盤（也就是表單一開始的樣子）。每張盤都挑對那一項設定敏感的生日：換一個值，盤就不同
  const D = { clock: SAMPLE.clock, zi: SAMPLE.ziRule, 'zw-hua': SAMPLE.zwHua, 'zw-year': SAMPLE.zwYear, 'zw-leap': SAMPLE.zwLeap };
  const charts = [
    [['--date', '1979-07-15', '--time', '23:30', '--gender', '女', '--place', '台北'], 'clock', 'std'], // 夏令時間：自動換算減一小時
    [['--date', '1984-11-20', '--time', '23:20', '--gender', '男', '--place', '台北'], 'zi', 'same'], // 晚子時
    [['--date', '1980-06-01', '--time', '10:00', '--gender', '男', '--place', '台北'], 'zw-hua', 'zhongzhou'], // 庚申年：庚干四化各家不同
    [['--date', '1985-02-10', '--time', '10:00', '--gender', '男', '--place', '台北'], 'zw-year', 'lichun'], // 立春之後、正月初一之前
    [['--lunar', '2023-2-20', '--leap', '--time', '10:00', '--gender', '女', '--place', '台北'], 'zw-leap', 'current'], // 閏二月二十
  ];
  for (const [args, k, other] of charts) {
    const bare = run(args).out, explicit = run([...args, ...Object.entries(D).flatMap(([f, x]) => [`--${f}`, x])]).out, changed = run([...args, `--${k}`, other]).out;
    ok(bare && bare === explicit && bare !== changed, `--${k}：不給和給 ${D[k]} 印的相同，給 ${other} 就不同`);
  }
  ok(SAMPLE.useTST === false && run(charts[0][0]).out.includes('未校正真太陽時'), '真太陽時預設不校正');
}

section('輸出不隨執行環境的時區改變');
{
  const args = ['--date', '1979-07-15', '--time', '23:30', '--gender', '女', '--place', '台北', '--at', '2026-11-18'];
  const outs = ['Asia/Taipei', 'UTC', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata'].map(tz => run(args, tz).out);
  ok(outs[0].includes('已換回') && outs[0].includes('【紫微運限】'), '用的是一張有夏令時間換算、疊了運限的盤');
  eq(outs.map(o => o === outs[0]), [true, true, true, true, true], '台北、UTC、洛杉磯、奧克蘭、加爾各答印的相同');
}

section(`--at 選的運限：隨機 40 張盤，各挑一天（種子 ${SEED}），另外算一次`);
{
  const { rnd, pick, rndBirth } = seeded(SEED);
  const problems = []; let checked = 0, beyond = 0, beyondBz = 0, jieDays = 0, yunDays = 0, lichunDays = 0;
  for (let c = 0; c < 40; c++) {
    const o = rndBirth(1930, 2015), gender = pick(['男', '女']), zwLeap = pick(PP.ZW_OPTIONS.leap);
    const chart = chartOf({ ...o, gender, zwLeap, clock: 'std' });
    // 看的那一天：多半隨便挑；也專挑交節、交運、立春的當天與前一天（以整天計，當天就算新的）
    const shift = (date, k) => { const t = new Date(Date.parse(date + 'T00:00:00Z') + k * 864e5); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
    const y0 = Math.max(2000, o.y + 1), y1 = Math.max(y0, 2040); // 出生之後；出生之前的那一天另外測
    let at = `${rnd(y0, y1)}-${pad(rnd(1, 12))}-${pad(rnd(1, 28))}`;
    const kind = c % 4;
    if (kind === 1) { const m = PP.bzLiuYue(chart.bz, rnd(y0, y1))[rnd(0, 11)]; at = shift(m.from, rnd(-1, 0)); jieDays++; }
    if (kind === 2) { const d = chart.bz.dayun[rnd(1, 4)]; at = shift(d.startDate, rnd(-1, 0)); yunDays++; }
    if (kind === 3) { const m = PP.bzLiuYue(chart.bz, rnd(y0, y1))[0]; at = shift(m.from, rnd(-1, 0)); lichunDays++; }
    const tag = `${o.y}-${pad(o.m)}-${pad(o.d)} ${pad(o.h)}:${pad(o.mi)} ${gender} --at ${at}`;
    const r = run(['--date', `${o.y}-${pad(o.m)}-${pad(o.d)}`, '--time', `${pad(o.h)}:${pad(o.mi)}`, '--gender', gender, '--place', '台北', '--clock', 'std', '--zw-leap', zwLeap, '--at', at]);
    if (r.code) { problems.push(`${tag}｜狀態碼 ${r.code}：${r.err}`); continue; }
    const [y, m, d] = at.split('-').map(Number), lunar = Solar.fromYmdHms(y, m, d, 23, 59, 0).getLunar();
    const B = block(r.out, '【八字運限】'), Z = block(r.out, '【紫微運限】');
    // 八字：流年、流月對 lunar-javascript 的精確干支（23:59 時，看交節時刻）；大運對交運日
    const D = chart.bz.dayun.find(x => x.startDate <= at && at < x.endDate);
    if (at >= chart.bz.dayun[9].endDate) { // 十步大運都走完了：命令列寫一句說明
      if (B[1] !== '這一天已經走完十步大運，沒有可列的運限。') { problems.push(`${tag}｜八字：十步大運在 ${chart.bz.dayun[9].endDate} 走完，命令列卻寫 ${B[1]}`); continue; }
      beyondBz++;
    } else {
      const want = [`【八字運限】${at}`, D ? `大運 ${D.gz}（` : `大運 還沒起運`, `流年 `, `流月 ${lunar.getMonthInGanZhiExact()}（`];
      const got = [B[0], B[1].slice(0, want[1].length), B[2].slice(0, 3), B[3].slice(0, want[3].length)];
      const lnGZ = B[2].split(' ')[2]?.slice(0, 2);
      if (JSON.stringify(got) !== JSON.stringify(want) || lnGZ !== lunar.getYearInGanZhiExact()) { problems.push(`${tag}｜八字：${B.slice(0, 4).join(' / ')}；應為大運 ${D?.gz ?? '起運前'}、流年 ${lunar.getYearInGanZhiExact()}、流月 ${lunar.getMonthInGanZhiExact()}`); continue; }
    }
    // 紫微：流年是農曆年；流月的起訖包含這一天、月份是這一天的農曆月；流日是這一天、日名是農曆的日
    const age = lunar.getYear() - chart.zw.birthYear + 1;
    // 列出的運限是童限加十個大限；超過的那幾年，命令列寫一句說明、不疊運限
    if (!PP.zwSpans(chart.zw).slice(0, 11).some(sp => age >= sp.ages[0] && age <= sp.ages[1])) {
      if (Z[1] !== '這一天不在列出的運限範圍內（還沒出生，或已過了第十個大限），沒有疊運限。') problems.push(`${tag}｜紫微：${age} 歲已過了第十個大限，命令列卻寫 ${Z[1]}`);
      else { checked++; beyond++; }
      continue;
    }
    const yr = Z.find(l => l.startsWith('流年 ')), mo = Z.find(l => l.startsWith('流月 ')), day = Z.find(l => l.startsWith('流日 ')), dec = Z[1];
    const mm = /^流月 (\S+) (\S\S)（([^）]+) 到 ([^）]+)）/.exec(mo || ''), dm = /^流日 (\S+) (\S\S)（([^）]+)）/.exec(day || '');
    const leapName = (lunar.getMonth() < 0 ? '閏' : '') + LM[Math.abs(lunar.getMonth()) - 1]; // 頁面寫「十一月」「十二月」，不是函式庫的「冬月」「腊月」
    const zwOk = yr?.startsWith(`流年 ${lunar.getYear()} ${PP.yearGZ(lunar.getYear())}（${age} 歲）`) && mm && mm[3] <= at && at <= mm[4] && mm[1].startsWith(leapName) &&
      dm && dm[1] === lunar.getDayInChinese() && dm[3] === at && dm[2] === lunar.getDayInGanZhi() &&
      (dec.startsWith('童限 ') ? dec.startsWith(`童限 ${age} 歲`) : (() => { const [a0, a1] = /^大限 (\d+)–(\d+) 歲/.exec(dec).slice(1).map(Number); return a0 <= age && age <= a1; })());
    if (!zwOk) { problems.push(`${tag}｜紫微：${[dec, yr, mo, day].map(l => (l || '（沒有）').split('，')[0]).join(' / ')}；應為農曆 ${lunar.getYear()} 年${leapName}${lunar.getDayInChinese()}，${age} 歲`); continue; }
    checked++;
  }
  for (const p of problems) console.log('    ' + p);
  eq(problems.length, 0, '選錯的盤數');
  ok(checked === 40 && beyond + beyondBz <= 6 && jieDays >= 8 && yunDays >= 8 && lichunDays >= 8, `40 張都比到了（${checked} 張，其中八字走完十步大運 ${beyondBz}、紫微已過第十個大限 ${beyond}；交節前後 ${jieDays}、交運前後 ${yunDays}、立春前後 ${lichunDays}）`);
}

finish();
