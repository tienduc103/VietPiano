import { expect, test, type Page } from '@playwright/test';

const key = (page: Page, midi: number) => page.locator(`[data-testid="flappy-keyboard"] [data-midi="${midi}"]`);
const screen = (page: Page) => page.getByTestId('flappy-screen');

test('mục Trò chơi → Flappy Note: chuỗi nốt Ode to Joy, sai không cất cánh, đúng thì bay + sang nốt kế, tạm dừng', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('open-flappy-note').click();
  await expect(page.getByTestId('flappy-setup')).toBeVisible();
  await page.getByTestId('flappy-level-rh-c-position').click();
  await page.getByRole('button', { name: '🎼 Chuỗi nốt' }).click();
  await page.getByTestId('flappy-melody-ode-to-joy').click();
  await page.getByRole('button', { name: 'Dễ', exact: true }).click();
  await page.getByTestId('flappy-start').click();

  // Khu A: nốt đầu của giai điệu (E4, ngón 3 tay phải) + 3 nốt tiếp theo.
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await expect(screen(page)).toHaveAttribute('data-target', '64');
  await expect(page.getByTestId('flappy-target-name')).toContainText('E4');
  await expect(page.getByTestId('flappy-target-finger')).toContainText('Ngón 3 – ngón giữa · Tay Phải');
  await expect(page.getByTestId('hand-figure').locator('[data-finger="3"]')).toHaveAttribute('data-highlighted', 'true');
  await expect(page.getByTestId('flappy-upcoming').locator('li')).toHaveCount(3);
  await expect(page.getByTestId('flappy-target-staff').locator('svg')).toBeVisible();
  await expect(page.getByTestId('flappy-ready')).toBeVisible();

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
  await page.getByTestId('flappy-level-rh-do-re-mi').click();
  await page.getByRole('button', { name: '🎲 Nốt ngẫu nhiên' }).click();
  await page.getByRole('button', { name: 'Khó', exact: true }).click();
  await page.getByTestId('flappy-start').click();
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
});
