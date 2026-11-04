# 5 ngón · 8 nốt liên tục

Màn `screens/FiveFingerScreen` (route `five-finger`, `?screen=five-finger`, nút "🖐 5 ngón · 8 nốt" ở đầu màn Giáo trình).
Lõi thuần TypeScript ở `src/core/fiveFinger/` (có unit test), dùng lại `ScoreView`, `PianoKeyboard`, `useNoteInput`
(micro + đàn MIDI qua `midiInput` + bàn phím ảo — không có hệ thống MIDI riêng), hồ sơ người học (`profileStore`).

## Thành phần

| File | Vai trò |
| --- | --- |
| `positions.ts` | Thế tay 5 phím (Đô, Sol, Rê trưởng, Fa, La thứ, Rê thứ) + quãng tám từng tay. Tay phải mặc định C4–G4 (ngón = chỉ số + 1), tay trái C3–G3 (ngón = 5 − chỉ số). Chỉ cho quãng tám giữ mọi phím trong tầm micro 36–84; `separateHands` chống chồng phím |
| `generator.ts` | Bộ sinh chuỗi 8 sự kiện theo seed (mulberry32 `games/random.seeded`). Lưu chỉ số phím 0–4 → đổi thế tay không phải sinh lại. `nextChain` tránh trùng chuỗi vừa xong (đổi seed có quy tắc, ghi seed thực dùng). `stepsToLesson` → `Lesson` cho ScoreView (Sol / Fa / khuông đôi; hai tay cùng lúc = tay trái là phần đệm cùng thời điểm) |
| `FiveFingerDrill.ts` | Wait Mode một chuỗi: mỗi sự kiện tiến tối đa 1 bước, `minAdvanceIntervalMs` 120 ms; bước hai tay cần đủ 2 nốt cách nhau ≤ `syncToleranceMs` (mặc định 250 ms, chỉnh 150/250/400), muộn hơn → `late-sync` (không tính sai nốt, phải đánh lại cùng lúc); tạm dừng bỏ nốt + trừ thời gian dừng khỏi phản ứng; chấm nhịp theo khoảng giữa hai bước |
| `FiveFingerSession.ts` | Buổi tập liên tục: ready → playing ⇄ paused → celebrating (1,5 s) → chuỗi mới … → finished. Seed chuỗi n = `mixSeed(seed buổi, n)`. Số chuỗi 5/10/20/không giới hạn. Hai tay + "luyện từng tay trước": tay phải → tay trái → hai tay cho cùng một chuỗi. Luyện lại = chơi lại chuỗi hiện tại. `replay` mở lại chuỗi đã lưu |
| `stats.ts` / `storage.ts` | Thống kê theo hồ sơ (localStorage `vietpiano.five-finger.stats.v1`) + cài đặt theo hồ sơ (`…settings.v1`) |

## Độ khó

| | Chuyển động | Cấu trúc | Hiển thị |
| --- | --- | --- | --- |
| Dễ | liền bậc (trọng số cao), lặp ít, tối đa 1 lần cách 1 phím | bắt đầu + kết thúc ở bậc 1/3/5, ≥ 3 phím khác nhau | tên nốt trên khuông + bàn phím, ngón, tô phím cần đánh |
| Trung bình | liền bậc, cách 1 phím (bắt buộc có), nốt lặp (bắt buộc có) | như trên | ẩn tên nốt; ngón trên khuông + bản đồ ngón trên 5 phím |
| Khó | bất kỳ 2 phím trong nhóm (bắt buộc có bước ≥ 3 phím), trường độ thay đổi (mẫu tiết tấu 2 ô 4/4) | ≥ 4 phím khác nhau, kết thúc bậc 1/3/5 | chỉ khuông nhạc (không tên, không ngón, không tô phím) |

Hai tay cùng lúc: Dễ = cùng số ngón (ngược chiều), Trung bình = song song cùng bậc, Khó = mỗi tay một chuỗi độc lập.
Luân phiên: R L R L…, mỗi tay một chuỗi 4 nốt theo cùng luật.

## Cá nhân hoá

