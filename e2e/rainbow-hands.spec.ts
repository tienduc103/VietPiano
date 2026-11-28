import { expect, test, type Page } from '@playwright/test';

/**
 * "Cầu vồng hai bàn tay" — logic chạy bằng bàn phím ảo / Web MIDI GIẢ. Đây không phải bằng chứng đàn thật hay micro
 * thật hoạt động chính xác (checklist thử thật ở docs/rainbow-hands.md).
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'vietpiano.profiles.v1',
      JSON.stringify({
        profiles: [{ id: 'rb-kid', name: 'Bé Cầu Vồng', age: 6, avatar: '🐻', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 1 }],
        activeId: 'rb-kid',
      }),
    );
  });
});

const game = (page: Page) => page.getByTestId('rainbow-hands');
const keySel = (midi: number | string) => `[data-testid="rainbow-keyboard"] button[data-midi="${midi}"]`;

/** Bấm các phím trong cùng một tích tắc (hai tay cùng lúc), rồi thả. */
async function pressTogether(page: Page, midis: (string | number)[]) {
  await page.evaluate(
    ({ ms, sel }) => {
      const q = (m: string | number) => document.querySelector(sel.replace('MIDI', String(m)))!;
      for (const m of ms) q(m).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      for (const m of ms) q(m).dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    },
    { ms: midis, sel: keySel('MIDI') },
  );
}

/** Chơi đúng các nốt đang chờ tới hết vòng hiện tại. */
async function playRound(page: Page, steps: number) {
  for (let i = 0; i < steps; i++) {
    const step = Number(await game(page).getAttribute('data-step'));
    const expected = (await game(page).getAttribute('data-expected'))!.split(',').filter(Boolean);
    expect(expected.length).toBeGreaterThan(0);
    await pressTogether(page, expected);
    if (i < steps - 1) await expect(game(page)).toHaveAttribute('data-step', String(step + 1));
    await page.waitForTimeout(150); // quá khoảng chống nhảy nốt 120 ms
  }
}

