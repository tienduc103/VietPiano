import { expect, test, type Page } from '@playwright/test';

const key = (page: Page, midi: number) => page.locator(`[data-testid="balloon-keyboard"] [data-midi="${midi}"]`);
const screen = (page: Page) => page.getByTestId('balloon-screen');

async function waitBalloon(page: Page): Promise<number> {
  await expect(screen(page)).not.toHaveAttribute('data-urgent', '');
  return Number(await screen(page).getAttribute('data-urgent'));
}

/** Mở bảng ⚙ Cài đặt trên màn chơi, chọn rồi đóng. */
async function configure(page: Page, pick: () => Promise<void>) {
  await page.getByTestId('balloon-settings').click();
  await expect(page.getByTestId('balloon-settings-panel')).toBeVisible();
  await pick();
  await page.getByTestId('balloon-settings-done').click();
  await expect(page.getByTestId('balloon-settings-panel')).toBeHidden();
}

test('mục Trò chơi → Bóng bay (một màn, ⚙ Cài đặt): sai không nổ, đúng nốt thì nổ; đổi cách hiện nốt, ẩn từng phím', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('open-balloon-pop').click();
  // Vào thẳng màn chơi, không còn trang chọn riêng.
  await expect(screen(page)).toHaveAttribute('data-status', 'ready');
  await configure(page, async () => {
    await page.getByTestId('balloon-mode-one-hand').click();
    await page.getByRole('button', { name: 'Tay phải' }).click();
    await page.getByRole('button', { name: 'Dễ', exact: true }).click();
    await page.getByRole('button', { name: 'Vừa', exact: true }).click();
    // Khoá đọc hình nốt (mặc định Sol).
    await page.getByRole('button', { name: 'Khoá Đô', exact: true }).click();
  });

  await page.getByTestId('balloon-go').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'playing');
  const target = await waitBalloon(page);
  expect(target).toBeGreaterThanOrEqual(60);
  expect(target).toBeLessThanOrEqual(67);
  await expect(page.getByTestId('balloon-target-finger')).toContainText('Tay phải · ngón');
  await expect(key(page, target).getByTestId('key-finger')).toBeVisible();

  // Sai: bóng vẫn bay.
  await key(page, target === 60 ? 62 : 60).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '0');

  // Nút hiển thị xoay vòng: Đô Rê Mi → CDEFGAB → Hình nốt → ? → Đô Rê Mi.
  const display = page.getByTestId('balloon-display');
  await expect(display).toHaveAttribute('data-display', 'solfege');
  await expect(key(page, 65)).toHaveText(/Pha/);
  await expect(page.getByTestId('balloon-target-name')).not.toHaveText('?');
  await display.click();
  await expect(display).toHaveAttribute('data-display', 'letter');
  // (Phím còn có chữ thường gợi ý bàn phím máy tính.)
  await expect(key(page, 65)).toHaveText(/F$/);
  // Ẩn riêng phím F.
  await page.getByTestId('balloon-hide-F').click();
  await expect(key(page, 65)).not.toContainText('F');
  await expect(key(page, 64)).toHaveText(/E$/);
  await page.getByTestId('balloon-hide-F').click();

  await display.click();
  await expect(display).toHaveAttribute('data-display', 'staff');
  await expect(page.getByTestId('balloon-target-name')).toHaveText('?');
  const card = page.getByTestId('balloon-staff-card').first();
  await expect(card.locator('svg')).toBeVisible();
  // Chỉ khuông ngắn + hình nốt: không vẽ khoá / số chỉ nhịp.
  await expect(card.locator('.vf-clef, .vf-timesignature')).toHaveCount(0);
  expect(['w', 'h', 'q', '8']).toContain(await card.getAttribute('data-duration'));
  // Tên phím vẫn theo kiểu chữ gần nhất.
  await expect(key(page, 65)).toHaveText(/F$/);

  await display.click();
  await expect(display).toHaveAttribute('data-display', 'ear');
  await expect(page.getByTestId('balloon-target-name')).toHaveText('?');
  await expect(page.getByTestId('balloon-replay')).toBeEnabled();
  await expect(page.getByTestId('balloon-staff-card')).toHaveCount(0);

  await display.click();
  await expect(display).toHaveAttribute('data-display', 'solfege');

  // Đúng nốt → nổ.
  await key(page, target).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '1');
});

