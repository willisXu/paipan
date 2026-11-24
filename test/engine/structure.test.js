/* 結構檢查：node test/engine/structure.test.js
   守住模組化之後容易不知不覺被破壞的幾件事——匯出清單、相依方向、沒有循環、模組最上層沒有副作用；另外看發布流程的 action 有沒有釘版本。
   不需要瀏覽器，也不需要兩個曆法函式庫（這正是要驗的：沒有它們也要載入得起來）。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗', msg); } };

const listJs = dir => fs.readdirSync(path.join(root, dir), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.posix.join(dir, f.split(path.sep).join('/'))).sort();
const engineFiles = listJs('src/engine'), appFiles = listJs('src/app');
// 每個檔 import 了哪些專案內的檔（相對路徑解析成專案根目錄起算的路徑）
const importsOf = file => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)]
  .map(m => m[1] || m[2]).map(spec => (spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : spec));
const graph = new Map([...engineFiles, ...appFiles].map(f => [f, importsOf(f)]));

console.log('■ 引擎對外介面');
{
  const expected = ['GAN', 'ZHI', 'WX', 'WX_KEY', 'CANG', 'SHICHEN', 'SIHUA', 'ZW_OPTIONS', 'wxOf', 'yinyang', 'yearGZ', 'tenGod', 'changSheng', 'nayin', 'xunKong', 'jz', 'seasonOf', 'wangXiang',
    'resolveTime', 'equationOfTime', 'zoneOffset', 'zoneDataCheck', 'relations', 'shensha', 'strength', 'wuxingCount', 'bazi', 'bzLiuYue', 'bzReading', 'bzJudge', 'ziwei',
    'zwSpans', 'zwDaXian', 'zwTongXian', 'zwXiaoXian', 'zwLiuNian', 'zwLiuYue', 'zwLiuRi', 'zwLiuShi', 'zwReading', 'zwReadLayer', 'ZW_TEXTS', 'fmt', 'pad', 'fromMs', 'toMs', 'userError'];
  // 這時候全域沒有 Solar、Lunar、iztro：引擎模組的最上層不可以用到它們
  const engine = await import(pathToFileURL(path.join(root, 'src/engine/index.js')).href).catch(e => e);
  ok(!(engine instanceof Error), `沒有曆法函式庫時引擎也載入得起來${engine instanceof Error ? '：' + engine.message : ''}`);
  if (!(engine instanceof Error)) ok(JSON.stringify(Object.keys(engine).sort()) === JSON.stringify([...expected].sort()), `src/engine/index.js 匯出的名字和約定的 ${expected.length} 個相同（多了或少了：${[...Object.keys(engine).filter(k => !expected.includes(k)), ...expected.filter(k => !(k in engine))].join('、') || '無'}）`);
}

/* App 版（第 14 版）：建置 dist/app 時，scripts/build.js 把 src/app/platform.js 整個換成 platform-app.js。
   所以 platform-app.js 雖然沒有人 import，只要 platform.js 接得到進入點就算接得到；它是唯一可以 import 套件的頁面模組，
   而且只能是 @capacitor/core（App 版要的 Capacitor 執行環境，網頁版打包時根本不會碰到這個檔） */
const ALTERNATE = { 'src/app/platform-app.js': 'src/app/platform.js' };
const PACKAGES = { 'src/app/platform-app.js': ['@capacitor/core'] };

