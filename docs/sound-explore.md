# "Khám phá âm thanh — Cao độ và Trường độ" — kế hoạch, kiến trúc, nghiệm thu

Bài nhập môn cho bé 4–6 tuổi (tối ưu cho bé 4 tuổi chưa biết đọc, chưa biết nhạc lý), nằm ở đầu giáo trình
"Làm quen từng nốt" (thẻ đầu màn `supplement`, trước các buổi nốt). Route `sound-explore`, mở thẳng `?screen=sound-explore`.

## P0 — Khảo sát hệ thống và danh sách tái sử dụng

| Cần | Đã có trong VietPiano | Cách dùng ở bài này |
| --- | --- | --- |
| Nguồn nốt | `useNoteInput` (micro + MIDI + bàn phím ảo + bàn phím máy tính, lọc nguồn, chặn tiếng loa / tiếng cô giáo) | Dùng nguyên, thêm `PressTracker` để đo thời gian giữ phím |
| MIDI | `midiInput` / `MidiEngine` (Web MIDI + cầu nối native, running status, velocity 0 = off, rút đàn → Note Off + nhả pedal, tự kết nối lại) | Dùng nguyên; `onPedal` chỉ để ghi trạng thái pedal |
| Bàn phím ảo | `PianoKeyboard` + `virtualInput` (press / release) | Dùng nguyên; tô phím đang giữ + vùng gợi ý |
| Tiếng đàn | `soundOutput` (`playSequence`, `scheduleNote`, `liveNoteOn/Off`) | Ví dụ cùng lực gõ (cao ≠ to); phím ảo kêu đúng thời gian giữ |
| Giọng cô giáo | `voiceTeacher` + mp3 thu sẵn (`npm run voice`) + `VoiceBar` | Mọi câu là chuỗi cố định trong `lesson.ts` → đã thu đủ mp3 |
| Hồ sơ | `profileStore` | Tiến độ theo hồ sơ; tuổi gửi AI (tuỳ chọn), tên không gửi |
| Lưu tiến độ | Mẫu localStorage theo hồ sơ (`fiveFinger/storage`) | `soundExplore/storage.ts` cùng mẫu |
| AI cục bộ | `feedback/OllamaClient` (`resolveOllama`, `streamChat`), cài đặt `aiCoachEnabled` | Dùng nguyên; prompt + bộ lọc riêng (`ai.ts`) |
| Hoạt hình | `Fireworks`, `prefers-reduced-motion` | Pháo hoa khi xong phiêu lưu, tắt khi giảm chuyển động |

Không có giao diện "AI Dev Manager" trong dự án → không có nơi cập nhật tiến độ ngoài tài liệu này.
Không thay đổi `NoteRecognizer`, `PracticeEngine`, `MidiEngine` hay luồng giáo trình hiện có.

## Kiến trúc

```
src/core/soundExplore/        logic thuần, có unit test (48 test)
  config.ts      ngưỡng trò chơi + 3 mức (LEVEL_PROFILES), sanitize
  classify.ts    cao/thấp/giữa, lên/xuống, ngắn/dài/chưa rõ/chạm vội, pitchHeight, approach (nội suy có giới hạn)
  PressTracker   note-on/off → thời gian giữ phím vật lý; mô hình MidiEvent
  tasks.ts       sinh câu theo mức; chấm từng thành phần (judgeRegister / judgeDuration / judgeGarden); PathFollower; buildAdventure
  progress.ts    SkillRecord, ActivitySession, sao, hình dán, bản ghi; cập nhật bất biến; sanitize
  storage.ts     localStorage "vietpiano.sound-explore.v1" { [profileId|guest]: progress }
  assessment.ts  SkillAssessment, 3 trạng thái, Recommendation theo quy tắc, gợi ý lên mức, số lựa chọn khu vườn, câu động viên
  ai.ts          prompt Ollama + parseAiAdvice (lọc suy diễn) + ruleAdvice
  recorder.ts    ghi biểu diễn tự do (chỉ nốt)
  lesson.ts      LessonDefinition + mọi câu cô giáo (SAY) + soundExploreVoiceLines
src/components/soundExplore/  shared.tsx (ngữ cảnh, phát mẫu, nút lớn, nhân vật, thanh thời gian), missions.tsx, activities.tsx, ParentPanel.tsx
src/screens/SoundExploreScreen.tsx   nối nguồn nốt → PressTracker → sự kiện; tiến độ; phiên; góc phụ huynh
```

