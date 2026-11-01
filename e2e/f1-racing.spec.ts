import { expect, test, type Page } from '@playwright/test';

const profiles = {
  profiles: [
    { id: 'f1-kid', name: 'Bé Tay Đua', age: 8, avatar: '🏎️', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 1 },
    { id: 'f1-mom', name: 'Mẹ', age: 35, avatar: '🌸', experience: 'new', goals: ['fun'], dailyMinutes: 10, createdAt: 2 },
  ],
  activeId: 'f1-kid',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript((data) => {
    if (!localStorage.getItem('vietpiano.profiles.v1')) localStorage.setItem('vietpiano.profiles.v1', JSON.stringify(data));
  }, profiles);
});

const game = (page: Page) => page.getByTestId('f1-racing');
const key = (page: Page, midi: number | string | null) => page.locator(`[data-testid="f1-keyboard"] button[data-midi="${midi}"]`);
const attr = async (page: Page, name: string) => Number(await game(page).getAttribute(`data-${name}`));
const tap = async (page: Page, midi: number) => {
  await key(page, midi).dispatchEvent('pointerdown');
  await key(page, midi).dispatchEvent('pointerup');
};
const startRace = async (page: Page) => {
  await page.getByTestId('f1-start').click();
  await expect(game(page)).toHaveAttribute('data-status', 'racing', { timeout: 6000 });
};
/** Phím sai chắc chắn: nốt trong tầm Dễ nhưng khác nốt đang cần. */
const wrongNote = async (page: Page) => ((await attr(page, 'target')) === 60 ? 62 : 60);

test('mở từ mục Trò chơi: gara đủ 5 xe, độ khó, xem trước; chọn xe và độ khó được lưu', async ({ page }) => {
  await page.goto('/?screen=games');
  await expect(page.getByTestId('open-f1-racing')).toContainText('VietPiano F1 Racing');
  await page.getByTestId('open-f1-racing').click();
  await expect(game(page)).toHaveAttribute('data-status', 'ready');
  const garage = page.getByTestId('f1-garage');
  await expect(garage).toContainText('VietPiano F1 Racing');
  for (const name of ['Red Flash', 'Blue Storm', 'Golden Star', 'Green Bolt', 'Purple Rocket']) await expect(garage).toContainText(name);
  await expect(garage.locator('canvas')).toHaveCount(5);

  await page.getByTestId('f1-car-green-bolt').click();
  await expect(page.getByTestId('f1-car-green-bolt')).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: '🏆 Khó' }).click();
  await expect(page.getByTestId('f1-difficulty-summary')).toContainText('1.500 m');

  await page.goto('/?screen=f1-racing');
  await expect(page.getByTestId('f1-car-green-bolt')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('f1-difficulty-summary')).toContainText('1.500 m');
});

test('piano ảo: đúng/sai đổi tốc độ, phím điều hướng đổi làn mà không chấm điểm, không vượt 3 làn', async ({ page }) => {
  await page.goto('/?screen=f1-racing');
  await expect(page.getByTestId('f1-start')).toBeVisible();
  await startRace(page);
  await expect(page.getByTestId('f1-note-card').locator('svg')).toBeVisible();
  expect(await attr(page, 'speed')).toBe(100);

  // Sai: −10%, giữ nguyên nốt, tô đỏ.
  const target = await attr(page, 'target');
  await tap(page, await wrongNote(page));
  await expect(game(page)).toHaveAttribute('data-speed', '90');
  await expect(game(page)).toHaveAttribute('data-target', String(target));
  await expect(game(page)).toHaveAttribute('data-wrong', '1');
  const card = page.getByTestId('f1-note-card');
  await expect(card).toHaveAttribute('data-note-state', 'wrong');
  const colors = await card.locator('svg').evaluate((svg) => ({ note: getComputedStyle(svg.querySelector('.score-note')!).color, staff: getComputedStyle(svg).color }));
  expect(colors.note).not.toBe(colors.staff);
  await expect(card).toHaveAttribute('data-note-state', 'idle');

  // Đúng: +10%, sang nốt mới; nốt vừa đánh tô xanh thoáng qua.
  await tap(page, target);
  await expect(game(page)).toHaveAttribute('data-speed', '100');
  await expect(game(page)).toHaveAttribute('data-correct', '1');
  await expect(card).toHaveAttribute('data-note-state', 'hit');
  await expect(card).toHaveAttribute('data-shown', String(target));
  expect(await attr(page, 'target')).not.toBe(target);
  await expect(page.getByTestId('f1-streak')).toContainText('1/10');

  // Điều hướng: C3 trái, D3 phải; không tính nốt.
  await tap(page, 48);
  await expect(game(page)).toHaveAttribute('data-lane', '0');
  await tap(page, 48);
  await expect(game(page)).toHaveAttribute('data-lane', '0');
  await tap(page, 50);
  await tap(page, 50);
  await tap(page, 50);
  await expect(game(page)).toHaveAttribute('data-lane', '2');
  await expect(game(page)).toHaveAttribute('data-correct', '1');
  await expect(game(page)).toHaveAttribute('data-wrong', '1');

  // Xe đang tiến: quãng đường tăng.
  const before = await attr(page, 'distance');
  await page.waitForTimeout(600);
  expect(await attr(page, 'distance')).toBeGreaterThan(before);
});

