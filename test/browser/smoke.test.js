/* 瀏覽器冒煙測試：node test/browser/smoke.test.js [截圖資料夾]。先跑 node scripts/build.js。
   CDN 函式庫改由本機 node_modules 提供（同一個檔案），其餘外部請求一律放掉。
   瀏覽器的時鐘固定在 2026-11-11，「今年」相關的檢查才不會隨著日子過去而失效。（這兩件事都在 helpers/browser.js）
   這一支走主要流程；少見的分支與出狀況時的退路在同資料夾的 form.test.js、chart.test.js。 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ok, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, text, setVal } from '../helpers/browser.js';

const shotDir = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-'));
const harness = writeHarness(shotDir);

const open = (browser, opts = {}, hash = '', more = {}) => openPage(browser, harness, { context: opts, hash, ...more });
const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

(async () => {
  const browser = await launch();

  section('桌機：載入、分頁、運限');
  {
    const { ctx, page, errors } = await open(browser);
    ok(await page.evaluate(() => document.documentElement.lang) === 'zh-Hant', '文件語言標為繁體中文');
    ok((await text(page, '#bz-sub')).replace(/\s+/g, ' ') === '甲子 乙亥 戊午 己未', '開頁即顯示教材範例盤四柱');
    ok((await text(page, '#summary .nm')) === '教材範例盤' && await page.locator('#summary .badge').count() === 1 && await page.locator('#nm').inputValue() === '', '標示為教材範例盤，姓名欄留空');
    ok((await text(page, '#shensha')).includes('天乙貴人'), '神煞表有內容');
    ok((await text(page, '#yunhead')).includes('5 年 6 個月'), '起運時間');
    ok(await page.locator('#dayun .yun[aria-pressed=true] .now').count() === 1, '預設選到今年所在的大運');
    ok((await text(page, '#ix-title')).includes('2026 丙午'), '預設流年為今年（時鐘固定在 2026）');
    await page.screenshot({ path: path.join(shotDir, '1-bazi-light.png'), fullPage: true });
    await page.locator('#dayun [data-dy="0"]').click();
    ok((await text(page, '#ln-title')).includes('丙子運'), '點大運換流年列');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.dy === '0'), '重繪後焦點留在同一顆大運');

    await page.locator('#t-ziwei').click();
    ok(await page.locator('#p-bazi').isHidden() && await page.locator('#p-ziwei').isVisible(), '切到紫微分頁');
    await page.keyboard.press('ArrowLeft');
    ok(await page.locator('#p-bazi').isVisible() && await page.evaluate(() => document.activeElement.id) === 't-bazi', '左右鍵切換分頁');
    await page.keyboard.press('ArrowRight');
    ok(await page.evaluate(() => location.hash) === '#ziwei', '網址 hash 跟著分頁');
    ok(await page.locator('#zw .cell').count() === 12, '十二宮');
    ok((await text(page, '#zw .center')).includes('木三局'), '中宮顯示五行局');
    ok((await text(page, '#pdetail')).startsWith('命宮'), '預設選命宮');
    ok(await page.locator('#zw .cell.sf').count() === 4, '三方四正共四宮上色');
    ok((await text(page, '#decs .chip2.cur')).startsWith('今'), '目前的大限除了顏色也有「今」字');
    await page.screenshot({ path: path.join(shotDir, '2-ziwei-natal-light.png'), fullPage: true });
    await page.locator('#decs .chip2.cur').click();
    ok(await page.locator('#yrs .chip2[aria-pressed=true]').count() === 1 && (await text(page, '#yrs .chip2[aria-pressed=true]')).includes('2026'), '選今年所在大限時帶出今年');
    ok(await page.locator('#zw .ly.dec').count() === 12 && await page.locator('#zw .ly.yr').count() === 12, '每宮疊上大限、流年宮名');
    ok(await page.locator('#zw .hua.o.dec').count() === 4 && await page.locator('#zw .hua.o.yr').count() === 4, '大限、流年四化各四顆');
    await page.locator('#zw .cell[data-pal="6"]').click();
    ok((await text(page, '#pdetail')).startsWith('官祿'), '點宮位看三方四正');
    await page.locator('#zw .cell[data-pal="0"] .pn').focus();
    await page.keyboard.press('Enter');
    ok((await text(page, '#pdetail')).startsWith('夫妻') && (await text(page, '#pdetail')).includes('借對宮'), '鍵盤選宮；空宮借對宮');
    ok(await page.evaluate(() => document.activeElement.classList.contains('pn') && document.activeElement.getAttribute('aria-pressed') === 'true'), '選宮後焦點留在該宮按鈕');
    await page.screenshot({ path: path.join(shotDir, '3-ziwei-yun-light.png'), fullPage: true });
    // 只改姓名：保留已選的大限、流年、宮位
    await setVal(page, '#nm', '王小明');
    ok((await text(page, '#decs .chip2[aria-pressed=true]')).includes('43–52') && await page.locator('#yrs .chip2[aria-pressed=true]').count() === 1 && (await text(page, '#pdetail')).startsWith('夫妻') && (await text(page, '#zw .center .cn')).startsWith('王小明'), '只改姓名時保留選到的運限與宮位');
    await page.locator('#decs [data-dec=""]').click();
    ok(await page.locator('#zw .ly').count() === 0 && await page.locator('#yrs').isHidden(), '回到本命盤');
    // 打完字直接用滑鼠點運限：欄位失焦會觸發重排，重畫若發生在按下與放開之間，被點的按鈕被換掉，這一下點擊就消失
    await page.locator('#nm').click(); await page.keyboard.type('甲');
    await page.locator('#decs .chip2').nth(3).click();
    await page.waitForTimeout(50);
    ok((await text(page, '#decs .chip2[aria-pressed=true]')).includes('23–32') && (await text(page, '#zw .center .cn')).startsWith('王小明甲'), '改完姓名直接點大限：第一下就生效，姓名也更新');
    await page.locator('#t-bazi').click();
    await page.locator('#nm').click(); await page.keyboard.type('乙');
    await page.locator('#dayun [data-dy="1"]').click();
    await page.waitForTimeout(50);
    ok((await text(page, '#dayun .yun[aria-pressed=true]')).replace(/\s+/g, '').includes('丁丑') && (await text(page, '#summary .nm')) === '王小明甲乙', '改完姓名直接點大運：第一下就生效');
    ok(errors.length === 0, '桌機無錯誤：' + errors.join(' | '));
    await ctx.close();
    const deep = await open(browser, {}, '#ziwei');
    ok(await deep.page.locator('#p-ziwei').isVisible() && await deep.page.locator('#p-bazi').isHidden(), '帶 #ziwei 的連結直接開在紫微分頁');
    await deep.ctx.close();
  }

  section('表單：夏令時、子時、農曆、錯誤、儲存、複製');
  {
    const { ctx, page, errors } = await open(browser);
    await setVal(page, '#date', '1955-07-01');
    await setVal(page, '#time', '12:00');
    ok((await text(page, '#summary')).includes('UTC+9') && (await text(page, '#summary')).includes('1955-07-01 11:00'), '1955 夏令時自動換回標準時並提示');
    await page.locator('#clock').selectOption('std');
    ok((await text(page, '#summary')).includes('1955-07-01 12:00\u3000午時'), '改手動標準時則不扣');
    await page.locator('#clock').selectOption('auto');
    await setVal(page, '#date', '1990-05-23');
    await setVal(page, '#time', '23:30');
    ok((await text(page, '#summary')).includes('晚子時，採換日換柱') && (await text(page, '#summary')).includes('1990-05-24 子時起盤'), '晚子時換日並說明');
    const dayNext = (await text(page, '#bz-sub')).split(/\s+/)[2];
    await page.locator('#zi').selectOption('same');
    const daySame = (await text(page, '#bz-sub')).split(/\s+/)[2];
    ok(dayNext !== daySame && (await text(page, '#summary')).includes('夜子時不換日'), `子時立場改變日柱（${dayNext} → ${daySame}）`);
    await page.locator('#zi').selectOption('next');
    await setVal(page, '#time', '13:04');
    ok((await text(page, '#summary')).includes('離時辰交界只有 4 分鐘'), '時辰交界提醒');
    await setVal(page, '#time', '15:00');
    ok((await text(page, '#summary')).includes('15:00 正好是申時的起點'), '整點落在時辰起點的提醒');
    await setVal(page, '#time', '13:04');
    await page.locator('#tst').selectOption('1');
    ok((await text(page, '#summary')).includes('真太陽時：經度 +6.2 分'), '真太陽時說明');
    await page.locator('#tst').selectOption('0');

    await setVal(page, '#date', '1984-11-25');
    await page.locator('label:has(#c-l)').click();
    ok(await page.locator('#ly').inputValue() === '1984' && await page.locator('#lm').inputValue() === '10' && await page.locator('#ld').inputValue() === '3' && await page.locator('#leap').isChecked(), '公曆轉農曆（閏十月初三）');
    const lunarFits = () => page.evaluate(() => { const w = id => document.getElementById(id).getBoundingClientRect().width; return w('ly') >= 84 && w('lm') >= 84 && w('ld') >= 70; });
    ok(await lunarFits(), '農曆年月日三欄夠寬，內容不被截掉（桌機）');
    await page.setViewportSize({ width: 400, height: 860 });
    ok(await lunarFits() && await noOverflow(page), '農曆年月日三欄夠寬（手機寬度）');
    await page.screenshot({ path: path.join(shotDir, '9-lunar-phone.png') });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(shotDir, '9-lunar-desktop.png') });
    await page.locator('#lm').selectOption('5');
    ok(await page.locator('#err').isVisible() && (await text(page, '#err')).includes('沒有閏 5 月') && await page.locator('main.stale').count() === 1 && await page.locator('#p-bazi').evaluate(el => el.inert), '不存在的閏月報錯，上一次的盤調淡且不可操作');
    await page.screenshot({ path: path.join(shotDir, '8-error-stale.png') });
    await page.locator('#save').click();
    ok(await page.locator('#saved .chip').count() === 0 && await page.locator('#err').isVisible(), '排不出來的生辰不能儲存');
    await page.locator('#leap').uncheck();
    ok(await page.locator('#err').isHidden() && await page.locator('main.stale').count() === 0 && !(await page.locator('#p-bazi').evaluate(el => el.inert)), '修正後錯誤消失、盤恢復正常');
    // 農曆存檔來回
    await page.locator('#lm').selectOption('10'); await page.locator('#leap').check();
    await setVal(page, '#nm', '閏月');
    await page.locator('#save').click();
    await page.locator('#sample').click();
    await page.locator('#saved [data-load="0"]').click();
    ok(await page.locator('#c-l').isChecked() && await page.locator('#lm').inputValue() === '10' && await page.locator('#leap').isChecked() && (await text(page, '#summary')).includes('1984-11-25 13:04') && (await text(page, '#summary')).includes('閏十月初三'), '儲存再載入農曆閏月的盤');
    await page.locator('#saved [data-del="0"]').click();
    await page.locator('#leap').uncheck(); await page.locator('#lm').selectOption('5'); await setVal(page, '#nm', '');
    await page.locator('label:has(#c-s)').click();
    ok(await page.locator('#date').inputValue() === '1984-06-02', '農曆轉回公曆（五月初三 = 1984-06-02）');

    await page.locator('#place').selectOption('custom');
    ok(await page.locator('#err').isVisible() && await page.locator('#clock').inputValue() === 'std', '自訂地點未填經度報錯，夏令時改手動');
    await setVal(page, '#lon', '120.5');
    await setVal(page, '#tz', '8');
    ok(await page.locator('#err').isHidden() && (await text(page, '#summary')).includes('東經 120.5°'), '自訂地點可排');
    await setVal(page, '#lon', '-73.9'); await setVal(page, '#tz', '-5');
    ok((await text(page, '#summary')).includes('西經 73.9°') && (await text(page, '#summary')).includes('UTC−5'), '西經與負時區的標示');
    await setVal(page, '#lon', '119.99'); await setVal(page, '#tz', '8'); await page.locator('#tst').selectOption('1');
    ok((await text(page, '#summary')).includes('經度 +0.0 分') && !(await text(page, '#summary')).includes('−0.0'), '修正量接近零時不顯示負零');
    await page.locator('#tst').selectOption('0'); await setVal(page, '#lon', '120.5');
    await page.locator('#place').selectOption('台中');
    ok(await page.locator('#clock').inputValue() === 'auto', '換回內建地點時夏令時還原成自動');
    await page.locator('#place').selectOption('custom');

    await setVal(page, '#nm', '<b>測試</b>');
    ok(await page.locator('#summary .nm b').count() === 0 && (await text(page, '#summary .nm')) === '<b>測試</b>', '姓名以純文字顯示');
    await page.locator('#save').click();
    ok(await page.locator('#saved .chip').count() === 1, '儲存後出現在已存清單');
    await page.reload();
    ok(await page.locator('#saved .chip').count() === 1, '重新整理後仍在');
    await page.locator('#saved [data-load="0"]').click();
    ok(await page.locator('#place').inputValue() === 'custom' && await page.locator('#lon').inputValue() === '120.5' && (await text(page, '#summary .nm')) === '<b>測試</b>', '載入已存的盤');
    // 存檔內容不可信：格式不對、地名是物件原型上的鍵，都要被丟掉
    const hostile = [{ name: 'x', gender: '男"]', calendar: 'solar', y: 'abc' }, null, 5, { name: '原型鍵', gender: '男', calendar: 'solar', y: 1990, m: 1, d: 1, h: 10, mi: 0, place: 'constructor', clock: 'auto', useTST: false, ziRule: 'next' }];
    await page.evaluate(v => localStorage.setItem('paipan-saved-v1', JSON.stringify(v)), hostile);
    await page.reload();
    ok(await page.locator('#saved .chip').count() === 0, '壞掉或不可信的儲存資料被丟棄');
    await page.evaluate(() => localStorage.setItem('paipan-saved-v1', '{not json'));
    await page.reload();
    ok((await text(page, '#bz-sub')).includes('甲子'), '儲存資料無法解析時頁面照常');

    await page.locator('#copy').click();
    await page.waitForTimeout(200);
    const copied = await page.locator('.toast').count() ? await text(page, '.toast') : '';
    const fb = await page.locator('#copytext').count() ? await page.locator('#copytext').inputValue() : '';
    ok(copied.includes('已複製') || fb.includes('【八字】'), '複製文字盤：成功或退回選取文字');
    const txt = fb || await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    if (txt) ok(txt.includes('四柱：年 甲子') && txt.includes('【紫微斗數】木三局'), '文字盤內容');
    ok(errors.length === 0, '表單流程無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('逐鍵輸入日期');
  {
    const { ctx, page, errors } = await open(browser);
    const log = [];
    await page.exposeFunction('logErr', s => { log.push(s); });
    await page.evaluate(() => { const e = document.querySelector('#err'); new MutationObserver(() => window.logErr(e.hidden ? '' : e.textContent)).observe(e, { attributes: true, childList: true, characterData: true, subtree: true }); });
    await page.locator('#date').focus();
    await page.keyboard.type('07011955', { delay: 20 }); // 無頭 Chromium 的日期欄是 月/日/年
    await page.waitForTimeout(100);
    ok(await page.locator('#date').inputValue() === '1955-07-01' && (await text(page, '#summary')).includes('1955-07-01 14:00'), '打完整個日期後自動排盤');
    ok(log.every(s => s === ''), '年份還沒打完時不跳錯誤：' + JSON.stringify([...new Set(log)]));
    await page.keyboard.press('Backspace'); // 清掉年份那一格，欄位變成不完整
    await page.locator('#nm').focus();
    await page.waitForTimeout(50);
    ok(await page.locator('#err').isVisible() && (await text(page, '#err')).includes('請填出生日期'), '日期沒填完就離開欄位才報錯');
    ok(errors.length === 0, '無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('手機寬度與深色');
  {
    const { ctx, page, errors } = await open(browser, { viewport: { width: 400, height: 860 }, colorScheme: 'dark' });
    ok(await noOverflow(page), '八字分頁在 400px 不橫向捲動');
    await page.screenshot({ path: path.join(shotDir, '4-bazi-phone-dark.png'), fullPage: true });
    await page.locator('#t-ziwei').click();
    await page.locator('#decs .chip2.cur').click();
    ok(await noOverflow(page), '紫微分頁在 400px 不橫向捲動（命盤在自己的容器內捲）');
    ok(await page.evaluate(() => [...document.querySelectorAll('.st .n')].every(e => e.getBoundingClientRect().width < 22)), '窄宮格裡直排星名沒有被擠成兩欄');
    await page.screenshot({ path: path.join(shotDir, '5-ziwei-phone-dark.png'), fullPage: true });
    ok(errors.length === 0, '手機無錯誤：' + errors.join(' | '));
    await ctx.close();
    const d = await open(browser, { colorScheme: 'dark' });
    await d.page.locator('#t-ziwei').click();
    await d.page.locator('#decs .chip2.cur').click();
    await d.page.screenshot({ path: path.join(shotDir, '6-ziwei-dark.png'), fullPage: true });
    await d.page.locator('#t-bazi').click();
    await d.page.screenshot({ path: path.join(shotDir, '7-bazi-dark.png'), fullPage: true });
    await d.ctx.close();
  }

  section('「今年」的分界：2027-01-20 還沒過立春與春節');
  {
    const { ctx, page } = await open(browser);
    await page.clock.setFixedTime(new Date('2027-01-20T12:00:00+08:00'));
    await page.reload();
    ok((await text(page, '#liunian .yun:has(.now)')).includes('2026'), '八字流年的「今」仍在 2026 丙午（立春才換年）');
    await page.locator('#t-ziwei').click(); await page.locator('#decs .chip2.cur').click();
    ok((await text(page, '#yrs .chip2[aria-pressed=true]')).includes('2026'), '紫微流年的「今」仍在 2026（正月初一才換年）');
    await page.clock.setFixedTime(new Date('2027-03-01T12:00:00+08:00'));
    await page.reload();
    ok((await text(page, '#liunian .yun:has(.now)')).includes('2027'), '過了立春後換成 2027 丁未');
    await ctx.close();
  }

  section('函式庫沒載入');
  {
    const { ctx, page } = await open(browser, {}, '', { libs: false });
    ok(await page.locator('#err').isVisible() && (await text(page, '#err')).includes('函式庫沒有載入'), 'CDN 失敗時給出明確訊息');
    // 這時按「排盤」不可以讓瀏覽器把表單真的送出去（會帶著欄位內容重新載入頁面）
    const url = page.url();
    await page.locator('#nm').fill('王小明');
    await page.locator('#f button[type=submit]').click();
    await page.locator('#time').press('Enter');
    await page.waitForTimeout(300);
    ok(page.url() === url && await page.locator('#nm').inputValue() === '王小明' && (await text(page, '#err')).includes('函式庫沒有載入'), '函式庫沒載入時按「排盤」或 Enter：頁面不重新載入，網址不變，訊息還在');
    await ctx.close();
  }

  await browser.close();
  finish(`\u3000截圖：${shotDir}`);
})().catch(e => { console.error(e); process.exit(1); });
