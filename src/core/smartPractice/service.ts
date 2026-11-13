/**
 * API dùng chung của AI Smart Practice (đặc tả §24): mọi màn (bài kỹ thuật, bài hát, bài hai tay, giáo trình…) gọi qua đây,
 * không chép logic phát hiện đoạn khó vào từng trang. Dữ liệu biểu diễn / kết quả là của Coach (`coachStorage`), Smart Practice chỉ
 * lưu bài bổ trợ + phản hồi + báo mỏi (`smartPracticeStore`). Kiểm tra đầu vào; lỗi đọc dữ liệu → trả rỗng, không ném lên UI.
 */
import { referenceFromLesson } from '../coach/reference/fromLesson';
import type { PerformanceSession, ScoreReference, ScoringResult } from '../coach/types';
import type { Lesson } from '../lessons/types';
import { lessonTempo } from '../lessons/types';
import { exerciseForLesson } from '../technique/catalog';
import { findSourceLesson, resolveLesson } from '../technique/lessons';
import { recommendToday, type TodayPlan } from '../technique/recommend';
import { getSkillProgress, type SkillProgress } from '../technique/skills';
import type { SkillId } from '../technique/types';
import { evaluateRemedialOutcome as evaluateOutcome } from './outcome';
import { detectDifficultPassages as detect, usableResult } from './passages';
import { buildRemedialLesson, parseRemedialId, remedialRange } from './remedial';
import { activeFatigue, smartPracticeStore, type SmartPracticeStore } from './store';
import { getAdaptiveTempo as adaptiveTempo, isPassed } from './tempo';
import type { AdaptiveTempo, DifficultPassage, RemedialExercise, RemedialOutcome } from './types';

const DAY = 86_400_000;

export interface ResultSource {
  listResults(profileKey: string, lessonId?: string): Promise<ScoringResult[]>;
  listSessions(profileKey: string, lessonId?: string): Promise<PerformanceSession[]>;
}

export interface PerformanceAnalysis {
  resultId: string;
  passed: boolean;
  total: number;
  /** Tiêu chí đo được (0..1). */
  criteria: { key: string; label: string; value: number }[];
  /** Tiêu chí không đo được + lý do (không chấm kỹ năng không đo được). */
  unavailable: { criterion: string; reason: string }[];
  topIssues: { message: string; measure: number | null; deduction: number }[];
  bpm: number;
}

const validId = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 300;

export class SmartPracticeService {
  constructor(
    private readonly results: ResultSource,
    readonly store: SmartPracticeStore = smartPracticeStore,
    private readonly findLesson: (id: string) => Lesson | undefined = resolveLesson,
  ) {}

  /** Tóm tắt một kết quả chấm (tất định — điểm lấy nguyên từ Scoring Engine). */
  analyzePerformance(result: ScoringResult): PerformanceAnalysis {
    const passScore = exerciseForLesson(result.lessonId)?.scoringConfig.passScore;
    return {
      resultId: result.id,
      passed: isPassed(result, passScore),
      total: result.total,
      criteria: result.criteria.filter((c) => c.value !== null).map((c) => ({ key: c.key, label: c.label, value: c.value! })),
      unavailable: result.unavailable.map((u) => ({ criterion: u.criterion, reason: u.reason })),
      topIssues: [...result.issues].sort((a, b) => b.deduction - a.deduction).slice(0, 5).map((i) => ({ message: i.message, measure: i.measure, deduction: i.deduction })),
      bpm: result.tempo.targetBpm,
    };
  }

  /** Bản tham chiếu CẢ BÀI, hai tay — gốc chỉ số nhóm cho đoạn khó / bài bổ trợ. */
  referenceFor(lessonId: string): ScoreReference | null {
    const l = this.findLesson(lessonId);
    if (!l) return null;
    try {
      return referenceFromLesson(l);
    } catch {
      return null;
    }
  }

  async detectDifficultPassages(profileKey: string, lessonId: string, extra: readonly ScoringResult[] = []): Promise<DifficultPassage[]> {
    if (!validId(profileKey) || !validId(lessonId)) return [];
    const ref = this.referenceFor(lessonId);
    if (!ref) return [];
    const stored = await this.results.listResults(profileKey, lessonId).catch(() => []);
    const all = [...stored.filter((r) => !extra.some((e) => e.id === r.id)), ...extra];
    return detect(ref, all, { profileKey });
  }

