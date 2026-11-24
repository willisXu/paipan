# 八字紫微排盤

單頁排盤工具：同一份生辰排出子平八字與紫微斗數命盤，並照規則寫出八字的讀盤紀錄與紫微的星曜解讀（說的是傾向，不是判決）。
可排的範圍是公曆 1900 到 2100 年。可以加到 iPhone、iPad 的主畫面當成 App 用，沒有網路也能排盤；
另有包成 iPhone、iPad 原生 App 的版本（第 14 版，準備上架 App Store，見下面「iPhone、iPad App」）。

線上版：https://willisxu.github.io/paipan/

## 指令

```
npm install            # 版本固定（package-lock.json）
npx playwright install --only-shell chromium   # 瀏覽器測試用的 Chromium，裝一次就好
npm run build          # 輸出 dist/site/、dist/app/ 與 dist/paipan.html
npm run lint
npm test               # 引擎測試，不需要瀏覽器，約 2 分鐘
npm run test:browser   # build 後跑瀏覽器測試，約 4 分鐘
npm run check          # lint → build → 全部測試。推上去之前跑這個
node scripts/paipan.js --help                  # 命令列排盤，見下面「命令列」
```

`node test/run.js <關鍵字>` 只跑檔名符合的幾支；每支測試也能單獨用 `node` 執行。

build 的輸出在 `dist/`，不進版本庫：

- `dist/site/`：完整的網站，整個資料夾放上任何靜態主機就能用，線上版就是它。`index.html` 加上 `lib/` 裡的兩個函式庫檔與授權條款；
  函式庫和網頁放在一起，不連 CDN（少一個外部相依，CDN 連不上的地方也能用）。有列印按鈕。
- `dist/paipan.html`：同一個頁面的單檔版本，不含 `<html>`、`<head>` 外層，給會自己補外層的發布環境用；函式庫從 jsDelivr 載入。
  沒有列印按鈕：那種環境把頁面放在檢視框裡，開不了列印對話框。
  大部分瀏覽器測試測的是這個檔，`site.test.js`、`print.test.js` 測的是 `dist/site/`。
- `dist/app/`：iPhone、iPad App 裡的網頁（`npx cap sync ios` 把它複製進 Xcode 專案）。和網站版同一份頁面，但完全不連網路
  （函式庫、霞鶩文楷字型都放在裡面）、沒有 service worker；列印與存檔備份接到原生。`app.test.js` 測這一份。

## 發布

推到 `main`，`.github/workflows/pages.yml` 會跑 `npm run check`（語法檢查、建置、引擎與瀏覽器測試），全部通過才把 `dist/site` 發布到 GitHub Pages。
開 PR 也會跑同一套檢查，但不發布。

換一個 repo 使用時，要先到 Settings → Pages，把 Source 設成「GitHub Actions」，否則發布那一步會失敗。

## 網頁 App（iPhone、iPad）

線上版可以加到主畫面，當成一個獨立的 App：

1. 用 Safari 打開 https://willisxu.github.io/paipan/
2. 點分享按鈕 → 「加入主畫面」（iOS 26 起預設就是「以網頁 App 開啟」）→ 加入
3. 從主畫面的「排盤」圖示打開。第一次打開會把頁面和兩個函式庫存到這台裝置，之後沒有網路也能排盤（會提示一次「已可離線使用」）

- 有新版本時，開 App 會在背景下載，下載好了畫面底下出現「有新版本」，按了才換——不會自己重新整理打斷正在看的盤。
- 存的盤只在那個 App 裡：iOS 上主畫面 App 和 Safari 的資料是分開的，換一台裝置也帶不過去。
- 網頁字型第一次載入後也會存起來；連不上 Google Fonts 時（例如在中國大陸）改用系統字型（iPhone、iPad 是蘋方），排版不受影響。
- github.io 在中國大陸時好時壞：在連得上的地方先裝好、打開一次，之後離線照常能用，只是換新版要連得上。
- 只有線上版（`dist/site/`）有這些；發布平台用的單檔版不註冊 service worker。

