# AI Piano Coach — backlog & trạng thái

Kiến trúc: [architecture.md](architecture.md) · Checklist thử thật: [acceptance-checklist.md](acceptance-checklist.md)

Trạng thái: **Pending** (chờ phụ thuộc / chưa làm) · **Ready** · **In Progress** · **Implemented** · **Auto-Test Passed** · **Blocked** ·
**Awaiting User Validation** (cần người dùng thử trên thiết bị thật hoặc duyệt) · **Accepted** (người dùng đã nghiệm thu).
"Auto-Test Passed" chỉ nghĩa là unit / e2e trên Chromium đã qua (đàn MIDI giả, Ollama giả) — KHÔNG phải đã thử trên đàn thật hay iPad.
Mọi task có cột "Thiết bị thật = Cần" sẽ chuyển sang Awaiting User Validation → Accepted sau khi chạy checklist.

Cách tiếp tục khi bị gián đoạn: tìm task Ready / In Progress / Pending đầu tiên trong bảng, đọc cột "File" và "Điều kiện xong";
`npx vitest run src/core/coach` (235 test) cho biết phần lõi còn đúng không; `npx playwright test e2e/coach.spec.ts` cho phần giao diện.

## M1 — MIDI Recorder Core (P0)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M1-T1 | Audit MIDI hiện có + mô hình dữ liệu | — | Auto-Test Passed | `core/coach/types.ts` | Đủ thực thể §12 đặc tả | tsc sạch | — |
| M1-T2 | `PerformanceRecorder`: on/off/cc/mark, velocity, kênh, mốc nguồn + mốc nhận, tạm dừng / tiếp / dừng / huỷ / mất kết nối, pedal đạp sẵn | T1 | Auto-Test Passed | `core/coach/recorder/PerformanceRecorder.ts` | Unit test mọi sự kiện + trạng thái | 6 test | Cần |
| M1-T3 | `buildPerformance`: ghép nốt (chồng phím, hợp âm, nhả lệch thứ tự, Off mồ côi, giữ lúc dừng), pedal 64/66/67 + half-pedal, ngân, bỏ khoảng tạm dừng, lệch đồng hồ, rút đàn | T2 | Auto-Test Passed | `core/coach/recorder/buildPerformance.ts` | Unit test các trường hợp đặc biệt | 16 test | Cần (mốc thời gian driver thật) |
| M1-T4 | `CoachStorage` IndexedDB v1 (+ bộ nhớ tạm, migration, phiên dở dang, xoá theo hồ sơ, xuất JSON) | T1 | Auto-Test Passed | `core/coach/storage/CoachStorage.ts` | Test fake-indexeddb | 13 test | — |
| M1-T5 | Glue `useCoachRecorder` (onDetail → CC thô, bỏ phím midiNav, lưu nháp 3 s, tự tạm dừng khi ẩn app, mốc mất / có lại kết nối, metronome + đếm vào) | T2, T4 | Auto-Test Passed | `hooks/useCoachRecorder.ts` | e2e ghi + khôi phục | e2e coach 1–3 | Cần |
| M1-T6 | Round-trip: ghi → lưu → tải → tái dựng đúng chuỗi sự kiện | T3, T4 | Auto-Test Passed | `CoachStorage.test.ts`, `recorder.test.ts` | Unit test | qua | — |
| M1-T7 | Hiệu chuẩn độ trễ đầu vào (MIDI / micro) — hiện `latencyMs` cố định (MIDI 0, micro 60) | T5 | Pending | `core/coach/types.ts` (`latencyMs`) | Bước đo độ trễ ở màn chuẩn bị | — | Cần |

