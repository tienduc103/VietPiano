# Đố bé nốt gì?

Trò chơi cho bé từ 4 tuổi: cô giáo hoạt hình hỏi bằng **giọng nói + chữ**, bé **chạm vào hình nốt đúng**.
Đáp án là HÌNH nốt trên khuông (khoá + nốt) — không có chữ A/B/C/D, Đô/Rê/Mi hay tên trường độ trên ô.
Không cần đàn (chỉ chạm), không giới hạn thời gian.

Route `note-quiz` (`?screen=note-quiz`), thẻ trong mục Trò chơi (`STANDALONE_GAMES`), ghim lối tắt được (`game` / `note-quiz`).

## Cách chơi

| Chế độ | Cô hỏi | Các ô đáp án |
| --- | --- | --- |
| Cao độ | "Bé ơi, đâu là nốt Đô?" | mỗi ô một TÊN nốt khác nhau, cùng trường độ |
| Trường độ | "Bé tìm giúp cô nốt Tròn nhé!" | cùng cao độ, mỗi ô một hình trường độ (Tròn, Trắng, Đen, Móc đơn, Móc đôi) |
| Kết hợp | "Bé ơi, đâu là nốt Đô Tròn?" | mỗi ô một cặp (tên, trường độ); có ô cùng tên khác trường độ + ô cùng trường độ khác tên |

- Đúng: ô sáng xanh, phát tiếng đàn của nốt (dài theo trường độ), cô khen "Giỏi quá! Đây đúng là nốt Đô Tròn!",
  rồi MỚI hiện tên nốt dưới ô + giải thích (vị trí trên khuông / hình trường độ, số phách). Tự sang câu sau khi cô khen xong,
  hoặc bấm "Câu tiếp". Chạm lại ô đúng → nghe lại tiếng nốt.
- Sai: ô rung nhẹ + mờ đi (không chạm lại được), cô gợi ý thông minh (mục dưới) — không trừ điểm, không mất lượt thử,
  bé chọn tiếp tới khi đúng.
- 🔊 nghe lại câu hỏi bao nhiêu lần cũng được.

## Cô giáo gợi ý thông minh (`core/noteQuiz/hints.ts`)

Bé chọn sai → cô KHÔNG chỉ ngay đáp án; mỗi lần sai tiếp theo gợi ý cụ thể hơn (bậc chỉ tăng). Gợi ý luôn hiện chữ
(khu gợi ý dưới câu hỏi, `nq-hint`) + đọc bằng giọng cô (tắt được).

| Bậc | Khi nào | Nội dung | Ô đáp án |
| --- | --- | --- | --- |
| 1 · Lời | lần sai thứ `hintAfter` | gợi ý thô phần bé nhầm: nốt nằm trên dòng / trong khe / phía dưới / trên khuông; hình dáng trường độ ("Nốt Tròn có hình bầu dục rỗng và không có thân.") | không đánh dấu gì |
| 2 · Trực quan | lần sai sau | vị trí chính xác THEO KHOÁ ĐANG HỎI ("Ở khoá Fa, nốt Đô nằm ở khe thứ 2.") + khuông minh hoạ riêng tô dòng / khe (`HintStaff`); hình mẫu trường độ (`NoteSample`, không khoá). Kết hợp: cao độ rồi trường độ | không đánh dấu gì |
| 3 · Hướng dẫn | lần sai sau | "Cô cất bớt mấy hình chưa đúng…": làm mờ một nửa số ô sai còn lại (ô sai nhiều thuộc tính trước), lặp lại mỗi lần sai, luôn chừa ≥ 1 ô sai | ô bị cất mờ, không chạm được |
| 4 · Chỉ đáp án | chỉ còn 1 ô sai (không cất thêm được) | "Cô chỉ cho bé nhé: đây là nốt …" + vị trí / hình dáng | ô đúng sáng lên |

Đã phải chỉ đáp án → bé chạm đúng xong, lượt có thêm MỘT câu tương tự ngay sau (cùng khoá + cùng yêu cầu, đáp án nhiễu / vị trí ô mới;
chấm hiện vòng xanh ở dãy tiến độ), không tính vào tỉ lệ sao.

