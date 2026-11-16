/* 文字盤：把目前的盤排成純文字，以及「複製文字盤」按鈕。 */
import { fmt, SHICHEN, yinyang } from '../engine/index.js';
import { $, toast } from './dom.js';
import { S } from './state.js';
import { dur, fmtOff, nameOf, placeLabel, usedNotes } from './format.js';

function textChart() {
  const { inp, rt, bz, zw, c } = S, ps = bz.pillars, lines = [];
  lines.push(`【八字】${nameOf(inp)}\u3000${bz.male ? '乾造' : '坤造'}`);
  lines.push(`出生：${fmt(rt.clock)}（${placeLabel(inp)}，當時鐘錶 ${fmtOff(rt.offsetMin)}）`);
  lines.push(`排盤用時：${fmt(rt.local)} ${SHICHEN[rt.hourIndex]}時（${usedNotes(inp, rt).join('；')}）`);
  lines.push(`農曆：${bz.lunarText}\u3000節氣：${bz.jie.prev.name}後 ${dur(bz.jie.sincePrev)}`);
  lines.push(`四柱：${ps.map(p => p.pos + ' ' + p.gan + p.zhi).join('\u3000')}`);
  lines.push(`十神：${ps.map(p => p.ganGod).join('\u3000')}`);
  lines.push(`藏干：${ps.map(p => p.zhi + '[' + p.cang.map(x => x.gan + x.god).join(' ') + ']').join('\u3000')}`);
  lines.push(`星運：${ps.map(p => p.star).join('\u3000')}`);
  lines.push(`納音：${ps.map(p => p.nayin).join('\u3000')}`);
  lines.push(`旺衰觀察：${bz.strength.dm}生${bz.strength.month}月處${bz.strength.ling}；通根 ${bz.strength.roots.map(r => r.pos + '支' + r.zhi).join('、') || '無'}`);
  lines.push(`干支關係：${bz.relations.map(r => `${r.text}（${[...r.where].join('×')}，${r.tag}）`).join('；') || '無'}`);
  lines.push(`大運：${yinyang(bz.P[0].gan)}${bz.male ? '男' : '女'}${bz.forward ? '順行' : '逆行'}，出生後 ${bz.yun.y} 年 ${bz.yun.m} 個月 ${bz.yun.d} 天起運，約 ${bz.yun.date} 交運`);
  lines.push('  ' + bz.dayun.map(d => `${d.gz} ${d.startYear}（${d.startAge} 歲）`).join('\u3000'));
  lines.push('');
  const ming = c.palaces.find(p => p.name === '命宮');
  lines.push(`【紫微斗數】${c.fiveElementsClass}\u3000命主 ${c.soul}\u3000身主 ${c.body}\u3000命宮 ${ming.heavenlyStem}${ming.earthlyBranch}\u3000身宮在${c.palaces.find(p => p.isBodyPalace).name}`);
  lines.push(`起盤：${zw.dateUsed} ${SHICHEN[rt.hourIndex]}時\u3000農曆 ${zw.lunarText}\u3000生年 ${c.rawDates.chineseDate.yearly.join('')}`);
  const f = s => s.name + (s.brightness || '') + (s.mutagen ? '化' + s.mutagen : '');
  [...c.palaces].sort((a, b) => ((a.index - ming.index + 12) % 12) - ((b.index - ming.index + 12) % 12)).forEach(p => {
    lines.push(`${p.name}${p.isBodyPalace ? '(身)' : ''} ${p.heavenlyStem}${p.earthlyBranch}［${p.decadal.range[0]}–${p.decadal.range[1]}］：${p.majorStars.map(f).join(' ') || '無主星'}｜${p.minorStars.map(f).join(' ') || '—'}｜${p.adjectiveStars.map(s => s.name).join(' ') || '—'}`);
  });
  return lines.join('\n');
}

export function initTextChart() {
  $('#copy').addEventListener('click', () => {
    if (!S.bz) return;
    const text = textChart(), box = $('#copyfallback');
    const fallback = () => { // 有些檢視不允許寫剪貼簿：改成選取文字，讓使用者自己按複製
      box.hidden = false;
      box.innerHTML = '<p class="note" style="margin:0 0 6px">這個檢視不允許直接寫入剪貼簿。文字已選取，請按 Ctrl/⌘ + C 複製。</p><textarea class="copybox" id="copytext" readonly aria-label="文字盤"></textarea>';
      const ta = $('#copytext'); ta.value = text; ta.focus(); ta.select();
    };
    try { navigator.clipboard.writeText(text).then(() => { box.hidden = true; toast('文字盤已複製'); }, fallback); } catch (e) { fallback(); }
  });
}
