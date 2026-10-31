import { expect, test, type Page } from '@playwright/test';

/** Mở bảng ⚙ Cài đặt trên màn chơi. */
async function openSettings(page: Page) {
  await page.getByTestId('hunter-open-settings').click();
  await expect(page.getByTestId('hunter-settings-panel')).toBeVisible();
}

/** Đóng bảng ⚙ Cài đặt. */
async function closeSettings(page: Page) {
  await page.getByTestId('hunter-settings-done').click();
  await expect(page.getByTestId('hunter-settings-panel')).toBeHidden();
}

/** Mở Săn nốt (vào thẳng màn chơi), ⚙ Cài đặt: chọn bài + nốt mục tiêu, nguồn Piano ảo, nhịp nhanh để test chạy gọn. */
async function setup(page: Page, targets: number[], opts: { song?: string; mode?: string } = {}) {
  await page.goto('/?screen=note-hunter');
  await expect(page.getByTestId('hunter-ready')).toBeVisible();
  await openSettings(page);
  await page.getByTestId(`hunter-song-${opts.song ?? 'hunter-do-mi-sol'}`).click();
  await page.getByRole('button', { name: 'Bỏ chọn hết' }).click();
  for (const m of targets) await page.getByTestId(`hunter-note-${m}`).click();
  await page.getByRole('button', { name: 'Piano ảo', exact: true }).click();
  await page.getByRole('button', { name: opts.mode ?? 'Wait Mode', exact: true }).click();
  await page.getByLabel('Tốc độ (BPM)').fill('140');
  await expect(page.getByTestId('hunter-bpm')).toHaveText('140 BPM');
  await closeSettings(page);
}

const key = (page: Page, midi: number) => page.locator(`[data-testid="hunter-keyboard"] [data-midi="${midi}"]`);
const status = (page: Page) => page.getByTestId('hunter-screen');

test('mục Trò chơi mở được Săn nốt', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('open-note-hunter').click();
  // Một màn duy nhất: vào thẳng màn chơi, cài đặt là bảng mở trên màn chơi.
  await expect(page.getByTestId('hunter-screen')).toHaveAttribute('data-status', 'IDLE');
  await expect(page.getByTestId('hunter-ready')).toBeVisible();
  await expect(page.getByTestId('hunter-start')).toBeEnabled();
  await page.getByTestId('hunter-ready-settings').click();
  await expect(page.getByTestId('hunter-settings-panel')).toBeVisible();
  await expect(page.getByTestId('hunter-ready')).toBeHidden();
  await closeSettings(page);
  await expect(page.getByTestId('hunter-ready')).toBeVisible();
});

test('bài không có nốt mục tiêu đã chọn → báo rõ, không cho bắt đầu', async ({ page }) => {
  await setup(page, [61]); // Đô thăng 4 không có trong bài
  await expect(page.getByTestId('hunter-ready-no-targets')).toContainText('không có nốt nào');
  await expect(page.getByTestId('hunter-start')).toBeDisabled();
  await expect(page.getByTestId('hunter-play-toggle')).toBeDisabled();
  await openSettings(page);
  await expect(page.getByTestId('hunter-no-targets')).toContainText('không có nốt nào');
  await page.getByRole('button', { name: '+ Mọi nốt có trong bài' }).click();
  await expect(page.getByTestId('hunter-target-count')).toBeVisible();
  await closeSettings(page);
  await expect(page.getByTestId('hunter-ready-target-count')).toBeVisible();
  await expect(page.getByTestId('hunter-start')).toBeEnabled();
});

