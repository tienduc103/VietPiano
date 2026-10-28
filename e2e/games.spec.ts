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
    // Lượt cuối xong thì bài tập biến mất ngay — không chờ yêu cầu / phím nữa.
    const text = await prompt.textContent({ timeout: 1000 }).catch(() => null);
    if (text === null) continue;
    await page
      .locator(`[data-testid="${root}"] [data-midi="${keyFor(text)}"]`)
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

test('Đèn giao thông tiết tấu: gõ đúng lúc toa chạm vạch; gõ vào ô dấu lặng thì phanh gấp', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-game-l1-14-rest').click();
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'rhythm-train');
  await page.getByTestId('game-start').click();
  await expect(page.getByTestId('rhythm-track')).toBeVisible();

  // Gõ ngay trong trình duyệt (chính xác theo khung hình): mỗi toa nốt khi chạm vạch (x = 140 px),
  // thêm một lần gõ giữa ô dấu lặng đầu tiên.
  await page.evaluate(() => {
    const tapped = new Set<Element>();
    let restTapped = false;
    const tap = () => document.querySelector('[data-testid="rhythm-tap"]')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    const loop = () => {
      if (!document.querySelector('[data-testid="rhythm-track"]')) return;
      for (const w of Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wagon"]'))) {
        const x = parseFloat(w.style.left);
        if (w.dataset.rest) {
          if (!restTapped && x <= 140 - 50) {
            restTapped = true;
            tap();
          }
        } else if (!tapped.has(w) && x <= 141) {
          tapped.add(w);
          tap();
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await expect(page.getByTestId('rhythm-judge')).toContainText('Đang nghỉ mà', { timeout: 30_000 });
  await expect(page.getByTestId('game-result')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  await expect(page.locator('[data-testid="game-result"] dd').first()).toHaveText('18/18');
});

test('Giai điệu bí ẩn: nghe (phím sáng theo nốt) rồi đánh lại; đoạn dài dần tới hết 5 vòng', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-game-l1-04-cde').click();
  await page.getByTestId('game-pick-echo-melody').click();
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'echo-melody');
  await page.getByTestId('game-start').click();
  await page.getByRole('switch').click(); // "Hiện phím khi phát"

  const game = page.getByTestId('echo-melody');
  const result = page.getByTestId('game-result');
  for (let round = 0; round < 5; round++) {
    await expect(game).toHaveAttribute('data-status', 'listen');
    const melody: string[] = [];
    while ((await game.getAttribute('data-status')) === 'listen') {
      const lit = await game.locator('button[data-highlighted]').first().getAttribute('data-midi', { timeout: 50 }).catch(() => null);
      if (lit && lit !== melody.at(-1)) melody.push(lit);
      await page.waitForTimeout(40);
    }
    expect(melody).toHaveLength(3 + round);
    for (const m of melody) {
      await game.locator(`button[data-midi="${m}"]`).first().click();
      await page.waitForTimeout(200); // > minIntervalMs
    }
  }
  await expect(result).toBeVisible();
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
  await expect(page.getByTestId('game-final-score')).toHaveText(String(100 * (3 + 4 + 5 + 6 + 7)));
  // Kết quả có nút chơi trò còn lại của buổi.
  await expect(page.getByTestId('game-other')).toContainText('Hứng nốt rơi');
});

test('Bắn bóng trên khuông: bóng mang nốt vẽ trên khuông, đánh đúng nốt thì bắn trúng', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-game-l1-06-staff').click();
  await expect(page.getByTestId('game-intro')).toHaveAttribute('data-game', 'staff-shoot');
  await page.getByTestId('game-start').click();

  const balloon = page.locator('[data-testid="balloon"][data-state="pending"]').first();
  await expect(balloon).toBeVisible({ timeout: 15_000 });
  await expect(balloon.locator('svg')).toBeVisible(); // khuông nhạc, không có tên nốt
  const result = page.getByTestId('game-result');
  for (let i = 0; i < 400 && !(await result.isVisible()); i++) {
    if (await balloon.isVisible()) {
      const midi = await balloon.getAttribute('data-midi');
      if (midi) await page.locator(`[data-testid="staff-shoot"] button[data-midi="${midi}"]`).click({ timeout: 2000 }).catch(() => undefined);
      await page.waitForTimeout(150);
    } else {
      await page.waitForTimeout(100);
    }
  }
  await expect(result).toBeVisible();
  await expect(page.getByTestId('game-stars')).toHaveAttribute('data-stars', '3');
});
