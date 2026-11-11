# Bản đồ kiến trúc VietPiano

Chi tiết từng module: file, hàm, route, quy tắc riêng. Tách nguyên văn từ `CLAUDE.md` ngày 07/11/2026 để CLAUDE.md gọn
(CLAUDE.md được nạp vào mọi request của Claude Code; file này chỉ đọc khi cần).

- Trước khi sửa một module: đọc mục của module đó (tìm theo tên thư mục, vd `midi/`, `coach/`, `balloonPop/`).
- Thêm / đổi module: cập nhật mục tương ứng ở đây; CLAUDE.md chỉ giữ mục lục một dòng.
- Lệnh, nguyên tắc chung (Wait Mode, micro, MIDI, quyền riêng tư, trò chơi…) và quy ước: xem `CLAUDE.md`.

```
src/core/            ← logic thuần TypeScript, KHÔNG import React; mọi thứ ở đây phải có unit test
  music/notes.ts           tần số ↔ MIDI ↔ tên nốt (C4, Đô4), cents
  music/keySignature.ts    hoá biểu ("Dm", "Em"…) + dấu hoá cần vẽ trong ô nhịp (bất thường, dấu hoàn)
  music/pedal.ts           pedal vang: khoảng đạp theo phách, chấm đạp / nhả theo ký hiệu (`pedalQuality`), ngân khi phát mẫu
  music/dynamics.ts        sắc thái p…f: lực gõ phát mẫu + điểm "Mạnh – nhẹ" TƯƠNG ĐỐI giữa đoạn liền kề
                             (MIDI velocity / RMS micro lúc nhận nốt; bàn phím ảo → không đo) — cấp 6
  audio/AudioInput.ts      getUserMedia + AudioContext + AudioWorklet (singleton, dọn dẹp đầy đủ)
  audio/capture-processor.js  AudioWorklet (JS thuần) gửi khung 2048 mẫu mỗi hop 1024
  audio/PitchDetector.ts   YIN → { frequency, confidence, rms }
  audio/AttackAnalyzer.ts  FFT; onset phổ + cao độ của phần phổ MỚI → nhận nốt gõ đè âm ngân (pedal)
  audio/fft.ts             FFT radix-2 → phổ biên độ
  audio/NoteRecognizer.ts  khung cao độ → sự kiện noteOn (ổn định + onset, chống âm ngân/hoạ âm)
  input/NoteInputProvider.ts  interface nguồn nốt (microphone | virtual | midi)
  input/MicrophoneInputProvider.ts  AudioInput → PitchDetector + AttackAnalyzer → NoteRecognizer
  input/VirtualInputProvider.ts     bàn phím ảo / bàn phím máy tính (demo mode)
  input/MIDIInputProvider.ts        `midiInput` — giữ tên + API cũ, toàn bộ xử lý ở `core/midi/MidiEngine` (xem dưới)
  midi/                    Universal MIDI (docs/midi.md): MỌI màn chỉ nghe `midiInput`, không chạm thiết bị / hãng.
                             `backends/` adapter chỉ chuyển byte + danh sách cổng: `WebMidiBackend` (Chrome/Edge), `NativeBridgeBackend`
                             (app vỏ iPad Core MIDI / Windows WebView2, giao thức JSON v1, cờ `__VIETPIANO_NATIVE_MIDI__`),
                             `SimulatedMidiBackend` (thiết bị mô phỏng cho test / Cài đặt → "Đàn MIDI mô phỏng"), `CompositeBackend`
                             (mở song song); `platform.ts` chọn adapter. `MidiEngine`: `MidiByteParser` (running status) → cấu hình từng
                             đàn (`deviceConfig.ts`: bật/tắt, kênh, số phím / dải, transpose, quãng tám, đường cong lực gõ, tiếng; lưu theo
                             TÊN đàn `deviceConfigStore.ts`) → noteOn / noteOff / pedal (chỉ khi đổi trạng thái); chống kẹt phím (rút đàn /
                             đổi cấu hình / stop → Note Off + nhả pedal); tự kết nối lại sau lỗi. `deviceProfiles.ts` nhận dạng hãng / số phím /
                             có loa CHỈ để gợi ý mặc định. `MidiSoundMonitor` + `soundOutput.live*`: tiếng piano khi controller không loa
                             (không đụng `isPlayingUntil`). UI: `components/midi/MidiDeviceManager` + `MidiSignalTest` (Cài đặt → Đàn MIDI).
                             `appMidi.ts`: thiết bị mô phỏng (`window.__vietpianoMidiSim`), tiếng piano. App iPad: `native/ios/` (tham khảo, chưa build)
  input/midiNav.ts                  đàn MIDI bấm nút khi màn KHÔNG nghe nốt: phím trắng bất kỳ / đạp pedal → nút `midiNav="forward"`
                                    (Tiếp, Bắt đầu, Chơi lại…), phím đen → `midiNav="back"` (Trước, Về…; chờ 200 ms: hai phím đen bất kỳ
                                    cùng lúc → Trang chủ, chỉ ở màn có nút điều hướng đang hiện); bỏ phím 1,2 s sau khi nút hiện,
                                    sau mỗi lần điều hướng, sau mỗi lần chạm màn hình — mọi mốc đo bằng `performance.now()` lúc NHẬN phím, không
                                    dùng `e.time` (mốc Web MIDI do driver gắn, đàn thật có thể lệch xa → kẹt trang). `useNoteInput` mặc định = đang nghe nốt (chặn điều hướng);
                                    lớp phủ Sẵn sàng / tạm dừng / tổng kết của game truyền `listening: false`. Glue: `hooks/useMidiNav.ts`,
                                    prop `midiNav` của `Button` (mỗi màn tối đa một nút mỗi loại; nút sau cùng hiện + không bị hộp thoại che được ưu tiên)
                                    Phím đã bấm nút KHÔNG thành nốt của màn (nút có thể đổi màn ngay trong lúc phát phím, vd "Bắt đầu" → ván đang chơi):
                                    `consumedByMidiNav` đánh dấu, `useNoteInput` bỏ qua; điều hướng gắn trước mọi màn nghe nốt nên luôn nhận phím trước
  practice/PracticeEngine.ts  Wait Mode (máy trạng thái thuần); `advanceOnWrong` = chế độ Đếm nốt (sai vẫn đi tiếp, ghi 'wrong')
  practice/TempoFollower.ts   chế độ chạy theo nhịp: đồng hồ nhịp tự chạy, khớp pha + nhịp độ theo onset, KHÔNG xét cao độ
  practice/listenSample.ts    nút "Nghe mẫu" màn Luyện tập: phát từ đầu ô nhịp đang tập (hai tay + ngân theo pedal), con trỏ theo tiếng đàn,
                             lúc phát bỏ mọi nốt vào (hook `useListenSample`)
  practice/handPractice.ts    chọn tay ở màn Luyện tập cho mọi bài khuông đôi (Hai tay / Tay phải / Tay trái, `practiceHand`;
                             bài hai tay thay phiên `bh-*`: mỗi tay = các nốt của tay đó, micro chấm được cả hai tay):
                             "dòng tập" = bước cho PracticeEngine / TempoFollower + chỉ số nốt trên khuông (`staff` melody | accompaniment);
                             tay trái: mỗi nốt / hợp âm đệm một bước (nốt thấp nhất = nốt chính, còn lại chấm như phần tay trái),
                             micro → bỏ hợp âm (`skippedChords`), toàn hợp âm → không tập được, về tay phải; tay kia làm mờ
                             (`ScoreView dim`), nốt tay kia bỏ qua (`isMelodyMidi` / `isAccompanimentMidi`). Phiên một tay ghi `hand`,
                             không tính hoàn thành bài (`applySession`). Giáo trình không có chọn tay
  practice/NoteStats.ts       thống kê từng nốt trong phiên (suy từ PracticeState): tốc độ đọc nốt, đúng/sai + nốt nhầm
  lessons/                 kiểu dữ liệu, ký hiệu gọn "C4 D4/h", thư viện bài, LessonManager
                             `repertoire.ts` 50 bài khuông đôi (`rep-*`, `Lesson.repertoire`): giai điệu + dòng hợp âm mỗi ô + kiểu đệm → `buildAccompaniment` dựng tay trái và pedal
                             (thay mỗi ô một hợp âm; ô đổi hợp âm giữa chừng và ô lấy đà không đạp). Chỉ hiện ở trang Thư viện bài hát (`screens/SongLibraryScreen`,
                             route `song-library`, `?screen=song-library`, mở bằng chữ "Bài hát" ở Thư viện bài)
                             `arrangements/` bài nhiều bản phối theo cấp (docs/happy-birthday.md): `happyBirthday.ts` 3 bài `song-happy-birthday-{beginner,intermediate,advanced}`
                             (`Lesson.arrangement` = họ + cấp 1–3, mỗi cấp tiến độ riêng; vị trí trong dữ liệu ghi [ô in, phách] → `noteIndexAt`), lộ trình 5 bước / cấp,
                             `index.ts` họ bản phối (`familyLessons`, `recommendedLevel` = cấp thấp nhất chưa vững ≥ 90%, `nextLevel`), `planProgress.ts` (localStorage).
                             Trường tuỳ chọn mới của Lesson: chùm nốt tay phải `LessonNote.harmony` (ký hiệu "E4+C5/h:1+5", nốt CAO NHẤT là giai điệu, chung trường độ),
                             `chordSymbols`, `hairpins` (cresc./dim.: vẽ + nghe mẫu, không chấm), `PedalMark.fromBeat/toBeat` (đổi pedal giữa ô), `pedalOptional` (vẽ, không chấm),
                             `tempoRange`, `slice`. `positions.ts` số ô in ↔ phách ↔ chỉ số nốt; `slice.ts` cắt đoạn ô (luyện theo đoạn, route `practice.measures`)
  practice/PerformanceTracker.ts  Biểu diễn / Tiết tấu của giáo trình: đồng hồ nhịp CỐ ĐỊNH, chấm cao độ + thời điểm + trường độ (Note Off), dấu lặng
                           + pedal (`handlePedal`, chỉ đàn MIDI CC 64) khi bài có ký hiệu pedal. Hợp âm / hai tay: cửa sổ theo MỐC phách (nốt cùng phách chung
                           cửa sổ), ưu tiên phím đúng trong chùm, `debounceSamePitch` chỉ bỏ onset lặp cùng phím — bài một dòng chấm y như trước
  practice/performPlan.ts  chế độ "Biểu diễn" màn Luyện tập (`practiceMode: 'perform'`, hook `usePracticePerformance`): danh sách nốt cần chấm theo tay +
                           nguồn vào (micro → chỉ nốt đơn), tổng kết = rubric Biểu diễn giáo trình + điểm từng tay + đồng bộ hai tay (≤ 80 ms) + ô nhiều lỗi
  practice/waitBreakdown.ts  Chờ / Đếm nốt: điểm từng tay (`WaitTally`, suy từ trạng thái engine trước / sau mỗi phím) + lỗi theo ô (lưu `PracticeSession.measureErrors`
                           → "đoạn hay sai" ở nút Đoạn). Pedal màn Luyện tập: "không đo" tới khi đàn gửi tín hiệu pedal đầu tiên (`hooks/usePedalSeen`)
                           Bộ đếm đúng/sai đầu màn Luyện tập (`components/practice/NoteCounter`, mọi chế độ): bấm vào để ẩn / hiện, `hideNoteCounter`
                           (cũng ở Cài đặt → Hiển thị; nhớ cho mọi bài, Chơi lại / tạm dừng / bài khác giữ nguyên). CHỈ ẩn con số — engine, thống kê phiên,
                           điểm, tiến độ KHÔNG đọc cài đặt này; bật lại giữa bài hiện ngay số tích luỹ. Hết bài hộp thoại kết quả luôn hiện đủ: Chờ / Đếm nốt
                           tổng nốt đã đánh (= đúng + sai, mẫu số `computeAccuracy`) / đúng / sai / bỏ qua / độ chính xác / sao; Biểu diễn nốt đã đánh / đúng /
                           sai / bị lỡ (`PerformanceTracker.result()`) + điểm; Theo nhịp như cũ (không chấm cao độ). Giáo trình không có bộ đếm này
  curriculum/              giáo trình (xem docs/curriculum.md): Curriculum → Level → Week → Lesson → Activity/Exercise
    content/                 CHỈ dữ liệu (cấp 1–6: mỗi cấp 20 buổi; `helpers.ts` hàm dựng chung);
                             `extraPractice` = bài thư viện luyện thêm (gộp từ khoá học cũ)
                             `supplement.ts` giáo trình bổ sung "Làm quen từng nốt" (`SUPPLEMENT`, route `supplement`,
                             `?screen=supplement`): mỗi buổi MỘT nốt = giới thiệu (hình bàn phím có nút 🔊 `listen`) → câu đố
                             chọn hình (`ChoiceQuestion.optionImages`: thẻ bàn phím mini không tên phím `noLabels` / khuông /
                             bàn tay tô ngón `highlight`; `retry` = sai chọn lại) → luyện phím (key-quiz) → bé tự chọn trò
                             (`SUPPLEMENT_GAMES`, `components/curriculum/SupplementGames`: Bóng bay kiểu Tìm nốt mở bằng route
                             `balloon-pop` + `preset` / `returnTo`, hoặc trò trong app qua `GamePlayer`; không tính điểm buổi).
                             Chạy bằng LessonPlayer (lessonId "sup-…", không có Luyện tập sau buổi); tiến độ chung kho
                             `curriculumStore` nhưng không ảnh hưởng gợi ý mở khoá cấp 1–6. Đủ 7 nốt trắng (`sup-c` … `sup-b`) sinh từ
                             MỘT khuôn `noteLesson` + bảng `SUPPLEMENT_NOTES` (chỉ phần riêng từng nốt). Sửa bài → sửa khuôn
                             (mọi nốt cùng đổi), không sửa riêng một nốt, rồi ghi nhật ký `docs/supplement.md`;
                             `npm run voice` đọc cả giáo trình này
                             `discovery.ts` "Khám phá nốt nhạc" (`DISCOVERY`, route `note-discovery`, `?screen=note-discovery`,
                             docs/note-discovery.md): CÙNG phương pháp "Làm quen từng nốt" nhưng TÍCH LUỸ — 11 buổi "nd-…":
                             bàn phím (nhóm 2/3 phím đen, trầm – bổng, đố nghe cao/thấp) → Đô … Si (khuôn `noteLesson`: 1 nốt mới
                             + câu đố / luyện phím xen nốt đã học) → đọc khuông Đô giữa → Đô cao → giai điệu (Wait Mode) → ôn tập.
                             KHÔNG dạy trường độ. Dữ kiện nốt + hàm dựng câu đố dùng chung `supplement.ts` (`SUPPLEMENT_NOTES`).
                             `guided.ts`: giáo trình dẫn dắt (sup- / nd-) cho LessonPlayer — màn về, nhãn, trò của buổi (`SupplementGames`)
                             `learnedNotes.ts` (thư mục curriculum/): nốt đã học = buổi nốt đã đạt ở hai giáo trình → gợi ý nốt Bóng bay, độ khó cà chua
    validate.ts              kiểm tra dữ liệu (đủ phách, tầm micro, tiên quyết, đáp án) — test chạy cho toàn giáo trình
    piece.ts / QuizEngine.ts / scoring.ts / unlock.ts / progress.ts  bản nhạc→dòng thời gian/MIDI, bài nhiều lượt, rubric, gợi ý mở khoá, tiến độ
    review.ts                Luyện tập sau buổi: tự sinh từ bài tập của buổi (bài yếu nhất, trộn lượt, hỏi thêm nốt hay nhầm);
                             + 1 bài ngắn ôn cộng dồn từ buổi đã học gần đây (`cumulativeExercise`, đặt đầu tiên);
                             weight 0 → không đổi điểm/trạng thái đạt. Luồng buổi: kết quả → Luyện tập → Trò chơi → buổi tiếp
  games/                   trò chơi sau buổi, máy trạng thái thuần (thời gian truyền vào): `gamesForLesson` suy 2 trò/buổi từ nội dung
                             (trò chính theo kỹ năng + EchoMelody; + "Đố số ngón tay" nếu buổi có hình thế tay — dùng KeyHuntGame,
                             bỏ hình có ngón lặp như gam luồn ngón); kỷ lục lưu theo loại trò (`LessonRecord.games`).
                             NoteCatchGame "Hứng nốt rơi" (mỗi sự kiện hứng tối đa 1 nốt, `graceMs` bù trễ micro; `golden` ×2 điểm) —
                             dùng lại cho "Bắn bóng trên khuông" (bài đọc nốt, nốt vẽ sẵn SVG một lần, không tên nốt); KeyHuntGame "Săn phím";
                             RhythmTrainGame "Đèn giao thông tiết tấu" (bài tiết tấu, không xét cao độ, gõ vào dấu lặng = phanh);
                             EchoMelodyGame "Giai điệu bí ẩn" (luyện tai; bỏ nốt trong lúc app phát).
                             Mục Trò chơi (`screens/GamesScreen`, tab Theo trò / Theo buổi học): `catalog.ts` (thông tin trò,
                             chỉ mục trò của mọi buổi, `specSummary` chú thích nội dung; mọi buổi đều mở, buổi chưa học có nhãn).
                             Trò tự do (`ArcadeGameSpec`, mức chơi soạn sẵn ở `arcade.ts`, kỷ lục localStorage theo hồ sơ):
                             NoteSprintGame "Đua đọc nốt 60 giây" (sai trừ giây), EarFinderGame "Nghe nốt đoán phím" (cao hơn/thấp hơn),
                             "Thám tử quãng" (`intervals.ts` + KeyHuntGame), SteadyBeatGame "Giữ nhịp tim" (chấm khoảng giữa các lần gõ)
  noteHunter/              "Săn nốt" (`screens/NoteHunterScreen`, route `note-hunter`, `?screen=note-hunter`): bản nhạc tự chạy,
                             DỪNG ĐÚNG phách đầu mỗi nốt mục tiêu (người chơi chọn nốt, so theo MIDI) tới khi đánh đúng.
                             `songs.ts` bài = Lesson (3 bài riêng + bài hát một bè của thư viện) → `HunterNote` qua `lessonTimeline`
                             (một nguồn cho khuông nhạc, trình phát, game); `MusicTransport` đồng hồ phách; `NoteHunterGame` máy trạng thái
                             IDLE/PLAYING/WAITING_FOR_NOTE/PAUSED/COMPLETED, chế độ wait/note/rhythm, chỉ nhận noteOn MỚI (phím giữ từ trước
                             không tính, `earlyGraceMs`, `minRepeatMs`); `AudioScheduler` lên lịch trước ngắn, không vượt `stopBeat()`,
                             tạm dừng huỷ nốt; nốt mục tiêu không tự phát. Micro: `useNoteInput({ playbackGuard: false })` + `isLikelyEcho`
                             (bỏ nốt trùng/hoạ âm nốt app đang phát; tuỳ chọn tai nghe). Kết quả: localStorage theo hồ sơ (`storage.ts`).
                             Một màn duy nhất: vào thẳng màn chơi (lớp phủ "Sẵn sàng" + Bắt đầu), bảng ⚙ Cài đặt mở trên màn chơi
                             (bài, nốt mục tiêu, cách chơi, nguồn nốt, lần chơi gần đây; mở giữa ván → tạm dừng, bỏ nốt; đổi bài / nốt /
                             cách chơi → ván mới, đổi tốc độ → `setTempo` giữ vị trí)
  flappyNote/              "Flappy Note" (`screens/FlappyNoteScreen`, route `flappy-note`, `?screen=flappy-note`): chim rơi theo trọng lực,
                             mỗi nốt ĐÚNG = một lần vỗ cánh + sang nốt kế (tối đa 1 nốt/sự kiện; `minIntervalMs` chỉ tính sau lần chuyển nốt),
                             sai → không nâng. `FlappyNoteGame` máy trạng thái + vật lý bước cố định (ready/playing/paused/won/over,
                             va chạm → mất mạng + bất tử). Vật phẩm giữa hai ống (`itemChance` theo độ khó, từ ống 4, cách ≥ 3 ống):
                             ⚡ tự lái + bất tử ×3 tốc độ qua 5 ống (nốt đúng chỉ ×2 điểm, không nâng), ❤️ +1 mạng (đủ → +50 điểm),
                             👻 xoá ống tới chỗ chim trong 5 s (`vanishAt`, vẫn đếm đã qua → vẫn về đích). `levels.ts` màn = thế tay 5 ngón (ngón gợi ý) + giai điệu cho chế độ Chuỗi nốt,
                             độ khó Siêu dễ/Dễ/Vừa/Khó chỉ đổi vật lý. Siêu dễ (`durations` khác rỗng): nốt mục tiêu có trường độ
                             (giai điệu: theo bài; ngẫu nhiên: bốc), nốt dài nâng cao hơn (`liftScale`, KHÔNG đo giữ phím), dải nốt
                             sắp đánh `NoteStrip` ở đầu khu trò chơi (thẻ khuông vẽ sẵn theo nốt × trường độ: `useStaffCards`). Canvas `components/flappyNote/FlappyCanvas` đọc `getWorld()` mỗi khung
                             (không re-render React); khu hướng dẫn `NoteGuide` (một khuông lớn: nốt cần đánh tô màu + các nốt tiếp theo, vẽ lại mỗi lần đổi nốt;
                             hai tay → khuông đôi; rồi tên nốt, ngón). Một màn duy nhất: vào thẳng màn chơi, bảng ⚙ Cài đặt mở trên màn chơi
                             (đang mở → bỏ qua nốt; đổi màn / chế độ / độ khó → ván mới).
                             Kỷ lục theo hồ sơ + màn × độ khó, tổng sao → danh hiệu (`storage.ts`, localStorage)
  balloonPop/              "Bóng bay nốt nhạc" (`screens/BalloonPopScreen`, route `balloon-pop`, `?screen=balloon-pop`): bóng mang tên nốt
                             bay lên THẲNG phía trên phím của nó (`keyCenterPercent`), đánh đúng → nổ, bay khỏi mép trên → mất mạng.
                             `notes.ts` chế độ 1 tay·5 nốt / 2 tay·5 nốt / 1–2 tay·7 nốt (chỉ so tên nốt CDEFGAB, `matchKey` = pitch class)
                             / full phím (phím trắng C2–C6, đúng quãng tám); ngón thế Đô / ngón gam Đô trưởng; tên Đô Rê Mi Pha Sol La Si.
                             `BalloonPopGame` máy trạng thái ready/playing/paused/won/over: mỗi sự kiện nổ tối đa 1 quả (quả cao nhất khớp),
                             hai quả cùng `matchKey` không bay cùng lúc, `minIntervalMs` sau lần nổ; độ khó Dễ/Trung bình/Khó (số quả cùng lúc,
                             mạng, số bóng 40/60/80) × tốc độ Vừa/Nhanh; cứ 20 quả nhanh thêm 10% (`rampFactor`, tối đa ×1.5), đầu mỗi mốc
                             một đợt 5 quả nhanh + dày hơn (`rush`, thêm 1 quả cùng lúc). Nốt bốc trước vào hàng chờ (`upcoming`, xem trước 3 quả
                             ở góc trên phải; thả quả đầu hàng không trùng `matchKey` quả đang bay); đúng liên tục mỗi 10 nốt → `fireworks` (pháo hoa).
                             Kiểu chơi Thường / Tìm nốt (`game`): Tìm nốt tính điểm = bảng chọn nốt cần tìm (`huntLetters` → `huntTargets`),
                             `huntConfig` (không giới hạn bóng, không mạng, không tăng tốc theo mốc); nốt khác của chế độ là bom (`bomb`, ~1/3):
                             trúng bom → nổ hết bóng, −10 điểm, nổ 10 bom → hết ván; `urgentOf` = quả cao nhất không phải bom. Tốc độ `speed`
                             áp ngay cho mọi quả đang bay (tiến độ cộng dồn mỗi khung): đúng −0.1, sai / bom / bóng cần tìm bay mất +0.1 (0.5–3). Canvas `components/balloonPop/BalloonCanvas`. Một màn duy nhất: chơi +
                             bảng ⚙ Cài đặt mở trên màn chơi (mở giữa ván → tạm dừng; đổi chế độ/độ khó/tốc độ → ván mới).
                             Nốt trên bóng (`display`, một nút xoay vòng): Đô Rê Mi / CDEFGAB / Hình nốt (thẻ khuông HTML bám theo bóng —
                             font Bravura không vẽ được lên canvas; `useNoteCards`: chỉ khuông ngắn + nốt, KHÔNG vẽ khoá, khoá Sol/Fa/Đô
                             chọn trong cài đặt `staffClef`, mặc định Sol; trường độ ngẫu nhiên `BALLOON_DURATIONS`, chỉ để đọc) / "?" (mỗi quả
                             bay lên kèm tiếng nốt, nút Nghe lại; micro tự bỏ nốt lúc app phát). Gợi ý: phím cần đánh, ngón tay, tên phím
                             (theo kiểu chữ gần nhất `labelStyle`), ẩn tên từng nốt cả trên bóng lẫn phím (`hiddenLetters`,
                             `PianoKeyboard.labelFor`). Kỷ lục localStorage theo hồ sơ (`storage.ts`)
  f1Racing/                "VietPiano F1 Racing" (`screens/F1RacingScreen`, route `f1-racing`, `?screen=f1-racing`): đua top-down 3 làn, tay trái lái
                             bằng 2 phím điều hướng (mặc định C3 / D3, `resolveNavKeys` tự tách khỏi tầm nốt luyện tập và không cho trùng nhau),
                             tay phải đọc nốt trên khuông. `F1RacingGame` máy trạng thái + vật lý bước cố định 120 Hz (ready/countdown/racing/paused/finished):
                             tốc độ 0–100, xuất phát 100%, đúng +10 / sai −10 / va chạm −10, KHÔNG tự giảm; `speedPercent` là số chấm, `world.speed` tiến dần theo.
                             Giữ phím / Note On lặp không tính (`held`; micro không có Note Off → chỉ chặn âm ngân). 10 nốt đúng liên tiếp → tự né 3 giây
                             theo đồng hồ trò chơi (không cộng dồn, nốt đúng lúc đang hỗ trợ không tính cho lần sau). Mỗi chướng ngại chỉ trừ tốc độ một lần
                             (`hitIds`, kể cả lúc miễn va chạm), miễn 1,5 s sau va chạm. `track.ts`: chướng ngại sinh sẵn cả chặng; xe đối thủ chạy bằng
                             `RIVAL_SPEED_RATIO` × tốc độ người chơi nên đoạn bị chặn chỉ phụ thuộc quãng đường, `isTrackFeasible` chứng minh được luôn có đường vượt.
                             Độ khó 500 / 1.000 / 1.500 m (`config.ts`), mọi xe cùng hiệu năng. `audio.ts` WebAudio tổng hợp, AudioContext riêng; đang nghe bằng micro thì tắt hết
                             (micro nghe nhầm thành nốt). `storage.ts`: cúp theo hồ sơ × độ khó, bảng xếp hạng (thời gian làm tròn 0,1 s → độ chính xác → va chạm),
                             chỉ ván có ≥ 1 nốt đúng mỗi 25 m (`minCorrectNotes` 20/40/60, `qualifies`) mới lập kỷ lục / lên bảng (ván thiếu vẫn lưu lịch sử + cúp), cài đặt (localStorage). Vẽ: `components/f1Racing` (`F1Canvas` đọc `getWorld()` mỗi khung, `carArt` vẽ xe bằng canvas, cùng hàm cho xem trước).
                             Một màn duy nhất: "gara" chọn xe / độ khó / hồ sơ là lớp phủ Sẵn sàng. Tự tạm dừng khi ẩn app / mất focus / rút đàn MIDI.
                             Nốt sai tô đỏ, đúng tô xanh qua CSS `.f1-note-*` (chỉ tô nốt, không tô khuông)
  fiveFinger/              "5 ngón · 8 nốt liên tục" (`screens/FiveFingerScreen`, route `five-finger`, `?screen=five-finger`, nút "5 ngón · 8 nốt" ở đầu màn Giáo trình;
                             chi tiết + checklist thử thật: docs/five-finger.md). `positions.ts` thế 5 phím (tay phải mặc định C4–G4, tay trái C3–G3,
                             ngón theo tay), `generator.ts` chuỗi 8 sự kiện theo SEED (chỉ số phím 0–4, luật Dễ/Trung bình/Khó, tránh trùng chuỗi vừa xong,
                             `focus` = chuyển động yếu), `FiveFingerDrill` Wait Mode (≤ 1 bước/sự kiện, hai tay cùng lúc cần đủ 2 nốt trong `syncToleranceMs`,
                             muộn → `late-sync` không tính sai nốt), `FiveFingerSession` buổi liên tục (xong chuỗi → ăn mừng 1,5 s → chuỗi mới; 5/10/20/∞;
                             luyện từng tay trước), `stats.ts` thống kê theo hồ sơ (ngón chỉ là ngón ĐƯỢC HƯỚNG DẪN — không kết luận sai ngón) + gợi ý độ khó.
                             Micro không chấm được hai tay cùng lúc → khoá Bắt đầu
  coach/                   "AI Piano Coach" (`screens/CoachScreen`, route `coach`, `?screen=coach`, nút ở trang chủ; tài liệu + backlog + checklist:
                             docs/ai-coach/). Bốn thành phần, thuần + có test: `recorder/` log GỐC (on/off/cc 64·66·67/mark, mốc nguồn + mốc nhận,
                             không làm tròn) → `buildPerformance` (ghép nốt, retrigger, Off mồ côi, ngân pedal / sostenuto, bỏ khoảng tạm dừng, lệch đồng hồ
                             driver); `reference/fromLesson` (`ScoreReference` từ `Lesson`, id nốt `m:i`/`h:i:k`/`a:i:k`); `scoring/` (`align` DTW nhóm nốt +
                             khớp từng nốt QH động đơn điệu theo phím; DTW có BƯỚC NHẢY LÙI = chơi lại (M2-T11, `restart.test.ts`): cắt thành lượt, mỗi nốt chấm theo
                             LẦN ĐẦU chơi tới, đoạn chơi lại `replayed` không tính thừa, mỗi lần chơi lại = issue `restart` trừ như một chỗ ngắt; lùi đúng 1 nốt
                             không tính là chơi lại; `ScoringEngine` 5 tiêu chí — dùng lại `timingQuality` / `durationQuality` / `pedalQuality` /
                             `dynamicsQuality`; Mode A 40/25/15/10/10, B 30/30/10/10/20, C = A + `progress/compare`; tiêu chí thiếu tín hiệu → null + chia lại
                             trọng số; mỗi issue có `deduction` /100 ⇒ tổng = 100 − Σ; có `SCORING_ENGINE_VERSION`); `ai/` (payload tóm tắt có mã I…/R…,
                             Ollama JSON schema + timeout / retry, `verify` bỏ câu sai ô / số / tên nốt, `fallback` nhận xét theo quy tắc, `link` trạng thái kết nối AI
                             hiện cả lúc ĐANG ĐÁNH — chỉ GET /api/tags định kỳ, thanh ghi hai hàng để chữ đổi không làm khuông nhảy); `practice/`
                             (`recommendPractice` ≤ 3 → tính năng sẵn có, `PracticePlan` 7 bước); `storage/CoachStorage` IndexedDB riêng "vietpiano-coach"
                             theo `profileKey` (lưu nháp 3 s → khôi phục phiên dở dang; kết quả theo phiên bản engine, chấm lại không xoá bản cũ).
                             `latency/` đo độ trễ TỪNG MÁY (gõ theo tiếng click → trung vị bền; lưu theo `midi:<tên đàn>` / `virtual` / `microphone`,
                             chưa đo → micro 60 / MIDI 0 như cũ; CHỈ Coach dùng — màn khác giữ 60 / 0, D13 ở docs/ai-coach/architecture.md), bù cho mọi
                             sự kiện người chơi kể cả pedal; `metronome.ts` lên lịch tiếng click theo đồng hồ âm thanh + ghi từng tiếng vào log →
                             `scoring/analyzeMetronome` "so với metronome" (thông tin, KHÔNG trừ điểm; chưa đo → không so).
                             Rubric Biểu diễn cũ không đổi, điểm Coach không ghi vào tiến độ giáo trình. Thử thật: docs/ai-coach/acceptance-checklist.md
  technique/               "Luyện kỹ thuật ngón tay" (AI Finger Coach, docs/finger-coach/): `catalog.ts` 67 bài 5 cấp × 13 nhóm (CHỈ dữ liệu, mẫu số ngón
                             `pattern(thế tay, "1 2 3/h")` → `Lesson`; KHÔNG nằm trong `LESSONS`), `build.ts` suy chỗ chuyển ngón từ số ngón + kiểm tra không ép giãn,
                             `lessons.ts` tra bài chung cho Coach (`resolveLesson`: Thư viện + bài kỹ thuật + bài bổ trợ `rem:…`) + trọng số chấm theo bài,
                             `skills.ts` hồ sơ kỹ năng SUY từ kết quả Coach (không lưu), `recommend.ts` 3 bài hôm nay theo luật, `aiRank.ts` AI cục bộ chỉ sắp xếp /
                             diễn đạt lý do (xác minh, lỗi → luật), `dashboard.ts`. UI `screens/TechniqueScreen` (route `technique`, `?screen=technique`, nút ở
                             màn Giáo trình, trang Lối tắt), `components/technique/`. Bài chạy + chấm trong Coach (không bộ ghi / bộ chấm riêng)
  smartPractice/           AI Smart Practice DÙNG CHUNG mọi bài có `Lesson`: `passages.ts` đoạn khó qua nhiều phiên (lỗi ở ≥ 2 phiên, độ tin cậy),
                             `remedial.ts` bài bổ trợ 3–5 nhóm nốt (ranh giới chỉ ở phách mọi bè cùng bắt đầu; sinh lại từ id), `tempo.ts` Adaptive Tempo,
                             `outcome.ts` hiệu quả bổ trợ, `store.ts` localStorage theo hồ sơ (bài bổ trợ, phản hồi đề xuất, báo mỏi, cờ tính năng),
                             `service.ts` API dùng chung. Glue `hooks/useSmartPractice.ts`; panel `components/coach/SmartPracticePanel` ở kết quả Coach
  shortcuts/               "Lối tắt cá nhân" (Quick Access, docs/shortcuts.md): `registry.ts` = ShortcutRegistry, mọi đích đến SUY TỪ dữ liệu
                             (màn cố định `PAGES`, trò có màn riêng `games/catalog.STANDALONE_GAMES` — mục Trò chơi cũng vẽ từ đây, cấp / buổi giáo
                             trình chính + sup-/nd-, bài thư viện, trò tự do, trò của từng buổi): `resolveTarget` (còn tồn tại?), `targetStatus` (theo
                             tiến độ — mở khoá chỉ gợi ý), `targetKey` (chống trùng, gồm stage / measures / preset), `sanitizeTarget` (chỉ loại đích / ID /
                             tham số được phép, KHÔNG URL), cây duyệt + tìm không dấu. `ShortcutService.ts` CRUD thuần + localStorage MỘT khoá mỗi hồ sơ
                             `vietpiano.shortcuts.v1:<profileId|guest>`. Glue: `store/shortcutRoutes.ts` (đích ↔ `Route` sẵn có, `openTarget`; route thêm
                             `games.open`, `settings.section`), `store/shortcutStore.ts` (`useShortcuts`, tự nạp khi đổi hồ sơ, hộp thoại / Hoàn tác /
                             lối tắt hỏng dùng chung). UI `components/shortcuts/`: `ShortcutBar` cạnh hồ sơ ở trang chủ (đo bề rộng, ≤ 3 nút + menu ⋯,
                             prop `suggestions` cho Lối tắt thông minh), `ShortcutManager` (Cài đặt → Lối tắt, kéo thả + ↑↓), `PinShortcutButton`
                             (📌 đầu trang; trò có màn riêng: dòng trong ⚙ Cài đặt), `ShortcutOverlays` gắn ở App
  shortcuts/smart/         "Lối tắt thông minh" (docs/smart-shortcuts.md): engine gợi ý THUẦN theo quy tắc, dùng chung `ShortcutTarget` + registry.
                             `learning.ts` tiếp tục học (buổi đang dở, bài Thư viện dừng giữa chừng, buổi tiếp theo) + ôn tập giãn dần;
                             `weakness.ts` luyện điểm yếu CHỈ khi đủ dữ liệu (ngưỡng `WEAKNESS_RULES`; không có "sai ngón" — app không biết ngón);
                             `play.ts` bài vừa sức (`profile/recommend`), trò đúng kỹ năng buổi đang học (`skills.ts`: kỹ năng theo cơ chế thật của trò),
                             thường chơi (`usage.ts` gom từ kho kết quả sẵn có). `engine.ts` lọc (`targetStatus` ≠ ok, trò khi hết giờ chơi, trùng
                             `targetKey` lối tắt thủ công, đang ẩn) → điểm cơ sở 100/85/75/70/60/50 + tie-breaker ổn định → giới hạn mỗi loại;
                             `stability.ts` chữ ký dữ liệu + giữ vị trí; `settings.ts` cài đặt / ẩn / cache theo hồ sơ (`vietpiano.smart-shortcuts.v1:<hồ sơ>`,
                             tách khỏi lối tắt thủ công); `ai.ts` điểm mở rộng AI cục bộ (chỉ sắp xếp lại / viết lại lý do có kiểm tra; lỗi → quy tắc; chưa nối).
                             Glue: `store/smartShortcutStore.ts`, `hooks/useSmartShortcuts.ts` (chỉ tính khi thanh trang chủ hiện, sau `progressLoaded`),
                             UI `SmartShortcutBar` (bọc `ShortcutBar`), `SmartShortcutSettings` (Cài đặt → Lối tắt). Engine chỉ ĐỌC khoá lối tắt thủ công
  score/ScoreRenderer.ts   VexFlow → SVG một dòng; tô màu bằng CSS class, trả về toạ độ x từng nốt. Chùm nốt tay phải: số ngón xếp chồng trên chùm
                             (`noteFingerRows`, nốt đơn vẫn hàng cố định), ký hiệu hợp âm (`.score-chord`), hình nêm (`.score-hairpin`), pedal giữa ô; tuỳ chọn
                             `showFingers / showChords / showPedal` (nút Hiển thị màn Luyện tập + cỡ khuông `scoreZoom`); vượt mép trên → mở rộng viewBox lên trên
  score/scoreFit.ts        tỉ lệ + vị trí dọc của khuông một dòng (ScoreView, Săn nốt): vùng nhìn co giãn ít (≤ 8%) theo từng nốt
                             → giữ nguyên, khuông không nhảy lên xuống; ô hướng dẫn dưới khuông cũng phải cao cố định, và hàng điều khiển
                             không được đổi bề rộng theo từng nốt / pedal (xuống dòng → vùng nhìn đổi quá 8%): khối "Cần đánh" chừa chỗ bằng bước rộng nhất của bài (`distinctStepGuides`)
  score/ScoreSheet.ts      ảnh khuông nhạc nhiều dòng kiểu bản in (canvas → PNG, `components/ScoreExportDialog`, nút xuất ở Thư viện bài / bài hát).
                             VexFlow vẽ glyph bằng `fillText` tại MÉP TRÁI và không tự đặt `textAlign` → chữ của tờ nhạc vẽ trong save/restore, VexFlow
                             luôn vẽ canh trái (lọt canh giữa → đuôi nốt mọc giữa đầu nốt, khoá đè vạch nhịp; `e2e/score-sheet.spec.ts`). Hai bước: dựng
                             từng dòng ở toạ độ riêng + đo mép mực, rồi xếp dòng sát nhau (`translate`). Đủ ký hiệu như màn Luyện tập (sắc thái, hình nêm,
                             pedal bằng glyph Bravura) + nhịp độ, tên giọng; riêng ảnh: sắc thái chung một hàng dưới đuôi nốt, khuông đôi tự nới khoảng
                             cách khi nốt hai khuông chạm nhau, số ngón nâng lên khi đè móc / đuôi nốt / cờ — khuông màn hình không đổi
  score/sheetLayout.ts     logic thuần của ảnh: chia dòng tham lam, dòng cuối cụt / giãn quá thưa → chia đều cùng số dòng nếu không dòng nào
                             giãn quá 1,5 (Canon 3/3/3/3/3/2, Twinkle 4/4/4); bề rộng ô đủ cho hàng tên nốt (`labelNoteArea`, theo softmax trường độ
                             của VexFlow); tỉ lệ điểm ảnh ≤ 16 MP (canvas Safari quá lớn → trắng); xuống dòng chữ; hình nêm ngắt dòng
  storage/ProgressStorage.ts  IndexedDB (phiên + tổng hợp theo bài), fallback bộ nhớ; bài gần đây ở localStorage
  storage/CurriculumStorage.ts  IndexedDB riêng "vietpiano-curriculum": tiến độ giáo trình theo hồ sơ, ghi ngay sau mỗi bài tập
  audio/SoundOutput.ts     tiếng đàn mẫu + click metronome (WebAudio tổng hợp, offline); micro bỏ nốt trong lúc phát mẫu
  settings/DeviceSettings.ts  cài đặt micro/hiển thị ở localStorage
  voice/                   cô giáo giọng nói tiếng Việt (mặc định chỉ Kids Mode, `voiceTeacher` 'kids'|'always'|'off'):
                             `types.ts` VoiceCue { trigger, instructionText, voiceText, audioAsset, priority, cooldownMs };
                             `phrases.ts` câu mặc định ngắn (≤ 15 từ, không chê), tên nốt đọc Đô/Rê…/"Fa thăng", gợi ý vị trí phím;
                             `VoiceTeacher.ts` hàng đợi thuần: một câu mỗi lúc (ưu tiên ≥ ngắt, thấp hơn chờ 1 chỗ, chờ quá 4 s bỏ),
                             cooldown theo id, im khi đang phát mẫu (`soundOutput.isPlayingUntil`), `cancelAll` khi đổi bước/bài,
                             `blocksMic` → `useNoteInput` bỏ nốt MICRO lúc cô đang nói (MIDI không ảnh hưởng);
                             `WaitVoiceCoach.ts` Wait Mode → lời nói (khen thưa, nốt kế chỉ đọc nếu bé chưa đánh sau 1.5 s, sai tăng
                             `helpLevel` → hiện tên nốt / bàn phím nhấp nháy, nhắc khi chưa thao tác `voiceRemindSec`);
                             `speakers.ts` HybridSpeaker: `audioAsset` → giọng thu sẵn `public/voice/index.json` (câu đơn → mp3
                             HoaiMy, tách câu theo dấu chấm, phát nối; tạo bằng `npm run voice` từ `catalog.ts` `voiceLines`)
                             → TTS vi-VN của máy (ưu tiên nữ miền Bắc) cho câu chưa thu → chỉ chữ. Đổi câu trong `phrases.ts` /
                             nội dung bài mà chưa chạy `npm run voice` → câu đó đọc bằng giọng máy (Chrome Windows: im lặng).
                             Giọng trực tuyến (Edge Natural/Google) tắt mặc định (`voiceAllowOnline`); `teacher.ts` singleton.
                             Dữ liệu bài: `voice?: VoiceCue[]` ở CurriculumLesson / Exercise, `voice?` ở IntroPage (validate kiểm tra).
                             UI: `components/VoiceBar` (bong bóng chữ, Nghe lại, tắt tiếng `voiceMuted`, tốc độ), hook `useVoiceTeacher`
                             Câu đố (`QuizSteps`): cô đọc đề (trắc nghiệm, tìm phím; KHÔNG đọc đề bài đọc nốt — lộ đáp án), đọc lỗi (luôn đọc, "Khen khi đúng"
                             chỉ tắt lời khen), di chuột vào đáp án chữ thì đọc đáp án (`useHoverRead`: `optionHover` ưu tiên 0, `transient` → không đổi
                             bong bóng / Nghe lại; chạm iPad không có, đáp án hình "Hình 1…" không đọc). Trắc nghiệm giữ màn đáp án tới khi cô đọc xong (tối đa 6 s).
                             `speakable`: bỏ tên chữ cái khi đọc ("Bấm Đô giữa (C4)" → "Bấm Đô giữa")
  feedback/OllamaClient.ts   gọi Ollama cục bộ (`/api/tags`, `/api/chat` stream NDJSON, Content-Type text/plain → không preflight CORS)
  feedback/coachPrompt.ts    báo cáo bài (`lessonReport` giáo trình / `practiceReport` màn Luyện tập) → prompt tiếng Việt;
                             UI: `components/AiCoachCard` ở màn kết quả buổi học + hộp thoại hoàn thành bài.
                             Nhận xét của buổi giáo trình lưu ở `LessonRecord.aiNotes` (khoá `at` = lần làm, "Viết lại" ghi đè,
                             tối đa `MAX_AI_NOTES`), hiện ở màn tổng quan buổi. Bài Thư viện (Chờ nốt / Đếm nốt / Theo nhịp —
                             `tempoReport` không xét cao độ): `storage/AiNoteStorage` (IndexedDB riêng "vietpiano-ai-notes",
                             theo hồ sơ + bài), xem lại bằng nút 🤖 trên màn Luyện tập. Logic chung: `feedback/aiNotes.ts`
  calibration/AutoCalibrator.ts  tự căn chỉnh: đo im lặng → hiện nốt đo → nghe khung cao độ thô → đề xuất cài đặt
  calibration/CalibrationCheck.ts  kiểm tra sau căn chỉnh: đồng hồ nhịp dừng chờ từng nốt; ghi nghe sai / nghe thừa (âm ngân)
  profile/LearnerProfile.ts  hồ sơ người học (tuổi, trình độ, mục tiêu) ở localStorage; phiên cũ không profileId → hồ sơ tạo sớm nhất
  profile/assessment.ts      đánh giá từ lịch sử phiên: thời gian học, điểm khả năng 0–100, các tiêu chí (đều đặn, tốc độ đọc nốt, nốt hay sai…)
  profile/recommend.ts       gợi ý bài theo nhóm tuổi + mục tiêu + độ khó vừa sức + tiến độ (tối đa 2 bài/nhóm)
src/store/           Zustand: settingsStore, micStore, appStore (route + tiến độ + lịch sử phiên), profileStore, curriculumStore
                     playingStore (`usePlayingNow`: đang chơi trong bài — Luyện tập đã đánh nốt đầu / đồng hồ nhịp chạy, bài tập
                     giáo trình đang làm → ẩn nút nổi micro + tải lại; hết bài / chơi lại từ đầu → hiện lại)
src/hooks/           vòng đời app (ẩn nền → tắt micro), theme, wake lock, ghi phiên luyện tập
src/components/      ScoreView, PianoKeyboard, MicPanel, ui
src/screens/         Dashboard (trang chủ = giáo trình phía trên + Thư viện bài `components/LessonLibrary` phía dưới),
                     Curriculum, Supplement (giáo trình bổ sung), NoteDiscovery (danh sách buổi "Khám phá nốt nhạc"), LessonPlayer, Practice, Games, Coach (AI Piano Coach, tải lazy), Settings. Route `library` = trang chủ cuộn tới thư viện;
                     `?screen=library` / `?screen=song-library` / `?screen=curriculum` / `?screen=games` mở thẳng (e2e dùng)
e2e/                 Playwright; global-setup sinh WAV gam Đô trưởng làm micro giả
```
