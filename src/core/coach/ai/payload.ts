/**
 * Dữ liệu gửi cho AI cục bộ (thành phần C): CHỈ số liệu tóm tắt đã được Scoring Engine chấm — không log MIDI thô, không âm thanh.
 * Tên học viên chỉ gửi khi người dùng bật (`shareName`); mặc định chỉ nhóm tuổi + trình độ (bảo vệ dữ liệu trẻ em).
 * Mỗi lỗi / gợi ý có mã (`I…`, `R…`) để AI tham chiếu và để kiểm chứng câu trả lời (ai/verify.ts).
 */
import type { InputSource } from '../../input/NoteInputProvider';
import { AGE_GROUP_LABELS, ageGroup, EXPERIENCE_LABELS, type LearnerProfile } from '../../profile/LearnerProfile';
import type { ProgressReport } from '../progress/compare';
import { COACH_MODE_LABEL, type PracticeRecommendation, type ScoreReference, type ScoringResult } from '../types';

export interface CoachAiPayload {
  version: 1;
  lesson: { title: string; measures: [number, number]; timeSignature: string; targetBpm: number; hands: string; pedalMarks: boolean; dynamicsMarks: boolean };
  learner?: { ageGroup: string; level: string; name?: string };
  mode: string;
  input: string;
  score: { total: number; criteria: { key: string; label: string; percent: number | null; points: number; weight: number; reason?: string }[] };
  counts: { notes: number; correct: number; wrong: number; missing: number; extra: number; octave: number; order: number };
  /**
   * `metronome`: so với tiếng click sau khi bù độ trễ máy (chỉ khi đo được) — thông tin, không trừ điểm. Hướng nằm ở `verdict`
   * (behind = sau tiếng click), `deviationMs` luôn dương → AI viết "sau / trước … ms" vẫn khớp số liệu khi xác minh.
   */
  tempo: { target: number; actual: number | null; driftPercent: number | null; metronome?: { verdict: 'with' | 'behind' | 'ahead' | 'unsteady'; deviationMs: number; spreadMs: number } };
  issues: { ref: string; type: string; measure: number | null; hand?: string; lostPoints: number; message: string }[];
  measuresToReview: { measure: number; lostPoints: number }[];
  hands?: { rightAccuracy?: number; leftAccuracy?: number; syncPercent?: number | null };
  recommendations: { ref: string; title: string; reason: string; measures?: [number, number]; tempoPercent?: number }[];
  history?: { attempts: number; previousTotal: number | null; averageTotal: number | null; deltaVsPrevious: number | null; recurring: string[]; bestTempo: number | null };
}

export interface PayloadContext {
  learner?: Pick<LearnerProfile, 'name' | 'age' | 'experience'> | null;
  shareName?: boolean;
  recommendations: readonly PracticeRecommendation[];
  progress?: ProgressReport | null;
  source: InputSource;
  hand: 'both' | 'right' | 'left';
}

/** Số lỗi tối đa gửi cho AI (nặng nhất trước). */
export const MAX_AI_ISSUES = 8;

/** Chuỗi lấy từ dữ liệu người dùng (tên bài, tên học viên): bỏ ký tự điều khiển / dấu ngoặc nhọn, cắt độ dài. */
export function cleanText(s: string, max = 80): string {
  return s
    .replace(/[\u0000-\u001f\u007f<>`{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));
const INPUT_LABEL: Record<InputSource, string> = { midi: 'đàn MIDI', virtual: 'bàn phím ảo', microphone: 'micro (thử nghiệm, chỉ nốt đơn)' };
const HAND_LABEL = { both: 'hai tay', right: 'tay phải', left: 'tay trái' } as const;

export function buildAiPayload(result: ScoringResult, ref: ScoreReference, ctx: PayloadContext): CoachAiPayload {
  const issues = [...result.issues].sort((a, b) => b.deduction - a.deduction || a.id.localeCompare(b.id)).slice(0, MAX_AI_ISSUES);
  const measures = result.measures.filter((m) => m.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 4);
  const payload: CoachAiPayload = {
    version: 1,
    lesson: {
      title: cleanText(ref.title),
      measures: [ref.printedMeasures[0] ?? 1, ref.printedMeasures[ref.printedMeasures.length - 1] ?? 1],
      timeSignature: `${ref.timeSignature[0]}/${ref.timeSignature[1]}`,
      targetBpm: Math.round(ref.targetBpm),
      hands: HAND_LABEL[ctx.hand],
      pedalMarks: ref.pedal.graded,
      dynamicsMarks: ref.dynamics.length >= 2,
    },
    mode: COACH_MODE_LABEL[result.mode],
    input: INPUT_LABEL[ctx.source],
    score: {
      total: result.total,
      criteria: result.criteria.map((c) => ({ key: c.key, label: c.label, percent: pct(c.value), points: Math.round(c.points * 10) / 10, weight: Math.round(c.effectiveWeight), ...(c.reason ? { reason: c.reason } : {}) })),
    },
    counts: { notes: result.counts.refNotes, correct: result.counts.correct, wrong: result.counts.wrong, missing: result.counts.missing, extra: result.counts.extra + result.counts.repeated + result.counts.simultaneous, octave: result.counts.octave, order: result.counts.order },
    tempo: {
      target: Math.round(result.tempo.targetBpm),
      actual: result.tempo.actualBpm === null ? null : Math.round(result.tempo.actualBpm),
      driftPercent: result.tempo.drift === null ? null : Math.round(result.tempo.drift * 100),
      ...(result.tempo.metronome?.status === 'ok'
        ? { metronome: { verdict: result.tempo.metronome.verdict, deviationMs: Math.abs(result.tempo.metronome.offsetMs), spreadMs: result.tempo.metronome.spreadMs } }
        : {}),
    },
    issues: issues.map((i) => ({ ref: i.id, type: i.type, measure: i.measure, ...(i.hand && i.hand !== 'unknown' ? { hand: i.hand === 'left' ? 'tay trái' : 'tay phải' } : {}), lostPoints: Math.round(i.deduction * 10) / 10, message: i.message })),
    measuresToReview: measures.map((m) => ({ measure: m.measure, lostPoints: Math.round(m.lost * 10) / 10 })),
    recommendations: ctx.recommendations.map((r) => ({ ref: r.id, title: r.title, reason: r.reason, ...(r.measures ? { measures: r.measures } : {}), ...(r.tempoPercent ? { tempoPercent: r.tempoPercent } : {}) })),
  };
  if (ctx.learner) {
    payload.learner = { ageGroup: AGE_GROUP_LABELS[ageGroup(ctx.learner.age)], level: EXPERIENCE_LABELS[ctx.learner.experience]?.label ?? ctx.learner.experience, ...(ctx.shareName ? { name: cleanText(ctx.learner.name, 40) } : {}) };
  }
  if (ref.twoHands && (result.hands.right || result.hands.left)) {
    payload.hands = {
      ...(result.hands.right ? { rightAccuracy: Math.round(result.hands.right.accuracy * 100) } : {}),
      ...(result.hands.left ? { leftAccuracy: Math.round(result.hands.left.accuracy * 100) } : {}),
      syncPercent: result.hands.syncRate === undefined || result.hands.syncRate === null ? null : Math.round(result.hands.syncRate * 100),
    };
  }
  const p = ctx.progress;
  if (p && p.attempts > 0) {
    payload.history = { attempts: p.attempts, previousTotal: p.previousTotal, averageTotal: p.averageTotal, deltaVsPrevious: p.deltaVsPrevious, recurring: p.recurring.slice(0, 4).map((r) => r.label), bestTempo: p.bestTempo };
  }
  return payload;
}
