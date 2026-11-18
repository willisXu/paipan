/* 排盤：讀表單 → 呼叫引擎 → 更新共用狀態 → 重畫命主資訊與兩個分頁。
   也管「什麼時候排」：載入範例盤、按排盤、欄位變更，以及指標按著時延後重排。 */
import { bazi, resolveTime, ziwei } from '../engine/index.js';
import { $, showError } from './dom.js';
import { nameOf } from './format.js';
import { SAMPLE } from './places.js';
import { S } from './state.js';
import { convertCalendar, readForm, syncForm, writeForm } from './form.js';
import { renderSummary } from './summary.js';
import { renderBazi, defaultStep, defaultYear } from './view-bazi.js';
import { renderZiwei, currentDecade } from './view-ziwei.js';

// 輸入有錯時，下方留著的是上一次的盤：調淡並設為 inert（不能操作、讀屏略過），免得被當成目前輸入的結果
function setStale(on) {
  $('main').classList.toggle('stale', on);
  document.querySelectorAll('main > .summary, main > .tabbar, main > .panel').forEach(el => { el.inert = on; });
}

let announce = false; // 排完要不要向讀屏報告
// 回傳排盤有沒有成功：畫面上是目前輸入的盤為 true，停在錯誤訊息為 false
export function run() {
  let inp, rt, bz, zw;
  try {
    inp = readForm();
    rt = resolveTime(inp);
    bz = bazi(inp, rt);
    zw = ziwei(inp, rt);
  } catch (e) {
    // 輸入問題原樣說明；其餘是程式或函式庫的意外，不把內部訊息當成指示丟給使用者
    if (!e.user) console.error(e);
    showError(`${e.user ? e.message : `排盤時發生沒有預期到的錯誤（${e.message || e}）。請檢查輸入的生辰，或重新整理頁面再試。`}${S.bz ? '下方變淡的是上一次排出的盤，修正後才會更新。' : ''}`);
    setStale(!!S.bz);
    $('#copyfallback').hidden = true; // 備用文字框裡是上一張盤的文字盤
    $('#live').textContent = ''; // 錯誤訊息自己會被唸出來（role=alert），上一次的「已排盤」不要留著
    return false;
  }
  const full = JSON.stringify(inp);
  if (full === S.full && $('#err').hidden) return true; // 輸入完全沒變（例如只是離開日期欄）：不重畫
  $('#err').hidden = true;
  setStale(false);
  $('#copyfallback').hidden = true;
  /* 排出來的是不是同一張盤：只改姓名、或把同一天從公曆切成農曆，盤都沒變，保留目前選到的運限與宮位。
     八字和紫微分開看：紫微的流派設定只動紫微的盤，八字分頁選到的不動。紫微這邊，換四化版本宮位不動、
     換年界而生年沒變（大多數人）盤也沒變，選到的都留著；生年變了、或換了閏月算法（流月的分段會不同），才算換一張盤 */
  const key = JSON.stringify([rt.instant8, rt.local, inp.gender, inp.ziRule]);
  const zkey = JSON.stringify([key, zw.yearGZ, zw.opts.leap]);
  const same = key === S.key, zsame = zkey === S.zkey;
  Object.assign(S, { full, key, zkey, inp, rt, bz, zw, c: zw.chart });
  if (!same) {
    S.dy = defaultStep(bz);
    S.ln = defaultYear(bz, S.dy);
    S.lm = null;
  }
  if (!zsame) {
    S.curDec = currentDecade();
    S.pal = S.c.palaces.findIndex(p => p.name === '命宮');
    S.dec = S.yr = S.mo = S.day = S.hr = null;
  }
  const warns = renderSummary();
  renderBazi();
  renderZiwei();
  // 第一張盤是頁面自己載入的範例，不必唸；之後每次換盤才說
  if (announce) $('#live').textContent = `已排盤：${nameOf(inp)}，四柱 ${bz.gz.join(' ')}。${warns ? `有 ${warns} 則提醒。` : ''}`;
  announce = true;
  return true;
}

/* 文字類欄位的 change 多半在失焦時才送出，而失焦常是因為使用者正要點別的東西。
   若在滑鼠按下到放開之間重畫，被點的那顆按鈕會被換掉，這一下點擊就不見了。
   所以指標按著的時候先記下，等放開、點擊處理完再排盤。 */
let pointerDown = false, runPending = false;
const requestRun = () => { if (pointerDown) runPending = true; else run(); };
const release = () => { pointerDown = false; if (runPending) { runPending = false; setTimeout(run, 0); } };
const typed = el => el.matches('input[type=text], input[type=number], input[type=date], input[type=time]');
// 日期欄逐鍵輸入時，瀏覽器每打一格就送出 change；年份還沒打完（如 0019）不算錯，等打完、離開欄位或按排盤再檢查
const midEdit = el => el.id === 'date' && document.activeElement === el && !/^[1-9]\d{3}-\d\d-\d\d$/.test(el.value);

export function initRun() {
  $('#sample').addEventListener('click', () => { writeForm(SAMPLE); run(); });
  $('#f').addEventListener('submit', e => { e.preventDefault(); run(); });
  document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
  for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, release, true);
  window.addEventListener('blur', release); // 指標在視窗外放開時收不到 pointerup
  $('#f').addEventListener('change', e => {
    if (e.target.name === 'cal') convertCalendar();
    syncForm();
    if (midEdit(e.target)) return;
    if (typed(e.target)) requestRun(); else run();
  });
  $('#date').addEventListener('blur', requestRun);
}
