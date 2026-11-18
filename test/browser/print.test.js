/* 瀏覽器測試（列印）：node test/browser/print.test.js。先跑 node scripts/build.js。
   列印按鈕只有放上網站的那一版（dist/site/）有，所以這一支主要測網站版；發布平台用的片段（dist/paipan.html）只確認沒有按鈕。
   版面用兩種方式看：把瀏覽器切到列印樣式量版面（視窗寬度設成 A4 直式扣掉邊界的寬度）；真的印成 PDF 數頁數。
   列印對話框本身開不出來也不該開：window.print 換成只記錄「被叫了一次、當時 <body> 帶著什麼 class」的假函式。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { root, launch, writeHarness, openPage, serveDir, openSite, setVal, buttonNames } from '../helpers/browser.js';
import { seeded } from '../helpers/random.js';

const siteDir = path.join(root, 'dist', 'site');
if (!fs.existsSync(path.join(siteDir, 'index.html'))) { console.error('找不到 dist/site/index.html，請先執行 npm run build。'); process.exit(2); }
const harness = writeHarness(fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-print-')));
const deps = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies;

// A4 直式（210 × 297 mm）扣掉樣式裡的 12 mm 邊界，換成 96 dpi 的 px：列印樣式下，版面就是照這個寬度排的
const A4 = { width: 703, height: 1032 };
const stubPrint = () => { window.__prints = []; window.print = () => { window.__prints.push(document.body.className); }; };
const prints = page => page.evaluate(() => window.__prints);
// 列印樣式下，分頁列和紫微的運限列都藏起來了，點不到：要換狀態就直接叫元素的 click()
const tap = (page, sel, n = 0) => page.evaluate(([s, k]) => document.querySelectorAll(s)[k].click(), [sel, n]);
const setBoth = (page, on) => page.evaluate(b => document.body.classList.toggle('print-both', b), on);
// PDF 的頁數：每一頁是一個 /Type /Page 物件（/Pages 是頁面樹，不算）
const pageCount = async (page, format = 'A4') => ((await page.pdf({ format, preferCSSPageSize: true })).toString('latin1').match(/\/Type\s*\/Page(?![A-Za-z])/g) || []).length;

/* 在頁面裡量列印樣式下的版面。回傳的都是「有沒有問題」的清單或單純的事實，判斷留給外面。
   shown／hidden：這些選擇器底下有沒有任何一個元素真的佔了版面。
   rows：大運、流年、流月三排各有幾格、是不是同一行、有沒有超出這一排；chips：格子裡的字有沒有超出格子。 */
