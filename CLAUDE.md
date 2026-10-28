# VietPiano — hướng dẫn cho Claude Code

PWA học piano trên iPad (Safari): nghe tiếng đàn qua micro, nhận diện nốt đơn, Wait Mode tự chuyển nốt khi đánh đúng.
Không backend, không gửi âm thanh lên mạng, chạy offline.

## Lệnh

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Dev server (http, dùng trên máy Windows: micro chạy được ở localhost) |
| `npm run dev:https` | Dev server HTTPS tự ký — để iPad trong mạng LAN dùng được micro |
| `npm test` | Unit test (Vitest) — chạy sau mỗi thay đổi ở `src/core` |
| `npm run typecheck` | `tsc -b` |
| `npm run build` | Typecheck + build production + service worker |
| `npm run test:e2e` | Playwright (Chromium, viewport iPad ngang, micro giả bằng file WAV) |
| `npm run icons` | Sinh lại icon PNG từ `public/favicon.svg` |
| `npm run release` | Phát hành: tăng `VERSION`, commit riêng file đó + tag (`-- --dry-run`, `-- --no-git`) |

Trước khi báo xong việc: `npm test && npm run build && npm run test:e2e`.

## Kiến trúc

```
src/core/            ← logic thuần TypeScript, KHÔNG import React; mọi thứ ở đây phải có unit test
  music/notes.ts           tần số ↔ MIDI ↔ tên nốt (C4, Đô4), cents
  music/keySignature.ts    hoá biểu ("Dm", "Em"…) + dấu hoá cần vẽ trong ô nhịp (bất thường, dấu hoàn)
  audio/AudioInput.ts      getUserMedia + AudioContext + AudioWorklet (singleton, dọn dẹp đầy đủ)
  audio/capture-processor.js  AudioWorklet (JS thuần) gửi khung 2048 mẫu mỗi hop 1024
  audio/PitchDetector.ts   YIN → { frequency, confidence, rms }
  audio/AttackAnalyzer.ts  FFT; onset phổ + cao độ của phần phổ MỚI → nhận nốt gõ đè âm ngân (pedal)
  audio/fft.ts             FFT radix-2 → phổ biên độ
  audio/NoteRecognizer.ts  khung cao độ → sự kiện noteOn (ổn định + onset, chống âm ngân/hoạ âm)
  input/NoteInputProvider.ts  interface nguồn nốt (microphone | virtual | midi)
  input/MicrophoneInputProvider.ts  AudioInput → PitchDetector + AttackAnalyzer → NoteRecognizer
  input/VirtualInputProvider.ts     bàn phím ảo / bàn phím máy tính (demo mode)
  input/MIDIInputProvider.ts        đàn nối dây qua Web MIDI (Chrome/Edge máy tính; iPad không có) — Note On → sự kiện nốt (+ velocity), Note Off → `onNoteOff`
  practice/PracticeEngine.ts  Wait Mode (máy trạng thái thuần); `advanceOnWrong` = chế độ Đếm nốt (sai vẫn đi tiếp, ghi 'wrong')
  practice/TempoFollower.ts   chế độ chạy theo nhịp: đồng hồ nhịp tự chạy, khớp pha + nhịp độ theo onset, KHÔNG xét cao độ
  practice/NoteStats.ts       thống kê từng nốt trong phiên (suy từ PracticeState): tốc độ đọc nốt, đúng/sai + nốt nhầm
  lessons/                 kiểu dữ liệu, ký hiệu gọn "C4 D4/h", thư viện bài, LessonManager
  practice/PerformanceTracker.ts  Biểu diễn / Tiết tấu của giáo trình: đồng hồ nhịp CỐ ĐỊNH, chấm cao độ + thời điểm + trường độ (Note Off), dấu lặng
  curriculum/              giáo trình (xem docs/curriculum.md): Curriculum → Level → Week → Lesson → Activity/Exercise
    content/                 CHỈ dữ liệu (cấp 1–2: mỗi cấp 20 buổi; cấp 3–6 khung "sắp có"; `helpers.ts` hàm dựng chung);
                             `extraPractice` = bài thư viện luyện thêm (gộp từ khoá học cũ)
    validate.ts              kiểm tra dữ liệu (đủ phách, tầm micro, tiên quyết, đáp án) — test chạy cho toàn giáo trình
    piece.ts / QuizEngine.ts / scoring.ts / unlock.ts / progress.ts  bản nhạc→dòng thời gian/MIDI, bài nhiều lượt, rubric, gợi ý mở khoá, tiến độ
  score/ScoreRenderer.ts   VexFlow → SVG một dòng; tô màu bằng CSS class, trả về toạ độ x từng nốt
  storage/ProgressStorage.ts  IndexedDB (phiên + tổng hợp theo bài), fallback bộ nhớ; bài gần đây ở localStorage
  storage/CurriculumStorage.ts  IndexedDB riêng "vietpiano-curriculum": tiến độ giáo trình theo hồ sơ, ghi ngay sau mỗi bài tập
  audio/SoundOutput.ts     tiếng đàn mẫu + click metronome (WebAudio tổng hợp, offline); micro bỏ nốt trong lúc phát mẫu
  settings/DeviceSettings.ts  cài đặt micro/hiển thị ở localStorage
  calibration/AutoCalibrator.ts  tự căn chỉnh: đo im lặng → hiện nốt đo → nghe khung cao độ thô → đề xuất cài đặt
  calibration/CalibrationCheck.ts  kiểm tra sau căn chỉnh: đồng hồ nhịp dừng chờ từng nốt; ghi nghe sai / nghe thừa (âm ngân)
  profile/LearnerProfile.ts  hồ sơ người học (tuổi, trình độ, mục tiêu) ở localStorage; phiên cũ không profileId → hồ sơ tạo sớm nhất
  profile/assessment.ts      đánh giá từ lịch sử phiên: thời gian học, điểm khả năng 0–100, các tiêu chí (đều đặn, tốc độ đọc nốt, nốt hay sai…)
  profile/recommend.ts       gợi ý bài theo nhóm tuổi + mục tiêu + độ khó vừa sức + tiến độ (tối đa 2 bài/nhóm)
src/store/           Zustand: settingsStore, micStore, appStore (route + tiến độ + lịch sử phiên), profileStore, curriculumStore
src/hooks/           vòng đời app (ẩn nền → tắt micro), theme, wake lock, ghi phiên luyện tập
src/components/      ScoreView, PianoKeyboard, MicPanel, ui
src/screens/         Dashboard (trang chủ), Curriculum, LessonPlayer, Library, Practice, Settings
                     `?screen=library` / `?screen=curriculum` mở thẳng màn đó (e2e dùng)
e2e/                 Playwright; global-setup sinh WAV gam Đô trưởng làm micro giả
```

