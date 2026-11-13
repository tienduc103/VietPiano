# VietPiano — hướng dẫn cho Claude Code

PWA học piano trên iPad (Safari): nghe tiếng đàn qua micro, nhận diện nốt đơn, Wait Mode tự chuyển nốt khi đánh đúng.
Không backend, không gửi âm thanh lên mạng, chạy offline. Tuỳ chọn: nhận xét bằng AI cục bộ (Ollama trên máy người dùng).

## Lệnh

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Dev server (http, dùng trên máy Windows: micro chạy được ở localhost) |
| `npm run dev:https` | Dev server HTTPS tự ký — để iPad trong mạng LAN dùng được micro |
| `npm run serve:lan` | Build + `vite preview` HTTPS — bản production cho cả LAN, kèm proxy AI `/ollama` |
| `npm test` | Unit test (Vitest) — chạy sau mỗi thay đổi ở `src/core` |
| `npm run typecheck` | `tsc -b` |
| `npm run build` | Typecheck + build production + service worker |
| `npm run test:e2e` | Playwright (Chromium, viewport iPad ngang, micro giả bằng file WAV) — toàn bộ ~8–10 phút; một file: `npx playwright test e2e/<tên>.spec.ts` |
| `npm run icons` | Sinh lại icon PNG từ `public/favicon.svg` |
| `npm run release` | Phát hành: tăng `VERSION`, commit riêng file đó + tag (`-- --dry-run`, `-- --no-git`) |
| `npm run voice` | Tạo mp3 giọng cô giáo còn thiếu (cần `pip install edge-tts`; `-- --dry-run`, `-- --prune`) — chạy lại sau khi sửa câu / nội dung bài |
| `npm run perflog` | TẠM THỜI: máy ghi Nhật ký Biểu diễn chạy riêng (cổng 8790) cho máy mở app từ GitHub Pages; server dev / preview đã có sẵn `<base>__vplog` → `logs/perform-log/` (docs/perform-log.md) |

Kiểm tra trước khi báo xong việc:
1. `npm test && npm run build`.
2. e2e — trong lúc sửa chỉ chạy spec liên quan (`npx playwright test e2e/<tên>.spec.ts`, truyền được nhiều file).
   Lần kiểm tra cuối chạy toàn bộ `npm run test:e2e` MỘT lần bằng `run_in_background` (mất ~8–10 phút, vượt giới hạn
   10 phút của lệnh foreground), chờ thông báo xong, không poll. Spec lỗi → sửa rồi chỉ chạy lại spec đó; chạy lại toàn bộ
   khi đã sửa code dùng chung nhiều màn.

## Kiến trúc

**Bản đồ chi tiết từng module (file, hàm, route, quy tắc riêng): `docs/architecture.md` — đọc mục của module trước khi sửa nó.**
Thêm / đổi module → cập nhật `docs/architecture.md`; ở đây chỉ giữ mục lục một dòng (CLAUDE.md nạp vào mọi request, cần gọn).

