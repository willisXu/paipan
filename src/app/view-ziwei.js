/* 紫微斗數分頁：十二宮方盤，大限、流年、流月、流日一層一層疊上去，小限，所選宮位的三方四正與飛化，以及各種點選。
   每一層運限落在哪一宮、干支、宮名、四化、流曜都向引擎查；這裡只管選到哪一個、怎麼畫。
   第一個大限開始之前的那幾年是童限，每年走的宮不同，所以童限一定帶著所選的那一年。 */
import { SHICHEN, yearGZ, yinyang, zwSpans, zwDaXian, zwTongXian, zwXiaoXian, zwLiuNian, zwLiuYue, zwLiuRi } from '../engine/index.js';
import { $, esc, reveal, refocus } from './dom.js';
import { S, today, zwYear } from './state.js';
import { nameOf, zwOptLabels } from './format.js';

// 四化的固定順序：引擎給的四化（生年、宮干、各層運限）都依這個順序排
const HUA = ['祿', '權', '科', '忌'];
const HUA_K = { 祿: 'lu', 權: 'quan', 科: 'ke', 忌: 'ji' };
// 十二宮在 4×4 方格外圈的位置：[列, 欄]
const GRID = { 巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4], 辰: [2, 1], 酉: [2, 4], 卯: [3, 1], 戌: [3, 4], 寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4] };
const kindOf = s => (s.type === 'major' ? 'maj' : s.type === 'soft' || s.type === 'lucun' || s.type === 'tianma' ? 'soft' : s.type === 'tough' ? 'tough' : 'adj');
const NOW = '<span class="nowmark">今</span>'; // 今天所在的大限、流年、流月、流日：除了顏色也用文字標出
const CHILD = 'child'; // S.dec、S.curDec 的特別值：童限。其餘的值是宮位序號
const span = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
const monthDay = date => { const [, m, d] = date.split('-').map(Number); return `${m}/${d}`; }; // YYYY-MM-DD → 11/17
const huaText = layer => layer.hua.map((n, k) => n + '化' + HUA[k]).join('、');

// 畫面上列出的運限分段：童限一段，加上前十個大限
const shownSpans = () => zwSpans(S.zw).slice(0, 11);
const spanOf = dec => shownSpans().find(s => (dec === CHILD ? s.child : s.palace === dec));
const ageOf = year => year - S.zw.birthYear + 1; // 虛歲：生年一歲。生年是哪一年看年界；流年一律以正月初一換年

/* 今年走到哪一段運限：虛歲落在哪個大限裡，就是那一宮；比第一個大限小的是童限。
   還沒出生、或超過畫面列出的十個大限，回傳 null */
export function currentDecade() {
  const age = ageOf(zwYear), s = shownSpans().find(x => age >= x.ages[0] && age <= x.ages[1]);
  return !s ? null : s.child ? CHILD : s.palace;
}

/* 目前疊上的各層運限：dec 大限或童限、yr 流年、mo 流月、day 流日，另有 xiao 小限（選了流年才有）；沒選到的那一層是 null。
   months、days 是選到的流年底下有哪些流月、選到的流月底下有哪些流日，畫運限列用。本命盤（什麼都沒疊）回傳 null */
export function layers() {
  if (S.dec === null) return null;
  const zw = S.zw, age = S.yr === null ? null : ageOf(S.yr);
  const months = S.yr === null ? [] : zwLiuYue(zw, S.yr), mo = S.mo === null ? null : months[S.mo] || null;
  const days = mo ? zwLiuRi(zw, mo) : [];
  return {
    dec: S.dec === CHILD ? zwTongXian(zw, age) : zwDaXian(zw, S.dec),
    xiao: age === null ? null : zwXiaoXian(zw, age),
    yr: S.yr === null ? null : zwLiuNian(zw, S.yr),
    mo, day: S.day === null ? null : days.find(d => d.day === S.day) || null,
    age, months, days,
  };
}
// 疊在盤上的那幾層，由外到內。key 也是 CSS 的 class；mark 是標在宮名、四化前面的一個字
const stack = L => (!L ? [] : [['dec', L.dec && L.dec.child ? '童' : '大'], ['yr', '年'], ['mo', '月'], ['day', '日']].filter(([key]) => L[key]).map(([key, mark]) => ({ key, mark, layer: L[key] })));
// 某一宮在各層運限裡的宮名（小限走到這一宮時多一個「小限」），以及落在這一宮的流曜
const layerNames = (L, st, i) => st.map(({ key, mark, layer }) => `<span class="ly ${key}${layer.names[i] === '命宮' ? ' ming' : ''}"><i>${mark}</i>${layer.names[i]}</span>`).join('') +
  (L && L.xiao && L.xiao.index === i ? '<span class="ly xiao">小限</span>' : '');
