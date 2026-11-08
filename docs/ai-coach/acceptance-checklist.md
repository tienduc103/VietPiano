# AI Piano Coach — checklist nghiệm thu (thử thật)

Tất cả mục dưới đây mới qua **kiểm thử tự động** (unit + e2e trên Chromium với đàn MIDI giả / Ollama giả).
CHƯA mục nào được thử trên đàn MIDI thật hay iPad thật — đánh dấu ✅ khi chính bạn thử và thấy đúng.
Kiến trúc: [architecture.md](architecture.md) · Trạng thái task: [backlog.md](backlog.md)

Chuẩn bị: Chrome / Edge trên máy tính, Cài đặt → Đàn MIDI → bật "Dùng đàn MIDI", cắm đàn (máy dev: cáp USB2.0-MIDI CH345).
Mở **Trang chủ → "AI Piano Coach — chấm bài đàn"** (hoặc `?screen=coach`).

| # | Mục | Cách thử | Mong đợi | Kết quả |
| --- | --- | --- | --- | --- |
| 1 | Kết nối đàn MIDI | Mở Coach, mục "Đàn & tín hiệu" | "Đang dùng: Đàn MIDI", tên đàn đúng | ☐ |
| 2 | Ghi đúng nốt nhấn / nhả | Ghi gam Đô, bấm "Kết thúc & chấm" | Đúng 16/16; mở Lịch sử → Dữ liệu JSON thấy đủ on/off | ☐ |
| 3 | Nhận velocity | Đánh mạnh / nhẹ xen kẽ | Tiêu chí "Lực đánh" có điểm, báo "lực đánh chưa đều" | ☐ |
| 4 | Nhận sustain pedal | Đạp thử pedal ở màn chuẩn bị | "✓ Đã nhận tín hiệu pedal (CC 64)"; lúc ghi thanh trạng thái báo "pedal đang đạp / nhả" | ☐ |
| 5 | Ghi đúng hợp âm | Bài hai tay (vd Ode to Joy hai tay), đánh đủ hợp âm tay trái | Không báo thiếu nốt hợp âm; nốt đệm tô xanh | ☐ |
| 6 | Phát hiện nốt sai | Cố ý đánh sai 1 nốt | Nốt đó đỏ ✗, chi tiết "cần X, bạn đánh Y" đúng ô / phách | ☐ |
| 7 | Phát hiện thiếu / thừa | Bỏ 1 nốt, thêm 1 nốt lạ | Thiếu: ○ đỏ; thừa: "+" đỏ đúng chỗ | ☐ |
| 8 | Phát hiện sai nhịp | Đánh 1 nốt rất muộn; ngừng 2–3 giây giữa bài | Nốt muộn ⏱ vàng "muộn … ms"; chỗ ngừng ⏸ "ngắt quãng"; nốt sau đó KHÔNG bị tính muộn | ☐ |
| 9 | Phát hiện sai trường độ | Nhả rất sớm một nốt trắng | ⌛ "nhả sớm (giữ …%)"; nhả lúc đang đạp pedal thì không bị trừ | ☐ |
| 10 | Chấm pedal khi có ký hiệu | Bài có "Ped." (Romance hai tay / bài `rep-*`), không thay pedal một chỗ | "P" tím + "chưa thay pedal khi đổi hợp âm" đúng ô | ☐ |
| 11 | Không có dữ liệu pedal | Đàn không cắm pedal, bài có ký hiệu pedal | Pedal "chưa đủ điều kiện chấm", trọng số chia lại (xem "Cách tính điểm") | ☐ |
| 12 | Hai tay | Tay trái cố ý vào trễ | "tay trái vào chậm hơn tay phải … ms"; tổng hợp từng tay | ☐ |
| 13 | Điểm theo tiêu chí | So các tiêu chí với cảm nhận | Tổng = tổng điểm từng tiêu chí; mỗi lỗi ghi số điểm bị trừ | ☐ |
| 14 | Tô màu đúng trên khuông | Chạm / bấm từng nốt màu | Chi tiết khớp màu + ký hiệu; có chú giải; rê chuột hiện chú thích | ☐ |
| 15 | Phát lại phần biểu diễn | "Bản của bạn", tốc độ 75% / 50% | Nghe đúng thứ tự, con trỏ chạy theo; ghi rõ "không phải âm thanh gốc" | ☐ |
| 16 | So sánh bản chuẩn / bản người học | "Bản chuẩn", "A/B ô …", "Nghe lại ô N" ở chi tiết | A (chuẩn) rồi B (bạn), đúng đoạn | ☐ |
| 17 | AI cục bộ nhận xét đúng dữ liệu | Bật AI ở Cài đặt (Ollama chạy), chấm một bài. Mở app từ GitHub Pages: Chrome hỏi quyền truy cập mạng cục bộ → Cho phép, và Ollama cần `OLLAMA_ORIGINS=https://tienduc103.github.io` (máy dev đã đặt 2026-11-07) | Nhận xét tiếng Việt; mọi ô / số / tên nốt trùng với kết quả chấm. Chưa mở khoá → chip "chưa kết nối" kèm đúng 2 cách sửa trên | ☐ |
| 18 | AI không bịa lỗi | Dùng model nhỏ hay bịa; xem trạng thái thẻ | Câu sai số liệu bị lọc ("đã lọc câu không khớp số liệu"); tắt Ollama → vẫn có nhận xét theo quy tắc | ☐ |
| 19 | Tạo bài luyện sửa lỗi | "Luyện theo kế hoạch 7 bước" ở gợi ý | Màn chuẩn bị tự đặt đoạn + tempo của bước 1; chấm xong tự sang bước sau khi đạt | ☐ |
| 20 | Lưu lịch sử + tiến bộ | Ghi cùng bài 3 lần | Lịch sử: so 3/5/10 lần, lỗi lặp lại, tempo cao nhất, sparkline | ☐ |
| 21 | Không ảnh hưởng bài học / game cũ | Chơi màn Luyện tập, giáo trình, một trò chơi | Như trước (rubric Biểu diễn cũ 45/30/15/10 không đổi) | ☐ |
| 22 | Giao diện trên PC | 1366 × 768, chế độ tối | Không tràn, đọc được, nút ≥ 48 px | ☐ |
| 23 | MIDI trên iPad | Safari iPad | Báo "không có Web MIDI"; dùng bàn phím ảo / micro (thử nghiệm). MIDI trên iPad chỉ qua app native (chưa build) | ☐ |
| 24 | Dữ liệu theo từng hồ sơ | Đổi hồ sơ ở Trang chủ, mở Lịch sử | Mỗi hồ sơ chỉ thấy lịch sử của mình; "Xoá toàn bộ lịch sử" cần bấm hai lần, chỉ xoá hồ sơ đang chọn | ☐ |
| 25 | Khôi phục khi app tắt giữa chừng | Đang ghi thì tải lại trang | Mở lại Coach thấy "Có phiên ghi chưa kết thúc" → "Chấm phần đã ghi" | ☐ |
| 26 | Đàn rút giữa chừng | Rút cáp MIDI lúc đang ghi rồi cắm lại | Phiên vẫn ghi; "Cách tính điểm" ghi đàn mất kết nối, nốt bị ngắt không tính trường độ | ☐ |
| 27 | Trạng thái AI cục bộ khi đang đánh | Bật AI, Ollama chạy → mở Coach, bấm "Bắt đầu ghi"; giữa bài tắt Ollama, lát sau bật lại (iPad: mở app qua `npm run serve:lan`) | Chip "AI cục bộ: đã kết nối · <model>" ở màn chuẩn bị và trên thanh ghi; tắt Ollama → trong ≤ 30 s (hoặc bấm chip) thành "mất kết nối"; bật lại → ≤ 15 s "đã kết nối"; nốt vẫn ghi đủ, không giật, khuông không nhảy | ☐ |
| 32 | Chơi lại từ đầu câu (M2-T11) | Gam Đô: đánh sai nốt C5 ở ô 2, dừng 1–2 giây, chơi lại từ đầu ô 2 tới hết; thử thêm: dừng không đánh sai, chơi lại từ đầu bài, chơi lại hai lần, bài hai tay có pedal | "↺ Dừng lại rồi chơi lại 1 lần — … nốt chơi lại không chấm"; Thừa = 0, không có "+" đỏ cho đoạn chơi lại; nốt sai lần đầu vẫn ✗ "cần C5, bạn đánh …"; lỗi "rồi dừng lại, chơi lại từ đầu ô 2"; lúc ghi con trỏ quay về chỗ chơi lại; "Bản của bạn" con trỏ nhảy lùi đúng lúc chơi lại | ☐ |
| 33 | Lùi một nốt để sửa / chơi thêm sau khi xong | Đánh sai rồi đánh lại đúng nốt trước đó + đi tiếp; chơi hết bài rồi chơi thêm ô 1 | Lùi một nốt: chấm như trước (sai / thừa, không phải "chơi lại"); chơi thêm sau khi xong: không trừ, "Cách tính điểm" ghi "chơi thêm … nốt — không chấm" | ☐ |

Ghi chú khi thử thật (giúp chỉnh thuật toán): nếu thấy báo sai, mở **Lịch sử → Dữ liệu JSON** và gửi kèm file — log gốc giữ nguyên
mốc thời gian, chấm lại được bằng phiên bản engine mới.