Nguyên nhân sai (`wrongCause`): sai cao độ → hướng dẫn vị trí; sai trường độ → đầu nốt rỗng / đen, thân, móc;
Kết hợp đúng tên sai trường độ → "Bé tìm đúng nốt Đô rồi! Nhưng cô đang hỏi nốt Đô Tròn cơ."; đúng trường độ sai tên →
"Bé nhận ra nốt Tròn rồi! Bây giờ mình tìm đúng vị trí nốt Đô nhé."; sai cả hai → gợi ý phần bé hay nhầm hơn trước (`preferFor`).

Cá nhân hoá (theo quy tắc, `tracker.ts`): phần bé hay nhầm (≥ 3 lần hỏi, nhầm ≥ 1/2) → hỏi nhiều hơn (`weightFor`) + gợi ý
đơn giản hơn (bắt đầu ngay ở bậc 2); đúng ngay ≥ 3 câu liền ở mọi phần của câu → gợi ý muộn thêm một lần sai (giảm dần gợi ý).
Phần hay nhầm có nút "🎯 Luyện riêng" (tổng kết + bảng cài đặt): lượt 5 câu, 2 ô, chỉ phần đó + phần hay nhầm sang, hỗ trợ tối đa
— cấu hình tạm, không lưu, kỷ lục tách riêng (`practice:`), "Về lượt chơi chính" / đổi cài đặt để thoát.
Ghi lại: số lần chạm, lỗi cao độ / trường độ, số câu cần gợi ý, số câu cô phải chỉ đáp án (tổng + theo từng phần, `QuizStats.totals`),
mỗi lượt lưu `helped` / `revealed`.

Câu chữ: bộ câu chuẩn cố định (nhạc lý kiểm chứng bằng test, vị trí tính từ `staffStep` của khoá đang hỏi) → thu sẵn giọng.

Cài đặt: Gợi ý thông minh (tắt: chỉ "Chưa đúng rồi, bé thử lại nhé!", không bao giờ lộ đáp án) · Gợi ý sau 1 / 2 lần sai ·
Đọc gợi ý bằng giọng cô · Hiển thị minh hoạ trực quan · Hỗ trợ tối đa cho bé nhỏ (minh hoạ ngay lần sai đầu, cất hết ô sai trừ một).
Mặc định bé 4 tuổi: bật, sau lần sai đầu tiên, đọc + minh hoạ, hỗ trợ tối đa tắt. Bản lưu cũ có `hints` → đọc thành `smartHints`.

## Khoá + vị trí nốt

Khoá Sol, Fa, Đô Alto, Đô Tenor, Hỗn hợp (mỗi câu một khoá, mọi ô của câu cùng khoá). Mỗi ô vẽ khuông + khoá + nốt bằng VexFlow
(`components/noteQuiz/useQuizTiles`), mọi ô của câu chung khung nhìn dọc → so được vị trí giữa các ô.

Vị trí tính thuần ở `core/noteQuiz/staff.ts` (`staffStep`: bậc so với dòng kẻ 1 — Sol Mi4, Fa Sol2, Alto Fa3, Tenor Rê3).
e2e so số này với vị trí VexFlow vẽ thật (`keyProps.line`) ở cả 4 khoá.

Phạm vi (`clefRange`): một quãng tám từ Đô — Sol Đô4–Si4, Fa Đô3–Si3, Alto Đô4–Si4, Tenor Đô3–Si3 (≤ 1 dòng kẻ phụ);
hai quãng tám mở về phía còn chỗ (Sol lên Si5, Fa xuống Đô2, Alto xuống Đô3, Tenor lên Si4; ≤ 3 dòng kẻ phụ).

## Sinh câu hỏi (`core/noteQuiz/questions.ts`)

- Đúng MỘT ô khớp yêu cầu, mọi ô là hình khác nhau (test vét mọi tổ hợp chế độ × khoá × số ô × phạm vi).
- Cao độ: tên các ô khác nhau → hai quãng tám cũng không bao giờ có hai ô "Đô".
- Đáp án nhiễu: nốt / trường độ bé đang học trước; thiếu thì nốt gần nhất trên khuông / trường độ liền kề.
- Không hỏi y hệt hai câu liền nhau (khi còn cách hỏi khác).
- Trường độ: tối đa 5 ô (chỉ có 5 hình) — chọn 6 ô thì dùng 5 (bảng cài đặt báo).

## Chấm điểm + theo dõi lỗi

