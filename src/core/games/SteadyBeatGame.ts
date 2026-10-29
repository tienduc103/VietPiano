/**
 * "Giữ nhịp tim" — máy trạng thái thuần, KHÔNG xét cao độ (gõ phím nào cũng được).
 * Metronome kêu `guideBeats` phách (đếm vào + gõ theo) rồi tắt; người học tự gõ tiếp `silentBeats` phách đều đặn.
 * Chỉ chấm phần tự giữ nhịp: mỗi khoảng giữa hai lần gõ (lần đầu tính từ tiếng click cuối) so với độ dài một phách.
 * Khoảng ≈ k phách (k ≥ 2) = bỏ sót k−1 phách, phần còn lại chấm theo khoảng/k. Lệch ≤ `perfectPct` → Đều,
 * ≤ `goodPct` → Khá, hơn nữa → Lệch. Gõ quá sát lần trước (< `minIntervalBeats` phách) bị bỏ (micro phát lặp).
 * Thời điểm gõ truyền vào đã trừ độ trễ nhận diện (micro) — engine không tự bù.
 */
import { COMBO_BONUS, type GameStatus } from './NoteCatchGame';

export interface SteadyBeatConfig {
  bpm: number;
  /** Số phách metronome kêu (gồm cả phần đếm vào). */
  guideBeats: number;
  silentBeats: number;
  /** Ngưỡng lệch so với một phách (0.06 = 6%). */
  perfectPct: number;
  goodPct: number;
  minIntervalBeats: number;
}

export const DEFAULT_STEADY_BEAT_CONFIG: SteadyBeatConfig = { bpm: 80, guideBeats: 8, silentBeats: 16, perfectPct: 0.06, goodPct: 0.15, minIntervalBeats: 0.4 };
export const KIDS_STEADY_BEAT_CONFIG: Partial<SteadyBeatConfig> = { perfectPct: 0.1, goodPct: 0.2 };

export type BeatGrade = 'perfect' | 'good' | 'off' | 'miss';

export interface SteadyBeatState {
  readonly status: GameStatus;
  readonly startAt: number;
  /** Kết quả từng phách tự giữ, theo thứ tự. */
  readonly grades: readonly BeatGrade[];
  /** Thời điểm lần gõ gần nhất được nhận (hoặc tiếng click cuối khi chưa gõ). */
  readonly lastTapAt: number | null;
  /** Các khoảng (ms một phách) đã chấm — để tính nhịp độ trung bình người học giữ được. */
  readonly intervals: readonly number[];
  readonly score: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly lastOutcome: BeatGrade | null;
  /** Lệch của lần gõ gần nhất (tỉ lệ, âm = nhanh hơn). */
  readonly lastDeviation: number | null;
  readonly lastEventTime: number;
}

const POINTS: Record<BeatGrade, number> = { perfect: 100, good: 50, off: 10, miss: 0 };
const MAX_COMBO_BONUS = 10;
/** Quá phách cuối dự kiến chừng này phách, hoặc ngừng gõ quá (chừng này + 1) phách → kết thúc, phần còn lại tính bỏ sót. */
const END_GRACE_BEATS = 2;

export class SteadyBeatGame {
  readonly config: SteadyBeatConfig;
  readonly beatMs: number;
  private state: SteadyBeatState;
  private readonly listeners = new Set<(s: SteadyBeatState) => void>();

  constructor(config: Partial<SteadyBeatConfig> = {}) {
    this.config = { ...DEFAULT_STEADY_BEAT_CONFIG, ...config };
    this.beatMs = 60_000 / this.config.bpm;
    this.state = this.initialState(0);
  }

  private initialState(startAt: number): SteadyBeatState {
    return {
      status: 'ready',
      startAt,
      grades: [],
      lastTapAt: null,
      intervals: [],
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastOutcome: null,
      lastDeviation: null,
      lastEventTime: 0,
    };
  }

  getState(): SteadyBeatState {
    return this.state;
  }

