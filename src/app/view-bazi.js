/* 八字分頁：四柱表、旺衰三看、五行字數、原局關係、大運流年、神煞，以及大運、流年的點選。 */
import { relations, WX, WX_KEY, wxOf, yinyang } from '../engine/index.js';
import { $, reveal, refocus } from './dom.js';
import { S, bzYear, today } from './state.js';

const wxc = c => 'wx-' + WX_KEY[wxOf(c)];
const wxName = c => yinyang(c) + WX[wxOf(c)];
const gzCell = c => `<span class="gz"><b class="${wxc(c)}">${c}</b><small>${wxName(c)}</small></span>`;

function relList(list, emptyText) {
  if (!list.length) return `<p class="empty">${emptyText}</p>`;
  return list.map(r => `<div class="rel"><span class="ty">${r.type}</span><span class="tx">${r.text}</span><span class="wh">${[...r.where].join('×')}${r.dist ? ' · ' + r.dist : ''} <span class="tag t-${r.tag}">${r.tag}</span></span>${r.note ? `<span class="nt">${r.note}</span>` : ''}</div>`).join('');
}

// 今天走到哪一步大運：以交運日為準，不是以年。還沒起運回傳 -1
export const currentDayun = bz => bz.dayun.reduce((cur, d, i) => (d.startDate <= today ? i : cur), -1);
/* 某步運要列出的流年：自己的十年，加上交入下一運的那一年——交運日之前那一年仍屬本運。
   一、二月間已交運但還沒過立春時，「今年」是上一運的最後一年，這時把它補在最前面。 */
export function yearsOf(bz, i) {
  const prev = i > 0 && bz.dayun[i - 1].years[9], next = bz.dayun[i + 1] && bz.dayun[i + 1].years[0];
  return [...(prev && prev.year === bzYear && i === currentDayun(bz) ? [prev] : []), ...bz.dayun[i].years, ...(next ? [next] : [])];
}

export function renderBazi() {
  const { bz } = S;
  renderPillars(bz);
  renderStrength(bz.strength);
  $('#bars').innerHTML = WX.map((w, i) => `<div class="bar wx-${WX_KEY[i]}"><b>${w}</b><div class="track" aria-hidden="true"><div class="fill" style="width:${bz.wuxing[i] / 8 * 100}%"></div></div><span class="n">${bz.wuxing[i]}</span></div>`).join('');
  $('#rels').innerHTML = relList(bz.relations, '原局沒有合、沖、刑、害。');
  const y = bz.yun;
  $('#yunhead').innerHTML = `<span><b>${yinyang(bz.P[0].gan)}${bz.male ? '男' : '女'}${bz.forward ? '順行' : '逆行'}</b></span>
      <span>出生後 <b>${y.y} 年 ${y.m} 個月 ${y.d} 天</b>起運，約 ${y.date} 交運</span>`;
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

function yunBtn({ top, gz, bottom, y, a, pressed, now, data, label }) {
  return `<button type="button" class="yun" aria-pressed="${pressed}" aria-label="${label}" ${data}>
      ${now ? '<span class="now">今</span>' : ''}
      <span class="g">${top}</span><span class="c ${wxc(gz[0])}">${gz[0]}</span><span class="c ${wxc(gz[1])}">${gz[1]}</span><span class="g">${bottom}</span>
      <span class="y">${y}</span><span class="a">${a}</span></button>`;
}

function renderDayun() {
  const { bz } = S, cur = currentDayun(bz);
  $('#dayun').innerHTML = bz.dayun.map((d, i) => yunBtn({
    top: d.ganGod, gz: d.gz, bottom: d.zhiGod, y: `${d.startYear}–${String(d.endYear).slice(-2)}`, a: `${d.startAge}–${d.endAge} 歲`,
    pressed: i === S.dy, now: i === cur, data: `data-dy="${i}"`,
    label: `${d.gz}運，${d.startYear} 到 ${d.endYear} 年，${d.startAge} 到 ${d.endAge} 歲`,
  })).join('');
  const D = bz.dayun[S.dy], years = yearsOf(bz, S.dy), nextD = bz.dayun[S.dy + 1];
  if (!years.some(n => n.year === S.ln)) S.ln = D.years[0].year;
  $('#ln-title').innerHTML = `${D.gz}運的流年 <small>約 ${D.startDate} 交入${nextD ? `，${nextD.startDate} 交出；最後一格 ${nextD.startYear} 年在交運日之前仍屬本運` : ''}</small>`;
  $('#liunian').innerHTML = years.map(n => yunBtn({
    top: n.ganGod, gz: n.gz, bottom: n.zhiGod, y: n.year, a: `${n.age} 歲`,
    pressed: n.year === S.ln, now: n.year === bzYear, data: `data-ln="${n.year}"`, label: `${n.year} ${n.gz}年，${n.age} 歲`,
  })).join('');
  const N = years.find(n => n.year === S.ln);
  const P = bz.P.concat([{ pos: '運', gan: D.gz[0], zhi: D.gz[1], natal: false }, { pos: '歲', gan: N.gz[0], zhi: N.gz[1], natal: false }]);
  $('#ix-title').innerHTML = `${D.gz}運、${N.year} ${N.gz}年 與原局 <small>只列牽涉運或歲的關係</small>`;
  $('#ix').innerHTML = relList(relations(P, true), '這一運、這一年和原局沒有合、沖、刑、害。');
  reveal('#dayun'); reveal('#liunian');
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
    S.dy = Number(b.dataset.dy);
    S.ln = S.dy === currentDayun(S.bz) && yearsOf(S.bz, S.dy).some(n => n.year === bzYear) ? bzYear : S.bz.dayun[S.dy].years[0].year;
    renderDayun(); refocus(`[data-dy="${S.dy}"]`);
  });
  $('#liunian').addEventListener('click', e => {
    const b = e.target.closest('[data-ln]'); if (!b || !S.bz) return;
    S.ln = Number(b.dataset.ln);
    renderDayun(); refocus(`[data-ln="${S.ln}"]`);
  });
}