test('mở từ mục Trò chơi; hai tay cùng bước: một tay không qua bước, đủ hai tay mới đi; xong 1 vòng → nhiệm vụ hoàn thành + sticker', async ({ page }) => {
  await page.goto('/?screen=games');
  await page.getByTestId('open-rainbow-hands').click();
  await expect(game(page)).toHaveAttribute('data-status', 'ready');
  await expect(page.getByTestId('rainbow-placement')).toContainText('Đô giữa');

  // Phần phụ huynh: 1 vòng (đổi số vòng → ván mới).
  await page.getByTestId('rainbow-open-settings').click();
  await page.getByRole('dialog').getByRole('button', { name: '1 vòng' }).click();
  await page.getByTestId('rainbow-close-modal').click();
  await expect(page.getByTestId('rainbow-round-counter')).toHaveText('Vòng 1/1');

  await page.getByTestId('rainbow-start').click();
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  await expect(game(page)).toHaveAttribute('data-expected', '48,60');
  await expect(page.getByTestId('rainbow-card-left')).toContainText('ngón 5');
  await expect(page.getByTestId('rainbow-card-right')).toContainText('ngón 1');

  // Chỉ tay phải → chưa qua bước, nhân vật tay phải sẵn sàng.
  await pressTogether(page, [60]);
  await expect(page.getByTestId('rainbow-char-right')).toHaveAttribute('data-ready', 'true');
  await expect(game(page)).toHaveAttribute('data-step', '0');
  await expect(page.getByTestId('rainbow-feedback')).toContainText('Còn tay trái');
  // Tay trái bấm sai → lời nhắc riêng tay trái, vẫn bước 0.
  await pressTogether(page, [53]);
  await expect(page.getByTestId('rainbow-feedback')).toContainText('Tay trái: thử phím Đô3');
  await expect(game(page)).toHaveAttribute('data-step', '0');
  await pressTogether(page, [48]);
  await expect(game(page)).toHaveAttribute('data-step', '1');
  await page.waitForTimeout(150);

  await playRound(page, 14);
  await expect(page.getByTestId('rainbow-result')).toBeVisible();
  await expect(page.getByTestId('rainbow-stat-complete')).toContainText('1/1');
  await expect(page.getByTestId('rainbow-stat-acc-right')).toContainText('100%');
  await expect(page.getByTestId('rainbow-stat-acc-left')).toContainText('94%'); // 15 đúng / 16 lần đánh
  await expect(page.getByTestId('rainbow-feedback-text')).toContainText('Con hoàn thành một vòng.');
  await expect(page.getByTestId('rainbow-stickers-earned')).toContainText('Cầu vồng rực rỡ');
  // Điểm dừng rõ ràng: không tự chạy tiếp.
  await page.waitForTimeout(400);
  await expect(game(page)).toHaveAttribute('data-status', 'done');

  // Chơi thêm cần bấm.
  await page.getByTestId('rainbow-more').click();
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  await expect(game(page)).toHaveAttribute('data-round', '2');

  // Dữ liệu lưu theo hồ sơ.
  await page.getByTestId('rainbow-pause').click();
  await expect(page.getByTestId('rainbow-paused')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vietpiano.rainbow-hands.v1') ?? '{}'));
  expect(saved['rb-kid'].progress.animalsHome).toBe(1);
  expect(saved['rb-kid'].progress.stickers.length).toBeGreaterThan(0);
});

test('tập từng tay trái, chỉ đi lên: 8 nốt từ Đô3; giữ phím không thêm bước', async ({ page }) => {
  await page.goto('/?screen=rainbow-hands');
  await page.getByTestId('rainbow-open-settings').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Tập từng tay' }).click();
  await dlg.getByRole('button', { name: '🐻 Tay trái' }).click();
  await dlg.getByRole('button', { name: '⬆ Đi lên' }).click();
  await dlg.getByRole('button', { name: '1 vòng' }).click();
  await page.getByTestId('rainbow-close-modal').click();
  await page.getByTestId('rainbow-start').click();
  await expect(game(page)).toHaveAttribute('data-expected', '48');

  // Giữ Đô3 (không thả) rồi bấm lại cùng phím: chỉ tính một bước.
  await page.locator(keySel(48)).dispatchEvent('pointerdown');
  await expect(game(page)).toHaveAttribute('data-step', '1');
  await page.waitForTimeout(150);
  await page.locator(keySel(48)).dispatchEvent('pointerdown');
  await page.waitForTimeout(150);
  await expect(game(page)).toHaveAttribute('data-step', '1');
  await page.locator(keySel(48)).dispatchEvent('pointerup');
  await expect(game(page)).toHaveAttribute('data-expected', '50');
  for (const m of [50, 52, 53, 55, 57, 59]) {
    await pressTogether(page, [m]);
    await page.waitForTimeout(150);
  }
  await pressTogether(page, [60]);
  await expect(page.getByTestId('rainbow-result')).toBeVisible();
  await expect(page.getByTestId('rainbow-stat-complete')).toContainText('1/1');
});

test('giữ nhịp: có đếm vào, nhịp tiếp tục chạy khi bé không bấm → nốt thiếu được ghi', async ({ page }) => {
  await page.goto('/?screen=rainbow-hands');
  await page.getByTestId('rainbow-open-settings').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Giữ nhịp' }).click();
  await dlg.getByRole('button', { name: 'Tay phải', exact: true }).click();
  await dlg.getByRole('button', { name: '♩=96' }).click();
  await dlg.getByRole('button', { name: '1 vòng' }).click();
  await page.getByTestId('rainbow-close-modal').click();
  await page.getByTestId('rainbow-start').click();
  await expect(page.getByTestId('rainbow-countdown')).toBeVisible();
  await expect(game(page)).toHaveAttribute('data-status', 'playing', { timeout: 4000 });
  // Không bấm gì: đồng hồ không chờ, bước vẫn tiến.
  await expect(game(page)).not.toHaveAttribute('data-step', '0', { timeout: 3000 });
  await expect(page.getByTestId('rainbow-result')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('rainbow-stat-complete')).toContainText('0/1');
});

test('đàn MIDI rút dây giữa chừng → tạm dừng "Mất kết nối", không tính lỗi; cắm lại tiếp tục đúng bước', async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: 'p', name: 'Digital Piano', manufacturer: 'Yamaha Corporation', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null as null | ((e: unknown) => void) };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = {
      send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }),
      plug: (on: boolean) => {
        input.state = on ? 'connected' : 'disconnected';
        access.onstatechange?.({ port: input });
      },
    };
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, midiEnabled: true }));
  });
  type W = { __midi: { send(d: number[]): void; plug(on: boolean): void } };
  const tapMidi = (n: number) =>
    page.evaluate((note) => {
      const m = (window as unknown as W).__midi;
      m.send([0x90, note, 80]);
      m.send([0x80, note, 0]);
    }, n);

  await page.goto('/?screen=rainbow-hands');
  await page.getByTestId('rainbow-start').click();
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  await tapMidi(48);
  await tapMidi(60);
  await expect(game(page)).toHaveAttribute('data-step', '1');
  await page.waitForTimeout(150);
  await tapMidi(50); // tay trái xong phần bước 1

  await page.evaluate(() => (window as unknown as W).__midi.plug(false));
  await expect(game(page)).toHaveAttribute('data-pause', 'input-lost');
  await expect(page.getByTestId('rainbow-paused')).toContainText('không phải lỗi của bé');
  await page.evaluate(() => (window as unknown as W).__midi.plug(true));
  await page.getByTestId('rainbow-resume').click();
  await expect(game(page)).toHaveAttribute('data-status', 'playing');
  // Phần đánh dở bị bỏ: vẫn chờ cả hai nốt của bước 1.
  await expect(game(page)).toHaveAttribute('data-expected', '50,62');

  // Có đàn MIDI → bàn phím ảo ẩn theo mặc định; bật "Hiện bàn phím ảo" ở Phần phụ huynh → hiện, không mở ván mới.
  await expect(page.getByTestId('rainbow-keyboard')).toHaveCount(0);
  await page.getByTestId('rainbow-open-settings').click();
  await page.getByRole('switch', { name: 'Hiện bàn phím ảo' }).click();
  await page.getByTestId('rainbow-close-modal').click();
  await expect(page.getByTestId('rainbow-keyboard')).toBeVisible();
  await expect(game(page)).toHaveAttribute('data-expected', '50,62');
});

