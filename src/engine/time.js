/* 時間換算：把輸入的鐘錶時間（公曆或農曆）換成出生瞬間與排盤用時，並檢查輸入。
   含毫秒數與年月日時分的互換、農曆月日的寫法、均時差、IANA 時區偏移、時辰、給使用者看的錯誤 userError。
   農曆換公曆用全域的 Lunar（lunar-javascript），時區資料用執行環境的 Intl；不 import 其他模組。 */

/**
 * 年月日時分的數字欄位，不帶時區：它指的是哪個時區的時間，由用它的地方決定。秒以下不保留。
 * @typedef {object} TimeParts
 * @property {number} y 年
 * @property {number} m 月，1–12
 * @property {number} d 日，1–31
 * @property {number} h 時，0–23
 * @property {number} mi 分，0–59
 */

/**
 * 一份生辰設定，resolveTime()、bazi()、ziwei() 共用。頁面另外帶著的 name、place，引擎不讀。
 * @typedef {object} BirthInput
 * @property {'solar'|'lunar'} calendar 出生日期用哪一種曆：'lunar' 讀 ly、lm、ld、leap；其餘一律當公曆，讀 y、m、d
 * @property {number} [y] 公曆年。出生日期（農曆的話是換成公曆之後）要在 1900 到 2100 年之間，超出就拋 userError
 * @property {number} [m] 公曆月，1–12
 * @property {number} [d] 公曆日
 * @property {number} [ly] 農曆年（以正月初一換年的那個年數）
 * @property {number} [lm] 農曆月，1–12。閏月也填正數，另外用 leap 標示
 * @property {number} [ld] 農曆日，1–30
 * @property {boolean} [leap] 是否為閏月
 * @property {number} h 鐘錶時間的時，0–23
 * @property {number} mi 鐘錶時間的分，0–59
 * @property {number} [lon] 出生地經度，東經為正、西經為負。只有 useTST 為 true 時才讀
 * @property {number} tz 出生地「現行」的標準時區，單位小時，−12 到 14，可帶小數（台灣 8、印度 5.5）
 * @property {string} [zone] IANA 時區名稱，例如 'Asia/Taipei'。clock 為 'auto' 時拿它查出生當時鐘錶的 UTC 偏移
 * @property {'auto'|'std'|'dst'} clock 輸入的鐘錶時間怎麼換回標準時：
 *   'auto' 查 zone 的時區資料（含夏令時間與歷史上的標準時變動），沒給 zone 就等同 'std'；
 *   'std' 當作現行標準時；'dst' 當作夏令時間，比標準時快一小時
 * @property {boolean} useTST 是否校正真太陽時
 * @property {'next'|'same'} ziRule 子時立場：'next' 是 23:00 換日換柱；'same' 是夜子時不換日（日柱不換，時干用次日子時）。
 *   resolveTime() 不讀，bazi()、ziwei() 才用
 * @property {'男'|'女'} gender 性別。resolveTime() 不讀；bazi() 用來定大運順逆，ziwei() 交給 iztro。
 *   只接受這兩個值，其他寫法 bazi()、ziwei() 都拋 userError
 */

