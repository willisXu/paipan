/* 引擎驗算：八字讀盤（七步法）與紫微星曜解讀。node test/engine/reading.test.js [種子]
   一、教材的兩張盤逐步核對：範例盤（第 10、13、14、15、16 講）、對照盤（第 19 講）。
   二、照規則的文字另外寫一份判定表（旺衰、取格、喜忌、運歲），不共用引擎的程式：
       十神的類別用十神的名字查、五行用生剋表查，不用引擎的序號算術。拿隨機的盤和引擎逐張比對。
   三、六千張盤的結論分布落在預期範圍（判不準的比例不可以悄悄變多或變少）。
   四、紫微星曜解讀對盤面：命宮主星、借星、身宮、生年與運限四化落宮、三方四正的吉煞，四種四化版本。
   五、文字的分寸：不寫一定、注定這類重話；疾厄宮一律不作健康判斷；句子裡沒有漏字。 */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { chartOf, baziOf } from '../helpers/charts.js';

const SEED = Number(process.argv[2]) || 2026112301;
const { rnd, pick, rndBirth } = seeded(SEED);
const gender = () => pick(['男', '女']);

/* ---------- 另外寫的判定表（不呼叫引擎的讀盤） ---------- */
// 五行 → 角色，照木火土金水排，兩邊才比得了
const byWx = o => Object.fromEntries(['木', '火', '土', '金', '水'].map(w => [w, o[w]]));
// 十神 → 類別序號：0 比劫、1 食傷、2 財、3 官殺、4 印
const CLASS = { 比肩: 0, 劫財: 0, 食神: 1, 傷官: 1, 偏財: 2, 正財: 2, 七殺: 3, 正官: 3, 偏印: 4, 正印: 4 };
const cls = (dm, g) => CLASS[PP.tenGod(dm, g)];
// 五行生剋表：誰生誰、誰剋誰
const GEN = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CTRL = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
const genBy = Object.fromEntries(Object.entries(GEN).map(([a, b]) => [b, a]));
const ctrlBy = Object.fromEntries(Object.entries(CTRL).map(([a, b]) => [b, a]));
const GAN_WX = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const wxOf = g => GAN_WX[g];
// 日主五行 → 五個類別各是哪一行
const classWx = dmWx => [dmWx, GEN[dmWx], CTRL[dmWx], ctrlBy[dmWx], genBy[dmWx]];

// ③ 旺衰：得勢分四級；月令分旺、相、失令三種；根分無根、有根
function judgeStrength(bz) {
  const st = bz.strength, dm = bz.dm, three = bz.pillars.filter((p, i) => i !== 2);
  const h = three.filter(p => [0, 4].includes(cls(dm, p.gan))).length, k = three.filter(p => cls(dm, p.gan) === 3).length;
  const shi = h >= 2 ? 2 : h === 1 && k === 0 ? 1 : h === 1 && k === 1 ? 0 : -1;
  const rooted = st.roots.length > 0, mainRoot = st.roots.some(r => r.main);
  const L = st.ling === '旺' ? '旺' : st.ling === '相' ? '相' : '失';
  let r;
  if (L === '旺') r = shi >= 1 ? ['身強', '高'] : shi === 0 ? ['身強', '中'] : h === 0 && k >= 2 ? ['強弱接近', '低'] : ['偏強', '中'];
  else if (L === '相') r = rooted && shi === 2 ? ['身強', '高'] : rooted && shi === 1 ? ['身強', '中'] : (rooted && shi === 0) || (!rooted && shi === 2) ? ['偏強', '中'] : ['強弱接近', '低'];
  else {
    const table = { '-1': [rooted ? '身弱有根' : '身弱無根', '高'], 0: [rooted ? '偏弱有根' : '身弱無根', '中'], 1: [rooted ? '偏弱有根' : '偏弱', '中'] };
    r = shi < 2 ? table[shi] : !rooted ? ['偏弱', '中'] : h === 3 && mainRoot ? ['偏強', '中'] : ['強弱接近', '低'];
  }
  const kind = r[0] === '強弱接近' ? 'unclear' : /強/.test(r[0]) ? 'strong' : 'weak';
  const special = [];
  if (!st.deLing && !rooted && h === 0) special.push('從格');
  if (st.ling === '旺' && h === 3 && new Set(st.roots.map(x => x.pos)).size >= 3) special.push('專旺格');
  return { text: r[0], conf: r[1], kind, h, k, special };
}

