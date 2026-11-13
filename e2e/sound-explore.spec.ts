import { expect, test, type Page } from '@playwright/test';

/**
 * Bài "Khám phá âm thanh — Cao độ và Trường độ" (docs/sound-explore.md).
 * Phần lớn test tắt giọng cô (đỡ chờ đọc xong mới phát ví dụ); một test giữ giọng để kiểm tra lời dặn.
 */

async function voiceOff(page: Page) {
  await page.addInitScript(() => {
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, voiceTeacher: 'off' }));
  });
}

/** Nhấn giữ phím trên bàn phím ảo của bài trong `ms`. */
async function hold(page: Page, midi: number, ms: number) {
  const key = page.locator(`[data-testid="se-keyboard"] [data-midi="${midi}"]`);
  await key.dispatchEvent('pointerdown');
  await page.waitForTimeout(ms);
  await key.dispatchEvent('pointerup');
}

async function openParent(page: Page) {
  await page.getByTestId('se-parent-open').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('se-parent')).toBeVisible();
}

test('mở từ "Làm quen từng nốt": 6 hoạt động, cô giáo nói lời dặn, phần làm quen nghe lại / bỏ qua được', async ({ page }) => {
  await page.goto('/?screen=supplement');
  await page.getByTestId('open-sound-explore').click();
  await expect(page.getByTestId('sound-explore')).toHaveAttribute('data-view', 'home');
  for (const id of ['intro', 'rocket', 'duration', 'garden', 'free', 'adventure']) await expect(page.getByTestId(`se-open-${id}`)).toBeVisible();
  await expect(page.getByTestId('voice-caption')).toContainText('Con chọn một trò chơi nhé!');

  await page.getByTestId('se-open-intro').click();
  await expect(page.getByTestId('se-intro')).toHaveAttribute('data-page', '0');
  await expect(page.getByTestId('voice-caption')).toContainText('tiếng đàn bay lên cao');
  await page.getByTestId('se-next').click();
  await expect(page.getByTestId('se-intro')).toHaveAttribute('data-page', '1');
  await expect(page.getByTestId('voice-caption')).toContainText('âm thanh ngắn');
  await expect(page.getByTestId('se-replay')).toBeVisible();
  await page.getByTestId('se-skip').click();
  await expect(page.getByTestId('sound-explore')).toHaveAttribute('data-view', 'home');
});

test('Tên lửa: nghe chọn cao / thấp (chọn lại không giới hạn), sao được lưu và còn sau khi tải lại', async ({ page }) => {
  await voiceOff(page);
  await page.goto('/?screen=sound-explore');
  await page.getByTestId('se-open-rocket').click();
  const quiz = page.getByTestId('se-listen-pitch');
  const answer = (await quiz.getAttribute('data-answer'))!;
  const wrong = answer === 'high' ? 'low' : 'high';
  await page.getByTestId(`se-answer-${wrong}`).click();
  await expect(page.getByTestId('se-star')).toHaveCount(0);
  await page.getByTestId(`se-answer-${answer}`).click();
  await expect(page.getByTestId('se-star')).toBeVisible();
  await page.getByTestId('se-next').click();
  await expect(page.getByTestId('se-star')).toHaveCount(0);

  // Chế độ đánh phím: tên lửa lên cao theo SỐ NỐT.
  await page.getByTestId('se-mode-play').click();
  await hold(page, 84, 200);
  await expect(page.getByTestId('se-rocket-free')).toHaveAttribute('data-height', /^0\.(8|9)/);
  await hold(page, 48, 200);
  await expect(page.getByTestId('se-rocket-free')).toHaveAttribute('data-height', /^0\.[12]/);

  await page.reload();
  await expect(page.getByTestId('se-open-rocket')).toContainText('⭐ 1');
});

test('Thỏ và Ốc sên: nhấn ngắn → thỏ nhảy, giữ lâu → ốc sên bò, vùng giữa chỉ mời thử lại', async ({ page }) => {
  await voiceOff(page);
  await page.goto('/?screen=sound-explore');
  await page.getByTestId('se-open-duration').click();
  await expect(page.getByTestId('se-hold')).toHaveAttribute('data-target', 'free');
  await hold(page, 60, 300);
  await expect(page.getByTestId('se-rabbit')).toHaveAttribute('data-hops', '1');
  await hold(page, 60, 1800);
  await expect(page.getByTestId('se-snail')).not.toHaveAttribute('data-x', '0');

  // Thử thách "ngắn như thỏ": vùng giữa (1 s) không tính, nhấn ngắn → đạt.
  await page.getByTestId('se-next').click();
  await expect(page.getByTestId('se-hold')).toHaveAttribute('data-target', 'short');
  await hold(page, 60, 1000);
  await expect(page.getByTestId('se-star')).toHaveCount(0);
  await hold(page, 60, 300);
  await expect(page.getByTestId('se-star')).toBeVisible();

  // Chế độ nghe: chọn tiếng dài / ngắn.
  await page.getByTestId('se-mode-listen').click();
  const q = page.getByTestId('se-listen-duration');
  await page.getByTestId(`se-answer-${await q.getAttribute('data-answer')}`).click();
  await expect(page.getByTestId('se-star')).toBeVisible();
});

