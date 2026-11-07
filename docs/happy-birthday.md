# Happy Birthday — ba bản phối piano hai tay

Bổ sung "Happy Birthday to You" với 3 bản phối hai tay **Cơ bản / Trung cấp / Nâng cao** vào Thư viện bài, Thư viện bài hát
và giáo trình (mục "Luyện thêm"). Mọi thứ dựng trên kiến trúc sẵn có (không có hệ thống vẽ / MIDI / chấm điểm song song);
khi yêu cầu khác quy tắc cũ của dự án thì **quy tắc cũ được ưu tiên** (ghi rõ ở mục "Quyết định").

## 1. Dữ liệu bản nhạc

| Mục | Vị trí |
| --- | --- |
| 3 bản phối + metadata chung + lộ trình 5 bước | `src/core/lessons/arrangements/happyBirthday.ts` |
| Họ bản phối (chọn cấp, gợi ý cấp, lên cấp) | `src/core/lessons/arrangements/index.ts` |
| Tiến độ lộ trình (localStorage theo hồ sơ) | `src/core/lessons/arrangements/planProgress.ts` |
| Đăng ký vào thư viện (ngay sau bài một bè `song-happy-birthday`) | `src/core/lessons/library.ts` |

Id bài: `song-happy-birthday-beginner`, `song-happy-birthday-intermediate`, `song-happy-birthday-advanced`
(`Lesson.arrangement = { family: 'happy-birthday', level: 1 | 2 | 3 }`). Mỗi cấp là một `Lesson` riêng → tiến độ, kỷ lục,
lịch sử, nhận xét AI lưu riêng từng cấp.

**Định dạng:** dùng ký hiệu gọn sẵn có của dự án (thay cho MusicXML) vì khuông nhạc (VexFlow), Wait Mode, Biểu diễn,
nghe mẫu, xuất ảnh và xuất MIDI đều đọc cùng nguồn này → luôn đồng bộ. Mở rộng (tuỳ chọn, bài cũ không đổi):

| Trường | Ý nghĩa |
| --- | --- |
| `LessonNote.harmony` | chùm nốt tay phải: `"E4+C5/h:1+5"` — nốt CAO NHẤT là giai điệu, còn lại là hoà âm, chung trường độ |
| `Lesson.chordSymbols` | ký hiệu hợp âm theo chỉ số nốt giai điệu (C, G7/B, Fm/A♭…) |
| `Lesson.hairpins` | to dần / nhỏ dần giữa hai nốt giai điệu |
| `PedalMark.fromBeat / toBeat` | đổi pedal giữa ô nhịp (theo hợp âm) |
| `Lesson.pedalOptional` | pedal chỉ là gợi ý (không chấm) |
| `Lesson.tempoRange` | khoảng nhịp độ tham khảo |
| `Lesson.slice` | đoạn ô nhịp cắt ra để luyện (luyện theo đoạn) |

Mọi vị trí trong dữ liệu ghi theo **[số ô in, phách lệch]** (ô lấy đà = 0) rồi đổi ra chỉ số nốt bằng `noteIndexAt`
(`lessons/positions.ts`) — viết sai vị trí thì báo lỗi ngay khi tải.

Thông số chung: Đô trưởng, 3/4, ô lấy đà 1 phách ("Hap-py"), khuông Sol tay phải / khuông Fa tay trái, số ngón 1–5.
Giai điệu gốc: "Good Morning to All", Mildred & Patty Hill (1893) — phạm vi công cộng (`source` ghi rõ); hoà âm, phần đệm,
số ngón tự soạn.

```
G4/8d G4/16 | A4 G4 C5 | B4/h G4/8d G4/16 | A4 G4 D5 | C5/h G4/8d G4/16 | G5 E5 C5 | B4 A4 F5/8d F5/16 | E5 C5 D5 | C5/hd
```

## 2. Ba bản phối

### Cấp 1 — Cơ bản (♩ 72, tham khảo 60–80)