// ④ 取格：祿刃與月令比劫另外論；八正格照「本氣透 → 中氣、餘氣透 → 都不透以本氣論」三步，跳過比劫
const VOTES = { 正官: [2, 4], 七殺: [1, 4], 正財: [1, 3], 偏財: [1, 3], 正印: [3], 食神: [2], 傷官: [4, 2] };
function judgePattern(bz) {
  const dm = bz.dm, month = bz.pillars[1].zhi, C = PP.CANG[month], stems = bz.pillars.filter((p, i) => i !== 2);
  const cs = PP.changSheng(dm, month), yang = PP.yinyang(dm) === '陽';
  if (cs === '臨官') return { name: '建祿格', conf: '低', tag: '參考', votes: [2, 3, 1], step: 0 };
  if (yang && cs === '帝旺') return { name: '月刃格', conf: '低', tag: '參考', votes: [3], step: 0 };
  if (cls(dm, C[0]) === 0) return { name: '月令是比劫', conf: '低', tag: '參考', votes: [2, 1], step: 0 };
  const cands = C.map((g, n) => ({ g, n, god: PP.tenGod(dm, g), tou: stems.some(p => p.gan === g) })).filter(c => cls(dm, c.g) !== 0);
  const shown = cands.filter(c => c.tou);
  const pickC = shown.find(c => c.n === 0) || shown[0] || cands[0];
  const step = !pickC.tou ? 3 : pickC.n === 0 ? 1 : 2;
  const mate = { 正官: '七殺', 七殺: '正官' }[pickC.god];
  const mixed = !!mate && stems.some(p => p.ganGod === mate);
  let votes = VOTES[pickC.god], use = { 七殺: '逆用', 傷官: '逆用' }[pickC.god] || '順用';
  if (pickC.god === '偏印') {
    const shiShen = bz.pillars.some((p, i) => (i !== 2 && p.ganGod === '食神') || p.cang.some(c => c.god === '食神'));
    votes = shiShen ? [2] : [3]; use = shiShen ? '逆用' : '順用';
  }
  return { name: `${pickC.god}格`, conf: step === 1 && !mixed ? '高' : '中', tag: '', votes, step, use, mixed };
}

// ⑤ 喜忌：扶抑、格局、調候三個角度各自贊成或反對；只有贊成的是喜神，有贊成也有反對的待觀察，只有反對的是忌神，沒人提的是閒神
function judgeXiJi(bz, S, G) {
  const dmWx = wxOf(bz.dm), cw = classWx(dmWx), month = bz.pillars[1].zhi;
  const plus = [[], [], [], [], []], minus = [[], [], [], [], []];
  if (S.kind !== 'unclear') {
    const good = S.kind === 'weak' ? [4, 0] : [1, 2, 3];
    for (let k = 0; k < 5; k++) (good.includes(k) ? plus : minus)[k].push('扶抑');
  }
  for (const k of G.votes) plus[k].push('格局');
  // 調候只用通則：亥子丑月與寅月喜火、巳午未月與申酉戌月喜水、卯辰兩月不表態
  const want = { 亥: '火', 子: '火', 丑: '火', 寅: '火', 巳: '水', 午: '水', 未: '水', 申: '水', 酉: '水', 戌: '水' }[month];
  if (want) plus[cw.indexOf(want)].push('調候');
  // 食傷、官殺兩類都被看好（只有贊成）時，票少的改列待觀察；票數相同看透出的干數，再相同兩個都留著
  const clean = k => plus[k].length && !minus[k].length, hold = new Set();
  if (clean(1) && clean(3)) {
    const tou = k => bz.pillars.filter((p, i) => i !== 2 && cls(bz.dm, p.gan) === k).length;
    if (plus[1].length !== plus[3].length) hold.add(plus[1].length < plus[3].length ? 1 : 3);
    else if (tou(1) !== tou(3)) hold.add(tou(1) < tou(3) ? 1 : 3);
  }
  const role = [0, 1, 2, 3, 4].map(k => (hold.has(k) || (plus[k].length && minus[k].length) ? '待觀察' : plus[k].length ? '喜神' : minus[k].length ? '忌神' : '閒神'));
  const fav = [0, 1, 2, 3, 4].filter(k => role[k] === '喜神'), top = Math.max(0, ...fav.map(k => plus[k].length));
  const best = fav.filter(k => plus[k].length === top);
  if (top >= 2 && best.length === 1) role[best[0]] = '用神';
  const good = k => role[k] === '用神' || role[k] === '喜神';
  const agree = (G.votes.some(good) ? 1 : 0) + (want && good(cw.indexOf(want)) ? 1 : 0);
  const conf = S.kind === 'unclear' || S.special.length || !agree ? '低' : agree === 2 && S.conf === '高' ? '高' : '中';
  return { role: byWx(Object.fromEntries(cw.map((w, k) => [w, role[k]]))), conf, yong: top >= 2 && best.length === 1 ? cw[best[0]] : '', plus, minus };
}

