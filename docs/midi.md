# Universal MIDI Controller Support

VietPiano nhận đàn piano điện và MIDI controller của mọi hãng (Yamaha, Korg microKEY2 / microKEY Air, Roland, Casio,
Akai, Arturia, Kawai, Novation, M-Audio…) qua **một lớp MIDI chung**, không có logic riêng theo hãng. Mọi thiết bị tuân
thủ chuẩn MIDI 1.0 (Note On/Off, Control Change 64) đều dùng được, kể cả khi app không nhận ra tên model.

> **Tình trạng phần cứng:** CHƯA kiểm thử trên thiết bị thật nào trong đợt này. Toàn bộ kiểm thử tự động dùng thiết bị
> mô phỏng (unit test + e2e Chromium). Bảng tương thích ở cuối chỉ được đánh dấu ✅ sau khi chạy checklist thủ công
> trên phần cứng thật.

## Kiến trúc

```
                ┌──────────────────────── src/core/midi/backends ────────────────────────┐
 Windows/macOS  │ WebMidiBackend        Web MIDI API (Chrome/Edge): USB, BLE đã ghép qua OS │
 iPad (app vỏ)  │ NativeBridgeBackend   Core MIDI → WKWebView (hoặc WebView2 trên Windows)  │
 test / dev     │ SimulatedMidiBackend  thiết bị ảo, gửi byte MIDI thật                     │
                │ CompositeBackend      gộp (thật + mô phỏng)                               │
                └──────────────── byte thô theo cổng + danh sách cổng ─────────────────────┘
                                              │
                              MidiEngine (src/core/midi/MidiEngine.ts)
     MidiByteParser (running status, real-time, SysEx) → cấu hình thiết bị (bật/tắt, kênh, dải phím,
     transpose, quãng tám, đường cong lực gõ) → chống kẹt phím → sự kiện chuẩn
                                              │
   midiInput (core/input/MIDIInputProvider.ts — giữ tên + API cũ)
     onNote {midi, time, velocity} · onNoteOff · onPedal {down} · stateChanges · hasDevice()
     onDetail (theo thiết bị: cổng, kênh, phím thô) · portChanges · updateConfig · reconnect
                                              │
   useNoteInput · PracticeScreen · PlayStep · trò chơi · midiNav · midiStore · MidiSoundMonitor
```

Nguyên tắc:

- **Màn hình / bài học / trò chơi KHÔNG chạm thiết bị.** Chỉ nghe `midiInput` như trước; API cũ giữ nguyên nên không
  màn chơi nào phải sửa (yêu cầu 9, 12).
- **Adapter chỉ chuyển byte + danh sách cổng.** Đọc nghĩa thông điệp, áp cấu hình, nhớ phím đang giữ đều ở `MidiEngine`
  → mọi nền tảng có cùng hành vi, test được bằng thiết bị mô phỏng.
- **Nhận dạng model chỉ để gợi ý mặc định** (`deviceProfiles.ts`: hãng, số phím, có loa không, cách kết nối). Sai thì người
  dùng sửa trong Quản lý thiết bị; không có nhánh code theo hãng.

### Sự kiện chuẩn hoá

| Sự kiện | Nguồn MIDI | Ghi chú |
| --- | --- | --- |
| `onNote` | `0x9n` velocity > 0 | `midi` đã dịch giọng; `velocity` 1–127 sau đường cong; `time` cùng gốc `performance.now()` |
| `onNoteOff` | `0x8n`, hoặc `0x9n` velocity 0 | Khớp đúng nốt đã phát dù transpose đổi giữa chừng |
| `onPedal` | CC 64, ≥ 64 = đạp | Chỉ phát khi trạng thái đổi (đàn half-pedal gửi liên tục) |
| `onDetail` | mọi thông điệp | Theo thiết bị: cổng, kênh 0–15, phím thô; `accepted` = false nếu bị lọc |
| — | CC 120 / 123 | Thả các phím đang giữ của kênh đó |

Chống kẹt phím: rút đàn, tắt thiết bị, đổi cấu hình, `stop()` → phát Note Off cho mọi phím còn giữ và nhả pedal.

### Cấu hình từng thiết bị (`deviceConfig.ts`)

Lưu `localStorage` `vietpiano.midiDevices.v1`, khoá theo **tên + hãng** (Web MIDI trên Windows đổi id theo thứ tự cắm).

