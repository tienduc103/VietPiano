import { expect, test, type Page } from '@playwright/test';
import { HAPPY_BIRTHDAY_LESSONS } from '../src/core/lessons/arrangements/happyBirthday';
import { performancePlan } from '../src/core/practice/performPlan';

/**
 * Happy Birthday — ba bản phối hai tay (Cơ bản / Trung cấp / Nâng cao).
 * LƯU Ý: chạy trên Chromium với đàn MIDI GIẢ (Web MIDI giả lập) và bàn phím ảo — chưa thử trên đàn MIDI thật / iPad thật.
 */

async function openLesson(page: Page, id: string) {
  await page.goto('/?screen=song-library');
  await page.getByTestId(`lesson-${id}`).click();
  await expect(page.locator('[data-testid="score"] svg .score-note').first()).toBeVisible();
}

/** Web MIDI giả: một đàn "Test Piano"; `window.__midi.send([...], time?)`. Kèm cài đặt ban đầu (localStorage). */
async function fakeMidi(page: Page, settings: Record<string, unknown>) {
  await page.addInitScript((s) => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = {
      send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }),
    };
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('vietpiano.settings.v1', JSON.stringify(s));
      sessionStorage.setItem('seeded', '1');
    }
  }, settings);
}

const key = (page: Page, midi: number) => page.locator(`button[data-midi="${midi}"]`);

test('thư viện bài hát có 3 cấp; khuông đôi có ký hiệu hợp âm, to dần, pedal; đổi cấp độ ngay trên màn luyện tập', async ({ page }) => {
  await page.goto('/?screen=song-library');
  for (const level of ['beginner', 'intermediate', 'advanced']) await expect(page.getByTestId(`lesson-song-happy-birthday-${level}`)).toBeVisible();
  await page.getByTestId('lesson-song-happy-birthday-intermediate').click();
  await expect(page.locator('[data-testid="score"] svg .score-note')).toHaveCount(25);
  await expect(page.locator('.score-chord')).toHaveCount(9);
  await expect(page.locator('.score-chord[data-chord="C7"]')).toHaveCount(1);
  await expect(page.locator('.score-hairpin[data-hairpin="cresc"]')).toHaveCount(1);
  await expect(page.locator('.score-dynamic')).toHaveCount(4);
  await expect(page.locator('.score-pedal')).toHaveCount(6);
  await expect(page.getByTestId('arrangement-level-2')).toHaveAttribute('aria-checked', 'true');
  // Chưa có tiến độ → gợi ý bắt đầu từ cấp Cơ bản.
  await expect(page.getByTestId('arrangement-level-1').getByTestId('arrangement-recommended')).toBeVisible();

  await page.getByTestId('arrangement-level-3').click();
  await expect(page.getByRole('heading', { name: 'Happy Birthday · Nâng cao (hai tay)' })).toBeVisible();
  await expect(page.locator('[data-testid="score"] svg .score-note')).toHaveCount(26);
  // Pedal đổi theo hợp âm (giữa ô 5, 6, 7) → 13 khoảng pedal.
  await expect(page.locator('.score-pedal')).toHaveCount(13);
  await expect(page.locator('.score-chord[data-chord="Fm/Ab"]')).toHaveText('Fm/A♭');

  await page.getByTestId('arrangement-level-1').click();
  await expect(page.getByRole('heading', { name: 'Happy Birthday · Cơ bản (hai tay)' })).toBeVisible();
  // Pedal bản Cơ bản chỉ là gợi ý → không chấm, không hiện trạng thái pedal.
  await expect(page.getByTestId('pedal-unmeasured')).toHaveCount(0);
  await page.getByRole('button', { name: 'Về thư viện' }).click();
  await expect(page.getByTestId('song-library')).toBeVisible();
});

test('bật / tắt số ngón, ký hiệu hợp âm, ký hiệu pedal và phóng to khuông — không đổi dữ liệu bài', async ({ page }) => {
  await openLesson(page, 'song-happy-birthday-intermediate');
  await expect(page.locator('.score-finger').first()).toBeAttached();
  await page.getByTestId('score-display').click();
  const panel = page.getByTestId('score-display-panel');
  await panel.getByRole('switch', { name: 'Số ngón tay' }).click();
  await expect(page.locator('.score-finger')).toHaveCount(0);
  await panel.getByRole('switch', { name: 'Ký hiệu hợp âm' }).click();
  await expect(page.locator('.score-chord')).toHaveCount(0);
  await panel.getByRole('switch', { name: 'Ký hiệu pedal' }).click();
  await expect(page.locator('.score-pedal')).toHaveCount(0);
  // Nốt tay trái màu riêng (mặc định bật) → tắt được.
  await expect(page.getByTestId('score')).toHaveClass(/score-hand-colors/);
  await panel.getByRole('switch', { name: 'Tô màu riêng tay trái' }).click();
  await expect(page.getByTestId('score')).not.toHaveClass(/score-hand-colors/);
  await panel.getByRole('button', { name: 'Phóng to khuông nhạc' }).click();
  await expect(page.getByTestId('score-zoom')).toHaveText('110%');
  await expect(page.getByTestId('score')).toHaveAttribute('data-zoom', '1.1');
  // Vẫn đủ 25 nốt, vẫn chấm như cũ.
  await expect(page.locator('[data-testid="score"] svg .score-note')).toHaveCount(25);
  await expect(page.getByTestId('progress-text')).toHaveText('0/25');
  await panel.getByRole('switch', { name: 'Số ngón tay' }).click();
  await expect(page.locator('.score-finger').first()).toBeAttached();
});

