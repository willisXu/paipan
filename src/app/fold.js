/* 生辰資料可以收起（第 13 版）。手機、iPad 上表單佔滿第一屏，盤要往下捲才看得到；排好以後收起來，只留「生辰資料」那一行和已存的盤。
   收起來的時候欄位、說明、流派設定與排盤按鈕都不顯示；命主資訊就在下面，生辰寫在那裡。瀏覽器會記得（和讀盤卡一樣，不讓存時照樣能收）。
   輸入有錯一定展開：錯誤訊息要對著欄位改。 */
import { $ } from './dom.js';

const KEY = 'paipan.form';
const stored = () => { try { return localStorage.getItem(KEY) === 'folded'; } catch (e) { return false; } };

function apply(folded) {
  $('#f-body').hidden = folded;
  $('#f').classList.toggle('folded', folded);
  const b = $('#f-toggle');
  b.setAttribute('aria-expanded', String(!folded));
  b.textContent = folded ? '展開' : '收起';
}

export function initFold() {
  apply(stored());
  $('#f-toggle').addEventListener('click', () => {
    const folded = !$('#f-body').hidden;
    try { localStorage.setItem(KEY, folded ? 'folded' : 'open'); } catch (e) { /* 不讓存：照樣收合，只是下次不記得 */ }
    apply(folded);
  });
  // 錯誤訊息一出現就展開（例如讀進一筆已存的盤，現在排不出來）
  new MutationObserver(() => { if (!$('#err').hidden && $('#f-body').hidden) apply(false); }).observe($('#err'), { attributes: true, attributeFilter: ['hidden'] });
}
