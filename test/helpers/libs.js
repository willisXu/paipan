/* 把 lunar-javascript 與 iztro 掛到 globalThis，和頁面用 <script> 從 CDN 載入後的樣子一樣。
   iztro 用 dist/iztro.min.js，也就是頁面載入的同一個檔案；不可改成 require('iztro')，那是另一份建置結果。
   只為了副作用而 import，而且要排在 import 引擎之前（頁面上也是函式庫先載入）。 */
import { createRequire } from 'node:module';

// 兩個函式庫都是 CommonJS，頁面上是全域變數；這裡照樣掛到全域，引擎才找得到
const require = createRequire(import.meta.url);
Object.assign(globalThis, require('lunar-javascript'));
globalThis.self = globalThis; // iztro 的瀏覽器版以 self 為全域物件
globalThis.iztro = require('iztro/dist/iztro.min.js');
