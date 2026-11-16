/* 斷言與報告，每支測試檔共用：ok、eq 計數，section 分段並計時，finish 印出摘要行後結束行程。
   摘要行「✓ N 項通過，0 項失敗」是和執行器（test/run.js）的約定：它靠這一行判斷這支測試有沒有跑完、過了幾項。 */
let pass = 0, fail = 0;
export const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗', msg); } };
export const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}：得到 ${JSON.stringify(a)}，應為 ${JSON.stringify(b)}`);
let t0 = Date.now();
const lap = () => { const s = ((Date.now() - t0) / 1000).toFixed(1); t0 = Date.now(); return s; };
export const section = name => { if (section.open) console.log(`  （${lap()} 秒）`); section.open = true; console.log(`\n■ ${name}`); };

// 收尾：補上最後一段的秒數、印出摘要行，有失敗就以非零狀態碼結束。note 接在摘要行後面（例如截圖放在哪）
export function finish(note = '') {
  if (section.open) console.log(`  （${lap()} 秒）`);
  console.log(`\n${fail ? '✗' : '✓'} ${pass} 項通過，${fail} 項失敗${note}`);
  process.exit(fail ? 1 : 0);
}
