import { describe, expect, it } from 'vitest';
import { seeded } from '../games/random';
import { DURATION_BEATS } from '../lessons/types';
import { BIRD_X, DIFFICULTY_CONFIG, FlappyNoteGame, flappyStars, GROUND_Y, liftScale, LIFE_BONUS, PIPE_POINTS, PIPE_WIDTH, summarize, UPCOMING, WORLD_HEIGHT, type FlappyConfig } from './FlappyNoteGame';
import { FLAPPY_LEVELS, findLevel, melodyNotes } from './levels';

const level = findLevel('rh-c-position')!;
const NOTES = level.notes;

/** Không có ống (ống đầu rất xa) — để thử riêng trọng lực / nốt. */
const NO_PIPES: Partial<FlappyConfig> = { firstPipeOffset: 1e6 };

function run(game: FlappyNoteGame, from: number, to: number, step = 16): number {
  let t = from;
  for (; t <= to; t += step) game.tick(t);
  return t;
}

describe('FlappyNoteGame', () => {
  it('ready: chim lơ lửng, ống đứng yên tới nốt đúng đầu tiên', () => {
    const g = new FlappyNoteGame(NOTES, { config: NO_PIPES }, seeded(1));
    const y0 = g.getWorld().birdY;
    run(g, 0, 3000);
    expect(g.getState().status).toBe('ready');
    expect(g.getWorld().birdY).toBe(y0);
    expect(g.getWorld().distance).toBe(0);
    // Sai lúc chuẩn bị: ghi sai, vẫn chờ.
    const wrong = NOTES.find((n) => n.midi !== g.getState().target.midi)!.midi;
    expect(g.answer(wrong, 3100)).toBe('wrong');
    expect(g.getState().status).toBe('ready');
    expect(g.answer(g.getState().target.midi, 3300)).toBe('hit');
    expect(g.getState().status).toBe('playing');
    run(g, 3316, 3500);
    expect(g.getWorld().birdY).toBeLessThan(y0);
    expect(g.getWorld().distance).toBeGreaterThan(0);
  });

  it('nốt đúng → nâng chim + sang nốt kế; sai → không nâng, mất chuỗi, giữ nốt', () => {
    const g = new FlappyNoteGame(NOTES, { config: NO_PIPES }, seeded(2));
    g.answer(g.getState().target.midi, 0);
    run(g, 16, 1000);
    const vyBefore = g.getWorld().birdVy;
    expect(vyBefore).toBeGreaterThan(0); // đang rơi
    const target = g.getState().target;
    const wrong = NOTES.find((n) => n.midi !== target.midi)!.midi;
    expect(g.answer(wrong, 1010)).toBe('wrong');
    expect(g.getWorld().birdVy).toBeGreaterThan(0);
    expect(g.getState().target).toBe(target);
    expect(g.getState().combo).toBe(0);
    expect(g.answer(target.midi, 1200)).toBe('hit');
    expect(g.getWorld().birdVy).toBe(-g.config.flapVelocity);
    expect(g.getState().target.midi).not.toBe(target.midi); // ngẫu nhiên không lặp liền
    expect(g.getState().combo).toBe(1);
  });

  it('mỗi sự kiện tiến tối đa một nốt; sự kiện quá sát bị bỏ', () => {
    const g = new FlappyNoteGame(NOTES, { config: NO_PIPES }, seeded(3));
    const first = g.getState().target.midi;
    g.answer(first, 1000);
    const second = g.getState().target.midi;
    expect(g.answer(second, 1000 + g.config.minIntervalMs - 1)).toBe('ignored');
    expect(g.getState().target.midi).toBe(second);
    expect(g.getState().hits).toBe(1);
    // Sai rồi sửa ngay: nốt đúng vẫn được nhận.
    const wrong = NOTES.find((n) => n.midi !== second)!.midi;
    expect(g.answer(wrong, 1500)).toBe('wrong');
    expect(g.answer(second, 1520)).toBe('hit');
  });

  it('luôn biết trước UPCOMING nốt; chế độ chuỗi đi đúng thứ tự rồi vòng lại', () => {
    const melody = melodyNotes(level, level.melodies.find((m) => m.id === 'ode-to-joy')!);
    const g = new FlappyNoteGame(melody, { mode: 'sequence', config: NO_PIPES });
    expect(g.getState().upcoming).toHaveLength(UPCOMING);
    expect([g.getState().target, ...g.getState().upcoming].map((n) => n.pitch)).toEqual(['E4', 'E4', 'F4', 'G4']);
    let t = 0;
    for (let i = 0; i < melody.length; i++) {
      expect(g.getState().target.pitch).toBe(melody[i].pitch);
      expect(g.answer(melody[i].midi, (t += 200))).toBe('hit');
      g.tick(t);
      // Giữ chim không rơi xuống đất trong test.
      (g.getWorld() as { birdY: number }).birdY = WORLD_HEIGHT / 3;
    }
    expect(g.getState().target.pitch).toBe(melody[0].pitch);
  });

  it('không đánh → rơi chạm đất: mất mạng, bất tử một lúc, hết mạng thì thua', () => {
    const g = new FlappyNoteGame(NOTES, { config: { ...NO_PIPES, lives: 2, invincibleMs: 1000 } }, seeded(4));
    g.answer(g.getState().target.midi, 0);
    let t = 16;
    while (g.getState().crashes === 0 && t < 20_000) g.tick((t += 16));
    expect(g.getState().lives).toBe(1);
    expect(g.getState().status).toBe('playing');
    expect(g.getWorld().birdY).toBeLessThan(GROUND_Y);
    // Trong lúc bất tử chạm đất chỉ nảy lên.
    const crashAt = t;
    run(g, t + 16, crashAt + 900);
    expect(g.getState().crashes).toBe(1);
    while (g.getState().status === 'playing' && t < 40_000) g.tick((t += 16));
    expect(g.getState().status).toBe('over');
    expect(g.getState().lives).toBe(0);
    expect(g.stars).toBe(0);
    expect(g.answer(g.getState().target.midi, t + 500)).toBe('ignored');
  });

  it('ống: khe trong khung, lệch không quá maxGapShift; bay giữa khe thì qua được, đủ ống thì về đích', () => {
    const cfg: Partial<FlappyConfig> = { pipes: 4 };
    const g = new FlappyNoteGame(NOTES, { difficulty: 'normal', config: cfg }, seeded(5));
    const pipes = g.getWorld().pipes;
    expect(pipes).toHaveLength(4);
    for (let i = 0; i < pipes.length; i++) {
      expect(pipes[i].gapY - pipes[i].gap / 2).toBeGreaterThan(0);
      expect(pipes[i].gapY + pipes[i].gap / 2).toBeLessThan(GROUND_Y);
      if (i > 0) expect(Math.abs(pipes[i].gapY - pipes[i - 1].gapY)).toBeLessThanOrEqual(g.config.maxGapShift + 1e-9);
    }
    g.answer(g.getState().target.midi, 0);
    // "Phi công tự động": đặt chim ở tâm khe của ống sắp tới (kiểm tra va chạm + đếm ống, không phải vật lý bay).
    let t = 0;
    while (g.getState().status === 'playing' && t < 60_000) {
      const w = g.getWorld() as { birdY: number; birdVy: number; pipes: typeof pipes };
      const next = w.pipes.find((p) => p.x + PIPE_WIDTH >= BIRD_X - 30);
      w.birdY = next ? next.gapY : WORLD_HEIGHT / 3;
      w.birdVy = 0;
      g.tick((t += 16));
    }
    expect(g.getState().status).toBe('won');
    expect(g.getState().crashes).toBe(0);
    expect(g.getState().pipesPassed).toBe(4);
    expect(g.getState().score).toBeGreaterThanOrEqual(4 * PIPE_POINTS + g.config.lives * LIFE_BONUS);
  });

  it('bay vào thân ống → va chạm', () => {
    const g = new FlappyNoteGame(NOTES, { difficulty: 'normal', config: { pipes: 3 } }, seeded(6));
    g.answer(g.getState().target.midi, 0);
    let t = 0;
    while (g.getState().crashes === 0 && t < 30_000) {
      const w = g.getWorld() as { birdY: number; birdVy: number; pipes: { gapY: number; gap: number }[] };
      // Giữ chim ngay dưới mép trên của khe → chạm ống trên khi ống tới.
      w.birdY = w.pipes[0].gapY - w.pipes[0].gap / 2 - 5;
      w.birdVy = 0;
      g.tick((t += 16));
    }
    expect(g.getState().crashes).toBe(1);
    expect(g.getState().pipesPassed).toBe(0);
  });

  it('tạm dừng: thế giới đứng yên, bỏ nốt; chạy tiếp không nhảy cóc', () => {
    const g = new FlappyNoteGame(NOTES, { config: NO_PIPES }, seeded(7));
    g.answer(g.getState().target.midi, 0);
    run(g, 16, 200);
    g.pause(200);
    const { birdY, distance } = g.getWorld();
    run(g, 216, 5000);
    expect(g.getWorld().birdY).toBe(birdY);
    expect(g.getWorld().distance).toBe(distance);
    expect(g.answer(g.getState().target.midi, 5000)).toBe('ignored');
    g.resume(5000);
    g.tick(5016);
    expect(g.getWorld().distance - distance).toBeCloseTo(g.config.speed * 0.016, 5);
  });

  it('thống kê: thời gian phản xạ, nốt nhầm, nốt yếu', () => {
    const g = new FlappyNoteGame(NOTES, { config: NO_PIPES }, seeded(8));
    g.answer(g.getState().target.midi, 0);
    run(g, 16, 496);
    const target = g.getState().target;
    const wrong = NOTES.find((n) => n.midi !== target.midi)!.midi;
    run(g, 512, 700);
    g.answer(wrong, 700);
    run(g, 704, 992);
    g.answer(target.midi, 1000);
    const stat = g.getState().stats[target.midi];
    expect(stat.wrongs).toBe(1);
    expect(stat.confusedWith[wrong]).toBe(1);
    expect(stat.reactionMs).toBeCloseTo(1000, 0);
    const sum = summarize(g);
    expect(sum.weakNotes).toEqual([target.midi]);
    expect(sum.hits).toBe(2);
    expect(sum.accuracy).toBeCloseTo(2 / 3);
  });

  it('sao theo về đích, chính xác, va chạm', () => {
    expect(flappyStars({ won: false, accuracy: 1, crashes: 0 })).toBe(0);
    expect(flappyStars({ won: true, accuracy: 0.5, crashes: 2 })).toBe(1);
    expect(flappyStars({ won: true, accuracy: 0.85, crashes: 0 })).toBe(2);
    expect(flappyStars({ won: true, accuracy: 0.95, crashes: 1 })).toBe(2);
    expect(flappyStars({ won: true, accuracy: 0.95, crashes: 0 })).toBe(3);
  });

  it('độ khó dễ: một lần nâng giữ chim đủ lâu để đọc nốt (≥ 1,5 s mới rơi về chỗ cũ)', () => {
    const { gravity, flapVelocity } = DIFFICULTY_CONFIG.easy;
    expect((2 * flapVelocity) / gravity).toBeGreaterThanOrEqual(1.5);
  });
});