// ⑦ 運歲：天干一個字；地支看本氣，另藏的喜用另外列
function judgeYun(roleOf, dm, gz) {
  const r = g => roleOf[wxOf(g)], gan = r(gz[0]), [main, ...rest] = PP.CANG[gz[1]], zhi = r(main);
  const good = x => x === '用神' || x === '喜神';
  const text = gan === '用神' && zhi === '用神' ? '用神到位（天干、地支都是用神）' : good(gan) && good(zhi) ? '干支都是喜用'
    : good(gan) && zhi === '忌神' ? '上喜下忌' : gan === '忌神' && good(zhi) ? '上忌下喜' : gan === '忌神' && zhi === '忌神' ? '干支都是忌神' : `天干${gan}、地支${zhi}`;
  return { gan, zhi, text, hidden: rest.filter(g => good(r(g))) };
}
const engineRoles = R => byWx(Object.fromEntries(R.xiji.rows.map(r => [r.wx, r.role])));

/* ---------- 一、教材的兩張盤 ---------- */
section('教材範例盤：甲子 乙亥 戊午 己未（1984-11-20 14:00 男）');
{
  const bz = baziOf({ y: 1984, m: 11, d: 20, h: 14, mi: 0, gender: '男' }), R = PP.bzReading(bz);
  eq(bz.gz, ['甲子', '乙亥', '戊午', '己未'], '四柱');
  const o = R.overview, v = R.strength, p = R.pattern, x = R.xiji;
  eq([o.dm, o.dmYY + o.dmWx, o.month, o.seasonWx], ['戊', '陽土', '亥', '水'], '② 概覽：日主戊土，生亥月，水當令');
  eq(o.missing, ['金'], '② 整張盤沒有金（天干和藏干都沒有）');
  eq([v.ling, v.deLing, v.rooted, v.mainRoot, v.shi], ['囚', false, true, true, '勢弱'], '③ 三看：失令（囚）、有根（未中己是本氣根）、勢弱');
  eq([v.helpers, v.ke], [['時干己'], ['年干甲', '月干乙']], '③ 天干：幫身的時干己，剋身的年干甲、月干乙');
  eq([v.text, v.conf, v.kind], ['身弱有根', '高', 'weak'], '③ 結論：身弱有根，把握高（第 10 講）');
  eq(v.special, [], '③ 沒有特殊格局的提示');
  eq([p.name, p.step, p.from.gan, p.from.layer, p.from.tou, p.use, p.conf], ['七殺格', 2, '甲', '中氣', ['年'], '逆用', '中'], '④ 取格：亥中壬不透、甲透年干 → 七殺格，逆用，把握中（第 13 講）');
  ok(p.notes.some(n => n.startsWith('官殺混雜：月干乙（正官）')), '④ 註明官殺混雜：月干乙也透出');
  eq(p.path, '盤上沒有食傷：不能制殺，走印化殺。', '④ 這張盤沒有食傷（金）、有印（午、未中的丁）：走印化殺');
  eq(engineRoles(R), byWx({ 火: '用神', 土: '喜神', 金: '待觀察', 水: '忌神', 木: '忌神' }), '⑤ 用火、喜土、忌水木、金待觀察（第 14 講）');
  eq([x.yong, x.conf], ['火', '高'], '⑤ 用神火，把握高');
  eq(x.angles.map(a => [a.name, a.tag]), [['扶抑', '共識'], ['格局', ''], ['調候', '共識']], '⑤ 三個角度依序是扶抑、格局、調候');
  ok(x.angles[2].says.startsWith('亥月是冬天，寒：喜火暖局'), '⑤ 調候：亥月冬天喜火');
  const fire = x.rows.find(r => r.wx === '火');
  eq([fire.plus, fire.pro], [['扶抑', '格局', '調候'], ['生身', '化殺', '暖局']], '⑤ 火得到三個角度的支持：生身、化殺、暖局');
  const metal = x.rows.find(r => r.wx === '金');
  eq([metal.plus, metal.minus, metal.tag], [['格局'], ['扶抑'], '參考'], '⑤ 金：格局贊成（制殺）、扶抑反對（洩身）→ 待觀察，標參考');
  eq(x.rows.map(r => r.role), ['用神', '喜神', '待觀察', '忌神', '忌神'], '⑤ 表的順序：用神、喜神、待觀察、忌神');
  // ⑦ 十步大運對照喜忌（第 15 講）與 2026 丙午年（第 16 講）
  const want = [['丙子', '上喜下忌'], ['丁丑', '干支都是喜用'], ['戊寅', '上喜下忌'], ['己卯', '上喜下忌'], ['庚辰', '天干待觀察、地支喜神'],
    ['辛巳', '天干待觀察、地支用神'], ['壬午', '上忌下喜'], ['癸未', '上忌下喜'], ['甲申', '天干忌神、地支待觀察'], ['乙酉', '天干忌神、地支待觀察']];
  eq(bz.dayun.map(d => [d.gz, PP.bzJudge(R, bz.dm, d.gz).text]), want, '⑦ 十步大運：丙子上喜下忌、丁丑干支都是喜用……乙酉天干忌神、地支待觀察');
  eq(PP.bzJudge(R, bz.dm, '戊寅').zhi.cang.map(c => [c.gan, c.god, c.role]), [['丙', '偏印', '用神'], ['戊', '比肩', '喜神']], '⑦ 戊寅運：寅中另藏丙（用神）、戊（喜神）');
  const y26 = PP.bzJudge(R, bz.dm, '丙午');
  eq([y26.gan.god, y26.gan.role, y26.zhi.god, y26.zhi.role, y26.text], ['偏印', '用神', '正印', '用神', '用神到位（天干、地支都是用神）'], '⑦ 2026 丙午年：用神到位');
}

