/**
 * Dựng prompt cho "thầy AI" (Ollama cục bộ) nhận xét người chơi sau mỗi bài.
 * Chỉ dùng số liệu app đã chấm — model được yêu cầu không bịa thêm.
 */
import { midiToLabel, type NoteLabelStyle } from '../music/notes';
import { computeAccuracy, type PracticeState } from '../practice/PracticeEngine';
import type { TempoState } from '../practice/TempoFollower';
import type { PerformanceState } from '../practice/PerformanceTracker';
import type { PerformBreakdown, PerformNote } from '../practice/performPlan';
import { formatMistake, scoreLesson, type ExerciseScore } from '../curriculum/scoring';
import { text, type CurriculumLesson, type UiMode } from '../curriculum/types';
import { EXPERIENCE_LABELS, type LearnerProfile } from '../profile/LearnerProfile';
import type { ChatMessage } from './OllamaClient';

export interface CoachReport {
  /** Tên bài / buổi học. */
  title: string;
  kind: 'lesson' | 'piece';
  /** 0–100. */
  score: number;
  passed?: boolean;
  passScore?: number;
  /** Tiêu chí 0..1; null = không đo được (ví dụ trường độ khi dùng micro). */
  criteria: { label: string; value: number | null }[];
  exercises?: { title: string; score: number | null; passed: boolean }[];
  mistakes: { text: string; count: number }[];
  durationMs?: number;
  /** Thông tin thêm về cách chấm (mỗi dòng một ý), ví dụ "không xét đúng/sai nốt". */
  facts?: string[];
}

export type CoachLearner = Pick<LearnerProfile, 'name' | 'age' | 'experience'>;

const MAX_MISTAKES = 6;

function topMistakes(counts: Map<string, number>): CoachReport['mistakes'] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MISTAKES)
    .map(([t, count]) => ({ text: t, count }));
}

/** Báo cáo từ kết quả một buổi học của giáo trình (các bài tập trong lần làm này). */
export function lessonReport(
  lesson: Pick<CurriculumLesson, 'title' | 'exercises' | 'assessment'>,
  scores: Record<string, ExerciseScore | undefined>,
  labelStyle: NoteLabelStyle,
): CoachReport {
  const result = scoreLesson(lesson, scores, true);
  const done = lesson.exercises.map((e) => scores[e.id]).filter((s): s is ExerciseScore => s !== undefined);
  // Gộp tiêu chí cùng tên qua các bài tập: trung bình các giá trị đo được.
  const byLabel = new Map<string, number[]>();
  for (const s of done) {
    for (const c of s.criteria) {
      const list = byLabel.get(c.label) ?? [];
      if (c.value !== null) list.push(c.value);
      byLabel.set(c.label, list);
    }
  }
  const criteria = [...byLabel.entries()].map(([label, vs]) => ({
    label,
    value: vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : null,
  }));
  const mistakes = new Map<string, number>();
  for (const s of done) for (const m of s.mistakes) {
    const t = formatMistake(m, labelStyle);
    mistakes.set(t, (mistakes.get(t) ?? 0) + 1);
  }
  return {
    title: text(lesson.title),
    kind: 'lesson',
    score: result.score,
    passed: result.passed,
    passScore: lesson.assessment.passScore,
    criteria,
    exercises: lesson.exercises.map((e) => {
      const s = scores[e.id];
      return { title: text(e.title), score: s?.score ?? null, passed: s?.passed ?? false };
    }),
    mistakes: topMistakes(mistakes),
  };
}

/** Thông tin thêm của lượt chơi ở màn Luyện tập: điểm từng tay, ô hay sai (đã chấm bằng số liệu, AI chỉ diễn giải). */
export interface PracticeExtras {
  /** Độ chính xác từng tay 0..1 (null = tay đó không bấm phím nào / không chấm). */
  hands?: { right?: number | null; left?: number | null };
  /** Ô nhịp có lỗi (số ô in trên bản nhạc), nhiều lỗi trước. */
  weakMeasures?: { measure: number; total: number }[];
  /** Ghi chú cách chấm (vd "micro chỉ chấm giai điệu tay phải"). */
  facts?: string[];
}

function extrasFacts(extra: PracticeExtras | undefined): string[] {
  if (!extra) return [];
  const out: string[] = [];
  const pctOrNot = (v: number | null | undefined) => (v === null || v === undefined ? null : `${Math.round(v * 100)}%`);
  const r = pctOrNot(extra.hands?.right);
  const l = pctOrNot(extra.hands?.left);
  if (r || l) out.push(`Đúng nốt từng tay: ${[r && `tay phải ${r}`, l && `tay trái ${l}`].filter(Boolean).join(', ')}.`);
  if (extra.weakMeasures?.length) out.push(`Ô nhịp nhiều lỗi: ${extra.weakMeasures.map((m) => `ô ${m.measure} (${m.total} lỗi)`).join(', ')}.`);
  return [...out, ...(extra.facts ?? [])];
}

