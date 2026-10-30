import { describe, expect, it } from 'vitest';
import { seeded } from '../games/random';
import {
  BALLOON_DURATIONS,
  balloonConfig,
  BalloonPopGame,
  balloonStars,
  DIFFICULTY_CONFIG,
  HUNT_MISTAKES,
  huntConfig,
  huntStars,
  isRush,
  LIFE_BONUS,
  rampFactor,
  RUSH_SPEED,
  summarize,
  UPCOMING,
  type BalloonConfig,
} from './BalloonPopGame';
import { keyboardRange, letterOf, matches, noteName, notePool, type BalloonMode } from './notes';

function run(game: BalloonPopGame, from: number, to: number, step = 16): number {
  let t = from;
  for (; t <= to; t += step) game.tick(t);
  return t;
}

function make(mode: BalloonMode = 'one-hand', config: Partial<BalloonConfig> = {}, seed = 1) {
  const g = new BalloonPopGame(mode, notePool(mode), { ...DIFFICULTY_CONFIG.easy, ...config }, seeded(seed));
  g.start(0);
  return g;
}

describe('notes', () => {
  it('tập nốt + ngón theo chế độ', () => {
    expect(notePool('one-hand').map((n) => `${n.letter}${n.finger}`)).toEqual(['C1', 'D2', 'E3', 'F4', 'G5']);
    expect(notePool('one-hand', 'left').map((n) => [n.midi, n.finger])).toEqual([[48, 5], [50, 4], [52, 3], [53, 2], [55, 1]]);
    expect(notePool('two-hands').map((n) => n.hand)).toEqual([...Array(5).fill('left'), ...Array(5).fill('right')]);
    expect(notePool('seven').map((n) => n.finger)).toEqual([1, 2, 3, 1, 2, 3, 4]);
    expect(notePool('seven', 'left').map((n) => n.finger)).toEqual([5, 4, 3, 2, 1, 3, 2]);
    expect(notePool('seven', 'both')).toHaveLength(14);
    const full = notePool('full');
    expect(full).toHaveLength(29);
    expect([full[0].midi, full[full.length - 1].midi]).toEqual([36, 84]);
    expect(full.find((n) => n.midi === 59)?.hand).toBe('left');
    expect(full.find((n) => n.midi === 60)?.hand).toBe('right');
  });

  it('so nốt: chế độ 5/7 nốt chỉ xét tên nốt, full phím phải đúng quãng tám; phím đen không khớp', () => {
    const c4 = notePool('one-hand')[0];
    expect(matches('one-hand', c4, 48)).toBe(true);
    expect(matches('one-hand', c4, 84)).toBe(true);
    expect(matches('one-hand', c4, 62)).toBe(false);
    const c3 = notePool('full').find((n) => n.midi === 48)!;
    expect(matches('full', c3, 48)).toBe(true);
    expect(matches('full', c3, 60)).toBe(false);
    expect(letterOf(61)).toBeNull();
    expect(matches('one-hand', c4, 61)).toBe(false);
  });

  it('tên nốt CDEFGAB / Đô Rê Mi Pha Sol La Si', () => {
    expect(noteName(65, 'letter', false)).toBe('F');
    expect(noteName(65, 'solfege', false)).toBe('Pha');
    expect(noteName(48, 'solfege', true)).toBe('Đô3');
    expect(noteName(61, 'letter', true)).toBe('');
  });

  it('bàn phím theo chế độ', () => {
    expect(keyboardRange('one-hand')).toEqual({ from: 60, to: 71 });
    expect(keyboardRange('one-hand', 'left')).toEqual({ from: 48, to: 59 });
    expect(keyboardRange('two-hands')).toEqual({ from: 48, to: 71 });
    expect(keyboardRange('full')).toEqual({ from: 36, to: 84 });
  });
});

