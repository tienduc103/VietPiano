import { describe, expect, it } from 'vitest';
import { seeded } from '../games/random';
import { DEFAULT_SETTINGS, type ExploreLevel } from './config';
import type { Press } from './PressTracker';
import { buildAdventure, gardenTargets, judgeDuration, judgeGarden, judgeRegister, listenDurationTask, listenPitchTask, nextGardenTask, PathFollower } from './tasks';

const T = DEFAULT_SETTINGS;
const press = (midi: number, durationMs: number, extra: Partial<Press> = {}): Press => ({
  midi,
  onAt: 0,
  offAt: durationMs,
  durationMs,
  source: 'midi',
  sustainedByPedal: false,
  aborted: false,
  ...extra,
});

describe('listenPitchTask', () => {
  it('đáp án khớp với nốt phát ra ở mọi mức', () => {
    for (const level of [1, 2, 3] as ExploreLevel[]) {
      const rnd = seeded(level * 7);
      for (let i = 0; i < 50; i++) {
        const t = listenPitchTask(level, rnd);
        if (t.variant === 'register') {
          expect(t.answer === 'high' ? t.notes[0] >= 67 : t.notes[0] <= 59).toBe(true);
        } else {
          const up = t.notes.every((n, j) => j === 0 || n > t.notes[j - 1]);
          const down = t.notes.every((n, j) => j === 0 || n < t.notes[j - 1]);
          expect(t.answer === 'up' ? up : down).toBe(true);
        }
      }
    }
  });
  it('mức 1 chỉ có câu cao / thấp; mức 3 không còn câu một nốt', () => {
    const r = seeded(3);
    for (let i = 0; i < 30; i++) expect(listenPitchTask(1, r).variant).toBe('register');
    for (let i = 0; i < 30; i++) expect(listenPitchTask(3, r).variant).not.toBe('register');
  });
});

describe('listenDurationTask', () => {
  it('hai tiếng khác trường độ, đáp án trỏ đúng tiếng được hỏi', () => {
    const r = seeded(1);
    for (let i = 0; i < 40; i++) {
      const t = listenDurationTask(r);
      expect(t.order[0]).not.toBe(t.order[1]);
      expect(t.order[t.answer]).toBe(t.ask);
    }
  });
});

describe('judgeDuration / judgeRegister', () => {
  it('chấm riêng từng thành phần, khoảng giữa = chưa rõ (không phải sai)', () => {
    expect(judgeDuration(400, 'short', T)).toBe('ok');
    expect(judgeDuration(2000, 'short', T)).toBe('needShorter');
    expect(judgeDuration(400, 'long', T)).toBe('needLonger');
    expect(judgeDuration(1000, 'long', T)).toBe('unclear');
    expect(judgeDuration(1600, 'long', T)).toBe('ok');
    // Chạm vội: muốn ngắn → bỏ qua lần nhấn; muốn dài → nhắc giữ lâu hơn.
    expect(judgeDuration(50, 'short', T)).toBeNull();
    expect(judgeDuration(50, 'long', T)).toBe('needLonger');
  });
  it('cao độ chỉ theo số nốt — lực gõ không liên quan', () => {
    expect(judgeRegister(76, 'high', T)).toBe('ok');
    expect(judgeRegister(60, 'high', T)).toBe('needHigher');
    expect(judgeRegister(76, 'low', T)).toBe('needLower');
  });
});

describe('judgeGarden — phản hồi theo thành phần', () => {
  const highLong = { kind: 'garden', register: 'high', duration: 'long' } as const;
  it('cao + dài đúng → hoa nở', () => {
    expect(judgeGarden(press(76, 2000), highLong, T)?.outcome).toBe('bloom');
  });
  it('cao đúng nhưng ngắn → hướng dẫn giữ lâu hơn', () => {
    const v = judgeGarden(press(76, 300), highLong, T);
    expect(v).toMatchObject({ pitch: 'ok', duration: 'needLonger', outcome: 'fixDuration' });
  });
  it('thấp nhưng dài đúng → gợi ý phím cao hơn', () => {
    expect(judgeGarden(press(50, 2000), highLong, T)).toMatchObject({ pitch: 'needHigher', duration: 'ok', outcome: 'fixPitch' });
  });
  it('chưa đúng cả hai → nghe lại ví dụ', () => {
    expect(judgeGarden(press(50, 300), highLong, T)?.outcome).toBe('retryBoth');
  });
  it('thời lượng chưa rõ → mời thử lại, không báo sai', () => {
    expect(judgeGarden(press(76, 1000), highLong, T)?.outcome).toBe('retryUnclear');
  });
  it('pedal giữ âm ngân không làm ngắn thành dài; lần nhấn bị ngắt do mất kết nối thì bỏ', () => {
    expect(judgeGarden(press(76, 300, { sustainedByPedal: true }), highLong, T)?.duration).toBe('needLonger');
    expect(judgeGarden(press(76, 2000, { aborted: true }), highLong, T)).toBeNull();
  });
  it('2 lựa chọn khác nhau ở cả hai thành phần; 4 lựa chọn đủ tổ hợp; không lặp mục tiêu liền nhau', () => {
    const two = gardenTargets(2);
    expect(two[0].register).not.toBe(two[1].register);
    expect(two[0].duration).not.toBe(two[1].duration);
    expect(new Set(gardenTargets(4).map((t) => `${t.register}-${t.duration}`)).size).toBe(4);
    const r = seeded(5);
    let prev = nextGardenTask(4, r);
    for (let i = 0; i < 30; i++) {
      const next = nextGardenTask(4, r, prev);
      expect(`${next.register}${next.duration}`).not.toBe(`${prev.register}${prev.duration}`);
      prev = next;
    }
  });
});

describe('PathFollower — đường bay theo giai điệu', () => {
  it('đi lên: nốt sai hướng / trùng không tính, mốc giữ nốt đúng trước đó', () => {
    const p = new PathFollower('up', 3);
    expect(p.feed(60)).toBe('start');
    expect(p.feed(58)).toBe('wrongDirection');
    expect(p.feed(60)).toBe('same');
    expect(p.feed(62)).toBe('step');
    expect(p.feed(61)).toBe('wrongDirection'); // so với 62, không phải với 58
    expect(p.feed(64)).toBe('done');
    expect(p.played()).toEqual([60, 62, 64]);
  });
  it('đi xuống', () => {
    const p = new PathFollower('down', 2);
    p.feed(72);
    expect(p.feed(70)).toBe('done');
    expect(p.isDone()).toBe(true);
  });
});

describe('buildAdventure', () => {
  it('5 / 6 / 7 nhiệm vụ, đủ năm loại, có hướng dẫn nghe + đánh', () => {
    for (const [level, n] of [
      [1, 5],
      [2, 6],
      [3, 7],
    ] as [ExploreLevel, number][]) {
      for (let s = 0; s < 20; s++) {
        const tasks = buildAdventure(level, seeded(s));
        expect(tasks).toHaveLength(n);
        const kinds = new Set(tasks.map((t) => t.kind));
        for (const k of ['listen-pitch', 'listen-duration', 'play-register', 'hold', 'melody']) expect(kinds.has(k as never)).toBe(true);
      }
    }
  });
});
