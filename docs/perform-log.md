# Nhật ký Biểu diễn (TẠM THỜI)

Người dùng yêu cầu ngày 08/11/2026: "thêm cơ chế log riêng tạm thời để kiểm tra người chơi chơi ở chế độ biểu diễn khuông
nhạc sai quá nhiều; có file log ghi các máy truy cập, người chơi ở bất kì máy nào để cải thiện tính năng".

Tính năng chỉ GHI LẠI, không đổi cách chấm. Xong điều tra thì gỡ (mục cuối).

## Ghi những gì

Mỗi dòng log (NDJSON) là một bản ghi, kiểu ở `src/core/performLog/types.ts`:

- **`visit`** — "máy truy cập": mỗi lần mở app (`reason: "open"`) và mỗi lần đổi người chơi (`"player"`).
- **`perform`** — một lượt Biểu diễn: màn Luyện tập chế độ Biểu diễn (`screen: "practice"`) và bài Biểu diễn của giáo trình
  (`screen: "curriculum"`, cả "Làm bài" lẫn "Luyện tập → Theo nhịp"; bài Tiết tấu không ghi). Lượt kết thúc khi hết bài
  (`end: "finished"`), bấm chơi lại giữa chừng (`"restart"`), rời màn / đổi chế độ / ẩn app (`"left"`); bỏ dở mà chưa đánh nốt nào
  thì không ghi.

Mọi bản có: mã máy (ngẫu nhiên, cố định theo trình duyệt) + tên máy đặt ở Cài đặt, người chơi (hồ sơ đang chọn: tên, tuổi, trình
độ), trình duyệt (user agent, màn hình, app cài / tab), phiên bản app. Máy ghi thêm `srv`: giờ nhận, **IP máy gửi**, origin.

Một lượt `perform` có:

| Trường | Nội dung |
| --- | --- |
| `setup` | tay, nhịp độ + %, đếm vào, cửa sổ chấm, bù trễ micro (60 ms), metronome, nguồn nốt, trạng thái micro, **đàn MIDI đang nối + cấu hình (dịch giọng, quãng tám, kênh…)**, cài đặt nhận diện micro, độ trễ đầu ra âm thanh |
| `notes` | từng nốt cần đánh: phách, trường độ, phím, tên nốt, tay, ô nhịp; kết quả (`correct` / `wrong` / `skipped`), lệch ms, phím đã đánh, giữ phím |
| `events` | MỌI nốt app nhận được trong lượt (kể cả nốt bị màn bỏ trước khi chấm): nguồn (`mic` / `midi` / `virtual`), phím, lực gõ / mức âm, `beat` (vị trí đồng hồ lúc chấm), kết quả (`hit` / `wrong` / `extra` / `ignored` / `dropped` + lý do `why`), nốt được chấm, lệch ms, **`lag` = lúc trang nhận − mốc của sự kiện** |
| `offs`, `pedal`, `marks` | thả phím, pedal vang, mốc bắt đầu / tạm dừng / chạy tiếp / đổi nhịp / kết thúc |
| `pitch` | (micro) cao độ nghe được mỗi khi đổi: thời điểm, MIDI, cents, độ tin cậy, RMS, có noteOn — KHÔNG có âm thanh |
| `result` | như hộp thoại kết quả + `score` (rubric Biểu diễn, cùng điểm màn hình) |
| `diagnosis` | thống kê + mã nghi vấn (bảng dưới) |
| `summary` | một dòng tiếng Việt (cũng là dòng trong `summary.log`) |

Lý do bỏ nốt (`why`): `mic-while-midi` (đàn MIDI đang nối → bỏ micro), `listening` (đang nghe mẫu), `other-hand`, `accompaniment`
(nốt tay trái khi chỉ chấm tay phải), `harmony` (nốt hoà âm không chấm), `source-setting` (cài đặt nguồn nốt của giáo trình),
`midi-nav` (phím vừa bấm nút), `playback` (micro ngay sau tiếng đàn mẫu), `voice` (cô giáo đang nói), `filtered` (không rõ).

