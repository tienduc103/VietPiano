import { describe, expect, it } from 'vitest';
import { lessonManager } from '../../lessons/LessonManager';
import { targetKey } from '../registry';
import type { ShortcutTarget } from '../types';
import { computeSmartShortcuts, generateDrafts, isGameTarget, MAX_SMART, SESSION_REPEAT_PENALTY, smartExpiry, TYPE_LIMITS } from './engine';
import { reviewIntervalDays } from './learning';
import { dismiss } from './settings';
import { DAY, NOW, passed, policy, PROFILE, record, records, session, smartInput, TZ } from './testing';
import { BASE_SCORE, type SmartDraft } from './types';

const keyOf = (t: ShortcutTarget) => targetKey(t);
const lessonTarget = (id: string): ShortcutTarget => ({ type: 'lesson', id });

describe('không có lịch sử học', () => {
  it('vẫn gợi ý hợp lệ buổi đầu tiên của giáo trình (ưu tiên cao nhất) + trò luyện đúng kỹ năng của buổi đó', () => {
    const r = computeSmartShortcuts(smartInput(), policy());
    expect(r.candidates[0]).toMatchObject({
      type: 'continue',
      target: { type: 'lesson', id: 'l1-01-keyboard' },
      label: 'Bắt đầu — Buổi 1: Khám phá bàn phím',
      reason: 'Buổi đầu tiên của Cấp 1',
      score: BASE_SCORE.next,
      profileId: 'p1',
      status: 'active',
    });
    // Không có dữ liệu → không có điểm yếu / ôn tập / thường chơi; khách (không hồ sơ) → không có bài vừa sức theo tuổi.
    expect(r.candidates.map((c) => c.type)).toEqual(['continue', 'game']);
    // Buổi 1 chỉ có bài tìm phím (nhóm phím đen / trắng) → kỹ năng "nhận biết bàn phím" → Bóng bay (tên nốt → phím).
    expect(r.candidates[1]).toMatchObject({ target: { type: 'game', id: 'balloon-pop' }, reason: 'Luyện nhận biết bàn phím — kỹ năng của Buổi 1' });
  });
});

describe('tiếp tục học', () => {
  it('buổi đang dở đứng đầu, lý do lấy đúng số bài tập đã đạt và ngày học', () => {
    const recs = records(passed('l1-01-keyboard'), record('l1-02-find-c', { exercises: { warmup: { attempts: 1, bestScore: 100, lastScore: 100, passed: true } }, lastPracticedAt: NOW - DAY }));
    const r = computeSmartShortcuts(smartInput({ records: recs }), policy());
    expect(r.candidates[0]).toMatchObject({
      type: 'continue',
      target: lessonTarget('l1-02-find-c'),
      label: 'Tiếp tục — Buổi 2: Tìm nốt Đô',
      icon: '▶️',
      score: 100,
      reason: 'Đã đạt 1/2 bài tập · học lần cuối hôm qua',
      evidence: { kind: 'lesson-in-progress', exercisesPassed: 1, exercisesTotal: 2 },
    });
    // Buổi tiếp theo của cấp ĐANG DỞ → chỉ một đề xuất (không thêm "Bài mới" trùng đích).
    expect(r.candidates.filter((c) => c.targetKey === keyOf(lessonTarget('l1-02-find-c')))).toHaveLength(1);
  });

  it('buổi đã đạt → "Bài mới" là buổi tiếp theo theo thứ tự cấp', () => {
    const r = computeSmartShortcuts(smartInput({ records: records(passed('l1-01-keyboard'), passed('l1-02-find-c')) }), policy());
    expect(r.candidates[0]).toMatchObject({ label: 'Bài mới — Buổi 3: Số ngón tay', reason: 'Buổi tiếp theo của Cấp 1 · đã đạt 2/20 buổi' });
  });

  it('bài Thư viện dừng giữa chừng → "Tiếp tục" mở đúng bài (kèm đoạn ô đang luyện)', () => {
    const lesson = lessonManager.all()[0];
    const s = session(lesson.id, { completed: false, notesReached: 12, totalNotes: 40, startedAt: NOW - 2 * DAY });
    const r = computeSmartShortcuts(smartInput({ sessions: [s], records: records(passed('l1-01-keyboard')) }), policy());
    const c = r.candidates.find((x) => x.target.type === 'practice');
    expect(c).toMatchObject({ type: 'continue', label: `Tiếp tục — ${lesson.title}`, reason: 'Lần trước dừng ở nốt 12/40 · 2 ngày trước' });
  });

  it('mở bài rồi thoát ngay / tập riêng một tay / quá 14 ngày → không coi là đang tập dở', () => {
    const id = lessonManager.all()[0].id;
    for (const s of [
      session(id, { completed: false, notesReached: 1, totalNotes: 40 }),
      session(id, { completed: false, notesReached: 12, totalNotes: 40, hand: 'left' }),
      session(id, { completed: false, notesReached: 12, totalNotes: 40, startedAt: NOW - 20 * DAY }),
    ]) {
      expect(generateDrafts(smartInput({ sessions: [s] })).some((d) => d.type === 'continue' && d.target.type === 'practice')).toBe(false);
    }
  });
});

