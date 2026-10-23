import { expect, test, type Page } from '@playwright/test';

async function openLesson(page: Page, id: string) {
  await page.goto('/');
  await page.getByTestId(`lesson-${id}`).click();
  await expect(page.locator('[data-testid="score"] svg .score-note').first()).toBeVisible();
}

test('thư viện hiển thị đủ nhóm bài học', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'VietPiano' })).toBeVisible();
  for (const name of ['Nhận biết nốt', 'Gam', 'Bài tập tay phải', 'Bài tập tay trái', 'Bài tập hai tay', 'Bé tự học theo số ngón tay', 'Bài hát']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('[data-testid^="lesson-song-"]')).toHaveCount(23);
});

test('dòng phiên bản hiện ở cuối mọi màn hình', async ({ page }) => {
  // Đọc từ file VERSION lúc build; chưa phát hành thì là "dev".
  const version = /VietPiano · phiên bản (dev|[1-9]\d*\.\d{2}\.\d{6}\.\d{6})$/;
  await page.goto('/');
  await expect(page.getByTestId('app-version')).toHaveText(version);
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByTestId('app-version')).toHaveText(version);
  await openLesson(page, 'scale-c-major');
  await expect(page.getByTestId('app-version')).toBeInViewport();
  await expect(page.getByTestId('app-version')).toHaveText(version);
});

test('khuông nhạc vẽ đúng số nốt, khoá Fa cho bài tay trái', async ({ page }) => {
  await openLesson(page, 'lh-five-finger');
  await expect(page.locator('.score-note')).toHaveCount(22);
  await expect(page.locator('.score-note.is-current')).toHaveCount(1);
  await expect(page.getByTestId('expected-note')).toHaveText('C3');
});

test('bài cho bé: số ngón tay trên khuông, ô trạng thái và bàn phím ảo', async ({ page }) => {
  await openLesson(page, 'kid-rh-five');
  await expect(page.locator('.score-finger')).toHaveCount(19);
  await expect(page.locator('.score-finger.is-current')).toHaveText('1');
  await expect(page.getByTestId('expected-finger')).toHaveText('ngón 1');
  await expect(page.getByTestId('key-finger')).toHaveText('1');

  await page.keyboard.press('a'); // C4
  await expect(page.getByTestId('expected-finger')).toHaveText('ngón 2');
  await expect(page.locator('button[data-midi="62"] [data-testid="key-finger"]')).toHaveText('2');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
});

test('bài hai tay: khuông đôi, nhắc tay và ngón theo từng nốt', async ({ page }) => {
  await openLesson(page, 'bh-echo');
  await expect(page.locator('.score-note')).toHaveCount(24);
  await expect(page.getByTestId('expected-hand')).toHaveText('Tay phải');
  await expect(page.getByTestId('expected-finger')).toHaveText('ngón 1');

  for (const midi of [60, 62, 64]) {
    await page.locator(`button[data-midi="${midi}"]`).dispatchEvent('pointerdown'); // C4 D4 E4 (tay phải)
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('expected-note')).toHaveText('C3');
  await expect(page.getByTestId('expected-hand')).toHaveText('Tay trái');
  await expect(page.getByTestId('expected-finger')).toHaveText('ngón 5');
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
});

