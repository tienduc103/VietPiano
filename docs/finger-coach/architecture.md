# AI Finger Coach & AI Smart Practice — kiến trúc

Đặc tả người dùng dán ngày 11/11/2026 ("VIETPIANO – ĐẶC TẢ TỔNG HỢP: AI Finger Coach & AI Smart Practice", 8 milestone).
Theo quy ước của dự án, chỗ đặc tả lệch quy tắc cũ thì **quy tắc cũ được ưu tiên** và ghi ở mục Quyết định để người dùng duyệt.

- Mã nguồn: `src/core/technique/` (thư viện bài kỹ thuật, kỹ năng, đề xuất), `src/core/smartPractice/` (mô-đun DÙNG CHUNG: đoạn khó,
  bài bổ trợ, Adaptive Tempo, đánh giá bổ trợ, API), `src/screens/TechniqueScreen.tsx` (route `technique`, `?screen=technique`),
  `src/components/technique/`, panel "Luyện đoạn khó" trong kết quả Coach (`components/coach/SmartPracticePanel.tsx`).
- Trạng thái / kiểm thử / phần chưa xong: [status.md](status.md).

## 1. Audit (Milestone 1) — tái sử dụng gì

| Đặc tả | Đã có | Quyết định |
| --- | --- | --- |
| C. MIDI Performance Recorder (Note On/Off, velocity, kênh, pedal, đồng hồ đơn điệu, tạm dừng, mất kết nối, Note On vel 0, nốt lặp, đồng thời) | `core/coach/recorder` (`PerformanceRecorder`, `buildPerformance`, lưu nháp 3 s, khôi phục phiên dở) trên `midiInput` Universal MIDI | **Dùng nguyên**. Không thêm bộ ghi thứ hai |
| D. Performance Scoring Engine (nốt, thời điểm, nhịp đều, trường độ, lực đánh, hai tay; schema + phiên bản + bộ test) | `core/coach/scoring` (`scorePerformance`, DTW, 5 tiêu chí, `SCORING_ENGINE_VERSION`, `weights` tuỳ bài, `hands.syncRate`) | **Dùng nguyên**; mỗi bài kỹ thuật truyền trọng số riêng (`scoringConfig.weights`) |
| G. AI Local Coach (nhận xét có bằng chứng, không sửa điểm, fallback) | `core/coach/ai` (payload tóm tắt, Ollama JSON schema, `verify`, `ruleBasedFeedback`) | **Dùng nguyên** cho nhận xét sau bài. Đề xuất hôm nay: AI chỉ sắp xếp + viết lý do trong danh sách hợp lệ (`technique/aiRank.ts`), xác minh, lỗi → luật |
| Giao diện luyện (khuông, phím ảo, metronome, BPM, chọn tay, đoạn ô, nghe mẫu, kết quả, lịch sử) | Màn Coach (`CoachSetup` / `CoachRecording` / `CoachResults` / `CoachHistory`) | **Bài kỹ thuật chạy trong Coach** (tra bài qua `technique/lessons.ts` thay vì chỉ `LESSONS`) |
| Luyện 5 ngón Wait Mode | `fiveFinger/` (chuỗi ngẫu nhiên theo seed, thống kê riêng) | Giữ nguyên, có lối vào từ màn Luyện kỹ thuật; không gộp dữ liệu |
| Lặp A–B, luyện đoạn | `sliceLesson`, Coach `measures`, `PracticePlan` 7 bước | A–B theo ô = có sẵn; A–B theo NỐT = bài bổ trợ (`smartPractice/remedial.ts`) |
| Hồ sơ người học | `profile/LearnerProfile` + `profileStore` | Mọi dữ liệu mới theo `profileKey` (không tạo hệ người dùng mới) |
| Tiến độ / lịch sử | Kho `vietpiano-coach` (phiên, log, kết quả, nhận xét, kế hoạch) | **Không tạo kho tiến độ thứ hai**: hồ sơ kỹ năng, đoạn khó, tempo ổn định đều SUY từ kết quả Coach lúc cần |
| Ký hiệu bài | `Lesson` + ký hiệu gọn "C4:1 D4/h:2", `accompaniment`, `dynamics`, rest "R" | Bài kỹ thuật là `Lesson` → khuông, số ngón, phát mẫu, chấm dùng lại hết |

Không có: backend, MusicXML, ký hiệu legato / staccato trong dữ liệu, camera / cảm biến ngón.

