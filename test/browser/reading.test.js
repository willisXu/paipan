/* 瀏覽器測試（讀盤與星曜解讀）：node test/browser/reading.test.js。先跑 node scripts/build.js。
   八字分頁最下面的「讀盤」、紫微分頁最下面的「星曜解讀」兩張卡：
   教材範例盤七段逐段核對；第 7 步跟著選到的運、年、月換；複製出來的文字和畫面出自同一份資料；
   收起與展開（兩張卡一起、瀏覽器記得、不讓存時照樣能收）；分頁列的「看讀盤」；星曜解讀疊上運限、空宮、疾厄宮；
   手機上表格可以捲、捲得動的才能用鍵盤聚焦；幾張隨機的盤，兩張卡的文字守分寸。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, setVal, blockClipboard, buttonNames } from '../helpers/browser.js';
import { seeded } from '../helpers/random.js';

const harness = writeHarness(fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-reading-')));
const born = async (page, date, time) => { await setVal(page, '#date', date); await setVal(page, '#time', time); };
// 一段的標題列：編號、名稱、結論、把握、採信標籤
const heads = (page, card) => page.locator(`${card} .rs`).evaluateAll(ss => ss.map(s => ({
  no: s.querySelector('.no')?.textContent || '', name: s.querySelector('.nm').textContent, verdict: s.querySelector('.vd')?.textContent || '',
  conf: s.querySelector('.conf')?.textContent.trim() || '', tag: s.querySelector('h3 > .tag')?.textContent || '',
})));
const lines = (page, card, k) => page.locator(`${card} .rs`).nth(k).locator('.ev li').allInnerTexts();
const tableRows = (page, card, k) => page.locator(`${card} .rs`).nth(k).locator('tbody tr').evaluateAll(rs => rs.map(r => [r.classList.contains('on'), [...r.cells].map(c => c.textContent.trim())]));
const copied = async (page, btn) => { await page.locator(btn).evaluate(el => el.click()); await page.waitForSelector('#copytext'); return page.locator('#copytext').inputValue(); };

(async () => {
  const browser = await launch();

  section('教材範例盤：讀盤七段');
  {
    const { ctx, page, errors } = await openPage(browser, harness);
    const h = await heads(page, '#rd');
    eq(h.map(x => x.no + x.name), ['①資料與立場', '②概覽', '③旺衰', '④格局', '⑤喜忌', '⑥關係', '⑦運歲'], '七段，依序是第 18 講的七步');
    eq([h[2].verdict, h[2].conf], ['身弱有根', '把握高'], '③ 身弱有根，把握高');
    eq([h[3].verdict, h[3].conf, h[3].tag], ['七殺格（官殺混雜）', '把握中', ''], '④ 七殺格（官殺混雜），把握中');
    eq([h[4].verdict, h[4].conf], ['用火；喜土；忌水、木；金待觀察', '把握高'], '⑤ 用火；喜土；忌水、木；金待觀察，把握高');
    eq(h[6].verdict, '己卯運、2026 丙午年', '⑦ 預設是今年所在的運（己卯，2020–29）和流年');
    eq((await tableRows(page, '#rd', 4)).map(r => r[1].slice(0, 2)), [['用神', '火（印）'], ['喜神', '土（比劫）'], ['待觀察', '金（食傷）'], ['忌神', '水（財）'], ['忌神', '木（官殺）']], '⑤ 的表：五行各自的角色');
    const t7 = await tableRows(page, '#rd', 6);
    eq([t7.length, t7.filter(r => r[0]).map(r => r[1][0])], [10, ['己卯']], '⑦ 的表：十步大運，選到的己卯那一列標出來');
    eq(t7.map(r => r[1][4].split('；')[0]), ['上喜下忌', '干支都是喜用', '上喜下忌', '上喜下忌', '天干待觀察、地支喜神', '天干待觀察、地支用神', '上忌下喜', '上忌下喜', '天干忌神、地支待觀察', '天干忌神、地支待觀察'], '⑦ 十步大運的一句話和第 15 講相同');
    const l7 = await lines(page, '#rd', 6);
    ok(l7.some(l => l.startsWith('2026 丙午年（43 歲）') && l.includes('用神到位')), '⑦ 2026 丙午年：用神到位');
    ok(await page.locator('#rd .rs h3 .vh').count() === 7 && await page.locator('#rd .rs h3 .no[aria-hidden=true]').count() === 7, '圓圈編號不唸，讀屏另外唸「第幾步」');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  section('第 7 步跟著選到的運、年、月換');
  {
    const { ctx, page, errors } = await openPage(browser, harness);
    await page.locator('#dayun [data-dy="5"]').click();
    let h = await heads(page, '#rd');
    ok(h[6].verdict.startsWith('辛巳運、'), `點辛巳運：⑦ 換成「${h[6].verdict}」`);
    eq((await tableRows(page, '#rd', 6)).filter(r => r[0]).map(r => r[1][0]), ['辛巳'], '⑦ 的表改標辛巳那一列');
    await page.locator('#liunian .yun').nth(3).click();
    const yr = await page.locator('#liunian .yun[aria-pressed=true]').getAttribute('data-ln');
    h = await heads(page, '#rd');
    ok(h[6].verdict.includes(`${yr} `), `點流年 ${yr}：⑦ 跟著換`);
    await page.locator('#liuyue [data-lm="2"]').click();
    h = await heads(page, '#rd');
    const l7 = await lines(page, '#rd', 6);
    ok(/月$/.test(h[6].verdict) && l7.some(l => /月（.+，.+起）參考/.test(l.replace(/\s+/g, ''))), `點流月：⑦ 多一行流月，標參考（${h[6].verdict}）`);
    await page.locator('#dayun [data-dy="-1"]').click();
    h = await heads(page, '#rd');
    const pre = await lines(page, '#rd', 6);
    ok(h[6].verdict.startsWith('起運前、') && pre.some(l => l.startsWith('起運前（約')) && (await tableRows(page, '#rd', 6)).every(r => !r[0]), '點起運前：⑦ 寫還沒有大運干支，表上不標任何一列');
    // 換一張盤：讀盤跟著重寫
    await born(page, '1962-10-18', '10:00');
    await page.locator('label:has(#g-f)').click();
    h = await heads(page, '#rd');
    eq([h[2].verdict, h[3].verdict, h[3].conf, h[3].tag], ['身強', '月令是比劫', '把握低', '參考'], '換成第 19 講的對照盤：身強、月令是比劫（把握低、參考）');
    eq(h[4].verdict, '用水；喜金；忌土、火；木待觀察', '對照盤的喜忌：用水、喜金、忌土火（同一個角色照比劫、食傷、財、官殺、印的順序）');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  section('複製讀盤紀錄、星曜解讀：和畫面同一份資料');
  {
    const { ctx, page, errors } = await openPage(browser, harness, { init: [blockClipboard] });
    const rd = await copied(page, '#rd-copy');
    const h = await heads(page, '#rd');
    ok(rd.startsWith('讀盤紀錄　教材範例盤　甲子 乙亥 戊午 己未\n'), '讀盤紀錄的第一行：名稱與四柱');
    ok(h.every(x => rd.includes(`${x.no} ${x.name}${x.verdict ? `：${x.verdict}` : ''}${x.conf ? `［${x.conf}］` : ''}`)), '每一段的標題列都在複製的文字裡，寫法相同');
    ok(rd.includes('　▶己卯｜2020–29｜') && rd.split('\n').filter(l => l.startsWith('　▶')).length === 1 && rd.trimEnd().endsWith('不論斷家人的吉凶。'), '表格也帶著，選到的那一列標 ▶；最後一行是頁尾的說明');
    eq(await page.locator('#copytext').getAttribute('aria-label'), '讀盤紀錄', '不讓寫剪貼簿時改用備用文字框，讀屏名稱是「讀盤紀錄」');
    await page.locator('#t-ziwei').click();
    const zr = await copied(page, '#zr-copy');
    ok(zr.startsWith('星曜解讀　教材範例盤　命宮辰\n') && zr.includes('■ 命宮主星：太陰［參考］') && zr.includes('■ 身宮：在福德宮［參考］'), '星曜解讀的文字：命宮太陰、身宮在福德');
    eq(await page.locator('#copytext').getAttribute('aria-label'), '星曜解讀', '星曜解讀的備用文字框');
    await ctx.close();
    // 剪貼簿可以寫的時候：寫進去並提示
    const b = await openPage(browser, harness, { context: { permissions: ['clipboard-read', 'clipboard-write'] } });
    await b.page.locator('#rd-copy').evaluate(el => el.click());
    await b.page.waitForSelector('.toast:not([hidden])');
    ok((await b.page.locator('.toast').innerText()) === '讀盤紀錄已複製' && (await b.page.evaluate(() => navigator.clipboard.readText())).startsWith('讀盤紀錄'), '剪貼簿可以寫：寫進去，提示「讀盤紀錄已複製」');
    eq([...errors, ...b.errors], [], '沒有錯誤');
    await b.ctx.close();
  }

  section('收起與展開：兩張卡一起，瀏覽器記得');
  {
    const { ctx, page, errors } = await openPage(browser, harness);
    eq(await buttonNames(page.locator('#rd h2')), ['複製讀盤紀錄', '收起'], '讀盤卡的兩顆按鈕');
    await page.locator('#rd-toggle').click();
    const state = () => page.evaluate(() => ['rd', 'zr'].map(id => [document.getElementById(`${id}-body`).hidden, document.getElementById(`${id}-toggle`).getAttribute('aria-expanded'), document.getElementById(`${id}-toggle`).textContent, document.getElementById(id).classList.contains('closed')]));
    eq(await state(), [[true, 'false', '展開', true], [true, 'false', '展開', true]], '收起：兩張卡一起收，按鈕寫「展開」、aria-expanded 是 false');
    await page.reload();
    eq(await state(), [[true, 'false', '展開', true], [true, 'false', '展開', true]], '重新整理之後還是收著（瀏覽器記得）');
    await page.locator('#t-ziwei').click();
    await page.locator('#zr-toggle').click();
    eq(await state(), [[false, 'true', '收起', false], [false, 'true', '收起', false]], '從星曜解讀那一張展開，兩張一起展開');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
    // 瀏覽器不讓存（例如某些無痕模式）：照樣能收，只是不記得
    const noStore = () => { const deny = () => { throw new Error('denied'); }; Object.defineProperty(window, 'localStorage', { value: { getItem: deny, setItem: deny, removeItem: deny }, configurable: true }); };
    const b = await openPage(browser, harness, { init: [noStore] });
    ok(!(await b.page.locator('#rd-body').isHidden()), '不讓存：預設展開');
    await b.page.locator('#rd-toggle').click();
    ok(await b.page.locator('#rd-body').isHidden(), '不讓存：照樣能收起');
    eq(b.errors, [], '不讓存：沒有錯誤');
    await b.ctx.close();
  }

  section('分頁列的「看讀盤 ↓」');
  {
    const { ctx, page, errors } = await openPage(browser, harness, { context: { viewport: { width: 390, height: 844 } } });
    eq(await buttonNames(page.locator('#goto-read')), ['看讀盤'], '八字分頁：按鈕寫「看讀盤」（箭頭不唸）');
    await page.locator('#goto-read').click();
    await page.waitForFunction(() => Math.abs(document.querySelector('#rd').getBoundingClientRect().top) < 80);
    ok(await page.evaluate(() => document.activeElement === document.querySelector('#rd h2')), '捲到讀盤卡，焦點放在卡的標題（鍵盤、讀屏從這裡接著讀）');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('#t-ziwei').click();
    eq(await buttonNames(page.locator('#goto-read')), ['看星曜解讀'], '紫微分頁：按鈕改寫「看星曜解讀」');
    await page.locator('#goto-read').click();
    await page.waitForFunction(() => Math.abs(document.querySelector('#zr').getBoundingClientRect().top) < 80);
    ok(await page.evaluate(() => document.activeElement === document.querySelector('#zr h2')), '捲到星曜解讀卡');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  section('星曜解讀：本命四段、疊上運限多一段、空宮、疾厄宮');
  {
    const { ctx, page, errors } = await openPage(browser, harness);
    await page.locator('#t-ziwei').click();
    let h = await heads(page, '#zr');
    eq(h.map(x => [x.name, x.tag]), [['命宮主星', '參考'], ['身宮', '參考'], ['生年四化', '參考'], ['命宮的三方四正', '參考']], '本命盤：四段，全部標參考');
    eq(h.map(x => x.verdict), ['太陰', '在福德宮', '廉貞祿、破軍權、武曲科、太陽忌', '有煞星、沒有吉星'], '範例盤：命宮太陰、身宮福德、甲年四化、三方四正有煞無吉');
    await page.locator('#decs [data-today]').click();
    h = await heads(page, '#zr');
    eq([h.length, h[4].name, h[4].verdict], [5, '疊上的運限', '大限 壬申、流年 2026 丙午'], '看今天：多一段「疊上的運限」，寫大限與流年');
    const l5 = await lines(page, '#zr', 4);
    ok(l5[0].startsWith('大限 43–52 歲 壬申') && l5[0].includes('命宮疊在本命的官祿宮') && l5.filter(l => l.includes('這十年「')).length === 4 && l5.filter(l => l.includes('這一年「')).length === 4, '大限、流年各寫命宮疊在哪一宮，四化各四句');
    ok(l5.at(-1).includes('流月、流日、流時不另外寫'), '流月以下不另外寫');
    // 換四化版本：四化那一段跟著換
    await page.locator('#zopts summary').click();
    await page.locator('#zhua').selectOption('zhongzhou');
    h = await heads(page, '#zr');
    eq(h[2].verdict, '廉貞祿、破軍權、武曲科、太陽忌', '甲年四化各派相同：換成中州派也一樣');
    // 空宮：1980-01-02 10:00 男，命宮在未、空宮，借對宮的太陽、太陰
    await page.locator('#zhua').selectOption('tongxing');
    await born(page, '1980-01-02', '10:00');
    h = await heads(page, '#zr');
    const l1 = await lines(page, '#zr', 0), l3 = await lines(page, '#zr', 2);
    eq(h[0].verdict, '空宮，借太陽、太陰', '空宮：結論寫借了哪幾顆星');
    ok(l1[0].includes('借對宮（遷移宮）的太陽、太陰來看') && l1.some(l => l.includes('兩顆主星同宮')), '空宮：寫明借對宮，雙星同宮另有一句');
    ok(l3.some(l => l === '貪狼化權在疾厄宮：傳統上看身心的狀態。這裡不作健康判斷，身體的事請找醫師。'), '四化落在疾厄宮：只寫不作健康判斷');
    // 童限：還沒走到第一個大限的小孩
    await born(page, '2024-03-10', '10:00');
    await page.locator('#decs [data-dec="child"]').click();
    h = await heads(page, '#zr');
    const lc = await lines(page, '#zr', 4);
    ok(h[4].verdict.includes('流年') && !h[4].verdict.includes('大限') && lc.some(l => l === '童限期間每年走的宮不同，這裡不另外解讀。'), '童限：不解讀童限，只寫流年');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  section('手機：表格自己橫向捲，捲得動的才能用鍵盤聚焦');
  {
    const { ctx, page, errors } = await openPage(browser, harness, { context: { viewport: { width: 360, height: 760 } } });
    const regions = () => page.locator('#rd .scroll-x').evaluateAll(els => els.map(el => [el.scrollWidth > el.clientWidth + 1, el.tabIndex, el.getAttribute('role'), el.getAttribute('aria-label')]));
    const r = await regions();
    ok(r.length === 2 && r.every(([wide, ti, role, label]) => wide && ti === 0 && role === 'region' && /可以左右捲動$/.test(label)), `手機上兩張表都比畫面寬：可聚焦、有區域名稱（${r.map(x => x[3]).join('；')}）`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), '整頁沒有橫向捲軸（捲的是表格自己）');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForFunction(() => [...document.querySelectorAll('#rd .scroll-x')].every(el => !el.hasAttribute('tabindex')));
    ok((await regions()).every(([wide, ti, role]) => !wide && ti === -1 && role === null), '桌機上排得下：不加停駐點');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  section('輸入有錯：讀盤跟著整張盤變淡，不會換成錯的內容');
  {
    const { ctx, page } = await openPage(browser, harness);
    const before = await page.locator('#rd-steps').innerHTML();
    await page.locator('label:has(#c-l)').click();
    await setVal(page, '#ly', '2101');
    ok(await page.locator('#err').isVisible() && await page.evaluate(() => document.querySelector('#p-bazi').inert) && (await page.locator('#rd-steps').innerHTML()) === before, '錯誤時讀盤不重寫，和盤一起設為不能操作');
    await ctx.close();
  }

  section('隨機 10 張盤：兩張卡的文字守分寸、沒有漏字');
  {
    const { rndBirth, pick } = seeded(2026112302);
    const { ctx, page, errors } = await openPage(browser, harness);
    const HEAVY = /一定|注定|必定|必然|大凶|災|禍|剋夫|剋妻|短命|血光|死亡|開運|補運/, HOLE = /undefined|null|NaN|\[object|（）|「」|：。|、、|，，|：：/;
    const bad = [];
    for (let n = 0; n < 10; n++) {
      const o = rndBirth(1920, 2020), gender = pick(['男', '女']);
      await page.locator(gender === '女' ? 'label:has(#g-f)' : 'label:has(#g-m)').click();
      await born(page, `${o.y}-${String(o.m).padStart(2, '0')}-${String(o.d).padStart(2, '0')}`, `${String(o.h).padStart(2, '0')}:${String(o.mi).padStart(2, '0')}`);
      await page.locator('#t-ziwei').click();
      await page.locator('#decs [data-today]').click().catch(() => {});
      await page.locator('#t-bazi').click();
      const txt = (await page.locator('#rd').innerText()) + (await page.locator('#zr').innerText());
      const body = txt.replace(/不論斷家人的吉凶/g, '').replace(/不是開運清單/g, ''); // 這兩句本身就是在說「不這樣講」
      if (HEAVY.test(body)) bad.push(`${o.y}-${o.m}-${o.d}：重話「${body.match(HEAVY)[0]}」`);
      if (HOLE.test(txt)) bad.push(`${o.y}-${o.m}-${o.d}：漏字「${txt.match(HOLE)[0]}」`);
      // 畫面的結論和引擎相同
      const inp = { calendar: 'solar', gender, ...o, lon: 121.56, tz: 8, zone: 'Asia/Taipei', clock: 'auto', useTST: false, ziRule: 'next' };
      const want = PP.bzReading(PP.bazi(inp, PP.resolveTime(inp)));
      const h = await heads(page, '#rd');
      if (h[2].verdict !== want.strength.text) bad.push(`${o.y}-${o.m}-${o.d}：③ 畫面 ${h[2].verdict}，引擎 ${want.strength.text}`);
    }
    bad.forEach(m => console.log('    ' + m));
    eq(bad.length, 0, '十張盤的兩張卡沒有重話、沒有漏字，旺衰結論和引擎相同');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
  }

  await browser.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });
