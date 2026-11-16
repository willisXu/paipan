/* 干支關係（合沖刑害、三合三會、半合、伏吟…）、神煞、旺相休囚死：個案加上表格的結構性質。
   執行：node test/engine/relations.test.js */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, eq, section, finish } from '../helpers/harness.js';

const P4 = s => s.split(' ').map((x, i) => ({ pos: '年月日時運歲'[i], gan: x[0], zhi: x[1], natal: i < 4 }));

/* 干支關係與神煞 */
section('干支關係、神煞、旺相休囚死');
{
  const types = (s, extra) => PP.relations(P4(s), extra).map(r => `${r.type}:${r.where}`);
  const a = types('甲子 乙亥 戊午 己未');
  ok(a.includes('天干五合:年時') && a.includes('地支六沖:年日') && a.includes('地支六合:日時') && a.includes('六害:年時') && a.includes('天剋地沖:年日'), `範例盤關係 ${a.join(' ')}`);
  ok(types('甲子 丙寅 庚午 丁丑').includes('天剋地沖:年日') && !types('甲子 丙寅 丙午 丁丑').includes('天剋地沖:年日'), '天剋地沖須天干同陰陽相剋');
  ok(types('甲子 乙亥 戊午 己未 己卯 丙午', true).includes('三合:月時運'), '運補齊三合，位置依柱序');
  ok(types('甲子 乙亥 戊午 己未 己卯 丙午', true).every(t => /運|歲/.test(t)), '只列牽涉運歲的關係');
  ok(types('甲申 丙寅 戊子 丁巳').includes('半合:年日') && !types('甲申 丙寅 戊辰 丁巳').some(t => t.startsWith('半合')), '半合須有中神：申子列、申辰缺子不列');
  ok(types('甲子 丙寅 戊辰 丁巳 丙午 丙午', true).includes('歲運並臨:運歲') && types('甲子 丙寅 戊辰 丁巳 戊辰 丙午', true).includes('伏吟:日運'), '歲運並臨、伏吟');
  // 表格的結構性質：十二地支、十天干兩兩配對全掃一遍，防表格打錯字
  const pair = (x, y) => PP.relations(P4(`${x} ${y}`).map(p => ({ ...p, natal: true }))).map(r => r.type);
  let v = 0; const cnt = {};
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) {
    const r = pair('甲' + PP.ZHI[i], '甲' + PP.ZHI[j]); r.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
    if (r.includes('地支六合') !== ((i + j) % 12 === 1)) v++;   // 六合：兩支序數和除以 12 餘 1
    if (r.includes('地支六沖') !== (j - i === 6)) v++;          // 六沖：相隔六位
    if (r.includes('六害') !== ((i + j) % 12 === 7)) v++;       // 六害：序數和餘 7
    if (r.includes('六破') && ![3, 9].includes(j - i)) v++;     // 六破：相隔三位或九位
  }
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
    const r = pair(PP.GAN[i] + '子', PP.GAN[j] + '子'); r.forEach(t => { cnt[t] = (cnt[t] || 0) + 1; });
    if (r.includes('天干五合') !== (j - i === 5)) v++;          // 五合：相隔五位
    if (r.includes('天干相沖') !== (j - i === 6)) v++;          // 四沖：甲庚乙辛丙壬丁癸
  }
  eq([v, cnt['地支六合'], cnt['地支六沖'], cnt['六害'], cnt['六破'], cnt['地支相刑'], cnt['半合'], cnt['天干五合'], cnt['天干相沖']], [0, 6, 6, 6, 6, 7, 8, 5, 4], '關係表：性質違反數與各類配對數');
  eq(['寅午戌', '申子辰', '亥卯未', '巳酉丑', '寅卯辰', '巳午未', '申酉戌', '亥子丑'].map(s => PP.relations([...s].map((z, i) => ({ pos: '年月日'[i], gan: '甲', zhi: z, natal: true }))).filter(r => /三合|三會/.test(r.type)).map(r => r.text).join()),
    ['寅午戌三合火局', '申子辰三合水局', '亥卯未三合木局', '巳酉丑三合金局', '寅卯辰三會木局', '巳午未三會火局', '申酉戌三會金局', '亥子丑三會水局'], '三合三會成局（字序不拘）');
  // 神煞
  const hit = (s, n) => PP.shensha(P4(s).slice(0, 4)).filter(x => x.name === n).flatMap(x => x.hits).join();
  eq([hit('甲辰 丙寅 丁酉 庚戌', '天乙貴人'), hit('甲辰 丙寅 丁酉 庚戌', '文昌'), hit('甲辰 丙寅 丁酉 庚戌', '華蓋')], ['日支酉', '日支酉', ''], '丁酉日坐貴人文昌；年支辰不算自己的華蓋');
  eq([hit('甲辰 丙寅 丙申 庚寅', '華蓋'), hit('甲申 丙寅 丙辰 庚寅', '華蓋'), hit('甲辰 丙寅 丙辰 庚寅', '華蓋')], ['年支辰', '日支辰', '年支辰,日支辰'], '年支日支同屬一局：華蓋從另一柱查得，兩個方向都要列');
  eq([hit('甲申 丙寅 丙子 庚寅', '驛馬'), hit('甲寅 丁卯 丙午 丁酉', '桃花（咸池）'), hit('甲子 丙寅 丙午 丁酉', '羊刃'), hit('甲子 乙亥 戊午 己未', '空亡')], ['月支寅,時支寅', '月支卯', '日支午', '年支子,月支亥'], '驛馬、桃花、羊刃、空亡');
  eq(PP.xunKong('甲子') + PP.xunKong('戊午') + PP.xunKong('癸亥'), '戌亥子丑子丑', '空亡');
  // 旺相休囚死：當令者旺、令生者相、生令者休、剋令者囚、令剋者死
  const table = { 甲: '寅旺 子相 午休 辰囚 申死', 丙: '巳旺 寅相 辰休 申囚 子死', 戊: '辰旺 午相 申休 子囚 寅死', 庚: '酉旺 丑相 亥休 卯囚 午死', 壬: '子旺 申相 寅休 巳囚 未死' };
  let w = 0;
  for (const [g, s] of Object.entries(table)) for (const x of s.split(' ')) if (PP.strength(P4(`甲子 甲${x[0]} ${g}子 甲子`)).ling !== x[1]) w++;
  ok(w === 0, `旺相休囚死 25 例，${w} 例不對`);
}

finish();