describe('BalloonPopGame', () => {
  it('ready: chưa thả bóng, bỏ qua nốt tới khi bắt đầu', () => {
    const g = new BalloonPopGame('one-hand', notePool('one-hand'), DIFFICULTY_CONFIG.easy, seeded(1));
    run(g, 0, 3000);
    expect(g.getState().status).toBe('ready');
    expect(g.getState().balloons).toHaveLength(0);
    expect(g.answer(60, 3000)).toBe('ignored');
    g.start(3000);
    run(g, 3000, 3700);
    expect(g.getState().balloons).toHaveLength(1);
  });

  it('đúng nốt → nổ một quả + điểm; sai → mất chuỗi, bóng vẫn bay', () => {
    const g = make();
    let t = run(g, 0, 700);
    const b = g.urgent!;
    const wrong = notePool('one-hand').find((n) => n.letter !== b.note.letter)!.midi;
    expect(g.answer(wrong, t)).toBe('wrong');
    expect(g.getState().balloons).toHaveLength(1);
    expect(g.getState().stats[b.note.midi].confusedWith[wrong]).toBe(1);
    t += 200;
    // Đánh ở quãng tám khác vẫn được (chỉ xét tên nốt).
    expect(g.answer(b.note.midi + 12, t)).toBe('pop');
    const s = g.getState();
    expect(s.balloons).toHaveLength(0);
    expect(s.popped).toBe(1);
    expect(s.combo).toBe(1);
    expect(s.score).toBeGreaterThan(10);
    expect(s.lastBalloon?.balloon.id).toBe(b.id);
  });

  it('mỗi sự kiện nổ tối đa một quả (quả cao nhất), sự kiện quá sát bị bỏ', () => {
    const g = make('one-hand', { maxActive: 3, spawnIntervalMs: 300 });
    run(g, 0, 1300);
    const bs = g.getState().balloons;
    expect(bs.length).toBe(3);
    // Không hai quả cùng tên nốt cùng lúc; mỗi quả có trường độ để vẽ hình nốt.
    expect(bs.every((b) => BALLOON_DURATIONS.includes(b.duration))).toBe(true);
    expect(new Set(bs.map((b) => b.note.letter)).size).toBe(3);
    const top = bs[0];
    expect(g.answer(top.note.midi, 1300)).toBe('pop');
    expect(g.getState().balloons).toHaveLength(2);
    expect(g.answer(g.urgent!.note.midi, 1350)).toBe('ignored');
    expect(g.answer(g.urgent!.note.midi, 1500)).toBe('pop');
    expect(g.getState().popped).toBe(2);
  });

  it('full phím: phải đúng quãng tám', () => {
    const g = make('full');
    const t = run(g, 0, 700);
    const b = g.urgent!;
    expect(g.answer(b.note.midi + 12 <= 84 ? b.note.midi + 12 : b.note.midi - 12, t)).toBe('wrong');
    expect(g.answer(b.note.midi, t + 10)).toBe('pop');
  });

  it('bóng bay mất → mất mạng; hết mạng → thua', () => {
    const g = make('one-hand', { lives: 2, riseMs: 1000 });
    run(g, 0, 1700);
    expect(g.getState().escaped).toBe(1);
    expect(g.getState().lives).toBe(1);
    expect(g.getState().lastOutcome).toBe('escape');
    run(g, 1700, 5000);
    expect(g.getState().status).toBe('over');
    expect(g.stars).toBe(0);
  });

  it('nổ hết bóng → thắng, cộng thưởng mạng còn lại, 3 sao', () => {
    const g = make('two-hands', { balloons: 4 });
    let t = 0;
    for (let i = 0; i < 4; i++) {
      t = run(g, t, t + 1000);
      expect(g.answer(g.urgent!.note.midi, t)).toBe('pop');
    }
    expect(g.getState().status).toBe('won');
    expect(g.getState().score).toBeGreaterThanOrEqual(4 * 10 + g.config.lives * LIFE_BONUS);
    expect(summarize(g)).toMatchObject({ won: true, popped: 4, total: 4, escaped: 0, stars: 3 });
  });

  it('tạm dừng: bóng đứng yên, không nhận nốt', () => {
    const g = make();
    run(g, 0, 1000);
    const b = g.urgent!;
    g.pause(1000);
    const p = g.progressOf(b);
    run(g, 1000, 5000);
    expect(g.progressOf(b)).toBe(p);
    expect(g.answer(b.note.midi, 5000)).toBe('ignored');
    g.resume(5000);
    expect(g.answer(b.note.midi, 5010)).toBe('pop');
  });

  it('tốc độ nhanh bay nhanh hơn; sao', () => {
    expect(balloonConfig('normal', 'fast').riseMs).toBeLessThan(balloonConfig('normal', 'medium').riseMs);
    expect(balloonStars({ won: true, popped: 10, total: 10, escaped: 0, accuracy: 1 })).toBe(3);
    expect(balloonStars({ won: true, popped: 9, total: 10, escaped: 1, accuracy: 0.8 })).toBe(2);
    expect(balloonStars({ won: true, popped: 6, total: 10, escaped: 4, accuracy: 1 })).toBe(1);
    expect(balloonStars({ won: false, popped: 10, total: 10, escaped: 0, accuracy: 1 })).toBe(0);
  });
  it('xem trước: quả sắp thả đúng là quả bay ra kế tiếp; hết bóng thì hàng chờ ngắn lại', () => {
    const g = make('one-hand', { balloons: 4 });
    expect(g.getState().upcoming).toHaveLength(UPCOMING);
    let t = 0;
    for (let i = 0; i < 4; i++) {
      const next = g.getState().upcoming[0];
      t = run(g, t, t + 1000);
      expect(g.urgent!.note).toBe(next.note);
      expect(g.urgent!.duration).toBe(next.duration);
      expect(g.getState().upcoming).toHaveLength(Math.min(UPCOMING, 4 - (i + 1)));
      g.answer(g.urgent!.note.midi, t);
    }
    expect(g.getState().status).toBe('won');
  });

  it('mỗi 20 quả nhanh thêm 10% (tối đa 1.5); đầu mỗi mốc có đợt 5 quả bay nhanh hơn rồi trở lại', () => {
    expect([0, 19, 20, 39, 40, 200].map(rampFactor)).toEqual([1, 1, 1.1, 1.1, 1.2, 1.5]);
    expect([0, 4, 19, 20, 24, 25, 40].map(isRush)).toEqual([false, false, false, true, true, false, true]);
    const g = make('one-hand', { balloons: 30, lives: 99 });
    const rise = new Map<number, { riseMs: number; rush: boolean }>();
    let t = 0;
    while (g.getState().status === 'playing' && t < 600_000) {
      t = run(g, t, t + 400);
      for (const b of g.getState().balloons) rise.set(b.id, { riseMs: b.riseMs, rush: b.rush });
      if (g.urgent) g.answer(g.urgent.note.midi, t);
    }
    const base = DIFFICULTY_CONFIG.easy.riseMs;
    expect(rise.get(0)).toEqual({ riseMs: base, rush: false });
    expect(rise.get(20)).toEqual({ riseMs: Math.round(base / (1.1 * RUSH_SPEED)), rush: true });
    expect(rise.get(24)?.rush).toBe(true);
    expect(rise.get(25)).toEqual({ riseMs: Math.round(base / 1.1), rush: false });
  });

  it('pháo hoa: mỗi 10 nốt đúng liên tục; sai thì đếm lại', () => {
    const g = make('one-hand', { balloons: 40, lives: 99 });
    let t = 0;
    const popN = (n: number) => {
      for (let i = 0; i < n; i++) {
        t = run(g, t, t + 1000);
        expect(g.answer(g.urgent!.note.midi, t)).toBe('pop');
      }
    };
    popN(9);
    expect(g.getState().fireworks).toBe(0);
    popN(1);
    expect(g.getState().fireworks).toBe(1);
    t = run(g, t, t + 1000);
    const wrong = notePool('one-hand').find((n) => n.letter !== g.urgent!.note.letter)!.midi;
    expect(g.answer(wrong, t)).toBe('wrong');
    t += 200;
    popN(9);
    expect(g.getState().fireworks).toBe(1);
    popN(1);
    expect(g.getState().fireworks).toBe(2);
  });
});