- **Tay phải:** giai điệu từng nốt, ghi số ngón MỌI nốt. Thế Sol (ngón 1 ở Sol4) cho ô 0–4 → nhảy quãng 8 lên thế Đô cao
  (ngón 1 ở Đô5) ở ô 5 → lùi về thế Sol ở "Na-me" (ô 6) → lên lại thế Đô cao từ "Hap-py" cuối ô 6. Ba lần đổi thế là
  tối thiểu: giai điệu trải La4 – Sol5 (quãng 7) ở ô 5–6.
- **Tay trái:** thế Đô (ngón 5 ở Đô3), **không rời tay**: một nốt trầm giữ cả ô — Đô3 (C), Sol3 (G), Fa3 (F);
  ô 7 thêm Sol3 ở phách 3; ô cuối quãng 5 Đô3 – Sol3.
- Hợp âm: C | G | G | C | C | F | C – G | C. Không sắc thái. Pedal: gợi ý ở ô cuối, **không chấm**.

### Cấp 2 — Trung cấp (♩ 88, tham khảo 75–100)

| Ô | Hợp âm | Tay phải (thêm) | Tay trái |
| --- | --- | --- | --- |
| 1 | C | — | valse C3 \| E3+G3 \| E3+G3 |
| 2 | G7/B | Sol4+Si4 (quãng 3) | B2 \| F3+G3 \| F3+G3 |
| 3 | G7/B | Fa4+Rê5 (quãng 6, có nốt 7 của G7) | B2 \| F3+G3 \| F3+G3 |
| 4 | C | Mi4+Đô5 (quãng 6) | rải C3 G3 C4 |
| 5 | C7 | Mi5+Sol5, Đô5+Mi5; đổi ngón 1→5 trên Đô5 | C3 \| E3+B♭3 \| E3+B♭3 |
| 6 | F/A | Sol4+Si4 → Fa4+La4 (hai quãng 3 nốt dựa) | A2 \| C3+F3 \| C3+F3 |
| 7 | C → G7/B | Đô5+Mi5, Si4+Rê5 | C3 \| E3+G3 \| B2+F3+G3 |
| 8 | C | Mi4+Đô5 (quãng 6) | rải C3 G3 C4 |

Sắc thái mp → p (câu 2, tiếng vọng) → to dần → mf (ô 5) → mp. Pedal thay mỗi ô, trừ ô 6 (nốt dựa sẽ nhoè) và ô 7
(đổi hợp âm giữa ô).

### Cấp 3 — Nâng cao (♩ 100, tham khảo 85–115)

| Ô | Hợp âm | Tay phải | Tay trái | Pedal |
| --- | --- | --- | --- | --- |
| 1 | C6 | Mi4 giữ bè trong: Mi+La, Mi+Sol, Mi+Sol+Đô | valse nhảy C2 \| E3+G3+C4 ×2 | cả ô |
| 2 | G7 | Fa4+Sol4+Si4 | G2 \| D3+F3+B3 ×2 | cả ô |
| 3 | G9 | Fa4+La4, Sol4, Fa4+Si4+Rê5 | rải móc đơn G2 D3 F3 B3 F3 D3 | cả ô |
| 4 | C | Mi4+Sol4+Đô5 | câu nối đi lên C2 G2 C3 E3 G3 C4 (vắt ngón 3) | cả ô |
| 5 | C7 → C7/B♭ | **quãng 8 có bè giữa**: Sol4+Si♭4+Sol5, Mi4+Si♭4+Mi5, Mi4+Si♭4+Đô5 | C3 \| E3+G3+B♭3 \| B♭2+E3+G3 | đổi ở phách 3 |
| 6 | F/A → Fm/A♭ | Sol4+Si4 → Fa4+La4 (nốt dựa), La♭4+Đô5+Fa5 | A2 \| A2+C3+F3 \| A♭2+C3+F3 | đổi ở phách 2 và 3 |
| 7 | C/G → G7 | Sol4+Đô5+Mi5, Sol4+Đô5, Fa4+Si4+Rê5 | G2 \| C3+E3 \| G2+B2+F3 | đổi ở phách 3 |
| 8 | C | Mi4+Sol4+Đô5 | câu nối đi lên C2 … C4 | cả ô |
| 9 (coda) | C | Đô5+Mi5+Sol5+Đô6 | C2+C3 | cả ô |

