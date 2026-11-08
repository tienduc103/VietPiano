# Lối tắt thông minh (Smart Shortcuts)

Mở rộng [Lối tắt cá nhân (Quick Access)](shortcuts.md): app tự đề xuất nội dung nên mở nhanh — tiếp tục học, luyện lại điểm
yếu, ôn tập, bài luyện vừa sức, trò chơi đúng kỹ năng đang học, nội dung hay dùng — tính bằng **quy tắc trên máy** từ dữ liệu học
tập đã lưu của **từng hồ sơ**. Không cần AI, không gửi gì ra mạng.

Trạng thái (07/11/2026): P5–P7 xong phần tự động — 70 unit test (`src/core/shortcuts/smart`, `smartShortcutStore`) + 8 e2e
(`e2e/smart-shortcuts.spec.ts`); toàn bộ e2e 157/157 qua trên Chromium viewport iPad. P8 (AI cục bộ) mới có điểm mở rộng, chưa nối
Ollama. Chưa thử trên iPad thật / đàn MIDI thật.

## Nguyên tắc (đặc tả mục 1, 3)

- **Hai lớp tách hẳn.** Lối tắt thủ công lưu bền vững ở `vietpiano.shortcuts.v1:<hồ sơ>` (Quick Access). Đề xuất thông minh
  KHÔNG lưu như lối tắt: danh sách tính lại được bất cứ lúc nào; chỉ lưu cài đặt, đề xuất đã ẩn và cache thứ tự ở khoá riêng
  `vietpiano.smart-shortcuts.v1:<hồ sơ>`.
- **Dùng chung registry + điều hướng.** Đề xuất mang đúng kiểu đích `ShortcutTarget`; tên / biểu tượng / còn tồn tại lấy từ
  `resolveTarget`, khoá chống trùng là `targetKey`, mở bằng `openTarget` — không có router hay hệ thống điều hướng thứ hai.
- **Không bao giờ đụng lối tắt thủ công.** Engine chỉ ĐỌC tập `targetKey` của chúng để bỏ đề xuất trùng; không tạo / sửa / xoá /
  đổi thứ tự. "📌 Ghim" mở hộp thoại ghim thường của Quick Access (người dùng xác nhận, tên + biểu tượng mặc định của đích, sửa được).
- **Thứ tự trên thanh:** lối tắt thủ công (đúng thứ tự người dùng đặt) → MỘT đề xuất ưu tiên cao nhất nếu còn chỗ (tối đa 3 nút)
  → menu ⋯ (nhóm "✨ Gợi ý": lý do dưới tên, Mở, 📌 Ghim, Ẩn). Có 3 lối tắt thủ công → đề xuất chỉ ở menu.

## Kiến trúc

| File | Vai trò |
| --- | --- |
| `src/core/shortcuts/smart/types.ts` | Loại đề xuất, `SmartCandidate` (candidateKey, profileId, target, type, reason, evidence, score, calculatedAt, expiresAt, status), điểm cơ sở |
| `smart/context.ts` | `SmartInput` (dữ liệu đã nạp của MỘT hồ sơ — engine không đọc bộ nhớ, không đọc đồng hồ) + hàm phụ |
| `smart/learning.ts` | Tiếp tục học (buổi đang dở, bài Thư viện dừng giữa chừng, buổi tiếp theo) + ôn tập định kỳ |
| `smart/weakness.ts` | Luyện lại điểm yếu (chỉ khi đủ dữ liệu — ngưỡng ở `WEAKNESS_RULES`) |
| `smart/play.ts` | Bài luyện vừa sức (dùng lại `profile/recommend.ts`), trò chơi phù hợp, nội dung thường chơi |
| `smart/skills.ts` | Kỹ năng ↔ trò chơi (metadata theo cơ chế thật của từng trò) + kỹ năng của buổi (suy từ bài tập / hình minh hoạ) |
| `smart/usage.ts` | Gom số lần dùng từ kho kết quả SẴN CÓ (không thêm theo dõi mới) |
| `smart/engine.ts` | Quy tắc → lọc → xếp hạng → giới hạn |
| `smart/stability.ts` | Chữ ký dữ liệu, giữ vị trí ổn định |
| `smart/settings.ts` | Cài đặt + đề xuất đã ẩn + cache theo hồ sơ (localStorage, làm sạch dữ liệu hỏng) |
| `smart/ai.ts` | Điểm mở rộng AI cục bộ (P8): kiểu request / adapter, kiểm tra câu trả lời, quá giờ → quy tắc |
| `src/store/smartShortcutStore.ts` | `useSmartShortcuts`: trạng thái hồ sơ đang chọn, danh sách đang hiện, ẩn / mở / cài đặt |
| `src/hooks/useSmartShortcuts.ts` | Gom dữ liệu đúng hồ sơ (chờ tiến độ giáo trình + lịch sử phiên + quỹ giờ chơi + lối tắt thủ công nạp xong) |
| `src/components/shortcuts/SmartShortcutBar.tsx` | Bọc `ShortcutBar` của Quick Access: `suggestions`, `suggestionsEnabled` (bật → nút ⋯ có ngay từ khung đầu, không đổi "+ Lối tắt" → ⋯ khi đề xuất nạp xong), `maxSuggestionsOnBar`, Ẩn / ghi lần mở |
| `src/components/shortcuts/SmartShortcutSettings.tsx` | Cài đặt → Lối tắt → Lối tắt thông minh (prop `extra` của `ShortcutManager`) |

