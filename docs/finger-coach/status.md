# AI Finger Coach & AI Smart Practice — trạng thái, kiểm thử, phần chưa xong

Kiến trúc + quyết định: [architecture.md](architecture.md). Làm ngày 11/11/2026 từ đặc tả người dùng dán vào. **Chưa commit, chưa phát hành.**

## Hướng dẫn dùng nhanh

1. Giáo trình → nút **🎹 Luyện kỹ thuật ngón tay** (hoặc `?screen=technique`, hoặc ghim bằng Lối tắt).
2. **Hôm nay**: tối đa 3 bài (Khởi động · Cải thiện · Ôn tập / Nâng cao), mỗi bài có lý do. Bắt đầu / Đổi bài / Không phù hợp.
   Nút "Tôi thấy mỏi tay" → 12 giờ chỉ đề xuất khởi động nhẹ, không tăng tempo.
3. **Giáo trình**: 5 cấp × 13 nhóm (67 bài). Mở bài → khuông nhạc có số ngón, giải thích kỹ thuật, Nghe mẫu, "Luyện & chấm" (mở AI Piano Coach),
   bài hai tay có Tay phải / Tay trái.
4. Trong **AI Piano Coach** (ghi MIDI + chấm thật): bài kỹ thuật chấm theo trọng số riêng của bài; màn chuẩn bị có **Tempo thích ứng**;
   kết quả có khối **🎯 Luyện đoạn khó** cho MỌI bài (kể cả bài hát): đoạn khó (khi lỗi lặp lại ≥ 2 lượt) → Luyện bài bổ trợ / Nghe mẫu / từng tay;
   chưa đủ dữ liệu → tự chọn đoạn A–B. Bài bổ trợ: Mở rộng đoạn / Luyện lại chậm hơn / Quay lại bài gốc.
5. **Đoạn khó**: đoạn khó của mọi bài đã chơi 30 ngày qua + bài bổ trợ đã tạo (hiệu quả trước / sau).
6. **Tiến bộ**: số bài / buổi / phút, tỉ lệ hoàn thành, kỹ năng + xu hướng + biểu đồ theo ngày, tempo ổn định, đoạn đã khắc phục; lọc thời gian /
   cấp / nhóm / kỹ năng; cài đặt (cờ tính năng, tempo thích ứng, AI sắp xếp); xuất JSON / xoá dữ liệu.

## Báo cáo theo milestone

| Milestone | Đã làm | File chính | Kiểm thử |
| --- | --- | --- | --- |
| M1 Audit & Architecture | Báo cáo tái sử dụng, ánh xạ thực thể, 12 quyết định F1–F12 | `docs/finger-coach/architecture.md` | — |
| M2 Finger Exercise Library | 67 bài (65 tự biên soạn + 2 bài áp dụng Thư viện; cấp 1–5: 8 / 18 / 21 / 12 / 8), 5 cấp, 13 nhóm; 5 ngón, 8 ngón (2–5), chuỗi 8 / 16 / 32 nốt, chuyển ngón (luồn ngón cái, vắt ngón, đổi vị trí, đổi ngón trên cùng phím, phím đen), gam, hợp âm rải, legato / staccato, sắc thái, hai tay; tự suy chỗ chuyển ngón; kiểm tra không ép giãn | `core/technique/{types,build,catalog}.ts`, `components/technique/TechniqueLibrary.tsx` | `catalog.test.ts` (16) |
| M3 MIDI Recorder & Scoring | Dùng nguyên Coach (không thêm bộ ghi / bộ chấm); thêm trọng số theo mục tiêu bài (`scoringWeightsFor`), tra bài chung (`resolveLesson`) | `core/technique/lessons.ts`, `screens/CoachScreen.tsx`, `components/coach/CoachHistory.tsx` | `coach.test.ts`, unit Coach cũ |
| M4 Smart Practice Engine | Phát hiện đoạn khó qua nhiều phiên (sai / thiếu / thừa / chuyển chậm / vội / ngắt quãng / hai tay lệch, nhạy tempo, độ tin cậy), bài bổ trợ 3–5 nhóm (ví dụ Rê–Mi–Fa → … → Đô–Rê–Mi–Fa–Sol), ranh giới an toàn cho bài nhiều bè, A–B thủ công | `core/smartPractice/{passages,remedial}.ts`, `components/coach/SmartPracticePanel.tsx` | `smartPractice.test.ts` (25), e2e |
| M5 Adaptive Practice | Adaptive Tempo (đánh giá nhiều lượt, tempo ổn định đã xác minh, tăng / giữ / giảm, mỏi → không tăng), đánh giá hiệu quả bổ trợ (mở rộng đoạn / chậm lại / quay về) | `core/smartPractice/{tempo,outcome}.ts` | unit + e2e |
| M6 AI Finger Coach | Hồ sơ kỹ năng (8 kỹ năng đo được, xu hướng 7 / 30 ngày, độ tin cậy), đề xuất 3 bài hôm nay theo luật, AI cục bộ chỉ sắp xếp / diễn đạt có xác minh, fallback luật, phản hồi Đổi bài / Không phù hợp, nhận xét sau bài = AI Coach có sẵn | `core/technique/{skills,recommend,aiRank}.ts`, `screens/TechniqueScreen.tsx` | `coach.test.ts` (19) |
| M7 Shared Smart Practice | Một service dùng chung (`SmartPracticeService`: analyzePerformance, detectDifficultPassages, createRemedialExercise, extendRemedial, getAdaptiveTempo, getPracticeRecommendations, savePracticeResult, getSkillProgress, evaluateRemedialOutcome); chạy cho mọi bài trong Coach — đã thử trên Happy Birthday hai tay | `core/smartPractice/service.ts`, `hooks/useSmartPractice.ts` | e2e `technique.spec.ts` |
| M8 Dashboard & Optimization | Dashboard + lọc + xuất / xoá; tài liệu | `core/technique/dashboard.ts`, `components/technique/ProgressTab.tsx` | unit |

