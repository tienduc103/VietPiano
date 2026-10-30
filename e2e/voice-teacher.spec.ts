import { expect, test, type Page } from '@playwright/test';

/**
 * Cô giáo giọng nói: Chromium headless không có giọng tiếng Việt → giả `speechSynthesis` (ghi lại câu đọc,
 * mỗi câu "đọc" 150 ms). Kiểm tra: đọc theo sự kiện, huỷ câu cũ khi chuyển bài, máy không có giọng tiếng Việt,
 * giao diện người lớn không đọc. Các test này tắt giọng thu sẵn (`voice/index.json` → 404) để đi đường giọng máy;
 * test cuối kiểm tra giọng thu sẵn (giả `play()` của thẻ audio, ghi lại file đã phát).
 */
async function mockSpeech(page: Page, opts: { vietnamese: boolean; uiMode: 'kids' | 'adult'; recorded?: boolean }) {
  if (!opts.recorded) await page.route('**/voice/index.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(({ vietnamese, uiMode }) => {
    localStorage.setItem('vietpiano.settings.v1', JSON.stringify({ uiMode }));
    const w = window as unknown as Record<string, unknown>;
    const log = { spoken: [] as string[], cancels: 0, played: [] as string[] };
    w.__speech = log;
    // Thẻ <audio>: không phát thật, ghi lại file và báo phát xong sau 100 ms.
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!this.src.startsWith('data:')) log.played.push(this.src);
      const el = this;
      window.setTimeout(() => el.dispatchEvent(new Event('ended')), 100);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = () => undefined;
    const voices = [
      { name: 'Samantha', lang: 'en-US', localService: true, voiceURI: 'Samantha', default: true },
      ...(vietnamese ? [{ name: 'Linh', lang: 'vi-VN', localService: true, voiceURI: 'Linh', default: false }] : []),
    ];
    let timer = 0;
    let current: { onend?: (() => void) | null } | null = null;
    class Utterance {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    w.SpeechSynthesisUtterance = Utterance;
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        addEventListener: () => undefined,
        speak(u: Utterance) {
          if (!u.text) return;
          log.spoken.push(u.text);
          current = u;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => {
            current = null;
            u.onend?.();
          }, 150);
        },
        cancel() {
          if (current) log.cancels++;
          current = null;
          window.clearTimeout(timer);
        },
      },
    });
  }, opts);
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { spoken: string[] } }).__speech.spoken);
const cancels = (page: Page) => page.evaluate(() => (window as unknown as { __speech: { cancels: number } }).__speech.cancels);

test('Kids Mode: cô đọc lời chào buổi, trang giới thiệu, nốt cần đánh; sai thì nhắc nhẹ; chuyển bài thì huỷ câu cũ', async ({ page }) => {
  await mockSpeech(page, { vietnamese: true, uiMode: 'kids' });
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-04-cde').click();

  // Câu khai báo trong dữ liệu bài thay câu mặc định.
  await expect(page.getByTestId('voice-caption')).toHaveText('Chào bé! Hôm nay mình chơi ba nốt Đô, Rê, Mi. Bấm Bắt đầu nhé!');
  await expect.poll(() => spoken(page)).toContain('Chào bé! Hôm nay mình chơi ba nốt Đô, Rê, Mi. Bấm Bắt đầu nhé!');

  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('voice-caption')).toHaveText('Đô bên trái nhóm 2 phím đen, Rê ở giữa hai phím đen, Mi bên phải.');
  await expect.poll(() => spoken(page)).toContain('Đô bên trái nhóm 2 phím đen, Rê ở giữa hai phím đen, Mi bên phải.');

  // Nghe lại.
  const before = (await spoken(page)).length;
  await page.getByTestId('voice-replay').click();
  await expect.poll(async () => (await spoken(page)).length).toBe(before + 1);

  await page.getByTestId('intro-next').click();
  await page.getByTestId('intro-next').click();
  await expect(page.getByTestId('wait-runner')).toBeVisible();
  // Lời dặn bài rồi tới nốt đầu tiên — không đọc chồng (câu thứ hai đợi câu đầu xong).
  await expect.poll(() => spoken(page)).toContain('Bé đánh nốt Đô, ngón 1.');
  const list = await spoken(page);
  expect(list.indexOf('Mình cùng chơi đàn nhé! Bé nhìn nốt sáng màu.')).toBeLessThan(list.indexOf('Bé đánh nốt Đô, ngón 1.'));

  // Đánh sai (E4 = phím d): nhắc nhẹ, nêu lại nốt cần đánh.
  await page.keyboard.press('d');
  await expect(page.getByTestId('voice-caption')).toHaveText(/Nốt Đô\.$/);

  // Chuyển bài: câu đang đọc bị huỷ, câu mới của bài mới.
  const c0 = await cancels(page);
  await page.getByTestId('voice-replay').click();
  await page.getByRole('button', { name: 'Về giáo trình' }).click();
  await expect.poll(() => cancels(page)).toBeGreaterThan(c0);
  await page.getByTestId('cur-lesson-l1-03-fingers').click();
  await expect(page.getByTestId('voice-caption')).toHaveText('Chào bé! Hôm nay học: Số ngón tay. Bấm nút Bắt đầu nhé.');

  // Tắt tiếng: vẫn hiện chữ, không đọc.
  await page.getByTestId('voice-mute').click();
  const n = (await spoken(page)).length;
  await page.getByTestId('start-lesson').click();
  await expect(page.getByTestId('voice-caption')).toHaveText('Ngón cái là số 1, ngón út là số 5. Giơ tay lên đếm nào!');
  await page.waitForTimeout(300);
  expect((await spoken(page)).length).toBe(n);
});

