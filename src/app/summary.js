/* 命主資訊區：出生與排盤用時、農曆、節氣位置，以及要提醒使用者複核的事項。 */
import { fmt, pad, SHICHEN, toMs, WX, wxOf, yearGZ, yinyang, zoneDataCheck } from '../engine/index.js';
import { $, esc } from './dom.js';
import { LM } from './places.js';
import { S } from './state.js';
import { dur, fmtOff, isSample, jieTime, nameOf, placeLabel, usedNotes } from './format.js';

/* 坊間流傳的台灣夏令時間表，把民國 34 到 40 年一律寫成 5 月 1 日到 9 月 30 日；時區資料庫依據的是當年的公報
   （1945 年台灣還在日治，9 月 21 日由 UTC+9 改回 UTC+8，沒有實施夏令時間；1946 年 5 月 15 日開始；1947 年 4 月 15 日到 10 月 31 日）。
   下面是兩邊說法不同的日子：照那張表排的命盤，在這幾段會和本頁差一小時。 */
const TW_TABLE_DIFFERS = [['1945-09-21', '1945-09-30'], ['1946-05-01', '1946-05-14'], ['1947-04-15', '1947-04-30'], ['1947-10-01', '1947-10-31']];
const NOT_TAIWAN_THEN = ['金門', '馬祖南竿']; // 現在用台灣的時間，但 1945 年以前不屬日治台灣

/**
 * 要提醒使用者複核的事項。命主資訊區和文字盤共用，所以回傳純文字，一則一句完整的話。
 * @param {{inp: object, rt: object, bz: object, zw: object}} chart 一張排好的盤（共用狀態 S 的形狀）
 * @returns {string[]}
 */
