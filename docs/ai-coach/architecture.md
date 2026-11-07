# AI Piano Coach — kiến trúc

Module mở rộng của VietPiano (KHÔNG phải dự án riêng): ghi lại màn biểu diễn trên đàn MIDI / bàn phím ảo, đối chiếu với bản nhạc,
chấm điểm bằng thuật toán kiểm chứng được, tô lỗi trên khuông, nhận xét bằng AI cục bộ (Ollama) và dẫn người học tới bài luyện sửa lỗi.

- Trạng thái task / milestone: [backlog.md](backlog.md) · Checklist thử thật: [acceptance-checklist.md](acceptance-checklist.md)
- Mã nguồn: `src/core/coach/` (logic thuần, có unit test), `src/screens/CoachScreen.tsx`, `src/components/coach/`, `src/hooks/useCoach*.ts`.
- Route `coach` (`?screen=coach`), mở từ trang chủ (nút "AI Piano Coach" ở cột thống kê).

## 1. Kết quả audit — tái sử dụng gì

| Đặc tả cần | Đã có trong VietPiano | Cách dùng |
| --- | --- | --- |
| Nhận MIDI Note On/Off, velocity, kênh, CC 64/66/67 thô | `core/midi/MidiEngine` (`midiInput`): `onNote` (velocity sau đường cong lực gõ), `onNoteOff`, `onPedal`, `onDetail` (mọi thông điệp thô: kênh, giá trị CC 0–127, phím thô, cổng) | Bộ ghi nghe `onNote` + `onNoteOff` + `onDetail` (CC thô). KHÔNG thêm lớp MIDI mới |
| Bàn phím ảo | `virtualInput` (press / release, không có lực gõ) | Nguồn ghi thứ hai; velocity = "không đo" |
| Micro | `microphoneInput` → nốt đơn, không Note Off, có RMS | M8: nguồn thử nghiệm, chỉ chấm giai điệu nốt đơn (quy tắc cũ) |
| Phím dùng để bấm nút không thành nốt | `consumedByMidiNav` (hooks/useMidiNav) | Bộ ghi bỏ các phím đó |
| Thiết bị mô phỏng / native bridge iPad | `SimulatedMidiBackend`, `NativeBridgeBackend` (`docs/midi.md`) | e2e + thử không cần đàn; iPad chỉ có MIDI qua app native |
| Bản nhạc có cấu trúc | `Lesson` (ký hiệu gọn "C4 D4/h", `accompaniment`, `harmony`, `pedal`, `dynamics`, `hairpins`), `lessonTimeline`, `pedalRanges`, `positions.ts`, `slice.ts` | `ScoreReference` dựng từ `Lesson` (nguồn chính). MusicXML → backlog |
| Chấm Biểu diễn đồng hồ cố định | `practice/PerformanceTracker` + `performPlan` (rubric 45/30/15/10 + 15/15) | Giữ nguyên. Coach là bộ chấm OFFLINE trên log gốc, dùng lại công thức `timingQuality`, `durationQuality`, `pedalQuality`, `dynamicsQuality`, `weightedScore` |
| Khuông nhạc, tô màu bằng CSS class | `score/ScoreRenderer` (`noteElements`, `accompanimentElements`, `noteCenters`) | `components/coach/CoachScoreView` gán class lỗi + ký hiệu + chú thích, không vẽ lại |
| Phát mẫu | `SoundOutput.playSequence`, `soundingNotes`, `sustainUnderPedal` | Phát lại bản chuẩn / bản người học (MIDI qua nhạc cụ ảo) |
| Luyện theo đoạn | `sliceLesson`, route `practice.measures` | Bài luyện sửa lỗi theo đoạn ô |
| AI cục bộ | `feedback/OllamaClient` (`resolveOllama`, proxy `/ollama` LAN), cài đặt `aiCoachEnabled/ollamaUrl/ollamaModel` | Provider Coach dùng cùng địa chỉ / model; thêm JSON có schema, timeout, retry |
| Hồ sơ người học ("tài khoản") | `profile/LearnerProfile` (localStorage, nhiều thành viên gia đình trên MỘT máy) | Mọi bản ghi Coach có `profileKey`; không có đăng nhập / phân quyền máy chủ |
| Lưu trữ | IndexedDB riêng từng mảng (`vietpiano`, `vietpiano-curriculum`, `vietpiano-ai-notes`) | DB riêng `vietpiano-coach` (không nâng phiên bản DB cũ) |

