/* 瀏覽器測試（無障礙）：node test/browser/a11y.test.js。先跑 node scripts/build.js。
   有代表性的畫面狀態，淺色桌機、深色手機各走一輪，每個狀態做兩件事：
   用 axe-core 掃描，不允許有違規；自己再量一次每段文字和它實際背景的對比（axe 對只有一個字的文字不下判斷，而命盤上到處是單字）。
   另外核對輸入欄位外框的對比，以及瀏覽器算出來的按鈕名稱：按鈕上看得到的字，讀屏都唸得到（WCAG 2.5.3 Label in Name）。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ok, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, setVal, blockClipboard, buttonNames } from '../helpers/browser.js';

const AXE = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-a11y-'));
const harness = writeHarness(dir);
const born = async (page, date, time) => { await setVal(page, '#date', date); await setVal(page, '#time', time); };
const strip = s => s.replace(/[\s，]+/g, '');

/* 要掃的畫面狀態：名稱 → 從剛載入的範例盤走到那個狀態的操作。時鐘固定在 2026-11-11。
   check：到了那個狀態之後，確認畫面真的是要掃的樣子（免得操作沒生效，掃到的其實是範例盤） */
const STATES = [
  ['範例盤的八字分頁', async () => {}, p => p.locator('#dayun .yun').count().then(n => n === 11)],
  ['交運那一年的虛線框（交運日在立春之前）', p => born(p, '1960-07-19', '10:00'), p => p.locator('#liunian .yun.edge').count().then(n => n === 2)],
  ['三條提醒（重複的鐘面時間、時辰交界、晚子時換日）', p => born(p, '1975-09-30', '23:05'), p => p.locator('#summary .warn').count().then(n => n === 3)],
  ['還沒起運的盤：選在起運前那一格', p => born(p, '2026-03-01', '10:00'), async p => (await p.locator('#yunhead').innerText()).includes('還沒起運') && await p.locator('#dayun [data-dy="-1"][aria-pressed=true] .now').count() === 1],
  ['紫微分頁疊上童限與流年', async p => { await born(p, '2024-03-10', '10:00'); await p.locator('#t-ziwei').click(); await p.locator('#decs [data-dec="child"]').click(); }, async p => (await p.locator('#zw .ly.dec i').allInnerTexts()).join('') === '童'.repeat(12) && await p.locator('#zw .ly.yr').count() === 12],
  ['紫微分頁的本命盤', p => p.locator('#t-ziwei').click(), p => p.locator('#zw .cell').count().then(n => n === 12)],
  ['紫微分頁疊上大限與流年', async p => { await p.locator('#t-ziwei').click(); await p.locator('#decs .chip2.cur').click(); }, p => p.locator('#zw .ly.yr').count().then(n => n === 12)],
  ['輸入有錯、上一張盤變淡', async p => { await p.locator('label:has(#c-l)').click(); await setVal(p, '#ly', '2101'); }, async p => await p.locator('#err').isVisible() && await p.locator('main.stale').count() === 1],
  ['已存清單與文字盤的備用文字框', async p => { await p.locator('#save').click(); await p.locator('#copy').click(); await p.waitForSelector('#copytext'); }, async p => await p.locator('#saved .chip').count() === 1 && await p.locator('#copytext').isVisible()],
  ['八字選了流月（十二個節氣月：「今」和選取在同一顆）', p => p.locator('#liuyue [data-lm="9"]').click(), p => p.locator('#liuyue .yun[aria-pressed=true] .now').count().then(n => n === 1)],
  // 以下兩個是為了量對比：五行色、四化色落在「選取」的底色上
  ['選到交運那一年（虛線框加選取底色）', async p => { await born(p, '1960-07-19', '10:00'); await p.locator('#liunian .yun').first().click(); }, p => p.locator('#liunian .yun.edge[aria-pressed=true]').count().then(n => n === 1)],
  ['紫微換一個大限、換一個宮', async p => { await p.locator('#t-ziwei').click(); await p.locator('#decs .chip2').nth(3).click(); await p.locator('#zw .pn').nth(4).click(); }, p => p.locator('#zw .cell.sel .ly.dec').count().then(n => n === 1)],
  // 四層運限全疊上：流月、流日的顏色落在一般的宮、選取的宮、三方四正的底色上
  ['紫微疊到今天（大限、流年、流月、流日、小限）', async p => { await p.locator('#t-ziwei').click(); await p.locator('#decs [data-today]').click(); }, async p => await p.locator('#zw .ly.day').count() === 12 && await p.locator('#zw .ly.xiao').count() === 1 && await p.locator('#zw .fst').count() === 41],
  // 五層全疊上：流時的顏色落在一般的宮、選取的宮、三方四正的底色上；選到的那一格同時是標「今」的那一格（午時）
  ['紫微疊到流時（今天的午時）', async p => { await p.locator('#t-ziwei').click(); await p.locator('#decs [data-today]').click(); await p.locator('#hrs [data-hr="6"]').click(); await p.locator('#zw .cell:has(.ly.hr.ming) .pn').click(); },
    async p => await p.locator('#zw .ly.hr').count() === 12 && await p.locator('#zw .cell.sel .ly.hr.ming').count() === 1 && await p.locator('#hrs .chip2.cur[aria-pressed=true]').count() === 1 && await p.locator('#zw .fst').count() === 51],
  ['流時選晚子時、不是今天', async p => { await p.locator('#t-ziwei').click(); await p.locator('#decs [data-today]').click(); await p.locator('#days .chip2').nth(8).click(); await p.locator('#hrs [data-hr="12"]').click(); },
    async p => await p.locator('#hrs .chip2').count() === 13 && await p.locator('#hrs .cur').count() === 0 && (await p.locator('#zw .cyun').innerText()).includes('晚子時')],
  ['閏月的流月下半、選一天、換一個宮', async p => { await p.locator('#t-ziwei').click(); await p.locator('#decs .chip2', { hasText: '33–42 歲' }).click(); await p.locator('#yrs [data-yr="2025"]').click(); await p.locator('#mos [data-mo="7"]').click(); await p.locator('#days [data-day="20"]').click(); await p.locator('#zw .pn').nth(9).click(); },
    async p => await p.locator('#days .chip2').count() === 14 && await p.locator('#zw .cell.sel .ly.day').count() === 1],
  ['流派設定打開，改成中州派、立春年界、閏月算本月', async p => { await p.locator('#zopts summary').click(); await p.locator('#zhua').selectOption('zhongzhou'); await p.locator('#zyear').selectOption('lichun'); await p.locator('#zleap').selectOption('current'); await p.locator('#t-ziwei').click(); },
    async p => await p.locator('#zopts[open]').count() === 1 && (await p.locator('#zopts-now').innerText()) === '目前：中州派四化、生年以立春為界、閏月算本月'],
  ['立春當天交節之前：紫微年界的提醒', async p => { await p.locator('#zopts summary').click(); await p.locator('#zyear').selectOption('lichun'); await born(p, '1984-02-04', '10:00'); },
    async p => (await p.locator('#summary .warn').allInnerTexts()).some(t => t.startsWith('紫微的年界設成立春'))],
];
const ENVS = [
  ['淺色桌機', {}],
  ['深色手機', { viewport: { width: 390, height: 844 }, colorScheme: 'dark' }],
];

