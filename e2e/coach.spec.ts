import { expect, test, type Page } from '@playwright/test';

/**
 * AI Piano Coach (Chromium, KHÔNG phải iPad / đàn thật): ghi → chấm → tô khuông → chi tiết → phát lại → nhận xét → lịch sử.
 * Đàn MIDI giả bằng Web MIDI giả (như midi-nav.spec), Ollama giả bằng page.route.
 */

const COACH = { countIn: false, metronome: false, tempoPercent: 100, lastLessonId: 'scale-c-major' };

async function coachSettings(page: Page, patch: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([coach, dev]) => {
      if (sessionStorage.getItem('coach-init')) return;
      sessionStorage.setItem('coach-init', '1');
      localStorage.setItem('vietpiano.coach.settings.v1', JSON.stringify(coach));
      const key = 'vietpiano.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...s, ...dev }));
    },
    [{ ...COACH, ...patch }, settings] as const,
  );
}

/** Web MIDI giả: `window.__midi.send([...])`. */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = { send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }) };
  });
}
const midiSend = (page: Page, data: number[]) => page.evaluate((d) => (window as unknown as { __midi: { send(d: number[]): void } }).__midi.send(d), data);

/** Gam Đô trưởng lên xuống bằng bàn phím máy tính; `wrongAt` = chỉ số phím đánh sai (thay bằng phím đen). */
async function playScaleKeys(page: Page, gapMs = 260, wrongAt = -1) {
  const keys = 'asdfghjkkjhgfdsa'.split('');
  for (const [i, k] of keys.entries()) {
    const key = i === wrongAt ? 'w' : k;
    await page.keyboard.down(key);
    await page.waitForTimeout(gapMs * 0.8);
    await page.keyboard.up(key);
    await page.waitForTimeout(gapMs * 0.2);
  }
}

test('ghi bằng bàn phím máy tính → chấm, tô khuông, chi tiết nốt, phát lại, nhận xét theo quy tắc, lịch sử', async ({ page }) => {
  test.setTimeout(60_000);
  await coachSettings(page);
  await page.goto('/');
  await page.getByTestId('open-coach').click();
  await expect(page.getByTestId('coach-setup')).toBeVisible();
  await expect(page.getByTestId('coach-input')).toContainText('Bàn phím ảo');
  // Bàn phím ảo không có lực gõ / pedal → nói rõ không chấm.
  await expect(page.getByTestId('coach-can-Lực đánh')).toHaveAttribute('data-ok', 'false');
  // AI tắt (mặc định) → chip nói rõ, không gọi mạng.
  await expect(page.getByTestId('coach-ai-link')).toHaveAttribute('data-state', 'off');
  await page.getByTestId('coach-start').click();
  await expect(page.getByTestId('coach-recording')).toBeVisible();
  await expect(page.getByTestId('coach-ai-link')).toContainText('AI cục bộ: tắt');
  await playScaleKeys(page, 260, 5);
  await expect(page.getByTestId('coach-rec-notes')).toHaveText('16 nốt đã ghi');
  await page.getByTestId('coach-stop').click();

  await expect(page.getByTestId('coach-results')).toBeVisible();
  await expect(page.getByTestId('coach-count-correct')).toContainText('15/16');
  await expect(page.getByTestId('coach-count-wrong')).toContainText('1');
  await expect(page.getByTestId('coach-criterion-pedal')).toHaveAttribute('data-value', 'null');
  await expect(page.getByTestId('coach-criterion-dynamics')).toHaveAttribute('data-value', 'null');
  // Tô khuông: có nốt đúng (xanh) và đúng một nốt sai (đỏ) kèm ký hiệu.
  const score = page.getByTestId('coach-score');
  await expect(score.locator('.score-note.coach-err')).toHaveCount(1);
  expect(await score.locator('.score-note.coach-ok').count()).toBeGreaterThan(10);
  await expect(score.locator('.coach-mark.is-err')).toHaveCount(1);
  // Chạm nốt sai → chi tiết: nốt chuẩn / nốt đánh / thời điểm.
  await score.locator('.score-note.coach-err').click();
  await expect(page.getByTestId('coach-detail')).toContainText('Sai nốt');
  await expect(page.getByTestId('coach-detail-issues')).toContainText('Ô 2');
  // Phát lại bản của bạn (AudioContext có sẵn trên Chromium).
  await page.getByTestId('coach-play-mine').click();
  await expect(page.getByTestId('coach-replay')).toContainText('không phải âm thanh gốc');
  await page.getByTestId('coach-play-mine').click();
  // Nhận xét theo quy tắc (AI tắt) + gợi ý luyện.
  await expect(page.getByTestId('coach-feedback')).toHaveAttribute('data-source', 'rules');
  await expect(page.getByTestId('coach-feedback-summary')).toContainText('/100');
  await expect(page.getByTestId('coach-priorities')).toContainText('Sai nốt');

  // Lịch sử: có lần vừa chấm, mở lại được.
  await page.getByTestId('coach-open-history').click();
  await expect(page.getByTestId('coach-history-item')).toHaveCount(1);
  await page.getByTestId('coach-history-open').click();
  await expect(page.getByTestId('coach-results')).toBeVisible();
  await expect(page.getByTestId('coach-count-correct')).toContainText('15/16');
});

