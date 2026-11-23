/* 瀏覽器測試（iPhone、iPad 的版面，第 13 版）：node test/browser/ios.test.js。先跑 node scripts/build.js。
   用觸控螢幕的設定（pointer: coarse）開 iPhone、iPad 各種寬度，含 iPad 分割畫面的窄視窗：
   - 看得到、可以點的東西都至少 44×44（紫微盤的宮名按鈕除外：整格都可以點）；輸入欄位的字至少 16px（iPhone 點進去才不會整頁放大）
   - 兩個分頁、疊上運限、讀盤與星曜解讀展開時，整頁都沒有橫向捲軸（紫微盤與表格在自己的區塊裡捲）
   - 生辰資料可以收起：收起來只留標題與已存的盤，盤直接排在下面；瀏覽器記得；輸入有錯會自己展開
   用滑鼠的裝置（pointer: fine）維持原本的尺寸，免得桌機的版面跟著變大。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, setVal, buttonNames } from '../helpers/browser.js';

const harness = writeHarness(fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-ios-')));
const DEVICES = [
  ['iPhone SE', 375, 667], ['iPhone 17', 402, 874], ['iPhone Pro Max', 440, 956], ['iPhone 17 橫向', 874, 402],
  ['iPad mini 直向', 744, 1133], ['iPad Air 直向', 820, 1180], ['iPad Air 橫向', 1180, 820], ['iPad Pro 13 吋橫向', 1376, 1032],
  ['iPad 分割畫面（窄）', 320, 1032], ['iPad 分割畫面（一半）', 678, 1032],
];
const touch = (w, h) => ({ viewport: { width: w, height: h }, isMobile: w < 1000, hasTouch: true });

// 看得到、可以點，卻小於 44×44 的；還有字小於 16px 的輸入欄位
const audit = page => page.evaluate(() => {
  const small = [], tiny = [];
  for (const el of document.querySelectorAll('button, [role=tab], select, input:not([type=radio]):not([type=checkbox]), summary, label.check, .seg label, textarea')) {
    if (!el.getClientRects().length || el.closest('[hidden]') || el.matches('#zw .pn')) continue;
    const b = el.getBoundingClientRect();
    if (b.width && (b.width < 43.5 || b.height < 43.5)) small.push(`${el.id || el.className || el.tagName}（${Math.round(b.width)}×${Math.round(b.height)}）`);
    if (el.matches('input, select, textarea') && parseFloat(getComputedStyle(el).fontSize) < 16) tiny.push(`${el.id || el.tagName} ${getComputedStyle(el).fontSize}`);
  }
  return { small, tiny, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

(async () => {
  const browser = await launch();

  section(`觸控螢幕：${DEVICES.length} 種 iPhone、iPad 的寬度`);
  {
    const bad = [];
    for (const [name, w, h] of DEVICES) {
      const { ctx, page, errors } = await openPage(browser, harness, { context: touch(w, h) });
      const states = [];
      states.push(['八字分頁', await audit(page)]);
      await page.locator('#liuyue [data-lm="3"]').click();
      states.push(['八字選了流月', await audit(page)]);
      await page.locator('#t-ziwei').click();
      await page.locator('#decs [data-today]').click();
      await page.locator('#hrs [data-hr="6"]').click();
      states.push(['紫微疊到流時', await audit(page)]);
      await page.locator('#zopts summary').click();
      states.push(['流派設定打開', await audit(page)]);
      for (const [st, a] of states) {
        if (a.small.length) bad.push(`${name}／${st}：小於 44 的 ${a.small.slice(0, 4).join('、')}`);
        if (a.tiny.length) bad.push(`${name}／${st}：字小於 16px 的欄位 ${a.tiny.join('、')}`);
        if (a.overflow > 0) bad.push(`${name}／${st}：整頁有橫向捲軸（多出 ${a.overflow}px）`);
      }
      if (errors.length) bad.push(`${name}：${errors.join(' | ')}`);
      await ctx.close();
    }
    bad.forEach(m => console.log('    ' + m));
    eq(bad.length, 0, '每一種寬度、四個狀態：手指點的目標至少 44×44、欄位的字至少 16px、整頁沒有橫向捲軸');
  }

  section('用滑鼠的裝置維持原本的尺寸');
  {
    const { ctx, page } = await openPage(browser, harness);
    const sizes = await page.evaluate(() => [document.querySelector('#copy').getBoundingClientRect().height, parseFloat(getComputedStyle(document.querySelector('#date')).fontSize), document.querySelector('#date').getBoundingClientRect().height]);
    eq(sizes, [38, 15, 40], '桌機：按鈕 38 高、欄位 15px 字 40 高（和第 12 版相同）');
    await ctx.close();
  }

  section('生辰資料可以收起');
  {
    const { ctx, page, errors } = await openPage(browser, harness, { context: touch(402, 874) });
    eq(await buttonNames(page.locator('.birth-title')), ['收起'], '標題旁邊一顆「收起」');
    const top0 = await page.locator('#summary').boundingBox();
    await page.locator('#f-toggle').click();
    const st = () => page.evaluate(() => [document.querySelector('#f-body').hidden, document.querySelector('#f-toggle').getAttribute('aria-expanded'), document.querySelector('#f-toggle').textContent,
      getComputedStyle(document.querySelector('.actions')).display, document.querySelector('#f').classList.contains('folded')]);
    eq(await st(), [true, 'false', '展開', 'none', true], '收起：欄位、說明、流派設定、排盤按鈕都不顯示；按鈕改寫「展開」');
    const top1 = await page.locator('#summary').boundingBox();
    ok(top1.y < 200 && top0.y > 900, `命主資訊從第 ${Math.round(top0.y)} 像素往上移到第 ${Math.round(top1.y)} 像素：iPhone 第一屏就看得到盤`);
    await page.locator('#save').evaluate(el => el.click()); // 收起前存一筆，已存的盤在收起時照樣看得到、點得到
    ok(await page.locator('#saved [data-load]').isVisible(), '已存的盤照樣看得到');
    await page.reload();
    eq(await st(), [true, 'false', '展開', 'none', true], '重新整理之後還是收著（瀏覽器記得）');
    await page.locator('#f-toggle').click();
    eq(await st(), [false, 'true', '收起', 'flex', false], '展開');
    await page.locator('#f-toggle').click();
    // 輸入有錯（這裡直接送一個超出範圍的日期）：自己展開，錯誤訊息對著欄位
    await page.evaluate(() => { const d = document.querySelector('#date'); d.value = '2101-01-01'; d.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForSelector('#err:not([hidden])');
    eq(await st(), [false, 'true', '收起', 'flex', false], '輸入有錯：自己展開');
    await setVal(page, '#date', '1984-11-20');
    ok(await page.locator('#err').isHidden(), '改回來，錯誤訊息消失');
    eq(errors, [], '沒有錯誤');
    await ctx.close();
    // 瀏覽器不讓存：照樣能收，只是不記得
    const noStore = () => { const deny = () => { throw new Error('denied'); }; Object.defineProperty(window, 'localStorage', { value: { getItem: deny, setItem: deny, removeItem: deny }, configurable: true }); };
    const b = await openPage(browser, harness, { init: [noStore] });
    await b.page.locator('#f-toggle').click();
    ok(await b.page.locator('#f-body').isHidden() && b.errors.length === 0, '不讓存：照樣收得起來，沒有錯誤');
    await b.ctx.close();
  }

  await browser.close();
  finish();
})().catch(e => { console.error(e); process.exit(1); });
