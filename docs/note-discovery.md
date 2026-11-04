# Module Khám phá nốt nhạc (Note Discovery)

Tài liệu thiết kế kiến trúc, mô hình dữ liệu, lộ trình học và tích hợp cho module **Khám phá nốt nhạc** trong VietPiano.

## 1. Mục tiêu & Đối tượng
- **Đối tượng:** Trẻ em 4–8 tuổi và người mới bắt đầu học piano.
- **Phương pháp:** Piano trực quan (Visual Piano) — kết nối trực tiếp phím đàn piano (phím trắng, phím đen, mốc nhóm 2 và 3 phím đen) ↔ vị trí nốt trên khuông nhạc khóa Sol ↔ âm thanh thực tế ↔ thao tác gõ phím.
- **Nguyên tắc sư phạm:** Giảm dần sự phụ thuộc vào màu sắc và gợi ý (scaffolding reduction). Không mở khóa chỉ dựa vào việc nhấn đúng khi đang bật gợi ý.

## 2. Kiến trúc Module (`src/core/noteDiscovery/`)
- [`musicModel.ts`](../src/core/noteDiscovery/musicModel.ts): Domain model phân định rạch ròi MIDI number, pitch class, octave, scientific notation, tên nốt tiếng Việt, vị trí dòng/khe trên khuông khóa Sol, dòng kẻ phụ (`ledger-line` cho C4), và quan hệ với nhóm 2/3 phím đen.
- [`types.ts`](../src/core/noteDiscovery/types.ts): Schema định nghĩa 6 Activity types, tiêu chí đánh giá, hồ sơ kỹ năng từng nốt (`NoteSkillStats`) và tiến độ học viên (`NoteDiscoveryProgress`).
- [`stages.ts`](../src/core/noteDiscovery/stages.ts): Định nghĩa chi tiết 8 Stages từ Khám phá phím đến Ôn tập độc lập.
- [`NoteDiscoveryEngine.ts`](../src/core/noteDiscovery/NoteDiscoveryEngine.ts): Bộ điều khiển máy trạng thái (FSM) thuần TypeScript quản lý tiến trình hoạt động, phản hồi đúng/sai, đo thời gian phản hồi, ngăn chặn double event khi giữ phím.
- [`AdaptiveReviewService.ts`](../src/core/noteDiscovery/AdaptiveReviewService.ts): Thuật toán học tập thích ứng: theo dõi độ chính xác từng kỹ năng, tính toán Mastery Level (`new` → `learning` → `practicing` → `remembered` → `mastered`), phát hiện nốt hay nhầm (`troubleNotes`), và lập lịch ôn tập cách quãng (Spaced Repetition).
- [`NotePoolProvider.ts`](../src/core/noteDiscovery/NotePoolProvider.ts): Cung cấp tập nốt học tập dùng chung cho các mini-game (Tìm nốt nhạc, Thu hoạch cà chua, Flappy Note, F1 Racing).
- [`storage.ts`](../src/core/noteDiscovery/storage.ts): Quản lý lưu trữ tiến độ theo từng hồ sơ (hỗ trợ multi-profile).

## 3. Giao diện & Trải nghiệm (`src/components/noteDiscovery/`, `src/screens/`)
- **Tỷ lệ hiển thị:** Tối ưu 16:9, responsive iPad ngang và màn hình cảm ứng (nút bấm ≥ 48px).
- **Thanh trên (`DiscoveryTopBar`):** Hiển thị tên bài học, tiến độ, nút nghe lại giọng cô giáo tiếng Việt (`VoiceTeacher`), nút tạm dừng và quay lại.
- **Khuôn viên trung tâm (`DiscoveryStaffView` & `DiscoveryActivityCard`):** Khuông nhạc lớn rõ nét, khóa Sol chuẩn, nốt hiện tại nổi bật có vòng hào quang, vị trí dòng kẻ phụ cho C4 chính xác, hỗ trợ `prefers-reduced-motion`. Thẻ tương tác hỗ trợ nghe mẫu, trắc nghiệm và so sánh cao độ.
- **Phía dưới:** Bàn phím piano tương tác (tái sử dụng `PianoKeyboard`), highlight phím, phản hồi đúng/sai, tự co giãn phạm vi phím theo bài học.
- **Bản đồ chặng học (`NoteDiscoveryOverviewScreen`):** Bản đồ 8 chặng và bảng theo dõi mức độ thành thạo của từng nốt nhạc từ C4 đến C5 cho phụ huynh.

## 4. Lộ trình 8 Chặng học (Stages)
1. **Chặng 1:** Khám phá bàn phím trắng, đen và nhóm 2/3 phím đen.
2. **Chặng 2:** Nhận biết Đô giữa C4 (MIDI 60).
3. **Chặng 3:** Bộ ba Đô – Rê – Mi (C4, D4, E4).
4. **Chặng 4:** Bộ đôi Fa – Sol (F4, G4).
5. **Chặng 5:** La – Si – Đô cao (A4, B4, C5).
6. **Chặng 6:** Khuông nhạc khóa Sol từ C4 đến C5.
7. **Chặng 7:** Chơi chuỗi nốt và giai điệu đơn giản.
8. **Chặng 8:** Ôn tập ngẫu nhiên, không gợi ý.

## 5. Tích hợp Mini-game
- **Tìm nốt nhạc (Bóng bay nốt nhạc - Hunt Mode):** Tự động nhận `huntLetters` và nốt ưu tiên từ các nốt đã học trong Note Discovery.
- **Thu hoạch cà chua (Tomato Harvest):** Đề xuất độ khó (`easy` / `medium` / `hard`) và tập nốt dựa trên số nốt học viên đã thành thạo.
- **Flappy Note & F1 Racing:** Điều chỉnh tập nốt luyện tập tương ứng theo tiến độ học viên.
- **Fallback an toàn:** Nếu học viên chưa có dữ liệu, các trò chơi tự động sử dụng tập nốt khởi đầu (C4, D4, E4) để hoạt động độc lập bình thường.
