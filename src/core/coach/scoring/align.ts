/**
 * Căn chỉnh biểu diễn với bản nhạc — KHÔNG so theo vị trí thứ tự từng nốt.
 *
 *  1. Nhóm bản nhạc theo phách (hợp âm / hai tay cùng phách = một nhóm); gom nốt đánh thành cụm theo onset.
 *  2. DTW giữa dãy nhóm và dãy cụm, chi phí = 1 − độ giống tập cao độ (đúng phím 1 · đúng tên khác quãng 0.5 · lệch ≤ 2 nửa cung 0.25),
 *     phạt bước ngang / dọc → chịu được chơi nhanh / chậm, bỏ nốt, thừa nốt, hợp âm rải, hai tay lệch, ngắt giữa bài.
 *     Thêm BƯỚC NHẢY LÙI (phạt `RESTART_JUMP_PENALTY`): người chơi dừng lại rồi chơi lại từ một chỗ phía trước (đầu câu, đầu ô,
 *     đầu bài). Đường đi bị cắt tại các bước nhảy thành các LƯỢT, mỗi lượt đơn điệu. Bước nhảy chỉ có lợi khi đoạn chơi lại
 *     khớp ≥ 2 nhóm liền → bản chơi một mạch (kể cả có nốt sai / thừa) không bao giờ bị cắt.
 *  3. Mỗi lượt: mốc neo = nhóm khớp tốt trên đường DTW, giữ dãy tăng đơn điệu → bản đồ tempo (phách ↔ ms) riêng của lượt.
 *  4. Khớp từng nốt của lượt quanh thời điểm dự đoán: (a) đúng phím — quy hoạch động đơn điệu theo từng phím (nốt lặp cùng cao độ
 *     không bị bắt chéo), (b) đúng tên khác quãng tám, (c) nốt sai gần nhất (≤ 12 nửa cung, cửa sổ hẹp hơn). Dựng lại bản đồ từ
 *     các nốt đúng rồi khớp lần hai. Nốt của lượt này không bao giờ bị ghép vào nhóm của lượt khác.
 *  5. Ghép các lượt theo CHỖ ĐÃ CHƠI TỚI: mỗi nhóm bản nhạc chấm theo LƯỢT ĐẦU TIÊN chơi tới nó (như Chờ nốt: đã sai thì vẫn tính
 *     sai dù sửa lại sau); phần lượt sau chơi lại đoạn đã qua → `replayed` (không chấm, không tính nốt thừa), từ nhóm mới đầu tiên
 *     trở đi lượt sau được chấm tiếp. Lượt quá ngắn (< `MIN_PASS_EXACT` nốt đúng) hoặc không lùi thật → gộp lại như một lượt.
 * Thuần, tất định; mọi ngưỡng là hằng số có tên để kiểm chứng. Không có bước nhảy → kết quả y như thuật toán một lượt.
 */
import type { BuiltPerformance, ScoreReference } from '../types';
import { monotonicAnchors, median, TempoMap, theilSenSlope, type MapPoint } from './tempoMap';

export type PairKind = 'exact' | 'octave' | 'wrong';
type Pairs = Map<number, { perf: number; kind: PairKind }>;

/** Một lượt chơi liền mạch (giữa hai lần chơi lại). */
export interface AlignPass {
  index: number;
  /** Lượt chứa các thời điểm [fromMs, toMs) — lượt đầu từ −∞, lượt cuối tới +∞ (thời gian hoạt động). */
  fromMs: number;
  toMs: number;
  /** Nhóm đầu (ưu tiên nốt đúng phím) / cuối khớp được; −1 = không khớp nhóm nào. */
  firstGroup: number;
  lastGroup: number;
  lastExactGroup: number;
  /** Các nhóm bản nhạc lượt này chấm [từ, tới]; null = cả lượt chỉ chơi lại đoạn đã chấm. */
  graded: [number, number] | null;
  /** Từ thời điểm này lượt chơi đoạn mới (trước đó = chơi lại, không chấm); lượt đầu −∞, không có đoạn mới +∞. */
  newFromMs: number;
  /** Bản đồ tempo của riêng lượt (gồm cả đoạn chơi lại). */
  map: TempoMap;
}

