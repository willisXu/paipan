/* 曆法：函式庫的節氣時刻與農曆資料對照外部來源抽查，以及農曆輸入（閏月、大小月、來回換算）。
   執行：node test/engine/calendar.test.js */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { base } from '../helpers/charts.js';

const { rndBirth } = seeded(2026111102);

/* 曆法抽查：對照外部來源 */
section('節氣時刻與農曆抽查');
{
  const lichun = y => { const j = Solar.fromYmd(y, 2, 10).getLunar().getPrevJie(), s = j.getSolar(); return [j.getName(), Date.UTC(s.getYear(), s.getMonth() - 1, s.getDay(), s.getHour(), s.getMinute())]; };
  // 2026 立春：台灣媒體報導為 2/4 04:01:51；2025 立春：日本國立天文台曆要項為 2/3 23:10 JST
  for (const [y, mo, d, h, mi] of [[2024, 2, 4, 16, 27], [2025, 2, 3, 22, 10], [2026, 2, 4, 4, 2]]) {
    const [name, t] = lichun(y);
    ok(name === '立春' && Math.abs(t - Date.UTC(y, mo - 1, d, h, mi)) <= 2 * 6e4, `${y} 立春應為 ${mo}/${d} ${h}:${String(mi).padStart(2, '0')}（UTC+8），函式庫為 ${new Date(t).toISOString().slice(5, 16)}`);
  }
  // 2025 立冬：日本國立天文台曆要項為 11/7 13:04 JST，即 UTC+8 的 12:04
  { const s = Solar.fromYmd(2025, 11, 20).getLunar().getPrevJie().getSolar(); eq([s.getMonth(), s.getDay(), s.getHour(), s.getMinute()], [11, 7, 12, 4], '2025 立冬'); }
  eq([2024, 2025, 2026].map(y => Lunar.fromYmd(y, 1, 1).getSolar().toYmd()), ['2024-02-10', '2025-01-29', '2026-02-17'], '春節日期');
  eq([2023, 2025].map(y => LunarYear.fromYear(y).getLeapMonth()), [2, 6], '閏月（2023 閏二月、2025 閏六月）');
}

/* 農曆輸入 */
section('農曆輸入');
{
  const lunar = o => PP.resolveTime({ ...base, calendar: 'lunar', h: 14, mi: 0, leap: false, ...o });
  eq(PP.fmt(lunar({ ly: 1984, lm: 10, ld: 28 }).clock), '1984-11-20 14:00', '甲子年十月廿八');
  eq(PP.fmt(lunar({ ly: 1984, lm: 10, ld: 3, leap: true }).clock), '1984-11-25 14:00', '甲子年閏十月初三');
  eq(PP.fmt(lunar({ ly: 2023, lm: 2, ld: 10, leap: true }).clock), '2023-03-31 14:00', '癸卯年閏二月初十');
  const throws = o => { try { lunar(o); return false; } catch (e) { return e.user === true && /農曆/.test(e.message); } };
  ok(throws({ ly: 1984, lm: 5, ld: 3, leap: true }), '不存在的閏月要報錯');
  // 甲子年閏十月為小月（11-23 至 12-21，29 天）
  eq([Solar.fromYmd(1984, 12, 21).getLunar().getMonth(), Solar.fromYmd(1984, 12, 21).getLunar().getDay(), Solar.fromYmd(1984, 12, 22).getLunar().getDay()], [-10, 29, 1], '前提：甲子年閏十月只有 29 天');
  ok(throws({ ly: 1984, lm: 10, ld: 30, leap: true }), '小月沒有三十要報錯');
  ok(!throws({ ly: 1984, lm: 10, ld: 29, leap: true }), '小月廿九可排');
  ok(throws({ ly: 1984, lm: 13, ld: 1 }) && throws({ ly: 1984, lm: 1, ld: 0 }) && throws({ ly: NaN, lm: 1, ld: 1 }), '不合理的農曆月、日、年要報錯');
  let rtBad = 0;
  for (let k = 0; k < 3000; k++) { // 公曆 → 農曆 → 公曆 應回到同一天
    const b = rndBirth(1901, 2099), l = Solar.fromYmd(b.y, b.m, b.d).getLunar();
    const c = lunar({ ly: l.getYear(), lm: Math.abs(l.getMonth()), ld: l.getDay(), leap: l.getMonth() < 0 }).clock;
    if (c.y !== b.y || c.m !== b.m || c.d !== b.d) rtBad++;
  }
  ok(rtBad === 0, `農曆輸入來回 3,000 組，${rtBad} 組回不到原日`);
}

finish();
