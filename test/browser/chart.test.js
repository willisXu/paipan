/* 瀏覽器測試（盤面與退路）：node test/browser/chart.test.js。先跑 node scripts/build.js。
   少見但真的會出現的盤面（交節前後、兩種年界不同年、沒有關係／神煞／通根的盤、歲運並臨、交運那一年、換日的時刻、重複與不存在的鐘面時間），
   以及出狀況時的退路（函式庫丟出例外、瀏覽器沒有時區資料、運限查不到）。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ok, section, finish } from '../helpers/harness.js';
import { launch, writeHarness, openPage, text, setVal, blockClipboard, buttonNames } from '../helpers/browser.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-chart-'));
const harness = writeHarness(dir);
const open = (browser, more) => openPage(browser, harness, more);

const errText = async page => (await page.locator('#err').isVisible() ? text(page, '#err') : ''); // 沒顯示錯誤時是空字串
const pillars = async page => (await text(page, '#bz-sub')).replace(/\s+/g, ' ');
const warnings = async page => (await page.locator('#summary .warn').allInnerTexts()).join('\n');
// 換一份公曆生辰，回傳排出來的四柱
const born = async (page, date, time) => { await setVal(page, '#date', date); await setVal(page, '#time', time); return pillars(page); };
// 文字盤：剪貼簿已用 blockClipboard 擋掉，內容會出現在備用文字框
const textChart = async page => { await page.locator('#copy').click(); await page.waitForSelector('#copytext'); return page.locator('#copytext').inputValue(); };
const inert = page => page.evaluate(() => ['main > .summary', 'main > .tabbar', '#p-bazi', '#p-ziwei', '#f'].map(s => document.querySelector(s).inert).join());
const overlay = async page => `${await page.locator('#zw .ly.dec').count()}/${await page.locator('#zw .ly.yr').count()}/${await page.locator('#zw .hua.o').count()}`; // 疊上的大限宮名／流年宮名／運限四化
/* 給 openPage 的 init 用：把接下來載入的 iztro 包一層，測試就能在執行中用 window.iztroFault 讓它出狀況：
   null 正常、'error' 排盤時丟 Error、'string' 丟字串、數字 N 表示運限查到 N 年（含）以後就丟例外。
   包在最外面、呼叫當下才看開關，所以不管頁面是每次才取全域的 iztro，還是載入時就把它存起來，都切換得到。 */
const wrapIztro = () => {
  let wrapped;
  window.iztroFault = null;
  Object.defineProperty(window, 'iztro', {
    configurable: true,
    get: () => wrapped,
    set: real => {
      const withOptions = (...args) => {
        if (window.iztroFault === 'error') throw new Error('模擬的函式庫錯誤');
        if (window.iztroFault === 'string') throw '不是 Error 物件';
        const chart = real.astro.withOptions(...args), horoscope = chart.horoscope.bind(chart);
        chart.horoscope = date => { if (typeof window.iztroFault === 'number' && parseInt(date, 10) >= window.iztroFault) throw new Error('模擬：超出範圍'); return horoscope(date); };
        return chart;
      };
      wrapped = { ...real, astro: { ...real.astro, withOptions } };
    },
  });
};
const setFault = (page, fault) => page.evaluate(v => { window.iztroFault = v; }, fault);

