/**
 * Tiêu chí "Pedal" (pedal vang CC 64). Giá trị = công thức cũ `pedalQuality` trên trục phách (đổi ms → phách bằng bản đồ tempo
 * của chính người chơi); issue chi tiết tái hiện đúng các cửa sổ của công thức đó nên Σ khấu trừ = 1 − giá trị.
 *
 * Chỉ chấm khi: bài có ký hiệu pedal (không phải pedal gợi ý) — hoặc người dùng chọn "bài này không dùng pedal" — VÀ phiên có
 * tín hiệu pedal (đàn đã gửi CC 64 / bước kiểm tra pedal đã nhận). Thiếu một trong hai → "chưa đủ điều kiện chấm", không đoán.
 * Half-pedal: giá trị 0–127 được ghi nhận, chỉ chấm đạp / nhả theo ngưỡng 64. Sostenuto / pedal mềm: ghi nhận, không chấm.
 */
import { PEDAL_BLIP, PEDAL_DOWN_EARLY, PEDAL_DOWN_LATE, PEDAL_UP_TOLERANCE, pedalQuality, type PedalEvent } from '../../music/pedal';
import { measureAtBeat } from '../reference/fromLesson';
import type { ScoringResult } from '../types';
import { beatNumber, formatNumber, measureLabel, type AnalysisContext, type CriterionOutcome, type IssueDraft } from './context';

export type PedalRule = 'auto' | 'none-expected';

export interface PedalOutcome extends CriterionOutcome {
  info: NonNullable<ScoringResult['pedalInfo']>;
}

const EPS = 1e-9;
/** Không có ký hiệu mà giữ pedal lâu hơn chừng này ô → "giữ liên tục". */
const CONTINUOUS_MEASURES = 2;