Luồng dữ liệu: `AudioWorklet → AudioInput.frames → PitchDetector.detect (+ AttackAnalyzer.process) → NoteRecognizer.process → NoteInputEvent → PracticeEngine.handleNote → React (useSyncExternalStore)`.

## Nguyên tắc

- **Tính đúng của Wait Mode là ưu tiên số 1.** Có hai lớp chống nhảy nhiều nốt:
  1. `NoteRecognizer`: sau mỗi noteOn thì "tháo kíp"; chỉ nhận nốt mới khi có khoảng lặng hoặc onset
     (RMS tăng > `onsetRatio` so với 2 khung trước, ngoài thời gian refractory). Đổi nốt kiểu legato chỉ được
     nhận khi không phải quan hệ hoạ âm và ổn định ≥ `legatoStableMs`.
     Pedal/âm ngân: YIN trên hỗn hợp nốt bị sai (A4+D4 → D3), nên khi có âm nền (`attackMinBackground`)
     thì dùng cao độ của `AttackAnalyzer` (phần phổ tăng ≥ `noveltyRatio` lần so với phổ trước lúc gõ).
     Onset phổ chỉ lên kíp nếu xảy ra SAU lần phát gần nhất. Không hạ `noveltyRatio` dưới ~1.6: beating
     ±20% của âm ngân sẽ thành onset giả → nhảy nốt (test `NoteRecognizer.pedal.test.ts`).
     Quãng cao tới C8 (`maxFrequency` 4500 Hz, `maxMidi` 108): từ 1 kHz lấy F0 theo đỉnh phổ âm cơ bản
     (YIN bị dây lệch hoạ âm kéo cao); `AttackAnalyzer` nới độ lệch hoạ âm theo cao độ và bỏ ứng viên
     ≥ 600 Hz thiếu hoạ âm 1 — thiếu một trong hai thì nốt cao bị nhận xuống quãng 8 dưới.
  2. `PracticeEngine`: mỗi sự kiện tiến tối đa 1 nốt; bỏ qua sự kiện < `minAdvanceIntervalMs` sau lần chuyển nốt.
  Mọi thay đổi ở hai file này phải kèm test mô phỏng chuỗi khung (xem `NoteRecognizer.test.ts`, `PracticeEngine.test.ts`).