describe('Siêu dễ: trường độ', () => {
  const ode = melodyNotes(level, level.melodies.find((m) => m.id === 'ode-to-joy')!);

  it('ngẫu nhiên: mỗi nốt có trường độ bốc từ danh sách; biết trước nhiều nốt hơn', () => {
    const g = new FlappyNoteGame(NOTES, { difficulty: 'super-easy' }, seeded(11));
    const all = [g.getState().target, ...g.getState().upcoming];
    expect(g.getState().upcoming).toHaveLength(DIFFICULTY_CONFIG['super-easy'].upcoming);
    for (const n of all) expect(DIFFICULTY_CONFIG['super-easy'].durations).toContain(n.duration);
    // Đủ nhiều lượt thì gặp nhiều trường độ khác nhau.
    const seen = new Set<string | undefined>();
    let t = 0;
    for (let i = 0; i < 40; i++) {
      seen.add(g.getState().target.duration);
      g.answer(g.getState().target.midi, (t += 300));
      (g.getWorld() as { birdY: number }).birdY = WORLD_HEIGHT / 2;
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it('chuỗi nốt: giữ trường độ của giai điệu; độ khó thường thì bỏ trường độ', () => {
    const g = new FlappyNoteGame(ode, { mode: 'sequence', difficulty: 'super-easy' });
    expect([g.getState().target, ...g.getState().upcoming].map((n) => n.duration)).toEqual(['q', 'q', 'q', 'q', 'q', 'q']);
    const normal = new FlappyNoteGame(ode, { mode: 'sequence', difficulty: 'normal' });
    expect(normal.getState().target.duration).toBeUndefined();
    expect(normal.getState().upcoming).toHaveLength(UPCOMING);
  });

  it('nốt dài bay cao hơn: vận tốc nâng theo trường độ; không trường độ = như nốt đen', () => {
    expect(liftScale(undefined)).toBe(1);
    expect(liftScale('q')).toBe(1);
    expect(liftScale('8')).toBeLessThan(1);
    expect(liftScale('h')).toBeGreaterThan(1);
    expect(liftScale('w')).toBeGreaterThan(liftScale('h'));
    // Giai điệu có nốt trắng: lực nâng lúc đánh đúng nốt đó lớn hơn nốt đen.
    const notes = melodyNotes(level, { id: 't', label: 't', notation: 'C4 D4/h E4/w', source: 'test' });
    const g = new FlappyNoteGame(notes, { mode: 'sequence', difficulty: 'super-easy' });
    const v = g.config.flapVelocity;
    g.answer(60, 0);
    expect(g.getWorld().birdVy).toBeCloseTo(-v);
    g.answer(62, 500);
    expect(g.getWorld().birdVy).toBeCloseTo(-v * liftScale('h'));
    g.answer(64, 1000);
    expect(g.getWorld().birdVy).toBeCloseTo(-v * liftScale('w'));
  });

  it('siêu dễ rơi chậm hơn dễ và cần đánh dày hơn (một nốt đen nâng thấp hơn)', () => {
    const se = DIFFICULTY_CONFIG['super-easy'];
    const easy = DIFFICULTY_CONFIG.easy;
    expect(se.maxFallSpeed).toBeLessThan(easy.maxFallSpeed);
    expect(se.flapVelocity ** 2 / se.gravity).toBeLessThan(easy.flapVelocity ** 2 / easy.gravity);
    expect(se.gap).toBeGreaterThan(easy.gap);
    expect(se.lives).toBeGreaterThan(easy.lives);
  });
});

describe('levels', () => {
  it('nốt trong tầm micro, ngón không trùng trong một tay, giai điệu chỉ dùng nốt của màn', () => {
    for (const l of FLAPPY_LEVELS) {
      expect(new Set(l.notes.map((n) => n.midi)).size).toBe(l.notes.length);
      for (const n of l.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(36);
        expect(n.midi).toBeLessThanOrEqual(84);
        expect(n.clef).toBe(n.hand === 'right' ? 'treble' : 'bass');
      }
      for (const hand of ['left', 'right'] as const) {
        const fingers = l.notes.filter((n) => n.hand === hand && n.finger).map((n) => n.finger);
        expect(new Set(fingers).size).toBe(fingers.length);
      }
      for (const m of l.melodies) {
        expect(m.source).toBeTruthy();
        const beats = melodyNotes(l, m).reduce((a, n) => a + DURATION_BEATS[n.duration!], 0);
        expect(beats % 4, `${l.id}/${m.id} đủ ô nhịp 4/4`).toBe(0);
      }
    }
  });

  it('thế Đô: tay phải ngón 1 ở Đô4, tay trái ngón 5 ở Đô3', () => {
    const both = findLevel('both-c-position')!;
    expect(both.notes.find((n) => n.pitch === 'C4')).toMatchObject({ hand: 'right', finger: 1 });
    expect(both.notes.find((n) => n.pitch === 'C3')).toMatchObject({ hand: 'left', finger: 5 });
    expect(both.notes.find((n) => n.pitch === 'G3')).toMatchObject({ hand: 'left', finger: 1 });
  });
});