/**
 * resolveTime() 的結果：同一個出生瞬間的三種表示法（輸入的鐘錶時間、UTC+8、排盤用時），加上換算過程中的各個分鐘數。
 * @typedef {object} ResolvedTime
 * @property {TimeParts} clock 輸入的鐘錶時間：出生地當時牆上的鐘，沒有做任何校正（農曆輸入已換成公曆日期）
 * @property {TimeParts} instant8 同一個瞬間在 UTC+8 的時間。
 *   函式庫的節氣時刻以 UTC+8 計，所以年柱、月柱、節氣位置、起運都看它
 * @property {TimeParts} local 排盤用時，定日柱、時柱與紫微。
 *   沒開真太陽時，是出生地的現行標準時（夏令時間、歷史時區的差已扣回）；
 *   開了，是真太陽時（UTC 加上經度 × 4 分與均時差，修正量四捨五入到分）
 * @property {number} utcMs 出生瞬間的 UTC 毫秒數
 * @property {number} offsetMin 出生當時的鐘錶比 UTC 快幾分鐘（東正西負）：
 *   'std' 等於 nominalMin，'dst' 是 nominalMin + 60，'auto' 是時區資料查到的值（早年的地方平時會帶小數）
 * @property {number} nominalMin 現行標準時區比 UTC 快幾分鐘，也就是 tz × 60
 * @property {number} shiftMin nominalMin − offsetMin：鐘錶時間加上這個數，就是現行標準時。
 *   0 表示當時的鐘就是現行標準時，夏令時間是 −60
 * @property {string|null} zoneUsed 這次的 offsetMin 確實是用時區資料查出來時，為那個 IANA 時區名稱；
 *   手動模式、沒給 zone、查不到時為 null
 * @property {number|null} altOffsetMin 鐘錶往回撥（例如夏令時間結束）時，同一個鐘面時間當天會出現兩次。
 *   這時 offsetMin 取後一次（撥回之後），這一欄是前一次的偏移；平常、以及不是用時區資料查的時候為 null
 * @property {boolean} skipped 鐘錶往前撥（例如夏令時間開始）時跳過去、當天不存在的鐘面時間為 true；
 *   這時 offsetMin 取撥動之前的偏移
 * @property {boolean} zoneFailed 要查時區資料、但執行環境查不到時為 true；這時 offsetMin 退回 nominalMin，也就是當作標準時
 * @property {number} lonMin 經度時差（分鐘）＝經度 × 4 − nominalMin：出生地的地方平太陽時比現行標準時快多少。
 *   沒開真太陽時為 0
 * @property {number} eotMin 均時差（分鐘）：真太陽時減平太陽時。沒開真太陽時為 0
 * @property {number} hourIndex 排盤用時落在哪個時辰：0 子 … 11 亥，可當 SHICHEN 的索引。23 時和 0 時都是 0
 * @property {boolean} lateZi 排盤用時是否在 23:00–23:59（晚子時）。這裡只標記；換不換日，由 bazi()、ziwei() 依 ziRule 決定
 * @property {number} toBoundary 排盤用時離最近的時辰交界（奇數整點）幾分鐘，0–60。0 是正好在交界上
 */

const MIN = 6e4;
/**
 * 把毫秒數當成 UTC 拆成年月日時分，秒以下捨去。引擎不管哪個時區的時間，都先當成 UTC 換成毫秒數來加減，算完再用它拆回欄位。
 * @param {number} ms
 * @returns {TimeParts}
 */
const fromMs = ms => {
  const D = new Date(ms);
  return { y: D.getUTCFullYear(), m: D.getUTCMonth() + 1, d: D.getUTCDate(), h: D.getUTCHours(), mi: D.getUTCMinutes() };
};
/**
 * fromMs 的反向：把年月日時分當成 UTC 組成毫秒數。
 * @param {TimeParts} t
 * @returns {number}
 */
const toMs = t => Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi);
/**
 * 數字補零到至少兩位，排日期、時間用。
 * @param {number} n
 * @returns {string}
 */
const pad = n => String(n).padStart(2, '0');
/**
 * 把年月日時分排成「YYYY-MM-DD HH:MM」。
 * @param {TimeParts} t
 * @returns {string}
 */
const fmt = t => `${t.y}-${pad(t.m)}-${pad(t.d)} ${pad(t.h)}:${pad(t.mi)}`;