describe('không đề xuất nội dung bị khoá / không còn', () => {
  it('buổi đang dở nhưng còn buổi tiên quyết chưa đạt → không gợi ý tiếp tục', () => {
    // l1-04 cần l1-03 đạt trước.
    const recs = records(passed('l1-01-keyboard'), passed('l1-02-find-c'), record('l1-04-cde', { attempts: 1 }));
    const r = computeSmartShortcuts(smartInput({ records: recs }), policy());
    expect(r.candidates.some((c) => c.target.id === 'l1-04-cde')).toBe(false);
  });

  it('đề xuất tới buổi "nên học sau" / đích không còn → bị lọc', () => {
    const drafts: SmartDraft[] = [
      { type: 'review', target: lessonTarget('l1-10-week2-test'), reason: 'x', evidence: { kind: 'skill-match', lessonId: 'l1-10', skills: [] }, score: 90 },
      { type: 'review', target: lessonTarget('l9-99-khong-co'), reason: 'x', evidence: { kind: 'skill-match', lessonId: 'l9', skills: [] }, score: 90 },
    ];
    const r = computeSmartShortcuts(smartInput(), policy(), drafts);
    expect(r.candidates).toEqual([]);
    expect(r.excluded.map((e) => e.why).sort()).toEqual(['locked', 'missing']);
  });

  it('hết quỹ thời gian chơi → không đề xuất trò chơi nào (kể cả trò hay chơi)', () => {
    const usage = [{ target: { type: 'game', id: 'tomato-harvest' } as ShortcutTarget, uses: 9, lastAt: NOW - DAY, windowDays: 30, unit: 'play' as const }];
    const r = computeSmartShortcuts(smartInput({ gameTimeRemainingMs: 0, usage }), policy());
    expect(r.candidates.some((c) => isGameTarget(c.target))).toBe(false);
    expect(r.excluded).toContainEqual(expect.objectContaining({ targetKey: 'game|tomato-harvest', why: 'locked' }));
  });
});

describe('không xung đột với lối tắt thủ công', () => {
  it('đích đã ghim thủ công → không hiện lần thứ hai, đề xuất kế tiếp thế chỗ', () => {
    const manualKeys = new Set([keyOf(lessonTarget('l1-01-keyboard'))]);
    const r = computeSmartShortcuts(smartInput(), policy({ manualKeys }));
    expect(r.candidates.some((c) => c.target.id === 'l1-01-keyboard')).toBe(false);
    expect(r.excluded).toContainEqual(expect.objectContaining({ targetKey: 'lesson|l1-01-keyboard', why: 'pinned' }));
    expect(r.candidates[0].type).toBe('game');
  });

  it('so trùng theo khoá đích chuẩn hoá (gồm tham số), không theo tên', () => {
    // Đã ghim "Trò chơi sau buổi" của buổi 1 — khác đích với tổng quan buổi 1 → đề xuất buổi 1 vẫn hiện.
    const manualKeys = new Set([keyOf({ type: 'lesson', id: 'l1-01-keyboard', params: { stage: 'game' } })]);
    const r = computeSmartShortcuts(smartInput(), policy({ manualKeys }));
    expect(r.candidates[0].target).toEqual(lessonTarget('l1-01-keyboard'));
  });

  it('engine không nhận / không trả về lối tắt thủ công — chỉ đọc tập khoá', () => {
    const manualKeys = new Set(['lesson|l1-01-keyboard', 'page|games', 'game|f1-racing']);
    const before = [...manualKeys];
    computeSmartShortcuts(smartInput(), policy({ manualKeys }));
    expect([...manualKeys]).toEqual(before);
  });
});

