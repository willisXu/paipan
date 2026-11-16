/* 命主資訊區：出生與排盤用時、農曆、節氣位置，以及要提醒使用者複核的事項。 */
import { fmt, pad, SHICHEN, WX, wxOf, yinyang } from '../engine/index.js';
import { $, esc } from './dom.js';
import { S } from './state.js';
import { dur, fmtOff, isSample, nameOf, placeLabel, usedNotes } from './format.js';

export function renderSummary() {
  const { inp, rt, bz, zw } = S;
  const warns = [];
  if (rt.shiftMin && rt.zoneUsed) warns.push(`時區資料顯示，${esc(placeLabel(inp))}在這個時間點的鐘錶是 ${fmtOff(rt.offsetMin)}（夏令時間，或當時的標準時與現在不同），和現行 ${fmtOff(rt.nominalMin)} 差 ${Math.abs(Math.round(rt.shiftMin))} 分鐘，排盤已換算成現行標準時。出生證明、戶籍上寫的是當時鐘錶的時間，維持自動即可；只有手上的時間已經被人換算成現行標準時，才把「夏令時間」改成手動。`);
  if (rt.zoneFailed) warns.push('這個瀏覽器查不到時區歷史資料，已當作標準時處理。若出生時正值夏令時間，請把「夏令時間」改成手動。');
  if (inp.zone === 'Asia/Shanghai' && rt.clock.y < 1950 && inp.clock === 'auto') warns.push('1949 年以前中國各地時區不一，時區資料只有上海一套。上海以外的城市請改用「自訂經度與時區」，自己填當時當地的時區。');
  if (bz.jie.near) { const j = bz.jie.sincePrev < 1 ? bz.jie.prev : bz.jie.next; warns.push(`出生時間離${j.name}交節（${fmt(j.t)}，UTC+8）不到一天。出生時間稍有誤差，${j.name === '立春' ? '年柱、月柱和大運順逆' : '月柱'}就可能不同，請用當年節氣表和確切出生時刻複核。`); }
  if (rt.toBoundary <= 10) {
    const t = `${pad(rt.local.h)}:${pad(rt.local.mi)}`;
    warns.push((rt.toBoundary === 0 ? `排盤用時 ${t} 正好是${SHICHEN[rt.hourIndex]}時的起點。` : `排盤用時 ${t} 離時辰交界只有 ${rt.toBoundary} 分鐘。`) + '出生時間差幾分鐘，或改變真太陽時的設定，時柱和紫微命宮就會不同。');
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
        <div><dt>節氣位置</dt><dd>${bz.jie.prev.name}後 ${dur(bz.jie.sincePrev)}，距${bz.jie.next.name} ${dur(bz.jie.toNext)}<small>${bz.jie.prev.name}交節 ${fmt(bz.jie.prev.t)}（UTC+8）</small></dd></div>
      </dl>
      ${warns.map(w => `<div class="warn" role="note">${w}</div>`).join('')}`;
}
