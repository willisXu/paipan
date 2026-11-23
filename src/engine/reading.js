/* 八字讀盤：照《八字命理二十講》第 18 講七步法裡要推論的幾步，把旺衰、格局、喜忌接成結論，每一條附依據與把握程度。
   教材給的是方法與兩張盤的示範（範例盤身弱有根、對照盤身強），沒有把「三看怎麼合成一句話」「三個角度怎麼合成喜忌」寫成公式；
   這裡的規則凡是教材沒寫的，註解都標明「工具訂的」，頁面與 README 也寫明。不計分，每一條結論都追得到是哪一看、哪個角度、哪一個字說的。
   判不準就說判不準：強弱接近不下結論、喜忌有贊成也有反對的列待觀察、可能是從格或專旺的只提示。
   測試：test/engine/reading.test.js 照同一套文字規則另寫了一份判定表，拿隨機的盤和這裡逐張比對；規則改了那份要一起改、分布要重算。 */
import { WX, CANG, yinyang, tenGod, changSheng, gi, zi, ganWxI } from './ganzhi.js';

// 十神的五個類別，序號是「從日主的五行往下數幾步」：0 比劫（同我）、1 食傷（我生）、2 財（我剋）、3 官殺（剋我）、4 印（生我）
const CLS = ['比劫', '食傷', '財', '官殺', '印'];
const clsOf = (dm, g) => (ganWxI(g) - ganWxI(dm) + 5) % 5;
// 地支藏干的三層，依 CANG 表的順序
const LAYER = ['本氣', '中氣', '餘氣'];
/* ② 概覽：日主、月令，以及五個類別各自透在哪幾干、藏在哪幾支。
   missing 是天干和藏干都沒有的類別（比劫一定有，日主自己就是）。只陳述，不下結論：「沒有不等於要補」寫在頁面上 */
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
/* ③ 旺衰（第 10 講）：三看——得令（月令的旺相休囚死）、得地（藏干通根）、得勢（天干幫扶）。不計分。
   教材只給三看與「月令影響最大」，三看怎麼合成一句話是工具訂的規則：
   - 得勢分四級，只看年、月、時三個天干：幫身的（印、比劫）兩個以上＝佔多數；只有一個幫身、沒有官殺＝一幫無剋；
     一個幫身一個官殺＝持平；其餘（沒有幫身，或一個幫身對兩個官殺）＝勢弱。食傷、財是洩、耗，不計入這兩邊。
   - 月令分三種：旺；相（也算得令）；休、囚、死（失令）。有沒有根用來修飾結論。
   - 結論與把握：月令旺而得勢＝身強（高）；月令旺、持平＝身強（中）；月令旺但天干兩個以上官殺、沒有幫身＝強弱接近（低）；
     月令旺其餘＝偏強（中）。月令相：有根而佔多數＝身強（高）、有根而一幫無剋＝身強（中）、有根而持平或無根而佔多數＝偏強（中），
     其餘＝強弱接近（低）。失令：勢弱＝身弱（高）、持平＝偏弱有根或身弱無根（中）、一幫無剋＝偏弱（中）、
     佔多數時無根＝偏弱（中）、三干都幫身又有本氣根＝偏強（中），其餘＝強弱接近（低）。
   - 「強弱接近」是月令和另外兩看互相拉扯的盤：不下結論，喜忌那一步的扶抑也不表態。
   - 特殊格局只提示、不改結論：失令、無根、天干沒有印比 → 可能是從格；月令旺、三干全是印比、地支三處以上有根 → 可能是專旺格 */
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
// 八正格（第 13 講）：[順用或逆用, 一句話, 這一格喜的類別]。偏印格不在表裡：看盤上有沒有食神，在 patternOf 裡另外定
const GE = {
  正官: ['順用', '喜財生官、印護官', [2, 4]],
  七殺: ['逆用', '喜食神制殺，或印化殺', [1, 4]],
  正財: ['順用', '喜食傷生財、官星護財', [1, 3]],
  偏財: ['順用', '喜食傷生財、官星護財', [1, 3]],
  正印: ['順用', '喜官殺生印', [3]],
  食神: ['順用', '喜食神生財，忌偏印奪食', [2]],
  傷官: ['逆用', '喜印制傷官，或傷官生財', [4, 2]]
};
/* ④ 格局（第 13 講）：先看祿刃與月令比劫，再照取格三步取八正格。
   - 月令是日主的臨官 → 建祿格；陽干生在帝旺 → 月刃格；月令本氣是比劫 → 「月令是比劫」。這三種教材列為參考，把握一律低。
     祿、刃照十二長生排（戊己土隨火，頁面另外註明有人改照月令本氣取格）——這是工具訂的。
   - 取格三步：月令本氣透干 → 取本氣（第 1 步）；本氣不透而中氣、餘氣有透 → 取透出的（第 2 步，兩個都透時取中氣並註明）；
     都不透 → 以本氣論（第 3 步）。候選的字是比劫就跳過（工具訂的）。
   - 把握：本氣透干又不是官殺混雜為高，其餘八正格為中。
   - 偏印格：盤上有食神才逆用（喜財制梟），沒有就照印格順用（喜官殺生印）——工具訂的。
   - 七殺格、傷官格另外看盤上有沒有能走的路（制或化、印或財），寫在 path */
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
// 五行序號上的生剋：a 生 b、a 剋 b
const SHENG = (a, b) => (a + 1) % 5 === b;
const KE = (a, b) => (a + 2) % 5 === b;
/* 調候只用通則（第 14 講的速查）：亥子丑月與寅月喜火暖局，巳午未月與申酉戌月喜水潤燥，卯辰兩月不表態。
   回傳 [喜的五行序號, 一句說明, 理由短語]；沒有通則可用時是 null。《窮通寶鑑》逐月逐干的表沒有做 */