/* 以下三個函式在頁面裡執行。色彩一律先交給 canvas 換成 RGBA，再照 WCAG 的公式算相對亮度與對比。 */
const colorTools = () => {
  const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgba = css => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data; return { r, g, b, a: a / 255 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // 元素實際的背景：由內往外把半透明的底色疊起來，直到遇到不透明的
  const bgOf = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c.a > 0) { layers.push(c); if (c.a === 1) break; } }
    return layers.reverse().reduce((bg, l) => over(l, bg), { r: 255, g: 255, b: 255, a: 1 });
  };
  window.colorTools = { rgba, over, ratio, bgOf };
};
// 每個看得到的文字節點：文字色（含透明度）疊在實際背景上，一般文字要 4.5:1，大字（24px，或 18.66px 粗體）要 3:1。回傳不夠的
const lowContrastText = () => {
  const { rgba, over, ratio, bgOf } = window.colorTools, found = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    // 不量的：看不到的、只給讀屏的，以及輸入有錯時刻意調淡、不能操作的上一張盤
    if (!n.nodeValue.trim() || el.closest('script, style, [hidden], .vh, [inert]')) continue;
    const cs = getComputedStyle(el), box = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || !box.width || !box.height) continue;
    let opacity = 1; for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    const bg = bgOf(el), fg0 = rgba(cs.color), fg = over({ ...fg0, a: fg0.a * opacity }, bg);
    const size = parseFloat(cs.fontSize), need = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700) ? 3 : 4.5, cr = ratio(fg, bg);
    if (cr < need) found.set(`${el.tagName.toLowerCase()}.${el.className}「${n.nodeValue.trim().slice(0, 8)}」${cr.toFixed(2)}（要 ${need}）`, 1);
  }
  return [...found.keys()];
};
// 輸入欄位的外框就是「這裡可以輸入」的標示，和框內、框外的底色都要有 3:1（WCAG 1.4.11）。回傳不夠的
const lowContrastFields = () => {
  const { rgba, ratio, bgOf } = window.colorTools;
  return [...document.querySelectorAll('.fld input:not([type=radio]):not([type=checkbox]), .fld select, .seg, textarea')].filter(el => el.getClientRects().length).flatMap(el => {
    const line = rgba(getComputedStyle(el).borderTopColor), inside = bgOf(el), outside = bgOf(el.parentElement);
    const worst = Math.min(ratio(line, inside), ratio(line, outside));
    return worst < 3 ? [`${el.id || el.className || el.tagName}：${worst.toFixed(2)}`] : [];
  });
};

