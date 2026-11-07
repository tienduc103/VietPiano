import { expect, test, type Locator, type Page } from '@playwright/test';

/** Trả lời các lượt tìm phím bằng bàn phím trên màn hình; `keyFor` suy phím đúng từ chữ trong yêu cầu. */
async function answerPrompts(page: Page, root: string, promptId: string, until: Locator, keyFor: (prompt: string) => number) {
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

/**
 * Trắc nghiệm trả lời đúng ngay lần đầu: đợi câu i thành câu hiện tại (chấm hồng — hết phần hiện đáp án câu trước,
 * bấm sớm hơn thì bị bỏ qua) rồi chọn, chấm chuyển xanh.
 */
async function answerAllCorrect(page: Page, answers: number[]) {
  const dots = page.getByTestId('round-dots').locator('span');
  for (let i = 0; i < answers.length; i++) {
    await expect(dots.nth(i)).toHaveClass(/fuchsia/, { timeout: 8000 });
    await page.getByTestId(`choice-${answers[i]}`).click();
    await expect(dots.nth(i)).toHaveClass(/emerald/, { timeout: 3000 });
  }
}

test('Khám phá nốt nhạc — danh sách 11 buổi; buổi Rê: giới thiệu → câu đố có ôn Đô → luyện phím → chọn trò', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByTestId('open-note-discovery').click();
  await expect(page.getByRole('heading', { name: 'Khám phá nốt nhạc' })).toBeVisible();
  await expect(page.locator('[data-testid^="discovery-lesson-"]')).toHaveCount(11);
  // Chưa học gì: buổi nên học tiếp là buổi bàn phím; buổi nào cũng mở được (không khoá).
  await expect(page.getByTestId('discovery-lesson-nd-keyboard')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('discovery-progress')).toHaveText('Đã đạt 0/11');
  await page.getByTestId('discovery-lesson-nd-d').click();

  await expect(page.getByTestId('lesson-title')).toHaveText('Nốt Rê');
  await expect(page.getByText('Khám phá nốt nhạc · Buổi 3')).toBeVisible();
  // Thứ tự chỉ là gợi ý: nhắc học Đô trước nhưng vẫn học được.
  await expect(page.getByTestId('suggest-before')).toContainText('Buổi 2 – Nốt Đô');
  await page.getByTestId('start-lesson').click();

  // Giới thiệu: hình + tiếng đàn ở mỗi trang; không có trang trường độ.
  const titles = ['Đây là nốt Rê', 'Rê nằm giữa 2 phím đen', 'Rê giữa trên khuông nhạc', 'Ngón 2 tay phải đánh Rê', 'Nhiều nốt Rê', 'Rê và các nốt đã học'];
  for (let i = 0; i < titles.length; i++) {
    await expect(page.getByTestId('step-title')).toHaveText(titles[i]);
    await expect(page.getByTestId('intro-step').locator('[data-testid="listen-notes"], [data-testid="listen"]').first()).toBeVisible();
    if (i === 0) await expect(page.locator('[data-testid="illustration-keyboard"] [data-highlighted]')).toHaveCount(3); // D3, D4, D5
    if (i === 5) await expect(page.getByTestId('intro-step').locator('svg .vf-stavenote')).toHaveCount(2); // Đô → Rê
    await page.getByTestId('intro-next').click();
  }

  // Câu đố chọn hình: 4 câu nốt Rê + 2 câu ôn Đô (Rê là đáp án nhiễu). Sai thì chọn lại.
  await expect(page.getByTestId('step-title')).toHaveText('Câu đố: chọn hình đúng');
  const quiz = page.getByTestId('choice-quiz');
  await expect(page.getByTestId('quiz-prompt')).toHaveText('Phím nào là Rê?');
  await expect(quiz.getByTestId('mini-keyboard')).toHaveCount(3);
  await page.getByTestId('choice-0').click();
  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('quiz-prompt')).toHaveText('Phím nào là Rê?');
  const prompts = ['Phím nào là Rê?', 'Đâu là nốt Rê giữa trên khuông?', 'Khuông nào có nốt Rê giữa?', 'Ngón nào đánh nốt Rê giữa?', 'Phím nào là Đô?', 'Khuông nào có nốt Đô giữa?'];
  const answers = [2, 1, 0, 0, 1, 2];
  for (let i = 0; i < answers.length; i++) {
    await expect(page.getByTestId('quiz-prompt')).toHaveText(prompts[i]);
    if (i === 3) await expect(quiz.getByTestId('hand-figure')).toHaveCount(3);
    await page.getByTestId(`choice-${answers[i]}`).click();
    if (i < answers.length - 1) await expect(page.getByTestId('quiz-prompt')).toHaveText(prompts[i + 1], { timeout: 8000 });
  }
  await expect(page.getByTestId('exercise-verdict')).toHaveText('Đạt'); // 5/6 đúng lần đầu (câu 1 sai một lần)
  await page.getByTestId('exercise-next').click();

  // Luyện phím: Rê xen Đô.
  await expect(page.getByTestId('step-title')).toHaveText('Luyện phím: nốt Rê và các nốt đã học');
  const keyFor = (prompt: string) => (prompt.includes('Đô') ? 60 : prompt.includes('thấp') ? 50 : prompt.includes('cao') ? 74 : 62);
  await answerPrompts(page, 'key-quiz', 'quiz-prompt', page.getByTestId('exercise-done'), keyFor);
  await expect(page.getByTestId('exercise-score')).toHaveText('100/100');
  await page.getByTestId('exercise-next').click();

  // Kết quả → chọn trò (không có Luyện tập sau buổi).
  await expect(page.getByTestId('lesson-verdict')).toHaveText('Đạt');
  await expect(page.getByTestId('nav-review')).toHaveCount(0);
  await page.getByTestId('go-review').click();
  await expect(page.getByTestId('supplement-games')).toBeVisible();
  for (const g of ['balloon-hunt', 'key-hunt', 'staff-shoot']) await expect(page.getByTestId(`supplement-game-${g}`)).toBeVisible();
  await expect(page.getByTestId('supplement-next')).toHaveText('Buổi tiếp theo →');

  // Săn phím: nốt Rê xen nốt Đô đã học.
  await page.getByTestId('supplement-game-key-hunt').click();
  await page.getByTestId('game-start').click();
  await answerPrompts(page, 'key-hunt', 'hunt-prompt', page.getByTestId('game-result'), (p) => (p.includes('Đô') ? 60 : p.includes('thấp') ? 50 : p.includes('cao') ? 74 : 62));
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  await page.getByTestId('game-back').click();

  await expect(page.getByTestId('supplement-games-back')).toHaveText('Về Khám phá nốt nhạc');
  await page.getByTestId('supplement-games-back').click();
  await expect(page.getByTestId('discovery-lesson-nd-d')).toHaveAttribute('data-status', 'completed');
  await expect(page.getByTestId('discovery-progress')).toHaveText('Đã đạt 1/11');
});

