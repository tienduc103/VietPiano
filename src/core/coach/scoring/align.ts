/**
 * Căn chỉnh biểu diễn với bản nhạc — KHÔNG so theo vị trí thứ tự từng nốt.
 *
 *  1. Nhóm bản nhạc theo phách (hợp âm / hai tay cùng phách = một nhóm); gom nốt đánh thành cụm theo onset.
 *  2. DTW giữa dãy nhóm và dãy cụm, chi phí = 1 − độ giống tập cao độ (đúng phím 1 · đúng tên khác quãng 0.5 · lệch ≤ 2 nửa cung 0.25),
 *     phạt bước ngang / dọc → chịu được chơi nhanh / chậm, bỏ nốt, thừa nốt, hợp âm rải, hai tay lệch, ngắt giữa bài.
 *  3. Mốc neo = nhóm khớp tốt trên đường DTW, giữ dãy tăng đơn điệu → bản đồ tempo (phách ↔ ms).
 *  4. Khớp từng nốt quanh thời điểm dự đoán: (a) đúng phím — quy hoạch động đơn điệu theo từng phím (nốt lặp cùng cao độ không
 *     bị bắt chéo), (b) đúng tên khác quãng tám, (c) nốt sai gần nhất (≤ 12 nửa cung, cửa sổ hẹp hơn). Dựng lại bản đồ từ các
 *     nốt đúng rồi khớp lần hai.
 * Thuần, tất định; mọi ngưỡng là hằng số có tên để kiểm chứng.
 */
import type { BuiltPerformance, ScoreReference } from '../types';
import { monotonicAnchors, median, TempoMap, theilSenSlope, type MapPoint } from './tempoMap';

export type PairKind = 'exact' | 'octave' | 'wrong';

export interface AlignedNotes {
  /** refIndex → (perfIndex, loại khớp). */
  pairs: Map<number, { perf: number; kind: PairKind }>;
  perfToRef: Map<number, number>;
  missing: number[];
  extras: number[];
  map: TempoMap;
  /** Cụm onset (chỉ số nốt biểu diễn). */
  clusters: number[][];
  /** Tỉ lệ nhóm bản nhạc có mốc neo (độ tin cậy căn chỉnh). */
  anchoredRatio: number;
  /** Độ dài phách theo tempo mục tiêu (ms). */
  targetMsPerBeat: number;
}

/** Phạt mỗi bước ngang / dọc của DTW (so với bước chéo). */
export const DTW_STEP_PENALTY = 0.3;
/** Độ giống tối thiểu của nhóm để làm mốc neo. */
export const ANCHOR_MIN_SIMILARITY = 0.5;
/** Cửa sổ gom cụm onset: 30% khoảng cách nhỏ nhất giữa hai nhóm (theo tempo mục tiêu), trong [25, 70] ms. */
export const CLUSTER_RATIO = 0.3;
export const CLUSTER_MIN_MS = 25;
export const CLUSTER_MAX_MS = 70;
/**
 * Nửa cửa sổ khớp nốt đúng phím: 75% khoảng tới nhóm kề (theo bản đồ), trong [120, 2000] ms — rộng để chịu được chỗ ngắt / nốt dài;
 * quy hoạch động đơn điệu theo từng phím chống bắt chéo nốt lặp.
 */
export const MATCH_WINDOW_RATIO = 0.75;
export const MATCH_WINDOW_MIN_MS = 120;
export const MATCH_WINDOW_MAX_MS = 2000;
/** Nốt sai quãng tám / sai nốt chỉ ghép trong phần này của cửa sổ, và không quá trần tuyệt đối. */
export const OCTAVE_WINDOW_FRACTION = 0.6;
export const OCTAVE_WINDOW_MAX_MS = 700;
export const WRONG_WINDOW_FRACTION = 0.5;
export const WRONG_WINDOW_MAX_MS = 500;
export const WRONG_MAX_SEMITONES = 12;

/** Độ giống hai tập cao độ 0..1 (F-measure có trọng số). */
export function pitchSimilarity(ref: readonly number[], perf: readonly number[]): number {
  if (!ref.length || !perf.length) return 0;
  const usedR = new Array(ref.length).fill(false);
  const usedP = new Array(perf.length).fill(false);
  let score = 0;
  const pass = (ok: (r: number, p: number) => boolean, credit: number) => {
    ref.forEach((r, i) => {
      if (usedR[i]) return;
      const j = perf.findIndex((p, k) => !usedP[k] && ok(r, p));
      if (j < 0) return;
      usedR[i] = true;
      usedP[j] = true;
      score += credit;
    });
  };
  pass((r, p) => r === p, 1);
  pass((r, p) => (r - p) % 12 === 0, 0.5);
  pass((r, p) => Math.abs(r - p) <= 2, 0.25);
  return (2 * score) / (ref.length + perf.length);
}