test('demo mode: bàn phím máy tính, đúng thì chuyển nốt, sai thì giữ nguyên', async ({ page }) => {
  await openLesson(page, 'scale-c-major');
  await expect(page.getByTestId('expected-note')).toHaveText('C4');

  // A = C4 → đúng
  await page.keyboard.press('a');
  await expect(page.getByTestId('expected-note')).toHaveText('D4');
  await expect(page.getByTestId('progress-text')).toHaveText('1/16');

  // F = F4 → sai, vẫn chờ D4 (chờ qua khoảng chống nhảy nốt 120 ms)
  await page.waitForTimeout(150);
  await page.keyboard.press('f');
  await expect(page.getByTestId('status-title')).toHaveText('Sai');
  await expect(page.getByTestId('expected-note')).toHaveText('D4');

  // Bàn phím ảo trên màn hình (chạm)
  await page.locator('button[data-midi="62"]').dispatchEvent('pointerdown');
  await expect(page.getByTestId('expected-note')).toHaveText('E4');

  // Quay lại & bỏ qua
  await page.getByRole('button', { name: 'Nốt trước' }).click();
  await expect(page.getByTestId('expected-note')).toHaveText('D4');
  await page.getByRole('button', { name: 'Bỏ qua nốt' }).click();
  await expect(page.getByTestId('expected-note')).toHaveText('E4');

  // Chơi lại từ đầu
  await page.getByRole('button', { name: 'Chơi lại từ đầu' }).click();
  await expect(page.getByTestId('expected-note')).toHaveText('C4');
  await expect(page.getByTestId('progress-text')).toHaveText('0/16');
});

test('hoàn thành bài, lưu tiến độ vào IndexedDB và hiện trên thư viện', async ({ page }) => {
  await openLesson(page, 'scale-c-major');
  // C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4 (k = C5)
  for (const key of 'asdfghjkkjhgfdsa') {
    await page.keyboard.press(key);
    await page.waitForTimeout(140); // > minAdvanceIntervalMs
  }
  await expect(page.getByRole('dialog', { name: 'Kết quả' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('100%');
  await page.getByRole('button', { name: 'Về thư viện' }).last().click();
  await expect(page.getByTestId('lesson-scale-c-major')).toContainText('100%');

  // Tải lại trang: tiến độ vẫn còn (IndexedDB)
  await page.reload();
  await expect(page.getByTestId('lesson-scale-c-major')).toContainText('100%');
  await expect(page.getByRole('heading', { name: 'Học gần đây' })).toBeVisible();
});

test('ẩn/hiện tên nốt', async ({ page }) => {
  await openLesson(page, 'notes-seven');
  await expect(page.locator('.score-label')).toHaveCount(14);
  await page.getByRole('button', { name: 'Ẩn tên nốt' }).click();
  await expect(page.locator('.score-label')).toHaveCount(0);
  await page.getByRole('button', { name: 'Hiện tên nốt' }).click();
  await expect(page.locator('.score-label')).toHaveCount(14);
});

test('tự cuộn khuông nhạc theo tiến độ', async ({ page }) => {
  await openLesson(page, 'song-twinkle');
  const strip = page.locator('[data-testid="score"] > div').last();
  const before = await strip.evaluate((el) => getComputedStyle(el).transform);
  // Twinkle: C4 C4 G4 G4 A4 A4 G4 F4 F4 E4 E4 D4 D4 C4 (a a g g h h g f f d d s s a)
  for (const key of 'aagghhgffddssa') {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
  }
  await expect(page.getByTestId('progress-text')).toHaveText('14/42');
  await expect.poll(() => strip.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
});

test('báo lỗi rõ ràng khi bị từ chối quyền micro', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await openLesson(page, 'notes-seven');
  await page.getByTestId('mic-button').click();
  await expect(page.getByRole('alert')).toContainText('Chưa được cấp quyền micro');
});

test('micro (âm thanh giả lập gam Đô trưởng) → nhận diện và tự chuyển nốt', async ({ page }) => {
  await openLesson(page, 'scale-c-major');
  await page.getByTestId('mic-button').click();
  await expect(page.getByTestId('mic-button')).toHaveText(/Micro đang bật/);
  // File WAV phát C4 D4 E4 F4 G4 A4 B4 C5 (lặp lại). Nửa đầu bài là gam đi lên.
  await expect(page.getByTestId('progress-text')).toHaveText(/^([4-9]|1\d)\/16$/, { timeout: 20_000 });
  // Không được nhảy quá nhiều nốt: số lần sai phải nhỏ so với số nốt đúng.
  const wrong = Number((await page.getByTitle('Số lần sai').textContent())?.replace(/\D/g, ''));
  expect(wrong).toBeLessThanOrEqual(3);

  // Tắt micro → giải phóng stream
  await page.getByTestId('mic-button').click();
  await expect(page.getByTestId('mic-button')).toHaveText(/Bật micro/);
});

test('nút micro nổi: luôn hiển thị, bấm để bật/tắt micro, hiện nốt đang nghe; tắt được trong Cài đặt', async ({ page }) => {
  await page.goto('/');
  const floating = page.getByTestId('floating-mic');
  await expect(floating).toBeVisible();
  await expect(floating).toHaveAttribute('aria-pressed', 'false');
  // Bật micro ngay ở thư viện; micro giả phát gam Đô trưởng → nút hiện tên nốt.
  await floating.click();
  await expect(floating).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('floating-mic-note')).toContainText(/[A-G]\d/, { timeout: 10_000 });

  // Luyện tập: nút nằm trong khung khuông nhạc, cùng trạng thái với nút micro chính.
  await page.getByTestId('lesson-scale-c-major').click();
  await expect(page.getByTestId('mic-button')).toHaveText(/Micro đang bật/);
  await expect(page.locator('main [data-testid="floating-mic"]')).toBeVisible();
  await page.getByTestId('floating-mic').click();
  await expect(page.getByTestId('mic-button')).toHaveText(/Bật micro/);
  await expect(page.getByTestId('floating-mic')).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Về thư viện' }).first().click();
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByTestId('floating-mic')).toBeVisible();
  await page.getByRole('switch', { name: /Hiện nút micro nổi/ }).click();
  await expect(page.getByTestId('floating-mic')).toHaveCount(0);
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(page.getByRole('heading', { name: 'VietPiano' })).toBeVisible();
  await expect(page.getByTestId('floating-mic')).toHaveCount(0);
});

test('ẩn trang (chạy nền) thì tự tắt micro và hiện nút bật lại', async ({ page }) => {
  await openLesson(page, 'notes-seven');
  await page.getByTestId('mic-button').click();
  await expect(page.getByTestId('mic-button')).toHaveText(/Micro đang bật/);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByTestId('mic-button')).toHaveText(/Bật lại micro/);
  await expect(page.getByRole('status').filter({ hasText: 'Micro đã tạm dừng' })).toBeVisible();
});

