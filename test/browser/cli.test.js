/* 瀏覽器測試（命令列對畫面）：node test/browser/cli.test.js [種子]。先跑 node scripts/build.js。
   scripts/paipan.js 印的文字盤，要和頁面上按「複製文字盤」得到的逐字相同。隨機排幾十張盤——公曆與農曆、閏月出生、清單上的地名與自訂經度時區、
   歷史上的夏令時間、真太陽時、兩種子時立場、流派設定、生在立春和正月初一之間——每張比三件事：
     1. 本命盤：命令列不加 --at，和頁面的文字盤相同
     2. 頁面按「看今天」之後的文字盤，和命令列加 --at（測試時鐘的那一天）印的相同；命令列多出來的八字運限那一段先拿掉再比
     3. 八字運限那一段：寫的那一格運、流年、流月，就是八字分頁上標「今」的那幾格；點了那個流月之後，關係列的標題與每一筆，和那一段寫的相同
   命令列故意在另一個時區（洛杉磯）執行：輸出不可以跟著執行環境的時區變。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import '../helpers/libs.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, blockClipboard, root } from '../helpers/browser.js';
import { seeded } from '../helpers/random.js';
import { PLACE } from '../../src/app/places.js';
import { inputFrom } from '../../src/app/form.js';
import { ZW_OPTIONS, resolveTime, ziwei } from '../../src/engine/index.js';

const SEED = Number(process.argv[2]) || 2026111802;
const CHARTS = 40;
const TODAY = '2026-11-11'; // 瀏覽器測試的固定時鐘（helpers/browser.js）是這一天
const pad = n => String(n).padStart(2, '0');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-cli-'));
const harness = writeHarness(dir);
const CLI = path.join(root, 'scripts', 'paipan.js');

// 命令列：狀態碼與輸出。生辰有誤時（狀態碼 1）回傳 stderr 的訊息
function cli(args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env: { ...process.env, TZ: 'America/Los_Angeles' }, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) { return { code: e.status, out: e.stdout, err: e.stderr }; }
}
// 一組表單的值 → 命令列參數
const argsOf = v => [
  ...(v.calendar === 'lunar' ? ['--lunar', `${v.ly}-${v.lm}-${v.ld}`, ...(v.leap ? ['--leap'] : [])] : ['--date', v.date]),
  '--time', v.time, '--gender', v.gender,
  ...(v.place === 'custom' ? ['--lon', v.lon, '--tz', v.tz] : ['--place', v.place]),
  '--clock', v.clock, ...(v.tst === '1' ? ['--tst'] : []), '--zi', v.zi, '--zw-hua', v.zwHua, '--zw-year', v.zwYear, '--zw-leap', v.zwLeap,
  ...(v.name ? ['--name', v.name] : []),
];
// 文字盤裡的一段（以空行分隔、以【…】開頭）拿掉
const dropBlock = (text, head) => text.split('\n\n').filter(b => !b.startsWith(head)).join('\n\n');

// 頁面的表單填上一組值、送出；回傳錯誤訊息（沒有錯誤是空字串）
async function fill(page, v) {
  await page.evaluate(x => {
    const $ = s => document.querySelector(s);
    const set = (sel, val) => { const el = $(sel); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); };
    $(x.gender === '男' ? '#g-m' : '#g-f').click();
    $(x.calendar === 'lunar' ? '#c-l' : '#c-s').click();
    set('#nm', x.name); set('#place', x.place);
    if (x.place === 'custom') { set('#lon', x.lon); set('#tz', x.tz); }
    set('#clock', x.clock); set('#tst', x.tst); set('#zi', x.zi); set('#zhua', x.zwHua); set('#zyear', x.zwYear); set('#zleap', x.zwLeap); set('#time', x.time);
    if (x.calendar === 'lunar') { set('#ly', x.ly); set('#lm', x.lm); set('#ld', x.ld); if ($('#leap').checked !== x.leap) $('#leap').click(); } else set('#date', x.date);
    $('#f').requestSubmit();
  }, v);
  return page.evaluate(() => (document.querySelector('#err').hidden ? '' : document.querySelector('#err').textContent));
}
// 按「複製文字盤」：剪貼簿已用 blockClipboard 擋掉，內容會出現在備用文字框。先清掉上一次的，免得讀到舊的
async function copied(page) {
  await page.evaluate(() => { const b = document.querySelector('#copyfallback'); b.innerHTML = ''; b.hidden = true; });
  await page.locator('#copy').click();
  await page.waitForSelector('#copytext');
  return page.locator('#copytext').inputValue();
}
// 八字分頁上：選到的運、流年，標「今」的運與流月，以及關係列（標題與每一筆，寫成和文字盤相同的樣子）
const readBazi = page => page.evaluate(() => {
  const one = s => document.querySelector(s), tc = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const rows = [...document.querySelectorAll('#ix .rel')].map(r => { const wh = tc(r.querySelector('.wh')), k = wh.lastIndexOf(' '); return `${tc(r.querySelector('.tx'))}（${wh.slice(0, k)}，${wh.slice(k + 1)}）`; });
  return {
    dy: one('#dayun [aria-pressed="true"]')?.dataset.dy ?? null, nowDy: one('#dayun .now')?.parentElement.dataset.dy ?? null,
    ln: one('#liunian [aria-pressed="true"]')?.dataset.ln ?? null, nowLm: one('#liuyue .now')?.parentElement.dataset.lm ?? null,
    lm: one('#liuyue [aria-pressed="true"]')?.dataset.lm ?? null, title: one('#ix-title').textContent, rels: rows.join('；') || tc(one('#ix .empty')),
    // 按鈕上看得到的字：上面的十神（干）、干支、下面的十神（支本氣）、年或節氣、歲數或日期
    lnTitle: tc(one('#ln-title')),
    dyBtn: btnOf(one('#dayun [aria-pressed="true"]')), lnBtn: btnOf(one('#liunian [aria-pressed="true"]')), lmBtn: btnOf(one('#liuyue .now')?.parentElement),
    gz: [...document.querySelectorAll('#liuyue .yun')].map(b => [...b.querySelectorAll('.c')].map(c => c.textContent).join('')),
  };
  function btnOf(b) { if (!b) return null; const g = [...b.querySelectorAll('.g')].map(tc); return { top: g[0], gz: [...b.querySelectorAll('.c')].map(c => c.textContent).join(''), bottom: g[1], y: tc(b.querySelector('.y')), a: tc(b.querySelector('.a')) }; }
});

section(`命令列對畫面：${CHARTS} 張隨機的盤（種子 ${SEED}）`);
{
  const { rand, rnd, pick, rndBirth } = seeded(SEED);
  const names = [...PLACE.keys()];
  // 立春和正月初一之間的一天（年界設成立春時，生年和農曆年不同）
  const between = () => {
    for (;;) {
      const y = rnd(1901, 2099), lc = Solar.fromYmd(y, 6, 1).getLunar().getJieQiTable()['立春'], ny = Lunar.fromYmd(y, 1, 1).getSolar();
      const a = Date.UTC(y, 1, lc.getDay()), b = Date.UTC(y, ny.getMonth() - 1, ny.getDay());
      if (a === b) continue;
      const t = new Date(Math.min(a, b) + rnd(0, Math.abs(a - b) / 864e5 - 1) * 864e5);
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }
  };
  const browser = await launch();
  const { ctx, page, errors } = await openPage(browser, harness, { init: [blockClipboard] });
  await page.locator('#t-ziwei').click();
  const problems = [];
  const seen = { lunar: 0, leapBirth: 0, custom: 0, shifted: 0, tst: 0, lateZi: 0, lichunMoved: 0, today: 0, noToday: 0, pre: 0, lm: 0, warns: 0, names: 0, opts: new Set() };
  for (let c = 0; c < CHARTS && problems.length < 6; c++) {
    let o = rndBirth();
    // 幾種特別挑的生日：台灣與大陸實施夏令時間的年代、晚子時、立春和正月初一之間、閏月、測試那一天還沒起運的小孩
    if (c % 7 === 1) o = { ...o, y: rnd(1946, 1979), m: rnd(5, 9), d: rnd(1, 28) };
    if (c % 7 === 2) o = { ...o, y: rnd(1986, 1991), m: rnd(5, 8), d: rnd(1, 28) };
    if (c % 7 === 3) o = { ...o, h: 23 };
    if (c % 7 === 4) o = { ...o, ...between() };
    if (c % 7 === 5) {
      let ly; do { ly = rnd(1900, 2099); } while (!LunarYear.fromYear(ly).getLeapMonth());
      const s = Lunar.fromYmd(ly, -LunarYear.fromYear(ly).getLeapMonth(), pick([3, 15, 16, 22])).getSolar();
      o = { ...o, y: s.getYear(), m: s.getMonth(), d: s.getDay() };
    }
    if (c % 7 === 6) o = { ...o, y: rnd(2021, 2025) };
    const custom = c % 6 === 0;
    const place = c % 7 === 1 ? '台北' : c % 7 === 2 ? pick(['上海', '北京', '深圳', '廣州']) : pick(names);
    const v = {
      name: rand() < 0.3 ? `測試${c}` : '', gender: pick(['男', '女']), calendar: c % 3 === 1 || c % 7 === 5 ? 'lunar' : 'solar',
      date: `${o.y}-${pad(o.m)}-${pad(o.d)}`, time: `${pad(o.h)}:${pad(o.mi)}`, ly: '', lm: '', ld: '', leap: false,
      place: custom ? 'custom' : place, lon: custom ? String(Math.round((rand() * 360 - 180) * 100) / 100) : '', tz: custom ? String(pick([-5, 0, 5.5, 8, 9])) : '',
      clock: custom ? pick(['std', 'dst']) : rand() < 0.8 ? 'auto' : pick(['std', 'dst']), tst: rand() < 0.3 ? '1' : '0', zi: pick(['next', 'same']),
      zwHua: pick(ZW_OPTIONS.hua), zwYear: c % 7 === 4 ? 'lichun' : pick(ZW_OPTIONS.year), zwLeap: pick(ZW_OPTIONS.leap),
    };
    if (v.calendar === 'lunar') {
      const l = Solar.fromYmd(o.y, o.m, o.d).getLunar();
      Object.assign(v, { ly: String(l.getYear()), lm: String(Math.abs(l.getMonth())), ld: String(l.getDay()), leap: l.getMonth() < 0 });
    }
    const tag = `${v.calendar === 'lunar' ? `農曆 ${v.ly}-${v.lm}-${v.ld}${v.leap ? '（閏）' : ''}` : v.date} ${v.time} ${v.gender} ${v.place}${custom ? ` ${v.lon}/${v.tz}` : ''} ${v.clock} tst=${v.tst} ${v.zi} ${v.zwHua}/${v.zwYear}/${v.zwLeap}`;

    const err = await fill(page, v), base = cli(argsOf(v));
    if (err || base.code) { problems.push(`${tag}｜頁面${err ? `出錯：${err}` : '排好了'}，命令列${base.code ? `出錯（${base.code}）：${base.err}` : '排好了'}`); continue; }
    // 1. 本命盤
    await page.locator('#decs [data-dec=""]').click();
    const pageBase = await copied(page);
    if (pageBase !== base.out.replace(/\n$/, '')) { problems.push(`${tag}｜本命盤的文字盤不同：\n${diffLine(pageBase, base.out)}`); continue; }
    { // 這張盤用到了哪些情況（用引擎直接算，不從文字盤裡猜）
      const inp = inputFrom(v), rt = resolveTime(inp), zw = ziwei(inp, rt), ld = zw.chart.rawDates.lunarDate;
      if (v.calendar === 'lunar') seen.lunar++;
      if (ld.isLeap) seen.leapBirth++;
      if (custom) seen.custom++;
      if (rt.shiftMin) seen.shifted++;
      if (v.tst === '1') seen.tst++;
      if (rt.lateZi) seen.lateZi++;
      if (zw.birthYear !== ld.lunarYear) seen.lichunMoved++;
      if (/【提醒】/.test(base.out)) seen.warns++;
      if (v.name) seen.names++;
      seen.opts.add(`${v.zwHua}/${v.zwYear}/${v.zwLeap}`);
    }
    // 2. 看今天
    const at = cli([...argsOf(v), '--at', TODAY]);
    if (at.code) { problems.push(`${tag}｜命令列 --at 出錯（${at.code}）：${at.err}`); continue; }
    const cliZw = dropBlock(at.out.replace(/\n$/, ''), '【八字運限】');
    if (await page.locator('#decs [data-today]').count()) {
      await page.locator('#decs [data-today]').click();
      const pageToday = await copied(page);
      if (pageToday !== cliZw) { problems.push(`${tag}｜看今天之後的文字盤不同：\n${diffLine(pageToday, cliZw)}`); continue; }
      seen.today++;
    } else {
      // 頁面沒有「看今天」（還沒出生、或已過第十個大限）：命令列寫一句說明，其餘和本命盤相同
      if (dropBlock(cliZw, '【紫微運限】\n這一天不在') !== pageBase) { problems.push(`${tag}｜沒有「看今天」時，命令列除了說明之外應和本命盤相同`); continue; }
      seen.noToday++;
    }
    // 3. 八字運限
    const block = at.out.split('\n\n').find(b => b.startsWith('【八字運限】')).split('\n');
    let bz = await readBazi(page);
    if (bz.nowDy === null) {
      // 今天不在十一格運的範圍內：頁面沒有標「今」的運，命令列說還沒出生或已經走完
      if (block.length !== 2 || !/還沒出生|走完十步大運/.test(block[1])) problems.push(`${tag}｜頁面沒有標「今」的運，命令列卻寫了：${block.slice(1).join(' / ')}`);
      continue;
    }
    if (bz.dy !== bz.nowDy) { problems.push(`${tag}｜新排的盤，頁面選到的運（${bz.dy}）不是標「今」的那一格（${bz.nowDy}）`); continue; }
    // 大運、流年兩行：照頁面上選到的那兩顆按鈕與流年列標題上的字組出來，要和命令列逐字相同
    const { dyBtn: D, lnBtn: N } = bz, when = /約 (\S+) 交入、(\S+) 交出/.exec(bz.lnTitle), start = /約 (\S+) 起運/.exec(bz.lnTitle);
    const dyLine = bz.dy === '-1' ? `大運 還沒起運，約 ${start?.[1]} 起運` : `大運 ${D.gz}（干${D.top}、支${D.bottom}）：約 ${when?.[1]} 交入、${when?.[2]} 交出，${D.a}`;
    const lnLine = `流年 ${N.y} ${N.gz}（干${N.top}、支${N.bottom}）：${N.a}`;
    if (block[1] !== dyLine || block[2] !== lnLine) { problems.push(`${tag}｜大運、流年：頁面 ${dyLine} / ${lnLine}，命令列 ${block[1]} / ${block[2]}`); continue; }
    if (bz.nowLm === null) { if (!block[3].startsWith('流月 這一天')) problems.push(`${tag}｜頁面沒有標「今」的流月，命令列寫 ${block[3]}`); continue; }
    const M = bz.lmBtn, lmHead = `流月 ${M.gz}（干${M.top}、支${M.bottom}）：`;
    if (!block[3].startsWith(lmHead)) { problems.push(`${tag}｜流月：頁面標「今」的是 ${lmHead}，命令列 ${block[3]}`); continue; }
    await page.evaluate(k => document.querySelector(`#liuyue [data-lm="${k}"]`).click(), bz.nowLm);
    bz = await readBazi(page);
    // 頁面的關係列標題：「{哪幾柱} 與原局 {範圍}。{流月}月{從哪一刻到哪一刻}」；命令列把後半寫在流月那一行
    const t = /^(.*) 與原局 (.*?)。(..)月(從 .*為止)$/.exec(bz.title);
    if (!t) { problems.push(`${tag}｜點了流月之後，關係列標題的樣子不對：${bz.title}`); continue; }
    eq([block[3].split('：')[1], block[4]], [t[4], `${t[1]}與原局（${t[2]}）：${bz.rels}`], `${tag}｜流月的起訖與運歲流月的關係`);
    seen.lm++;
    if (bz.dy === '-1') seen.pre++;
  }
  for (const p of problems) console.log('    ' + p);
  eq(problems.length, 0, '命令列和頁面不同的盤數');
  const cover = `看今天 ${seen.today} 張、沒有看今天 ${seen.noToday} 張、八字流月 ${seen.lm} 張（起運前 ${seen.pre}）；農曆輸入 ${seen.lunar}、閏月出生 ${seen.leapBirth}、` +
    `自訂地點 ${seen.custom}、鐘錶換算過 ${seen.shifted}、真太陽時 ${seen.tst}、晚子時 ${seen.lateZi}、立春年界改了生年 ${seen.lichunMoved}、有提醒 ${seen.warns}、有姓名 ${seen.names}、流派設定組合 ${seen.opts.size} 種`;
  console.log(`  ${cover}`);
  ok(seen.today >= 20 && seen.noToday >= 3 && seen.lm >= 20 && seen.lunar >= 8 && seen.leapBirth >= 2 && seen.custom >= 3 && seen.shifted >= 4 && seen.tst >= 5 && seen.lateZi >= 2 &&
    seen.lichunMoved >= 2 && seen.warns >= 10 && seen.names >= 5 && seen.pre >= 1 && seen.opts.size >= 12,
  `各種情況都要比到，實際是：${cover}`);
  eq(errors, [], '頁面沒有丟出例外');
  await ctx.close(); await browser.close();
}

// 兩段文字第一處不同的那一行
function diffLine(a, b) {
  const x = a.split('\n'), y = b.replace(/\n$/, '').split('\n'), i = x.findIndex((l, k) => l !== y[k]);
  return `      第 ${(i < 0 ? x.length : i) + 1} 行\n      頁面：${x[i] ?? '（沒有）'}\n      命令列：${y[i < 0 ? x.length : i] ?? '（沒有）'}`;
}

finish();