const flowStars = (st, i) => st.map(({ key, layer }) => layer.stars[i].map(n => `<span class="fst ${key}">${n}</span>`).join('')).join('');

export function renderZiwei() {
  const L = layers();
  renderYunbar(L);
  $('#zw').innerHTML = palaceCells(L) + centerCell(L);
  ['#decs', '#yrs', '#mos', '#days'].forEach(reveal);
  renderPalaceDetail(L);
}

// 盤面上方的運限列：大限，以及選了上一層才出現的流年、流月、流日
function renderYunbar(L) {
  const chip = (attr, on, cur, html) => `<button type="button" class="chip2${cur ? ' cur' : ''}" ${attr} aria-pressed="${on}">${cur ? NOW : ''}${html}</button>`;
  $('#decs').innerHTML = `<span class="rowlabel">大限</span><button type="button" class="chip2" data-dec="" aria-pressed="${S.dec === null}">本命盤</button>` +
    (S.curDec !== null ? '<button type="button" class="jump" data-today>看今天</button>' : '') +
    shownSpans().map(s => { const dec = s.child ? CHILD : s.palace; return chip(`data-dec="${dec}"`, S.dec === dec, dec === S.curDec, `${span(...s.ages)} 歲<b>${s.child ? '童限' : s.gz}</b>`); }).join('');
  const row = (sel, label, chips) => { const el = $(sel); el.hidden = !chips; el.innerHTML = chips ? `<span class="rowlabel">${label}</span>${chips}` : ''; };
  const sp = L && spanOf(S.dec), years = [];
  if (sp) for (let age = sp.ages[0]; age <= sp.ages[1]; age++) years.push({ year: sp.years[0] + age - sp.ages[0], age });
  row('#yrs', '流年', years.map(y => chip(`data-yr="${y.year}"`, S.yr === y.year, y.year === zwYear, `${y.year}<b>${yearGZ(y.year)}</b> ${y.age} 歲`)).join(''));
  /* 流月、流日的籤比較多，排成小格：上面一行小字是公曆日期。流月寫從哪一天起；
     流日只有頭一天和每月一日把月份寫出來，其餘畫面上只寫幾日，月份留給讀屏唸（完整的日期才聽得懂） */
  row('#mos', '流月', L ? L.months.map(m => chip(`data-mo="${m.k}"`, S.mo === m.k, m.from <= today && today <= m.to, `<small>${monthDay(m.from)} 起</small><span>${m.label}<b>${m.gz}</b></span>`)).join('') : '');
  const solar = (d, k) => { const [m, day] = monthDay(d.date).split('/'); return k === 0 || day === '1' ? `${m}/${day}` : `<span class="vh">${m}/</span>${day}`; };
  row('#days', '流日', L ? L.days.map((d, k) => chip(`data-day="${d.day}"`, S.day === d.day, d.date === today, `<small>${solar(d, k)}</small><span>${d.label}</span><b>${d.gz}</b>`)).join('') : '');
}