test('Wait Mode hai tay (bàn phím ảo): chùm nốt tay phải + hợp âm tay trái phải đủ phím mới sang bước, phím sai tính lỗi', async ({ page }) => {
  await openLesson(page, 'song-happy-birthday-intermediate');
  await expect(page.getByTestId('hands-notice')).toContainText('Bàn phím ảo: chấm cả hai tay');
  // Ô lấy đà: Sol4 – Sol4, tay trái nghỉ.
  await expect(page.getByTestId('expected-left')).toHaveText('nghỉ');
  for (const [i, m] of [67, 67].entries()) {
    await key(page, m).click();
    await expect(page.getByTestId('progress-text')).toHaveText(`${i + 1}/25`);
    await page.waitForTimeout(150);
  }
  // Ô 1: La4 + Đô3; Sol4 + Mi3 Sol3; Đô5 + Mi3 Sol3 (đệm valse).
  for (const [i, step] of [[69, 48], [67, 52, 55], [72, 52, 55]].entries()) {
    for (const m of step.slice(1)) await key(page, m).click();
    await expect(page.getByTestId('progress-text')).toHaveText(`${i + 2}/25`);
    await key(page, step[0]).click();
    await expect(page.getByTestId('progress-text')).toHaveText(`${i + 3}/25`);
    await page.waitForTimeout(150);
  }
  // Ô 2: chùm Sol4 + Si4 (quãng 3, ngón 1·3) trên Si2, hợp âm Fa3 + Sol3 ở phách 2 cùng bước.
  await expect(page.getByTestId('expected-note')).toHaveText('G4B4');
  await expect(page.getByTestId('expected-finger')).toHaveText('ngón 1·3');
  await expect(key(page, 67)).toHaveAttribute('data-expected-extra', 'true');
  await key(page, 66).click(); // Fa♯4 — sai
  await expect(page.getByTitle('Số lần sai')).toHaveText('✗ 1');
  await key(page, 71).click();
  await key(page, 67).click();
  await expect(page.getByTestId('hands-guide')).toContainText('Tay phải ✓');
  await expect(page.getByTestId('progress-text')).toHaveText('5/25');
  for (const m of [47, 53, 55]) await key(page, m).click();
  await expect(page.getByTestId('progress-text')).toHaveText('6/25');
});

test('Biểu diễn (đàn MIDI giả): chơi một mạch theo nhịp, sai không dừng; tổng kết điểm từng tay, ô hay sai, lưu lịch sử', async ({ page }) => {
  test.setTimeout(90_000);
  await fakeMidi(page, { midiEnabled: true, practiceMode: 'perform', practiceHand: 'both', tempoPercent: 160 });
  await openLesson(page, 'song-happy-birthday-beginner');
  await expect(page.getByTestId('midi-badge')).toHaveText('MIDI: Test Piano');
  await expect(page.getByTestId('mode-perform')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('hands-notice')).toContainText('Biểu diễn theo đồng hồ nhịp cố định');
  await expect(page.getByTestId('perform-bpm')).toHaveText('♩=115');

  // Lên lịch phím theo đúng danh sách nốt app chấm; tay trái ô 3 đánh lệch nửa cung (cố ý sai).
  const lesson = HAPPY_BIRTHDAY_LESSONS[0];
  const plan = performancePlan(lesson, 'both', false).map((n) => ({ midi: n.hand === 'left' && n.measure === 3 ? n.midi + 1 : n.midi, startBeat: n.startBeat, durationBeats: n.durationBeats }));
  const beatMs = 60000 / 115;
  const countIn = 3 + (3 - lesson.pickup!);
  const totalMs = await page.evaluate(
    ({ plan, beatMs, countIn }) => {
      const midi = (window as unknown as { __midi: { send(d: number[]): void } }).__midi;
      (document.querySelector('[data-testid="perform-run"]') as HTMLButtonElement).click();
      const t0 = performance.now() + countIn * beatMs;
      for (const n of plan) {
        const on = t0 + n.startBeat * beatMs;
        setTimeout(() => midi.send([0x90, n.midi, 90]), on - performance.now());
        setTimeout(() => midi.send([0x80, n.midi, 0]), on + n.durationBeats * beatMs * 0.9 - performance.now());
      }
      return (countIn + Math.max(...plan.map((n) => n.startBeat + n.durationBeats)) + 1) * beatMs;
    },
    { plan, beatMs, countIn },
  );
  await expect(page.getByTestId('perform-status')).toHaveText('Đang biểu diễn', { timeout: 10_000 });
  await expect(page.getByTestId('perform-score')).toBeVisible({ timeout: totalMs + 10_000 });
  await expect(page.getByTestId('score-right')).toContainText('100%');
  await expect(page.getByTestId('score-left')).not.toContainText('100%');
  await expect(page.getByTestId('weak-measures')).toContainText('ô 3');
  // Đàn không gửi pedal → không phạt; trường độ đo được nhờ Note Off.
  await expect(page.getByTestId('criterion-duration')).toContainText('100%');
  // Lưu lịch sử: mở "Đoạn" thấy ô 3 trong "Đoạn hay sai" → luyện riêng ô 3.
  await page.getByTestId('practice-weak').click();
  await expect(page.getByRole('heading', { name: 'Happy Birthday · Cơ bản (hai tay) — ô 3' })).toBeVisible();
  await expect(page.getByTestId('mode-wait')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('progress-text')).toHaveText('0/3');
  await page.getByTestId('measure-range').click();
  await expect(page.getByTestId('weak-measure-3')).toBeVisible();
  await page.getByTestId('measure-range-full').click();
  await expect(page.getByTestId('progress-text')).toHaveText('0/25');
});