## 2. Ánh xạ thực thể đặc tả → dữ liệu

| Đặc tả §27 | Thực hiện |
| --- | --- |
| FingerExercise | `technique/types.ts` `FingerExercise` (id, title, level, group, targetSkills, `lesson` = notes + rhythm + expectedFingering, handMode, tempoRange, estimatedMinutes, prerequisites, scoringConfig, transitionNotes) |
| PracticeSession / PracticeEvent | `coach` `PerformanceSession` / `PerformanceEvent` (đã có) |
| PracticeResult | `coach` `ScoringResult` (đã có, có `engineVersion`) |
| DifficultPassage | `smartPractice/types.ts` — TÍNH lại từ kết quả (không lưu → không lệch dữ liệu) |
| RemedialExercise | `smartPractice/types.ts`, lưu localStorage theo hồ sơ (`smartPractice/store.ts`) để kết quả Coach trỏ được về bài gốc |
| SkillProgress | `technique/skills.ts` — tính từ kết quả |
| AIRecommendation | `technique/recommend.ts` (+ phản hồi Đổi bài / Không phù hợp / Bắt đầu lưu ở `smartPractice/store.ts`) |
| AIAnalysis | `coach` `AIFeedback` (đã có) |

## 3. Quyết định (cần người dùng duyệt)

| # | Quyết định | Lý do |
| --- | --- | --- |
| F1 | Không viết Recorder / Scoring / AI mới; bài kỹ thuật + bài bổ trợ chạy trong màn Coach | Đặc tả §2 "tận dụng tối đa", "không tạo hệ thống trùng lặp" |
| F2 | Chỉ đàn MIDI / bàn phím ảo chấm đủ; micro theo quy tắc cũ (nốt đơn, không trường độ, bài hai tay cùng lúc chỉ chấm giai điệu) | CLAUDE.md: một nốt mỗi lúc |
| F3 | Không lưu đoạn khó / hồ sơ kỹ năng — suy ra từ kết quả Coach mỗi lần cần. Chỉ lưu bài bổ trợ đã tạo + phản hồi đề xuất + báo mỏi + cờ tính năng (localStorage `vietpiano.smart-practice.v1:<hồ sơ>`, có giới hạn số mục) | Không tạo tiến độ trùng; "migration" = phiên bản trong khoá + `sanitize` |
| F4 | Đoạn khó chỉ hiện khi có lỗi ở ≥ 2 phiên khác nhau (độ tin cậy "trung bình" trở lên); 1 phiên → không kết luận | §13 "tránh nhận xét chắc chắn từ một lỗi đơn lẻ" |
| F5 | Đoạn khó tính trên kết quả chấm CẢ BÀI (`referenceId` = id bài); kết quả luyện đoạn ô / bài bổ trợ không gộp ngược (chỉ số nốt khác) — dùng để đánh giá hiệu quả bổ trợ | Đơn giản, đúng chỉ số nốt |
| F6 | Bài bổ trợ cắt theo NHÓM nốt (cùng phách), ranh giới chỉ đặt ở chỗ MỌI bè cùng bắt đầu (không cắt ngang nốt đang ngân của tay kia); không tìm được trong 2 ô → cắt theo ô (`sliceLesson`). Bỏ ký hiệu pedal trong bài bổ trợ ngắn | §14 "không tách nốt tùy tiện" |
| F7 | Legato / staccato: dữ liệu bài không có ký hiệu → bài Legato dùng nốt đen giữ đủ, Staccato dùng móc đơn + lặng móc đơn; chấm bằng tiêu chí Trường độ (Note Off) — chỉ là xấp xỉ đo được, ghi rõ trên bài | Không suy đoán (D10 của Coach) |
| F8 | Không chấm / không kết luận ngón thực tế, tư thế, lực cơ, căng cơ; số ngón chỉ là gợi ý | §28 |
| F9 | Mở khoá chỉ gợi ý (như giáo trình): bài chưa đủ tiên quyết vẫn mở được bằng tay, nhưng đề xuất KHÔNG chọn bài chưa đủ tiên quyết | Quyết định sản phẩm cũ + §20 |
| F10 | Cấp độ kỹ thuật 1–5 riêng, KHÔNG đổi cấp giáo trình chính thức | §5 |
| F11 | Cờ tính năng `enabled` (mặc định BẬT, tab Tiến bộ → Cài đặt & dữ liệu); tắt → ẩn panel đoạn khó, nhóm bài kỹ thuật trong Coach, gợi ý tempo; màn Luyện kỹ thuật chỉ còn nút "Bật lại"; dữ liệu giữ nguyên. Rollback = tắt cờ / gỡ thư mục mới (không đổi DB cũ, không migration IndexedDB) | §2 |
| F12 | Báo mỏi: 12 giờ sau đó đề xuất chỉ còn bài khởi động nhẹ, không tăng tempo, nhắc nghỉ | §29 |