Không có: backend, tài khoản đăng nhập, API mạng, MusicXML, ký hiệu legato/staccato/dấu nối trong dữ liệu bài.

## 2. Quyết định (cần người dùng duyệt)

Theo quy ước của dự án, chỗ đặc tả lệch quy tắc cũ thì theo quy tắc cũ; các quyết định dưới đây ghi lại chỗ lệch / chỗ phải chọn.

| # | Quyết định | Lý do |
| --- | --- | --- |
| D1 | Không thêm backend, "database migration" = nâng phiên bản IndexedDB `vietpiano-coach` (hàm `upgradeCoachDb`) | CLAUDE.md: không backend, chạy offline |
| D2 | "Tài khoản" = hồ sơ người học trên máy. Tách dữ liệu theo `profileKey`; không có phân quyền giáo viên / phụ huynh → báo cáo cho phụ huynh = xuất file JSON / văn bản | Không có hệ thống đăng nhập |
| D3 | Trọng số Coach: Mode A 40/25/15/10/10 (theo đặc tả); Mode B 30/30/10/10/20; Mode C = Mode A + báo cáo tiến bộ. Rubric Biểu diễn của giáo trình / màn Luyện tập (45/30/15/10 + 15/15) GIỮ NGUYÊN, điểm Coach không ghi vào tiến độ giáo trình | Không đổi hành vi tính năng ổn định |
| D4 | Công thức con dùng lại của dự án: thời điểm (`timingQuality`), trường độ 0.6–1.25 trọn điểm (`durationQuality`), pedal (`pedalQuality`), sắc thái tương đối 3 dB (`dynamicsQuality`), đồng bộ hai tay ≤ 80 ms (`SYNC_MS`), thả phím lúc đạp pedal không tính thiếu trường độ | Ưu tiên công thức cũ |
| D5 | Micro (M8) chỉ chấm giai điệu nốt đơn, không trường độ, không pedal; không giả vờ đa âm | "Chỉ nhận diện một nốt tại một thời điểm" |
| D6 | Pedal chỉ chấm khi bài có ký hiệu pedal (không `pedalOptional`) VÀ phiên nhận được tín hiệu CC 64; người dùng chọn "bài này không dùng pedal" → chấm đạp thừa. Còn lại "chưa đủ điều kiện chấm" | Đặc tả 4.4 + `usePedalSeen` |
| D7 | Lực gõ tuyệt đối (so velocity mục tiêu) chỉ để tham khảo, không trừ điểm — mỗi đàn một đường cong lực gõ | Đặc tả 4.5 + `dynamics.ts` |
| D8 | Cài đặt riêng của Coach (chế độ chấm, metronome, timeout / retry AI, gửi tên cho AI) lưu ở localStorage `vietpiano.coach.settings.v1` như cài đặt trò chơi; địa chỉ / model Ollama dùng chung Cài đặt → AI | Không đụng `DeviceSettings` đang được phiên khác sửa |
| D9 | Mặc định KHÔNG gửi tên học viên cho AI (chỉ nhóm tuổi + trình độ); có công tắc. Không bao giờ gửi âm thanh / log MIDI thô | Bảo vệ dữ liệu trẻ em |
| D10 | Ký hiệu legato / staccato / dấu nối / dấu ngắt câu: dữ liệu bài chưa có → báo "bài không có ký hiệu, không chấm"; `RefNote.articulation` để sẵn cho nguồn MusicXML sau này | Không suy đoán |
| D11 | Xác thực AI qua LAN: proxy `/ollama` chỉ mở 2 API, chỉ trong mạng LAN của máy chạy server; mã truy cập (token) cho proxy để ở backlog (M4-T9, chờ duyệt vì đổi cấu hình server) | Không tự đổi cấu hình bảo mật |