export function warningsOf({ inp, rt, bz, zw }) {
  const warns = [];
  const day = `${rt.clock.y}-${pad(rt.clock.m)}-${pad(rt.clock.d)}`; // 出生日期（當地鐘錶），拿來和日期字串比先後
  if (rt.shiftMin && rt.zoneUsed) warns.push(`時區資料顯示，${placeLabel(inp)}在這個時間點的鐘錶是 ${fmtOff(rt.offsetMin)}（夏令時間，或當時的標準時與現在不同），和現行 ${fmtOff(rt.nominalMin)} 差 ${Math.abs(Math.round(rt.shiftMin))} 分鐘，排盤已換算成現行標準時。出生證明、戶籍上寫的是當時鐘錶的時間，維持自動即可；只有手上的時間已經被人換算成現行標準時，才把「夏令時間」改成手動。`);
  // 鐘錶往回撥的那一段，同一個鐘面時間當天有兩次；引擎取後一次，前一次要請使用者自己指定
  if (rt.altOffsetMin !== null) {
    warns.push(`這個鐘面時間在當天出現過兩次（鐘錶往回撥，例如夏令時間結束）：前一次是 ${fmtOff(rt.altOffsetMin)}，後一次是 ${fmtOff(rt.offsetMin)}。目前當作後一次排盤。如果出生在前一次，${
      rt.altOffsetMin === rt.nominalMin + 60 ? '請把「夏令時間」改成「手動：減 1 小時」' : '請自己換算成現行標準時再填，並把「夏令時間」改成「手動：已是現行標準時」'}。`);
  }
  if (rt.skipped) warns.push(`這個鐘面時間在當天不存在：鐘錶直接往前撥過去了（例如夏令時間開始）。目前當作撥動之前的 ${fmtOff(rt.offsetMin)} 排盤，請確認出生時間。`);
  if (rt.zoneFailed) warns.push('這個瀏覽器查不到時區歷史資料，已當作標準時處理。若出生時正值夏令時間，請把「夏令時間」改成手動。');
  // 查得到、但內容不對（只帶現行規則的瀏覽器會安靜地回傳現在的時差）：自動換算靠不住。只問這張盤用到的那個時區，幾乎不花時間
  const zoneIssues = rt.zoneUsed ? zoneDataCheck(rt.zoneUsed) : [];
  if (zoneIssues.length) warns.push(`這個瀏覽器內建的時區歷史資料不完整（${zoneIssues.join('、')}對不上），夏令時間和歷史時區的自動換算可能不對。請換一個瀏覽器，或把「夏令時間」改成手動、自己換算。`);
  if (inp.zone === 'Asia/Shanghai' && rt.clock.y < 1950 && inp.clock === 'auto') warns.push('1949 年以前中國各地時區不一，時區資料只有上海一套。上海以外的城市請改用「自訂經度與時區」，自己填當時當地的時區。');
  const taipei = rt.zoneUsed === 'Asia/Taipei';
  if (taipei && NOT_TAIWAN_THEN.includes(inp.place) && day >= '1937-10-01' && day <= '1945-09-30') {
    // 金門、馬祖查的是台北的時區資料。台灣改用 UTC+9 的那幾年（1937 年 10 月到 1945 年 9 月），兩地的鐘錶不一定跟著台灣走
    warns.push(`${inp.place}查的是台北的時區資料。1937 到 1945 年台灣用的是日本的中央標準時（UTC+9），${inp.place}當時不屬台灣，鐘錶不一定相同。這段期間本頁的換算不一定適用，請自行查證；不適用的話，請把「夏令時間」改成手動。`);
  } else if (taipei && TW_TABLE_DIFFERS.some(([from, to]) => day >= from && day <= to)) {
    warns.push(`這一天的夏令時間有兩種說法。坊間流傳的台灣夏令時間表，把民國 34 到 40 年都寫成 5 月 1 日到 9 月 30 日；時區資料依據的是當年的公報：1945 年台灣沒有實施，1946 年從 5 月 15 日開始，1947 年是 4 月 15 日到 10 月 31 日。本頁照公報，這一天${
      rt.shiftMin ? '算夏令時間、已經減一小時' : '不算夏令時間、沒有減一小時'}；照那張表排的命盤，會和這裡差一小時。`);
  }
  if (bz.jie.near) {
    const after = bz.jie.sincePrev < 1, j = after ? bz.jie.prev : bz.jie.next;
    const what = j.name === '立春' ? '年柱、月柱和大運順逆' : '月柱';
    // 出生時間只到分：和交節落在同一分鐘時分不出先後，引擎把出生時間當作那一分鐘的 0 秒
    const sameMinute = toMs(rt.instant8) === toMs(j.t);
    warns.push(`出生時間離${j.name}交節（${jieTime(j)}，UTC+8）不到一天。${sameMinute ? `出生和交節在同一分鐘，先後分不出來；目前當作交節之${after ? '後' : '前'}排盤，差幾秒${what}就不同` : `出生時間稍有誤差，${what}就可能不同`}，請用當年節氣表和確切出生時刻複核。`);
  }
  // 紫微的年界設成立春時以日為單位，八字年柱看交節的時刻：出生在立春當天或前後，兩邊的生年可能不同
  if (zw.opts.year === 'lichun' && zw.yearGZ !== bz.gz[0]) {
    warns.push(`紫微的年界設成立春，以「日」為單位：起盤日 ${zw.dateUsed} 算${zw.yearGZ}年。八字年柱看交節的時刻，這個出生時間算${bz.gz[0]}年。兩邊的生年不同，請留意。${
      yearGZ(zw.chart.rawDates.lunarDate.lunarYear) === bz.gz[0] ? `把年界改回「正月初一」，紫微的生年就是${bz.gz[0]}年。` : `這個出生時間，兩種年界都排不出${bz.gz[0]}年的紫微命盤。`}`);
  }
  // 閏月出生：紫微的生月有幾種算法，命宮起在哪裡可能不同
  const ld = zw.chart.rawDates.lunarDate;
  if (ld.isLeap) {
    const mid = zw.opts.leap === 'mid', m = LM[ld.lunarMonth - 1], next = LM[ld.lunarMonth % 12];
    warns.push(`紫微的起盤日在農曆閏${m}。閏月出生的人，生月有幾種算法：目前採「${mid ? '月中分界' : '整個閏月算本月'}」，這一天算${mid && ld.lunarDay > 15 ? next : m}。${
      ld.lunarDay > 15 ? `改成「${mid ? '整個閏月算本月' : '月中分界'}」會算成${mid ? m : next}，命宮和整張盤都不同。` : '十五日以前，這兩種算法排出來的盤相同。'}另有一律算下個月的算法，本頁沒有提供。可以在「紫微斗數流派設定」裡切換。`);
  }
  const mins = rt.local.h * 60 + rt.local.mi, t = `${pad(rt.local.h)}:${pad(rt.local.mi)}`;
  if (rt.toBoundary <= 10) {
    // 23:00 這個交界在「換日換柱」的立場下同時是換日的時刻
    const dayToo = inp.ziRule !== 'same' && Math.abs(mins - 23 * 60) <= 10;
    warns.push((rt.toBoundary === 0 ? `排盤用時 ${t} 正好是${SHICHEN[rt.hourIndex]}時的起點。` : `排盤用時 ${t} 離時辰交界只有 ${rt.toBoundary} 分鐘。`) +
      `出生時間差幾分鐘，或改變真太陽時的設定，${dayToo ? '日柱、時柱和紫微命盤' : '時柱和紫微命宮'}就會不同${dayToo ? '（23:00 同時是換日的時刻）' : ''}。`);
  }
  // 晚子時而且換日：日柱和紫微都算到次日。只知道「子時」的人、習慣當日算的人，最容易在這裡差一天
  if (zw.rolled) {
    const [, m, d] = zw.dateUsed.split('-').map(Number);
    warns.push(`排盤用時在晚子時（23:00 到 24:00）。目前採「23:00 換日換柱」，日柱和紫微都算到次日（${m} 月 ${d} 日）。只知道生在「子時」、不確定是前半夜還是後半夜的人，請留意這裡會差一天；要照當日算，把「子時立場」改成「夜子時不換日」。`);
  }
  // 「夜子時不換日」的立場下，日柱和紫微的起盤日在午夜才換
  const toMidnight = Math.min(mins, 1440 - mins);
  if (inp.ziRule === 'same' && toMidnight <= 10) {
    warns.push((toMidnight === 0 ? `排盤用時 ${t} 正好是午夜。` : `排盤用時 ${t} 離午夜只有 ${toMidnight} 分鐘。`) + '採「夜子時不換日」時，日柱和紫微的起盤日在午夜才換；出生時間差幾分鐘，或改變真太陽時的設定，日柱和紫微命盤就會不同。');
  }
  return warns;
}