const LUNAR_M = ['', '正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const lunarDayName = d => (d <= 10 ? '初' + '一二三四五六七八九十'[d - 1] : d < 20 ? '十' + '一二三四五六七八九'[d - 11] : d === 20 ? '二十' : d < 30 ? '廿' + '一二三四五六七八九'[d - 21] : '三十');
/**
 * 農曆月日的寫法，例如「十月廿八」「閏二月初十」。年份由呼叫端自己接：八字寫干支紀年，紫微寫公曆年數。
 * @param {number} month 農曆月，1–12
 * @param {number} day 農曆日，1–30
 * @param {boolean} leap 是否為閏月
 * @returns {string}
 */
const lunarMonthDay = (month, day, leap) => `${leap ? '閏' : ''}${LUNAR_M[month]}月${lunarDayName(day)}`;

/**
 * 均時差（分鐘），Spencer 公式，誤差約半分鐘。
 * @param {TimeParts} t 要算的時刻；resolveTime() 傳的是 UTC
 * @returns {number} 真太陽時減平太陽時，分鐘；正值表示真太陽時比較快
 */
function equationOfTime(t) {
  const doy = (Date.UTC(t.y, t.m - 1, t.d) - Date.UTC(t.y, 0, 1)) / 864e5 + 1;
  const g = (2 * Math.PI / 365) * (doy - 1 + (t.h + t.mi / 60 - 12) / 24);
  return 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
}

// 依 IANA 時區資料，把某地的「鐘錶時間」對回瞬間。含夏令時間與歷史上的標準時變動。
const zoneFmt = new Map();
// 某個瞬間（UTC 毫秒數）當下，該時區的鐘錶比 UTC 快多少。回傳毫秒（整數）：早年的地方平時帶秒數，換成分鐘會有小數，比對時容易差一點
function offsetAt(zone, ms) {
  if (!zoneFmt.has(zone)) zoneFmt.set(zone, new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  const p = {};
  zoneFmt.get(zone).formatToParts(new Date(ms)).forEach(x => { p[x.type] = Number(x.value); });
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - ms;
}
/* 鐘錶時間 → UTC 偏移（分鐘）。鐘錶往回撥的那一段，同一個鐘面時間當天出現兩次；往前撥的那一段，有些鐘面時間根本不存在。
   offset：採用的偏移。出現兩次時取後一次（撥回之後的那一次；夏令時間結束時就是標準時那一次），不存在時取撥動之前的偏移。
   alt：出現兩次時，前一次的偏移，否則為 null。skipped：這個鐘面時間不存在。 */
function zoneLookup(zone, wallMs) {
  const at = ms => offsetAt(zone, ms);
  const fits = o => at(wallMs - o) === o; // 把鐘面時間當成偏移 o 來讀，那個瞬間的偏移果然是 o
  // 先當成 UTC+8 猜一個瞬間，再用猜到的偏移修正一次
  let o = at(wallMs - 480 * MIN);
  o = at(wallMs - o);
  const dayBefore = at(wallMs - o - 864e5), dayAfter = at(wallMs - o + 864e5);
  if (!fits(o)) return { offset: dayBefore / MIN, alt: null, skipped: true };
  const other = [dayBefore, dayAfter].find(x => x !== o && fits(x)); // 前後一天內出現過的另一個偏移，也讀得通就是出現兩次
  return other === undefined ? { offset: o / MIN, alt: null, skipped: false } : { offset: Math.min(o, other) / MIN, alt: Math.max(o, other) / MIN, skipped: false };
}
/**
 * @param {string} zone IANA 時區名稱，例如 'Asia/Taipei'
 * @param {number} wallMs 當地的鐘錶時間，用 toMs() 組成的毫秒數（鐘錶上的年月日時分直接當成 UTC）
 * @returns {number} 那個鐘錶時間當下比 UTC 快幾分鐘（台灣標準時 480，實施夏令時間時 540）。
 *   鐘面時間出現兩次或不存在時怎麼取，見 ResolvedTime 的 altOffsetMin、skipped
 * @throws {RangeError} 執行環境不認得這個時區名稱時，由 Intl.DateTimeFormat 丟出
 */
const zoneOffset = (zone, wallMs) => zoneLookup(zone, wallMs).offset;

/**
 * 十二時辰的名稱，索引就是 ResolvedTime 的 hourIndex。
 * @type {string[]}
 */
const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const hourBranchIndex = h => Math.floor((h + 1) / 2) % 12;

/**
 * 輸入有問題時拋出的錯誤。user 標記表示訊息是寫給使用者看的，介面可以原樣顯示。
 * @param {string} msg 給使用者看的訊息
 * @returns {Error & {user: boolean}} user 固定為 true
 */
const userError = msg => Object.assign(new Error(msg), { user: true });
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

const MIN_YEAR = 1900, MAX_YEAR = 2100; // 可排的範圍，以公曆年計。測試只涵蓋這一段，函式庫在更早、更晚的年份也有排不出來的日子

/**
 * 回傳同一個出生瞬間的三種表示法：clock（輸入的鐘錶時間）、instant8（換成 UTC+8，用來對節氣）、local（排盤用時，定日柱時柱與紫微）。
 * 輸入不合理時拋出 userError，不讓不存在的日期、超出範圍的年份或缺漏的時區靜默算下去。
 * @param {BirthInput} inp
 * @returns {ResolvedTime}
 * @throws {Error} 時、分、時區、經度超出範圍，日期不存在，或出生日期不在公曆 1900 到 2100 年之間時，丟出 userError（帶 user: true 的 Error）
 */
function resolveTime(inp) {
  if (!isInt(inp.h, 0, 23) || !isInt(inp.mi, 0, 59)) throw userError('出生時間要在 00:00 到 23:59 之間。');
  if (!(Number.isFinite(inp.tz) && inp.tz >= -12 && inp.tz <= 14)) throw userError('標準時區要填 −12 到 14 之間的數字，例如台灣填 8。');
  if (inp.useTST && !(Number.isFinite(inp.lon) && inp.lon >= -180 && inp.lon <= 180)) throw userError('校正真太陽時需要出生地經度（−180 到 180，西經為負）。');
  let y = inp.y, m = inp.m, d = inp.d;
  if (inp.calendar === 'lunar') {
    const lm = inp.leap ? -inp.lm : inp.lm;
    const fail = () => userError(inp.leap ? `農曆 ${inp.ly} 年沒有閏 ${inp.lm} 月，或該月沒有第 ${inp.ld} 天。` : `農曆 ${inp.ly} 年 ${inp.lm} 月沒有第 ${inp.ld} 天。`);
    // 年月日都要是範圍內的整數：函式庫會把字串轉成數字、把負的月份當成閏月，不先擋就會靜默排成別的日子
    if (!Number.isInteger(inp.ly) || !isInt(inp.lm, 1, 12) || !isInt(inp.ld, 1, 30)) throw fail();
    if (inp.ly < MIN_YEAR - 1 || inp.ly > MAX_YEAR) throw userError(`農曆 ${inp.ly} 年超出可排的範圍（公曆 ${MIN_YEAR} 到 ${MAX_YEAR} 年）。`);
    let S;
    // 函式庫對不存在的農曆日期會丟例外；函式庫本身沒載入（ReferenceError）是另一回事，不可說成日期不存在
    try { S = Lunar.fromYmd(inp.ly, lm, inp.ld).getSolar(); } catch (e) { if (e instanceof ReferenceError) throw e; throw fail(); }
    // 換算回去確認是同一個農曆日，避免函式庫對不存在的日期靜默進位
    const back = S.getLunar();
    if (back.getYear() !== inp.ly || back.getMonth() !== lm || back.getDay() !== inp.ld) throw fail();
    y = S.getYear(); m = S.getMonth(); d = S.getDay();
    // 農曆 1899 年十二月是公曆 1900 年 1 月，農曆 2100 年底已是公曆 2101 年：範圍一律看換成公曆之後
    if (y < MIN_YEAR || y > MAX_YEAR) throw userError(`農曆這一天是公曆 ${y} 年 ${m} 月 ${d} 日，超出可排的範圍（公曆 ${MIN_YEAR} 到 ${MAX_YEAR} 年）。`);
  } else {
    const chk = new Date(Date.UTC(y, m - 1, d));
    if (!Number.isInteger(y) || !isInt(m, 1, 12) || !isInt(d, 1, 31) || chk.getUTCMonth() !== m - 1 || chk.getUTCDate() !== d) throw userError(`公曆沒有 ${y} 年 ${m} 月 ${d} 日。`);
    if (y < MIN_YEAR || y > MAX_YEAR) throw userError(`出生日期要在公曆 ${MIN_YEAR} 到 ${MAX_YEAR} 年之間。`);
  }
  const clock = { y, m, d, h: inp.h, mi: inp.mi };
  const wallMs = toMs(clock);
  const nominalMin = inp.tz * 60;
  let offsetMin = nominalMin, zoneUsed = null, zoneFailed = false, altOffsetMin = null, skipped = false;
  if (inp.clock === 'dst') offsetMin = nominalMin + 60;
  else if (inp.clock !== 'std' && inp.zone) {
    try {
      const z = zoneLookup(inp.zone, wallMs);
      offsetMin = z.offset; altOffsetMin = z.alt; skipped = z.skipped; zoneUsed = inp.zone;
    } catch (e) { zoneFailed = true; }
  }
  const utcMs = wallMs - offsetMin * MIN;
  const instant8 = fromMs(utcMs + 480 * MIN);
  let lonMin = 0, eotMin = 0, local;
  if (inp.useTST) {
    lonMin = inp.lon * 4 - nominalMin;
    eotMin = equationOfTime(fromMs(utcMs));
    local = fromMs(utcMs + Math.round(inp.lon * 4 + eotMin) * MIN);
  } else {
    local = fromMs(utcMs + nominalMin * MIN);
  }
  const into = (local.h * 60 + local.mi + 60) % 120; // 進入本時辰的分鐘數
  return {
    clock, instant8, local, utcMs, offsetMin, nominalMin, shiftMin: nominalMin - offsetMin, zoneUsed, zoneFailed, altOffsetMin, skipped, lonMin, eotMin,
    hourIndex: hourBranchIndex(local.h), lateZi: local.h === 23, toBoundary: Math.min(into, 120 - into),
  };
}

// 對外，由 index.js 轉出
export { SHICHEN, resolveTime, equationOfTime, zoneOffset, fmt, pad, fromMs, toMs, userError };
// 只給引擎內的其他模組用
export { lunarMonthDay };
