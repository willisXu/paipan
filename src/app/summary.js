/* 命主資訊區：出生與排盤用時、農曆、節氣位置，以及要提醒使用者複核的事項。 */
import { fmt, pad, SHICHEN, toMs, WX, wxOf, yinyang } from '../engine/index.js';
import { $, esc } from './dom.js';
import { S } from './state.js';
import { dur, fmtOff, isSample, jieTime, nameOf, placeLabel, usedNotes } from './format.js';

export function renderSummary() {
  const { inp, rt, bz, zw } = S;
  const warns = [];
  if (rt.shiftMin && rt.zoneUsed) warns.push(`時區資料顯示，${esc(placeLabel(inp))}在這個時間點的鐘錶是 ${fmtOff(rt.offsetMin)}（夏令時間，或當時的標準時與現在不同），和現行 ${fmtOff(rt.nominalMin)} 差 ${Math.abs(Math.round(rt.shiftMin))} 分鐘，排盤已換算成現行標準時。出生證明、戶籍上寫的是當時鐘錶的時間，維持自動即可；只有手上的時間已經被人換算成現行標準時，才把「夏令時間」改成手動。`);
  // 鐘錶往回撥的那一段，同一個鐘面時間當天有兩次；引擎取後一次，前一次要請使用者自己指定
  if (rt.altOffsetMin !== null) {
    warns.push(`這個鐘面時間在當天出現過兩次（鐘錶往回撥，例如夏令時間結束）：前一次是 ${fmtOff(rt.altOffsetMin)}，後一次是 ${fmtOff(rt.offsetMin)}。目前當作後一次排盤。如果出生在前一次，${
      rt.altOffsetMin === rt.nominalMin + 60 ? '請把「夏令時間」改成「手動：減 1 小時」' : '請自己換算成現行標準時再填，並把「夏令時間」改成「手動：已是現行標準時」'}。`);
  }
  if (rt.skipped) warns.push(`這個鐘面時間在當天不存在：鐘錶直接往前撥過去了（例如夏令時間開始）。目前當作撥動之前的 ${fmtOff(rt.offsetMin)} 排盤，請確認出生時間。`);
  if (rt.zoneFailed) warns.push('這個瀏覽器查不到時區歷史資料，已當作標準時處理。若出生時正值夏令時間，請把「夏令時間」改成手動。');
  if (inp.zone === 'Asia/Shanghai' && rt.clock.y < 1950 && inp.clock === 'auto') warns.push('1949 年以前中國各地時區不一，時區資料只有上海一套。上海以外的城市請改用「自訂經度與時區」，自己填當時當地的時區。');
  // 金門、馬祖查的是台北的時區資料；1949 年以前兩地不在台灣的時制之下，換算出來的差不一定適用
  if (['金門', '馬祖南竿'].includes(inp.place) && rt.clock.y < 1950 && rt.shiftMin && rt.zoneUsed) warns.push(`${inp.place}查的是台北的時區資料。1949 年以前，當地的鐘錶不一定和台灣本島相同，上面的換算請自行查證；不適用的話，請把「夏令時間」改成手動。`);
  if (bz.jie.near) {
    const after = bz.jie.sincePrev < 1, j = after ? bz.jie.prev : bz.jie.next;
    const what = j.name === '立春' ? '年柱、月柱和大運順逆' : '月柱';
    // 出生時間只到分：和交節落在同一分鐘時分不出先後，引擎把出生時間當作那一分鐘的 0 秒
    const sameMinute = toMs(rt.instant8) === toMs(j.t);
    warns.push(`出生時間離${j.name}交節（${jieTime(j)}，UTC+8）不到一天。${sameMinute ? `出生和交節在同一分鐘，先後分不出來；目前當作交節之${after ? '後' : '前'}排盤，差幾秒${what}就不同` : `出生時間稍有誤差，${what}就可能不同`}，請用當年節氣表和確切出生時刻複核。`);
  }
  const mins = rt.local.h * 60 + rt.local.mi, t = `${pad(rt.local.h)}:${pad(rt.local.mi)}`;
  if (rt.toBoundary <= 10) {
    // 23:00 這個交界在「換日換柱」的立場下同時是換日的時刻
    const dayToo = inp.ziRule !== 'same' && Math.abs(mins - 23 * 60) <= 10;
    warns.push((rt.toBoundary === 0 ? `排盤用時 ${t} 正好是${SHICHEN[rt.hourIndex]}時的起點。` : `排盤用時 ${t} 離時辰交界只有 ${rt.toBoundary} 分鐘。`) +
      `出生時間差幾分鐘，或改變真太陽時的設定，${dayToo ? '日柱、時柱和紫微命盤' : '時柱和紫微命宮'}就會不同${dayToo ? '（23:00 同時是換日的時刻）' : ''}。`);
  }
  // 「夜子時不換日」的立場下，日柱和紫微的起盤日在午夜才換
  const toMidnight = Math.min(mins, 1440 - mins);
  if (inp.ziRule === 'same' && toMidnight <= 10) {
    warns.push((toMidnight === 0 ? `排盤用時 ${t} 正好是午夜。` : `排盤用時 ${t} 離午夜只有 ${toMidnight} 分鐘。`) + '採「夜子時不換日」時，日柱和紫微的起盤日在午夜才換；出生時間差幾分鐘，或改變真太陽時的設定，日柱和紫微命盤就會不同。');
  }
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
      ${warns.map(w => `<div class="warn" role="note">${w}</div>`).join('')}`;
}