Bè trầm ô 5–8 đi xuống nửa cung **Đô – Si♭ – La – La♭ – Sol – Đô**. Sắc thái mp → mf → to dần → **f** (ô 5) → nhỏ dần →
mp → nhỏ dần → **p** (coda). Pedal đổi theo hợp âm, kể cả giữa ô.

### Kiểm tra tầm tay (test tự động)

Mỗi chùm nốt một tay ≤ quãng 8 (≤ 4 nốt tay phải, ≤ 3 nốt tay trái), số ngón khác nhau và theo đúng chiều phím;
tay trái luôn thấp hơn tay phải (tay trái ≤ Đô4, tay phải ≥ Rê4); mọi nốt trong MIDI 36–84; nốt trầm ở chỗ đổi hợp âm đúng
ký hiệu hợp âm (kể cả hợp âm đảo), mọi nốt tay trái và nốt hoà âm tay phải thuộc hợp âm (trừ nốt dựa ô 6 — chủ ý).

## 3. Chế độ luyện tập (màn Luyện tập, áp dụng cả ba cấp)

| Yêu cầu | Trên app |
| --- | --- |
| A — Nghe mẫu | "Nghe mẫu": phát cả chùm nốt tay phải + tay trái, ngân theo pedal, to dần / nhỏ dần; con trỏ + phím trên bàn phím chạy theo |
| B — Tập từng tay | Hai tay / Tay phải / Tay trái; chỉ chấm nốt tay được chọn, tay kia làm mờ |
| C — Hai tay chậm | "Theo nhịp" + −/+ tốc độ (40–160 %), đếm vào trước khi chạy; tổng hợp tiếng nên đổi tốc độ không đổi cao độ |
| D — Wait Mode | "Chờ nốt": đàn MIDI / bàn phím ảo phải đủ chùm nốt tay phải + tay trái của bước (thứ tự bất kỳ) mới sang bước |
| E — Biểu diễn | **Mới**: "Biểu diễn" — đồng hồ nhịp cố định (đếm vào 1 ô + phách trước nốt lấy đà, metronome), chơi một mạch, sai không dừng, tổng kết |

Thêm: chọn cấp độ ngay trên màn (✓ = đã vững, "gợi ý" = cấp nên tập), **Lộ trình** 5 bước mỗi cấp (bấm → đặt sẵn tay,
chế độ, tốc độ; bước xong khi chơi hết bài đạt ≥ 80 %), **Đoạn**: luyện riêng ô từ – tới, nút nhanh "đoạn hay sai".

## 4. Chấm điểm và AI cục bộ

Hai tầng tách biệt:

1. **Chấm bằng số liệu** (`practice/PerformanceTracker`, `practice/performPlan.ts`, `practice/waitBreakdown.ts`):
   - Biểu diễn: cùng rubric bài Biểu diễn của giáo trình (`curriculum/scoring.ts`): đúng nốt 45 + đúng nhịp 30 + trường độ
     (Note Off) 15 + hoàn thành 10, + mạnh nhẹ 15 khi bài có dấu sắc thái, + pedal 15 khi bài có pedal được chấm. Tiêu chí
     không đo được → chia lại trọng số. Thêm: điểm từng tay, **đồng bộ hai tay** (cùng phách lệch ≤ 80 ms), ô nhiều lỗi
     (sai + lỡ + lệch nhịp), gợi ý đoạn luyện lại. PerformanceTracker nay xử lý hợp âm: cửa sổ theo mốc phách, ưu tiên phím
     đúng trong chùm, chỉ bỏ onset lặp CÙNG phím (bài một dòng của giáo trình chấm y như trước).
   - Chờ / Đếm nốt: độ chính xác như cũ + **từng tay** (phím đúng theo bước; phím sai đoán theo vùng phím) + lỗi theo ô.
     Không có đồng hồ nhịp → tiết tấu "không đo".
2. **AI cục bộ (Ollama)** chỉ diễn giải số liệu (`feedback/coachPrompt.ts`: `performReport`, `practiceReport` + điểm từng tay,
   ô hay sai). Prompt cấm nhắc tiêu chí "không đo" và **cấm nhận xét ngón tay** (app không có cảm biến ngón).