/** Một lần dừng lại rồi chơi lại. */
export interface RestartInfo {
  /** Lượt bị bỏ dở; lượt `pass + 1` là lượt chơi lại. */
  pass: number;
  /** Nhóm chỗ dừng: nốt khớp sai cuối lượt, hoặc nhóm kế tiếp chưa chơi tới. */
  stopGroup: number;
  /** Nhóm bắt đầu chơi lại. */
  restartGroup: number;
  /** Nốt đầu lượt chơi lại (ms). */
  atMs: number;
  /** Nốt cuối lượt bị bỏ dở, sau nốt đúng phím cuối cùng (chỗ vấp: nốt sai / nốt thừa). */
  slip: number[];
  /** Đã chơi tới hết bài trước lần chơi lại này (chơi thêm sau khi xong — không phải chỗ ngắt). */
  afterEnd: boolean;
}

export interface AlignedNotes {
  /** refIndex → (perfIndex, loại khớp) — chỉ các nốt được chấm. */
  pairs: Pairs;
  perfToRef: Map<number, number>;
  missing: number[];
  extras: number[];
  /** Nốt đánh khi chơi lại đoạn đã chấm — không chấm, không tính nốt thừa. */
  replayed: number[];
  /** Bản đồ tempo chung của các nốt được chấm (đơn điệu cả theo phách lẫn ms). */
  map: TempoMap;
  /** ≥ 1 lượt; một lượt = chơi một mạch (không chơi lại). */
  passes: AlignPass[];
  restarts: RestartInfo[];
  /** Lượt chấm từng nốt bản nhạc (−1 = chưa lượt nào chơi tới). */
  refPass: number[];
  /** Cụm onset (chỉ số nốt biểu diễn). */
  clusters: number[][];
  /** Tỉ lệ nhóm bản nhạc có mốc neo (độ tin cậy căn chỉnh). */
  anchoredRatio: number;
  /** Độ dài phách theo tempo mục tiêu (ms). */
  targetMsPerBeat: number;
}

/** Phạt mỗi bước ngang / dọc của DTW (so với bước chéo). */
export const DTW_STEP_PENALTY = 0.3;
/**
 * Phạt một bước nhảy lùi (chơi lại). Không nhảy thì mỗi nốt chơi lại phải "nuốt" bằng bước ngang: 0.3 + (1 − độ giống với nhóm
 * đang đứng) — trùng phím 0.3, lệch ≤ 2 nửa cung 1.05, khác hẳn 1.3. Chơi lại ≥ 2 nhóm (≥ 0.3 + 1.05 = 1.35) mới có lợi;
 * lùi đúng một nốt để sửa (≈ 1.6 so với 0.75 + 1.2) vẫn chấm như trước (nốt sai / thừa). Một nốt thừa không bao giờ thành
 * "chơi lại": sau bước nhảy các cụm tiếp theo phải khớp tiếp các nhóm sau chỗ quay lại.
 */
export const RESTART_JUMP_PENALTY = 1.2;
/** Một lượt cần ít nhất bấy nhiêu nốt khớp đúng phím mới tính là lượt riêng (không thì gộp vào lượt trước). */
export const MIN_PASS_EXACT = 2;
/** Lượt bị bỏ dở được khớp thêm bấy nhiêu nhóm sau chỗ DTW dừng (nốt vấp có thể thuộc nhóm kế). */
const PASS_END_MARGIN = 1;
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

/**
 * DTW nhóm ↔ cụm; trả về đường đi (cặp chỉ số) từ đầu tới cuối. `jumpPenalty` hữu hạn → cho phép bước nhảy lùi: cụm j bắt đầu lại
 * ở nhóm i từ cụm j − 1 đang ở nhóm i' > i (trên đường đi: nhóm giảm giữa hai ô liền nhau), chỉ vào ô `canJumpTo(i, j)` (lượt chơi
 * lại bắt đầu bằng phím đúng của chỗ quay lại — nốt vấp nằm cuối lượt bị bỏ dở, không thành nốt đầu lượt mới). Mặc định không nhảy.
 * Có bước nhảy thì đường đi kết thúc ở nhóm rẻ nhất của cụm cuối (lượt cuối có thể dừng trước hết bài: chơi lại rồi thôi, chơi thêm
 * đoạn đầu sau khi xong) — không nhảy thì như cũ, luôn kết thúc ở nhóm cuối.
 */