describe('ẩn đề xuất, tắt loại gợi ý', () => {
  it('ẩn một đề xuất → không đề xuất lại trong thời hạn, hết hạn thì hiện lại', () => {
    const dismissed = dismiss({}, 'lesson|l1-01-keyboard', NOW, 7);
    expect(computeSmartShortcuts(smartInput(), policy({ dismissed })).candidates.some((c) => c.target.id === 'l1-01-keyboard')).toBe(false);
    const later = computeSmartShortcuts(smartInput({ now: NOW + 8 * DAY }), policy({ dismissed }));
    expect(later.candidates[0].target.id).toBe('l1-01-keyboard');
  });

  it('tắt một loại → chỉ loại đó biến mất; tắt hẳn → danh sách rỗng', () => {
    const p = policy();
    p.settings.types.game = false;
    const r = computeSmartShortcuts(smartInput(), p);
    expect(r.candidates.map((c) => c.type)).toEqual(['continue']);
    p.settings.enabled = false;
    expect(computeSmartShortcuts(smartInput(), p).candidates).toEqual([]);
  });
});

describe('ôn tập định kỳ', () => {
  it('khoảng ôn giãn dần, điểm thấp ôn sớm hơn, điểm rất cao giãn ra', () => {
    expect([1, 2, 3, 4, 9].map((n) => reviewIntervalDays(n, 85))).toEqual([7, 14, 30, 60, 60]);
    expect(reviewIntervalDays(1, 70)).toBe(4);
    expect(reviewIntervalDays(1, 100)).toBe(14);
  });

  it('bài đã đạt lâu chưa luyện → "Ôn lại", lý do có điểm + số ngày thật', () => {
    const recs = records(passed('l1-01-keyboard', { bestScore: 85, lastPracticedAt: NOW - 10 * DAY }), passed('l1-02-find-c', { lastPracticedAt: NOW - DAY }));
    const r = computeSmartShortcuts(smartInput({ records: recs }), policy());
    expect(r.candidates.find((c) => c.type === 'review')).toMatchObject({ label: 'Ôn lại — Buổi 1: Khám phá bàn phím', reason: 'Đạt 85 điểm · 10 ngày chưa luyện', icon: '🔄' });
  });

  it('chưa tới hạn → không nhắc ôn', () => {
    const recs = records(passed('l1-01-keyboard', { bestScore: 85, lastPracticedAt: NOW - 5 * DAY }));
    expect(computeSmartShortcuts(smartInput({ records: recs }), policy()).candidates.some((c) => c.type === 'review')).toBe(false);
  });
});

describe('nội dung thường chơi', () => {
  it('đủ số lần dùng → đề xuất, lý do đúng số ván; ít hơn ngưỡng → không', () => {
    const usage = (uses: number) => [{ target: { type: 'game', id: 'tomato-harvest' } as ShortcutTarget, uses, lastAt: NOW - DAY, windowDays: 30, unit: 'play' as const }];
    const p = policy();
    p.settings.types.game = false;
    const r = computeSmartShortcuts(smartInput({ usage: usage(5) }), p);
    expect(r.candidates.find((c) => c.type === 'frequent')).toMatchObject({ label: 'Thu hoạch cà chua', icon: '🍅', reason: 'Đã chơi 5 ván trong 30 ngày' });
    expect(computeSmartShortcuts(smartInput({ usage: usage(2) }), p).candidates.some((c) => c.type === 'frequent')).toBe(false);
  });

  it('bài Thư viện tập nhiều lần trong 30 ngày → thường chơi', () => {
    const id = lessonManager.all()[3].id;
    const sessions = [1, 2, 3, 4].map((d) => session(id, { startedAt: NOW - d * DAY }));
    const p = policy();
    p.settings.types.review = false;
    const c = computeSmartShortcuts(smartInput({ sessions }), p).candidates.find((x) => x.type === 'frequent');
    expect(c).toMatchObject({ target: { type: 'practice', id }, reason: 'Đã tập 4 lần trong 30 ngày' });
  });
});