Không phạt khi thiết bị không có dữ liệu: micro → chỉ chấm giai điệu (một nốt mỗi lúc), bàn phím ảo → không có lực gõ
(mạnh nhẹ "không đo"), **pedal "không đo" cho tới khi đàn MIDI gửi tín hiệu pedal đầu tiên** (đàn không cho biết có cắm pedal).

Lịch sử phiên (`PracticeSession`) ghi thêm `mode`, `score`, `measureErrors` (lỗi theo ô), `measures` (luyện đoạn — không
tính là xong cả bài). Thẻ bài ở thư viện hiện độ chính xác tốt nhất, số lần luyện và số lần chơi xong cả bài.

## 5. Giao diện

- Khuông đôi có ngoặc, ký hiệu hợp âm (B♭/F♯ hiển thị đúng dấu), số ngón xếp chồng phía trên chùm nốt (không đè đuôi nốt),
  hình nêm to dần / nhỏ dần, pedal có khấc ở chỗ đổi (cả giữa ô).
- Nút **Hiển thị** (biểu tượng thanh trượt): tên nốt, số ngón, ký hiệu hợp âm, ký hiệu pedal, màu riêng tay trái, cỡ khuông 60–160 %
  (phóng to quá khung → cuộn dọc). Chỉ đổi hình vẽ, không đổi dữ liệu / cách chấm.
- Tô màu: nốt tay trái màu xanh dương riêng (nút "Tô màu riêng tay trái", mặc định bật, mọi bài khuông đôi); con trỏ +
  nốt đúng / sai luôn đè lên màu tay; Biểu diễn hai tay tô cả nốt tay trái; tập một tay làm mờ tay kia; bàn phím: hồng =
  tay phải (nốt hoà âm hồng nhạt), vàng = tay trái. Tự cuộn theo vị trí đang chơi / đang phát.
- Xuất ảnh khuông nhạc (đã có) + **Tải file MIDI** cả bài (tay phải kênh 1, tay trái kênh 2).

## 6. Giáo trình

"Luyện thêm" của tuần: cấp 5 tuần 1 "Nốt trầm tay trái" → Cơ bản; cấp 5 tuần 3 "Đệm nhịp" (đệm valse) → Trung cấp;
cấp 6 tuần 4 "Buổi hoà nhạc" (sắc thái, pedal) → Nâng cao.

## 7. Quyết định (để duyệt)

1. **Ký hiệu gọn thay MusicXML** — đúng quy tắc "không tạo hệ thống song song"; MIDI chuẩn xuất được từ cùng dữ liệu.
2. **Bản Cơ bản có ký hiệu pedal ở ô cuối** vì quy tắc dự án "mọi bài khuông đôi có pedal"; đánh dấu `pedalOptional`
   nên không chấm (yêu cầu: "không bắt buộc pedal").
3. **Hai bè độc lập trong một tay chưa hỗ trợ**: chùm nốt tay phải dùng chung trường độ (một đuôi nốt). Bản Nâng cao vì
   vậy dùng hoà âm dạng chùm + câu nối ở tay trái thay cho bè trong chuyển động riêng.
4. **Chưa có**: nốt trang trí (nốt hoa mỹ), dấu legato / staccato, ritardando, fermata — bộ vẽ và bộ chấm chưa có. Bản
   Nâng cao dùng **ô coda** (hợp âm Đô cao, p) làm câu kết thay rit.; to dần / nhỏ dần chỉ vẽ + nghe mẫu, không chấm
   (điểm mạnh nhẹ so các đoạn p / mf / f như giáo trình).
5. **Hoà âm cần nghe duyệt**: ô 1 bản Nâng cao dùng C6 (La4 trên nền Đô); ô 6 bản Trung cấp + Nâng cao để Si4/Sol4 là
   hai nốt dựa trên hợp âm Fa (F/A); bản Trung cấp dùng G7/B (bè trầm Si2) thay vì G7 gốc để tay trái không rời thế Đô;
   bản Nâng cao có Fm/A♭ (hợp âm thứ của bậc IV) ở "Hap-py" cuối và bè trầm đi xuống nửa cung.
6. **Pedal "không đo" khi chưa nhận tín hiệu pedal** từ đàn trong lần mở app (không phân biệt được "không có pedal" với
   "không đạp") — thiên về không phạt.
