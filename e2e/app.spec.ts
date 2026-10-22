import { expect, test, type Page } from '@playwright/test';

async function openLesson(page: Page, id: string) {
  await page.goto('/');
  await page.getByTestId(`lesson-${id}`).click();
  await expect(page.locator('[data-testid="score"] svg .score-note').first()).toBeVisible();
}

test('thư viện hiển thị đủ nhóm bài học', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'VietPiano' })).toBeVisible();
  for (const name of ['Nhận biết nốt', 'Gam', 'Bài tập tay phải', 'Bài tập tay trái', 'Bài hát']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('[data-testid^="lesson-song-"]')).toHaveCount(8);
});

test('khuông nhạc vẽ đúng số nốt, khoá Fa cho bài tay trái', async ({ page }) => {
  await openLesson(page, 'lh-five-finger');
  await expect(page.locator('.score-note')).toHaveCount(22);
  await expect(page.locator('.score-note.is-current')).toHaveCount(1);
  await expect(page.getByTestId('expected-note')).toHaveText('C3');
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