## Kết quả kiểm thử (11/11/2026, Chromium — KHÔNG phải iPad / đàn thật)

- `npm test`: 124 file, 2285 test qua (gồm 60 test mới của `core/technique` + `core/smartPractice`).
- `npm run build`: qua (typecheck + build + service worker).
- e2e `e2e/technique.spec.ts`: 2/2 qua — (1) màn Luyện kỹ thuật: lối vào, bài hôm nay theo luật, Đổi bài, giáo trình + khuông có số ngón + nghe mẫu,
  mở Coach đúng bài + tempo, tempo thích ứng không đè tempo đã chọn, không có lỗi giả khi chưa có dữ liệu; (2) Happy Birthday hai tay qua đàn MIDI giả:
  1 lượt sai → chỉ cho tự chọn đoạn; 2 lượt sai cùng chỗ → đoạn khó "D5 … 2/2 lượt" → bài bổ trợ `rem:song-happy-birthday-beginner:…` (≥ 3 nốt, có Rê5,
  ♩=50 = 70%) → ghi + chấm bài bổ trợ → đánh giá → Quay lại bài gốc → màn Đoạn khó thấy cùng đoạn + bài bổ trợ.
- e2e toàn bộ: xem mục "Lần chạy toàn bộ" cuối file.

## Tiêu chí nghiệm thu (đặc tả §33)

| # | Tiêu chí | Trạng thái |
| --- | --- | --- |
| 1 | Vào được nhóm Luyện kỹ thuật ngón tay | ✅ (Giáo trình, `?screen=technique`, Lối tắt) — e2e |
| 2 | Bài 5 ngón và 8 ngón thực tế | ✅ unit kiểm mẫu ngón (8 ngón không dùng ngón cái) |
| 3 | Bài chạy 8 nốt và chuyển ngón | ✅ |
| 4 | Khuông nhạc, phím đàn, ngón gợi ý | ✅ khuông + số ngón (giáo trình + Coach), bàn phím ảo của Coach |
| 5 | Chơi được bằng MIDI | ✅ trên Web MIDI giả (e2e). ⏳ chưa thử đàn thật |
| 6 | Dữ liệu luyện tập được ghi nhận | ✅ log MIDI gốc + kết quả trong kho Coach |
| 7 | Chấm theo mục tiêu bài | ✅ trọng số riêng (`scoringConfig.weights`) |
| 8 | Hồ sơ tiến bộ theo người học | ✅ theo hồ sơ (`profileKey`) |
| 9 | Phát hiện đoạn khó từ dữ liệu test | ✅ unit (MIDI tổng hợp) + e2e |
| 10 | Tạo và chơi được bài bổ trợ | ✅ e2e |
| 11 | Adaptive Tempo | ✅ |
| 12 | AI đề xuất bài hôm nay | ✅ tầng luật; tầng AI cục bộ có test với provider giả, ⏳ chưa thử với Ollama thật |
| 13 | AI giải thích lý do | ✅ lý do kèm số liệu / mã bằng chứng; AI chỉ diễn đạt lại, có xác minh |
| 14 | Smart Practice trong ít nhất một bài hát | ✅ Happy Birthday hai tay (e2e) — mọi bài trong Coach |
| 15 | Tắt AI vẫn luyện + đề xuất theo luật | ✅ (mặc định AI tắt; e2e chạy ở trạng thái này) |
| 16 | Kiểm thử quan trọng qua | ✅ unit + build + e2e liên quan |
| 17 | Chức năng cũ vẫn hoạt động | ✅ unit toàn bộ; e2e toàn bộ — xem cuối file |
| 18 | Tài liệu, báo cáo test, phần chưa xong | ✅ file này + architecture.md |

