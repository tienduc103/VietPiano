import { expect, test, type Page } from '@playwright/test';

/** Phím đúng cho từng yêu cầu tìm phím của buổi 1 cấp 1 (theo chữ trong yêu cầu). */
function keyFor(prompt: string): number {
  if (prompt.includes('nhóm 2')) return 61;
  if (prompt.includes('nhóm 3')) return 66;
  if (prompt.includes('phím đen')) return 61;
  if (prompt.includes('phím trắng')) return 60;
  if (prompt.includes('C3')) return 48;
  if (prompt.includes('C5') || prompt.includes('KHÁC')) return 72;
  return 60;
}

const key = (page: Page, root: string, midi: number | string) => page.locator(`[data-testid="${root}"] button[data-midi="${midi}"]`);

test('menu Trò chơi: nút trên trang chủ, 2 tab; trò của buổi học có chú thích + nhãn "Chưa học", kỷ lục dùng chung', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByTestId('open-games').click();
  await expect(page.getByTestId('games-screen')).toBeVisible();

  // Tab "Theo trò chơi": 6 trò của buổi học + 4 trò mới.
  await expect(page.locator('[data-testid^="game-card-"]')).toHaveCount(10);
  await expect(page.getByTestId('game-card-key-hunt')).toContainText('Có ở');
  await page.getByTestId('game-card-key-hunt').click();
  const row = page.getByTestId('game-lesson-l1-01-keyboard');
  await expect(row).toContainText('Buổi 1');
  await expect(row).toContainText('yêu cầu');
  await expect(row.getByTestId('tag-not-learned')).toBeVisible();
  await expect(row).toContainText('Chưa chơi');

  // Chơi Săn phím của buổi 1 (buổi chưa học vẫn mở).
  await row.click();
  await expect(page.getByTestId('games-playing-title')).toContainText('Cấp 1 · Buổi 1');
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'key-hunt');
  await page.getByTestId('game-start').click();
  const result = page.getByTestId('game-result');
  for (let i = 0; i < 40 && !(await result.isVisible()); i++) {
    const text = await page.getByTestId('hunt-prompt').textContent({ timeout: 1000 }).catch(() => null);
    if (text === null) continue;
    await key(page, 'key-hunt', keyFor(text)).click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(330);
  }
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  await page.getByTestId('game-back').click();
  await expect(page.getByTestId('game-lesson-l1-01-keyboard')).toContainText('★★★');

  // Tab "Theo buổi học": mỗi buổi liệt kê trò của nó; kỷ lục cũng có ở màn giáo trình.
  await page.getByTestId('games-tab-lessons').click();
  await page.getByTestId('games-level-1').click();
  const lesson = page.getByTestId('games-lesson-l1-01-keyboard');
  await expect(lesson.getByTestId('lesson-game-l1-01-keyboard-key-hunt')).toContainText('★★★');
  await expect(lesson.getByTestId('lesson-game-l1-01-keyboard-echo-melody')).toContainText('Luyện tai');
  await page.goto('/?screen=curriculum');
  await expect(page.getByTestId('cur-game-l1-01-keyboard')).toHaveAttribute('aria-label', 'Trò chơi — 3 sao');
});

test('Đua đọc nốt 60 giây: thẻ nốt trên khuông, đúng thì sang nốt mới, sai bị trừ giây', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('games-tab-games').click();
  await page.getByTestId('game-card-note-sprint').click();
  await page.getByTestId('arcade-note-sprint-treble-5').click();
  await page.getByTestId('game-start').click();
  const card = page.getByTestId('sprint-card');
  await expect(card.locator('svg')).toBeVisible();
  for (let i = 0; i < 5; i++) {
    const midi = await card.getAttribute('data-midi');
    await key(page, 'note-sprint', midi!).click();
    await page.waitForTimeout(250);
  }
  await expect(page.getByTestId('sprint-hits')).toHaveText('✅ 5');
  const before = Number((await page.getByTestId('sprint-seconds').textContent())!.match(/\d+/)![0]);
  const current = Number(await card.getAttribute('data-midi'));
  await key(page, 'note-sprint', current === 60 ? 62 : 60).click();
  const after = Number((await page.getByTestId('sprint-seconds').textContent())!.match(/\d+/)![0]);
  expect(before - after).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('sprint-hits')).toHaveText('✅ 5');
});

test('Nghe nốt đoán phím: sai thì gợi ý cao hơn / thấp hơn, đúng thì sang vòng sau', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('games-tab-games').click();
  await page.getByTestId('game-card-ear-finder').click();
  await page.getByTestId('arcade-ear-finder-c-five').click();
  await page.getByTestId('game-start').click();
  const root = page.getByTestId('ear-finder');
  await expect(root).toHaveAttribute('data-status', 'answer', { timeout: 5000 });
  const target = Number(await root.getAttribute('data-target'));
  await key(page, 'ear-finder', target === 60 ? 71 : 60).click();
  await expect(page.getByTestId('ear-prompt')).toHaveText(target === 60 ? '⬇️ Thấp hơn!' : '⬆️ Cao hơn nữa!');
  await page.waitForTimeout(250);
  await key(page, 'ear-finder', target).click();
  await expect(page.getByTestId('ear-prompt')).toContainText('Đúng rồi');
  await expect(page.getByTestId('ear-round')).toHaveText('Vòng 2/8');
});

test('Thám tử quãng: nốt gốc sáng trên bàn phím, đánh đúng nốt cách nó một quãng thì được điểm', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('games-tab-games').click();
  await page.getByTestId('game-card-interval-detective').click();
  await page.getByTestId('arcade-interval-detective-steps-up').click();
  await page.getByTestId('game-start').click();
  await expect(page.getByTestId('interval-prompt')).toContainText(/quãng [23] (thứ|trưởng) đi lên/);
  await expect(page.locator('[data-testid="interval-detective"] [data-highlighted]')).toHaveCount(1);
  const target = await page.getByTestId('interval-detective').getAttribute('data-target');
  await key(page, 'interval-detective', target!).click();
  await expect(page.getByTestId('game-score')).not.toHaveText('⭐ 0');
});

test('Giữ nhịp tim: metronome dẫn rồi tắt, tự gõ đều → chấm từng phách, hết lượt có kết quả + kỷ lục', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?screen=games');
  await page.getByTestId('games-tab-games').click();
  await page.getByTestId('game-card-steady-beat').click();
  await page.getByTestId('arcade-steady-beat-bpm-100').click();
  await page.getByTestId('game-start').click();
  const root = page.getByTestId('steady-beat');
  await expect(root).toHaveAttribute('data-phase', 'listen', { timeout: 3000 });
  await expect(root).toHaveAttribute('data-phase', 'solo', { timeout: 8000 });
  const pad = page.getByTestId('beat-pad');
  const t0 = Date.now();
  for (let i = 1; i <= 20; i++) {
    await page.waitForTimeout(Math.max(0, t0 + i * 600 - 300 - Date.now()));
    await pad.dispatchEvent('pointerdown');
  }
  await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="game-result"]')).toContainText('Phách đều');
  await page.getByTestId('game-back').click();
  await expect(page.getByTestId('arcade-steady-beat-bpm-100')).toContainText('kỷ lục');
});
