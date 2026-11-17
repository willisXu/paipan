/* 八字分頁：四柱表、旺衰三看、五行字數、原局關係、大運流年流月、神煞，以及大運、流年、流月的點選。
   「運」那一排有十一格：起運前（序號 -1，沒有大運干支）加上十步大運（序號 0 到 9）。
   流年下面是那一年的十二個節氣月；流月可以不選，選了才接進下面的關係列。 */
import { relations, bzLiuYue, WX, WX_KEY, wxOf, yinyang } from '../engine/index.js';
import { $, reveal, refocus } from './dom.js';
import { monthDay } from './format.js';
import { S, bzYear, today } from './state.js';

const wxc = c => 'wx-' + WX_KEY[wxOf(c)];
const wxName = c => yinyang(c) + WX[wxOf(c)];
const gzCell = c => `<span class="gz"><b class="${wxc(c)}">${c}</b><small>${wxName(c)}</small></span>`;

function relList(list, emptyText) {
  if (!list.length) return `<p class="empty">${emptyText}</p>`;
  return list.map(r => `<div class="rel"><span class="ty">${r.type}</span><span class="tx">${r.text}</span><span class="wh">${[...r.where].join('×')}${r.dist ? ' · ' + r.dist : ''} <span class="tag t-${r.tag}">${r.tag}</span></span>${r.note ? `<span class="nt">${r.note}</span>` : ''}</div>`).join('');
}

const PRE = -1; // 起運前那一格的序號
const stepOf = (bz, i) => (i === PRE ? bz.pre : bz.dayun[i]);
// 今天走到哪一格：以交運日為準，不是以年。還沒出生、或十步運都走完了，回傳 null
export function currentStep(bz) {
  if (today < bz.pre.startDate) return null;
  if (today < bz.pre.endDate) return PRE;
  const i = bz.dayun.findIndex(d => d.startDate <= today && today < d.endDate);
  return i < 0 ? null : i;
}
// 一張新的盤先看哪一格：今天所在的那一格；還沒出生的看起運前，十步運都走完的看最後一步
export const defaultStep = bz => currentStep(bz) ?? (today < bz.pre.startDate ? PRE : bz.dayun.length - 1);
// 點到（或預設選到）第 i 格時先看哪一年：今天所在的那一格看今年；其他的，大運看習慣上標示的起始年，起運前看出生那一年
export function defaultYear(bz, i) {
  const D = stepOf(bz, i);
  if (i === currentStep(bz) && D.years.some(n => n.year === bzYear)) return bzYear;
  return i === PRE ? D.years[0].year : D.startYear;
}

export function renderBazi() {
  const { bz } = S;
  renderPillars(bz);
  renderStrength(bz.strength);
  $('#bars').innerHTML = WX.map((w, i) => `<div class="bar wx-${WX_KEY[i]}"><b>${w}</b><div class="track" aria-hidden="true"><div class="fill" style="width:${bz.wuxing[i] / 8 * 100}%"></div></div><span class="n">${bz.wuxing[i]}</span></div>`).join('');
  $('#rels').innerHTML = relList(bz.relations, '原局沒有合、沖、刑、害。');
  const y = bz.yun;
  $('#yunhead').innerHTML = `<span><b>${yinyang(bz.P[0].gan)}${bz.male ? '男' : '女'}${bz.forward ? '順行' : '逆行'}</b></span>
      <span>出生後 <b>${y.y} 年 ${y.m} 個月 ${y.d} 天</b>起運，約 ${y.date} 交運${currentStep(bz) === PRE ? '（今天還沒起運）' : ''}</span>`;
  renderDayun();
  renderShensha(bz);
}

function renderPillars(bz) {
  const ps = bz.pillars;
  const dc = i => (i === 2 ? ' class="dcol"' : '');
  const row = (label, fn) => `<tr><th scope="row">${label}</th>${ps.map((p, i) => `<td${dc(i)}>${fn(p, i)}</td>`).join('')}</tr>`;
  $('#pillars').innerHTML = `
      <colgroup><col class="rh"><col><col><col><col></colgroup>
      <thead><tr><td></td>${ps.map((p, i) => `<th scope="col"${dc(i)}>${p.pos}柱</th>`).join('')}</tr></thead>
      <tbody>
        ${row('十神', (p, i) => `<span class="god${i === 2 ? ' dm' : ''}">${p.ganGod}</span>`)}
        ${row('天干', p => gzCell(p.gan))}
        ${row('地支', p => gzCell(p.zhi))}
        ${row('藏干', p => `<span class="cang">${p.cang.map((c, k) => `<span${k === 0 ? ' class="main"' : ''}><b class="${wxc(c.gan)}">${c.gan}</b> <em>${c.god}</em></span>`).join('')}</span>`)}
        ${row('星運', p => `<span class="sm">${p.star}</span>`)}
        ${row('自坐', p => `<span class="sm muted">${p.self}</span>`)}
        ${row('納音', p => `<span class="sm">${p.nayin}</span>`)}
        ${row('空亡', p => `<span class="sm muted">${p.kong}</span>`)}
      </tbody>`;
  $('#bz-sub').textContent = bz.gz.join('\u3000');
}

