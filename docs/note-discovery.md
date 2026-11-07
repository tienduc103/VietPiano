# "Khám phá nốt nhạc" — lộ trình tích luỹ, khuôn bài và nhật ký thay đổi

Lộ trình 11 buổi cho bé 4–8 tuổi, **cùng phương pháp với giáo trình bổ sung "Làm quen từng nốt"** (`docs/supplement.md`):

> Giới thiệu (hình + tiếng đàn mẫu ở mọi trang) → Câu đố chọn hình (sai chọn lại) → Luyện phím trên đàn (sai thử lại, chấm lần đầu) → bé tự chọn trò (không tính điểm).

Khác "Làm quen từng nốt":

- **Mỗi buổi một nốt mới rồi trộn với các nốt đã học** (phân biệt nốt cạnh nhau + ôn cách quãng). "Làm quen từng nốt" dạy từng nốt riêng lẻ.
- **Không dạy trường độ** (đã có ở "Làm quen từng nốt" và cấp 1) → buổi ngắn (~8 phút), chỉ tập trung cao độ / vị trí.
- Có buổi mở đầu về bàn phím (nhóm 2 / 3 phím đen, trầm – bổng) và ba buổi cuối: đọc khuông, giai điệu (Wait Mode), ôn tập.

Nội dung: `src/core/curriculum/content/discovery.ts` (CHỈ dữ liệu). Chạy bằng LessonPlayer như "Làm quen từng nốt" (`content/guided.ts`:
không có Luyện tập sau buổi, trò do bé chọn ở `components/curriculum/SupplementGames`). Danh sách buổi: `screens/NoteDiscoveryScreen`
(route `note-discovery`, `?screen=note-discovery`, nút "Khám phá nốt" ở trang chủ và màn Giáo trình). Tiến độ chung kho `curriculumStore`
(lessonId tiền tố `nd-`), không ảnh hưởng gợi ý mở khoá cấp 1–6. Tiên quyết = buổi trước, **chỉ là gợi ý** (buổi nào cũng mở được).

## Lộ trình

| Buổi | Nội dung | Bài tập | Trò chơi |
| --- | --- | --- | --- |
| 1 Khám phá bàn phím | phím trắng / đen, nhóm 2, nhóm 3 phím đen, trái trầm – phải bổng, cao hơn / thấp hơn | chọn hình (6), đố nghe cao / thấp (6, quãng rộng → hẹp, không tô phím), luyện phím (6) | Săn phím, Nghe nốt đoán phím |
| 2–8 Đô … Si | khuôn `noteLesson` (dưới) | chọn hình (6), luyện phím (6) | Bóng bay tìm nốt mới, Săn phím, Bắn bóng trên khuông |
| 9 Đọc khuông | dòng / khe, khoá Sol ôm dòng 2, Đô cao, bậc thang 8 nốt | chọn hình (tên → khuông, khuông → phím), nhìn nốt – đánh nốt (8 nốt) | Bắn bóng trên khuông, Đua đọc nốt |
| 10 Giai điệu | chơi theo khuông (Wait Mode), thế Đô / thế Sol | khởi động năm nốt (không tính điểm), Bánh nóng giòn, Mary có một chú cừu, Leo lên Đô cao | Giai điệu bí ẩn, Hứng nốt rơi |
| 11 Ôn tập | bản đồ các nốt, các nốt trên khuông | chọn hình xáo thứ tự (8), luyện phím mọi nốt (8), nhìn nốt – đánh nốt (8) | Bắn bóng, Đua đọc nốt, Săn phím |

## Khuôn buổi nốt (`noteLesson`)

Dữ kiện từng nốt (cách tìm trên bàn phím, vị trí trên khuông, ngón + thế tay) lấy từ `SUPPLEMENT_NOTES` — **một nguồn cho cả hai giáo trình**.
Hàm dựng hình / câu đố (`pictureQuestion`, `miniKey`, `staffNote`, `whiteStep`…) cũng dùng chung với `supplement.ts`.