Thêm vào `appStore`: cờ `progressLoaded` (đã đọc xong lịch sử phiên) — đề xuất chỉ tính sau cờ này để danh sách không đổi ngay sau khi mở app.

## Loại đề xuất, dữ liệu và ngưỡng

Điểm cơ sở thang 0–100 theo đặc tả mục 4 — **chỉ để thử thứ tự, không phải đánh giá năng lực**. Điểm cộng trong nhóm (độ mới,
mức nghiêm trọng) luôn nhỏ hơn khoảng cách tới nhóm trên. Hoà điểm → thứ tự loại → `candidateKey` (ổn định, không phụ thuộc ngôn ngữ máy).

| Loại (công tắc) | Điểm | Nguồn dữ liệu | Khi nào đề xuất | Đích |
| --- | --- | --- | --- | --- |
| Tiếp tục học — buổi đang dở | 100 (cái thứ hai 97) | `LessonRecord` (3 giáo trình) | Trạng thái 'in-progress' + đủ buổi tiên quyết; gần nhất trước, tối đa 2 | Buổi học |
| Tiếp tục học — bài Thư viện dừng giữa chừng | như trên | `PracticeSession` | Phiên mới nhất của bài: chưa hết bài, ≥ 3 nốt, ≤ 14 ngày, không tập riêng một tay | Màn Luyện tập (kèm đoạn ô nếu có) |
| Luyện điểm yếu | 85–94 | xem bảng dưới | Chỉ khi đủ dữ liệu, tối đa 2 | Bóng bay "Tìm nốt" / bài Thư viện / Flappy Note / 5 ngón |
| Ôn tập | 75–84 | `LessonRecord`, `PracticeSession` | Bài đã đạt quá hạn ôn; tối đa 1 | Buổi học / bài Thư viện |
| Tiếp tục học — buổi tiếp theo | 70–72 | `levelProgress` (như "Buổi tiếp theo" ở trang chủ) | Buổi đầu tiên chưa đạt của cấp đang học, đủ tiên quyết; không có lịch sử → "Bắt đầu — Buổi 1" | Buổi học |
| Bài luyện phù hợp | 70 | `assessLearner` + `recommendLessons` (hồ sơ) | Có hồ sơ; độ khó ≤ mức vừa sức + 1; tối đa 1 | Màn Luyện tập |
| Trò chơi phù hợp | 60–69 | Kỹ năng buổi đang học ∩ kỹ năng trò | Còn giờ chơi; tối đa 1 | Trò có màn riêng / 5 ngón / trò tự do (mức dễ nhất) |
| Nội dung thường chơi | 50–59 | Kho kết quả trò chơi + phiên Luyện tập | ≥ 3 lần dùng; tối đa 1 | Trò / bài đó |

Điểm yếu — ngưỡng "đủ dữ liệu" (`WEAKNESS_RULES`):

| Điểm yếu | Dữ liệu | Ngưỡng |
| --- | --- | --- |
| Nốt hay sai (màn Luyện tập) | `noteTallies` 20 phiên gần nhất (như "Nốt hay sai" của đánh giá hồ sơ) | ≥ 20 lượt nốt tổng; nốt đó ≥ 6 lượt, ≥ 3 lần sai, tỉ lệ sai ≥ 25% |
| Nốt hay nhầm / lỡ ở bài tập giáo trình | `LessonRecord.mistakes` (`note:F4>G4`, `miss:F4`) của buổi luyện ≤ 30 ngày | ≥ 5 lần cùng một nốt |
| Bài Thư viện độ chính xác thấp | Phiên cả bài (không tính tập riêng tay / đoạn) ≤ 30 ngày | ≥ 2 phiên, ≥ 30 nốt, đúng < 70% |
| Đọc nốt chậm | `reading` 10 phiên gần nhất có đo | Có hồ sơ (mục tiêu theo tuổi); ≥ 20 nốt có đo; ≥ 1,5 × mục tiêu |
| 5 ngón · 8 nốt | `FiveFingerStats.hands` | ≥ 40 nốt của tay đó, đúng < 75% |

