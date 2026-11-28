# Cầu vồng hai bàn tay

Trò chơi luyện **tám nốt Đô trưởng** bằng từng tay, hai tay cùng chiều và hai tay ngược chiều. Gấu Trái (tay trái) và Thỏ Phải (tay phải)
đi qua cầu vồng; xong mỗi vòng một bạn thú về nhà và cầu vồng sáng thêm một mảnh.

- Màn: `screens/RainbowHandsScreen.tsx`, route `rainbow-hands`, `?screen=rainbow-hands`, thẻ trong mục **Trò chơi**
  (`games/catalog.STANDALONE_GAMES`), ghim lối tắt được (dòng 📌 trong ⚙ Phần phụ huynh). Nằm trong giới hạn giờ chơi (`TimedGameRoute`).
- Lõi thuần TypeScript + unit test: `src/core/rainbowHands/`. Cảnh: `components/rainbowHands/RainbowScene.tsx`.
- Dùng lại: `useNoteInput` (micro + đàn MIDI `midiInput` + bàn phím ảo — không bộ nhận nốt riêng), `PianoKeyboard`,
  `InputSourceBar`, `ProfileSwitcher`, `soundOutput` (nghe mẫu, metronome, hiệu ứng), số ngón của bài kỹ thuật
  `tech-l3-scale-c-hands`. Không backend, không AI, không ghi âm.

## Lộ trình (`route.ts`)

- Một vòng = Đô Rê Mi Fa Sol La Si **Đô cao** (lên, 8 nốt) + Si La Sol Fa Mi Rê Đô (xuống, 7 nốt) = **15 vị trí mỗi tay**.
  Đô cao chỉ đánh một lần ở điểm quay đầu. Vòng sau bắt đầu bằng một lần nhấn Đô **mới**.
- "Chỉ đi lên" = vị trí 0–7, "chỉ đi xuống" = Đô cao → Đô (vị trí 7–14).
- Đô bắt đầu: tay trái Đô2 / **Đô3** (mặc định), tay phải **Đô4 = Đô giữa** (mặc định) / Đô5 — hai vùng không chồng nhau
  (trừ phím chung Đô4 khi mặc định, không bao giờ cùng bước). `placementGuide` mô tả vị trí trên đàn thật theo Đô giữa.
- Số ngón: đọc từ bài kỹ thuật **"Gam Đô trưởng hai tay cùng chiều"** (`tech-l3-scale-c-hands`: phải 1 2 3 1 2 3 4 5 4 3 2 1 3 2 1,
  trái 5 4 3 2 1 3 2 1 2 3 1 2 3 4 5). Test so từng nốt với bài đó; bài đổi / mất → không hiện số ngón (không tự suy diễn).
- **Ngược chiều** (`motion: 'contrary'`, thêm 28/11/2026 theo yêu cầu người dùng): lộ trình + số ngón lấy từ bài kỹ thuật
  **"Gam Đô trưởng hai tay ngược chiều"** (`tech-l3-scale-c-contrary`): tay phải Đô4 → Đô5 → Đô4 (như cùng chiều), tay trái Đô3 đi
  XUỐNG Đô2 rồi về Đô3, ngón trái 1 2 3 1 2 3 4 5 4 3 2 1 3 2 1. Test so TỪNG NỐT + ngón với bài mẫu. Vẫn 15 vị trí, Đô hai đầu một lần.
  Đô cao vùng tay trái phải thấp hơn Đô tay phải (không thì bước đầu hai tay cùng một phím) → vùng mặc định tự lùi tay trái xuống
  Đô2–Đô3 (`effectiveStarts`, ghi rõ trong Phần phụ huynh); tay phải Đô5 + tay trái Đô3 thì giữ nguyên. Tên cho bé: hai tay đều bắt đầu
  ở "Đô", tay phải lên "Đô cao", tay trái xuống "Đô thấp" (`noteNameAt`). Thẻ bước có mũi tên ⬆ / ⬇ từng tay, hướng chung "↔ Tách ra" /
  "→← Gom lại". Lỗi gán tay theo vùng phím như cùng chiều (vùng trái Đô2–Đô3 không chồng tay phải).