## Phần chưa làm / giới hạn đã biết

- **Chưa thử trên đàn MIDI thật / iPad thật.** iPad Safari không có Web MIDI → chỉ micro (một nốt mỗi lúc: bài hai tay cùng lúc chỉ chấm giai điệu,
  không trường độ / lực gõ) hoặc qua app native (chưa build).
- Nút "Luyện đoạn khó" nằm ở kết quả AI Piano Coach (màn luyện bài hát có chấm MIDI đầy đủ), CHƯA thêm vào màn Luyện tập (Chờ nốt / Theo nhịp /
  Biểu diễn) — màn đó đang có thay đổi chưa commit của phiên Nhật ký Biểu diễn; màn Luyện tập lưu phiên kiểu khác (không có log từng nốt) nên muốn
  dùng chung phải chuyển kết quả của nó sang dạng `ScoringResult` (việc tiếp theo nếu cần).
- Đoạn khó chỉ tính trên lượt chơi CẢ BÀI (F5); lượt luyện đoạn ô / một tay vẫn được tính nếu cùng bản tham chiếu (một tay: cùng id nốt).
- A–B theo nốt = bài bổ trợ (tự chọn nhóm nốt); A–B theo ô = chọn ô sẵn có của Coach. Chưa chọn A–B bằng cách chạm trực tiếp lên khuông.
- Legato / staccato chỉ xấp xỉ bằng thời gian giữ phím (F7). Không đo ngón thực tế, tư thế, lực cơ (F8).
- Chưa có giọng cô giáo cho màn này; "người giám hộ chấp thuận" chưa có (app không có tài khoản / phân quyền) — thay đổi kế hoạch luôn chờ người học bấm.
- Cấp kỹ thuật không đổi cấp giáo trình chính thức (F10). Lối vào ở Giáo trình vẫn hiện khi tắt cờ (để bật lại được); khi tắt: ẩn panel đoạn khó,
  nhóm bài kỹ thuật trong Coach, gợi ý tempo.

## Checklist thử thật (chưa chạy)

- [ ] Đàn MIDI (Chrome/Edge Windows): luyện `tech-l3-run8-updown-rh` 3 lượt, cố ý chậm ở Mi → Fa → thấy đoạn khó "Mi – Fa", độ trễ hợp lý.
- [ ] Đàn MIDI: bài hai tay cùng lúc (`tech-l2-5f-mirror`) — lệch tay rõ → đoạn "hai tay chưa cùng lúc", nút Tay phải / Tay trái.
- [ ] Đàn MIDI có velocity: `tech-l4-contrast-rh` chấm được tương phản p / f; bàn phím ảo → "không đo".
- [ ] Adaptive Tempo: 2 lượt đạt → đề xuất +5; 2 lượt trượt → về tempo ổn định.
- [ ] AI cục bộ (Ollama thật): tab Hôm nay hiện "AI cục bộ diễn đạt", không có số liệu lạ; tắt Ollama giữa chừng → về theo luật, không treo.
- [ ] Đổi hồ sơ → bài hôm nay / đoạn khó / tiến bộ riêng từng người.
- [ ] iPad Safari (micro): mở bài kỹ thuật một tay trong Coach → chấm nốt + nhịp, trường độ / lực đánh "không đo".
- [ ] Dark mode + iPad dọc: tab, thẻ bài, khối Luyện đoạn khó không tràn.

## Lần chạy toàn bộ

11/11/2026: toàn bộ e2e **166/166 qua** (14,7 phút, Chromium, chạy ở cổng 4199 vì 4173 đang bị chiếm) — gồm 2 spec mới `e2e/technique.spec.ts` và mọi spec cũ (Coach, giáo trình, bài hát, lối tắt…).
