/* 紫微斗數分頁：十二宮方盤、大限與流年疊盤、所選宮位的三方四正與飛化，以及宮位、大限、流年的點選。 */
import { SHICHEN, SIHUA, yearGZ, yinyang } from '../engine/index.js';
import { $, esc, reveal, refocus } from './dom.js';
import { S, zwYear, horoscopeOf } from './state.js';
import { nameOf } from './format.js';

// 四化的固定順序：引擎的 SIHUA 與 iztro 給的運限四化（mutagen）都依這個順序排
const HUA = ['祿', '權', '科', '忌'];
const HUA_K = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };
// 十二宮在 4×4 方格外圈的位置：[列, 欄]
const GRID = { 巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4], 辰: [2, 1], 酉: [2, 4], 卯: [3, 1], 戌: [3, 4], 寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4] };
const kindOf = s => (s.type === 'major' ? 'maj' : s.type === 'soft' || s.type === 'lucun' || s.type === 'tianma' ? 'soft' : s.type === 'tough' ? 'tough' : 'adj');
const NOW = '<span class="nowmark">今</span>'; // 目前所在的大限、流年：除了顏色也用文字標出
const birthLunarYear = () => S.c.rawDates.lunarDate.lunarYear;

// 目前疊上的運限：大限取該限第一年查詢，流年取所選年
function layers() {
  if (S.dec === null) return null;
  const year = S.yr ?? birthLunarYear() + S.c.palaces[S.dec].decadal.range[0] - 1;
  const h = horoscopeOf(year);
  if (!h) return null;
  return { dec: h.decadal, yr: S.yr !== null ? h.yearly : null, year };
}

export function renderZiwei() {
  renderYunbar();
  const L = layers();
  $('#zw').innerHTML = palaceCells(L) + centerCell(L);
  reveal('#decs'); reveal('#yrs');
  renderPalaceDetail(L);
}

// 盤面上方的兩列籤：大限，以及選了大限才出現的流年
function renderYunbar() {
  const c = S.c, birthY = birthLunarYear();
  const decs = c.palaces.map(p => ({ i: p.index, r: p.decadal.range, gz: p.decadal.heavenlyStem + p.decadal.earthlyBranch })).sort((a, b) => a.r[0] - b.r[0]).slice(0, 10);
  $('#decs').innerHTML = `<span class="rowlabel">大限</span><button type="button" class="chip2" data-dec="" aria-pressed="${S.dec === null}">本命盤</button>` +
    decs.map(d => `<button type="button" class="chip2${d.i === S.curDec ? ' cur' : ''}" data-dec="${d.i}" aria-pressed="${S.dec === d.i}">${d.i === S.curDec ? NOW : ''}${d.r[0]}–${d.r[1]} 歲<b>${d.gz}</b></button>`).join('');
  const yrs = $('#yrs');
  yrs.hidden = S.dec === null;
  if (S.dec === null) yrs.innerHTML = '';
  else {
    const r = c.palaces[S.dec].decadal.range, list = [];
    for (let n = r[0]; n <= r[1]; n++) list.push({ year: birthY + n - 1, age: n });
    yrs.innerHTML = '<span class="rowlabel">流年</span>' + list.map(y => `<button type="button" class="chip2${y.year === zwYear ? ' cur' : ''}" data-yr="${y.year}" aria-pressed="${S.yr === y.year}">${y.year === zwYear ? NOW : ''}${y.year}<b>${yearGZ(y.year)}</b> ${y.age} 歲</button>`).join('');
  }
}

