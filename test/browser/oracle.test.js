/* 瀏覽器測試（畫面對引擎）：node test/browser/oracle.test.js [種子]。先跑 node scripts/build.js。
   快照測的是「畫面和上次一樣」，這一支測的是「畫面和引擎一樣」：隨機排幾十張盤（含各種流派設定、閏月出生、
   生在立春和正月初一之間），隨機點運限與宮位，每一步把畫面上顯示的東西和引擎用同一組輸入算出來的結果逐項比對——
   紫微：運限四排的籤、十二宮每一格的星曜與亮度、生年與各層四化、流曜、各層宮名、小限、十二神、三方四正的標示、中宮的運限說明；
   八字：四柱、十一格運、流年、十二個流月、原局關係、運歲與流月的關係。
   比對的一邊是頁面的畫法（src/app），另一邊是這裡照引擎的輸出另外組出來的，兩邊各寫各的。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage } from '../helpers/browser.js';
import { seeded } from '../helpers/random.js';
import { chartOf } from '../helpers/charts.js';

const SEED = Number(process.argv[2]) || 2026111801;
const CHARTS = 36, STEPS = 11;
const TODAY = '2026-11-11', ZW_YEAR = 2026, BZ_YEAR = 2026; // 測試用的固定時鐘：農曆丙午年十月初三，立春年也是 2026
const HUA = ['祿', '權', '科', '忌'];
const span = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const monthDay = date => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; };
const pad = n => String(n).padStart(2, '0');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-oracle-'));
const harness = writeHarness(dir);

/* 畫面上讀到的東西，整理成單純的資料 */
const readPage = page => page.evaluate(() => {
  const all = (el, s) => [...el.querySelectorAll(s)], one = s => document.querySelector(s);
  const tx = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const pressed = (row, attr) => { const b = one(`${row} [aria-pressed="true"][${attr}]`); return b ? b.getAttribute(attr) : null; };
  const kid = (el, s) => tx(el.querySelector(`:scope > ${s}`));
  const sel = one('#zw .cell.sel');
  return {
    err: !one('#err').hidden,
    state: { dec: pressed('#decs', 'data-dec'), yr: pressed('#yrs', 'data-yr'), mo: pressed('#mos', 'data-mo'), day: pressed('#days', 'data-day'), pal: sel ? Number(sel.dataset.pal) : null,
      dy: pressed('#dayun', 'data-dy'), ln: pressed('#liunian', 'data-ln'), lm: pressed('#liuyue', 'data-lm') },
    hidden: ['#yrs', '#mos', '#days'].map(s => one(s).hidden),
    decs: all(document, '#decs [data-dec]').map(b => [b.getAttribute('data-dec'), tx(b), b.classList.contains('cur')]),
    yrs: all(document, '#yrs [data-yr]').map(b => [b.getAttribute('data-yr'), tx(b), b.classList.contains('cur')]),
    mos: all(document, '#mos [data-mo]').map(b => [b.getAttribute('data-mo'), kid(b, 'small'), kid(b, 'span:not(.nowmark)'), b.classList.contains('cur')]),
    days: all(document, '#days [data-day]').map(b => [b.getAttribute('data-day'), kid(b, 'small'), kid(b, 'span:not(.nowmark)'), kid(b, 'b'), b.classList.contains('cur')]),
    cells: all(document, '#zw .cell').map(c => ({
      i: Number(c.dataset.pal), sel: c.classList.contains('sel'), role: tx(c.querySelector('.rolemark')),
      stars: all(c, '.st').map(s => [tx(s.querySelector('.n')), tx(s.querySelector('.br')), all(s, '.hua').map(tx).join(',')]),
      fst: all(c, '.fst').map(f => `${f.classList[1]}:${tx(f)}`), lys: all(c, '.ly').map(l => `${l.classList[1]}:${tx(l)}`),
      gods: all(c, '.foot .l > span').map(tx), name: tx(c.querySelector('.pn')), range: tx(c.querySelector('.dr')), gz: tx(c.querySelector('.gzv')),
    })),
    center: all(document, '#zw .center .cyun > span').map(s => [s.className, tx(s)]),
    facts: Object.fromEntries(all(document, '#zw .center dt').map(dt => [tx(dt), tx(dt.nextElementSibling)])),
    // 八字分頁（不在畫面上也照樣畫好了）
    gz: tx(one('#bz-sub')),
    dayun: all(document, '#dayun .yun').map(b => [b.dataset.dy, all(b, '.g').map(tx).join('|'), all(b, '.c').map(tx).join(''), tx(b.querySelector('.y')), tx(b.querySelector('.a')), !!b.querySelector('.now')]),
    liunian: all(document, '#liunian .yun').map(b => [b.dataset.ln, all(b, '.g').map(tx).join('|'), all(b, '.c').map(tx).join(''), tx(b.querySelector('.y')), tx(b.querySelector('.a')), b.classList.contains('edge'), !!b.querySelector('.now')]),
    liuyue: all(document, '#liuyue .yun').map(b => [b.dataset.lm, all(b, '.g').map(tx).join('|'), all(b, '.c').map(tx).join(''), tx(b.querySelector('.y')), tx(b.querySelector('.a')), tx(b.querySelector('.vh')), !!b.querySelector('.now')]),
    rels: all(document, '#rels .rel').map(r => [tx(r.querySelector('.ty')), tx(r.querySelector('.tx')), tx(r.querySelector('.wh')), tx(r.querySelector('.nt'))]),
    ix: all(document, '#ix .rel').map(r => [tx(r.querySelector('.ty')), tx(r.querySelector('.tx')), tx(r.querySelector('.wh')), tx(r.querySelector('.nt'))]),
  };
});

