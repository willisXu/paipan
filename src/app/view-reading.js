/* 讀盤（八字分頁最下面）與星曜解讀（紫微分頁最下面）兩張卡。
   內容由引擎的 bzReading()、bzJudge()、zwReading()、zwReadLayer() 組成；這裡只排成段落與表格，不另外推論。
   「先自己推論，再對答案」：卡片放在分頁最下面，分頁列有一顆「看讀盤 ↓」直接捲過來。讀盤不進文字盤，命令列也不印。 */
import { CANG, fmt, tenGod, bzReading, bzJudge, zwReading, zwReadLayer } from '../engine/index.js';
import { $, esc, copyText } from './dom.js';
import { S } from './state.js';
import { nameOf, placeLabel, usedNotes } from './format.js';
import { warningsOf } from './summary.js';
import { yunSel } from './view-bazi.js';
import { layers } from './view-ziwei.js';

// 十步大運表裡，角色的記號：✓ 喜用、✗ 忌、△ 待觀察、－ 閒神
const MARK = { 用神: '✓', 喜神: '✓', 忌神: '✗', 待觀察: '△', 閒神: '－' };
// 關係照採信標籤排：共識在前、存疑在後
const TAG_ORDER = ['共識', '參考', '存疑'];
// 這兩欄的字長，允許換行（其餘欄不換行，手機上整張表橫向捲）
const WRAP = ['理由', '一句話'];
// 這幾種關係的說明文字裡沒有寫出關係的名字，另外補在前面
const UNNAMED = ['天剋地沖', '伏吟', '歲運並臨'];
const list = (a, none = '無') => a.length ? a.join('、') : none;
const kv = (k, v, sub = false) => ({ k, v, sub });
// 一段：編號、名稱、結論、把握、採信標籤、依據（一行一行）、表（可以沒有）、段尾的說明
const step = (no, name, verdict, conf, tag, lines, table = null, after = []) => ({ no, name, verdict, conf, tag, lines: lines.filter(Boolean), table, after: after.filter(Boolean) });
// 單一個字的角色：借 bzJudge 查（天干配一個子、地支配一個甲，只取需要的那一半），例如「壬＝偏財，忌神」
const roleNote = (R, dm, c, isZhi) => {
  const j = bzJudge(R, dm, isZhi ? `甲${c}` : `${c}子`), x = isZhi ? j.zhi : j.gan;
  return `${c}＝${x.god}，${x.role}`;
};
// ⑥ ⑦ 的一行關係；天干五合、相沖與地支六合、六沖這四種兩個字的關係，另外寫出兩個字各是喜是忌
function relLine(r, P, R, dm) {
  const two = /^(天干五合|天干相沖|地支六合|地支六沖)$/.test(r.type) && r.where.length === 2;
  const isZhi = r.type.startsWith('地支');
  const chars = two ? r.where.map(pos => P.find(p => p.pos === pos)).map(p => isZhi ? p.zhi : p.gan) : [];
  return `${UNNAMED.includes(r.type) ? `${r.type}：` : ''}${r.text}（${r.where.join('×')}${r.dist ? '，' + r.dist : ''}）［${r.tag}］${two ? `\u3000${chars.map(c => roleNote(R, dm, c, isZhi)).join('；')}` : ''}`;
}
const byTag = rels => [...rels].sort((a, b) => TAG_ORDER.indexOf(a.tag) - TAG_ORDER.indexOf(b.tag));
const hidden = j => j.zhi.cang.length ? `另藏${j.zhi.cang.map(c => `${c.gan}（${c.god}，${c.role}）`).join('、')}` : '';
const judgeLine = (head, j) => kv(head, `天干${j.gan.c}＝${j.gan.god}（${j.gan.wx}，${j.gan.role}）；地支${j.zhi.c}＝本氣${j.zhi.god}（${j.zhi.wx}，${j.zhi.role}）${hidden(j) ? `，${hidden(j)}` : ''} → ${j.text}`);
/**
 * 八字讀盤紀錄：七段，每段是結論、把握、標籤與依據。不碰 DOM：畫面（stepHtml）與「複製讀盤紀錄」（recordText）用的都是這一份。
 * @param {object} chart 共用狀態 S，或同樣形狀的 { inp, rt, bz, zw }
 * @param {{dy: number, ln: number, lm: number|null}} sel 八字分頁選到的運、流年、流月：⑦ 跟著它們換
 */