| Bước | Nội dung |
| --- | --- |
| Giới thiệu 1 | Nốt trên khuông (nốt tròn, Nghe mẫu) + bàn phím 3 quãng tám tô nốt (Nghe) |
| Giới thiệu 2 | Vị trí theo nhóm 2 / 3 phím đen (`landmark`) |
| Giới thiệu 3 | Nốt giữa trên khuông khoá Sol, phóng to để thấy rõ nốt so với dòng kẻ (`staff`) |
| Giới thiệu 4 | Ngón tay phải trên thế Đô hoặc thế Sol (`finger`) |
| Giới thiệu 5 | Nốt thấp / giữa / cao |
| Giới thiệu 6 | "… và các nốt đã học": khuông bậc thang + bàn phím các nốt đã học, kết ở nốt mới (Đô — nốt đầu tiên — không có trang này) |
| Bài 1 | Chọn hình: phím, khuông (cách 2 bậc), khuông (cách 1 bậc), ngón — rồi 2 câu ôn: phím của nốt vừa học, khuông của nốt trước nữa (nốt mới là đáp án nhiễu). Đô ôn nhóm 2 / 3 phím đen. Đạt ≥ 5/6 |
| Bài 2 | Luyện phím: nốt mới giữa → ôn nốt vừa học → nốt mới thấp → ôn nốt cách 3 buổi (bất kỳ quãng; buổi đầu chưa đủ nốt thì nốt gần hơn) → nốt mới cao → nốt mới giữa lần nữa. Đạt ≥ 5/6 |
| Trò chơi | Bóng bay kiểu Tìm nốt (Hình nốt) cho nốt mới; Săn phím xen nốt mới với tối đa 3 nốt vừa học; Bắn bóng trên khuông với mọi nốt đã học |

**Ôn cách quãng:** mỗi nốt được hỏi lại ở cả 3 buổi kế tiếp trong phần bắt buộc — cách 1 buổi (câu đố phím + luyện phím), cách 2 buổi (câu đố khuông), cách 3 buổi (luyện phím) — rồi tới buổi đọc khuông, giai điệu, ôn tập. Trò chơi không tính điểm nên không dựa vào trò để ôn.

## Quy tắc khi sửa

1. Đổi cấu trúc / cách trình bày buổi nốt → **sửa khuôn `noteLesson`** (mọi nốt cùng đổi), không sửa riêng một nốt.
   Đổi dữ kiện của một nốt (câu tìm phím, vị trí trên khuông, ngón) → sửa `SUPPLEMENT_NOTES` (đổi luôn ở "Làm quen từng nốt", ghi cả hai nhật ký).
2. Không lộ đáp án: thẻ hình đáp án không ghi tên nốt / tên phím; khuông đề bài có `hideNames`; bài nghe không tô phím.
3. Sau khi sửa:
   - `npm test`: `discovery.test.ts` kiểm tra khuôn chung, đáp án đúng MỘT hình, nốt ôn đúng, không có trường độ, mọi trang có tiếng đàn.
   - `npm run voice` (câu chữ đổi → cần mp3 mới cho giọng cô giáo; script đọc cả giáo trình này).
   - `npm run test:e2e -- e2e/note-discovery.spec.ts`.
4. Ghi một dòng vào nhật ký bên dưới.

## Nhật ký thay đổi

| Ngày | Thay đổi |
| --- | --- |
| 2026-11-04 | Bản đầu (module riêng 8 chặng: engine, khuông tự vẽ, kho lưu riêng). |
| 2026-11-04 | **Viết lại theo phương pháp "Làm quen từng nốt"**: kiểm tra lại thấy bé bị kẹt ngay lượt đầu (không chuyển lượt sau khi trả lời), chặng 2–8 không bao giờ mở, micro không nhận lại cùng nốt, khoá Sol tự vẽ sai hình, phím đen vẽ thành nốt trắng không dấu thăng, đáp án bị lộ (tên nốt hiện sẵn, phím chiếu sáng, bài nghe vẽ sẵn hai nốt), "phím trắng bất kỳ" chỉ nhận Đô giữa, phần giới thiệu bị chấm điểm, nhiều tiêu chí khai báo mà không dùng. Thay bằng 11 buổi dữ liệu chạy bằng LessonPlayer: 1 nốt mới mỗi buổi + ôn nốt cũ, bỏ trường độ, mở khoá chỉ gợi ý, giọng cô thu sẵn. Bỏ engine / màn / kho lưu riêng; gợi ý nốt cho Bóng bay và độ khó Thu hoạch cà chua giờ suy từ buổi nốt đã đạt (`curriculum/learnedNotes.ts`). |
| 2026-11-05 | Rà lại kiến thức: câu cho bé "Rê … nằm trong khe" sai (Rê treo dưới dòng 1) → sửa; "phím đen nằm cao hơn" trùng nghĩa với cao độ → "nhô lên"; "số nhỏ cạnh nốt" → "số ghi phía trên nốt". Câu cho bé ở La, Si nhắc chuyển ngón cái sang Sol (sửa ở `SUPPLEMENT_NOTES`). Ôn cách quãng: lượt ôn thứ hai của luyện phím đổi từ nốt cách 2 buổi sang cách 3 buổi (trước đó từ buổi Pha trở đi, các nốt đầu không được hỏi lại cho tới buổi 9). Khuông phóng to ở các trang dạy vị trí nốt (trang khuông của buổi nốt, khoá Sol, nốt trên dòng, nốt trong khe), tên nốt ở chú thích. |