/** Gom nốt biểu diễn (đã xếp theo onset) thành cụm: nốt cách đầu cụm ≤ `windowMs` thuộc cùng cụm. */
export function clusterOnsets(onsets: readonly number[], windowMs: number): number[][] {
  const out: number[][] = [];
  let start = -Infinity;
  onsets.forEach((t, i) => {
    if (out.length && t - start <= windowMs) out[out.length - 1].push(i);
    else {
      out.push([i]);
      start = t;
    }
  });
  return out;
}

/** DTW nhóm ↔ cụm; trả về đường đi (cặp chỉ số) từ đầu tới cuối. */
export function dtwPath(cost: (i: number, j: number) => number, n: number, m: number, penalty = DTW_STEP_PENALTY): [number, number][] {
  if (n === 0 || m === 0) return [];
  const D = new Float64Array(n * m);
  const from = new Uint8Array(n * m); // 0 chéo, 1 dọc (i−1), 2 ngang (j−1)
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const c = cost(i, j);
      const k = i * m + j;
      if (i === 0 && j === 0) {
        D[k] = c;
        continue;
      }
      let best = Infinity;
      let dir = 0;
      if (i > 0 && j > 0 && D[k - m - 1] < best) {
        best = D[k - m - 1];
        dir = 0;
      }
      if (i > 0 && D[k - m] + penalty < best) {
        best = D[k - m] + penalty;
        dir = 1;
      }
      if (j > 0 && D[k - 1] + penalty < best) {
        best = D[k - 1] + penalty;
        dir = 2;
      }
      D[k] = c + best;
      from[k] = dir;
    }
  const path: [number, number][] = [];
  let i = n - 1;
  let j = m - 1;
  for (;;) {
    path.push([i, j]);
    if (i === 0 && j === 0) break;
    const dir = from[i * m + j];
    if (i === 0) j--;
    else if (j === 0) i--;
    else if (dir === 0) {
      i--;
      j--;
    } else if (dir === 1) i--;
    else j--;
  }
  return path.reverse();
}

interface Anchor {
  beat: number;
  ms: number;
  group: number;
}

function buildMap(anchors: Anchor[], targetMsPerBeat: number, fallbackOrigin: MapPoint): { map: TempoMap; used: Anchor[] } {
  const used = monotonicAnchors(anchors);
  // Một mốc: tempo mục tiêu đi qua mốc đó.
  const points: MapPoint[] = used.map((a) => [a.beat, a.ms]);
  return { map: new TempoMap(points, targetMsPerBeat, points[0] ?? fallbackOrigin), used };
}

/** Cửa sổ khớp (nửa bề rộng, ms) cho mỗi nhóm theo bản đồ hiện tại. */
function groupWindows(ref: ScoreReference, map: TempoMap): number[] {
  const t = ref.groups.map((g) => map.msAt(g.onsetBeat));
  return ref.groups.map((_, i) => {
    const gaps = [i > 0 ? t[i] - t[i - 1] : Infinity, i + 1 < t.length ? t[i + 1] - t[i] : Infinity].filter((x) => Number.isFinite(x) && x > 0);
    const gap = gaps.length ? Math.min(...gaps) : map.msPerBeatAt(ref.groups[i].onsetBeat);
    return Math.min(MATCH_WINDOW_MAX_MS, Math.max(MATCH_WINDOW_MIN_MS, MATCH_WINDOW_RATIO * gap));
  });
}

