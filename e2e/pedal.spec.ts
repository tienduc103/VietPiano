import { expect, test, type Page } from '@playwright/test';

/** Web MIDI giả: một đàn "Test Piano"; `window.__midi.send([...])` gửi một thông điệp MIDI thô. */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = {
      send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }),
    };
  });
}

const midiSend = (page: Page, data: number[]) => page.evaluate((d) => (window as unknown as { __midi: { send(d: number[]): void } }).__midi.send(d), data);

/** Mở buổi "Hoàng hôn" (cấp 6, buổi đầu có pedal), qua trang giới thiệu + câu hỏi tới bài "Làm quen pedal". */
async function openPedalExercise(page: Page) {
  await page.goto('/?screen=curriculum');
  await page.getByTestId('level-6').click();
  await page.getByTestId('cur-lesson-l6-17-sunset').click();
  await page.getByTestId('start-lesson').click();
  // Trang giới thiệu pedal có khuông nhạc vẽ "Ped." + đường kẻ.
  await expect(page.getByText('Pedal vang', { exact: true })).toBeVisible();
  await page.getByTestId('intro-next').click();
  await expect(page.locator('.score-pedal')).toHaveCount(4);
  await expect(page.locator('.score-pedal-text')).toHaveCount(1);
  await page.getByTestId('intro-next').click();
  await page.getByTestId('intro-next').click();
  // Trang "Thử sức: Romance d'Amour": ô 9–10 có Đô thăng, thay pedal mỗi ô.
  await expect(page.getByText("Thử sức: Romance d'Amour", { exact: true })).toBeVisible();
  await expect(page.locator('.score-pedal')).toHaveCount(2);
  await page.getByTestId('intro-next').click();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId('choice-0').click();
    await page.waitForTimeout(1000);
  }
  await page.getByTestId('exercise-next').click();
  await expect(page.getByTestId('timed-runner')).toBeVisible();
}

test('pedal: ký hiệu "Ped." trên khuông; không có đàn MIDI → tiêu chí pedal "không đo"', async ({ page }) => {
  await openPedalExercise(page);
  await expect(page.locator('[data-testid="timed-runner"] .score-pedal')).toHaveCount(4);
  await expect(page.getByTestId('pedal-unmeasured')).toBeVisible();
});

test('pedal: đàn MIDI gửi Control Change 64 → hiện đang đạp / nhả', async ({ page }) => {
  await fakeMidi(page);
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('switch', { name: /Dùng đàn MIDI/ }).click();
  await expect(page.getByTestId('midi-status')).toContainText('Đã kết nối: Test Piano');
  await openPedalExercise(page);
  await expect(page.getByTestId('pedal-state')).toHaveText('Pedal: nhả');
  await midiSend(page, [0xb0, 64, 127]);
  await expect(page.getByTestId('pedal-state')).toHaveText('Pedal: đang đạp');
  await midiSend(page, [0xb0, 64, 0]);
  await expect(page.getByTestId('pedal-state')).toHaveText('Pedal: nhả');
});