console.log('■ 相依方向');
{
  const bad = [];
  for (const [file, deps] of graph) for (const d of deps) {
    if (!d.startsWith('src/') && (PACKAGES[file] || []).includes(d)) continue;
    if (!d.startsWith('src/')) bad.push(`${file} import 了套件 ${d}（函式庫只能用全域變數，其他套件不可引入）`);
    else if (!graph.has(d)) bad.push(`${file} import 的 ${d} 不存在`);
    else if (file.startsWith('src/engine/') && !d.startsWith('src/engine/')) bad.push(`引擎 ${file} 不可 import 引擎以外的 ${d}`);
    else if (file.startsWith('src/app/') && d.startsWith('src/engine/') && d !== 'src/engine/index.js') bad.push(`頁面 ${file} 只能從 src/engine/index.js 用引擎，不可直接 import ${d}`);
  }
  ok(bad.length === 0, `引擎不依賴頁面、頁面只走引擎的對外介面、不引入其他套件${bad.length ? '：\n      ' + bad.join('\n      ') : ''}`);
  // 沒有循環 import
  const state = new Map(); let cycle = null;
  const visit = (f, trail) => {
    if (cycle || state.get(f) === 2) return;
    if (state.get(f) === 1) { cycle = [...trail.slice(trail.indexOf(f)), f].join(' → '); return; }
    state.set(f, 1);
    for (const d of graph.get(f) || []) if (graph.has(d)) visit(d, [...trail, f]);
    state.set(f, 2);
  };
  for (const f of graph.keys()) visit(f, []);
  ok(!cycle, `沒有循環 import${cycle ? '：' + cycle : ''}`);
  // 每個檔都接得到進入點，沒有沒人用的孤兒
  const reach = new Set(); const walk = f => { if (reach.has(f)) return; reach.add(f); (graph.get(f) || []).forEach(d => graph.has(d) && walk(d)); };
  walk('src/app/main.js');
  for (const [alt, of] of Object.entries(ALTERNATE)) if (reach.has(of) && graph.has(alt)) walk(alt);
  const orphans = [...graph.keys()].filter(f => !reach.has(f));
  ok(orphans.length === 0, `每個模組都從 src/app/main.js 接得到（App 版換上的 platform-app.js 算在 platform.js 名下）${orphans.length ? '；沒人用的：' + orphans.join('、') : ''}`);
  // 換上去的那一份要匯出同樣的名字，否則 App 版打包時才會發現少了什麼（或多出來的沒人用）
  for (const [alt, of] of Object.entries(ALTERNATE)) {
    const names = f => [...fs.readFileSync(path.join(root, f), 'utf8').matchAll(/^export (?:const|function|async function|let) (\w+)/gm)].map(m => m[1]).sort();
    ok(names(alt).length > 0 && JSON.stringify(names(alt)) === JSON.stringify(names(of)), `${alt} 和 ${of} 匯出同樣的名字：${names(alt).join('、')}／${names(of).join('、')}`);
  }
}

console.log('■ 模組最上層沒有副作用');
{
  // 在沒有 document、window、函式庫的環境裡 import 每個頁面模組（進入點除外）：只要最上層碰了 DOM 或函式庫就會丟例外。
  // 這條守的是「CDN 掛掉時要顯示錯誤訊息」：所有模組的最上層都比 main.js 的檢查早執行。
  for (const f of appFiles.filter(x => x !== 'src/app/main.js')) {
    const r = await import(pathToFileURL(path.join(root, f)).href).catch(e => e);
    ok(!(r instanceof Error), `${f} 的最上層不碰 DOM 與函式庫${r instanceof Error ? '：' + r.message : ''}`);
  }
  const touched = ['document', 'window', 'Solar', 'Lunar', 'iztro'].filter(k => k in globalThis);
  ok(touched.length === 0, `載入過程沒有在全域留下東西${touched.length ? '：' + touched.join('、') : ''}`);
}

console.log('■ 連網路的地方（第 15 版）');
{
  // 頁面裡只有帳號（account.js）連網路，而且只連帳號的後端。別的模組也要連網路的話，App 的內容安全政策、隱私權政策都要跟著改，
  // 所以在這裡擋一下，讓那個決定是有意識的
  const fetchers = appFiles.filter(f => /\bfetch\(/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  ok(JSON.stringify(fetchers) === '["src/app/account.js"]', `頁面模組裡只有 account.js 呼叫 fetch：${fetchers.join('、') || '沒有'}`);
  // 後端（server/）是另外部署到 Cloudflare 的程式：只 import 自己資料夾裡的檔，不用套件，也不碰網頁的程式
  const serverFiles = listJs('server/src');
  const imports = serverFiles.flatMap(f => importsOf(f).map(d => [f, d]));
  const bad = imports.filter(([, d]) => !d.startsWith('server/src/') || !serverFiles.includes(d));
  ok(serverFiles.length >= 3 && bad.length === 0, `後端的 ${serverFiles.length} 個檔只 import server/src 裡的檔${bad.length ? '：' + bad.map(([f, d]) => `${f} → ${d}`).join('、') : ''}`);
}

console.log('■ 發布流程');
{
  // GitHub Actions 用到的 action 要釘在確切的 commit（40 位的雜湊），後面註明是哪一版：版本號的標籤可以被改指到別的內容。
  // 每一個流程都一樣（發布用的 pages.yml、第 14 版建置 iOS App 的 ios.yml）
  const dir = path.join(root, '.github/workflows');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.yml')).sort();
  ok(files.includes('pages.yml') && files.includes('ios.yml'), `流程檔：${files.join('、')}`);
  for (const f of files) {
    const wf = fs.readFileSync(path.join(dir, f), 'utf8');
    const uses = [...wf.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)].map(m => ({ ref: m[1], rest: m[2] }));
    const loose = uses.filter(u => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(u.ref) || !/#\s*v\d+\.\d+\.\d+/.test(u.rest));
    ok(uses.length >= 3 && loose.length === 0, `${f} 的 ${uses.length} 個 action 都釘在 commit 並註明版本${loose.length ? '；沒釘的：' + loose.map(u => u.ref).join('、') : ''}`);
  }
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} 項通過，${fail} 項失敗`);
process.exit(fail ? 1 : 0);
