import UIKit
import Capacitor

/// App 唯一的畫面：Capacitor 的網頁畫面（網頁是 dist/app，cap sync 複製到 App/public），另外多做兩件事：
/// 註冊排盤自己的原生外掛 PaipanAppPlugin，以及網頁畫出來之前的底色跟網頁一致。
/// SceneDelegate 建立的是這個類別；Main.storyboard 的初始畫面也指到這裡。
class PaipanViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(PaipanAppPlugin())

        // 網頁還沒畫出來之前看到的是 WKWebView 自己的底色：換成網頁的紙色（Assets 裡的 Paper，深色模式有深色的那一個），
        // 開 App 時才不會先閃一下白
        if let paper = UIColor(named: "Paper") {
            webView?.isOpaque = false
            webView?.backgroundColor = paper
            webView?.scrollView.backgroundColor = paper
        }
    }
}
