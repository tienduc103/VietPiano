/**
 * AI Recommendation Engine — Tầng 1: LUẬT (đặc tả §20–21). Luôn chạy được khi tắt AI.
 * Tối đa 3 bài hôm nay: Khởi động · Cải thiện kỹ năng yếu (ưu tiên đoạn khó đã phát hiện) · Ôn tập hoặc nâng cao.
 * Chỉ đề xuất bài CÓ THẬT và ĐỦ tiên quyết (mở khoá chỉ là gợi ý — người học vẫn tự mở bài khác được, F9).
 * Tầng 2 (AI cục bộ, `aiRank.ts`) chỉ sắp xếp / diễn đạt lại trong danh sách này.
 */
import type { ScoringResult } from '../coach/types';
import { remedialId, remedialRange } from '../smartPractice/remedial';
import type { RecommendationFeedback } from '../smartPractice/store';
import { getAdaptiveTempo, isPassed } from '../smartPractice/tempo';
import { PASSAGE_ERROR_LABEL, type DifficultPassage, type RemedialExercise } from '../smartPractice/types';
import { FINGER_EXERCISES } from './catalog';
import { weakestSkill, type SkillProgress } from './skills';
import { SKILL_LABEL, type FingerExercise, type SkillId, type TechniqueLevel } from './types';

const DAY = 86_400_000;
/** "Không phù hợp" → không đề xuất lại bài đó trong chừng này ngày. */
export const UNSUITABLE_DAYS = 14;
/** Bài đã luyện chừng này lượt trong ngày → không đề xuất thêm (tránh luyện quá nhiều). */
export const MAX_ATTEMPTS_PER_DAY = 5;
/** Bài đã đạt nhưng lâu chưa luyện → ôn tập. */
export const REVIEW_AFTER_DAYS = 7;

export type TodaySlot = 'warmup' | 'improve' | 'review' | 'advance';

export const SLOT_LABEL: Record<TodaySlot, string> = {
  warmup: 'Khởi động',
  improve: 'Cải thiện kỹ năng',
  review: 'Ôn tập',
  advance: 'Nâng cao',
};

export interface TodayItem {
  slot: TodaySlot;
  /** Bài mở trong Coach (bài kỹ thuật, bài Thư viện của bài áp dụng, hoặc bài bổ trợ `rem:…`). */
  lessonId: string;
  exerciseId: string | null;
  title: string;
  targetSkills: SkillId[];
  minutes: number;
  bpm: number;
  reason: string;
  /** Mã bằng chứng: kết quả / đoạn khó / kỹ năng — AI chỉ được nói về những thứ này. */
  evidence: string[];
  /** Thông tin bài bổ trợ cần lưu khi người học bấm Bắt đầu. */
  remedial?: Omit<RemedialExercise, 'createdAt' | 'status' | 'profileKey'>;
}

export interface TodayPlan {
  items: TodayItem[];
  fatigue: boolean;
  note: string | null;
  /** Cấp kỹ thuật hiện tại theo kết quả (chỉ để hiển thị — không đổi cấp giáo trình). */
  level: TechniqueLevel;
}