## M2 — Scoring Engine Core (P0)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M2-T1 | `ScoreReference` từ `Lesson` (giai điệu, hoà âm, đệm, tay, ô in, phách trong ô, sắc thái, pedal, cresc./dim., đoạn cắt) | M1-T1 | Auto-Test Passed | `core/coach/reference/fromLesson.ts` | Toàn bộ thư viện dựng được | qua (mọi bài `LESSONS`) | — |
| M2-T2 | Bộ sinh biểu diễn tổng hợp (đường cong tempo, lỗi cài sẵn) | T1 | Auto-Test Passed | `core/coach/testing/synth.ts` | Dùng trong T8 | — | — |
| M2-T3 | Căn chỉnh: cụm onset + DTW nhóm + neo đơn điệu (bỏ chuỗi lặp mơ hồ) + tempo map + khớp nốt QH động theo phím, dự đoán hai phía quanh chỗ ngắt | T1 | Auto-Test Passed | `scoring/align.ts`, `tempoMap.ts` | Tempo đổi, bỏ / thừa nốt, hợp âm rải, nốt lặp, ngắt giữa bài | 17 test | — |
| M2-T4 | Nốt: đúng / sai / thiếu / thừa / lặp / quãng tám / hợp âm / cùng lúc / thứ tự | T3 | Auto-Test Passed | `scoring/analyzeNotes.ts` | Test từng loại lỗi | qua | Cần |
| M2-T5 | Nhịp: sớm / muộn (tempo cục bộ bậc hai bỏ-một-ra), tempo so mục tiêu, ổn định giữa ô, ngắt quãng, đồng bộ hợp âm / hai tay | T3 | Auto-Test Passed | `scoring/analyzeRhythm.ts` | Nhanh dần không báo lệch từng nốt; ngắt → 1 lỗi | qua | Cần |
| M2-T6 | Trường độ: giữ phím / ngân pedal / trường độ ghi (`durationQuality` cũ) | T3 | Auto-Test Passed | `scoring/analyzeDuration.ts` | Ngắn / dài / thả lúc đạp | qua | Cần |
| M2-T7 | Điểm 100: trọng số theo chế độ, chia lại, khấu trừ /100 từng issue, tổng hợp theo ô, độ tin cậy | T4–T6 | Auto-Test Passed | `scoring/ScoringEngine.ts`, `modes.ts` | Tổng = 100 − Σ khấu trừ (±1) | qua | — |
| M2-T8 | Bộ test tham chiếu: lỗi cài sẵn tìm đúng chỗ; đa âm; tempo đổi; cả thư viện bài chơi đúng không báo lỗi giả | T7 | Auto-Test Passed | `scoring/ScoringEngine.test.ts` | — | ~110 test (gồm từng bài thư viện) | — |
| M2-T9 | Nhập MusicXML (tập con: nốt, hợp âm, tay, ô, pedal, sắc thái, legato / staccato / dấu nối) → `ScoreReference` | T1 | Pending | `core/coach/reference/musicXml.ts` | Test file mẫu | — | — |
| M2-T10 | MIDI tham chiếu (SMF) → `ScoreReference` | T1 | Pending | `core/coach/reference/fromMidi.ts` | Test file mẫu | — | — |
| M2-T11 | Nhận biết "chơi lại từ đầu câu" (lặp một đoạn sau khi sai): DTW có bước nhảy lùi → các lượt; mỗi nốt chấm theo lần đầu chơi tới (D12), đoạn chơi lại `replayed` (không tính thừa), mỗi lần chơi lại = issue `restart` (trừ như một chỗ ngắt); con trỏ lúc ghi / phát lại theo lượt | T3 | Auto-Test Passed | `scoring/align.ts`, `analyzeRhythm.ts`, `scoring/restart.test.ts`, `follower.ts`, `e2e/coach-restart.spec.ts` | Đoạn chơi lại không bị tính thừa; bản chơi một mạch (mọi bài thư viện, có lỗi cài sẵn) không bị cắt lượt | 140 unit (gồm mọi bài thư viện) + follower + e2e 1/1 | Cần (chơi lại thật trên đàn: dừng lâu / ngắn, từ đầu câu / đầu bài, hai tay, pedal) |