export function bzRecord(chart, sel) {
  const { inp, rt, bz } = chart, dm = bz.dm, R = bzReading(bz), { overview: o, strength: v, pattern: p, xiji: x } = R;
  const warns = warningsOf(chart).length;
  const steps = [];
  steps.push(step('①', '資料與立場', '', '', '', [
    `${fmt(rt.clock)}，${inp.gender}命，${placeLabel(inp)}。`,
    `排盤用時 ${fmt(rt.local)}：${usedNotes(inp, rt).join('；')}。`,
    `子時立場：${inp.ziRule === 'same' ? '夜子時不換日' : '23:00 換日換柱'}。`,
    warns ? `命主資訊有 ${warns} 則提醒，先複核再往下讀：資料錯了，後面每一步都會跟著錯。` : ''
  ]));
  const where = c => !c.tou.length && !c.cang.length ? '盤上沒有' : !c.tou.length ? `藏而不透（${c.cang.map(z => `${z.zhi}中${z.gan}`).join('、')}）` : `透${c.tou.map(t => `${t.pos}干${t.gan}`).join('、')}${c.cang.length ? `；藏${c.cang.map(z => `${z.zhi}中${z.gan}`).join('、')}` : ''}`;
  steps.push(step('②', '概覽', `日主${o.dm}${o.dmWx}，月令${o.month}`, '', '', [
    `日主${o.dm}（${o.dmYY}${o.dmWx}），生在${o.month}月，${o.seasonWx}當令。`,
    kv('天干', `${o.stems.map(s => `${s.pos}干${s.gan} ${s.god}`).join('、')}。`),
    ...[4, 0, 1, 2, 3].map(k => kv(`${o.classes[k].name}（${o.classes[k].wx}）`, `${where(o.classes[k])}。`)),
    o.missing.length ? `整張盤沒有${o.missing.join('、')}（天干和藏干都沒有）。沒有不等於要補：用神看需要，不看缺不缺。` : ''
  ]));
  const st = bz.strength;
  steps.push(step('③', '旺衰', v.text, v.conf, '', [
    kv('得令', `${st.dm}${st.dmWx}生${st.month}月（${st.seasonWx}當令），日主是「${st.ling}」 → ${st.deLing ? '得令 ✓' : '失令 ✗'}`),
    kv('得地', st.roots.length ? `${st.roots.map(r => `${r.pos}支${r.zhi}藏${r.gan}${r.main ? '（本氣）' : ''}`).join('、')} → 有根 ✓` : '地支藏干裡沒有同五行的根 → 無根 ✗'),
    kv('得勢', `幫身的 ${list(v.helpers)}；剋身的 ${list(v.ke)}；洩身、耗身的 ${list(v.xie)} → ${v.shi}${v.shi === '得勢' ? ' ✓' : v.shi === '勢弱' ? ' ✗' : ''}（${v.shiNote}）`),
    kv('綜合', `${v.why} → ${v.text}。${v.kind === 'unclear' ? '月令和另外兩看互相拉扯，接近中和：偏強還是偏弱要看根的輕重與全局，這裡不下結論。' : ''}`),
    ...v.special.map(s => kv(`可能是${s.name}［參考］`, s.text))
  ]));
  const monthCang = bz.pillars[1].cang.map((c, n) => `${['本氣', '中氣', '餘氣'][n]}${c.gan}（${c.god}）`).join('、');
  const f = p.from;
  steps.push(step('④', '格局', p.name + (p.notes.some(n => n.startsWith('官殺混雜')) ? '（官殺混雜）' : ''), p.conf, p.tag, p.kind === 'zheng' ? [
    kv(`月令${o.month}`, `${monthCang}。`),
    kv('取格', p.step === 1 ? `本氣${f.gan}透出${f.tou.join('、')}干 → 取本氣：${p.name}。` : p.step === 2 ? `本氣${CANG[o.month][0]}不透，${f.layer}${f.gan}（${tenGod(dm, f.gan)}）透出${f.tou.join('、')}干 → 取${f.gan}：${p.name}。` : `月令的藏干都沒有透出 → 以本氣${f.gan}論：${p.name}。`),
    kv('用法', `${p.use}，${p.how}。`),
    p.path ? kv('這張盤', p.path) : '',
    ...p.notes.map(n => n.startsWith('官殺混雜') ? kv('官殺混雜［參考］', n.replace(/^官殺混雜：/, '')) : n)
  ] : [kv(`月令${o.month}`, `${monthCang}。`), p.how, ...p.notes, '建祿、月刃、月令是比劫這一類，教材列為參考，把握標低。']));
  const names = role => x.rows.filter(r => r.role === role).map(r => r.wx);
  const summary = [
    x.yong ? `用${x.yong}` : '',
    names('喜神').length ? `喜${names('喜神').join('、')}` : '',
    names('忌神').length ? `忌${names('忌神').join('、')}` : '',
    names('待觀察').length ? `${names('待觀察').join('、')}待觀察` : ''
  ].filter(Boolean).join('；') || '定不出喜忌';
  steps.push(step('⑤', '喜忌', summary, x.conf, '', x.angles.map(a => kv(`${a.name}${a.tag ? `［${a.tag}］` : ''}`, a.says)), {
    caption: '五行各自的角色（＋贊成、－反對）',
    head: ['角色', '五行', '理由', '角度'],
    on: -1,
    rows: x.rows.map(r => [
      r.role,
      `${r.wx}（${r.cls}）`,
      [r.pro.length ? `＋${r.pro.join('、')}` : '', r.con.length ? `－${r.con.join('、')}` : ''].filter(Boolean).join('\u3000') || '三個角度都沒有提到',
      [r.plus.length ? `＋${r.plus.join('、')}` : '', r.minus.length ? `－${r.minus.join('、')}` : ''].filter(Boolean).join('\u3000') || '—'
    ])
  }, [...x.notes, '用神是分析的結論，不是開運清單：不必靠顏色、飾品去「補」。']));
  steps.push(step(
    '⑥',
    '關係',
    '',
    '',
    '',
    bz.relations.length ? byTag(bz.relations).map(r => relLine(r, bz.P, R, dm)) : ['原局沒有合、沖、刑、害。'],
    null,
    [bz.relations.length ? '合、沖的好壞要看牽動的字是喜是忌：沖走忌神和沖壞用神，意義相反。標存疑的只作紀錄，不拿來說話。' : '']
  ));
  const Y = yunSel(bz, sel.dy, sel.ln, sel.lm), P7 = bz.P.concat(
    Y.pre ? [] : [{ pos: '運', gan: Y.D.gz[0], zhi: Y.D.gz[1] }],
    [{ pos: '歲', gan: Y.N.gz[0], zhi: Y.N.gz[1] }],
    Y.M ? [{ pos: '流月', gan: Y.M.gz[0], zhi: Y.M.gz[1] }] : []
  );
  const lines7 = [
    x.conf === '低' ? '喜忌的把握低，下面的對照只能當參考。' : '',
    Y.pre ? `起運前（約 ${Y.D.endDate} 起運）：還沒有大運干支，只看流年。` : judgeLine(`${Y.D.gz}運（${Y.D.startYear}–${Y.D.endYear}，${Y.D.startAge}–${Y.D.endAge} 歲）`, bzJudge(R, dm, Y.D.gz)),
    judgeLine(`${Y.N.year} ${Y.N.gz}年（${Y.N.age} 歲）`, bzJudge(R, dm, Y.N.gz)),
    Y.M ? judgeLine(`${Y.M.gz}月（${Y.M.jie}，${Y.M.from} 起）［參考］`, bzJudge(R, dm, Y.M.gz)) : '',
    ...Y.rels.length ? byTag(Y.rels).map(r => relLine(r, P7, R, dm)) : [Y.none]
  ];
  steps.push(step('⑦', '運歲', Y.what, '', '', lines7, {
    caption: '十步大運對照喜忌［參考］',
    head: ['大運', '年', '天干', '地支', '一句話'],
    on: Y.pre ? -1 : sel.dy,
    rows: bz.dayun.map(d => {
      const j = bzJudge(R, dm, d.gz);
      return [d.gz, `${d.startYear}–${String(d.endYear).slice(-2)}`, `${j.gan.c}${j.gan.god} ${MARK[j.gan.role]}`, `${j.zhi.c}${j.zhi.god} ${MARK[j.zhi.role]}`, `${j.text}${hidden(j) ? `；地支${hidden(j)}` : ''}`];
    })
  }, [
    '✓ 喜用\u3000✗ 忌\u3000△ 待觀察\u3000－ 閒神。地支看本氣；大運的地支影響通常比天干深。',
    '要寫成推論，得說出時間、領域、依據與把握（教材第 16、18 講）。這裡只列依據；發生在哪個領域，要自己判斷。'
  ]));
  return { title: `讀盤紀錄\u3000${nameOf(inp)}\u3000${bz.gz.join(' ')}`, steps };
}
/**
 * 紫微星曜解讀：本命四段；疊了大限或童限時多一段運限。和讀盤一樣不碰 DOM，畫面與複製共用。
 * @param {object} chart 共用狀態 S
 * @param {object|null} L view-ziwei.js 的 layers()：目前疊上的運限，本命盤是 null
 */
