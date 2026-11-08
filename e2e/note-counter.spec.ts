import { expect, test, type Page } from '@playwright/test';

/**
 * Ẩn / hiện bộ đếm đúng/sai ở màn Luyện tập (`hideNoteCounter`): chỉ ẩn con số — app vẫn chấm, vẫn lưu phiên;
 * bật lại giữa bài hiện ngay số tích luỹ; Chơi lại / tạm dừng / bài khác / mở lại app giữ lựa chọn; hết bài hộp thoại
 * kết quả luôn hiện đủ (tổng nốt đã đánh, đúng, sai, độ chính xác, sao / điểm).
 */

async function openLesson(page: Page, id: string) {
  await page.goto('/?screen=library');
  await page.getByTestId(`lesson-${id}`).click();
  await expect(page.locator('[data-testid="score"] svg .score-note').first()).toBeVisible();
}

/** Gõ phím máy tính (bàn phím ảo), mỗi phím chờ quá khoảng chống nhảy nốt 120 ms. */
async function play(page: Page, keys: string) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(140);
  }
}

test('Chờ nốt: ẩn bộ đếm vẫn chấm, bật lại giữa bài hiện số tích luỹ; chơi lại / mở lại / bài tiếp theo vẫn ẩn; hết bài hiện đủ kết quả', async ({ page }) => {
  await openLesson(page, 'scale-c-major');
  const counter = page.getByTestId('note-counter');
  // Mặc định hiện như trước.
  await expect(page.getByTestId('wait-correct')).toHaveText('✓ 0');
  await expect(page.getByTestId('wait-wrong')).toHaveText('✗ 0');

  // Bấm vào bộ đếm → ẩn số; nút vẫn ở đó để bấm hiện lại.
  await counter.click();
  await expect(counter).toHaveAttribute('data-hidden', 'true');
  await expect(counter).toBeVisible();
  await expect(page.getByTestId('wait-correct')).toHaveCount(0);
  await expect(page.getByTestId('wait-wrong')).toHaveCount(0);

  // Đang ẩn: vẫn chấm như thường — C4 đúng, F4 sai (báo Sai, đứng chờ), D4 đúng.
  await play(page, 'a');
  await page.keyboard.press('f');
  await expect(page.getByTestId('status-title')).toHaveText('Sai');
  await page.waitForTimeout(140);
  await play(page, 's');
  await expect(page.getByTestId('progress-text')).toHaveText('2/16');
  await expect(page.locator('.score-note').nth(1)).toHaveClass(/is-corrected|is-correct/);
  await expect(page.getByTestId('wait-correct')).toHaveCount(0);

  // Bật lại giữa bài → hiện ngay số liệu tích luỹ thật.
  await counter.click();
  await expect(counter).not.toHaveAttribute('data-hidden');
  await expect(page.getByTestId('wait-correct')).toHaveText('✓ 2');
  await expect(page.getByTestId('wait-wrong')).toHaveText('✗ 1');

  // Ẩn lại → Chơi lại từ đầu vẫn ẩn.
  await counter.click();
  await page.getByRole('button', { name: 'Chơi lại từ đầu' }).click();
  await expect(page.getByTestId('progress-text')).toHaveText('0/16');
  await expect(counter).toHaveAttribute('data-hidden', 'true');

  // Mở lại app (tải trang mới) → lựa chọn vẫn được nhớ.
  await openLesson(page, 'scale-c-major');
  await expect(counter).toHaveAttribute('data-hidden', 'true');

  // Đánh hết bài khi bộ đếm đang ẩn, sai 1 lần (cần D4, đánh G4) → kết quả vẫn hiện đủ.
  await play(page, 'a');
  await page.keyboard.press('g');
  await expect(page.getByTestId('status-title')).toHaveText('Sai');
  await page.waitForTimeout(140);
  await play(page, 'sdfghjkkjhgfdsa');
  const dialog = page.getByRole('dialog', { name: 'Kết quả' });
  await expect(dialog).toBeVisible();
  const stat = (id: string) => dialog.getByTestId(id).locator('dd');
  await expect(stat('result-played')).toHaveText('17');
  await expect(stat('result-correct')).toHaveText('16');
  await expect(stat('result-wrong')).toHaveText('1');
  await expect(stat('result-skipped')).toHaveText('0');
  await expect(stat('result-accuracy')).toHaveText('94%');
  await expect(dialog.getByLabel('2 sao')).toBeVisible();

  // Luyện lại: bài mới bắt đầu, bộ đếm vẫn ẩn.
  await dialog.getByRole('button', { name: 'Luyện lại' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('progress-text')).toHaveText('0/16');
  await expect(counter).toHaveAttribute('data-hidden', 'true');

  // Tiến độ lưu như thường (độ chính xác của lượt hoàn thành hiện trên thẻ bài).
  await page.getByRole('button', { name: 'Về thư viện' }).click();
  await expect(page.getByTestId('lesson-scale-c-major')).toContainText('94%');

  // Hoàn thành bài → Bài tiếp theo: bài mới vẫn ẩn bộ đếm.
  await page.getByTestId('lesson-scale-c-major').click();
  await expect(counter).toHaveAttribute('data-hidden', 'true');
  await play(page, 'asdfghjkkjhgfdsa');
  await expect(dialog).toBeVisible();
  await expect(stat('result-played')).toHaveText('16');
  await expect(stat('result-accuracy')).toHaveText('100%');
  await dialog.getByRole('button', { name: 'Bài tiếp theo' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Gam Đô trưởng (tay phải)');
  await expect(counter).toHaveAttribute('data-hidden', 'true');
  await expect(page.getByTestId('wait-correct')).toHaveCount(0);

  // Cài đặt → Hiển thị cùng một lựa chọn: tắt ở đó → màn Luyện tập hiện lại bộ đếm.
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const toggle = page.getByRole('switch', { name: /Ẩn bộ đếm đúng\/sai/ });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await openLesson(page, 'scale-c-major');
  await expect(page.getByTestId('wait-correct')).toHaveText('✓ 0');
});

test('Theo nhịp / Biểu diễn: bộ đếm ẩn cả khi tạm dừng, bật lại hiện số thật; hết lượt Biểu diễn hiện đủ số nốt + điểm', async ({ page }) => {
  test.setTimeout(60_000);
  await openLesson(page, 'scale-c-major');
  const counter = page.getByTestId('note-counter');
  await counter.click();
  await expect(counter).toHaveAttribute('data-hidden', 'true');

  // Theo nhịp: đánh một nốt để chạy rồi tạm dừng — bộ đếm vẫn ẩn; bật lại thấy đúng số đã đánh.
  await page.getByTestId('mode-tempo').click();
  await expect(counter).toHaveAttribute('data-hidden', 'true');
  await expect(page.getByTestId('tempo-hits')).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(page.getByTestId('tempo-status')).toHaveText('Đang chạy');
  await page.getByTestId('tempo-run').click();
  await expect(page.getByTestId('tempo-status')).toHaveText('Tạm dừng');
  await expect(page.getByTestId('tempo-hits')).toHaveCount(0);
  await counter.click();
  await expect(page.getByTestId('tempo-hits')).toHaveText('♪ 1');
  await counter.click();
  await expect(page.getByTestId('tempo-hits')).toHaveCount(0);

  // Biểu diễn (160% → ♩=115): đúng C4 D4 E4 theo phách, phách 4 đánh G4 (cần F4 → sai), 12 nốt còn lại để lỡ.
  await page.getByTestId('mode-perform').click();
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Nhanh hơn' }).click();
  await expect(page.getByTestId('perform-bpm')).toHaveText('♩=115');
  await expect(counter).toHaveAttribute('data-hidden', 'true');
  const totalMs = await page.evaluate(() => {
    const beatMs = 60000 / 115;
    (document.querySelector('[data-testid="perform-run"]') as HTMLButtonElement).click();
    // Đếm vào 4 phách (4/4, không lấy đà).
    const t0 = performance.now() + 4 * beatMs;
    ['a', 's', 'd', 'g'].forEach((key, i) => setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key })), t0 + i * beatMs - performance.now()));
    return (4 + 16 + 1) * beatMs;
  });
  await expect(page.getByTestId('perform-status')).toHaveText('Đang biểu diễn', { timeout: 10_000 });
  await expect(page.getByTestId('perform-correct')).toHaveCount(0);
  await expect(page.getByTestId('perform-wrong')).toHaveCount(0);

  const dialog = page.getByRole('dialog', { name: 'Kết quả biểu diễn' });
  await expect(dialog).toBeVisible({ timeout: totalMs + 10_000 });
  const count = (id: string) => dialog.getByTestId(id).locator('dd');
  await expect(count('perform-played')).toHaveText('4/16');
  await expect(count('perform-result-correct')).toHaveText('3');
  await expect(count('perform-result-wrong')).toHaveText('1');
  await expect(count('perform-result-missed')).toHaveText('12');
  await expect(dialog.getByTestId('perform-score')).toBeVisible();
  await expect(dialog.getByTestId('criterion-pitch')).toContainText('19%'); // 3/16 đúng nốt

  // Biểu diễn lại: bộ đếm vẫn ẩn; bật lại thấy số của lượt mới (chưa đánh gì).
  await dialog.getByTestId('perform-retry').click();
  await expect(dialog).toBeHidden();
  await expect(counter).toHaveAttribute('data-hidden', 'true');
  await counter.click();
  await expect(page.getByTestId('perform-correct')).toHaveText('✓ 0');
  await expect(page.getByTestId('perform-wrong')).toHaveText('✗ 0');
});