test('Khu vườn với đàn MIDI: pedal không làm nhấn ngắn thành dài, note-on velocity 0 = note-off, nhận xét từng thành phần', async ({ page }) => {
  await voiceOff(page);
  await page.addInitScript(() => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = { send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }) };
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, midiEnabled: true }));
  });
  const send = (d: number[]) => page.evaluate((x) => (window as unknown as { __midi: { send(d: number[]): void } }).__midi.send(x), d);
  await page.goto('/?screen=sound-explore');
  await expect(page.getByTestId('midi-badge')).toContainText('MIDI');
  await page.getByTestId('se-open-garden').click();
  const garden = page.getByTestId('se-garden');
  await expect(garden).toBeVisible();
  const register = (await garden.getAttribute('data-register'))!;
  const duration = (await garden.getAttribute('data-duration'))!;
  const right = register === 'high' ? 79 : 50;
  const wrongKey = register === 'high' ? 50 : 79;

  // Sai vùng: phím vùng kia, độ dài đúng → chỉ gợi ý đổi phím (chưa nở hoa).
  const press = async (midi: number, ms: number, opts: { pedal?: boolean; zeroVelocityOff?: boolean } = {}) => {
    if (opts.pedal) await send([0xb0, 64, 127]);
    await send([0x90, midi, 90]);
    await page.waitForTimeout(ms);
    await send(opts.zeroVelocityOff ? [0x90, midi, 0] : [0x80, midi, 0]);
    if (opts.pedal) {
      await page.waitForTimeout(1500); // âm còn ngân do pedal — không được tính vào thời gian giữ phím
      await send([0xb0, 64, 0]);
    }
  };
  await press(wrongKey, duration === 'long' ? 1700 : 300);
  await expect(page.getByTestId('se-flower')).toHaveText('🌱');

  if (duration === 'long') {
    // Nhấn ngắn + đạp pedal (âm ngân dài) → vẫn là nhấn ngắn.
    await press(right, 300, { pedal: true });
    await expect(page.getByTestId('se-flower')).toHaveText('🌱');
    await press(right, 1700, { zeroVelocityOff: true });
  } else {
    await press(right, 300, { zeroVelocityOff: true });
  }
  await expect(page.getByTestId('se-flower')).toHaveText('🌸');
  await expect(page.getByTestId('se-star')).toBeVisible();

  // Báo cáo phụ huynh ghi nhận lần thử trên đàn MIDI.
  await page.getByTestId('se-back').click();
  await openParent(page);
  await expect(page.getByTestId('se-report-midi')).toContainText('Đánh đúng vùng cao / thấp');
});

test('Biểu diễn tự do: chọn nhân vật, ghi lại chỉ dữ liệu nốt và phát lại', async ({ page }) => {
  await voiceOff(page);
  await page.goto('/?screen=sound-explore');
  await page.getByTestId('se-open-free').click();
  await page.getByTestId('se-char-bird').click();
  await expect(page.getByTestId('se-free-flyer')).toHaveText('🐦');
  await expect(page.getByTestId('se-playback')).toBeDisabled();
  await page.getByTestId('se-record').click();
  await expect(page.getByTestId('se-recording')).toBeVisible();
  await hold(page, 60, 250);
  await hold(page, 67, 400);
  await hold(page, 72, 250);
  await page.getByTestId('se-record-stop').click();
  await expect(page.getByTestId('se-playback')).toBeEnabled();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vietpiano.sound-explore.v1') ?? '{}'));
  const rec = (Object.values(saved)[0] as { recording: { midi: number }[] }).recording;
  expect(rec.map((n) => n.midi)).toEqual([60, 67, 72]);
  expect(Object.keys(rec[0]).sort()).toEqual(['at', 'durationMs', 'midi']);
  await page.getByTestId('se-playback').click();
  await expect(page.getByTestId('se-playback')).toBeDisabled();
});