## 3. Bốn thành phần

```
 midiInput.onNote/onNoteOff/onDetail ─┐
 virtualInput.press/release ──────────┼─▶ [A] PerformanceRecorder (core/coach/recorder) ──autosave──▶ CoachStorage (IndexedDB)
 (micro — M8, thử nghiệm) ────────────┘        log gốc: on/off/cc/mark, mốc thời gian nguyên bản
                                                       │ buildPerformance(): ghép nốt, pedal, ngân, tạm dừng, đồng hồ
 Lesson ──▶ referenceFromLesson ──▶ ScoreReference     ▼
                         └──────────────▶ [B] ScoringEngine (core/coach/scoring) ── thuần, có phiên bản, không LLM
                                            align (DTW nhóm nốt + khớp nốt theo cửa sổ) → tempo map
                                            → nốt / nhịp / trường độ / pedal / sắc thái / hai tay → ScoringResult (issues truy vết)
                                                       │
                     ┌─────────────────────────────────┼──────────────────────────────┐
                     ▼                                 ▼                              ▼
   [C] Teaching engine (core/coach/ai)        practice/recommend + plan        progress/compare (Mode C, M7)
   payload tóm tắt → Ollama JSON schema       ≤ 3 vấn đề → bài luyện 7 bước
   → validate + verify (không bịa) → fallback quy tắc
                     └──────────────▶ [D] CoachScreen + components/coach (UI, phát lại, tô khuông)
```

Ràng buộc: AI lỗi / mất kết nối không ảnh hưởng ghi + chấm; không gọi LLM trong đường MIDI thời gian thực (chỉ gọi sau khi chấm xong);
log gốc không bao giờ bị lượng tử hoá / sửa — mọi hiệu chỉnh (lệch đồng hồ, độ trễ, bỏ thời gian tạm dừng) chỉ áp lúc phân tích.

## 4. Mô hình dữ liệu (`core/coach/types.ts`)

