import { expect, test, type Page } from '@playwright/test';

/** "Đố bé nốt gì?" — nghiệm thu theo thiết kế đáp án bằng HÌNH (docs/note-quiz.md). */

const PROFILE = { id: 'quiz-kid', name: 'Bé Nốt', age: 4, avatar: '🐣', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 1 };

async function seed(page: Page, settings?: Record<string, unknown>) {
  await page.addInitScript(
    ([profile, s]) => {
      localStorage.setItem('vietpiano.profiles.v1', JSON.stringify({ profiles: [profile], activeId: profile.id }));
      if (s) localStorage.setItem('vietpiano.note-quiz.v1', JSON.stringify({ [profile.id]: { settings: s } }));
    },
    [PROFILE, settings ?? null] as const,
  );
}

const game = (page: Page) => page.getByTestId('note-quiz');
const options = (page: Page) => page.getByTestId('nq-option');

/** Chữ nhìn thấy trong ô (bỏ glyph Bravura — ký tự vùng riêng U+E000–U+F8FF của font nhạc). */
async function visibleTileText(page: Page): Promise<string[]> {
  return options(page).evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/[-\s]/g, '')));
}

async function startQuiz(page: Page) {
  await page.getByTestId('nq-go').click();
  await expect(game(page)).toHaveAttribute('data-status', 'asking');
  // Hình đã vẽ xong (VexFlow vẽ sau khi nạp font).
  await expect(options(page).first().locator('svg')).toBeVisible();
}

async function answerCorrect(page: Page) {
  const answer = await game(page).getAttribute('data-answer');
  await options(page).nth(Number(answer)).click();
  await expect(game(page)).toHaveAttribute('data-status', /answered|finished/);
}

test('mở từ mục Trò chơi; mặc định bé 4 tuổi: khoá Sol, Cao độ, 2 ô Đô–Rê–Mi, 10 câu, đáp án là hình không chữ', async ({ page }) => {
  await seed(page);
  await page.goto('/?screen=games');
  await page.getByTestId('open-note-quiz').click();
  await expect(game(page)).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('nq-ready')).toContainText('không giới hạn thời gian');
  await expect(page.getByTestId('nq-subtitle')).toHaveText('Cao độ · Khoá Sol · 2 đáp án');
  await startQuiz(page);
  await expect(page.getByTestId('nq-progress')).toHaveText('Câu 1/10');
  await expect(options(page)).toHaveCount(2);
  await expect(game(page)).toHaveAttribute('data-clef', 'treble');
  // Câu hỏi có chữ, đúng mẫu.
  await expect(page.getByTestId('nq-question')).toHaveText(/^Bé ơi, đâu là nốt (Đô|Rê|Mi)\?$/);
  // Không có chữ trên ô: không tên nốt, không A/B/C/D.
  for (const t of await visibleTileText(page)) expect(t).toBe('');
  // Mỗi ô có khuông + khoá (glyph khoá Sol U+E050) + nốt Đô / Rê / Mi (C4 D4 E4).
  for (const tile of await options(page).all()) {
    expect(Number(await tile.getAttribute('data-midi'))).toBeGreaterThanOrEqual(60);
    expect(Number(await tile.getAttribute('data-midi'))).toBeLessThanOrEqual(64);
    expect(await tile.locator('svg').innerHTML()).toContain('');
  }
  // Tên nốt chưa hiện trước khi trả lời.
  await expect(page.getByTestId('nq-answer-name')).toHaveCount(0);
  await expect(page.getByTestId('nq-explain')).toHaveCount(0);
});

