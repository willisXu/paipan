/* 引擎驗算共用：預設輸入、排盤的捷徑，以及幾條不靠引擎與函式庫的獨立公式（儒略日數、六十甲子序）。
   引擎一律從 src/engine/index.js 取用。 */
import './libs.js';
import * as PP from '../../src/engine/index.js';

export const base = { calendar: 'solar', gender: '男', lon: 121.56, tz: 8, zone: 'Asia/Taipei', clock: 'auto', useTST: false, ziRule: 'next' };
export const chartOf = o => { const inp = { ...base, ...o }; const rt = PP.resolveTime(inp); return { inp, rt, bz: PP.bazi(inp, rt), zw: PP.ziwei(inp, rt) }; };
export const baziOf = o => { const inp = { ...base, ...o }; return PP.bazi(inp, PP.resolveTime(inp)); }; // 只排八字，大量抽樣用
export const jdn = (y, m, d) => { const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; };
export const gzOf = k => PP.GAN[k % 10] + PP.ZHI[k % 12];
export const md = a => ((a % 12) + 12) % 12;
