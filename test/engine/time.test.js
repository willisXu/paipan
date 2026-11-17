/* 時間換算：時區、夏令時間、真太陽時、輸入檢查，以及時區資料在每個歷史轉換點前後的查詢。
   執行：node test/engine/time.test.js（約 10 秒） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { base } from '../helpers/charts.js';

/* 時間換算 */
section('時區、夏令時、真太陽時、輸入檢查');
{
  let rt = PP.resolveTime({ ...base, y: 1955, m: 7, d: 1, h: 12, mi: 0 });
  eq([rt.offsetMin, rt.shiftMin, PP.fmt(rt.local)], [540, -60, '1955-07-01 11:00'], '台灣 1955 夏令時自動扣 1 小時');
  rt = PP.resolveTime({ ...base, y: 1955, m: 7, d: 1, h: 12, mi: 0, clock: 'std' });
  eq(PP.fmt(rt.local), '1955-07-01 12:00', '手動指定非夏令時則不扣');
  rt = PP.resolveTime({ ...base, y: 1984, m: 7, d: 1, h: 12, mi: 0, clock: 'dst' });
  eq(PP.fmt(rt.local), '1984-07-01 11:00', '手動指定夏令時扣 1 小時');
  rt = PP.resolveTime({ ...base, y: 1940, m: 3, d: 1, h: 12, mi: 0 });
  eq([rt.offsetMin, PP.fmt(rt.local)], [540, '1940-03-01 11:00'], '台灣 1937–1945 鐘錶為 UTC+9，換回 UTC+8');
  rt = PP.resolveTime({ ...base, y: 1988, m: 7, d: 1, h: 12, mi: 0, zone: 'Asia/Shanghai', lon: 121.47 });
  eq(rt.shiftMin, -60, '中國大陸 1988 夏令時');
  rt = PP.resolveTime({ ...base, y: 1970, m: 1, d: 1, h: 10, mi: 0, zone: 'Asia/Singapore', lon: 103.82 });
  eq([rt.offsetMin, PP.fmt(rt.instant8)], [450, '1970-01-01 10:30'], '新加坡 1970 為 UTC+7:30');
  rt = PP.resolveTime({ ...base, y: 1984, m: 11, d: 20, h: 14, mi: 0, zone: 'Asia/Tokyo', lon: 139.69, tz: 9 });
  eq(PP.fmt(rt.instant8), '1984-11-20 13:00', '東京 14:00 = UTC+8 的 13:00');
  rt = PP.resolveTime({ ...base, y: 1984, m: 11, d: 20, h: 14, mi: 0, useTST: true });
  ok(Math.abs(rt.lonMin - 6.24) < 0.01 && Math.abs(rt.eotMin - 14.2) < 1, `台北真太陽時修正（經度 ${rt.lonMin.toFixed(1)}、均時差 ${rt.eotMin.toFixed(1)}）`);
  eq(PP.fmt(rt.local), '1984-11-20 14:20', '台北 14:00 的真太陽時');
  rt = PP.resolveTime({ ...base, y: 1955, m: 7, d: 1, h: 12, mi: 0, useTST: true });
  eq(PP.toMs(rt.local), Date.UTC(1955, 6, 1, 11, 0) + Math.round(rt.lonMin + rt.eotMin) * 6e4, '夏令時 + 真太陽時：先扣回標準時，再加經度與均時差');
  ok(Math.abs(rt.eotMin - -3.7) < 1, `7/1 均時差 ${rt.eotMin.toFixed(1)}，曆書約 -3.7`);
  rt = PP.resolveTime({ ...base, y: 1984, m: 11, d: 20, h: 14, mi: 0, zone: 'No/Such_Zone' });
  ok(rt.zoneFailed && rt.shiftMin === 0, '時區資料查不到時退回標準時並標記');
  // 均時差對照曆書值（分鐘，容許 ±1）
  for (const [m, d, want] of [[2, 11, -14.2], [4, 15, 0], [5, 14, 3.7], [7, 26, -6.5], [11, 3, 16.4], [12, 25, 0]]) {
    const e = PP.equationOfTime({ y: 2001, m, d, h: 4, mi: 0 });
    ok(Math.abs(e - want) < 1, `均時差 ${m}/${d}：${e.toFixed(1)}，曆書約 ${want}`);
  }
  eq([PP.resolveTime({ ...base, y: 2000, m: 1, d: 1, h: 13, mi: 4 }).toBoundary, PP.resolveTime({ ...base, y: 2000, m: 1, d: 1, h: 0, mi: 50 }).toBoundary], [4, 10], '距時辰交界分鐘數');
  // 不合理的輸入要拋出給使用者看的錯誤，不可靜默算下去
  const rejects = o => { try { PP.resolveTime({ ...base, y: 2001, m: 2, d: 3, h: 5, mi: 0, ...o }); return false; } catch (e) { return e.user === true; } };
  eq([rejects({ d: 30 }), rejects({ m: 13 }), rejects({ h: 24 }), rejects({ mi: 60 }), rejects({ h: 5.5 }), rejects({ tz: undefined }), rejects({ tz: 15 }), rejects({ useTST: true, lon: NaN }), rejects({ y: 2001.5 })],
    [true, true, true, true, true, true, true, true, true], '不存在的日期、時間、時區、經度都被擋下');
  eq([rejects({}), rejects({ y: 2000, d: 29 }), rejects({ lon: undefined })], [false, false, false], '合理輸入不誤擋（含閏年 2/29；不校正真太陽時就不需要經度）');

  // 錯誤訊息：user 為 true 的回傳訊息文字，其他例外回傳「類別名稱: 訊息」，沒有丟例外回傳 null
  const why = fn => { try { fn(); return null; } catch (e) { return e.user === true ? e.message : `${e.constructor.name}: ${e.message}`; } };
  const solar = o => why(() => PP.resolveTime({ ...base, y: 2001, m: 2, d: 3, h: 5, mi: 0, ...o }));
  const lunar = o => why(() => PP.resolveTime({ ...base, calendar: 'lunar', ly: 1984, lm: 10, ld: 3, leap: false, h: 5, mi: 0, ...o }));
  // 可排的範圍是公曆 1900 到 2100 年，公曆、農曆兩種輸入一致
  eq([solar({ y: 1900, m: 1, d: 1 }), solar({ y: 2100, m: 12, d: 31 }), solar({ y: 1899, m: 12, d: 31 }), solar({ y: 2101, m: 1, d: 1 }), solar({ y: 50 }), solar({ y: 10000 })],
    [null, null, '出生日期要在公曆 1900 到 2100 年之間。', '出生日期要在公曆 1900 到 2100 年之間。', '出生日期要在公曆 1900 到 2100 年之間。', '出生日期要在公曆 1900 到 2100 年之間。'], '公曆：1900-01-01 到 2100-12-31 可排，之外報錯（太早、太晚的年份不再說成「沒有這一天」）');
  eq([lunar({ ly: 1899, lm: 12, ld: 1 }), lunar({ ly: 1899, lm: 11, ld: 29 }), lunar({ ly: 2100, lm: 11, ld: 1 }), lunar({ ly: 2100, lm: 12, ld: 10 }), lunar({ ly: 1898, lm: 12, ld: 1 }), lunar({ ly: 2101, lm: 1, ld: 1 }), lunar({ ly: 50, lm: 1, ld: 1 })],
    [null, '農曆這一天是公曆 1899 年 12 月 31 日，超出可排的範圍（公曆 1900 到 2100 年）。', null, '農曆這一天是公曆 2101 年 1 月 9 日，超出可排的範圍（公曆 1900 到 2100 年）。',
      '農曆 1898 年超出可排的範圍（公曆 1900 到 2100 年）。', '農曆 2101 年超出可排的範圍（公曆 1900 到 2100 年）。', '農曆 50 年超出可排的範圍（公曆 1900 到 2100 年）。'],
    '農曆：範圍看換成公曆之後。1899 年十二月初一是公曆 1900-01-01，可排；2100 年十二月初十已是公曆 2101 年，不可排');
  eq(PP.fmt(PP.resolveTime({ ...base, calendar: 'lunar', ly: 1899, lm: 12, ld: 15, leap: false, h: 12, mi: 0 }).clock), '1900-01-15 12:00', '農曆 1899 年十二月十五 = 公曆 1900-01-15');
  // 農曆年月日要是整數：函式庫會把字串轉成數字、把負的月份當成閏月，不擋就會靜默排成別的日子
  const NO = '農曆 1984 年 10 月沒有第 3 天。';
  eq([lunar({ lm: -10 }), lunar({ lm: -10, leap: true }), lunar({ lm: '10', leap: true }), lunar({ lm: '10' }), lunar({ ld: '3' }), lunar({ ly: '1984' }), lunar({ ld: 3.5 }), lunar({ lm: 0 }), lunar({ lm: 13 }), lunar({ ld: 0 }), lunar({ ld: 31 }), lunar({ ly: 1984.5 }), lunar({ ly: NaN })],
    ['農曆 1984 年 -10 月沒有第 3 天。', '農曆 1984 年沒有閏 -10 月，或該月沒有第 3 天。', '農曆 1984 年沒有閏 10 月，或該月沒有第 3 天。', NO, NO, NO, '農曆 1984 年 10 月沒有第 3.5 天。',
      '農曆 1984 年 0 月沒有第 3 天。', '農曆 1984 年 13 月沒有第 3 天。', '農曆 1984 年 10 月沒有第 0 天。', '農曆 1984 年 10 月沒有第 31 天。', '農曆 1984.5 年 10 月沒有第 3 天。', '農曆 NaN 年 10 月沒有第 3 天。'],
    '農曆的年、月、日不是範圍內的整數時報錯（負的月份、字串、小數、0、超過上限）');
  eq([lunar({}), lunar({ leap: true }), lunar({ lm: 5, ld: 30 }), lunar({ lm: 5, ld: 3, leap: true })],
    [null, null, '農曆 1984 年 5 月沒有第 30 天。', '農曆 1984 年沒有閏 5 月，或該月沒有第 3 天。'], '農曆：1984 年有閏十月；五月是小月沒有三十、也沒有閏五月');
  // 函式庫沒載入是另一回事：不可以說成「農曆沒有這一天」
  const keep = globalThis.Lunar; delete globalThis.Lunar;
  const missing = lunar({});
  globalThis.Lunar = keep;
  ok(missing !== null && missing.startsWith('ReferenceError'), `函式庫沒載入時，農曆輸入丟出的是原本的 ReferenceError，不是給使用者看的「沒有這一天」：${missing}`);
  // 性別沒有預設值：八字和紫微用同一個標準，不可以各自解讀
  const withGender = (g, fn) => why(() => { const inp = { ...base, y: 1984, m: 11, d: 20, h: 14, mi: 0, gender: g }; fn(inp, PP.resolveTime(inp)); });
  eq([withGender('男', PP.bazi), withGender('女', PP.ziwei), withGender('male', PP.bazi), withGender('male', PP.ziwei), withGender(undefined, PP.bazi), withGender(undefined, PP.ziwei)],
    [null, null, '性別請填「男」或「女」。', '性別請填「男」或「女」。', '性別請填「男」或「女」。', '性別請填「男」或「女」。'], '性別不是「男」「女」時，八字和紫微都報錯');
}