test('đàn MIDI giả: velocity + pedal được ghi, kiểm tra pedal, bài "không dùng pedal" chấm đạp thừa', async ({ page }) => {
  test.setTimeout(60_000);
  await fakeMidi(page);
  await coachSettings(page, { input: 'midi', pedalRule: 'none-expected' }, { midiEnabled: true });
  await page.goto('/?screen=coach');
  await expect(page.getByTestId('coach-input')).toContainText('Đàn MIDI');
  await expect(page.getByTestId('coach-pedal-check')).toHaveAttribute('data-ok', 'false');
  await midiSend(page, [0xb0, 64, 127]);
  await midiSend(page, [0xb0, 64, 0]);
  await expect(page.getByTestId('coach-pedal-check')).toHaveAttribute('data-ok', 'true');
  await page.getByTestId('coach-start').click();
  await expect(page.getByTestId('coach-recording')).toBeVisible();
  const scale = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60];
  for (const [i, m] of scale.entries()) {
    if (i === 4) await midiSend(page, [0xb0, 64, 127]); // đạp pedal ở bài không dùng pedal
    await midiSend(page, [0x90, m, 60 + (i % 2) * 40]);
    await page.waitForTimeout(220);
    await midiSend(page, [0x80, m, 0]);
    await page.waitForTimeout(60);
    if (i === 12) await midiSend(page, [0xb0, 64, 0]);
  }
  await page.getByTestId('coach-stop').click();
  await expect(page.getByTestId('coach-results')).toBeVisible();
  await expect(page.getByTestId('coach-count-correct')).toContainText('16/16');
  // Có velocity → chấm lực đánh (đánh mạnh nhẹ xen kẽ → không đều); pedal thừa bị trừ + có ký hiệu P.
  await expect(page.getByTestId('coach-criterion-dynamics')).not.toHaveAttribute('data-value', 'null');
  await expect(page.getByTestId('coach-criterion-pedal')).toHaveAttribute('data-value', '0');
  await expect(page.getByTestId('coach-pedal-issues')).toContainText('pedal');
  await expect(page.getByTestId('coach-score').locator('.coach-mark.is-pedal')).toHaveCount(1);
});

