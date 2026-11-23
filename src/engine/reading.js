import { WX, CANG, yinyang, tenGod, changSheng, gi, zi, ganWxI } from './ganzhi.js';

const CLS = ['比劫', '食傷', '財', '官殺', '印'];
const clsOf = (dm, g) => (ganWxI(g) - ganWxI(dm) + 5) % 5;
const LAYER = ['本氣', '中氣', '餘氣'];
function overviewOf(bz) {
  const { dm, pillars } = bz, d = ganWxI(dm);
  const classes = CLS.map((name, k) => ({ k, name, wx: WX[(d + k) % 5], tou: [], cang: [] }));
  pillars.forEach((p, i) => {
    if (i !== 2) classes[clsOf(dm, p.gan)].tou.push({ pos: p.pos, gan: p.gan, god: p.ganGod });
    p.cang.forEach((c, n) => classes[clsOf(dm, c.gan)].cang.push({ pos: p.pos, zhi: p.zhi, gan: c.gan, god: c.god, main: n === 0 }));
  });
  return {
    dm,
    dmYY: yinyang(dm),
    dmWx: WX[d],
    month: pillars[1].zhi,
    seasonWx: bz.strength.seasonWx,
    stems: pillars.filter((p, i) => i !== 2).map(p => ({ pos: p.pos, gan: p.gan, god: p.ganGod })),
    classes,
    missing: classes.filter(c => c.k !== 0 && !c.tou.length && !c.cang.length).map(c => c.wx)
  };
}
function verdictOf(bz) {
  const st = bz.strength, dm = bz.dm;
  const others = bz.pillars.filter((p, i) => i !== 2), at = p => `${p.pos}干${p.gan}`;
  const helpers = st.helpers.yin.concat(st.helpers.bi);
  const ke = others.filter(p => clsOf(dm, p.gan) === 3).map(at);
  const xie = others.filter(p => [1, 2].includes(clsOf(dm, p.gan))).map(at);
  const h = helpers.length, k = ke.length;
  const g = h >= 2 ? 2 : h === 1 && k === 0 ? 1 : h === 1 && k === 1 ? 0 : -1;
  const shi = g > 0 ? '得勢' : g === 0 ? '持平' : '勢弱';
  const shiNote = g === 2 ? '幫身的佔多數' : g === 1 ? '只有一個幫身，但沒有官殺來剋' : g === 0 ? '幫身的和剋身的各一個' : h ? '剋身的比幫身的多' : '天干沒有印，也沒有比劫';
  const rooted = st.roots.length > 0, mainRoot = st.roots.some(r => r.main);
  let text, kind, conf;
  const set = (t, kd, c) => {
    text = t;
    kind = kd;
    conf = c;
  };
  if (st.ling === '旺') {
    if (g > 0) set('身強', 'strong', '高');
    else if (g === 0) set('身強', 'strong', '中');
    else if (k >= 2 && !h) set('強弱接近', 'unclear', '低');
    else set('偏強', 'strong', '中');
  } else if (st.deLing) {
    if (rooted && g > 0) set('身強', 'strong', g === 2 ? '高' : '中');
    else if (rooted && g === 0 || !rooted && g === 2) set('偏強', 'strong', '中');
    else set('強弱接近', 'unclear', '低');
  } else if (g === -1) set(rooted ? '身弱有根' : '身弱無根', 'weak', '高');
  else if (g === 0) set(rooted ? '偏弱有根' : '身弱無根', 'weak', '中');
  else if (g === 1) set(rooted ? '偏弱有根' : '偏弱', 'weak', '中');
  else if (!rooted) set('偏弱', 'weak', '中');
  else if (h === 3 && mainRoot) set('偏強', 'strong', '中');
  else set('強弱接近', 'unclear', '低');
  const why = `${st.deLing ? `得令（${st.ling}）` : `失令（${st.ling}）`}、${rooted ? mainRoot ? '有根' : '有根（不是本氣根）' : '無根'}、${shi}`;
  const special = [];
  if (!st.deLing && !rooted && !h) {
    special.push({ name: '從格', text: '日主失令、無根，天干也沒有印和比劫：可能要論從格（日主極弱，順從最強的那一股勢）。從格的條件很嚴；成立的話，第 5 步列的喜忌要反過來看。' });
  }
  if (st.ling === '旺' && h === 3 && new Set(st.roots.map(r => r.pos)).size >= 3) {
    special.push({ name: '專旺格', text: `月令是${st.dmWx}、三個天干都是印和比劫、地支三處以上有根：可能要論專旺格（一行獨旺）。成立的話要順著旺勢取喜忌，第 5 步列的喜忌就不適用。` });
  }
  return { ling: st.ling, deLing: st.deLing, rooted, mainRoot, shi, shiNote, helpers, ke, xie, text, kind, conf, why, special };
}
const GE = {
  正官: ['順用', '喜財生官、印護官', [2, 4]],
  七殺: ['逆用', '喜食神制殺，或印化殺', [1, 4]],
  正財: ['順用', '喜食傷生財、官星護財', [1, 3]],
  偏財: ['順用', '喜食傷生財、官星護財', [1, 3]],
  正印: ['順用', '喜官殺生印', [3]],
  食神: ['順用', '喜食神生財，忌偏印奪食', [2]],
  傷官: ['逆用', '喜印制傷官，或傷官生財', [4, 2]]
};
function patternOf(bz, ov) {
  const dm = bz.dm, m = bz.pillars[1].zhi, C = CANG[m];
  const stems = bz.pillars.filter((p, i) => i !== 2);
  const cs = changSheng(dm, m), earth = ganWxI(dm) === 2;
  const special = (kind, name, how, votes) => ({
    kind,
    name,
    god: '',
    from: null,
    step: 0,
    use: kind === 'yueren' ? '逆用' : '',
    how,
    path: '',
    notes: earth && kind !== 'bijie' ? [`戊己土的祿、刃跟著火走（火土同宮）；也有人改照月令本氣${C[0]}（${tenGod(dm, C[0])}）取格。`] : [],
    votes,
    conf: '低',
    tag: '參考'
  });
  if (cs === '臨官') return special('jianlu', '建祿格', `月令${m}是日主${dm}的祿：日主本身就旺，不取八正格，重點看財、官殺、食傷。`, [2, 3, 1]);
  if (gi(dm) % 2 === 0 && cs === '帝旺') return special('yueren', '月刃格', `陽干${dm}生在帝旺的${m}月：月刃，喜官殺制刃。`, [3]);
  if (clsOf(dm, C[0]) === 0) return special('bijie', '月令是比劫', `月令${m}的本氣${C[0]}是${tenGod(dm, C[0])}：不取八正格，重點看財與食傷。`, [2, 1]);
  const cand = C.map((g, n) => ({ g, n, god: tenGod(dm, g), tou: stems.filter(p => p.gan === g).map(p => p.pos) })).filter(c => clsOf(dm, c.g) !== 0);
  const touched = cand.filter(c => c.tou.length);
  const pick = touched.find(c => c.n === 0) || touched[0] || cand[0];
  const step = pick.tou.length ? pick.n === 0 ? 1 : 2 : 3;
  const notes = [];
  if (step === 2) touched.filter(c => c !== pick).forEach(c => notes.push(`${LAYER[c.n]}${c.g}（${c.god}）也透出${c.tou.join('、')}干：取哪一個各家做法不同，這裡先取${LAYER[pick.n]}。`));
  const mate = { 正官: '七殺', 七殺: '正官' }[pick.god];
  const mixed = mate ? stems.filter(p => p.ganGod === mate) : [];
  if (mixed.length) notes.push(`官殺混雜：${mixed.map(p => `${p.pos}干${p.gan}（${mate}）`).join('、')}也透出，官和殺同見，力量更雜。`);
  const has = k => ov.classes[k].tou.length + ov.classes[k].cang.length > 0;
  let use, how, votes, path = '';
  if (pick.god === '偏印') {
    const shi = bz.pillars.some((p, i) => i !== 2 && p.ganGod === '食神' || p.cang.some(c => c.god === '食神'));
    [use, how, votes] = shi ? ['逆用', '盤上有食神，偏印會奪食（叫梟神），喜財制梟', [2]] : ['順用', '盤上沒有食神，偏印不奪食，照印格看：喜官殺生印', [3]];
  } else [use, how, votes] = GE[pick.god];
  if (pick.god === '七殺') path = has(1) ? has(4) ? '盤上有食傷也有印：可以制，也可以化，看旺衰決定走哪一條。' : '盤上有食傷、沒有印：走食神制殺。' : has(4) ? '盤上沒有食傷：不能制殺，走印化殺。' : '盤上沒有食傷，也沒有印：制、化都要等運歲來補。';
  if (pick.god === '傷官') path = has(4) ? has(2) ? '盤上有印也有財：可以用印制，也可以讓傷官生財，看旺衰決定。' : '盤上有印、沒有財：走印制傷官。' : has(2) ? '盤上沒有印：走傷官生財。' : '盤上沒有印，也沒有財：兩條路都要等運歲來補。';
  return {
    kind: 'zheng',
    name: `${pick.god}格`,
    god: pick.god,
    from: { gan: pick.g, layer: LAYER[pick.n], tou: pick.tou },
    step,
    use,
    how,
    path,
    notes,
    votes,
    conf: step === 1 && !mixed.length ? '高' : '中',
    tag: ''
  };
}
const SHENG = (a, b) => (a + 1) % 5 === b;
const KE = (a, b) => (a + 2) % 5 === b;
const TIAOHOU = z => {
  const k = zi(z);
  if (k === 11 || k <= 1) return [1, `${z}月是冬天，寒：喜火暖局`, '暖局'];
  if (k >= 5 && k <= 7) return [4, `${z}月是夏天，燥熱：喜水潤燥`, '潤燥'];
  if (k === 2) return [1, '寅月是春初，還有餘寒：仍喜火', '暖局'];
  if (k >= 8 && k <= 10) return [4, `${z}月是秋天，漸燥${k === 10 ? '（戌月尤其燥）' : ''}：喜水滋潤`, '潤燥'];
  return null;
};
const FUYI_WHY = { weak: ['幫身', '洩身', '耗身', '剋身', '生身'], strong: ['再幫身就過旺', '洩身', '耗身', '制身', '再生身就過旺'] };
const GE_WHY = {
  正官格: { 2: '生官', 4: '護官' },
  七殺格: { 1: '制殺', 4: '化殺' },
  正財格: { 1: '生財', 3: '護財' },
  偏財格: { 1: '生財', 3: '護財' },
  正印格: { 3: '生印' },
  偏印格: { 2: '制梟', 3: '生印' },
  食神格: { 2: '食神生財' },
  傷官格: { 4: '制傷官', 2: '傷官生財' },
  月刃格: { 3: '制刃' },
  建祿格: { 2: '建祿喜財', 3: '建祿喜官殺', 1: '建祿喜食傷' },
  月令是比劫: { 2: '月令比劫喜財', 1: '月令比劫喜食傷' }
};
function xiJi(bz, ov, v, pat) {
  const d = ganWxI(bz.dm), month = bz.pillars[1].zhi;
  const rows = CLS.map((cls, k) => ({ wx: WX[(d + k) % 5], k, cls, role: '閒神', plus: [], minus: [], pro: [], con: [], tag: '共識' }));
  const angles = [];
  if (v.kind === 'unclear') angles.push({ name: '扶抑', tag: '共識', says: '強弱接近，扶還是抑定不下來：這個角度不表態。' });
  else {
    const weak = v.kind === 'weak', fav = weak ? [4, 0] : [1, 2, 3];
    rows.forEach(r => {
      const ok = fav.includes(r.k);
      (ok ? r.plus : r.minus).push('扶抑');
      (ok ? r.pro : r.con).push(FUYI_WHY[v.kind][r.k]);
    });
    angles.push({ name: '扶抑', tag: '共識', says: weak ? `${v.text}，要扶身：喜印（${rows[4].wx}）生身、比劫（${rows[0].wx}）幫身。` : `${v.text}，要抑：喜食傷（${rows[1].wx}）洩、財（${rows[2].wx}）耗、官殺（${rows[3].wx}）制。` });
  }
  pat.votes.forEach(k => {
    rows[k].plus.push('格局');
    rows[k].pro.push(GE_WHY[pat.name][k]);
  });
  angles.push({ name: '格局', tag: pat.tag, says: `${pat.name}${pat.use ? `，${pat.use}` : ''}：喜${pat.votes.map(k => `${CLS[k]}（${rows[k].wx}）`).join('、')}。` });
  const th = TIAOHOU(month);
  if (th) {
    const r = rows[(th[0] - d + 5) % 5];
    r.plus.push('調候');
    r.pro.push(th[2]);
    angles.push({ name: '調候', tag: '共識', says: `${th[1]}（${r.cls}）。` });
  } else angles.push({ name: '調候', tag: '共識', says: `${month}月寒暖適中，通則裡沒有特別要調的：這個角度不表態。` });
  const [shi, guan] = [rows[1], rows[3]], clean = r => r.plus.length && !r.minus.length;
  if (clean(shi) && clean(guan)) {
    const touN = k => ov.classes[k].tou.length;
    const lose = shi.plus.length !== guan.plus.length ? shi.plus.length < guan.plus.length ? shi : guan : touN(1) !== touN(3) ? touN(1) < touN(3) ? shi : guan : null;
    if (lose) {
      lose.hold = true;
      lose.con.push(`和${lose === shi ? '官殺' : '食傷'}相剋，不並用`);
    }
  }
  rows.forEach(r => {
    if (r.hold || r.plus.length && r.minus.length) {
      r.role = '待觀察';
      r.tag = '參考';
    } else if (r.plus.length) r.role = '喜神';
    else if (r.minus.length) r.role = '忌神';
  });
  const fav = rows.filter(r => r.role === '喜神'), top = Math.max(0, ...fav.map(r => r.plus.length));
  const best = fav.filter(r => r.plus.length === top);
  const notes = [];
  let yong = '';
  if (top >= 2 && best.length === 1) {
    best[0].role = '用神';
    yong = best[0].wx;
  } else if (fav.length) notes.push(top >= 2 ? `${best.map(r => r.wx).join('、')}得到的支持一樣多，主次定不下來，都列喜神。` : '沒有哪一行得到兩個角度以上的支持：只列喜神，不指定用神。');
  const yongI = yong ? WX.indexOf(yong) : -1, season = zi(month);
  rows.filter(r => r.role === '忌神' || r.role === '待觀察').forEach(r => {
    const w = WX.indexOf(r.wx);
    rows.filter(o => o.role === '忌神' && o !== r && SHENG(w, WX.indexOf(o.wx))).forEach(o => r.con.push(`生${o.wx}（${o.cls}，忌）`));
    if (yongI >= 0 && KE(w, yongI)) r.con.push(`剋用神${yong}`);
    if (r.role === '忌神' && w === 4 && (season === 11 || season <= 1)) r.con.push('增加寒氣');
    if (r.role === '忌神' && w === 1 && season >= 5 && season <= 7) r.con.push('增加燥熱');
  });
  rows.forEach(r => {
    delete r.hold;
  });
  if (v.kind === 'unclear') notes.push('強弱接近，扶抑用不上：這裡只靠格局和調候兩個角度，請自己再判斷一次。');
  v.special.forEach(s => notes.push(`${s.text}請人工判斷。`));
  const good = k => ['用神', '喜神'].includes(rows[k].role);
  const same = (pat.votes.some(good) ? 1 : 0) + (th && good((th[0] - d + 5) % 5) ? 1 : 0);
  const conf = v.kind === 'unclear' || v.special.length || !same ? '低' : same === 2 && v.conf === '高' ? '高' : '中';
  const ORDER = ['用神', '喜神', '待觀察', '忌神', '閒神'];
  rows.sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || b.plus.length - a.plus.length || a.k - b.k);
  return { angles, rows, yong, conf, notes };
}
export function bzReading(bz) {
  const overview = overviewOf(bz), strength = verdictOf(bz), pattern = patternOf(bz, overview);
  return { overview, strength, pattern, xiji: xiJi(bz, overview, strength, pattern) };
}
export function bzJudge(R, dm, gz) {
  const roleOf = g => R.xiji.rows.find(r => r.k === clsOf(dm, g)).role;
  const one = g => ({ c: g, god: tenGod(dm, g), wx: WX[ganWxI(g)], role: roleOf(g) });
  const [main, ...rest] = CANG[gz[1]];
  const gan = one(gz[0]), zhi = { ...one(main), c: gz[1], cang: rest.map(one).filter(c => c.role === '用神' || c.role === '喜神').map(c => ({ gan: c.c, god: c.god, role: c.role })) };
  const good = r => r === '用神' || r === '喜神';
  const text = gan.role === '用神' && zhi.role === '用神' ? '用神到位（天干、地支都是用神）' : good(gan.role) && good(zhi.role) ? '干支都是喜用' : good(gan.role) && zhi.role === '忌神' ? '上喜下忌' : gan.role === '忌神' && good(zhi.role) ? '上忌下喜' : gan.role === '忌神' && zhi.role === '忌神' ? '干支都是忌神' : `天干${gan.role}、地支${zhi.role}`;
  return { gan, zhi, text };
}
