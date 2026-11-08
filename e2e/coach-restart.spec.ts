import { expect, test, type Page } from '@playwright/test';

/**
 * AI Piano Coach — chơi lại từ đầu câu (M2-T11), Chromium + đàn MIDI giả (KHÔNG phải iPad / đàn thật): đánh sai rồi dừng, quay về
 * đầu ô 2 chơi tiếp tới hết → đoạn chơi lại không bị tính nốt thừa, nốt sai lần đầu vẫn tính, báo một lần "dừng lại rồi chơi lại".
 */

async function setup(page: Page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('coach-init')) {
      sessionStorage.setItem('coach-init', '1');
      localStorage.setItem('vietpiano.coach.settings.v1', JSON.stringify({ countIn: false, metronome: false, tempoPercent: 100, lastLessonId: 'scale-c-major', input: 'midi' }));
      const key = 'vietpiano.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...s, midiEnabled: true }));
    }
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = { send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }) };
  });
}

/** Lên lịch phím ngay trong trang theo performance.now() (mốc chính xác, không qua độ trễ của Playwright). */
async function scheduleMidi(page: Page, notes: { at: number; midi: number; len: number }[]) {
  await page.evaluate((list) => {
    const midi = (window as unknown as { __midi: { send(d: number[]): void } }).__midi;
    for (const n of list)
      setTimeout(
        () => {
          midi.send([0x90, n.midi, 80]);
          setTimeout(() => midi.send([0x80, n.midi, 0]), n.len);
        },
        Math.max(0, n.at - performance.now()),
      );
  }, notes);
}

test('đánh sai, dừng, chơi lại từ đầu ô 2: không nốt thừa, một lần chơi lại, chi tiết ô 2 nói rõ', async ({ page }) => {
  test.setTimeout(60_000);
  await setup(page);
  await page.goto('/?screen=coach');
  await expect(page.getByTestId('coach-input')).toContainText('Đàn MIDI');
  await page.getByTestId('coach-start').click();
  await expect(page.getByTestId('coach-recording')).toBeVisible();

  const step = 400;
  const first = [60, 62, 64, 65, 67, 69, 71, 74]; // … B4 rồi đánh nhầm D5 ở chỗ C5
  const again = [67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60]; // chơi lại từ G4 (đầu ô 2) tới hết
  const t0 = (await page.evaluate(() => performance.now())) + 300;
  await scheduleMidi(page, [
    ...first.map((midi, i) => ({ at: t0 + i * step, midi, len: 330 })),
    ...again.map((midi, i) => ({ at: t0 + first.length * step + 1200 + i * step, midi, len: 330 })),
  ]);
  await expect(page.getByTestId('coach-rec-notes')).toHaveText('20 nốt đã ghi', { timeout: 20_000 });
  await page.waitForTimeout(400);
  await page.getByTestId('coach-stop').click();

  await expect(page.getByTestId('coach-results')).toBeVisible();
  const value = (id: string) => page.getByTestId(id).locator('div').nth(1);
  await expect(value('coach-count-correct')).toHaveText('15/16');
  await expect(value('coach-count-wrong')).toHaveText('1');
  await expect(value('coach-count-extra')).toHaveText('0');
  await expect(page.getByTestId('coach-restarts')).toContainText('1 lần');
  await expect(page.getByTestId('coach-restarts')).toContainText('4 nốt chơi lại');
  // Không có dấu "+" nốt thừa cho đoạn chơi lại; chú giải có ↺.
  const score = page.getByTestId('coach-score');
  await expect(score.locator('.coach-mark.is-extra')).toHaveCount(0);
  await expect(page.getByLabel('Chú giải')).toContainText('dừng, chơi lại');
  // Chạm nốt sai (chỗ dừng) → chi tiết có cả lỗi sai nốt lẫn lỗi chơi lại.
  await score.locator('.score-note.coach-err').click();
  await expect(page.getByTestId('coach-detail-issues')).toContainText('cần C5, bạn đánh D5');
  await expect(page.getByTestId('coach-detail-issues')).toContainText('rồi dừng lại, chơi lại từ đầu ô 2');
  // Nhận xét theo quy tắc nêu việc chơi lại.
  await expect(page.getByTestId('coach-priorities')).toContainText('Dừng lại rồi chơi lại');
});
