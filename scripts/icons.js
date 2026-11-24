/* 產生主畫面圖示（網頁 App 用）：node scripts/icons.js。輸出到 src/icons/，產生後提交進版本庫；建置只負責複製。
   用 Playwright 的 Chromium 把圖示畫成 PNG（開發用的套件，不進執行用的相依）。
   圖案和分頁圖示相同：茄紫底、白色「命」字。字型用思源宋體（Noto Serif CJK），沒有時退回系統的明體或宋體，所以要在裝了它的環境產生。
   四個檔：
     apple-touch-icon.png 180×180  iPhone、iPad 主畫面用。滿版不透明、不畫圓角（系統會自己裁成圓角方形）
     icon-192.png、icon-512.png     一般用途（Android、桌機的安裝視窗）。圓角方形，四角透明
     maskable-512.png               可裁切的圖示：滿版底色，字縮在中間 80% 的安全區裡（各家系統裁成圓形、方形都不會切到字）
   另外一個給 iPhone、iPad App（第 14 版）：
     ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png  1024×1024，滿版、不畫圓角（系統裁）。
     App Store 規定這張不能有透明通道（見 assertOpaque） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const out = path.join(root, 'src', 'icons');
// 字型名稱用單引號：整串會放進 style="…" 屬性裡
const BG = '#5A3D6E', FONT = "'Noto Serif CJK TC', 'Noto Serif CJK HK', 'Noto Serif TC', 'Songti TC', serif";
// size 畫布邊長；radius 圓角佔邊長的比例（0 是方的）；glyph 字高佔邊長的比例
const ICONS = [
  { file: 'apple-touch-icon.png', size: 180, radius: 0, glyph: 0.64 },
  { file: 'icon-192.png', size: 192, radius: 0.16, glyph: 0.64 },
  { file: 'icon-512.png', size: 512, radius: 0.16, glyph: 0.64 },
  { file: 'maskable-512.png', size: 512, radius: 0, glyph: 0.46 },
  { file: 'AppIcon-512@2x.png', dir: path.join(root, 'ios', 'App', 'App', 'Assets.xcassets', 'AppIcon.appiconset'), size: 1024, radius: 0, glyph: 0.64, opaque: true },
];

/* App Store 的圖示不能帶透明通道。不留背景透明時，Chromium 截出來就是 8 位元 RGB（色彩類型 2）的 PNG：
   這裡只核對，不是的話停下來（例如換了 Playwright 版本，截圖格式變了），不要默默交出會被 App Store 退件的檔 */
function assertOpaque(png, file) {
  const ihdr = png.subarray(16, 29); // 簽章 8 位元組、IHDR 的長度與類型 8 位元組之後
  if (png.toString('latin1', 12, 16) !== 'IHDR' || ihdr[8] !== 8 || ihdr[9] !== 2) throw new Error(`${file} 不是 8 位元 RGB（位元深度 ${ihdr[8]}、色彩類型 ${ihdr[9]}）：App Store 的圖示不能帶透明通道`);
  return png;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
fs.mkdirSync(out, { recursive: true });
for (const ic of ICONS) {
  const s = ic.size;
  await page.setViewportSize({ width: s, height: s });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">
    <div style="width:${s}px;height:${s}px;border-radius:${ic.radius * s}px;background:${BG};display:grid;place-items:center;color:#fff;
      font:700 ${Math.round(ic.glyph * s)}px/1 ${FONT};padding-bottom:${Math.round(s * 0.05)}px;box-sizing:border-box">命</div></body></html>`);
  await page.evaluate(() => globalThis.document.fonts.ready); // 在瀏覽器裡跑
  // 實際畫出「命」字用的字型（不是樣式裡寫的那一串）：沒有思源宋體時要知道，免得默默換成別的字型
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root: doc } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: doc.nodeId, selector: 'div' });
  const used = (await cdp.send('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName).join('、');
  if (!/Noto Serif CJK/.test(used)) throw new Error(`「命」字用的是 ${used}，不是思源宋體。請在裝了 Noto Serif CJK 的環境產生圖示`);
  const shot = await page.screenshot({ omitBackground: ic.radius > 0, clip: { x: 0, y: 0, width: s, height: s } });
  const file = path.join(ic.dir || out, ic.file);
  fs.writeFileSync(file, ic.opaque ? assertOpaque(shot, ic.file) : shot);
  console.log(`已輸出 ${path.relative(root, file)}（${s}×${s}${ic.opaque ? '，不帶透明通道' : ''}，字型 ${used}）`);
}
await browser.close();
