/* 瀏覽器測試（表單與存檔）：node test/browser/form.test.js。先跑 node scripts/build.js。
   送出表單、輸入檢查的訊息、年份範圍、公曆農曆互轉、存檔、複製文字盤。
   冒煙測試（smoke.test.js）走的是主要流程；這一支補使用者碰得到、但主要流程走不到的分支。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ok, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, text, setVal } from '../helpers/browser.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-form-'));
const harness = writeHarness(dir);
const open = (browser, more) => openPage(browser, harness, more);

const errText = async page => (await page.locator('#err').isVisible() ? text(page, '#err') : ''); // 沒顯示錯誤時是空字串
const isStale = page => page.evaluate(() => document.querySelector('main').classList.contains('stale'));
const pillars = async page => (await text(page, '#bz-sub')).replace(/\s+/g, ' ');
const formState = page => page.evaluate(() => [...document.querySelectorAll('#f input, #f select')].map(el => `${el.id}=${el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value}${el.closest('[hidden]') ? '(hidden)' : ''}`).join(';'));
const savedLabels = page => page.locator('#saved [data-load]').allInnerTexts();
/* 提示訊息 1.8 秒後會自己收起來，機器忙的時候不一定來得及看。
   所以先在頁面裡掛觀察器（給 openPage 的 init 用），把每一次跳出來的訊息依序記在 window.toasts */
const logToasts = () => {
  window.toasts = [];
  new MutationObserver(records => { for (const r of records) if (r.target.className === 'toast' && !r.target.hidden) window.toasts.push(r.target.textContent); }).observe(document, { subtree: true, childList: true });
};
const toasts = page => page.evaluate(() => window.toasts);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 有錯誤、而且之前排出過盤時，訊息後面會接這一句
const STALE_NOTE = '下方變淡的是上一次排出的盤，修正後才會更新。';