| Thực thể | Nội dung chính |
| --- | --- |
| `PerformanceSession` | `id`, `profileKey`, `lessonId`, `lessonTitle`, `status` (recording · paused · completed · interrupted · aborted), `startedAt` (epoch), `updatedAt`, `endedAt`, `input` (nguồn, tên đàn, adapter, khả năng: noteOff / velocity / pedal), `targetBpm`, `mode`, `hand`, `measures`, `latencyMs`, `recorderVersion`, `eventCount` |
| `PerformanceEvent` (log gốc) | `k`: on · off · cc · mark; `t` = mốc nguồn − t0 (ms, số thực, không làm tròn), `rt` = lúc nhận (performance.now − t0); on/off: `n` (MIDI sau cấu hình đàn), `v`, `ch`, `raw`, `port`, `src`; cc: `c` (64/66/67/120/123), `v` 0–127; mark: start · pause · resume · stop · disconnect · reconnect · pedal-initial; `p = 1` nếu nhận lúc tạm dừng |
| `PerformanceNote` | ghép từ log: `onMs`, `offMs` (null = không biết), `heldMs`, `soundingEndMs` (ngân do pedal vang / sostenuto), `releasedUnderPedal`, `velocity` (null = không đo), `endedBy` (release · retrigger · stop · disconnect), thời gian theo "thời gian hoạt động" (đã bỏ khoảng tạm dừng) |
| `PedalEvent` / `PedalTrack` | thay đổi CC theo thời gian, khoảng đạp (≥ 64), độ sâu (half-pedal), `initialDown` (đạp sẵn trước khi ghi) |
| `ScoreReference` | `notes: RefNote[]` (id ổn định `m:i` / `h:i:k` / `a:i:k`, midi, phách, trường độ, tay, bè, ô in, phách trong ô, `scoreIndex` để tô khuông, sắc thái, velocity mục tiêu), `groups` (cùng phách), `measureStarts`, `pedal`, `dynamics`, `hairpins`, `targetBpm` |
| `NoteAlignment` | cặp (refId, perfId) + trạng thái correct · octave · wrong · missing · extra · repeated · simultaneous · order + thời điểm chuẩn / thực tế sau căn chỉnh, độ lệch, trường độ |
| `ScoringResult` | `total`, `criteria[]` (giá trị 0..1 / null, trọng số gốc + sau chia lại, điểm, điểm con, khấu trừ theo issue, lý do không đo), `issues[]`, `alignment[]`, `measures[]`, `tempo`, `hands`, `pedalInfo`, `dynamicsInfo`, `capabilities`, `confidence`, `engineVersion` / `weightsVersion` |
| `ScoringIssue` | `id`, tiêu chí, loại, mức độ, ô in + phách, refNoteIds / perfNoteIds, tay (right · left · unknown), kỳ vọng / thực tế, độ lệch, `deduction` (điểm /100 issue làm mất), `confidence`, `message` (câu tiếng Việt sinh theo quy tắc) |
| `AIFeedback` | `source` ai · rules, model, nội dung có cấu trúc (summary, strengths, priorities[issueRef], practiceSection, practiceTempo, nextExercise[recommendationRef], comparison), `verification` (bỏ câu nào, thay trường nào) |
| `PracticeRecommendation` | ≤ 3, theo thứ tự điểm bị mất; hành động: luyện đoạn (Coach / Luyện tập), từng tay, trò chơi đọc nốt, metronome chậm, pedal… |
| `PracticePlan` (PracticeProgress) | chuỗi 7 bước (tách đoạn → chậm → đúng N lần liên tiếp → tăng tempo → nới đoạn → cả bài → chấm lại), lần làm từng bước, bỏ qua / đổi bước |

## 5. API contract (module thuần)

```ts
// A — recorder
new PerformanceRecorder(meta, { now }) .start(t, {pedalDown}) .pause(t) .resume(t) .stop(t) .abort(t, reason)
  .noteOn({ midi, time, velocity?, channel?, raw?, port?, source, level? }) .noteOff({...}) .control({ controller, value, channel, time, port })
  .disconnect(t, info) .reconnect(t) .snapshot(): RecordedSession       // { session, events }
buildPerformance(recorded, { latencyMs }): BuiltPerformance            // notes, pedal tracks, pausedIntervals, clock
// B — scoring
referenceFromLesson(lesson, { hand, singleNotesOnly }): ScoreReference
scorePerformance(reference, built, { mode, targetBpm, capabilities, pedalRule, weights? }): ScoringResult   // thuần, tất định
// C — teaching
buildAiPayload(result, reference, ctx) · buildAiMessages(payload, uiMode) · parseAndVerify(text, payload): AIFeedback
ruleBasedFeedback(result, payload): AIFeedback · requestCoachFeedback(provider, payload, opts) (timeout, retry, fallback)
interface AiProvider { status(signal): Promise<AiStatus>; chatJson(messages, schema, { signal, timeoutMs }): Promise<string> }
// M6 / M7
recommendPractice(result, reference): PracticeRecommendation[] · createPlan(rec, ...) · applyAttempt(plan, result)
progressReport(results, n): ProgressReport · skillProfile(results)
// storage
coachStorage.saveDraft / finalizeSession / listSessions / listInterrupted / getEvents / saveResult / listResults / saveFeedback / savePlan / deleteSession / deleteProfileHistory / exportProfile
```