test('cô gợi ý thông minh: sai lần 1 chỉ gợi ý lời (không lộ đáp án) → lần 2 khuông minh hoạ đúng khoá → lần 3 cất ô sai → rồi mới chỉ đáp án', async ({ page }) => {
  await seed(page, { mode: 'pitch', clef: 'bass', choices: 6, letters: ['C', 'D', 'E', 'F', 'G', 'A'], octaves: 1, durations: ['q'], questions: 5, autoRead: true });
  await page.goto('/?screen=note-quiz');
  await startQuiz(page);
  await expect(options(page)).toHaveCount(6);
  const answer = Number(await game(page).getAttribute('data-answer'));
  const nextWrong = async () => {
    for (let i = 0; i < 6; i++) if (i !== answer && (await options(page).nth(i).getAttribute('data-state')) === 'idle') return i;
    return -1;
  };

  // Lần 1: ô rung, cô gợi ý bằng lời; không ô nào sáng / bị cất, không minh hoạ, không tên nốt.
  const w1 = await nextWrong();
  await options(page).nth(w1).click();
  await expect(options(page).nth(w1)).toHaveAttribute('data-state', 'wrong');
  await expect(options(page).nth(w1)).toHaveClass(/animate-shake/);
  await expect(page.getByTestId('nq-teacher')).toHaveAttribute('data-mood', 'encourage');
  const hint = page.getByTestId('nq-hint');
  await expect(hint).toHaveAttribute('data-level', '1');
  await expect(hint).toHaveAttribute('data-cause', 'pitch');
  await expect(hint).toContainText(/Nốt (Đô|Rê|Mi|Fa|Sol|La) nằm (trên một dòng kẻ|trong một khe|phía (dưới|trên) khuông nhạc)\. Bé nhìn lại nhé!/);
  await expect(page.getByTestId('nq-hint-staff')).toHaveCount(0);
  await expect(options(page).locator('[data-state="reveal"], [data-state="removed"]')).toHaveCount(0);
  await expect(game(page).locator('[data-testid="nq-option"][data-state="reveal"], [data-testid="nq-option"][data-state="removed"]')).toHaveCount(0);
  await expect(page.getByTestId('nq-answer-name')).toHaveCount(0);

  // Lần 2: vị trí chính xác THEO KHOÁ FA + khuông minh hoạ tô đúng bậc của nốt cần tìm.
  await options(page).nth(await nextWrong()).click();
  await expect(hint).toHaveAttribute('data-level', '2');
  await expect(hint).toContainText('Ở khoá Fa, nốt');
  const step = await options(page).nth(answer).getAttribute('data-step');
  await expect(page.getByTestId('nq-hint-staff')).toHaveAttribute('data-clef', 'bass');
  await expect(page.getByTestId('nq-hint-staff')).toHaveAttribute('data-step', step!);
  await expect(game(page).locator('[data-testid="nq-option"][data-state="reveal"]')).toHaveCount(0);

  // Lần 3: cô cất bớt ô sai, chừa lại ít nhất một ô sai để bé tự chọn.
  await options(page).nth(await nextWrong()).click();
  await expect(hint).toHaveAttribute('data-level', '3');
  await expect(hint).toContainText('Cô cất bớt mấy hình chưa đúng');
  const removed = game(page).locator('[data-testid="nq-option"][data-state="removed"]');
  expect(await removed.count()).toBeGreaterThan(0);
  expect(await game(page).locator('[data-testid="nq-option"][data-state="idle"]').count()).toBeGreaterThanOrEqual(2);
  await expect(game(page).locator('[data-testid="nq-option"][data-state="reveal"]')).toHaveCount(0);

  // Tiếp tục sai tới khi cô chỉ đáp án → ô đúng sáng.
  while ((await hint.getAttribute('data-level')) !== '4') await options(page).nth(await nextWrong()).click();
  await expect(options(page).nth(answer)).toHaveAttribute('data-state', 'reveal');
  await expect(hint).toContainText('Cô chỉ cho bé nhé');

  // Chạm ở GÓC ô (không phải giữa hình) vẫn chọn được.
  const box = (await options(page).nth(answer).boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height - 8);
  await expect(game(page)).toHaveAttribute('data-status', 'answered');
  await expect(options(page).nth(answer)).toHaveAttribute('data-state', 'correct');
  await expect(page.getByTestId('nq-teacher')).toHaveAttribute('data-mood', 'happy');
  await expect(page.getByTestId('nq-question')).toHaveText(/^Giỏi quá! Đây đúng là nốt (Đô|Rê|Mi|Fa|Sol|La)!$/);
  await expect(page.getByTestId('nq-answer-name')).toHaveText(/✓ (Đô|Rê|Mi|Fa|Sol|La)/);
  await expect(page.getByTestId('nq-explain')).toContainText('Khoá Fa');
  // Cô đã chỉ đáp án → thêm một câu tương tự (5 → 6 câu).
  await page.getByTestId('nq-next').click();
  await expect(game(page)).toHaveAttribute('data-index', '1');
  await expect(page.getByTestId('nq-progress')).toHaveText('Câu 2/6');
  await expect(page.getByTestId('nq-hint')).toHaveCount(0);
});