export function zwNotes(chart, L) {
  const { inp, zw } = chart, R = zwReading(zw), c = zw.chart;
  const star = s => [
    kv(`${s.name}${s.bright ? `（${s.bright}）` : ''}${s.hua ? `化${s.hua}` : ''}`, `${s.nature}。`),
    kv('發揮得好', `${s.good}。`, true),
    kv('要留意', `${s.care}。`, true),
    s.brightNote ? kv('亮度', s.brightNote.replace(/^亮度/, ''), true) : ''
  ];
  const m = R.ming, stars = m.empty ? m.borrowed : m.stars;
  const steps = [];
  steps.push(step('', '命宮主星', m.empty ? `空宮，借${list(m.borrowed.map(s => s.name), '對宮')}` : stars.map(s => s.name).join('、'), '', '參考', [
    `命宮在${m.gz}宮。${m.note}`,
    ...stars.flatMap(star),
    stars.length > 1 ? '兩顆主星同宮：兩種特質並存，互相牽制，也互相補足。' : ''
  ]));
  steps.push(step('', '身宮', R.body.palace === '命宮' ? '命身同宮' : `在${R.body.palace}宮`, '', '參考', [R.body.text, '身宮看的是後天的重心，通行的說法是中年以後比較明顯。']));
  steps.push(step('', '生年四化', R.sihua.map(h => `${h.star}${h.hua}`).join('、'), '', '參考', [`${zw.yearGZ[0]}年生：${R.sihua.map(h => `${h.star}化${h.hua}`).join('、')}。`, ...R.sihua.map(h => h.text)]));
  const a = R.around, at = z => `${z.name}（${z.palace}），${z.text}`;
  steps.push(step('', '命宮的三方四正', a.text.split('：')[0], '', '參考', [
    '看命宮、財帛、官祿、遷移這四宮裡的六吉星、六煞星。',
    a.lucky.length ? kv('吉星', `${a.lucky.map(at).join('；')}。`) : '',
    a.sha.length ? kv('煞星', `${a.sha.map(at).join('；')}。`) : '',
    a.other.length ? kv('另有', `${a.other.map(at).join('；')}。`) : '',
    a.text
  ]));
  if (L) {
    const one = (head, layer, when) => {
      const n = zwReadLayer(zw, layer, when);
      return [kv(head, n.text), ...n.hua.map(h => {
        const cut = h.text.indexOf('：');
        return kv(h.text.slice(0, cut), h.text.slice(cut + 1), true);
      })];
    };
    steps.push(step('', '疊上的運限', [L.dec && !L.dec.child ? `大限 ${L.dec.gz}` : '', L.yr ? `流年 ${L.yr.year} ${L.yr.gz}` : ''].filter(Boolean).join('、') || '童限', '', '參考', [
      ...L.dec && !L.dec.child ? one(`大限 ${L.dec.ages.join('–')} 歲 ${L.dec.gz}`, L.dec, '這十年') : ['童限期間每年走的宮不同，這裡不另外解讀。'],
      ...L.yr ? one(`流年 ${L.yr.year} ${L.yr.gz}（${L.age} 歲）`, L.yr, '這一年') : [],
      '運限的四化落在本命的哪一宮，是把運限和本命疊在一起看的讀法；流月、流日、流時不另外寫。'
    ]));
  }
  return { title: `星曜解讀\u3000${nameOf(inp)}\u3000命宮${c.palaces.find(p => p.name === '命宮').earthlyBranch}`, steps };
}
// 讀盤紀錄、星曜解讀排成純文字：標題列、依據一行一行、表格一列一行（選到的那一列標 ▶），最後是頁尾的說明
export function recordText(rec, foot) {
  const out = [rec.title];
  for (const s of rec.steps) {
    out.push('', `${s.no ? s.no + ' ' : '■ '}${s.name}${s.verdict ? `：${s.verdict}` : ''}${s.conf ? `［把握${s.conf}］` : ''}${s.tag ? `［${s.tag}］` : ''}`);
    s.lines.forEach(l => out.push(typeof l === 'string' ? `\u3000${l}` : `\u3000${l.sub ? '\u3000' : ''}${l.k}：${l.v}`));
    if (s.table) {
      out.push(`\u3000${s.table.caption}`);
      s.table.rows.forEach((r, i) => out.push(`\u3000${i === s.table.on ? '▶' : '・'}${r.join('｜')}`));
    }
    s.after.forEach(l => out.push(`\u3000${l}`));
  }
  out.push('', foot);
  return out.join('\n');
}
// 複製出來的文字最後一段：說明這是什麼、守什麼分寸（畫面上同樣的話寫在卡片的頭尾）
export const BZ_FOOT = '照《八字命理二十講》第 18 講的七步法由程式排出，說的是傾向，不是判決。三看怎麼綜合、三個角度怎麼合成喜忌，是工具自己訂的規則；請先自己推論，再拿來對答案。不作健康判斷，不論斷家人的吉凶。';
export const ZW_FOOT = '坊間通行說法的整理，全部列為參考，不是哪一派的定論。說的是傾向，不是判決；不作健康判斷，不論斷家人的吉凶。';
// 畫面：文字裡的［共識］［參考］［存疑］換成採信標籤；把握程度畫成三個點加上文字（不只靠顏色）
const rich = s => esc(s).replace(/［(共識|參考|存疑)］/g, ' <span class="tag t-$1">$1</span> ');
const confHtml = c => c ? `<span class="conf c-${c}"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>把握${c}</span>` : '';
const lineHtml = l => typeof l === 'string' ? `<li>${rich(l)}</li>` : `<li${l.sub ? ' class="dep"' : ''}><b class="k">${rich(l.k)}</b> <span>${rich(l.v)}</span></li>`;
// 一段的 HTML。表格包在可以橫向捲的區塊裡
function stepHtml(s) {
  const t = s.table;
  const cell = (v, head) => head === '角色' ? `<span class="role r-${v}">${v}</span>` : rich(v);
  return `<section class="rs">
      <h3>${s.no ? `<span class="no" aria-hidden="true">${s.no}</span><span class="vh">第 ${'①②③④⑤⑥⑦'.indexOf(s.no) + 1} 步</span>` : ''}<span class="nm">${s.name}</span>${s.verdict ? `<span class="vd">${esc(s.verdict)}</span>` : ''}${confHtml(s.conf)}${s.tag ? `<span class="tag t-${s.tag}">${s.tag}</span>` : ''}</h3>
      <ul class="ev">${s.lines.map(lineHtml).join('')}</ul>
      ${t ? `<div class="scroll-x"><table class="ss rt"><caption>${rich(t.caption)}</caption><thead><tr>${t.head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r, i) => `<tr${i === t.on ? ' class="on"' : ''}>${r.map((v, k) => `<td${WRAP.includes(t.head[k]) ? ' class="w"' : ''}>${cell(v, t.head[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
      ${s.after.map(l => `<p class="note">${rich(l)}</p>`).join('')}
    </section>`;
}
// 收合狀態存在瀏覽器（兩張卡共用一個）。瀏覽器不讓存時照樣能收，只是下次不記得
const KEY = 'paipan.reading';
const isOpen = () => {
  try {
    return localStorage.getItem(KEY) !== 'closed';
  } catch (e) {
    return true;
  }
};
function applyOpen(open) {
  for (const id of ['rd', 'zr']) {
    $(`#${id}-body`).hidden = !open;
    $(`#${id}`).classList.toggle('closed', !open);
    const b = $(`#${id}-toggle`);
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? '收起' : '展開';
  }
}
// 表格比畫面寬、真的能捲時，才讓捲動區塊可以用鍵盤聚焦、給讀屏一個名稱；排得下的時候不加，免得多出沒用的停駐點
function markScroll() {
  document.querySelectorAll('.rd .scroll-x').forEach(el => {
    if (el.scrollWidth > el.clientWidth + 1) {
      el.tabIndex = 0;
      el.setAttribute('role', 'region');
      el.setAttribute('aria-label', `${el.querySelector('caption').textContent.replace(/\s+/g, '')}，可以左右捲動`);
    } else for (const a of ['tabindex', 'role', 'aria-label']) el.removeAttribute(a);
  });
}
// 目前的盤和選到的運限
const bzRec = () => bzRecord(S, { dy: S.dy, ln: S.ln, lm: S.lm });
const zwRec = () => zwNotes(S, layers());
export function renderBzReading() {
  if (S.bz) {
    $('#rd-steps').innerHTML = bzRec().steps.map(stepHtml).join('');
    markScroll();
  }
}
export function renderZwReading() {
  if (S.zw) {
    $('#zr-steps').innerHTML = zwRec().steps.map(stepHtml).join('');
    markScroll();
  }
}
// 註冊事件：收合、看讀盤（捲到目前分頁的那張卡並把焦點放在標題）、兩顆複製；八字的運、年、月與紫微的運限列一點就重寫
export function initReadingView() {
  applyOpen(isOpen());
  for (const id of ['rd', 'zr']) {
    $(`#${id}-toggle`).addEventListener('click', () => {
      const open = $(`#${id}-body`).hidden;
      try {
        localStorage.setItem(KEY, open ? 'open' : 'closed');
      } catch (e) { /* 瀏覽器不讓存（例如無痕模式）：照樣收合，只是下次不記得 */ }
      applyOpen(open);
    });
  }
  $('#goto-read').addEventListener('click', () => {
    const card = $('#p-bazi').hidden ? $('#zr') : $('#rd'), calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    card.querySelector('h2').focus({ preventScroll: true });
  });
  $('#rd-copy').addEventListener('click', () => {
    if (S.bz) copyText(recordText(bzRec(), BZ_FOOT), '讀盤紀錄已複製', '讀盤紀錄');
  });
  $('#zr-copy').addEventListener('click', () => {
    if (S.zw) copyText(recordText(zwRec(), ZW_FOOT), '星曜解讀已複製', '星曜解讀');
  });
  for (const sel of ['#dayun', '#liunian', '#liuyue']) $(sel).addEventListener('click', e => {
    if (e.target.closest('button')) renderBzReading();
  });
  $('.yunbar').addEventListener('click', e => {
    if (e.target.closest('button')) renderZwReading();
  });
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(markScroll);
    ro.observe($('#rd-steps'));
    ro.observe($('#zr-steps'));
  }
}