  subscribe(listener: (s: SteadyBeatState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<SteadyBeatState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  get total(): number {
    return this.config.silentBeats;
  }

  /** Thời điểm các tiếng click metronome (phách đầu ô nhịp 4/4 là phách mạnh). */
  get clicks(): { at: number; accent: boolean }[] {
    return Array.from({ length: this.config.guideBeats }, (_, i) => ({ at: this.state.startAt + i * this.beatMs, accent: i % 4 === 0 }));
  }

  /** Tiếng click cuối — mốc của khoảng đầu tiên. */
  private get lastClickAt(): number {
    return this.state.startAt + (this.config.guideBeats - 1) * this.beatMs;
  }

  /** Lúc metronome tắt, bắt đầu tự giữ nhịp. */
  get silentFrom(): number {
    return this.lastClickAt + this.beatMs / 2;
  }

  get hits(): number {
    return this.state.grades.filter((g) => g === 'perfect' || g === 'good').length;
  }

  /** Phần trăm điểm tối đa (Đều = 1, Khá = ½). */
  get accuracy(): number {
    const g = this.state.grades;
    return (g.filter((x) => x === 'perfect').length + 0.5 * g.filter((x) => x === 'good').length) / this.config.silentBeats;
  }

  /** Nhịp độ trung bình người học giữ được (phách/phút); null khi chưa có khoảng nào. */
  get heldBpm(): number | null {
    const iv = this.state.intervals;
    if (iv.length === 0) return null;
    return 60_000 / (iv.reduce((a, b) => a + b, 0) / iv.length);
  }

  start(now: number): void {
    this.state = { ...this.initialState(now), status: 'playing' };
    this.listeners.forEach((l) => l(this.state));
  }

  /** Một lần gõ (thời điểm đã trừ độ trễ). Gõ trong lúc metronome còn kêu chỉ là gõ theo, không chấm. */
  tap(now: number): BeatGrade | 'guide' | 'ignored' {
    const s = this.state;
    if (s.status !== 'playing') return 'ignored';
    if (now < this.silentFrom) return 'guide';
    const anchor = s.lastTapAt ?? this.lastClickAt;
    const ioi = now - anchor;
    if (ioi < this.config.minIntervalBeats * this.beatMs) return 'ignored';
    const k = Math.max(1, Math.round(ioi / this.beatMs));
    const perBeat = ioi / k;
    const deviation = perBeat / this.beatMs - 1;
    const abs = Math.abs(deviation);
    const grade: BeatGrade = abs <= this.config.perfectPct ? 'perfect' : abs <= this.config.goodPct ? 'good' : 'off';
    const room = this.config.silentBeats - s.grades.length;
    const missed = Math.min(k - 1, room);
    const grades = [...s.grades, ...Array<BeatGrade>(missed).fill('miss'), ...(room > missed ? [grade] : [])];
    const counted = room > missed;
    // Bỏ sót phách hay gõ lệch → mất chuỗi.
    const before = missed > 0 ? 0 : s.combo;
    const combo = grade === 'off' ? 0 : before + 1;
    this.setState({
      grades,
      lastTapAt: now,
      intervals: counted ? [...s.intervals, perBeat] : s.intervals,
      score: s.score + (counted ? POINTS[grade] + (grade === 'off' ? 0 : COMBO_BONUS * Math.min(before, MAX_COMBO_BONUS)) : 0),
      combo: counted ? combo : 0,
      bestCombo: Math.max(s.bestCombo, counted ? combo : 0),
      lastOutcome: counted ? grade : 'miss',
      lastDeviation: counted ? deviation : null,
      lastEventTime: now,
      ...(grades.length >= this.config.silentBeats ? { status: 'finished' as const } : {}),
    });
    return counted ? grade : 'miss';
  }

  /** Gọi mỗi khung hình: ngừng gõ quá lâu → các phách còn lại tính bỏ sót, kết thúc. */
  tick(now: number): void {
    const s = this.state;
    if (s.status !== 'playing') return;
    const anchor = s.lastTapAt ?? this.lastClickAt;
    const expectedEnd = this.lastClickAt + (this.config.silentBeats + END_GRACE_BEATS) * this.beatMs;
    if (now < expectedEnd && now - anchor <= (END_GRACE_BEATS + 1) * this.beatMs) return;
    const left = this.config.silentBeats - s.grades.length;
    this.setState({ status: 'finished', grades: [...s.grades, ...Array<BeatGrade>(left).fill('miss')], combo: 0, lastOutcome: 'miss', lastEventTime: now });
  }
}