  /** Tạo (và lưu) bài bổ trợ bậc `variant` cho đoạn [startGroup, endGroup] của bài gốc. */
  createRemedialExercise(
    profileKey: string,
    passage: Pick<DifficultPassage, 'sourceId' | 'startGroup' | 'endGroup'> & Partial<Pick<DifficultPassage, 'id' | 'handMode'>>,
    variant: number,
    /** `exact`: người học tự chọn đoạn (Manual Loop) → dùng đúng nhóm [startGroup, endGroup], không mở rộng theo bậc. */
    opts: { tempo?: number; now?: number; exact?: boolean } = {},
  ): { remedial: RemedialExercise; lesson: Lesson } | null {
    if (!validId(profileKey) || !validId(passage.sourceId)) return null;
    const source = findSourceLesson(passage.sourceId);
    if (!source) return null;
    const ref = referenceFromLesson(source);
    if (!Number.isInteger(passage.startGroup) || !Number.isInteger(passage.endGroup) || passage.startGroup < 0 || passage.endGroup >= ref.groups.length || passage.endGroup < passage.startGroup) return null;
    const v = Math.max(0, Math.min(2, Math.round(variant)));
    const [a, b] = opts.exact ? [passage.startGroup, passage.endGroup] : remedialRange(ref.groups.length, passage.startGroup, passage.endGroup, v);
    const built = buildRemedialLesson(source, a, b, ref);
    const remedial: RemedialExercise = {
      id: built.lesson.id,
      profileKey,
      sourceId: source.id,
      sourceTitle: source.title,
      passageId: passage.id ?? null,
      startGroup: a,
      endGroup: b,
      variant: v,
      noteNames: built.noteNames,
      tempo: Math.max(20, Math.round(opts.tempo ?? lessonTempo(source) * 0.7)),
      handMode: passage.handMode ?? 'both',
      ...(built.byMeasures ? { byMeasures: built.byMeasures } : {}),
      createdAt: opts.now ?? Date.now(),
      status: 'active',
    };
    // Bậc mới thay bậc cũ của cùng đoạn khó.
    if (remedial.passageId) {
      const old = this.store.load(profileKey).remedials.filter((r) => r.passageId === remedial.passageId && r.id !== remedial.id && r.status === 'active');
      for (const o of old) this.store.setRemedialStatus(profileKey, o.id, 'dismissed');
    }
    this.store.upsertRemedial(profileKey, remedial);
    return { remedial, lesson: built.lesson };
  }

  /** Nhóm của đoạn khó gắn với bài bổ trợ (id đoạn khó `…:<s>-<e>`; không có → cả khoảng của bài bổ trợ). */
  private passageGroups(profileKey: string, remedialLessonId: string): { startGroup: number; endGroup: number; stored: RemedialExercise | undefined } | null {
    const p = parseRemedialId(remedialLessonId);
    if (!p) return null;
    const stored = this.store.load(profileKey).remedials.find((r) => r.id === remedialLessonId);
    const pm = stored?.passageId ? /:(\d+)-(\d+)$/.exec(stored.passageId) : null;
    return { startGroup: pm ? Number(pm[1]) : p.a, endGroup: pm ? Number(pm[2]) : p.b, stored };
  }

  /** Bậc tiếp theo (đoạn dài hơn) của một bài bổ trợ — "Mở rộng đoạn". */
  extendRemedial(profileKey: string, remedialLessonId: string, opts: { tempo?: number; now?: number } = {}): { remedial: RemedialExercise; lesson: Lesson } | null {
    const p = parseRemedialId(remedialLessonId);
    const g = this.passageGroups(profileKey, remedialLessonId);
    if (!p || !g) return null;
    const passage = { sourceId: p.sourceId, startGroup: g.startGroup, endGroup: g.endGroup, ...(g.stored?.passageId ? { id: g.stored.passageId } : {}), ...(g.stored ? { handMode: g.stored.handMode } : {}) };
    return this.createRemedialExercise(profileKey, passage, Math.min(2, (g.stored?.variant ?? 0) + 1), opts);
  }

  async getAdaptiveTempo(profileKey: string, lessonId: string, now = Date.now()): Promise<AdaptiveTempo | null> {
    const lesson = this.findLesson(lessonId);
    if (!lesson || !validId(profileKey)) return null;
    const ex = exerciseForLesson(lessonId);
    const results = (await this.results.listResults(profileKey, lessonId).catch(() => [])).filter((r) => usableResult(r, referenceFromLesson(lesson).id));
    return adaptiveTempo(results, {
      baseBpm: lessonTempo(lesson),
      ...(ex ? { tempoRange: ex.tempoRange, passScore: ex.scoringConfig.passScore } : lesson.tempoRange ? { tempoRange: lesson.tempoRange } : {}),
      fatigue: !!activeFatigue(this.store.load(profileKey), now),
    });
  }