### Mã nghi vấn (`diagnosis.hints`)

| Mã | Khi nào | Nghĩa là |
| --- | --- | --- |
| `clock-skew` | trung vị `lag` của đàn MIDI lệch > 40 ms | mốc thời gian Web MIDI (driver) lệch đồng hồ trang → app chấm nhịp lệch, nốt rơi sang ô kề. Nghi vấn số 1 với đàn thật trên Chrome Windows: PerformanceTracker chấm theo `e.time` = `MIDIMessageEvent.timeStamp`, mà Chrome Windows lấy theo đồng hồ driver (xem chú thích `hooks/useMidiNav.ts` — điều hướng bằng đàn đã phải bỏ `e.time` vì lý do này) |
| `late` / `early` | trung vị lệch nhịp > +100 / < −100 ms | đánh trễ / sớm đều (độ trễ loa / tai nghe Bluetooth, nhìn khuông chậm…) |
| `misaligned` | ≥ 3 và ≥ 30% nốt sai là nốt kề | lệch nhịp nên phím của nốt trước / sau bị khớp vào ô này |
| `octave` | ≥ 3 và ≥ 30% nốt sai lệch quãng tám | micro nhận sai quãng 8 / đàn đang dịch quãng |
| `dropped` | ≥ 3 nốt bị màn bỏ | xem `diagnosis.inputs.dropped` theo lý do. `mic-while-midi` chỉ tính khi lượt KHÔNG có nốt MIDI nào (đàn / cáp MIDI nối mà không gửi nốt → mọi nốt micro bị bỏ); có nốt MIDI thì micro nghe chính tiếng đàn, bỏ là đúng |
| `ignored` | ≥ 3 nốt bị chống lặp (< 80 ms sau nốt trước) | micro phát lặp / đàn gửi nốt đôi |
| `no-input` | ≥ 50% nốt không có tín hiệu cùng phím quanh đó | micro không nghe / người chơi dừng |
| `extras-near` | ≥ 3 lần đúng phím nhưng ngoài cửa sổ chấm | lệch nhịp quá nửa khoảng cách tới nốt kề |

## Log nằm ở đâu

Log luôn lưu trước trên chính máy chơi (IndexedDB "vietpiano-perform-log", tối đa 150 lượt + 40 lần mở app), rồi gửi tới **máy
ghi**. Máy ghi viết vào `logs/perform-log/` (thư mục chạy server, đã `.gitignore`):

- `YYYY-MM-DD.jsonl` — bản đầy đủ, mỗi dòng một bản (+ `srv.ip`);
- `summary.log` — một dòng mỗi bản: `giờ | IP | tên máy + mã máy | người chơi | hệ điều hành/trình duyệt | tóm tắt`;
- `machines.json` — các máy đã truy cập: tên, IP, trình duyệt, màn hình, người chơi, số lần mở app, số lượt Biểu diễn.

Biến môi trường: `PERFLOG_DIR` (đổi thư mục), `PERFLOG=0` (tắt máy ghi trong server app), `PERFLOG_ORIGINS` (thêm trang được gửi;
mặc định nhận máy nội bộ + `*.github.io`), `PERFLOG_PORT` (cổng `npm run perflog`, mặc định 8790).

## Cách dùng theo nơi mở app