| Thư mục | Nội dung |
| --- | --- |
| `src/core/` | logic thuần TypeScript, KHÔNG import React; mọi thứ ở đây phải có unit test |
| `core/music/` | tần số ↔ MIDI ↔ tên nốt, hoá biểu, pedal vang, sắc thái |
| `core/audio/` | micro (`AudioInput` + AudioWorklet), YIN `PitchDetector`, FFT / `AttackAnalyzer`, `NoteRecognizer`; `SoundOutput` tiếng đàn mẫu + metronome |
| `core/input/`, `core/midi/` | nguồn nốt micro / bàn phím ảo / MIDI (`midiInput`); Universal MIDI (docs/midi.md); `midiNav` bấm nút bằng phím đàn |
| `core/practice/` | Wait Mode `PracticeEngine`, Theo nhịp `TempoFollower`, chọn tay, Nghe mẫu, Biểu diễn, pedal, thống kê |
| `core/lessons/` | kiểu bài + ký hiệu gọn "C4 D4/h", thư viện, 50 bài `rep-*`, bản phối nhiều cấp (docs/happy-birthday.md) |
| `core/curriculum/` | giáo trình cấp 1–6 (docs/curriculum.md), "Làm quen từng nốt" (docs/supplement.md), "Khám phá nốt nhạc" (docs/note-discovery.md), validate, rubric, Luyện tập sau buổi |
| `core/games/` | trò chơi sau buổi, mục Trò chơi, trò tự do |
| `core/noteHunter/`, `flappyNote/`, `balloonPop/`, `f1Racing/`, `fiveFinger/` | Săn nốt, Flappy Note, Bóng bay nốt nhạc, F1 Racing, 5 ngón · 8 nốt (docs/five-finger.md) — máy trạng thái thuần |
| `core/noteQuiz/` | "Đố bé nốt gì?" (bé từ 4 tuổi): cô giáo hỏi bằng giọng + chữ, đáp án là HÌNH nốt trên khuông (khoá Sol / Fa / Đô Alto / Đô Tenor), bé chạm ô đúng — không chữ trên ô (docs/note-quiz.md) |
| `core/soundExplore/` | "Khám phá âm thanh — Cao độ và Trường độ" (bé 4–6 tuổi, nhập môn của "Làm quen từng nốt"): phân loại theo số MIDI + thời gian giữ phím vật lý, 6 hoạt động, góc phụ huynh, AI cục bộ chỉ viết lời (docs/sound-explore.md) |
| `core/coach/` | AI Piano Coach: log MIDI gốc, chấm theo bản nhạc, nhận xét AI có xác minh, đo độ trễ (docs/ai-coach/) |
| `core/technique/`, `core/smartPractice/` | Luyện kỹ thuật ngón tay (67 bài, 5 cấp) + AI Smart Practice dùng chung: đoạn khó qua nhiều phiên, bài bổ trợ 3–5 nốt, Adaptive Tempo, bài hôm nay — chạy / chấm trong Coach, không lưu tiến độ trùng (docs/finger-coach/) |
| `core/shortcuts/` | Lối tắt cá nhân (Quick Access): registry đích đến suy từ dữ liệu, lưu theo hồ sơ, mở qua router sẵn có — không URL (docs/shortcuts.md); `smart/` Lối tắt thông minh: đề xuất theo quy tắc, không lưu như lối tắt, không đụng lối tắt thủ công (docs/smart-shortcuts.md) |
| `core/score/` | VexFlow → SVG; khuông KHÔNG được nhảy khi đổi nốt (`scoreFit`) |
| `core/performLog/` | TẠM THỜI — Nhật ký Biểu diễn: ghi từng lượt Biểu diễn + máy truy cập, chẩn đoán chấm sai, gửi máy ghi của người dùng (docs/perform-log.md) |
| `core/voice/` | cô giáo giọng nói (mp3 thu sẵn → TTS của máy → chỉ chữ) |
| `core/feedback/` | nhận xét AI qua Ollama cục bộ, lưu nhận xét |
| `core/storage/`, `settings/`, `calibration/`, `profile/` | IndexedDB / localStorage, cài đặt thiết bị, tự căn chỉnh micro, hồ sơ + đánh giá + gợi ý bài |
| `src/store/` | Zustand (settings, mic, app, profile, curriculum, playing) |
| `src/hooks/`, `src/components/`, `src/screens/` | glue React, thành phần UI, màn hình (route + `?screen=…` mở thẳng, e2e dùng) |
| `e2e/` | Playwright; global-setup sinh WAV gam Đô trưởng làm micro giả |

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
  Bài có `accompaniment` (ký hiệu "D3+F3+A3/hd:5+3+1"; dấu lặng tay trái "R/8" → `pitches` rỗng): phần đệm tay trái vẽ trên khuông Fa cùng lúc với giai điệu,
  micro → app chỉ chấm giai điệu tay phải; nốt thấp hơn giai điệu bị bỏ qua (`isAccompanimentMidi`).
  Đàn MIDI / bàn phím ảo (micro tắt) → chấm cả hai tay (màn Luyện tập Chờ/Đếm nốt + bài Chờ nốt giáo trình):
  `accompanimentByNote` gán nốt đệm cho nốt giai điệu (`LeftHandStep`: nốt, ngón, hợp âm đang giữ),
  `PracticeEngine` (`twoHands` + `leftHand`) chờ đủ giai điệu + nốt tay trái của bước (thứ tự bất kỳ, 'partial').
  Chỉ micro (`micOnlyInput`) → chỉ chấm tay phải. Hướng dẫn luôn hiện cả hai tay (`components/HandsGuide`)
  kèm thông báo đang chấm một hay hai tay.
  Chùm nốt tay phải (`LessonNote.harmony`): đàn MIDI / bàn phím ảo → nốt hoà âm là nốt phụ của bước (`melodyStepExtras`, cùng cơ chế nốt tay trái);
  micro / Theo nhịp → chỉ chấm nốt giai điệu, nốt hoà âm của bước đang tập bỏ qua (`isUngradedHarmonyMidi`). Tay trái luôn thấp hơn mọi nốt tay phải.