/** Báo cáo từ một lượt chơi bài ở màn Luyện tập (Wait Mode / Đếm nốt). */
export function practiceReport(title: string, state: PracticeState, labelStyle: NoteLabelStyle, pedal?: number | null, extra?: PracticeExtras): CoachReport {
  const accuracy = computeAccuracy(state);
  const mistakes = new Map<string, number>();
  state.results.forEach((r, i) => {
    const note = midiToLabel(state.expected[i], labelStyle);
    const t = r === 'skipped' ? `Bỏ qua nốt ${note}` : r === 'wrong' || r === 'corrected' ? `Đánh sai ở nốt ${note}` : null;
    if (t) mistakes.set(t, (mistakes.get(t) ?? 0) + 1);
  });
  const notes = state.expected.length;
  return {
    title,
    kind: 'piece',
    score: Math.round(accuracy * 100),
    criteria: [
      { label: 'Đúng nốt', value: accuracy },
      { label: 'Hoàn thành', value: notes ? (notes - state.skipped) / notes : 0 },
      ...(pedal === undefined ? [] : [{ label: 'Pedal', value: pedal }]),
    ],
    mistakes: topMistakes(mistakes),
    durationMs: state.finishedAt !== null && state.startedAt !== null ? state.finishedAt - state.startedAt : undefined,
    facts: ['Chờ nốt / Đếm nốt không có đồng hồ nhịp nên không có điểm tiết tấu.', ...extrasFacts(extra)],
  };
}

/** Báo cáo lượt Biểu diễn ở màn Luyện tập (đồng hồ nhịp cố định, chấm cả hai tay khi có đàn MIDI / bàn phím ảo). */
export function performReport(
  title: string,
  plan: readonly PerformNote[],
  state: PerformanceState,
  breakdown: PerformBreakdown,
  labelStyle: NoteLabelStyle,
  bpm: number,
  extraFacts: string[] = [],
): CoachReport {
  const mistakes = new Map<string, number>();
  plan.forEach((n, i) => {
    const r = state.results[i];
    const played = state.playedMidis[i];
    const t =
      r === 'wrong' && played !== null
        ? `Cần ${midiToLabel(n.midi, labelStyle)}, đánh ${midiToLabel(played, labelStyle)} (${n.hand === 'left' ? 'tay trái' : 'tay phải'})`
        : r === 'skipped'
          ? `Lỡ nốt ${midiToLabel(n.midi, labelStyle)} (${n.hand === 'left' ? 'tay trái' : 'tay phải'})`
          : null;
    if (t) mistakes.set(t, (mistakes.get(t) ?? 0) + 1);
  });
  const list = topMistakes(mistakes);
  if (state.extras > 0) list.push({ text: 'Gõ thừa (không khớp nốt nào)', count: state.extras });
  const hands = breakdown.hands;
  return {
    title,
    kind: 'piece',
    score: breakdown.score,
    criteria: breakdown.criteria.map((c) => ({ label: c.label, value: c.value })),
    mistakes: list,
    facts: [
      `Chế độ Biểu diễn: đồng hồ nhịp cố định ♩=${bpm}, chơi một mạch, sai không dừng.`,
      ...extrasFacts({ hands: { right: hands.right?.pitchAccuracy, left: hands.left?.pitchAccuracy }, weakMeasures: breakdown.measures.slice(0, 3) }),
      ...(breakdown.sync !== null ? [`Hai tay đánh cùng lúc (lệch ≤ 80 ms) ở ${Math.round(breakdown.sync * 100)}% số chỗ có cả hai tay.`] : []),
      ...extraFacts,
    ],
  };
}

/**
 * Báo cáo từ một lượt "Chạy theo nhịp": chỉ đo thời điểm gõ, KHÔNG xét cao độ.
 * Điểm = tỉ lệ nốt đánh đúng phách trên tổng số nốt (như độ chính xác bài tiết tấu).
 */