| Trường | Ý nghĩa |
| --- | --- |
| `enabled` | Tắt → bỏ mọi tín hiệu, không tính là "đàn đang nối" (app quay về micro) |
| `keyCount` | 25 / 32 / 37 / 49 / 61 / 73 / 76 / 88; `null` = theo tên model, không rõ → 88 |
| `lowestNote` | Phím thấp nhất; mặc định 25/32/37 → C3, 49/61 → C2, 73/76 → E1, 88 → A0 |
| `octave` / `transpose` | Dịch −3…3 quãng tám / −12…12 nửa cung |
| `channel` | `all` hoặc 1–16 (đàn split / layer) |
| `velocityCurve` | normal / soft (phím mini cứng) / hard / fixed — ảnh hưởng chấm sắc thái cấp 6 |
| `limitToRange` | Bỏ nốt ngoài dải phím (pad / nút gửi nốt) |
| `sound` | App phát tiếng piano khi gõ: auto (chỉ controller không loa) / on / off |

### Tiếng piano cho controller không loa

`MidiSoundMonitor` + `soundOutput.liveNoteOn/Off/SetSustain` (WebAudio tổng hợp, 4 tiếng: Piano cơ / sáng / điện / êm,
cài đặt `midiSoundTimbre`). Tách khỏi phần phát mẫu: **không** cập nhật `isPlayingUntil` nên không làm màn học bỏ nốt.
Chrome chỉ cho phát tiếng sau một lần chạm / bấm trên trang.

### Thiết bị mô phỏng

Cài đặt → Đàn MIDI → "Đàn MIDI mô phỏng": thêm controller 25 phím + đàn điện 88 phím; bấm phím trên hình ở mục Kiểm tra
tín hiệu để gửi nốt. Console / e2e: `window.__vietpianoMidiSim.noteOn('sim-piano-88', 60)`. Thiết bị mô phỏng đi qua đúng
parser + cấu hình như đàn thật — chỉ không thử được driver / hệ điều hành.

## Giao thức cầu nối native (phiên bản 1)

App vỏ tiêm trước khi trang tải (WKUserScript `atDocumentStart` / `AddScriptToExecuteOnDocumentCreatedAsync`):

```js
window.__VIETPIANO_NATIVE_MIDI__ = { protocol: 1, platform: 'ios' } // hoặc 'windows'
```

| Chiều | Kênh |
| --- | --- |
| web → native | iOS: `webkit.messageHandlers.vietpianoMidi.postMessage(obj)` · Windows: `chrome.webview.postMessage(obj)` |
| native → web | iOS: `evaluateJavaScript("window.vietpianoMidiBridge.receive(<json>)")` · Windows: `PostWebMessageAsJson` |

Tin nhắn web → native:

| `type` | Ý nghĩa |
| --- | --- |
| `start` (`protocol: 1`) | Mở MIDI client, gửi `ports` ngay (kể cả rỗng) — đó là tín hiệu bắt tay (chờ tối đa 3 s) |
| `stop` | Đóng port, ngừng gửi |
| `refresh` | Gửi lại `ports` (app trở lại từ nền) |
| `pairBluetooth` | iOS: hiện `CABTMIDICentralViewController` |

Tin nhắn native → web:

| `type` | Trường |
| --- | --- |
| `ports` | `ports: [{ id, name, manufacturer, transport: 'usb'|'bluetooth'|'network'|'virtual', state: 'connected'|'disconnected' }]` — luôn gửi đủ danh sách |
| `data` | `port`, `bytes: number[]` (gói thô, được phép nhiều thông điệp / running status), `age?`: ms từ lúc nhận tới lúc gửi (≤ 1000) |
| `error` | `message` — chứa "permission"/"quyền" → trạng thái "bị từ chối quyền" |

Trang kiểm tra mọi tin (`parseBridgeMessage`): bỏ byte ngoài 0–255, giới hạn độ dài, transport lạ → đoán theo tên.

## Thiết kế app VietPiano cho iPad (Core MIDI Bridge) — module độc lập, triển khai sau

Mục tiêu: **giữ nguyên giao diện và logic web**; app chỉ là vỏ.

- SwiftUI + `WKWebView` nạp bản build web đóng gói trong app (offline, `loadFileURL`) hoặc URL GitHub Pages.
- `CoreMIDI`: `MIDIClientCreateWithBlock` (nhận thông báo cắm / rút → gửi `ports`), `MIDIInputPortCreateWithProtocol(._1_0)`,
  `MIDIPortConnectSource` cho mọi source. Gói MIDI 1.0 UMP → byte (Note On/Off, CC, …) → `data`.
  Tên: `kMIDIPropertyDisplayName`, hãng: `kMIDIPropertyManufacturer`; transport: entity có `kMIDIPropertyDriverOwner`
  `com.apple.AppleMIDIBluetoothDriver` → `bluetooth`, `com.apple.AppleMIDIRTPDriver` → `network`, còn lại `usb`.