export function dtwPath(
  cost: (i: number, j: number) => number,
  n: number,
  m: number,
  penalty = DTW_STEP_PENALTY,
  jumpPenalty = Infinity,
  canJumpTo: (i: number, j: number) => boolean = () => true,
): [number, number][] {
  if (n === 0 || m === 0) return [];
  const D = new Float64Array(n * m);
  const from = new Uint8Array(n * m); // 0 chéo, 1 dọc (i−1), 2 ngang (j−1), 3 nhảy lùi (từ nhóm src, cụm j−1)
  const jumps = Number.isFinite(jumpPenalty);
  const src = jumps ? new Int32Array(n * m) : null;
  // Cực tiểu hậu tố của cột trước: min_{i' ≥ i} D[i'][j − 1] (+ chỉ số) → bước nhảy O(1) mỗi ô.
  const sufMin = new Float64Array(n + 1);
  const sufArg = new Int32Array(n + 1);
  for (let j = 0; j < m; j++) {
    if (jumps && j > 0) {
      sufMin[n] = Infinity;
      sufArg[n] = -1;
      for (let i = n - 1; i >= 0; i--) {
        const v = D[i * m + j - 1];
        if (v < sufMin[i + 1]) {
          sufMin[i] = v;
          sufArg[i] = i;
        } else {
          sufMin[i] = sufMin[i + 1];
          sufArg[i] = sufArg[i + 1];
        }
      }
    }
    for (let i = 0; i < n; i++) {
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
      // Nhảy lùi: chỉ từ nhóm phía sau (i' > i); nhảy tại chỗ đã có bước ngang rẻ hơn.
      if (src && j > 0 && i + 1 < n && sufMin[i + 1] + jumpPenalty < best && canJumpTo(i, j)) {
        best = sufMin[i + 1] + jumpPenalty;
        dir = 3;
        src[k] = sufArg[i + 1];
      }
      D[k] = c + best;
      from[k] = dir;
    }
  }
  const path: [number, number][] = [];
  let i = n - 1;
  let j = m - 1;
  // Kết thúc mở (chỉ khi cho nhảy): bằng nhau thì ưu tiên nhóm sau.
  if (src) for (let r = n - 2; r >= 0; r--) if (D[r * m + j] < D[i * m + j]) i = r;
  for (;;) {
    path.push([i, j]);
    if (i === 0 && j === 0) break;
    const k = i * m + j;
    const dir = from[k];
    if (dir === 3 && src && j > 0) {
      i = src[k];
      j--;
    } else if (i === 0) j--;
    else if (j === 0) i--;
    else if (dir === 0) {
      i--;
      j--;
    } else if (dir === 1) i--;
    else j--;
  }
  return path.reverse();
}