## Bốn chế độ — một bộ máy (`settings.ts` → `resolvePlan` → `RainbowEngine`)

| Chế độ | Tay | Đường đi | Thời gian |
| --- | --- | --- | --- |
| A Tập từng tay | trái / phải | lên / xuống / cả vòng | chờ |
| B Hai tay cùng bước (mặc định) | hai tay | lên / xuống / cả vòng | chờ |
| C Lên núi – xuống núi | hai tay | cả vòng | chờ |
| D Giữ nhịp | hai tay / trái / phải | cả vòng | nhịp chạy (♩ phụ huynh chọn) |
| E Hai tay ngược chiều | hai tay | lên (tách ra) / xuống (gom lại) / cả vòng | chờ |
| F Trường độ | hai tay / trái / phải | cả vòng | nhịp chạy, mỗi bước một trường độ |
| G Nhanh – chậm | phải / trái / hai tay | lên / xuống / cả vòng | chờ nốt đúng + đo khoảng giữa hai lần bấm (không nhịp nhạc) |

Nhiệm vụ 1 / 3 / 5 vòng ở mọi chế độ. Xong nhiệm vụ → dừng hẳn ở màn tổng kết (điểm dừng + "Nghỉ thôi");
"Chơi thêm 1 vòng" phải bấm, mỗi lần một vòng. Chế độ E dùng cùng `RainbowEngine` (chỉ khác lộ trình); "Tập lại đoạn này"
ở chế độ E giữ chiều ngược (tay khó tập riêng đúng chiều của nó, rồi ghép hai tay).

## F — Trường độ (`durations.ts`, thêm 28/11/2026 theo yêu cầu người dùng)

- Năm trường độ: **tròn 4 phách, trắng 2, đen 1, móc đơn ½, móc kép ¼** (`DURATION_BEATS` dùng chung). Phụ huynh chọn mẫu
  tiết tấu: toàn đen / trắng / tròn / móc đơn / móc kép, "trắng – đen – đen", "đen – móc đơn – móc đơn", "móc đơn – móc kép – móc kép",
  "đủ 5 loại" (tròn → trắng → đen → móc đơn → móc kép). Mỗi chu kỳ tròn phách (test). Mẫu gán cho từng bước của vòng.
- Dùng chế độ giữ nhịp của `RainbowEngine`: phách bước = tổng phách các bước trước; cửa sổ chấm = ½ khoảng NGẮN hơn giữa bước trước /
  bước đó (tối đa ½ phách) → móc kép cửa sổ hẹp, nên chọn ♩=40–60. Đếm vào CHỈ lúc bắt đầu / tiếp tục / vòng mới (không hiện lại
  khi chờ sau nốt dài — `countTarget`, có test).
- **Giữ phím**: Note Off (đàn MIDI / bàn phím ảo) → giữ đủ khi ≥ 75% độ dài (nốt ngắn: ≥ độ dài − 120 ms, tối thiểu 40%), giữ lâu hơn
  không bị trừ; thả lúc đang đạp pedal (CC 64) → không đo; micro → không đo (không có Note Off). Vòng đạt cần thêm giữ đủ ≥ tiêu chí
  khi có lần đo được. Nhả sớm tính vào "đoạn nên tập lại".
- Giao diện: dải 4 thẻ hình nốt trên khuông nhỏ (VexFlow, khoá Sol / Fa theo tay) — thẻ sáng là nốt đang giữ / sắp đánh, tên + "đếm 1 2";
  thanh giữ phím từng tay (tím đang giữ → xanh đủ / đỏ nhả sớm). Nghe mẫu phát đúng số phách. Tổng kết: giữ đủ · nhả sớm · không đo từng tay.

