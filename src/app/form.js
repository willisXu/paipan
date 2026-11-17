/* 生辰表單：下拉選單內容、欄位之間的連動、把一筆輸入寫進表單、把表單讀成引擎的輸入、公曆農曆互換。 */
import { pad, userError, ZW_OPTIONS } from '../engine/index.js';
import { $ } from './dom.js';
import { zwOptChanges } from './format.js';
import { PLACES, PLACE, LM, LD } from './places.js';

// 出生地與農曆月日的選項由資料表產生
export function initForm() {
  $('#place').innerHTML = PLACES.map(([g, list]) => `<optgroup label="${g}">${list.map(([n, , t]) => `<option value="${n}">${n}${t !== 8 ? `（UTC+${t}）` : ''}</option>`).join('')}</optgroup>`).join('') + '<option value="custom">自訂經度與時區</option>';
  $('#lm').innerHTML = LM.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  $('#ld').innerHTML = LD.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
}

const radio = name => document.querySelector(`input[name=${name}]:checked`).value;
const setRadio = (name, v) => { document.querySelectorAll(`input[name=${name}]`).forEach(el => { el.checked = el.value === v; }); };

// 紫微流派設定的三個下拉選單 ↔ 設定值。選單裡沒有的值（舊存檔沒有這幾欄）一律當成預設
const ZW_FIELDS = [['hua', '#zhua', 'zwHua'], ['year', '#zyear', 'zwYear'], ['leap', '#zleap', 'zwLeap']];
const zwOptions = () => Object.fromEntries(ZW_FIELDS.map(([k, sel]) => [k, $(sel).value]));

let forcedStd = false; // 夏令時間是否因為選了自訂地點而被改成手動
export function syncForm() {
  const lunar = radio('cal') === 'lunar', custom = $('#place').value === 'custom';
  $('#solar-box').hidden = lunar;
  $('#lunar-box').hidden = !lunar;
  $('#custom-box').hidden = !custom;
  // 自訂地點沒有時區資料可查，只能手動
  const clock = $('#clock');
  clock.querySelector('option[value=auto]').disabled = custom;
  if (custom && clock.value === 'auto') { clock.value = 'std'; forcedStd = true; }
  else if (!custom && forcedStd) { if (clock.value === 'std') clock.value = 'auto'; forcedStd = false; }
  // 紫微流派設定平常收著，標題旁邊寫出現在是不是預設：改過的那幾項不必展開也看得到
  const changed = zwOptChanges(zwOptions());
  $('#zopts-now').textContent = changed.length ? `目前：${changed.join('、')}` : '目前都是預設（坊間通行的排法）';
}

export function writeForm(inp) {
  $('#nm').value = inp.name || '';
  setRadio('gender', inp.gender);
  setRadio('cal', inp.calendar);
  if (inp.calendar === 'lunar') {
    $('#ly').value = inp.ly; $('#lm').value = inp.lm; $('#ld').value = inp.ld; $('#leap').checked = !!inp.leap;
  } else {
    $('#date').value = `${inp.y}-${pad(inp.m)}-${pad(inp.d)}`;
  }
  $('#time').value = `${pad(inp.h)}:${pad(inp.mi)}`;
  $('#place').value = inp.place;
  if (inp.place === 'custom') { $('#lon').value = inp.lon; $('#tz').value = inp.tz; }
  $('#clock').value = inp.clock; forcedStd = false;
  $('#tst').value = inp.useTST ? '1' : '0';
  $('#zi').value = inp.ziRule;
  for (const [k, sel, field] of ZW_FIELDS) $(sel).value = ZW_OPTIONS[k].includes(inp[field]) ? inp[field] : ZW_OPTIONS[k][0];
  syncForm();
  if (zwOptChanges(zwOptions()).length) $('#zopts').open = true; // 載入的盤改過流派設定：把那一區打開，免得沒注意到
}

const bad = userError;

/* 表單上每一欄的原始值（字串；另有性別、曆法兩組單選，和閏月有沒有勾）。readForm() 從頁面讀，
   命令列（scripts/paipan.js）從參數組出同樣形狀的值，兩邊都交給 inputFrom()：擋的是同樣的錯，說的是同樣的話 */