- Điểm mỗi câu: đúng ngay 10, đúng sau khi thử lại / có gợi ý 5 — không trừ điểm (`NoteQuizRound`). Sao theo tỉ lệ đúng ngay
  (≥ 90% → 3, ≥ 60% → 2), chơi hết lượt luôn ≥ 1 sao. Kỷ lục theo cấu hình (`quizRecordKey`, dùng `ArcadeRecords`).
- Theo dõi lỗi theo hồ sơ (`tracker.ts`): mỗi phần được hỏi (tên nốt theo khoá, trường độ) đếm hỏi / nhầm, cặp hay nhầm.
  Câu Kết hợp: nhầm chỉ tính cho phần bị nhầm. Phần hay nhầm (≥ 3 lần hỏi, nhầm ≥ 1/3) hiện cho phụ huynh ở tổng kết
  + bảng cài đặt, và được hỏi lại nhiều hơn ở lượt sau (`weightFor`, tối đa ×4). Theo quy tắc — không gọi AI.
- Lưu localStorage `vietpiano.note-quiz.v1` theo hồ sơ: cài đặt (mỗi bé một cấu hình), thống kê, kỷ lục, 30 lượt gần nhất.

## Cài đặt (bảng ⚙ trên màn chơi)

Chế độ · Khoá · Số đáp án 2/3/4/6 · Nốt cần học · Phạm vi (một / hai quãng tám) · Trường độ cần học · Số câu 5/10/15/20 ·
Cô tự đọc câu hỏi · 5 mục gợi ý (trên). Nút "Mặc định bé 4 tuổi": khoá Sol, Cao độ, 2 đáp án, Đô–Rê–Mi, 10 câu, cô tự đọc,
gợi ý thông minh từ lần sai đầu.
Đổi bất kỳ mục nào → lượt mới. Dòng ghim lối tắt nằm trong bảng (như mọi trò chơi).

## Giọng cô giáo

Mọi câu ghép từ tập hữu hạn (`core/noteQuiz/voice.ts` → `noteQuizVoiceLines`, 7 tên × 5 trường độ) → `npm run voice` thu sẵn mp3.
Câu hỏi ưu tiên 3, khen / nhắc ưu tiên 4 (ngắt câu hỏi đang đọc dở), không cooldown. Lời khen chờ tiếng đàn của nốt dứt
(`VoiceTeacher.quietUntil`). Cô chạy theo cài đặt chung (Cài đặt → Cô giáo: tắt / tắt tiếng → chỉ hiện chữ, màn chơi báo),
không phụ thuộc Kids Mode: trò dành cho bé chưa biết đọc. Không đọc tên bé.

## Quyết định (chờ duyệt)

1. Thiết kế ghi "Cấu hình trước khi chơi" — theo quy tắc trò chơi của dự án, cấu hình nằm trong bảng ⚙ mở trên màn chơi
   (lớp phủ Sẵn sàng có nút ⚙), không có màn cài đặt riêng.
2. "AI theo dõi lỗi" / "AI cá nhân hoá gợi ý": làm THEO QUY TẮC (thống kê theo hồ sơ → tần suất hỏi, mức gợi ý, bài luyện riêng),
   không gọi Ollama. Đặc tả cho phép AI cục bộ diễn đạt lại câu gợi ý — CHƯA làm: câu diễn đạt lại sẽ không có giọng thu sẵn
   (Chrome Windows im lặng) và khó kiểm chứng không đổi nhạc lý; nếu cần, thêm sau với kiểm tra giữ nguyên tên nốt / khoá / vị trí.
5. Điểm: đặc tả "không trừ điểm" → câu đúng sau gợi ý vẫn được 5 (trước: 6/3/2 theo số lần sai).
6. Bậc 3 cất "một nửa số ô sai còn lại"; bậc 4 chỉ khi không còn cất được (còn 1 ô sai). Câu 2 ô: sai một lần là chỉ còn ô đúng.
3. Móc kép gọi là "Móc đôi" như giáo trình "Làm quen từng nốt".
4. Mỗi câu Hỗn hợp dùng một khoá cho mọi ô (bé so vị trí trên cùng một khoá); khoá đổi giữa các câu.

## Chưa kiểm thử

Chưa thử trên iPad / điện thoại thật và với trẻ thật; e2e chạy trên Chromium (viewport iPad ngang).
