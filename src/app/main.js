/* 頁面進入點，只負責啟動：檢查函式庫 → 依固定順序初始化各模組 → 畫出第一張盤。
   其他模組的最上層都只宣告常數與函式，不碰 DOM、不用函式庫，
   所以函式庫沒載入時，這裡來得及顯示錯誤訊息，而不是在載入模組的階段就丟出例外。 */
// 模組本來就是嚴格模式，這一行是寫給打包結果的：esbuild 只認進入點的這個指令，有它，頁面上那段傳統腳本才會以嚴格模式執行
'use strict';
import { $, showError } from './dom.js';
import { SAMPLE } from './places.js';
import { initNow } from './state.js';
import { initForm, writeForm } from './form.js';
import { initFold } from './fold.js';
import { initBaziView } from './view-bazi.js';
import { initZiweiView } from './view-ziwei.js';
import { initTabs, setTab } from './tabs.js';
import { initTextChart } from './text-chart.js';
import { initReadingView } from './view-reading.js';
import { initPrint } from './print.js';
import { initPwa } from './pwa.js';
import { initSaved, renderSaved } from './saved.js';
import { initRun, run } from './run.js';

function start() {
  // 發布時外層文件不一定帶語言標記；標成繁體中文，讀屏發音與漢字字形才會選對
  if (!/^zh/i.test(document.documentElement.lang)) document.documentElement.lang = 'zh-Hant';

  // 表單一律不走瀏覽器原生的送出（那會帶著欄位內容重新載入頁面）。要排在檢查函式庫之前：函式庫沒載入時也一樣
  $('#f').addEventListener('submit', e => e.preventDefault());

  if (typeof Solar === 'undefined' || typeof iztro === 'undefined') {
    showError('排盤函式庫沒有載入，無法排盤。請確認網路連線後重新整理頁面。');
    return;
  }

  // 順序不要調動：下拉選單先有選項，writeForm 才設得了值；「現在」先取好，run 才能用；
  // 其餘是註冊事件，同一個元素上的監聽會照註冊的先後執行
  initForm();
  initFold();
  initNow();
  initBaziView();
  initZiweiView();
  initTabs();
  initTextChart();
  initReadingView();
  initPrint();
  initPwa();
  initSaved();
  initRun();

  writeForm(SAMPLE);
  renderSaved();
  setTab(location.hash.slice(1));
  run();
}

start();