(async () => {
  const browser = await launch();

  for (const [envName, context] of ENVS) {
    section(`axe-core 掃描、文字與欄位外框的對比：${envName}`);
    for (const [name, go, check] of STATES) {
      const { ctx, page, errors } = await openPage(browser, harness, { context, init: [blockClipboard] });
      await go(page);
      const reached = await check(page);
      await page.evaluate(AXE);
      const { violations } = await page.evaluate(() => window.axe.run(document, { resultTypes: ['violations'] }));
      const found = violations.map(v => `${v.id}（${v.impact}）× ${v.nodes.length}：${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join('、')}`);
      ok(reached && !found.length && !errors.length, `${name}：${!reached ? '沒走到要掃的狀態' : found.length ? '違規 ' + found.join('｜') : '頁面錯誤 ' + errors.join(' | ')}`);
      await page.evaluate(colorTools);
      const dim = await page.evaluate(lowContrastText), faint = await page.evaluate(lowContrastFields);
      ok(!dim.length && !faint.length, `${name}：${dim.length ? '文字對比不夠 ' + dim.slice(0, 6).join('、') : ''}${faint.length ? ' 欄位外框對比不夠 ' + faint.join('、') : ''}`);
      await ctx.close();
    }
  }

  section('按鈕上看得到的字，讀屏都唸得到');
  {
    const { ctx, page, errors } = await openPage(browser, harness);
    await born(page, '1960-07-19', '10:00'); // 己丑運 2017-01-18 到 2027-01-18，目前就在這步運
    /* 大運、流年的按鈕不另外給 aria-label，名稱直接取自內容：
       以前另外寫的標籤漏了十神和「今」，讀屏的使用者聽不到，語音操作也沒辦法照著看到的字點 */
    for (const [id, n] of [['#dayun', 11], ['#liunian', 11]]) {
      const names = await buttonNames(page.locator(id));
      // 按鈕裡給人看的字：純裝飾、標了 aria-hidden 的不算（起運前那一格佔位用的橫線）
      const shown = await page.locator(`${id} .yun`).evaluateAll(els => els.map(e => { if (e.hasAttribute('aria-label')) return '有 aria-label'; const c = e.cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach(x => x.remove()); return c.textContent; }));
      ok(names.length === n && names.every((name, i) => name === strip(shown[i])), `${id} 的 ${n} 個按鈕：名稱就是按鈕裡的字。${names[0]}`);
    }
    const dy = await buttonNames(page.locator('#dayun')), ln = await buttonNames(page.locator('#liunian'));
    ok(dy[6] === '今劫財己丑劫財2017–2658–67歲' && dy.filter(x => x.startsWith('今')).length === 1, `目前這步運唸得到「今」、十神、干支、起訖年與歲數：${dy[6]}`);
    ok(dy[0] === '起運前還沒有大運干支1960–661–7歲', `起運前那一格沒有干支，畫面上是兩道橫線，讀屏唸「還沒有大運干支」：${dy[0]}`);
    ok(ln[0] === '偏印丙申食神201657歲約2017-01-18交入這步運' && ln[10] === '今偏印丙午正印202667歲約2027-01-18交出這步運' && ln[5] === '傷官辛丑劫財202162歲',
      `流年：頭尾兩年（畫面上是虛線框）唸得到交運日，中間的年份不加：${ln[0]}｜${ln[5]}｜${ln[10]}`);
    ok(await page.locator('#liunian .vh').evaluateAll(els => els.length === 2 && els.every(e => { const r = e.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; })), '只給讀屏的那兩段字在畫面上不佔位置');
    ok(await page.locator('#live').evaluate(e => { const r = e.getBoundingClientRect(); return e.getAttribute('role') === 'status' && r.width <= 1 && r.height <= 1 && e.textContent.startsWith('已排盤：'); }), '排盤完成的通知是給讀屏聽的狀態訊息，畫面上不佔位置');

    // 紫微的宮名按鈕另外補了干支和三方四正的角色，所以有 aria-label；它要以按鈕上看得到的字開頭（身宮多一個「身」）
    await page.locator('#t-ziwei').click();
    const pal = await page.locator('#zw .pn').evaluateAll(els => els.map(e => ({ label: e.getAttribute('aria-label'), shown: e.innerText })));
    const names = await buttonNames(page.locator('#zw'));
    ok(pal.length === 12 && pal.every((x, i) => strip(x.label).startsWith(strip(x.shown)) && strip(names[i]) === strip(x.label)), `十二個宮名按鈕的名稱都以看得到的字開頭：${pal.map(x => x.label).join('｜')}`);
    const body = pal.filter(x => x.shown.includes('身'));
    ok(body.length === 1 && /^.{2}，身宮，..宮/.test(body[0].label), `身宮的按鈕：${body.map(x => x.label).join()}`);
    // 運限列四排的籤也不另外給 aria-label：名稱就是籤上的字（今、日期、月日、干支）
    await born(page, '1984-11-20', '14:00');
    await page.locator('#decs [data-today]').click();
    for (const [id, n] of [['#decs', 13], ['#yrs', 10], ['#mos', 12], ['#days', 30]]) {
      const got = await buttonNames(page.locator(id));
      const shown = await page.locator(`${id} button`).evaluateAll(els => els.map(e => (e.hasAttribute('aria-label') ? '有 aria-label' : e.textContent)));
      ok(got.length === n && got.every((name, i) => name === strip(shown[i])), `${id} 的 ${n} 個籤：名稱就是籤上的字。${got.filter(x => x.startsWith('今')).join('、')}`);
    }
    ok((await buttonNames(page.locator('#decs')))[1] === '看今天' && await page.locator('#zopts summary').evaluate(e => e.textContent.replace(/\s+/g, '')) === '紫微斗數流派設定目前都是預設（坊間通行的排法）', '「看今天」的按鈕和流派設定的標題，名稱就是看得到的字');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  /* 手機上用手指點的東西不能太小（WCAG 2.5.8：24×24 以上）。紫微的宮名按鈕例外：整個宮格都可以點，按鈕只是給鍵盤和讀屏用的 */
  section('手機版可點的目標夠大');
  {
    const { ctx, page, errors } = await openPage(browser, harness, { context: { viewport: { width: 390, height: 844 } } });
    await page.locator('#nm').fill('王小明'); await page.locator('#save').click();
    const small = () => page.evaluate(() => [...document.querySelectorAll('button, select, summary, input:not([type=radio]):not([type=checkbox]), .seg label, label.check')]
      .filter(e => e.getClientRects().length && !e.matches('.pn')).map(e => { const r = e.getBoundingClientRect(); return { what: (e.id || e.className || e.tagName) + '「' + (e.innerText || '').trim().slice(0, 4) + '」', w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(x => x.w < 24 || x.h < 24).map(x => `${x.what} ${x.w}×${x.h}`));
    const bz = await small();
    await page.locator('#zopts summary').click();
    await page.locator('#t-ziwei').click(); await page.locator('#decs [data-today]').click(); // 四排運限的籤都出來
    const zw = await small();
    ok(await page.locator('#saved [data-del]').count() === 1 && await page.locator('#days .chip2').count() === 30 && await page.locator('#zhua').isVisible() && !bz.length && !zw.length,
      `八字、紫微兩個分頁（含已存的盤的刪除鈕、流派設定、流月流日的籤）沒有小於 24px 的目標${bz.concat(zw).length ? '：' + bz.concat(zw).join('、') : ''}`);
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
})().catch(e => { console.error(e); process.exit(1); });
