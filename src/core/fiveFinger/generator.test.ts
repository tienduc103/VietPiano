import { describe, expect, it } from 'vitest';
import { DURATION_BEATS } from '../lessons/types';
import { splitMeasures } from '../lessons/notation';
import {
  CHAIN_LENGTH,
  chainKey,
  chainSteps,
  generateChain,
  mixSeed,
  nextChain,
  satisfiesRules,
  singleHandSteps,
  stepsToLesson,
  type FiveFingerDifficulty,
  type HandMode,
} from './generator';
import { placementKeys, separateHands, validOctaves, HAND_POSITIONS, sanitizePlacement, fingerFor, placementPitch } from './positions';

const DIFFS: FiveFingerDifficulty[] = ['easy', 'medium', 'hard'];
const MODES: HandMode[] = ['right', 'left', 'alternate', 'together'];
const P = { position: 'C' as const, rightOctave: 4, leftOctave: 3 };

describe('vị trí bàn tay', () => {
  it('mặc định tay phải C4–G4, tay trái C3–G3; ngón đúng theo tay', () => {
    expect(placementKeys({ position: 'C', octave: 4 })).toEqual([60, 62, 64, 65, 67]);
    expect(placementKeys({ position: 'C', octave: 3 })).toEqual([48, 50, 52, 53, 55]);
    expect([0, 1, 2, 3, 4].map((i) => fingerFor('right', i))).toEqual([1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4].map((i) => fingerFor('left', i))).toEqual([5, 4, 3, 2, 1]);
  });

  it('tên nốt viết theo giọng (Fa thăng, Si giáng)', () => {
    expect([0, 1, 2, 3, 4].map((i) => placementPitch({ position: 'D', octave: 4 }, i))).toEqual(['D4', 'E4', 'F#4', 'G4', 'A4']);
    expect(placementPitch({ position: 'F', octave: 3 }, 3)).toBe('Bb3');
    expect(placementPitch({ position: 'G', octave: 4 }, 3)).toBe('C5');
  });

  it('mọi thế + quãng tám hợp lệ nằm trong tầm micro 36–84', () => {
    for (const p of HAND_POSITIONS) {
      for (const hand of ['right', 'left'] as const) {
        const octaves = validOctaves(hand, p.id);
        expect(octaves.length).toBeGreaterThan(0);
        for (const octave of octaves) {
          const keys = placementKeys({ position: p.id, octave });
          expect(keys[0]).toBeGreaterThanOrEqual(36);
          expect(keys[4]).toBeLessThanOrEqual(84);
        }
      }
    }
  });

  it('hai tay không chồng phím', () => {
    const r = separateHands({ position: 'Am', octave: 3 }, { position: 'Am', octave: 4 });
    expect(placementKeys(r.left)[4]).toBeLessThan(placementKeys(r.right)[0]);
    expect(sanitizePlacement({ position: 'G', octave: 9 }, 'right')).toEqual({ position: 'G', octave: 4 });
  });
});