Lý do hiển thị dựng từ đúng số liệu đó (vd "Fa4 sai 6/14 lần (43%) ở 2 lần tập gần đây · hay nhầm thành Sol4", "Đạt 85 điểm ·
10 ngày chưa luyện", "Đã chơi 5 ván trong 30 ngày"); thiếu dữ liệu thì KHÔNG có đề xuất loại đó (không đoán, không tạo số liệu).

## Lọc (đặc tả mục 3, 4)

Theo thứ tự: tắt loại → đích không còn (`resolveTarget` null) → đích khoá (`targetStatus` khác 'ok' — buổi còn tiên quyết chưa đạt,
cấp "sắp có"; trò chơi khi hết quỹ giờ chơi) → trùng lối tắt thủ công (cùng `targetKey`, gồm tham số stage / measures / preset;
không so tên) → đang ẩn → trùng nhau (giữ điểm cao hơn) → tối đa mỗi loại (Tiếp tục 2, Điểm yếu 2, các loại khác 1) và tổng 6.
Đề xuất đã mở trong phiên (trừ "Tiếp tục") bị trừ 30 điểm ở lần tính sau → nhường chỗ đề xuất khác.

## Chống thay đổi liên tục (đặc tả mục 6)

- Chỉ tính lại ở thời điểm an toàn: thanh lối tắt trang chủ hiện ra (mở trang chủ / quay về trang chủ), đổi hồ sơ, người dùng ghim /
  ẩn / đổi cài đặt / đổi lối tắt thủ công. Không có đồng hồ tự làm mới, không tính trong màn luyện / trò chơi, không theo nốt MIDI.
- Trong lúc thanh đang hiện: ghim / ẩn chỉ GỠ đề xuất đó, các đề xuất còn lại giữ nguyên chỗ, đề xuất thay thế xếp sau cùng.
- Lúc mở trang chủ: nút ⋯ có ngay từ khung đầu khi Lối tắt thông minh bật; đề xuất nạp xong chỉ THÊM một chip bên trái ⋯ (thanh căn
  phải → không nút nào xê dịch), không có cảnh "+ Lối tắt" biến thành ⋯ dưới tay người dùng (e2e theo dõi DOM từ khung đầu).
- Mở lại app với dữ liệu không đổi (cùng chữ ký) và cache chưa hết hạn → giữ đúng thứ tự lần trước. Cache hết hạn sau 6 giờ hoặc lúc
  nửa đêm (hạn ôn tập tính theo ngày).
- Học xong buổi đang dở → khi quay về trang chủ (điều hướng an toàn) đề xuất chuyển sang buổi tiếp theo.
- Chữ ký gồm: tiến độ (số bài, lượt làm, số buổi đạt, lần luyện gần nhất…), số phiên, số ván, ngày lịch, còn / hết giờ chơi, hồ sơ.

## Cài đặt (Cài đặt → Lối tắt → Lối tắt thông minh)

Riêng từng hồ sơ. Mặc định bật hết. Bật / tắt: Lối tắt thông minh (tắt → thanh y như khi chưa có tính năng, lối tắt thủ công không
đổi), Hiện gợi ý trên thanh hồ sơ, Tiếp tục học, Luyện điểm yếu, Bài luyện phù hợp, Trò chơi, Ôn tập, Nội dung thường chơi.
"Cho phép AI cục bộ cải thiện gợi ý" hiện là "Chưa có trong bản này" (không phải công tắc giả). Có đề xuất đang ẩn → nút "Hiện lại".

## Quyết định chờ duyệt

- **S1 — Đề xuất chặt hơn lối tắt thủ công:** buổi còn buổi tiên quyết chưa đạt ('suggest-later') KHÔNG BAO GIỜ được đề xuất, kể cả
  khi đang làm dở — dù giáo trình chỉ gợi ý thứ tự và lối tắt thủ công vẫn mở được (đặc tả: không đề xuất vượt điều kiện mở khoá).
- **S2 — Điểm theo đặc tả:** "Ôn tập đến hạn" (75) đứng trên "Bài tiếp theo" (70) → khi có bài quá hạn ôn, chip trên thanh có thể là
  "Ôn lại…" thay vì "Bài mới…". Khoảng ôn 7 → 14 → 30 → 60 ngày theo số lần luyện, điểm < 80 ôn sớm gấp đôi, ≥ 95 giãn gấp đôi;
  chỉ ôn bài của cấp đang học và cấp ngay dưới (bài Thư viện: chỉ bài chưa đạt ≥ 90% nốt đúng).
- **S3 — Thêm loại "Bài luyện phù hợp"** có công tắc riêng (mục 5 của đặc tả không liệt kê; mục 2.3 có).
- **S4 — Luyện một nốt yếu = Bóng bay kiểu "Tìm nốt"** (bóng hiện hình nốt trên khuông, mức Dễ — cùng cấu hình nút "Tìm nốt" của bài
  "Làm quen từng nốt"); La / Si dùng chế độ 7 nốt, nốt khoá Fa dùng tay trái + khoá Fa. Nốt đen (Bóng bay chỉ có phím trắng) hoặc hết
  giờ chơi → bài Thư viện vừa sức có nốt đó nhiều nhất.
- **S5 — Kỹ năng trò chơi theo cơ chế thật, khác ví dụ trong đặc tả:** "Thu hoạch cà chua" không tính giờ ("không phạt khi suy nghĩ
  lâu") nên gắn "đọc nốt trên khuông", KHÔNG gắn phản xạ / đọc nhanh; "đọc nhanh" → Flappy Note, F1, Đua đọc nốt. App không có trò
  "Xếp nốt nhạc"; tiết tấu → Giữ nhịp tim (trò tự do) / Săn nốt.
- **S6 — "Ẩn" = 7 ngày, theo nội dung** (khoá đích), không theo loại: ẩn "Tiếp tục — Buổi 2" thì Buổi 2 cũng không hiện dưới dạng
  "Ôn lại" trong 7 ngày.
- **S7 — "Thường chơi" chỉ dùng kho kết quả sẵn có** (ván đã chơi xong, phiên luyện) — không thêm theo dõi lượt mở trang.
- **S8 — Trẻ em vẫn thấy Ghim / Ẩn** trong nhóm Gợi ý (không phá dữ liệu); cài đặt ở Cài đặt.

## Giới hạn của dữ liệu đề xuất

- **Ngón tay:** micro / đàn MIDI không biết người học dùng ngón nào (5 ngón chỉ lưu ngón ĐƯỢC HƯỚNG DẪN) → không có đề xuất "sai ngón".
- **Phản ứng chậm từng nốt:** chỉ có tốc độ đọc trung bình (màn Luyện tập) và thời gian phản ứng theo tay (5 ngón), không theo từng nốt.
- **Lỗi bài tập giáo trình** chỉ có số lần nhầm / lỡ, không có số lượt đúng (không tính được tỉ lệ) → lý do chỉ nói số lần.
- **Thời điểm:** Flappy Note, Bóng bay, trò tự do, trò sau buổi chỉ lưu tổng số ván (không có ngày) → "Đã chơi N ván" là tổng từ trước tới
  nay; Cà chua, F1, Săn nốt, 5 ngón, phiên Luyện tập có ngày → đếm trong 30 ngày.
- **Hồ sơ khách** (chưa tạo hồ sơ): không có gợi ý cần tuổi / trình độ (đọc nốt chậm, bài luyện vừa sức); Cà chua / F1 không lưu thành tích khách.
- **Phiên Luyện tập cũ** (trước khi có hồ sơ) tính cho hồ sơ tạo sớm nhất (`sessionsForProfile`, như đánh giá hồ sơ).
- **AI Piano Coach** chưa là nguồn dữ liệu (kho IndexedDB riêng, đọc bất đồng bộ) — có thể thêm sau.
- **Kỹ năng trò chơi** là metadata soạn tay theo cơ chế trò (`skills.ts`), có test ràng buộc; thêm trò mới phải khai báo kỹ năng.
- Không đồng bộ giữa các máy (app không có backend).

## AI cục bộ (P8 — sẵn sàng tích hợp, chưa bật)

Đã có (`smart/ai.ts`, có test): `SmartAiRequest` (chỉ số liệu tóm tắt của các đề xuất đã lọc + nhóm tuổi — không tên, không âm thanh,
không log MIDI), `SmartAiAdapter.rank()`, `applyAiRanking` (chỉ sắp xếp lại khoá đã có; khoá lạ bị bỏ; lý do mới phải bám số liệu —
mọi con số phải có trong lý do gốc, không link / HTML, ≤ 140 ký tự), `rankWithAi` (quá giờ 4 s / lỗi / trả rác → giữ thứ tự quy tắc).
AI không nhận và không trả đích nào → không thể mở khoá bài, không thể đụng lối tắt thủ công.

Còn thiếu để bật: adapter Ollama (dùng `feedback/OllamaClient` + JSON schema), công tắc thật trong cài đặt (chỉ khi `aiCoachEnabled`),
gọi SAU khi đã hiện danh sách theo quy tắc rồi chỉ áp ở lần tính an toàn kế tiếp (không làm nút nhảy chỗ), e2e giả Ollama bằng `page.route`.

## Kiểm thử tự động

Unit (`npx vitest run src/core/shortcuts/smart src/store/smartShortcutStore.test.ts`):

| Đặc tả mục 9 | Test |
| --- | --- |
| 3 lối tắt thủ công → đề xuất không đẩy ra | e2e `smart-shortcuts.spec.ts` (thanh) |
| Đề xuất trùng lối tắt thủ công không hiện lần hai | `engine.test.ts` "không xung đột…", e2e ghim |
| Chuyển hồ sơ không lộ đề xuất hồ sơ cũ | `smartShortcutStore.test.ts`, e2e |
| Xoá lối tắt thủ công không xoá bài / tiến độ | e2e (xoá lối tắt đã ghim từ đề xuất → đề xuất quay lại, tiến độ còn) |
| Tắt Smart Shortcuts không ảnh hưởng lối tắt thủ công | `smartShortcutStore.test.ts`, e2e |
| Đề xuất bài bị khoá bị lọc | `engine.test.ts` "không đề xuất nội dung bị khoá…" |
| Lý do có căn cứ từ dữ liệu | `engine.test.ts`, `weakness.test.ts` (so đúng số liệu trong lý do) |
| Không có lịch sử vẫn gợi ý bài tiếp theo hợp lệ | `engine.test.ts` "không có lịch sử học" |
| Trạng thái ẩn + cấu hình lưu đúng | `settings.test.ts`, `smartShortcutStore.test.ts` |
| Cập nhật tiến độ → làm mới ở thời điểm an toàn | `stability.test.ts`, e2e (học xong buổi → về trang chủ → buổi tiếp theo) |
| PWA iPad không tràn giao diện | e2e viewport iPad ngang + màn hẹp (Chromium) — chưa thử iPad thật |
| Local AI ngắt kết nối → vẫn hoạt động | `ai.test.ts` |

## Checklist thử thủ công (iPad thật / PWA)

- [ ] Hồ sơ mới: thanh hiện "✨ Bắt đầu — Buổi 1…"; nhấn mở đúng buổi 1.
- [ ] Làm dở một buổi rồi về trang chủ: chip "Tiếp tục — Buổi N…" đứng đầu, lý do đúng số bài tập đã đạt.
- [ ] Học xong buổi đó → về trang chủ: chip chuyển sang buổi tiếp theo (không nhảy trong lúc đang xem).
- [ ] Có 3 lối tắt thủ công: thanh chỉ có 3 lối tắt đó (đúng thứ tự) + ⋯; đề xuất nằm trong nhóm "✨ Gợi ý".
- [ ] Ghim một đề xuất: hộp thoại ghim có tên / biểu tượng mặc định của đích; lưu xong đề xuất biến khỏi nhóm Gợi ý, không trùng.
- [ ] Ẩn một đề xuất: biến mất, các đề xuất khác không đổi chỗ; Cài đặt → "Đang ẩn 1 gợi ý" → Hiện lại.
- [ ] Tắt từng loại / tắt hẳn trong Cài đặt: thanh và lối tắt thủ công đúng như mong đợi.
- [ ] Đổi hồ sơ qua lại nhanh: không lúc nào thấy đề xuất của hồ sơ kia.
- [ ] Hết giờ chơi (đồng hồ 🎮 về 0): không còn đề xuất trò chơi.
- [ ] Sau vài buổi đánh sai nhiều một nốt (đàn MIDI / micro thật): có "🎯 Luyện lại nốt …" với số liệu khớp màn kết quả.
- [ ] iPad dọc / màn hẹp: thanh không tràn, không làm hàng hồ sơ cao thêm; chip dài rút gọn "…", giữ tay vào xem đủ tên (title).
- [ ] Kids Mode: chip đọc được, nút ≥ 48 px.
- [ ] Bật AI coach + tắt Ollama: thanh vẫn hiện đề xuất bình thường.