const FIELDS = { name: '#nm', date: '#date', time: '#time', ly: '#ly', lm: '#lm', ld: '#ld', place: '#place', lon: '#lon', tz: '#tz', clock: '#clock', tst: '#tst', zi: '#zi',
  ...Object.fromEntries(ZW_FIELDS.map(([, sel, field]) => [field, sel])) };
export const readForm = () => inputFrom({ ...Object.fromEntries(Object.entries(FIELDS).map(([k, sel]) => [k, $(sel).value])), gender: radio('gender'), calendar: radio('cal'), leap: $('#leap').checked });

/**
 * 表單的值讀成引擎的輸入（BirthInput，另帶頁面自己用的 name、place）。不碰 DOM。
 * 欄位沒填、格式不對時拋 userError，訊息直接顯示給使用者；日期存不存在、年份在不在可排的範圍，由引擎檢查。
 * @param {Record<string, string|boolean>} v 鍵見 FIELDS，值是欄位上的字串；另有 gender（'男'|'女'）、calendar（'solar'|'lunar'）、leap（閏月有沒有勾）
 * @returns {object}
 */
export function inputFrom(v) {
  const inp = { name: v.name.trim(), gender: v.gender, calendar: v.calendar, ziRule: v.zi, useTST: v.tst === '1' };
  const tm = /^(\d{1,2}):(\d{2})/.exec(v.time);
  if (!tm || +tm[1] > 23 || +tm[2] > 59) throw bad('請填出生時間（24 小時制，例如 14:00）。沒有出生時間就定不出時柱和紫微命宮。');
  inp.h = +tm[1]; inp.mi = +tm[2];
  if (inp.calendar === 'solar') {
    const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v.date);
    if (!dm) throw bad('請填出生日期（公曆，例如 1984-11-20）。');
    inp.y = +dm[1]; inp.m = +dm[2]; inp.d = +dm[3];
  } else {
    inp.ly = Number(v.ly); inp.lm = Number(v.lm); inp.ld = Number(v.ld); inp.leap = v.leap;
    if (v.ly.trim() === '' || !Number.isInteger(inp.ly)) throw bad('請填農曆年份（整數，例如 1984）。');
  }
  inp.place = v.place;
  if (inp.place === 'custom') {
    inp.lon = Number(v.lon); inp.tz = Number(v.tz);
    if (v.lon === '' || !(inp.lon >= -180 && inp.lon <= 180)) throw bad('自訂出生地：請填東經度數，西經填負數。');
    if (v.tz === '' || !(inp.tz >= -12 && inp.tz <= 14)) throw bad('自訂出生地：請填標準時區，例如台灣填 8。');
    inp.clock = v.clock === 'dst' ? 'dst' : 'std';
  } else {
    if (!PLACE.has(inp.place)) throw bad('請選擇出生地。');
    Object.assign(inp, PLACE.get(inp.place));
    inp.clock = v.clock;
  }
  for (const [, , field] of ZW_FIELDS) inp[field] = v[field];
  return inp;
}

// 切換公曆、農曆時，把已填的日期換算過去
export function convertCalendar() {
  try {
    if (radio('cal') === 'lunar') {
      const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec($('#date').value);
      if (dm) {
        const l = Solar.fromYmd(+dm[1], +dm[2], +dm[3]).getLunar();
        $('#ly').value = l.getYear(); $('#lm').value = Math.abs(l.getMonth()); $('#ld').value = l.getDay(); $('#leap').checked = l.getMonth() < 0;
      }
    } else if ($('#ly').value) {
      const s = Lunar.fromYmd(Number($('#ly').value), $('#leap').checked ? -Number($('#lm').value) : Number($('#lm').value), Number($('#ld').value)).getSolar();
      $('#date').value = `${s.getYear()}-${pad(s.getMonth())}-${pad(s.getDay())}`;
    }
  } catch (e) { /* 日期不完整或不存在時不換算，排盤時會報錯 */ }
}
