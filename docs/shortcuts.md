# Lối tắt cá nhân (Quick Access)

Người dùng tạo lối tắt tới bất kỳ đích hợp lệ nào trong app (buổi học, phần Luyện tập / Trò chơi của buổi, trò chơi, mức chơi,
bài nhạc, đoạn ô nhịp, trang chính…) và mở thẳng từ thanh cạnh hồ sơ ở trang chủ. Lối tắt lưu riêng cho từng hồ sơ.

## Kiến trúc

| File | Vai trò |
| --- | --- |
| `src/core/shortcuts/types.ts` | `Shortcut`, `ShortcutTarget { type, id, params? }`, `ShortcutSuggestion`, giới hạn |
| `src/core/shortcuts/registry.ts` | **ShortcutRegistry**: mọi đích đến suy từ dữ liệu sẵn có; `resolveTarget`, `targetStatus`, `targetKey`, `sanitizeTarget`, `browseTree`, `searchDestinations` |
| `src/core/shortcuts/ShortcutService.ts` | **ShortcutService**: CRUD thuần (tạo / sửa / xoá + hoàn tác / sắp xếp / hiện trên trang chủ / lọc), làm sạch + lưu theo hồ sơ |
| `src/store/shortcutRoutes.ts` | Đích ↔ `Route` của router sẵn có (`targetToRoute`, `routeToTarget`), `openTarget` |
| `src/store/shortcutStore.ts` | `useShortcuts` (Zustand): lối tắt của hồ sơ đang chọn, tự nạp khi đổi hồ sơ; trạng thái UI dùng chung (hộp thoại, hoàn tác, lối tắt hỏng) |
| `src/components/shortcuts/` | `ShortcutBar` (trang chủ), `ShortcutManager` (Cài đặt), `ShortcutEditorDialog` + `DestinationPicker`, `PinShortcutButton`, `ShortcutOverlays` (gắn ở `App`) |

Không có router thứ hai: mỗi loại đích ánh xạ tới đúng một route sẵn có, điều hướng qua `navigate` / `openLesson` như khi bấm
nút trong app. Hai route được thêm tham số tuỳ chọn (không đổi hành vi cũ): `games.open` (vào thẳng một trò trong mục Trò chơi)
và `settings.section` (cuộn tới mục Lối tắt).

### Loại đích

| `type` | `id` | Tham số | Route |
| --- | --- | --- | --- |
| `page` | tên route: `curriculum`, `supplement`, `note-discovery`, `sound-explore`, `library`, `song-library`, `games`, `five-finger`, `technique`, `coach`, `settings` | — | `{ name: id }` (`library` khi đang ở trang chủ: chỉ cuộn xuống) |
| `game` | `note-hunter`, `flappy-note`, `balloon-pop`, `tomato-harvest`, `f1-racing`, `note-quiz` | `preset` (chỉ Bóng bay) | `{ name: id, preset? }` |
| `level` | `levelId` (giáo trình chính) | — | `curriculum` + `levelId` |
| `lesson` | `lessonId` (giáo trình chính, `sup-…`, `nd-…`) | `stage`: `review` (chỉ giáo trình chính) / `game` | `lesson` + `stage?` |
| `practice` | `Lesson.id` (Thư viện bài / bài hát) | `measures: [từ, tới]` | `practice` (qua `openLesson`, ghi "bài gần đây"; bài tuyển tập → `fromSongs`) |
| `arcade` | `<loại trò>:<mức>` (trò tự do) | — | `games` + `open: { type: 'arcade' }` |
| `lesson-game` | `<lessonId>:<loại trò>` | — | `games` + `open: { type: 'lesson' }` |

Nguồn dữ liệu của bộ chọn: `CURRICULUM` (cấp có nội dung), `SUPPLEMENT`, `DISCOVERY`, `lessonManager` (Thư viện bài theo nhóm,
Thư viện bài hát chia khuông đôi / một tay), `STANDALONE_GAMES` (danh mục trò có màn riêng — mục Trò chơi cũng vẽ từ đây),
`ARCADE_VARIANTS`, `curriculumGameIndex()` (trò của từng buổi). Chỉ danh sách màn cố định (`PAGES`) là liệt kê tay vì router không có
metadata màn; tên lấy từ dữ liệu khi có.

## Quy tắc

- **Không lưu URL / đường dẫn.** `sanitizeTarget` chỉ nhận loại đích trong danh sách, ID dạng `[A-Za-z0-9_.:-]{1,120}` và tham số
  được phép của loại đó (giá trị làm sạch: `stage` ∈ review/game, `measures` số nguyên, `preset` qua `sanitizeBalloonSettings`).
  Biểu tượng chỉ là chữ ngắn (emoji), màu là khoá bảng màu — không CSS tuỳ ý.