section('教材對照盤：壬寅 庚戌 己丑 己巳（第 19 講，女命；用 1962-10-18 10:00 排出這四柱）');
{
  const bz = baziOf({ y: 1962, m: 10, d: 18, h: 10, mi: 0, gender: '女' }), R = PP.bzReading(bz);
  eq(bz.gz, ['壬寅', '庚戌', '己丑', '己巳'], '四柱');
  eq(bz.dayun.slice(0, 6).map(d => d.gz), ['己酉', '戊申', '丁未', '丙午', '乙巳', '甲辰'], '大運逆行：己酉 戊申 丁未 丙午 乙巳 甲辰');
  const v = R.strength, p = R.pattern;
  eq([v.ling, v.deLing, v.rooted, v.shi, v.text, v.kind], ['旺', true, true, '得勢', '身強', 'strong'], '③ 己土生戌月得令（旺）、有根、得勢 → 身強');
  eq([p.name, p.kind, p.conf, p.tag], ['月令是比劫', 'bijie', '低', '參考'], '④ 戌中本氣戊是劫財：月令是比劫，把握低，標參考');
  eq(engineRoles(R), byWx({ 水: '用神', 金: '喜神', 木: '待觀察', 火: '忌神', 土: '忌神' }), '⑤ 喜金水（水為用）、忌土火；木與食傷相剋，列待觀察');
  ok(R.xiji.rows.find(r => r.wx === '木').con.includes('和食傷相剋，不並用'), '⑤ 木（官殺）列待觀察的理由寫明：和食傷相剋，不並用');
}