## 6. Lưu trữ — IndexedDB `vietpiano-coach`

| Store | khoá | index | nội dung |
| --- | --- | --- | --- |
| `sessions` | `id` | `profileKey`, `profileLesson` [profileKey, lessonId], `status` | metadata phiên (không có log) — liệt kê lịch sử nhẹ |
| `sessionEvents` | `sessionId` | — | log gốc (mảng `PerformanceEvent`), ghi cùng giao dịch với `sessions` |
| `results` | `id` = `${sessionId}|${engineVersion}|${mode}` | `sessionId`, `profileLesson`, `profileKey` | `ScoringResult`; chấm lại bằng phiên bản mới thêm bản ghi mới, không xoá bản cũ |
| `feedback` | `id` | `resultId`, `profileKey` | `AIFeedback` (AI hoặc quy tắc) |
| `plans` | `id` | `profileKey`, `profileLesson` | `PracticePlan` + tiến độ từng bước |

Migration: `upgradeCoachDb(db, oldVersion)` chạy tuần tự từng phiên bản (v1 tạo mọi store). Phiên bản sau chỉ THÊM store / index;
đổi dạng dữ liệu → đọc bản cũ qua `sanitize*` (không ghi đè dữ liệu người dùng lúc nâng cấp). IndexedDB lỗi → bộ nhớ tạm (như các kho khác).

Khôi phục: trong lúc ghi, log được lưu nháp mỗi 3 giây (`status` recording / paused). Mở lại Coach thấy phiên dở dang → "Chấm phần đã ghi"
(đánh dấu `interrupted`) hoặc "Bỏ phiên này" (người dùng bấm mới xoá).

## 7. Thuật toán chấm (Scoring Engine `1.0.0`)

**Chuẩn hoá biểu diễn.** Ghép On/Off theo (nguồn, cổng, kênh, phím); Note On lặp khi phím chưa thả → đóng nốt cũ (`retrigger`); Note Off mồ côi
bị bỏ (log vẫn giữ). Mốc thời gian: dùng mốc của nguồn + độ lệch ước lượng so với lúc nhận (trung vị `rt − t`; dao động > 30 ms → dùng `rt`).
Bỏ khoảng tạm dừng khỏi trục thời gian. Trừ `latencyMs` (micro 60 ms). Ngân: thả phím lúc pedal vang đạp → ngân tới lúc nhả pedal;
sostenuto giữ các nốt đang giữ phím lúc đạp. Đạp sẵn trước khi ghi: lấy trạng thái pedal của app lúc bấm Bắt đầu, hoặc suy ra khi tín hiệu pedal đầu tiên là "nhả".

**Căn chỉnh (không so theo thứ tự).**
1. Nhóm bản nhạc theo phách (hợp âm / hai tay = một nhóm); gom nốt đánh thành cụm theo onset (cửa sổ 25–70 ms theo nốt ngắn nhất).
2. DTW giữa dãy nhóm và dãy cụm, chi phí = 1 − độ giống tập cao độ (đúng phím 1, đúng tên khác quãng 0.5, lệch ≤ 2 nửa cung 0.25), phạt bước ngang / dọc
   → chịu được nhanh / chậm, bỏ nốt, thừa nốt, hợp âm rải, hai tay lệch.
3. Mốc neo (nhóm khớp tốt trên đường DTW, có ít nhất một phím đúng) → giữ dãy tăng đơn điệu dài nhất → bản đồ phách → ms tuyến tính
   từng đoạn. Nhóm nằm trong chuỗi lặp giống hệt (C C C C) KHÔNG làm mốc thô (chỉ nhìn cao độ thì không biết nốt nào bị bỏ);
   tempo dự phòng = Theil–Sen trên mọi mốc (bền với mốc nhầm, không phụ thuộc tempo mục tiêu).