export function tempoReport(
  title: string,
  tempo: TempoState,
  expected: readonly number[],
  labelStyle: NoteLabelStyle,
  targetBpm: number,
  pedal?: number | null,
): CoachReport {
  const total = tempo.results.length;
  const completion = total ? tempo.hits / total : 0;
  const onTimeRatio = tempo.hits ? tempo.onTime / tempo.hits : 0;
  const mistakes = new Map<string, number>();
  tempo.results.forEach((r, i) => {
    if (r !== 'skipped' || expected[i] === undefined) return;
    const t = `Lỡ nốt ${midiToLabel(expected[i], labelStyle)}`;
    mistakes.set(t, (mistakes.get(t) ?? 0) + 1);
  });
  const list = topMistakes(mistakes);
  if (tempo.extra > 0) list.push({ text: 'Gõ thừa (không khớp nốt nào)', count: tempo.extra });
  const endBpm = Math.round(tempo.currentBpm);
  const drift = endBpm - targetBpm;
  return {
    title,
    kind: 'piece',
    score: Math.round(onTimeRatio * completion * 100),
    criteria: [
      { label: 'Đúng nốt', value: null },
      { label: 'Đúng nhịp (trong các nốt đã đánh)', value: onTimeRatio },
      { label: 'Hoàn thành', value: completion },
      ...(pedal === undefined ? [] : [{ label: 'Pedal', value: pedal }]),
    ],
    mistakes: list,
    durationMs: tempo.finishedAt !== null && tempo.startedAt !== null ? tempo.finishedAt - tempo.startedAt : undefined,
    facts: [
      'Chế độ chạy theo nhịp: chỉ chấm thời điểm gõ phím, không xét đánh đúng hay sai nốt.',
      `Nhịp độ đặt ♩=${targetBpm}, lúc kết thúc người chơi ở ♩=${endBpm}` +
        (Math.abs(drift) >= 4 ? ` (${drift > 0 ? 'nhanh dần' : 'chậm dần'} ${Math.abs(drift)}).` : ' (giữ nhịp ổn định).'),
    ],
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function buildCoachMessages(report: CoachReport, learner: CoachLearner | null, mode: UiMode): ChatMessage[] {
  const kids = mode === 'kids';
  const system = [
    'Bạn là giáo viên piano người Việt, tận tâm và tích cực.',
    'Viết nhận xét bằng tiếng Việt có dấu, 3–5 câu, không dùng tiêu đề hay gạch đầu dòng.',
    kids
      ? 'Học viên là trẻ em: xưng "cô", gọi học viên là "con", câu ngắn, dễ hiểu, vui vẻ, có thể dùng 1–2 emoji.'
      : 'Học viên là người lớn hoặc thiếu niên: xưng "tôi", gọi "bạn", giọng thân thiện, cụ thể.',
    'Cấu trúc: (1) một lời khen cụ thể dựa trên số liệu; (2) chỉ ra điểm yếu nhất; (3) một bài tập/mẹo luyện cụ thể cho lần sau.',
    'CHỈ dựa vào số liệu được cung cấp, không bịa thêm nốt, số liệu hay chi tiết bản nhạc.',
    'Tiêu chí ghi "không đo" thì không được nhắc tới.',
    'Không nhận xét học viên dùng ngón tay nào: app không đo được ngón tay (số ngón trên khuông chỉ là gợi ý).',
  ].join('\n');

  const lines: string[] = [];
  if (learner) {
    lines.push(`Học viên: ${learner.name}, ${learner.age} tuổi, trình độ: ${EXPERIENCE_LABELS[learner.experience]?.label ?? learner.experience}.`);
  }
  lines.push(`${report.kind === 'lesson' ? 'Buổi học' : 'Bài nhạc'}: "${report.title}".`);
  let scoreLine = `Điểm: ${report.score}/100`;
  if (report.passScore !== undefined) scoreLine += ` (cần ${report.passScore} để đạt)`;
  if (report.passed !== undefined) scoreLine += ` — ${report.passed ? 'ĐẠT' : 'CHƯA ĐẠT'}`;
  lines.push(`${scoreLine}.`);
  if (report.criteria.length) {
    lines.push(`Tiêu chí: ${report.criteria.map((c) => `${c.label} ${c.value === null ? 'không đo' : pct(c.value)}`).join('; ')}.`);
  }
  if (report.exercises?.length) {
    lines.push('Bài tập:');
    for (const e of report.exercises) lines.push(`- ${e.title}: ${e.score === null ? 'chưa làm' : `${e.score}/100${e.passed ? ' (đạt)' : ''}`}`);
  }
  for (const f of report.facts ?? []) lines.push(f);
  if (report.durationMs !== undefined) lines.push(`Thời gian chơi: ${Math.round(report.durationMs / 1000)} giây.`);
  lines.push(
    report.mistakes.length
      ? `Lỗi hay gặp: ${report.mistakes.map((m) => (m.count > 1 ? `${m.text} (×${m.count})` : m.text)).join('; ')}.`
      : 'Không có lỗi nào được ghi lại.',
  );
  lines.push('Hãy viết nhận xét cho học viên.');

  return [
    { role: 'system', content: system },
    { role: 'user', content: lines.join('\n') },
  ];
}