/* ---------- 二、另外寫的判定表對引擎 ---------- */
const N_TABLE = 3000;
section(`判定表對引擎：${N_TABLE} 張隨機的盤（旺衰、取格、喜忌、十步大運）`);
{
  const bad = { s: [], g: [], x: [], y: [] };
  for (let n = 0; n < N_TABLE; n++) {
    const o = { ...rndBirth(), gender: gender() }, bz = baziOf(o), R = PP.bzReading(bz), tag = `${o.y}-${o.m}-${o.d} ${o.h}:${o.mi} ${bz.gz.join(' ')}`;
    const S = judgeStrength(bz), G = judgePattern(bz), X = judgeXiJi(bz, S, G);
    const v = R.strength;
    if (JSON.stringify([v.text, v.conf, v.kind, v.special.map(s => s.name)]) !== JSON.stringify([S.text, S.conf, S.kind, S.special])) bad.s.push(`${tag}：引擎 ${v.text}/${v.conf}，判定表 ${S.text}/${S.conf}`);
    const p = R.pattern;
    if (JSON.stringify([p.name, p.conf, p.tag, p.votes, p.step]) !== JSON.stringify([G.name, G.conf, G.tag, G.votes, G.step])
      || (p.kind === 'zheng' && p.use !== G.use)) bad.g.push(`${tag}：引擎 ${p.name}/${p.conf}/${p.votes}，判定表 ${G.name}/${G.conf}/${G.votes}`);
    const er = engineRoles(R);
    if (JSON.stringify(er) !== JSON.stringify(X.role) || R.xiji.conf !== X.conf || R.xiji.yong !== X.yong) bad.x.push(`${tag}：引擎 ${JSON.stringify(er)}/${R.xiji.conf}，判定表 ${JSON.stringify(X.role)}/${X.conf}`);
    for (const d of bz.dayun) {
      const e = PP.bzJudge(R, bz.dm, d.gz), w = judgeYun(X.role, bz.dm, d.gz);
      if (e.text !== w.text || e.gan.role !== w.gan || e.zhi.role !== w.zhi || e.zhi.cang.map(c => c.gan).join('') !== w.hidden.join('')) { bad.y.push(`${tag} ${d.gz}：引擎 ${e.text}，判定表 ${w.text}`); break; }
    }
  }
  for (const [k, name] of [['s', '旺衰'], ['g', '取格'], ['x', '喜忌'], ['y', '十步大運']]) {
    bad[k].slice(0, 3).forEach(m => console.log('    ' + m));
    eq(bad[k].length, 0, `${name}：引擎和判定表不同的盤數`);
  }
}

/* ---------- 三、結論的分布 ---------- */
const N_DIST = 6000;
section(`結論的分布：${N_DIST} 張隨機的盤`);
{
  const c = { unclear: 0, strong: 0, weak: 0, xh: 0, xm: 0, xl: 0, yong: 0, gh: 0, gm: 0, gl: 0, cong: 0, zhuan: 0 };
  for (let n = 0; n < N_DIST; n++) {
    const R = PP.bzReading(baziOf({ ...rndBirth(), gender: gender() }));
    c[R.strength.kind]++;
    c[{ 高: 'xh', 中: 'xm', 低: 'xl' }[R.xiji.conf]]++;
    c[{ 高: 'gh', 中: 'gm', 低: 'gl' }[R.pattern.conf]]++;
    if (R.xiji.yong) c.yong++;
    if (R.strength.special.some(s => s.name === '從格')) c.cong++;
    if (R.strength.special.some(s => s.name === '專旺格')) c.zhuan++;
  }
  const pc = k => (100 * c[k]) / N_DIST, show = k => `${pc(k).toFixed(1)}%`;
  const near = (k, want, tol = 3) => ok(Math.abs(pc(k) - want) <= tol, `${k} 佔 ${show(k)}，預期約 ${want}%（±${tol}）`);
  near('unclear', 23); near('strong', 35); near('weak', 42);
  near('xh', 14); near('xm', 49); near('xl', 37); near('yong', 55);
  near('gh', 23); near('gm', 53); near('gl', 24);
  near('cong', 1.7, 1); near('zhuan', 0.7, 0.6);
  console.log(`    強弱接近 ${show('unclear')}、偏強與身強 ${show('strong')}、偏弱與身弱 ${show('weak')}；喜忌把握 高 ${show('xh')} 中 ${show('xm')} 低 ${show('xl')}，定出單一用神 ${show('yong')}；格局把握 高 ${show('gh')} 中 ${show('gm')} 低 ${show('gl')}；從格提示 ${show('cong')}、專旺提示 ${show('zhuan')}`);
}

