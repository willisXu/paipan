/* 列印。版面寫在 styles.css 的 @media print，這裡只有兩顆按鈕和紙上頁尾的那一行。
   按鈕只有放上網站的那一版有：發布平台的檢視框不允許開列印對話框，建置時就把按鈕拿掉了（scripts/build.js 的 @SITE 區塊）。
   函式庫沒載入時 main.js 不會走到這裡，按鈕沒有接上任何動作（那時也沒有盤可印）。
   「列印／存 PDF」印目前看的那個分頁，和瀏覽器自己的列印（Ctrl/⌘ + P）相同；
   「八字、紫微一起印」在列印期間替 <body> 加上 print-both，樣式據此把另一個分頁也印出來，印完（afterprint）就拿掉。 */
import { $ } from './dom.js';
import { today } from './state.js';

export function initPrint() {
  /* 紙上頁尾：這張紙是從哪裡、以哪一天為「今天」印的。頁面的「今天」在開頁時取一次，「今」的標記照的就是這一天。
     網址只寫主機和路徑；不是從網站開的（例如存在電腦裡的檔案）就不寫 */
  const here = /^https?:$/.test(location.protocol) ? `${location.host}${location.pathname}` : '';
  $('#printed').textContent = `八字紫微排盤${here ? `（${here}）` : ''}。以 ${today} 為今天：標「今」的是這一天所在的運、年、月、日。讀盤與星曜解讀是程式照規則排的，說的是傾向，不是判決；算法與流派的說明在網頁下方。`;

  // 印完把「兩個都印」的記號拿掉，之後用瀏覽器自己的列印才會回到只印目前的分頁
  window.addEventListener('afterprint', () => document.body.classList.remove('print-both'));
  const go = both => {
    document.body.classList.toggle('print-both', both);
    window.print();
  };
  $('#print')?.addEventListener('click', () => go(false));
  $('#print-both')?.addEventListener('click', () => go(true));
}