describe('Tìm nốt', () => {
  const hunt = (letters: string[], seed = 1) => {
    const pool = notePool('one-hand').filter((n) => letters.includes(n.letter));
    const g = new BalloonPopGame('one-hand', pool, { ...huntConfig('easy', 'medium'), firstSpawnMs: 0 }, seeded(seed));
    g.start(0);
    return g;
  };

  it('chỉ thả nốt đã chọn (kể cả chỉ một nốt), không giới hạn số bóng', () => {
    const g = hunt(['E']);
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t = run(g, t, t + 1000);
      expect(g.urgent!.note.letter).toBe('E');
      expect(g.answer(g.urgent!.note.midi, t)).toBe('pop');
    }
    expect(g.getState().status).toBe('playing');
    expect(g.getState().upcoming.every((u) => u.note.letter === 'E')).toBe(true);
  });

  it('đúng → mọi quả chậm lại (tối thiểu 0.5); sai → nhanh dần, áp ngay cho quả đang bay', () => {
    const g = hunt(['C', 'G']);
    let t = run(g, 0, 500);
    const b = g.urgent!;
    const wrong = b.note.letter === 'C' ? 64 : 62;
    expect(g.answer(wrong, t)).toBe('wrong');
    expect(g.getState().speed).toBe(1.1);
    expect(g.getState().mistakes).toBe(1);
    // Quả đang bay đi nhanh hơn 1.1 lần.
    const p0 = g.progressOf(b);
    t = run(g, t, t + 1000);
    expect(g.progressOf(b) - p0).toBeCloseTo((1000 / b.riseMs) * 1.1, 2);
    expect(g.answer(b.note.midi, t)).toBe('pop');
    expect(g.getState().speed).toBe(1);
    for (let i = 0; i < 8; i++) {
      t = run(g, t, t + 1000);
      g.answer(g.urgent!.note.midi, t);
    }
    expect(g.getState().speed).toBe(0.5);
  });

  it('sai đủ 20 lần (bóng bay mất cũng tính) → hết ván; không mất mạng', () => {
    const g = hunt(['C', 'D']);
    let t = run(g, 0, 500);
    for (let i = 0; i < HUNT_MISTAKES - 1; i++) {
      const wrong = g.urgent!.note.letter === 'C' ? 64 : 60;
      expect(g.answer(wrong, t + 5)).toBe('wrong');
      t += 10;
    }
    expect(g.getState().status).toBe('playing');
    expect(g.getState().speed).toBe(2.9);
    // Để quả bay mất → lần sai thứ 20.
    run(g, t, t + 20_000);
    expect(g.getState()).toMatchObject({ status: 'over', mistakes: HUNT_MISTAKES, escaped: 1, speed: 3 });
    expect(g.getState().lives).toBe(Infinity);
    expect([0, 9, 10, 25, 50].map(huntStars)).toEqual([0, 0, 1, 2, 3]);
  });
});