function renderStrength(st) {
  const roots = st.roots.length ? '有根：' + st.roots.map(r => `${r.pos}支${r.zhi}（藏${r.gan}${r.main ? '，本氣' : ''}）`).join('、') : '地支藏干裡沒有同五行的根';
  $('#strength').innerHTML = `
      <li><span class="q">得令</span><span class="v">${st.dm}${st.dmWx}生${st.month}月（${st.seasonWx}當令），日主處 <span class="verdict">${st.ling}</span>，${st.deLing ? '得令' : '失令'}</span></li>
      <li><span class="q">得地</span><span class="v">${roots}</span></li>
      <li><span class="q">得勢</span><span class="v">天干印星：${st.helpers.yin.join('、') || '無'}；天干比劫：${st.helpers.bi.join('、') || '無'}</span></li>`;
}

/* 一步大運或一個流年的按鈕。不另外給 aria-label：讀屏唸的就是按鈕上看得到的字（今、十神、干支、年、歲），
   畫面上有的資訊不會少，語音操作也能照著看到的字點（WCAG 2.5.3）。
   gz 是空字串的是「起運前」那一格：干支的位置畫兩道橫線，讀屏另外唸「還沒有大運干支」。
   edge：交運的那一年。這一年只有交運日的一側屬於這一格，畫面用虛線框標出；hint 是同一件事給讀屏的文字版 */
function yunBtn({ top, gz, bottom, y, a, pressed, now, data, edge = false, hint = '' }) {
  const glyphs = gz
    ? `<span class="c ${wxc(gz[0])}">${gz[0]}</span><span class="c ${wxc(gz[1])}">${gz[1]}</span>`
    : '<span class="c none" aria-hidden="true">—</span><span class="c none" aria-hidden="true">—</span><span class="vh">還沒有大運干支</span>';
  return `<button type="button" class="yun${edge ? ' edge' : ''}" aria-pressed="${pressed}" ${data}>
      ${now ? '<span class="now">今</span>' : ''}
      <span class="g">${top}</span>${glyphs}<span class="g">${bottom || '&nbsp;'}</span>
      <span class="y">${y}</span><span class="a">${a}</span>${hint ? `<span class="vh">${hint}</span>` : ''}</button>`;
}

