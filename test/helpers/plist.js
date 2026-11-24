/* 讀 XML 格式的 plist（Info.plist、PrivacyInfo.xcprivacy）。只認 dict、array、string、true、false、integer、real，
   夠測試用；看不懂的寫法直接丟出例外，不要猜。字串前後的空白不保留。 */
export function parsePlist(xml) {
  const tokens = xml.replace(/<\?xml[^>]*>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/g, '').match(/<[^>]+>|[^<]+/g).map(t => t.trim()).filter(Boolean);
  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  let i = 0;
  const expect = t => { if (tokens[i++] !== t) throw new Error(`plist：第 ${i} 個記號應該是 ${t}，卻是 ${tokens[i - 1]}`); };
  const inner = close => { if (tokens[i] === close) { i++; return ''; } const s = tokens[i++]; expect(close); return unesc(s); };
  function value() {
    const t = tokens[i++];
    if (t === '<dict>') {
      const o = {};
      while (tokens[i] !== '</dict>') { expect('<key>'); const k = inner('</key>'); o[k] = value(); }
      i++;
      return o;
    }
    if (t === '<array>') { const a = []; while (tokens[i] !== '</array>') a.push(value()); i++; return a; }
    if (t === '<dict/>') return {};
    if (t === '<array/>') return [];
    if (t === '<true/>') return true;
    if (t === '<false/>') return false;
    if (t === '<string/>') return '';
    if (t === '<string>') return inner('</string>');
    if (t === '<integer>' || t === '<real>') return Number(inner(t.replace('<', '</')));
    throw new Error(`plist：看不懂 ${t}`);
  }
  if (!/^<plist\b/.test(tokens[i++])) throw new Error('plist：開頭不是 <plist>');
  const v = value();
  expect('</plist>');
  return v;
}
