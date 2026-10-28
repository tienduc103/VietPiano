import { expect, test, type Locator, type Page } from '@playwright/test';

/** Phím đúng cho từng yêu cầu tìm phím của cấp 1 (theo chữ trong yêu cầu). */
function keyFor(prompt: string): number {
  if (prompt.includes('nhóm 2')) return 61;
  if (prompt.includes('nhóm 3')) return 66;
  if (prompt.includes('phím đen')) return 61;
  if (prompt.includes('phím trắng')) return 60;
  if (prompt.includes('C3')) return 48;
  if (prompt.includes('C5') || prompt.includes('KHÁC')) return 72;
  return 60; // Đô giữa / Đô bất kỳ
}

/** Trả lời các lượt tìm phím (đọc yêu cầu → bấm phím) cho tới khi `until` hiện ra. */
async function answerPrompts(page: Page, root: string, promptId: string, until: Locator) {
  for (let i = 0; i < 40 && !(await until.isVisible()); i++) {
    const prompt = page.getByTestId(promptId);
    if (!(await prompt.isVisible())) {
      await page.waitForTimeout(100);
      continue;
    }
    // Lượt cuối xong thì bài tập biến mất ngay — không chờ phím nữa.
    await page
      .locator(`[data-testid="${root}"] [data-midi="${keyFor((await prompt.textContent()) ?? '')}"]`)
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await page.waitForTimeout(330); // > minIntervalMs
  }
  await expect(until).toBeVisible();
}

test('sau buổi học: kết quả → luyện tập → trò chơi Săn phím → bài tiếp theo', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-review-l1-01-keyboard').click();

  // Luyện tập: các bài tìm phím của buổi, trộn lại, sai thì thử lại.
  await expect(page.getByTestId('review')).toContainText('Luyện tập 1/2');
  await answerPrompts(page, 'key-quiz', 'quiz-prompt', page.getByTestId('review-step-done'));
  await page.getByTestId('review-next').click();
  await expect(page.getByTestId('review')).toContainText('Luyện tập 2/2');
  await answerPrompts(page, 'key-quiz', 'quiz-prompt', page.getByTestId('review-step-done'));
  await page.getByTestId('review-next').click();
  await expect(page.getByTestId('review-done')).toBeVisible();

  // Trò chơi: buổi tìm phím → Săn phím.
  await page.getByTestId('go-game').click();
  await expect(page.getByTestId('nav-review')).toHaveClass(/emerald/); // đã ghi lần luyện tập
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'key-hunt');
  await page.getByTestId('game-start').click();
  await answerPrompts(page, 'key-hunt', 'hunt-prompt', page.getByTestId('game-result'));
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  expect(Number(await page.getByTestId('game-final-score').textContent())).toBeGreaterThan(1000);

  await page.getByTestId('game-next').click();
  await expect(page.getByTestId('lesson-title')).toHaveText('Tìm nốt Đô');

  // Tiến độ trò chơi hiện trên thẻ buổi.
  await page.goto('/?screen=curriculum');
  await expect(page.getByTestId('cur-game-l1-01-keyboard')).toHaveAttribute('aria-label', 'Trò chơi — 3 sao');
  await expect(page.getByTestId('cur-review-l1-01-keyboard')).toContainText('×1');
  // Luyện tập / trò chơi không làm buổi thành "hoàn thành".
  await expect(page.getByTestId('cur-lesson-l1-01-keyboard')).toHaveAttribute('data-status', 'available');
});

test('trò chơi Hứng nốt rơi: đánh đúng nốt đang rơi thì hứng được, sai thì mất chuỗi', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-game-l1-04-cde').click();
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'note-catch');
  await page.getByTestId('game-start').click();

  const field = page.getByTestId('catch-field');
  const key = (midi: string | number) => page.locator(`[data-testid="note-catch"] button[data-midi="${midi}"]`).first();
  const falling = field.locator('[data-testid="drop"][data-state="pending"]').first();
  await expect(falling).toBeVisible();
  // Nốt không có trên màn hình (F4) → sai, chưa hứng được nốt nào.
  await key(65).click();
  await expect(page.getByTestId('game-score')).toHaveText('⭐ 0');

  const result = page.getByTestId('game-result');
  for (let i = 0; i < 200 && !(await result.isVisible()); i++) {
    if (await falling.isVisible()) {
      const midi = await falling.getAttribute('data-midi');
      if (midi) await key(midi).click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(150); // > minIntervalMs
    } else {
      await page.waitForTimeout(100);
    }
  }
  await expect(result).toBeVisible();
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  await expect(page.getByTestId('game-final-score')).not.toHaveText('0');
});
