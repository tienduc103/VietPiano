/**
 * Music Scoring Engine (thành phần B) — thuần, tất định, KHÔNG dùng LLM.
 *   ScoreReference + BuiltPerformance → căn chỉnh → 5 tiêu chí → điểm /100 theo chế độ.
 * Tiêu chí không đo được (thiếu Note Off / velocity / pedal / ký hiệu) = null → trọng số chia lại theo tỉ lệ, kèm lý do.
 * Mỗi issue mang `deduction` = điểm /100 nó làm mất ⇒ total = 100 − Σ deduction (sai khác chỉ do làm tròn).
 * Kết quả ghi phiên bản engine / thuật toán / trọng số → chấm lại phiên cũ bằng bản mới mà vẫn giữ kết quả cũ.
 */
import { ALIGNMENT_VERSION, CRITERION_LABEL, SCORING_ENGINE_VERSION, WEIGHTS_VERSION, type BuiltPerformance, type CoachMode, type CriterionKey, type CriterionScore, type InputCapabilities, type MeasureSummary, type NoteAlignment, type PerformanceSession, type ScoreReference, type ScoringIssue, type ScoringResult } from '../types';
import { alignPerformance, mapOfRef } from './align';
import { analyzeDuration } from './analyzeDuration';
import { analyzeDynamics } from './analyzeDynamics';
import { analyzeMetronome, metronomeText } from './analyzeMetronome';
import { analyzeNotes, baseAlignment } from './analyzeNotes';
import { analyzePedal, type PedalRule } from './analyzePedal';
import { analyzeRhythm } from './analyzeRhythm';
import { createContext, type CriterionOutcome, type IssueDraft } from './context';
import { modeParams } from './modes';
import { OUTPUT_CHANGE_MS, sanitizeCalibration } from '../latency/store';

export interface ScoreInput {
  reference: ScoreReference;
  performance: BuiltPerformance;
  /** Phiên đã ghi (truyền cả `PerformanceSession` → có metronome / độ trễ máy để so nốt với tiếng click). */
  session: { id: string; profileKey: string; lessonId: string } & Partial<Pick<PerformanceSession, 'metronome' | 'latencyMs' | 'latencyCalibration' | 'outputLatencyMs'>>;
  capabilities: InputCapabilities;
  mode?: CoachMode;
  pedalRule?: PedalRule;
  /** Trọng số riêng theo giáo trình / mục tiêu bài (đè lên trọng số của chế độ). */
  weights?: Partial<Record<CriterionKey, number>>;
  now?: number;
}

/** Tỉ lệ nhóm neo được dưới mức này → "không đối chiếu được". */
export const MIN_ALIGNMENT = 0.4;

const ORDER: CriterionKey[] = ['notes', 'rhythm', 'duration', 'pedal', 'dynamics'];