/** Khớp từng nốt theo bản đồ (một lượt). */
function matchNotes(ref: ScoreReference, perf: BuiltPerformance, map: TempoMap): Pick<AlignedNotes, 'pairs' | 'perfToRef' | 'missing' | 'extras'> {
  const windows = groupWindows(ref, map);
  const predicted = ref.notes.map((n) => map.msAt(n.onsetBeat));
  // Thời điểm có thể (nội suy + ngoại suy hai phía khi giữa hai mốc có chỗ ngắt / đổi tempo).
  const cands = ref.groups.map((g) => map.candidates(g.onsetBeat));
  const W = ref.notes.map((n) => windows[n.group]);
  /** Khoảng cách tới thời điểm dự đoán gần nhất; ngoài [min − w, max + w] → Infinity. */
  const dist = (r: number, t: number, w: number) => {
    const c = cands[ref.notes[r].group];
    if (t < Math.min(...c) - w || t > Math.max(...c) + w) return Infinity;
    return Math.min(...c.map((x) => Math.abs(t - x)));
  };
  const pairs = new Map<number, { perf: number; kind: PairKind }>();
  const perfToRef = new Map<number, number>();
  const assign = (r: number, p: number, kind: PairKind) => {
    pairs.set(r, { perf: p, kind });
    perfToRef.set(p, r);
  };

  // (a) Đúng phím: quy hoạch động đơn điệu theo từng cao độ.
  const pitches = new Set(ref.notes.map((n) => n.midi));
  for (const midi of pitches) {
    const rs = ref.notes.map((n, i) => (n.midi === midi ? i : -1)).filter((i) => i >= 0).sort((a, b) => predicted[a] - predicted[b]);
    const ps = perf.notes.map((n, i) => (n.midi === midi ? i : -1)).filter((i) => i >= 0);
    if (!ps.length) continue;
    const k = rs.length;
    const l = ps.length;
    const D = new Float64Array((k + 1) * (l + 1));
    const B = new Uint8Array((k + 1) * (l + 1));
    const at = (i: number, j: number) => i * (l + 1) + j;
    for (let i = 0; i <= k; i++)
      for (let j = 0; j <= l; j++) {
        if (i === 0 && j === 0) continue;
        let best = Infinity;
        let dir = 0;
        if (i > 0 && D[at(i - 1, j)] + 1 < best) {
          best = D[at(i - 1, j)] + 1;
          dir = 1;
        }
        if (j > 0 && D[at(i, j - 1)] + 1 < best) {
          best = D[at(i, j - 1)] + 1;
          dir = 2;
        }
        if (i > 0 && j > 0) {
          const r = rs[i - 1];
          const d = dist(r, perf.notes[ps[j - 1]].onMs, W[r]);
          if (Number.isFinite(d)) {
            const c = D[at(i - 1, j - 1)] + Math.min(1, d / W[r]);
            if (c < best) {
              best = c;
              dir = 3;
            }
          }
        }
        D[at(i, j)] = best;
        B[at(i, j)] = dir;
      }
    let i = k;
    let j = l;
    while (i > 0 || j > 0) {
      const dir = B[at(i, j)];
      if (dir === 3) {
        assign(rs[i - 1], ps[j - 1], 'exact');
        i--;
        j--;
      } else if (dir === 1) i--;
      else j--;
    }
  }

  // (b) Đúng tên nốt khác quãng tám, (c) nốt sai — tham lam theo độ lệch nhỏ nhất.
  const greedy = (kind: PairKind, ok: (r: number, p: number) => boolean, fraction: number, maxMs: number, extra: (r: number, p: number) => number) => {
    const list: { r: number; p: number; c: number }[] = [];
    ref.notes.forEach((_, r) => {
      if (pairs.has(r)) return;
      const w = Math.min(W[r] * fraction, maxMs);
      perf.notes.forEach((pn, p) => {
        if (perfToRef.has(p) || !ok(r, p)) return;
        const d = dist(r, pn.onMs, w);
        if (d <= w) list.push({ r, p, c: d / w + extra(r, p) });
      });
    });
    list.sort((a, b) => a.c - b.c);
    for (const { r, p } of list) if (!pairs.has(r) && !perfToRef.has(p)) assign(r, p, kind);
  };
  greedy('octave', (r, p) => ref.notes[r].midi !== perf.notes[p].midi && (ref.notes[r].midi - perf.notes[p].midi) % 12 === 0, OCTAVE_WINDOW_FRACTION, OCTAVE_WINDOW_MAX_MS, () => 0);
  greedy(
    'wrong',
    (r, p) => {
      const d = Math.abs(ref.notes[r].midi - perf.notes[p].midi);
      return d > 0 && d <= WRONG_MAX_SEMITONES && d % 12 !== 0;
    },
    WRONG_WINDOW_FRACTION,
    WRONG_WINDOW_MAX_MS,
    (r, p) => 0.02 * Math.abs(ref.notes[r].midi - perf.notes[p].midi),
  );

  const missing = ref.notes.map((_, i) => i).filter((i) => !pairs.has(i));
  const extras = perf.notes.map((_, i) => i).filter((i) => !perfToRef.has(i));
  return { pairs, perfToRef, missing, extras };
}

/** Mốc neo từ các nốt khớp đúng phím: mỗi nhóm = trung bình onset các nốt đúng. */
function anchorsFromPairs(ref: ScoreReference, perf: BuiltPerformance, pairs: AlignedNotes['pairs']): Anchor[] {
  const out: Anchor[] = [];
  for (const g of ref.groups) {
    const ts = g.notes.map((r) => pairs.get(r)).filter((x): x is { perf: number; kind: PairKind } => !!x && x.kind === 'exact').map((x) => perf.notes[x.perf].onMs);
    if (ts.length) out.push({ beat: g.onsetBeat, ms: ts.reduce((a, b) => a + b, 0) / ts.length, group: g.index });
  }
  return out;
}