test('Kết hợp: đúng tên sai trường độ → cô khen phần đúng, hướng dẫn phần sai + hình mẫu trường độ', async ({ page }) => {
  await seed(page, { mode: 'both', clef: 'treble', choices: 4, letters: ['C', 'D', 'E'], octaves: 1, durations: ['w', 'h', 'q'], questions: 5, autoRead: false, maxSupport: true });
  await page.goto('/?screen=note-quiz');
  await startQuiz(page);
  const answer = Number(await game(page).getAttribute('data-answer'));
  const target = { midi: await options(page).nth(answer).getAttribute('data-midi'), duration: await options(page).nth(answer).getAttribute('data-duration') };
  // Ô cùng tên khác trường độ (luôn có khi đủ 4 ô).
  let sameLetter = -1;
  for (let i = 0; i < 4; i++) {
    const o = options(page).nth(i);
    if ((await o.getAttribute('data-midi')) === target.midi && (await o.getAttribute('data-duration')) !== target.duration) sameLetter = i;
  }
  expect(sameLetter).toBeGreaterThanOrEqual(0);
  await options(page).nth(sameLetter).click();
  const hint = page.getByTestId('nq-hint');
  await expect(hint).toHaveAttribute('data-cause', 'duration');
  await expect(hint).toContainText(/Bé tìm đúng nốt (Đô|Rê|Mi) rồi! Nhưng cô đang hỏi nốt (Đô|Rê|Mi) (Tròn|Trắng|Đen) cơ\./);
  // Hỗ trợ tối đa: minh hoạ ngay lần sai đầu — hình mẫu đúng trường độ cần tìm.
  await expect(page.getByTestId('nq-hint-sample')).toHaveAttribute('data-duration', target.duration!);
  await expect(page.getByTestId('nq-hint-sample').locator('svg')).toBeVisible();
});

test('vị trí nốt VexFlow vẽ khớp lý thuyết ở cả 4 khoá (Sol, Fa, Đô Alto, Đô Tenor) và chế độ Hỗn hợp', async ({ page }) => {
  // Glyph khoá Bravura: Sol E050, Fa E062, Đô E05C.
  const glyph = { treble: '', bass: '', alto: '', tenor: '' } as const;
  for (const clef of ['treble', 'bass', 'alto', 'tenor', 'mixed'] as const) {
    await seed(page, { mode: 'both', clef, choices: 6, letters: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], octaves: 2, durations: ['w', 'h', 'q', '8', '16'], questions: 5, autoRead: false });
    await page.goto('/?screen=note-quiz');
    await startQuiz(page);
    for (let q = 0; q < 5; q++) {
      await expect(options(page)).toHaveCount(6);
      await expect(options(page).first()).not.toHaveAttribute('data-vex-line', '');
      const shown = await game(page).getAttribute('data-clef');
      if (clef !== 'mixed') expect(shown).toBe(clef);
      for (const tile of await options(page).all()) {
        // VexFlow: dòng 1 = line 1, mỗi bậc = 0.5. staffStep: dòng 1 = 0, mỗi bậc = 1.
        const step = Number(await tile.getAttribute('data-step'));
        expect(Number(await tile.getAttribute('data-vex-line'))).toBe(1 + step / 2);
        expect(await tile.locator('svg').innerHTML()).toContain(glyph[shown as keyof typeof glyph]);
      }
      // Đúng một ô khớp: các ô là hình khác nhau.
      const keys = await options(page).evaluateAll((els) => els.map((e) => `${e.getAttribute('data-midi')}/${e.getAttribute('data-duration')}`));
      expect(new Set(keys).size).toBe(6);
      for (const t of await visibleTileText(page)) expect(t).toBe('');
      await answerCorrect(page);
      await page.getByTestId('nq-next').click();
    }
    await expect(page.getByTestId('nq-result')).toBeVisible();
  }
});

