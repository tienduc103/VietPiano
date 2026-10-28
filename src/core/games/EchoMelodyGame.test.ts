import { describe, expect, it } from 'vitest';
import { EchoMelodyGame, makeMelody } from './EchoMelodyGame';
import { seeded } from './random';

const NOTES = [60, 62, 64, 65, 67];
const CFG = { rounds: 3, startLength: 3, lives: 2, minIntervalMs: 100, replayPenalty: 30, hintPenalty: 40 };

/** Đánh lại đúng đoạn nhạc hiện tại, mỗi nốt cách nhau 200 ms. */
function playBack(g: EchoMelodyGame, t: number): number {
  for (const m of g.melody) {
    g.answer(m, t);
    t += 200;
  }
  return t;
}

describe('makeMelody', () => {
  it('đi theo bậc liền / cách một bậc, không lặp nốt liền nhau, chỉ dùng nốt cho trước', () => {
    const r = seeded(11);
    for (let k = 0; k < 50; k++) {
      const m = makeMelody(NOTES, 7, r);
      expect(m).toHaveLength(7);
      for (let i = 1; i < m.length; i++) {
        expect(NOTES).toContain(m[i]);
        const step = Math.abs(NOTES.indexOf(m[i]) - NOTES.indexOf(m[i - 1]));
        expect(step === 1 || step === 2).toBe(true);
      }
    }
  });

  it('hai nốt vẫn sinh được', () => {
    expect(makeMelody([60, 62], 4, seeded(1))).toHaveLength(4);
  });
});

describe('EchoMelodyGame', () => {
  it('đang nghe thì bỏ nốt; đánh đúng hết → qua vòng, đoạn sau = đoạn cũ + 1 nốt', () => {
    const g = new EchoMelodyGame(NOTES, CFG, seeded(2));
    const first = g.melody;
    expect(g.answer(first[0], 0)).toBe('ignored');
    g.listenDone();
    const t = playBack(g, 1000);
    expect(g.getState()).toMatchObject({ status: 'listen', round: 1, roundsCleared: 1, score: 300, listenId: 2 });
    expect(g.melody.slice(0, 3)).toEqual(first);
    expect(g.melody).toHaveLength(4);
    g.listenDone();
    playBack(g, t);
    g.listenDone();
    playBack(g, t + 2000);
    expect(g.getState()).toMatchObject({ status: 'finished', roundsCleared: 3, score: 300 + 400 + 500 });
    expect(g.accuracy).toBe(1);
  });

  it('sai một nốt → mất mạng, nghe lại cùng đoạn từ đầu; hết mạng → kết thúc', () => {
    const g = new EchoMelodyGame(NOTES, CFG, seeded(3));
    g.listenDone();
    const wrong = NOTES.find((m) => m !== g.melody[0])!;
    expect(g.answer(wrong, 0)).toBe('wrong');
    expect(g.getState()).toMatchObject({ status: 'listen', lives: 1, pos: 0, listenId: 2, round: 0 });
    g.listenDone();
    g.answer(g.melody[0], 500);
    expect(g.answer(NOTES.find((m) => m !== g.melody[1])!, 800)).toBe('wrong');
    expect(g.getState()).toMatchObject({ status: 'finished', lives: 0 });
  });

  it('nghe lại / gợi ý trừ điểm vòng đó', () => {
    const g = new EchoMelodyGame(NOTES, CFG, seeded(4));
    g.listenDone();
    g.replay();
    expect(g.getState()).toMatchObject({ status: 'listen', replaysThisRound: 1 });
    g.listenDone();
    expect(g.hint()).toBe(g.melody[0]);
    playBack(g, 0);
    expect(g.getState().score).toBe(300 - 30 - 40);
    expect(g.getState()).toMatchObject({ replaysThisRound: 0, hintedThisRound: false });
  });

  it('nốt quá sát nốt trước bị bỏ', () => {
    const g = new EchoMelodyGame(NOTES, CFG, seeded(5));
    g.listenDone();
    g.answer(g.melody[0], 0);
    expect(g.answer(g.melody[1], 50)).toBe('ignored');
    expect(g.getState().pos).toBe(1);
  });
});