const TIAOHOU = z => {
  const k = zi(z);
  if (k === 11 || k <= 1) return [1, `${z}月是冬天，寒：喜火暖局`, '暖局'];
  if (k >= 5 && k <= 7) return [4, `${z}月是夏天，燥熱：喜水潤燥`, '潤燥'];
  if (k === 2) return [1, '寅月是春初，還有餘寒：仍喜火', '暖局'];
  if (k >= 8 && k <= 10) return [4, `${z}月是秋天，漸燥${k === 10 ? '（戌月尤其燥）' : ''}：喜水滋潤`, '潤燥'];
  return null;
};
// 喜忌表「理由」那一欄的短語：扶抑（身弱、身強各一組）與格局，依類別序號
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
/* ⑤ 喜忌（第 14 講）：扶抑、格局、調候三個角度，各自對五行贊成或反對；用神看需要，不看缺不缺。
   合成的規則是工具訂的，不計分：
   - 只有贊成的是喜神；有贊成也有反對的是待觀察（標參考）；只有反對的是忌神；三個角度都沒提的是閒神。
   - 喜神裡，得到兩個角度以上支持、而且唯一最多的，才升為用神；平手或只有一個角度支持，就只列喜神、不指定用神。
   - 食傷和官殺相剋，兩類都被看好時不並用：票少的改列待觀察；票數相同看天干透出幾個，再相同兩個都留著。
   - 把握：格局、調候都和扶抑同向（各有一個看好的類別最後是喜用），而且旺衰把握高 → 高；
     強弱接近、有特殊格局的提示、或沒有一個角度和扶抑同向 → 低；其餘 → 中。
   - 忌神、待觀察另外列出牽連：生了哪個忌神、剋不剋用神、冬天的水與夏天的火加重寒燥 */
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
/**
 * 八字讀盤（七步法裡要推論的 ②③④⑤）：概覽、旺衰、格局、喜忌。只算結構，不寫性情、事業、感情。
 * @param {import('./bazi.js').BaziChart} bz bazi() 的結果
 * @returns {{overview: object, strength: object, pattern: object, xiji: {angles: object[], rows: object[], yong: string, conf: string, notes: string[]}}}
 */
export function bzReading(bz) {
  const overview = overviewOf(bz), strength = verdictOf(bz), pattern = patternOf(bz, overview);
  return { overview, strength, pattern, xiji: xiJi(bz, overview, strength, pattern) };
}
/**
 * ⑦ 運歲（第 15、16 講）：拿喜忌去對一組干支（大運、流年、流月）。天干看一個字；地支看本氣，另藏的喜用另外列出。
 * 只列依據，不寫會發生什麼事——推論要說出時間、領域、依據、把握，領域要人自己判斷。
 * @param {ReturnType<typeof bzReading>} R bzReading() 的結果
 * @param {string} dm 日主
 * @param {string} gz 兩個字的干支，例如「丙午」
 * @returns {{gan: object, zhi: object, text: string}} text 是一句話：用神到位、干支都是喜用、上喜下忌、上忌下喜、干支都是忌神，或照實寫天干、地支各是什麼
 */
export function bzJudge(R, dm, gz) {
  const roleOf = g => R.xiji.rows.find(r => r.k === clsOf(dm, g)).role;
  const one = g => ({ c: g, god: tenGod(dm, g), wx: WX[ganWxI(g)], role: roleOf(g) });
  const [main, ...rest] = CANG[gz[1]];
  const gan = one(gz[0]), zhi = { ...one(main), c: gz[1], cang: rest.map(one).filter(c => c.role === '用神' || c.role === '喜神').map(c => ({ gan: c.c, god: c.god, role: c.role })) };
  const good = r => r === '用神' || r === '喜神';
  const text = gan.role === '用神' && zhi.role === '用神' ? '用神到位（天干、地支都是用神）' : good(gan.role) && good(zhi.role) ? '干支都是喜用' : good(gan.role) && zhi.role === '忌神' ? '上喜下忌' : gan.role === '忌神' && good(zhi.role) ? '上忌下喜' : gan.role === '忌神' && zhi.role === '忌神' ? '干支都是忌神' : `天干${gan.role}、地支${zhi.role}`;
  return { gan, zhi, text };
}