test('full phím: phải đúng quãng tám; tạm dừng; mở cài đặt giữa ván thì tạm dừng', async ({ page }) => {
  await page.goto('/?screen=balloon-pop');
  await configure(page, async () => {
    await page.getByTestId('balloon-mode-full').click();
    await page.getByRole('button', { name: 'Dễ', exact: true }).click();
  });
  await page.getByTestId('balloon-go').click();
  const target = await waitBalloon(page);
  await key(page, target + 12 <= 84 ? target + 12 : target - 12).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '0');

  await page.getByTestId('balloon-pause').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'paused');
  await key(page, target).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '0');
  await page.getByTestId('balloon-pause').click();
  await key(page, target).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '1');

  await page.getByTestId('balloon-settings').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'paused');
  await page.getByTestId('balloon-settings-done').click();
  await expect(page.getByTestId('balloon-paused')).toBeVisible();
});

test('không đánh → bóng bay mất, hết mạng, kết quả lưu kỷ lục', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?screen=balloon-pop');
  await configure(page, async () => {
    await page.getByTestId('balloon-mode-two-hands').click();
    await page.getByRole('button', { name: 'Khó', exact: true }).click();
    await page.getByRole('button', { name: 'Nhanh', exact: true }).click();
  });
  await page.getByTestId('balloon-go').click();
  await expect(screen(page)).toHaveAttribute('data-status', 'over', { timeout: 30_000 });
  await expect(screen(page)).toHaveAttribute('data-lives', '0');
  await expect(page.getByTestId('balloon-result')).toHaveAttribute('data-stars', '0');
  await expect(page.getByTestId('balloon-weak-notes')).toBeVisible();
  await page.getByTestId('balloon-change').click();
  await expect(page.getByTestId('balloon-total-stars')).toContainText('kỷ lục');
});

test('góc trên phải: bóng sắp bay ra đúng thứ tự; đúng 10 nốt liên tục → pháo hoa', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?screen=balloon-pop');
  await configure(page, async () => {
    await page.getByTestId('balloon-mode-one-hand').click();
    await page.getByRole('button', { name: 'Dễ', exact: true }).click();
  });
  await page.getByTestId('balloon-go').click();
  const upcoming = page.getByTestId('balloon-upcoming');
  await expect(upcoming).toHaveAttribute('data-speed', '1.0');
  await expect(page.getByTestId('balloon-upcoming-item')).toHaveCount(3);
  for (let i = 0; i < 10; i++) {
    const next = Number(await page.getByTestId('balloon-upcoming-item').first().getAttribute('data-midi'));
    const target = await waitBalloon(page);
    // Dễ: mỗi lần một quả → quả bay ra chính là quả đầu hàng chờ.
    expect(target).toBe(next);
    await expect(screen(page)).toHaveAttribute('data-fireworks', '0');
    await key(page, target).click();
    await expect(screen(page)).toHaveAttribute('data-popped', String(i + 1));
  }
  await expect(screen(page)).toHaveAttribute('data-fireworks', '1');
});

test('Tìm nốt: chỉ bóng nốt đã chọn; đúng → chậm lại, sai → nhanh dần; sai 20 lần → hết ván', async ({ page }) => {
  await page.goto('/?screen=balloon-pop');
  await configure(page, async () => {
    await page.getByTestId('balloon-mode-one-hand').click();
    await page.getByRole('button', { name: 'Tay phải' }).click();
    await page.getByRole('button', { name: 'Dễ', exact: true }).click();
    await page.getByRole('button', { name: '🔎 Tìm nốt', exact: true }).click();
    // Chỉ giữ Mi.
    for (const l of ['C', 'D', 'F', 'G', 'A', 'B']) await page.getByTestId(`balloon-hunt-${l}`).click();
    await expect(page.getByTestId('balloon-hunt-E')).toHaveAttribute('aria-pressed', 'true');
    // Không bỏ được nốt cuối cùng.
    await page.getByTestId('balloon-hunt-E').click();
    await expect(page.getByTestId('balloon-hunt-E')).toHaveAttribute('aria-pressed', 'true');
  });
  await expect(page.getByTestId('balloon-hunt-notes')).toContainText('Mi');
  await page.getByTestId('balloon-go').click();
  expect(await waitBalloon(page)).toBe(64);
  await expect(page.getByTestId('balloon-mistakes')).toHaveText('✕ 0/20');

  await key(page, 60).click();
  await expect(screen(page)).toHaveAttribute('data-mistakes', '1');
  await expect(screen(page)).toHaveAttribute('data-speed', '1.1');
  await key(page, 64).click();
  await expect(screen(page)).toHaveAttribute('data-popped', '1');
  await expect(screen(page)).toHaveAttribute('data-speed', '1');
  // Sự kiện sát lần nổ (< minIntervalMs) bị bỏ — chờ qua.
  await page.waitForTimeout(300);

  for (let i = 2; i <= 20; i++) {
    await key(page, 60).click();
    await expect(screen(page)).toHaveAttribute('data-mistakes', String(i));
  }
  await expect(screen(page)).toHaveAttribute('data-status', 'over');
  await expect(page.getByTestId('balloon-result')).toContainText('tìm được 1 nốt');
});