export interface RecommendInput {
  now: number;
  results: readonly ScoringResult[];
  skills: Record<SkillId, SkillProgress>;
  passages: readonly DifficultPassage[];
  /** Tiêu đề bài gốc của đoạn khó (bài hát / bài kỹ thuật). */
  sourceTitle: (id: string) => string | undefined;
  /** Tempo gốc của bài nguồn (để gợi ý tempo bài bổ trợ). */
  sourceTempo: (id: string) => number;
  /** Số nhóm nốt (cùng phách) của bài nguồn — kẹp đoạn bổ trợ ở cuối bài. */
  sourceGroupCount: (id: string) => number;
  remedials: readonly RemedialExercise[];
  feedback: readonly RecommendationFeedback[];
  fatigue: boolean;
  /** Bài người học vừa bấm "Đổi bài" trong lần xem này. */
  skip?: ReadonlySet<string>;
  audience?: 'kids' | 'adult';
  /** Thời lượng người học muốn tập mỗi ngày (phút, hồ sơ) — bớt bài cuối nếu tổng vượt quá. */
  minutesAvailable?: number;
  exercises?: readonly FingerExercise[];
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function recommendToday(input: RecommendInput): TodayPlan {
  const exercises = input.exercises ?? FINGER_EXERCISES;
  const byLesson = new Map<string, ScoringResult[]>();
  for (const r of input.results) (byLesson.get(r.lessonId) ?? byLesson.set(r.lessonId, []).get(r.lessonId)!).push(r);
  const resultsOf = (e: FingerExercise) => (byLesson.get(e.lesson.id) ?? []).filter((r) => r.referenceId === e.lesson.id);
  const passed = (e: FingerExercise) => resultsOf(e).some((r) => isPassed(r, e.scoringConfig.passScore));
  const passedIds = new Set(exercises.filter(passed).map((e) => e.id));
  const prereqsMet = (e: FingerExercise) => e.prerequisites.every((p) => passedIds.has(p));
  const today = startOfDay(input.now);
  const attemptsToday = (lessonId: string) => (byLesson.get(lessonId) ?? []).filter((r) => r.createdAt >= today).length;
  const unsuitable = new Set(input.feedback.filter((f) => f.action === 'unsuitable' && input.now - f.at < UNSUITABLE_DAYS * DAY).map((f) => f.lessonId));
  const used = new Set<string>();
  const allowed = (lessonId: string) => !used.has(lessonId) && !unsuitable.has(lessonId) && !input.skip?.has(lessonId) && attemptsToday(lessonId) < MAX_ATTEMPTS_PER_DAY;
  const lastAt = (e: FingerExercise) => Math.max(0, ...resultsOf(e).map((r) => r.createdAt));
  const bestScore = (e: FingerExercise) => Math.max(0, ...resultsOf(e).map((r) => r.total));
  const kids = input.audience === 'kids';
  const minutes = (m: number) => (kids ? Math.max(1, Math.round(m * 0.6)) : m);
  const tempoOf = (e: FingerExercise) =>
    getAdaptiveTempo(resultsOf(e), { baseBpm: e.lesson.tempo ?? 60, tempoRange: e.tempoRange, passScore: e.scoringConfig.passScore, fatigue: input.fatigue }).recommendedBpm;

  // Cấp hiện tại = cấp thấp nhất còn bài đủ tiên quyết mà chưa đạt.
  const open = exercises.filter((e) => prereqsMet(e) && !passedIds.has(e.id));
  const level = (open.length ? Math.min(...open.map((e) => e.level)) : 5) as TechniqueLevel;

  const item = (slot: TodaySlot, e: FingerExercise, reason: string, evidence: string[]): TodayItem => {
    used.add(e.lesson.id);
    return { slot, lessonId: e.lesson.id, exerciseId: e.id, title: e.title, targetSkills: e.targetSkills, minutes: minutes(e.estimatedMinutes), bpm: tempoOf(e), reason, evidence };
  };
  const items: TodayItem[] = [];

  // ── 1. Khởi động: bài nhẹ đã đạt (cấp ≤ hiện tại, ngắn), chưa có → bài đầu tiên chưa cần tiên quyết.
  const warm = exercises
    .filter((e) => passedIds.has(e.id) && e.level <= level && e.estimatedMinutes <= 3 && allowed(e.lesson.id))
    .sort((a, b) => a.level - b.level || lastAt(a) - lastAt(b))[0];
  if (warm) items.push(item('warmup', warm, `Khởi động nhẹ bằng bài đã đạt (cao nhất ${bestScore(warm)} điểm) để làm nóng ngón trước khi vào phần khó.`, resultsOf(warm).slice(-1).map((r) => `result:${r.id}`)));
  else {
    const first = exercises.find((e) => e.prerequisites.length === 0 && allowed(e.lesson.id));
    if (first) items.push(item('warmup', first, 'Bài làm quen đầu tiên: nhận biết số ngón và đặt tay đúng chỗ.', []));
  }

  if (input.fatigue) {
    return { items, fatigue: true, note: 'Bạn vừa báo mỏi tay — hôm nay nên nghỉ. Nếu vẫn muốn tập, chỉ khởi động nhẹ, chậm và thả lỏng.', level };
  }

  // ── 2. Cải thiện: đoạn khó tin cậy nhất → bài bổ trợ; không có → bài nhắm kỹ năng yếu nhất.
  let improve: TodayItem | null = null;
  for (const p of input.passages) {
    const existing = input.remedials.find((r) => r.passageId === p.id && r.status === 'active');
    const variant = existing?.variant ?? 0;
    const [a, b] = existing ? [existing.startGroup, existing.endGroup] : remedialRange(input.sourceGroupCount(p.sourceId), p.startGroup, p.endGroup, variant);
    const id = existing?.id ?? remedialId(p.sourceId, a, b);
    if (!allowed(id)) continue;
    const title = input.sourceTitle(p.sourceId) ?? p.sourceId;
    const errs = p.errorTypes.map((t) => PASSAGE_ERROR_LABEL[t.type]).join(', ');
    const late = p.timingDeviationMs ? ` (trễ khoảng ${p.timingDeviationMs} ms)` : '';
    const bpm = Math.max(30, Math.round(input.sourceTempo(p.sourceId) * (p.tempoSensitive ? 0.6 : 0.7)));
    improve = {
      slot: 'improve',
      lessonId: id,
      exerciseId: null,
      title: `Luyện đoạn ${p.noteNames.join(' – ')} (${title})`,
      targetSkills: p.primaryError === 'hands-async' ? ['coordination'] : p.primaryError === 'wrong-note' || p.primaryError === 'missing-note' ? ['notes'] : ['transition', 'rhythm'],
      minutes: minutes(3),
      bpm,
      reason: `Đoạn ${p.noteNames.join(' – ')} ở ô ${p.measure} của "${title}": ${errs} ở ${p.evidenceSessionIds.length}/${p.analyzedSessions} lượt gần nhất${late}. Tách riêng vài nốt, tập chậm rồi ghép lại.`,
      evidence: [`passage:${p.id}`, ...p.evidenceSessionIds.map((s) => `session:${s}`)],
      remedial: {
        id,
        sourceId: p.sourceId,
        sourceTitle: title,
        passageId: p.id,
        startGroup: a,
        endGroup: b,
        variant,
        noteNames: p.noteNames,
        tempo: bpm,
        handMode: p.handMode,
      },
    };
    used.add(id);
    break;
  }
  if (!improve) {
    const weak = weakestSkill(input.skills);
    if (weak) {
      const pick = exercises
        .filter((e) => e.targetSkills.includes(weak.skillId) && prereqsMet(e) && e.level <= level && allowed(e.lesson.id))
        .sort((a, b) => Number(passedIds.has(a.id)) - Number(passedIds.has(b.id)) || b.level - a.level || lastAt(a) - lastAt(b))[0];
      if (pick)
        improve = item(
          'improve',
          pick,
          `Kỹ năng "${SKILL_LABEL[weak.skillId]}" đang thấp nhất (${Math.round(weak.proficiency! * 100)}% theo ${weak.samples} lượt đo) — bài này tập trung vào kỹ năng đó.`,
          [`skill:${weak.skillId}`],
        );
    }
  }
  if (!improve) {
    const learn = open.filter((e) => e.level === level && allowed(e.lesson.id)).sort((a, b) => lastAt(b) - lastAt(a))[0];
    if (learn)
      improve = item(
        'improve',
        learn,
        resultsOf(learn).length ? `Đang luyện, chưa đạt ${learn.scoringConfig.passScore} điểm (cao nhất ${bestScore(learn)}).` : `Bài tiếp theo của ${'cấp ' + level}: đã đủ bài tiên quyết.`,
        resultsOf(learn).slice(-1).map((r) => `result:${r.id}`),
      );
  }
  if (improve) items.push(improve);

  // ── 3. Ôn tập (đã đạt, lâu chưa luyện) hoặc nâng cao (bài mới vừa đủ tiên quyết).
  const review = exercises
    .filter((e) => passedIds.has(e.id) && input.now - lastAt(e) >= REVIEW_AFTER_DAYS * DAY && allowed(e.lesson.id))
    .sort((a, b) => lastAt(a) - lastAt(b))[0];
  if (review) {
    const days = Math.floor((input.now - lastAt(review)) / DAY);
    items.push(item('review', review, `Đã đạt bài này nhưng ${days} ngày chưa luyện lại — ôn để giữ kỹ năng.`, resultsOf(review).slice(-1).map((r) => `result:${r.id}`)));
  } else {
    const next = open.filter((e) => allowed(e.lesson.id) && resultsOf(e).length === 0).sort((a, b) => a.level - b.level)[0];
    if (next) {
      const pre = next.prerequisites.map((id) => exercises.find((e) => e.id === id)?.title).filter(Boolean);
      items.push(item('advance', next, pre.length ? `Bài mới: bạn đã đạt ${pre.join(', ')}.` : 'Bài mới, không cần bài tiên quyết.', next.prerequisites.map((id) => `exercise:${id}`)));
    }
  }
  const out = items.slice(0, 3);
  const budget = input.minutesAvailable;
  while (budget && budget > 0 && out.length > 1 && out.reduce((m, i) => m + i.minutes, 0) > budget) out.pop();
  return { items: out, fatigue: false, note: null, level };
}
