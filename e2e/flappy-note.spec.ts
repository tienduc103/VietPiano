import { expect, test, type Page } from '@playwright/test';

const key = (page: Page, midi: number) => page.locator(`[data-testid="flappy-keyboard"] [data-midi="${midi}"]`);
const screen = (page: Page) => page.getByTestId('flappy-screen');

test('mục Trò chơi → Flappy Note: chuỗi nốt Ode to Joy, sai không cất cánh, đúng thì bay + sang nốt kế, tạm dừng', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('open-flappy-note').click();
  // Vào thẳng màn chơi; cài đặt mở bằng nút ⚙ trên màn chơi.
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await page.getByTestId('flappy-settings').click();
  await expect(page.getByTestId('flappy-settings-panel')).toBeVisible();
  await page.getByTestId('flappy-level-rh-c-position').click();
  await page.getByRole('button', { name: '🎼 Chuỗi nốt' }).click();
  await page.getByTestId('flappy-melody-ode-to-joy').click();
  await page.getByRole('button', { name: 'Dễ', exact: true }).click();
  await expect(page.getByTestId('flappy-ready')).toBeHidden();
  await page.getByTestId('flappy-settings-done').click();
  await expect(page.getByTestId('flappy-settings-panel')).toBeHidden();

  // Khu A: một khuông có nốt đầu của giai điệu (E4, ngón 3 tay phải) + 3 nốt tiếp theo; không có hình bàn tay.
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await expect(screen(page)).toHaveAttribute('data-target', '64');
  await expect(page.getByTestId('flappy-target-name')).toContainText('E4');
  await expect(page.getByTestId('flappy-target-finger')).toContainText('Ngón 3 – ngón giữa · Tay Phải');
  await expect(page.getByTestId('hand-figure')).toHaveCount(0);
  const staff = page.getByTestId('flappy-target-staff');
  await expect(staff).toHaveAttribute('data-notes', '4');
  await expect(staff.locator('svg')).toBeVisible();
  await expect(staff.locator('.score-note')).toHaveCount(4);
  await expect(staff.locator('.score-note.is-current')).toHaveCount(1);
  await expect(page.getByTestId('flappy-ready')).toBeVisible();
  await expect(page.getByTestId('flappy-powerup-hint')).toContainText('⚡');
  await expect(page.getByTestId('flappy-screen')).toHaveAttribute('data-powerups', '0');

  // Sai: vẫn chờ ở mặt đất.
  await key(page, 62).click();
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');

  // Đúng: cất cánh, nốt kế (E4 lần hai) rồi F4.
  await key(page, 64).click();
  await expect(screen(page)).toHaveAttribute('data-status', 'playing');
  await expect(page.getByTestId('flappy-ready')).toBeHidden();
  await page.waitForTimeout(200);
  await key(page, 64).click();
  await expect(screen(page)).toHaveAttribute('data-target', '65');
  await expect(page.getByTestId('flappy-target-finger')).toContainText('Ngón 4');
  await expect(staff).toHaveAttribute('data-midi', '65');

  await page.getByTestId('flappy-pause').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'paused');
  await key(page, 65).click();
  await expect(screen(page)).toHaveAttribute('data-target', '65');
  await page.getByTestId('flappy-pause').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'playing');
});

test('không đánh tiếp → chim rơi, mất hết mạng, kết quả lưu kỷ lục ở màn chọn', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?screen=flappy-note');
  await page.getByTestId('flappy-ready-settings').click();
  await page.getByTestId('flappy-level-rh-do-re-mi').click();
  await page.getByRole('button', { name: '🎲 Nốt ngẫu nhiên' }).click();
  await page.getByRole('button', { name: 'Khó', exact: true }).click();
  // Đang mở cài đặt: đánh nốt không làm chim cất cánh.
  await page.keyboard.press('a');
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await page.getByTestId('flappy-settings-done').click();
  const target = await screen(page).getAttribute('data-target');
  await key(page, Number(target)).click();
  await expect(screen(page)).toHaveAttribute('data-status', 'playing');

  await expect(screen(page)).toHaveAttribute('data-status', 'over', { timeout: 30_000 });
  await expect(screen(page)).toHaveAttribute('data-lives', '0');
  const result = page.getByTestId('flappy-result');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-won', 'false');
  await expect(result).toHaveAttribute('data-stars', '0');

  await page.getByTestId('flappy-change').click();
  await expect(page.getByTestId('flappy-level-rh-do-re-mi')).toContainText('kỷ lục');
  await expect(page.getByTestId('flappy-total-stars')).toContainText('★ 0/');
  // Đóng cài đặt sau khi thua → vào ván mới.
  await page.getByTestId('flappy-settings-done').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await expect(screen(page)).toHaveAttribute('data-lives', /[1-9]/);
});

test('Siêu dễ: dải nốt sắp đánh có trường độ; nốt trắng của Mary hiện "nốt trắng"', async ({ page }) => {
  await page.goto('/?screen=flappy-note');
  await page.getByTestId('flappy-settings').click();
  await page.getByTestId('flappy-level-rh-c-position').click();
  await page.getByRole('button', { name: '🎼 Chuỗi nốt' }).click();
  await page.getByTestId('flappy-melody-mary').click();
  await page.getByRole('button', { name: 'Siêu dễ', exact: true }).click();
  await page.getByTestId('flappy-settings-done').click();

  const strip = page.getByTestId('flappy-strip');
  await expect(strip.locator('li')).toHaveCount(6);
  await expect(strip.locator('svg')).toHaveCount(6);
  await expect(page.getByTestId('flappy-strip-current')).toHaveAttribute('data-duration', 'q');
  await expect(page.getByTestId('flappy-target-duration')).toHaveText('nốt đen');
  // Khu hướng dẫn không lặp lại các nốt tiếp theo khi đã có dải nốt.
  await expect(page.getByTestId('flappy-target-staff')).toHaveAttribute('data-notes', '1');

  // Mary: E D C D | E E E/h — nốt thứ 7 là nốt trắng.
  for (const midi of [64, 62, 60, 62, 64, 64]) {
    await key(page, midi).click();
    await page.waitForTimeout(120);
  }
  await expect(screen(page)).toHaveAttribute('data-target', '64');
  await expect(page.getByTestId('flappy-strip-current')).toHaveAttribute('data-duration', 'h');
  await expect(page.getByTestId('flappy-target-duration')).toHaveText('nốt trắng');
});