// 十二宮的格子。L 是目前疊上的運限（layers() 的結果），沒有疊則為 null
function palaceCells(L) {
  const c = S.c, st = stack(L);
  const over = {}; // 星名 → 疊上的各層運限四化
  st.forEach(({ key, mark, layer }) => layer.hua.forEach((name, k) => { (over[name] = over[name] || []).push({ key, mark, m: HUA[k] }); }));

  const sel = S.pal;
  const role = i => (i === (sel + 6) % 12 ? '對宮' : i === (sel + 4) % 12 || i === (sel + 8) % 12 ? '三合' : '');
  const star = s => {
    const badges = s.mutagen ? [`<b class="hua h-${HUA_K[s.mutagen]}">${s.mutagen}</b>`] : [];
    (over[s.name] || []).forEach(o => badges.push(`<b class="hua o ${o.key} h-${HUA_K[o.m]}"><i>${o.mark}</i>${o.m}</b>`));
    return `<span class="st ${kindOf(s)}"><span class="n">${s.name}</span>${s.brightness ? `<span class="br">${s.brightness}</span>` : ''}${badges.join('')}</span>`;
  };
  // 宮名按鈕的 aria-label 以按鈕上看得到的字開頭（宮名，身宮的「身」），後面才補干支與三方四正的角色
  return c.palaces.map(p => {
    const [r, col] = GRID[p.earthlyBranch], i = p.index;
    const lys = layerNames(L, st, i), fst = flowStars(st, i), rl = role(i);
    // 左下角四個十二神：長生、博士、歲前、將前；選了流年，歲前、將前的右邊多出流年的
    const yg = name => (L && L.yr ? `<span class="y">${L.yr[name][i]}</span>` : '');
    return `<div class="cell${rl || i === sel ? ' sf' : ''}${i === sel ? ' sel' : ''}" style="grid-row:${r};grid-column:${col}" data-pal="${i}">
        <div class="stars">${p.majorStars.concat(p.minorStars, p.adjectiveStars).map(star).join('')}</div>
        ${fst ? `<div class="fsts">${fst}</div>` : ''}
        ${lys || rl ? `<div class="lys">${lys}${rl ? `<span class="rolemark">${rl}</span>` : ''}</div>` : ''}
        <div class="foot">
          <span class="l"><span>${p.changsheng12}</span><span>${p.boshi12}</span><span>${p.suiqian12}</span>${yg('sui12')}<span>${p.jiangqian12}</span>${yg('jiang12')}</span>
          <span class="m"><button type="button" class="pn" aria-pressed="${i === sel}" aria-label="${p.name}${p.isBodyPalace ? '，身宮' : ''}，${p.heavenlyStem}${p.earthlyBranch}宮${rl ? '，所選宮的' + rl : ''}">${p.name}${p.isBodyPalace ? '<span class="mk">身</span>' : ''}</button><span class="dr">${p.decadal.range[0]}–${p.decadal.range[1]}</span></span>
          <span class="gzv">${p.heavenlyStem}${p.earthlyBranch}</span>
        </div>
      </div>`;
  }).join('');
}