## M3 — Advanced Performance Analysis (P1)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M3-T1 | Pedal: issue chi tiết (thiếu, sớm / muộn, nhả sớm / muộn, không thay khi đổi hợp âm — gộp một lỗi mỗi chỗ, thừa, liên tục), giá trị = `pedalQuality`, half-pedal ghi nhận, sostenuto / soft ghi nhận | M2-T3 | Auto-Test Passed | `scoring/analyzePedal.ts` | Không có tín hiệu / ký hiệu → null + lý do | qua + e2e MIDI giả | Cần (pedal thật, half-pedal) |
| M3-T2 | Velocity / sắc thái: tương phản p–f (`dynamicsQuality`), cresc./dim., đều lực, cân bằng bè, velocity mục tiêu (tham khảo) | M2-T3 | Auto-Test Passed | `scoring/analyzeDynamics.ts` | Bàn phím ảo → null | qua | Cần |
| M3-T3 | Hai tay: đồng bộ (≤ 80 ms), lệch giữa bè, từng tay, nốt một tay đánh riêng; nốt thừa không gán tay | M2-T3 | Auto-Test Passed | `scoring/analyzeRhythm.ts` | Test tay trái trễ | qua | Cần |
| M3-T4 | Mode B + trọng số tuỳ biến + độ tin cậy + lý do thiếu dữ liệu + tempo hợp lý (20–400 ♩) | M2-T7 | Auto-Test Passed | `scoring/modes.ts`, `ScoringEngine.ts` | Không chấm tiêu chí thiếu tín hiệu | qua | — |

## M4 — Local AI Integration (P1)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M4-T1 | `AiProvider` + `OllamaProvider` (timeout, retry giới hạn, trạng thái, LAN "auto", schema → "json" khi Ollama cũ) | — | Auto-Test Passed | `core/coach/ai/provider.ts` | Test fetch giả | 3 test | Cần (Ollama thật) |
| M4-T2 | Payload tóm tắt + kiểm soát dữ liệu (tên tuỳ chọn, lọc ký tự) | M2-T7 | Auto-Test Passed | `ai/payload.ts` | Không có log thô / tên khi tắt | qua + e2e | — |
| M4-T3 | Prompt + JSON schema | T2 | Auto-Test Passed | `ai/prompt.ts` | — | qua | Cần (chất lượng câu chữ của model) |
| M4-T4 | Kiểm schema + xác minh (mã lỗi, ô — kể cả "Ô" có dấu, số, tên nốt, tempo, lịch sử) | T3 | Auto-Test Passed | `ai/verify.ts` | Câu bịa bị bỏ | qua + e2e | — |
| M4-T5 | Nhận xét theo quy tắc (fallback) | M2-T7 | Auto-Test Passed | `ai/fallback.ts` | Luôn có nhận xét | qua | — |
| M4-T6 | `requestCoachFeedback` (provider → verify → fallback; mất kết nối không thử lại) | T1, T4, T5 | Auto-Test Passed | `ai/teacher.ts` | Lỗi mạng / JSON hỏng / hết giờ | qua | — |
| M4-T7 | Cài đặt Coach (timeout, retry, gửi tên, cửa sổ lịch sử…) | T1 | Auto-Test Passed | `core/coach/settings.ts` | sanitize + test | qua | — |
| M4-T8 | e2e Ollama giả (JSON có cấu trúc, câu bịa bị lọc, không gửi log MIDI) | M5 | Auto-Test Passed | `e2e/coach.spec.ts` | — | qua | — |
| M4-T9 | Mã truy cập proxy AI qua LAN: biến `OLLAMA_PROXY_TOKEN` → proxy `/ollama` chỉ nhận request có header `x-vietpiano-ai-token` đúng (sai → 404); app gửi token (Cài đặt → AI) CHỈ tới proxy cùng origin | — | Awaiting User Validation | `vite.config.ts`, `feedback/OllamaClient.ts`, Cài đặt | Cần người dùng duyệt: đổi cấu hình server LAN dùng chung cả nhà; mặc định giữ nguyên hành vi hiện tại | — | — |
| M4-T10 | Cấu hình AI trong Coach: kiểm tra kết nối + model (tự động từ M5-T8, nút "Kiểm tra lại"), thời gian chờ, số lần thử lại, gửi tên (địa chỉ / model dùng chung Cài đặt → AI) | T7 | Auto-Test Passed | `components/coach/CoachSetup.tsx` (`AiCard`) | e2e kiểm tra kết nối với Ollama giả | e2e | Cần (Ollama thật) |