export function analyzePedal(ctx: AnalysisContext, rule: PedalRule = 'auto'): PedalOutcome {
  const { ref, perf, aligned } = ctx;
  const map = aligned.map;
  const marks = ref.pedal.graded ? ref.pedal.ranges : [];
  const info = {
    ranges: marks.length,
    intervals: perf.sustain.intervals.length,
    continuous: perf.sustain.continuous,
    sostenutoUsed: perf.sostenuto.intervals.length > 0,
    softUsed: perf.soft.intervals.length > 0,
  };
  if (!marks.length && rule !== 'none-expected') {
    return { value: null, subScores: [], issues: [], info, reason: ref.pedal.ranges.length ? 'Bài chỉ gợi ý pedal (bản cơ bản) — không chấm pedal' : 'Bài không có ký hiệu pedal — không chấm pedal' };
  }
  if (!ctx.capabilities.pedal && !perf.sustainSeen) {
    return { value: null, subScores: [], issues: [], info, reason: 'Chưa nhận được tín hiệu pedal (CC 64) từ đàn trong phiên này — chưa đủ điều kiện chấm pedal' };
  }

  const endBeat = ref.totalBeats;
  const iv = perf.sustain.intervals.map((x) => ({ down: map.beatAt(x.down), up: x.up === null ? Infinity : map.beatAt(x.up) }));
  const events: PedalEvent[] = iv.flatMap((x) => [{ beat: x.down, down: true }, ...(Number.isFinite(x.up) ? [{ beat: x.up, down: false }] : [])]);
  const value = pedalQuality(marks, events, endBeat);

  const used = iv.map(() => false);
  // Tổng = số khoảng ký hiệu + số lần đạp thừa (như pedalQuality) — tính sau khi biết lần nào được dùng.
  type Draft = { issue: IssueDraft; units: number; interval?: number; boundary?: number };
  const drafts: Draft[] = [];
  const pos = (beat: number) => {
    const m = measureAtBeat(ref, Math.min(endBeat - EPS, Math.max(0, beat)));
    const mi = ref.printedMeasures.indexOf(m);
    return { measure: m, inMeasure: beat - ref.measureStarts[Math.max(0, mi)] };
  };
  const at = (beat: number) => {
    const p = pos(beat);
    return `${measureLabel(p.measure)}, phách ${formatNumber(beatNumber(ref, p.inMeasure), 2)}`;
  };
  const mk = (type: IssueDraft['type'], beat: number, units: number, message: string, extra: Partial<IssueDraft> = {}, interval?: number, boundary?: number): Draft => {
    const p = pos(beat);
    return {
      issue: { criterion: 'pedal', type, severity: units >= 1 ? 'major' : 'minor', measure: p.measure, beat: p.inMeasure, refNoteIds: [], perfNoteIds: [], criterionDeduction: 0, confidence: 'high', message, ...extra },
      units,
      ...(interval !== undefined ? { interval } : {}),
      ...(boundary !== undefined ? { boundary } : {}),
    };
  };

  marks.forEach((r, i) => {
    const chained = i > 0 && Math.abs(marks[i - 1].endBeat - r.startBeat) < EPS;
    const len = r.endBeat - r.startBeat;
    const lo = chained ? r.startBeat - PEDAL_DOWN_EARLY : i > 0 ? marks[i - 1].endBeat : -Infinity;
    const hi = r.startBeat + Math.min(PEDAL_DOWN_LATE, len / 2);
    const k = iv.findIndex((x, j) => !used[j] && x.down >= lo - EPS && x.down <= hi + EPS);
    if (k < 0) {
      const covering = iv.findIndex((x) => x.down < lo - EPS && x.up > r.startBeat + EPS);
      const late = iv.findIndex((x, j) => !used[j] && x.down > hi + EPS && x.down < r.endBeat - EPS);
      // Cùng một lần "không thay pedal" ở ranh giới này đã ghi (nửa điểm nhả của khoảng trước) → gộp làm một lỗi.
      const sameBoundary = drafts.find((d) => d.issue.type === 'pedal-not-changed' && d.boundary !== undefined && Math.abs(d.boundary - r.startBeat) < EPS);
      if (covering >= 0 && chained && used[covering] && sameBoundary) sameBoundary.units += 1;
      else if (covering >= 0 && chained && used[covering]) drafts.push(mk('pedal-not-changed', r.startBeat, 1, `${at(r.startBeat)}: chưa thay pedal khi đổi hợp âm (giữ pedal từ khoảng trước).`, {}, undefined, r.startBeat));
      else if (covering >= 0 && !used[covering]) drafts.push(mk('pedal-early', r.startBeat, 1, `${at(r.startBeat)}: đạp pedal sớm (từ ${at(iv[covering].down)}).`, {}, covering));
      else if (late >= 0) drafts.push(mk('pedal-late', r.startBeat, 1, `${at(r.startBeat)}: đạp pedal muộn ${formatNumber(Math.round((iv[late].down - r.startBeat) * 10) / 10)} phách.`, { value: Math.round((iv[late].down - r.startBeat) * 100) / 100 }, late));
      else drafts.push(mk('pedal-missing', r.startBeat, 1, `${at(r.startBeat)}: chưa đạp pedal theo ký hiệu.`));
      return;
    }
    used[k] = true;
    const tol = Math.min(PEDAL_UP_TOLERANCE, len / 2);
    const up = iv[k].up;
    const atEnd = r.endBeat >= endBeat - EPS;
    if (up < r.endBeat - tol - EPS) drafts.push(mk('pedal-release-early', up, 0.5, `${at(up)}: nhả pedal sớm (ký hiệu tới ${at(r.endBeat)}).`));
    else if (!atEnd && up > r.endBeat + tol + EPS) {
      const next = marks[i + 1];
      const intoNext = next && Math.abs(next.startBeat - r.endBeat) < EPS;
      drafts.push(
        intoNext
          ? mk('pedal-not-changed', r.endBeat, 0.5, `${at(r.endBeat)}: giữ pedal qua chỗ đổi hợp âm — cần nhả rồi đạp lại.`, {}, undefined, r.endBeat)
          : mk('pedal-release-late', r.endBeat, 0.5, `${at(r.endBeat)}: nhả pedal muộn${Number.isFinite(up) ? ` (tới ${at(up)})` : ' (chưa nhả)'}.`),
      );
    }
  });

  // Đạp thừa (không khớp ký hiệu nào): gộp vào issue "đạp sớm / muộn" của cùng lần đạp nếu có.
  iv.forEach((x, j) => {
    if (used[j] || Math.min(x.up, endBeat) - x.down <= PEDAL_BLIP) return;
    const owner = drafts.find((d) => d.interval === j);
    if (owner) {
      owner.units += 1;
      return;
    }
    const lengthMeasures = (Math.min(x.up, endBeat) - x.down) / ((ref.timeSignature[0] * 4) / ref.timeSignature[1]);
    const continuous = !marks.length && lengthMeasures >= CONTINUOUS_MEASURES;
    drafts.push(
      continuous
        ? mk('pedal-continuous', x.down, 1, `${at(x.down)}: giữ pedal liên tục ${formatNumber(Math.round(lengthMeasures * 10) / 10)} ô — bài này không dùng pedal.`, { toMeasure: pos(Math.min(x.up, endBeat) - EPS).measure })
        : mk('pedal-stray', x.down, 1, `${at(x.down)}: đạp pedal ở chỗ không có ký hiệu.`),
    );
  });

  const strayCount = iv.filter((x, j) => !used[j] && Math.min(x.up, endBeat) - x.down > PEDAL_BLIP).length;
  const total = marks.length + strayCount;
  const issues = drafts.map((d) => ({ ...d.issue, criterionDeduction: total ? d.units / total : 0 }));
  return { value, subScores: [], issues, info };
}
