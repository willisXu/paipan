import UIKit
import WebKit
import Capacitor

/// 排盤 App 自己的原生外掛，網頁那一半在 src/app/platform-app.js（外掛名稱 PaipanApp），兩邊的方法名稱要對得上。
///
/// - printPage：用 iOS 的列印面板印目前的頁面。WKWebView 不理會網頁的 window.print()，要由原生開面板；
///   面板裡可以選印表機，也可以分享、存成 PDF。面板關掉才回覆，網頁在那之前保留「兩個都印」的記號。
/// - getAll、setItem：存起來的盤在 UserDefaults 另外留一份。WKWebView 的 localStorage 在裝置空間不足時可能被系統清掉，
///   網頁每次啟動都拿兩份來比，頁面那份不見了就從這裡補回去。只存網頁交過來的字串，不碰別的資料。
@objc(PaipanAppPlugin)
public class PaipanAppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PaipanAppPlugin"
    public let jsName = "PaipanApp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setItem", returnType: CAPPluginReturnPromise)
    ]

    /// UserDefaults 裡放備份的那一格：網頁的 localStorage 鍵 → 內容
    private let storeKey = "paipan.localStorage"
    /// 網頁的列印版面照 A4 直式、四邊留 12 mm 設計（styles.css 的 @page）。iOS 的列印不讀 @page，邊界在這裡給：12 mm ≈ 34 pt
    private let margin: CGFloat = 34

    // MARK: - 列印

    @objc func printPage(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.webView else {
                call.reject("找不到要印的頁面")
                return
            }
            guard UIPrintInteractionController.isPrintingAvailable else {
                call.reject("這台裝置不能列印")
                return
            }
            let info = UIPrintInfo(dictionary: nil)
            info.outputType = .general
            info.orientation = .portrait
            info.jobName = call.getString("jobName") ?? "八字紫微排盤"

            // 網頁本身的列印格式器：照網頁的 @media print 樣式排版、分頁
            let formatter = webView.viewPrintFormatter()
            formatter.perPageContentInsets = UIEdgeInsets(top: self.margin, left: self.margin, bottom: self.margin, right: self.margin)

            let controller = UIPrintInteractionController.shared
            controller.printInfo = info
            controller.printFormatter = formatter
            let done: UIPrintInteractionController.CompletionHandler = { _, completed, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
            if webView.traitCollection.userInterfaceIdiom == .pad {
                // iPad（含在 Mac 上跑的 iPad App）：面板從按下去的那顆按鈕旁邊彈出
                _ = controller.present(from: self.anchor(of: call, in: webView), in: webView, animated: true, completionHandler: done)
            } else {
                _ = controller.present(animated: true, completionHandler: done)
            }
        }
    }

    /// 網頁傳來的按鈕位置（頁面座標，App 的網頁不縮放時就是 WKWebView 的座標）；沒有或不在畫面上，就從畫面中間彈出
    private func anchor(of call: CAPPluginCall, in view: UIView) -> CGRect {
        if let x = call.getDouble("x"), let y = call.getDouble("y"),
           let width = call.getDouble("width"), let height = call.getDouble("height") {
            let rect = CGRect(x: x, y: y, width: width, height: height)
            if view.bounds.intersects(rect) {
                return rect
            }
        }
        return CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
    }

    // MARK: - 存起來的盤：備份

    @objc func getAll(_ call: CAPPluginCall) {
        call.resolve(["values": stored()])
    }

    @objc func setItem(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("要有 key 和 value")
            return
        }
        var values = stored()
        values[key] = value
        UserDefaults.standard.set(values, forKey: storeKey)
        call.resolve()
    }

    private func stored() -> [String: String] {
        return UserDefaults.standard.dictionary(forKey: storeKey) as? [String: String] ?? [:]
    }
}
