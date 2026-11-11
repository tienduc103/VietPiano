import { expect, test, type Page } from '@playwright/test';
import { referenceFromLesson } from '../src/core/coach/reference/fromLesson';
import { resolveLesson } from '../src/core/technique/lessons';

/**
 * Luyện kỹ thuật ngón tay + AI Smart Practice (Chromium, KHÔNG phải iPad / đàn thật — docs/finger-coach/status.md).
 * Đàn MIDI giả bằng Web MIDI giả (như coach.spec), chấm thật bằng Scoring Engine của Coach.
 */

async function setup(page: Page, coach: Record<string, unknown> = {}, settings: Record<string, unknown> = {}) {
  await page.addInitScript(
    ([c, dev]) => {
      if (sessionStorage.getItem('tech-init')) return;
      sessionStorage.setItem('tech-init', '1');
      localStorage.setItem('vietpiano.coach.settings.v1', JSON.stringify({ countIn: false, metronome: false, tempoPercent: 100, ...c }));
      const key = 'vietpiano.settings.v1';
      const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(key, JSON.stringify({ ...s, ...dev }));
    },
    [coach, settings] as const,
  );
}

async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = { send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }) };
  });
}

/** Chơi một bài bằng đàn MIDI giả theo đúng nhịp (lên lịch trong trang theo performance.now()); `wrong` = id nốt → phím khác. Trả về thời lượng (ms). */
async function playLesson(page: Page, lessonId: string, bpm: number, wrong: Record<string, number> = {}): Promise<number> {
  const lesson = resolveLesson(lessonId)!;
  const ref = referenceFromLesson(lesson);
  const mspb = 60_000 / bpm;
  const notes = ref.notes.map((n) => ({ at: 300 + n.onsetBeat * mspb, midi: wrong[n.id] ?? n.midi, len: Math.max(80, n.durationBeats * mspb * 0.85) }));
  await page.evaluate((list) => {
    const midi = (window as unknown as { __midi: { send(d: number[]): void } }).__midi;
    const t0 = performance.now();
    for (const n of list)
      setTimeout(() => {
        midi.send([0x90, n.midi, 80]);
        setTimeout(() => midi.send([0x80, n.midi, 0]), n.len);
      }, Math.max(0, t0 + n.at - performance.now()));
  }, notes);
  return 300 + ref.totalBeats * mspb + 400;
}

async function bpmShown(page: Page): Promise<number> {
  return Number(/♩=(\d+)/.exec((await page.getByTestId('coach-bpm').textContent()) ?? '')![1]);
}

async function record(page: Page, lessonId: string, wrong: Record<string, number> = {}) {
  const bpm = await bpmShown(page);
  await page.getByTestId('coach-start').click();
  await expect(page.getByTestId('coach-recording')).toBeVisible();
  const ms = await playLesson(page, lessonId, bpm, wrong);
  await page.waitForTimeout(ms);
  await page.getByTestId('coach-stop').click();
  await expect(page.getByTestId('coach-results')).toBeVisible();
}

