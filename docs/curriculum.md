# Giáo trình VietPiano — kiến trúc và hướng dẫn mở rộng

## Cấu trúc

```
Curriculum → Level → Week → CurriculumLesson → Activity (giới thiệu) / Exercise (chấm điểm) → Assessment → LessonRecord (tiến độ)
```

| Lớp | File | Vai trò |
| --- | --- | --- |
| Nội dung | `src/core/curriculum/content/` | CHỈ dữ liệu: `curriculum.ts` (6 cấp), `level1.ts` (4 tuần, 20 buổi) |
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
| `play` + `mode: 'performance'` | performance | nốt 45% + nhịp 30% + trường độ 15% + hoàn thành 10% |
| `play` + `mode: 'rhythm'` | rhythm | nhịp 70% + trường độ 15% + hoàn thành 15% (không xét cao độ) |

Trường độ chỉ chấm được khi nguồn vào báo thả phím (đàn MIDI, bàn phím ảo). Với micro, tiêu chí này là
"không đo" và trọng số được chia lại cho các tiêu chí còn lại.

Điểm buổi = trung bình có trọng số (`weight`, mặc định 1) các bài tập. Buổi đạt khi điểm ≥ `assessment.passScore`
và mọi bài tập bắt buộc (`required`, mặc định true) đạt `pass`. Bài khởi động: `required: false, weight: 0`
(dùng helper `practice()` trong `level1.ts`).

Điều kiện đạt bài biểu diễn chuẩn: `{ minScore: 80, minAccuracy: 0.8, minCompletion: 0.9 }`.

## Thêm cấp độ mới (vd cấp 2)

1. Tạo `src/core/curriculum/content/level2.ts` theo mẫu `level1.ts`: mảng `defs` các buổi + `LEVEL2_WEEKS`.
   - `lessonId` duy nhất toàn giáo trình (quy ước `l2-07-ten-ngan`), `weekId` dạng `l2-w1`.
   - `prerequisites`: buổi liền trước; buổi đầu cấp 2 cần `l1-20-final`.
2. Trong `curriculum.ts` thay `comingSoon(2, …)` bằng level đầy đủ (`availability: 'available'`).
3. Chạy `npm test`: `curriculum.test.ts` chạy `validateCurriculum` cho toàn giáo trình,
   `flow.test.ts` mô phỏng người học chơi đúng mọi buổi và phải đạt — bài nào không chơi được sẽ báo lỗi.
4. Cập nhật test số lượng nếu thêm test riêng cho cấp mới.

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
