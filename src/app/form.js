/* 生辰表單：下拉選單內容、欄位之間的連動、把一筆輸入寫進表單、把表單讀成引擎的輸入、公曆農曆互換。 */
import { pad, userError } from '../engine/index.js';
import { $ } from './dom.js';
import { PLACES, PLACE, LM, LD } from './places.js';

// 出生地與農曆月日的選項由資料表產生
export function initForm() {
  $('#place').innerHTML = PLACES.map(([g, list]) => `<optgroup label="${g}">${list.map(([n, , t]) => `<option value="${n}">${n}${t !== 8 ? `（UTC+${t}）` : ''}</option>`).join('')}</optgroup>`).join('') + '<option value="custom">自訂經度與時區</option>';
  $('#lm').innerHTML = LM.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  $('#ld').innerHTML = LD.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
}

const radio = name => document.querySelector(`input[name=${name}]:checked`).value;
const setRadio = (name, v) => { document.querySelectorAll(`input[name=${name}]`).forEach(el => { el.checked = el.value === v; }); };

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
  syncForm();
}

// 表單讀成引擎的輸入。欄位沒填、格式不對時拋 userError，訊息直接顯示給使用者；日期存不存在、年份在不在可排的範圍，由引擎檢查
const bad = userError;
export function readForm() {
  const inp = { name: $('#nm').value.trim(), gender: radio('gender'), calendar: radio('cal'), ziRule: $('#zi').value, useTST: $('#tst').value === '1' };
  const tm = /^(\d{1,2}):(\d{2})/.exec($('#time').value);
  if (!tm || +tm[1] > 23 || +tm[2] > 59) throw bad('請填出生時間（24 小時制，例如 14:00）。沒有出生時間就定不出時柱和紫微命宮。');
  inp.h = +tm[1]; inp.mi = +tm[2];
  if (inp.calendar === 'solar') {
    const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec($('#date').value);
    if (!dm) throw bad('請填出生日期（公曆，例如 1984-11-20）。');
    inp.y = +dm[1]; inp.m = +dm[2]; inp.d = +dm[3];
  } else {
    inp.ly = Number($('#ly').value); inp.lm = Number($('#lm').value); inp.ld = Number($('#ld').value); inp.leap = $('#leap').checked;
    if ($('#ly').value.trim() === '' || !Number.isInteger(inp.ly)) throw bad('請填農曆年份（整數，例如 1984）。');
  }
  inp.place = $('#place').value;
  if (inp.place === 'custom') {
    inp.lon = Number($('#lon').value); inp.tz = Number($('#tz').value);
    if ($('#lon').value === '' || !(inp.lon >= -180 && inp.lon <= 180)) throw bad('自訂出生地：請填東經度數，西經填負數。');
    if ($('#tz').value === '' || !(inp.tz >= -12 && inp.tz <= 14)) throw bad('自訂出生地：請填標準時區，例如台灣填 8。');
    inp.clock = $('#clock').value === 'dst' ? 'dst' : 'std';
  } else {
    if (!PLACE.has(inp.place)) throw bad('請選擇出生地。');
    Object.assign(inp, PLACE.get(inp.place));
    inp.clock = $('#clock').value;
  }
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
