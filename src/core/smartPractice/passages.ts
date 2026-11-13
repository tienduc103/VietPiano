/**
 * Phát hiện đoạn khó QUA NHIỀU PHIÊN từ kết quả chấm của Coach (đối sánh MIDI ↔ bản nhạc đã làm ở Scoring Engine).
 * Không kết luận từ một lỗi đơn lẻ: một nhóm nốt chỉ "khó" khi có lỗi ở ≥ `minErrorSessions` phiên khác nhau
 * và tỉ lệ ≥ `minRate` số phiên có chấm nhóm đó (đặc tả §13, quyết định F4).
 */
import { MIN_ALIGNMENT } from '../coach/scoring/ScoringEngine';
import type { ScoreReference, ScoringResult } from '../coach/types';
import type { Hand } from '../lessons/types';
import type { DifficultPassage, PassageErrorType, PracticeStrategy } from './types';

export interface DetectOptions {
  profileKey?: string;
  /** Số kết quả gần nhất xét (mặc định 10). */
  maxSessions?: number;
  /** Số phiên tối thiểu có lỗi ở cùng chỗ (mặc định 2). */
  minErrorSessions?: number;
  /** Tỉ lệ phiên có lỗi tối thiểu (mặc định 0.4). */
  minRate?: number;
  /** Đoạn dài tối đa (số nhóm nốt) trước khi tách (mặc định 4). */
  maxGroups?: number;
}

const ERROR_PRIORITY: PassageErrorType[] = ['wrong-note', 'missing-note', 'hands-async', 'slow-transition', 'hesitation', 'extra-note', 'rushed-transition'];

const STRATEGY: Record<PassageErrorType, PracticeStrategy> = {
  'wrong-note': 'note-reading',
  'missing-note': 'note-reading',
  'extra-note': 'isolate',
  'slow-transition': 'slow',
  'rushed-transition': 'rhythm',
  hesitation: 'slow',
  'hands-async': 'hands-separate',
};

/** Lỗi của MỘT phiên theo nhóm nốt. */
export interface SessionGroupErrors {
  sessionId: string;
  bpm: number;
  graded: Set<number>;
  errors: Map<number, Set<PassageErrorType>>;
  hands: Map<number, Set<Hand>>;
  /** Độ trễ thêm ở chỗ chuyển vào nhóm (ms) khi chuyển chậm. */
  delays: Map<number, number>;
}

function msPerBeat(r: ScoringResult): number {
  const bpm = r.tempo.actualBpm ?? r.tempo.targetBpm;
  return 60_000 / Math.max(20, bpm || 60);
}

/** Kết quả đối chiếu được (không phải "có thể chơi bài khác"). */
export function usableResult(r: ScoringResult, referenceId: string): boolean {
  return r.referenceId === referenceId && r.confidence.alignment >= MIN_ALIGNMENT && r.counts.refNotes > 0;
}