describe('bài luyện phù hợp (cần hồ sơ)', () => {
  it('có hồ sơ → một bài Thư viện vừa sức, lý do lấy từ gợi ý bài của hồ sơ', () => {
    const r = computeSmartShortcuts(smartInput({ profile: PROFILE }), policy());
    const c = r.candidates.find((x) => x.type === 'practice');
    expect(c).toBeDefined();
    const lesson = lessonManager.get(c!.target.id)!;
    expect(lesson.difficulty).toBeLessThanOrEqual(2);
    expect(c!.reason.length).toBeGreaterThan(0);
    expect(c!.evidence).toMatchObject({ kind: 'recommended', lessonId: lesson.id });
  });
});

describe('xếp hạng ổn định', () => {
  it('cùng dữ liệu → cùng thứ tự, kể cả khi thứ tự đề xuất thô bị đảo', () => {
    const input = smartInput({ profile: PROFILE, records: records(passed('l1-01-keyboard', { lastPracticedAt: NOW - 12 * DAY }), record('l1-02-find-c', { attempts: 1 })) });
    const drafts = generateDrafts(input);
    const a = computeSmartShortcuts(input, policy(), drafts).candidates.map((c) => c.candidateKey);
    const b = computeSmartShortcuts(input, policy(), [...drafts].reverse()).candidates.map((c) => c.candidateKey);
    expect(b).toEqual(a);
    expect(a.length).toBeGreaterThan(2);
  });

  it('giới hạn mỗi loại + tổng số', () => {
    const drafts: SmartDraft[] = lessonManager
      .all()
      .slice(0, 10)
      .map((l, i) => ({ type: 'weakness', target: { type: 'practice', id: l.id }, reason: 'x', evidence: { kind: 'low-accuracy', lessonId: l.id, accuracy: 0.5, sessions: 2, notes: 40 }, score: 85 + (i % 3) }));
    const r = computeSmartShortcuts(smartInput(), policy(), drafts);
    expect(r.candidates).toHaveLength(TYPE_LIMITS.weakness);
    expect(r.candidates.length).toBeLessThanOrEqual(MAX_SMART);
    expect(r.excluded.filter((e) => e.why === 'limit')).toHaveLength(8);
  });

  it('đề xuất đã mở trong phiên (trừ "Tiếp tục") bị hạ ưu tiên', () => {
    const base = computeSmartShortcuts(smartInput(), policy()).candidates.find((c) => c.type === 'game')!;
    const used = computeSmartShortcuts(smartInput(), policy({ usedThisSession: new Set([base.targetKey]) })).candidates.find((c) => c.type === 'game')!;
    expect(used.score).toBe(base.score - SESSION_REPEAT_PENALTY);
    const cont = computeSmartShortcuts(smartInput(), policy({ usedThisSession: new Set(['lesson|l1-01-keyboard']) })).candidates[0];
    expect(cont.score).toBe(BASE_SCORE.next);
  });

  it('danh sách hết hạn lúc nửa đêm (giờ máy) hoặc sau 6 giờ, cái nào tới trước', () => {
    expect(smartExpiry(NOW, TZ)).toBe(Date.UTC(2026, 10, 7, 11, 0, 0)); // 12:00 VN + 6 giờ = 18:00 VN
    const late = Date.UTC(2026, 10, 7, 15, 0, 0); // 22:00 VN
    expect(smartExpiry(late, TZ)).toBe(Date.UTC(2026, 10, 7, 17, 0, 0)); // nửa đêm VN
  });
});