test('hai tay ngược chiều: tay trái tự lùi xuống Đô2–Đô3 như bài mẫu, tay trái đi xuống khi tay phải đi lên; đủ vòng → tổng kết', async ({ page }) => {
  await page.goto('/?screen=rainbow-hands');
  await page.getByTestId('rainbow-open-settings').click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Hai tay ngược chiều' }).click();
  await dlg.getByRole('button', { name: '1 vòng' }).click();
  await expect(page.getByTestId('rainbow-contrary-shift')).toContainText('Đô2–Đô3');
  await expect(dlg).toContainText('tech-l3-scale-c-contrary');
  await page.getByTestId('rainbow-close-modal').click();
  await expect(page.getByTestId('rainbow-placement')).toContainText('Tay trái: đặt ngón 1 (ngón cái) lên Đô3');
  await page.getByTestId('rainbow-start').click();
  await expect(game(page)).toHaveAttribute('data-mode', 'contrary');
  await expect(game(page)).toHaveAttribute('data-expected', '48,60');
  await expect(page.getByTestId('rainbow-direction')).toHaveText('↔ Tách ra');

  await pressTogether(page, [48, 60]);
  await expect(game(page)).toHaveAttribute('data-step', '1');
  await expect(game(page)).toHaveAttribute('data-expected', '47,62');
  await expect(page.getByTestId('rainbow-card-left')).toContainText('⬇');
  await expect(page.getByTestId('rainbow-card-left')).toContainText('Si');
  await expect(page.getByTestId('rainbow-card-right')).toContainText('⬆');
  await page.waitForTimeout(150);
  // Tay trái đi nhầm hướng (lên Rê3) → nhắc riêng tay trái, giữ bước.
  await pressTogether(page, [50]);
  await expect(page.getByTestId('rainbow-feedback')).toContainText('Tay trái: thử phím Si2');
  await expect(game(page)).toHaveAttribute('data-step', '1');

  await playRound(page, 14);
  await expect(page.getByTestId('rainbow-result')).toBeVisible();
  await expect(page.getByTestId('rainbow-stat-complete')).toContainText('1/1');
  await expect(page.getByTestId('rainbow-stat-acc-right')).toContainText('100%');
  await expect(page.getByTestId('rainbow-stat-sync')).toContainText('15 · 15');
});