test('Phiêu lưu âm nhạc: làm hết nhiệm vụ không cần MIDI → hình dán, tổng kết; góc phụ huynh: báo cáo, AI tắt dùng quy tắc, đổi mức, đặt lại', async ({ page }) => {
  test.setTimeout(120_000);
  await voiceOff(page);
  await page.goto('/?screen=sound-explore');
  await page.getByTestId('se-open-adventure').click();
  const adv = page.getByTestId('se-adventure');
  const total = Number(await adv.getAttribute('data-total'));
  expect(total).toBe(5);
  for (let i = 0; i < total; i++) {
    await expect(adv).toHaveAttribute('data-index', String(i));
    const kind = (await adv.getAttribute('data-kind'))!;
    if (kind === 'listen-pitch') {
      await page.getByTestId(`se-answer-${await page.getByTestId('se-listen-pitch').getAttribute('data-answer')}`).click();
    } else if (kind === 'listen-duration') {
      await page.getByTestId(`se-answer-${await page.getByTestId('se-listen-duration').getAttribute('data-answer')}`).click();
    } else if (kind === 'play-register') {
      await hold(page, (await page.getByTestId('se-play-register').getAttribute('data-target')) === 'high' ? 79 : 50, 300);
    } else if (kind === 'hold') {
      await hold(page, 60, (await page.getByTestId('se-hold').getAttribute('data-target')) === 'short' ? 300 : 1800);
    } else if (kind === 'melody') {
      const up = (await page.getByTestId('se-path').getAttribute('data-direction')) === 'up';
      for (const m of up ? [60, 64, 67, 72] : [72, 67, 64, 60]) {
        if (await page.getByTestId('se-star').isVisible()) break;
        await hold(page, m, 200);
      }
    } else if (kind === 'garden') {
      const g = page.getByTestId('se-garden');
      await hold(page, (await g.getAttribute('data-register')) === 'high' ? 79 : 50, (await g.getAttribute('data-duration')) === 'long' ? 1800 : 300);
    }
    await expect(page.getByTestId('se-star')).toBeVisible();
    await page.getByTestId('se-next').click();
  }
  await expect(page.getByTestId('se-adventure-done')).toBeVisible();
  await page.getByTestId('se-adventure-finish').click();
  await expect(page.getByTestId('se-summary')).toBeVisible();
  await expect(page.getByTestId('se-stars-adventure')).toContainText('5');
  await expect(page.getByTestId('se-stickers')).toContainText('🌟');

  await page.getByTestId('se-home').click();
  await openParent(page);
  await expect(page.getByTestId('se-report-skills')).toContainText('Chưa có đủ dữ liệu');
  await expect(page.getByTestId('se-advice')).toHaveAttribute('data-by', 'rules');
  await expect(page.getByTestId('se-ask-ai')).toHaveCount(0);
  await page.getByRole('button', { name: 'Mức 2 · Làm quen' }).click();
  await page.reload();
  await expect(page.getByTestId('sound-explore')).toHaveAttribute('data-level', '2');
  await openParent(page);
  await page.getByTestId('se-reset').click();
  await page.getByTestId('se-reset-confirm').click();
  await page.getByTestId('se-parent-close').click();
  await expect(page.getByTestId('se-open-adventure')).toContainText('Mới');
  await expect(page.getByTestId('sound-explore')).toHaveAttribute('data-level', '2');
});

test('AI cục bộ bật: nhận xét hợp lệ được hiện; câu trả lời suy diễn bị loại, quay về quy tắc', async ({ page }) => {
  await voiceOff(page);
  await page.addInitScript(() => {
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, aiCoachEnabled: true, ollamaUrl: 'http://localhost:11434' }));
  });
  let reply = 'BÉ: Con nghe giỏi lắm!\nPHỤ HUYNH:\n- Cùng bé hát tiếng cao, tiếng thấp.';
  let body = '';
  await page.route('**/api/tags', (r) => r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:12b' }] }) }));
  await page.route('**/api/chat', (r) => {
    body = r.request().postData() ?? '';
    return r.fulfill({ contentType: 'application/x-ndjson', headers: { 'Access-Control-Allow-Origin': '*' }, body: `${JSON.stringify({ message: { content: reply } })}\n${JSON.stringify({ done: true })}\n` });
  });
  await page.goto('/?screen=sound-explore');
  await openParent(page);
  await page.getByTestId('se-ask-ai').click();
  await expect(page.getByTestId('se-advice')).toHaveAttribute('data-by', 'ai');
  await expect(page.getByTestId('se-advice')).toContainText('Con nghe giỏi lắm!');
  expect(body).not.toContain('"name"');
  reply = 'BÉ: Con rất thông minh!\nPHỤ HUYNH: - ...';
  await page.getByTestId('se-ask-ai').click();
  await expect(page.getByTestId('se-advice')).toHaveAttribute('data-by', 'rules');
  await expect(page.getByTestId('se-advice')).toContainText('không đạt yêu cầu');
});
