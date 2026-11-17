# 八字紫微排盤

單頁排盤工具：同一份生辰排出子平八字與紫微斗數命盤。只排盤，不解盤。
成品是一個 HTML 檔 `dist/paipan.html`。

線上版：https://willisxu.github.io/paipan/

## 指令

```
npm install            # 版本固定（package-lock.json）
npm run build          # 輸出 dist/paipan.html
npm run lint
npm test               # 引擎測試，不需要瀏覽器，約 1.5 分鐘
npm run test:browser   # build 後跑瀏覽器測試。需要另外安裝 Playwright 與 Chromium
npm run check          # lint → build → 全部測試。發布前跑這個
```

`node test/run.js <關鍵字>` 只跑檔名符合的幾支；每支測試也能單獨用 `node` 執行。

build 另外輸出 `dist/site/index.html`，是補上外層骨架、可以直接放上網站的完整網頁。
推到 `main` 時，`.github/workflows/pages.yml` 會跑語法檢查與引擎測試，通過後把它發布到 GitHub Pages。

## 結構

```
src/index.html      頁面骨架。兩個曆法函式庫從 jsDelivr 以 <script> 載入
src/styles.css      樣式
src/engine/         排盤引擎。純計算，不碰 DOM
  index.js            對外介面（只做匯出）。頁面與測試只能從這裡取用引擎
  ganzhi.js           干支基本表：五行陰陽、藏干、十神、十二長生、納音、空亡、旺相休囚死
  time.js             時間換算：鐘錶時間 → UTC → 對節氣用的 UTC+8 與排盤用時；輸入檢查
  relations.js        合沖刑害
  shensha.js          神煞
  strength.js         旺衰觀察、五行字數
  bazi.js             四柱、節氣位置、大運流年、胎元
  ziwei.js            呼叫 iztro 起紫微盤；十干四化表
src/app/            頁面程式
  main.js             進入點：檢查函式庫 → 依序初始化 → 畫第一張盤
  run.js              讀表單 → 呼叫引擎 → 更新狀態 → 重畫
  state.js            共用狀態、「今年」與「今天」
  form.js / saved.js  表單讀寫；存在瀏覽器的盤
  summary.js / view-bazi.js / view-ziwei.js / text-chart.js   各區塊的繪製
  dom.js / format.js / places.js / tabs.js                    小工具、文字格式、地名表、分頁
scripts/build.js    用 esbuild 打包 src/app/main.js，連同樣式內嵌進骨架
test/run.js         執行器：引擎測試平行跑，瀏覽器測試一次一支
test/engine/        引擎驗算（獨立公式、對函式庫）、引擎輸出快照、結構檢查
test/browser/       冒煙、表單、盤面與退路、畫面快照
test/helpers/       共用：斷言、亂數、載入函式庫、瀏覽器
test/snapshots/     兩個快照基準檔
```

資料流：表單 → `readForm()` → `resolveTime(inp)` → `bazi(inp, rt)`、`ziwei(inp, rt)` → 各區塊繪製。
各函式的輸入輸出形狀寫在引擎各檔的 JSDoc。

## 要守的規矩

- **函式庫不打包、不 import**，只用全域的 `Solar`、`Lunar`、`iztro`。測試載入的是 `node_modules` 裡和頁面相同的檔案；
  頁面的 CDN 版本、頁尾說明、`package.json`、`node_modules` 四處版本必須相同，`build.js` 會擋。
- **模組最上層不可有副作用**（不碰 DOM、不用函式庫）。CDN 掛掉時要能顯示錯誤訊息，而所有模組的最上層都比 `main.js` 的檢查早執行。
- 相依方向：頁面 → 引擎的 `index.js`；引擎不認得頁面；不可有循環。以上三條由 `test/engine/structure.test.js` 檢查。
- 深色配色在 `styles.css` 寫兩次（跟隨系統、使用者指定），兩段必須相同，`build.js` 會擋。

## 測試

| 種類 | 回答的問題 |
|---|---|
| 引擎驗算 | 排得對不對：用獨立公式、教材錨點、函式庫交叉驗 |
| 引擎輸出快照 | 引擎輸出有沒有變：9,626 筆雜湊 |
| 冒煙、表單、盤面 | 頁面操作起來對不對 |
| 畫面快照 | 畫面有沒有變：20 張盤、215 段 |

快照只抓「變了」，不判斷對錯。重構時快照對不上，要修的是程式。行為是故意改的時候，確認差異符合預期後更新基準檔：

```
node test/engine/snapshot.test.js --update
node scripts/build.js && node test/browser/snapshot.test.js --update
```

快照會用到執行環境的時區歷史資料；換了 Node 或 Chromium 版本後若只有歷史時區的盤不同，先查是不是資料更新。

寫測試時：亂數一律用 `test/helpers/random.js` 的 mulberry32（理由寫在該檔）；瀏覽器測試的時鐘固定在 2026-11-11。

## 排盤立場

- 年柱、月柱：出生瞬間對節氣時刻（UTC+8）。日柱、時柱：排盤用時
- 子時：預設 23:00 換日換柱，可改夜子時不換日
- 真太陽時：預設不校正
- 夏令時間與歷史時區：預設依 IANA 時區資料換回現行標準時，可改手動
- 十二長生：陰干逆行，火土同宮。虛歲：以立春年起算
- 大運：以交運日換運（每十年同月同日），不是以年
- 紫微：生年與流年以正月初一分界；閏月十五日後算下月；晚子時換日者以次日子時起盤

## 升級函式庫

改 `package.json` 的版本 → `npm install` → 改 `src/index.html` 的兩個 CDN 網址與頁尾說明 → `npm run check`。
快照若有差異，逐筆確認是函式庫修正還是退步。
