/* 文字盤：把目前的盤排成純文字，以及「複製文字盤」按鈕。
   textChart() 只讀共用狀態 S、不碰 DOM：頁面的按鈕和命令列（scripts/paipan.js）用的是同一個函式。 */
import { fmt, SHICHEN, yinyang } from '../engine/index.js';
import { $, toast } from './dom.js';
import { S } from './state.js';
import { dur, fmtOff, nameOf, placeLabel, usedNotes, zwOptLabels } from './format.js';
import { warningsOf } from './summary.js';
import { yunSel } from './view-bazi.js';
import { layers } from './view-ziwei.js';

const relText = r => `${r.text}（${[...r.where].join('×')}，${r.tag}）`;
const gods = x => `（干${x.ganGod}、支${x.zhiGod}）`; // 大運、流年、流月的十神：天干一個，地支取本氣一個

/* 八字運限：S.dy、S.ln、S.lm 選到的那一格運、流年、流月，以及它們和原局的關係（和八字分頁的關係列一樣出自 yunSel）。
   頁面的文字盤沒有這一段，命令列加了 --at 才有；atDate 是看的那一天 */
function baziYun(atDate) {
  const { bz } = S, head = `【八字運限】${atDate}`;
  if (S.dy === null) return [head, atDate < bz.pre.startDate ? '這一天還沒出生。' : '這一天已經走完十步大運，沒有可列的運限。'];
  const Y = yunSel(bz, S.dy, S.ln, S.lm), { D, N, M } = Y;
  return [head,
    Y.pre ? `大運 還沒起運，約 ${D.endDate} 起運` : `大運 ${D.gz}${gods(D)}：約 ${D.startDate} 交入、${D.endDate} 交出，${D.startAge}–${D.endAge} 歲`,
    `流年 ${N.year} ${N.gz}${gods(N)}：${N.age} 歲`,
    M ? `流月 ${M.gz}${gods(M)}：${Y.span}` : '流月 這一天正在換流年的交節時刻前後，沒有對應的流月。',
    `${Y.what}與原局（${Y.scope}）：${Y.rels.map(relText).join('；') || Y.none}`];
}

/**
 * 目前的盤（共用狀態 S）排成純文字。頁面的「複製文字盤」不帶參數；
 * 命令列加了 --at 時帶 atDate（那一天，YYYY-MM-DD）：多一段八字運限，紫微那一天不在列出的運限範圍內時也寫一句。
 * @param {{atDate?: string}} [opts]
 * @returns {string}
 */
export function textChart({ atDate = '' } = {}) {
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
  lines.push(`干支關係：${bz.relations.map(relText).join('；') || '無'}`);
  lines.push(`大運：${yinyang(bz.P[0].gan)}${bz.male ? '男' : '女'}${bz.forward ? '順行' : '逆行'}，出生後 ${bz.yun.y} 年 ${bz.yun.m} 個月 ${bz.yun.d} 天起運，約 ${bz.yun.date} 交運`);
  lines.push('  ' + bz.dayun.map(d => `${d.gz} ${d.startYear}（${d.startAge} 歲）`).join('\u3000'));
  if (atDate) lines.push('', ...baziYun(atDate));
  lines.push('');
  const ming = c.palaces.find(p => p.name === '命宮');
  lines.push(`【紫微斗數】${c.fiveElementsClass}\u3000命主 ${c.soul}\u3000身主 ${c.body}\u3000命宮 ${ming.heavenlyStem}${ming.earthlyBranch}\u3000身宮在${c.palaces.find(p => p.isBodyPalace).name}`);
  lines.push(`起盤：${zw.dateUsed} ${SHICHEN[rt.hourIndex]}時\u3000農曆 ${zw.lunarText}\u3000生年 ${zw.yearGZ}`);
  lines.push(`流派設定：${zwOptLabels(zw.opts).join('、')}`);
  lines.push('各宮依序：主星｜輔星｜雜曜｜十二長生、博士、歲前、將前');
  const f = s => s.name + (s.brightness || '') + (s.mutagen ? '化' + s.mutagen : '');
  const ordered = [...c.palaces].sort((a, b) => ((a.index - ming.index + 12) % 12) - ((b.index - ming.index + 12) % 12));
  ordered.forEach(p => {
    lines.push(`${p.name}${p.isBodyPalace ? '(身)' : ''} ${p.heavenlyStem}${p.earthlyBranch}［${p.decadal.range[0]}–${p.decadal.range[1]}］：${p.majorStars.map(f).join(' ') || '無主星'}｜${p.minorStars.map(f).join(' ') || '—'}｜${p.adjectiveStars.map(s => s.name).join(' ') || '—'}｜${p.changsheng12} ${p.boshi12} ${p.suiqian12} ${p.jiangqian12}`);
  });
  // 紫微分頁上疊了運限的話，把疊的那幾層也寫出來
  const L = layers();
  if (L) {
    const at = layer => `${c.palaces[layer.index].name}（${c.palaces[layer.index].earthlyBranch}宮）`; // 這一層的命宮落在本命的哪一宮
    const hua = layer => layer.hua.map((n, k) => n + '化' + '祿權科忌'[k]).join('、');
    const stars = layer => layer.stars.map((list, i) => (list.length ? `${list.join('、')}在${c.palaces[i].name}` : '')).filter(Boolean).join('，');
    const one = (head, layer) => `${head}，命宮在本命${at(layer)}：${hua(layer)}。流曜：${stars(layer)}`;
    lines.push('', '【紫微運限】');
    if (L.dec) lines.push(one(L.dec.child ? `童限 ${L.age} 歲 ${L.dec.gz}` : `大限 ${L.dec.ages.join('–')} 歲 ${L.dec.gz}`, L.dec));
    if (L.yr) lines.push(one(`流年 ${L.yr.year} ${L.yr.gz}（${L.age} 歲）`, L.yr));
    if (L.yr) lines.push(`流年歲前、將前：${ordered.map(p => `${p.name} ${L.yr.sui12[p.index]}、${L.yr.jiang12[p.index]}`).join('；')}`);
    if (L.xiao) lines.push(`小限 ${L.age} 歲 ${L.xiao.gz}，在本命${at(L.xiao)}：${hua(L.xiao)}`);
    if (L.mo) lines.push(one(`流月 ${L.mo.label} ${L.mo.gz}（${L.mo.from} 到 ${L.mo.to}）`, L.mo));
    if (L.day) lines.push(one(`流日 ${L.day.label} ${L.day.gz}（${L.day.date}）`, L.day));
    if (L.hr) lines.push(one(`流時 ${L.hr.label} ${L.hr.gz}（${L.hr.from}–${L.hr.to}${L.hr.k === 12 ? '，時干用次日的子時' : ''}）`, L.hr));
  } else if (atDate) {
    lines.push('', '【紫微運限】', '這一天不在列出的運限範圍內（還沒出生，或已過了第十個大限），沒有疊運限。');
  }
  // 頁面上要使用者複核的提醒也帶著走：文字盤常常是單獨貼給別人看的
  const warns = warningsOf(S);
  if (warns.length) lines.push('', '【提醒】', ...warns.map(w => '・' + w));
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