test('luyện theo đoạn ô nhịp; lộ trình 5 bước đặt sẵn tay + chế độ', async ({ page }) => {
  await openLesson(page, 'song-happy-birthday-intermediate');
  await page.getByTestId('measure-range').click();
  const panel = page.getByTestId('measure-range-panel');
  for (let i = 0; i < 5; i++) await panel.getByRole('button', { name: 'Ô bắt đầu tiến một ô' }).click();
  await panel.getByRole('button', { name: 'Ô kết thúc tiến một ô' }).click();
  await page.getByTestId('measure-range-go').click();
  await expect(page.getByRole('heading', { name: 'Happy Birthday · Trung cấp (hai tay) — ô 5–6' })).toBeVisible();
  // Ô 5 (3 nốt) + ô 6 (4 nốt); ký hiệu hợp âm C7, F/A; đoạn bắt đầu bằng mf.
  await expect(page.getByTestId('progress-text')).toHaveText('0/7');
  await expect(page.locator('.score-chord')).toHaveText(['C7', 'F/A']);
  await expect(page.locator('.score-dynamic').first()).toHaveText('mf');

  await page.getByTestId('practice-plan').click();
  await expect(page.getByTestId('practice-plan-panel')).toContainText('Tay trái: đệm valse');
  await page.getByTestId('plan-step-1').click();
  await expect(page.getByTestId('hand-left')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('mode-wait')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('practice-plan').click();
  await page.getByTestId('plan-step-2').click();
  await expect(page.getByTestId('hand-both')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('mode-tempo')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('tempo-bpm')).toHaveText('♩=66');
});

test('Nghe mẫu bản Nâng cao: con trỏ chạy theo tiếng đàn, phím chùm nốt tay phải hiện trên bàn phím', async ({ page }) => {
  await openLesson(page, 'song-happy-birthday-advanced');
  const listen = page.getByTestId('listen-sample');
  await listen.click();
  await expect(page.getByTestId('status-title')).toHaveText('Đang nghe mẫu');
  // ♩=100: sau ~1,5 giây con trỏ đã sang ô 1 (chùm Mi4 + La4 …).
  await expect(page.getByTestId('expected-note')).not.toHaveText('G4', { timeout: 4000 });
  await expect(page.locator('[data-expected-extra="true"]').first()).toBeAttached();
  await listen.click();
  await expect(listen).toHaveText('Nghe mẫu');
});

test('giáo trình gợi ý luyện thêm ba bản phối; xuất file MIDI cả bài', async ({ page }) => {
  await page.goto('/?screen=curriculum');
  await page.getByTestId('level-5').click();
  await page.getByText(/Luyện thêm \(\d bài trong thư viện\)/).first().click();
  await expect(page.getByTestId('extra-song-happy-birthday-beginner')).toBeVisible();
  await page.getByTestId('extra-song-happy-birthday-beginner').click();
  await expect(page.getByRole('heading', { name: 'Happy Birthday · Cơ bản (hai tay)' })).toBeVisible();

  await page.goto('/?screen=song-library');
  await page.getByTestId('export-song-happy-birthday-advanced').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-midi').click();
  expect((await download).suggestedFilename()).toMatch(/\.mid$/);
});
