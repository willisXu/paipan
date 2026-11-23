/* 排盤引擎的對外介面。頁面與測試只從這個檔 import；這裡不放程式，只把各模組的東西轉出去。
   曆法（節氣、干支曆、農曆）交給 lunar-javascript，紫微本命盤的安星交給 iztro；
   十神、藏干、十二長生、納音、空亡、合沖刑害、神煞，以及紫微的運限與流曜，用引擎自己的公式與表格計算，並在測試中與函式庫交叉驗算。
   不碰 DOM。兩個函式庫由執行環境以全域變數 Solar、Lunar、LunarYear、iztro 提供（頁面從 CDN 載入，測試從 node_modules 載入）；
   各模組只在函式被呼叫時才去用它們，所以函式庫還沒載入時，import 引擎也不會出錯。

   模組與相依（→ 後面是它 import 的模組；沒有循環）：
     ganzhi.js    天干地支的基本表與查詢
     time.js      時間換算：從鐘錶時間求出生瞬間與排盤用時，輸入檢查
     relations.js 合沖刑害 → ganzhi
     shensha.js   神煞 → ganzhi、relations
     strength.js  旺衰觀察、五行字數 → ganzhi
     bazi.js      八字：四柱、節氣位置、大運流年流月、胎元 → ganzhi、time、relations、shensha、strength
     ziwei.js     紫微斗數起盤、流派設定、十干四化表 → ganzhi、time
     ziwei-yun.js 紫微斗數的運限：大限、童限、小限、流年、流月、流日、流時、流曜 → ganzhi、time
   下面的匯出清單就是引擎的對外介面。各模組另外匯出的 gi、zi、ganWxI、zhiWxI、SAN_HE、lunarMonthDay、lunarMonthName、lunarDayName 只給引擎內部用，不從這裡轉出。 */

/**
 * 資料形狀的型別說明寫在各模組裡，並從這裡轉出：頁面或測試要在 JSDoc 標型別時，同樣只參照這個檔，不直接參照其他模組。
 * @typedef {import('./ganzhi.js').Pillar} Pillar
 * @typedef {import('./time.js').TimeParts} TimeParts
 * @typedef {import('./time.js').BirthInput} BirthInput
 * @typedef {import('./time.js').ResolvedTime} ResolvedTime
 * @typedef {import('./relations.js').Relation} Relation
 * @typedef {import('./shensha.js').ShenshaItem} ShenshaItem
 * @typedef {import('./strength.js').StrengthFacts} StrengthFacts
 * @typedef {import('./bazi.js').BaziPillar} BaziPillar
 * @typedef {import('./bazi.js').JieTime} JieTime
 * @typedef {import('./bazi.js').LiuNian} LiuNian
 * @typedef {import('./bazi.js').DaYun} DaYun
 * @typedef {import('./bazi.js').PreYun} PreYun
 * @typedef {import('./bazi.js').LiuYue} LiuYue
 * @typedef {import('./bazi.js').BaziChart} BaziChart
 * @typedef {import('./ziwei.js').ZiweiChart} ZiweiChart
 * @typedef {import('./ziwei-yun.js').YunLayer} YunLayer
 */

export { GAN, ZHI, WX, WX_KEY, CANG, wxOf, yinyang, yearGZ, tenGod, changSheng, nayin, xunKong, jz, seasonOf, wangXiang } from './ganzhi.js';
export { SHICHEN, resolveTime, equationOfTime, zoneOffset, zoneDataCheck, fmt, pad, fromMs, toMs, userError } from './time.js';
export { relations } from './relations.js';
export { shensha } from './shensha.js';
export { strength, wuxingCount } from './strength.js';
export { bazi, bzLiuYue } from './bazi.js';
export { bzReading, bzJudge } from './reading.js';
export { ziwei, SIHUA, ZW_OPTIONS } from './ziwei.js';
export { zwSpans, zwDaXian, zwTongXian, zwXiaoXian, zwLiuNian, zwLiuYue, zwLiuRi, zwLiuShi } from './ziwei-yun.js';
export { zwReading, zwReadLayer, ZW_TEXTS } from './ziwei-reading.js';
