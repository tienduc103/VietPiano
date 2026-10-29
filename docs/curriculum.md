# Giáo trình VietPiano — kiến trúc và hướng dẫn mở rộng

## Cấu trúc

```
Curriculum → Level → Week → CurriculumLesson → Activity (giới thiệu) / Exercise (chấm điểm) → Assessment → LessonRecord (tiến độ)
```

| Lớp | File | Vai trò |
| --- | --- | --- |
| Nội dung | `src/core/curriculum/content/` | CHỈ dữ liệu: `curriculum.ts` (6 cấp), `level1.ts`, `level2.ts` (mỗi cấp 4 tuần, 20 buổi), `helpers.ts` (hàm dựng dùng chung) |
| Kiểu dữ liệu | `src/core/curriculum/types.ts` | Schema; chữ hiển thị là `Text` (chuỗi tiếng Việt, sau này có thể `{ vi, en }`) |
| Kiểm tra dữ liệu | `validate.ts` | Đủ phách, tầm micro 36–84, tiên quyết đi trước, đáp án hợp lệ, thứ tự sự kiện |
| Bản nhạc | `piece.ts` | Ký hiệu gọn → `Lesson` (dùng lại ScoreView/PracticeEngine) → dòng thời gian từng nốt → file MIDI |
| Engine | `QuizEngine.ts`, `practice/PracticeEngine.ts` (Wait), `practice/PerformanceTracker.ts` (Biểu diễn / Tiết tấu) | Máy trạng thái thuần |
| Chấm điểm | `scoring.ts`, `feedback.ts` | Rubric riêng từng loại bài, điểm buổi, nhận xét |
| Mở khoá | `unlock.ts` | Trạng thái buổi, buổi tiếp theo, thành tích (chỉ gợi ý, không khoá cứng) |
| Tiến độ | `progress.ts` + `storage/CurriculumStorage.ts` | IndexedDB `vietpiano-curriculum`, theo hồ sơ người học |
| UI | `screens/DashboardScreen`, `CurriculumScreen`, `LessonPlayerScreen`, `components/curriculum/*` | Kids / Adult Mode cùng một engine (`useUiMode`) |

## Loại bài tập

| `kind` | Rubric | Chấm |
| --- | --- | --- |
| `key-quiz` | keyboard | % lượt đúng lần đầu; `retry: true` = luyện (sai thử lại), `false` = kiểm tra |
| `choice-quiz` | theory | % câu đúng |
| `note-reading` | recognition | % nốt nhận đúng (`answer: 'name'` chọn tên, `'play'` đánh trên đàn); xem gợi ý = không tính đúng lần đầu |
| `play` + `mode: 'wait'` | wait | 90% độ chính xác + 10% hoàn thành — **không có tiêu chí nhịp** |
| `play` + `mode: 'performance'` | performance | nốt 45% + nhịp 30% + trường độ 15% + hoàn thành 10% (+ mạnh – nhẹ 15% nếu có `dynamics`) |
| `play` + `mode: 'rhythm'` | rhythm | nhịp 70% + trường độ 15% + hoàn thành 15% (không xét cao độ) |

Trường độ chỉ chấm được khi nguồn vào báo thả phím (đàn MIDI, bàn phím ảo). Với micro, tiêu chí này là
"không đo" và trọng số được chia lại cho các tiêu chí còn lại.

Điểm buổi = trung bình có trọng số (`weight`, mặc định 1) các bài tập. Buổi đạt khi điểm ≥ `assessment.passScore`
và mọi bài tập bắt buộc (`required`, mặc định true) đạt `pass`. Bài khởi động: `required: false, weight: 0`
(dùng helper `practice()` trong `level1.ts`).

Điều kiện đạt bài biểu diễn chuẩn: `{ minScore: 80, minAccuracy: 0.8, minCompletion: 0.9 }`.

## Nội dung hiện có