test('10 nốt đúng bật tự né có đếm ngược; tạm dừng làm đồng hồ đứng; hết giờ thì tắt', async ({ page }) => {
  await page.goto('/?screen=f1-racing');
  await startRace(page);
  for (let i = 0; i < 10; i++) await tap(page, await attr(page, 'target'));
  await expect(game(page)).toHaveAttribute('data-assist', 'on');
  await expect(page.getByTestId('f1-assist-banner')).toContainText('Tự động né');

  await page.getByTestId('f1-pause').click();
  await expect(game(page)).toHaveAttribute('data-status', 'paused');
  await expect(page.getByTestId('f1-paused')).toBeVisible();
  const frozen = await page.getByTestId('f1-assist').textContent();
  const distance = await attr(page, 'distance');
  await page.waitForTimeout(3300);
  await expect(page.getByTestId('f1-assist')).toHaveText(frozen ?? '');
  expect(await attr(page, 'distance')).toBe(distance);
  await expect(game(page)).toHaveAttribute('data-assist', 'on');

  await page.getByTestId('f1-resume').click();
  await expect(game(page)).toHaveAttribute('data-status', 'racing');
  await expect(game(page)).toHaveAttribute('data-assist', 'off', { timeout: 4000 });
});

test('mở cài đặt giữa ván: tạm dừng, đổi phím điều hướng, phím trùng tầm được tách; đóng thì chạy tiếp', async ({ page }) => {
  await page.goto('/?screen=f1-racing');
  await startRace(page);
  await page.getByTestId('f1-settings').click();
  await expect(game(page)).toHaveAttribute('data-status', 'paused');
  await expect(page.getByTestId('f1-settings-panel')).toBeVisible();

  // Chọn nốt trong tầm Dễ cho phím trái: game tự đổi và báo cho người chơi biết.
  await page.getByTestId('f1-nav-left').selectOption('60');
  await expect(page.getByTestId('f1-nav-relocated')).toBeVisible();
  await expect(game(page)).not.toHaveAttribute('data-nav-left', '60');

  await page.getByTestId('f1-nav-left').selectOption('45');
  await expect(page.getByTestId('f1-nav-relocated')).toBeHidden();
  await expect(game(page)).toHaveAttribute('data-nav-left', '45');
  await page.getByTestId('f1-musicVolume').fill('0.2');
  await page.getByTestId('f1-modal-close').click();
  await expect(game(page)).toHaveAttribute('data-status', 'racing');

  // Bàn phím ảo tự rộng thêm để có phím mới.
  await tap(page, 45);
  await expect(game(page)).toHaveAttribute('data-lane', '0');

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('vietpiano.f1-racing.settings.v1') ?? '{}'));
  expect(saved.musicVolume).toBe(0.2);
  expect(saved.nav.left).toBe(45);
});