  /** Đoạn khó của mọi bài đã luyện 30 ngày qua (tối đa `maxSources` bài gần nhất). */
  async recentPassages(profileKey: string, now = Date.now(), maxSources = 8, all?: readonly ScoringResult[]): Promise<DifficultPassage[]> {
    const results = all ?? (await this.results.listResults(profileKey).catch(() => []));
    const latest = new Map<string, number>();
    for (const r of results) if (r.referenceId === r.lessonId && !parseRemedialId(r.lessonId) && now - r.createdAt <= 30 * DAY) latest.set(r.lessonId, Math.max(latest.get(r.lessonId) ?? 0, r.createdAt));
    const sources = [...latest.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxSources).map(([id]) => id);
    const out: DifficultPassage[] = [];
    for (const id of sources) {
      const ref = this.referenceFor(id);
      if (ref) out.push(...detect(ref, results.filter((r) => r.lessonId === id), { profileKey }));
    }
    return out.sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1) || b.errorFrequency - a.errorFrequency);
  }

  async getSkillProgress(profileKey: string, now = Date.now()): Promise<Record<SkillId, SkillProgress>> {
    const results = await this.results.listResults(profileKey).catch(() => []);
    return getSkillProgress(results, now);
  }

  async getPracticeRecommendations(profileKey: string, opts: { now?: number; skip?: ReadonlySet<string>; audience?: 'kids' | 'adult'; minutesAvailable?: number } = {}): Promise<TodayPlan> {
    const now = opts.now ?? Date.now();
    const results = await this.results.listResults(profileKey).catch(() => []);
    const data = this.store.load(profileKey);
    const passages = await this.recentPassages(profileKey, now, 8, results);
    return recommendToday({
      now,
      results,
      skills: getSkillProgress(results, now),
      passages,
      sourceTitle: (id) => findSourceLesson(id)?.title,
      sourceTempo: (id) => {
        const l = findSourceLesson(id);
        return l ? lessonTempo(l) : 60;
      },
      sourceGroupCount: (id) => this.referenceFor(id)?.groups.length ?? 0,
      remedials: data.remedials,
      feedback: data.feedback,
      fatigue: !!activeFatigue(data, now),
      ...(opts.skip ? { skip: opts.skip } : {}),
      ...(opts.audience ? { audience: opts.audience } : {}),
      ...(opts.minutesAvailable ? { minutesAvailable: opts.minutesAvailable } : {}),
    });
  }

  /** Sau khi Coach lưu một kết quả: cập nhật trạng thái bài bổ trợ (đã chắc → "mastered"). Kết quả do Coach lưu, không sửa điểm. */
  async savePracticeResult(result: ScoringResult): Promise<RemedialOutcome | null> {
    if (!parseRemedialId(result.lessonId)) return null;
    const outcome = await this.evaluateRemedialOutcome(result.profileKey, result.lessonId, [result]);
    if (outcome?.next === 'return-to-source') this.store.setRemedialStatus(result.profileKey, result.lessonId, 'mastered');
    return outcome;
  }

  async evaluateRemedialOutcome(profileKey: string, remedialLessonId: string, extra: readonly ScoringResult[] = []): Promise<RemedialOutcome | null> {
    const p = parseRemedialId(remedialLessonId);
    if (!p || !validId(profileKey)) return null;
    const sourceRef = this.referenceFor(p.sourceId);
    if (!sourceRef) return null;
    const g = this.passageGroups(profileKey, remedialLessonId)!;
    const merge = (xs: ScoringResult[]) => [...xs.filter((r) => !extra.some((e) => e.id === r.id)), ...extra.filter((e) => e.lessonId === remedialLessonId)];
    const remResults = merge(await this.results.listResults(profileKey, remedialLessonId).catch(() => []));
    const srcResults = await this.results.listResults(profileKey, p.sourceId).catch(() => []);
    // So lỗi đúng ở chỗ khó (nhóm của đoạn khó), không phải cả phần ngữ cảnh của bài bổ trợ.
    return evaluateOutcome({ startGroup: g.startGroup, endGroup: g.endGroup, variant: g.stored?.variant ?? 0 }, remResults, sourceRef, srcResults);
  }
}