4. Khớp từng nốt: mỗi nhóm có 1–3 thời điểm dự đoán (nội suy giữa hai mốc + ngoại suy từ mốc trái / phải theo tempo kề bên — phủ
   chỗ ngắt nằm giữa hai mốc). Cửa sổ = 75% khoảng tới nhóm kề, trong [120, 2000] ms. (a) Đúng phím: quy hoạch động ĐƠN ĐIỆU theo
   từng cao độ (nốt lặp không bị bắt chéo); (b) đúng tên khác quãng tám (≤ 60% cửa sổ, ≤ 700 ms); (c) nốt sai gần nhất (≤ 12 nửa
   cung, ≤ 50% cửa sổ, ≤ 500 ms). Dựng lại bản đồ từ các nốt đúng phím, khớp lần hai.
5. Nốt thừa: lặp phím vừa đánh (≤ max(250 ms, ½ phách)) → `repeated`; trùng cụm của nhóm đã khớp → `simultaneous`; còn lại `extra`.
   Hai nốt đơn liền nhau bị đảo thời gian / đánh tráo → `order`.
6. Ngắt quãng: khoảng giữa hai nhóm > max(2 × kỳ vọng, kỳ vọng + 700 ms) → cắt đoạn, issue `hesitation`; tempo map không vắt qua chỗ ngắt.

**Tiêu chí** (giá trị 0..1 = 1 − Σ khấu trừ; mỗi khấu trừ gắn một issue → truy vết được):

| Tiêu chí | Công thức |
| --- | --- |
| Chính xác nốt | mỗi nốt bản nhạc 1/N: sai / thiếu 1, sai quãng tám 0.5, sai thứ tự 0.5; nốt thừa 0.5/N, đánh lặp 0.25/N |
| Nhịp điệu | điểm con: thời điểm (lệch so với tempo cục bộ bỏ-một-ra trong ±1 ô — hồi quy bậc hai khi có ≥ 2 láng giềng mỗi phía để bám tempo đổi dần, tuyến tính 3 láng giềng gần nhất + dung sai ×1.5 ở đầu / cuối đoạn; lượt hai bỏ điểm lệch > 2.5× dung sai; `timingQuality` trọn điểm ≤ 10% phách (50–120 ms), 0 ở 3×) · tempo so mục tiêu (±8%, 0 ở ±40%) · ổn định tempo giữa các ô (CV ≤ 6% trọn, 0 ở 30%) · liên tục (mỗi chỗ ngắt −0.34) · đồng bộ hợp âm (≤ 60 ms) / hai tay (≤ 80 ms). Mode A 0.5/0.15/0.15/0.1/0.1 |
| Trường độ | `durationQuality(giữ / kỳ vọng)` (0.6–1.25 trọn điểm); thả lúc đạp pedal → tỉ lệ ≥ 1; chỉ nốt có Note Off |
| Pedal | `pedalQuality` trên trục phách (qua tempo map) + issue: thiếu, đạp sớm / muộn, nhả sớm / muộn, không thay pedal khi đổi hợp âm, đạp thừa, giữ liên tục |
| Sắc thái | tương phản giữa các đoạn p / f (`dynamicsQuality`, 3 dB) 0.4 · cresc./dim. (xu hướng ≥ 3 dB) 0.15 · đều lực trong đoạn (độ lệch chuẩn ≤ 2.5 dB trọn, 0 ở 7 dB) 0.3 · giai điệu nổi hơn đệm (≥ +1 dB trọn, 0 ở −3 dB) 0.15 |

Mode B: dung sai thời điểm ×1.5, tempo ±20% (0 ở ±60%), cửa sổ tempo cục bộ ±2 ô, điểm con nhịp 0.3/0.1/0.25/0.2/0.15.
Tiêu chí không đo được (thiếu Note Off, velocity, pedal, ký hiệu) → `null`, trọng số chia lại theo tỉ lệ, ghi lý do. Tổng = Σ trọng số hiệu dụng × giá trị.
Độ tin cậy: tỉ lệ nhóm neo được < 40% → kết quả đánh dấu "không đối chiếu được (có thể chơi bài khác)".

