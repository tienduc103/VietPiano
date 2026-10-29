import { describe, expect, it } from 'vitest';
import { applyArcadeResult, arcadeKey, ARCADE_KINDS, ARCADE_VARIANTS, bestOfKind, sanitizeArcadeRecords } from './arcade';
import { makeIntervalRounds } from './intervals';

describe('arcade', () => {
  it('mỗi trò có mức chơi, id không trùng, nốt nằm trong bàn phím + tầm micro', () => {
    for (const kind of ARCADE_KINDS) {
      const variants = ARCADE_VARIANTS[kind];
      expect(variants.length).toBeGreaterThan(0);
      expect(new Set(variants.map((v) => v.id)).size).toBe(variants.length);
      for (const v of variants) {
        const spec = v.spec;
        expect(spec.kind).toBe(kind);
        if (spec.kind === 'note-sprint' || spec.kind === 'ear-finder') {
          for (const m of spec.notes) {
            expect(m).toBeGreaterThanOrEqual(Math.max(36, spec.keyboard.from));
            expect(m).toBeLessThanOrEqual(Math.min(84, spec.keyboard.to));
          }
        }
        if (spec.kind === 'interval-detective') {
          expect(makeIntervalRounds({ ...spec.keyboard, intervals: spec.intervals, directions: spec.directions }, 10)).toHaveLength(10);
          expect(spec.keyboard.from).toBeGreaterThanOrEqual(36);
          expect(spec.keyboard.to).toBeLessThanOrEqual(84);
        }
      }
    }
  });

  it('kỷ lục: cộng lượt chơi, giữ điểm/sao cao nhất; gộp theo trò', () => {
    let r = applyArcadeResult({}, arcadeKey('note-sprint', 'treble-5'), { score: 500, stars: 2 });
    r = applyArcadeResult(r, arcadeKey('note-sprint', 'treble-5'), { score: 300, stars: 3 });
    r = applyArcadeResult(r, arcadeKey('note-sprint', 'bass-white'), { score: 900, stars: 1 });
    expect(r['note-sprint:treble-5']).toEqual({ plays: 2, bestScore: 500, bestStars: 3 });
    expect(bestOfKind(r, 'note-sprint')).toEqual({ plays: 3, bestScore: 900, bestStars: 3 });
    expect(bestOfKind(r, 'ear-finder')).toBeUndefined();
  });

  it('sanitize bỏ dữ liệu hỏng', () => {
    expect(sanitizeArcadeRecords(null)).toEqual({});
    expect(sanitizeArcadeRecords({ a: { plays: 2, bestScore: -1, bestStars: 9 }, b: 'x' })).toEqual({ a: { plays: 2, bestScore: 0, bestStars: 3 } });
  });
});
