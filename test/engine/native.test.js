/* iPhone、iPad App 的原生專案（第 14 版，ios/）：node test/engine/native.test.js。不需要瀏覽器，也不需要 Xcode。
   Xcode 只有 Mac 上有，這裡能做的是把「改錯了要到 Mac 上建置、甚至送審才會發現」的設定先擋下來：
   - 識別碼、版本、最低支援的 iOS 版本、iPhone 與 iPad 都支援，各處寫的要一致
   - 自己寫的 Swift 檔都有編進 App、隱私清單有放進 App；專案檔裡每個參照都找得到對象
   - 原生外掛和網頁兩邊的名稱、方法對得上；畫面（SceneDelegate、Main.storyboard）指到會註冊外掛的那個類別
   - 上架的規定：App 圖示 1024×1024 不帶透明通道、加密的申報、隱私清單（用到 UserDefaults 要寫理由）
   - 和網頁一致的地方：啟動畫面與網頁畫出來前的底色是網頁的紙色、系統元件的強調色是網頁的茄紫（各有深色版）、列印邊界照 @page
   - Capacitor 三個套件與 Swift 套件的版本相同 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ok, eq, section, finish } from '../helpers/harness.js';
import { parsePlist } from '../helpers/plist.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const APP = 'ios/App/App';
const pkg = JSON.parse(read('package.json'));
const cap = JSON.parse(read('capacitor.config.json'));
const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
const info = parsePlist(read(`${APP}/Info.plist`));
const privacy = parsePlist(read(`${APP}/PrivacyInfo.xcprivacy`));
const swiftFiles = fs.readdirSync(path.join(root, APP)).filter(f => f.endsWith('.swift')).sort();
const swift = Object.fromEntries(swiftFiles.map(f => [f, read(`${APP}/${f}`)]));
const settings = key => [...pbx.matchAll(new RegExp(`^\\s*${key} = (.+);$`, 'gm'))].map(m => m[1].replace(/^"(.*)"$/, '$1'));
const phase = name => (pbx.match(new RegExp(`/\\* ${name} \\*/ = \\{\\s*isa = PBX${name}BuildPhase;[\\s\\S]*?files = \\(([\\s\\S]*?)\\);`)) || [])[1] || '';
const cssVar = (block, name) => (block.match(new RegExp(`--${name}: (#[0-9A-F]{6})`, 'i')) || [])[1]?.slice(1).toUpperCase();

section('識別碼、名稱、版本：capacitor.config.json、Xcode 專案、Info.plist 一致');
{
  eq(cap.appId, 'io.github.willisxu.paipan', 'App 的識別碼（Bundle ID）');
  eq(settings('PRODUCT_BUNDLE_IDENTIFIER'), [cap.appId, cap.appId], 'Xcode 專案 Debug、Release 的識別碼和 capacitor.config.json 相同');
  ok(info.CFBundleIdentifier === '$(PRODUCT_BUNDLE_IDENTIFIER)', 'Info.plist 的識別碼取自專案設定，不另外寫死');
  ok(cap.appName === '排盤' && info.CFBundleDisplayName === cap.appName, `主畫面上的名稱是「排盤」（和網頁 App 的短名稱相同）：${info.CFBundleDisplayName}`);
  eq(cap.webDir, 'dist/app', 'App 開的網頁是建置出來的 dist/app');
  const versions = settings('MARKETING_VERSION'), builds = settings('CURRENT_PROJECT_VERSION');
  ok(versions.length === 2 && new Set(versions).size === 1 && /^\d+\.\d+(\.\d+)?$/.test(versions[0]), `版本號 Debug、Release 一致：${versions.join('、')}`);
  ok(builds.length === 2 && new Set(builds).size === 1 && /^\d+$/.test(builds[0]), `建置號 Debug、Release 一致：${builds.join('、')}`);
  ok(info.CFBundleShortVersionString === '$(MARKETING_VERSION)' && info.CFBundleVersion === '$(CURRENT_PROJECT_VERSION)', 'Info.plist 的版本號、建置號取自專案設定');
  const targets = settings('IPHONEOS_DEPLOYMENT_TARGET');
  ok(targets.length === 4 && targets.every(t => t === '16.0'), `最低支援 iOS 16.0，四處設定都一樣：${targets.join('、')}（網頁用到 :has()、inert、overscroll-behavior，iOS 16 起都有）`);
  eq(settings('TARGETED_DEVICE_FAMILY'), ['1,2', '1,2'], 'iPhone 與 iPad 都支援');
}

section('Info.plist：方向、語言、上架的申報');
{
  eq(info['UISupportedInterfaceOrientations~ipad'].slice().sort(), ['UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight', 'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown'], 'iPad 四個方向都支援（iPad 分割畫面、多工的前提）');
  ok(info.UISupportedInterfaceOrientations.includes('UIInterfaceOrientationPortrait'), 'iPhone 支援直向');
  ok(info.ITSAppUsesNonExemptEncryption === false, '申報沒有使用需要報備的加密（App 不連網路），上傳後不必每次回答出口合規問題');
  ok(info.CFBundleDevelopmentRegion === 'zh-Hant' && info.CFBundleLocalizations?.includes('zh-Hant') && info.CFBundleAllowMixedLocalizations === true, 'App 的語言是繁體中文；系統元件（列印面板、選取文字的選單）跟著使用者的語言');
  eq(info.UIRequiredDeviceCapabilities, ['arm64'], '需要的硬體只寫 arm64（範本裡過時的 armv7 換掉）');
  ok(info.UILaunchStoryboardName === 'LaunchScreen', '啟動畫面用 LaunchScreen.storyboard');
  ok(/developmentRegion = "zh-Hant";/.test(pbx) && /knownRegions = \(\s*"zh-Hant",\s*Base,\s*\);/.test(pbx), 'Xcode 專案的開發語言也是繁體中文');
}

section('Xcode 專案檔：自己寫的檔都編進 App，每個參照都找得到');
{
  const sources = phase('Sources'), resources = phase('Resources');
  const missing = swiftFiles.filter(f => !sources.includes(`/* ${f} in Sources */`));
  ok(swiftFiles.length >= 4 && missing.length === 0, `App 資料夾裡的 ${swiftFiles.length} 個 Swift 檔都在編譯清單裡${missing.length ? '，缺 ' + missing.join('、') : ''}`);
  ok(resources.includes('/* PrivacyInfo.xcprivacy in Resources */') && resources.includes('/* public in Resources */') && resources.includes('/* Assets.xcassets in Resources */'), '隱私清單、網頁（public）、圖片資源都會複製進 App');
  // 專案檔裡定義的物件（24 位十六進位的代號）不可重複；被參照的代號都要有定義
  const defs = [...pbx.matchAll(/^\t\t([0-9A-F]{24}) (?:\/\*.*?\*\/ )?= \{/gm)].map(m => m[1]);
  const refs = new Set(pbx.match(/\b[0-9A-F]{24}\b/g));
  const undefinedRefs = [...refs].filter(r => !defs.includes(r));
  ok(defs.length > 30 && new Set(defs).size === defs.length, `專案檔的 ${defs.length} 個物件代號沒有重複`);
  ok(undefinedRefs.length === 0, `專案檔參照到的代號都有定義${undefinedRefs.length ? '：缺 ' + undefinedRefs.join('、') : ''}`);
  ok(settings('ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME').every(v => v === 'AccentColor') && settings('ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME').length === 2, '系統元件的強調色用 Assets 裡的 AccentColor');
}

section('原生外掛和網頁對得上；畫面指到會註冊外掛的那個類別');
{
  const plugin = swift['PaipanAppPlugin.swift'], vc = swift['PaipanViewController.swift'];
  const js = read('src/app/platform-app.js');
  const jsName = (plugin.match(/jsName = "(\w+)"/) || [])[1];
  ok(jsName && js.includes(`const NAME = '${jsName}'`) && js.includes('registerPlugin(NAME)'), `外掛名稱兩邊相同：${jsName}`);
  const declared = [...plugin.matchAll(/CAPPluginMethod\(name: "(\w+)", returnType: CAPPluginReturnPromise\)/g)].map(m => m[1]).sort();
  const implemented = declared.filter(m => new RegExp(`@objc func ${m}\\(_ call: CAPPluginCall\\)`).test(plugin));
  const called = [...new Set([...js.matchAll(/native\.(\w+)\(/g)].map(m => m[1]))].sort();
  eq(called, declared, '網頁呼叫的方法，就是原生宣告的方法（都是 Promise）');
  eq(implemented, declared, '宣告的每個方法都有 @objc 的實作（Capacitor 照名稱找）');
  ok(/@objc\(PaipanAppPlugin\)\s*public class PaipanAppPlugin: CAPPlugin, CAPBridgedPlugin/.test(plugin), '外掛類別符合 Capacitor 的寫法（CAPPlugin、CAPBridgedPlugin，Objective-C 名稱固定）');
  ok(/class PaipanViewController: CAPBridgeViewController/.test(vc) && /override func capacitorDidLoad\(\)[\s\S]*registerPluginInstance\(PaipanAppPlugin\(\)\)/.test(vc), 'PaipanViewController 在 capacitorDidLoad 註冊外掛');
  ok(swift['SceneDelegate.swift'].includes('rootViewController = PaipanViewController()') && !swift['SceneDelegate.swift'].includes('CAPBridgeViewController()'), 'SceneDelegate 建立的畫面是 PaipanViewController');
  const board = read(`${APP}/Base.lproj/Main.storyboard`);
  ok(board.includes('customClass="PaipanViewController" customModule="App" customModuleProvider="target"') && !board.includes('customClass="CAPBridgeViewController"'), 'Main.storyboard 的初始畫面也是 PaipanViewController');
  ok(/^@main$/m.test(swift['AppDelegate.swift']) && !swift['AppDelegate.swift'].includes('@UIApplicationMain'), 'AppDelegate 用 @main（@UIApplicationMain 在新的 Swift 已不建議）');
}

section('上架的規定：App 圖示、隱私清單');
{
  const dir = `${APP}/Assets.xcassets/AppIcon.appiconset`;
  const contents = JSON.parse(read(`${dir}/Contents.json`));
  const entry = contents.images.find(im => im.size === '1024x1024' && im.idiom === 'universal');
  const png = fs.readFileSync(path.join(root, dir, entry?.filename || 'missing'));
  ok(png.subarray(1, 4).toString() === 'PNG' && png.readUInt32BE(16) === 1024 && png.readUInt32BE(20) === 1024, `App 圖示是 1024×1024 的 PNG（${entry?.filename}）`);
  ok(png.toString('latin1', 12, 16) === 'IHDR' && png[24] === 8 && png[25] === 2, `App 圖示不帶透明通道（8 位元 RGB；App Store 會退件帶透明通道的）：色彩類型 ${png[25]}`);
  ok(!fs.existsSync(path.join(root, APP, 'Assets.xcassets', 'Splash.imageset')), '範本的啟動圖（Capacitor 的標誌）拿掉了');
  ok(privacy.NSPrivacyTracking === false && privacy.NSPrivacyTrackingDomains.length === 0 && privacy.NSPrivacyCollectedDataTypes.length === 0, '隱私清單：不追蹤、不收集任何資料');
  const usesDefaults = Object.values(swift).some(s => s.includes('UserDefaults'));
  const reasons = (privacy.NSPrivacyAccessedAPITypes.find(t => t.NSPrivacyAccessedAPIType === 'NSPrivacyAccessedAPICategoryUserDefaults') || {}).NSPrivacyAccessedAPITypeReasons || [];
  ok(usesDefaults && reasons.length === 1 && reasons[0] === 'CA92.1', `用了 UserDefaults（存盤的備份），隱私清單寫了理由 CA92.1（只讀寫 App 自己的資料）：${reasons.join('、')}`);
  eq(privacy.NSPrivacyAccessedAPITypes.map(t => t.NSPrivacyAccessedAPIType), ['NSPrivacyAccessedAPICategoryUserDefaults'], '沒有用到、也沒有申報其他需要理由的 API');
}

section('和網頁一致：底色、強調色、列印邊界');
{
  const styles = read('src/styles.css');
  const light = styles.slice(styles.indexOf(':root {'), styles.indexOf('}', styles.indexOf(':root {')));
  const darkAt = styles.indexOf(':root[data-theme="dark"] {'), dark = styles.slice(darkAt, styles.indexOf('}', darkAt));
  const colorset = name => JSON.parse(read(`${APP}/Assets.xcassets/${name}.colorset/Contents.json`)).colors;
  const order = c => { const v = c.color.components; return [v.red, v.green, v.blue].map(x => x.slice(2).toUpperCase()).join(''); };
  for (const [name, varName] of [['Paper', 'paper'], ['AccentColor', 'accent']]) {
    const colors = colorset(name);
    const lightC = colors.find(c => !c.appearances), darkC = colors.find(c => c.appearances?.some(a => a.value === 'dark'));
    ok(lightC && darkC && order(lightC) === cssVar(light, varName) && order(darkC) === cssVar(dark, varName), `${name} 和網頁的 --${varName} 相同（淺色 #${cssVar(light, varName)}、深色 #${cssVar(dark, varName)}）`);
  }
  const launch = read(`${APP}/Base.lproj/LaunchScreen.storyboard`);
  const fallback = launch.match(/<namedColor name="Paper">\s*<color red="([\d.]+)" green="([\d.]+)" blue="([\d.]+)"/);
  const fallbackHex = fallback ? fallback.slice(1).map(v => Math.round(Number(v) * 255).toString(16).padStart(2, '0').toUpperCase()).join('') : '';
  ok(launch.includes('<color key="backgroundColor" name="Paper"/>') && !launch.includes('image="Splash"') && fallbackHex === cssVar(light, 'paper'), `啟動畫面是網頁的紙色（深色模式跟著 Paper 換），不放圖：#${fallbackHex}`);
  ok(/UIColor\(named: "Paper"\)/.test(swift['PaipanViewController.swift']) && /webView\?\.isOpaque = false/.test(swift['PaipanViewController.swift']), '網頁畫出來之前，WKWebView 的底色也是 Paper（不閃白）');
  const mm = Number((styles.match(/@page \{[^}]*margin: (\d+(?:\.\d+)?)mm/) || [])[1]);
  const pt = Number((swift['PaipanAppPlugin.swift'].match(/private let margin: CGFloat = (\d+(?:\.\d+)?)/) || [])[1]);
  ok(mm > 0 && Math.abs(pt - mm / 25.4 * 72) < 0.5, `原生列印的邊界 ${pt} pt 就是 @page 的 ${mm} mm（iOS 的列印不讀 @page）`);
}

section('Capacitor 的版本：三個套件、Swift 套件相同');
{
  const v = pkg.dependencies['@capacitor/core'];
  ok(/^\d+\.\d+\.\d+$/.test(v) && pkg.dependencies['@capacitor/ios'] === v && pkg.devDependencies['@capacitor/cli'] === v, `@capacitor/core、ios、cli 都是 ${v}（寫死版本）`);
  const spm = read('ios/App/CapApp-SPM/Package.swift');
  ok(spm.includes(`.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "${v}")`), `Xcode 用的 Swift 套件（capacitor-swift-pm）也是 ${v}：npx cap sync ios 依 node_modules 寫入`);
  ok(read('ios/.gitignore').split('\n').includes('App/App/public'), 'ios/App/App/public（cap sync 複製過去的網頁）不進版本庫，以 dist/app 為準');
}

finish();
