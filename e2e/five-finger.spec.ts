import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'vietpiano.profiles.v1',
      JSON.stringify({
        profiles: [{ id: 'ff-player', name: 'Bé Năm Ngón', age: 8, avatar: '🐰', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 1 }],
        activeId: 'ff-player',
      }),
    );
  });
});

const game = (page: Page) => page.getByTestId('five-finger');
const key = (page: Page, midi: number | string) => page.locator(`[data-testid="five-keyboard"] button[data-midi="${midi}"]`);

/** Đánh đúng các nốt đang chờ (bàn phím ảo) tới hết chuỗi hiện tại. */
async function playChain(page: Page) {
  const chain = await game(page).getAttribute('data-chain');
  for (let i = 0; i < 8; i++) {
    const expected = (await game(page).getAttribute('data-expected'))!;
    const midis = expected.split(',').filter(Boolean);
    expect(midis.length).toBeGreaterThan(0);
    if (midis.length === 1) await key(page, midis[0]).click();
    else
      // Hai tay cùng lúc: hai phím trong cùng một tích tắc.
      await page.evaluate((ms) => {
        for (const m of ms) document.querySelector(`[data-testid="five-keyboard"] button[data-midi="${m}"]`)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        for (const m of ms) document.querySelector(`[data-testid="five-keyboard"] button[data-midi="${m}"]`)!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      }, midis);
    if (i < 7) await expect(game(page)).toHaveAttribute('data-step', String(i + 1));
    // Nốt lặp: chờ quá khoảng chống nhảy nốt (120 ms) trước lần đánh kế.
    await page.waitForTimeout(160);
  }
  await expect(game(page)).toHaveAttribute('data-status', /celebrating|finished/);
  return chain;
}

test('mở từ màn Giáo trình, tay phải mặc định C4–G4: đúng đủ 8 nốt → hiệu ứng hoàn thành → tự sang chuỗi mới', async ({ page }) => {
  await page.goto('/?screen=curriculum');
  await page.getByTestId('open-five-finger').click();
  await expect(game(page)).toHaveAttribute('data-status', 'ready');
  await page.getByTestId('five-start').click();
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  await expect(page.getByTestId('score').locator('svg')).toBeVisible();
  // Dễ: hiện tên nốt, ngón tay và phím cần đánh.
  await expect(page.getByTestId('five-target')).toContainText('Tay phải · ngón');
  const first = Number((await game(page).getAttribute('data-expected'))!);
  expect([60, 62, 64, 65, 67]).toContain(first);
  await expect(key(page, first).getByTestId('key-finger')).toBeVisible();

  // Sai → giữ nguyên bước.
  await key(page, 71).click();
  await expect(game(page)).toHaveAttribute('data-step', '0');
  await page.waitForTimeout(160);

  await playChain(page);
  await expect(page.getByTestId('five-celebrate')).toContainText('Hoàn thành chuỗi 1');
  await expect(game(page)).toHaveAttribute('data-chain', '2', { timeout: 4000 });
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  await expect(game(page)).toHaveAttribute('data-step', '0');
  await expect(page.getByTestId('five-chain-counter')).toHaveText('Chuỗi 2/10');
});

test('tay trái C3–G3, Trung bình: ẩn tên nốt, vẫn hiện ngón; Tạm dừng / Tiếp tục / Luyện lại / Kết thúc', async ({ page }) => {
  await page.goto('/?screen=five-finger');
  await page.getByTestId('five-open-settings').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tay trái', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Trung bình' }).click();
  await page.getByTestId('five-close-modal').click();
  await page.getByTestId('five-start').click();
  const expected = Number(await game(page).getAttribute('data-expected'));
  expect([48, 50, 52, 53, 55]).toContain(expected);
  await expect(page.getByTestId('five-target')).toContainText('Tay trái · ngón');
  await expect(page.getByTestId('five-target')).not.toContainText(/Đô|Rê|Mi|Pha|Sol/);

  await key(page, expected).click();
  await expect(game(page)).toHaveAttribute('data-step', '1');
  await page.getByTestId('five-pause').click();
  await expect(game(page)).toHaveAttribute('data-status', 'paused');
  await page.getByTestId('five-resume').click();
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  await page.getByTestId('five-retry').click();
  await expect(game(page)).toHaveAttribute('data-step', '0');
  await expect(game(page)).toHaveAttribute('data-chain', '1');
  await page.getByTestId('five-end').click();
  await expect(page.getByTestId('five-summary')).toBeVisible();
});

test('hai tay cùng lúc (bàn phím ảo), luyện từng tay trước, buổi 5 chuỗi; Khó chỉ có khuông nhạc', async ({ page }) => {
  await page.goto('/?screen=five-finger');
  await page.getByTestId('five-open-settings').click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Hai tay cùng lúc' }).click();
  await dialog.getByRole('switch', { name: /Luyện từng tay trước/ }).click();
  await dialog.getByRole('button', { name: '5', exact: true }).click();
  await page.getByTestId('five-close-modal').click();
  await page.getByTestId('five-start').click();
  await expect(game(page)).toHaveAttribute('data-phase', 'right');
  await playChain(page);
  await expect(game(page)).toHaveAttribute('data-phase', 'left', { timeout: 3000 });
  await playChain(page);
  await expect(game(page)).toHaveAttribute('data-phase', 'main', { timeout: 3000 });
  expect((await game(page).getAttribute('data-expected'))!.split(',')).toHaveLength(2);
  await playChain(page);
  await expect(game(page)).toHaveAttribute('data-chains-done', '1');
  await expect(page.getByTestId('five-chain-counter')).toHaveText(/Chuỗi [12]\/5/);

  // Khó: không còn gợi ý tên nốt / ngón.
  await page.getByTestId('five-open-settings').click();
  await dialog.getByRole('button', { name: 'Tay phải', exact: true }).click();
  await dialog.getByRole('button', { name: 'Khó' }).click();
  await page.getByTestId('five-close-modal').click();
  await page.getByTestId('five-start').click();
  await expect(page.getByTestId('five-target')).toHaveCount(0);
  await expect(page.locator('[data-testid="five-keyboard"] [data-testid="key-finger"]')).toHaveCount(0);

  // Thống kê đã lưu theo hồ sơ.
  await page.getByTestId('five-end').click();
  await page.getByRole('button', { name: '📊 Tiến bộ' }).click();
  await expect(page.getByTestId('five-progress')).toContainText('Tay phải');
  await expect(page.getByRole('dialog')).toContainText('Luyện lại chuỗi này');
});
