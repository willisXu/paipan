/* 瀏覽器測試（亂點）：node test/browser/fuzz.test.js [種子…]。先跑 node scripts/build.js。
   其他幾支測的是「想得到的情境」；這一支用固定種子的亂數隨便填、隨便點（含不合理的輸入），
   每一步之後確認頁面沒有丟例外、盤面結構完整、錯誤訊息和「上一張盤變淡」的狀態一致。
   失敗時會印出種子、第幾步和最近的操作；加種子當參數可以重跑同一串操作。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ok, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, blockClipboard } from '../helpers/browser.js';
import { seeded } from '../helpers/random.js';

const SEEDS = process.argv.slice(2).map(Number).filter(Number.isFinite);
const STEPS = 300;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-fuzz-'));
const harness = writeHarness(dir);
const pad = n => String(n).padStart(2, '0');

async function monkey(browser, seed, context) {
  const { rand, rnd, pick } = seeded(seed);
  const { ctx, page, errors } = await openPage(browser, harness, { init: [blockClipboard], context });
  // 直接設欄位的值再送出 change：可以塞進表單元件平常擋掉的東西（空字串、超出範圍的年份）
  const setv = (sel, v) => page.evaluate(([s, val]) => { const el = document.querySelector(s); el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
  // 點得到才點：看不到的（在另一個分頁）、鎖住的（出錯時上一張盤是 inert）就跳過，不等逾時
  const tap = async loc => { if (!(await loc.count()) || !(await loc.isVisible()) || await loc.evaluate(e => e.disabled || !!e.closest('[inert]'))) return; await loc.click(); };
  const tapAny = async sel => { const n = await page.locator(sel).count(); if (n) await tap(page.locator(sel).nth(rnd(0, n - 1))); };
  const places = await page.locator('#place option').evaluateAll(els => els.map(e => e.value));
  const actions = {
    日期: () => setv('#date', pick([`${rnd(1900, 2100)}-${pad(rnd(1, 12))}-${pad(rnd(1, 28))}`, `${rnd(1900, 2100)}-02-${pad(rnd(3, 5))}`, `19${rnd(37, 79)}-${pad(rnd(4, 10))}-${pad(pick([1, 15, 30]))}`, '1899-12-31', '2101-01-01', '1900-01-01', '2100-12-31', '2023-02-29', ''])),
    時間: () => setv('#time', pick([`${pad(rnd(0, 23))}:${pad(rnd(0, 59))}`, '23:00', '23:59', '00:00', '22:55', '00:30', '23:30', ''])),
    性別: () => tap(page.locator(`label:has(#${pick(['g-m', 'g-f'])})`)),
    曆法: () => tap(page.locator(`label:has(#${pick(['c-s', 'c-l'])})`)),
    農曆年: async () => { if (await page.locator('#ly').isVisible()) await setv('#ly', pick([String(rnd(1899, 2100)), String(rnd(1900, 2100)), '1898', '2101', '1984.5', ''])); },
    農曆月日: async () => { if (await page.locator('#lm').isVisible()) { await setv('#lm', String(rnd(1, 12))); await setv('#ld', String(rnd(1, 30))); if (rand() < 0.3) await tap(page.locator('label.check')); } },
    出生地: () => page.locator('#place').selectOption(pick(places)),
    自訂經度時區: async () => { if (await page.locator('#lon').isVisible()) { await setv('#lon', pick([String(Math.round((rand() * 360 - 180) * 100) / 100), '-73.9', '181', ''])); await setv('#tz', pick([String(rnd(-24, 28) / 2), '5.75', '15', ''])); } },
    夏令時間: async () => page.locator('#clock').selectOption(pick(await page.locator('#clock option:not([disabled])').evaluateAll(els => els.map(e => e.value)))),
    真太陽時: () => page.locator('#tst').selectOption(pick(['0', '1'])),
    子時立場: () => page.locator('#zi').selectOption(pick(['next', 'same'])),
    姓名: () => setv('#nm', pick(['', '王小明', '<b>x</b>', '&amp;"\'', '字'.repeat(20)])),
    按排盤: () => tap(page.locator('button[type=submit]')),
    載入範例: () => tap(page.locator('#sample')),
    儲存: () => tap(page.locator('#save')),
    讀存檔: () => tapAny('#saved [data-load]'),
    刪存檔: () => tapAny('#saved [data-del]'),
    點大運: () => tapAny('#dayun .yun'),
    點流年: () => tapAny('#liunian .yun'),
    點八字流月: () => tapAny('#liuyue .yun'),
    切分頁: () => tap(page.locator(pick(['#t-bazi', '#t-ziwei']))),
    點大限: () => tapAny('#decs .chip2'),
    點流年籤: () => tapAny('#yrs .chip2'),
    點流月: () => tapAny('#mos .chip2'),
    點流日: () => tapAny('#days .chip2'),
    點流時: () => tapAny('#hrs .chip2'),
    看今天: () => tap(page.locator('#decs [data-today]')),
    點宮位: () => tapAny('#zw .cell'),
    // 流派設定平常收著，看不到的下拉選單沒辦法用滑鼠選，直接設值（收著的時候設定值照樣算數）
    開合流派設定: () => tap(page.locator('#zopts summary')),
    四化版本: () => setv('#zhua', pick(['tongxing', 'gengTongYin', 'gengTongXiang', 'zhongzhou'])),
    年界: () => setv('#zyear', pick(['lunar', 'lichun'])),
    閏月算法: () => setv('#zleap', pick(['mid', 'current'])),
    複製文字盤: () => tap(page.locator('#copy')),
    // 讀盤與星曜解讀（第 12 版）：看得到的那一張才點得到
    看讀盤: () => tap(page.locator('#goto-read')),
    收合讀盤: async () => { for (const s of ['#rd-toggle', '#zr-toggle']) if (await page.locator(s).isVisible()) return tap(page.locator(s)); },
    複製讀盤: async () => { for (const s of ['#rd-copy', '#zr-copy']) if (await page.locator(s).isVisible()) return tap(page.locator(s)); },
  };
  const names = Object.keys(actions), log = [];
  let problem = '', charts = 0, wrong = 0;
  for (let k = 0; k < STEPS && !problem; k++) {
    const name = pick(names); log.push(name);
    await actions[name]();
    const st = await page.evaluate(() => {
      const $ = s => document.querySelector(s), n = s => document.querySelectorAll(s).length, text = $('main').innerText;
      const junk = text.match(/.{0,20}(undefined|NaN|\[object|null).{0,20}/);
      return {
        err: !$('#err').hidden, stale: $('main').classList.contains('stale'), inert: $('#p-bazi').inert, junk: junk ? junk[0] : '',
        shape: [$('#bz-sub').textContent.trim().split(/\s+/).filter(Boolean).length, n('#dayun .yun'), n('#dayun .yun[aria-pressed=true]'), n('#liunian .yun[aria-pressed=true]'),
          n('#zw .cell'), n('#decs .chip2'), n('#decs .chip2[aria-pressed=true]'), n('#zw .pn[aria-pressed=true]')].join(),
        years: n('#liunian .yun'), now: Math.max(n('#dayun .now'), n('#liunian .now'), n('#liuyue .now')),
        months: `${n('#liuyue .yun')},${n('#liuyue .yun[aria-pressed=true]')},${/月 與原局/.test($('#ix-title').textContent) ? 1 : 0}`, tabs: `${$('#p-bazi').hidden},${$('#p-ziwei').hidden}`,
        // 紫微疊了幾層：各層的宮名個數（大限／流年／流月／流日／流時）、各排選到幾個、流年以下四排有沒有顯示、小限標記、各排的「今」、流時那一排有幾格
        layers: ['dec', 'yr', 'mo', 'day', 'hr'].map(k => n(`#zw .ly.${k}`)).join('/'),
        picked: ['#yrs', '#mos', '#days', '#hrs'].map(s => n(`${s} .chip2[aria-pressed=true]`)).join('/'),
        rows: ['#yrs', '#mos', '#days', '#hrs'].map(s => ($(s).hidden ? 0 : 1)).join('/'),
        // 讀盤：七段；星曜解讀：本命四段，疊了大限或童限多一段；第 7 步寫的是選到的那一格運；兩張卡一起收合；分頁列的按鈕跟著分頁
        reading: [n('#rd .rs'), n('#zr .rs')].join('/'),
        step7: ($('#rd .rs:nth-of-type(7) .vd') || {}).textContent || '',
        dyPicked: (b => (!b ? '' : b.dataset.dy === '-1' ? '起運前' : [...b.querySelectorAll('.c')].map(c => c.textContent).join('') + '運'))($('#dayun .yun[aria-pressed=true]')),
        folded: ['rd', 'zr'].map(id => `${$(`#${id}-body`).hidden}:${$(`#${id}-toggle`).getAttribute('aria-expanded')}:${$(`#${id}-toggle`).textContent}`).join('|'),
        goto: $('#goto-label').textContent,
        xiao: n('#zw .ly.xiao'), marks: Math.max(...['#decs', '#yrs', '#mos', '#days', '#hrs'].map(s => n(`${s} .nowmark`))), opts: $('#zopts-now').textContent, hours: n('#hrs .chip2'),
      };
    });
    const found = [];
    if (errors.length) found.push('頁面丟出錯誤：' + errors.join(' | '));
    if (st.junk) found.push(`畫面出現不該有的字：「${st.junk}」`);
    if (st.err !== st.stale || st.stale !== st.inert) found.push(`錯誤訊息、變淡、鎖住三者不一致：${st.err}／${st.stale}／${st.inert}`);
    // 四柱四個、「運」十一格選一格、流年選一個、十二宮、十二個大限籤（含本命盤與童限）選一個、宮位選一個
    if (st.shape !== '4,11,1,1,12,12,1,1' || st.years < 1 || st.years > 12 || st.now > 1) found.push(`盤面結構不對：${st.shape}，流年 ${st.years} 個，「今」${st.now} 個`);
    // 八字的流月：十二個月，最多選一個；選了，關係列的標題才寫到月
    if (!['12,0,0', '12,1,1'].includes(st.months)) found.push(`八字的流月不對（個數、選到幾個、標題有沒有寫月）：${st.months}`);
    if (st.tabs !== 'false,true' && st.tabs !== 'true,false') found.push('兩個分頁同時顯示或同時隱藏');
    /* 紫微的運限一層套一層：裡面那層選了，外面的一定也選了。每一層疊上去就是十二個宮名；
       選了大限才有流年那一排，選了流年才有流月那一排和小限，選了流月才有流日那一排，選了流日才有流時那一排（十三格） */
    const [yr, mo, day, hr] = st.picked.split('/').map(Number), dec = st.layers.startsWith('12') ? 1 : 0;
    if (st.layers !== [dec, yr, mo, day, hr].map(on => (on ? 12 : 0)).join('/') || (yr && !dec) || (mo && !yr) || (day && !mo) || (hr && !day)
      || st.rows !== `${dec}/${yr}/${mo}/${day}` || st.hours !== (day ? 13 : 0) || st.xiao > yr || st.marks > 1 || !st.opts.startsWith('目前')) {
      found.push(`紫微的運限疊法不對：宮名 ${st.layers}，選到 ${st.picked}，顯示的排 ${st.rows}，流時 ${st.hours} 格，小限 ${st.xiao}，「今」${st.marks}，設定「${st.opts}」`);
    }
    if (st.reading !== `7/${dec ? 5 : 4}` || !st.step7.startsWith(st.dyPicked + '、')) found.push(`讀盤的段數或第 7 步不對：段數 ${st.reading}，第 7 步「${st.step7}」，選到的運「${st.dyPicked}」`);
    if (!['false:true:收起|false:true:收起', 'true:false:展開|true:false:展開'].includes(st.folded)) found.push(`兩張卡的收合狀態不一致：${st.folded}`);
    if (st.goto !== (st.tabs === 'false,true' ? '看讀盤' : '看星曜解讀')) found.push(`分頁列的按鈕「${st.goto}」和目前的分頁不符`);
    if (found.length) problem = `第 ${k + 1} 步「${name}」之後：${found.join('；')}。最近的操作：${log.slice(-10).join(' → ')}`;
    if (st.err) wrong++; else charts++;
  }
  await ctx.close();
  return { problem, charts, wrong };
}

(async () => {
  const browser = await launch();
  section(`亂點 ${STEPS} 步，每一步之後檢查頁面`);
  for (const [seed, context, label] of SEEDS.length ? SEEDS.map(s => [s, {}, '桌機']) : [[20261117, {}, '桌機'], [20261118, { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }, '手機']]) {
    const r = await monkey(browser, seed, context);
    ok(!r.problem && r.charts > 50 && r.wrong > 10, `種子 ${seed}（${label}）：${r.problem || `只有 ${r.charts} 步排出盤、${r.wrong} 步停在錯誤訊息，兩種都要夠多才算測到`}`);
  }
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
})().catch(e => { console.error(e); process.exit(1); });