做法：`dist/site/` 多了 `manifest.webmanifest`、`icons/`（`scripts/icons.js` 產生、提交在 `src/icons/`）與 `sw.js`（原始檔 `src/sw.js`）。
建置時把預先快取的檔案清單和這些檔案內容的雜湊填進 `sw.js`：任何一個檔變了，`sw.js` 就跟著變，瀏覽器才會裝新版本；
網站裡有檔案沒列進預先快取，建置會擋。頁面這一邊在 `src/app/pwa.js`。

## iPhone、iPad App（第 14 版，Capacitor）

同一份網頁用 [Capacitor](https://capacitorjs.com/) 8 包成原生 App，準備上架 App Store。識別碼 `io.github.willisxu.paipan`，主畫面上叫「排盤」，
iPhone、iPad 都支援，最低 iOS 16。原生專案在 `ios/`（提交進版本庫；`ios/App/App/public` 是複製過去的網頁，不提交）。

```
npm run build && npx cap sync ios    # 建網頁 dist/app → 複製進 ios/App/App/public，依 node_modules 寫好 Swift 套件的版本
open ios/App/App.xcodeproj           # 在 Mac 上用 Xcode 26 開；第一次會下載 Capacitor 的 Swift 套件
```

在 Xcode 裡：選 App 這個 target → Signing & Capabilities → Team 選開發者帳號 → 選模擬器或接上的 iPhone、iPad 執行。
上架：Product → Archive → Distribute App → App Store Connect。改了網頁要重跑上面兩行，Xcode 才會拿到新的 `public/`。

和網頁版不同的地方：

- **完全不連網路**：函式庫和網站版一樣放在一起；字型改帶霞鶩文楷 TC 的 400、700 兩個字重（照 Unicode 範圍切成小檔，用到才讀，約 9 MB），
  內文用系統的蘋方；頁首有內容安全政策，只准載入 App 自己的檔案。沒有 manifest、service worker：新版本跟著 App 更新。
- **列印**：WKWebView 不理會網頁的 `window.print()`，「列印／存 PDF」改開 iOS 的列印面板（面板裡也能分享、存成 PDF）。
  iOS 的列印不讀 `@page`，邊界由原生給（12 mm）；「兩個都印」的記號等面板關掉才拿掉。
- **存起來的盤另外留備份**：WKWebView 的 localStorage 在裝置空間不足時可能被系統清掉，存盤時原生那邊（UserDefaults）也存一份，
  啟動時頁面那份不見了就補回來；兩邊不同以頁面為準。
- 頁尾的列印說明換成 iOS 的版本，另外附開放原始碼授權（App 裡帶的程式與字型，條款原文；紙上不印）。
- 底色、強調色跟著網頁：啟動畫面、網頁畫出來之前的底色是網頁的紙色（深色模式用深色的），系統元件（列印面板的按鈕）用網頁的茄紫。

做法：頁面程式裡和平台有關的只有 `src/app/platform.js`（網頁版）一個檔；建置 `dist/app` 時整個換成 `platform-app.js`，
它用 `@capacitor/core` 呼叫原生外掛 `PaipanApp`（`ios/App/App/PaipanAppPlugin.swift`：`printPage`、`getAll`、`setItem`）。
外掛在 `PaipanViewController.swift` 註冊；`SceneDelegate.swift` 與 `Main.storyboard` 都指到這個畫面。
App 圖示由 `scripts/icons.js` 一起產生（1024×1024、不帶透明通道）。隱私清單 `PrivacyInfo.xcprivacy`：不追蹤、不收集資料，
用到 UserDefaults（理由 CA92.1）。推上 GitHub 時，動到 App 相關的檔會跑 `.github/workflows/ios.yml`：
在 GitHub 的 Mac 上用 Xcode 建置（給模擬器、不簽名），裝進 iPhone、iPad 模擬器打開、截圖（淺色、深色），截圖放在那次執行的 Artifacts。

## 命令列

`scripts/paipan.js` 印出和頁面「複製文字盤」逐字相同的文字盤，給不開瀏覽器的場合用（Claude 的 Skill 就是呼叫它）。
只需要兩個曆法函式庫：

```
npm ci --omit=dev
node scripts/paipan.js --date 1984-11-20 --time 14:00 --gender 男 --place 台北
node scripts/paipan.js --lunar 2023-2-20 --leap --time 10:00 --gender 女 --place 香港 --zw-leap current
node scripts/paipan.js --sample --at 2026-11-18       # 加印那一天的運限
node scripts/paipan.js --places                       # 可選的出生地
```

- 輸入檢查、文字盤的寫法、「某一天走到哪一格運限」，都直接用頁面的程式：`form.js` 的 `inputFrom()`、`text-chart.js` 的 `textChart()`、
  `view-bazi.js` 的 `yunSel()` 與 `nowSel()`、`view-ziwei.js` 的 `pickToday()`。命令列只管把參數組成表單的值、印出結果，不另外寫一份。
- 不加 `--at`，和頁面上按「複製文字盤」逐字相同。加了 `--at`，紫微運限一段等於頁面按「看今天」之後的文字盤；
  另外多一段八字運限（大運、流年、流月與原局的關係），寫法和八字分頁的關係列一樣出自 `yunSel()`，頁面的文字盤沒有這一段。
- `--at` 以整天計（那一天的 23:59，本機時區）：交節、交運、立春當天都算新的，和畫面上「今」的標示一致。
- 提醒事項的文字和頁面相同，提到的欄位對應的參數：「夏令時間」`--clock`、「真太陽時」`--tst`、「子時立場」`--zi`、
  「自訂經度與時區」`--lon`、`--tz`、「紫微斗數流派設定」`--zw-hua`、`--zw-year`、`--zw-leap`。提醒裡說的「瀏覽器」的時區資料，在命令列是 Node 內建的。
- 西經、西半球的時區照寫負數（`--lon -71.06 --tz -5`）。
- 狀態碼：0 排好了；1 生辰有誤（訊息和頁面上的相同）；2 參數用錯；3 程式本身出錯。

## 結構

```
src/index.html      頁面骨架。兩個曆法函式庫從 jsDelivr 以 <script> 載入
src/styles.css      樣式
src/sw.js           網頁 App 的 service worker（只有網站版有；建置時填入預先快取清單與版本）
src/icons/          主畫面圖示（scripts/icons.js 產生）
src/licenses/       App 版附的授權條款裡，node_modules 沒有的兩份（Apache 2.0 全文、Apache Cordova 的 NOTICE）
src/pages/          網站上的支援頁與隱私權政策（App Store 的支援網址、隱私權政策網址），原樣複製到 dist/site/
src/engine/         排盤引擎。純計算，不碰 DOM
  index.js            對外介面（只做匯出）。頁面與測試只能從這裡取用引擎
  ganzhi.js           干支基本表：五行陰陽、藏干、十神、十二長生、納音、空亡、旺相休囚死
  time.js             時間換算：鐘錶時間 → UTC → 對節氣用的 UTC+8 與排盤用時；輸入檢查
  relations.js        合沖刑害
  shensha.js          神煞
  strength.js         旺衰觀察、五行字數
  bazi.js             四柱、節氣位置、起運前與十步大運的流年、流月（節氣月）、胎元
  ziwei.js            呼叫 iztro 起紫微本命盤；流派設定（四化版本、年界、閏月算法）；十干四化表
  ziwei-yun.js        紫微的運限：大限、童限、小限、流年、流月、流日、流時各在哪一宮，干支、宮名、四化、流曜、流年十二神
  reading.js          八字讀盤：七步法的概覽、旺衰、格局、喜忌；運歲對照喜忌（規則見下面「讀盤與星曜解讀」）
  ziwei-reading.js    紫微星曜解讀：命宮主星、身宮、四化落宮、三方四正的吉煞；全部文字在 ZW_TEXTS 那幾張表
src/app/            頁面程式
  main.js             進入點：檢查函式庫 → 依序初始化 → 畫第一張盤
  run.js              讀表單 → 呼叫引擎 → 更新狀態 → 重畫
  state.js            共用狀態、「今年」與「今天」
  form.js / saved.js  表單讀寫（inputFrom() 不碰 DOM，命令列共用）；存在瀏覽器的盤
  summary.js / view-bazi.js / view-ziwei.js / text-chart.js   各區塊的繪製
  print.js            列印的兩顆按鈕、紙上頁尾的那一行（版面在 styles.css 最後的 @media print）
  view-reading.js     讀盤與星曜解讀兩張卡：bzRecord()、zwNotes() 不碰 DOM，畫面與「複製」共用；收合、看讀盤
  pwa.js / fold.js    網頁 App（註冊 service worker、「有新版本」）；生辰資料收起
  platform.js         和平台有關的幾件事（列印、存盤後的備份、啟動）。建置 App 版時換成 platform-app.js（接原生外掛）
  dom.js / format.js / places.js / tabs.js                    小工具、文字格式、地名表、分頁
scripts/build.js    用 esbuild 打包 src/app/main.js，連同樣式內嵌進骨架，輸出三種成品；@SITE、@WEB、@APP 區塊照成品取捨
scripts/paipan.js   命令列排盤：印出和「複製文字盤」相同的文字盤
scripts/icons.js    產生主畫面圖示與 App 圖示（用 Playwright 的 Chromium 畫，需要思源宋體）
capacitor.config.json  App 的識別碼、名稱、網頁在哪（dist/app）、WKWebView 的設定
ios/                原生專案（Xcode）。自己寫的：App/App 裡的 PaipanViewController.swift、PaipanAppPlugin.swift、PrivacyInfo.xcprivacy；
                    其餘是 Capacitor 的範本，改過的地方：Info.plist、兩個 storyboard、Assets（圖示、Paper 與 AccentColor 兩個顏色）、專案設定
test/run.js         執行器：引擎測試平行跑，瀏覽器測試一次一支
test/engine/        引擎驗算（獨立公式、對函式庫）、引擎輸出快照、結構檢查、命令列
test/browser/       冒煙、表單、盤面與退路、讀盤、無障礙、網站版、列印、網頁 App、iPhone 與 iPad、亂點、畫面對引擎、命令列對畫面、畫面快照
test/helpers/       共用：斷言、亂數、載入函式庫、瀏覽器
test/snapshots/     兩個快照基準檔
```

資料流：表單 → `readForm()`（→ `inputFrom()`）→ `resolveTime(inp)` → `bazi(inp, rt)`、`ziwei(inp, rt)` → 各區塊繪製。
各函式的輸入輸出形狀寫在引擎各檔的 JSDoc。

## 要守的規矩

- **函式庫不打包、不 import**，只用全域的 `Solar`、`Lunar`、`LunarYear`、`iztro`。測試載入的是 `node_modules` 裡和頁面相同的檔案；
  頁面的 CDN 版本、頁尾說明、`package.json`、`node_modules` 四處版本必須相同，`build.js` 會擋。
  網站版用的也是同一份檔案：建置時從 `node_modules` 原樣複製到 `dist/site/lib/`，不可改動內容。
- **載入函式庫的 `<script>` 要帶完整性雜湊**（`integrity` 加 `crossorigin="anonymous"`）：瀏覽器只執行內容和雜湊相符的檔案。
  雜湊必須和 `node_modules` 裡同一個檔相符，也就是和測試驗過的那一份相符，`build.js` 會擋。網站版照樣帶著。
- **輸入檢查以引擎為準**（日期存不存在、年份範圍、性別）。頁面只擋「沒填、格式不對」，不另外寫一份範圍，免得兩邊說法不同。
- **模組最上層不可有副作用**（不碰 DOM、不用函式庫）。CDN 掛掉時要能顯示錯誤訊息，而所有模組的最上層都比 `main.js` 的檢查早執行。
- 相依方向：頁面 → 引擎的 `index.js`；引擎不認得頁面；不可有循環。以上三條由 `test/engine/structure.test.js` 檢查。
- 深色配色在 `styles.css` 寫兩次（跟隨系統、使用者指定），兩段必須相同，`build.js` 會擋。兩段都包在 `@media screen` 裡：印出來一律是淺色。
- **只給某幾種成品的內容**，在 `src/index.html` 裡用成對的標記各佔一行包起來：`<!--@SITE-->` 網站版和 App 版都有（列印按鈕），
  `<!--@WEB-->` 只有網站版（講瀏覽器列印的說明），`<!--@APP-->` 只有 App 版（iOS 列印面板的說明、資料存在哪裡、開放原始碼授權）。
  單檔版三種都拿掉。要開瀏覽器對話框、要下載檔案的功能，單檔版的檢視框做不到，一律放在這種區塊裡。標記不可以套疊，`build.js` 會擋。
- **和平台有關的只放在 `platform.js`**：網頁版與 App 版（`platform-app.js`）匯出同樣的名字；App 版是唯一可以 import 套件的頁面模組，
  而且只能是 `@capacitor/core`。原生外掛的名稱與方法，Swift（`PaipanAppPlugin.swift`）和 `platform-app.js` 兩邊要對得上；
  在 `ios/App/App/` 加了 Swift 檔要同時加進 Xcode 專案的編譯清單。`structure.test.js`、`native.test.js` 會擋。
- **列印版面**寫在 `styles.css` 最後的 `@media print`。只在畫面上有意義的句子（教人怎麼點）加 `class="so"`，只印在紙上的加 `class="po"`。
  整頁的縮放比例和十二宮的列高是量出來的，目標是 A4 直式上八字兩頁、紫微本命盤連同所選宮位的說明一頁。
  動了版面，除了跑 `node test/run.js print`，要實際印成 PDF 看（`page.pdf()`），並多排幾張隨機的盤數頁數。
- **不用直排（`writing-mode`）排字**。直排時每個字佔多高靠的是字型自己帶的直排資料，沒有的字型（例如文泉驛正黑）會把字全部疊在一起。
  紫微的星名、宮干支用「寬度只夠放一個字、一字一換行」，什麼字型都排得出來。`chart.test.js` 會擋。
- 無障礙：按鈕的名稱要包含按鈕上看得到的字（能不寫 `aria-label` 就不寫）；文字對比 4.5:1、輸入欄位外框 3:1；
  手指點的目標至少 24×24，觸控螢幕（`pointer: coarse`）上至少 44×44（Apple 的建議），輸入欄位的字至少 16px（iPhone 點進小於 16px 的欄位會整頁放大）；
  排盤完成要讓讀屏聽得到（`#live`）。觸控的規則放在 `styles.css` 的 `@media (pointer: coarse)`，用滑鼠的裝置尺寸不變；`ios.test.js` 會擋。
  命盤上的字有五行色、四化色，底色又有好幾種，改顏色後跑 `node test/run.js a11y` 確認。
- 提醒事項一律寫成純文字（`summary.js` 的 `warningsOf()`），命主資訊區和文字盤共用。
- **紫微的運限由引擎推算，不向 iztro 查**（`ziwei-yun.js`）。iztro 只負責本命盤；它的運限查詢 `horoscope()` 不跟著閏月、年界的設定走
  （閏月算本月時斗君仍用月中分界的生月，立春年界時虛歲仍從農曆年算），而且一次要十毫秒。
  `ziwei-yun.test.js` 在預設設定下把引擎的每一層和 `horoscope()` 逐項比對；改了運限的算法要先過這一支。
- **年界要同時交給 iztro 的兩個設定**（`ziwei.js` 裡的 `yearDivide` 和 `horoscopeDivide`）。前一個管主星、輔星、宮干、五行局、長生與博士十二神、
  大限、小限、紅鸞天喜；其餘照生年安的雜曜和歲前、將前十二神看後一個。只設一個，生在立春和正月初一之間的人會排出半張照立春年、
  半張照農曆年的盤（第 6 版就是這樣）。`ziwei.test.js` 用兩種方法擋：照生年安的每一樣用口訣核對；再找一個農曆同月同日同時辰、
  生年就是那一年的人，用預設設定排，整張盤要相同。以後加流派設定比照辦理：先想好「換成哪一個生日、用預設設定排，應該是同一張盤」，寫成測試。
- iztro 盤物件上的四柱（`chineseDate`、`rawDates.chineseDate`）是它自己的副產品，年界設成立春時月柱會改照節氣算。頁面不用它：
  四柱一律出自 `bazi()`，紫微的生年干支用 `ziwei()` 回傳的 `yearGZ`。
- 流派設定的選項只在引擎的 `ZW_OPTIONS` 定義一次，第一個是預設值。表單的下拉選單、存檔讀回時的檢查、`format.js` 的短說明都照它；
  加選項時這幾處一起改。存檔裡不認得的值一律當成預設。
- GitHub Actions 用到的 action 釘在確切的 commit，後面註明版本；升版時兩個一起改。`structure.test.js` 會擋。
- **讀盤不計分、不藏規則**。教材沒寫、工具自己訂的規則，在程式註解、頁面說明、README 三處都寫明是工具訂的。
  `reading.test.js` 照同一套文字規則另寫了一份判定表，拿隨機的盤和引擎逐張比對；規則改了，那份判定表要一起改、分布（六千張盤）要重算。
  讀盤的結論要對得上教材的兩張盤（範例盤、第 19 講的對照盤）。文字守第 19 講的分寸（不寫一定、注定，不作健康判斷，不論斷家人），有測試掃。
  紫微的文字只改 `ziwei-reading.js` 的那幾張表。讀盤不進文字盤，命令列也不印（文字盤和命令列逐字相同的約定不動）。
- **service worker 只在網站版**：`pwa.js` 看不到 `<link rel="manifest">`（只有網站版的 `<head>` 有）就什麼都不做。新版本不自動接手（不在安裝時 `skipWaiting()`），
  等使用者按「更新」。一般的瀏覽器測試把 service worker 擋掉（`openSite` 的 `sw: false`），只有 `pwa.test.js` 打開。
- **命令列不另寫邏輯**。頁面程式裡給命令列共用的函式（`inputFrom`、`textChart`、`yunSel`、`nowSel`、`pickToday`）不碰 DOM、不讀表單；
  改了它們，`node test/run.js cli` 兩支都要過。命令列另外擋的只有頁面用下拉選單擋掉的值（`--clock`、`--zi`）。

## 測試

| 種類 | 回答的問題 |
|---|---|
| 引擎驗算 | 排得對不對：用獨立公式、教材錨點、函式庫交叉驗 |
| 引擎輸出快照 | 引擎輸出有沒有變：11,728 筆雜湊（含讀盤 1,500 張盤、星曜解讀 300 張盤） |
| 讀盤 | 教材兩張盤逐步核對；另寫的判定表對引擎；結論的分布；星曜解讀對盤面；文字的分寸。頁面：七段、第 7 步跟著運歲換、複製、收合、看讀盤 |
| 冒煙、表單、盤面 | 頁面操作起來對不對 |
| 無障礙 | axe-core 掃描有沒有違規；文字與欄位外框的對比夠不夠；讀屏唸的和畫面上的字一不一致；手機上的目標夠不夠大 |
| 網站版 | `dist/site/` 用本機伺服器送出來能不能排盤、有沒有去連 CDN、函式庫檔被換掉會不會被擋、是不是結構完整的網頁；支援頁與隱私權政策 |
| 列印 | 列印樣式下（A4、B5、A5 直式）版面有沒有超出紙、不該印的有沒有藏起來、深色模式印出來是不是淺色；印成 PDF 是幾頁；按鈕是不是只有網站版有 |
| 網頁 App | manifest 與圖示；離線重新開能不能排盤；新版本裝好才提示、按了才換；發布平台的片段不註冊 service worker |
| iPhone、iPad | 10 種寬度（含 iPad 分割畫面）的觸控螢幕：目標至少 44×44、欄位字至少 16px、整頁沒有橫向捲軸；生辰資料收起 |
| App 的網頁 | `dist/app/` 有沒有任何對外請求、內容安全政策有沒有擋到東西、字型是不是自帶的；用假的原生橋測列印交給原生、面板開著時不收記號、存盤備份與補回、找不到外掛時的退路；頁尾的說明與授權條款 |
| App 的原生專案 | 不用 Xcode 能擋的：識別碼、版本、最低 iOS、iPhone 與 iPad；Swift 檔都在編譯清單、專案檔的參照都有定義；外掛兩邊的名稱與方法；App 圖示 1024×1024 不帶透明通道；隱私清單；底色、強調色、列印邊界和網頁一致；Capacitor 各套件同版 |
| 亂點 | 固定種子隨便填、隨便點幾百步，頁面會不會丟例外、盤面會不會壞掉 |
| 畫面對引擎 | 隨機排幾十張盤、隨機點運限與宮位，畫面上每一格和引擎用同一組輸入算出來的結果逐項比對 |
| 命令列 | 命令列印的文字盤和頁面「複製文字盤」是否逐字相同（本命盤、看今天、八字運限對畫面上標「今」的那幾格）；參數與錯誤訊息；`--at` 選到的運限另外算一次；換執行環境的時區輸出不變 |
| 畫面快照 | 畫面有沒有變：35 張盤、450 段（含讀盤紀錄、星曜解讀的複製文字） |

快照只抓「變了」，不判斷對錯。重構時快照對不上，要修的是程式。行為是故意改的時候，確認差異符合預期後更新基準檔：

```
node test/engine/snapshot.test.js --update
node scripts/build.js && node test/browser/snapshot.test.js --update
```

快照會用到執行環境的時區歷史資料；換了 Node 或 Chromium 版本後若只有歷史時區的盤不同，先查是不是資料更新。

寫測試時：亂數一律用 `test/helpers/random.js` 的 mulberry32（理由寫在該檔）；瀏覽器測試的時鐘固定在 2026-11-11。
測試機上的字型和使用者的不一樣（頁面的字型從 Google Fonts 載入，測試時擋掉、改用系統字型），所以量版面的檢查要留餘裕，不要釘死到 1px。

## 排盤立場

- 年柱、月柱：出生瞬間對節氣時刻（UTC+8）。日柱、時柱：排盤用時。
  出生時間只到分，和交節落在同一分鐘時當作那一分鐘的 0 秒，頁面會提醒先後分不出來
- 子時：預設 23:00 換日換柱，可改夜子時不換日
- 真太陽時：預設不校正
- 夏令時間與歷史時區：預設依 IANA 時區資料換回現行標準時，可改手動。
  鐘錶撥回而出現兩次的鐘面時間取後一次（頁面說明怎麼指定前一次）；撥快而不存在的鐘面時間照撥動之前的時制算，並提醒確認
- 台灣 1945 到 1947 年的夏令時間照時區資料庫，也就是照當年的公報（1945 年沒有實施、1946 年 5 月 15 日起、1947 年 4 月 15 日到 10 月 31 日）。
  坊間流傳的表把這幾年一律寫成 5 月 1 日到 9 月 30 日，兩邊說法不同的日子頁面會提醒。
  考據見 Yu-Cheng Chuang〈[台灣日光節約時間之考據](https://blog.yorkxin.org/posts/dst-in-taiwan-study/)〉，時區資料庫的台灣規則就是依它修訂的
- 自動換算靠的是瀏覽器內建的時區資料。每張盤會拿所用時區的一兩件史實問一遍（`zoneDataCheck()`），答錯就提醒：
  只帶現行規則的瀏覽器不會出錯，只會安靜地少算一小時
- 金門、馬祖查的是台北的時區資料。1937 年 10 月到 1945 年 9 月台灣用 UTC+9，兩地當時不屬台灣，頁面會提醒自行查證（查不到可靠的史料）
- 十二長生：陰干逆行，火土同宮。虛歲：以立春年起算
- 大運：以交運日換運（起運時刻起每十年同月同日），不是以年。流年以立春換年。
  兩種交界不在同一天，所以每步運列出和它在時間上有重疊的流年（通常十一個），頭尾兩個是交運的那一年，相鄰兩步運都列
- 起運之前：還沒有大運，只列流年（從出生那一年到起運那一年），不另排小運
- 流月：節氣月。流年從立春起，十二個月各從交節的那一刻起算（寅月立春、卯月驚蟄…丑月小寒，到下一個立春為止），
  月干照流年的年干用五虎遁。流月可以不選；選了，運歲關係多接一柱「流月」。流月和原局同干支列伏吟；
  和大運或流年同干支不另外列（歲運並臨只指大運和流年）
- 天干相沖：只認甲庚、乙辛、丙壬、丁癸四組（方位相對、同陰陽相剋），戊己不沖；標「共識」並在頁面上註明
- 紫微本命盤：晚子時換日者以次日子時起盤。四化版本、年界、閏月算法可以在表單的「紫微斗數流派設定」裡換，預設是坊間通行的排法：
  - 四化：戊貪陰右機、庚陽武陰同、壬梁紫左武（和 iztro 的預設表相同）。另有庚干陽武同陰、庚干陽武同相、中州派（戊貪陰陽機、庚陽武府同、壬梁紫府武）。
    各版本的出處說法不一（《全書》的不同抄本就不一致），所以選項用內容命名，不用書名
  - 年界：正月初一，可改立春。決定生年（以及虛歲從哪一年算起）；照生年安的東西整套跟著走：宮干、五行局、年干四化、祿存羊陀魁鉞天馬、
    大限順逆、小限、照生年安的雜曜、歲前與將前十二神。立春以日為單位，立春當天整天算新的一年（函式庫的做法），
    和八字年柱（看交節時刻）不同年時頁面會提醒。流年一律以正月初一換年
  - 閏月：十五日（含）以前算本月、十六日起算下月，可改整個閏月算本月。一律算下個月的算法函式庫不支援，沒有提供
- 紫微的運限：大限用宮干支；第一個大限之前是童限（一歲命宮、二歲財帛、三歲疾厄、四歲夫妻、五歲福德）；
  小限男順女逆、一歲一宮；流年以流年支所在的宮為命宮；流月用流年斗君（流年命宮起正月逆數到生月，再順數到生時）；
  流日從流月命宮起初一順數。流月、流日照農曆的月和日，閏月跟著上面的閏月算法（月中分界時拆成上半、下半兩段）。
  流時從流日命宮起子時，每個時辰順行一宮，時干照日干用五鼠遁。一天照鐘錶的 0 點到 24 點排十三格：早子時（0 到 1 點）、丑時到亥時、
  晚子時（23 到 24 點）；晚子時的命宮和早子時相同，時干用次日的子時（夜子時不換日的排法，iztro 也是這樣）。
  採 23 點換日的看法時，那一個小時就是次日的早子時那一格。「看今天」只疊到流日，不替人選時辰（命令列的 `--at` 也是）。
  流曜十顆（祿羊陀魁鉞昌曲馬鸞喜）依各層的干支安星，流年另有年解、歲前與將前十二神

## 讀盤與星曜解讀

八字的讀盤照《八字命理二十講》第 18 講的七步法：① 資料與立場、② 概覽、③ 旺衰、④ 格局、⑤ 喜忌、⑥ 關係、⑦ 運歲。
每一段寫結論、把握程度（高、中、低）、採信標籤與依據；不計分，判不準就說判不準。教材沒有公式、由工具訂的規則（詳見 `reading.js` 的註解）：

- ③ 旺衰：得勢只看年、月、時三干，分四級（幫身的佔多數、一幫無剋、各一個、勢弱）；月令分旺、相、失令；有沒有根用來修飾。
  月令和另外兩看互相拉扯的寫「強弱接近」，不下結論（約四分之一的盤）。失令、無根、天干沒有印比提示可能是從格；
  月令旺、三干全是印比、地支三處以上有根提示可能是專旺格。只提示，不改結論
- ④ 格局：建祿、月刃、月令是比劫另外論（參考，把握低）；八正格照取格三步，候選的字是比劫就跳過，中氣、餘氣都透時取中氣；
  偏印格盤上有食神才逆用
- ⑤ 喜忌：扶抑、格局、調候三個角度各自贊成或反對。只有贊成的是喜神，有贊成也有反對的待觀察，只有反對的是忌神，沒人提的是閒神；
  兩個角度以上支持而且唯一最多的才是用神。食傷和官殺都被看好時，票少的改列待觀察。調候只用通則（冬與寅月喜火、夏與秋喜水、卯辰兩月不表態）
- ⑦ 運歲：天干一個字、地支看本氣，另藏的喜用也列出；只列依據，不寫會發生什麼事

紫微的星曜解讀是坊間通行說法的整理（專案裡沒有紫微的教材），全部列為參考：命宮主星（空宮借對宮）、身宮、生年四化落宮、
命宮三方四正的吉煞；疊了大限、流年再多一段。只取盤上有的星去對文字表，不計分、不推導格局、不看星曜組合；疾厄宮一律不作健康判斷。

## 升級函式庫

改 `package.json` 的版本 → `npm install` → 改 `src/index.html` 的 CDN 網址、`integrity` 雜湊與頁尾說明 → `npm run check`。
`integrity` 不用自己算：版本改好後跑 `npm run build`，錯誤訊息會印出應該填的值。
快照若有差異，逐筆確認是函式庫修正還是退步。

Playwright 升版要連同 Chromium 一起換（`npx playwright install --only-shell chromium`），畫面快照可能因瀏覽器的時區資料更新而不同。