// 中宮：命主的基本資料、採用的流派設定，以及目前疊的是哪幾層運限
function centerCell(L) {
  const { c, rt, inp, zw, bz } = S;
  const ming = c.palaces.find(p => p.name === '命宮'), body = c.palaces.find(p => p.isBodyPalace);
  const ziTxt = !rt.lateZi ? '' : zw.rolled ? '晚子時換日，以次日子時起盤' : '晚子時不換日，以當日子時起盤';
  // 生年干支和八字年柱不同、或換一種年界會不同的時候，寫明是照哪一種算的
  const lunarGZ = yearGZ(c.rawDates.lunarDate.lunarYear);
  const yearNote = zw.opts.year !== 'lichun'
    ? (zw.yearGZ !== bz.gz[0] ? `以正月初一分界；八字年柱以立春分界，為${bz.gz[0]}` : '')
    : [zw.yearGZ !== lunarGZ ? `以立春分界；照正月初一是${lunarGZ}年` : '', zw.yearGZ !== bz.gz[0] ? `立春以日為單位換年；八字年柱看交節的時刻，為${bz.gz[0]}` : ''].filter(Boolean).join('。');
  let yunLine = '<span class="muted">目前是本命盤。點上方的大限、流年、流月、流日，一層一層疊上運限的宮名、四化和流曜。</span>';
  if (L) {
    const at = layer => c.palaces[layer.index].name; // 這一層的命宮落在本命的哪一宮
    const lines = [];
    // 童限每年走的宮不同：寫出這一年幾歲、走到哪一宮；大限寫那一宮的十年與宮干支
    if (L.dec) lines.push(['d', L.dec.child ? `童限 <b>${L.age} 歲 ${L.dec.gz}</b>（${at(L.dec)}）` : `大限 <b>${span(...L.dec.ages)} 歲 ${L.dec.gz}</b>`, L.dec]);
    if (L.yr) lines.push(['yv', `流年 <b>${L.yr.year} ${L.yr.gz}</b>`, L.yr]);
    if (L.xiao) lines.push(['xv', `小限 <b>${L.age} 歲 ${L.xiao.gz}</b>（${at(L.xiao)}）`, L.xiao]);
    if (L.mo) lines.push(['mv', `流月 <b>${L.mo.label} ${L.mo.gz}</b>（${monthDay(L.mo.from)}–${monthDay(L.mo.to)}）`, L.mo]);
    if (L.day) lines.push(['dv', `流日 <b>${L.day.label} ${L.day.gz}</b>（${L.day.date}）`, L.day]);
    yunLine = lines.map(([cls, head, layer]) => `<span class="${cls}">${head}：${huaText(layer)}</span>`).join('<br>');
  }
  return `<div class="center">
      <div class="cn">${esc(nameOf(inp))}<span>${yinyang(zw.yearGZ[0])}${c.gender}</span></div>
      <dl>
        <dt>起盤</dt><dd>${zw.dateUsed}\u3000${SHICHEN[rt.hourIndex]}時${ziTxt ? `<small>${ziTxt}</small>` : ''}</dd>
        <dt>農曆</dt><dd>${zw.lunarText}</dd>
        <dt>生年</dt><dd>${zw.yearGZ}年，屬${c.zodiac}${yearNote ? `<small>${yearNote}</small>` : ''}</dd>
        <dt>五行局</dt><dd>${c.fiveElementsClass}</dd>
        <dt>命主・身主</dt><dd>${c.soul}・${c.body}</dd>
        <dt>命宮・身宮</dt><dd>${ming.heavenlyStem}${ming.earthlyBranch}・${body.heavenlyStem}${body.earthlyBranch}（${body.name}）</dd>
        <dt>生年四化</dt><dd>${zw.sihua[zw.yearGZ[0]].map((n, k) => n + HUA[k]).join('、')}</dd>
        <dt>流派</dt><dd>${zwOptLabels(zw.opts).join('、')}</dd>
      </dl>
      <div class="cyun">${yunLine}</div>
    </div>`;
}

