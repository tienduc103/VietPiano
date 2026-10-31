import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vietpiano.profiles.v1', JSON.stringify({
      profiles: [{ id: 'tomato-player', name: 'Bé Cà Chua', age: 8, avatar: '🐰', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 1 }],
      activeId: 'tomato-player',
    }));
  });
});
test('Thu hoạch cà chua tích hợp menu, khuông nhạc và piano ảo không có giới hạn thời gian', async ({ page }) => {
  await page.goto('/?screen=games');
  await expect(page.getByTestId('open-tomato-harvest')).toContainText('Thu hoạch cà chua');
  await page.getByTestId('open-tomato-harvest').click();
  const game = page.getByTestId('tomato-harvest');
  await expect(game).toHaveAttribute('data-status', 'ready');
  await expect(game).toContainText('không giới hạn thời gian');
  await expect(game.getByText(/đếm ngược|hết giờ/i)).toHaveCount(0);
  await page.getByTestId('tomato-start').click();
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect(page.getByTestId('tomato-note-card').locator('svg')).toBeVisible();
  await expect(page.locator('[data-testid^="tomato-plant-"]')).toHaveCount(5);
  for (let harvested = 1; harvested <= 5; harvested++) {
    const target = await game.getAttribute('data-target');
    await page.locator(`[data-testid="tomato-keyboard"] button[data-midi="${target}"]`).click();
    await expect(game).toHaveAttribute('data-harvested', String(harvested));
  }
  await expect(page.getByTestId('tomato-plant-1')).toHaveAttribute('data-count', '0');
  await expect(page.getByTestId('tomato-plant-2')).toHaveAttribute('data-count', '5');
});

test('cấp Vừa giữ nốt khi sai và trừ điểm không âm', async ({ page }) => {
  await page.goto('/?screen=tomato-harvest');
  await page.getByRole('button', { name: '🌻 Vừa' }).click();
  await page.getByTestId('tomato-start').click();
  const game = page.getByTestId('tomato-harvest');
  const target = Number(await game.getAttribute('data-target'));
  const wrong = target === 60 ? 62 : 60;
  await page.locator(`[data-testid="tomato-keyboard"] button[data-midi="${wrong}"]`).click();
  await expect(game).toHaveAttribute('data-target', String(target));
  await expect(game).toHaveAttribute('data-harvested', '0');
  await expect(page.getByTestId('tomato-score')).toHaveText('⭐ 0');
});