Luồng: `micro / MIDI / phím ảo → useNoteInput → PressTracker (mốc = lúc app NHẬN sự kiện) → ExploreNoteEvent {start | end | mic} → nhiệm vụ → quy tắc chấm → progress → localStorage`.

Quyết định kỹ thuật:

- **Cao độ chỉ theo số nốt MIDI.** Lực gõ được ghi nhưng không bao giờ vào phân loại; mọi ví dụ phát cùng lực gõ (80).
- **Thời gian giữ phím = note-on → note-off thật.** Pedal (CC 64) chỉ ghi `sustainedByPedal`; thả phím lúc đạp vẫn kết thúc phép đo.
  Mốc đo là `performance.now()` lúc nhận (mốc Web MIDI do driver gắn có thể lệch, xem docs/midi.md).
- **Micro không có Note Off** → hoạt động cao độ nhận nốt micro; hoạt động trường độ báo "micro chưa đo được" và hướng dẫn dùng bàn phím trên màn hình.
  Nốt micro trong 0,5 s sau khi thả phím ảo bị bỏ (micro nghe tiếng loa của phím ảo).
- **Vùng "chưa rõ"** (giữa ngắn và dài) không tính là chưa đạt, chỉ mời thử lại. Chạm < `shortMinMs` bị bỏ qua.
- Rút đàn / đổi hoạt động / app vào nền → `releaseAll`, lần nhấn dở dang đánh dấu `aborted`, không chấm.
- **Không tự tăng mức.** Mức đổi bằng tay ở góc phụ huynh; app chỉ đề xuất khi mọi kỹ năng của mức "tốt" qua ≥ 8 lần thử.
  Khu vườn tự lên 4 lựa chọn khi ≥ 5/6 lượt gần nhất đạt cả hai thành phần (dựa trên kết quả, không theo thời gian); phụ huynh khoá được 2 / 4.

## Mô hình dữ liệu (đối chiếu đặc tả)

| Đặc tả | Ở mã nguồn |
| --- | --- |
| LessonDefinition | `lesson.ts` `SOUND_EXPLORE_LESSON` (lessonId, title, targetAge, curriculumId = `vietpiano-supplement`, activities, learningObjectives, defaultSettings, version) |
| ActivitySession | `progress.ts` `ActivitySession` (sessionId, learnerId, activityId, startedAt, endedAt, inputMode, completed, assistanceLevel); giữ 60 phiên gần nhất |
| MidiEvent | `PressTracker.ts` `MidiEvent` (noteNumber, eventType, velocity, timestamp, channel, sourceDevice) — chỉ trong bộ nhớ, không lưu log nốt |
| SkillAssessment | `assessment.ts` `SkillAssessment` cho 5 kỹ năng: pitchRecognition, pitchDirection, durationRecognition, durationExecution, pitchExecution (+ attempts, successfulAttempts, confidence, updatedAt, nghe lại, thử lại, lần thử MIDI) |
| Recommendation | `assessment.ts` `Recommendation` (skill, suggestedActivity, reason, generatedBy, createdAt, parentApprovalRequired) |

Chính sách lưu: như các trò khác — localStorage trên máy, theo hồ sơ; không gửi đi đâu. Bản ghi biểu diễn chỉ là danh sách {nốt, lúc bắt đầu, thời gian giữ}
(≤ 30 s / 120 nốt), không ghi âm. AI cục bộ (mặc định tắt) chỉ nhận số liệu tóm tắt + tuổi.

## Hoạt động