test('tự căn chỉnh: đo im lặng rồi hiện nốt cần đánh', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByTestId('auto-calibrate').click();
  await expect(page.getByTestId('auto-calibration')).toContainText('Giữ yên lặng');
  // Bước 2: nốt đo đầu tiên là C3 — micro giả chỉ phát gam C4…C5 nên không bao giờ khớp.
  await expect(page.getByTestId('calibration-target')).toHaveText('C3', { timeout: 10_000 });
  await expect(page.getByTestId('auto-calibration')).toContainText('Bước 2/8');
  await page.getByRole('button', { name: 'Huỷ' }).click();
  await expect(page.getByTestId('auto-calibrate')).toBeVisible();
});

test('xuất ảnh khuông nhạc từ thư viện', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('export-song-twinkle').click();
  const dialog = page.getByRole('dialog', { name: 'Xuất ảnh khuông nhạc' });
  await expect(dialog).toBeVisible();
  const preview = dialog.getByTestId('score-sheet-preview');
  await expect(preview).toBeVisible();
  // Ảnh nhiều dòng: rộng 2200px (scale 2), cao hơn một dòng khuông.
  const size = await preview.evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
  expect(size.w).toBe(2200);
  expect(size.h).toBeGreaterThan(600);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Tải ảnh PNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^vietpiano-.+\.png$/);

  await dialog.getByRole('button', { name: 'Đóng' }).click();
  await expect(dialog).toBeHidden();
});

