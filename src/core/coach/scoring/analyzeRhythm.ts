/**
 * Tiêu chí "Nhịp điệu" = trung bình có trọng số các điểm con (trọng số theo chế độ, điểm con không đo được bị bỏ):
 *  - timing     : lệch thời điểm từng nhóm nốt so với tempo CỤC BỘ của chính người chơi (hồi quy tuyến tính bỏ-một-ra trong ±N ô,
 *                 loại điểm lệch xa ở lượt hai) → tempo co giãn dần không bị tính là sai từng nốt. `timingQuality`: trọn điểm trong
 *                 dung sai (10% phách, 50–120 ms ở Mode A), 0 điểm ở 3 × dung sai.
 *  - tempo      : tempo trung bình (Theil–Sen trong từng đoạn liền) so tempo mục tiêu.
 *  - stability  : hệ số biến thiên tempo giữa các ô.
 *  - continuity : số chỗ ngắt quãng (khoảng giữa hai nhóm > max(2 × kỳ vọng, kỳ vọng + 700 ms)).
 *  - sync       : hai tay cùng phách (≤ 80 ms, như chế độ Biểu diễn) / các nốt một hợp âm (≤ 60 ms).
 * Thời gian tạm dừng bằng nút đã bị bỏ khỏi trục thời gian từ trước (không thành chỗ ngắt).
 */
import type { Hand } from '../../lessons/types';
import { timingQuality } from '../../practice/PerformanceTracker';
import { beatsPerMeasure } from '../reference/fromLesson';
import type { HandSummary, ScoringResult } from '../types';
import { clamp01, combineSubScores, formatNumber, mean, notePosition, noteName, std, type AnalysisContext, type CriterionOutcome, type IssueDraft } from './context';
import { CHORD_SYNC_MS, HANDS_SYNC_MS, HESITATION_EXTRA_MS, HESITATION_PENALTY, HESITATION_RATIO } from './modes';
import { linearFit, median, quadraticAt } from './tempoMap';

export interface NoteTiming {
  expectedMs: number;
  deviationMs: number;
  status: 'early' | 'late' | 'ok';
}

export interface RhythmOutcome extends CriterionOutcome {
  tempo: ScoringResult['tempo'];
  hands: ScoringResult['hands'];
  /** Theo chỉ số nốt bản nhạc. */
  timing: Map<number, NoteTiming>;
}

interface Pt {
  g: number;
  beat: number;
  t: number;
  notes: number[];
  seg: number;
}

/** Độ lệch xa (× dung sai) bị loại khỏi điểm láng giềng ở lượt hai. */
const OUTLIER_TOL = 2.5;
/** Tempo hợp lý (♩/phút); ngoài khoảng này = căn chỉnh hỏng, không báo tempo. */
export const MIN_PLAUSIBLE_BPM = 20;
export const MAX_PLAUSIBLE_BPM = 400;
/** Nốt đầu / cuối đoạn chỉ dự đoán được từ một phía → dung sai × 1.5. */
const ONE_SIDED_TOL = 1.5;

function pairwiseSlopes(pts: readonly Pt[], maxPairs = 40_000): number[] {
  const out: number[] = [];
  const n = pts.length;
  const step = Math.max(1, Math.ceil((n * (n - 1)) / 2 / maxPairs));
  let k = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (pts[i].seg !== pts[j].seg || k++ % step) continue;
      const db = pts[j].beat - pts[i].beat;
      if (db > 1e-9) out.push((pts[j].t - pts[i].t) / db);
    }
  return out.filter((s) => s > 0);
}