## 8. AI Teaching Engine

- Provider: `OllamaProvider` (địa chỉ "auto" = proxy `/ollama` của server app → localhost, như Cài đặt hiện có), model theo Cài đặt,
  timeout (mặc định 60 s) + retry có giới hạn (mặc định 1), `status()` cho đèn trạng thái. Interface mở để thêm provider cục bộ khác.
- Payload chỉ có số liệu tóm tắt: bài, chế độ, điểm từng tiêu chí, ≤ 8 lỗi nặng nhất (mã `I…`), ô cần xem, tempo, pedal / sắc thái / hai tay, gợi ý luyện (mã `R…`),
  lịch sử gần đây (Mode C), nhóm tuổi + trình độ (tên chỉ khi bật). Không gửi log MIDI, không gửi âm thanh. UI có nút "Xem dữ liệu gửi cho AI".
- Đầu ra: JSON theo schema (Ollama `format`), kiểm tra kiểu + độ dài; **xác minh**: `issueRef` / `recommendationRef` phải có trong payload, đoạn luyện phải nằm trong bài
  và chứa ô có lỗi, tempo luyện trong [40%, 100%] tempo mục tiêu, mọi "ô N", số ms / BPM / % và tên nốt trong câu chữ phải có trong số liệu — câu sai bị bỏ,
  trường rỗng → thay bằng câu theo quy tắc. Điểm số luôn lấy từ engine, AI không trả điểm.
- Fallback: `ruleBasedFeedback` sinh cùng cấu trúc từ kết quả chấm, luôn có kể cả khi tắt AI.
- Trạng thái kết nối (`ai/link.ts` `AiLinkMonitor`, hook `useCoachAiLink`): MỘT bộ theo dõi cho cả màn Coach — kiểm tra ngay khi mở màn, rồi định kỳ
  (đã kết nối: 30 s; chưa kết nối / thiếu model: 15 s), timeout 5 s mỗi lần, dừng khi app ẩn / rời màn, kiểm tra lại khi có mạng lại hoặc người dùng bấm.
  Mỗi lần CHỈ `GET /api/tags` (danh sách model) — không gửi dữ liệu học viên, không gọi model. Trạng thái: tắt / đang kiểm tra / đã kết nối /
  thiếu model / chưa kết nối (đã từng kết nối → "mất kết nối"); đổi trạng thái thì ghi `console` (chẩn đoán). Chỉ để hiển thị: nhận xét sau khi chấm
  vẫn tự gọi AI và tự dùng nhận xét theo quy tắc khi lỗi.

## 9. Giao diện (route `coach`)

1. **Chuẩn bị**: chọn bài (Thư viện + bài hát), chế độ A/B/C, nguồn (đàn MIDI / bàn phím ảo / micro thử nghiệm), trạng thái kết nối, kiểm tra pedal
   (đạp thử → "đã nhận"), tempo + metronome + đếm vào, đoạn ô / tay; phiên dở dang (khôi phục).
2. **Đang ghi**: khuông nhạc + con trỏ (bám vị trí nhẹ, không phải engine chấm), bàn phím ảo tô phím đang giữ, đèn ghi, ô hiện tại / tổng số ô,
   số nốt đã ghi, Tạm dừng / Tiếp tục / Kết thúc; hàng thứ hai: nguồn vào + pedal và chip **trạng thái AI cục bộ** (ký hiệu + chữ + màu, bấm = kiểm tra lại;
   hai hàng cố định → chữ trạng thái đổi độ dài không làm khuông nhảy). Không gọi AI (chỉ kiểm tra kết nối).