- Giáo trình: Wait Mode KHÔNG có tiêu chí nhịp; trường độ chỉ chấm khi có Note Off (MIDI / bàn phím ảo), micro → "không đo"
  và chia lại trọng số. Mở khoá chỉ là gợi ý (quyết định sản phẩm), Kids/Adult chỉ khác trình bày — cùng engine.
- Chỉ nhận diện **một nốt tại một thời điểm**. Không giả vờ hỗ trợ hợp âm.
  Bài có `accompaniment` (ký hiệu "D3+F3+A3/hd:5+3+1"): phần đệm tay trái vẽ trên khuông Fa cùng lúc với giai điệu,
  app chỉ chấm giai điệu tay phải; nốt thấp hơn giai điệu bị bỏ qua (`isAccompanimentMidi`).
- Không tạo MIDI giả. `MIDIInputProvider` dùng Web MIDI thật (bật ở Cài đặt → `midiEnabled`, tự kết nối khi mở app).
  Safari và mọi trình duyệt trên iPad (WebKit) không có Web MIDI → báo "không hỗ trợ", dùng micro. MIDI trên iPad
  chỉ có qua app native (Core MIDI). Khi đàn MIDI đã nối, màn Luyện tập bỏ nốt từ micro (micro nghe chính tiếng đàn đó).
- Micro: chỉ một stream (`microphoneInput` singleton), tắt AGC/khử ồn/khử vọng, phải `stop()` để giải phóng track +
  đóng AudioContext. Khi app vào nền → tắt micro, người dùng bấm để bật lại (Safari cần user gesture).
- Không gửi âm thanh hay dữ liệu ra ngoài; không thêm backend/AI API.
- Bài hát mới phải là giai điệu tự biên soạn hoặc thuộc phạm vi công cộng; ghi `source`.
  Test `lessons.test.ts` kiểm tra mọi ô nhịp đủ phách và nốt nằm trong tầm micro (MIDI 36–84).
- VexFlow dùng entry `vexflow/bravura` (font nhúng → offline). Màu khuông nhạc qua `currentColor` + CSS
  (`.score-note.is-current` …) — không vẽ lại khi chuyển nốt.
- UI tiếng Việt, nút ≥ 48px cho cảm ứng, tối ưu iPad ngang, hỗ trợ dark mode (`.dark` trên `<html>`).
- Không tuyên bố đã kiểm thử trên iPad thật nếu chưa có bằng chứng; e2e chạy trên Chromium.

## Quy ước

- TypeScript strict, comment/tên hiển thị bằng tiếng Việt, tên định danh bằng tiếng Anh.
- File test cạnh file nguồn: `*.test.ts`. Tín hiệu tổng hợp cho test: `src/core/audio/testSignals.ts`.
- Thêm cài đặt mới: cập nhật `DeviceSettings` (+ `sanitize`), `settingsStore.applyToRecognizer` nếu liên quan nhận diện.
- Phiên bản: chỉ ở file `VERSION` (`<major>.<minor>.<yymmdd>.<hhmmss>`, giờ VN; minor 01–99, sau 99 → major+1).
  Chỉ tăng bằng `npm run release` (logic thuần ở `scripts/version.ts` + test), chạy trước mỗi lần deploy.
  `vite.config.ts` đọc VERSION → `__APP_VERSION__` (không có file → "dev"); không tự sinh phiên bản lúc build,
  không ghi vào `version` của package.json.
- Deploy: GitHub Actions `.github/workflows/deploy.yml` (đặt `BASE_PATH=/<repo>/`).