// 十二宮的格子。L 是目前疊上的運限（layers() 的結果），沒有疊則為 null
function palaceCells(L) {
  const c = S.c;
  const over = {}; // 星名 → 疊上的運限四化
  const addOver = (arr, layer) => arr.forEach((name, k) => { (over[name] = over[name] || []).push({ layer, m: HUA[k] }); });
  if (L) { addOver(L.dec.mutagen, 'dec'); if (L.yr) addOver(L.yr.mutagen, 'yr'); }

  const sel = S.pal;
  const role = i => (i === (sel + 6) % 12 ? '對宮' : i === (sel + 4) % 12 || i === (sel + 8) % 12 ? '三合' : '');
  const star = s => {
    const badges = s.mutagen ? [`<b class="hua h-${HUA_K[s.mutagen]}">${s.mutagen}</b>`] : [];
    (over[s.name] || []).forEach(o => badges.push(`<b class="hua o ${o.layer} h-${HUA_K[o.m]}"><i>${o.layer === 'dec' ? '大' : '年'}</i>${o.m}</b>`));
    return `<span class="st ${kindOf(s)}"><span class="n">${s.name}</span>${s.brightness ? `<span class="br">${s.brightness}</span>` : ''}${badges.join('')}</span>`;
  };
  // 宮名按鈕的 aria-label 以按鈕上看得到的字開頭（宮名，身宮的「身」），後面才補干支與三方四正的角色
  return c.palaces.map(p => {
    const [r, col] = GRID[p.earthlyBranch];
    const lys = [];
    if (L) {
      const dn = L.dec.palaceNames[p.index];
      lys.push(`<span class="ly dec${dn === '命宮' ? ' ming' : ''}"><i>大</i>${dn}</span>`);
      if (L.yr) { const yn = L.yr.palaceNames[p.index]; lys.push(`<span class="ly yr${yn === '命宮' ? ' ming' : ''}"><i>年</i>${yn}</span>`); }
    }
    const rl = role(p.index);
    return `<div class="cell${rl || p.index === sel ? ' sf' : ''}${p.index === sel ? ' sel' : ''}" style="grid-row:${r};grid-column:${col}" data-pal="${p.index}">
        <div class="stars">${p.majorStars.concat(p.minorStars, p.adjectiveStars).map(star).join('')}</div>
        ${lys.length || rl ? `<div class="lys">${lys.join('')}${rl ? `<span class="rolemark">${rl}</span>` : ''}</div>` : ''}
        <div class="foot">
          <span class="l"><span>${p.changsheng12}</span><span>${p.boshi12}</span></span>
          <span class="m"><button type="button" class="pn" aria-pressed="${p.index === sel}" aria-label="${p.name}${p.isBodyPalace ? '，身宮' : ''}，${p.heavenlyStem}${p.earthlyBranch}宮${rl ? '，所選宮的' + rl : ''}">${p.name}${p.isBodyPalace ? '<span class="mk">身</span>' : ''}</button><span class="dr">${p.decadal.range[0]}–${p.decadal.range[1]}</span></span>
          <span class="gzv">${p.heavenlyStem}${p.earthlyBranch}</span>
        </div>
      </div>`;
  }).join('');
}

// 中宮：命主的基本資料，以及目前疊的是哪個大限、流年
function centerCell(L) {
  const { c, rt, inp, zw, bz } = S;
  const yearStem = c.rawDates.chineseDate.yearly.join('');
  const ming = c.palaces.find(p => p.name === '命宮'), body = c.palaces.find(p => p.isBodyPalace);
  const ziTxt = !rt.lateZi ? '' : zw.rolled ? '晚子時換日，以次日子時起盤' : '晚子時不換日，以當日子時起盤';
  let yunLine = '<span class="muted">目前是本命盤。點上方的大限、流年，疊上運限四化和運限宮名。</span>';
  if (L) {
    const dr = c.palaces[S.dec].decadal;
    yunLine = `<span class="d">大限 <b>${dr.range[0]}–${dr.range[1]} 歲 ${dr.heavenlyStem}${dr.earthlyBranch}</b>：${L.dec.mutagen.map((n, k) => n + '化' + HUA[k]).join('、')}</span>` +
      (L.yr ? `<br><span class="yv">流年 <b>${L.year} ${L.yr.heavenlyStem}${L.yr.earthlyBranch}</b>：${L.yr.mutagen.map((n, k) => n + '化' + HUA[k]).join('、')}</span>` : '');
  } else if (S.dec !== null) {
    yunLine = '<span class="muted">這個年份超出函式庫可查的運限範圍。</span>';
  }
  return `<div class="center">
      <div class="cn">${esc(nameOf(inp))}<span>${yinyang(yearStem[0])}${c.gender}</span></div>
      <dl>
        <dt>起盤</dt><dd>${zw.dateUsed}\u3000${SHICHEN[rt.hourIndex]}時${ziTxt ? `<small>${ziTxt}</small>` : ''}</dd>
        <dt>農曆</dt><dd>${zw.lunarText}</dd>
        <dt>生年</dt><dd>${yearStem}年，屬${c.zodiac}${yearStem !== bz.gz[0] ? `<small>以正月初一分界；八字年柱以立春分界，為${bz.gz[0]}</small>` : ''}</dd>
        <dt>五行局</dt><dd>${c.fiveElementsClass}</dd>
        <dt>命主・身主</dt><dd>${c.soul}・${c.body}</dd>
        <dt>命宮・身宮</dt><dd>${ming.heavenlyStem}${ming.earthlyBranch}・${body.heavenlyStem}${body.earthlyBranch}（${body.name}）</dd>
        <dt>生年四化</dt><dd>${SIHUA[yearStem[0]].map((n, k) => n + HUA[k]).join('、')}</dd>
      </dl>
      <div class="cyun">${yunLine}</div>
    </div>`;
}