## M5 — Piano Coach UI (P1)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M5-T1 | Route `coach` (tải lazy) + nút ở trang chủ | — | Auto-Test Passed | `store/appStore.ts`, `App.tsx`, `screens/DashboardScreen.tsx` | `?screen=coach` mở được | e2e | — |
| M5-T2 | Màn chuẩn bị (bài, đoạn, tay, chế độ, nguồn, kết nối, kiểm tra pedal, tempo / metronome / đếm vào, phiên dở dang, tiêu chí chấm được) | M1-T5 | Auto-Test Passed | `components/coach/CoachSetup.tsx`, `core/coach/input.ts` | e2e + unit `resolveInput` | e2e + 3 unit | Cần |
| M5-T3 | Màn đang ghi (khuông + con trỏ bám vị trí, bàn phím, trạng thái, ô hiện tại, tạm dừng / tiếp / kết thúc / huỷ) | T2 | Auto-Test Passed | `components/coach/CoachRecording.tsx`, `core/coach/follower.ts` | e2e | e2e + 2 unit | Cần |
| M5-T4 | Kết quả (tổng, meter tiêu chí, đếm, ô cần chú ý, pedal, nhận xét, gợi ý, kế hoạch, so với lần trước + sparkline, cách tính điểm) | M2, M4 | Auto-Test Passed | `components/coach/CoachResults.tsx`, `CriteriaMeters.tsx`, `CoachFeedbackCard.tsx` | e2e | e2e | — |
| M5-T5 | Khuông tô lỗi + ký hiệu ✓ ⏱ ⌛ ⏸ ✗ ○ + P + chú thích + chạm nốt / ô / nốt thừa → chi tiết | M2 | Auto-Test Passed | `components/coach/CoachScoreView.tsx`, `coach.css` | e2e | e2e + ảnh chụp kiểm tra (sáng / tối / điện thoại) | Cần (iPad cảm ứng) |
| M5-T6 | Phát lại: bản của bạn / bản chuẩn / A-B / một ô / 100–75–50%; con trỏ theo tiếng | M2 | Auto-Test Passed | `core/coach/replay.ts`, `hooks/useCoachReplay.ts` | Unit + e2e | 2 unit + e2e | Cần (nghe thật) |
| M5-T7 | e2e: bàn phím máy tính + MIDI giả (velocity, pedal) + khôi phục + AI giả + trạng thái AI lúc đánh + kế hoạch luyện + lịch sử | T2–T6, T8 | Auto-Test Passed | `e2e/coach.spec.ts` | Qua trên Chromium | 7/7 | — |
| M5-T8 | Trạng thái AI cục bộ khi đang đánh (yêu cầu ưu tiên 2026-11-07): tự kiểm tra khi mở Coach + định kỳ 30 s / 15 s, timeout 5 s, chỉ `GET /api/tags`, dừng khi app ẩn; chip ở thanh ghi + cạnh nút "Bắt đầu ghi", thẻ AI hiện chi tiết (địa chỉ, ms, giờ kiểm tra, lỗi); thanh ghi hai hàng không nhảy | M4-T1, T3 | Auto-Test Passed | `core/coach/ai/link.ts`, `hooks/useCoachAiLink.ts`, `components/coach/AiLinkStatus.tsx`, `CoachRecording.tsx`, `CoachSetup.tsx` | Đổi trạng thái lúc đang ghi không mất nốt, không làm khuông nhảy | 15 unit + e2e (tắt / chưa kết nối → đã kết nối → mất kết nối) + ảnh chụp (iPad sáng / tối, điện thoại) | Cần (Ollama thật, iPad qua LAN) |

## M6 — Adaptive Practice (P1)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M6-T1 | `recommendPractice` (≤ 3 vấn đề, ánh xạ: luyện đoạn Coach, màn Luyện tập theo tay / nhịp, Bóng bay đọc nốt, buổi pedal giáo trình) | M2 | Auto-Test Passed | `core/coach/practice/recommend.ts` | Unit test từng loại | 3 test | — |
| M6-T2 | `PracticePlan` 7 bước (thuần) + lưu tiến độ | T1, M1-T4 | Auto-Test Passed | `core/coach/practice/plan.ts` | Chuyển bước / đúng liên tiếp / tăng tempo / bỏ qua / đổi tempo / dừng | 3 test | — |
| M6-T3 | UI gợi ý + kế hoạch (bắt đầu / bỏ qua / mở tính năng), chấm xong tự cập nhật bước | T2, M5 | Auto-Test Passed | `CoachResults.tsx`, `CoachScreen.tsx` | e2e chuỗi kế hoạch | e2e (lỗi ô 3 → bước 1 đạt → bước 2) | — |

