import { expect, test, type Locator, type Page } from '@playwright/test';

/** Phím đúng cho yêu cầu tìm nốt Đô (theo chữ trong yêu cầu). */
function keyFor(prompt: string): number {
  if (prompt.includes('thấp')) return 48;
  if (prompt.includes('cao') || prompt.includes('khác')) return 72;
  return 60; // Đô giữa / Đô bất kỳ
}

async function answerPrompts(page: Page, root: string, promptId: string, until: Locator) {
  for (let i = 0; i < 40 && !(await until.isVisible()); i++) {
    const prompt = page.getByTestId(promptId);
    if (!(await prompt.isVisible())) {
      await page.waitForTimeout(100);
      continue;
    }
    const text = await prompt.textContent({ timeout: 1000 }).catch(() => null);
    if (text === null) continue;
    await page
      .locator(`[data-testid="${root}"] [data-midi="${keyFor(text)}"]`)
      .first()
      .click({ timeout: 2000 })
      .catch(() => undefined);
    await page.waitForTimeout(330); // > minIntervalMs
  }
  await expect(until).toBeVisible();
}

test('giáo trình bổ sung — nốt Đô: giới thiệu → câu đố chọn hình → luyện phím → chọn trò chơi', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('open-supplement').click();
  await expect(page.getByTestId('supplement')).toBeVisible();
  await expect(page.getByText('Sắp có').first()).toBeVisible();
  await page.getByTestId('supplement-lesson-sup-c').click();

  await expect(page.getByTestId('lesson-title')).toHaveText('Nốt Đô');
  await page.getByTestId('start-lesson').click();

  // Giới thiệu: hình bàn phím có nút nghe tiếng nốt Đô.
  await expect(page.getByTestId('step-title')).toHaveText('Đây là nốt Đô');
  await expect(page.getByTestId('listen-notes')).toBeVisible();
  await expect(page.locator('[data-testid="illustration-keyboard"] [data-highlighted]')).toHaveCount(3); // C3, C4, C5
  for (let i = 0; i < 5; i++) await page.getByTestId('intro-next').click();

  // Câu đố chọn hình: sai thì chọn lại (không lộ đáp án), đúng thì sang câu sau.
  const quiz = page.getByTestId('choice-quiz');
  await expect(quiz).toBeVisible();
  await expect(page.getByTestId('quiz-prompt')).toHaveText('Phím nào là Đô?');
  await expect(quiz.getByTestId('mini-keyboard')).toHaveCount(3);
  // Thẻ phím không ghi tên nốt.
  await expect(quiz.getByTestId('mini-keyboard').first().locator('text')).toHaveCount(0);
  await page.getByTestId('choice-0').click();
  await expect(page.getByTestId('feedback')).toBeVisible();
  await expect(page.getByTestId('choice-1')).not.toHaveClass(/ring-emerald/);
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('quiz-prompt')).toHaveText('Phím nào là Đô?');

  const answers = [1, 2, 0, 2, 2, 0];
  const prompts = ['Phím nào là Đô?', 'Phím đang sáng nào là nốt Đô?', 'Đâu là nốt Đô giữa trên khuông?', 'Khuông nào có nốt Đô giữa?', 'Ngón nào đánh nốt Đô giữa?', 'Ngón cái — ngón số mấy?'];
  for (let i = 0; i < answers.length; i++) {
    await expect(page.getByTestId('quiz-prompt')).toHaveText(prompts[i]);
    if (i === 4) await expect(quiz.getByTestId('hand-figure')).toHaveCount(3);
    await page.getByTestId(`choice-${answers[i]}`).click();
    if (i < answers.length - 1) await expect(page.getByTestId('quiz-prompt')).toHaveText(prompts[i + 1], { timeout: 3000 });
  }
  // 5/6 đúng lần đầu (câu 1 sai một lần) → đạt.
  await expect(page.getByTestId('exercise-verdict')).toHaveText('Đạt');
  await page.getByTestId('exercise-next').click();

  // Luyện phím trên bàn phím ảo.
  await answerPrompts(page, 'key-quiz', 'quiz-prompt', page.getByTestId('exercise-done'));
  await expect(page.getByTestId('exercise-score')).toHaveText('100/100');
  await page.getByTestId('exercise-next').click();

  // Kết quả → chọn trò (không có Luyện tập sau buổi).
  await expect(page.getByTestId('lesson-verdict')).toHaveText('Đạt');
  await expect(page.getByTestId('nav-review')).toHaveCount(0);
  await page.getByTestId('go-review').click();
  await expect(page.getByTestId('supplement-games')).toBeVisible();
  await expect(page.locator('[data-testid^="supplement-game-"]')).toHaveCount(3);

  // Săn phím: chỉ tìm nốt Đô.
  await page.getByTestId('supplement-game-key-hunt').click();
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'key-hunt');
  await page.getByTestId('game-start').click();
  await answerPrompts(page, 'key-hunt', 'hunt-prompt', page.getByTestId('game-result'));
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  await page.getByTestId('game-back').click();
  await expect(page.getByTestId('supplement-game-key-hunt')).toContainText('kỷ lục');

  // Bóng bay: mở kiểu Tìm nốt Đô, nút quay lại về bài học.
  await page.getByTestId('supplement-game-balloon-hunt').click();
  await expect(page.getByTestId('balloon-screen')).toBeVisible();
  await expect(page.getByTestId('balloon-screen').locator('h1')).toContainText('Tìm nốt');
  await page.getByTestId('balloon-exit').click();
  await expect(page.getByTestId('supplement-games')).toBeVisible();

  await page.getByTestId('supplement-games-back').click();
  await expect(page.getByTestId('supplement-lesson-sup-c')).toHaveAttribute('data-status', 'completed');
});