/** Lỗi theo nhóm nốt của một kết quả chấm. Thuần, tất định. */
export function sessionGroupErrors(reference: ScoreReference, r: ScoringResult): SessionGroupErrors {
  const byId = new Map(reference.notes.map((n, i) => [n.id, i]));
  const out: SessionGroupErrors = { sessionId: r.sessionId, bpm: r.tempo.targetBpm, graded: new Set(), errors: new Map(), hands: new Map(), delays: new Map() };
  const add = (g: number, t: PassageErrorType, hands: Iterable<Hand>) => {
    if (!out.errors.has(g)) out.errors.set(g, new Set());
    out.errors.get(g)!.add(t);
    if (!out.hands.has(g)) out.hands.set(g, new Set());
    for (const h of hands) out.hands.get(g)!.add(h);
  };
  const devs = new Map<number, number[]>();
  const expected = new Map<number, number[]>();
  for (const a of r.alignment) {
    if (!a.refId) continue;
    const i = byId.get(a.refId);
    if (i === undefined) continue;
    const n = reference.notes[i];
    out.graded.add(n.group);
    if (a.expectedMs !== undefined) (expected.get(n.group) ?? expected.set(n.group, []).get(n.group)!).push(a.expectedMs);
    if (a.status === 'correct' && a.deviationMs !== undefined) (devs.get(n.group) ?? devs.set(n.group, []).get(n.group)!).push(a.deviationMs);
    if (a.status === 'wrong' || a.status === 'octave' || a.status === 'order') add(n.group, 'wrong-note', [n.hand]);
    else if (a.status === 'missing') add(n.group, 'missing-note', [n.hand]);
  }
  // Nốt thừa → nhóm có thời điểm kỳ vọng gần nhất (trong một phách).
  const beat = msPerBeat(r);
  const groupTimes = [...expected.entries()].map(([g, xs]) => [g, xs.reduce((s, x) => s + x, 0) / xs.length] as const);
  for (const a of r.alignment) {
    if (a.refId || a.status !== 'extra' || a.actualMs === undefined || !groupTimes.length) continue;
    let best = groupTimes[0];
    for (const gt of groupTimes) if (Math.abs(gt[1] - a.actualMs) < Math.abs(best[1] - a.actualMs)) best = gt;
    if (Math.abs(best[1] - a.actualMs) <= beat) add(best[0], 'extra-note', a.hand === 'left' || a.hand === 'right' ? [a.hand] : []);
  }
  // Ngắt quãng / hai tay lệch từ issue của Scoring Engine (đã có ngưỡng của engine).
  for (const issue of r.issues) {
    const t: PassageErrorType | null = issue.type === 'hesitation' ? 'hesitation' : issue.type === 'hands-async' || issue.type === 'chord-async' ? 'hands-async' : null;
    if (!t) continue;
    const gs = new Set(issue.refNoteIds.map((id) => byId.get(id)).filter((i): i is number => i !== undefined).map((i) => reference.notes[i].group));
    for (const g of gs) add(g, t, reference.groups[g]?.hands ?? []);
  }
  // Chuyển nốt chậm / vội: độ lệch của nhóm so với nhóm ngay trước (cả hai đánh đúng).
  const tol = Math.max(90, 0.25 * beat);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  for (const g of [...devs.keys()].sort((a, b) => a - b)) {
    const prev = devs.get(g - 1);
    if (!prev) continue;
    const dg = mean(devs.get(g)!);
    const delta = dg - mean(prev);
    if (delta > tol && dg > tol / 2) {
      add(g, 'slow-transition', reference.groups[g]?.hands ?? []);
      out.delays.set(g, delta);
    } else if (delta < -tol && dg < -tol / 2) add(g, 'rushed-transition', reference.groups[g]?.hands ?? []);
  }
  return out;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Tên nốt đại diện của một nhóm: nốt giai điệu cao nhất, không có thì nốt thấp nhất. */
export function groupName(reference: ScoreReference, g: number): string {
  const notes = reference.groups[g].notes.map((i) => reference.notes[i]);
  const melody = notes.filter((n) => n.part === 'melody').sort((a, b) => b.midi - a.midi);
  return (melody[0] ?? [...notes].sort((a, b) => a.midi - b.midi)[0]).pitch;
}

export function detectDifficultPassages(reference: ScoreReference, results: readonly ScoringResult[], opts: DetectOptions = {}): DifficultPassage[] {
  const maxSessions = opts.maxSessions ?? 10;
  const minErr = opts.minErrorSessions ?? 2;
  const minRate = opts.minRate ?? 0.4;
  const maxGroups = opts.maxGroups ?? 4;
  const usable = results
    .filter((r) => usableResult(r, reference.id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxSessions);
  if (usable.length < minErr) return [];
  const sessions = usable.map((r) => sessionGroupErrors(reference, r));

  const flagged: number[] = [];
  for (const g of reference.groups.map((x) => x.index)) {
    const graded = sessions.filter((s) => s.graded.has(g));
    const err = graded.filter((s) => s.errors.has(g));
    if (err.length >= minErr && err.length / graded.length >= minRate) flagged.push(g);
  }
  // Gộp nhóm liền kề thành đoạn, tách đoạn quá dài.
  const runs: [number, number][] = [];
  for (const g of flagged) {
    const last = runs[runs.length - 1];
    if (last && g === last[1] + 1 && g - last[0] < maxGroups) last[1] = g;
    else runs.push([g, g]);
  }

  const passages = runs.map(([s, e]): DifficultPassage => {
    const inRun = (g: number) => g >= s && g <= e;
    const graded = sessions.filter((x) => [...x.graded].some(inRun));
    const erred = graded.filter((x) => [...x.errors.keys()].some(inRun));
    const typeSessions = new Map<PassageErrorType, number>();
    const hands = new Set<Hand>();
    const delays: number[] = [];
    for (const x of erred) {
      const types = new Set<PassageErrorType>();
      for (const [g, ts] of x.errors) if (inRun(g)) ts.forEach((t) => types.add(t));
      types.forEach((t) => typeSessions.set(t, (typeSessions.get(t) ?? 0) + 1));
      for (const [g, hs] of x.hands) if (inRun(g)) hs.forEach((h) => hands.add(h));
      for (const [g, d] of x.delays) if (inRun(g)) delays.push(d);
    }
    const errorTypes = [...typeSessions.entries()]
      .map(([type, n]) => ({ type, sessions: n }))
      .sort((a, b) => b.sessions - a.sessions || ERROR_PRIORITY.indexOf(a.type) - ERROR_PRIORITY.indexOf(b.type));
    const primaryError = errorTypes[0].type;
    const freq = erred.length / graded.length;
    // Lỗi nhiều hơn rõ rệt ở tempo cao.
    const bpms = [...new Set(graded.map((x) => x.bpm))];
    let tempoSensitive = false;
    if (bpms.length >= 2) {
      const mid = (Math.min(...bpms) + Math.max(...bpms)) / 2;
      const rate = (xs: SessionGroupErrors[]) => xs.filter((x) => erred.includes(x)).length / xs.length;
      const low = graded.filter((x) => x.bpm < mid);
      const high = graded.filter((x) => x.bpm >= mid);
      tempoSensitive = low.length > 0 && high.length > 0 && rate(high) - rate(low) >= 0.25;
    }
    const from = Math.max(0, s - 1);
    const staffIdx = reference.notes.filter((n) => n.group >= from && n.group <= e && n.staff === 'melody').map((n) => n.scoreIndex);
    const names: string[] = [];
    for (let g = from; g <= e; g++) names.push(groupName(reference, g));
    return {
      id: `${reference.id}:${s}-${e}`,
      profileKey: opts.profileKey ?? usable[0].profileKey,
      sourceId: usable[0].lessonId,
      referenceId: reference.id,
      startGroup: s,
      endGroup: e,
      startNoteIndex: staffIdx.length ? Math.min(...staffIdx) : 0,
      endNoteIndex: staffIdx.length ? Math.max(...staffIdx) : 0,
      measure: reference.groups[from].measure,
      toMeasure: reference.groups[e].measure,
      handMode: hands.size === 1 ? [...hands][0] : 'both',
      errorTypes,
      primaryError,
      errorFrequency: Math.round(freq * 100) / 100,
      timingDeviationMs: delays.length ? Math.round(median(delays)!) : null,
      confidence: erred.length >= 3 && freq >= 0.5 ? 'high' : 'medium',
      evidenceSessionIds: erred.map((x) => x.sessionId),
      analyzedSessions: graded.length,
      tempoSensitive,
      strategy: STRATEGY[primaryError],
      noteNames: names,
    };
  });
  return passages.sort(
    (a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1) || b.errorFrequency * b.evidenceSessionIds.length - a.errorFrequency * a.evidenceSessionIds.length || a.startGroup - b.startGroup,
  );
}

/** Tỉ lệ phiên có lỗi trong nhóm [from, to] (đánh giá hiệu quả bổ trợ). null = không phiên nào chấm đoạn này. */
export function passageErrorRate(reference: ScoreReference, results: readonly ScoringResult[], from: number, to: number): { rate: number; sessions: number } | null {
  const rows = results.filter((r) => usableResult(r, reference.id)).map((r) => sessionGroupErrors(reference, r));
  const inRun = (g: number) => g >= from && g <= to;
  const graded = rows.filter((x) => [...x.graded].some(inRun));
  if (!graded.length) return null;
  return { rate: graded.filter((x) => [...x.errors.keys()].some(inRun)).length / graded.length, sessions: graded.length };
}
