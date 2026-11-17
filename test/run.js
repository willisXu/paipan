/* 測試執行器：node test/run.js [engine|browser] [檔名關鍵字…]
   不帶參數跑全部：先跑不需要瀏覽器的 test/engine/（平行，同時跑的行程數 = CPU 核心數），全部結束後再跑 test/browser/（一次一支）。
   每支測試是一個獨立的行程，結束前要印出摘要行；失敗、當掉、逾時或沒印摘要行都算失敗，並印出那一支的完整輸出。
   不負責 build：瀏覽器測試測的是 dist/paipan.html，改完原始碼要先 npm run build。 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(testDir, '..');
// 瀏覽器測試不可平行，也不可和引擎測試同時跑：核心數少的機器上，瀏覽器在高負載下會逾時
const GROUPS = [
  { key: 'engine', title: '引擎（不需要瀏覽器）', jobs: os.availableParallelism() },
  { key: 'browser', title: '瀏覽器', jobs: 1 },
];
// 排程提示：各支大約的秒數。久的先開始，總時間才不會被排在最後的那一支拖長；只影響開始的順序，沒列到的當作很快
const SECONDS = { 'engine/ziwei-yun.test.js': 62, 'engine/ziwei.test.js': 60, 'engine/snapshot.test.js': 27, 'engine/bazi.test.js': 14, 'engine/tables.test.js': 12, 'engine/invariants.test.js': 11, 'engine/time.test.js': 11, 'engine/cli.test.js': 11 };
const TIMEOUT_MIN = 10; // 單支測試的時間上限。正常最久的一支約一分鐘，超過這麼多多半是卡住了
/* 摘要行有三種樣子，都以 ✓ 或 ✗ 開頭：
   「✓ 95 項通過，0 項失敗」（helpers/harness.js 的 finish）
   「✓ 引擎輸出 9927 筆雜湊：9927 筆相同，0 筆不同」「✓ 29 個情境、314 段快照：314 段相同，0 段不同」（兩支快照） */
const SUMMARY = /^([✓✗]) .*?(\d+) ([項筆段](?:通過|相同))，(\d+) ([項筆段](?:失敗|不同))/;

const args = process.argv.slice(2);
if (args.some(a => a.startsWith('-'))) {
  console.log('用法：node test/run.js [engine|browser] [檔名關鍵字…]\n  不帶參數跑全部；engine 只跑不需要瀏覽器的，browser 只跑瀏覽器測試；\n  關鍵字比對檔名，例如 node test/run.js ziwei time、node test/run.js engine snapshot。');
  process.exit(args.every(a => a === '-h' || a === '--help') ? 0 : 2);
}
const isGroup = a => GROUPS.some(g => g.key === a);
const wantGroups = args.filter(isGroup), words = args.filter(a => !isGroup(a));
for (const g of GROUPS) {
  g.files = fs.readdirSync(path.join(testDir, g.key)).filter(f => f.endsWith('.test.js')).map(f => `${g.key}/${f}`).sort()
    .filter(f => (!wantGroups.length || wantGroups.includes(g.key)) && (!words.length || words.some(w => f.includes(w))));
}
const chosen = GROUPS.filter(g => g.files.length);
if (!chosen.length) { console.error(`沒有符合的測試檔：${args.join(' ')}`); process.exit(2); }
if (chosen.some(g => g.key === 'browser') && !fs.existsSync(path.join(root, 'dist', 'paipan.html'))) {
  console.error('找不到 dist/paipan.html。瀏覽器測試測的是建置後的頁面，請先執行 npm run build（只跑引擎測試可用 node test/run.js engine）。');
  process.exit(2);
}

