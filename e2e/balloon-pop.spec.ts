import { expect, test, type Page } from '@playwright/test';

const key = (page: Page, midi: number) => page.locator(`[data-testid="balloon-keyboard"] [data-midi="${midi}"]`);
const screen = (page: Page) => page.getByTestId('balloon-screen');

async function waitBalloon(page: Page): Promise<number> {
  await expect(screen(page)).not.toHaveAttribute('data-urgent', '');
  return Number(await screen(page).getAttribute('data-urgent'));
}

test('mục Trò chơi → Bóng bay 1 tay: sai không nổ, đúng nốt thì nổ; đổi kiểu tên, ẩn từng phím', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('open-balloon-pop').click();
  await expect(page.getByTestId('balloon-setup')).toBeVisible();
  await page.getByTestId('balloon-mode-one-hand').click();
  await page.getByRole('button', { name: 'Tay phải' }).click();
  await page.getByRole('button', { name: 'Dễ', exact: true }).click();
  await page.getByRole('button', { name: 'Vừa', exact: true }).click();
  await page.getByTestId('balloon-start').click();

  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await page.getByTestId('balloon-go').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'playing');
  const target = await waitBalloon(page);
  expect(target).toBeGreaterThanOrEqual(60);
  expect(target).toBeLessThanOrEqual(67);
  await expect(page.getByTestId('balloon-target-finger')).toContainText('Tay phải · ngón');

  // Phím cần đánh được tô; ngón hiện trên phím.
  await expect(key(page, target).getByTestId('key-finger')).toBeVisible();

  // Sai: bóng vẫn bay.
  const wrong = target === 60 ? 62 : 60;
  await key(page, wrong).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '0');

  // Kiểu tên Đô Rê Mi Pha… ⇄ CDEFGAB trên phím.
  await expect(key(page, 65)).toHaveText(/Pha/);
  await page.getByTestId('balloon-label-style').click();
  // (Phím còn có chữ thường gợi ý bàn phím máy tính.)
  await expect(key(page, 65)).toHaveText(/F$/);
  // Ẩn riêng phím F.
  await page.getByTestId('balloon-hide-F').click();
  await expect(key(page, 65)).not.toContainText('F');
  await expect(key(page, 64)).toHaveText(/E$/);
  await page.getByTestId('balloon-hide-F').click();
  await expect(key(page, 65)).toHaveText(/F$/);

  // Đúng tên nốt (cùng phím) → nổ.
  await key(page, target).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '1');
});

test('full phím: phải đúng quãng tám; tạm dừng', async ({ page }) => {
  await page.goto('/?screen=balloon-pop');
  await page.getByTestId('balloon-mode-full').click();
  await page.getByRole('button', { name: 'Dễ', exact: true }).click();
  await page.getByTestId('balloon-start').click();
  await page.getByTestId('balloon-go').click();
  const target = await waitBalloon(page);
  const otherOctave = target + 12 <= 84 ? target + 12 : target - 12;
  await key(page, otherOctave).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '0');

  await page.getByTestId('balloon-pause').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'paused');
  await key(page, target).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '0');
  await page.getByTestId('balloon-pause').click();
  await key(page, target).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '1');
});

test('không đánh → bóng bay mất, hết mạng, kết quả lưu kỷ lục', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?screen=balloon-pop');
  await page.getByTestId('balloon-mode-two-hands').click();
  await page.getByRole('button', { name: 'Khó', exact: true }).click();
  await page.getByRole('button', { name: 'Nhanh', exact: true }).click();
  await page.getByTestId('balloon-start').click();
  await page.getByTestId('balloon-go').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'over', { timeout: 30_000 });
  await expect(screen(page)).toHaveAttribute('data-lives', '0');
  await expect(page.getByTestId('balloon-result')).toHaveAttribute('data-stars', '0');
  await expect(page.getByTestId('balloon-weak-notes')).toBeVisible();
  await page.getByTestId('balloon-change').click();
  await expect(page.getByTestId('balloon-total-stars')).toContainText('kỷ lục');
});