## G — Nhanh – chậm (`speed.ts`, thêm 28/11/2026 theo yêu cầu người dùng)

- Mục đích: tay linh hoạt đổi nhanh / chậm — KHÔNG theo nhịp nhạc (không metronome). Máy đưa ra tốc độ cho từng chặng (4 / 8 nốt /
  cả vòng), chặng sau khác chặng trước, kế hoạch ngẫu nhiên mỗi ván (`speedPlan`, theo seed → test lặp lại được).
- Dải khoảng giữa hai lần bấm đúng (mức Chuẩn): 🐌 thật chậm 1,5–3 s · 🐢 chậm 0,8–1,5 s · 🐇 nhanh 0,35–0,8 s · 🐆 thật nhanh
  0,15–0,35 s (dải nối liền nhau). Mức **Dễ** (mặc định, bé nhỏ) nới: đầu dưới × 0,8, đầu trên × 1,25. Phụ huynh chọn tốc độ nào máy
  được đưa ra (mặc định chậm + nhanh). Các con số là lựa chọn ban đầu của Claude — CHƯA thử với trẻ thật.
- Nốt đúng / sai vẫn do `RainbowEngine` (chờ). `SpeedJudge` đo khoảng giữa hai bước liên tiếp (mốc bước = lần bấm sớm nhất; hai tay:
  tay bấm trước). Bước đầu vòng + bước đầu chặng mới không chấm (bé vừa đọc tốc độ mới). Tạm dừng không tính vào khoảng chờ.
- Chậm quá → 🐊 cá sấu (báo NGAY lúc đang chờ quá giới hạn, một lần mỗi bước); nhanh quá → ⚡ sét / 🪵 khúc củi (luân phiên).
  Mỗi lần +1 nấc nguy hiểm; 3 nấc → "bị bắt" (hoạt hình to 2 s) rồi về 0 và **chơi tiếp** — không chơi lại vòng, không trừ sticker.
  3 lần đúng tốc độ liền nhau → bớt một nấc. Tiếng hiệu ứng nhỏ, tắt khi nghe bằng micro.
- Giao diện: bảng tốc độ (con vật + tên + lời gợi ý, "Sắp đổi → …"), đồng hồ tốc độ thang log (trái chậm, phải nhanh, vùng xanh = dải
  cần đạt, kim = thời gian đang chờ / khoảng vừa bấm), 3 ô nguy hiểm. Nghe mẫu phát đúng tốc độ từng chặng.
  Tổng kết: đúng tốc độ x/y, theo từng tốc độ (đúng · chậm · nhanh), số lần bị bắt; vòng đạt cần thêm đúng tốc độ ≥ tiêu chí.
- Micro: chơi được một tay; "thật nhanh" có thể khó nhận (NoteRecognizer cần thời gian ổn định) — nên dùng đàn MIDI.

## Chấm (`RainbowEngine.ts`)

- **Chờ**: bước hai tay cần cả hai nốt, thứ tự bất kỳ — "đủ hai nốt". Chỉ khi hai lần đánh cách nhau ≤ ngưỡng
  (0,4 / **0,25** / 0,15 s, phụ huynh chọn) mới ghi "cùng lúc"; cách xa vẫn qua bước nhưng `together: false`.
  Một tay đánh hết lộ trình mà tay kia bỏ trống → không qua nổi bước nào.
- Mỗi sự kiện tiến tối đa một bước; bỏ sự kiện < 120 ms sau lần chuyển bước.
- Sai: lỗi gán cho tay theo **vùng phím** (phím chung / ngoài vùng → nốt cần đánh gần nhất, ưu tiên tay còn chờ); nhân vật tay đó lắc,
  phím cần sửa sáng lên, lời nhắc riêng tay đó. Giữ nguyên bước, phần đúng của tay kia giữ nguyên — không chơi lại cả vòng.
  Nốt thừa của tay đã xong bước cũng là lỗi của tay đó.