- Bluetooth LE MIDI (microKEY Air, FP-30X, Casio…): nút "Ghép Bluetooth MIDI" trong Quản lý thiết bị → `pairBluetooth`
  → `CABTMIDICentralViewController`. Cần `NSBluetoothAlwaysUsageDescription`.
- Micro: WKWebView trên iPadOS 14.3+ có `getUserMedia`; cần `NSMicrophoneUsageDescription` và
  `WKUIDelegate.webView(_:requestMediaCapturePermissionFor:…)`.
- Thời gian: native đo `age` = now − timestamp gói (mach time) để trang bù độ trễ cầu nối.
- Mã tham khảo (chưa biên dịch / chưa chạy): `native/ios/MidiBridge.swift`.

Windows native (chỉ khi cần — Web MIDI đã đủ cho USB): WebView2 + `Windows.Devices.Midi` / Windows MIDI Services, cùng giao
thức (`platform: 'windows'`). Lý do có thể cần: driver BLE MIDI chỉ lộ ra qua WinRT, hoặc phát hành app Store.

## Milestone và task

### M1 — Lõi MIDI chung + adapter Windows (Web MIDI) — ✅ xong, kiểm thử tự động

- [x] `messages.ts`: parser luồng byte (running status, real-time, SysEx, gói bị cắt) + test
- [x] `MidiEngine`: kết nối / ngắt / tự kết nối lại sau lỗi (2 s, 5 s, 10 s; từ chối quyền không thử lại), cắm / rút nóng,
      id đổi khi cắm lại (Windows), chống kẹt phím, pedal chỉ phát khi đổi, All Notes Off + test
- [x] `WebMidiBackend` tách khỏi provider; `MIDIInputProvider` giữ API cũ (test cũ chạy nguyên)
- [x] `deviceConfig` (dải phím, transpose, quãng tám, kênh, lực gõ, lọc dải) + lưu theo tên đàn + test
- [x] `deviceProfiles`: nhận dạng ~15 hãng / số phím / có loa / transport đoán theo tên + test

### M2 — Quản lý thiết bị + tiếng piano + mô phỏng — ✅ xong, kiểm thử tự động

- [x] Cài đặt → Đàn MIDI: danh sách thiết bị (tên, hãng / model, số phím, trạng thái, loại kết nối, đèn tín hiệu),
      Kết nối lại, cấu hình từng đàn, Kiểm tra tín hiệu (bàn phím, phím đang giữ, lực gõ, pedal, nhật ký thông điệp)
- [x] Tiếng piano khi controller không loa (4 tiếng, tự bật theo loại đàn) — `MidiSoundMonitor` + test
- [x] `SimulatedMidiBackend` + `CompositeBackend` (mở song song, không bị treo vì hộp thoại xin quyền) + nút bật trong Cài đặt
- [x] e2e `e2e/midi-devices.spec.ts` (hai hãng, tín hiệu, quãng tám, tắt thiết bị, nhớ cấu hình, cắm / rút, mô phỏng → Wait Mode)

### M3 — Cầu nối native (phía web) — ✅ xong, kiểm thử bằng app vỏ giả

- [x] `NativeBridgeBackend` + giao thức v1 + phát hiện WKWebView / WebView2 + kiểm tra dữ liệu + test bắt tay / lỗi / Bluetooth
- [x] Trình duyệt iPad: thông báo đúng nền tảng (`platformHint`)

### M4 — App iPad Core MIDI — ⏳ chưa làm (module độc lập)

- [ ] Dự án Xcode SwiftUI + WKWebView nạp bản build web (offline)
- [ ] `MidiBridge.swift` hoàn thiện từ bản tham khảo, biên dịch, chạy trên iPad
- [ ] Quyền micro trong WKWebView; nút ghép Bluetooth MIDI
- [ ] Chạy checklist thủ công trên iPad + đàn USB-C và đàn Bluetooth
- [ ] (tuỳ chọn) WebView2 cho Windows nếu gặp đàn BLE không lộ qua Web MIDI

## Checklist kiểm thử thủ công (phần cứng thật)

Ghi kết quả vào bảng tương thích (thiết bị, hệ điều hành, trình duyệt, kết nối, ngày, người thử).

