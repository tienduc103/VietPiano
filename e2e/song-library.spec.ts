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

test('bấm chữ "Bài hát" mở trang Thư viện bài hát; lọc, tìm, quay lại', async ({ page }) => {
  await page.goto('/?screen=library');
  await expect(page.locator('[data-testid^="lesson-rep-"]')).toHaveCount(0);
  await page.getByTestId('open-song-library').click();
  await expect(page.getByRole('heading', { name: 'Thư viện bài hát' })).toBeVisible();
  await expect(page.locator('[data-testid^="lesson-rep-"]')).toHaveCount(50);
  await expect(page.locator('[data-testid^="lesson-song-"]')).toHaveCount(31);

  await page.getByTestId('song-filter-single').click();
  await expect(page.locator('[data-testid^="lesson-rep-"]')).toHaveCount(0);
  await page.getByTestId('song-filter-grand').click();
  await expect(page.locator('[data-testid^="lesson-rep-"]')).toHaveCount(50);

  // Tìm không phân biệt dấu.
  await page.getByTestId('song-filter-all').click();
  await page.getByTestId('song-search').fill('gymnopedie');
  await expect(page.getByTestId('lesson-rep-gymnopedie')).toBeVisible();
  await expect(page.locator('[data-testid^="lesson-"]')).toHaveCount(1);
  await page.getByTestId('song-search').fill('zzz');
  await expect(page.getByTestId('song-empty')).toBeVisible();
  await page.getByTestId('song-search').fill('');

  // Mở bài từ trang này → nút quay lại trở về đúng trang này.
  await page.getByTestId('lesson-rep-twinkle').click();
  await expect(page.getByTestId('hand-both')).toBeVisible();
  await page.getByRole('button', { name: 'Về thư viện' }).click();
  await expect(page.getByTestId('song-library')).toBeVisible();
  await page.getByRole('button', { name: 'Về thư viện' }).click();
  await expect(page.getByTestId('library')).toBeInViewport();
});

test('cả 50 bài khuông đôi vẽ được khuông đôi kèm ký hiệu pedal', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?screen=song-library');
  const ids = await page.locator('[data-testid^="lesson-rep-"]').evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')!));
  expect(ids).toHaveLength(50);
  for (const id of ids) {
    await page.getByTestId(id).click();
    await expect(page.locator('.score-pedal').first(), id).toBeAttached();
    await page.getByRole('button', { name: 'Về thư viện' }).click();
    await expect(page.getByTestId('song-library')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('không có đàn MIDI: pedal "không đo", không tính điểm', async ({ page }) => {
  await page.goto('/?screen=song-library');
  await page.getByTestId('lesson-rep-mary-lamb').click();
  await expect(page.getByTestId('pedal-unmeasured')).toBeVisible();
  await expect(page.getByTestId('pedal-state')).toHaveCount(0);
});

test('đàn MIDI: chấm pedal ở Chờ nốt, tập tay phải; thay pedal đúng mỗi ô → 100%', async ({ page }) => {
  await fakeMidi(page);
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('switch', { name: /Dùng đàn MIDI/ }).click();
  await expect(page.getByTestId('midi-status')).toContainText('Đã kết nối: Test Piano');
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await page.getByTestId('open-song-library').click();
  await page.getByTestId('lesson-rep-new-world').click();
  await page.getByTestId('hand-right').click();
  await page.getByTestId('mode-wait').click();
  await expect(page.getByTestId('pedal-state')).toHaveText('Pedal: nhả');

  // New World Largo: mỗi ô một hợp âm → pedal thay ở cả 8 ô.
  const bars = [
    [64, 67, 67],
    [64, 62, 60],
    [62, 64, 67, 64],
    [62],
    [64, 67, 67],
    [64, 62, 60],
    [62, 64, 62, 60],
    [60],
  ];
  for (const bar of bars) {
    for (let i = 0; i < bar.length; i++) {
      await midiSend(page, [0x90, bar[i], 90]);
      await page.waitForTimeout(170);
      await midiSend(page, [0x80, bar[i], 0]);
      if (i === 0) {
        // Đánh nốt đầu ô rồi mới nhả + đạp lại.
        await midiSend(page, [0xb0, 64, 0]);
        await midiSend(page, [0xb0, 64, 127]);
        await expect(page.getByTestId('pedal-state')).toHaveText('Pedal: đạp');
      }
    }
  }
  await expect(page.getByTestId('pedal-score')).toContainText('100%');
});