export function alignPerformance(ref: ScoreReference, perf: BuiltPerformance): AlignedNotes {
  const targetMsPerBeat = 60000 / ref.targetBpm;
  const onsets = perf.notes.map((n) => n.onMs);
  const iois = ref.groups.slice(1).map((g, i) => (g.onsetBeat - ref.groups[i].onsetBeat) * targetMsPerBeat);
  const minIoi = iois.length ? Math.min(...iois) : targetMsPerBeat;
  const windowMs = Math.min(CLUSTER_MAX_MS, Math.max(CLUSTER_MIN_MS, CLUSTER_RATIO * minIoi));
  const clusters = clusterOnsets(onsets, windowMs);
  const origin: MapPoint = [ref.groups[0]?.onsetBeat ?? 0, perf.notes[0]?.onMs ?? 0];

  if (!perf.notes.length || !ref.notes.length) {
    const map = new TempoMap([], targetMsPerBeat, origin);
    return { pairs: new Map(), perfToRef: new Map(), missing: ref.notes.map((_, i) => i), extras: perf.notes.map((_, i) => i), map, clusters, anchoredRatio: 0, targetMsPerBeat };
  }

  // DTW thô.
  const groupPitches = ref.groups.map((g) => g.notes.map((i) => ref.notes[i].midi));
  const clusterPitches = clusters.map((c) => c.map((i) => perf.notes[i].midi));
  const sims = new Map<number, number>();
  const sim = (i: number, j: number) => {
    const key = i * clusters.length + j;
    let v = sims.get(key);
    if (v === undefined) {
      v = pitchSimilarity(groupPitches[i], clusterPitches[j]);
      sims.set(key, v);
    }
    return v;
  };
  const path = dtwPath((i, j) => 1 - sim(i, j), ref.groups.length, clusters.length);
  // Mỗi nhóm: ô tốt nhất trên đường đi; mỗi cụm chỉ làm mốc cho một nhóm.
  const best = new Map<number, { j: number; s: number }>();
  for (const [i, j] of path) {
    const s = sim(i, j);
    const hasExact = groupPitches[i].some((p) => clusterPitches[j].includes(p));
    if (s < ANCHOR_MIN_SIMILARITY || !hasExact) continue;
    const cur = best.get(i);
    if (!cur || s > cur.s) best.set(i, { j, s });
  }
  const byCluster = new Map<number, { i: number; s: number }>();
  for (const [i, { j, s }] of best) {
    const cur = byCluster.get(j);
    if (!cur || s > cur.s) byCluster.set(j, { i, s });
  }
  const coarse: Anchor[] = [...byCluster.entries()].map(([j, { i }]) => {
    const ts = clusters[j].filter((p) => groupPitches[i].includes(perf.notes[p].midi)).map((p) => perf.notes[p].onMs);
    return { beat: ref.groups[i].onsetBeat, ms: median(ts), group: i };
  });
  // Nhóm nằm trong chuỗi lặp giống hệt (C C C C) không làm mốc thô: chỉ nhìn cao độ thì không biết nốt nào bị bỏ —
  // thời điểm sẽ quyết định ở bước khớp từng nốt. Tempo dự phòng = Theil–Sen trên mọi mốc (bền với mốc nhầm).
  const key = (i: number) => [...groupPitches[i]].sort((a, b) => a - b).join(',');
  const ambiguous = (i: number) => (i > 0 && key(i - 1) === key(i)) || (i + 1 < groupPitches.length && key(i + 1) === key(i));
  const sure = coarse.filter((a) => !ambiguous(a.group));
  const mono = monotonicAnchors(coarse);
  const slope = mono.length >= 3 ? theilSenSlope(mono.map((a) => a.beat), mono.map((a) => a.ms)) : null;
  const fallback = slope !== null && slope > 0 ? slope : targetMsPerBeat;

  let { map } = buildMap(sure.length ? sure : coarse, fallback, origin);
  let matched = matchNotes(ref, perf, map);
  // Lượt hai: bản đồ từ các nốt đúng phím (chính xác hơn mốc thô).
  const refined = buildMap(anchorsFromPairs(ref, perf, matched.pairs), fallback, origin);
  if (refined.used.length >= 1) {
    map = refined.map;
    matched = matchNotes(ref, perf, map);
  }
  const finalAnchors = monotonicAnchors(anchorsFromPairs(ref, perf, matched.pairs));
  if (finalAnchors.length) map = new TempoMap(finalAnchors.map((a) => [a.beat, a.ms]), fallback, [finalAnchors[0].beat, finalAnchors[0].ms]);

  return { ...matched, map, clusters, anchoredRatio: ref.groups.length ? finalAnchors.length / ref.groups.length : 0, targetMsPerBeat };
}