**Kết nối**
- [ ] Bật "Dùng đàn MIDI", trình duyệt hỏi quyền → Cho phép → thiết bị hiện trong danh sách, đúng tên, trạng thái "Đang kết nối"
- [ ] Từ chối quyền → thông báo + nút Thử lại hoạt động sau khi cấp quyền
- [ ] Cắm đàn khi app đang mở → tự hiện; rút → "Đã ngắt", nhãn MIDI ở màn Luyện tập đổi "Chưa thấy đàn MIDI"; cắm lại → tự dùng lại
- [ ] Rút đàn lúc đang giữ phím + đạp pedal → không còn nốt / tiếng kêu kẹt
- [ ] Mở phần mềm khác giữ cổng MIDI (Windows) → báo lỗi / không thấy đàn; đóng phần mềm đó → "Kết nối lại" thấy đàn
- [ ] Bluetooth LE MIDI (Windows: ghép qua Windows MIDI Services hoặc driver BLE của hãng, vd KORG BLE-MIDI Driver) → hiện trong danh sách
- [ ] Tải lại trang → tự kết nối lại, cấu hình từng đàn còn nguyên

**Tín hiệu**
- [ ] Kiểm tra tín hiệu: phím thấp nhất / cao nhất của đàn đúng tên nốt (khi nút Octave trên đàn ở giữa); số phím tự nhận đúng
- [ ] Lực gõ nhẹ / mạnh hiện 1–127 hợp lý; đường cong Nhạy / Nặng đổi rõ
- [ ] Pedal vang: đạp / nhả hiện đúng; pedal half-damper không làm nhảy nút điều hướng nhiều lần
- [ ] Nút Octave / Transpose trên đàn: nốt đổi tương ứng; Quãng tám / Dịch giọng trong app cộng thêm đúng
- [ ] Đàn split / dual: lọc kênh chỉ nhận đúng phần
- [ ] Controller có pad / nút gửi nốt: "Chỉ nhận phím trong dải" bỏ được các nốt đó

**Âm thanh**
- [ ] Controller không loa: chạm màn hình một lần → gõ phím có tiếng piano, độ trễ chấp nhận được; đổi 4 tiếng
- [ ] Pedal giữ tiếng; nhả pedal tắt tiếng
- [ ] Đàn có loa: app không phát tiếng (Tự động = tắt); bật tay thì phát

**Bài học / trò chơi (không đổi cơ chế)**
- [ ] Luyện tập Wait Mode / Đếm nốt / Theo nhịp, bài hai tay chấm cả hai tay, pedal được chấm
- [ ] Giáo trình: Wait Mode, Biểu diễn (trường độ theo Note Off, pedal), Tiết tấu
- [ ] Điều hướng bằng phím đàn (phím trắng / đen / pedal / hai phím đen)
- [ ] Trò chơi: Flappy Note, Bóng bay, Săn nốt, F1 (rút đàn → tự tạm dừng), Thu hoạch cà chua, trò sau buổi
- [ ] Controller 25 phím: bài cần nốt ngoài dải → gợi ý dải hiện trong cấu hình; chỉnh Quãng tám chơi được

## Bảng tương thích phần cứng

Chỉ đánh dấu ✅ sau khi chạy checklist trên thiết bị thật. "Dự kiến" = theo chuẩn MIDI / tài liệu hãng, chưa thử.

| Thiết bị | Kết nối | Windows Chrome/Edge | iPad (app Core MIDI) | Ghi chú |
| --- | --- | --- | --- | --- |
| Yamaha (Clavinova, P-series, PSR) | USB-B | Dự kiến | Dự kiến | Nhiều model báo tên "Digital Piano" |
| Korg microKEY2 (25/37/49/61) | USB | Dự kiến | Dự kiến | Controller không loa → app phát tiếng |
| Korg microKEY Air | Bluetooth LE / USB | Dự kiến (BLE cần driver / Windows MIDI Services) | Dự kiến | |
| Roland (FP, RD, A-series) | USB / BLE | Dự kiến | Dự kiến | |
| Casio (Privia, CDP, CT-S) | USB | Dự kiến | Dự kiến | |
| Akai (MPK mini, MPK2) | USB | Dự kiến | Dự kiến | |
| Arturia (KeyStep, MiniLab, KeyLab) | USB | Dự kiến | Dự kiến | |
| Thiết bị mô phỏng | — | ✅ e2e Chromium | — | Không thay được thử phần cứng |