// 畫出命主資訊區。回傳提醒的則數（排盤完成時要一併告訴讀屏的使用者）
export function renderSummary() {
  const { inp, rt, bz, zw } = S;
  const warns = warningsOf(S);
  $('#summary').innerHTML = `
      <div class="who">
        <span class="nm">${esc(nameOf(inp))}</span>
        <span class="zao">${bz.male ? '乾造' : '坤造'}</span>
        <span class="muted">${yinyang(bz.P[0].gan)}${bz.male ? '男' : '女'} · 日主${bz.dm}${WX[wxOf(bz.dm)]}</span>
        ${isSample(inp) ? '<span class="badge">教材第 03、10、14–16、18 課用的盤</span>' : ''}
      </div>
      <dl class="facts">
        <div><dt>出生（當地鐘錶）</dt><dd>${fmt(rt.clock)}<small>${esc(placeLabel(inp))} · 當時鐘錶 ${fmtOff(rt.offsetMin)}</small></dd></div>
        <div><dt>排盤用時</dt><dd>${fmt(rt.local)}\u3000${SHICHEN[rt.hourIndex]}時<small>${usedNotes(inp, rt).join('；')}</small></dd></div>
        <div><dt>農曆</dt><dd>${bz.lunarText}\u3000${SHICHEN[rt.hourIndex]}時${zw.rolled ? `<small>紫微以換日後的 ${zw.dateUsed} 子時起盤</small>` : ''}</dd></div>
        <div><dt>節氣位置</dt><dd>${bz.jie.prev.name}後 ${dur(bz.jie.sincePrev)}，距${bz.jie.next.name} ${dur(bz.jie.toNext)}<small>${bz.jie.prev.name}交節 ${jieTime(bz.jie.prev)}（UTC+8）</small></dd></div>
      </dl>
      ${warns.map(w => `<div class="warn" role="note">${esc(w)}</div>`).join('')}`;
  return warns.length;
}