3. **Kết quả**: tổng /100, biểu đồ tiêu chí, đếm đúng / sai / thiếu / thừa, ô cần chú ý, lỗi pedal, nhận xét (AI hoặc quy tắc), bài luyện đề xuất,
   phát lại (bản người học / bản chuẩn / A-B / chỉ đoạn lỗi / chậm), luyện lại đoạn sai, so với lần trước. Khuông tô: xanh đúng, vàng lệch thời điểm / trường độ,
   đỏ sai / thiếu, "+" đỏ nốt thừa, tím lớp pedal — kèm ký hiệu ✓ ⏱ ✗ + P và chú thích (không chỉ màu). Chạm nốt / ô → chi tiết + nghe lại đoạn.
4. **Lịch sử**: các lần chấm của hồ sơ, so sánh 3/5/10 lần, lỗi tái diễn, tempo đạt được, xuất báo cáo, xoá lịch sử (hỏi xác nhận).

## 10. Thiết bị, bảo mật, giới hạn

- Web MIDI: Chrome / Edge máy tính. iPad (Safari, mọi trình duyệt WebKit) KHÔNG có Web MIDI → chỉ qua app native (Core MIDI, `NativeBridgeBackend`, chưa build).
- Không tuyên bố có pedal / velocity khi nguồn không gửi: bàn phím ảo không có lực gõ / pedal; đàn MIDI chưa gửi CC 64 trong phiên → pedal "chưa đủ điều kiện".
- Dữ liệu chỉ trên máy; xoá lịch sử theo hồ sơ; đầu vào / đầu ra AI coi là không tin cậy (kiểm schema, xác minh, không chèn HTML); timeout + fallback;
  không mở cổng ra Internet (proxy chỉ 2 API của Ollama, server dev / preview chỉ chạy trong LAN).
- Chưa kiểm thử trên đàn MIDI thật / iPad thật — xem [acceptance-checklist.md](acceptance-checklist.md).

## 11. Module âm thanh (M8 — thiết kế, thử nghiệm)

Mục tiêu: chấm được khi KHÔNG có đàn MIDI (đàn cơ, iPad Safari). Nguyên tắc của dự án vẫn giữ: micro chỉ nhận MỘT nốt mỗi lúc,
không giả vờ đa âm; MIDI scoring không bị ảnh hưởng (micro là một nguồn khác cùng đi qua `PerformanceRecorder`).

| Bước | Hiện có / đã nối | Việc còn lại |
| --- | --- | --- |
| Thu âm + cao độ + onset | `AudioInput` → `PitchDetector` (YIN) + `AttackAnalyzer` (FFT) → `NoteRecognizer` (nốt đơn, chống âm ngân / hoạ âm) | — |
| Ghi | `useCoachRecorder` nghe `microphoneInput` (nguồn "Micro" ở màn chuẩn bị): Note On + RMS (`lv`), bỏ nốt lúc app đang phát; bù trễ 60 ms khi phân tích | Đo độ trễ thật của từng máy (căn chỉnh) thay cho 60 ms cố định |
| Bản nhạc | `referenceFromLesson(..., { singleNotesOnly: true })`: hai tay → chỉ giai điệu; tay trái → chỉ nốt đệm đơn | — |
| Chấm | Cùng Scoring Engine: nốt + nhịp; trường độ / pedal "không đo"; lực đánh chỉ tương phản p ↔ f (RMS tương đối); độ tin cậy tối đa "trung bình" | Ước lượng độ tin cậy từng nốt từ `confidence` của YIN |
| Phân biệt độ chính xác | Kết quả ghi `input.source` + `confidence.overall`; UI ghi "Micro (thử nghiệm — chỉ nốt đơn)" | Báo cáo tách điểm MIDI / micro khi so tiến bộ |
| Đa âm | — | Nghiên cứu riêng (NMF / mô hình học sâu chạy cục bộ), CHƯA đưa vào app; cần quyết định sản phẩm vì đi ngược quy tắc "một nốt mỗi lúc" |
