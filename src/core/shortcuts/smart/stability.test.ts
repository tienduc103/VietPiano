import { describe, expect, it } from 'vitest';
import { computeSmartShortcuts } from './engine';
import { cacheValid, smartSignature, stableOrder, toCache } from './stability';
import { DAY, NOW, passed, policy, record, records, session, smartInput } from './testing';
import type { SmartCandidate } from './types';

const cand = (key: string, score: number): SmartCandidate =>
  ({ candidateKey: key, targetKey: key, score, type: 'game', profileId: 'p1', label: key, icon: '', reason: '', calculatedAt: 0, expiresAt: 0, status: 'active' }) as unknown as SmartCandidate;

describe('chữ ký dữ liệu (chỉ tính lại khi có sự kiện có ý nghĩa)', () => {
  it('không đổi khi chỉ xem giao diện (cùng dữ liệu, cùng ngày)', () => {
    const input = smartInput({ records: records(passed('l1-01-keyboard')) });
    expect(smartSignature(input)).toBe(smartSignature({ ...input, now: NOW + 3_600_000 }));
  });

  it('đổi khi hoàn thành bài / làm bài tập / có phiên luyện mới / đổi hồ sơ / sang ngày mới / hết giờ chơi', () => {
    const base = smartInput({ records: records(passed('l1-01-keyboard'), record('l1-02-find-c', { attempts: 0 })) });
    const sig = smartSignature(base);
    const variants = [
      { ...base, records: records(passed('l1-01-keyboard'), passed('l1-02-find-c')) },
      { ...base, records: records(passed('l1-01-keyboard'), record('l1-02-find-c', { exercises: { warmup: { attempts: 1, bestScore: 50, lastScore: 50, passed: false } } })) },
      { ...base, sessions: [session('lib-a')] },
      { ...base, profileId: 'p2' },
      { ...base, now: NOW + DAY },
      { ...base, gameTimeRemainingMs: 0 },
    ];
    for (const v of variants) expect(smartSignature(v)).not.toBe(sig);
  });
});

describe('giữ vị trí ổn định', () => {
  it('đề xuất còn hiện giữ đúng chỗ cũ dù điểm đổi; đề xuất mới xếp sau cùng', () => {
    const fresh = [cand('a', 90), cand('c', 80), cand('b', 70), cand('d', 60)];
    expect(stableOrder(fresh, ['b', 'a', 'x']).map((c) => c.candidateKey)).toEqual(['b', 'a', 'c', 'd']);
    expect(stableOrder(fresh, null).map((c) => c.candidateKey)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('ghim / ẩn một đề xuất → chỉ đề xuất đó rời đi, phần còn lại không nhảy chỗ', () => {
    const input = smartInput({ records: records(passed('l1-01-keyboard', { lastPracticedAt: NOW - 12 * DAY }), record('l1-02-find-c', { attempts: 1 })) });
    const first = computeSmartShortcuts(input, policy()).candidates;
    expect(first.length).toBeGreaterThanOrEqual(3);
    const removed = first[1];
    const after = computeSmartShortcuts(input, policy({ manualKeys: new Set([removed.targetKey]) })).candidates;
    const ordered = stableOrder(after, first.map((c) => c.candidateKey));
    const remaining = first.filter((c) => c.candidateKey !== removed.candidateKey).map((c) => c.candidateKey);
    expect(ordered.map((c) => c.candidateKey).slice(0, remaining.length)).toEqual(remaining);
  });

  it('cache chỉ dùng khi cùng chữ ký và chưa hết hạn', () => {
    const cache = toCache('sig', [cand('a', 1)], NOW, NOW + 1000);
    expect(cacheValid(cache, 'sig', NOW + 999)).toBe(true);
    expect(cacheValid(cache, 'sig', NOW + 1000)).toBe(false);
    expect(cacheValid(cache, 'khác', NOW)).toBe(false);
    expect(cacheValid(null, 'sig', NOW)).toBe(false);
  });
});