test('app tắt giữa lúc ghi → mở lại thấy phiên dở dang và chấm được phần đã ghi', async ({ page }) => {
  test.setTimeout(60_000);
  await coachSettings(page);
  await page.goto('/?screen=coach');
  await page.getByTestId('coach-start').click();
  for (const k of 'asdfgh') {
    await page.keyboard.press(k);
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(3600); // lưu nháp mỗi 3 giây
  await page.reload();
  await page.waitForTimeout(4200); // quá ngưỡng "dở dang"
  await page.reload();
  await expect(page.getByTestId('coach-interrupted')).toBeVisible();
  await page.getByTestId('coach-recover').click();
  await expect(page.getByTestId('coach-results')).toBeVisible();
  await expect(page.getByTestId('coach-count-correct')).toContainText('6/16');
  await expect(page.getByTestId('coach-count-missing')).toContainText('10');
});

test('AI cục bộ (Ollama giả): JSON có cấu trúc, câu bịa ô nhịp bị lọc, dữ liệu gửi không có log MIDI', async ({ page }) => {
  test.setTimeout(60_000);
  const bodies: string[] = [];
  await page.route('**/api/tags', (route) => route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:12b' }] }) }));
  await page.route('**/api/chat', (route) => {
    const body = route.request().postData() ?? '';
    bodies.push(body);
    const payload = JSON.parse(JSON.parse(body).messages[1].content.split('\n').slice(1).join('\n')) as { issues: { ref: string }[]; score: { total: number } };
    const answer = {
      summary: `Bạn đạt ${payload.score.total}/100. Ô 9 bạn đánh sai rất nhiều.`,
      strengths: ['Nhịp khá đều.'],
      priorities: [{ issueRef: payload.issues[0]?.ref ?? 'I1', title: 'Sai nốt', explanation: 'Có một nốt sai.', fix: 'Chơi chậm và đọc tên nốt trước.' }],
      practiceSection: null,
      practiceTempo: null,
      nextExercise: null,
      comparison: null,
    };
    route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ message: { content: JSON.stringify(answer) } }) });
  });
  await coachSettings(page, {}, { aiCoachEnabled: true });
  await page.goto('/?screen=coach');
  // Cấu hình AI trong Coach: kiểm tra kết nối + model đã tải.
  await page.getByTestId('coach-ai-check').click();
  await expect(page.getByTestId('coach-ai-status')).toContainText('Kết nối tốt');
  await expect(page.getByTestId('coach-ai-link')).toHaveAttribute('data-state', 'connected');
  await page.getByTestId('coach-ai-timeout').selectOption('30');
  await page.getByTestId('coach-start').click();
  // Trong lúc đánh: chip trạng thái AI cục bộ trên thanh ghi.
  const link = page.getByTestId('coach-recording').getByTestId('coach-ai-link');
  await expect(link).toHaveAttribute('data-state', 'connected');
  await expect(link).toContainText('AI cục bộ: đã kết nối');
  await expect(link).toContainText('gemma4:12b');
  await playScaleKeys(page, 220, 5);
  await page.getByTestId('coach-stop').click();
  const fb = page.getByTestId('coach-feedback');
  await expect(fb).toHaveAttribute('data-source', 'ai');
  await expect(page.getByTestId('coach-feedback-summary')).toHaveText(/^Bạn đạt \d+\/100\.$/);
  await expect(page.getByTestId('coach-feedback-status')).toContainText('đã lọc câu không khớp số liệu');
  const sent = JSON.parse(bodies[0]) as { format: unknown; stream: boolean; messages: { content: string }[] };
  expect(typeof sent.format).toBe('object');
  expect(sent.stream).toBe(false);
  expect(sent.messages[1].content).not.toContain('onMs');
  expect(sent.messages[1].content).not.toContain('"events"');
});

test('trạng thái AI cục bộ trong lúc đánh: chưa kết nối → bật Ollama → đã kết nối → tắt → mất kết nối; ghi không bị ảnh hưởng', async ({ page }) => {
  test.setTimeout(60_000);
  let up = false;
  const tagCalls: string[] = [];
  await page.route('**/api/tags', (route) => {
    tagCalls.push(route.request().method());
    return up
      ? route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ models: [{ name: 'gemma4:12b' }] }) })
      : route.abort('connectionrefused');
  });
  const chats: string[] = [];
  await page.route('**/api/chat', (route) => {
    chats.push(route.request().postData() ?? '');
    return route.abort('connectionrefused');
  });
  await coachSettings(page, {}, { aiCoachEnabled: true });
  await page.goto('/?screen=coach');
  // Mở màn → tự kiểm tra (không cần bấm).
  await expect(page.getByTestId('coach-ai-link')).toHaveAttribute('data-state', 'offline');
  await expect(page.getByTestId('coach-ai-status')).toContainText('Không kết nối được Ollama');
  await page.getByTestId('coach-start').click();
  const link = page.getByTestId('coach-recording').getByTestId('coach-ai-link');
  await expect(link).toContainText('AI cục bộ: chưa kết nối');
  await expect(link).toContainText('nhận xét theo quy tắc');
  // Chữ trạng thái đổi độ dài không được làm khuông / bàn phím nhảy trong lúc đánh.
  const keyboardY = async () => (await page.getByTestId('coach-keyboard').boundingBox())?.y;
  const y0 = await keyboardY();
  for (const k of 'asdf') await page.keyboard.press(k);
  // Ollama chạy lên → bấm chip kiểm tra lại ngay.
  up = true;
  await link.click();
  await expect(link).toHaveAttribute('data-state', 'connected');
  await expect(link).toContainText('AI cục bộ: đã kết nối');
  expect(await keyboardY()).toBe(y0);
  for (const k of 'ghjk') await page.keyboard.press(k);
  // Ollama tắt giữa chừng.
  up = false;
  await link.click();
  await expect(link).toHaveAttribute('data-state', 'offline');
  await expect(link).toContainText('AI cục bộ: mất kết nối');
  expect(await keyboardY()).toBe(y0);
  for (const k of 'kjhgfdsa') await page.keyboard.press(k);
  await expect(page.getByTestId('coach-rec-notes')).toHaveText('16 nốt đã ghi');
  // Kiểm tra kết nối chỉ là GET danh sách model; trong lúc đánh không gọi /api/chat.
  expect(new Set(tagCalls)).toEqual(new Set(['GET']));
  expect(chats).toHaveLength(0);
  await page.getByTestId('coach-stop').click();
  await expect(page.getByTestId('coach-total')).toBeVisible();
  await expect(page.getByTestId('coach-feedback')).toHaveAttribute('data-source', 'rules');
  await expect(page.getByTestId('coach-feedback-summary')).not.toBeEmpty();
});