/* ---------- 四、紫微星曜解讀對盤面 ---------- */
const N_ZW = 600;
section(`紫微星曜解讀對盤面：${N_ZW} 張盤 × ${PP.ZW_OPTIONS.hua.length} 種四化版本`);
{
  const bad = [], seen = { empty: 0, twin: 0, lucky: 0, sha: 0, none: 0, jie: 0, layers: 0, body: new Set() };
  for (let n = 0; n < N_ZW && bad.length < 5; n++) {
    const o = { ...rndBirth(), gender: gender() };
    for (const zwHua of PP.ZW_OPTIONS.hua) {
      const { zw } = chartOf({ ...o, zwHua }), c = zw.chart, P = c.palaces, R = PP.zwReading(zw), tag = `${o.y}-${o.m}-${o.d} ${o.h}時 ${zwHua}`;
      const mi = P.findIndex(p => p.name === '命宮'), ming = P[mi], opp = P[(mi + 6) % 12];
      const where = star => P.find(p => p.majorStars.concat(p.minorStars).some(s => s.name === star));
      const want = ming.majorStars.length ? ming.majorStars : opp.majorStars;
      const got = (R.ming.empty ? R.ming.borrowed : R.ming.stars).map(s => [s.name, s.bright, s.hua]);
      if (JSON.stringify(got) !== JSON.stringify(want.map(s => [s.name, s.brightness || '', s.mutagen || '']))) bad.push(`${tag}：命宮主星 ${JSON.stringify(got)}`);
      if (R.ming.empty !== !ming.majorStars.length) bad.push(`${tag}：空宮的判斷不對`);
      if (R.ming.empty && !R.ming.note.includes(`借對宮（遷移宮）的${opp.majorStars.map(s => s.name).join('、')}`)) bad.push(`${tag}：空宮沒有寫出借來的星`);
      const body = P.find(p => p.isBodyPalace);
      if (R.body.palace !== body.name || !R.body.text) bad.push(`${tag}：身宮 ${R.body.palace}「${R.body.text}」，盤上在 ${body.name}`);
      const hua = zw.sihua[zw.yearGZ[0]];
      if (JSON.stringify(R.sihua.map(h => [h.star, h.hua, h.palace])) !== JSON.stringify(hua.map((s, k) => [s, '祿權科忌'[k], where(s).name]))) bad.push(`${tag}：生年四化落宮不對`);
      // 盤上標的生年四化（星曜的 mutagen）和解讀用的是同一張表
      for (const h of R.sihua) if (!where(h.star).majorStars.concat(where(h.star).minorStars).some(s => s.name === h.star && s.mutagen === h.hua)) bad.push(`${tag}：${h.star}化${h.hua}和盤上標的不同`);
      const four = [mi, (mi + 4) % 12, (mi + 8) % 12, (mi + 6) % 12].map(i => P[i]);
      const names = list => four.flatMap(p => p.minorStars.filter(s => list.includes(s.name)).map(s => `${s.name}@${p.name}`));
      const lucky = names(['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞']), sha = names(['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫']);
      if (R.around.lucky.map(s => `${s.name}@${s.palace}`).join() !== lucky.join() || R.around.sha.map(s => `${s.name}@${s.palace}`).join() !== sha.join()) bad.push(`${tag}：三方四正的吉煞不對`);
      const text = lucky.length && sha.length ? '吉星、煞星都有' : lucky.length ? '有吉星、沒有煞星' : sha.length ? '有煞星、沒有吉星' : '六吉、六煞都不在三方四正';
      if (!R.around.text.startsWith(text)) bad.push(`${tag}：三方四正的總結「${R.around.text}」`);
      // 隨便挑一個大限、一個流年疊上去
      const dec = PP.zwDaXian(zw, rnd(0, 11)), yr = PP.zwLiuNian(zw, zw.birthYear + rnd(0, 90));
      for (const [L, when] of [[dec, '這十年'], [yr, '這一年']]) {
        const n2 = PP.zwReadLayer(zw, L, when);
        if (n2.at !== P[L.index].name) bad.push(`${tag}：運限命宮疊在 ${n2.at}，應為 ${P[L.index].name}`);
        if (JSON.stringify(n2.hua.map(h => [h.star, h.palace])) !== JSON.stringify(L.hua.map(s => [s, where(s).name]))) bad.push(`${tag}：運限四化落宮不對`);
        if (n2.at === '疾厄' ? !n2.text.includes('這裡不作健康判斷') : !n2.text.includes(`${when}的重心`)) bad.push(`${tag}：運限命宮的句子「${n2.text}」`);
        seen.layers++;
      }
      if (R.ming.empty) seen.empty++;
      if (want.length === 2) seen.twin++;
      if (lucky.length) seen.lucky++;
      if (sha.length) seen.sha++;
      if (!lucky.length && !sha.length) seen.none++;
      if (R.sihua.some(h => h.palace === '疾厄')) seen.jie++;
      seen.body.add(body.name);
    }
  }
  bad.forEach(m => console.log('    ' + m));
  eq(bad.length, 0, '星曜解讀和盤面不同的地方');
  ok(seen.empty > 300 && seen.twin > 300 && seen.lucky > 1000 && seen.sha > 1000 && seen.jie > 100 && seen.body.size === 6,
    `各種情形都碰到了：空宮 ${seen.empty}、雙主星 ${seen.twin}、有吉星 ${seen.lucky}、有煞星 ${seen.sha}、吉煞都沒有 ${seen.none}（很少見）、生年四化落疾厄 ${seen.jie}、身宮的位置 ${seen.body.size} 種`);
  eq([...seen.body].every(b => PP.ZW_TEXTS.BODY[b]), true, '身宮會落的六個宮都有句子');
}

