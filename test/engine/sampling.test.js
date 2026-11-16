/* 抽樣工具自檢：確認大家共用的 helpers/random.js 沒有死角、序列沒有變，其他各支的「隨機幾千組」才算數。
   執行：node test/engine/sampling.test.js */
import { eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';

const { rndBirth } = seeded(2026111100);

/* 先確認抽樣本身沒有死角 */
section('亂數取樣涵蓋範圍');
{
  const seen = { y: new Set(), m: new Set(), d: new Set(), h: new Set(), mi: new Set() };
  for (let k = 0; k < 20000; k++) { const b = rndBirth(); for (const key of Object.keys(seen)) seen[key].add(b[key]); }
  eq(Object.values(seen).map(s => s.size), [201, 12, 31, 24, 60], '年、月、日、時、分的每一種值都抽得到');
}

/* 引擎快照的輸入是用種子 20261111 照這個序列產生的。亂數演算法、或 rnd、pick 取亂數的方式一改，
   快照會幾千筆全部對不上，看起來像是引擎壞了；先在這裡攔下來。應有的數值是用整理前的原程式算出來的。 */
section('亂數序列沒有變');
{
  const { rand, rnd, pick } = seeded(20261111);
  eq([rand() * 2 ** 32, rand() * 2 ** 32, rnd(1900, 2100), rnd(0, 59), pick([...'甲乙丙丁戊己庚辛壬癸'])], [2423934258, 3952129822, 2034, 40, '甲'], '種子 20261111 開頭的幾個值（引擎快照的輸入靠這個序列產生）');
}

finish();
