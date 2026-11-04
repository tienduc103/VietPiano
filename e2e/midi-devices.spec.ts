import { expect, test, type Page } from '@playwright/test';

/**
 * Quản lý thiết bị MIDI: Web MIDI giả với hai thiết bị (controller Korg 25 phím, đàn Yamaha), bật "Dùng đàn MIDI".
 * `window.__midi.send(id, [...])` gửi byte thô; `plug(id, bool)` cắm / rút.
 */
async function fakeMidi(page: Page) {
  await page.addInitScript(() => {
    type Input = { id: string; name: string; manufacturer: string; state: string; onmidimessage: null | ((e: unknown) => void) };
    const inputs: Input[] = [
      { id: 'k', name: 'microKEY2-25', manufacturer: 'KORG INC.', state: 'connected', onmidimessage: null },
      { id: 'y', name: 'Digital Piano', manufacturer: 'Yamaha Corporation', state: 'connected', onmidimessage: null },
    ];
    const access = { inputs: new Map(inputs.map((i) => [i.id, i])), outputs: new Map(), onstatechange: null as null | ((e: unknown) => void) };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    const find = (id: string) => inputs.find((i) => i.id === id)!;
    (window as unknown as Record<string, unknown>).__midi = {
      send: (id: string, data: number[]) => find(id).onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }),
      plug: (id: string, on: boolean) => {
        find(id).state = on ? 'connected' : 'disconnected';
        access.onstatechange?.({ port: find(id) });
      },
    };
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, midiEnabled: true }));
  });
}

type MidiWindow = { __midi: { send(id: string, d: number[]): void; plug(id: string, on: boolean): void } };
const send = (page: Page, id: string, data: number[]) => page.evaluate(([i, d]) => (window as unknown as MidiWindow).__midi.send(i as string, d as number[]), [id, data] as const);
const plug = (page: Page, id: string, on: boolean) => page.evaluate(([i, o]) => (window as unknown as MidiWindow).__midi.plug(i as string, o as boolean), [id, on] as const);

async function openSettings(page: Page) {
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByTestId('midi-device-manager')).toBeVisible();
}

test('Quản lý thiết bị MIDI: liệt kê nhiều hãng, kiểm tra tín hiệu, quãng tám, tắt thiết bị, cắm / rút', async ({ page }) => {
  await fakeMidi(page);
  await openSettings(page);
  const korg = page.getByTestId('midi-device-0');
  const yamaha = page.getByTestId('midi-device-1');
  await expect(korg.getByTestId('midi-device-name')).toHaveText('microKEY2-25');
  await expect(korg).toContainText('Korg');
  await expect(korg).toContainText('25 phím');
  await expect(korg.getByTestId('midi-device-status')).toHaveText('Đang kết nối');
  await expect(yamaha).toContainText('Yamaha');
  await expect(yamaha).toContainText('88 phím');

  // Kiểm tra tín hiệu trực tiếp: thiết bị vừa gửi tín hiệu được chọn.
  await send(page, 'k', [0x90, 60, 77]);
  const signal = korg.getByTestId('midi-signal-test');
  await expect(signal.getByTestId('midi-signal-note')).toHaveText('C4');
  await expect(signal.getByTestId('midi-signal-velocity')).toHaveText('77');
  await send(page, 'k', [0xb0, 64, 127]);
  await expect(signal.getByTestId('midi-signal-pedal')).toHaveText('Pedal: đang đạp');
  await send(page, 'k', [0x80, 60, 0]);
  await send(page, 'k', [0xb0, 64, 0]);
  await expect(signal.getByTestId('midi-signal-note')).toHaveText('—');
  await expect(signal.getByTestId('midi-signal-log')).toContainText('Note On 60 · lực 77 · kênh 1');

  // Quãng tám +1: phím C4 của controller → app nhận C5.
  await korg.getByRole('button', { name: 'Cấu hình' }).click();
  await korg.getByTestId('midi-octave').getByRole('button', { name: 'Tăng' }).click();
  await send(page, 'k', [0x90, 60, 90]);
  await send(page, 'k', [0x80, 60, 0]);
  await expect(page.getByTestId('midi-last-note')).toHaveText('C5');

  // Tắt thiết bị: tín hiệu bị bỏ (gạch trong nhật ký), không còn tính là đàn đang nối.
  await korg.getByRole('switch', { name: /Nhận tín hiệu/ }).click();
  await expect(korg.getByTestId('midi-device-status')).toHaveText('Đang tắt');
  await expect(page.getByTestId('midi-status')).toContainText('Đã kết nối: Digital Piano');
  await expect(page.getByTestId('midi-status')).not.toContainText('microKEY2-25,');

  // Cấu hình nhớ sau khi tải lại (theo tên đàn).
  await openSettings(page);
  await expect(page.getByTestId('midi-device-0').getByTestId('midi-device-status')).toHaveText('Đang tắt');
  await page.getByTestId('midi-device-0').getByRole('button', { name: 'Cấu hình' }).click();
  await page.getByTestId('midi-device-0').getByRole('switch', { name: /Nhận tín hiệu/ }).click();
  await expect(page.getByTestId('midi-device-0').getByTestId('midi-octave')).toContainText('+1');

  // Rút đàn Yamaha → "Đã ngắt"; cắm lại → "Đang kết nối".
  await plug(page, 'y', false);
  await expect(page.getByTestId('midi-device-1').getByTestId('midi-device-status')).toHaveText('Đã ngắt');
  await plug(page, 'y', true);
  await expect(page.getByTestId('midi-device-1').getByTestId('midi-device-status')).toHaveText('Đang kết nối');
});

test('đàn MIDI mô phỏng: bật trong Cài đặt, bấm phím trên hình → nốt đi vào bài luyện tập', async ({ page }) => {
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await page.getByRole('switch', { name: /Đàn MIDI mô phỏng/ }).click();
  const list = page.getByTestId('midi-device-list');
  await expect(list).toContainText('Mô phỏng microKEY2-25');
  await expect(list).toContainText('Mô phỏng Digital Piano 88');
  await expect(list).toContainText('Mô phỏng');

  const sim = page.getByTestId('midi-device-manager').locator('li', { hasText: 'Mô phỏng microKEY2-25' });
  await sim.getByRole('button', { name: /Mô phỏng microKEY2-25/ }).click();
  await sim.getByTestId('midi-signal-test').locator('[data-midi="62"]').dispatchEvent('pointerdown');
  await expect(page.getByTestId('midi-last-note')).toHaveText('D4');
  await sim.getByTestId('midi-signal-test').locator('[data-midi="62"]').dispatchEvent('pointerup');

  // Nốt từ đàn mô phỏng đi qua cùng MidiEngine như đàn thật → chuyển nốt trong Wait Mode.
  // Tải lại: cài đặt "Đàn MIDI mô phỏng" được nhớ.
  await page.goto('/?screen=library');
  await page.getByTestId('lesson-scale-c-major').click();
  await expect(page.getByTestId('midi-badge')).toContainText('MIDI:');
  await page.evaluate(() => {
    const sim = (window as unknown as { __vietpianoMidiSim: { noteOn(id: string, n: number): void; noteOff(id: string, n: number): void } }).__vietpianoMidiSim;
    sim.noteOn('sim-piano-88', 60);
    sim.noteOff('sim-piano-88', 60);
  });
  await expect(page.getByTestId('expected-note')).toHaveText('D4');
});