(async () => {
  const browser = await launch();

  section('節氣提醒：還沒到交節、剛過交節、同一分鐘（1984 立冬 11-07 13:45:32）');
  {
    const { ctx, page, errors } = await open(browser);
    const before = await born(page, '1984-11-07', '13:30'), warnBefore = await warnings(page), sumBefore = await text(page, '#summary');
    ok(before.split(' ')[1] === '甲戌' && warnBefore.includes('出生時間離立冬交節（1984-11-07 13:45:32，UTC+8）不到一天') && sumBefore.includes('距立冬 15 分鐘'), '交節前 15 分鐘：月柱還是甲戌，提醒離立冬不到一天');
    const after = await born(page, '1984-11-07', '14:00'), warnAfter = await warnings(page);
    ok(after.split(' ')[1] === '乙亥' && (await text(page, '#summary')).includes('立冬後 14 分鐘') && (await text(page, '#summary')).includes('立冬交節 1984-11-07 13:45:32（UTC+8）'), '剛過交節 14 分 28 秒：月柱換成乙亥，交節時刻寫到秒');
    ok(warnAfter.includes('出生時間離立冬交節（1984-11-07 13:45:32，UTC+8）不到一天') && !warnAfter.includes('大雪') && warnAfter.includes('出生時間稍有誤差，月柱就可能不同'), '剛過交節時提醒的是剛過的立冬，不是下一個節');
    // 出生時間只到分。和交節同一分鐘時先後分不出來：引擎把出生當作那一分鐘的 0 秒，所以算在交節之前
    const same = await born(page, '1984-11-07', '13:45'), warnSame = await warnings(page);
    ok(same.split(' ')[1] === '甲戌' && (await text(page, '#summary')).includes('距立冬 不到 1 分鐘') && warnSame.includes('出生和交節在同一分鐘，先後分不出來；目前當作交節之前排盤，差幾秒月柱就不同'), '出生和交節同一分鐘（13:45）：不寫「0 分鐘」，並說明目前當作交節之前');
    const next = await born(page, '1984-11-07', '13:46');
    ok(next.split(' ')[1] === '乙亥' && (await text(page, '#summary')).includes('立冬後 不到 1 分鐘') && !(await warnings(page)).includes('同一分鐘'), '下一分鐘（13:46）已經確定在交節之後：不說分不出來');
    // 立春：連年柱、大運順逆都跟著變（2024 立春 02-04 16:27:07）
    const lichun = await born(page, '2024-02-04', '16:27'), warnLichun = await warnings(page), headBefore = await text(page, '#yunhead');
    const lichunAfter = await born(page, '2024-02-04', '16:28');
    ok(lichun.startsWith('癸卯 乙丑') && lichunAfter.startsWith('甲辰 丙寅') && headBefore.includes('陰男逆行') && (await text(page, '#yunhead')).includes('陽男順行') && warnLichun.includes('差幾秒年柱、月柱和大運順逆就不同'),
      '立春前後一分鐘：年柱、月柱、大運順逆都不同，提醒裡寫明');
    // 交節時刻的秒數正好是 0（1990 立春 02-04 10:14:00）：同一分鐘出生的人和交節同時，算在交節之後
    const onDot = await born(page, '1990-02-04', '10:14'), warnOnDot = await warnings(page), sumOnDot = await text(page, '#summary');
    const justBefore = await born(page, '1990-02-04', '10:13');
    ok(onDot.startsWith('庚午 戊寅') && justBefore.startsWith('己巳 丁丑') && sumOnDot.includes('立春後 不到 1 分鐘') && sumOnDot.includes('立春交節 1990-02-04 10:14:00') && warnOnDot.includes('出生和交節在同一分鐘，先後分不出來；目前當作交節之後排盤，差幾秒年柱、月柱和大運順逆就不同'),
      `交節時刻正好在整分上：同一分鐘出生的當作交節之後，提醒也這樣寫。${onDot}｜${justBefore}`);
    ok(errors.length === 0, '節氣提醒無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('紫微的生年和八字年柱不同年');
  {
    const { ctx, page, errors } = await open(browser, { init: [blockClipboard] });
    const birthYear = page.locator('#zw .center dd', { hasText: '年，屬' }); // 中宮「生年」那一格
    const note = async () => (await birthYear.locator('small').allInnerTexts()).join(); // 生年後面的註記，沒有時是空字串
    // 1985 立春 02-04、春節 02-20：兩者之間出生，八字已經換年、紫微還沒
    const a = await born(page, '1985-02-10', '12:00');
    ok(a.startsWith('乙丑 ') && (await birthYear.innerText()).startsWith('甲子年，屬鼠') && await note() === '以正月初一分界；八字年柱以立春分界，為乙丑', '立春後、春節前出生：八字年柱乙丑，紫微生年甲子，並加註');
    const txt = await textChart(page);
    ok(txt.includes('四柱：年 乙丑') && /^起盤：.*生年 甲子$/m.test(txt), '文字盤也是兩個年：四柱年柱乙丑、紫微生年甲子');
    // 2025 春節 01-29、立春 02-03：順序反過來，紫微先換年
    const b = await born(page, '2025-02-01', '12:00');
    ok(b.startsWith('甲辰 ') && (await birthYear.innerText()).startsWith('乙巳年，屬蛇') && await note() === '以正月初一分界；八字年柱以立春分界，為甲辰', '春節後、立春前出生：八字年柱甲辰，紫微生年乙巳，並加註');
    const c = await born(page, '1985-02-03', '12:00');
    ok(c.startsWith('甲子 ') && (await birthYear.innerText()) === '甲子年，屬鼠' && await note() === '', '兩邊同一年時不加註');
    ok(errors.length === 0, '生年註記無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  /* 這幾張盤是用引擎在 1980–2010 年間每天各時辰搜出來的真實生辰（台北、預設設定，當年沒有夏令時間）。
     刻意各找一張「只缺一樣」的，才看得出三處的「沒有」互不相干。 */
  section('「沒有」的盤：沒有干支關係、沒有神煞、日主沒有通根');
  {
    const { ctx, page, errors } = await open(browser, { init: [blockClipboard] });
    const rels = () => text(page, '#rels'), shensha = () => text(page, '#shensha tbody'), strength = async () => (await text(page, '#strength')).replace(/\s+/g, ' ');
    const rows = () => page.locator('#shensha tbody tr').count();

    const noRel = await born(page, '1980-03-07', '06:00');
    ok(noRel === '庚申 己卯 己卯 丁卯' && await rels() === '原局沒有合、沖、刑、害。' && await page.locator('#rels .rel').count() === 0, '沒有干支關係的盤（庚申 己卯 己卯 丁卯）：顯示「原局沒有合、沖、刑、害。」');
    ok(await rows() === 2 && (await strength()).includes('有根：年支申（藏戊）'), '同一張盤的神煞、通根照常列出');
    ok((await textChart(page)).includes('\n干支關係：無\n'), '文字盤的干支關係寫「無」');
    await page.locator('#dayun [data-dy="9"]').click();
    await page.locator('#liunian [data-ln="2081"]').click();
    ok((await text(page, '#ix-title')).includes('己丑運、2081 辛丑年') && await text(page, '#ix') === '這一運、這一年和原局沒有合、沖、刑、害。', '運、歲和原局都沒有關係時（己丑運、2081 辛丑年）也有說明');

    const noSha = await born(page, '1980-03-19', '16:00');
    ok(noSha === '庚申 己卯 辛卯 丙申' && await shensha() === '常用神煞在原局都沒有出現。' && await rows() === 1 && await page.locator('#shensha tbody td').first().getAttribute('colspan') === '4', '沒有神煞命中的盤（庚申 己卯 辛卯 丙申）：表格只有一列「常用神煞在原局都沒有出現。」');
    ok(await text(page, '#other') === '原局未見：天乙貴人、文昌、祿神、驛馬、桃花（咸池）、華蓋、空亡。胎元 庚午（月干進一、月支進三）。', '沒出現的神煞全列在備註（辛日不查羊刃，所以不在名單裡）');
    ok(await page.locator('#rels .rel').count() === 1 && (await strength()).includes('有根：年支申（藏庚，本氣）、時支申（藏庚，本氣）'), '同一張盤的干支關係、通根照常列出');

    const noRoot = await born(page, '1980-03-15', '02:00');
    ok(noRoot === '庚申 己卯 丁亥 辛丑' && (await strength()).includes('得地 地支藏干裡沒有同五行的根'), '日主沒有通根的盤（庚申 己卯 丁亥 辛丑）：顯示「地支藏干裡沒有同五行的根」');
    ok((await strength()).includes('天干印星：無；天干比劫：無'), '天干沒有印星、比劫時各寫「無」');
    ok((await textChart(page)).includes('\n旺衰觀察：丁生卯月處相；通根 無\n'), '文字盤的通根寫「無」');
    ok(await page.locator('#rels .rel').count() === 2 && await rows() === 3, '同一張盤的干支關係、神煞照常列出');

    const none = await born(page, '1986-02-15', '08:00'), noneText = await textChart(page);
    ok(none === '丙寅 庚寅 庚寅 庚辰' && await rels() === '原局沒有合、沖、刑、害。' && await shensha() === '常用神煞在原局都沒有出現。' && (await strength()).includes('地支藏干裡沒有同五行的根'), '三樣都沒有的盤（丙寅 庚寅 庚寅 庚辰）：三處各自顯示「沒有」');
    ok(noneText.includes('\n旺衰觀察：庚生寅月處囚；通根 無\n干支關係：無\n') && await text(page, '#other') === '原局未見：天乙貴人、文昌、祿神、羊刃、驛馬、桃花（咸池）、華蓋、空亡。胎元 辛巳（月干進一、月支進三）。', '三樣都沒有的盤：文字盤兩處寫「無」，備註列出全部八種神煞');

    const allSha = await born(page, '1981-06-28', '22:00');
    ok(allSha === '辛酉 甲午 丁丑 辛亥' && await rows() === 9 && await text(page, '#other') === '胎元 乙酉（月干進一、月支進三）。', '每一種神煞都有命中的盤（辛酉 甲午 丁丑 辛亥）：備註不出現「原局未見」');
    ok(errors.length === 0, '「沒有」的盤無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('歲運並臨、點在空白處、在分頁上按其他鍵');
  {
    const { ctx, page, errors } = await open(browser);
    // 範例盤第一個大運丙子（1990–1999）裡有 1996 丙子年
    await page.locator('#dayun [data-dy="0"]').click();
    await page.locator('#liunian [data-ln="1996"]').click();
    const row = page.locator('#ix .rel', { hasText: '歲運並臨' });
    ok((await text(page, '#ix-title')).includes('丙子運、1996 丙子年') && await row.count() === 1 && (await row.innerText()).includes('運與歲同為丙子') && await row.locator('.tag').innerText() === '存疑', '大運和流年同干支時列出「歲運並臨」，標為存疑');
    // 按鈕列裡不是按鈕的地方（間隙、列首的標題）被點到時什麼都不該發生
    const view = () => page.evaluate(() => document.querySelector('#p-bazi').innerHTML + document.querySelector('#p-ziwei').innerHTML);
    const bazi = await view();
    await page.locator('#dayun').dispatchEvent('click'); await page.locator('#liunian').dispatchEvent('click');
    const baziSame = await view() === bazi;
    await page.locator('#t-ziwei').click();
    await page.locator('#decs .chip2.cur').click();
    const ziwei = await view();
    await page.locator('#decs .rowlabel').click(); await page.locator('#yrs .rowlabel').click();
    ok(baziSame && await view() === ziwei && errors.length === 0, '點在大運、流年、大限、流年籤的間隙或標題上：畫面不變、不出錯');
    await page.locator('#t-bazi').focus();
    await page.keyboard.press('Enter');
    ok(await page.locator('#p-bazi').isVisible() && await page.locator('#p-ziwei').isHidden(), '在分頁鈕上按 Enter 切到該分頁');
    for (const key of ['ArrowDown', 'Home', 'a']) await page.keyboard.press(key);
    ok(await page.locator('#p-bazi').isVisible() && await page.evaluate(() => location.hash) === '#bazi', '左右方向鍵以外的鍵不會切換分頁');
    ok(errors.length === 0, '無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('排盤時發生沒有預期到的錯誤');
  {
    const { ctx, page, errors } = await open(browser, { init: [wrapIztro] });
    await setFault(page, 'error');
    await page.locator('#clock').selectOption('dst'); // 下拉選單的 change 只觸發一次重排
    ok(await errText(page) === '排盤時發生沒有預期到的錯誤（模擬的函式庫錯誤）。請檢查輸入的生辰，或重新整理頁面再試。下方變淡的是上一次排出的盤，修正後才會更新。', '函式庫丟出一般的例外時，顯示「排盤時發生沒有預期到的錯誤」');
    ok(await page.locator('main.stale').count() === 1 && await inert(page) === 'true,true,true,true,false', '舊盤變淡並鎖住（inert），表單仍可操作');
    ok(await pillars(page) === '甲子 乙亥 戊午 己未' && (await text(page, '#summary')).includes('1984-11-20 14:00\u3000未時'), '畫面上留的是上一次排出的盤');
    ok(errors.length === 1 && errors[0].startsWith('console: Error: 模擬的函式庫錯誤'), '例外寫進 console，方便回報問題：' + errors.map(e => e.split('\n')[0]).join(' | '));
    await setFault(page, 'string');
    await page.locator('#f button[type=submit]').click();
    ok((await errText(page)).startsWith('排盤時發生沒有預期到的錯誤（不是 Error 物件）。'), '丟出來的不是 Error 物件時，訊息裡仍看得到內容');
    await setFault(page, null);
    await page.locator('#f button[type=submit]').click();
    ok(await errText(page) === '' && await page.locator('main.stale').count() === 0 && await inert(page) === 'false,false,false,false,false', '函式庫恢復後再排一次：錯誤消失、盤解除鎖定');
    ok((await text(page, '#summary')).includes('1984-11-20 13:00\u3000未時') && errors.length === 2, '恢復後排出的是目前輸入的盤（手動減一小時 → 13:00）');
    await ctx.close();

    // 第一次排盤就出錯：這時還沒有「上一次的盤」
    const first = await open(browser, { init: [wrapIztro, () => { window.iztroFault = 'error'; }] });
    ok(await errText(first.page) === '排盤時發生沒有預期到的錯誤（模擬的函式庫錯誤）。請檢查輸入的生辰，或重新整理頁面再試。' && await first.page.locator('main.stale').count() === 0 && await text(first.page, '#summary') === '', '第一次排盤就出錯：訊息不提「上一次排出的盤」，也沒有盤可以變淡');
    await first.page.locator('#copy').click();
    ok(await first.page.locator('.toast').count() === 0 && await first.page.locator('#copyfallback').isHidden() && first.pageErrors.length === 0, '還沒有盤時按「複製文字盤」不做事、不出錯：' + first.pageErrors.join(' | '));
    await setFault(first.page, null);
    await first.page.locator('#f button[type=submit]').click();
    ok(await errText(first.page) === '' && await pillars(first.page) === '甲子 乙亥 戊午 己未' && await first.page.locator('#zw .cell').count() === 12, '函式庫恢復後按「排盤」就排得出來');
    await first.ctx.close();
  }

  section('瀏覽器查不到時區資料');
  {
    // 帶 timeZone 選項建立格式器時丟例外，等於這個瀏覽器沒有 IANA 時區資料
    const noZoneData = () => {
      const Real = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function (locales, options) { if (options && options.timeZone) throw new RangeError('模擬：沒有時區資料'); return new Real(locales, options); };
    };
    const NOTE = '這個瀏覽器查不到時區歷史資料，已當作標準時處理。若出生時正值夏令時間，請把「夏令時間」改成手動。';
    const { ctx, page, errors } = await open(browser, { init: [noZoneData] });
    ok(await pillars(page) === '甲子 乙亥 戊午 己未' && await errText(page) === '' && await warnings(page) === NOTE, '查不到時區資料時仍排得出盤，並提醒「這個瀏覽器查不到時區歷史資料」');
    await born(page, '1955-07-01', '12:00');
    const sum = await text(page, '#summary');
    ok(sum.includes('1955-07-01 12:00\u3000午時') && sum.includes('當時鐘錶 UTC+8') && (await warnings(page)).includes(NOTE), '查不到資料時當作標準時：1955 年夏令時間不會自動扣一小時');
    await page.locator('#clock').selectOption('dst');
    ok((await text(page, '#summary')).includes('1955-07-01 11:00\u3000午時') && !(await warnings(page)).includes(NOTE), '照提醒改成手動減一小時：扣回一小時，提醒消失');
    ok(errors.length === 0, '查不到時區資料時無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  section('運限的年份範圍');
  {
    const { ctx, page, errors } = await open(browser, { init: [wrapIztro] });
    await page.locator('#t-ziwei').click();
    const yun = () => text(page, '#zw .cyun');
    // 可輸入的最晚生辰：晚子時換日後以 2101-01-01 起盤，最後一個大限排到 2204 年。實測函式庫都查得到
    await born(page, '2100-12-31', '23:59');
    await page.locator('#decs .chip2').last().click();
    ok((await yun()).startsWith('大限 96–105 歲') && await overlay(page) === '12/0/4', '最晚的生辰（2100-12-31 23:59）：最後一個大限查得到運限');
    await page.locator('#yrs .chip2').last().click();
    ok((await yun()).includes('流年 2204 甲辰') && await overlay(page) === '12/12/8' && !(await text(page, '#zw')).includes('超出'), '最晚的生辰：最後一個流年（2204）也查得到');
    /* 以下是模擬：在 1900–2100 年出生的盤上，實際點遍每個大限、流年都不會超出函式庫的範圍，
       所以假裝函式庫查不到 2040 年以後，確認查不到時頁面有退路而不是壞掉 */
    await setFault(page, 2040);
    await born(page, '1984-11-20', '14:00');
    await page.locator('#decs .chip2', { hasText: '53–62 歲' }).click(); // 2036–2045
    await page.locator('#yrs [data-yr="2039"]').click();
    const reachable = `${await overlay(page)} ${(await yun()).includes('流年 2039 己未')}`;
    await page.locator('#yrs [data-yr="2040"]').click();
    ok(reachable === '12/12/8 true' && await yun() === '這個年份超出函式庫可查的運限範圍。' && await overlay(page) === '0/0/0' && await page.locator('#yrs [data-yr="2040"]').getAttribute('aria-pressed') === 'true', '（模擬）流年查不到運限：顯示「這個年份超出函式庫可查的運限範圍」，不疊運限');
    await page.locator('#decs .chip2', { hasText: '63–72 歲' }).click(); // 2046 起，整個大限都查不到
    ok(await yun() === '這個年份超出函式庫可查的運限範圍。' && await overlay(page) === '0/0/0' && await page.locator('#yrs .chip2').count() === 10 && (await text(page, '#pdetail')).startsWith('命宮'), '（模擬）整個大限都查不到：同樣的說明，流年籤與宮位明細照常');
    await page.locator('#decs .chip2', { hasText: '33–42 歲' }).click();
    ok((await yun()).startsWith('大限 33–42 歲') && await overlay(page) === '12/0/4', '（模擬）回到查得到的大限就恢復');
    ok(errors.length === 0, '運限範圍無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  /* 大運在交運日換、流年在立春換。每步運列出和它有重疊的流年，所以交運的那一年前後兩步運都列（虛線框）。
     時鐘固定在 2026-11-11。 */
  section('大運的「今」以交運日為準；交運那一年前後兩步運都列');
  {
    const { ctx, page, errors } = await open(browser);
    const years = () => page.locator('#liunian .yun').evaluateAll(els => els.map(e => e.dataset.ln + (e.classList.contains('edge') ? '邊' : '') + (e.querySelector('.now') ? '今' : '') + (e.getAttribute('aria-pressed') === 'true' ? '選' : '')).join(' '));
    const nowYun = page.locator('#dayun .yun:has(.now)');
    const nowName = async () => (await buttonNames(nowYun))[0]; // 標著「今」的那步運，讀屏唸出來的名稱
    // 女 1960-06-25 10:00：每十年在 12 月 6 日前後換運。2026-11-11 還在丙子運，不是標示 2026 年起的乙亥運
    await page.locator('label:has(#g-f)').click();
    await born(page, '1960-06-25', '10:00');
    ok(await nowYun.count() === 1 && /^今.*丙子.*2016–25/.test(await nowName()) && await nowYun.getAttribute('aria-pressed') === 'true', '交運年裡還沒到交運日：「今」標在舊的那步運，並預設選它');
    ok(await years() === '2016邊 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026邊今選' && (await text(page, '#ln-title')).includes('約 2016-12-06 交入、2026-12-06 交出') && (await text(page, '#ix-title')).startsWith('丙子運、2026 丙午年'),
      '交運日在立春之後：流年從交入那一年列到交出那一年，頭尾是虛線框；今年配的是舊運');
    const lnNames = await buttonNames(page.locator('#liunian'));
    ok(/丙申.{2}201657歲約2016-12-06交入這步運$/.test(lnNames[0]) && /^今.*丙午.{2}202667歲約2026-12-06交出這步運$/.test(lnNames[10]) && lnNames.slice(1, 10).every(n => !n.includes('這步運')),
      `頭尾兩年讀屏唸得到交運日（畫面上是虛線框），中間的年份不加：${lnNames[0]}｜${lnNames[10]}`);
    await page.locator('#dayun [data-dy="6"]').click();
    ok(await years() === '2026邊今選 2027 2028 2029 2030 2031 2032 2033 2034 2035 2036邊' && (await text(page, '#ix-title')).startsWith('乙亥運、2026 丙午年') && await nowYun.getAttribute('aria-pressed') === 'false', '點下一步運：它也列 2026 年（12 月交入之後），「今」仍留在舊運上');
    await page.locator('#dayun [data-dy="5"]').click();
    ok((await text(page, '#ix-title')).startsWith('丙子運、2026 丙午年'), '點回目前這步運，回到今年');

    // 男 1960-07-19 10:00：交運日 1 月 18 日，在立春之前。己丑運 2017-01-18 到 2027-01-18
    await page.locator('label:has(#g-m)').click();
    await born(page, '1960-07-19', '10:00');
    ok(/^今.*己丑.*2017–26/.test(await nowName()) && await years() === '2016邊 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026邊今選' && (await text(page, '#ln-title')).includes('約 2017-01-18 交入、2027-01-18 交出'),
      '交運日在立春之前：頭一年是標示年的前一年（2017-01-18 交入時還是 2016 丙申年），不列 2027（那時已經交出）');
    await page.locator('#dayun [data-dy="6"]').click();
    ok(await years() === '2026邊今 2027選 2028 2029 2030 2031 2032 2033 2034 2035 2036邊', '點下一步運（庚寅，2027-01-18 交入）：先看標示的起始年 2027，2026 年也列在前面');
    await page.locator('#dayun [data-dy="4"]').click();
    ok(await years() === '2006邊 2007選 2008 2009 2010 2011 2012 2013 2014 2015 2016邊', '點上一步運（戊子）：2016 年前後兩步運都列');
    // 過了交運日、還沒過立春：2027-01-25 已經是庚寅運，流年仍是 2026 丙午
    await page.clock.setFixedTime(new Date('2027-01-25T12:00:00+08:00'));
    await page.reload();
    await born(page, '1960-07-19', '10:00');
    ok(/^今.*庚寅.*2027–36/.test(await nowName()) && await years() === '2026邊今選 2027 2028 2029 2030 2031 2032 2033 2034 2035 2036邊' && (await text(page, '#ix-title')).startsWith('庚寅運、2026 丙午年'),
      '2027-01-25：已交入庚寅運、還沒立春，今年是庚寅運配 2026 丙午年');
    await page.clock.setFixedTime(new Date('2027-01-10T12:00:00+08:00'));
    await page.reload();
    await born(page, '1960-07-19', '10:00');
    ok(/^今.*己丑/.test(await nowName()) && (await text(page, '#ix-title')).startsWith('己丑運、2026 丙午年'), '2027-01-10：還沒到交運日，仍是己丑運配 2026 丙午年');
    ok(errors.length === 0, `大運交運日無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('還沒起運、農曆日期用繁體、存檔裡一筆壞資料不連累其他筆');
  {
    const { ctx, page, errors } = await open(browser, { init: [blockClipboard] });
    // 還沒起運的小孩：沒有哪一步運是「今」
    await born(page, '2024-03-10', '10:00');
    ok(await page.locator('#dayun .now').count() === 0 && await page.locator('#dayun [data-dy="0"]').getAttribute('aria-pressed') === 'true' && (await text(page, '#yunhead')).includes('交運（今天還沒起運）'), '還沒起運：不標「今」，預設看第一步運，並註明今天還沒起運');
    await born(page, '1984-11-20', '14:00');
    ok(!(await text(page, '#yunhead')).includes('還沒起運'), '已經起運的盤沒有這個註記');
    // 農曆日期：閏月與十二月
    await born(page, '2020-06-07', '10:00');
    await page.locator('#t-ziwei').click();
    ok((await text(page, '#zw .center')).includes('2020 年閏四月十六') && (await textChart(page)).includes('農曆 2020 年閏四月十六'), '紫微中宮與文字盤的農曆寫「閏四月」，不是簡體字');
    await born(page, '1985-01-25', '10:00');
    ok((await text(page, '#zw .center')).includes('1984 年十二月初五') && !/[闰腊]/.test(await text(page, 'main')), '十二月不寫「腊月」，整頁沒有簡體字');
    ok(errors.length === 0, `沒有錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  {
    const good = { name: '甲', gender: '男', calendar: 'solar', y: 1990, m: 5, d: 5, h: 5, mi: 5, place: '台北', clock: 'auto', useTST: false, ziRule: 'next' };
    const { ctx, page } = await open(browser, { init: [`localStorage.setItem('paipan-saved-v1', ${JSON.stringify(JSON.stringify([good, { ...good, name: { toString: 1 } }, { ...good, name: '乙' }]))})`] });
    ok(await page.locator('#saved [data-load]').count() === 2, '三筆存檔裡一筆讀不了：其他兩筆照常列出');
    await page.locator('#save').click();
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('paipan-saved-v1')).length) === 3, '這時再儲存一筆，原有的兩筆還在');
    await ctx.close();
  }

  /* 日柱、紫微在什麼時候換日，要看子時立場；鐘錶往回撥、往前撥的那一段，鐘面時間會重複或不存在。
     這幾種情況排出來的盤對出生時間很敏感，頁面要提醒。 */
  section('提醒：換日的時刻、重複與不存在的鐘面時間、金門馬祖');
  {
    const { ctx, page, errors } = await open(browser);
    const NEAR = '離時辰交界只有 5 分鐘。出生時間差幾分鐘，或改變真太陽時的設定，';
    const at = async (date, time) => `${(await born(page, date, time)).split(' ')[2]}｜${await warnings(page)}`;
    // 換日換柱：23:00 是時辰交界，也是換日的時刻
    const n1 = await at('1990-05-23', '22:55'), n2 = await at('1990-05-23', '23:05'), n3 = await at('1990-05-23', '12:55');
    ok(n1 === `戊子｜排盤用時 22:55 ${NEAR}日柱、時柱和紫微命盤就會不同（23:00 同時是換日的時刻）。` && n2 === `己丑｜排盤用時 23:05 ${NEAR}日柱、時柱和紫微命盤就會不同（23:00 同時是換日的時刻）。`, '換日換柱：23:00 前後日柱不同（戊子、己丑），提醒裡寫明日柱也會變');
    ok(n3 === `戊子｜排盤用時 12:55 ${NEAR}時柱和紫微命宮就會不同。`, '其他時辰交界只提時柱和紫微命宮');
    // 夜子時不換日：23:00 只換時柱，日柱和紫微的起盤日到午夜才換
    await page.locator('#zi').selectOption('same');
    const s1 = await at('1990-05-23', '22:55'), s2 = await at('1990-05-23', '23:55'), s3 = await at('1990-05-24', '00:05'), s4 = await at('1990-05-24', '00:00');
    const MID = '採「夜子時不換日」時，日柱和紫微的起盤日在午夜才換；出生時間差幾分鐘，或改變真太陽時的設定，日柱和紫微命盤就會不同。';
    ok(s1 === `戊子｜排盤用時 22:55 ${NEAR}時柱和紫微命宮就會不同。`, '夜子時不換日：23:00 的提醒不提日柱');
    ok(s2 === `戊子｜排盤用時 23:55 離午夜只有 5 分鐘。${MID}` && s3 === `己丑｜排盤用時 00:05 離午夜只有 5 分鐘。${MID}` && s4 === `己丑｜排盤用時 00:00 正好是午夜。${MID}`, '夜子時不換日：午夜前後日柱不同（戊子、己丑），有提醒');
    await page.locator('#zi').selectOption('next');
    ok(!(await at('1990-05-24', '00:05')).includes('午夜'), '換日換柱的立場下，午夜不是交界，不提醒');

    // 台灣 1975 年夏令時間：9 月 30 日 24:00 撥回 23:00，23:00–24:00 出現兩次
    const twice = await at('1975-09-30', '23:30');
    ok(twice === '庚辰｜這個鐘面時間在當天出現過兩次（鐘錶往回撥，例如夏令時間結束）：前一次是 UTC+9，後一次是 UTC+8。目前當作後一次排盤。如果出生在前一次，請把「夏令時間」改成「手動：減 1 小時」。', '重複的鐘面時間（台北 1975-09-30 23:30）：說明取的是哪一次、另一次怎麼指定');
    await page.locator('#clock').selectOption('dst');
    ok((await pillars(page)).split(' ')[2] === '己卯' && (await text(page, '#summary')).includes('1975-09-30 22:30　亥時') && !(await warnings(page)).includes('出現過兩次'), '照提醒改成手動減 1 小時：變成 22:30 亥時、日柱己卯，提醒消失');
    await page.locator('#clock').selectOption('auto');
    ok((await at('1975-04-01', '00:30')) === '丁丑｜這個鐘面時間在當天不存在：鐘錶直接往前撥過去了（例如夏令時間開始）。目前當作撥動之前的 UTC+8 排盤，請確認出生時間。', '不存在的鐘面時間（台北 1975-04-01 00:30）');
    ok(!(await at('1975-07-01', '12:00')).includes('出現過兩次') && !(await warnings(page)).includes('不存在'), '平常的夏令時間不會有這兩種提醒');
    await page.locator('#place').selectOption('首爾');
    ok((await at('1960-09-17', '23:30')).includes('前一次是 UTC+9:30，後一次是 UTC+8:30。目前當作後一次排盤。如果出生在前一次，請自己換算成現行標準時再填，並把「夏令時間」改成「手動：已是現行標準時」。'), '另一次不是「現行標準時加一小時」時（首爾 1960），請使用者自己換算');

    // 金門、馬祖查的是台北的時區資料
    const KM = '查的是台北的時區資料。1949 年以前，當地的鐘錶不一定和台灣本島相同，上面的換算請自行查證；不適用的話，請把「夏令時間」改成手動。';
    await page.locator('#place').selectOption('金門');
    const km1940 = await at('1940-06-01', '09:30'), km1960 = await at('1960-07-01', '09:30'), km1930 = await at('1930-06-01', '09:30');
    await page.locator('#place').selectOption('馬祖南竿');
    const mz1940 = await at('1940-06-01', '09:30');
    await page.locator('#place').selectOption('台北');
    const tp1940 = await at('1940-06-01', '09:30');
    ok(km1940.includes('金門' + KM) && mz1940.includes('馬祖南竿' + KM) && !km1960.includes(KM) && !km1930.includes(KM) && !tp1940.includes(KM) && tp1940.includes('排盤已換算成現行標準時'),
      '金門、馬祖在 1949 年以前有換算時，提醒台北的資料不一定適用；1950 年以後、沒有換算、或其他地點都不提');
    ok(errors.length === 0, `提醒無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
})().catch(e => { console.error(e); process.exit(1); });
