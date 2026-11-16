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
}

/* 時區轉換點：auto 模式在每個歷史轉換點前後都要查得對 */
section('時區資料查詢（九個內建時區、1900–2100 所有轉換點前後 4 小時）');
{
  const zones = ['Asia/Taipei', 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Manila', 'Asia/Tokyo', 'Asia/Seoul'];
  const MIN = 6e4; let wrong = 0, checked = 0, trans = 0;
  for (const zone of zones) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    const at = ms => { const p = {}; f.formatToParts(new Date(ms)).forEach(x => { p[x.type] = Number(x.value); }); return (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ms) / MIN; };
    let prev = at(Date.UTC(1900, 0, 1));
    for (let t = Date.UTC(1900, 0, 1); t < Date.UTC(2101, 0, 1); t += 6 * 3600e3) { // 每 6 小時掃一次找轉換點，再往回細找到小時
      const o = at(t);
      if (o === prev) continue;
      let t0 = t - 6 * 3600e3; while (at(t0 + 3600e3) === prev) t0 += 3600e3;
      trans++;
      for (let w = t0 + Math.min(prev, o) * MIN - 4 * 3600e3; w <= t0 + Math.max(prev, o) * MIN + 5 * 3600e3; w += 20 * MIN) { // w：牆上時間
        const good = [prev, o].filter(c => Math.abs(at(w - c * MIN) - c) < 1e-9); // 與該鐘點自洽的偏移；0 個是不存在的鐘點
        const got = PP.zoneOffset(zone, w); checked++;
        if (good.length && !good.some(c => Math.abs(c - got) < 1e-9)) wrong++;
      }
      prev = o;
    }
  }
  ok(trans > 200 && wrong === 0, `${trans} 個轉換點、${checked} 個鐘點中有 ${wrong} 個查錯`);
}

finish();