- **Theo hồ sơ:** localStorage, một khoá mỗi hồ sơ `vietpiano.shortcuts.v1:<profileId | guest>` (cùng cách các dữ liệu nhỏ theo hồ sơ
  khác của app). Đọc lại bỏ mục của hồ sơ khác / sai dạng / trùng; GIỮ mục có đích không còn (để người dùng sửa / xoá). App không có
  backend → không đồng bộ giữa các máy. Xoá hồ sơ KHÔNG xoá lối tắt của hồ sơ đó (giống tiến độ, kỷ lục trò chơi).
- **Không trùng:** cùng `targetKey` (nội dung + tham số đổi nội dung / chế độ) chỉ có một lối tắt mỗi hồ sơ. Trùng → hộp thoại đề xuất
  mở hoặc sửa lối tắt cũ.
- **Không vượt điều kiện học / quyền:** lối tắt mở ĐÚNG màn như khi bấm trong app nên màn đó tự áp quy tắc: buổi học còn buổi tiên quyết
  hiện "Nên học trước…" (mở khoá chỉ là gợi ý — quyết định sản phẩm), cấp "Sắp có" hiện thông báo, hết quỹ thời gian chơi → màn
  "Đã hết giờ chơi" (`TimedGameRoute` / `GameStage`). Nếu sau này đổi sang khoá cứng, phải chặn ở màn buổi học (`LessonPlayerScreen`),
  không chỉ ở nút của màn Giáo trình — lối tắt đi thẳng vào màn đó.
- **Đích không còn** (bản cập nhật gỡ / đổi ID): nút lối tắt có dấu ⚠️, bấm → hộp thoại "Không mở được…" với Chọn lại nội dung / Xoá.
- **Thanh trang chủ:** tối đa 3 nút (`HOME_BAR_MAX`), đo bề rộng thật còn trống (ResizeObserver) nên không làm hàng hồ sơ cao thêm hay
  tràn; nút ⋯ luôn có khi đã có lối tắt (danh sách đầy đủ, nhóm "Gợi ý", Thêm lối tắt, Quản lý). Màn hẹp → "Lối tắt ⋯".
- **Trẻ em (Kids Mode):** thanh + menu chỉ có mở / thêm lối tắt; sửa, xoá, sắp xếp chỉ ở Cài đặt → Lối tắt.
- **Ghim tại chỗ:** nút 📌 nhỏ cạnh nút toàn màn hình ở đầu trang (Giáo trình — ghim cấp đang xem, buổi học — ghim cả phần Luyện tập /
  Trò chơi đang mở, màn Luyện tập — ghim cả đoạn ô đang luyện, Làm quen từng nốt, Khám phá nốt nhạc, Khám phá âm thanh (trừ lúc bé đang chơi một hoạt động),
  Luyện kỹ thuật ngón tay, AI Piano Coach (trừ lúc đang ghi), Thư viện bài hát, Trò chơi — ghim trò đang chơi); trò có màn riêng + 5 ngón: một dòng trong bảng ⚙ Cài đặt (không thêm nút lên thanh đầu màn chơi). Đã ghim → "Đã ghim",
  Sửa / Bỏ ghim (có Hoàn tác).

## Tích hợp "Lối tắt thông minh" (phiên khác làm)

- `ShortcutBar` nhận `suggestions?: ShortcutSuggestion[]` (giữ thứ tự, bỏ cái trùng `targetKey` với lối tắt thủ công),
  `maxSuggestionsOnBar` (mặc định 1, 0 = chỉ trong menu), `onDismissSuggestion` (nút "Ẩn"), `onOpenSuggestion` (gọi trước khi mở).
  Đề xuất có viền đứt + ✨; menu ⋯ có nhóm "✨ Gợi ý" (lý do dưới tên, Mở, 📌 Ghim → hộp thoại ghim thường).
- `ShortcutManager` nhận `extra?: ReactNode` — vẽ cuối thẻ Cài đặt → Lối tắt.
- API: `targetKey`, `resolveTarget`, `targetStatus(target, records)`, `openTarget`, `useShortcuts.getState().create(input)` (trả
  `duplicate`), `useShortcuts.getState().openEditor({ mode: 'pin', target, name?, icon? })`.

## Quyết định đã chốt (người dùng duyệt 08/11/2026)

- **D1 — Nút ⋯ luôn hiện** khi đã có ít nhất một lối tắt (đặc tả: "nếu có nhiều hơn"). Lý do: chỗ duy nhất trên trang chủ để thêm /
  quản lý lối tắt khi đã có 1–3 lối tắt.
- **D2 — Trẻ em vẫn thêm / ghim được lối tắt** (không phá dữ liệu); chỉ sửa / xoá / sắp xếp nằm ở Cài đặt. App không có phân quyền
  phụ huynh — Cài đặt vẫn mở được từ trang chủ.