test('Wait Mode: dừng ở C4, sai D4 / C5 vẫn chờ, tạm dừng khi đang chờ, hết bài lưu kết quả', async ({ page }) => {
  test.setTimeout(90_000);
  await setup(page, [60]);
  await page.getByTestId('hunter-start').click();
  await expect(status(page)).toHaveAttribute('data-status', 'WAITING_FOR_NOTE', { timeout: 10_000 });
  await expect(page.getByTestId('hunter-current-status')).toContainText('Đang chờ');
  await expect(page.getByTestId('hunter-score').locator('.score-note.is-target')).not.toHaveCount(0);

  // Sai cao độ, rồi sai quãng 8: vẫn chờ, có phản hồi, không che khuông nhạc.
  await key(page, 62).click();
  await expect(page.getByTestId('hunter-feedback')).toContainText('Chưa đúng');
  await key(page, 72).click();
  await expect(page.getByTestId('hunter-feedback')).toContainText('sai quãng 8');
  await expect(status(page)).toHaveAttribute('data-status', 'WAITING_FOR_NOTE');
  await expect(page.getByTestId('hunter-score')).toBeVisible();

  // Tạm dừng khi đang chờ: nốt bị bỏ qua; chạy tiếp → vẫn chờ.
  await page.getByTestId('hunter-play-toggle').click();
  await expect(status(page)).toHaveAttribute('data-status', 'PAUSED');
  await key(page, 60).click();
  await expect(status(page)).toHaveAttribute('data-status', 'PAUSED');
  await page.getByTestId('hunter-play-toggle').click();
  await expect(status(page)).toHaveAttribute('data-status', 'WAITING_FOR_NOTE');

  // Đánh đúng mọi C4 tới hết bài.
  const summary = page.getByTestId('hunter-summary');
  for (let i = 0; i < 400 && !(await summary.isVisible()); i++) {
    if ((await status(page).getAttribute('data-status')) === 'WAITING_FOR_NOTE') {
      await key(page, 60).click();
      await page.waitForTimeout(200);
    } else await page.waitForTimeout(100);
  }
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('hunter-summary-hit')).toHaveText(/^(\d+)\/\1$/);
  await expect(page.getByTestId('hunter-summary-wrong')).toHaveText('2');
  await expect(page.getByTestId('hunter-practice-weak')).toBeVisible();

  await page.getByTestId('hunter-summary-settings').click();
  await expect(page.getByTestId('hunter-settings-panel')).toBeVisible();
  await expect(page.getByTestId('hunter-history').locator('li')).toHaveCount(1);
});

test('Restart khi đang chạy: về đầu bài, xoá tiến độ', async ({ page }) => {
  await setup(page, [64]);
  await page.getByTestId('hunter-start').click();
  await expect(status(page)).toHaveAttribute('data-status', 'WAITING_FOR_NOTE', { timeout: 10_000 });
  await key(page, 64).click();
  await expect(page.getByTestId('hunter-progress')).toContainText('Mục tiêu 1/');
  await page.getByTestId('hunter-restart').click();
  await expect(page.getByTestId('hunter-progress')).toContainText('Mục tiêu 0/');
  await expect(status(page)).toHaveAttribute('data-status', 'PLAYING');
});

test('mở ⚙ Cài đặt giữa ván → tạm dừng; đổi tốc độ giữ tiến độ, đổi nốt mục tiêu → ván mới', async ({ page }) => {
  await setup(page, [64]);
  await page.getByTestId('hunter-start').click();
  await expect(status(page)).toHaveAttribute('data-status', 'WAITING_FOR_NOTE', { timeout: 10_000 });
  await key(page, 64).click();
  await expect(page.getByTestId('hunter-progress')).toContainText('Mục tiêu 1/');

  await openSettings(page);
  await expect(status(page)).toHaveAttribute('data-status', 'PAUSED');
  await page.getByLabel('Tốc độ (BPM)').fill('120');
  await closeSettings(page);
  await expect(status(page)).toHaveAttribute('data-status', 'PAUSED');
  await expect(page.getByTestId('hunter-progress')).toContainText('Mục tiêu 1/');

  await openSettings(page);
  await page.getByTestId('hunter-note-60').click();
  await closeSettings(page);
  await expect(status(page)).toHaveAttribute('data-status', 'IDLE');
  await expect(page.getByTestId('hunter-ready')).toBeVisible();
  await expect(page.getByTestId('hunter-progress')).toContainText('Mục tiêu 0/');
});
