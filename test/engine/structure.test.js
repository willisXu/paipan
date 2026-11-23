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

console.log('■ 相依方向');
{
  const bad = [];
  for (const [file, deps] of graph) for (const d of deps) {
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
  const orphans = [...graph.keys()].filter(f => !reach.has(f));
  ok(orphans.length === 0, `每個模組都從 src/app/main.js 接得到${orphans.length ? '；沒人用的：' + orphans.join('、') : ''}`);
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

console.log('■ 發布流程');
{
  // GitHub Actions 用到的 action 要釘在確切的 commit（40 位的雜湊），後面註明是哪一版：版本號的標籤可以被改指到別的內容
  const wf = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
  const uses = [...wf.matchAll(/^\s*(?:- )?uses:\s*(\S+)(.*)$/gm)].map(m => ({ ref: m[1], rest: m[2] }));
  const loose = uses.filter(u => !/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/.test(u.ref) || !/#\s*v\d+\.\d+\.\d+/.test(u.rest));
  ok(uses.length >= 4 && loose.length === 0, `發布流程的 ${uses.length} 個 action 都釘在 commit 並註明版本${loose.length ? '；沒釘的：' + loose.map(u => u.ref).join('、') : ''}`);
}

console.log(`\n${fail ? '✗' : '✓'} ${pass} 項通過，${fail} 項失敗`);
process.exit(fail ? 1 : 0);
