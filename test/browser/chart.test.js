/* 瀏覽器測試（盤面與退路）：node test/browser/chart.test.js。先跑 node scripts/build.js。
   少見但真的會出現的盤面（交節前後、兩種年界不同年、沒有關係／神煞／通根的盤、歲運並臨、交運那一年、換日的時刻、重複與不存在的鐘面時間），
   紫微的運限（童限、小限、流月、流日、流曜、十二神）與流派設定，
   以及出狀況時的退路（函式庫丟出例外、瀏覽器沒有時區資料）。 */
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
   null 正常、'error' 排盤時丟 Error、'string' 丟字串。
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
        return real.astro.withOptions(...args);
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
  {
    /* 另一種情況更隱蔽：瀏覽器有時區資料，但只帶現行規則。查歷史日期不會出錯，只會安靜地回傳現在的時差，
       盤就差一小時而且沒有任何跡象。頁面啟動時拿幾件史實自我檢查，答錯就提醒 */
    const noHistory = () => {
      const Real = Intl.DateTimeFormat, NOW = { 'Asia/Tokyo': 'Etc/GMT-9', 'Asia/Seoul': 'Etc/GMT-9' }; // Etc/GMT-9 是 UTC+9
      Intl.DateTimeFormat = function (locales, options) { return new Real(locales, options && options.timeZone ? { ...options, timeZone: NOW[options.timeZone] || 'Etc/GMT-8' } : options); };
    };
    const NOTE = '這個瀏覽器內建的時區歷史資料不完整（台灣 1940 年的 UTC+9、台灣 1975 年的夏令時間對不上），夏令時間和歷史時區的自動換算可能不對。請換一個瀏覽器，或把「夏令時間」改成手動、自己換算。';
    const { ctx, page, errors } = await open(browser, { init: [noHistory] });
    ok(await pillars(page) === '甲子 乙亥 戊午 己未' && await warnings(page) === NOTE, '時區資料只有現行規則：照樣排得出盤，並提醒自動換算可能不對');
    await born(page, '1955-07-01', '12:00');
    ok((await text(page, '#summary')).includes('1955-07-01 12:00\u3000午時') && (await warnings(page)).includes(NOTE), '這種瀏覽器不會自動扣夏令時間的一小時（所以才要提醒）');
    await page.locator('#clock').selectOption('dst');
    ok((await text(page, '#summary')).includes('1955-07-01 11:00\u3000午時') && !(await warnings(page)).includes('不完整'), '改成手動之後不再靠時區資料，提醒消失');
    await page.locator('#clock').selectOption('auto');
    await page.locator('#place').selectOption('東京');
    ok((await warnings(page)).includes('（日本 1950 年的夏令時間對不上）'), '只檢查這張盤用到的時區：換成東京就問日本的事');
    await page.locator('#place').selectOption('馬尼拉');
    ok((await warnings(page)).includes('（台灣 1940 年的 UTC+9、台灣 1975 年的夏令時間對不上）'), '沒有可問的事的時區（馬尼拉）：拿台北的當指標');
    ok(errors.length === 0, '時區資料不完整時無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  /* 運限由本頁的引擎推算，不向函式庫查，所以沒有「查不到」的年份；這裡看可輸入範圍的兩端排不排得出來。 */
  section('運限的年份範圍');
  {
    const { ctx, page, errors } = await open(browser);
    await page.locator('#t-ziwei').click();
    const yun = () => text(page, '#zw .cyun');
    // 可輸入的最晚生辰：晚子時換日後以 2101-01-01 起盤，最後一個大限排到 2204 年
    await born(page, '2100-12-31', '23:59');
    await page.locator('#decs .chip2').last().click();
    ok((await yun()).startsWith('大限 96–105 歲') && await overlay(page) === '12/0/4', '最晚的生辰（2100-12-31 23:59）：最後一個大限排得出來');
    await page.locator('#yrs .chip2').last().click();
    ok((await yun()).includes('流年 2204 甲辰') && await overlay(page) === '12/12/8', '最晚的生辰：最後一個流年（2204）也排得出來');
    await page.locator('#mos .chip2').last().click();
    await page.locator('#days .chip2').last().click();
    const far = (await yun()).split('\n');
    // 2204 年十二月（乙丑年前的最後一個月）是丁丑月；最後一天是公曆 2205 年初
    ok(far.length === 5 && far[3].startsWith('流月 十二月 丁丑（') && /^流日 (廿九|三十) ..（2205-0[12]-\d\d）/.test(far[4]) && await page.locator('#zw .ly.day').count() === 12, `最晚的生辰：2204 年最後一個流月、流日也排得出來。${far.slice(3).join('｜').slice(0, 60)}`);
    // 可輸入的最早生辰
    await born(page, '1900-01-01', '00:00');
    await page.locator('#decs [data-dec="child"]').click();
    const first = (await yun()).split('\n');
    ok(first[0].startsWith('童限 1 歲') && first[1].startsWith('流年 1899 己亥：') && await page.locator('#mos .chip2').count() === 12, `最早的生辰（1900-01-01，農曆還在己亥年）：童限一歲是 1899 己亥年，流月十二段。${first.slice(0, 2).join('｜').slice(0, 50)}`);
    ok(errors.length === 0, '運限範圍無錯誤：' + errors.join(' | '));
    await ctx.close();
  }

  /* 時鐘固定在 2026-11-11，農曆丙午年十月初三。範例盤（1984-11-20 未時男命）這一年虛歲 43。
     流年斗君：午宮起正月逆數到十月是酉宮，酉宮起子時順數到未時是辰宮，所以正月在辰、十月在丑；十月初三從丑宮順數三天在卯宮。 */
  section('紫微的流月、流日、小限、流曜與十二神');
  {
    const { ctx, page, errors } = await open(browser, { init: [blockClipboard] });
    // 籤上看得到的字（只給讀屏的不算），後面註明是不是今天所在、有沒有選到
    const chips = sel => page.locator(sel).evaluateAll(els => els.map(e => { const c = e.cloneNode(true); c.querySelectorAll('.vh').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, '') + (e.classList.contains('cur') ? '（今）' : '') + (e.getAttribute('aria-pressed') === 'true' ? '（選）' : ''); }).join(' '));
    const center = async () => (await text(page, '#zw .cyun')).split('\n').map(s => s.trim()).filter(Boolean);
    const count = sel => page.locator(sel).count();
    // 盤上疊了什麼：大限／流年／流月／流日的宮名各幾個，小限標記、運限四化、流曜各幾個
    const stacked = async () => `${(await Promise.all(['dec', 'yr', 'mo', 'day'].map(k => count(`#zw .ly.${k}`)))).join('/')} 小限${await count('#zw .ly.xiao')} 四化${await count('#zw .hua.o')} 流曜${await count('#zw .fst')}`;
    const palOf = sel => page.locator(`#zw .cell:has(${sel})`).getAttribute('data-pal'); // 那個標記落在哪一宮（宮位序號，寅宮 0）
    const words = async sel => (await text(page, sel)).split(/\s+/).filter(Boolean).join(' ');
    await page.locator('#t-ziwei').click();

    // 本命盤：每格左下四個十二神，沒有流年的那一欄
    ok(await count('#zw .foot .l > span') === 48 && await count('#zw .foot .l > .y') === 0 && await words('#zw .cell[data-pal="2"] .foot .l') === '衰 青龍 官符 華蓋' && await words('#zw .cell[data-pal="10"] .foot .l') === '沐浴 伏兵 歲建 將星',
      '本命盤每格左下四個十二神：命宮（辰）是衰、青龍、官符、華蓋；子宮是生年的歲建、將星');
    ok((await words('#pdetail .meta')).endsWith('十二長生 衰 · 博士十二神 青龍 · 歲前 官符 · 將前 華蓋') && await page.locator('#mos').isHidden() && await page.locator('#days').isHidden() && await count('#decs [data-today]') === 1, '宮位明細寫出四個十二神各是什麼；流月、流日兩排還沒出現');

    // 看今天：一次疊到今天所在的大限、流年、流月、流日
    await page.locator('#decs [data-today]').click();
    ok((await chips('#decs .chip2')).includes('今43–52歲壬申（今）（選）') && (await chips('#yrs .chip2')).startsWith('今2026丙午43歲（今）（選） 2027丁未44歲') && await page.evaluate(() => document.activeElement.hasAttribute('data-today')), '按「看今天」：選到今年所在的大限和今年，焦點留在按鈕上');
    ok(await chips('#mos .chip2') === '2/17起正月庚寅 3/19起二月辛卯 4/17起三月壬辰 5/17起四月癸巳 6/15起五月甲午 7/14起六月乙未 8/13起七月丙申 9/11起八月丁酉 10/10起九月戊戌 今11/9起十月己亥（今）（選） 12/9起十一月庚子 1/8起十二月辛丑',
      `流月那一排：丙午年十二個月，各寫從公曆哪一天起；今天在十月。${await chips('#mos .chip2')}`);
    const days = (await chips('#days .chip2')).split(' ');
    ok(days.length === 30 && days.slice(0, 4).join(' ') === '11/9初一丁亥 10初二戊子 今11初三己丑（今）（選） 12初四庚寅' && days[22] === '12/1廿三己酉' && days[29] === '8三十丙辰',
      `流日那一排：十月三十天，頭一天和每月一日寫出月份；今天是初三己丑。${days.slice(0, 4).join(' ')} … ${days[22]} … ${days[29]}`);
    const lines = await center();
    ok(JSON.stringify(lines) === JSON.stringify([
      '大限 43–52 歲 壬申：天梁化祿、紫微化權、左輔化科、武曲化忌',
      '流年 2026 丙午：天同化祿、天機化權、文昌化科、廉貞化忌',
      '小限 43 歲 戊辰（命宮）：貪狼化祿、太陰化權、右弼化科、天機化忌',
      '流月 十月 己亥（11/9–12/8）：武曲化祿、貪狼化權、天梁化科、文曲化忌',
      '流日 初三 己丑（2026-11-11）：武曲化祿、貪狼化權、天梁化科、文曲化忌',
    ]), `中宮五行：大限、流年、小限、流月、流日，各寫干支與四化。${lines.join('｜')}`);
    ok(await stacked() === '12/12/12/12 小限1 四化16 流曜41', `盤上疊了四層宮名、小限、十六個運限四化、四十一顆流曜（流年多一顆年解）：${await stacked()}`);
    ok([await palOf('.ly.dec.ming'), await palOf('.ly.yr.ming'), await palOf('.ly.mo.ming'), await palOf('.ly.day.ming'), await palOf('.ly.xiao')].join() === '6,4,11,1,2',
      '各層的命宮：大限在申、流年在午、流月在丑、流日在卯；小限在辰');
    ok((await page.locator('#zw .hua.o i').allInnerTexts()).sort().join('') === '大大大大年年年年日日日日月月月月' && await words('#zw .cell[data-pal="3"] .fsts') === '運鉞 流祿 月曲 月陀 月馬 日曲 日陀',
      '運限四化各標大、年、月、日；巳宮的流曜是運鉞、流祿、月曲、月陀、月馬、日曲、日陀');
    ok(await count('#zw .foot .l > .y') === 24 && await words('#zw .cell[data-pal="4"] .foot .l') === '死 將軍 大耗 歲建 災煞 將星' && (await words('#pdetail .meta')).endsWith('· 流年歲前 弔客 · 流年將前 月煞'),
      '選了流年：每格的歲前、將前右邊多出流年的（午宮是流年的歲建、將星），宮位明細也寫出來');
    ok(await words('#pdetail .sfsz .r:first-child .yl') === '大財帛 年夫妻 月田宅 日父母 小限 年解 流陀 月鸞', `宮位明細的每一宮多一行：在各層運限裡是什麼宮、有哪些流曜。${await words('#pdetail .sfsz .r:first-child .yl')}`);
    const names = await buttonNames(page.locator('#days'));
    ok(names.length === 30 && names[2] === '今11/11初三己丑' && names[0] === '11/9初一丁亥' && names[29] === '12/8三十丙辰', `讀屏唸的流日籤帶完整的公曆月日（畫面上省掉的月份只給讀屏）：${names.slice(0, 3).join('、')}`);
    const txt = await textChart(page);
    ok(txt.includes('\n【紫微運限】\n大限 43–52 歲 壬申，命宮在本命官祿（申宮）：天梁化祿、紫微化權、左輔化科、武曲化忌。流曜：運昌、運馬在夫妻，運魁在兄弟，運鉞在父母，運鸞在田宅，運陀在遷移，運祿在疾厄，運曲、運羊在財帛，運喜在子女\n流年 2026 丙午（43 歲），命宮在本命福德（午宮）：')
      && txt.includes('\n小限 43 歲 戊辰，在本命命宮（辰宮）：貪狼化祿、太陰化權、右弼化科、天機化忌\n流月 十月 己亥（2026-11-09 到 2026-12-08），命宮在本命子女（丑宮）：')
      && txt.includes('\n流日 初三 己丑（2026-11-11），命宮在本命兄弟（卯宮）：武曲化祿、貪狼化權、天梁化科、文曲化忌。流曜：') && txt.includes('\n流年歲前、將前：命宮 弔客、月煞；'),
      '文字盤把疊上的運限也寫出來：每一層的干支、命宮落在本命哪一宮、四化、流曜，以及流年的歲前、將前');
    ok(/\n流派設定：通行版四化、生年以正月初一為界、閏月月中分界\n各宮依序：主星｜輔星｜雜曜｜十二長生、博士、歲前、將前\n命宮 戊辰［3–12］：.*｜衰 青龍 官符 華蓋\n/.test(txt), '文字盤寫明流派設定，各宮後面多了四個十二神');

    // 一層一層取消、換選
    await page.locator('#days [data-day="3"]').click();
    ok((await stacked()).startsWith('12/12/12/0 ') && (await center()).length === 4 && await page.locator('#days').isVisible() && await count('#days .chip2[aria-pressed=true]') === 0, '再點一次選到的流日：取消流日，流日那一排還在');
    await page.locator('#days [data-day="15"]').click();
    ok((await center())[4].startsWith('流日 十五 辛丑（2026-11-23）') && await palOf('.ly.day.ming') === '1' && await page.evaluate(() => document.activeElement.dataset.day) === '15', '換一天（十五，辛丑日，命宮又轉回卯宮）：焦點留在那一天的籤上');
    await page.locator('#mos [data-mo="9"]').click();
    ok(await stacked() === '12/12/0/0 小限1 四化8 流曜21' && await page.locator('#days').isHidden() && await page.locator('#mos').isVisible(), '再點一次選到的流月：流月、流日都取消，流日那一排收起來');
    await page.locator('#mos [data-mo="0"]').click();
    const jan = (await chips('#days .chip2')).split(' ');
    ok(jan.length === 30 && jan[0].startsWith('2/17初一') && jan[12].startsWith('3/1十三') && jan[13].startsWith('2十四') && await palOf('.ly.mo.ming') === '2' && (await center())[3].startsWith('流月 正月 庚寅（2/17–3/18）'), `選正月：命宮在辰，三十天從 2 月 17 日到 3 月 18 日。${jan[0]} ${jan[12]} ${jan[13]}`);
    await page.locator('#yrs [data-yr="2026"]').click();
    ok(await stacked() === '12/0/0/0 小限0 四化4 流曜10' && await page.locator('#mos').isHidden() && await count('#zw .foot .l > .y') === 0 && (await center()).length === 1, '再點一次選到的流年：只剩大限，小限、流年的十二神、流月那一排都不見');
    // 有閏月的年：閏月拆成上半、下半兩段（預設的月中分界）
    await page.locator('#decs .chip2', { hasText: '33–42 歲' }).click();
    await page.locator('#yrs [data-yr="2025"]').click();
    const m2025 = (await chips('#mos .chip2')).split(' ');
    ok(m2025.length === 14 && m2025.slice(5, 9).join(' ') === '6/25起六月癸未 7/25起閏六月上半癸未 8/9起閏六月下半甲申 8/23起七月甲申', `2025 年有閏六月：流月十四段，閏月上半跟六月、下半跟七月。${m2025.slice(5, 9).join(' ')}`);
    await page.locator('#mos [data-mo="6"]').click();
    const upper = await palOf('.ly.mo.ming'), upperDays = (await chips('#days .chip2')).split(' ');
    await page.locator('#mos [data-mo="7"]').click();
    const lowerDays = (await chips('#days .chip2')).split(' ');
    ok(upper === '6' && await palOf('.ly.mo.ming') === '7' && upperDays.length === 15 && upperDays[0].startsWith('7/25初一') && lowerDays.length === 14 && lowerDays[0].startsWith('8/9十六') && lowerDays[13].startsWith('22廿九'), `閏六月上半（初一到十五）命宮在申、下半（十六到廿九）在酉。${upperDays[0]} … ${lowerDays[0]} … ${lowerDays[13]}`);
    // 點在流月、流日那兩排的標題上什麼都不該發生
    const before = await page.locator('#p-ziwei').innerHTML();
    await page.locator('#mos .rowlabel').click(); await page.locator('#days .rowlabel').click();
    ok(await page.locator('#p-ziwei').innerHTML() === before, '點在流月、流日那兩排的標題上：畫面不變');
    await page.locator('#decs [data-today]').click();
    ok(await stacked() === '12/12/12/12 小限1 四化16 流曜41' && (await center())[4].startsWith('流日 初三 己丑'), '再按「看今天」：回到今天');
    // 不在世的盤沒有「看今天」
    await born(page, '1900-03-01', '14:00');
    const old = await count('#decs [data-today]');
    await born(page, '2090-06-01', '10:00');
    ok(old === 0 && await count('#decs [data-today]') === 0, '今年不在畫面列出的運限裡（1900 年生、還沒出生）：沒有「看今天」的按鈕');
    ok(errors.length === 0, `流月流日無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('星名、宮干支由上往下一字一行，不靠字型的直排資料');
  {
    /* 星名本來用直排（writing-mode）排。直排時每個字佔多高，靠的是字型自己帶的直排資料；沒有這份資料的字型（例如文泉驛正黑）
       每個字的高度是 0，整個星名疊成一團。現在改成「寬度只夠放一個字，一字一換行」，什麼字型都排得出來。
       這裡量的是實際排出來的大小：星名的高度 = 字數 × 字的大小。裝著會出問題的字型的機器（CI 就是），這一段直接擋得住；
       其他機器上兩種排法量起來一樣，所以另外確認沒有用回直排。 */
    const { ctx, page, errors } = await open(browser);
    await page.locator('#t-ziwei').click();
    await page.locator('#decs [data-today]').click(); // 疊到流日：星名底下有「大祿」「年忌」這種兩個字的四化
    const m = await page.evaluate(() => {
      const box = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, size: parseFloat(cs.fontSize), mode: cs.writingMode, text: el.textContent }; };
      const names = [...document.querySelectorAll('#zw .st .n')].map(box), gz = [...document.querySelectorAll('#zw .gzv')].map(box);
      const two = [...document.querySelectorAll('#zw .st .hua.o')].map(el => ({ ...box(el), i: box(el.querySelector('i')) }));
      const order = [...document.querySelectorAll('#zw .st')].every(st => { const kids = [...st.children].map(box); return kids.every((k, j) => j === 0 || k.top >= kids[j - 1].bottom - 0.5); });
      return { names, gz, two, order };
    });
    const tall = b => Math.abs(b.h - b.text.length * b.size) <= 1 && b.w <= b.size * 1.2;
    const badNames = m.names.filter(b => !tall(b)).map(b => `${b.text} ${b.w.toFixed(1)}×${b.h.toFixed(1)}`);
    ok(m.names.length > 60 && badNames.length === 0, `${m.names.length} 個星名，每個的高度都是「字數 × 字的大小」、寬度一個字：${badNames.slice(0, 5).join('、') || '沒有例外'}`);
    ok(m.gz.length === 12 && m.gz.every(tall), `十二宮的宮干支上下兩個字：${m.gz.filter(b => !tall(b)).map(b => `${b.text} ${b.w}×${b.h}`).join('、') || '都對'}`);
    ok(m.two.length >= 8 && m.two.every(b => b.w <= 16 && b.h >= b.i.size + b.size), `疊上去的四化（「大祿」「年忌」）也是上下兩個字，共 ${m.two.length} 個`);
    ok(m.order, '每顆星由上到下是星名、亮度、四化，沒有重疊');
    ok([...m.names, ...m.gz].every(b => b.mode === 'horizontal-tb'), '沒有用直排（writing-mode）：不靠字型的直排資料');
    ok(errors.length === 0, `無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('紫微流派設定：四化版本、年界、閏月算法');
  {
    const { ctx, page, errors } = await open(browser, { init: [blockClipboard] });
    // 中宮某一欄的內容
    const fact = label => page.evaluate(l => { const dt = [...document.querySelectorAll('#zw .center dt')].find(e => e.textContent === l); return dt ? dt.nextElementSibling.innerText.replace(/\s+/g, ' ').trim() : null; }, label);
    const summary = async () => (await text(page, '#zopts summary')).replace(/\s+/g, '');
    const badge = name => page.locator('#zw .st', { has: page.locator('.n', { hasText: new RegExp(`^${name}$`) }) }).locator('.hua:not(.o)').allInnerTexts().then(a => a.join(''));
    const ming = () => page.locator('#zw .cell', { has: page.locator('.pn', { hasText: /^命宮/ }) }).getAttribute('data-pal');
    await page.locator('#t-ziwei').click();
    ok(await page.locator('#zopts').getAttribute('open') === null && await summary() === '紫微斗數流派設定目前都是預設（坊間通行的排法）' && await fact('流派') === '通行版四化、生年以正月初一為界、閏月月中分界', '預設：流派設定收著，標題寫「目前都是預設」，中宮寫出三項設定');

    // 四化版本。1990-06-15 是庚午年
    const p0 = await born(page, '1990-06-15', '10:00');
    await page.locator('#zopts summary').click();
    ok(await fact('生年四化') === '太陽祿、武曲權、太陰科、天同忌' && await badge('太陰') === '科' && await badge('天同') === '忌' && await badge('天府') === '', '通行版：庚年太陽祿、武曲權、太陰科、天同忌');
    await page.locator('#decs .chip2.cur').click();
    await page.locator('#zw .cell', { has: page.locator('.gzv', { hasText: /^庚/ }) }).first().locator('.pn').click(); // 選一個宮干是庚的宮，看飛化
    const selected = async () => `${await page.locator('#decs .chip2[aria-pressed=true]').innerText()}｜${await page.locator('#yrs .chip2[aria-pressed=true]').innerText()}｜${await page.locator('#zw .cell.sel').getAttribute('data-pal')}`;
    const sel0 = await selected(), fly0 = await text(page, '#pdetail .fly');
    await page.locator('#zhua').selectOption('zhongzhou');
    ok(await fact('生年四化') === '太陽祿、武曲權、天府科、天同忌' && await badge('天府') === '科' && await badge('太陰') === '' && await badge('天同') === '忌', '中州派：庚年化科改在天府，盤上的標記跟著換');
    ok(fly0.includes('太陰化科') && (await text(page, '#pdetail .fly')).includes('天府化科') && !(await text(page, '#pdetail .fly')).includes('太陰化科') && await selected() === sel0, '宮干飛化也查同一張表；換四化版本不動宮位，選到的大限、流年、宮位都留著');
    ok(await summary() === '紫微斗數流派設定目前：中州派四化' && await fact('流派') === '中州派四化、生年以正月初一為界、閏月月中分界' && await pillars(page) === p0, '標題與中宮寫出改過的設定；八字不受影響');
    await page.locator('#zhua').selectOption('gengTongXiang');
    ok(await fact('生年四化') === '太陽祿、武曲權、天同科、天相忌' && await badge('天同') === '科' && await badge('天相') === '忌', '庚干陽武同相：天同化科、天相化忌');
    await page.locator('#zhua').selectOption('gengTongYin');
    ok(await fact('生年四化') === '太陽祿、武曲權、天同科、太陰忌' && (await textChart(page)).includes('\n流派設定：庚干陽武同陰、生年以正月初一為界、閏月月中分界\n'), '庚干陽武同陰：天同化科、太陰化忌；文字盤寫明採用的版本');
    // 戊、壬兩干在中州派也不同：看大限的四化（1990 年生的人，戊、壬的大限各一個）
    await page.locator('#zhua').selectOption('zhongzhou');
    const decHua = async stem => { await page.locator('#decs .chip2', { hasText: new RegExp(`${stem}.$`) }).first().click(); return (await text(page, '#zw .cyun')).split('\n')[0].split('：')[1]; };
    ok(await decHua('戊') === '貪狼化祿、太陰化權、太陽化科、天機化忌' && await decHua('壬') === '天梁化祿、紫微化權、天府化科、武曲化忌', '中州派的戊干（太陽化科）、壬干（天府化科）：大限四化也跟著');
    await page.locator('#zhua').selectOption('tongxing');
    ok(await decHua('戊') === '貪狼化祿、太陰化權、右弼化科、天機化忌' && await decHua('壬') === '天梁化祿、紫微化權、左輔化科、武曲化忌' && await summary() === '紫微斗數流派設定目前都是預設（坊間通行的排法）', '改回通行版：戊干右弼化科、壬干左輔化科');

    // 年界。1985 年立春 2 月 4 日、正月初一 2 月 20 日：2 月 10 日出生的人，兩種年界差一年
    await born(page, '1985-02-10', '12:00');
    await page.locator('#t-bazi').click();
    await page.locator('#dayun [data-dy="3"]').click();
    await page.locator('#t-ziwei').click();
    const juLunar = await fact('五行局'), decsLunar = await text(page, '#decs');
    // 換年界、閏月算法是換一張紫微盤（宮位、大限都可能不同）：原本選到的大限、宮位要清掉，回到本命盤、選在命宮
    const reset = async () => await page.locator('#decs [data-dec=""]').getAttribute('aria-pressed') === 'true' && await page.locator('#yrs').isHidden() && await page.locator('#zw .cell.sel').getAttribute('data-pal') === await ming();
    await page.locator('#decs .chip2').nth(4).click();
    await page.locator('#zw .pn').nth(5).click();
    const picked = !(await reset());
    await page.locator('#zyear').selectOption('lichun');
    ok(picked && await reset(), '換年界：紫微分頁回到本命盤、選在命宮');
    ok(await fact('生年') === '乙丑年，屬牛 以立春分界；照正月初一是甲子年' && !(await warnings(page)).includes('年界') && await fact('生年四化') === '天機祿、天梁權、紫微科、太陰忌', `年界改成立春：生年從甲子變成乙丑，生年四化跟著換。${await fact('生年')}`);
    await page.locator('#decs [data-dec="child"]').click();
    ok((await text(page, '#yrs .chip2 >> nth=0')).replace(/\s+/g, '') === '1985乙丑1歲' && await text(page, '#decs') !== decsLunar, `虛歲從立春年算起：1985 乙丑年一歲；大限的排列也不同（五行局 ${juLunar} → ${await fact('五行局')}）`);
    /* 照生年安的雜曜、歲前與將前十二神也要跟著立春年（乙丑）：華蓋在丑、天空在寅，歲建在丑、將星在酉。
       iztro 把年界拆成兩個設定，漏設一個時這幾樣會留在農曆年（甲子）的位置。童限選到的是一歲那年（1985 乙丑），
       流年的歲前、將前和本命的就該是同一套 */
    const cellOf = zhi => page.evaluate(z => {
      const el = [...document.querySelectorAll('#zw .cell')].find(c => c.querySelector('.gzv').textContent.endsWith(z));
      return { stars: [...el.querySelectorAll('.st .n')].map(n => n.textContent), gods: [...el.querySelectorAll('.foot .l span')].map(x => x.textContent) };
    }, zhi);
    const chou = await cellOf('丑'), yin = await cellOf('寅'), you = await cellOf('酉');
    const sameGods = await page.evaluate(() => [...document.querySelectorAll('#zw .cell .foot .l')].every(l => { const t = [...l.children].map(x => x.textContent); return t.length === 6 && t[2] === t[3] && t[4] === t[5]; }));
    ok(chou.stars.includes('華蓋') && yin.stars.includes('天空') && chou.gods[2] === '歲建' && you.gods[4] === '將星' && sameGods,
      `年界改成立春：照生年安的雜曜和歲前、將前十二神也照乙丑年（華蓋在丑、天空在寅、歲建在丑、將星在酉），一歲那年流年的歲前、將前和本命的相同。丑宮 ${chou.gods.join(' ')}`);
    ok(await page.locator('#dayun [data-dy="3"]').getAttribute('aria-pressed') === 'true' && await summary() === '紫微斗數流派設定目前：生年以立春為界', '只換紫微的盤：八字分頁選到的大運不動');
    // 順序反過來的年：2025 年正月初一 1 月 29 日、立春 2 月 3 日。2 月 1 日出生的人照立春還在甲辰年，生年比農曆年早一年
    await born(page, '2025-02-01', '12:00');
    await page.locator('#decs [data-dec="child"]').click();
    ok(await fact('生年') === '甲辰年，屬龍 以立春分界；照正月初一是乙巳年' && (await text(page, '#yrs .chip2 >> nth=0')).replace(/\s+/g, '') === '2024甲辰1歲' && !(await warnings(page)).includes('年界'), `過年後、立春前出生：照立春是前一年，2024 甲辰年一歲。${await fact('生年')}`);
    // 立春以日為單位：1984-02-04 立春在 23:19，上午出生的人八字還是癸亥年，紫微已經算甲子年
    const p84 = await born(page, '1984-02-04', '10:00');
    ok(p84.startsWith('癸亥 ') && await fact('生年') === '甲子年，屬鼠 立春以日為單位換年；八字年柱看交節的時刻，為癸亥'
      && (await warnings(page)).includes('紫微的年界設成立春，以「日」為單位：起盤日 1984-02-04 算甲子年。八字年柱看交節的時刻，這個出生時間算癸亥年。兩邊的生年不同，請留意。這個出生時間，兩種年界都排不出癸亥年的紫微命盤。'),
      '立春當天、交節之前出生：紫微算新的一年、八字算舊的一年，中宮加註並列入提醒（這一天正月初一已過，兩種年界都排不出癸亥年）');
    // 1985-02-04 立春在清晨：凌晨出生的人八字是甲子年；紫微照立春日算乙丑，照正月初一算甲子
    const p85 = await born(page, '1985-02-04', '03:00');
    ok(p85.startsWith('甲子 ') && await fact('生年') === '乙丑年，屬牛 以立春分界；照正月初一是甲子年。立春以日為單位換年；八字年柱看交節的時刻，為甲子' && (await warnings(page)).includes('兩邊的生年不同，請留意。把年界改回「正月初一」，紫微的生年就是甲子年。'),
      `立春當天、交節之前，而且還沒過年：提醒改回正月初一就和八字同年。${p85}`);
    /* 反過來的情形：出生地在 UTC+8 以西。倫敦 1985-02-03 22:00 是 UTC+8 的 2 月 4 日 06:00，已過立春交節（05:12），八字算乙丑年；
       當地的日期還沒到立春日，紫微照立春日仍算甲子年。這時候中宮的說明不能寫成「立春當天整天算新的一年」 */
    await page.locator('#place').selectOption('custom');
    await setVal(page, '#lon', '0'); await setVal(page, '#tz', '0');
    const west = await born(page, '1985-02-03', '22:00');
    ok(west.startsWith('乙丑 ') && await fact('生年') === '甲子年，屬鼠 立春以日為單位換年；八字年柱看交節的時刻，為乙丑'
      && (await warnings(page)).includes('起盤日 1985-02-03 算甲子年。八字年柱看交節的時刻，這個出生時間算乙丑年。兩邊的生年不同，請留意。這個出生時間，兩種年界都排不出乙丑年的紫微命盤。'),
      `出生地在 UTC+8 以西、當地日期還沒到立春日而八字已過交節：紫微算舊的一年、八字算新的一年，中宮與提醒照實寫。${west}｜${await fact('生年')}`);
    await page.locator('#place').selectOption('台北');
    await page.locator('#zyear').selectOption('lunar');
    ok(await fact('生年') === '甲子年，屬鼠' && !(await warnings(page)).includes('年界'), '改回正月初一：生年甲子，和八字年柱相同，不再提醒');

    // 閏月。2023 年閏二月：3 月 22 日到 4 月 19 日
    const LEAP = (now, month, tail) => `紫微的起盤日在農曆閏二月。閏月出生的人，生月有幾種算法：目前採「${now}」，這一天算${month}。${tail}另有一律算下個月的算法，本頁沒有提供。可以在「紫微斗數流派設定」裡切換。`;
    await born(page, '2023-04-10', '10:00'); // 閏二月二十
    const mingMid = Number(await ming());
    ok(await fact('農曆') === '2023 年閏二月二十' && (await warnings(page)).includes(LEAP('月中分界', '三月', '改成「整個閏月算本月」會算成二月，命宮和整張盤都不同。')), '閏月下半月出生：提醒目前算下個月，改另一種算法整張盤都不同');
    await page.locator('#decs .chip2.cur').click();
    await page.locator('#zw .pn').nth(3).click();
    const pickedLeap = !(await reset());
    await page.locator('#zleap').selectOption('current');
    ok(pickedLeap && await reset(), '換閏月算法：紫微分頁回到本命盤、選在新的命宮');
    ok(Number(await ming()) === (mingMid + 11) % 12 && (await warnings(page)).includes(LEAP('整個閏月算本月', '二月', '改成「月中分界」會算成三月，命宮和整張盤都不同。')) && await summary() === '紫微斗數流派設定目前：閏月算本月', '改成整個閏月算本月：生月少一個月，命宮退一宮');
    await born(page, '2023-03-31', '10:00'); // 閏二月初十
    const mingCur = await ming();
    ok((await warnings(page)).includes(LEAP('整個閏月算本月', '二月', '十五日以前，這兩種算法排出來的盤相同。')), '閏月上半月出生：提醒兩種算法排出來相同');
    await page.locator('#zleap').selectOption('mid');
    ok(await ming() === mingCur && (await warnings(page)).includes(LEAP('月中分界', '二月', '十五日以前，這兩種算法排出來的盤相同。')), '上半月出生的人換算法，命宮不動');
    // 流月也照同一種算法：2025 年閏六月，算本月時不拆
    await born(page, '1984-11-20', '14:00');
    // 不是生在立春和正月初一之間的人，換年界盤不變：選到的運限、宮位留著
    await page.locator('#decs [data-today]').click();
    await page.locator('#zw .pn').nth(7).click();
    const kept = await page.locator('#p-ziwei').innerHTML();
    await page.locator('#zyear').selectOption('lichun');
    const same = (await page.locator('#p-ziwei').innerHTML()).replace('生年以立春為界', '生年以正月初一為界') === kept;
    await page.locator('#zyear').selectOption('lunar');
    ok(same && await page.locator('#p-ziwei').innerHTML() === kept, '生年不受年界影響的人換年界：盤面除了中宮「流派」那一行以外完全相同，選到的四層運限和宮位都留著');
    await page.locator('#zleap').selectOption('current');
    await page.locator('#decs .chip2', { hasText: '33–42 歲' }).click();
    await page.locator('#yrs [data-yr="2025"]').click();
    const mos = (await page.locator('#mos .chip2').allInnerTexts()).map(s => s.replace(/\s+/g, ''));
    ok(mos.length === 13 && mos[5] === '6/25起六月癸未' && mos[6] === '7/25起閏六月癸未' && mos[7] === '8/23起七月甲申' && !(await warnings(page)).includes('閏'), `整個閏月算本月時，流月的閏六月不拆、干支跟六月相同；不是閏月出生的人沒有閏月的提醒。${mos.slice(5, 8).join(' ')}`);

    // 存檔帶著流派設定；讀回時設定區會打開
    await page.locator('#zhua').selectOption('zhongzhou');
    await page.locator('#save').click();
    const label = await text(page, '#saved .chip >> nth=0');
    await page.locator('#sample').click();
    const backToDefault = `${await page.locator('#zhua').inputValue()},${await page.locator('#zleap').inputValue()}`;
    await page.locator('#save').click();
    const labels = await page.locator('#saved [data-load]').allInnerTexts();
    ok(label.includes('1984/11/20 14:00 · 中州派四化、閏月算本月') && backToDefault === 'tongxing,mid' && labels.length === 2 && labels[0].endsWith('14:00') && labels[1].endsWith('14:00 · 中州派四化、閏月算本月'), `同一個生辰用不同的流派設定各存一筆，改過設定的那一筆後面寫出改了哪幾項；載入範例盤會把設定改回預設。${labels.join('｜')}`);
    // 再用另一組設定存一筆：幾筆的標籤和刪除鈕的名稱各不相同，分得出哪一筆是哪一種排法
    await page.locator('#zyear').selectOption('lichun');
    await page.locator('#save').click();
    const three = await page.locator('#saved [data-load]').allInnerTexts(), dels = await page.locator('#saved [data-del]').evaluateAll(list => list.map(b => b.getAttribute('aria-label')));
    ok(three.length === 3 && three[0].endsWith('14:00 · 生年以立春為界') && new Set(three).size === 3 && new Set(dels).size === 3 && dels.every((d, i) => d === `刪除 ${three[i]}`), `同一個生辰存了三種設定：標籤各不相同，刪除鈕的名稱跟著標籤。${three.join('｜')}`);
    await page.locator('#saved [data-del]').nth(0).click();
    await page.reload();
    const closed = await page.locator('#zopts').getAttribute('open') === null;
    await page.locator('#saved [data-load]').nth(1).click();
    ok(closed && await page.locator('#zopts').getAttribute('open') !== null && await page.locator('#zhua').inputValue() === 'zhongzhou' && await page.locator('#zleap').inputValue() === 'current' && await page.locator('#zyear').inputValue() === 'lunar', '重新整理後載入那一筆：三個設定都回來，設定區自動打開');
    await page.locator('#t-ziwei').click();
    ok(await fact('流派') === '中州派四化、生年以正月初一為界、閏月算本月', '排出來的盤用的是存檔裡的設定');
    // 加上這幾欄之前存的盤、欄位被改壞的盤：當成預設
    await page.evaluate(() => localStorage.setItem('paipan-saved-v1', JSON.stringify([
      { name: '舊存檔', gender: '男', calendar: 'solar', y: 1990, m: 6, d: 15, h: 10, mi: 0, place: '台北', clock: 'auto', useTST: false, ziRule: 'next' },
      { name: '壞設定', gender: '女', calendar: 'solar', y: 1990, m: 6, d: 15, h: 10, mi: 0, place: '台北', clock: 'auto', useTST: false, ziRule: 'next', zwHua: 'constructor', zwYear: 7, zwLeap: null },
    ])));
    await page.reload();
    const olds = await page.locator('#saved [data-load]').allInnerTexts();
    await page.locator('#saved [data-load]').nth(1).click();
    const vals = await page.evaluate(() => ['#zhua', '#zyear', '#zleap'].map(s => document.querySelector(s).value).join());
    await page.locator('#saved [data-load]').nth(0).click();
    ok(olds.length === 2 && olds.every(s => /^(舊存檔|壞設定) · 1990\/6\/15 10:00$/.test(s)) && vals === 'tongxing,lunar,mid' && await errText(page) === '' && await page.locator('#zopts').getAttribute('open') === null && await pillars(page) === p0, '沒有這幾欄的舊存檔、設定值不認得的存檔：照樣讀得回來，設定當成預設');
    ok(errors.length === 0, `流派設定無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  /* 大運在交運日換、流年在立春換。每步運列出和它有重疊的流年，所以交運的那一年前後兩步運都列（虛線框）。
     時鐘固定在 2026-11-11。 */
  section('八字的流月：十二個節氣月，選了才接進關係列');
  {
    const { ctx, page, errors } = await open(browser);
    const months = () => page.locator('#liuyue .yun').evaluateAll(bs => bs.map(b => [...b.querySelectorAll('.c')].map(c => c.textContent).join('') + ' ' + b.querySelector('.y').textContent + ' ' + b.querySelector('.a').textContent));
    const pressed = () => page.locator('#liuyue .yun[aria-pressed=true]').evaluateAll(bs => bs.map(b => b.dataset.lm).join());
    const ix = () => page.locator('#ix .rel').evaluateAll(rs => rs.map(r => `${r.querySelector('.ty').textContent}:${r.querySelector('.wh').textContent.replace(/\s+/g, ' ').trim()}`));
    const title = s => page.locator(s).innerText().then(t => t.replace(/\s+/g, ' '));
    // 範例盤，測試的今天是 2026-11-11：選在己卯運、2026 丙午年；立冬（11 月 7 日）已過，所以今天在亥月
    const m26 = await months(), before = await ix();
    ok(m26.length === 12 && m26[0] === '庚寅 立春 2/4 起' && m26[9] === '己亥 立冬 11/7 起' && m26[11] === '辛丑 小寒 1/5 起' && (await title('#lm-title')).startsWith('2026 丙午年的流月'), `2026 丙午年的十二個節氣月：${m26.join('｜')}`);
    ok(await pressed() === '' && (await page.locator('#liuyue .yun:has(.now)').getAttribute('data-lm')) === '9' && (await title('#ix-title')).startsWith('己卯運、2026 丙午年 與原局 只列牽涉運或歲的關係') && before.every(t => !t.includes('流月')),
      '一開始沒有選流月：關係列只有運和歲；今天所在的亥月標「今」');
    ok((await page.locator('#liuyue [data-lm="9"] .vh').innerText()) === '2026-11-07 17:52 交立冬', '讀屏聽得到完整的交節時刻');
    await page.locator('#liuyue [data-lm="9"]').click();
    const withMonth = await ix();
    ok(await pressed() === '9' && (await title('#ix-title')) === '己卯運、2026 丙午年、己亥月 與原局 只列牽涉運、歲或流月的關係。己亥月從 2026-11-07 17:52 交立冬起，到 2026-12-07 交大雪為止'
      && ['天干五合:年×流月 共識', '自刑:月×流月 存疑', '三合:月×時×運×流月 共識'].every(t => withMonth.includes(t)) && before.includes('三合:月×時×運 共識') && before.filter(t => !t.startsWith('三合')).every(t => withMonth.includes(t)) && withMonth.length === before.length + 2,
      `選了己亥月：標題寫出這個月的起訖；關係多了甲己合、亥亥自刑，原本的亥卯未三合多一個流月的亥，其餘照舊。${withMonth.filter(t => t.includes('流月')).join('｜')}`);
    ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.lm) === '9', '點了之後焦點留在同一顆流月上');
    // 改姓名不算換盤，選到的流月留著；點同一個流年也不取消
    await setVal(page, '#nm', '流月測試');
    await page.locator('#liunian [data-ln="2026"]').click();
    ok(await pressed() === '9', '改姓名、點同一個流年：選到的流月還在');
    // 換一個流年：月份是另外十二個月，選到的取消；丁未年從壬寅月起
    await page.locator('#liunian [data-ln="2027"]').click();
    const m27 = await months();
    ok(await pressed() === '' && m27[0].startsWith('壬寅 立春') && (await title('#lm-title')).startsWith('2027 丁未年的流月') && (await page.locator('#liuyue .now').count()) === 0 && (await title('#ix-title')).startsWith('己卯運、2027 丁未年 與原局'),
      `換到 2027 丁未年：流月取消，十二個月換成丁未年的（${m27[0]}），這一年沒有「今」`);
    // 丑月從小寒起，到下一個立春為止；再點一次取消
    await page.locator('#liuyue [data-lm="11"]').click();
    ok((await title('#ix-title')).includes('癸丑月從 2028-01-06') && (await title('#ix-title')).endsWith('交立春為止'), `最後一個月（丑月）到下一個立春為止：${await title('#ix-title')}`);
    await page.locator('#liuyue [data-lm="11"]').click();
    ok(await pressed() === '' && (await ix()).every(t => !t.includes('流月')), '再點一次取消：關係列回到只有運和歲');
    // 換一格運也取消；起運前那一格沒有大運，關係只牽涉流年和流月
    await page.locator('#liuyue [data-lm="3"]').click();
    await page.locator('#dayun [data-dy="-1"]').click();
    ok(await pressed() === '' && (await title('#lm-title')).startsWith('1984 甲子年的流月'), '換一格運：流月取消，換成那一格先看的那一年');
    await page.locator('#liuyue [data-lm="10"]').click();
    const pre = await ix();
    ok((await title('#ix-title')).startsWith('起運前、1984 甲子年、丙子月 與原局 只列牽涉流年或流月的關係') && pre.length > 0 && pre.every(t => /歲|流月/.test(t) && !t.includes('運')), `起運前選流月：只牽涉流年或流月。${pre.join('｜')}`);
    // 換一張盤（改出生時間）：流月取消
    await born(page, '1984-11-20', '16:00');
    ok(await pressed() === '', '換了一張盤：選到的流月取消');
    ok(errors.length === 0, `頁面沒有丟出錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

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
    /* 「運」那一排的第一格是起運前：從出生到交入第一步運，沒有大運干支，只有流年。
       還沒起運的小孩（2024-03-10 生，2032-08-04 起運；時鐘固定在 2026-11-11）今天就在這一格 */
    const years = () => page.locator('#liunian .yun').evaluateAll(els => els.map(e => e.dataset.ln + (e.classList.contains('edge') ? '邊' : '') + (e.querySelector('.now') ? '今' : '') + (e.getAttribute('aria-pressed') === 'true' ? '選' : '')).join(' '));
    const nowAt = () => page.locator('#dayun .yun').evaluateAll(els => els.filter(e => e.querySelector('.now')).map(e => e.dataset.dy).join());
    const pressed = () => page.locator('#dayun .yun[aria-pressed=true]').getAttribute('data-dy');
    await born(page, '2024-03-10', '10:00');
    ok(await page.locator('#dayun .yun').count() === 11 && await nowAt() === '-1' && await pressed() === '-1' && (await text(page, '#yunhead')).includes('約 2032-08-04 交運（今天還沒起運）'),
      '還沒起運：「今」標在起運前那一格，預設就看它，並註明今天還沒起運');
    ok((await text(page, '#dayun [data-dy="-1"]')).replace(/\s+/g, ' ') === '今 起運前 — — 還沒有大運干支 2024–31 1–8 歲' && await years() === '2024 2025 2026今選 2027 2028 2029 2030 2031 2032邊'
      && (await text(page, '#ln-title')).includes('起運前的流年') && (await text(page, '#ln-title')).includes('約 2032-08-04 起運'),
      `起運前那一格：沒有干支，流年從出生那年列到起運那年（虛線框），今年看得到。${await years()}`);
    ok((await text(page, '#ix-title')).startsWith('起運前、2026 丙午年 與原局') && !(await page.locator('#ix .wh').allInnerTexts()).some(t => t.includes('運')),
      '起運前沒有大運：只列流年和原局的關係');
    await page.locator('#dayun [data-dy="0"]').click();
    ok(await years() === '2032邊選 2033 2034 2035 2036 2037 2038 2039 2040 2041 2042邊' && await nowAt() === '-1' && (await text(page, '#ix-title')).startsWith('戊辰運、2032 壬子年'), '點第一步運：起運那一年（2032）它也列，「今」還在起運前那一格');
    await page.locator('#dayun [data-dy="-1"]').click();
    ok(await years() === '2024 2025 2026今選 2027 2028 2029 2030 2031 2032邊' && await page.evaluate(() => document.activeElement.dataset.dy) === '-1', '點回起運前：回到今年，焦點留在這一格');
    // 立春前出生：流年從年柱所屬的那一年（出生那個公曆年的前一年）列起
    await born(page, '1985-01-15', '12:00');
    await page.locator('#dayun [data-dy="-1"]').click();
    ok((await text(page, '#dayun [data-dy="-1"]')).replace(/\s+/g, ' ') === '起運前 — — 還沒有大運干支 1985–90 1–7 歲' && await years() === '1984選 1985 1986 1987 1988 1989 1990 1991邊', `立春前出生的起運前：${await years()}`);
    // 出生第二天就起運（女 1990-02-04 10:30，立春後 16 分鐘、逆行）：起運前只有出生那一年
    await page.locator('label:has(#g-f)').click();
    await born(page, '1990-02-04', '10:30');
    await page.locator('#dayun [data-dy="-1"]').click();
    ok((await text(page, '#dayun [data-dy="-1"]')).replace(/\s+/g, ' ') === '起運前 — — 還沒有大運干支 1990 1 歲' && await years() === '1990邊選', `出生第二天就起運：${await years()}`);
    await page.locator('label:has(#g-m)').click();
    // 還沒出生（未來的日期）：沒有「今」，先看起運前，也不說「今天還沒起運」
    await born(page, '2090-06-01', '10:00');
    ok(await nowAt() === '' && await pressed() === '-1' && !(await text(page, '#yunhead')).includes('還沒起運') && await page.locator('#liunian .now').count() === 0, '還沒出生的日期：哪一格都不標「今」，預設看起運前');
    // 十步運都走完了（1900 年生，最後一步運到 2001 年）：不可以把最後一步標成「今」
    await born(page, '1900-03-01', '10:00');
    ok(await nowAt() === '' && await pressed() === '9' && (await text(page, '#ln-title')).includes('2001-10-23 交出'), '十步運都走完的盤：不標「今」，預設看最後一步');
    await born(page, '1930-06-01', '10:00');
    ok(await nowAt() === '9' && await pressed() === '9', '還在第十步運裡（1930 年生）：「今」標在第十步');
    await born(page, '1984-11-20', '14:00');
    ok(!(await text(page, '#yunhead')).includes('還沒起運') && await nowAt() === '3' && (await text(page, '#dayun [data-dy="-1"]')).replace(/\s+/g, ' ') === '起運前 — — 還沒有大運干支 1984–89 1–6 歲', '已經起運的盤：沒有那個註記，起運前那一格照樣可以點來看小時候的流年');
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
  /* 第一個大限開始之前是童限：一歲命宮、二歲財帛、三歲疾厄、四歲夫妻、五歲福德，每年走的宮不同。
     沒有這一格的話，還沒走到第一個大限的小孩在紫微分頁疊不出今年的流年。時鐘固定在 2026-11-11。 */
  section('紫微的童限：第一個大限之前的那幾年');
  {
    const { ctx, page, errors } = await open(browser);
    const chips = sel => page.locator(sel).evaluateAll(els => els.map(e => e.innerText.replace(/\s+/g, '') + (e.classList.contains('cur') ? '（今）' : '') + (e.getAttribute('aria-pressed') === 'true' ? '（選）' : '')).join(' '));
    const center = async () => (await text(page, '#zw .cyun')).replace(/\s+/g, ' ');
    // 火六局的小孩（2024-03-10 生）：大限 6 歲才開始，今年 3 歲在童限
    await born(page, '2024-03-10', '10:00');
    await page.locator('#t-ziwei').click();
    ok((await chips('#decs .chip2')).startsWith('本命盤（選） 今1–5歲童限（今） 6–15歲甲戌 16–25歲乙亥') && await page.locator('#decs .chip2').count() === 12, `大限那一排在本命盤後面多一個童限的籤，今年在這裡：${(await chips('#decs .chip2')).slice(0, 40)}`);
    await page.locator('#decs [data-dec="child"]').click();
    ok(await chips('#yrs .chip2') === '2024甲辰1歲 2025乙巳2歲 今2026丙午3歲（今）（選） 2027丁未4歲 2028戊申5歲' && (await center()).startsWith('童限 3 歲 己巳（疾厄）：武曲化祿、貪狼化權、天梁化科、文曲化忌 流年 2026 丙午：'),
      `點童限：列出 1 到 5 歲，順便帶出今年；中宮寫這一年走到哪一宮。${await center()}`);
    ok(await overlay(page) === '12/12/8' && (await page.locator('#zw .ly.dec i, #zw .hua.o.dec i').allInnerTexts()).every(t => t === '童') && (await text(page, '#zw .cell:has(.ly.dec.ming) .pn')).trim() === '疾厄',
      '盤上疊的是童限（標「童」）和流年：童限的命宮落在本命的疾厄宮');
    // 一歲命宮、二歲財帛、三歲疾厄、四歲夫妻、五歲福德
    const seq = [];
    for (let k = 0; k < 5; k++) { await page.locator('#yrs .chip2').nth(k).click(); seq.push((await center()).match(/童限 (\d) 歲 ..（(..)）/).slice(1).join('')); }
    ok(seq.join(' ') === '1命宮 2財帛 3疾厄 4夫妻 5福德', `童限每年走的宮：${seq.join(' ')}`);
    await page.locator('#yrs .chip2').nth(4).click();
    ok(await page.locator('#yrs .chip2[aria-pressed=true]').count() === 1 && (await center()).startsWith('童限 5 歲'), '童限一定要落在某一年上：再點一次同一年不會取消');
    await page.locator('#decs .chip2').nth(2).click();
    ok((await center()).startsWith('大限 6–15 歲 甲戌：') && (await page.locator('#zw .ly.dec i').allInnerTexts()).every(t => t === '大') && await page.locator('#yrs .chip2[aria-pressed=true]').count() === 0, '換到第一個大限：標記變回「大」，流年可以不選');
    await page.locator('#decs [data-dec=""]').click();
    ok(await overlay(page) === '0/0/0' && await page.locator('#yrs').isHidden(), '回本命盤：不疊');
    // 大人的盤：童限的籤照樣在，但不是今年；點了先看一歲
    await born(page, '1984-11-20', '14:00');
    ok((await chips('#decs .chip2')).startsWith('本命盤（選） 1–2歲童限 3–12歲戊辰') && (await chips('#decs .chip2')).includes('今43–52歲壬申（今）'), '大人的盤：童限不標「今」，今年在 43–52 歲的大限');
    await page.locator('#decs [data-dec="child"]').click();
    ok(await chips('#yrs .chip2') === '1984甲子1歲（選） 1985乙丑2歲' && (await center()).startsWith('童限 1 歲 戊辰（命宮）：') && await page.evaluate(() => document.activeElement.dataset.dec) === 'child', '大人的盤點童限：先看一歲（命宮），焦點留在童限的籤上');
    // 水二局只有一歲是童限；還沒出生的盤沒有「今」
    await born(page, '1900-03-01', '14:00');
    ok((await chips('#decs .chip2')).startsWith('本命盤（選） 1歲童限 2–11歲') && !(await chips('#decs .chip2')).includes('今'), '水二局的童限只有一歲；1900 年生的人早就過了最後一個大限，不標「今」');
    await born(page, '2090-06-01', '10:00');
    ok(!(await chips('#decs .chip2')).includes('今'), '還沒出生的日期：大限那一排也不標「今」');
    ok(errors.length === 0, `童限無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  section('提醒：換日的時刻、重複與不存在的鐘面時間、金門馬祖');
  {
    const { ctx, page, errors } = await open(browser);
    const NEAR = '離時辰交界只有 5 分鐘。出生時間差幾分鐘，或改變真太陽時的設定，';
    const at = async (date, time) => `${(await born(page, date, time)).split(' ')[2]}｜${await warnings(page)}`;
    // 換日換柱：23:00 是時辰交界，也是換日的時刻
    const n1 = await at('1990-05-23', '22:55'), n2 = await at('1990-05-23', '23:05'), n3 = await at('1990-05-23', '12:55');
    // 晚子時而且換日的盤，另外有一則提醒：日柱和紫微算到次日
    const LATE = (m, d) => `排盤用時在晚子時（23:00 到 24:00）。目前採「23:00 換日換柱」，日柱和紫微都算到次日（${m} 月 ${d} 日）。只知道生在「子時」、不確定是前半夜還是後半夜的人，請留意這裡會差一天；要照當日算，把「子時立場」改成「夜子時不換日」。`;
    ok(n1 === `戊子｜排盤用時 22:55 ${NEAR}日柱、時柱和紫微命盤就會不同（23:00 同時是換日的時刻）。` && n2 === `己丑｜排盤用時 23:05 ${NEAR}日柱、時柱和紫微命盤就會不同（23:00 同時是換日的時刻）。\n${LATE(5, 24)}`, '換日換柱：23:00 前後日柱不同（戊子、己丑），提醒裡寫明日柱也會變');
    ok((await at('1990-05-23', '23:30')) === `己丑｜${LATE(5, 24)}` && (await at('1990-05-31', '23:30')).endsWith(LATE(6, 1)) && !(await at('1990-05-23', '00:30')).includes('晚子時'),
      '晚子時換日：提醒日柱和紫微算到次日（月底會跨月）；早子時不提');
    ok(n3 === `戊子｜排盤用時 12:55 ${NEAR}時柱和紫微命宮就會不同。`, '其他時辰交界只提時柱和紫微命宮');
    // 夜子時不換日：23:00 只換時柱，日柱和紫微的起盤日到午夜才換
    await page.locator('#zi').selectOption('same');
    const s1 = await at('1990-05-23', '22:55'), s2 = await at('1990-05-23', '23:55'), s3 = await at('1990-05-24', '00:05'), s4 = await at('1990-05-24', '00:00');
    const MID = '採「夜子時不換日」時，日柱和紫微的起盤日在午夜才換；出生時間差幾分鐘，或改變真太陽時的設定，日柱和紫微命盤就會不同。';
    ok(s1 === `戊子｜排盤用時 22:55 ${NEAR}時柱和紫微命宮就會不同。` && (await at('1990-05-23', '23:30')) === '戊子｜', '夜子時不換日：23:00 的提醒不提日柱；晚子時沒有換日，也就沒有「算到次日」的提醒');
    ok(s2 === `戊子｜排盤用時 23:55 離午夜只有 5 分鐘。${MID}` && s3 === `己丑｜排盤用時 00:05 離午夜只有 5 分鐘。${MID}` && s4 === `己丑｜排盤用時 00:00 正好是午夜。${MID}`, '夜子時不換日：午夜前後日柱不同（戊子、己丑），有提醒');
    await page.locator('#zi').selectOption('next');
    ok(!(await at('1990-05-24', '00:05')).includes('午夜'), '換日換柱的立場下，午夜不是交界，不提醒');

    // 台灣 1975 年夏令時間：9 月 30 日 24:00 撥回 23:00，23:00–24:00 出現兩次
    const twice = await at('1975-09-30', '23:30');
    ok(twice === `庚辰｜這個鐘面時間在當天出現過兩次（鐘錶往回撥，例如夏令時間結束）：前一次是 UTC+9，後一次是 UTC+8。目前當作後一次排盤。如果出生在前一次，請把「夏令時間」改成「手動：減 1 小時」。\n${LATE(10, 1)}`, '重複的鐘面時間（台北 1975-09-30 23:30）：說明取的是哪一次、另一次怎麼指定');
    await page.locator('#clock').selectOption('dst');
    ok((await pillars(page)).split(' ')[2] === '己卯' && (await text(page, '#summary')).includes('1975-09-30 22:30　亥時') && !(await warnings(page)).includes('出現過兩次'), '照提醒改成手動減 1 小時：變成 22:30 亥時、日柱己卯，提醒消失');
    await page.locator('#clock').selectOption('auto');
    ok((await at('1975-09-30', '23:30')).includes('出現過兩次') && await page.locator('#live').innerText() === '已排盤：未命名，四柱 乙卯 乙酉 庚辰 丙子。有 2 則提醒。' && await page.locator('#live').getAttribute('role') === 'status',
      '排盤完成後，讀屏聽得到排出了什麼、有幾則提醒（畫面上看不到這一行）');
    ok((await at('1975-04-01', '00:30')) === '丁丑｜這個鐘面時間在當天不存在：鐘錶直接往前撥過去了（例如夏令時間開始）。目前當作撥動之前的 UTC+8 排盤，請確認出生時間。', '不存在的鐘面時間（台北 1975-04-01 00:30）');
    ok(!(await at('1975-07-01', '12:00')).includes('出現過兩次') && !(await warnings(page)).includes('不存在'), '平常的夏令時間不會有這兩種提醒');
    await page.locator('#place').selectOption('首爾');
    ok((await at('1960-09-17', '23:30')).includes('前一次是 UTC+9:30，後一次是 UTC+8:30。目前當作後一次排盤。如果出生在前一次，請自己換算成現行標準時再填，並把「夏令時間」改成「手動：已是現行標準時」。'), '另一次不是「現行標準時加一小時」時（首爾 1960），請使用者自己換算');

    /* 金門、馬祖查的是台北的時區資料。台灣改用 UTC+9 的那幾年（1937 年 10 月到 1945 年 9 月），兩地不屬台灣，鐘錶不一定跟著走。
       1945-09-21 到 30 日台北的資料已經回到 UTC+8、沒有換算，但那幾天在別的地方可能還是夏令時間，所以也提醒 */
    const KM = p => `${p}查的是台北的時區資料。1937 到 1945 年台灣用的是日本的中央標準時（UTC+9），${p}當時不屬台灣，鐘錶不一定相同。這段期間本頁的換算不一定適用，請自行查證；不適用的話，請把「夏令時間」改成手動。`;
    await page.locator('#place').selectOption('金門');
    const km1940 = await at('1940-06-01', '09:30'), km1960 = await at('1960-07-01', '09:30'), km1930 = await at('1930-06-01', '09:30'), km1945 = await at('1945-09-25', '09:30'), km1946 = await at('1946-05-10', '09:30');
    await page.locator('#place').selectOption('馬祖南竿');
    const mz1940 = await at('1940-06-01', '09:30');
    await page.locator('#place').selectOption('台北');
    const tp1940 = await at('1940-06-01', '09:30');
    ok(km1940.includes(KM('金門')) && mz1940.includes(KM('馬祖南竿')) && km1945.endsWith('｜' + KM('金門')) && !km1960.includes('不屬台灣') && !km1930.includes('不屬台灣') && !km1946.includes('不屬台灣') && !tp1940.includes('不屬台灣') && tp1940.includes('排盤已換算成現行標準時'),
      '金門、馬祖在 1937 年 10 月到 1945 年 9 月之間，提醒台北的資料不一定適用；其他年份、其他地點都不提');

    /* 台灣 1945 到 1947 年的夏令時間：坊間流傳的表（民國 34 到 40 年一律 5 月 1 日到 9 月 30 日）和當年的公報不同。
       時區資料照公報，所以兩邊說法不同的那幾天，照那張表排的盤會和本頁差一小時 */
    const TABLE = dst => `這一天的夏令時間有兩種說法。坊間流傳的台灣夏令時間表，把民國 34 到 40 年都寫成 5 月 1 日到 9 月 30 日；時區資料依據的是當年的公報：1945 年台灣沒有實施，1946 年從 5 月 15 日開始，1947 年是 4 月 15 日到 10 月 31 日。本頁照公報，這一天${dst ? '算夏令時間、已經減一小時' : '不算夏令時間、沒有減一小時'}；照那張表排的命盤，會和這裡差一小時。`;
    const used = async (date, time = '12:30') => { const w = await at(date, time); return `${(await text(page, '#summary')).match(/排盤用時\s*([\d-]+ [\d:]+)/)[1]}｜${w.split('｜')[1]}`; };
    ok((await used('1946-05-10')) === `1946-05-10 12:30｜${TABLE(false)}` && (await used('1945-09-25')) === `1945-09-25 12:30｜${TABLE(false)}`, '表上說是夏令時間、公報說不是的日子（1946-05-10、1945-09-25）：沒有減一小時，並說明兩種說法');
    const apr = await used('1947-04-25'), oct = await used('1947-10-15'); // 不用 4 月 20 日：那天是閏二月三十，會多一則閏月的提醒
    ok(apr.startsWith('1947-04-25 11:30｜時區資料顯示，台北在這個時間點的鐘錶是 UTC+9') && apr.endsWith(TABLE(true)) && oct.startsWith('1947-10-15 11:30｜') && oct.endsWith(TABLE(true)), '公報說是夏令時間、表上說不是的日子（1947-04-25、1947-10-15）：已減一小時，並說明兩種說法');
    ok(![await used('1946-05-20'), await used('1945-09-20'), await used('1947-11-02'), await used('1948-05-10'), await used('1946-04-30')].some(w => w.includes('兩種說法')), '兩邊說法相同的日子不提（1946-05-20、1945-09-20、1947-11-02、1948-05-10、1946-04-30）');
    await page.locator('#place').selectOption('金門');
    ok((await used('1946-05-10')).endsWith(TABLE(false)), '金門 1946 年照同一套全國的規定：同樣提醒');
    await page.locator('#place').selectOption('香港');
    ok(!(await used('1946-05-10')).includes('兩種說法'), '其他地區不提');
    await page.locator('#place').selectOption('台北');
    await page.locator('#clock').selectOption('std');
    ok(!(await used('1946-05-10')).includes('兩種說法'), '已經改成手動的不提（使用者自己決定了）');
    await page.locator('#clock').selectOption('auto');
    ok(errors.length === 0, `提醒無錯誤${errors.length ? '：' + errors.join(' | ') : ''}`);
    await ctx.close();
  }

  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
})().catch(e => { console.error(e); process.exit(1); });
