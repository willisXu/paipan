import UIKit
import WebKit
import Capacitor
import AuthenticationServices
import CryptoKit
import Security

/// 排盤 App 自己的原生外掛，網頁那一半在 src/app/platform-app.js（外掛名稱 PaipanApp），兩邊的方法名稱要對得上。
///
/// - printPage：用 iOS 的列印面板印目前的頁面。WKWebView 不理會網頁的 window.print()，要由原生開面板；
///   面板裡可以選印表機，也可以分享、存成 PDF。面板關掉才回覆，網頁在那之前保留「兩個都印」的記號。
/// - getAll、setItem：存起來的盤（和同步的紀錄）在 UserDefaults 另外留一份。WKWebView 的 localStorage 在裝置空間不足時可能被系統清掉，
///   網頁每次啟動都拿兩份來比，頁面那份不見了就從這裡補回去。只存網頁交過來的字串，不碰別的資料。
/// - signInWithApple、appleCredentialState（第 15 版）：使用 Apple 登入。用系統的登入面板，不要求姓名與電子郵件；
///   網頁給的 nonce 在這裡算 SHA-256 交給 Apple（Apple 原樣放進身分權杖，後端比對）。
///   appleCredentialState 問使用者有沒有在設定裡停用這個 App 的 Apple 登入，停用了網頁就登出（TN3194）。
/// - getSecret、setSecret、clearSecret（第 15 版）：登入憑證放在鑰匙圈（Keychain），只限這台裝置、開機解鎖過後可讀。
@objc(PaipanAppPlugin)
public class PaipanAppPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "PaipanAppPlugin"
    public let jsName = "PaipanApp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "printPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "signInWithApple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appleCredentialState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSecret", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSecret", returnType: CAPPluginReturnPromise)
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

    /// value 是字串就存；沒有 value（網頁傳 null）表示頁面那份刪掉了，這裡也刪，下次啟動才不會把它補回去
    @objc func setItem(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("要有 key")
            return
        }
        var values = stored()
        if let value = call.getString("value") {
            values[key] = value
        } else {
            values.removeValue(forKey: key)
        }
        UserDefaults.standard.set(values, forKey: storeKey)
        call.resolve()
    }

    private func stored() -> [String: String] {
        return UserDefaults.standard.dictionary(forKey: storeKey) as? [String: String] ?? [:]
    }

    // MARK: - 使用 Apple 登入（第 15 版）

    /// 進行中的那一次登入（同一時間只有一次）。controller 要留著，不然面板還沒回來它就被釋放了
    private var appleCall: CAPPluginCall?
    private var appleController: ASAuthorizationController?

    @objc func signInWithApple(_ call: CAPPluginCall) {
        guard let nonce = call.getString("nonce"), !nonce.isEmpty, nonce.count <= 200 else {
            call.reject("要有 nonce", "bad_request")
            return
        }
        DispatchQueue.main.async {
            if self.appleCall != nil {
                call.reject("上一次登入還沒結束", "busy")
                return
            }
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [] // 不要姓名、電子郵件：只需要 Apple 給的使用者代號
            request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.appleCall = call
            self.appleController = controller
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = finishApple() else { return }
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple 沒有給身分權杖", "failed")
            return
        }
        var result: [String: Any] = ["identityToken": token, "user": credential.user]
        if let codeData = credential.authorizationCode, let code = String(data: codeData, encoding: .utf8) {
            result["authorizationCode"] = code
        }
        call.resolve(result)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = finishApple() else { return }
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            call.reject("已取消", "canceled")
        } else {
            call.reject(error.localizedDescription, "failed")
        }
    }

    private func finishApple() -> CAPPluginCall? {
        let call = appleCall
        appleCall = nil
        appleController = nil
        return call
    }

    /// authorized、revoked（使用者在設定裡停用了）、notFound、transferred；問不到回 unknown（網頁那邊不動）
    @objc func appleCredentialState(_ call: CAPPluginCall) {
        guard let user = call.getString("user"), !user.isEmpty else {
            call.reject("要有 user", "bad_request")
            return
        }
        ASAuthorizationAppleIDProvider().getCredentialState(forUserID: user) { state, error in
            guard error == nil else {
                call.resolve(["state": "unknown"])
                return
            }
            switch state {
            case .authorized: call.resolve(["state": "authorized"])
            case .revoked: call.resolve(["state": "revoked"])
            case .notFound: call.resolve(["state": "notFound"])
            case .transferred: call.resolve(["state": "transferred"])
            @unknown default: call.resolve(["state": "unknown"])
            }
        }
    }

    // MARK: - 鑰匙圈：登入憑證（第 15 版）

    private let keychainService = "io.github.willisxu.paipan.account"
    private let keychainAccount = "session"
    /// 鑰匙圈的內容在刪掉 App 之後還會留著；UserDefaults 會跟著 App 刪掉。用這一格記「這次安裝已經檢查過」，
    /// 重新安裝後第一次用到時先把舊的憑證清掉，免得刪了 App 再裝回來還是登入著
    private let keychainReadyKey = "paipan.keychainReady"

    private func keychainQuery() -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: keychainAccount
        ]
    }

    private func forgetIfReinstalled() {
        if !UserDefaults.standard.bool(forKey: keychainReadyKey) {
            SecItemDelete(keychainQuery() as CFDictionary)
            UserDefaults.standard.set(true, forKey: keychainReadyKey)
        }
    }

    @objc func getSecret(_ call: CAPPluginCall) {
        forgetIfReinstalled()
        var query = keychainQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
        } else {
            call.reject("讀不到鑰匙圈（\(status)）", "keychain")
        }
    }

    @objc func setSecret(_ call: CAPPluginCall) {
        guard let value = call.getString("value"), value.utf8.count <= 4096 else {
            call.reject("要有 value", "bad_request")
            return
        }
        forgetIfReinstalled()
        SecItemDelete(keychainQuery() as CFDictionary)
        var query = keychainQuery()
        query[kSecValueData as String] = Data(value.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("寫不進鑰匙圈（\(status)）", "keychain")
        }
    }

    @objc func clearSecret(_ call: CAPPluginCall) {
        let status = SecItemDelete(keychainQuery() as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("清不掉鑰匙圈（\(status)）", "keychain")
        }
    }
}