/* 同一個狀態下，照引擎的輸出，畫面「應該」顯示什麼。st 是畫面上目前選到的（各排按下去的那一顆、選到的宮） */
function expected({ bz, zw }, st) {
  const P = zw.chart.palaces, spans = PP.zwSpans(zw).slice(0, 11);
  const dec = st.dec === null || st.dec === '' ? null : st.dec === 'child' ? 'child' : Number(st.dec);
  const yr = st.yr === null ? null : Number(st.yr), age = yr === null ? null : yr - zw.birthYear + 1;
  const sp = dec === null ? null : spans.find(s => (dec === 'child' ? s.child : s.palace === dec));
  const months = dec === null || yr === null ? [] : PP.zwLiuYue(zw, yr), mo = st.mo === null ? null : months[Number(st.mo)];
  const days = mo ? PP.zwLiuRi(zw, mo) : [], day = st.day === null ? null : days.find(x => x.day === Number(st.day));
  const L = dec === null ? null : {
    dec: dec === 'child' ? PP.zwTongXian(zw, age) : PP.zwDaXian(zw, dec), yr: yr === null ? null : PP.zwLiuNian(zw, yr),
    xiao: age === null ? null : PP.zwXiaoXian(zw, age), mo, day,
  };
  const stack = !L ? [] : [['dec', dec === 'child' ? '童' : '大', L.dec], ['yr', '年', L.yr], ['mo', '月', L.mo], ['day', '日', L.day]].filter(x => x[2]);
  const curAge = ZW_YEAR - zw.birthYear + 1, curSpan = spans.find(s => curAge >= s.ages[0] && curAge <= s.ages[1]);
  const now = (cur, text) => (cur ? `今${text}` : text); // 今天所在的那一顆，前面多一個「今」
  const role = i => (st.pal === null ? '' : i === (st.pal + 6) % 12 ? '對宮' : i === (st.pal + 4) % 12 || i === (st.pal + 8) % 12 ? '三合' : '');
  const hua = layer => layer.hua.map((n, k) => `${n}化${HUA[k]}`).join('、');
  const center = !L ? [['muted', '目前是本命盤。點上方的大限、流年、流月、流日，一層一層疊上運限的宮名、四化和流曜。']] : [
    L.dec && ['d', dec === 'child' ? `童限 ${age} 歲 ${L.dec.gz}（${P[L.dec.index].name}）：${hua(L.dec)}` : `大限 ${span(...L.dec.ages)} 歲 ${L.dec.gz}：${hua(L.dec)}`],
    L.yr && ['yv', `流年 ${L.yr.year} ${L.yr.gz}：${hua(L.yr)}`],
    L.xiao && ['xv', `小限 ${age} 歲 ${L.xiao.gz}（${P[L.xiao.index].name}）：${hua(L.xiao)}`],
    L.mo && ['mv', `流月 ${L.mo.label} ${L.mo.gz}（${monthDay(L.mo.from)}–${monthDay(L.mo.to)}）：${hua(L.mo)}`],
    L.day && ['dv', `流日 ${L.day.label} ${L.day.gz}（${L.day.date}）：${hua(L.day)}`],
  ].filter(Boolean);
  // 八字：選到的那一格運（-1 是起運前）和流年
  const dy = Number(st.dy), pre = dy === -1, D = pre ? bz.pre : bz.dayun[dy], N = D.years.find(n => n.year === Number(st.ln));
  const sui = N && { pos: '歲', gan: N.gz[0], zhi: N.gz[1], natal: false };
  // 流月：選到的流年裡的十二個節氣月；選了一個月，運歲關係多接一柱
  const yue = N ? PP.bzLiuYue(bz, N.year) : [], M = st.lm === null ? null : yue[Number(st.lm)];
  const flow = [...(pre ? [] : [{ pos: '運', gan: D.gz[0], zhi: D.gz[1], natal: false }]), sui, ...(M ? [{ pos: '流月', gan: M.gz[0], zhi: M.gz[1], natal: false }] : [])];
  const relRow = r => [r.type, r.text, `${[...r.where].join('×')}${r.dist ? ` · ${r.dist}` : ''} ${r.tag}`, r.note];
  const step = [bz.pre, ...bz.dayun].findIndex(s => s.startDate <= TODAY && TODAY < s.endDate) - 1; // 今天走到哪一格；都不是的時候是 -2
  const last = D.years.length - 1;
  return {
    hidden: [!sp, !months.length, !days.length],
    decs: [['', '本命盤', false], ...spans.map(s => [s.child ? 'child' : String(s.palace), now(s === curSpan, `${span(...s.ages)} 歲${s.child ? '童限' : s.gz}`), s === curSpan])],
    yrs: !sp ? [] : Array.from({ length: sp.ages[1] - sp.ages[0] + 1 }, (_, k) => { const y = sp.years[0] + k; return [String(y), now(y === ZW_YEAR, `${y}${PP.yearGZ(y)} ${sp.ages[0] + k} 歲`), y === ZW_YEAR]; }),
    mos: months.map(m => [String(m.k), `${monthDay(m.from)} 起`, `${m.label}${m.gz}`, m.from <= TODAY && TODAY <= m.to]),
    days: days.map(d => [String(d.day), monthDay(d.date), d.label, d.gz, d.date === TODAY]),
    cells: P.map((p, i) => ({
      i, sel: i === st.pal, role: role(i),
      stars: p.majorStars.concat(p.minorStars, p.adjectiveStars).map(s => [s.name, s.brightness || '',
        (s.mutagen ? [s.mutagen] : []).concat(stack.filter(x => x[2].hua.includes(s.name)).map(x => x[1] + HUA[x[2].hua.indexOf(s.name)])).join(',')]),
      fst: stack.flatMap(x => x[2].stars[i].map(n => `${x[0]}:${n}`)),
      lys: stack.map(x => `${x[0]}:${x[1]}${x[2].names[i]}`).concat(L && L.xiao && L.xiao.index === i ? ['xiao:小限'] : []),
      gods: [p.changsheng12, p.boshi12, p.suiqian12, ...(L && L.yr ? [L.yr.sui12[i]] : []), p.jiangqian12, ...(L && L.yr ? [L.yr.jiang12[i]] : [])],
      name: p.name + (p.isBodyPalace ? '身' : ''), range: `${p.decadal.range[0]}–${p.decadal.range[1]}`, gz: p.heavenlyStem + p.earthlyBranch,
    })),
    center,
    gz: bz.gz.join(' '),
    dayun: [['-1', '起運前|', '——', bz.pre.endYear > bz.pre.startYear ? `${bz.pre.startYear}–${String(bz.pre.endYear).slice(-2)}` : `${bz.pre.startYear}`, bz.pre.endAge > 1 ? `1–${bz.pre.endAge} 歲` : '1 歲', step === -1],
      ...bz.dayun.map((d, i) => [String(i), `${d.ganGod}|${d.zhiGod}`, d.gz, `${d.startYear}–${String(d.endYear).slice(-2)}`, `${d.startAge}–${d.endAge} 歲`, step === i])],
    liunian: D.years.map((n, k) => [String(n.year), `${n.ganGod}|${n.zhiGod}`, n.gz, String(n.year), `${n.age} 歲`, k === last || (k === 0 && !pre), n.year === BZ_YEAR]),
    liuyue: yue.map(m => [String(m.k), `${m.ganGod}|${m.zhiGod}`, m.gz, m.jie, `${monthDay(m.from)} 起`, `${m.from} ${m.time} 交${m.jie}`, m.from <= TODAY && TODAY < m.to]),
    rels: bz.relations.map(relRow),
    ix: !N ? null : PP.relations(bz.P.concat(flow), true).map(relRow),
  };
}