test('kế hoạch luyện 7 bước: lỗi dồn ở ô 3 → luyện đoạn đó chậm → đạt thì sang bước 2', async ({ page }) => {
  test.setTimeout(60_000);
  await coachSettings(page);
  await page.goto('/?screen=coach');
  await page.getByTestId('coach-start').click();
  // Ô 3 (C5 B4 A4 G4) đánh sai hai nốt: B4 → A#4 (u), A4 → G#4 (y).
  for (const k of 'asdfghjkkuygfdsa') {
    await page.keyboard.down(k);
    await page.waitForTimeout(200);
    await page.keyboard.up(k);
    await page.waitForTimeout(60);
  }
  await page.getByTestId('coach-stop').click();
  const rec = page.getByTestId('coach-rec-section');
  await expect(rec).toBeVisible();
  await rec.getByTestId('coach-rec-plan').click();
  const step = page.getByTestId('coach-plan-step');
  await expect(step).toContainText('Bước 1/7');
  const m = /ô (\d+)–(\d+), ♩=(\d+)/.exec((await step.textContent()) ?? '')!;
  const [from, to] = [Number(m[1]), Number(m[2])];
  expect(from).toBeLessThanOrEqual(3);
  expect(to).toBeGreaterThanOrEqual(3);
  expect(Number(m[3])).toBe(43); // 60% của ♩=72
  await expect(page.getByTestId('coach-bpm')).toContainText('♩=43');
  // Chơi đúng đoạn được giao.
  const measures = ['asdf', 'ghjk', 'kjhg', 'fdsa'];
  await page.getByTestId('coach-start').click();
  for (const k of measures.slice(from - 1, to).join('')) {
    await page.keyboard.down(k);
    await page.waitForTimeout(200);
    await page.keyboard.up(k);
    await page.waitForTimeout(60);
  }
  await page.getByTestId('coach-stop').click();
  await expect(page.getByTestId('coach-results')).toBeVisible();
  const steps = page.getByTestId('coach-plan-steps').locator('li');
  await expect(steps.nth(0)).toHaveAttribute('data-status', 'done');
  await expect(steps.nth(1)).toHaveAttribute('data-status', 'active');
  await expect(page.getByTestId('coach-plan-next')).toContainText('Chơi chậm cho chắc');
});

test('lịch sử theo hồ sơ: xoá toàn bộ cần bấm xác nhận', async ({ page }) => {
  test.setTimeout(60_000);
  await coachSettings(page);
  await page.goto('/?screen=coach');
  await page.getByTestId('coach-start').click();
  await playScaleKeys(page, 200);
  await page.getByTestId('coach-stop').click();
  await expect(page.getByTestId('coach-results')).toBeVisible();
  await page.getByTestId('coach-open-history').click();
  await expect(page.getByTestId('coach-history-item')).toHaveCount(1);
  await expect(page.getByTestId('coach-skill')).toContainText('Chính xác nốt: 100%');
  await page.getByTestId('coach-delete-all').click();
  await expect(page.getByTestId('coach-history-item')).toHaveCount(1);
  await page.getByTestId('coach-delete-all').click();
  await expect(page.getByTestId('coach-history-item')).toHaveCount(0);
});