- **Lần nhấn mới**: đàn MIDI / bàn phím ảo phải có Note Off trước khi cùng phím được tính lại (giữ phím, Note On lặp → `held`).
  Phím đang giữ được chuyển sang ván mới (đổi cài đặt / chơi lại) nên không thành nốt của ván mới.
- **Micro**: nốt "sai" lệch đúng quãng tám / +19 nửa cung (hoạ âm 3) hoặc trùng nốt vừa đánh của tay đó (âm còn ngân) là
  **không chắc** (`uncertain`): báo "App nghe chưa rõ — không tính lỗi", không vào độ chính xác, không dùng cho "Tập lại đoạn này".
- **Giữ nhịp**: đếm vào 4 phách (số lớn trên màn), mỗi bước một phách, metronome lên lịch theo đồng hồ âm thanh. Cửa sổ ±½ phách:
  đúng nhịp (≤ min(200, max(100, 20% phách)) ms) / sớm / trễ; hết cửa sổ → **thiếu**. Không chờ. Giữa hai vòng nghỉ 6 phách
  (ăn mừng + đếm vào). Vòng chỉ tính **chơi hết** khi MỖI tay đánh được ≥ 60% nốt của mình.
- **Tạm dừng** (bé bấm, nghe mẫu, mở Phần phụ huynh, ẩn app, **mất kết nối**): bỏ mọi nốt, xoá phần đánh dở của bước, không ghi lỗi.
  Giữ nhịp: tiếp tục → đếm vào lại từ bước đang dở. Mất kết nối = đàn MIDI đang dùng lúc bắt đầu bị rút / micro đang dùng bị tắt
  hoặc mất quyền → lớp "🔌 Mất kết nối" + cách nối lại + "không phải lỗi của bé".
- Pedal: không ảnh hưởng chấm (chỉ xét phím bấm). Micro + pedal: âm ngân được NoteRecognizer xử lý; nốt trùng âm ngân → không chắc.

### Kiểm tra khả năng đầu vào thực tế (trước khi triển khai)

- **Micro**: app chỉ nhận diện **một nốt tại một thời điểm** (nguyên tắc dự án, YIN + AttackAnalyzer). Chưa có bằng chứng nhận
  ổn định hai nốt cách nhau một quãng tám — thực tế YIN trên hỗn hợp hai nốt quãng tám thường ra một nốt. Vì vậy chế độ hai tay
  **khoá nút Bắt đầu** khi chỉ có micro, kèm giải thích + nút "Tập từng tay". Micro chỉ chấm chế độ một tay.
- **Đàn MIDI** (Web MIDI Chrome/Edge, hoặc app vỏ native): có Note On / Note Off + mốc thời gian → chấm đủ hai tay, đồng thời,
  giữ phím. Safari / iPad không có Web MIDI (xem docs/midi.md).
- **Bàn phím ảo** (micro tắt): đa chạm trên iPad → chấm được hai tay; độ đồng thời phụ thuộc cảm ứng.

## Kết quả, tiến độ, phần thưởng (`analysis.ts`, `storage.ts`)

- Tổng kết riêng: vòng đã chơi hết, vòng đạt tiêu chí (mỗi tay chính xác ≥ 70 / **80** / 90%; giữ nhịp thêm đúng nhịp ≥ 60 / **70** / 80%),
  độ chính xác từng tay, "đủ hai nốt · cùng lúc", giữ nhịp: đúng nhịp · trễ/sớm · thiếu từng tay, số lần micro nghe chưa rõ.
- Lời nhận xét theo quy tắc, chỉ nói điều dữ liệu cho phép, vd "Con hoàn thành ba vòng. Đoạn Mi–Fa của tay trái cần tập thêm."
- **Tập lại đoạn này**: vị trí có nhiều lỗi CHẮC CHẮN nhất (nốt sai đã xác định + thiếu nốt khi giữ nhịp, ≥ 2) của một tay → cặp
  "nốt trước–nốt hay sai" + 1 nốt đệm mỗi đầu; tay đó tập riêng 3 lượt, rồi ghép hai tay 3 lượt (bài hai tay). Phụ huynh bấm "Bỏ qua" được.
