# Giáo trình bổ sung "Làm quen từng nốt" — khuôn bài và nhật ký thay đổi

Mỗi buổi giới thiệu MỘT nốt. Cả 7 nốt trắng (Đô, Rê, Mi, Pha, Sol, La, Si) được **sinh từ cùng một khuôn**
`noteLesson(note)` trong `src/core/curriculum/content/supplement.ts`.

## Quy tắc khi sửa

1. **Mọi thay đổi về cấu trúc / cách trình bày → sửa khuôn** (`noteLesson`, `DURATIONS`, `durationsStaff`, `noteGames`…),
   KHÔNG sửa riêng một nốt. Như vậy cả 7 nốt cùng đổi.
2. Bảng `SUPPLEMENT_NOTES` chỉ chứa phần **thật sự khác nhau** giữa các nốt: tên, MIDI, cách tìm trên bàn phím
   (`landmark`), vị trí trên khuông (`staff`), ngón + thế tay (`finger`). Câu nào viết chung được bằng `${name}` thì viết trong khuôn.
3. Thay đổi thành phần giao diện dùng chung (`components/curriculum/common.tsx`, `QuizSteps.tsx`, `LessonPlayerScreen.tsx`)
   tự áp dụng cho mọi nốt.
4. Sau khi sửa:
   - `npm test`: `supplement.test.ts` có test **"mọi nốt cùng một khuôn"** (cùng số trang, cùng loại hình, cùng bài tập)
     và bộ test chạy lặp cho từng nốt (`describe.each`). Thêm kiểm tra mới thì đặt trong `describe.each` để mọi nốt được kiểm.
   - `npm run voice` (câu chữ đổi → cần mp3 mới cho giọng cô giáo).
   - `npm run test:e2e -- e2e/supplement.spec.ts`.
5. **Ghi một dòng vào nhật ký bên dưới** (ngày, thay đổi, áp dụng cho nốt nào).

## Khuôn bài hiện tại

| Bước | Nội dung |
| --- | --- |
| Giới thiệu 1 | Khuông nốt ở 5 trường độ (tên trường độ dưới từng nốt, Nghe mẫu) + bàn phím 3 quãng tám tô nốt (Nghe) |
| Giới thiệu 2–6 | Từng trường độ: tròn, trắng, đen, móc đơn, móc đôi — một ô 4/4, phóng to ×2, số phách ở tiêu đề thẻ; thẻ phép so sánh dưới khuông (`DURATIONS.equations`) |
| Giới thiệu 7 | Vị trí trên bàn phím theo nhóm 2 / 3 phím đen (`landmark`) |
| Giới thiệu 8 | Nốt giữa trên khuông khoá Sol (`staff`) |
| Giới thiệu 9 | Ngón tay phải trên thế Đô (Đô–Sol) hoặc thế Sol (La, Si) (`finger`) |
| Giới thiệu 10 | Nốt thấp / giữa / cao (quãng tám 3, 4, 5) |
| Giới thiệu 11 | Tổng hợp trường độ (khuông như trang 1) |
| Bài 1 | Đố trường độ: 10 câu xáo, mỗi trường độ 2 lần, sai chọn lại, đạt ≥ 7 |
| Bài 2 | Câu đố chọn hình: 2 câu phím, 2 câu khuông, 2 câu ngón; vị trí đáp án xoay theo nốt; đạt ≥ 5/6 |
| Bài 3 | Luyện phím: nốt giữa ×2, một nốt cùng tên khác, nốt thấp, nốt cao; đạt ≥ 4/5 |
| Trò chơi | Bóng bay kiểu Tìm nốt (Hình nốt), Săn phím, Bắn bóng trên khuông — chỉ nốt của buổi |

## Nhật ký thay đổi

| Ngày | Thay đổi | Áp dụng |
| --- | --- | --- |
| 2026-10-31 | Bài mẫu nốt Đô: giới thiệu (hình + âm thanh), câu đố chọn hình, luyện phím, bé tự chọn trò | Đô |
| 2026-10-31 | Bóng bay mở từ buổi học ở chế độ Hình nốt | Đô |
| 2026-10-31 | Trang 1: khuông nốt nhiều trường độ (tên trường độ dưới nốt) ở trên, bàn phím ở dưới, mỗi hình một thẻ trắng | Đô |
| 2026-10-31 | Đố trường độ 10 câu ngẫu nhiên sau phần giới thiệu; thêm móc đôi | Đô |
| 2026-11-01 | Đố trường độ: khuông phóng to ×2, thẻ cao cố định | Đô |
| 2026-11-01 | Quay lại / Tiếp ở mọi bước của buổi học (giao diện chung) | mọi buổi |
| 2026-11-01 | 5 trang giới thiệu riêng từng trường độ; thanh nút trang giới thiệu ghim đáy | Đô |
| 2026-11-01 | **Chuyển sang khuôn chung `noteLesson`**, thêm Rê, Mi, Pha, Sol, La, Si. Câu đố chọn hình sinh tự động (phím trắng gần nhất, nốt cách quãng 2 / 3, ngón khác); câu 6 đổi thành "Ngón … — hình nào?"; trang ngón tay hiện cả thế tay 5 ngón | cả 7 nốt |
| 2026-11-01 | 5 trang trường độ thêm thẻ phép so sánh bằng hình nốt: 1 tròn = 4 phách, 1 tròn = 2 trắng; 2 trắng = 1 tròn, 1 trắng = 2 đen; 2 đen = 1 trắng, 1 đen = 2 móc đơn; 2 móc đơn = 1 đen, 1 móc đơn = 2 móc đôi; 2 móc đôi = 1 móc đơn, 4 móc đôi = 1 đen | cả 7 nốt |