test('đàn MIDI: chấm đúng cao độ, giữ phím không tính lặp, rút dây thì tự tạm dừng', async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: 'p1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null as null | (() => void) };
    Object.defineProperty(Navigator.prototype, 'requestMIDIAccess', { configurable: true, value: () => Promise.resolve(access) });
    (window as unknown as Record<string, unknown>).__midi = {
      send: (data: number[]) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: performance.now() }),
      unplug: () => {
        access.inputs.clear();
        access.onstatechange?.();
      },
    };
    const key = 'vietpiano.settings.v1';
    const s = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(key, JSON.stringify({ ...s, midiEnabled: true }));
  });
  const send = (data: number[]) => page.evaluate((d) => (window as unknown as { __midi: { send(d: number[]): void } }).__midi.send(d), data);
  await page.goto('/?screen=f1-racing');
  await startRace(page);

  // C3 trên đàn thật: chỉ đổi làn.
  await send([0x90, 48, 80]);
  await expect(game(page)).toHaveAttribute('data-lane', '0');
  await send([0x80, 48, 0]);

  // Đúng rồi giữ phím: Note On lặp không tính nốt nào nữa.
  const target = await attr(page, 'target');
  await send([0x90, target, 80]);
  await expect(game(page)).toHaveAttribute('data-correct', '1');
  await send([0x90, target, 80]);
  await page.waitForTimeout(100);
  await expect(game(page)).toHaveAttribute('data-correct', '1');
  await expect(game(page)).toHaveAttribute('data-wrong', '0');
  await send([0x80, target, 0]);

  // Rút dây: tạm dừng, có thông báo.
  await page.evaluate(() => (window as unknown as { __midi: { unplug(): void } }).__midi.unplug());
  await expect(game(page)).toHaveAttribute('data-status', 'paused');
  await expect(page.getByTestId('f1-midi-lost')).toBeVisible();
  await page.getByTestId('f1-resume').click();
  await expect(game(page)).toHaveAttribute('data-status', 'racing');
});

test('đua hết chặng Dễ: màn kết quả đúng số liệu, cúp, kỷ lục, xếp hạng; mở lại vẫn còn', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('/?screen=f1-racing');
  await startRace(page);

  // Vừa đua vừa đánh đúng nốt, một lần sai.
  await tap(page, await wrongNote(page));
  for (let i = 0; i < 20; i++) {
    await tap(page, await attr(page, 'target'));
    await page.waitForTimeout(100);
  }

  await expect(game(page)).toHaveAttribute('data-status', 'finished', { timeout: 90_000 });
  await expect(page.getByTestId('f1-distance')).toContainText('500 / 500 m');
  const results = page.getByTestId('f1-results');
  await expect(results).toBeVisible();
  await expect(page.getByTestId('f1-result-correct')).toHaveText('20');
  await expect(page.getByTestId('f1-result-wrong')).toHaveText('1');
  await expect(page.getByTestId('f1-result-accuracy')).toHaveText('95%');
  await expect(page.getByTestId('f1-result-record')).toContainText('Kỷ lục cá nhân mới');
  await expect(page.getByTestId('f1-result-rank')).toContainText('hạng 1/1');
  const trophy = await results.getAttribute('data-trophy');
  expect(['gold', 'diamond']).toContain(trophy);

  // Mở lại trang: bảng xếp hạng và cúp còn nguyên.
  await page.goto('/?screen=f1-racing');
  await page.getByTestId('f1-open-leaderboard').click();
  const row = page.getByTestId('f1-row-f1-kid');
  await expect(row).toContainText('Bé Tay Đua');
  await expect(row).toContainText('Red Flash');
  await expect(row).toContainText('95%');
  await page.getByTestId('f1-modal-close').click();
  await page.getByTestId('f1-open-trophies').click();
  await expect(page.getByTestId(`f1-trophy-easy-${trophy}`)).toHaveAttribute('data-count', '1');
  await page.getByTestId('f1-modal-close').click();
  await expect(page.getByTestId('f1-garage')).toBeVisible();
});

test('chưa có hồ sơ: chưa được bắt đầu, có lời nhắc', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vietpiano.profiles.v1', JSON.stringify({ profiles: [], activeId: null })));
  await page.goto('/?screen=f1-racing');
  await expect(page.getByTestId('f1-start')).toBeDisabled();
  await expect(page.getByTestId('f1-garage')).toContainText('tạo hoặc chọn hồ sơ');
});