export function scorePerformance(input: ScoreInput): ScoringResult {
  const { reference: ref, performance: perf, capabilities } = input;
  const mode = input.mode ?? 'technical';
  const params = modeParams(mode, input.weights);
  const aligned = alignPerformance(ref, perf);
  const ctx = createContext(ref, perf, aligned, mode, params, capabilities);

  const notes = analyzeNotes(ctx);
  const rhythm = analyzeRhythm(ctx);
  const duration = analyzeDuration(ctx);
  const pedal = analyzePedal(ctx, input.pedalRule ?? 'auto');
  const dynamics = analyzeDynamics(ctx);
  // So với tiếng metronome: thông tin, không vào điểm.
  // Phiên đọc từ bộ nhớ là dữ liệu không tin cậy → kiểm số đo trước khi dùng.
  const cal = input.session.latencyCalibration ? sanitizeCalibration(input.session.latencyCalibration) : null;
  const outputNow = input.session.outputLatencyMs ?? null;
  const outputChanged = !!cal && cal.outputLatencyMs !== null && outputNow !== null && Math.abs(outputNow - cal.outputLatencyMs) > OUTPUT_CHANGE_MS;
  const metronome = analyzeMetronome(ctx, { metronome: input.session.metronome ?? false, latencyMs: input.session.latencyMs ?? 0, calibration: cal, outputChanged });
  const outcomes: Record<CriterionKey, CriterionOutcome> = { notes, rhythm, duration, pedal, dynamics };

  // ── trọng số hiệu dụng ──
  const available = ORDER.filter((k) => outcomes[k].value !== null && params.weights[k] > 0);
  const totalWeight = available.reduce((a, k) => a + params.weights[k], 0);
  let n = 0;
  const issues: ScoringIssue[] = [];
  const criteria: CriterionScore[] = ORDER.map((key) => {
    const o = outcomes[key];
    const weight = params.weights[key];
    const effectiveWeight = o.value !== null && totalWeight > 0 && weight > 0 ? (weight / totalWeight) * 100 : 0;
    const ids: string[] = [];
    for (const d of o.issues as IssueDraft[]) {
      const id = `I${++n}`;
      ids.push(id);
      issues.push({ ...d, id, deduction: Math.round(d.criterionDeduction * effectiveWeight * 100) / 100 });
    }
    return {
      key,
      label: CRITERION_LABEL[key],
      value: o.value,
      weight,
      effectiveWeight: Math.round(effectiveWeight * 100) / 100,
      points: o.value === null ? 0 : Math.round(o.value * effectiveWeight * 100) / 100,
      subScores: o.subScores,
      issueIds: ids,
      ...(o.reason ? { reason: o.reason } : {}),
    };
  });
  const total = totalWeight > 0 ? Math.round(criteria.reduce((a, c) => a + (c.value === null ? 0 : c.value * c.effectiveWeight), 0)) : 0;

  // ── bảng ghép từng nốt ──
  const alignment: NoteAlignment[] = baseAlignment(ctx, notes.extras, notes.replayed).map((a, i) => {
    if (i >= ref.notes.length) return a;
    const t = rhythm.timing.get(i);
    const d = duration.durations.get(i);
    return {
      ...a,
      ...(t ? { expectedMs: Math.round(t.expectedMs), deviationMs: Math.round(t.deviationMs), timing: t.status } : { expectedMs: Math.round(mapOfRef(aligned, i).msAt(ref.notes[i].onsetBeat)) }),
      ...(d ? { heldMs: d.heldMs === null ? null : Math.round(d.heldMs), soundingMs: d.soundingMs === null ? null : Math.round(d.soundingMs), expectedDurationMs: Math.round(d.expectedMs), ...(d.ratio !== null ? { durationRatio: Math.round(d.ratio * 100) / 100 } : {}), duration: d.status } : {}),
    };
  });

  const counts = {
    refNotes: ref.notes.length,
    correct: ctx.status.filter((s) => s === 'correct').length,
    octave: ctx.status.filter((s) => s === 'octave').length,
    wrong: ctx.status.filter((s) => s === 'wrong').length,
    missing: ctx.status.filter((s) => s === 'missing').length,
    order: ctx.status.filter((s) => s === 'order').length,
    extra: notes.extras.filter((x) => x.kind === 'extra').length,
    repeated: notes.extras.filter((x) => x.kind === 'repeated').length,
    simultaneous: notes.extras.filter((x) => x.kind === 'simultaneous').length,
    performed: perf.notes.length,
    replayed: notes.replayed.length,
    restarts: aligned.restarts.filter((r) => !r.afterEnd).length,
  };

  // ── theo ô nhịp ──
  const byMeasure = new Map<number, MeasureSummary>();
  const m = (measure: number) => {
    let s = byMeasure.get(measure);
    if (!s) byMeasure.set(measure, (s = { measure, notes: 0, correct: 0, wrong: 0, missing: 0, extra: 0, timing: 0, duration: 0, pedal: 0, lost: 0 }));
    return s;
  };
  ref.printedMeasures.forEach((pm) => m(pm));
  ref.notes.forEach((note, i) => {
    const s = m(note.measure);
    s.notes++;
    const st = ctx.status[i];
    if (st === 'correct') s.correct++;
    else if (st === 'missing') s.missing++;
    else s.wrong++;
  });
  for (const x of notes.extras) m(x.measure).extra++;
  for (const iss of issues) {
    if (iss.measure === null) continue;
    const s = m(iss.measure);
    s.lost = Math.round((s.lost + iss.deduction) * 100) / 100;
    if (iss.criterion === 'rhythm' && (iss.type === 'early' || iss.type === 'late' || iss.type === 'hesitation' || iss.type === 'restart' || iss.type.endsWith('async'))) s.timing++;
    if (iss.criterion === 'duration') s.duration++;
    if (iss.criterion === 'pedal') s.pedal++;
  }

  // ── độ tin cậy + giải thích ──
  const anchored = aligned.anchoredRatio;
  const lowAlign = ref.notes.length > 0 && anchored < MIN_ALIGNMENT;
  const unavailable = ORDER.filter((k) => outcomes[k].value === null).map((k) => ({ criterion: k, reason: outcomes[k].reason ?? 'Không đo được' }));
  const explanation: string[] = [];
  for (const u of unavailable) explanation.push(`${CRITERION_LABEL[u.criterion]}: ${u.reason}. Trọng số ${params.weights[u.criterion]} được chia lại cho các tiêu chí còn lại.`);
  if (lowAlign) explanation.push(`Chỉ đối chiếu được ${Math.round(anchored * 100)}% bản nhạc — có thể đã chơi bài khác hoặc chơi rất ít nốt; điểm chỉ mang tính tham khảo.`);
  if (counts.restarts)
    explanation.push(
      `Có ${counts.restarts} lần dừng lại rồi chơi lại: mỗi nốt chấm theo lần đầu chơi tới nó (nốt sai trước khi dừng vẫn tính), ${counts.replayed} nốt chơi lại đoạn đã qua không chấm và không tính là nốt thừa; mỗi lần chơi lại trừ như một chỗ ngắt quãng.`,
    );
  const afterEnd = aligned.restarts.find((r) => r.afterEnd);
  if (afterEnd) explanation.push(`Sau khi đã chơi hết bài có chơi thêm ${aligned.replayed.filter((p) => perf.notes[p].onMs >= afterEnd.atMs).length} nốt — phần chơi thêm không chấm.`);
  if (perf.sustain.continuous) explanation.push('Đàn gửi pedal liên tục (half-pedal): app ghi lại độ sâu nhưng chỉ chấm đạp / nhả theo ngưỡng 64.');
  if (perf.orphanOffs) explanation.push(`${perf.orphanOffs} lần thả phím không có lần nhấn tương ứng (vd phím dùng để bấm nút) — đã bỏ qua.`);
  if (perf.disconnects) explanation.push(`Đàn mất kết nối ${perf.disconnects} lần trong lúc ghi — nốt bị ngắt khi đó không tính trường độ.`);
  if (input.performance.notes.some((x) => x.source === 'microphone')) explanation.push('Nghe bằng micro: chỉ chấm nốt đơn, độ chính xác thấp hơn đàn MIDI; không đo trường độ và pedal.');
  if (cal) explanation.push(`Đã bù độ trễ đo của máy: ${cal.offsetMs} ms (±${cal.jitterMs} ms, ${cal.taps}/${cal.clicks} lần gõ) cho mọi nốt và pedal — chỉ dời mốc thời gian, không đổi điểm nhịp (nhịp chấm theo tương quan giữa các nốt).`);
  if (metronome) explanation.push(metronome.status === 'ok' ? `${metronomeText(metronome)} Chỉ là thông tin, không trừ điểm.` : metronomeText(metronome));
  if (outputChanged && cal) explanation.push(`Độ trễ loa / tai nghe trình duyệt báo lúc ghi (${outputNow} ms) khác lúc đo (${cal.outputLatencyMs} ms) — có thể đã đổi loa / tai nghe; nên đo lại độ trễ.`);
  explanation.push('Bài không có ký hiệu legato / staccato / dấu nối / ngắt câu nên các ý đó không được chấm.');
  const micro = input.performance.notes.some((x) => x.source === 'microphone');
  const overall: ScoringResult['confidence']['overall'] = lowAlign ? 'low' : micro || anchored < 0.75 ? 'medium' : 'high';

  return {
    id: `${input.session.id}|${SCORING_ENGINE_VERSION}|${mode}`,
    sessionId: input.session.id,
    profileKey: input.session.profileKey,
    lessonId: input.session.lessonId,
    referenceId: ref.id,
    mode,
    engineVersion: SCORING_ENGINE_VERSION,
    alignmentVersion: ALIGNMENT_VERSION,
    weightsVersion: WEIGHTS_VERSION,
    createdAt: input.now ?? Date.now(),
    total,
    criteria,
    counts,
    alignment,
    issues,
    measures: [...byMeasure.values()].sort((a, b) => a.measure - b.measure),
    tempo: metronome ? { ...rhythm.tempo, metronome } : rhythm.tempo,
    hands: rhythm.hands,
    pedalInfo: pedal.info,
    ...(dynamics.info.sections.length ? { dynamicsInfo: dynamics.info } : {}),
    capabilities,
    confidence: { alignment: Math.round(anchored * 100) / 100, overall },
    unavailable,
    explanation,
    tempoMap: roundPoints(aligned.map.points),
    ...(aligned.passes.length > 1 ? { passes: aligned.passes.map((p) => ({ fromMs: Number.isFinite(p.fromMs) ? Math.round(p.fromMs * 10) / 10 : 0, toMs: Number.isFinite(p.toMs) ? Math.round(p.toMs * 10) / 10 : null, tempoMap: roundPoints(p.map.points) })) } : {}),
  };
}

const roundPoints = (points: readonly (readonly [number, number])[]): [number, number][] => points.map(([b, ms]) => [Math.round(b * 1000) / 1000, Math.round(ms * 10) / 10]);

/** Ô nhịp nên luyện lại: ô mất nhiều điểm nhất, gộp ô kề cũng mất điểm (tối đa `maxLength` ô). */
export function weakestMeasures(result: Pick<ScoringResult, 'measures'>, maxLength = 4): [number, number] | null {
  const lost = result.measures.filter((x) => x.lost > 0);
  if (!lost.length) return null;
  const worst = [...lost].sort((a, b) => b.lost - a.lost || a.measure - b.measure)[0];
  const at = (k: number) => result.measures.find((x) => x.measure === k)?.lost ?? 0;
  let from = worst.measure;
  let to = worst.measure;
  while (to - from + 1 < maxLength) {
    const before = at(from - 1);
    const after = at(to + 1);
    if (!before && !after) break;
    if (after >= before) to++;
    else from--;
  }
  return [from, to];
}