## 4. Thuật toán

**Đoạn khó** (`smartPractice/passages.ts`, `detectDifficultPassages`): lấy ≤ 10 kết quả gần nhất cùng `referenceId`; mỗi NHÓM nốt (cùng phách)
tính theo từng phiên: sai (wrong / missing / octave / order), muộn (lệch > dung sai sau khi trừ lệch của nhóm trước = chuyển nốt chậm),
ngắt quãng (`hesitation`), hai tay lệch (`hands-async`), nốt thừa gán về nhóm có thời điểm kỳ vọng gần nhất. Nhóm "khó" khi lỗi ở ≥ 2 phiên và
tỉ lệ ≥ 40%; gộp nhóm liền kề thành đoạn; độ tin cậy: ≥ 3 phiên & ≥ 50% → cao, còn lại trung bình. Gắn thêm `tempoSensitive` khi tỉ lệ lỗi ở
tempo cao hơn rõ rệt (≥ 25 điểm %) so với tempo thấp. Chiến lược: chậm (chuyển nốt chậm / ngắt), từng tay (hai tay lệch), đọc nốt (sai nốt).

**Bài bổ trợ** (`remedial.ts`): quanh chỗ chuyển g−1 → g tạo 3 bậc như ví dụ đặc tả (3 → 4 → 5 nhóm), giữ cao độ, trường độ, thứ tự, tay, số ngón,
sắc thái; id `rem:<nguồn>:<từ>-<tới>`; `source` trỏ về bài gốc. Tempo gợi ý = tempo ổn định của bài bổ trợ, chưa có → 70% tempo đang luyện.

**Adaptive Tempo** (`tempo.ts`): lượt "đạt" = nốt ≥ 90% và nhịp ≥ 75% (hoặc không đo) và tổng ≥ 80. Tempo ổn định đã xác minh = tempo cao nhất có
≥ 2 lượt đạt và lượt gần nhất ở tempo đó không trượt. Hai lượt gần nhất ở tempo đang tập đều đạt → tăng 5 BPM (kẹp `tempoRange`); hai lượt trượt
→ về tempo ổn định (hoặc −10%); còn lại giữ. Báo mỏi → không tăng.

**Hồ sơ kỹ năng** (`technique/skills.ts`): nốt, nhịp, trường độ, sắc thái (giá trị tiêu chí), phối hợp hai tay (`hands.syncRate`), chuyển ngón
(tỉ lệ nốt chuyển ngón đúng + đúng lúc ở bài có `transitionNotes`), độ ổn định (1 − hệ số biến thiên điểm 5 lượt gần nhất cùng bài). Độ thạo = trung bình
có trọng số giảm dần theo thời gian; xu hướng = TB 7 ngày gần nhất − TB 7–30 ngày trước; độ tin cậy theo số lượt. Không so điểm giữa các bài
có trọng số khác nhau — chỉ so giá trị tiêu chí 0..1 cùng định nghĩa.

**Đề xuất hôm nay** (`technique/recommend.ts`): Tầng 1 luật → tối đa 3 ô: Khởi động (bài cấp thấp đã đạt / bài đầu cấp, ngắn), Cải thiện
(bài bổ trợ cho đoạn khó tin cậy nhất, không có → bài nhắm kỹ năng yếu nhất ở cấp hiện tại), Ôn tập / nâng cao (bài đã đạt lâu chưa luyện ≥ 7 ngày,
hoặc bài kế tiếp đủ tiên quyết). Loại: bài "Không phù hợp" trong 14 ngày, bài luyện ≥ 5 lượt hôm nay, bài chưa đủ tiên quyết. Tầng 2 AI (khi bật):
chỉ được sắp xếp lại / viết lý do cho ĐÚNG danh sách ứng viên; id lạ, số liệu lạ → bỏ, dùng luật.