| Mở app từ | Cần làm |
| --- | --- |
| `npm run dev` / `npm run dev:https` / `npm run serve:lan` (máy tính + iPad trong LAN) | Không cần gì: "Gửi tới" = `auto` → server của app có sẵn máy ghi `<base>__vplog` |
| GitHub Pages trên Chrome / Edge máy tính (máy dev, laptop) | Trên máy tính chính chạy `npm run perflog` (in ra địa chỉ LAN). Trên máy chơi: Cài đặt → Nhật ký Biểu diễn → "Gửi tới" = `http://<IP máy tính>:8790` (chính máy đó: `http://localhost:8790`) → "Kiểm tra kết nối". Chrome hỏi quyền truy cập mạng cục bộ một lần (như AI cục bộ) |
| GitHub Pages trên iPad (Safari) | Safari chặn trang https gọi địa chỉ http trong LAN → log chỉ nằm trên iPad: Cài đặt → "Tải file log" (lưu vào Tệp) rồi chuyển file sang máy tính. Hoặc cho bé chơi qua `npm run serve:lan` để tự gửi |

Bản trên GitHub Pages chỉ có tính năng này sau khi phát hành + deploy (chưa làm).

Cài đặt → **Nhật ký Biểu diễn (tạm thời)**: bật / tắt, tên máy (đặt để dễ đọc log, vd "iPad của bé An"), nơi gửi, số bản trên máy /
chưa gửi, Kiểm tra kết nối, Gửi ngay, Tải file log (`.jsonl`), Xoá log trên máy. Gửi lỗi thì giữ trên máy, tự gửi lại ở lần mở app sau.

## Riêng tư

Ngoại lệ tạm thời của quy tắc "không gửi dữ liệu ra ngoài" (CLAUDE.md): chỉ gửi tới máy ghi của chính người dùng (server app hoặc
địa chỉ tự nhập), không có dịch vụ đám mây, KHÔNG có âm thanh. Log chứa tên / tuổi hồ sơ người chơi và IP máy — đúng yêu cầu
"người chơi nào, máy nào"; xoá thư mục `logs/perform-log/` khi xong. Trình duyệt tự động (Playwright, `navigator.webdriver`) với
"auto" không gửi → e2e không ghi vào log thật.

## Kiểm thử

- Unit: `src/core/performLog/*.test.ts` (ghi lượt, chẩn đoán, cài đặt, hàng đợi IndexedDB, gửi / lỗi), `scripts/performLog/collector.test.ts`
  (máy ghi HTTP thật: file ngày, summary, máy truy cập, chặn trang lạ, preflight mạng cục bộ).
- e2e: `e2e/perform-log.spec.ts` (máy ghi giả bằng `page.route`): Biểu diễn hết bài → một bản log đúng nốt / sự kiện / điểm, mở app →
  bản máy truy cập, Cài đặt tải file; "auto" + trình duyệt tự động không gửi; chơi lại giữa chừng vẫn ghi; tắt thì không ghi.
- Đã chạy thử máy ghi thật (`npm run perflog`, plugin trong `vite` dev) bằng curl. CHƯA thử trên iPad thật, chưa thử với đàn MIDI thật.

## Gỡ tính năng

1. Xoá `src/core/performLog/`, `src/hooks/usePerformLog.ts`, `src/components/PerformLogSettings.tsx`, `scripts/performLog/`,
   `scripts/perform-log-server.ts`, `e2e/perform-log.spec.ts`, file này.
2. Bỏ các chỗ gọi (đều có chú thích "TẠM THỜI"): `usePerformLogVisits()` trong `src/App.tsx`; `usePerformLog` + `grade` / `logDropped` trong
   `src/hooks/usePracticePerformance.ts`; `drop(…)` trong `handle` của `src/screens/PracticeScreen.tsx` (trả lại `return;`);
   `usePerformLog` trong `TimedRunner` của `src/components/curriculum/PlayStep.tsx`; `<PerformLogSettings />` trong `SettingsScreen.tsx`;
   `performLogPlugin` trong `vite.config.ts`; script `perflog` trong `package.json`; dòng `logs/` trong `.gitignore` (nếu không cần).
3. `PerformanceTracker.beatAt` / `getConfig` (công khai cho nhật ký) có thể giữ.
4. Bỏ các dòng nhắc trong CLAUDE.md (bảng lệnh, bảng thư mục, ngoại lệ quyền riêng tư) và mục `performLog/` ở docs/architecture.md.
