/* 引擎內建表格對函式庫：十神、藏干、十二長生、納音、空亡，拿隨機生辰和 lunar-javascript 逐項比對。
   執行：node test/engine/tables.test.js（約 10 秒） */
import '../helpers/libs.js';
import * as PP from '../../src/engine/index.js';
import { ok, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';

const { rndBirth } = seeded(2026111101);

/* 表格與 lunar-javascript 交叉驗算 */
section('十神／藏干／十二長生／納音／空亡 對 lunar-javascript（20,000 組隨機生辰）');
{
  const S2T = { 杀: '殺', 财: '財', 伤: '傷', 头: '頭', 炉: '爐', 剑: '劍', 锋: '鋒', 蜡: '蠟', 杨: '楊', 钏: '釧', 灯: '燈', 涧: '澗', 长: '長', 钗: '釵', 雳: '靂', 驿: '驛', 带: '帶', 临: '臨', 养: '養', 绝: '絕' };
  const t = s => [...s].map(c => S2T[c] || c).join('');
  let bad = 0; const combos = new Set();
  for (let k = 0; k < 20000; k++) {
    const b = rndBirth();
    const ec = Solar.fromYmdHms(b.y, b.m, b.d, b.h, b.mi, 0).getLunar().getEightChar();
    ec.setSect(1);
    const gz = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getTime()], dm = gz[2][0];
    gz.forEach(s => combos.add(dm + s));
    const lib = [
      [ec.getYearShiShenGan(), ec.getMonthShiShenGan(), ec.getTimeShiShenGan()].map(t),
      [ec.getYearShiShenZhi(), ec.getMonthShiShenZhi(), ec.getDayShiShenZhi(), ec.getTimeShiShenZhi()].map(a => a.map(t).join()),
      [ec.getYearHideGan(), ec.getMonthHideGan(), ec.getDayHideGan(), ec.getTimeHideGan()].map(a => a.join()),
      [ec.getYearDiShi(), ec.getMonthDiShi(), ec.getDayDiShi(), ec.getTimeDiShi()].map(t),
      [ec.getYearNaYin(), ec.getMonthNaYin(), ec.getDayNaYin(), ec.getTimeNaYin()].map(t),
      [ec.getYearXunKong(), ec.getMonthXunKong(), ec.getDayXunKong(), ec.getTimeXunKong()],
    ];
    const mine = [
      [gz[0], gz[1], gz[3]].map(s => PP.tenGod(dm, s[0])),
      gz.map(s => PP.CANG[s[1]].map(c => PP.tenGod(dm, c)).join()),
      gz.map(s => PP.CANG[s[1]].join()),
      gz.map(s => PP.changSheng(dm, s[1])),
      gz.map(s => PP.nayin(s)),
      gz.map(s => PP.xunKong(s)),
    ];
    if (JSON.stringify(lib) !== JSON.stringify(mine)) { bad++; if (bad < 4) console.log('   ', gz.join(' '), JSON.stringify(lib), JSON.stringify(mine)); }
  }
  ok(bad === 0, `有 ${bad} 組不一致`);
  ok(combos.size === 600, `日主 × 六十甲子共 600 種組合應全部出現，實得 ${combos.size}`);
}

finish();