test('buổi bàn phím: đố nghe cao hơn / thấp hơn (không tô phím), luyện nhóm phím đen', async ({ page }) => {
  await page.goto('/?screen=note-discovery');
  await page.getByTestId('discovery-lesson-nd-keyboard').click();
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('step-title')).toHaveText('Phím trắng và phím đen');
  for (let i = 0; i < 5; i++) await page.getByTestId('intro-next').click();
  // Bỏ qua câu đố chọn hình → đố nghe.
  await page.getByTestId('step-next').click();
  await expect(page.getByTestId('step-title')).toHaveText('Đố nghe: cao hơn hay thấp hơn?');
  const quiz = page.getByTestId('choice-quiz');
  await expect(quiz.getByTestId('listen-notes')).toBeVisible();
  await expect(quiz.locator('[data-testid="illustration-keyboard"] [data-highlighted]')).toHaveCount(0);
  await expect(page.getByTestId('choice-0')).toHaveText('Cao hơn');
  await expect(page.getByTestId('choice-1')).toHaveText('Thấp hơn');
  await quiz.getByTestId('listen-notes').click();
  await answerAllCorrect(page, [0, 1, 1, 0, 0, 1]);
  await expect(page.getByTestId('exercise-score')).toHaveText('100/100');
  await page.getByTestId('exercise-next').click();

  await expect(page.getByTestId('step-title')).toHaveText('Luyện phím: phím đen, phím trắng, nhóm phím đen');
  // Phím đen bất kỳ, phím trắng bất kỳ, rồi nhóm 2 / nhóm 3 phím đen.
  const keyFor = (prompt: string) => (prompt.includes('nhóm 2') ? 61 : prompt.includes('nhóm 3') ? 66 : prompt.includes('đen') ? 70 : 64);
  await answerPrompts(page, 'key-quiz', 'quiz-prompt', page.getByTestId('exercise-done'), keyFor);
  await expect(page.getByTestId('exercise-score')).toHaveText('100/100');
});

