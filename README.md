# 🎹 VietPiano

Ứng dụng web (PWA) học piano trên iPad. VietPiano nghe tiếng đàn qua micro của iPad, nhận diện nốt bạn đánh và **chỉ chuyển sang nốt tiếp theo khi bạn đánh đúng** (Wait Mode).

- Khuông nhạc chuẩn 5 dòng, khoá Sol và khoá Fa, tô sáng nốt cần đánh, tự cuộn theo tiến độ.
- Nhận diện cao độ ngay trên thiết bị (thuật toán YIN). Âm thanh **không** được gửi lên Internet.
- Hoạt động offline sau lần mở đầu tiên, cài được lên màn hình chính iPad.
- Có demo mode: luyện bằng bàn phím ảo hoặc bàn phím máy tính, không cần đàn.

> Thiết kế cho Yamaha Clavinova CLP-123 nhưng dùng được với đa số đàn piano/đàn điện có loa.

---

## 1. Cài đặt và chạy trên máy Windows

Yêu cầu: Node.js 20+ (đã kiểm tra với Node 24), npm, Git.

```powershell
npm install
npm run dev
```

Mở http://localhost:5173. Trên máy tính, micro hoạt động ở `localhost`.

### Demo mode (không cần đàn)

Mở một bài học rồi dùng:

| Phím | Tác dụng |
| --- | --- |
| `A S D F G H J K L ;` | Phím trắng (Đô, Rê, Mi, …). Gợi ý ký tự hiện trên bàn phím ảo |
| `W E T Y U O P` | Phím đen |
| `Z` / `X` | Dịch xuống / lên một quãng tám |
| `←` / `→` | Quay lại nốt trước / bỏ qua nốt |

Hoặc chạm/click trực tiếp lên bàn phím piano ảo.

## 2. Kiểm thử

```powershell
npm test            # unit test (Vitest)
npm run typecheck   # kiểm tra TypeScript
npm run build       # build production + service worker
npm run test:e2e    # kiểm thử trình duyệt (Playwright, Chromium)
```

Lần đầu chạy e2e cần cài trình duyệt: `npx playwright install chromium`.

Unit test bao gồm: chuyển đổi tần số ↔ nốt, YIN với tín hiệu tổng hợp giống piano, bộ nhận diện nốt (âm ngân,
hoạ âm, đánh lặp nốt, beating), logic Wait Mode, chống nhảy nhiều nốt do một âm kéo dài, lưu tiến độ IndexedDB,
và kiểm tra dữ liệu bài học. E2E dùng **file WAV làm micro giả** để chạy cả chuỗi AudioWorklet → YIN → Wait Mode.

> ⚠️ E2E chạy trên Chromium, **không phải Safari/iPadOS**. Cần kiểm thử thủ công trên iPad thật (mục 4).

## 3. Thử trên iPad trong mạng LAN

Safari chỉ cho dùng micro qua **HTTPS**. Cách nhanh nhất khi phát triển:

```powershell
npm run dev:https
```

1. Ghi lại địa chỉ `Network: https://192.168.x.x:5173` hiện trong terminal (máy Windows và iPad cùng Wi-Fi).
2. Trên iPad mở địa chỉ đó bằng Safari. Chứng chỉ tự ký sẽ bị cảnh báo → **Hiển thị chi tiết → truy cập trang web này**.
3. Nếu iPad không kết nối được: cho phép Node.js qua Windows Defender Firewall (mạng Private).

Cách ổn định hơn: deploy lên GitHub Pages (mục 5) rồi mở bằng HTTPS thật.

## 4. Hướng dẫn kiểm thử trên iPad thật

1. Mở ứng dụng bằng Safari (HTTPS). Vào **Cài đặt & micro** → **Bật micro** → cho phép quyền micro.
2. Đặt iPad trên giá nhạc. Chỉnh âm lượng Clavinova ở mức vừa (khoảng 1/3–1/2), tắt reverb/chorus nếu có.
3. **Hiệu chuẩn**: giữ yên lặng → bấm **Đo tiếng ồn nền**. Sau đó bấm **Đánh thử** và đánh Đô4, Rê4, Mi4:
   mỗi phím phải hiện đúng **một** nốt.
4. Mở bài **Gam Đô trưởng**, đánh chậm từng nốt. Kiểm tra:
   - Đánh đúng → chuyển nốt; đánh sai → báo **Sai**, giữ nguyên vị trí.
   - Giữ phím lâu (ngân) **không** làm nhảy nốt; nốt lặp lại (C5 C5) cần đánh lại phím.
   - Thử bài **Jingle Bells** (nhiều nốt lặp) và **Gam Đô trưởng tay trái** (nốt trầm).
5. Kiểm tra vòng đời: khoá màn hình hoặc chuyển app → quay lại thấy nút **Bật lại micro**; chấm cam micro tắt khi ứng dụng ở nền.
6. Cài lên màn hình chính: nút **Chia sẻ → Thêm vào MH chính**. Bật chế độ máy bay → mở lại app, vẫn chạy offline.

**Nếu nhận diện chưa tốt**, chỉnh trong Cài đặt:

| Hiện tượng | Điều chỉnh |
| --- | --- |
| Không nhận khi đánh nhẹ | Tăng **Độ nhạy micro** |
| Nhận nhầm khi không đánh (tiếng ồn) | Đo lại tiếng ồn nền hoặc giảm độ nhạy |
| Âm ngân làm nhảy sang nốt sau | Tăng **Ngưỡng nhận đánh lại cùng nốt** hoặc **Thời gian giữ ổn định** |
| Đánh lặp cùng nốt không được nhận | Giảm **Ngưỡng nhận đánh lại cùng nốt**; nhả hẳn phím trước khi đánh lại |
| Nốt trầm bị nhận cao lên một quãng 8 | Giảm **Độ tin cậy tối thiểu** hoặc bật **Chấp nhận sai quãng tám** |
| Đàn đã chỉnh Tuning khác 440 Hz | Chỉnh **Cao độ chuẩn A4** cho khớp |

