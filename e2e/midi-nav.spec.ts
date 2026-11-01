import { expect, test, type Page } from '@playwright/test';

/** Web MIDI giả + bật "Dùng đàn MIDI"; `window.__midi.send([...])` gửi một thông điệp MIDI thô. */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = {
      send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }),
    };
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, midiEnabled: true }));
  });
}

const midiSend = (page: Page, data: number[]) => page.evaluate((d) => (window as unknown as { __midi: { send(d: number[]): void } }).__midi.send(d), data);
const press = async (page: Page, midi: number) => {
  await midiSend(page, [0x90, midi, 90]);
  await midiSend(page, [0x80, midi, 0]);
};
/** Quá thời gian chờ 1,2 s sau khi màn xuất hiện / sau lần bấm trước. */
const settle = (page: Page) => page.waitForTimeout(1400);

test('đàn MIDI: phím trắng = Tiếp, phím đen = Trước, pedal = Tiếp; bỏ phím trong 1,2 s đầu; lúc làm bài phím vẫn là phím', async ({ page }) => {
  test.setTimeout(45_000);
  await fakeMidi(page);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-01-keyboard').click();
  await expect(page.getByTestId('lesson-overview')).toBeVisible();

  // Vừa vào màn → phím bị bỏ qua.
  await press(page, 60);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('lesson-overview')).toBeVisible();

  // Phím trắng → "Bắt đầu".
  await settle(page);
  await press(page, 64);
  await expect(page.getByTestId('step-title')).toHaveText('Phím trắng và phím đen');

  // Phím trắng (quãng nào cũng được) → trang tiếp; bấm liền hai phím chỉ đi một trang.
  await settle(page);
  await press(page, 36);
  await press(page, 38);
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 2 phím đen');
  await page.waitForTimeout(300);
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 2 phím đen');

  // Phím đen → "Trước".
  await settle(page);
  await press(page, 70);
  await expect(page.getByTestId('step-title')).toHaveText('Phím trắng và phím đen');

  // Pedal vang → "Tiếp".
  await settle(page);
  await midiSend(page, [0xb0, 64, 127]);
  await midiSend(page, [0xb0, 64, 0]);
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 2 phím đen');
  await settle(page);
  await press(page, 60);
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 3 phím đen');

  // Trang cuối → "Bắt đầu luyện tập" → bài tập nghe nốt: phím đàn là câu trả lời, không điều hướng.
  await settle(page);
  await press(page, 60);
  await expect(page.getByTestId('key-quiz')).toBeVisible();
  await settle(page);
  await press(page, 61);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('key-quiz')).toBeVisible();
  await expect(page.getByTestId('intro-step')).toHaveCount(0);
});

test('đàn MIDI: chạm màn hình rồi bấm phím ngay → chưa điều hướng', async ({ page }) => {
  await fakeMidi(page);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-01-keyboard').click();
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('step-title')).toHaveText('Phím trắng và phím đen');
  await settle(page);
  await page.getByTestId('intro-next').click();
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 2 phím đen');
  await press(page, 60);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 2 phím đen');
  await settle(page);
  await press(page, 60);
  await expect(page.getByTestId('step-title')).toHaveText('Nhóm 3 phím đen');
});

test('đàn MIDI: hai phím đen bất kỳ cùng lúc → về Trang chủ; đang làm bài thì không', async ({ page }) => {
  await fakeMidi(page);
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-01-keyboard').click();
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('step-title')).toHaveText('Phím trắng và phím đen');
  await settle(page);
  await page.getByTestId('intro-next').click();
  await page.getByTestId('intro-next').click();
  await page.getByTestId('intro-next').click();
  await expect(page.getByTestId('key-quiz')).toBeVisible();
  // Đang làm bài: hai phím đen là câu trả lời, không về Trang chủ.
  await settle(page);
  await midiSend(page, [0x90, 61, 90]);
  await midiSend(page, [0x90, 66, 90]);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('key-quiz')).toBeVisible();
  await midiSend(page, [0x80, 61, 0]);
  await midiSend(page, [0x80, 66, 0]);

  // Màn tổng quan buổi (chờ bấm nút): hai phím đen cùng lúc → Trang chủ.
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-01-keyboard').click();
  await expect(page.getByTestId('lesson-overview')).toBeVisible();
  await settle(page);
  await midiSend(page, [0x90, 63, 90]);
  await midiSend(page, [0x90, 82, 90]);
  await expect(page.getByTestId('dashboard')).toBeVisible();
});

test('đàn MIDI: Thu hoạch cà chua — phím trắng bấm "Bắt đầu"; đang chơi thì phím đàn là câu trả lời', async ({ page }) => {
  await fakeMidi(page);
  await page.addInitScript(() => {
    localStorage.setItem('vietpiano.profiles.v1', JSON.stringify({
      profiles: [{ id: 'tomato-player', name: 'Bé Cà Chua', age: 8, avatar: '🐰', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 1 }],
      activeId: 'tomato-player',
    }));
  });
  await page.goto('/?screen=tomato-harvest');
  const game = page.getByTestId('tomato-harvest');
  await expect(game).toHaveAttribute('data-status', 'ready');
  await settle(page);
  await press(page, 60);
  await expect(game).toHaveAttribute('data-status', 'playing');
  // Đang chơi: phím đàn hái cà chua, không điều hướng; hai phím đen không về Trang chủ.
  await settle(page);
  const target = Number(await game.getAttribute('data-target'));
  await press(page, target);
  await expect(game).toHaveAttribute('data-harvested', '1');
  await midiSend(page, [0x90, 61, 90]);
  await midiSend(page, [0x90, 63, 90]);
  await page.waitForTimeout(500);
  await expect(game).toHaveAttribute('data-status', 'playing');
  await expect(page.getByTestId('dashboard')).toHaveCount(0);
});