// 兩邊哪幾項不同（只報項目名稱和第一處不同的內容）
function compare(got, want) {
  const out = [];
  for (const k of Object.keys(want)) {
    if (k === 'cells') {
      want.cells.forEach((w, i) => { for (const f of Object.keys(w)) if (JSON.stringify(got.cells[i]?.[f]) !== JSON.stringify(w[f])) out.push(`第 ${i} 宮的 ${f}：畫面 ${JSON.stringify(got.cells[i]?.[f])}，引擎 ${JSON.stringify(w[f])}`); });
    } else if (JSON.stringify(got[k]) !== JSON.stringify(want[k])) {
      const a = got[k] || [], b = want[k] || [], at = Array.isArray(b) ? b.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(a[i])) : -1;
      out.push(`${k}${at >= 0 ? `[${at}]` : ''}：畫面 ${JSON.stringify(at >= 0 ? a[at] : a).slice(0, 160)}，引擎 ${JSON.stringify(at >= 0 ? b[at] : b).slice(0, 160)}`);
    }
  }
  return out;
}

section(`畫面對引擎：${CHARTS} 張隨機的盤，每張隨機點 ${STEPS} 步（種子 ${SEED}）`);
{
  const { rnd, pick, rndBirth } = seeded(SEED);
  const browser = await launch();
  const { ctx, page, errors } = await openPage(browser, harness, {});
  await page.locator('#t-ziwei').click();
  const tapAny = async sel => { const n = await page.locator(sel).count(); if (n) await page.locator(sel).nth(rnd(0, n - 1)).click(); return n; };
  const actions = {
    點大限: () => tapAny('#decs [data-dec]'), 點流年: () => tapAny('#yrs [data-yr]'), 點流月: () => tapAny('#mos [data-mo]'), 點流日: () => tapAny('#days [data-day]'),
    點一個大限或童限: () => tapAny('#decs [data-dec]:not([data-dec=""])'), 點童限: () => page.locator('#decs [data-dec="child"]').click(),
    點有閏月的流年: async () => {
      const ys = (await page.locator('#yrs [data-yr]').evaluateAll(bs => bs.map(b => Number(b.dataset.yr)))).filter(y => LunarYear.fromYear(y).getLeapMonth());
      if (ys.length) await page.locator(`#yrs [data-yr="${pick(ys)}"]`).click();
    },
    // 閏月的那一段或兩段（月中分界時拆成上半、下半）：有才點
    點閏月: async () => { const b = page.locator('#mos [data-mo]').filter({ hasText: '閏' }); const n = await b.count(); if (n) await b.nth(rnd(0, n - 1)).click(); },
    看今天: async () => { const b = page.locator('#decs [data-today]'); if (await b.count()) await b.click(); },
    點宮位: () => tapAny('#zw .cell .pn'),
    // 八字分頁沒有顯示出來，直接送出點擊事件（畫面照樣重畫）
    點運: () => page.evaluate(k => { const b = document.querySelectorAll('#dayun .yun'); b[k % b.length].click(); }, rnd(0, 10)),
    點八字流年: () => page.evaluate(k => { const b = document.querySelectorAll('#liunian .yun'); b[k % b.length].click(); }, rnd(0, 11)),
    點八字流月: () => page.evaluate(k => { document.querySelectorAll('#liuyue .yun')[k].click(); }, rnd(0, 11)),
  };
  // 每張盤先一層一層疊到流日、點一個宮，後面再隨便點
  const opening = ['排盤', '點一個大限或童限', '點流年', '點流月', '點流日', '點宮位'];
  const openingLeap = ['排盤', '點一個大限或童限', '點有閏月的流年', '點閏月', '點流日', '點宮位']; // 每四張盤有一張專挑閏月的流月
  const openingChild = ['排盤', '點童限', '點流年', '點流月', '點流日', '點宮位'];                  // 再一張從童限疊起
  // 立春和正月初一之間的一天：年界設成立春時，這種生日的生年和農曆年不同
  const between = () => {
    for (;;) {
      const y = rnd(1901, 2099), lc = Solar.fromYmd(y, 6, 1).getLunar().getJieQiTable()['立春'], ny = Lunar.fromYmd(y, 1, 1).getSolar();
      const a = Date.UTC(y, 1, lc.getDay()), b = Date.UTC(y, ny.getMonth() - 1, ny.getDay());
      if (a === b) continue;
      const t = new Date(Math.min(a, b) + rnd(0, Math.abs(a - b) / 864e5 - 1) * 864e5);
      return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }
  };
  const names = ['點大限', '點一個大限或童限', '點流年', '點流年', '點流月', '點閏月', '點流日', '點流日', '看今天', '點宮位', '點運', '點八字流年', '點八字流月', '點八字流月'];
  const problems = []; let steps = 0, charts = 0;
  const seen = { dec: 0, child: 0, yr: 0, mo: 0, day: 0, leapHalf: 0, xiao: 0, natal: 0, lichunMoved: 0, leapBirth: 0, bzMonth: 0, bzPre: 0, opts: new Set() };
  for (let c = 0; c < CHARTS && problems.length < 6; c++) {
    let o = rndBirth();
    if (c % 6 === 1) { // 閏月出生
      let ly; do { ly = rnd(1900, 2099); } while (!LunarYear.fromYear(ly).getLeapMonth());
      const s = Lunar.fromYmd(ly, -LunarYear.fromYear(ly).getLeapMonth(), pick([3, 14, 15, 16, 22])).getSolar();
      o = { ...o, y: s.getYear(), m: s.getMonth(), d: s.getDay() };
    }
    if (c % 6 === 4) o = { ...o, ...between(), h: rnd(0, 22) };
    const inp = { ...o, clock: 'std', gender: pick(['男', '女']), ziRule: pick(['next', 'same']),
      zwHua: pick(PP.ZW_OPTIONS.hua), zwYear: c % 6 === 4 ? 'lichun' : pick(PP.ZW_OPTIONS.year), zwLeap: pick(PP.ZW_OPTIONS.leap) };
    const chart = chartOf(inp), tag = `${inp.y}-${pad(inp.m)}-${pad(inp.d)} ${pad(inp.h)}:${pad(inp.mi)} ${inp.gender} ${inp.ziRule} ${inp.zwHua}/${inp.zwYear}/${inp.zwLeap}`;
    await page.evaluate(v => {
      const set = (sel, val) => { const el = document.querySelector(sel); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); };
      document.querySelector(v.gender === '男' ? '#g-m' : '#g-f').click();
      set('#clock', 'std'); set('#zi', v.ziRule); set('#zhua', v.zwHua); set('#zyear', v.zwYear); set('#zleap', v.zwLeap); set('#time', v.time); set('#date', v.date);
    }, { gender: inp.gender, ziRule: inp.ziRule, zwHua: inp.zwHua, zwYear: inp.zwYear, zwLeap: inp.zwLeap, date: `${inp.y}-${pad(inp.m)}-${pad(inp.d)}`, time: `${pad(inp.h)}:${pad(inp.mi)}` });
    charts++; seen.opts.add(`${inp.zwHua}/${inp.zwYear}/${inp.zwLeap}`);
    if (chart.zw.birthYear !== chart.zw.chart.rawDates.lunarDate.lunarYear) seen.lichunMoved++;
    if (chart.zw.chart.rawDates.lunarDate.isLeap) seen.leapBirth++;
    for (let k = 0; k <= STEPS && problems.length < 6; k++) {
      const name = (c % 4 === 2 ? openingLeap : c % 4 === 1 ? openingChild : opening)[k] || pick(names);
      if (k) await actions[name]();
      const got = await readPage(page);
      steps++;
      if (got.err) { problems.push(`${tag}｜${name}：頁面顯示錯誤訊息`); break; }
      // 畫面上的基本資料先對：同一張盤才比得下去
      const facts = [got.facts.起盤?.slice(0, 10), got.facts.生年?.slice(0, 2), got.facts.五行局], wantFacts = [chart.zw.dateUsed, chart.zw.yearGZ, chart.zw.chart.fiveElementsClass];
      if (JSON.stringify(facts) !== JSON.stringify(wantFacts)) { problems.push(`${tag}｜${name}：中宮 ${facts.join(' ')}，引擎 ${wantFacts.join(' ')}`); break; }
      const st = got.state;
      if (st.dec === 'child' && st.yr === null) { problems.push(`${tag}｜${name}：選了童限卻沒有選到流年`); break; }
      const diff = compare(got, expected(chart, st));
      if (diff.length) problems.push(`${tag}｜第 ${k} 步 ${name}｜選到 ${JSON.stringify(st)}｜${diff.slice(0, 3).join('；')}`);
      if (st.dec === null || st.dec === '') seen.natal++; else if (st.dec === 'child') seen.child++; else seen.dec++;
      if (st.yr !== null) { seen.yr++; seen.xiao++; }
      if (st.mo !== null) { seen.mo++; if (/半/.test(got.mos.find(m => m[0] === st.mo)?.[2] || '')) seen.leapHalf++; }
      if (st.day !== null) seen.day++;
      if (st.lm !== null) seen.bzMonth++;
      if (st.dy === '-1') seen.bzPre++;
    }
  }
  for (const p of problems) console.log('    ' + p);
  eq(problems.length, 0, `${charts} 張盤共 ${steps} 步，畫面和引擎不同的步數`);
  ok(seen.dec > 150 && seen.child > 30 && seen.yr > 150 && seen.mo > 100 && seen.day > 50 && seen.leapHalf > 5 && seen.natal > 30 && seen.lichunMoved >= 5 && seen.leapBirth >= 5 && seen.opts.size >= 10 && seen.bzMonth > 25 && seen.bzPre > 5,
    `各種狀態都比到了：本命盤 ${seen.natal} 步、大限 ${seen.dec}、童限 ${seen.child}、流年（含小限）${seen.yr}、流月 ${seen.mo}（閏月半月 ${seen.leapHalf}）、流日 ${seen.day}；` +
    `生年因立春年界而不同的盤 ${seen.lichunMoved} 張、閏月出生 ${seen.leapBirth} 張、流派設定組合 ${seen.opts.size} 種；八字選了流月 ${seen.bzMonth} 步、起運前那一格 ${seen.bzPre} 步`);
  eq(errors, [], '頁面沒有丟出例外');
  await ctx.close(); await browser.close();
}

finish();