describe('bộ tạo chuỗi 8 nốt', () => {
  it('cùng seed → cùng chuỗi (tái tạo được); khác seed → thường khác', () => {
    for (const handMode of MODES) {
      for (const difficulty of DIFFS) {
        const a = generateChain({ handMode, difficulty }, 12345);
        const b = generateChain({ handMode, difficulty }, 12345);
        expect(a).toEqual(b);
      }
    }
    expect(chainKey(generateChain({ handMode: 'right', difficulty: 'easy' }, 1))).not.toBe(chainKey(generateChain({ handMode: 'right', difficulty: 'easy' }, 2)));
  });

  it.each(MODES.flatMap((m) => DIFFS.map((d) => [m, d] as const)))('%s / %s: 8 sự kiện, chỉ 5 phím của vị trí, đúng luật độ khó', (handMode, difficulty) => {
    for (let seed = 0; seed < 300; seed++) {
      const chain = generateChain({ handMode, difficulty }, mixSeed(seed, 7));
      const steps = chainSteps(chain, P);
      expect(steps).toHaveLength(CHAIN_LENGTH);
      const rightKeys = placementKeys({ position: 'C', octave: 4 });
      const leftKeys = placementKeys({ position: 'C', octave: 3 });
      for (const st of steps) {
        expect(st.notes.length).toBe(handMode === 'together' ? 2 : 1);
        for (const n of st.notes) expect((n.hand === 'right' ? rightKeys : leftKeys)).toContain(n.midi);
      }
      if (chain.right) expect(satisfiesRules(chain.right, difficulty)).toBe(true);
      if (chain.left) expect(satisfiesRules(chain.left, difficulty)).toBe(true);
      // 8 sự kiện = 2 ô 4/4 tròn phách.
      expect(chain.durations.reduce((s, d) => s + DURATION_BEATS[d], 0)).toBe(8);
      if (difficulty !== 'hard') expect(chain.durations.every((d) => d === 'q')).toBe(true);
    }
  });

  it('Dễ: chỉ liền bậc / lặp, tối đa một lần cách 1 phím; Trung bình: có nhảy cách 1 phím + nốt lặp, không nhảy xa hơn; Khó: có bước nhảy ≥ 3 phím', () => {
    const moves = (seq: number[]) => seq.slice(1).map((x, i) => Math.abs(x - seq[i]));
    for (let seed = 0; seed < 300; seed++) {
      const easy = moves(generateChain({ handMode: 'right', difficulty: 'easy' }, seed).right!);
      expect(easy.every((d) => d <= 2)).toBe(true);
      expect(easy.filter((d) => d === 2).length).toBeLessThanOrEqual(1);
      const medium = moves(generateChain({ handMode: 'right', difficulty: 'medium' }, seed).right!);
      expect(medium.every((d) => d <= 2)).toBe(true);
      expect(medium).toContain(2);
      expect(medium).toContain(0);
      const hard = moves(generateChain({ handMode: 'left', difficulty: 'hard' }, seed).left!);
      expect(hard.some((d) => d >= 3)).toBe(true);
    }
  });

  it('Khó có trường độ thay đổi ở một số chuỗi', () => {
    const varied = Array.from({ length: 100 }, (_, s) => generateChain({ handMode: 'right', difficulty: 'hard' }, s)).filter((c) => c.durations.some((d) => d !== 'q'));
    expect(varied.length).toBeGreaterThan(30);
  });

  it.each(DIFFS)('%s: sinh được hàng trăm chuỗi khác nhau', (difficulty) => {
    const keys = new Set(Array.from({ length: 2000 }, (_, s) => chainKey(generateChain({ handMode: 'right', difficulty }, mixSeed(99, s)))));
    expect(keys.size).toBeGreaterThan(difficulty === 'easy' ? 150 : 500);
  });

  it('tránh lặp lại nguyên chuỗi vừa hoàn thành, seed thực sự dùng tái tạo được chuỗi', () => {
    const params = { handMode: 'right' as const, difficulty: 'easy' as const };
    const first = generateChain(params, 42);
    const next = nextChain(params, 42, [chainKey(first)]);
    expect(chainKey(next)).not.toBe(chainKey(first));
    expect(generateChain(params, next.seed)).toEqual(next);
  });

  it('ưu tiên chuyển động yếu (focus) → chuyển động đó xuất hiện', () => {
    const focus = [{ hand: 'right' as const, from: 3, to: 4 }];
    let withFocus = 0;
    for (let s = 0; s < 100; s++) {
      const seq = generateChain({ handMode: 'right', difficulty: 'easy', focus }, s).right!;
      if (seq.some((x, i) => i > 0 && seq[i - 1] === 3 && x === 4)) withFocus++;
    }
    expect(withFocus).toBeGreaterThan(95);
  });

  it('hai tay: Dễ cùng số ngón (ngược chiều), Trung bình song song, Khó độc lập', () => {
    const easy = generateChain({ handMode: 'together', difficulty: 'easy' }, 5);
    const steps = chainSteps(easy, P);
    expect(steps.every((s) => s.notes[0].finger === s.notes[1].finger)).toBe(true);
    const medium = generateChain({ handMode: 'together', difficulty: 'medium' }, 5);
    expect(medium.left).toEqual(medium.right);
    const differs = Array.from({ length: 20 }, (_, s) => generateChain({ handMode: 'together', difficulty: 'hard' }, s)).some((c) => c.left!.join() !== c.right!.join());
    expect(differs).toBe(true);
  });

  it('luân phiên: R L R L…, mỗi tay 4 nốt', () => {
    const steps = chainSteps(generateChain({ handMode: 'alternate', difficulty: 'medium' }, 3), P);
    expect(steps.map((s) => s.notes[0].hand)).toEqual(['right', 'left', 'right', 'left', 'right', 'left', 'right', 'left']);
    expect(singleHandSteps(steps, 'left')).toHaveLength(4);
  });
});

describe('chuỗi → khuông nhạc', () => {
  it.each(MODES)('%s: bài khuông nhạc đúng khoá, đủ phách mỗi ô', (handMode) => {
    const steps = chainSteps(generateChain({ handMode, difficulty: 'hard' }, 11), { position: 'D', rightOctave: 4, leftOctave: 3 });
    const lesson = stepsToLesson(steps, { position: 'D', rightOctave: 4, leftOctave: 3 }, { id: 'x', title: 'x', fingers: true });
    expect(lesson.keySignature).toBe('D');
    expect(lesson.clef).toBe(handMode === 'right' ? 'treble' : handMode === 'left' ? 'bass' : 'grand');
    const measures = splitMeasures(lesson.notes, 4);
    expect(measures).toHaveLength(2);
    if (handMode === 'together') {
      expect(lesson.accompaniment).toHaveLength(8);
      expect(lesson.accompaniment!.every((a) => a.midis.length === 1 && a.fingers[0] !== undefined)).toBe(true);
    }
    expect(lesson.notes.every((n) => n.finger !== undefined)).toBe(true);
  });

  it('Khó: không vẽ số ngón', () => {
    const steps = chainSteps(generateChain({ handMode: 'right', difficulty: 'hard' }, 1), P);
    expect(stepsToLesson(steps, P, { id: 'x', title: 'x', fingers: false }).notes.every((n) => n.finger === undefined)).toBe(true);
  });
});
