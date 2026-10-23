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
  practice/PracticeEngine.ts  Wait Mode (máy trạng thái thuần); `advanceOnWrong` = chế độ Đếm nốt (sai vẫn đi tiếp, ghi 'wrong')
  practice/TempoFollower.ts   chế độ chạy theo nhịp: đồng hồ nhịp tự chạy, khớp pha + nhịp độ theo onset, KHÔNG xét cao độ
  lessons/                 kiểu dữ liệu, ký hiệu gọn "C4 D4/h", thư viện bài, LessonManager
  score/ScoreRenderer.ts   VexFlow → SVG một dòng; tô màu bằng CSS class, trả về toạ độ x từng nốt
  storage/ProgressStorage.ts  IndexedDB (phiên + tổng hợp theo bài), fallback bộ nhớ; bài gần đây ở localStorage
  settings/DeviceSettings.ts  cài đặt micro/hiển thị ở localStorage
  calibration/AutoCalibrator.ts  tự căn chỉnh: đo im lặng → hiện nốt đo → nghe khung cao độ thô → đề xuất cài đặt
  calibration/CalibrationCheck.ts  kiểm tra sau căn chỉnh: đồng hồ nhịp dừng chờ từng nốt; ghi nghe sai / nghe thừa (âm ngân)
  profile/LearnerProfile.ts  hồ sơ người học (tuổi, trình độ, mục tiêu) ở localStorage; phiên cũ không profileId → hồ sơ tạo sớm nhất
  profile/assessment.ts      đánh giá từ lịch sử phiên: thời gian học, điểm khả năng 0–100, các tiêu chí (đều đặn, tiến bộ…)
  profile/recommend.ts       gợi ý bài theo nhóm tuổi + mục tiêu + độ khó vừa sức + tiến độ (tối đa 2 bài/nhóm)
src/store/           Zustand: settingsStore, micStore, appStore (route + tiến độ + lịch sử phiên), profileStore
src/hooks/           vòng đời app (ẩn nền → tắt micro), theme, wake lock, ghi phiên luyện tập
src/components/      ScoreView, PianoKeyboard, MicPanel, ui
src/screens/         Library, Practice, Settings
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
  2. `PracticeEngine`: mỗi sự kiện tiến tối đa 1 nốt; bỏ qua sự kiện < `minAdvanceIntervalMs` sau lần chuyển nốt.
  Mọi thay đổi ở hai file này phải kèm test mô phỏng chuỗi khung (xem `NoteRecognizer.test.ts`, `PracticeEngine.test.ts`).
- Chỉ nhận diện **một nốt tại một thời điểm**. Không giả vờ hỗ trợ hợp âm.
- Không tạo MIDI giả. Safari iPadOS không có Web MIDI; MIDI thật → `MIDIInputProvider` trong app native (Core MIDI).
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