- Tỉ lệ nốt đúng + thời gian phản ứng theo tay, nốt hay sai + nốt bị nhầm sang, ngón **được hướng dẫn** của nốt đó,
  tỉ lệ đúng nhịp (khi bật Chấm nhịp), tỉ lệ hai tay cùng lúc, lịch sử 300 chuỗi (seed + tham số → "Luyện lại chuỗi này").
- Chuyển động (phím → phím) sai ≥ 2 lần và ≥ 25% → `weakMovements` → bộ sinh ưu tiên (trọng số ×5, cố gắng có ít nhất một lần
  trong chuỗi). Lấy lại trước mỗi chuỗi nên cập nhật ngay trong buổi.
- 3 chuỗi gần nhất (cùng cách tay + độ khó) đều ≥ 90% đúng và ≥ 75% bước đúng ngay → gợi ý tăng độ khó; trung bình < 65% → gợi ý giảm.
- **Micro / đàn MIDI không biết người học dùng ngón nào** — app không kết luận dùng sai ngón (ghi chú hiện trong bảng Tiến bộ).

## Giới hạn đã biết

- Hai tay cùng lúc cần đàn MIDI hoặc bàn phím ảo (đa chạm trên iPad); chỉ có micro → nút Bắt đầu bị khoá + thông báo (micro chỉ nhận một nốt mỗi lúc).
- Chấm nhịp chỉ là thống kê (khoảng giữa hai bước so với trường độ, dung sai max(120 ms, 25% phách)); Wait Mode vẫn chờ nốt đúng, không có đồng hồ chạy khuông.
- Bàn phím máy tính (demo) phủ 17 nửa cung từ nốt Đô gần nhất → ở chế độ hai tay không với tới hết phím tay phải.
- Chưa có giọng cô giáo cho màn này.

## Checklist kiểm thử thực tế (chưa chạy trên iPad / đàn thật)

Đánh dấu khi đã chạy trên thiết bị thật; ghi thiết bị + ngày.

- [ ] iPad Safari, micro: tay phải Dễ — 8 nốt đúng → pháo hoa, sau ~1,5 s tự sang chuỗi mới; nốt lặp (vd Mi Mi) không nhảy 2 bước.
- [ ] iPad Safari, micro: tay trái C3–G3 — nhận đúng quãng tám (không bị nhận lên C4).
- [ ] iPad Safari, micro: luân phiên — đổi tay liên tục không nhận âm ngân của nốt trước thành nốt sau.
- [ ] iPad Safari, micro + chọn Hai tay cùng lúc → nút Bắt đầu khoá, có thông báo.
- [ ] iPad bàn phím ảo đa chạm: hai tay cùng lúc — chạm hai phím cùng lúc qua bước; chạm cách nhau > 0,25 s hiện "chưa cùng lúc".
- [ ] Đàn MIDI (Chrome/Edge Windows): hai tay cùng lúc ở 3 mức độ đồng thời; giữ phím không tính lặp; rút dây giữa chừng không treo.
- [ ] Đàn MIDI có loa + micro bật: nốt chỉ tính một lần (micro bị bỏ khi có đàn MIDI).
- [ ] Tạm dừng / Tiếp tục / Luyện lại / Kết thúc ở cả lúc đang chơi và lúc đang ăn mừng; ẩn app → tự tạm dừng.
- [ ] Buổi 5 chuỗi kết thúc đúng sau chuỗi 5; Không giới hạn chạy > 20 chuỗi không trùng chuỗi liền trước.
- [ ] Chấm nhịp ♩=60: máy đếm nhịp không làm micro nhận nhầm nốt; tỉ lệ đúng nhịp hợp lý khi đánh theo click.
- [ ] Đổi thế tay (Rê trưởng, Fa) — khuông hiện hoá biểu, phím đen Fa♯ / Si♭ chấm đúng.
- [ ] Đổi hồ sơ → thống kê / cài đặt riêng; "Luyện lại chuỗi này" mở đúng chuỗi cũ.
- [ ] Gợi ý tăng độ khó sau 3 chuỗi tốt; gợi ý giảm khi sai nhiều; bảng Tiến bộ hiện chuyển động yếu.
- [ ] Dark mode + iPad dọc: không che nút, khuông đọc được.
