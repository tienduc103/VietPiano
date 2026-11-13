import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md): máy ghi giả bằng `page.route`. Trình duyệt tự động + "auto"
 * thì app không gửi (e2e khác không ghi vào log thật) → các test đặt địa chỉ máy ghi riêng trước khi mở app.
 */
/** Địa chỉ đã chuẩn hoá như app lưu (http không cổng → cổng 8790 của `npm run perflog`). */
const COLLECTOR = 'http://perflog.test:8790';
const SETTINGS_KEY = 'vietpiano.performLog.v1';

/** Số lượt Biểu diễn trong IndexedDB của app (ghi bất đồng bộ → chờ ghi xong rồi mới tải trang khác). */
const storedPerforms = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const req = indexedDB.open('vietpiano-perform-log');
        req.onerror = () => resolve(-1);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('entries')) return resolve(0);
          const count = db.transaction('entries').objectStore('entries').index('type').count('perform');
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
        };
      }),
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function fakeCollector(page: Page) {
  const entries: Json[] = [];
  let gets = 0;
  await page.route(`${COLLECTOR}/__vplog`, async (route) => {
    const req = route.request();
    if (req.method() === 'POST') for (const line of (req.postData() ?? '').split('\n').filter(Boolean)) entries.push(JSON.parse(line));
    else gets++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, app: 'vietpiano-perform-log', dir: 'logs/perform-log' }),
    });
  });
  return { entries, gets: () => gets };
}