- Phần thưởng (không xét tốc độ, không trừ khi sai, không bảng xếp hạng): mỗi vòng chơi hết = một bạn thú về nhà + một mảnh cầu vồng;
  xong nhiệm vụ = sticker 🌈; mọi vòng đạt = ⭐; ≥ 80% bước cùng lúc = 🤝; chính xác hơn lần trước cùng chế độ = 🌱.
  Vòng chơi thêm / chặng tập lại: chỉ thêm bạn thú (chặng tập lại thì không), không thêm sticker.
- Thay đổi giữa các vòng: bầu trời đổi màu, bạn thú đi cùng đổi con.
- Gợi ý tăng tốc (giữ nhịp): chỉ khi 3 vòng giữ nhịp gần nhất ở ĐÚNG nhịp đó đều đạt → nút "Thử ♩=+6" cho phụ huynh (tối đa 96).
- Lưu localStorage `vietpiano.rainbow-hands.v1` theo hồ sơ: cài đặt, sticker, số bạn thú, 60 buổi tóm tắt, 40 vòng giữ nhịp.
  Không lưu âm thanh, không lưu log từng nốt.

## Giao diện

Đầu trang: ← (thoát về Trò chơi) · tên · chế độ · "Vòng x/N" · Tạm dừng · Nghe mẫu · 🐢 Tập chậm · ⚙ Phần phụ huynh · ⛶.
Giữa: cảnh cầu vồng (đá bước có tên nốt, hai nhân vật có nhãn TRÁI / PHẢI — không chỉ dựa vào màu) → thẻ bước (hướng lên / quay đầu /
xuống, bước x/15, nốt + ngón + nốt tiếp của từng tay, lời nhắc ngắn cao cố định). Dưới: bàn phím đúng vùng đang tập.
Bàn phím ảo **mặc định ẩn** (`showKeyboard` = false, Phần phụ huynh → "Hiện bàn phím ảo"; đổi không mở ván mới) để bé nhìn đàn thật.
Không micro, không đàn MIDI → bàn phím ảo là nguồn nốt duy nhất nên luôn hiện (giống quy tắc Tự ẩn của màn Luyện tập).
Mức gợi ý: Đầy đủ (tô phím + chữ "T·Fa"/"P·Fa" + số ngón) / Vừa (tô nhạt) / Ít (chỉ phím cần sửa sau khi sai).
Hiệu ứng âm thanh chỉ kêu khi xong vòng, âm lượng Tắt / Nhỏ / Vừa, **luôn tắt khi nghe bằng micro**. Nghe mẫu tạm dừng chấm.

## Kiểm thử đã có

- Unit (`src/core/rainbowHands/*.test.ts`): đủ hai tay mới qua bước, giữ phím không thêm bước, không đếm trùng Đô cao,
  vòng sau cần nhấn Đô mới, đủ nốt ≠ cùng lúc, sai rồi sửa đúng bước + gán đúng tay, chống nhảy, micro không chắc, tạm dừng / mất kết nối
  không tính lỗi, ván mới không mang nốt / điểm cũ, số vòng khớp bản ghi, giữ nhịp (đếm vào, trễ, thiếu, một tay bỏ trống, nghỉ giữa vòng,
  tạm dừng đếm vào lại), tổng kết / đoạn yếu / nhận xét / gợi ý tăng tốc / sticker / lưu theo hồ sơ; ngược chiều: khớp từng nốt + ngón
  bài mẫu, vùng tay trái tự lùi, hai tay không bao giờ cùng phím, chấm đủ hai tay + gán lỗi đúng tay, đoạn yếu mang tên nốt của tay đó.