| | Hoạt động | Nội dung | Kỹ năng ghi nhận |
| --- | --- | --- | --- |
| A | Làm quen với âm thanh | 2 trang, mỗi trang một khái niệm: tiếng đi lên / xuống (tên lửa bay theo) · ngắn "Tinh!" / dài "Tiiiiinh!" (thỏ / ốc sên). Nghe lại, Tiếp, Bỏ qua | — |
| B | Tên lửa cao độ | 👂 nghe chọn cao / thấp (mức 1), so sánh hai nốt (mức 2), chuỗi 3 nốt (mức 3) · 🎹 đánh phím → tên lửa tới độ cao · 〰️ đi theo giai điệu 3–4 nốt lên / xuống | pitchRecognition, pitchDirection |
| C | Thỏ và Ốc sên | 👂 hai tiếng cùng cao độ khác trường độ, chọn tiếng ngắn / dài · 🎹 nhấn: thanh sáng chạy, ngắn → thỏ nhảy, dài → ốc sên bò; sau đó yêu cầu ngắn / dài xen kẽ | durationRecognition, durationExecution |
| D | Khu vườn âm nhạc | Cao/thấp × ngắn/dài, bắt đầu 2 lựa chọn → 4; hoa nở khi đúng cả hai; nhận xét từng thành phần ("Tiếng cao đúng rồi! Con giữ phím lâu hơn…"); mức 1 tô vùng phím gợi ý, mức 2–3 chỉ tô sau lần chưa đúng | pitchExecution, durationExecution |
| E | Biểu diễn tự do | Chọn tên lửa / chim / thỏ / ốc sên; nhân vật theo cao độ, vệt sáng dài theo thời gian giữ, màu theo cao độ, phím sáng; ghi ⏺ và nghe lại ▶. Không chấm | — |
| F | Phiêu lưu âm nhạc | 5 (mức 1) / 6 / 7 nhiệm vụ trộn: nghe cao độ, nghe trường độ, đánh vùng cao / thấp, giữ phím, giai điệu 2–3 nốt (+ khu vườn từ mức 2). Thử không giới hạn, mỗi nhiệm vụ một sao, xong được hình dán | mọi kỹ năng |
| | Tổng kết | Sao từng hoạt động, hình dán, câu động viên theo quy tắc | — |

UX cho bé: chữ không bắt buộc (biểu tượng + giọng cô), nút ≥ 80 px, mỗi màn một nhiệm vụ, không đồng hồ đếm ngược, không âm báo thất bại,
không tự chuyển nhiệm vụ (bé bấm ▶), luôn có nút 🔊 nghe lại, cô không nói lúc đang phát ví dụ. Chuông hoàn thành nhỏ hơn tiếng đàn, không kêu khi bé đang giữ phím.
Bài không có nhạc nền. Góc phụ huynh: giữ nút "Phụ huynh" 1,2 giây (bàn phím: Enter).

## Ngưỡng mặc định (cấu hình ở góc phụ huynh, theo hồ sơ)

| | Mặc định |
| --- | --- |
| Bỏ qua chạm | < 150 ms |
| Ngắn | 150–700 ms |
| Chưa rõ | 700–1500 ms |
| Dài | ≥ 1500 ms |
| Vùng thấp (bé đánh) | ≤ La3 (MIDI 57) |
| Vùng cao (bé đánh) | ≥ Đô5 (MIDI 72) |
| Ví dụ nghe mức 1 | thấp Đô3–Mi3, cao La5–Đô6 (cách ≥ 2 quãng tám) |

Đây là ngưỡng của trò chơi, không phải định nghĩa nhạc lý.

## Kiểm thử

- Unit (`npm test`): `classify.test.ts`, `PressTracker.test.ts` (nhiều phím, velocity 0, pedal, mất kết nối, đồng hồ lệch, lực gõ),
  `tasks.test.ts` (đáp án khớp nốt phát, chấm từng thành phần, đường giai điệu, phiêu lưu đủ loại), `progress.test.ts` (lưu / khôi phục theo hồ sơ, dữ liệu hỏng,
  đặt lại, 3 trạng thái đánh giá, không kết luận khi ít dữ liệu, đề xuất, AI lọc suy diễn, bản ghi chỉ nốt).
- e2e (`npx playwright test e2e/sound-explore.spec.ts`, 7 test): mở từ "Làm quen từng nốt" + lời cô; Tên lửa (chọn lại, sao lưu qua tải lại, tên lửa theo số nốt);
  Thỏ và Ốc sên (ngắn / dài / vùng giữa không tính, chế độ nghe); Khu vườn bằng đàn MIDI giả (pedal không biến nhấn ngắn thành dài, velocity 0 = off, báo cáo MIDI);
  Biểu diễn tự do (ghi chỉ {midi, at, durationMs}, phát lại); Phiêu lưu hết nhiệm vụ không cần MIDI → hình dán, tổng kết, góc phụ huynh (AI tắt → quy tắc, đổi mức lưu qua tải lại, đặt lại);
  AI cục bộ giả (nhận xét hợp lệ hiện; câu suy diễn "thông minh" bị loại; không gửi tên).