| Cấp | Tuần 1 | Tuần 2 | Tuần 3 | Tuần 4 |
| --- | --- | --- | --- | --- |
| 1 — Làm quen Piano | Bàn phím, nốt Đô, số ngón, C–D–E | Khuông nhạc, khoá Sol, C4–G4 | Nốt đen/trắng/tròn, dấu lặng đen | Tay trái C3–G3, đổi tay, bài 4 và 8 ô |
| 2 — Mở rộng tầm tay | Thế tay Sol, A4–D5, đổi thế tay | Khoá Fa tới B3, tay trái thế Sol G2–D3 | Nhịp 3/4, trắng chấm dôi, lặng trắng | Bước liền/nhảy quãng, quãng 5–8, bài valse, bài hai tay |
| 3 — Móc đơn và chấm dôi | Móc đơn ("1 và"), lặng móc đơn | Đen chấm dôi (4/4 và 3/4), tay trái móc đơn | Đảo phách móc đơn – đen – móc đơn, nửa sau phách | Gam Đô trưởng luồn ngón hai tay, bài 8 ô, bài hai tay 3/4 |
| 4 — Dấu thăng, dấu giáng | Dấu thăng, nửa cung / một cung, hoá biểu Sol trưởng | Dấu giáng, dấu hoàn, hoá biểu Fa trưởng, tay trái thế Fa | Gam Sol trưởng, tay trái thế Rê, bài và hai tay Sol trưởng | Gam Fa trưởng, bài 3/4 và hai tay Fa trưởng, phân biệt giọng |
| 5 — Hai tay cùng lúc | Nốt trầm giữ / đổi nửa ô, quãng 5 tay trái | Hợp âm Đô, Fa, Sol thế gần, đổi hợp âm | Tay trái nốt đen, đệm valse, hợp âm rải | Hai tay giọng Sol / Fa trưởng, bài móc đơn trên hợp âm rải, valse |
| 6 — Biểu diễn | Sắc thái f, p, mp, mf; tiếng vọng; bài hai tay có sắc thái | Câu hỏi – đáp, hình thức A – B, A – B – A, dời thế tay (Au clair de la lune) | Khúc hoan ca, Kìa con bướm vàng, Minuet Sol trưởng (phạm vi công cộng); Andante / Allegretto | To dần / nhỏ dần, bài valse 16 ô, chương trình, tổng duyệt, hoà nhạc tốt nghiệp |

Cấp 6 — sắc thái: `Piece.dynamics` theo ô nhịp (`{ 1: 'p', 5: 'f' }`) → `Lesson.dynamics` (chỉ số nốt đầu ô), vẽ dưới
khuông Sol (`.score-dynamic`), "Nghe mẫu" phát theo lực gõ (`DYNAMIC_VELOCITY`). Biểu diễn thêm tiêu chí "Mạnh – nhẹ"
(`music/dynamics.ts`): so trung vị độ to của hai đoạn liền kề — đủ `FULL_STEP_DB` (3 dB) đúng chiều là trọn điểm. Độ to:
đàn MIDI = velocity, micro = RMS khung lúc nhận nốt (`NoteInputEvent.level`), bàn phím ảo → "không đo" (chia lại trọng số).
Chỉ so tương đối nên không phụ thuộc micro xa/gần. `Piece.sections` vẽ chữ đánh dấu đoạn (A, B). Bài phạm vi công cộng
ghi nguồn riêng (`pd(piece, source)`).

Cấp 5 — hai tay CÙNG LÚC: `Piece.accompaniment` (helper `withLh(melody, lh)`, khuông đôi, giai điệu `hand: 'right'`).
App chỉ chấm giai điệu tay phải; `PlayStep` bỏ qua nốt thấp hơn giai điệu (`isAccompanimentMidi`) ở cả Wait Mode và
Biểu diễn, "Nghe mẫu" phát cả hai tay, bàn phím ảo phủ cả nốt đệm. `validate.ts` bắt phần đệm thiếu phách, lệch số ô,
hoặc có nốt KHÔNG thấp hơn giai điệu (nốt đó sẽ bị chấm sai). Mỗi buổi ghi chú `ONLY_MELODY_SCORED`.

Cấp 4 — hoá biểu: `Piece.keySignature` / `NoteReadingExercise.keySignature` (helper `inKey(piece, 'G')`). Ký hiệu
vẫn ghi đủ dấu hoá ("F#4", "Bb4"); khuông nhạc tự bỏ dấu đã có trong hoá biểu và tự thêm dấu hoàn. Test
`nội dung cấp 4` kiểm tra bài Sol trưởng chỉ dùng F♯, bài Fa trưởng chỉ dùng B♭. Trò chơi gọi nốt giáng bằng tên
giáng (`GameSpec.names`, `gameNoteName`) — không quy về dấu thăng như `midiToName`.