7. **Gợi ý cấp** dựa trên tiến độ đã lưu: cấp thấp nhất chưa "vững" (đã hoàn thành cả bài hai tay ≥ 90 %); lên cấp gợi ý
   ngay ở hộp thoại kết quả khi đạt ≥ 90 % (Biểu diễn: ≥ 90 điểm).
8. Chế độ **Biểu diễn** là chế độ chung của màn Luyện tập (mọi bài thư viện đều dùng được), không riêng Happy Birthday.

## 8. Kiểm thử (tự động)

| Yêu cầu §11 | Test |
| --- | --- |
| 1. Giai điệu đúng 3 cấp | `arrangements/happyBirthday.test.ts` (so cao độ + trường độ với giai điệu gốc) |
| 2. Hai khuông hiển thị | e2e `happy-birthday.spec.ts` (số nốt, hợp âm, nêm, pedal, đổi cấp); ảnh chụp kiểm tra tay |
| 3. Tổng trường độ ô | `happyBirthday.test.ts` + test chung `lessons.test.ts` (cả ô lấy đà, ô cuối, hai tay) |
| 4. Phân tay đúng | tay trái < tay phải, mọi nốt thuộc đúng khoá |
| 5. Nốt chơi được | tầm tay ≤ quãng 8, ngón theo chiều phím, MIDI 36–84 |
| 6. MIDI đúng cao độ / trường độ / thứ tự | đọc lại file MIDI xuất ra; nguồn phát = nguồn khuông |
| 7. Phát lại + tô sáng đồng bộ | e2e Nghe mẫu (con trỏ + phím chạy theo) |
| 8. Wait Mode hợp âm + nốt đồng thời | unit (thứ tự bất kỳ, thiếu nốt, sai nốt) + e2e bàn phím ảo |
| 9. Chấm đúng khi đúng / cố ý sai | `practice/performPlan.test.ts` (100 điểm khi đúng; sai tay trái ô 3 → ô 3; lệch hai tay → đồng bộ 0), `waitBreakdown.test.ts`, e2e Biểu diễn với MIDI giả |
| 10. Đổi tốc độ, bật / tắt hướng dẫn | e2e (tốc độ, ngón, hợp âm, pedal, phóng to — số nốt / chấm không đổi) |
| 11. iPad / desktop | e2e Chromium khung iPad ngang 1180×820 — **chưa thử Safari / iPad thật** |
| 12. Không hỏng tính năng cũ | toàn bộ unit + e2e cũ; PerformanceTracker giữ nguyên hành vi bài một dòng |

Luyện theo đoạn: `lessons/slice.test.ts`; lộ trình: `arrangements/planProgress.test.ts`; hợp âm Biểu diễn:
`PerformanceTracker.test.ts`.

## 9. Tồn đọng / cần nghiệm thu

**Chỉ mới kiểm thử mô phỏng** (Chromium, đàn MIDI giả lập, bàn phím ảo). Chưa thử: đàn MIDI thật (độ trễ, Note Off, lực
gõ, CC64), iPad / Safari thật (micro + chùm nốt), app vỏ Core MIDI.

Checklist cho người dùng:

- [ ] Nghe "Nghe mẫu" cả 3 cấp; duyệt các chỗ ở mục 7.5 (C6 ô 1, nốt dựa ô 6, Fm/A♭, bè trầm đi xuống).
- [ ] Duyệt số ngón (đặc biệt đổi thế ô 5–6 bản Cơ bản, đổi ngón 1→5 trên Đô5 bản Trung cấp, vắt ngón 3 ở câu nối tay trái).
- [ ] Đàn MIDI thật: Chờ nốt hai tay với chùm nốt; Biểu diễn có pedal (đạp đúng / sai) và lực gõ p – mf – f.
- [ ] iPad + micro: Chờ nốt tay phải (chỉ chấm giai điệu, nốt hoà âm không bị tính sai).
- [ ] Mở file MIDI tải về bằng phần mềm khác (đúng 2 kênh, đúng nhịp 3/4).
- [ ] Giáo trình cấp 5 tuần 1, tuần 3; cấp 6 tuần 4: mục "Luyện thêm" mở đúng bài.