test('máy không có giọng tiếng Việt: cô chỉ hiện chữ', async ({ page }) => {
  await mockSpeech(page, { vietnamese: false, uiMode: 'kids' });
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-02-find-c').click();
  await expect(page.getByTestId('voice-caption')).toContainText('Chào bé! Hôm nay học: Tìm nốt Đô.');
  await expect(page.getByTestId('voice-no-tts')).toBeVisible();
  expect(await spoken(page)).toEqual([]);
});

test('bài tìm phím: cô đọc đề từng lượt', async ({ page }) => {
  await mockSpeech(page, { vietnamese: true, uiMode: 'kids' });
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-01-keyboard').click();
  await page.getByTestId('start-lesson').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('intro-next').click();
  const prompt = await page.getByTestId('quiz-prompt').textContent();
  await expect(page.getByTestId('voice-caption')).toHaveText(prompt!);
  await expect.poll(() => spoken(page)).toContain(prompt!);
});

test('giao diện người lớn: mặc định cô không đọc', async ({ page }) => {
  await mockSpeech(page, { vietnamese: true, uiMode: 'adult' });
  await page.goto('/?screen=curriculum');
  await page.getByTestId('cur-lesson-l1-04-cde').click();
  await expect(page.getByTestId('lesson-overview')).toBeVisible();
  await expect(page.getByTestId('voice-bar')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await spoken(page)).toEqual([]);
});

test('giọng thu sẵn: phát file mp3 theo từng câu đơn, không cần giọng của máy', async ({ page }) => {
  await mockSpeech(page, { vietnamese: false, uiMode: 'kids', recorded: true });
  const index = page.waitForResponse('**/voice/index.json');
  await page.goto('/?screen=curriculum');
  expect((await index).ok()).toBe(true);
  await page.getByTestId('cur-lesson-l1-02-find-c').click();
  // "Chào bé! Hôm nay học: Tìm nốt Đô. Bấm nút Bắt đầu nhé." → 3 câu đơn → 3 file.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __speech: { played: string[] } }).__speech.played.length)).toBeGreaterThanOrEqual(3);
  const played = await page.evaluate(() => (window as unknown as { __speech: { played: string[] } }).__speech.played);
  for (const url of played.slice(0, 3)) expect(url).toMatch(/\/voice\/vi\/[0-9a-f]{12}\.mp3$/);
  await expect(page.getByTestId('voice-no-tts')).toHaveCount(0);
  expect(await spoken(page)).toEqual([]);
  for (const url of played.slice(0, 3)) expect((await page.request.get(url)).headers()['content-type']).toContain('audio');
});