## 5. Deploy lên GitHub Pages (miễn phí, HTTPS)

1. Tạo repository trên GitHub (vd `VietPiano`).
   **Trước mỗi lần deploy, chạy lệnh phát hành** (xem mục *Phiên bản* bên dưới) rồi push code lên nhánh `main`.
2. Trên GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` sẽ chạy test, build với `BASE_PATH=/<tên-repo>/` và deploy.
4. Ứng dụng có tại `https://<tài-khoản>.github.io/<tên-repo>/`.

Build thử với base path trên máy Windows (PowerShell):

```powershell
$env:BASE_PATH = '/VietPiano/'; npm run build; Remove-Item Env:BASE_PATH
npm run preview
```

(Trong Git Bash cần `MSYS_NO_PATHCONV=1 BASE_PATH=/VietPiano/ npm run build`, vì Git Bash tự đổi đường dẫn bắt đầu bằng `/`.)

### Phiên bản

Phiên bản nằm ở **một nơi duy nhất**: file `VERSION` ở gốc repo, dạng `<major>.<minor>.<yymmdd>.<hhmmss>`
(vd `1.07.261020.143507`). Ứng dụng đọc file này lúc build và hiển thị ở cuối màn hình **Cài đặt**;
chưa có file thì hiện `dev`.

```powershell
npm run release -- --dry-run   # chỉ in phiên bản kế tiếp
npm run release                # ghi VERSION, commit riêng file đó, gắn tag v<phiên bản>
git push && git push origin v<phiên bản>
npm run release -- --no-git    # chỉ ghi file, không commit/tag
```

- Bắt đầu từ `1.01`; mỗi lần phát hành minor +1 (luôn 2 chữ số, `01`–`99`); sau `.99` thì major +1, minor về `01`
  (`1.99` → `2.01`).
- `yymmdd.hhmmss` là thời điểm chạy lệnh phát hành theo **giờ Việt Nam** (UTC+7, 24 giờ), bất kể múi giờ máy.
- Chỉ tăng khi chạy `npm run release` — không tăng khi dev/build/test/deploy lại. Không bao giờ giảm hay dùng lại số cũ.
- Trường `version` trong `package.json` giữ nguyên, không liên quan.

## 6. Kiến trúc

```
AudioWorklet ─▶ AudioInput ─▶ PitchDetector (YIN) ─▶ NoteRecognizer ─▶ NoteInputProvider ─▶ PracticeEngine ─▶ UI
                                                                         ▲
                                                 VirtualInputProvider ───┘   (sau này: MIDIInputProvider)
```

| Module | File |
| --- | --- |
| AudioInput | `src/core/audio/AudioInput.ts`, `capture-processor.js` |
| PitchDetector | `src/core/audio/PitchDetector.ts` |
| NoteRecognizer | `src/core/audio/NoteRecognizer.ts` |
| ScoreRenderer | `src/core/score/ScoreRenderer.ts`, `src/components/ScoreView.tsx` |
| PracticeEngine | `src/core/practice/PracticeEngine.ts` |
| LessonManager | `src/core/lessons/` |
| ProgressStorage | `src/core/storage/ProgressStorage.ts` (IndexedDB + localStorage) |
| DeviceSettings | `src/core/settings/DeviceSettings.ts` (localStorage) |

**Chống nhảy nhiều nốt** gồm hai lớp: `NoteRecognizer` chỉ phát nốt mới khi có khoảng lặng hoặc *onset*
(âm lượng tăng đột ngột khi gõ phím) và bỏ qua hoạ âm; `PracticeEngine` chỉ tiến một nốt mỗi sự kiện và bỏ qua
sự kiện đến quá sát lần chuyển nốt trước.

Chi tiết cho người phát triển: xem [CLAUDE.md](CLAUDE.md).

## 7. Giới hạn hiện tại

- Chỉ nhận diện **một nốt tại một thời điểm**: chưa hỗ trợ hợp âm hoặc hai tay cùng lúc.
- Các ngưỡng nhận diện được tinh chỉnh trên tín hiệu tổng hợp; cần hiệu chỉnh thêm với CLP-123 thật.
- Nốt rất trầm (dưới Đô2) và rất cao (trên Đô6) nhận kém hơn qua micro; các bài mẫu nằm trong tầm Đô3–Đô5.
- Wait Mode không chấm nhịp/trường độ.
- **MIDI**: Safari iPadOS không hỗ trợ Web MIDI API. Để nối dây MIDI cần phát triển ứng dụng native (Swift/SwiftUI +
  Core MIDI) và cài đặt `MIDIInputProvider` theo interface `NoteInputProvider`.
- Dữ liệu chỉ lưu trên thiết bị; xoá dữ liệu Safari sẽ mất tiến độ.

## Bản quyền nội dung

Các bài hát mẫu là giai điệu dân gian hoặc tác phẩm thuộc phạm vi công cộng (Twinkle Twinkle Little Star,
Mary Had a Little Lamb, Frère Jacques / Kìa con bướm vàng, Ode to Joy – Beethoven, Jingle Bells – Pierpont),
được chép lại đơn giản hoá. Bài tập nốt, gam và tay trái/phải do dự án tự biên soạn.