## Hoàn nguyên

Bài tách riêng, gỡ không ảnh hưởng phần khác:
1. Xoá `src/core/soundExplore/`, `src/components/soundExplore/`, `src/screens/SoundExploreScreen.tsx`, `e2e/sound-explore.spec.ts`.
2. Bỏ route `sound-explore` ở `store/appStore.ts` (Route + `?screen=`) và `App.tsx`; bỏ thẻ `open-sound-explore` ở `screens/SupplementScreen.tsx`.
3. Bỏ khối `soundExplore` trong `scripts/voice.ts`, chạy `npm run voice -- --prune` để xoá mp3 không dùng.
4. Bỏ mục ở `docs/architecture.md`, dòng ở `CLAUDE.md`. Dữ liệu cũ trên máy người dùng nằm ở khoá localStorage `vietpiano.sound-explore.v1` (không ai đọc nữa).

## Trạng thái nghiệm thu (11/11/2026)

| # | Tiêu chí | Trạng thái | Bằng chứng |
| --- | --- | --- | --- |
| 1 | Bé chưa biết đọc dùng được nhờ âm thanh | Đã làm, kiểm bằng e2e một phần | Mọi lời dặn có mp3 thu sẵn (`npm run voice`: 92 câu mới, 0 lỗi); e2e kiểm lời cô hiện ở màn chọn trò / phần làm quen. **Chưa thử với trẻ thật.** |
| 2 | Mọi hoạt động dùng được không cần MIDI | Đã kiểm (e2e) | Phiêu lưu hoàn thành chỉ với bàn phím trên màn hình; nghe – chọn bằng chạm |
| 3 | Có MIDI: hoạt hình đúng số nốt + thời gian nhấn | Đã kiểm (unit + e2e MIDI giả) | Chưa thử trên đàn MIDI thật |
| 4 | Phân biệt cao độ và âm lượng | Đã kiểm (unit) | Phân loại không nhận velocity; ví dụ cùng lực gõ |
| 5 | Phân biệt giữ phím và âm ngân pedal | Đã kiểm (unit + e2e MIDI giả) | |
| 6 | Âm chưa rõ dài / ngắn xử lý phù hợp | Đã kiểm (unit + e2e) | Mời thử lại, không tính chưa đạt |
| 7 | Tiến độ lưu / khôi phục | Đã kiểm (unit + e2e tải lại) | |
| 8 | Không có AI vẫn chạy | Đã kiểm (e2e) | AI tắt / lỗi / trả lời không đạt → nhận xét theo quy tắc |
| 9 | Báo cáo phản ánh dữ liệu, không suy diễn | Đã kiểm (unit) | 3 trạng thái, ≥ 6 lần thử; AI bị lọc từ ngữ suy diễn |
| 10 | Không phá bài / trò hiện có | Đã kiểm | `npm test` 2337/2337, toàn bộ e2e 173 qua / 2 bỏ qua sẵn có (11/11/2026); không sửa module lõi nào |
| 11 | Máy tính và máy tính bảng | Kiểm trên Chromium viewport iPad ngang (e2e + ảnh chụp) | **Chưa thử trên iPad / Safari thật** |
| 12 | Kiểm thử tự động cho MIDI, phân loại, lưu dữ liệu | Đã có | 48 unit test + 7 e2e |

Còn thiếu / chưa kiểm chứng:
- Chưa thử trên iPad thật (Safari), chưa thử với đàn MIDI thật, chưa thử với trẻ 4–6 tuổi.
- Micro không đo được trường độ (giới hạn có chủ đích — không có Note Off đáng tin từ âm ngân).
- Độ trễ: công cụ đo từ lúc app nhận phím tới khung hình (góc phụ huynh); độ trễ loa / driver đo bằng công cụ của AI Piano Coach.
- Chưa có lối tắt Quick Access cho trang này.

## Nhật ký thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-11-11 | Bản đầu: 6 hoạt động + tổng kết, góc phụ huynh, AI cục bộ có lọc, 92 câu giọng cô. |