## M7 — Progress Analytics (P2)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M7-T1 | `progressReport` (3/5/10 lần, trung bình, cải thiện từng tiêu chí, lỗi tái diễn, tempo đạt, giảm lỗi, xu hướng) | M2 | Auto-Test Passed | `core/coach/progress/compare.ts` | Unit test | 3 test | — |
| M7-T2 | Hồ sơ kỹ năng 30 ngày + UI lịch sử / so sánh / mở lại / chấm lại bằng engine mới | T1, M5 | Auto-Test Passed | `components/coach/CoachHistory.tsx` | e2e | e2e | — |
| M7-T3 | Xuất báo cáo (văn bản / JSON) cho phụ huynh / giáo viên; xoá lịch sử theo hồ sơ (bấm xác nhận hai lần) | M1-T4 | Auto-Test Passed | `progress/compare.ts` (`progressText`), `CoachStorage.exportProfile` | Unit + e2e | qua | — |
| M7-T4 | Quyền giáo viên / phụ huynh xem từ máy khác | — | Blocked | — | Không có hệ thống tài khoản / máy chủ (quyết định D1, D2) | — | — |

## M8 — Audio Performance Analysis (P2)

| ID | Task | Phụ thuộc | Trạng thái | File | Điều kiện xong | Kết quả test | Thiết bị thật |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M8-T1 | Thiết kế module âm thanh | — | Implemented | `docs/ai-coach/architecture.md` §11 | — | — | — |
| M8-T2 | Micro = nguồn thử nghiệm (giai điệu nốt đơn, trễ 60 ms, không trường độ / pedal, lực đánh chỉ tương phản, độ tin cậy ≤ trung bình) | M5 | Auto-Test Passed | `hooks/useCoachRecorder.ts`, `screens/CoachScreen.tsx` | Unit test khả năng chấm | unit (synth micro) | Cần (iPad + đàn thật) |
| M8-T3 | Đa âm từ micro | — | Pending | — | Ngoài phạm vi: quy tắc "một nốt mỗi lúc" — cần quyết định sản phẩm | — | — |

## Nhật ký