test('buổi giai điệu: bài khởi động không bắt buộc, chơi trọn "Bánh nóng giòn" bằng Wait Mode trên bàn phím màn hình', async ({ page }) => {
  await page.goto('/?screen=note-discovery');
  await page.getByTestId('discovery-lesson-nd-melody').click();
  await page.getByTestId('start-lesson').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('intro-next').click();
  await expect(page.getByTestId('step-title')).toHaveText('Khởi động: năm nốt thế Đô');
  await page.getByTestId('step-next').click();

  await expect(page.getByTestId('step-title')).toHaveText('Bánh nóng giòn');
  const notes = [64, 62, 60, 64, 62, 60, 60, 60, 62, 62, 64, 62, 60];
  // Wait Mode: nốt sai không làm tiến, app chờ đúng nốt.
  await page.locator('[data-testid="wait-keyboard"] [data-midi="60"]').click();
  await expect(page.getByTestId('progress-text')).toHaveText('0/13');
  await page.waitForTimeout(330);
  for (let i = 0; i < notes.length; i++) {
    await page.locator(`[data-testid="wait-keyboard"] [data-midi="${notes[i]}"]`).click();
    // Nốt cuối: bài xong, màn kết quả thay chỗ thanh tiến độ.
    if (i < notes.length - 1) await expect(page.getByTestId('progress-text')).toHaveText(`${i + 1}/13`);
    await page.waitForTimeout(330); // > minAdvanceIntervalMs
  }
  await expect(page.getByTestId('exercise-done')).toBeVisible();
  await expect(page.getByTestId('exercise-verdict')).toHaveText('Đạt'); // 12/13 nốt đúng ngay lần đầu
});

test('màn chọn trò: trò riêng của lộ trình (Nghe nốt đoán phím, Đua đọc nốt, Giai điệu bí ẩn, Hứng nốt rơi) mở được từ buổi học', async ({ page }) => {
  for (const [lesson, kind, view] of [
    ['nd-keyboard', 'ear-finder', 'ear-finder'],
    ['nd-staff', 'note-sprint', 'note-sprint'],
    ['nd-melody', 'echo-melody', 'echo-melody'],
    ['nd-melody', 'note-catch', 'note-catch'],
  ] as const) {
    await page.goto('/?screen=note-discovery');
    await page.getByTestId(`discovery-lesson-${lesson}`).click();
    await page.getByTestId('nav-game').click();
    await page.getByTestId(`supplement-game-${kind}`).click();
    await page.getByTestId('game-start').click();
    await expect(page.getByTestId(view)).toBeVisible();
  }
});

test('buổi đọc khuông: nhìn nốt (không ghi tên) chọn phím, rồi nhìn nốt – đánh nốt Đô giữa → Đô cao', async ({ page }) => {
  await page.goto('/?screen=note-discovery');
  await page.getByTestId('discovery-lesson-nd-staff').click();
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('step-title')).toHaveText('Khuông nhạc và khoá Sol');
  for (let i = 0; i < 5; i++) await page.getByTestId('intro-next').click();

  await expect(page.getByTestId('quiz-prompt')).toHaveText('Khuông nào có nốt Sol?');
  await page.getByTestId('choice-1').click();
  await expect(page.getByTestId('quiz-prompt')).toHaveText('Nốt này là phím nào?', { timeout: 3000 });
  // Nốt đề bài vẽ không kèm tên nốt.
  await expect(page.getByTestId('choice-quiz').locator('[data-testid="figure-staff"] svg .vf-stavenote')).toHaveCount(1);
  await expect(page.getByTestId('choice-quiz').locator('[data-testid="figure-staff"] svg text.score-label')).toHaveCount(0);
  await page.getByTestId('step-next').click();

  await expect(page.getByTestId('note-reading')).toBeVisible();
  const order = [64, 72, 67, 62, 71, 65, 60, 69];
  for (let i = 0; i < order.length; i++) {
    await page.locator(`[data-testid="note-reading"] [data-midi="${order[i]}"]`).click();
    await page.waitForTimeout(330);
  }
  await expect(page.getByTestId('exercise-score')).toHaveText('100/100');
});