function renderDayun() {
  const { bz } = S, cur = currentStep(bz), pre = S.dy === PRE, p = bz.pre;
  $('#dayun').innerHTML = yunBtn({
    top: '起運前', gz: '', bottom: '', y: p.endYear > p.startYear ? `${p.startYear}–${String(p.endYear).slice(-2)}` : `${p.startYear}`, a: p.endAge > 1 ? `1–${p.endAge} 歲` : '1 歲',
    pressed: pre, now: cur === PRE, data: `data-dy="${PRE}"`,
  }) + bz.dayun.map((d, i) => yunBtn({
    top: d.ganGod, gz: d.gz, bottom: d.zhiGod, y: `${d.startYear}–${String(d.endYear).slice(-2)}`, a: `${d.startAge}–${d.endAge} 歲`,
    pressed: i === S.dy, now: i === cur, data: `data-dy="${i}"`,
  })).join('');
  /* 大運在交運日換、流年在立春換，所以交運的那一年前後兩格各佔一段（引擎的 years 就是這樣列的）：
     大運的頭尾兩年都是交運年；起運前的頭一年是出生那一年，只有最後一年是交運年 */
  const D = stepOf(bz, S.dy), years = D.years, last = years.length - 1;
  if (!years.some(n => n.year === S.ln)) { S.ln = defaultYear(bz, S.dy); S.lm = null; }
  $('#ln-title').innerHTML = pre
    ? `起運前的流年 <small>約 ${D.endDate} 起運。這段時間還沒有大運干支，只列流年。虛線框是起運的那一年：起運之前才屬於這一段</small>`
    : `${D.gz}運的流年 <small>約 ${D.startDate} 交入、${D.endDate} 交出。虛線框是交運的那一年：頭一年在交入之後、最後一年在交出之前，才屬於這步運</small>`;
  $('#liunian').innerHTML = years.map((n, k) => yunBtn({
    top: n.ganGod, gz: n.gz, bottom: n.zhiGod, y: n.year, a: `${n.age} 歲`, edge: k === last || (k === 0 && !pre),
    pressed: n.year === S.ln, now: n.year === bzYear, data: `data-ln="${n.year}"`,
    hint: k === last ? (pre ? `約 ${D.endDate} 起運` : `約 ${D.endDate} 交出這步運`) : k === 0 && !pre ? `約 ${D.startDate} 交入這步運` : '',
  })).join('');
  const N = years.find(n => n.year === S.ln);
  /* 流月：選到的那個流年裡的十二個節氣月（流年以立春換年，十二個月正好鋪滿）。「今」以日為單位：交節當天就算新的月。
     讀屏另外聽得到完整的交節時刻 */
  const months = bzLiuYue(bz, N.year), M = S.lm === null ? null : months[S.lm];
  $('#lm-title').innerHTML = `${N.year} ${N.gz}年的流月 <small>十二個節氣月，每個月從交節的那一刻起算。點一個月，下面的關係多列一柱流月；再點一次取消</small>`;
  $('#liuyue').innerHTML = months.map(m => yunBtn({
    top: m.ganGod, gz: m.gz, bottom: m.zhiGod, y: m.jie, a: `${monthDay(m.from)} 起`,
    pressed: m.k === S.lm, now: m.from <= today && today < m.to, data: `data-lm="${m.k}"`, hint: `${m.from} ${m.time} 交${m.jie}`,
  })).join('');
  const sui = { pos: '歲', gan: N.gz[0], zhi: N.gz[1], natal: false };
  const P = bz.P.concat(pre ? [] : [{ pos: '運', gan: D.gz[0], zhi: D.gz[1], natal: false }], [sui], M ? [{ pos: '流月', gan: M.gz[0], zhi: M.gz[1], natal: false }] : []);
  // 選了流月，標題多寫這個月從哪一刻到哪一刻
  const what = `${pre ? '起運前' : `${D.gz}運`}、${N.year} ${N.gz}年${M ? `、${M.gz}月` : ''}`;
  const scope = M ? (pre ? '只列牽涉流年或流月的關係' : '只列牽涉運、歲或流月的關係') : pre ? '只列牽涉流年的關係' : '只列牽涉運或歲的關係';
  const when = M ? `。${M.gz}月從 ${M.from} ${M.time} 交${M.jie}起，到 ${M.to} 交${M.k < 11 ? months[M.k + 1].jie : '立春'}為止` : '';
  $('#ix-title').innerHTML = `${what} 與原局 <small>${scope}${when}</small>`;
  $('#ix').innerHTML = relList(relations(P, true), `${pre ? '' : '這一運、'}這一年${M ? '、這個月' : ''}和原局沒有合、沖、刑、害。`);
  reveal('#dayun'); reveal('#liunian'); reveal('#liuyue');
}

function renderShensha(bz) {
  const hits = bz.shensha.filter(s => s.hits.length);
  const miss = [...new Set(bz.shensha.filter(s => !bz.shensha.some(o => o.name === s.name && o.hits.length)).map(s => s.name))];
  $('#shensha').innerHTML = `<thead><tr><th scope="col">名稱</th><th scope="col">起例</th><th scope="col">查</th><th scope="col">盤中所見</th></tr></thead><tbody>${
    hits.map(s => `<tr><td>${s.name}</td><td>${s.basis}</td><td>${s.targets}</td><td>${s.hits.join('、')}</td></tr>`).join('') ||
    '<tr><td colspan="4" class="muted">常用神煞在原局都沒有出現。</td></tr>'}</tbody>`;
  $('#other').textContent = `${miss.length ? `原局未見：${miss.join('、')}。` : ''}胎元 ${bz.taiYuan}（月干進一、月支進三）。`;
}

export function initBaziView() {
  $('#dayun').addEventListener('click', e => {
    const b = e.target.closest('[data-dy]'); if (!b || !S.bz) return;
    if (Number(b.dataset.dy) !== S.dy) S.lm = null; // 換了一格運，流年跟著換，選到的流月取消
    S.dy = Number(b.dataset.dy);
    S.ln = defaultYear(S.bz, S.dy);
    renderDayun(); refocus(`[data-dy="${S.dy}"]`);
  });
  $('#liunian').addEventListener('click', e => {
    const b = e.target.closest('[data-ln]'); if (!b || !S.bz) return;
    if (Number(b.dataset.ln) !== S.ln) S.lm = null; // 換了流年，月份是另外十二個月
    S.ln = Number(b.dataset.ln);
    renderDayun(); refocus(`[data-ln="${S.ln}"]`);
  });
  $('#liuyue').addEventListener('click', e => {
    const b = e.target.closest('[data-lm]'); if (!b || !S.bz) return;
    const k = Number(b.dataset.lm);
    S.lm = S.lm === k ? null : k;
    renderDayun(); refocus(`[data-lm="${k}"]`);
  });
}