Cấp 3 — lưu ý micro: bài có móc đơn để ≤ 66 BPM (móc đơn cách nhau ~0,5 giây) và giai điệu không lặp cùng
một nốt liền nhau ở móc đơn (micro cần tiếng gõ mới để nhận lại cùng nốt) — test `nội dung cấp 3` kiểm tra cả hai.
Bài tiết tấu (gõ một phím) được phép lặp nốt.

## Thêm cấp độ mới (vd cấp 3)

1. Tạo `src/core/curriculum/content/level3.ts` theo mẫu `level2.ts` (dùng các hàm trong `helpers.ts`:
   `rh`/`lh`/`both`/`in34`, `play`, `practice`, `keyboardPage`/`staffPage`/`countPage`, `buildLessons`).
   - `lessonId` duy nhất toàn giáo trình (quy ước `l3-07-ten-ngan`), `weekId` dạng `l3-w1`.
   - `prerequisites`: buổi liền trước; buổi đầu cấp 3 cần `l2-20-final`.
2. Trong `curriculum.ts` thay `comingSoon(3, …)` bằng level đầy đủ (`availability: 'available'`).
3. Chạy `npm test`: `curriculum.test.ts` chạy `validateCurriculum` cho toàn giáo trình,
   `flow.test.ts` mô phỏng người học chơi đúng mọi buổi và phải đạt — bài nào không chơi được sẽ báo lỗi.
4. Thêm test riêng cho cấp mới trong `curriculum.test.ts` (như "nội dung cấp 2") và cập nhật test số cấp đang mở.

Cần nốt móc đơn / chấm dôi trong bài tiết tấu: ký hiệu đã hỗ trợ (`/8`, `/qd`); `PerformanceTracker` tự thu hẹp
cửa sổ khớp theo khoảng cách nốt. Cần hợp âm (hai tay cùng lúc) thì micro KHÔNG chấm được — chỉ chấm giai điệu,
như bài có `accompaniment` của thư viện.

Không cần sửa engine, UI hay storage.

## Ký hiệu bản nhạc

Dùng chung với thư viện bài (`lessons/notation.ts`):

- `C4` nốt đen, `C4/h` trắng, `C4/w` tròn, `C4/hd` trắng chấm dôi, `C4/8` móc đơn.
- `:1`…`:5` số ngón (`E4/h:3`).
- `R`, `R/h` dấu lặng (chỉ dùng ở giáo trình — màn Luyện tập của thư viện không có dấu lặng).
- Hai tay: `RH` / `LH` đặt tay cho các nốt phía sau; mọi nốt phải có tay (`clef: 'grand'`, `hand: 'both'`).
- `|` chỉ để dễ đọc; ô nhịp được tính lại và kiểm tra đủ phách.

Middle C = C4 = MIDI 60. Giai điệu phải là bài tự soạn hoặc thuộc phạm vi công cộng, ghi `source`.

## Giới hạn đã biết (cần kiểm thử trên thiết bị thật)

- App **không** biết người học dùng ngón nào — số ngón chỉ là hướng dẫn (ghi chú `notes` của buổi 3, 4, 16, 17).
- Micro chỉ nhận một nốt mỗi lúc, không có Note Off → không chấm trường độ, không chấm hợp âm.
- Độ trễ micro bù cố định 60 ms (chưa đo trên iPad thật) — ảnh hưởng điểm nhịp ở bài biểu diễn bằng micro.
- Tiếng metronome có thể bị micro nghe thành onset → mặc định tắt khi dùng micro (Cài đặt → Giáo trình để bật, nên đeo tai nghe).
- Lúc phát mẫu ("Nghe mẫu"), nốt từ micro bị bỏ qua thêm 300 ms sau khi tiếng tắt.
- E2E chạy trên Chromium; Safari/iPadOS cần kiểm thử thủ công (AudioContext phát mẫu, IndexedDB, bố cục).
- Chưa có xuất MusicXML (có xuất MIDI: `timelineToMidi`).