export function analyzeRhythm(ctx: AnalysisContext): RhythmOutcome {
  const { ref, perf, params: P } = ctx;
  const target = ref.targetBpm;
  const issues: IssueDraft[] = [];
  const timing = new Map<number, NoteTiming>();

  const pts: Pt[] = [];
  for (const g of ref.groups) {
    const rs = g.notes.filter((r) => ctx.perfOf[r] !== null && ctx.status[r] !== 'order');
    if (!rs.length) continue;
    pts.push({ g: g.index, beat: g.onsetBeat, t: mean(rs.map((r) => perf.notes[ctx.perfOf[r]!].onMs)), notes: rs, seg: 0 });
  }

  // Độ dài phách của cả bài: trung vị độ dốc giữa hai nhóm liền nhau (bền với vài chỗ ngắt).
  const consecutive = pts.slice(1).map((p, k) => (p.t - pts[k].t) / (p.beat - pts[k].beat)).filter((s) => s > 0 && Number.isFinite(s));
  const mpb = consecutive.length ? median(consecutive) : ctx.aligned.targetMsPerBeat;
  ctx.msPerBeat = mpb;

  // Ngắt quãng → cắt đoạn.
  const hesitations: { k: number; extraMs: number }[] = [];
  let seg = 0;
  pts.forEach((p, k) => {
    if (k > 0) {
      const expected = (p.beat - pts[k - 1].beat) * mpb;
      const actual = p.t - pts[k - 1].t;
      if (actual > Math.max(HESITATION_RATIO * expected, expected + HESITATION_EXTRA_MS)) {
        seg++;
        hesitations.push({ k, extraMs: actual - expected });
      }
    }
    p.seg = seg;
  });

  const windowBeats = Math.max(2, P.localWindowMeasures * beatsPerMeasure(ref));
  const tolOf = (slope: number) => Math.min(P.timingTolMaxMs, Math.max(P.timingTolMinMs, P.timingTolRatio * slope));
  const predict = (k: number, excluded: ReadonlySet<number>) => {
    const p = pts[k];
    const pick = (local: boolean) => pts.filter((q, j) => j !== k && q.seg === p.seg && !excluded.has(j) && (!local || Math.abs(q.beat - p.beat) <= windowBeats));
    let nb = pick(true);
    if (new Set(nb.map((q) => q.beat)).size < 2) nb = pick(false);
    const before = nb.filter((q) => q.beat < p.beat).length;
    const after = nb.filter((q) => q.beat > p.beat).length;
    // Có ≥ 2 láng giềng mỗi phía → bậc hai (bám được tempo đổi dần).
    if (before >= 2 && after >= 2) {
      const q = quadraticAt(
        nb.map((x) => x.beat),
        nb.map((x) => x.t),
        p.beat,
      );
      if (q && q.slope > 0) return { pred: q.value, slope: q.slope, oneSided: false };
    }
    // Chỉ một phía (đầu / cuối đoạn): ngoại suy tuyến tính từ 3 láng giềng gần nhất (ít lệch theo độ cong hơn), dung sai nới ra.
    const oneSided = before === 0 || after === 0;
    if (oneSided) nb = [...nb].sort((a, b) => Math.abs(a.beat - p.beat) - Math.abs(b.beat - p.beat)).slice(0, 3);
    const fit = linearFit(
      nb.map((x) => x.beat),
      nb.map((x) => x.t),
    );
    if (!fit || fit.b <= 0) return null;
    return { pred: fit.a + fit.b * p.beat, slope: fit.b, oneSided };
  };
  const pass1 = pts.map((_, k) => predict(k, new Set()));
  const outliers = new Set(pts.map((_, k) => k).filter((k) => pass1[k] && Math.abs(pts[k].t - pass1[k]!.pred) > OUTLIER_TOL * tolOf(pass1[k]!.slope)));
  const fits = pts.map((_, k) => predict(k, outliers) ?? pass1[k]);

  type Measured = { k: number; dev: number; tol: number; q: number };
  const measured: Measured[] = [];
  fits.forEach((f, k) => {
    if (!f) return;
    const dev = pts[k].t - f.pred;
    const tol = tolOf(f.slope) * (f.oneSided ? ONE_SIDED_TOL : 1);
    measured.push({ k, dev, tol, q: timingQuality(dev, tol, 3 * tol) });
    ctx.expectedGroupMs[pts[k].g] = f.pred;
    ctx.groupDeviation[pts[k].g] = dev;
    for (const r of pts[k].notes) {
      const d = perf.notes[ctx.perfOf[r]!].onMs - f.pred;
      timing.set(r, { expectedMs: f.pred, deviationMs: d, status: Math.abs(d) <= tol ? 'ok' : d < 0 ? 'early' : 'late' });
    }
  });

  // ── tempo ──
  const slopes = pairwiseSlopes(pts);
  const actualMpb = pts.length >= 3 && slopes.length ? median(slopes) : null;
  // Ngoài [20, 400] ♩/phút là căn chỉnh hỏng (chơi bài khác / quá ít nốt khớp) → không báo tempo.
  const rawBpm = actualMpb ? 60000 / actualMpb : null;
  const actualBpm = rawBpm !== null && rawBpm >= MIN_PLAUSIBLE_BPM && rawBpm <= MAX_PLAUSIBLE_BPM ? rawBpm : null;
  let tempoQ: number | null = null;
  if (actualBpm !== null && pts.length >= 3) {
    const dev = Math.abs(actualBpm / target - 1);
    tempoQ = dev <= P.tempoTol ? 1 : clamp01(1 - (dev - P.tempoTol) / (P.tempoZero - P.tempoTol));
  }

  // ── tempo từng ô + độ ổn định ──
  const byMeasure = new Map<string, Pt[]>();
  for (const p of pts) {
    const m = ref.groups[p.g].measure;
    const key = `${m}|${p.seg}`;
    byMeasure.set(key, [...(byMeasure.get(key) ?? []), p]);
  }
  const perMeasure: { measure: number; bpm: number }[] = [];
  for (const [key, list] of byMeasure) {
    if (list.length < 2 || list[list.length - 1].beat - list[0].beat < 1 - 1e-9) continue;
    const fit = linearFit(
      list.map((p) => p.beat),
      list.map((p) => p.t),
    );
    if (fit && fit.b > 0) perMeasure.push({ measure: Number(key.split('|')[0]), bpm: 60000 / fit.b });
  }
  perMeasure.sort((a, b) => a.measure - b.measure);
  let stabilityQ: number | null = null;
  let cv = 0;
  if (perMeasure.length >= 3) {
    const bpms = perMeasure.map((m) => m.bpm);
    cv = std(bpms) / mean(bpms);
    stabilityQ = cv <= P.stabilityFull ? 1 : clamp01(1 - (cv - P.stabilityFull) / (P.stabilityZero - P.stabilityFull));
  }

  // ── nhanh dần / chậm dần ──
  let drift: number | null = null;
  if (pts.length >= 9) {
    const third = (ref.totalBeats || pts[pts.length - 1].beat) / 3;
    const first = pairwiseSlopes(pts.filter((p) => p.beat < third));
    const last = pairwiseSlopes(pts.filter((p) => p.beat >= 2 * third));
    if (first.length >= 3 && last.length >= 3) {
      const d = median(first) / median(last) - 1;
      if (Math.abs(d) <= 1.5) drift = d;
    }
  }

  // ── đồng bộ ──
  type SyncItem = { g: number; q: number; value: number; kind: 'hands' | 'chord'; lateHand?: Hand };
  const sync: SyncItem[] = [];
  let twoHandGroups = 0;
  let synced = 0;
  const offsets: number[] = [];
  for (const p of pts) {
    if (p.notes.length < 2) continue;
    const on = (r: number) => perf.notes[ctx.perfOf[r]!].onMs;
    const right = p.notes.filter((r) => ref.notes[r].hand === 'right').map(on);
    const left = p.notes.filter((r) => ref.notes[r].hand === 'left').map(on);
    if (right.length && left.length) {
      const diff = mean(left) - mean(right);
      twoHandGroups++;
      offsets.push(diff);
      if (Math.abs(diff) <= HANDS_SYNC_MS) synced++;
      sync.push({ g: p.g, q: timingQuality(diff, HANDS_SYNC_MS, 3 * HANDS_SYNC_MS), value: diff, kind: 'hands', lateHand: diff > 0 ? 'left' : 'right' });
    } else {
      const ts = p.notes.map(on);
      const spread = Math.max(...ts) - Math.min(...ts);
      sync.push({ g: p.g, q: timingQuality(spread, CHORD_SYNC_MS, 3 * CHORD_SYNC_MS), value: spread, kind: 'chord' });
    }
  }

  const contQ = pts.length >= 2 ? Math.max(0, 1 - HESITATION_PENALTY * hesitations.length) : null;
  const subScores = [
    { key: 'timing', label: 'Đúng thời điểm', value: measured.length ? mean(measured.map((m) => m.q)) : null, weight: P.rhythm.timing, ...(measured.length ? {} : { reason: 'Chưa đủ nốt đúng để đo' }) },
    { key: 'tempo', label: 'Tempo so mục tiêu', value: tempoQ, weight: P.rhythm.tempo, ...(tempoQ === null ? { reason: 'Chưa đủ nốt để ước lượng tempo' } : {}) },
    { key: 'stability', label: 'Ổn định tempo giữa các ô', value: stabilityQ, weight: P.rhythm.stability, ...(stabilityQ === null ? { reason: 'Cần ít nhất 3 ô đo được tempo' } : {}) },
    { key: 'continuity', label: 'Liên tục (không ngắt quãng)', value: contQ, weight: P.rhythm.continuity },
    { key: 'sync', label: 'Đồng bộ hợp âm / hai tay', value: sync.length ? mean(sync.map((s) => s.q)) : null, weight: P.rhythm.sync, ...(sync.length ? {} : { reason: 'Bài không có hợp âm / chỗ hai tay cùng đánh' }) },
  ];
  const { value, share } = combineSubScores(subScores);

  // ── issues (khấu trừ = phần điểm con bị mất × tỉ trọng điểm con) ──
  const names = (rs: number[]) => rs.map((r) => noteName(perf.notes[ctx.perfOf[r]!].midi)).join(', ');
  const tShare = share.get('timing') ?? 0;
  for (const m of measured) {
    if (m.q >= 1) continue;
    const p = pts[m.k];
    const n = ref.notes[p.notes[0]];
    const early = m.dev < 0;
    issues.push({
      criterion: 'rhythm',
      type: early ? 'early' : 'late',
      severity: Math.abs(m.dev) > 2 * m.tol ? 'major' : 'minor',
      measure: n.measure,
      beat: n.beatInMeasure,
      refNoteIds: p.notes.map((r) => ref.notes[r].id),
      perfNoteIds: p.notes.map((r) => ctx.perfOf[r]!),
      hand: ref.groups[p.g].hands.length === 1 ? ref.groups[p.g].hands[0] : undefined,
      expectedMs: fits[m.k]!.pred,
      actualMs: p.t,
      deviationMs: Math.round(m.dev),
      criterionDeduction: ((1 - m.q) / measured.length) * tShare,
      confidence: 'high',
      message: `${notePosition(ref, n)}: ${names(p.notes)} ${early ? 'sớm' : 'muộn'} ${Math.round(Math.abs(m.dev))} ms so với nhịp của bạn.`,
    });
  }
  if (tempoQ !== null && tempoQ < 1 && actualBpm !== null) {
    const faster = actualBpm > target;
    issues.push({
      criterion: 'rhythm',
      type: faster ? 'tempo-fast' : 'tempo-slow',
      severity: tempoQ < 0.5 ? 'major' : 'minor',
      measure: null,
      refNoteIds: [],
      perfNoteIds: [],
      value: Math.round(actualBpm),
      criterionDeduction: (1 - tempoQ) * (share.get('tempo') ?? 0),
      confidence: 'high',
      message: `Tempo trung bình ♩≈${Math.round(actualBpm)}, ${faster ? 'nhanh' : 'chậm'} hơn mục tiêu ♩=${Math.round(target)} (${Math.round(Math.abs(actualBpm / target - 1) * 100)}%).`,
    });
  }
  if (stabilityQ !== null && stabilityQ < 1) {
    const slow = perMeasure.reduce((a, b) => (b.bpm < a.bpm ? b : a));
    const fast = perMeasure.reduce((a, b) => (b.bpm > a.bpm ? b : a));
    issues.push({
      criterion: 'rhythm',
      type: 'tempo-unstable',
      severity: stabilityQ < 0.5 ? 'major' : 'minor',
      measure: Math.min(slow.measure, fast.measure),
      toMeasure: Math.max(slow.measure, fast.measure),
      refNoteIds: [],
      perfNoteIds: [],
      value: Math.round(cv * 100),
      criterionDeduction: (1 - stabilityQ) * (share.get('stability') ?? 0),
      confidence: 'medium',
      message: `Tempo chưa đều giữa các ô (dao động ${Math.round(cv * 100)}%): ô ${slow.measure} ♩≈${Math.round(slow.bpm)}, ô ${fast.measure} ♩≈${Math.round(fast.bpm)}.`,
    });
  }
  let remaining = contQ === null ? 0 : 1 - contQ;
  for (const h of hesitations) {
    const p = pts[h.k];
    const n = ref.notes[p.notes[0]];
    const d = Math.min(HESITATION_PENALTY, remaining);
    remaining -= d;
    issues.push({
      criterion: 'rhythm',
      type: 'hesitation',
      severity: 'major',
      measure: n.measure,
      beat: n.beatInMeasure,
      refNoteIds: p.notes.map((r) => ref.notes[r].id),
      perfNoteIds: p.notes.map((r) => ctx.perfOf[r]!),
      value: Math.round(h.extraMs),
      criterionDeduction: d * (share.get('continuity') ?? 0),
      confidence: 'high',
      message: `${notePosition(ref, n)}: ngừng thêm ${formatNumber(Math.round(h.extraMs / 100) / 10)} giây trước ${names(p.notes)} (ngắt quãng).`,
    });
  }
  const sShare = share.get('sync') ?? 0;
  for (const s of sync) {
    if (s.q >= 1) continue;
    const g = ref.groups[s.g];
    const n = ref.notes[g.notes[0]];
    const hands = s.kind === 'hands';
    issues.push({
      criterion: 'rhythm',
      type: hands ? 'hands-async' : 'chord-async',
      severity: s.q < 0.5 ? 'major' : 'minor',
      measure: n.measure,
      beat: n.beatInMeasure,
      refNoteIds: g.notes.filter((r) => ctx.perfOf[r] !== null).map((r) => ref.notes[r].id),
      perfNoteIds: g.notes.map((r) => ctx.perfOf[r]).filter((p): p is number => p !== null),
      ...(hands ? { hand: s.lateHand } : {}),
      deviationMs: Math.round(s.value),
      criterionDeduction: ((1 - s.q) / sync.length) * sShare,
      confidence: 'high',
      message: hands
        ? `${notePosition(ref, n)}: ${s.lateHand === 'left' ? 'tay trái' : 'tay phải'} vào chậm hơn ${s.lateHand === 'left' ? 'tay phải' : 'tay trái'} ${Math.round(Math.abs(s.value))} ms.`
        : `${notePosition(ref, n)}: các nốt của hợp âm không vào cùng lúc (lệch ${Math.round(s.value)} ms).`,
    });
  }

  // ── từng tay ──
  const hands: ScoringResult['hands'] = {};
  for (const hand of ['right', 'left'] as const) {
    const idx = ref.notes.map((n, i) => (n.hand === hand ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const correct = idx.filter((i) => ctx.status[i] === 'correct').length;
    const missing = idx.filter((i) => ctx.status[i] === 'missing').length;
    const devs: number[] = [];
    const qs: number[] = [];
    const indep: number[] = [];
    for (const i of idx) {
      const t = timing.get(i);
      if (!t) continue;
      const tol = tolOf(mpb);
      const q = timingQuality(t.deviationMs, tol, 3 * tol);
      devs.push(Math.abs(t.deviationMs));
      qs.push(q);
      if (ref.groups[ref.notes[i].group].hands.length === 1) indep.push(q);
    }
    const summary: HandSummary = {
      notes: idx.length,
      correct,
      wrong: idx.length - correct - missing,
      missing,
      accuracy: correct / idx.length,
      meanAbsDeviationMs: devs.length ? Math.round(mean(devs)) : null,
      timing: qs.length ? mean(qs) : null,
      independentTiming: ref.twoHands && indep.length ? mean(indep) : null,
    };
    hands[hand] = summary;
  }
  if (ref.twoHands) {
    hands.syncRate = twoHandGroups ? synced / twoHandGroups : null;
    hands.meanOffsetMs = offsets.length ? Math.round(mean(offsets)) : null;
  }

  return {
    value,
    subScores,
    issues,
    tempo: { targetBpm: target, actualBpm: actualBpm === null ? null : Math.round(actualBpm * 10) / 10, perMeasure: perMeasure.map((m) => ({ measure: m.measure, bpm: Math.round(m.bpm) })), drift: drift === null ? null : Math.round(drift * 1000) / 1000 },
    hands,
    timing,
  };
}