- Pedal vang: `Piece.pedal` theo ô nhịp (`[1, 1], [2, 2]` = thay pedal mỗi ô) → vẽ "Ped." + đường kẻ, khấc "^" chỗ thay;
  Biểu diễn có thêm tiêu chí "Pedal" (15%). Chỉ đàn MIDI gửi pedal (Control Change 64); micro / bàn phím ảo → "không đo".
  Thả phím lúc pedal đang đạp không bị tính giữ thiếu trường độ. Giới thiệu ở cấp 6 buổi "Hoàng hôn" (l6-17); cùng buổi có bài thử sức không bắt buộc Romance d'Amour hai tay
  có pedal (bài Thư viện `song-romance-2-hands`, `song-fur-elise-2-hands`, 5 bài `song-{ode-to-joy,amazing-grace,silent-night,greensleeves,auld-lang-syne}-2-hands`, 5 bài thay phiên `bh-*` và 50 bài `rep-*` cũng có ký hiệu pedal).
  Màn Luyện tập chấm pedal mọi bài có ký hiệu khi có đàn MIDI (`practice/PracticePedal.ts`, dùng lại `pedalQuality`): Theo nhịp theo phách thật; Chờ / Đếm nốt không có đồng hồ
  nên dùng trục số bước (`waitPedalPosition`). Điểm hiện ở hộp thoại kết quả + báo cáo AI, KHÔNG tính vào độ chính xác nốt; micro / bàn phím ảo → "không đo".
- Không giả vờ có MIDI. `midiInput` dùng Web MIDI thật hoặc cầu nối native thật (bật ở Cài đặt → `midiEnabled`, tự kết nối khi mở app).
  Thiết bị mô phỏng chỉ để test / phát triển: mặc định tắt (`midiSimulator`), tên luôn có chữ "Mô phỏng".
  Bảng tương thích phần cứng ở docs/midi.md chỉ đánh dấu ✅ sau khi chạy checklist thủ công trên đàn thật.
  Safari và mọi trình duyệt trên iPad (WebKit) không có Web MIDI → báo "không hỗ trợ", dùng micro. MIDI trên iPad
  chỉ có qua app native (Core MIDI). Khi đàn MIDI đã nối, màn Luyện tập bỏ nốt từ micro (micro nghe chính tiếng đàn đó).
- Micro: chỉ một stream (`microphoneInput` singleton), tắt AGC/khử ồn/khử vọng, phải `stop()` để giải phóng track +
  đóng AudioContext. Khi app vào nền → tắt micro, người dùng bấm để bật lại (Safari cần user gesture).
- Cô giáo giọng nói: không nói lúc phát mẫu hay trong bài Biểu diễn / Tiết tấu (bé cần nghe nhịp); không đọc tên/thông tin
  của bé; phát qua `speechSynthesis` / `<audio>`, không qua AudioContext của tiếng đàn. Chưa kiểm thử trên iPad thật
  (e2e giả `speechSynthesis`: `e2e/voice-teacher.spec.ts`).