test('chạy theo nhịp: khuông nhạc tự chạy, đánh nốt nào cũng được tính', async ({ page }) => {
  await openLesson(page, 'scale-c-major');
  await page.getByTestId('mode-tempo').click();
  await expect(page.getByTestId('tempo-status')).toHaveText('Sẵn sàng');
  // Tăng tốc lên 160% (♩=72 → 115) cho test nhanh.
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Nhanh hơn' }).click();
  await expect(page.getByTestId('tempo-bpm')).toHaveText('♩=115');

  // Bài cần C4 nhưng đánh F4 (sai cao độ) → vẫn bắt đầu chạy và tính là đã đánh.
  await page.keyboard.press('f');
  await expect(page.getByTestId('tempo-status')).toHaveText('Đang chạy');
  await expect(page.getByTestId('tempo-hits')).toHaveText('♪ 1');

  // Không đánh gì nữa: con trỏ vẫn tự chạy, các nốt bị lỡ.
  await expect(page.getByTestId('progress-text')).not.toHaveText('1/16', { timeout: 3000 });
  await expect(page.getByTestId('tempo-missed')).not.toHaveText('lỡ 0');

  // Tạm dừng rồi chơi lại từ đầu.
  await page.getByTestId('tempo-run').click();
  await expect(page.getByTestId('tempo-status')).toHaveText('Tạm dừng');
  await page.getByRole('button', { name: 'Chơi lại từ đầu' }).click();
  await expect(page.getByTestId('progress-text')).toHaveText('0/16');

  // Về chế độ Chờ nốt.
  await page.getByTestId('mode-wait').click();
  await expect(page.getByTestId('expected-note')).toHaveText('C4');
});

test('đếm nốt: mỗi nốt nghe thấy đi một nốt, nốt sai tô đỏ', async ({ page }) => {
  await openLesson(page, 'scale-c-major');
  await page.getByTestId('mode-count').click();
  await expect(page.getByTestId('mode-count')).toHaveAttribute('aria-checked', 'true');

  // Cần C4 nhưng đánh F4 → vẫn chuyển sang D4, nốt đầu tô đỏ.
  await page.keyboard.press('f');
  await expect(page.getByTestId('status-title')).toHaveText('Sai');
  await expect(page.getByTestId('expected-note')).toHaveText('D4');
  await expect(page.locator('.score-note').first()).toHaveClass(/is-wrong/);

  // D4 đúng → sang E4.
  await page.waitForTimeout(150);
  await page.keyboard.press('s');
  await expect(page.getByTestId('expected-note')).toHaveText('E4');
  await expect(page.getByTestId('progress-text')).toHaveText('2/16');
  await expect(page.locator('.score-note').nth(1)).toHaveClass(/is-correct/);

  // Lựa chọn được nhớ khi mở lại bài.
  await openLesson(page, 'scale-c-major');
  await expect(page.getByTestId('mode-count')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('mode-wait').click();
});

test('kiểm tra theo nhịp: khuông nhạc chờ nốt, ghi lại máy nghe đúng/sai', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByTestId('calibration-check-open').click();
  await expect(page.locator('[data-testid="calibration-check"] [data-testid="score"] svg .score-note')).toHaveCount(15);
  await page.getByTestId('calibration-check-start').click();
  await expect(page.getByTestId('beat-indicator')).toBeVisible();
  // Micro giả phát gam C4…C5: bài kiểm tra C4 E4 G4 C5 … → nhận C4, E4, G4, C5; D4, F4… là "sai".
  const heard = page.getByTestId('calibration-check-heard');
  await expect(heard).toContainText('đúng', { timeout: 20_000 });
  await expect(heard).toContainText('sai', { timeout: 20_000 });
  await expect(page.getByTestId('calibration-check-status')).toContainText('Đang chờ nốt', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Đóng' }).click();
  await expect(page.getByTestId('calibration-check')).toHaveCount(0);
});

test('hồ sơ người học: gợi ý theo tuổi, đánh giá và tiến độ riêng từng người', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('create-profile').click();
  await page.getByTestId('profile-name').fill('An');
  await page.getByTestId('profile-age').fill('30');
  await page.getByRole('button', { name: 'Chơi được bài hát' }).click();
  await page.getByTestId('profile-save').click();

  await expect(page.getByTestId('profile-An')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Gợi ý cho An' })).toBeVisible();
  await expect(page.locator('[data-testid^="rec-"]')).toHaveCount(6);
  await expect(page.locator('[data-testid^="rec-kid-"]')).toHaveCount(0);
  await expect(page.getByTestId('assess-skill')).toContainText('0 bài đạt');

  // Luyện một bài → đánh giá cập nhật cho An.
  await openLesson(page, 'scale-c-major');
  for (const key of 'asdfghjkkjhgfdsa') {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
  }
  await expect(page.getByRole('dialog', { name: 'Kết quả' })).toBeVisible();
  await page.getByRole('button', { name: 'Về thư viện' }).last().click();
  await expect(page.getByTestId('assess-skill')).toContainText('1 bài đạt');
  await expect(page.getByTestId('assess-time')).toContainText('1 phiên');
  // 15 nốt được đo (trừ nốt đầu), bấm cách nhau ~140 ms.
  await expect(page.getByTestId('reading-speed')).toHaveText(/Đọc nốt: 0,[1-9] giây\/nốt/);
  await page.getByRole('button', { name: /Xem các tiêu chí khác/ }).click();
  await expect(page.getByTestId('criteria')).toContainText('Đều đặn');
  await expect(page.getByTestId('criteria')).toContainText('Tốc độ đọc nốt');
  await expect(page.getByTestId('criteria')).toContainText('Nốt hay sai');

  // Hồ sơ thứ hai (5 tuổi): gợi ý bài cho bé, tiến độ tách riêng.
  await page.getByRole('button', { name: 'Thêm người học' }).click();
  await page.getByTestId('profile-name').fill('Na');
  await page.getByTestId('profile-age').fill('5');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-Na')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-testid^="rec-"]').first()).toHaveAttribute('data-testid', /^rec-kid-/);
  await expect(page.getByTestId('lesson-scale-c-major')).not.toContainText('100%');

  await page.getByTestId('profile-An').click();
  await expect(page.getByTestId('lesson-scale-c-major')).toContainText('100%');

  // Tải lại: hồ sơ (localStorage) và phiên gắn hồ sơ (IndexedDB) vẫn còn.
  await page.reload();
  await expect(page.getByTestId('profile-An')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('assess-skill')).toContainText('1 bài đạt');
});