- **D3 — Chế độ / màn chơi của trò có màn riêng:** chỉ Bóng bay có tham số route (`preset`, vd "Tìm nốt Đô" mở từ bài học) nên chỉ trò đó
  ghim kèm cấu hình. Các trò khác mở lại với cài đặt đã lưu lần chơi trước (theo hồ sơ / máy), không ghim riêng độ khó.
- **D4 — Lưu localStorage** (không IndexedDB) vì dữ liệu nhỏ, đọc đồng bộ → thanh trang chủ không nháy lúc tải.

## Chưa hỗ trợ (và lý do)

| Nội dung | Lý do |
| --- | --- |
| Trang chủ | Thanh lối tắt nằm ngay trên trang chủ |
| AI Piano Coach / bài kỹ thuật theo bài / đoạn đang chấm | Nút 📌 trong Coach ghim màn Coach chính; ghim riêng bài cần loại đích mới (route `coach` đã có `lessonId` / `measures` / `bpm`) |
| Bước cụ thể trong buổi học (bài tập thứ n) | Bước là trạng thái trong `LessonPlayer`, route không có tham số bước |
| Một mục của trò chơi theo tab "Theo buổi học" / màn chọn buổi của một loại trò | Trạng thái trong màn Trò chơi; ghim được từng trò của từng buổi (`lesson-game`) và từng mức trò tự do |
| Độ khó / màn của Flappy Note, Săn nốt, Cà chua, F1, 5 ngón | Không có tham số route (xem D3) |
| Đồng bộ giữa các máy | App không có backend / tài khoản |

## Kiểm thử tự động

- Unit: `src/core/shortcuts/registry.test.ts`, `ShortcutService.test.ts`, `src/store/shortcutRoutes.test.ts`, `src/store/shortcutStore.test.ts`
  (mọi đích của bộ chọn đều mở được và ghim lại cho đúng đích; CRUD, trùng, hoàn tác, sắp xếp, làm sạch dữ liệu hỏng / sửa tay / URL,
  tách hồ sơ, bộ nhớ bị chặn).
- e2e (Chromium, không phải iPad thật): `e2e/shortcuts.spec.ts`.

## Checklist thử thủ công (iPad thật / PWA)

- [ ] Trang chủ iPad ngang: thanh lối tắt nằm bên phải hàng hồ sơ, cao bằng nút hồ sơ; 1, 2, 3, 6 lối tắt; tên dài rút gọn có "…".
- [ ] iPad dọc + điện thoại: thanh không tràn ngang, ít chỗ thì dồn vào "Lối tắt ⋯"; menu ⋯ không tràn mép màn hình.
- [ ] Chạm (không chuột): mở lối tắt, mở / đóng menu ⋯ (chạm ra ngoài để đóng), kéo tay nắm ⠿ trong Cài đặt → Lối tắt đổi thứ tự,
      danh sách không cuộn theo lúc kéo; nút ↑ ↓ thay kéo thả.
- [ ] Tạo lối tắt ở Cài đặt: tìm "ca chua" (không dấu) ra Thu hoạch cà chua; duyệt Giáo trình → Cấp 1 → Buổi 2 → chọn "Trò chơi sau buổi".
- [ ] Ghim tại chỗ: đầu trang buổi học / màn Luyện tập (đang luyện đoạn ô) / Thư viện bài hát / Giáo trình (cấp đang xem); trong
      ⚙ Cài đặt của Flappy Note, Bóng bay (mở từ bài "Tìm nốt Đô" của Làm quen từng nốt → lối tắt mở lại đúng chế độ Tìm nốt Đô),
      Săn nốt, Cà chua, F1, 5 ngón. Nút đổi sang "Đã ghim"; Bỏ ghim → Hoàn tác.
- [ ] Hai hồ sơ: mỗi hồ sơ một bộ lối tắt; đổi hồ sơ ở trang chủ → thanh đổi ngay.
- [ ] Tải lại trang, đóng hẳn PWA (vuốt bỏ) rồi mở lại từ màn hình chính → lối tắt còn, hồ sơ đang chọn còn.
- [ ] Lối tắt tới buổi chưa đủ buổi trước → mở trang buổi kèm "Nên học trước…"; hết giờ chơi → lối tắt trò chơi ra màn "Đã hết giờ chơi".
- [ ] Chế độ Trẻ em: menu ⋯ không có "Quản lý"; Người lớn có "Quản lý" → Cài đặt cuộn tới mục Lối tắt.
- [ ] Chế độ tối: chip, menu, hộp thoại đọc rõ.
- [ ] VoiceOver: chip đọc "tên: mở …", nút ghim đọc "Đã ghim …" / "Ghim lối tắt…", công tắc "Hiện … trên thanh lối tắt".
- [ ] Đàn MIDI: phím trắng / đen không vô tình bấm chip lối tắt ở trang chủ (chip không gắn `midiNav`).
