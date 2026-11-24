/* 已存的盤的同步（第 15 版）：node test/engine/sync.test.js。不需要瀏覽器、不需要網路。
   測 src/app/saved-data.js 的三方合併 merge(上次同步完的那份, 這台現在的, 雲端現在的)：
   - 幾個寫明的情況（第一次登入、兩邊各加各刪、重複、上限、同步途中又改了清單）
   - 隨機兩萬組的性質：這台新存的一定在、這台刪的一定不在、雲端其餘的一定在、不會冒出兩邊都沒有的、不重複
   - 模擬三台裝置隨機存、刪、同步（各台照 account.js 的做法記住上次同步完的那份），最後每台都同步兩次：
     三台和雲端一模一樣，而且剛好是「存過、沒被任何一台刪掉」的那些盤 */
import '../helpers/libs.js';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { seeded } from '../helpers/random.js';
import { merge, sameList, keyOf, MAX_SAVED } from '../../src/app/saved-data.js';

const it = n => ({ name: `盤${n}` });
const names = list => list.map(x => x.name.slice(1)).join(',');

section('寫明的情況');
{
  eq(names(merge(null, [it(1), it(2)], [it(3), it(2)])), '1,2,3', '還沒同步過（第一次登入）：兩邊合起來，這台的在前面，重複的只留一筆，什麼都不刪');
  eq(names(merge(null, [], [it(3)])), '3', '這台沒存過：就是帳號裡的那份');
  eq(names(merge([it(1), it(2)], [it(4), it(1)], [it(2), it(1), it(5)])), '4,1,5', '這台加了 4、刪了 2；別台加了 5：結果 4 在最前，2 不見，5 在');
  eq(names(merge([it(1), it(2)], [it(1), it(2)], [it(1)])), '1', '別台刪了 2，這台沒動：2 不見');
  eq(names(merge([it(1), it(2)], [it(2)], [it(1), it(2)])), '2', '這台刪了 1：雲端那份也拿掉');
  eq(names(merge([it(1)], [it(1)], [it(1)])), '1', '都沒變：照舊');
  eq(names(merge([it(1)], [], [])), '', '兩邊都刪了：沒有');
  eq(names(merge([it(1), it(2)], [it(2), it(1)], [it(1), it(2)])), '1,2', '這台只是換了順序（重新存一次舊的）：照雲端的順序，不算新增');
  const many = Array.from({ length: MAX_SAVED }, (_, i) => it(i + 100));
  const capped = merge([], [it(1), it(2)], many);
  ok(capped.length === MAX_SAVED && capped[0].name === '盤1' && capped[1].name === '盤2' && capped.at(-1).name === `盤${MAX_SAVED + 97}`, `超過上限 ${MAX_SAVED}：留最前面的（這台新存的在前），擠掉雲端最後面的`);
  // 同步途中使用者又存了 9、刪了 1：merge(同步開始時的清單, 現在的清單, 同步的結果) 把這兩個改動接上去
  const local = [it(1), it(2)], now = [it(9), it(2)], synced = [it(1), it(2), it(5)];
  eq(names(merge(local, now, synced)), '9,2,5', '同步途中又改了：新存的 9 加在前面、刪掉的 1 拿掉，同步來的 5 留著');
  ok(sameList([it(1), it(2)], [it(1), it(2)]) && !sameList([it(1), it(2)], [it(2), it(1)]) && !sameList([it(1)], [it(1), it(1)]), 'sameList 比對內容和順序');
  ok(keyOf({ a: 1, b: 2 }) !== keyOf({ b: 2, a: 1 }), 'keyOf 是 JSON 字串（欄位順序要一致，所以一律先經過 clean 整理）');
}

section('隨機兩萬組：合併的性質');
{
  const { rand, rnd } = seeded(150);
  const subset = (pool, p) => pool.filter(() => rand() < p);
  const shuffle = list => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let bad = 0;
  const first = [];
  for (let n = 0; n < 20000; n++) {
    const pool = Array.from({ length: rnd(0, 30) }, (_, i) => it(i));
    const base = rand() < 0.1 ? null : shuffle(subset(pool, 0.5));
    const local = shuffle(subset(pool, 0.5)), server = shuffle(subset(pool, 0.5));
    const out = merge(base, local, server);
    const k = x => new Set(x.map(keyOf));
    const B = k(base || []), L = k(local), S = k(server), O = out.map(keyOf);
    const added = [...L].filter(x => !B.has(x)), removed = base ? [...B].filter(x => !L.has(x)) : [];
    const problems = [
      added.some(x => !O.includes(x)) && '這台新存的不見了',
      removed.some(x => O.includes(x)) && '這台刪掉的又回來了',
      [...S].some(x => !removed.includes(x) && !O.includes(x)) && '雲端那份（這台沒刪的）不見了',
      O.some(x => !L.has(x) && !S.has(x)) && '冒出兩邊都沒有的',
      new Set(O).size !== O.length && '重複了',
      O.slice(0, added.length).join() !== local.filter(x => !B.has(keyOf(x))).map(keyOf).join() && '這台新存的沒有照順序排在最前面',
    ].filter(Boolean);
    if (problems.length) { bad++; if (first.length < 3) first.push(`${problems.join('、')}：base ${base ? names(base) : 'null'}｜local ${names(local)}｜server ${names(server)} → ${names(out)}`); }
  }
  ok(bad === 0, `兩萬組都符合${bad ? `；${bad} 組不符，例如 ${first.join('；')}` : ''}`);
}

section('模擬三台裝置隨機存、刪、同步');
{
  const { rand, rnd, pick } = seeded(151);
  let worst = '';
  let runs = 0, failures = 0;
  for (let trial = 0; trial < 400; trial++) {
    let server = [], next = 0;
    const added = new Set(), deleted = new Set();
    // 每台：這台現在的清單、上次同步完的那份（還沒同步過是 null，和 account.js 剛登入時一樣）
    const devices = Array.from({ length: 3 }, () => ({ local: [], base: null }));
    const syncOn = d => { const merged = merge(d.base, d.local, server); server = merged; d.local = merged; d.base = merged; };
    for (let step = 0; step < rnd(5, 60); step++) {
      const d = pick(devices), r = rand();
      if (r < 0.4) { const x = it(next++); added.add(keyOf(x)); d.local = [x, ...d.local]; }
      else if (r < 0.65 && d.local.length) { const x = pick(d.local); deleted.add(keyOf(x)); d.local = d.local.filter(y => keyOf(y) !== keyOf(x)); }
      else syncOn(d);
    }
    for (let round = 0; round < 2; round++) devices.forEach(syncOn);
    runs++;
    const want = [...added].filter(x => !deleted.has(x)).sort().join('|');
    const got = server.map(keyOf).sort().join('|');
    const same = devices.every(d => sameList(d.local, server));
    if (got !== want || !same) { failures++; if (!worst) worst = `第 ${trial} 次：雲端 ${got}，應為 ${want}${same ? '' : '；三台不一致'}`; }
  }
  ok(failures === 0, `${runs} 次模擬，最後三台和雲端一致，而且剛好是存過、沒被任何一台刪掉的盤${failures ? `；${failures} 次不符，例如 ${worst}` : ''}`);
}

finish();