(async () => {
  const browser = await launch();

  section('送出表單：按「排盤」、在欄位裡按 Enter');
  {
    const { ctx, page, errors } = await open(browser);
    const url = page.url();
    await page.locator('#nm').fill('送出');
    await page.locator('#time').focus(); // 先離開姓名欄，讓它的 change 送完；之後在裡面按 Enter 就只剩送出表單這一件事
    /* 要分得出重排是「送出表單」觸發的，就不能同時有 change 事件：
       時間用程式直接改值（不會有 change），再到一個沒動過的欄位裡按 Enter */
    const setTimeQuietly = v => page.evaluate(value => { document.querySelector('#time').value = value; }, v);
    await setTimeQuietly('08:00');
    ok((await text(page, '#summary')).includes('1984-11-20 14:00\u3000未時') && (await text(page, '#summary .nm')) === '送出', '前提：只改欄位的值、沒有 change 事件時不會自己重排');
    await page.locator('#f button[type=submit]').click();
    ok((await text(page, '#summary')).includes('1984-11-20 08:00\u3000辰時'), '按「排盤」按鈕會重排');
    await setTimeQuietly('10:00');
    await page.locator('#nm').press('Enter');
    ok((await text(page, '#summary')).includes('1984-11-20 10:00\u3000巳時'), '在姓名欄按 Enter 會重排');
    await setTimeQuietly('12:00');
    await page.locator('#time').press('Enter');
    ok((await text(page, '#summary')).includes('1984-11-20 12:00\u3000午時'), '在時間欄按 Enter 會重排');
    ok(page.url() === url && await page.locator('#nm').inputValue() === '送出', '送出表單不會換頁：網址不變，填過的內容還在');
    await page.locator('#date').focus();
    await page.keyboard.press('Backspace'); // 清掉第一格，欄位變成不完整
    ok(await page.locator('#date').inputValue() === '' && await errText(page) === '', '前提：日期清掉一格、人還在欄位裡時先不報錯');
    await page.keyboard.press('Enter');
    ok(await errText(page) === '請填出生日期（公曆，例如 1984-11-20）。' + STALE_NOTE, '日期沒填完就按 Enter：報錯');
    ok(errors.length === 0, '送出表單無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('輸入檢查的訊息');
  {
    const { ctx, page, errors } = await open(browser);
    await setVal(page, '#time', '');
    ok(await errText(page) === '請填出生時間（24 小時制，例如 14:00）。沒有出生時間就定不出時柱和紫微命宮。' + STALE_NOTE && await isStale(page), '沒填出生時間');
    await setVal(page, '#time', '14:00');
    ok(await errText(page) === '' && !(await isStale(page)), '補上出生時間後錯誤消失');
    await setVal(page, '#date', '1899-12-31');
    const tooEarly = await errText(page);
    await setVal(page, '#date', '2101-01-01');
    ok(tooEarly === '出生日期要在公曆 1900 到 2100 年之間。' + STALE_NOTE && await errText(page) === tooEarly, '公曆年份早於 1900、晚於 2100');
    await setVal(page, '#date', '1900-01-01');
    const first = await pillars(page), firstErr = await errText(page);
    await setVal(page, '#date', '2100-12-31');
    // 1900-01-01 還沒過立春，年柱是己亥（1899）；日柱甲戌是教材的錨點。2100 年是庚申
    ok(firstErr === '' && first.startsWith('己亥 ') && first.split(' ')[2] === '甲戌' && await errText(page) === '' && (await pillars(page)).startsWith('庚申 '), '公曆 1900-01-01 與 2100-12-31 這兩個邊界可以排');
    await setVal(page, '#date', '1984-11-20');
    await page.locator('label:has(#c-l)').click();
    // 這時農曆欄是十月廿八。範圍看換成公曆之後落在哪一年：農曆 1899 年十月廿八是公曆 1899-11-30
    const lunarYear = [];
    for (const v of ['1899', '2101', '1984.5', '']) { await setVal(page, '#ly', v); lunarYear.push(await errText(page)); }
    ok(same(lunarYear, ['農曆這一天是公曆 1899 年 11 月 30 日，超出可排的範圍（公曆 1900 到 2100 年）。', '農曆 2101 年超出可排的範圍（公曆 1900 到 2100 年）。', '請填農曆年份（整數，例如 1984）。', '請填農曆年份（整數，例如 1984）。'].map(e => e + STALE_NOTE)),
      '農曆年份超出範圍、不是整數、沒填：' + JSON.stringify(lunarYear));
    await setVal(page, '#ly', '1900');
    const lunarFirst = await errText(page);
    await setVal(page, '#ly', '2100');
    ok(lunarFirst === '' && await errText(page) === '', '農曆 1900 與 2100 年可以排');
    await setVal(page, '#ly', '1984'); await page.locator('#lm').selectOption('5'); await page.locator('#ld').selectOption('30');
    ok(await errText(page) === '農曆 1984 年 5 月沒有第 30 天。' + STALE_NOTE, '農曆小月沒有三十（平月的訊息，和閏月的不同）');
    await page.locator('#ld').selectOption('29');
    ok(await errText(page) === '' && (await text(page, '#summary')).includes('五月廿九'), '改成廿九就排得出來');
    ok(errors.length === 0, '輸入檢查無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  /* 可排的範圍是公曆 1900 到 2100 年。農曆 1899 年十二月是公曆 1900 年 1 月，農曆 2100 年底已是公曆 2101 年：
     同一天不管用哪一種曆輸入，都要一樣排得出來、或一樣排不出來 */
  section('年份範圍的兩端：公曆和農曆說法一致');
  {
    const { ctx, page, errors } = await open(browser);
    const lunarFields = () => page.evaluate(() => ['ly', 'lm', 'ld'].map(id => document.getElementById(id).value).join('/'));
    await setVal(page, '#date', '1900-01-15');
    const solarEarly = await pillars(page);
    await page.locator('label:has(#c-l)').click();
    ok(solarEarly === '己亥 丁丑 戊子 己未' && await lunarFields() === '1899/12/15' && await errText(page) === '' && await pillars(page) === solarEarly && !(await isStale(page)), '公曆 1900-01-15 切成農曆是 1899 年十二月十五：照樣排得出來，盤不變');
    await setVal(page, '#ly', '2100'); await page.locator('#lm').selectOption('12'); await page.locator('#ld').selectOption('10');
    const lunarLate = await errText(page);
    await page.locator('label:has(#c-s)').click();
    ok(lunarLate === '農曆這一天是公曆 2101 年 1 月 9 日，超出可排的範圍（公曆 1900 到 2100 年）。' + STALE_NOTE && await page.locator('#date').inputValue() === '2101-01-09' && await errText(page) === '出生日期要在公曆 1900 到 2100 年之間。' + STALE_NOTE,
      '農曆 2100 年十二月初十是公曆 2101-01-09：兩種曆都說超出範圍');
    await page.locator('label:has(#c-l)').click();
    await page.locator('#lm').selectOption('11'); await page.locator('#ld').selectOption('1');
    ok(await errText(page) === '' && (await text(page, '#summary')).includes('2100-12-01 14:00'), '農曆 2100 年十一月初一（公曆 2100-12-01）還在範圍內');
    ok(errors.length === 0, '年份範圍無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  // 同一天從公曆切成農曆，排出來的是同一張盤：已經選好的大運、流年、宮位不該被重設
  section('切換公曆、農曆不會重設選到的運限與宮位');
  {
    const { ctx, page, errors } = await open(browser);
    const picked = () => page.evaluate(() => [...document.querySelectorAll('#dayun [aria-pressed=true], #liunian [aria-pressed=true], #decs [aria-pressed=true], #yrs [aria-pressed=true], #zw .pn[aria-pressed=true]')].map(el => el.dataset.dy || el.dataset.ln || el.dataset.dec || el.dataset.yr || el.textContent).join('|'));
    await page.locator('#dayun [data-dy="2"]').click();
    await page.locator('#liunian [data-ln="2014"]').click();
    await page.locator('#t-ziwei').click();
    await page.locator('#decs .chip2').nth(3).click();
    await page.locator('#zw .cell[data-pal="7"]').click();
    const before = await picked();
    await page.locator('label:has(#c-l)').click();
    const asLunar = await picked();
    await page.locator('label:has(#c-s)').click();
    ok(before.startsWith('2|2014|') && asLunar === before && await picked() === before, `切成農曆再切回公曆，選到的大運、流年、大限、宮位都還在：${before}`);
    await setVal(page, '#time', '16:00');
    ok(await picked() !== before && (await picked()).startsWith('3|2026|'), '換了時辰是另一張盤：回到今天所在的大運（己卯運）與今年');
    ok(errors.length === 0, '切換曆法無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('公曆、農曆互轉：閏月、大月的三十、不存在的日期');
  {
    const { ctx, page, errors } = await open(browser);
    const lunarFields = () => page.evaluate(() => ['ly', 'lm', 'ld'].map(id => document.getElementById(id).value).join('/') + (document.getElementById('leap').checked ? ' 閏' : ''));
    await page.locator('label:has(#c-l)').click();
    await setVal(page, '#ly', '2023'); await page.locator('#lm').selectOption('2'); await page.locator('#ld').selectOption('10');
    ok((await text(page, '#summary')).includes('2023-03-01 14:00'), '農曆 2023 年二月初十（平月）是公曆 3 月 1 日');
    await page.locator('#leap').check();
    ok((await text(page, '#summary')).includes('2023-03-31 14:00') && (await text(page, '#summary')).includes('閏二月初十'), '勾了閏月：閏二月初十是公曆 3 月 31 日');
    await page.locator('label:has(#c-s)').click();
    ok(await page.locator('#date').inputValue() === '2023-03-31' && await page.locator('#solar-box').isVisible() && await page.locator('#lunar-box').isHidden() && (await text(page, '#summary')).includes('閏二月初十'), '農曆閏月轉成公曆（閏二月初十 = 2023-03-31），盤不變');
    await page.locator('label:has(#c-l)').click();
    ok(await lunarFields() === '2023/2/10 閏', '再轉回農曆：年月日和閏月的勾都回來');
    await page.locator('#leap').uncheck(); await page.locator('#ld').selectOption('30');
    ok(await errText(page) === '' && (await text(page, '#summary')).includes('二月三十') && (await text(page, '#summary')).includes('2023-03-21 14:00'), '大月的三十日排得出來，農曆寫成「三十」');
    await page.locator('label:has(#c-s)').click();
    ok(await page.locator('#date').inputValue() === '2023-03-21', '大月的三十日轉成公曆（二月三十 = 2023-03-21）');
    // 農曆日期不存在時沒得換算：公曆欄留著原來的值，切回公曆後就照那個值排
    await page.locator('label:has(#c-l)').click();
    await setVal(page, '#ly', '1984'); await page.locator('#lm').selectOption('5'); await page.locator('#ld').selectOption('3'); await page.locator('#leap').check();
    const rejected = await errText(page);
    await page.locator('label:has(#c-s)').click();
    ok(rejected.includes('沒有閏 5 月') && await page.locator('#date').inputValue() === '2023-03-21' && await errText(page) === '' && (await text(page, '#summary')).includes('2023-03-21 14:00'), '農曆日期不存在（1984 年沒有閏五月）時切回公曆：不換算，公曆欄維持原值並照它排盤');
    ok(errors.length === 0, '曆法互轉無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('存檔：女命、農曆閏月、真太陽時、夜子時不換日、沒有姓名');
  {
    const { ctx, page, errors } = await open(browser, { init: [logToasts] });
    const rendered = () => page.evaluate(() => ['#summary', '#p-bazi', '#p-ziwei'].map(s => document.querySelector(s).innerHTML).join('\n'));
    await page.locator('label:has(#g-f)').click();
    await page.locator('label:has(#c-l)').click();
    await setVal(page, '#ly', '2023'); await page.locator('#lm').selectOption('2'); await page.locator('#ld').selectOption('10'); await page.locator('#leap').check();
    await setVal(page, '#time', '23:30');
    await page.locator('#tst').selectOption('1'); await page.locator('#zi').selectOption('same');
    const sum = await text(page, '#summary');
    // 日柱、時柱用獨立公式複核過：2023-03-31 是戊子日；夜子時不換日，時干取次日（己丑日）的子時，五鼠遁得甲子
    ok(await pillars(page) === '癸卯 乙卯 戊子 甲子' && sum.includes('坤造') && sum.includes('閏二月初十') && sum.includes('真太陽時：經度 +6.2 分') && sum.includes('晚子時，採夜子時不換日'), '前提：這組設定排得出來，四柱為癸卯 乙卯 戊子 甲子');
    const form = await formState(page), view = await rendered();
    await page.locator('#save').click();
    ok(same(await toasts(page), ['已存在這個瀏覽器']), '儲存後出現「已存在這個瀏覽器」提示');
    ok(same(await savedLabels(page), ['未命名 · 農曆 2023/閏2/10 23:30']) && await page.locator('#saved [data-del="0"]').getAttribute('aria-label') === '刪除 未命名 · 農曆 2023/閏2/10 23:30', '清單上的標籤：沒有姓名寫「未命名」，農曆閏月寫「農曆 2023/閏2/10」');
    await page.locator('#save').click();
    ok((await savedLabels(page)).length === 1, '同一份生辰存兩次，清單只有一筆');
    await page.locator('#sample').click();
    ok(await formState(page) !== form && (await text(page, '#summary .nm')) === '教材範例盤', '前提：載入範例盤後表單與盤都換掉了');
    await page.locator('#saved [data-load="0"]').click();
    ok(await formState(page) === form, '載入存檔：表單各欄位還原（女、農曆、閏月、23:30、校正真太陽時、夜子時不換日、姓名空白）');
    ok(await rendered() === view, '載入存檔：排出的盤和儲存前一字不差');
    await page.locator('#leap').uncheck(); await page.locator('#ld').selectOption('30'); await setVal(page, '#nm', '大月');
    await page.locator('#save').click();
    ok(same(await savedLabels(page), ['大月 · 農曆 2023/2/30 23:30', '未命名 · 農曆 2023/閏2/10 23:30']), '平月的標籤不帶「閏」字；新存的排在最前面');
    await page.locator('#saved [data-load="1"]').click();
    await page.locator('#save').click();
    ok(same(await savedLabels(page), ['未命名 · 農曆 2023/閏2/10 23:30', '大月 · 農曆 2023/2/30 23:30']), '清單裡已經有的再存一次：移到最前面，不會多出一筆');
    // 第 15 版：上限 100（登入後幾台裝置的盤合在一起）；多於 13 個時先列 12 個，其餘收在「全部 N 個」後面
    await page.evaluate(() => localStorage.setItem('paipan-saved-v1', JSON.stringify(Array.from({ length: 100 }, (_, k) => ({ name: '第' + k, gender: '男', calendar: 'solar', y: 1990, m: 1 + Math.floor(k / 28), d: 1 + (k % 28), h: 10, mi: 0, place: '台北', clock: 'auto', useTST: false, ziRule: 'next' })))));
    await page.reload();
    const more = page.locator('#saved [data-more]');
    ok((await savedLabels(page)).length === 12 && await more.innerText() === '全部 100 個' && await more.getAttribute('aria-expanded') === 'false', '100 個盤：先列 12 個，其餘收在「全部 100 個」後面');
    await more.click();
    const full = await savedLabels(page);
    ok(full.length === 100 && await more.innerText() === '收起' && await more.getAttribute('aria-expanded') === 'true' && await page.evaluate(() => document.activeElement?.dataset.more !== undefined), '按「全部 100 個」：列出全部，按鈕變成「收起」，焦點留在按鈕上');
    await page.locator('#saved [data-del="99"]').click();
    ok((await savedLabels(page)).length === 99 && !(await savedLabels(page)).includes('第99 · 1990/4/16 10:00'), '展開時刪最後一個：刪的就是那一個（按鈕的編號和清單一致）');
    await page.locator('#save').click();
    await page.locator('#save').click();
    const capped = await savedLabels(page);
    ok(full.length === 100 && capped.length === 100 && capped[0] === '未命名 · 1984/11/20 14:00' && capped[99] === '第98 · 1990/4/15 10:00', '最多留 100 筆：新存的排最前面，同一個再存不會多一筆');
    await page.locator('#nm').fill('新的'); await page.locator('#nm').dispatchEvent('change');
    await page.locator('#save').click();
    const after = await savedLabels(page);
    ok(after.length === 100 && after[0].startsWith('新的 · ') && after[1] === '未命名 · 1984/11/20 14:00' && !after.includes('第98 · 1990/4/15 10:00'), '滿 100 筆再存一個新的：新存的排最前面，最舊的一筆被擠掉');
    await more.click();
    ok((await savedLabels(page)).length === 12, '按「收起」：回到只列 12 個');
    ok(errors.length === 0, '存檔流程無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('存檔：瀏覽器不讓寫入、存的內容不是陣列');
  {
    const denyWrite = () => { Storage.prototype.setItem = () => { throw new DOMException('模擬：不能寫入', 'QuotaExceededError'); }; };
    const { ctx, page, errors } = await open(browser, { init: [logToasts, denyWrite] });
    await page.locator('#save').click();
    ok(same(await toasts(page), ['這個瀏覽器不允許儲存']) && await page.locator('#saved .chip').count() === 0, 'localStorage 不能寫入時提示「這個瀏覽器不允許儲存」，清單不變');
    ok(await errText(page) === '' && await pillars(page) === '甲子 乙亥 戊午 己未' && errors.length === 0, '不能儲存時頁面照常、沒有錯誤：' + errors.join(' | '));
    await ctx.close();

    const plain = await open(browser);
    const seen = [];
    for (const stored of ['{"name":"x"}', '"字串"', '5', 'null']) {
      await plain.page.evaluate(v => localStorage.setItem('paipan-saved-v1', v), stored);
      await plain.page.reload();
      seen.push(`${await plain.page.locator('#saved .chip').count()} 筆、${await pillars(plain.page)}`);
    }
    ok(seen.every(s => s === '0 筆、甲子 乙亥 戊午 己未'), '存的內容是物件、字串、數字、null（不是陣列）時當作沒有存檔，頁面照常：' + JSON.stringify([...new Set(seen)]));
    await plain.page.locator('#save').click();
    const stored = await plain.page.evaluate(() => JSON.parse(localStorage.getItem('paipan-saved-v1')));
    ok(await plain.page.locator('#saved .chip').count() === 1 && Array.isArray(stored) && stored.length === 1, '之後照常可以儲存，壞掉的內容被蓋掉');
    ok(plain.errors.length === 0, '存檔內容不是陣列時無錯誤：' + plain.errors.join(' | '));
    await plain.ctx.close();
  }

  section('存檔：表單有錯時不存、排不出來的存檔不列');
  {
    const { ctx, page, errors } = await open(browser, { init: [logToasts] });
    await page.locator('#save').click();
    await setVal(page, '#time', '');
    const before = await errText(page);
    await page.locator('#save').click();
    ok(before.endsWith(STALE_NOTE) && await errText(page) === before && await isStale(page) && await page.locator('#saved .chip').count() === 1 && same(await toasts(page), ['已存在這個瀏覽器']),
      '表單有錯時按「儲存此盤」：不存，錯誤訊息原樣留著（包含「下方變淡的是上一次排出的盤」那一句）');
    await setVal(page, '#time', '15:00');
    await page.locator('#save').click();
    ok(await errText(page) === '' && same(await savedLabels(page), ['未命名 · 1984/11/20 15:00', '未命名 · 1984/11/20 14:00']), '修正後就存得進去，新的一筆排最前面');
    // 存檔內容被動過手腳：日期不存在、超出範圍的，引擎排不出來，清單上就不列
    const good = { name: '好的', gender: '男', calendar: 'solar', y: 1990, m: 5, d: 5, h: 5, mi: 5, place: '台北', clock: 'auto', useTST: false, ziRule: 'next' };
    await page.evaluate(list => localStorage.setItem('paipan-saved-v1', JSON.stringify(list)), [
      { ...good, name: '二月三十', y: 2001, m: 2, d: 30 }, { ...good, name: '太晚', y: 2101, m: 1, d: 1 }, good,
      { ...good, name: '農曆太晚', calendar: 'lunar', ly: 2100, lm: 12, ld: 10, leap: false }, { ...good, name: '沒有的閏月', calendar: 'lunar', ly: 1984, lm: 5, ld: 3, leap: true },
      { ...good, name: '農曆 1899 年底', calendar: 'lunar', ly: 1899, lm: 12, ld: 15, leap: false },
    ]);
    await page.reload();
    ok(same(await savedLabels(page), ['好的 · 1990/5/5 05:05', '農曆 1899 年底 · 農曆 1899/12/15 05:05']), '存檔裡排不出來的生辰（2 月 30 日、超出範圍、沒有的閏月）不列；農曆 1899 年十二月在範圍內，照列：' + JSON.stringify(await savedLabels(page)));
    await page.locator('#saved [data-load]').nth(1).click();
    ok(await errText(page) === '' && (await text(page, '#summary')).includes('1900-01-15 05:05'), '載入農曆 1899 年十二月十五的存檔：排得出來（公曆 1900-01-15）');
    ok(errors.length === 0, '存檔檢查無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('複製文字盤：剪貼簿可用、被拒絕、不存在');
  {
    // 假的剪貼簿：記下寫進來的文字；把 window.clipboardOk 設成 false 就模擬被瀏覽器拒絕
    const fakeClipboard = () => {
      window.copied = []; window.clipboardOk = true;
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: t => (window.clipboardOk ? (window.copied.push(t), Promise.resolve()) : Promise.reject(new Error('blocked'))) }, configurable: true });
    };
    const { ctx, page, errors } = await open(browser, { init: [logToasts, fakeClipboard] });
    await page.locator('#copy').click();
    const copied = await page.evaluate(() => window.copied);
    ok(same(await toasts(page), ['文字盤已複製']) && await page.locator('.toast').getAttribute('role') === 'status', '剪貼簿可用：出現「文字盤已複製」提示');
    ok(await page.locator('#copyfallback').isHidden() && await page.locator('#copytext').count() === 0, '剪貼簿可用時不顯示備用文字框');
    ok(copied.length === 1 && copied[0].startsWith('【八字】教材範例盤\u3000乾造\n') && copied[0].includes('四柱：年 甲子') && copied[0].includes('【紫微斗數】木三局'), '寫進剪貼簿的是整份文字盤');
    await page.evaluate(() => { window.clipboardOk = false; });
    await page.locator('#copy').click();
    await page.waitForSelector('#copytext');
    ok(await page.locator('#copyfallback').isVisible() && await page.locator('#copytext').inputValue() === copied[0] && await page.evaluate(() => { const ta = document.querySelector('#copytext'); return document.activeElement === ta && ta.readOnly && ta.selectionStart === 0 && ta.selectionEnd === ta.value.length; }) && (await toasts(page)).length === 1, '剪貼簿被拒絕：改顯示備用文字框，內容相同、已全選，不跳「已複製」');
    await page.evaluate(() => { window.clipboardOk = true; });
    await page.locator('#copy').click();
    ok(await page.locator('#copyfallback').isHidden() && await page.evaluate(() => window.copied.length) === 2 && same(await toasts(page), ['文字盤已複製', '文字盤已複製']), '之後又複製成功：備用文字框收起來，再跳一次提示');
    // 等提示自己收起來（約 1.8 秒）。等不到就算失敗，不讓整支測試卡到逾時
    const hid = await page.waitForFunction(() => document.querySelector('.toast').hidden, null, { timeout: 10000 }).then(() => true, () => false);
    ok(hid && await page.locator('.toast').isHidden(), '提示過一會兒會自己收起來');
    ok(errors.length === 0, '複製流程無錯誤：' + errors.join(' | '));
    await ctx.close();

    const noClipboard = () => { Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true }); };
    const bare = await open(browser, { init: [logToasts, noClipboard] });
    await bare.page.locator('#copy').click();
    ok(await bare.page.locator('#copyfallback').isVisible() && await bare.page.locator('#copytext').count() === 1 && (await bare.page.locator('#copytext').inputValue()).startsWith('【八字】教材範例盤') && same(await toasts(bare.page), []), 'navigator.clipboard 不存在：直接走備用文字框');
    // 備用文字框裡是按下當時那張盤的文字：換了盤、或輸入有錯，就要收起來，不可以留著舊盤的內容
    await setVal(bare.page, '#date', '1990-05-05');
    ok(await bare.page.locator('#copyfallback').isHidden() && await pillars(bare.page) === '庚午 庚辰 庚午 癸未', '換了一張盤：備用文字框收起來');
    await bare.page.locator('#copy').click();
    ok((await bare.page.locator('#copytext').inputValue()).includes('出生：1990-05-05 14:00'), '再按一次複製：文字框裡是新的盤');
    await setVal(bare.page, '#time', '');
    ok(await bare.page.locator('#copyfallback').isHidden() && await isStale(bare.page), '輸入有錯時：備用文字框也收起來（裡面是上一張盤）');
    await setVal(bare.page, '#time', '14:00');
    await bare.page.locator('#copy').click();
    await bare.page.locator('#nm').fill('改名'); await bare.page.locator('#nm').dispatchEvent('change');
    ok(await bare.page.locator('#copyfallback').isHidden(), '只改姓名也收起來：文字盤第一行有姓名');
    ok(bare.errors.length === 0, '沒有剪貼簿時無錯誤：' + bare.errors.join(' | '));
    await bare.ctx.close();
  }

  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
})().catch(e => { console.error(e); process.exit(1); });