/** Cắt đường đi DTW tại các bước nhảy lùi (nhóm giảm giữa hai ô liền nhau) → các đoạn đơn điệu. */
export function splitAtJumps(path: readonly [number, number][]): [number, number][][] {
  const out: [number, number][][] = [];
  path.forEach((cell, k) => {
    if (k === 0 || cell[0] < path[k - 1][0]) out.push([cell]);
    else out[out.length - 1].push(cell);
  });
  return out;
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

/** Giới hạn khớp: chỉ nốt bản nhạc / nốt biểu diễn được phép (null = tất cả). */
interface Allow {
  ref: ((r: number) => boolean) | null;
  perf: ((p: number) => boolean) | null;
}
const ALL: Allow = { ref: null, perf: null };

/** Khớp từng nốt theo bản đồ (một lượt). */
function matchNotes(ref: ScoreReference, perf: BuiltPerformance, map: TempoMap, allow: Allow = ALL): Pick<AlignedNotes, 'pairs' | 'perfToRef' | 'missing' | 'extras'> {
  const okR = (r: number) => !allow.ref || allow.ref(r);
  const okP = (p: number) => !allow.perf || allow.perf(p);
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
  const pairs: Pairs = new Map();
  const perfToRef = new Map<number, number>();
  const assign = (r: number, p: number, kind: PairKind) => {
    pairs.set(r, { perf: p, kind });
    perfToRef.set(p, r);
  };

  // (a) Đúng phím: quy hoạch động đơn điệu theo từng cao độ.
  const pitches = new Set(ref.notes.map((n) => n.midi));
  for (const midi of pitches) {
    const rs = ref.notes.map((n, i) => (n.midi === midi && okR(i) ? i : -1)).filter((i) => i >= 0).sort((a, b) => predicted[a] - predicted[b]);
    const ps = perf.notes.map((n, i) => (n.midi === midi && okP(i) ? i : -1)).filter((i) => i >= 0);
    if (!ps.length || !rs.length) continue;
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
      if (pairs.has(r) || !okR(r)) return;
      const w = Math.min(W[r] * fraction, maxMs);
      perf.notes.forEach((pn, p) => {
        if (perfToRef.has(p) || !okP(p) || !ok(r, p)) return;
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

  const missing = ref.notes.map((_, i) => i).filter((i) => okR(i) && !pairs.has(i));
  const extras = perf.notes.map((_, i) => i).filter((i) => okP(i) && !perfToRef.has(i));
  return { pairs, perfToRef, missing, extras };
}

/** Mốc neo từ các nốt khớp đúng phím: mỗi nhóm = trung bình onset các nốt đúng. */
function anchorsFromPairs(ref: ScoreReference, perf: BuiltPerformance, pairs: Pairs): Anchor[] {
  const out: Anchor[] = [];
  for (const g of ref.groups) {
    const ts = g.notes.map((r) => pairs.get(r)).filter((x): x is { perf: number; kind: PairKind } => !!x && x.kind === 'exact').map((x) => perf.notes[x.perf].onMs);
    if (ts.length) out.push({ beat: g.onsetBeat, ms: ts.reduce((a, b) => a + b, 0) / ts.length, group: g.index });
  }
  return out;
}

/** Dữ liệu dùng chung khi căn chỉnh từng lượt. */
interface Base {
  ref: ScoreReference;
  perf: BuiltPerformance;
  clusters: number[][];
  groupPitches: number[][];
  clusterPitches: number[][];
  sim: (i: number, j: number) => number;
  /** Cụm j có ít nhất một phím đúng của nhóm i. */
  exactIn: (i: number, j: number) => boolean;
  targetMsPerBeat: number;
}

/** Mốc thô từ các ô đường DTW: mỗi nhóm lấy ô giống nhất (có ít nhất một phím đúng), mỗi cụm chỉ làm mốc cho một nhóm. */
function coarseAnchors(b: Base, cells: readonly [number, number][]): Anchor[] {
  const best = new Map<number, { j: number; s: number }>();
  for (const [i, j] of cells) {
    const s = b.sim(i, j);
    const hasExact = b.exactIn(i, j);
    if (s < ANCHOR_MIN_SIMILARITY || !hasExact) continue;
    const cur = best.get(i);
    if (!cur || s > cur.s) best.set(i, { j, s });
  }
  const byCluster = new Map<number, { i: number; s: number }>();
  for (const [i, { j, s }] of best) {
    const cur = byCluster.get(j);
    if (!cur || s > cur.s) byCluster.set(j, { i, s });
  }
  return [...byCluster.entries()].map(([j, { i }]) => {
    const ts = b.clusters[j].filter((p) => b.groupPitches[i].includes(b.perf.notes[p].midi)).map((p) => b.perf.notes[p].onMs);
    return { beat: b.ref.groups[i].onsetBeat, ms: median(ts), group: i };
  });
}

/** Độ dốc (ms/phách) ước lượng từ mốc thô: Theil–Sen trên dãy mốc đơn điệu (≥ 3 mốc), không thì null. */
function anchorSlope(coarse: readonly Anchor[]): number | null {
  const mono = monotonicAnchors(coarse);
  const slope = mono.length >= 3 ? theilSenSlope(mono.map((a) => a.beat), mono.map((a) => a.ms)) : null;
  return slope !== null && slope > 0 ? slope : null;
}

interface PassAlignment extends Pick<AlignedNotes, 'pairs' | 'perfToRef' | 'missing' | 'extras'> {
  cells: [number, number][];
  /** Nốt biểu diễn thuộc lượt (đã xếp theo onset). */
  perfIdx: number[];
  map: TempoMap;
  anchors: Anchor[];
  fallback: number;
  exact: number;
  firstGroup: number;
  lastGroup: number;
  lastExactGroup: number;
}

/**
 * Căn chỉnh một lượt (hoặc cả bản chơi khi không có lượt nào bị cắt — đúng thuật toán một lượt cũ): mốc thô → bản đồ → khớp
 * từng nốt → bản đồ từ nốt đúng phím → khớp lần hai → bản đồ cuối.
 */
function alignPass(b: Base, cells: [number, number][], allow: Allow, origin: MapPoint, fallbackSlope: number | null): PassAlignment {
  const { ref, perf } = b;
  const coarse = coarseAnchors(b, cells);
  // Nhóm nằm trong chuỗi lặp giống hệt (C C C C) không làm mốc thô: chỉ nhìn cao độ thì không biết nốt nào bị bỏ —
  // thời điểm sẽ quyết định ở bước khớp từng nốt. Tempo dự phòng = Theil–Sen trên mọi mốc (bền với mốc nhầm).
  const key = (i: number) => [...b.groupPitches[i]].sort((x, y) => x - y).join(',');
  const ambiguous = (i: number) => (i > 0 && key(i - 1) === key(i)) || (i + 1 < b.groupPitches.length && key(i + 1) === key(i));
  const sure = coarse.filter((a) => !ambiguous(a.group));
  const fallback = anchorSlope(coarse) ?? fallbackSlope ?? b.targetMsPerBeat;

  let { map } = buildMap(sure.length ? sure : coarse, fallback, origin);
  let matched = matchNotes(ref, perf, map, allow);
  // Lượt hai: bản đồ từ các nốt đúng phím (chính xác hơn mốc thô).
  const refined = buildMap(anchorsFromPairs(ref, perf, matched.pairs), fallback, origin);
  if (refined.used.length >= 1) {
    map = refined.map;
    matched = matchNotes(ref, perf, map, allow);
  }
  const anchors = monotonicAnchors(anchorsFromPairs(ref, perf, matched.pairs));
  if (anchors.length) map = new TempoMap(anchors.map((a) => [a.beat, a.ms]), fallback, [anchors[0].beat, anchors[0].ms]);

  let exact = 0;
  let firstExact = Infinity;
  let firstAny = Infinity;
  let lastGroup = -1;
  let lastExactGroup = -1;
  for (const [r, p] of matched.pairs) {
    const g = ref.notes[r].group;
    firstAny = Math.min(firstAny, g);
    lastGroup = Math.max(lastGroup, g);
    if (p.kind === 'exact') {
      exact++;
      firstExact = Math.min(firstExact, g);
      lastExactGroup = Math.max(lastExactGroup, g);
    }
  }
  const perfIdx = perf.notes.map((_, i) => i).filter((i) => !allow.perf || allow.perf(i));
  const firstGroup = Number.isFinite(firstExact) ? firstExact : Number.isFinite(firstAny) ? firstAny : Math.min(...cells.map((c) => c[0]));
  return { ...matched, cells, perfIdx, map, anchors, fallback, exact, firstGroup, lastGroup, lastExactGroup };
}

export function alignPerformance(ref: ScoreReference, perf: BuiltPerformance): AlignedNotes {
  const targetMsPerBeat = 60000 / ref.targetBpm;
  const onsets = perf.notes.map((n) => n.onMs);
  const iois = ref.groups.slice(1).map((g, i) => (g.onsetBeat - ref.groups[i].onsetBeat) * targetMsPerBeat);
  const minIoi = iois.length ? Math.min(...iois) : targetMsPerBeat;
  const windowMs = Math.min(CLUSTER_MAX_MS, Math.max(CLUSTER_MIN_MS, CLUSTER_RATIO * minIoi));
  const clusters = clusterOnsets(onsets, windowMs);
  const origin: MapPoint = [ref.groups[0]?.onsetBeat ?? 0, perf.notes[0]?.onMs ?? 0];
  const single = (r: Pick<AlignedNotes, 'pairs' | 'perfToRef' | 'missing' | 'extras'>, map: TempoMap, anchored: number, firstGroup = -1, lastGroup = -1, lastExactGroup = -1): AlignedNotes => ({
    ...r,
    replayed: [],
    map,
    passes: [{ index: 0, fromMs: -Infinity, toMs: Infinity, firstGroup, lastGroup, lastExactGroup, graded: ref.groups.length ? [0, ref.groups.length - 1] : null, newFromMs: -Infinity, map }],
    restarts: [],
    refPass: ref.notes.map(() => 0),
    clusters,
    anchoredRatio: ref.groups.length ? anchored / ref.groups.length : 0,
    targetMsPerBeat,
  });

  if (!perf.notes.length || !ref.notes.length) {
    const map = new TempoMap([], targetMsPerBeat, origin);
    return single({ pairs: new Map(), perfToRef: new Map(), missing: ref.notes.map((_, i) => i), extras: perf.notes.map((_, i) => i) }, map, 0);
  }

  // DTW thô (có bước nhảy lùi = chơi lại).
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
  const exactIn = (i: number, j: number) => groupPitches[i].some((p) => clusterPitches[j].includes(p));
  const base: Base = { ref, perf, clusters, groupPitches, clusterPitches, sim, exactIn, targetMsPerBeat };
  const path = dtwPath((i, j) => 1 - sim(i, j), ref.groups.length, clusters.length, DTW_STEP_PENALTY, RESTART_JUMP_PENALTY, exactIn);
  const segments = splitAtJumps(path);
  /** Chơi một mạch: đường DTW thường (không nhảy, kết thúc ở nhóm cuối) → đúng thuật toán một lượt cũ. */
  const onePass = () => {
    const plain = dtwPath((i, j) => 1 - sim(i, j), ref.groups.length, clusters.length);
    const a = alignPass(base, plain, ALL, origin, null);
    return single(a, a.map, a.anchors.length, a.firstGroup, a.lastGroup, a.lastExactGroup);
  };
  if (segments.length === 1) return onePass();

  // ── nhiều lượt ──
  // Tempo dự phòng chung: trung vị độ dốc của các lượt đủ mốc.
  const slopes = segments.map((cells) => anchorSlope(coarseAnchors(base, cells))).filter((s): s is number => s !== null);
  const globalSlope = slopes.length ? median(slopes) : null;
  const n = ref.groups.length;
  const run = (cells: [number, number][]): PassAlignment => {
    const c0 = Math.min(...cells.map((c) => c[1]));
    const c1 = Math.max(...cells.map((c) => c[1]));
    const g0 = Math.min(...cells.map((c) => c[0]));
    const g1 = Math.min(n - 1, Math.max(...cells.map((c) => c[0])) + PASS_END_MARGIN);
    const notes = new Set(clusters.slice(c0, c1 + 1).flat());
    const first = Math.min(...notes);
    return alignPass(base, cells, { ref: (r) => ref.notes[r].group >= g0 && ref.notes[r].group <= g1, perf: (p) => notes.has(p) }, [ref.groups[g0].onsetBeat, perf.notes[first].onMs], globalSlope);
  };
  let passes = segments.map(run);
  // Gộp ranh giới không phải chơi lại thật: lượt quá ít nốt đúng, hoặc lượt sau không lùi về chỗ đã chơi.
  for (let changed = true; changed && passes.length > 1; ) {
    changed = false;
    for (let k = 0; k + 1 < passes.length; k++) {
      const a = passes[k];
      const b = passes[k + 1];
      if (a.exact >= MIN_PASS_EXACT && b.exact >= MIN_PASS_EXACT && b.firstGroup <= a.lastGroup) continue;
      passes.splice(k, 2, run([...a.cells, ...b.cells]));
      changed = true;
      break;
    }
  }
  // Không còn lần chơi lại nào sau khi gộp → như chơi một mạch.
  if (passes.length === 1) return onePass();
  return mergePasses(base, passes, clusters, targetMsPerBeat);
}

/**
 * Ghép các lượt theo chỗ đã chơi tới (frontier): lượt k chấm các nhóm (F, lastGroup_k] với F = nhóm xa nhất các lượt trước đã khớp;
 * nốt lượt k khớp nhóm ≤ F, hoặc thừa trước khi lượt k vượt qua F → "chơi lại" (không chấm). Nốt được chấm theo thời gian vẫn tăng
 * theo phách → bản đồ tempo chung đơn điệu.
 */
function mergePasses(b: Base, passes: PassAlignment[], clusters: number[][], targetMsPerBeat: number): AlignedNotes {
  const { ref, perf } = b;
  const n = ref.groups.length;
  const pairs: Pairs = new Map();
  const perfToRef = new Map<number, number>();
  const extras: number[] = [];
  const replayed: number[] = [];
  const refPass = ref.notes.map(() => -1);
  const out: AlignPass[] = [];
  let frontier = -1;
  passes.forEach((p, k) => {
    const prev = frontier;
    const fromMs = k === 0 ? -Infinity : perf.notes[p.perfIdx[0]].onMs;
    const graded: [number, number] | null = p.lastGroup > prev ? [prev + 1, p.lastGroup] : null;
    let newFromMs = k === 0 ? -Infinity : Infinity;
    for (const [r, x] of p.pairs) {
      const g = ref.notes[r].group;
      if (g > prev) {
        pairs.set(r, x);
        perfToRef.set(x.perf, r);
        if (k > 0) newFromMs = Math.min(newFromMs, perf.notes[x.perf].onMs);
      } else replayed.push(x.perf);
    }
    for (const q of p.extras) (perf.notes[q].onMs < newFromMs ? replayed : extras).push(q);
    if (graded) ref.notes.forEach((nt, r) => nt.group >= graded[0] && nt.group <= graded[1] && (refPass[r] = k));
    frontier = Math.max(frontier, p.lastGroup);
    out.push({ index: k, fromMs, toMs: Infinity, firstGroup: p.firstGroup, lastGroup: p.lastGroup, lastExactGroup: p.lastExactGroup, graded, newFromMs, map: p.map });
  });
  out.forEach((p, k) => (p.toMs = k + 1 < out.length ? out[k + 1].fromMs : Infinity));

  const restarts: RestartInfo[] = [];
  let reached = -1;
  for (let k = 0; k + 1 < passes.length; k++) {
    const p = passes[k];
    reached = Math.max(reached, p.lastGroup);
    const slipAfter = p.lastExactGroup >= 0 ? Math.max(...[...p.pairs].filter(([r, x]) => x.kind === 'exact' && ref.notes[r].group === p.lastExactGroup).map(([, x]) => perf.notes[x.perf].onMs)) : -Infinity;
    const loose = new Set(p.extras);
    for (const [, x] of p.pairs) if (x.kind !== 'exact') loose.add(x.perf);
    const slip = p.perfIdx.filter((q) => perf.notes[q].onMs > slipAfter && loose.has(q));
    const stopGroup = p.lastGroup > p.lastExactGroup ? p.lastGroup : Math.min(n - 1, p.lastExactGroup + 1);
    restarts.push({ pass: k, stopGroup: Math.max(0, stopGroup), restartGroup: passes[k + 1].firstGroup, atMs: out[k + 1].fromMs, slip, afterEnd: reached >= n - 1 });
  }

  const anchors = monotonicAnchors(anchorsFromPairs(ref, perf, pairs));
  const fallback = median(passes.map((p) => p.fallback));
  const map = anchors.length ? new TempoMap(anchors.map((a) => [a.beat, a.ms]), fallback, [anchors[0].beat, anchors[0].ms]) : new TempoMap([], fallback, [ref.groups[0]?.onsetBeat ?? 0, perf.notes[0]?.onMs ?? 0]);
  const missing = ref.notes.map((_, i) => i).filter((i) => !pairs.has(i));
  extras.sort((x, y) => x - y);
  replayed.sort((x, y) => x - y);
  return { pairs, perfToRef, missing, extras, replayed, map, passes: out, restarts, refPass, clusters, anchoredRatio: n ? anchors.length / n : 0, targetMsPerBeat };
}

// ── tiện ích theo lượt cho các bộ phân tích ──

/** Lượt chứa thời điểm `ms`. */
export function passIndexAt(a: Pick<AlignedNotes, 'passes'>, ms: number): number {
  for (let k = a.passes.length - 1; k > 0; k--) if (ms >= a.passes[k].fromMs) return k;
  return 0;
}

/** Bản đồ tempo đúng chỗ của thời điểm `ms` (lượt chứa nó); một lượt → bản đồ chung. */
export function mapAtMs(a: Pick<AlignedNotes, 'passes' | 'map'>, ms: number): TempoMap {
  return a.passes.length > 1 ? a.passes[passIndexAt(a, ms)].map : a.map;
}

/** Bản đồ tempo của lượt chấm nốt bản nhạc `r` (trường độ kỳ vọng không vắt qua chỗ chơi lại); một lượt → bản đồ chung. */
export function mapOfRef(a: Pick<AlignedNotes, 'passes' | 'map' | 'refPass'>, r: number): TempoMap {
  const k = a.refPass[r];
  return a.passes.length > 1 && k >= 0 ? a.passes[k].map : a.map;
}

/** Phách bắt đầu đoạn mới của từng lượt được chấm sau lượt đầu (ranh giới giữa các đoạn chấm theo lượt khác nhau). */
export function passBreakBeats(a: Pick<AlignedNotes, 'passes'>, ref: Pick<ScoreReference, 'groups'>): number[] {
  const out: number[] = [];
  for (const p of a.passes.slice(1)) if (p.graded) out.push(ref.groups[p.graded[0]].onsetBeat);
  return out;
}

/**
 * Khoảng đạp pedal (ms) → phách. Một lượt: bản đồ chung (như cũ). Nhiều lượt: mỗi lượt chỉ lấy phần pedal trong lúc lượt đó
 * chơi đoạn được chấm, đổi bằng bản đồ của lượt, kẹp trong đoạn phách lượt chấm — pedal lúc chơi lại / lúc dừng không tính;
 * đang đạp lúc dừng để chơi lại = nhả ở chỗ dừng; đạp từ lúc chơi lại và giữ sang đoạn mới = đạp sẵn ở đầu đoạn mới.
 */
export function pedalBeats(a: Pick<AlignedNotes, 'passes' | 'map'>, ref: Pick<ScoreReference, 'groups'>, intervals: readonly { down: number; up: number | null }[]): { down: number; up: number }[] {
  if (a.passes.length <= 1) return intervals.map((x) => ({ down: a.map.beatAt(x.down), up: x.up === null ? Infinity : a.map.beatAt(x.up) }));
  const out: { down: number; up: number }[] = [];
  for (const p of a.passes) {
    if (!p.graded) continue;
    const b0 = ref.groups[p.graded[0]].onsetBeat;
    const b1 = p.graded[1] + 1 < ref.groups.length ? ref.groups[p.graded[1] + 1].onsetBeat : Infinity;
    const last = p.index === a.passes.length - 1;
    for (const x of intervals) {
      const up = x.up ?? Infinity;
      if (up <= p.newFromMs || x.down >= p.toMs) continue;
      const down = x.down < p.newFromMs ? b0 - 1e-3 : Math.max(b0 - 1e-3, p.map.beatAt(x.down));
      const upBeat = up >= p.toMs ? (last ? Infinity : b1) : Math.min(b1, p.map.beatAt(up));
      if (upBeat > down) out.push({ down, up: upBeat });
    }
  }
  return out.sort((x, y) => x.down - y.down);
}
