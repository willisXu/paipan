/* 畫面快照比對：node test/browser/snapshot.test.js [--update]。先跑 node scripts/build.js。
   拿一組固定的生辰與操作步驟去跑 dist/paipan.html，把畫出來的 HTML（空白正規化後）和 test/snapshots/golden.json.gz 逐段比對。
   用途：重構、搬程式時確認畫面輸出一個字都沒變。
   畫面是「故意」改的時候，確認差異符合預期後用 --update 重新產生基準檔。
   開頁的方式（外層骨架、CDN 導向、固定時鐘）在 helpers/browser.js，和冒煙測試共用。 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { root, launch, writeHarness, openPage, blockClipboard } from '../helpers/browser.js';

const GOLDEN = path.join(root, 'test', 'snapshots', 'golden.json.gz');
const UPDATE = process.argv.includes('--update');

const S = { gender: '男', cal: 'solar', date: '1984-11-20', time: '14:00', place: '台北', clock: 'auto', tst: false, zi: 'next', dy: 1, ln: 2, dec: 4, yr: 3, pal: 6 };
// 每筆：生辰設定，加上要點的大運（dy）、流年（ln）、大限（dec）、流年籤（yr）、宮位（pal）
const SCENARIOS = [
  { id: '教材範例盤', keep: true },
  { id: '女命', gender: '女', dy: 0, ln: 9, dec: 1, yr: 0, pal: 0 },
  { id: '台灣夏令時間 1955', date: '1955-07-01', time: '12:00', dy: 6, ln: 4, dec: 7, yr: 9, pal: 3 },
  { id: '晚子時換日遇月底', date: '1990-05-23', time: '23:30', dy: 2, ln: 0, dec: 3, yr: 5, pal: 11 },
  { id: '晚子時不換日', date: '1990-05-23', time: '23:30', zi: 'same', dy: 3, ln: 7, dec: 2, yr: 1, pal: 8 },
  { id: '農曆閏月', cal: 'lunar', ly: 1984, lm: 10, ld: 3, leap: true, time: '13:04', dy: 4, ln: 5, dec: 5, yr: 2, pal: 1 },
  { id: '農曆閏月女命', gender: '女', cal: 'lunar', ly: 2023, lm: 2, ld: 10, leap: true, time: '06:20', dy: 0, ln: 0, dec: 1, yr: 0, pal: 10 },
  { id: '自訂西經、夏令、真太陽時', date: '2001-09-11', time: '08:46', place: 'custom', lon: -73.9, tz: -5, clock: 'dst', tst: true, dy: 2, ln: 6, dec: 3, yr: 4, pal: 5 },
  { id: '東京 1950 夏令加真太陽時', date: '1950-07-01', time: '05:10', place: '東京', tst: true, dy: 7, ln: 6, dec: 8, yr: 6, pal: 2 },
  { id: '新加坡 1970', date: '1970-01-01', time: '10:00', place: '新加坡', dy: 5, ln: 6, dec: 6, yr: 6, pal: 9 },
  { id: '最早日期', date: '1900-01-01', time: '00:00', dy: 9, ln: 9, dec: 10, yr: 9, pal: 4 },
  { id: '最晚日期晚子時', date: '2100-12-31', time: '23:59', dy: 0, ln: 1, dec: 1, yr: 1, pal: 7 },
  { id: '立春前一天', date: '1985-02-03', time: '12:00', dy: 4, ln: 1, dec: 5, yr: 1, pal: 6 },
  { id: '春節前', date: '1985-01-15', time: '09:30', gender: '女', dy: 3, ln: 8, dec: 4, yr: 8, pal: 0 },
  { id: '閏日、台中、真太陽時', date: '2024-02-29', time: '15:00', gender: '女', place: '台中', tst: true, dy: 0, ln: 2, dec: 1, yr: 2, pal: 3 },
  { id: '離交節不到一天', date: '1984-11-07', time: '13:30', dy: 4, ln: 0, dec: 5, yr: 0, pal: 2 },
  { id: '上海 1940', date: '1940-06-01', time: '12:00', place: '上海', dy: 8, ln: 6, dec: 9, yr: 6, pal: 1 },
  { id: '首爾 1988 夏令女命', date: '1988-07-01', time: '12:00', place: '首爾', gender: '女', dy: 3, ln: 8, dec: 4, yr: 8, pal: 5 },
  { id: '手動標準時、高雄、姓名含符號', name: '<b>甲&乙</b>', date: '2000-01-01', time: '13:04', place: '高雄', clock: 'std', dy: 2, ln: 6, dec: 3, yr: 6, pal: 8 },
  { id: '不存在的閏月', cal: 'lunar', ly: 1984, lm: 5, ld: 3, leap: true, time: '14:00', error: true },
].map(s => ({ ...S, ...s }));

// 只收合一般空白（原始碼排版用的縮排與換行）；全形空白是畫面內容的一部分，要原樣比對
const norm = html => html.replace(/[ \t\r\n]+/g, ' ').replace(/> </g, '><').replace(/ >/g, '>').trim();

async function capture(browser, sc, harness) {
  const { ctx, page, pageErrors: errors } = await openPage(browser, harness, { init: [blockClipboard] }); // 複製文字盤改走選取文字的路，才讀得到內容
  const html = sel => page.locator(sel).evaluate(el => el.innerHTML).then(norm);
  const snaps = {};
  if (!sc.keep) {
    await page.evaluate(v => {
      const $ = s => document.querySelector(s);
      $('#nm').value = v.name || '';
      document.querySelectorAll('input[name=gender]').forEach(el => { el.checked = el.value === v.gender; });
      document.querySelectorAll('input[name=cal]').forEach(el => { el.checked = el.value === v.cal; });
      if (v.cal === 'lunar') { $('#ly').value = v.ly; $('#lm').value = v.lm; $('#ld').value = v.ld; $('#leap').checked = !!v.leap; } else $('#date').value = v.date;
      $('#time').value = v.time;
      $('#place').value = v.place;
      if (v.place === 'custom') { $('#lon').value = v.lon; $('#tz').value = v.tz; }
      $('#clock').value = v.clock; $('#tst').value = v.tst ? '1' : '0'; $('#zi').value = v.zi;
      $('#zi').dispatchEvent(new Event('change', { bubbles: true })); // 下拉選單的 change 會立即重排
    }, sc);
  }
  snaps.err = await page.locator('#err').isVisible() ? await page.locator('#err').innerText() : '';
  snaps.stale = await page.evaluate(() => document.querySelector('main').className + '|' + document.querySelector('#p-bazi').inert);
  snaps.form = await page.evaluate(() => [...document.querySelectorAll('#f input, #f select')].map(el => `${el.id}=${el.type === 'radio' || el.type === 'checkbox' ? el.checked : el.value}${el.closest('[hidden]') ? '(hidden)' : ''}`).join(';'));
  snaps.summary = await html('#summary');
  snaps.bazi = await html('#p-bazi');
  if (!sc.error) {
    await page.locator(`#dayun [data-dy="${sc.dy}"]`).click();
    await page.locator('#liunian .yun').nth(sc.ln).click();
    snaps.bazi2 = await html('#p-bazi');
    await page.locator('#t-ziwei').click();
    snaps.ziwei = await html('#p-ziwei');
    await page.locator('#decs .chip2').nth(sc.dec).click();
    await page.locator('#yrs .chip2').nth(sc.yr).click();
    await page.locator(`#zw .cell[data-pal="${sc.pal}"]`).click();
    snaps.ziwei2 = await html('#p-ziwei');
    await page.locator('#copy').click();
    await page.waitForSelector('#copytext');
    snaps.text = await page.locator('#copytext').inputValue();
    snaps.tabs = await page.evaluate(() => `${location.hash}|${document.querySelector('#t-bazi').getAttribute('aria-selected')}|${document.querySelector('#p-bazi').hidden}`);
  }
  snaps.pageErrors = errors.join(' | ');
  await ctx.close();
  return snaps;
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paipan-snap-'));
  const harness = writeHarness(dir);
  const browser = await launch();
  const actual = {};
  for (const sc of SCENARIOS) actual[sc.id] = await capture(browser, sc, harness);
  await browser.close();

  if (UPDATE) {
    fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
    fs.writeFileSync(GOLDEN, zlib.gzipSync(JSON.stringify(actual)));
    const n = Object.values(actual).reduce((a, s) => a + Object.keys(s).length, 0);
    console.log(`已更新基準檔：${SCENARIOS.length} 個情境、${n} 段快照，${(fs.statSync(GOLDEN).size / 1024).toFixed(0)} KB`);
    return;
  }
  if (!fs.existsSync(GOLDEN)) { console.error('沒有基準檔。先用 --update 產生。'); process.exit(2); }
  const golden = JSON.parse(zlib.gunzipSync(fs.readFileSync(GOLDEN)).toString());
  let pass = 0, fail = 0;
  for (const sc of SCENARIOS) {
    const want = golden[sc.id] || {}, got = actual[sc.id];
    for (const key of new Set([...Object.keys(want), ...Object.keys(got)])) {
      const a = got[key], w = want[key];
      if (a === w) { pass++; continue; }
      fail++;
      if (fail > 8) continue;
      let i = 0; while (a !== undefined && w !== undefined && i < a.length && a[i] === w[i]) i++;
      console.log(`  ✗ ${sc.id}／${key}：第 ${i} 個字起不同`);
      console.log(`      基準 …${String(w).slice(Math.max(0, i - 60), i + 120)}`);
      console.log(`      實際 …${String(a).slice(Math.max(0, i - 60), i + 120)}`);
    }
  }
  if (fail) {
    const out = path.join(dir, 'actual.json');
    fs.writeFileSync(out, JSON.stringify(actual, null, 1));
    console.log(`  實際快照已寫到 ${out}`);
  }
  console.log(`\n${fail ? '✗' : '✓'} ${SCENARIOS.length} 個情境、${pass + fail} 段快照：${pass} 段相同，${fail} 段不同`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