- Không gửi âm thanh hay dữ liệu ra ngoài; không thêm backend hay AI API trên mạng (dịch vụ đám mây).
  Ngoại lệ: **AI cục bộ qua Ollama** (`aiCoachEnabled`, mặc định TẮT) và Nhật ký Biểu diễn TẠM THỜI (cuối mục này).
  Chỉ gửi số liệu tóm tắt dạng chữ (điểm, tiêu chí, lỗi, tên/tuổi/trình độ hồ sơ), KHÔNG gửi âm thanh.
  App phải chạy đầy đủ khi tắt hoặc không có Ollama; lỗi kết nối chỉ hiện trong thẻ nhận xét, không chặn luồng học.
  `ollamaUrl` mặc định `"auto"` (giá trị cũ localhost tự đổi sang auto): thử `<base>ollama` trên server của app rồi tới
  `http://localhost:11434` (`resolveOllama`). `vite.config.ts` cho dev + preview proxy CHỈ `/ollama/api/{tags,chat}` → Ollama
  máy chạy server (bỏ header Origin; `OLLAMA_PROXY_TARGET`, `OLLAMA_PROXY=0`) → iPad trong LAN dùng chung AI của máy đó.
  GitHub Pages không có proxy → "auto" chỉ tìm Ollama trên chính máy mở app; Ollama ở máy khác trong LAN thì nhập `http://<IP>:11434`
  ở Cài đặt → AI (máy đó mở Ollama ra mạng: `OLLAMA_HOST=0.0.0.0` / "Expose Ollama to the network"; trang https gọi http IP LAN chạy được
  khi đã cấp quyền mạng cục bộ — thử Chrome 156). Cần mở khoá 2 chỗ (thiếu chỗ nào trình duyệt cũng chỉ thấy "lỗi mạng"): Chrome trên máy
  mở app cho phép truy cập mạng cục bộ (Chrome ≥ 142 chặn trang công khai gọi localhost / LAN) + Ollama trên máy cài đặt
  `OLLAMA_ORIGINS=https://<user>.github.io` (không thì 403). App nói đúng cách sửa theo nơi mở (`ollamaConnectHint`). Prompt yêu cầu model chỉ dựa
  vào số liệu được cung cấp; e2e giả lập Ollama bằng `page.route` (`e2e/ai-coach.spec.ts`).
  AI Piano Coach (`core/coach/ai`): AI không bao giờ tạo / sửa điểm; mặc định không gửi tên học viên (`aiShareName`, cài đặt riêng
  `vietpiano.coach.settings.v1`); không gửi log MIDI; câu trả lời coi là dữ liệu không tin cậy (schema + `verifyFeedback`) — `e2e/coach.spec.ts`.
  Nhật ký Biểu diễn (`core/performLog`, người dùng yêu cầu 08/11/2026 để điều tra Biểu diễn chấm sai nhiều; TẠM THỜI, cách gỡ ở
  docs/perform-log.md): chỉ gửi tới máy ghi của chính người dùng (`<base>__vplog` của server app, hoặc `npm run perflog` trong LAN nhập ở
  Cài đặt), KHÔNG gửi âm thanh; "auto" trên GitHub Pages / trình duyệt tự động không gửi (log nằm trên máy, tải file ở Cài đặt).
  Log có tên / tuổi hồ sơ + IP máy gửi (người dùng cần biết "người chơi nào, máy nào"); không đổi cách chấm — `e2e/perform-log.spec.ts`.
- Bài hát mới phải là giai điệu tự biên soạn hoặc thuộc phạm vi công cộng; ghi `source`.
  Test `lessons.test.ts` kiểm tra mọi ô nhịp đủ phách và giai điệu MIDI 36–88 (nhận diện tới C8; Canon in D lên Rê6 như bản in).
- VexFlow dùng entry `vexflow/bravura` (font nhúng → offline). Màu khuông nhạc qua `currentColor` + CSS
  (`.score-note.is-current` …) — không vẽ lại khi chuyển nốt.
- Màn Luyện tập: MỘT nút bàn phím xoay vòng Hiện → Tự ẩn → Ẩn (`keyboard-mode`, bề rộng cố định; = `showKeyboard` + `hideKeyboardWhilePlaying`,
  Tự ẩn cũng ở Cài đặt → Hiển thị). Tự ẩn: bàn phím trong suốt lúc đang đánh (cùng điều kiện `usePlayingNow`) nhưng VẪN GIỮ CHỖ
  (`invisible`, không gỡ khỏi layout → khuông không co giãn / nhảy); hết bài / chơi lại / nghe mẫu → hiện lại; không micro, không đàn MIDI
  (bàn phím ảo là nguồn nốt) → không ẩn.
- UI tiếng Việt, nút ≥ 48px cho cảm ứng, tối ưu iPad ngang, hỗ trợ dark mode (`.dark` trên `<html>`).
- Màn mới (hay bài / mục mới có màn riêng) phải theo khuôn chung của các màn sẵn có, không tự thiết kế lại:
  đầu trang = nút ← (`midiNav="back"`) · tiêu đề · … · 📌 `PinShortcutButton` · `FullscreenButton` (trò chơi + 5 ngón: dòng ghim trong ⚙);
  thêm đích vào registry lối tắt (`PAGES` / `PageId`, docs/shortcuts.md); đang chơi đàn → `usePlayingNow` (ẩn nút nổi micro);
  màn có `InputSourceBar` / bàn phím riêng thì loại khỏi `FloatingMicNote` trong `App.tsx`.
- Trò chơi: cài đặt của game LUÔN nằm trong màn chơi — vào thẳng màn chơi, nút ⚙ Cài đặt mở bảng đè lên màn chơi
  (không có màn cài đặt / màn chọn riêng trước khi chơi). Mở giữa ván → tạm dừng và bỏ qua nốt vào; đổi thứ làm thay đổi
  ván (bài, nốt mục tiêu, chế độ, độ khó…) → ván mới; lớp phủ "Sẵn sàng" / tổng kết có nút mở bảng cài đặt.
  Mẫu: Flappy Note, Bóng bay nốt nhạc, Săn nốt.
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