| Ngày | Việc |
| --- | --- |
| 2026-11-08 | Laptop cùng mạng LAN mở GitHub Pages không kết nối được AI của PC. Nguyên nhân: "auto" chỉ thử proxy của app (GitHub Pages không có) và `localhost` của chính laptop. Gợi ý trong app lại bảo "mở khoá trên máy cài Ollama" mà không nói cách nhập địa chỉ PC. Phía PC đã sẵn sàng: Ollama nghe 0.0.0.0 (cài đặt "Expose Ollama to the network"), tường lửa Windows mạng Private tắt, có `OLLAMA_ORIGINS`. Thử trên Chrome 156 thật: trang GitHub Pages gọi `http://192.168.1.14:11434` chạy được khi đã cấp quyền mạng cục bộ (chỉ cảnh báo mixed content); chưa cấp thì bị chặn. Giả lập laptop (hồ sơ Chrome mới, chặn localhost:11434) trên bản v2.20: "auto" lỗi; nhập địa chỉ PC → "Kết nối tốt — 3 model", chip Coach "đã kết nối · gemma4:12b", log Ollama ghi yêu cầu từ IP LAN. Sửa `ollamaConnectHint` (chưa phát hành): quyền Chrome là của máy đang mở app, `OLLAMA_ORIGINS` là của máy cài Ollama; thêm cách nhập địa chỉ máy khác + mở Ollama ra mạng |
| 2026-11-07 | Người dùng báo "AI chưa nhận xét" (máy tính, Chrome 156, GitHub Pages, đàn MIDI, Chấm kỹ thuật). Kiểm tra: luồng AI của Coach gọi thẳng Ollama thật (`gemma4:12b`) chạy tốt (6–14 s, xác minh không bỏ câu nào); log Ollama không có lần gọi nào từ trang → hai chỗ chặn: Chrome chặn trang công khai gọi `localhost` khi chưa cấp quyền mạng cục bộ (`ERR_FAILED`), Ollama trả 403 cho origin `tienduc103.github.io`. Đã đặt `OLLAMA_ORIGINS` (biến người dùng) + khởi động lại Ollama; thử trên trang GitHub Pages thật bằng Chrome của máy (hồ sơ tạm, Playwright `channel: chrome`): cấp quyền → "đã kết nối", nhận xét AI sau 3,4 s. App: `ollamaConnectHint` nói đúng cách sửa theo nơi mở app (thay "kiểm tra Ollama đang chạy" ở chip Coach, thẻ nhận xét, AiCoachCard, Cài đặt); "Dữ liệu JSON" ở Lịch sử nay có log gốc (`CoachExport` v2, `events`) — trước chỉ có kết quả, trái với checklist. tsc sạch, `npm test` 2068, e2e Coach + AI 13/13 |
| 2026-11-07 | M2-T11 chơi lại (engine 1.1.0, `dtw-jumps-2`). Trước khi sửa: sai ở ô 2 rồi chơi lại từ đầu ô 2 → 4 "nốt thừa" + một "ngắt quãng" sai chỗ + một "nhả sớm" giả (nốt lượt đầu và lượt chơi lại bị ghép lẫn). Sau: DTW nhảy lùi → lượt, căn chỉnh riêng từng lượt, chấm theo lần đầu chơi tới (D12, chờ duyệt). Ngưỡng: phạt nhảy 1.2 (chơi lại ≥ 2 nhóm mới nhận; lùi 1 nốt như cũ), lượt mới phải bắt đầu bằng phím đúng (không thì nốt vấp bị đẩy sang đầu lượt sau), kết thúc mở (chơi thêm sau khi xong / chơi lại rồi thôi). Con trỏ lúc ghi + phát lại theo lượt. Làm song song với M1-T7 của phiên khác trên cùng `types.ts` / `ScoringEngine.ts` / `CoachResults.tsx` / `fallback.ts` — chỉ sửa đúng chỗ. Kiểm thử trên working tree chung (gồm M1-T7): tsc sạch, `npm test` 105 file / 2067 test, `npm run build` qua, e2e toàn bộ 139/139 (12,8 phút, gồm `coach-restart.spec.ts` mới + Coach 8/8). Chưa thử chơi lại trên đàn MIDI thật / iPad |
| 2026-11-07 | M5-T8 trạng thái AI cục bộ khi đang đánh (người dùng yêu cầu ưu tiên). Ảnh chụp cho thấy chip làm nút "Kết thúc & chấm" xuống dòng → thanh ghi tách hai hàng; e2e kiểm tra bàn phím không xê dịch khi trạng thái đổi. Kiểm thử: `npm test` 101 file / 1895 test qua; `npm run build` qua; `npm run test:e2e` toàn bộ 137/137 qua (12,1 phút) + `e2e/coach.spec.ts` 7/7 qua trên bản build cuối. Chưa thử Ollama thật / iPad qua LAN |
| 2026-11-07 | Kiểm thử cuối: `npm test` 98 file / 1869 test qua; `npm run build` qua; `npm run test:e2e` toàn bộ 135/135 qua (12,1 phút, trước vài sửa chỉ trong module Coach) + `e2e/coach.spec.ts` 6/6 qua trên bản build cuối. Cảnh báo chunk > 1100 kB có từ trước (chunk chính 1,31 MB; Coach tải lazy, 159 kB riêng). Chưa thử đàn MIDI thật / iPad / Ollama thật |
| 2026-11-07 | Giao diện M5 + M6/M7 UI, e2e `e2e/coach.spec.ts` 5/5 qua; soát ảnh chụp (bố cục 2 cột, tối, điện thoại) → sửa tràn lưới, chiều cao bàn phím, tempo vô lý khi không khớp, ký hiệu ⏸. Toàn bộ unit 1866 test qua, `npm run build` qua |
| 2026-11-07 | M4 lõi: provider Ollama (schema, timeout, retry), payload, prompt, verify (bắt được lỗi `\b` không hiểu "Ô" có dấu), fallback, cài đặt |
| 2026-11-07 | M1–M3 lõi: bộ ghi + ghép nốt + IndexedDB, bản nhạc tham chiếu, căn chỉnh DTW + khớp nốt, 5 tiêu chí, Mode A/B, trọng số tuỳ biến |
| 2026-11-07 | Audit dự án, viết kiến trúc + backlog. Baseline: 89 file test / 1634 test qua, `tsc -b` sạch (working tree có thay đổi chưa commit của phiên khác — Happy Birthday, Khám phá nốt nhạc) |