test('màn Luyện kỹ thuật: lối vào từ Giáo trình, bài hôm nay (theo luật), giáo trình 5 cấp, mở bài trong Coach đúng tempo, quay lại', async ({ page }) => {
  test.setTimeout(60_000);
  await setup(page);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('open-technique').click();
  await expect(page.getByTestId('technique-screen')).toBeVisible();
  // Hôm nay: người mới → khởi động + bài học tiếp, lý do theo quy tắc (AI tắt mặc định).
  const items = page.getByTestId('technique-today-item');
  await expect(items.first()).toBeVisible();
  expect(await items.count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('technique-today')).toHaveAttribute('data-source', 'rules');
  await expect(items.first()).toContainText('Khởi động');
  const firstTitle = (await items.first().locator('h3').textContent())!;
  // "Đổi bài" → bài khác.
  await items.first().getByTestId('technique-today-swap').click();
  await expect(items.first().locator('h3')).not.toHaveText(firstTitle);

  // Giáo trình: cấp 3, mở chuỗi 8 nốt → khuông có số ngón, nghe mẫu, luyện trong Coach.
  await page.getByTestId('technique-tab-library').click();
  await page.getByTestId('technique-level-3').click();
  const ex = page.locator('[data-testid="technique-exercise"][data-id="tech-l3-run8-updown-rh"]');
  await ex.locator('button').first().click();
  const detail = ex.getByTestId('technique-detail');
  await expect(detail).toContainText(/luồn ngón cái/i);
  await expect(detail.locator('svg').first()).toBeVisible();
  await detail.getByTestId('technique-listen').click();
  await detail.getByTestId('technique-practice').click();
  await expect(page.getByTestId('coach-setup')).toBeVisible();
  await expect(page.getByTestId('coach-lesson')).toHaveValue('tech-l3-run8-updown-rh');
  await expect(page.getByTestId('coach-bpm')).toContainText('♩=60');
  // Chưa có lượt nào → gợi ý tempo thích ứng có lý do, không tự đè tempo đã chọn.
  await expect(page.getByTestId('coach-adaptive-tempo')).toContainText('Chưa có lượt nào');
  await page.getByRole('button', { name: 'Quay lại' }).or(page.getByRole('button', { name: 'Về trang chủ' })).first().click();
  await expect(page.getByTestId('technique-screen')).toBeVisible();

  // Đoạn khó: chưa có dữ liệu → không hiện lỗi giả.
  await page.getByTestId('technique-tab-passages').click();
  await expect(page.getByTestId('technique-no-passages')).toBeVisible();
  // Tiến bộ: chưa đo → "Chưa đo", tỉ lệ hoàn thành 0.
  await page.getByTestId('technique-tab-progress').click();
  await expect(page.getByTestId('progress-completion')).toContainText('0/');
  await expect(page.getByTestId('progress-skills')).toContainText('Chưa đo');
});

test('Smart Practice trên bài hát (Happy Birthday hai tay, đàn MIDI giả): 1 lượt sai chưa kết luận → 2 lượt sai thấy đoạn khó → bài bổ trợ → luyện → quay lại bài gốc', async ({ page }) => {
  test.setTimeout(150_000);
  await fakeMidi(page);
  await setup(page, { input: 'midi', lastLessonId: 'song-happy-birthday-beginner' }, { midiEnabled: true });
  await page.goto('/?screen=coach');
  await expect(page.getByTestId('coach-input')).toContainText('Đàn MIDI');
  await expect(page.getByTestId('coach-lesson')).toHaveValue('song-happy-birthday-beginner');
  // Nốt Rê5 (m:10, ô 4) đánh thành Đô♯5.
  const wrong = { 'm:10': 73 };

  await record(page, 'song-happy-birthday-beginner', wrong);
  const panel = page.getByTestId('smart-practice-panel');
  await expect(panel).toBeVisible();
  // Một lượt → chưa đủ bằng chứng: cho tự chọn đoạn, không hiện đoạn khó.
  await expect(panel.getByTestId('smart-manual')).toBeVisible();
  await expect(panel.getByTestId('smart-passage')).toHaveCount(0);

  await page.getByTestId('coach-again').click();
  await record(page, 'song-happy-birthday-beginner', wrong);
  const passage = panel.getByTestId('smart-passage').first();
  await expect(passage).toBeVisible();
  await expect(passage).toContainText('D5');
  await expect(passage).toContainText('2/2 lượt');
  await passage.getByTestId('smart-practice-passage').click();

  await expect(page.getByTestId('coach-setup')).toBeVisible();
  const remId = await page.getByTestId('coach-lesson').inputValue();
  expect(remId).toMatch(/^rem:song-happy-birthday-beginner:\d+-\d+$/);
  const rem = resolveLesson(remId)!;
  expect(rem.notes.map((n) => n.pitch)).toContain('D5');
  expect(rem.notes.length).toBeGreaterThanOrEqual(3);
  // Tempo bài bổ trợ = 70% tempo đang luyện, không bị tempo thích ứng đè.
  expect(await bpmShown(page)).toBe(50);

  await record(page, remId);
  const remSection = page.getByTestId('smart-remedial');
  await expect(remSection).toContainText('Bài bổ trợ của');
  await remSection.getByTestId('smart-back-to-source').click();
  await expect(page.getByTestId('coach-lesson')).toHaveValue('song-happy-birthday-beginner');

  // Màn Luyện kỹ thuật → Đoạn khó thấy cùng đoạn + bài bổ trợ đã tạo.
  await page.goto('/?screen=technique');
  await page.getByTestId('technique-tab-passages').click();
  await expect(page.getByTestId('technique-passage').first()).toContainText('Happy Birthday');
  await expect(page.getByTestId('technique-remedial').first()).toContainText('Happy Birthday');
});