const measure = () => {
  const all = sel => [...document.querySelectorAll(sel)];
  const laid = el => el.getClientRects().length > 0;
  const shown = sel => all(sel).some(laid);
  const inside = (inner, outer, tol = 1) => { const a = inner.getBoundingClientRect(), b = outer.getBoundingClientRect(); return a.left >= b.left - tol && a.right <= b.right + tol; };
  const main = document.querySelector('main');
  const rows = ['#dayun', '#liunian', '#liuyue'].map(sel => {
    const row = document.querySelector(sel), chips = [...row.querySelectorAll('.yun')];
    return {
      sel, n: chips.length, oneLine: new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size <= 1,
      fits: row.scrollWidth <= row.clientWidth && chips.every(c => inside(c, row)), minWidth: Math.round(Math.min(...chips.map(c => c.getBoundingClientRect().width))),
    };
  });
  const spill = all('.yun').flatMap(chip => [...chip.children].filter(el => !el.matches('.vh, .now') && !inside(el, chip)).map(el => `${chip.closest('.track-row').id}「${el.textContent}」`));
  const cellSpill = all('#zw .cell, #zw .center').flatMap(cell => [...cell.querySelectorAll('.st, .fst, .ly, .foot > *, dl, .cn, .cyun')].filter(laid).filter(el => !inside(el, cell)).map(el => `${cell.dataset.pal ?? '中宮'}「${el.textContent.trim().slice(0, 8)}」`));
  const top = sel => Math.round(document.querySelector(sel).getBoundingClientRect().top);
  const rels = all('#p-bazi .rel').filter(laid);
  const cs = getComputedStyle(document.body);
  return {
    shown: Object.fromEntries(['.masthead', '#f .fields', '#f .help', '#f .actions', '#zopts', '#err', '.tabbar', '.yunbar', '.swipe', '#copyfallback', '.so', '#summary', '#p-bazi', '#p-ziwei', '#pdetail', 'footer.colophon p:not(.po)', '#printed', '.legend .po'].map(s => [s, shown(s)])),
    title: { bazi: getComputedStyle(document.querySelector('#p-bazi'), '::before').content, ziwei: getComputedStyle(document.querySelector('#p-ziwei'), '::before').content },
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    rows, spill, cellSpill,
    zwFits: inside(document.querySelector('#zw'), main), zwCells: all('#zw .cell').filter(laid).length,
    sideBySide: laid(document.querySelector('.bz-top')) ? [top('.bz-top > .card'), top('.bz-top > .two'), top('.two > .card:nth-child(1)'), top('.two > .card:nth-child(2)')] : null,
    // 每一筆關係是不是一行：說明和內容同一列、位置與標籤靠右
    relOneLine: rels.every(r => { const tx = r.querySelector('.tx').getBoundingClientRect(), nt = r.querySelector('.nt'), wh = r.querySelector('.wh').getBoundingClientRect(); return (!nt || nt.getBoundingClientRect().top < tx.bottom) && wh.top < tx.bottom && wh.left > tx.right; }),
    rels: rels.length,
    bodyBg: cs.backgroundColor, ink: cs.color, cardBg: getComputedStyle(document.querySelector('.card')).backgroundColor, wood: getComputedStyle(document.querySelector('#pillars .wx-wood, #dayun .wx-wood, .bar.wx-wood')).color,
    exact: cs.printColorAdjust || cs.webkitPrintColorAdjust, zoom: cs.zoom,
    printed: document.querySelector('#printed').textContent, breakBefore: getComputedStyle(document.querySelector('#p-ziwei')).breakBefore,
    autoRows: getComputedStyle(document.querySelector('#zw')).gridAutoRows,
    selOutline: (() => { const c = document.querySelector('#zw .cell.sel'); if (!c) return ''; const s = getComputedStyle(c); return `${s.outlineStyle}|${s.boxShadow}`; })(),
    center: laid(document.querySelector('#zw .cyun')) ? document.querySelector('#zw .cyun').innerText.trim() : '',
    lmTitle: document.querySelector('#lm-title').innerText.trim(),
    staleOpacity: getComputedStyle(document.querySelector('#summary')).opacity,
  };
};
const list = o => Object.entries(o).filter(([, v]) => v).map(([k]) => k).join('、') || '沒有';