test('đánh thử 15 giây: tự bật micro, mỗi nốt hiện một lần, bấm lại không bị nhân đôi', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const btn = page.getByTestId('listen-test');
  await btn.click();
  await expect(page.getByTestId('mic-button').first()).toHaveText(/Micro đang bật/);
  await expect(btn).toHaveText(/Dừng \(còn \d+ giây\)/);
  // Dừng rồi chạy lại: trước đây mỗi lần bấm gắn thêm một bộ nghe → mỗi nốt hiện hai lần.
  await btn.click();
  await expect(btn).toHaveText('Đánh thử (15 giây)');
  await btn.click();
  const notes = page.locator('[data-testid="heard-notes"] span.rounded-lg');
  await expect(notes).toHaveCount(5, { timeout: 15_000 });
  const labels = await notes.allTextContents();
  // Micro giả phát gam đi lên → không có hai nốt liền nhau giống nhau.
  for (let i = 1; i < labels.length; i++) expect(labels[i]).not.toBe(labels[i - 1]);
});

test('nút nổi tải lại cứng: có trên mọi màn hình, gỡ service worker, xoá cache, tải lại trang', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('floating-reload')).toBeVisible();
  await openLesson(page, 'scale-c-major');
  await expect(page.getByTestId('floating-reload')).toBeVisible();
  await page.getByRole('button', { name: 'Về thư viện' }).click();
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByTestId('floating-reload')).toBeVisible();
  await page.evaluate(async () => {
    (window as unknown as { __beforeReload: boolean }).__beforeReload = true;
    await caches.open('test-cache');
  });
  await page.getByRole('button', { name: 'Tải lại bản mới nhất' }).click();
  await page.waitForFunction(() => !(window as unknown as { __beforeReload?: boolean }).__beforeReload);
  await expect(page.getByTestId('app-version')).toBeVisible();
  expect(await page.evaluate(() => caches.has('test-cache'))).toBe(false);
});