test('Trường độ: mọi ô cùng cao độ, mỗi ô một hình trường độ; câu hỏi "Bé tìm giúp cô nốt … nhé!"', async ({ page }) => {
  await seed(page, { mode: 'duration', clef: 'bass', choices: 4, letters: ['C'], octaves: 1, durations: ['w', 'h', 'q', '8'], questions: 5, autoRead: true });
  await page.goto('/?screen=note-quiz');
  await startQuiz(page);
  await expect(page.getByTestId('nq-question')).toHaveText(/^Bé tìm giúp cô nốt (Tròn|Trắng|Đen|Móc đơn) nhé!$/);
  const midis = await options(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-midi')));
  expect(new Set(midis).size).toBe(1);
  const durations = await options(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-duration')));
  expect(new Set(durations).size).toBe(4);
});

test('nghe lại câu hỏi nhiều lần (giọng thu sẵn), chơi hết lượt → tổng kết + chơi lại', async ({ page }) => {
  await seed(page, { mode: 'pitch', clef: 'treble', choices: 2, letters: ['C', 'D', 'E'], octaves: 1, durations: ['q'], questions: 5, autoRead: true });
  // Đếm số lần phát file giọng thu sẵn (nghe lại cùng câu → trình duyệt lấy mp3 từ cache, không có request mới).
  await page.addInitScript(() => {
    const w = window as unknown as { __voicePlays: string[] };
    w.__voicePlays = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (/\/voice\/vi\/[0-9a-f]+\.mp3$/.test(this.src)) w.__voicePlays.push(this.src);
      return play.call(this);
    };
  });
  const plays = () => page.evaluate(() => (window as unknown as { __voicePlays: string[] }).__voicePlays.length);
  await page.goto('/?screen=note-quiz');
  await startQuiz(page);
  // Cô tự đọc câu hỏi (giọng thu sẵn).
  await expect.poll(plays).toBeGreaterThan(0);
  const before = await plays();
  await page.getByTestId('nq-replay').click();
  await expect.poll(plays).toBeGreaterThan(before);
  const again = await plays();
  await page.getByTestId('nq-replay').click();
  await expect.poll(plays).toBeGreaterThan(again);

  for (let i = 0; i < 5; i++) {
    await answerCorrect(page);
    await page.getByTestId('nq-next').click();
  }
  const result = page.getByTestId('nq-result');
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-stars', '3');
  await expect(result).toContainText('5/5');
  await page.getByTestId('nq-again').click();
  await expect(game(page)).toHaveAttribute('data-status', 'ready');
});

test('cài đặt mở trên màn chơi; đổi khoá → lượt mới; lưu theo hồ sơ', async ({ page }) => {
  await seed(page);
  await page.goto('/?screen=note-quiz');
  await startQuiz(page);
  await page.getByTestId('nq-settings').click();
  await expect(page.getByTestId('nq-settings-panel')).toBeVisible();
  await page.getByTestId('nq-clef-alto').click();
  await page.getByRole('button', { name: '4', exact: true }).click();
  await page.getByTestId('nq-settings-done').click();
  await expect(game(page)).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('nq-subtitle')).toHaveText('Cao độ · Khoá Đô Alto · 4 đáp án');
  await startQuiz(page);
  await expect(options(page)).toHaveCount(4);
  await expect(game(page)).toHaveAttribute('data-clef', 'alto');
  await page.reload();
  await expect(page.getByTestId('nq-subtitle')).toHaveText('Cao độ · Khoá Đô Alto · 4 đáp án');
  // Mặc định bé 4 tuổi.
  await page.getByTestId('nq-ready-settings').click();
  await page.getByTestId('nq-defaults').click();
  await page.getByTestId('nq-settings-done').click();
  await expect(page.getByTestId('nq-subtitle')).toHaveText('Cao độ · Khoá Sol · 2 đáp án');
});