(async () => {
  const browser = await launch();
  const server = await serveDir(siteDir);

  section('兩種建置：網站版有列印按鈕，發布平台用的片段沒有');
  {
    const { ctx, page, errors } = await openSite(browser, server.url);
    eq(await buttonNames(page.locator('.tabtools')), ['複製文字盤', '列印／存PDF', '八字、紫微一起印'], '網站版的工具列有三顆按鈕，讀屏唸的就是按鈕上的字');
    ok((await page.locator('footer.colophon').innerText()).includes('另存為 PDF'), '網站版的頁尾說明怎麼存成 PDF');
    await page.locator('#t-ziwei').click();
    ok(!await page.locator('#printed').isVisible() && !await page.locator('.legend .po').isVisible() && await page.locator('.legend .so').isVisible(), '只印在紙上的那幾句，畫面上看不到；畫面上教人怎麼點的那一句看得到');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();

    const a = await openPage(browser, harness);
    const tools = await buttonNames(a.page.locator('.tabtools'));
    const body = await a.page.locator('body').innerText();
    ok(tools.length === 1 && tools[0] === '複製文字盤' && await a.page.locator('#print, #print-both').count() === 0, `發布平台用的片段沒有列印按鈕（那裡的檢視框開不了列印對話框）：${tools.join('、')}`);
    ok(!body.includes('存 PDF') && !body.includes('另存為 PDF'), '片段的說明文字也不提列印');
    ok(a.errors.length === 0, `片段照常運作，無錯誤${a.errors.length ? '：' + a.errors.join(' | ') : ''}`);
    await a.ctx.close();
    const sources = ['dist/paipan.html', 'dist/site/index.html'].map(f => fs.readFileSync(path.join(root, f), 'utf8'));
    ok(sources.every(s => !s.includes('@SITE') && !s.includes('@/SITE')), '兩種成品裡都沒有留下建置用的 @SITE 標記');
  }

  section('按鈕：印目前的分頁、兩個都印');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { init: [stubPrint] });
    await page.locator('#print').click();
    eq(await prints(page), [''], '按「列印／存 PDF」：叫了一次列印，<body> 沒有帶 print-both（只印目前的分頁）');
    ok(await page.evaluate(() => document.activeElement.id) === 'print', '焦點留在按鈕上');
    await page.locator('#print-both').click();
    eq((await prints(page)).slice(1), ['print-both'], '按「八字、紫微一起印」：列印的時候 <body> 帶著 print-both');
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    ok(await page.evaluate(() => document.body.className) === '', '印完（afterprint）就把 print-both 拿掉：之後用瀏覽器自己的列印，回到只印目前的分頁');
    // 有些瀏覽器的 afterprint 不一定可靠：就算沒收到，下一次按「列印／存 PDF」也不會還帶著 print-both
    await page.locator('#print-both').click();
    await page.locator('#print').click();
    eq((await prints(page)).slice(2), ['print-both', ''], '沒收到 afterprint 也一樣：接著按「列印／存 PDF」，印的還是只有目前的分頁');
    await page.locator('#print-both').focus();
    await page.keyboard.press('Enter');
    ok((await prints(page)).length === 5, '鍵盤也按得到');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();

    // 函式庫沒載入：頁面停在錯誤訊息，沒有盤。按鈕沒有接上動作，按了不該列印，也不該出錯
    const broken = await serveDir(siteDir, { tamper: { [`/lib/iztro-${deps.iztro}.min.js`]: '\n;' } });
    const b = await openSite(browser, broken.url, { init: [stubPrint] });
    await b.page.waitForSelector('#err:not([hidden])');
    await b.page.locator('#print').click();
    await b.page.locator('#print-both').click();
    ok((await prints(b.page)).length === 0 && !b.errors.some(e => e.startsWith('pageerror')), '函式庫沒載入、沒有盤的時候，按列印沒有動作，也不出錯');
    await b.ctx.close(); await broken.close();
  }

  section('列印樣式下的版面（A4 直式）：八字');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { context: { viewport: A4 } });
    await page.locator('#liuyue [data-lm="9"]').click(); // 選一個流月：關係列多一柱，標題多一句
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(measure);
    const hidden = ['.masthead', '#f .fields', '#f .help', '#f .actions', '#zopts', '#err', '.tabbar', '.yunbar', '.swipe', '#copyfallback', '.so', '#p-ziwei', 'footer.colophon p:not(.po)'];
    ok(hidden.every(s => !m.shown[s]), `表單、分頁列、說明文字、另一個分頁都不印：還看得到的有 ${list(Object.fromEntries(hidden.map(s => [s, m.shown[s]])))}`);
    ok(m.shown['#summary'] && m.shown['#p-bazi'] && m.shown['#printed'], '命主資訊、八字、紙上的頁尾都印');
    ok(m.title.bazi === '"八字"' && m.zoom === '0.75', `分頁列不印，八字自己帶標題；整頁縮成四分之三：${m.title.bazi}、${m.zoom}`);
    ok(m.overflow <= 0, `版面沒有超出紙的寬度（超出 ${m.overflow}px）`);
    eq(m.rows.map(r => [r.sel, r.n, r.oneLine, r.fits]), [['#dayun', 11, true, true], ['#liunian', 11, true, true], ['#liuyue', 12, true, true]], '大運、流年、流月各自排成一行，每一格都在紙上（畫面上是可以橫向捲的一排）');
    ok(m.spill.length === 0 && m.rows.every(r => r.minWidth >= 40), `格子裡的字沒有超出格子：${m.spill.join('、') || '沒有'}；最窄的一格 ${Math.min(...m.rows.map(r => r.minWidth))}px`);
    ok(m.sideBySide && m.sideBySide[0] === m.sideBySide[1] && m.sideBySide[3] > m.sideBySide[2], `四柱在左，旺衰三看和五行字數疊在右邊：${JSON.stringify(m.sideBySide)}`);
    ok(m.rels >= 10 && m.relOneLine, `${m.rels} 筆關係，每一筆排成一行（類別、內容、說明、位置與標籤）`);
    ok(m.lmTitle === '2026 丙午年的流月 十二個節氣月，每個月從交節的那一刻起算。', `教人怎麼點的那半句不印：${m.lmTitle}`);
    ok(m.printed.startsWith('八字紫微排盤（127.0.0.1:') && m.printed.includes('以 2026-11-11 為今天') && m.printed.includes('只排盤，不解盤'), `紙上的頁尾寫明從哪裡印的、以哪一天為今天：${m.printed}`);
    ok(m.exact === 'exact' && m.bodyBg === 'rgb(255, 255, 255)' && m.cardBg === 'rgb(255, 255, 255)', `紙是白的；有底色的小標籤照樣印（${m.exact}）`);

    // 輸入有錯時下面留著的是上一次的盤：紙上要看得到錯誤訊息，盤也還是淡的
    await page.emulateMedia({ media: 'screen' });
    await setVal(page, '#date', '2101-01-01');
    await page.emulateMedia({ media: 'print' });
    const e = await page.evaluate(measure);
    ok(e.shown['#err'] && !e.shown['#f .fields'] && e.staleOpacity === '0.4', '輸入有錯的時候：錯誤訊息印出來，上一次的盤照樣是淡的');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('列印樣式下的版面：紫微斗數，以及兩個都印');
  {
    const { ctx, page, errors } = await openSite(browser, server.url, { context: { viewport: A4 } });
    await page.locator('#t-ziwei').click();
    await page.emulateMedia({ media: 'print' });
    let m = await page.evaluate(measure);
    ok(m.shown['#p-ziwei'] && m.shown['#pdetail'] && !m.shown['#p-bazi'] && !m.shown['.yunbar'] && !m.shown['.swipe'] && !m.shown['.so'], '在紫微分頁列印：印紫微，不印八字；運限列、「可左右滑動」這些操作用的不印');
    ok(m.title.ziwei === '"紫微斗數"' && m.zwCells === 12 && m.zwFits && m.cellSpill.length === 0 && m.overflow <= 0, `十二宮跟著紙的寬度，沒有東西超出格子：${m.cellSpill.join('、') || '沒有'}`);
    ok(m.center === '目前是本命盤。' && m.shown['.legend .po'], `中宮只留「目前是本命盤。」，圖例換成紙上的說法：${m.center}`);
    ok(m.selOutline === 'solid|none', `所選的宮改用外框線標出（畫面上是內陰影，不一定印得出來）：${m.selOutline}`);
    ok(m.breakBefore === 'auto' && m.autoRows.startsWith('minmax(160px'), `只印紫微時不另起一頁：${m.breakBefore}、${m.autoRows}`);

    await setBoth(page, true);
    m = await page.evaluate(measure);
    ok(m.shown['#p-bazi'] && m.shown['#p-ziwei'] && m.title.bazi === '"八字"', '<body> 帶 print-both：兩個分頁都印，各有標題');
    ok(m.breakBefore === 'page' && m.autoRows.startsWith('minmax(200px'), `紫微斗數從新的一頁開始；那一頁上面沒有命主資訊，本命盤的格子放高一點：${m.breakBefore}、${m.autoRows}`);

    // 疊到今天（四層運限）：格子裡東西最多的狀態
    await setBoth(page, false);
    await tap(page, '#decs [data-today]');
    m = await page.evaluate(measure);
    ok(m.cellSpill.length === 0 && m.zwFits && m.overflow <= 0 && m.center.includes('流日'), `疊到流日，格子裡的星曜、流曜、宮名都還在格子裡：${m.cellSpill.join('、') || '沒有'}`);
    // 再疊上流時（五層）：每一宮多一個宮名、多幾顆流曜，流時那一排在運限列裡，不印
    await tap(page, '#hrs [data-hr="12"]');
    m = await page.evaluate(measure);
    ok(m.cellSpill.length === 0 && m.zwFits && m.overflow <= 0 && m.center.includes('流時 晚子時') && !m.shown['.yunbar'], `疊到流時也一樣：${m.cellSpill.join('、') || '沒有東西超出格子'}`);
    await tap(page, '#hrs [data-hr="12"]');
    // 所選宮位的說明：這一宮在各層運限裡的宮名接在星曜後面，同一行（畫面上另起一行）
    const sameLine = await page.evaluate(() => [...document.querySelectorAll('#pdetail .sfsz .r')].every(r => { const yl = r.querySelector('.yl'), first = r.querySelector('.s').firstElementChild; return yl && Math.abs(yl.getBoundingClientRect().top - first.getBoundingClientRect().top) < 12; }));
    ok(sameLine, '所選宮位的說明裡，各層運限的宮名與流曜接在星曜後面，不另起一行');
    await setBoth(page, true);
    m = await page.evaluate(measure);
    ok(m.autoRows.startsWith('minmax(160px') && m.breakBefore === 'page', `疊了運限的盤本來就高，兩個都印時格子不再放高：${m.autoRows}`);
    ok(m.rows.every(r => r.fits && r.oneLine) && m.spill.length === 0 && m.overflow <= 0, '兩個都印的時候，八字那幾排一樣排得下');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('比較窄的紙（B5、A5 直式）');
  // 都比手機版面的門檻（700px、520px）窄：畫面上給手機用的樣式不可以跑到紙上，各欄的寬度下限也不可以把版面撐出紙外
  for (const [paper, width] of [['B5', 574], ['A5', 469]]) {
    const { ctx, page, errors } = await openSite(browser, server.url, { context: { viewport: { width, height: 850 } } });
    await page.locator('#t-ziwei').click();
    await page.locator('#decs [data-today]').click();
    await setBoth(page, true);
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(measure);
    ok(!m.shown['.swipe'] && !m.shown['.yunbar'] && !m.shown['.tabbar'], `${paper}：「命盤較寬，可左右滑動」這句手機上才有的提示不印`);
    ok(m.overflow <= 0 && m.rows.every(r => r.fits && r.oneLine) && m.spill.length === 0, `${paper}：版面不超出紙（超出 ${m.overflow}px），八字的三排還是各一行：最窄的一格 ${Math.min(...m.rows.map(r => r.minWidth))}px；${m.spill.join('、') || '字都在格子裡'}`);
    ok(m.zwFits && m.zwCells === 12 && m.cellSpill.length === 0 && m.relOneLine, `${paper}：紫微十二宮跟著縮窄，疊到流日也沒有東西超出格子：${m.cellSpill.join('、') || '沒有'}`);
    ok(errors.length === 0, `${paper}：無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('深色模式印出來還是淺色');
  {
    const { ctx, page } = await openSite(browser, server.url, { context: { viewport: A4, colorScheme: 'dark' } });
    const screen = await page.evaluate(measure);
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    const print = await page.evaluate(measure);
    ok(screen.bodyBg === 'rgb(15, 20, 24)' && screen.ink === 'rgb(229, 234, 236)', `畫面上是深色：${screen.bodyBg}`);
    eq([print.bodyBg, print.ink, print.cardBg, print.wood], ['rgb(255, 255, 255)', 'rgb(27, 35, 44)', 'rgb(255, 255, 255)', 'rgb(43, 118, 72)'], '印出來是白底、深色字，五行的顏色也用淺色那一組');
    await ctx.close();
  }

  section('印成 PDF：教材範例盤的頁數（A4）');
  {
    const { ctx, page } = await openSite(browser, server.url);
    const bazi = await pageCount(page);
    await page.locator('#t-ziwei').click();
    const ziwei = await pageCount(page);
    await setBoth(page, true);
    const both = await pageCount(page);
    await setBoth(page, false);
    eq([bazi, ziwei, both], [2, 1, 3], '八字兩頁、紫微本命盤一頁、兩個都印三頁');
    await page.locator('#decs [data-today]').click();
    const layered = await pageCount(page);
    ok(layered >= 1 && layered <= 3, `紫微疊到流日 ${layered} 頁（格子變高，所選宮位的說明可能排到下一頁）`);
    await ctx.close();
  }

  section('隨機的盤：列印樣式下每一排、每一格都排得下');
  {
    const { rnd, rndBirth, pick } = seeded(2026111809);
    const { ctx, page, errors } = await openSite(browser, server.url, { context: { viewport: A4 } });
    await page.emulateMedia({ media: 'print' });
    const N = 14, bad = [];
    let layered = 0, pre = 0, hourly = 0;
    for (let i = 0; i < N; i++) {
      const b = i === 0 ? { y: 2024, m: 3, d: 10, h: 10, mi: 0 } : rndBirth(1930, 2024), g = pick(['男', '女']); // 第一張是還沒起運的小孩
      const tag = `${b.y}-${b.m}-${b.d} ${b.h}:${b.mi} ${g}`;
      await page.evaluate(v => {
        const $ = s => document.querySelector(s), pad = n => String(n).padStart(2, '0');
        $('#nm').value = v.name;
        document.querySelectorAll('input[name=gender]').forEach(el => { el.checked = el.value === v.g; });
        $('#date').value = `${v.y}-${pad(v.m)}-${pad(v.d)}`; $('#time').value = `${pad(v.h)}:${pad(v.mi)}`;
        $('#tst').value = v.tst; $('#zi').dispatchEvent(new Event('change', { bubbles: true }));
      }, { ...b, g, name: i % 3 === 0 ? '一二三四五六七八九十一二三四五六七八九十' : '', tst: String(i % 2) });
      await tap(page, '#t-bazi');
      await tap(page, '#dayun .yun', rnd(0, 10));
      await tap(page, '#liunian .yun', rnd(0, await page.locator('#liunian .yun').count() - 1));
      await tap(page, '#liuyue .yun', rnd(0, 11));
      let m = await page.evaluate(measure);
      if (await page.locator('#dayun [data-dy="-1"][aria-pressed=true]').count()) pre++;
      if (m.overflow > 0 || m.spill.length || !m.rows.every(r => r.fits && r.oneLine) || !m.relOneLine) bad.push(`${tag} 八字：${JSON.stringify([m.overflow, m.spill, m.rows.filter(r => !r.fits || !r.oneLine).map(r => r.sel), m.relOneLine])}`);
      await tap(page, '#t-ziwei');
      await tap(page, '#zw .cell', rnd(0, 11));
      // 一層一層疊：大限（或童限）、流年、流月、流日、流時，隨機停在某一層
      const depth = i % 4 === 1 ? 5 : rnd(0, 5); // 每四張有一張一路疊到流時
      if (depth >= 1) await tap(page, '#decs .chip2', rnd(1, await page.locator('#decs .chip2').count() - 1));
      if (depth >= 2) await tap(page, '#yrs .chip2', rnd(0, await page.locator('#yrs .chip2').count() - 1));
      if (depth >= 3 && await page.locator('#mos .chip2').count()) await tap(page, '#mos .chip2', rnd(0, await page.locator('#mos .chip2').count() - 1));
      if (depth >= 4 && await page.locator('#days .chip2').count()) { await tap(page, '#days .chip2', rnd(0, await page.locator('#days .chip2').count() - 1)); layered++; }
      if (depth >= 5 && await page.locator('#hrs .chip2').count()) { await tap(page, '#hrs .chip2', rnd(0, 12)); hourly++; }
      m = await page.evaluate(measure);
      if (m.overflow > 0 || m.cellSpill.length || !m.zwFits || m.zwCells !== 12) bad.push(`${tag} 紫微（疊 ${depth} 層）：${JSON.stringify([m.overflow, m.cellSpill, m.zwFits, m.zwCells])}`);
    }
    ok(bad.length === 0, `${N} 張隨機的盤，八字的三排和紫微的十二宮都排得下${bad.length ? '：\n      ' + bad.slice(0, 5).join('\n      ') : ''}`);
    ok(layered >= 2 && hourly >= 1 && pre >= 1, `其中有疊到流日的（${layered} 張）、再疊到流時的（${hourly} 張）、選在起運前那一格的（${pre} 張）`);
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  await server.close();
  await browser.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });
