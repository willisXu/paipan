/* 平台差異：網頁（網站版、發布平台的片段）用這一份。
   iPhone、iPad 的 App（第 14 版）建置 dist/app 時，scripts/build.js 把這個檔換成 platform-app.js；兩份要匯出同樣的名字。 */

// 存起來的盤放在哪裡（提示訊息用）
export const HERE = '這個瀏覽器';

/* 列印：交給瀏覽器的列印對話框。不回傳東西，印完由 afterprint 收尾（print.js）。
   App 版改用 iOS 的列印面板，回傳面板關掉時才結束的 Promise */
export function printPage() { window.print(); }

// 存盤以後另外保留一份：網頁沒有別的地方可放
export function mirror() {}

// 啟動時要做的事：網頁沒有
export function initPlatform() {}