function renderPalaceDetail(L) {
  const c = S.c, i = S.pal, p = c.palaces[i], st = stack(L);
  const hz = (m, mark = '') => `<span class="hz h-${HUA_K[m]}">${mark}${m}</span>`;
  const marks = s => {
    const out = s.mutagen ? [hz(s.mutagen)] : [];
    st.forEach(({ mark, layer }) => { const k = layer.hua.indexOf(s.name); if (k >= 0) out.push(hz(HUA[k], mark)); });
    return out.join('');
  };
  const rows = [['本宮', i], ['對宮', (i + 6) % 12], ['三合', (i + 4) % 12], ['三合', (i + 8) % 12]].map(([k, idx]) => {
    const q = c.palaces[idx], opp = c.palaces[(idx + 6) % 12];
    const main = q.majorStars.length
      ? q.majorStars.map(s => `<span class="mj">${s.name}</span>${s.brightness || ''}${marks(s)}`).join('\u3000')
      : `<span class="muted">無主星，借對宮${opp.majorStars.map(s => s.name).join('、') || '（對宮也沒有主星）'}</span>`;
    const minor = q.minorStars.map(s => `${s.name}${s.brightness || ''}${marks(s)}`).join('、');
    const yun = layerNames(L, st, idx) + flowStars(st, idx); // 這一宮在各層運限裡是什麼宮、有哪些流曜
    return `<div class="r"><span class="k">${k}</span><span class="p">${q.name}<small>${q.heavenlyStem}${q.earthlyBranch}</small></span><span class="s">${main}${minor ? `<br><span class="mi">${minor}</span>` : ''}${yun ? `<span class="yl">${yun}</span>` : ''}</span></div>`;
  }).join('');
  const where = name => c.palaces.find(q => q.majorStars.concat(q.minorStars).some(s => s.name === name));
  const flies = S.zw.sihua[p.heavenlyStem].map((name, k) => {
    const t = where(name);
    return `<li>${name}化${HUA[k]} → ${!t ? '盤中找不到這顆星' : t.index === i ? `${t.name}（自化）` : t.name}</li>`;
  }).join('');
  const gods = `十二長生 ${p.changsheng12} · 博士十二神 ${p.boshi12} · 歲前 ${p.suiqian12} · 將前 ${p.jiangqian12}${L && L.yr ? ` · 流年歲前 ${L.yr.sui12[i]} · 流年將前 ${L.yr.jiang12[i]}` : ''}`;
  $('#pdetail').innerHTML = `
      <div class="pd-head"><h2 class="t">${p.name}<small>${p.heavenlyStem}${p.earthlyBranch}宮${p.isBodyPalace ? '・身宮' : ''}${p.isOriginalPalace ? '・來因宮' : ''}</small></h2>
        <span class="meta">大限 ${p.decadal.range[0]}–${p.decadal.range[1]} 歲 · 小限 ${p.ages.slice(0, 8).join('、')}… 歲 · ${gods}</span></div>
      <div class="sfsz">${rows}</div>
      <div class="fly"><h3>${p.heavenlyStem}干飛化 <span class="tag t-參考">參考</span></h3><ul>${flies}</ul></div>`;
}

// 選大限（或童限、本命盤）：裡面幾層先清掉；選到今年所在的那一段時，順便帶出今年
function pickDecade(v) {
  S.dec = v === '' ? null : v === CHILD ? CHILD : Number(v);
  S.yr = S.mo = S.day = null;
  if (S.dec === null) return;
  const [y0, y1] = spanOf(S.dec).years;
  if (zwYear >= y0 && zwYear <= y1) S.yr = zwYear;
  else if (S.dec === CHILD) S.yr = y0; // 童限每年走的宮不同，一定要落在某一年上：先看一歲
}
// 一鍵疊到今天：今年所在的大限、今年、今天所在的流月與流日
function pickToday() {
  if (S.curDec === null) return;
  const mo = zwLiuYue(S.zw, zwYear).find(m => m.from <= today && today <= m.to);
  const day = mo && zwLiuRi(S.zw, mo).find(d => d.date === today);
  Object.assign(S, { dec: S.curDec, yr: zwYear, mo: mo ? mo.k : null, day: day ? day.day : null });
}

export function initZiweiView() {
  // 整格可點；鍵盤與讀屏走宮名上的按鈕，格內的星曜文字照常可讀
  $('#zw').addEventListener('click', e => {
    const el = e.target.closest('[data-pal]'); if (!el || !S.c) return;
    S.pal = Number(el.dataset.pal);
    renderZiwei(); refocus(`.cell[data-pal="${S.pal}"] .pn`);
  });
  // 運限列的四排籤：點了改選到的項目，重畫，再把焦點放回同一顆按鈕
  const row = (sel, attr, pick) => $(sel).addEventListener('click', e => {
    const b = e.target.closest(`[${attr}]`); if (!b || !S.c) return;
    const v = b.getAttribute(attr);
    pick(v);
    renderZiwei(); refocus(`${sel} [${attr}="${v}"]`);
  });
  row('#decs', 'data-dec', pickDecade);
  row('#decs', 'data-today', pickToday);
  // 再點一次取消，只看外面那幾層；童限不能沒有年
  row('#yrs', 'data-yr', v => { const y = Number(v); S.yr = S.yr === y && S.dec !== CHILD ? null : y; S.mo = S.day = null; });
  row('#mos', 'data-mo', v => { const k = Number(v); S.mo = S.mo === k ? null : k; S.day = null; });
  row('#days', 'data-day', v => { const d = Number(v); S.day = S.day === d ? null : d; });
}