function renderPalaceDetail(L) {
  const c = S.c, i = S.pal, p = c.palaces[i];
  const hz = (m, layer) => `<span class="hz h-${HUA_K[m]}">${layer === 'dec' ? '大' : layer === 'yr' ? '年' : ''}${m}</span>`;
  const marks = s => {
    const out = s.mutagen ? [hz(s.mutagen)] : [];
    if (L) {
      const k = L.dec.mutagen.indexOf(s.name); if (k >= 0) out.push(hz(HUA[k], 'dec'));
      const j = L.yr ? L.yr.mutagen.indexOf(s.name) : -1; if (j >= 0) out.push(hz(HUA[j], 'yr'));
    }
    return out.join('');
  };
  const rows = [['本宮', i], ['對宮', (i + 6) % 12], ['三合', (i + 4) % 12], ['三合', (i + 8) % 12]].map(([k, idx]) => {
    const q = c.palaces[idx], opp = c.palaces[(idx + 6) % 12];
    const main = q.majorStars.length
      ? q.majorStars.map(s => `<span class="mj">${s.name}</span>${s.brightness || ''}${marks(s)}`).join('\u3000')
      : `<span class="muted">無主星，借對宮${opp.majorStars.map(s => s.name).join('、') || '（對宮也沒有主星）'}</span>`;
    const minor = q.minorStars.map(s => `${s.name}${s.brightness || ''}${marks(s)}`).join('、');
    return `<div class="r"><span class="k">${k}</span><span class="p">${q.name}<small>${q.heavenlyStem}${q.earthlyBranch}</small></span><span class="s">${main}${minor ? `<br><span class="mi">${minor}</span>` : ''}</span></div>`;
  }).join('');
  const where = name => c.palaces.find(q => q.majorStars.concat(q.minorStars).some(s => s.name === name));
  const flies = SIHUA[p.heavenlyStem].map((name, k) => {
    const t = where(name);
    return `<li>${name}化${HUA[k]} → ${!t ? '盤中找不到這顆星' : t.index === i ? `${t.name}（自化）` : t.name}</li>`;
  }).join('');
  $('#pdetail').innerHTML = `
      <div class="pd-head"><h2 class="t">${p.name}<small>${p.heavenlyStem}${p.earthlyBranch}宮${p.isBodyPalace ? '・身宮' : ''}${p.isOriginalPalace ? '・來因宮' : ''}</small></h2>
        <span class="meta">大限 ${p.decadal.range[0]}–${p.decadal.range[1]} 歲 · 小限 ${p.ages.slice(0, 8).join('、')}… 歲 · ${p.changsheng12} · ${p.boshi12}</span></div>
      <div class="sfsz">${rows}</div>
      <div class="fly"><h3>${p.heavenlyStem}干飛化 <span class="tag t-參考">參考</span></h3><ul>${flies}</ul></div>`;
}

function selectPalace(idx) {
  S.pal = idx;
  renderZiwei(); refocus(`.cell[data-pal="${idx}"] .pn`);
}

export function initZiweiView() {
  // 整格可點；鍵盤與讀屏走宮名上的按鈕，格內的星曜文字照常可讀
  $('#zw').addEventListener('click', e => { const el = e.target.closest('[data-pal]'); if (el && S.c) selectPalace(Number(el.dataset.pal)); });
  $('#decs').addEventListener('click', e => {
    const b = e.target.closest('[data-dec]'); if (!b || !S.c) return;
    S.dec = b.dataset.dec === '' ? null : Number(b.dataset.dec);
    S.yr = null;
    if (S.dec !== null) { // 選到今年所在的大限時，順便帶出今年
      const r = S.c.palaces[S.dec].decadal.range, y0 = birthLunarYear() + r[0] - 1;
      if (zwYear >= y0 && zwYear <= y0 + r[1] - r[0]) S.yr = zwYear;
    }
    renderZiwei(); refocus(`[data-dec="${b.dataset.dec}"]`);
  });
  $('#yrs').addEventListener('click', e => {
    const b = e.target.closest('[data-yr]'); if (!b || !S.c) return;
    const y = Number(b.dataset.yr);
    S.yr = S.yr === y ? null : y; // 再點一次取消流年，只看大限
    renderZiwei(); refocus(`[data-yr="${y}"]`);
  });
}