// 沒過關的原因；過關回傳空字串。條件缺一不可：正常結束、有摘要行、摘要行說沒有失敗、狀態碼 0，而且真的檢查到東西
function whyFailed({ code, signal, timedOut, m }) {
  if (timedOut) return `超過 ${TIMEOUT_MIN} 分鐘，已中止`;
  if (signal) return `被 ${signal} 中斷`;
  if (!m) return `沒有印出摘要行（狀態碼 ${code}）`;
  if (m[1] !== '✓' || Number(m[4])) return `${m[4]} ${m[5]}`;
  if (code !== 0) return `摘要行說通過，狀態碼卻是 ${code}`;
  if (!Number(m[2])) return '一項檢查都沒有跑到';
  return '';
}

// 跑一支測試。stdout 和 stderr 收在一起，結束後從裡面找摘要行（取最後一行符合的）
function runOne(file) {
  return new Promise(resolve => {
    const t0 = Date.now(), chunks = [];
    const child = spawn(process.execPath, [path.join(testDir, file)], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, TIMEOUT_MIN * 6e4);
    child.stdout.on('data', c => chunks.push(c));
    child.stderr.on('data', c => chunks.push(c));
    child.on('error', e => chunks.push(Buffer.from(`無法啟動：${e.message}\n`)));
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      const m = output.split('\n').map(line => SUMMARY.exec(line)).filter(Boolean).pop();
      const [pass, passUnit, fail, failUnit] = m ? [Number(m[2]), m[3], Number(m[4]), m[5]] : [0, '', 0, ''];
      resolve({ file, output, seconds: (Date.now() - t0) / 1000, pass, passUnit, fail, failUnit, why: whyFailed({ code, signal, timedOut, m }) });
    });
  });
}

const secs = ms => `${(ms / 1000).toFixed(1)} 秒`;
const row = r => `  ${r.why ? '✗' : '✓'} ${r.file.padEnd(28)}${r.passUnit ? `${String(r.pass).padStart(6)} ${r.passUnit}` : ' '.repeat(13)}${secs(r.seconds * 1000).padStart(10)}${r.why ? `\u3000${r.why}` : ''}`;
const rule = '─'.repeat(20);
const started = Date.now();
for (const g of chosen) {
  const jobs = Math.min(g.jobs, g.files.length), queue = [...g.files].sort((a, b) => (SECONDS[b] || 0) - (SECONDS[a] || 0));
  console.log(`■ ${g.title}：${g.files.length} 支${jobs > 1 ? `，同時跑 ${jobs} 支` : g.files.length > 1 ? '，一次一支' : ''}`);
  const t0 = Date.now();
  g.results = [];
  const worker = async () => {
    for (let file = queue.shift(); file; file = queue.shift()) {
      const r = await runOne(file);
      g.results.push(r);
      console.log(row(r));
      if (r.why) console.log(`${rule} ${r.file} 的輸出 ${rule}\n${r.output.trimEnd()}\n${rule.repeat(3)}`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  g.results.sort((a, b) => g.files.indexOf(a.file) - g.files.indexOf(b.file)); // 跑完的先後不一定，總結照檔名排
  g.ms = Date.now() - t0;
}

// 合計照摘要行的單位分開加：「項通過、項失敗」是驗算與瀏覽器操作，「筆相同」「段相同」是兩支快照
const tally = list => {
  const sum = new Map();
  for (const r of list) for (const [n, unit] of [[r.pass, r.passUnit], [r.fail, r.failUnit]]) if (n) sum.set(unit, (sum.get(unit) || 0) + n);
  return [...sum].map(([unit, n]) => `${n} ${unit}`).join('、') || '沒有結果';
};
const results = chosen.flatMap(g => g.results), failed = results.filter(r => r.why);
console.log(`\n■ 總結\n${results.map(row).join('\n')}\n`);
console.log(failed.length ? `✗ ${results.length} 支裡有 ${failed.length} 支沒過：${failed.map(r => r.file).join('、')}` : `✓ ${results.length} 支全部通過`);
for (const g of chosen) console.log(`  ${g.title}：${tally(g.results)}（${secs(g.ms)}）`);
console.log(`  總時間 ${secs(Date.now() - started)}`);
process.exit(failed.length ? 1 : 0);
