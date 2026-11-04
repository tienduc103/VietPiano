// MidiBridge.swift — BẢN THAM KHẢO cho app VietPiano iPad (Core MIDI Bridge, milestone M4 trong docs/midi.md).
// CHƯA biên dịch, CHƯA chạy trên iPad. Giao thức phải khớp src/core/midi/backends/NativeBridgeBackend.ts (phiên bản 1).
//
// Cách dùng trong app SwiftUI:
//   let bridge = MidiBridge()
//   let config = WKWebViewConfiguration()
//   bridge.install(into: config)            // tiêm cờ + đăng ký message handler
//   let webView = WKWebView(frame: .zero, configuration: config)
//   bridge.webView = webView
//   webView.loadFileURL(indexURL, allowingReadAccessTo: distFolderURL)

import CoreAudioKit // CABTMIDICentralViewController
import CoreMIDI
import UIKit
import WebKit

final class MidiBridge: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?
    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var running = false
    /// refCon của mỗi source → id cổng gửi cho trang.
    private var sourceIds: [Int: String] = [:]

    func install(into config: WKWebViewConfiguration) {
        let flag = "window.__VIETPIANO_NATIVE_MIDI__ = { protocol: 1, platform: 'ios' };"
        config.userContentController.addUserScript(WKUserScript(source: flag, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        config.userContentController.add(self, name: "vietpianoMidi")
    }

    // MARK: web → native

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "start": start()
        case "stop": stop()
        case "refresh": sendPorts()
        case "pairBluetooth": presentBluetoothPairing()
        default: break
        }
    }

    // MARK: Core MIDI

    private func start() {
        if running { sendPorts(); return }
        var status = MIDIClientCreateWithBlock("VietPiano" as CFString, &client) { [weak self] _ in
            // Cắm / rút / ghép Bluetooth → gắn lại source và gửi lại danh sách.
            DispatchQueue.main.async { self?.connectAllSources(); self?.sendPorts() }
        }
        guard status == noErr else { return sendError("Không mở được Core MIDI (\(status))") }
        status = MIDIInputPortCreateWithBlock(client, "VietPiano In" as CFString, &inputPort) { [weak self] packetList, refCon in
            self?.handle(packetList: packetList, refCon: refCon)
        }
        guard status == noErr else { return sendError("Không mở được cổng MIDI (\(status))") }
        running = true
        connectAllSources()
        sendPorts() // bắt tay: trang chờ tin 'ports' đầu tiên
    }

    private func stop() {
        guard running else { return }
        MIDIPortDispose(inputPort)
        MIDIClientDispose(client)
        running = false
        sourceIds.removeAll()
    }

    private func connectAllSources() {
        guard running else { return }
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            let uid = intProperty(src, kMIDIPropertyUniqueID)
            let key = Int(UInt32(bitPattern: Int32(uid))) + 1 // +1: refCon không được là nil
            if sourceIds[key] != nil { continue }
            sourceIds[key] = String(uid)
            MIDIPortConnectSource(inputPort, src, UnsafeMutableRawPointer(bitPattern: key))
        }
    }

    private func handle(packetList: UnsafePointer<MIDIPacketList>, refCon: UnsafeMutableRawPointer?) {
        guard let refCon, let port = sourceIds[Int(bitPattern: refCon)] else { return }
        let nowHost = mach_absolute_time()
        for packet in packetList.unsafeSequence() {
            let length = Int(packet.pointee.length)
            let bytes = withUnsafeBytes(of: packet.pointee.data) { Array($0.prefix(min(length, 256))) }
            let age = packet.pointee.timeStamp == 0 ? 0 : hostTimeToMs(nowHost &- packet.pointee.timeStamp)
            send(["type": "data", "port": port, "bytes": bytes.map { Int($0) }, "age": min(age, 1000)])
        }
    }

    private func sendPorts() {
        var ports: [[String: Any]] = []
        for i in 0..<MIDIGetNumberOfSources() {
            let src = MIDIGetSource(i)
            var entity = MIDIEntityRef()
            MIDIEndpointGetEntity(src, &entity)
            let owner = stringProperty(entity, kMIDIPropertyDriverOwner) ?? ""
            let transport = owner.contains("Bluetooth") ? "bluetooth" : owner.contains("RTP") ? "network" : "usb"
            ports.append([
                "id": String(intProperty(src, kMIDIPropertyUniqueID)),
                "name": stringProperty(src, kMIDIPropertyDisplayName) ?? "Thiết bị MIDI",
                "manufacturer": stringProperty(src, kMIDIPropertyManufacturer) ?? "",
                "transport": transport,
                "state": intProperty(src, kMIDIPropertyOffline) == 0 ? "connected" : "disconnected",
            ])
        }
        send(["type": "ports", "ports": ports])
    }

    private func presentBluetoothPairing() {
        let vc = CABTMIDICentralViewController()
        let nav = UINavigationController(rootViewController: vc)
        vc.navigationItem.rightBarButtonItem = UIBarButtonItem(systemItem: .done, primaryAction: UIAction { _ in nav.dismiss(animated: true) })
        webView?.window?.rootViewController?.present(nav, animated: true)
    }

    // MARK: native → web

    private func sendError(_ message: String) {
        send(["type": "error", "message": message])
    }

    private func send(_ obj: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: obj), let json = String(data: data, encoding: .utf8) else { return }
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript("window.vietpianoMidiBridge && window.vietpianoMidiBridge.receive(\(json))")
        }
    }

    // MARK: tiện ích

    private func intProperty(_ obj: MIDIObjectRef, _ key: CFString) -> Int32 {
        var v: Int32 = 0
        MIDIObjectGetIntegerProperty(obj, key, &v)
        return v
    }

    private func stringProperty(_ obj: MIDIObjectRef, _ key: CFString) -> String? {
        var s: Unmanaged<CFString>?
        guard MIDIObjectGetStringProperty(obj, key, &s) == noErr, let s else { return nil }
        return s.takeRetainedValue() as String
    }

    private func hostTimeToMs(_ delta: UInt64) -> Double {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(delta) * Double(info.numer) / Double(info.denom) / 1_000_000
    }
}