/* 時區轉換點：auto 模式在每個歷史轉換點前後都要查得對。
   鐘錶往回撥時，有一段鐘面時間當天出現兩次；往前撥時，有一段鐘面時間不存在。
   這裡用另一種做法求答案：把轉換前後的兩個偏移都拿來讀這個鐘面時間，看哪幾個讀得通。 */
section('時區資料查詢（九個內建時區、1900–2100 所有轉換點前後 4 小時）');
{
  const zones = { 'Asia/Taipei': 8, 'Asia/Shanghai': 8, 'Asia/Hong_Kong': 8, 'Asia/Macau': 8, 'Asia/Singapore': 8, 'Asia/Kuala_Lumpur': 8, 'Asia/Manila': 8, 'Asia/Tokyo': 9, 'Asia/Seoul': 9 };
  const MIN = 6e4, near = (a, b) => Math.abs(a - b) < 1e-9;
  let wrong = 0, checked = 0, trans = 0, twice = 0, never = 0, flags = 0; const firstWrong = [];
  for (const [zone, tz] of Object.entries(zones)) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const at = ms => { const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = Number(x.value); }); return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ms) / MIN; };
    let prev = at(Date.UTC(1900, 0, 1));
    for (let t = Date.UTC(1900, 0, 1); t < Date.UTC(2101, 0, 1); t += 6 * 3600e3) { // 每 6 小時掃一次找轉換點，再往回細找到小時
      const o = at(t);
      if (o === prev) continue;
      let t0 = t - 6 * 3600e3; while (at(t0 + 3600e3) === prev) t0 += 3600e3;
      trans++;
      const from = Math.floor((t0 + Math.min(prev, o) * MIN - 4 * 3600e3) / MIN) * MIN; // 鐘面時間取在整分鐘上
      for (let w = from; w <= t0 + Math.max(prev, o) * MIN + 5 * 3600e3; w += 20 * MIN) { // w：牆上時間
        const good = [prev, o].filter(c => near(at(w - c * MIN), c)); // 與該鐘點自洽的偏移；0 個是不存在的鐘點，2 個是出現兩次的鐘點
        const got = PP.zoneOffset(zone, w); checked++;
        // 出現兩次取後一次（偏移小的那個），不存在取撥動之前的偏移
        const want = good.length === 2 ? Math.min(prev, o) : good.length === 1 ? good[0] : prev;
        if (!near(got, want)) { wrong++; if (firstWrong.length < 3) firstWrong.push(`${zone} ${new Date(w).toISOString().slice(0, 16)} 得到 ${got}，應為 ${want}`); }
        if (good.length === 2) twice++; else if (!good.length) never++;
        // resolveTime 要把這兩種情況標出來（只測可排的年份）
        const c = PP.fromMs(w);
        if (c.y < 1900 || c.y > 2100) continue;
        const rt = PP.resolveTime({ ...base, ...c, zone, tz });
        const alt = good.length === 2 ? Math.max(prev, o) : null;
        if (!near(rt.offsetMin, want) || rt.skipped !== (good.length === 0) || (alt === null ? rt.altOffsetMin !== null : !near(rt.altOffsetMin, alt))) { flags++; if (firstWrong.length < 3) firstWrong.push(`${zone} ${PP.fmt(c)} 標記不對：offset ${rt.offsetMin} alt ${rt.altOffsetMin} skipped ${rt.skipped}`); }
      }
      prev = o;
    }
  }
  ok(trans > 200 && wrong === 0, `${trans} 個轉換點、${checked} 個鐘點中有 ${wrong} 個查錯${firstWrong.length ? '：' + firstWrong.join('；') : ''}`);
  ok(twice > 300 && never > 300 && flags === 0, `出現兩次的鐘點 ${twice} 個、不存在的鐘點 ${never} 個；resolveTime 的 altOffsetMin、skipped 標錯 ${flags} 個`);
  // 台灣最後一次夏令時間（1975）：9 月 30 日 24:00 撥回 23:00，4 月 1 日 00:00 撥到 01:00
  const tw = o => { const rt = PP.resolveTime({ ...base, y: 1975, mi: 30, ...o }); return [rt.offsetMin, rt.altOffsetMin, rt.skipped, PP.fmt(rt.local)]; };
  eq([tw({ m: 9, d: 30, h: 23 }), tw({ m: 9, d: 30, h: 22 }), tw({ m: 4, d: 1, h: 0 }), tw({ m: 4, d: 1, h: 1 })],
    [[480, 540, false, '1975-09-30 23:30'], [540, null, false, '1975-09-30 21:30'], [480, null, true, '1975-04-01 00:30'], [540, null, false, '1975-04-01 00:30']],
    '台北 1975：9/30 23:30 出現兩次（取標準時那一次，另一次 UTC+9）；4/1 00:30 不存在（當作撥動之前的 UTC+8）');
  eq([tw({ m: 9, d: 30, h: 23, clock: 'dst' }), tw({ m: 9, d: 30, h: 23, clock: 'std' })], [[540, null, false, '1975-09-30 22:30'], [480, null, false, '1975-09-30 23:30']], '手動模式不查時區資料，兩個標記都不會有');
  // 新加坡 1945-09-11：UTC+9 撥回 UTC+7:30，22:30–24:00 出現兩次。以前前半小時取到前一次、後一小時取到後一次，現在一律取後一次
  const sg = (h, mi) => { const rt = PP.resolveTime({ ...base, y: 1945, m: 9, d: 11, h, mi, zone: 'Asia/Singapore' }); return [rt.offsetMin, rt.altOffsetMin]; };
  eq([sg(22, 40), sg(23, 10), sg(22, 20)], [[450, 540], [450, 540], [540, null]], '新加坡 1945-09-11 重複的 90 分鐘一律取後一次（UTC+7:30）');
  // 早年的地方平時帶秒數（新加坡 1905 年以前是 UTC+6:55:25），不可以因為小數而被當成不存在的鐘點
  const lmt = PP.resolveTime({ ...base, y: 1902, m: 5, d: 5, h: 10, mi: 0, zone: 'Asia/Singapore' });
  ok(Math.abs(lmt.offsetMin - (6 * 60 + 55 + 25 / 60)) < 1e-9 && lmt.skipped === false && lmt.altOffsetMin === null, `帶秒數的偏移（新加坡 1902 年 ${lmt.offsetMin} 分）照常查得到，不誤標`);
}

finish();