- e2e (`e2e/rainbow-hands.spec.ts`, Chromium, bàn phím ảo + Web MIDI GIẢ): mở từ Trò chơi, hai tay cùng bước + sai một tay,
  một vòng → tổng kết + sticker + dừng, chơi thêm; từng tay + giữ phím; giữ nhịp tự chạy khi không bấm; rút đàn MIDI → tạm dừng không tính lỗi;
  ngược chiều: vùng tự lùi, hướng từng tay, tay trái đi nhầm hướng được nhắc riêng, đủ vòng → tổng kết.
- Đây là dữ liệu mô phỏng — **không** chứng minh đàn thật / micro thật / iPad chạy đúng.

## Checklist thử thật (chưa chạy — đánh dấu + ghi thiết bị, ngày)

- [ ] Đàn MIDI thật (Chrome/Edge Windows): hai tay cùng bước — bấm đồng thời → "cùng lúc"; cách ~1 s → qua bước nhưng không "cùng lúc".
- [ ] Đàn MIDI thật: đo độ lệch hai tay thực tế của trẻ để chọn ngưỡng mặc định (hiện 0,25 s); mốc `timeStamp` đàn thật có thể lệch (docs/midi.md).
- [ ] Đàn MIDI thật: giữ phím Đô cuối vòng → vòng sau không tự qua bước đầu; đạp pedal không ảnh hưởng.
- [ ] Đàn MIDI thật: rút cáp giữa chừng → "Mất kết nối"; cắm lại → Tiếp tục đúng bước, không lỗi.
- [ ] Giữ nhịp ♩=60 với đàn MIDI: metronome đều, đúng nhịp / trễ hợp lý khi đánh theo click; gợi ý tăng tốc sau 3 vòng đạt.
- [ ] iPad Safari, micro, tập từng tay phải Đô4–Đô5 và tay trái Đô3–Đô4: nhận đúng quãng tám; nốt "không chắc" không bị tính lỗi.
- [ ] iPad Safari, micro + chế độ hai tay → nút Bắt đầu khoá, có giải thích.
- [ ] iPad Safari, micro: thu hồi quyền micro giữa chừng → "Mất kết nối".
- [ ] iPad bàn phím ảo đa chạm: hai tay cùng bước bằng hai ngón.
- [ ] Đàn MIDI thật, ngược chiều: hai ngón cái đặt Đô3 / Đô4, tách ra – gom lại; giáo viên xác nhận vùng tự lùi Đô2–Đô3 phù hợp với bé.
- [ ] Hiệu ứng âm thanh (MIDI) không che tiếng đàn; với micro không có hiệu ứng.
- [ ] Đàn MIDI thật, Trường độ: nốt tròn / trắng giữ đủ → "Giữ đủ"; nhả sớm → đỏ; đạp pedal rồi thả → không đo; móc kép ♩=50 có đánh kịp không.
- [ ] Nhanh – chậm với trẻ thật: dải tốc độ (Dễ / Chuẩn) có vừa sức không; cá sấu / sét có làm bé sợ hay vui; "thật nhanh" bằng micro iPad.
- [ ] Trẻ thật: lời nhắc dễ hiểu, muốn chơi lại nhiều vòng, điểm dừng sau nhiệm vụ rõ ràng; dark mode + iPad dọc không che nút.

## Giới hạn còn tồn tại

- Micro không chấm hai tay (xem trên). Không nhận biết ngón tay / tư thế / bàn tay thật — số ngón chỉ là hướng dẫn theo mẫu bài.
- Chỉ một bài Đô trưởng; chưa có giọng cô giáo cho màn này. Ngược chiều chưa có chế độ giữ nhịp riêng (Giữ nhịp chỉ cùng chiều).
- Đô bắt đầu chỉ chọn trong Đô2/Đô3 (trái) và Đô4/Đô5 (phải); phụ huynh chưa tự đặt số ngón riêng (chỉ bật / tắt số ngón theo mẫu).
- Bàn phím máy tính (demo) phủ 17 nửa cung từ một nốt Đô → không với hết hai tay.