/* ---------- 五、文字的分寸 ---------- */
section('文字的分寸：文字表與 600 張盤排出來的句子');
{
  // 重話：斷語與恐嚇。「吉凶」只出現在「不論斷家人的吉凶」這一句（在頁面的頁尾，不在引擎裡）
  const HEAVY = /一定|注定|必定|必然|必有|必遭|大凶|凶|災|禍|劫難|厄運|剋夫|剋妻|克夫|克妻|短命|早逝|夭|喪|離婚|血光|死亡|癌|開運|補運/;
  // 漏字：插值沒有東西、標點連在一起
  const HOLE = /undefined|null|NaN|\[object|（）|「」|：。|：，|、、|，，|。。|：：|^[，。、]/;
  const scan = [];
  const walk = (v, at) => { if (typeof v === 'string') scan.push([at, v]); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${at}.${k}`); };
  walk(PP.ZW_TEXTS, 'ZW_TEXTS');
  let n = 0;
  for (; n < 600; n++) {
    const { bz, zw } = chartOf({ ...rndBirth(), gender: gender() });
    const R = PP.bzReading(bz);
    walk(R, 'bzReading');
    for (const d of bz.dayun) walk(PP.bzJudge(R, bz.dm, d.gz), 'bzJudge');
    walk(PP.zwReading(zw), 'zwReading');
    walk(PP.zwReadLayer(zw, PP.zwDaXian(zw, rnd(0, 11)), '這十年'), 'zwReadLayer');
  }
  const heavy = scan.filter(([, s]) => HEAVY.test(s)), hole = scan.filter(([, s]) => HOLE.test(s));
  heavy.slice(0, 3).forEach(([at, s]) => console.log(`    重話 ${at}：${s}`));
  hole.slice(0, 3).forEach(([at, s]) => console.log(`    漏字 ${at}：${s}`));
  eq(heavy.length, 0, `${scan.length} 段文字裡有重話的段數`);
  eq(hole.length, 0, `${scan.length} 段文字裡有漏字的段數`);
  // 疾厄宮：不論四化還是運限命宮落在這裡，都只寫「不作健康判斷」，不帶任何四化的意思
  const jie = scan.filter(([, s]) => s.includes('疾厄宮'));
  ok(jie.length > 50 && jie.every(([, s]) => s.includes('不作健康判斷') && !/緣分|主導|名聲|牽掛/.test(s)), `落在疾厄宮的 ${jie.length} 句都只寫不作健康判斷`);
  // 第 19 講：用神不是開運清單；格局、喜忌的句子不寫「補」什麼
  ok(scan.filter(([at]) => at.startsWith('bzReading')).every(([, s]) => !/要補|補[木火土金水]/.test(s)), '讀盤的句子沒有「補五行」的說法');
  // 十四主星、六吉六煞、祿存天馬：盤上會出現的星，文字表都有
  eq(Object.keys(PP.ZW_TEXTS.STARS).length, 14, '十四主星都有三句');
  ok(Object.values(PP.ZW_TEXTS.STARS).every(a => a.length === 3 && a.every(s => s && !/[。，]$/.test(s))), '主星的三句都不是空的，句尾沒有標點（句號由排版加）');
  eq(Object.keys(PP.ZW_TEXTS.PALACES).length, 12, '十二宮都有副題');
}

finish();
