/* 測試用的亂數與隨機生辰。種子固定，同一支測試每次抽到的都一樣。
   每支測試檔用自己的種子呼叫 seeded()，彼此不共用序列，所以單獨跑和一起跑的結果相同。 */

/* 亂數：mulberry32，全程 32 位元整數運算，種子固定所以每次結果相同。
   不可改回 (seed * 1103515245 + 12345) & 0x7fffffff：乘積超過 2^53 會丟掉低位元，
   月份只抽得到 6 種、23 時永遠抽不到，「隨機兩萬組」其實只涵蓋一小塊。 */
export const mulberry32 = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // 該月天數

/* 一組共用同一個序列的抽樣函式：rand 取 [0, 1)、rnd 取 a 到 b 的整數、pick 從清單挑一個、rndBirth 取一筆公曆生辰。
   引擎快照（engine/snapshot.test.js）的輸入就是照這個序列產生的：這裡的演算法或各函式取亂數的次數一改，
   基準檔就全部對不上，所以 engine/sampling.test.js 把開頭幾個值釘住。 */
export function seeded(seed) {
  const rand = mulberry32(seed);
  const rnd = (a, b) => a + Math.floor(rand() * (b - a + 1));
  const pick = list => list[rnd(0, list.length - 1)];
  const rndBirth = (y0 = 1900, y1 = 2100) => { const y = rnd(y0, y1), m = rnd(1, 12); return { y, m, d: rnd(1, dim(y, m)), h: rnd(0, 23), mi: rnd(0, 59) }; };
  return { rand, rnd, pick, rndBirth };
}