async function useLogSettings(page: Page, url: string) {
  await page.addInitScript(
    ([key, value]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    [SETTINGS_KEY, JSON.stringify({ enabled: true, url, deviceId: 'd-e2etest1', deviceName: 'Máy e2e' })] as const,
  );
}

test('Biểu diễn màn Luyện tập: hết bài gửi một bản log (nốt, sự kiện, kết quả, chẩn đoán); mở app gửi bản "máy truy cập"; Cài đặt tải được file log', async ({ page }) => {
  await useLogSettings(page, COLLECTOR);
  const collector = await fakeCollector(page);

  await page.goto('/?screen=library');
  await expect.poll(() => collector.entries.filter((e) => e.type === 'visit').length).toBeGreaterThan(0);
  expect(collector.entries.find((e) => e.type === 'visit')).toMatchObject({ v: 1, reason: 'open', device: { id: 'd-e2etest1', name: 'Máy e2e' }, env: { ua: expect.stringContaining('Chrome') } });

  await page.getByTestId('lesson-scale-c-major').click();
  await expect(page.locator('[data-testid="score"] svg .score-note').first()).toBeVisible();
  // Biểu diễn 160% (♩=115): đúng C4 D4 E4 theo phách, phách 4 đánh G4 (cần F4 → sai), 12 nốt còn lại để lỡ.
  await page.getByTestId('mode-perform').click();
  for (let i = 0; i < 12; i++) await page.getByRole('button', { name: 'Nhanh hơn' }).click();
  await expect(page.getByTestId('perform-bpm')).toHaveText('♩=115');
  const totalMs = await page.evaluate(() => {
    const beatMs = 60000 / 115;
    (document.querySelector('[data-testid="perform-run"]') as HTMLButtonElement).click();
    const t0 = performance.now() + 4 * beatMs;
    ['a', 's', 'd', 'g'].forEach((key, i) => setTimeout(() => window.dispatchEvent(new KeyboardEvent('keydown', { key })), t0 + i * beatMs - performance.now()));
    return (4 + 16 + 1) * beatMs;
  });
  const dialog = page.getByRole('dialog', { name: 'Kết quả biểu diễn' });
  await expect(dialog).toBeVisible({ timeout: totalMs + 10_000 });

  await expect.poll(() => collector.entries.filter((e) => e.type === 'perform').length, { timeout: 10_000 }).toBe(1);
  const log = collector.entries.find((e) => e.type === 'perform');
  expect(log).toMatchObject({
    v: 1,
    screen: 'practice',
    end: 'finished',
    lesson: { id: 'scale-c-major', timeSignature: [4, 4] },
    device: { id: 'd-e2etest1', name: 'Máy e2e' },
    setup: { hand: 'both', bpm: 115, tempoPercent: 160, countInBeats: 4, checkPitch: true, micLatencyMs: 60 },
    result: { notes: 16, correct: 3, wrong: 1, missed: 12, extras: 0 },
  });
  expect(log.notes).toHaveLength(16);
  expect(log.notes[0]).toMatchObject({ i: 0, b: 0, m: 60, p: 'C4', r: 'correct', pm: 60 });
  expect(log.events.map((e: Json) => [e.src, e.m, e.out, e.note])).toEqual([
    ['virtual', 60, 'hit', 0],
    ['virtual', 62, 'hit', 1],
    ['virtual', 64, 'hit', 2],
    ['virtual', 67, 'wrong', 3],
  ]);
  expect(log.marks.map((m: Json) => m.k)).toEqual(['start', 'end']);
  // G4 đánh sớm một phách vào ô F4: ô F4 "sai" là nốt kề, ô G4 lỡ vì phím G đã chấm cho ô trước; 11 nốt sau không có tín hiệu.
  expect(log.diagnosis.wrong).toMatchObject({ neighbor: 1 });
  expect(log.diagnosis.missed).toMatchObject({ noInput: 11, other: 1 });
  expect(log.summary).toContain('"Gam Đô trưởng (tay phải)" [scale-c-major]');
  expect(log.summary).toContain('16 nốt: đúng 3, sai 1, lỡ 12, thừa 0');
  // Điểm trong log = điểm hộp thoại kết quả (cùng rubric Biểu diễn).
  await expect(dialog.getByTestId('perform-score')).toHaveText(`${log.result.score}/100`);

  // Cài đặt: số bản trên máy, đã gửi hết, thử kết nối, tải file log.
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const card = page.getByTestId('perform-log-card');
  const status = card.getByTestId('perform-log-status');
  await expect(status).toContainText('1 lượt Biểu diễn');
  await expect(status).toContainText('0 bản chưa gửi');
  await expect(status).toContainText(`Gửi tới: ${COLLECTOR}/__vplog`);
  await card.getByTestId('perform-log-test').click();
  await expect(status).toContainText('Kết nối tốt — máy ghi lưu vào logs/perform-log.');
  expect(collector.gets()).toBe(1);
  const download = page.waitForEvent('download');
  await card.getByTestId('perform-log-download').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^vietpiano-perform-log-May-e2e-\d{4}-\d{2}-\d{2}\.jsonl$/);
  const lines = readFileSync(await file.path(), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  expect(lines.filter((e) => e.type === 'perform').map((e) => e.id)).toEqual([log.id]);
});

test('"auto" trên trình duyệt tự động không gửi; bỏ dở giữa chừng (chơi lại) vẫn ghi lượt đó; tắt nhật ký thì không ghi', async ({ page }) => {
  let posts = 0;
  await page.route('**/__vplog', (route) => {
    posts++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await useLogSettings(page, 'auto');
  await page.goto('/?screen=library');
  await page.getByTestId('lesson-scale-c-major').click();
  await page.getByTestId('mode-perform').click();
  await page.getByTestId('perform-run').click();
  await expect(page.getByTestId('perform-status')).toHaveText('Đang biểu diễn', { timeout: 10_000 });
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Chơi lại từ đầu' }).click();
  await expect.poll(() => storedPerforms(page)).toBe(1);

  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  const card = page.getByTestId('perform-log-card');
  const status = card.getByTestId('perform-log-status');
  await expect(status).toContainText('1 lượt Biểu diễn');
  await expect(status).toContainText('Chưa gửi đi đâu');
  expect(posts).toBe(0);

  // Tắt → lượt mới không được ghi.
  await card.getByTestId('perform-log-enabled').getByRole('switch').click();
  await page.goto('/?screen=library');
  await page.getByTestId('lesson-scale-c-major').click();
  await page.getByTestId('perform-run').click();
  await expect(page.getByTestId('perform-status')).toHaveText('Đang biểu diễn', { timeout: 10_000 });
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'Chơi lại từ đầu' }).click();
  await page.waitForTimeout(500);
  expect(await storedPerforms(page)).toBe(1);
  await page.goto('/?screen=library');
  await page.getByRole('button', { name: 'Cài đặt' }).click();
  await expect(page.getByTestId('perform-log-status')).toContainText('1 lượt Biểu diễn');
});
