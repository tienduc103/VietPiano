/**
 * "Bóng bay nốt nhạc" — máy trạng thái thuần (thời gian truyền vào, không tự hẹn giờ, không vẽ).
 *
 * Bóng bay mang tên nốt bay từ dưới lên; đánh đúng nốt thì quả đó nổ (mỗi sự kiện nổ tối đa MỘT quả —
 * quả bay cao nhất trong số khớp). Đánh sai (không quả nào khớp) → mất chuỗi. Bóng bay khỏi mép trên → mất một mạng;
 * hết mạng là thua. Thả đủ `balloons` quả và không còn quả nào trên trời → thắng.
 * Hai bóng cùng khoá so nốt (`matchKey`) không bay cùng lúc → một lần đánh không bao giờ mơ hồ.
 *
 * Độ khó (Dễ / Trung bình / Khó): số bóng cùng lúc, nhịp thả, số mạng, số bóng; tốc độ (Vừa / Nhanh) nhân thời gian bay.
 * Cứ mỗi `RAMP_EVERY` quả: nhanh thêm `RAMP_STEP` (tối đa `RAMP_MAX`), mở đầu mốc là một đợt `RUSH_SIZE` quả bay dồn dập
 * + nhanh hơn (`rush`), xong đợt về tốc độ của mốc. Nốt sắp thả được bốc trước (`upcoming`) để màn hình cho xem trước.
 * Đúng liên tục mỗi `FIREWORK_EVERY` nốt → `fireworks` tăng (pháo hoa).
 *
 * Kiểu "Tìm nốt" (`config.hunt`): không giới hạn số bóng, không tính mạng, không tăng tốc theo mốc. Bóng mang cả nốt cần
 * tìm (`targets`) lẫn nốt khác (`bomb`, khoảng 1/3). Đánh trúng bóng nốt khác → bom nổ: mọi bóng trên trời biến mất,
 * trừ `BOMB_PENALTY` điểm (không dưới 0); nổ `bombLimit` bom → hết ván. Bóng nốt khác bay mất thì không sao.
 * Tốc độ bay thích nghi (`speed`, áp ngay cho mọi quả đang bay): đúng → chậm lại `HUNT_STEP`; sai, nổ bom hoặc bóng
 * nốt cần tìm bay mất → nhanh thêm `HUNT_STEP` (trong [`HUNT_MIN_SPEED`, `HUNT_MAX_SPEED`]).
 * Vị trí ngang của bóng do màn hình quyết định (thẳng phím đàn), lõi chỉ giữ tiến độ bay 0 → 1.
 */
import type { Random } from '../games/random';
import type { Duration } from '../lessons/types';
import { matchKey, matches, type BalloonMode, type BalloonNote } from './notes';

export type BalloonDifficulty = 'easy' | 'normal' | 'hard';
export const BALLOON_DIFFICULTIES: readonly BalloonDifficulty[] = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABEL: Record<BalloonDifficulty, string> = { easy: 'Dễ', normal: 'Trung bình', hard: 'Khó' };
export type BalloonSpeed = 'medium' | 'fast';
export const BALLOON_SPEEDS: readonly BalloonSpeed[] = ['medium', 'fast'];
export const SPEED_LABEL: Record<BalloonSpeed, string> = { medium: 'Vừa', fast: 'Nhanh' };
export type BalloonStatus = 'ready' | 'playing' | 'paused' | 'won' | 'over';

export interface BalloonConfig {
  /** Số bóng tối đa cùng lúc trên trời. */
  maxActive: number;
  /** Khoảng thả bóng (ms). */
  spawnIntervalMs: number;
  /** Trời trống → thả quả kế sau chừng này (ms). */
  emptyGapMs: number;
  /** Quả đầu tiên sau khi bắt đầu (ms). */
  firstSpawnMs: number;
  /** Thời gian một quả bay từ mép dưới lên mép trên (ms). */
  riseMs: number;
  /** Tổng số bóng của ván. */
  balloons: number;
  lives: number;
  /** Bỏ sự kiện quá sát lần nổ trước (micro lặp lại nốt vừa đánh). */
  minIntervalMs: number;
  /** Kiểu Tìm nốt: nốt cần tìm (MIDI; nốt khác trong tập là bom) + số bom nổ thì hết ván. */
  hunt?: { targets: readonly number[]; bombLimit: number };
}

export const DIFFICULTY_CONFIG: Record<BalloonDifficulty, BalloonConfig> = {
  easy: { maxActive: 1, spawnIntervalMs: 2500, emptyGapMs: 700, firstSpawnMs: 600, riseMs: 10000, balloons: 40, lives: 5, minIntervalMs: 120 },
  normal: { maxActive: 2, spawnIntervalMs: 2800, emptyGapMs: 600, firstSpawnMs: 600, riseMs: 8500, balloons: 60, lives: 4, minIntervalMs: 120 },
  hard: { maxActive: 4, spawnIntervalMs: 1900, emptyGapMs: 500, firstSpawnMs: 600, riseMs: 7000, balloons: 80, lives: 3, minIntervalMs: 100 },
};

/** Mỗi chừng này quả thì lên một mốc tốc độ. */
export const RAMP_EVERY = 20;
/** Mỗi mốc nhanh thêm (tỉ lệ so với tốc độ đầu ván). */
export const RAMP_STEP = 0.1;
export const RAMP_MAX = 1.5;
/** Đợt bóng nhanh ở đầu mỗi mốc: số quả, bay nhanh hơn, thả dày hơn, thêm một quả cùng lúc. */
export const RUSH_SIZE = 5;
export const RUSH_SPEED = 1.3;
export const RUSH_INTERVAL = 0.5;
/** Số quả sắp thả cho xem trước. */
export const UPCOMING = 3;
/** Đúng liên tục mỗi chừng này nốt → pháo hoa. */
export const FIREWORK_EVERY = 10;

/** Hệ số tốc độ của quả thứ `index` (0 = quả đầu): 1 → 1.1 → 1.2 … (tối đa `RAMP_MAX`). */
export function rampFactor(index: number): number {
  return Math.min(RAMP_MAX, 1 + RAMP_STEP * Math.floor(index / RAMP_EVERY));
}

/** Quả thứ `index` thuộc đợt bóng nhanh (5 quả đầu của mỗi mốc, trừ mốc đầu ván). */
export function isRush(index: number): boolean {
  return index >= RAMP_EVERY && index % RAMP_EVERY < RUSH_SIZE;
}

/** Nhanh: bay và thả bóng nhanh hơn chừng này lần. */
export const SPEED_FACTOR: Record<BalloonSpeed, number> = { medium: 1, fast: 1.5 };

export function balloonConfig(difficulty: BalloonDifficulty, speed: BalloonSpeed): BalloonConfig {
  const c = DIFFICULTY_CONFIG[difficulty];
  const k = SPEED_FACTOR[speed];
  return { ...c, riseMs: Math.round(c.riseMs / k), spawnIntervalMs: Math.round(c.spawnIntervalMs / k) };
}

export const HUNT_BOMBS = 10;
export const BOMB_PENALTY = 10;
/** Tỉ lệ bóng nốt cần tìm (còn lại là bom) khi có cả hai loại. */
export const TARGET_SHARE = 2 / 3;
export const HUNT_STEP = 0.1;
export const HUNT_MIN_SPEED = 0.5;
export const HUNT_MAX_SPEED = 3;

/** Kiểu Tìm nốt: như độ khó × tốc độ đã chọn, nhưng chơi tới khi nổ `HUNT_BOMBS` bom. */
export function huntConfig(difficulty: BalloonDifficulty, speed: BalloonSpeed, targets: readonly number[]): BalloonConfig {
  return { ...balloonConfig(difficulty, speed), balloons: Infinity, lives: Infinity, hunt: { targets, bombLimit: HUNT_BOMBS } };
}

/** Sao kiểu Tìm nốt (theo số bóng nổ trước khi sai đủ): 1★ ≥ 10, 2★ ≥ 25, 3★ ≥ 50. */
export function huntStars(popped: number): 0 | 1 | 2 | 3 {
  return popped >= 50 ? 3 : popped >= 25 ? 2 : popped >= 10 ? 1 : 0;
}

/** Trường độ bốc ngẫu nhiên cho hình nốt trên bóng (chế độ hiển thị Hình nốt) — chỉ để đọc, không chấm giữ phím. */
export const BALLOON_DURATIONS: readonly Duration[] = ['w', 'h', 'q', '8'];

export interface Balloon {
  id: number;
  note: BalloonNote;
  duration: Duration;
  /** Đồng hồ trò chơi lúc thả (ms). */
  spawnedAt: number;
  riseMs: number;
  /** Thuộc đợt bóng nhanh. */
  rush: boolean;
  /** Kiểu Tìm nốt: nốt không cần tìm — đánh trúng là nổ bom. */
  bomb: boolean;
}

/** Quả sắp thả (xem trước). */
export interface UpcomingBalloon {
  note: BalloonNote;
  duration: Duration;
}

export interface NoteStat {
  midi: number;
  shown: number;
  hits: number;
  /** Bay mất (không kịp nổ). */
  escapes: number;
  /** Đánh sai lúc quả này bay cao nhất. */
  wrongs: number;
  confusedWith: Record<number, number>;
}

export interface BalloonState {
  readonly status: BalloonStatus;
  /** Bóng đang bay, theo thứ tự thả (quả đầu bay cao nhất). */
  readonly balloons: readonly Balloon[];
  /** Quả sắp thả theo thứ tự (tối đa `UPCOMING`, không vượt số quả còn lại). */
  readonly upcoming: readonly UpcomingBalloon[];
  readonly spawned: number;
  readonly popped: number;
  readonly escaped: number;
  readonly wrongs: number;
  readonly score: number;
  readonly lives: number;
  readonly combo: number;
  readonly bestCombo: number;
  /** Hệ số tốc độ bay hiện tại của mọi quả (kiểu Tìm nốt thay đổi theo đúng / sai; kiểu thường luôn 1). */
  readonly speed: number;
  /** Kiểu Tìm nốt: số bom đã nổ. */
  readonly bombs: number;
  /** Bom vừa nổ: các quả bị nổ theo + tiến độ bay lúc đó (hiệu ứng). */
  readonly lastBlast: readonly { balloon: Balloon; progress: number }[];
  /** Số lần đạt mốc đúng liên tục (mỗi `FIREWORK_EVERY` nốt) — tăng → bắn pháo hoa. */
  readonly fireworks: number;
  readonly lastOutcome: 'pop' | 'wrong' | 'escape' | 'bomb' | null;
  readonly lastMidi: number | null;
  /** performance.now() của sự kiện gần nhất. */
  readonly lastEventTime: number;
  /** Quả vừa nổ / bay mất + tiến độ bay lúc đó (hiệu ứng). */
  readonly lastBalloon: { balloon: Balloon; progress: number } | null;
  readonly stats: Readonly<Record<number, NoteStat>>;
}

export const POP_POINTS = 10;
/** Nổ sớm (bóng còn thấp) được thêm tới chừng này điểm. */
export const HEIGHT_POINTS = 10;
export const COMBO_POINTS = 2;
const MAX_COMBO_BONUS = 10;
export const LIFE_BONUS = 50;
/** Khung hình bị trễ (tab nền…) → chỉ tính tối đa chừng này. */
const MAX_FRAME_MS = 100;

/** Sao: thắng = 1; nổ ≥ 80% số bóng và chính xác ≥ 75% = 2; không quả nào bay mất và chính xác ≥ 90% = 3. Thua = 0. */
export function balloonStars(r: { won: boolean; popped: number; total: number; escaped: number; accuracy: number }): 0 | 1 | 2 | 3 {
  if (!r.won) return 0;
  if (r.escaped === 0 && r.accuracy >= 0.9) return 3;
  return r.popped >= r.total * 0.8 && r.accuracy >= 0.75 ? 2 : 1;
}

export class BalloonPopGame {
  readonly config: BalloonConfig;
  private state: BalloonState;
  private readonly listeners = new Set<(s: BalloonState) => void>();
  private clock = 0;
  private lastNow: number | null = null;
  private nextSpawnAt: number;
  private nextId = 0;
  private lastPopAt = -Infinity;
  private lastDrawn: number | null = null;
  private queue: UpcomingBalloon[] = [];
  /** Tiến độ bay của từng quả (cộng dồn theo `speed` mỗi khung). */
  private readonly progress = new Map<number, number>();

  constructor(
    readonly mode: BalloonMode,
    private readonly pool: readonly BalloonNote[],
    config: BalloonConfig,
    private readonly random: Random = Math.random,
  ) {
    if (pool.length < 1) throw new Error('Trò chơi cần ít nhất một nốt');
    this.config = config;
    this.nextSpawnAt = config.firstSpawnMs;
    while (this.queue.length < UPCOMING) this.queue.push(this.draw());
    this.state = {
      status: 'ready',
      balloons: [],
      upcoming: this.queue.slice(0, config.balloons),
      spawned: 0,
      popped: 0,
      escaped: 0,
      wrongs: 0,
      score: 0,
      lives: config.lives,
      combo: 0,
      bestCombo: 0,
      speed: 1,
      bombs: 0,
      lastBlast: [],
      fireworks: 0,
      lastOutcome: null,
      lastMidi: null,
      lastEventTime: 0,
      lastBalloon: null,
      stats: {},
    };
  }

  getState(): BalloonState {
    return this.state;
  }

  /** Đồng hồ trò chơi (ms, không tính lúc tạm dừng). */
  getClock(): number {
    return this.clock;
  }

  /** Tiến độ bay 0 (mép dưới) → 1 (mép trên). */
  progressOf(b: Balloon): number {
    return Math.min(1, this.progress.get(b.id) ?? 0);
  }

  get hunt(): boolean {
    return this.config.hunt !== undefined;
  }

  /** Quả cần đánh trước nhất (bay cao nhất, không phải bom). */
  get urgent(): Balloon | null {
    return urgentOf(this.state);
  }

  subscribe(listener: (s: BalloonState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<BalloonState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  get accuracy(): number {
    const total = this.state.popped + this.state.wrongs;
    return total === 0 ? 0 : this.state.popped / total;
  }

  get stars(): 0 | 1 | 2 | 3 {
    const s = this.state;
    if (this.hunt) return huntStars(s.popped);
    return balloonStars({ won: s.status === 'won', popped: s.popped, total: this.config.balloons, escaped: s.escaped, accuracy: this.accuracy });
  }

  start(now: number): void {
    if (this.state.status !== 'ready') return;
    this.lastNow = now;
    this.setState({ status: 'playing' });
  }

  pause(now: number): void {
    if (this.state.status !== 'playing') return;
    this.tick(now);
    if (this.state.status === 'playing') this.setState({ status: 'paused' });
  }

  resume(now: number): void {
    if (this.state.status !== 'paused') return;
    this.lastNow = now;
    this.setState({ status: 'playing' });
  }

  answer(midi: number, now: number): 'pop' | 'wrong' | 'bomb' | 'ignored' {
    if (this.state.status !== 'playing') return 'ignored';
    if (now - this.lastPopAt < this.config.minIntervalMs) return 'ignored';
    // Tính tới thời điểm sự kiện (quả có thể vừa bay mất).
    this.tick(now);
    const s = this.state;
    if (s.status !== 'playing') return 'ignored';
    const base = { lastMidi: midi, lastEventTime: now };
    const hit = s.balloons.find((b) => matches(this.mode, b.note, midi));
    if (!hit || hit.bomb) {
      const stats = { ...s.stats };
      const top = urgentOf(s);
      if (top) {
        const st = { ...stats[top.note.midi] };
        st.wrongs++;
        st.confusedWith = { ...st.confusedWith, [midi]: (st.confusedWith[midi] ?? 0) + 1 };
        stats[top.note.midi] = st;
      }
      const wrong = { ...base, wrongs: s.wrongs + 1, combo: 0, stats, ...this.speedUp() };
      if (!hit) {
        this.setState({ ...wrong, lastOutcome: 'wrong' });
        return 'wrong';
      }
      // Bom: nổ hết bóng trên trời.
      this.lastPopAt = now;
      const lastBlast = s.balloons.map((b) => ({ balloon: b, progress: this.progressOf(b) }));
      this.progress.clear();
      const bombs = s.bombs + 1;
      this.setState({
        ...wrong,
        balloons: [],
        bombs,
        score: Math.max(0, s.score - BOMB_PENALTY),
        lastOutcome: 'bomb',
        lastBalloon: { balloon: hit, progress: this.progressOf(hit) },
        lastBlast,
        status: bombs >= this.config.hunt!.bombLimit ? 'over' : 'playing',
      });
      if (this.state.status === 'playing') this.afterRemove();
      return 'bomb';
    }
    this.lastPopAt = now;
    const progress = this.progressOf(hit);
    const balloons = s.balloons.filter((b) => b !== hit);
    this.progress.delete(hit.id);
    const st = s.stats[hit.note.midi];
    const combo = s.combo + 1;
    this.setState({
      ...base,
      balloons,
      popped: s.popped + 1,
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      fireworks: combo % FIREWORK_EVERY === 0 ? s.fireworks + 1 : s.fireworks,
      score: s.score + POP_POINTS + Math.round(HEIGHT_POINTS * (1 - progress)) + COMBO_POINTS * Math.min(s.combo, MAX_COMBO_BONUS),
      lastOutcome: 'pop',
      speed: this.hunt ? Math.max(HUNT_MIN_SPEED, round1(s.speed - HUNT_STEP)) : s.speed,
      lastBalloon: { balloon: hit, progress },
      stats: { ...s.stats, [hit.note.midi]: { ...st, hits: st.hits + 1 } },
    });
    this.afterRemove();
    return 'pop';
  }

  /** Gọi mỗi khung hình. */
  tick(now: number): void {
    if (this.state.status !== 'playing') {
      this.lastNow = now;
      return;
    }
    if (this.lastNow !== null && now < this.lastNow) return;
    const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - (this.lastNow ?? now)));
    this.lastNow = now;
    this.clock += dt;
    for (const b of this.state.balloons) this.progress.set(b.id, (this.progress.get(b.id) ?? 0) + (dt / b.riseMs) * this.state.speed);

    for (const b of this.state.balloons) {
      if (this.progressOf(b) < 1) continue;
      this.escape(b, now);
      if (this.state.status !== 'playing') return;
    }
    const c = this.config;
    const maxActive = c.maxActive + (!this.hunt && isRush(this.state.spawned) ? 1 : 0);
    if (this.state.spawned < c.balloons && this.state.balloons.length < maxActive && this.clock >= this.nextSpawnAt) this.spawn();
  }

  private escape(b: Balloon, now: number): void {
    const s = this.state;
    if (b.bomb) {
      // Bóng nốt khác bay mất: đúng ý, không tính gì.
      this.progress.delete(b.id);
      this.setState({ balloons: s.balloons.filter((x) => x !== b) });
      this.afterRemove();
      return;
    }
    const st = s.stats[b.note.midi];
    const lives = this.hunt ? s.lives : s.lives - 1;
    this.progress.delete(b.id);
    this.setState({
      balloons: s.balloons.filter((x) => x !== b),
      escaped: s.escaped + 1,
      lives,
      combo: 0,
      lastOutcome: 'escape',
      lastEventTime: now,
      lastMidi: null,
      lastBalloon: { balloon: b, progress: 1 },
      stats: { ...s.stats, [b.note.midi]: { ...st, escapes: st.escapes + 1 } },
      status: lives <= 0 ? 'over' : 'playing',
      ...this.speedUp(),
    });
    if (this.state.status === 'playing') this.afterRemove();
  }

  /** Kiểu Tìm nốt: một lần sai → bóng nhanh thêm. Kiểu thường: không đổi gì. */
  private speedUp(): Partial<BalloonState> {
    return this.hunt ? { speed: Math.min(HUNT_MAX_SPEED, round1(this.state.speed + HUNT_STEP)) } : {};
  }

  /** Sau khi một quả biến mất: hết bóng → thắng; trời trống → thả quả kế sớm. */
  private afterRemove(): void {
    const s = this.state;
    if (s.balloons.length > 0) return;
    if (s.spawned >= this.config.balloons) {
      this.setState({ status: 'won', score: s.score + s.lives * LIFE_BONUS });
      return;
    }
    this.nextSpawnAt = Math.min(this.nextSpawnAt, this.clock + this.config.emptyGapMs);
  }

  /**
   * Thả quả sắp thả đầu tiên KHÔNG trùng khoá so nốt với quả đang bay (hàng chờ có thể bị vượt lên);
   * cả hàng chờ đều trùng → bốc thêm một quả không trùng thả luôn (vd Tìm nốt chỉ một nốt: hàng chờ hay toàn nốt đó);
   * không bốc được → chờ tới khi có quả nổ / bay mất.
   */
  private spawn(): void {
    const s = this.state;
    const busy = new Set(s.balloons.map((b) => matchKey(this.mode, b.note.midi)));
    const free = (u: UpcomingBalloon) => !busy.has(matchKey(this.mode, u.note.midi));
    const pick = this.queue.findIndex(free);
    let next: UpcomingBalloon | undefined;
    if (pick >= 0) {
      next = this.queue.splice(pick, 1)[0];
      this.queue.push(this.draw());
    } else {
      for (let k = 0; k < 12 && !next; k++) {
        const u = this.draw();
        if (free(u)) next = u;
      }
    }
    if (!next) return;
    const { note, duration } = next;
    const index = s.spawned;
    const rush = !this.hunt && isRush(index);
    const factor = this.hunt ? 1 : rampFactor(index) * (rush ? RUSH_SPEED : 1);
    const bomb = this.hunt && !this.config.hunt!.targets.includes(note.midi);
    const balloon: Balloon = { id: this.nextId++, note, duration, spawnedAt: this.clock, riseMs: Math.round(this.config.riseMs / factor), rush, bomb };
    const st = s.stats[note.midi] ?? emptyStat(note.midi);
    const spawned = index + 1;
    this.nextSpawnAt = this.hunt
      ? this.clock + Math.round(this.config.spawnIntervalMs / s.speed)
      : this.clock + Math.round((this.config.spawnIntervalMs / rampFactor(spawned)) * (isRush(spawned) ? RUSH_INTERVAL : 1));
    this.progress.set(balloon.id, 0);
    this.setState({
      balloons: [...s.balloons, balloon],
      upcoming: this.queue.slice(0, Math.max(0, this.config.balloons - spawned)),
      spawned,
      stats: { ...s.stats, [note.midi]: { ...st, shown: st.shown + 1 } },
    });
  }

  /**
   * Bốc trước một quả cho hàng chờ: không lặp nốt vừa bốc; trường độ ngẫu nhiên (cho hình nốt).
   * Tìm nốt: nốt cần tìm chiếm `TARGET_SHARE`, còn lại là bom.
   */
  private draw(): UpcomingBalloon {
    const last = this.lastDrawn;
    let pool = this.pool;
    const hunt = this.config.hunt;
    if (hunt) {
      const targets = pool.filter((n) => hunt.targets.includes(n.midi));
      const bombs = pool.filter((n) => !hunt.targets.includes(n.midi));
      if (targets.length > 0 && bombs.length > 0) pool = this.random() < TARGET_SHARE ? targets : bombs;
    }
    const others = pool.filter((n) => n.midi !== last);
    const options = others.length > 0 ? others : pool;
    const note = options[Math.floor(this.random() * options.length)];
    this.lastDrawn = note.midi;
    return { note, duration: BALLOON_DURATIONS[Math.floor(this.random() * BALLOON_DURATIONS.length)] };
  }
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Quả cần đánh trước nhất: bay cao nhất trong số không phải bom. */
export function urgentOf(s: Pick<BalloonState, 'balloons'>): Balloon | null {
  return s.balloons.find((b) => !b.bomb) ?? null;
}

function emptyStat(midi: number): NoteStat {
  return { midi, shown: 0, hits: 0, escapes: 0, wrongs: 0, confusedWith: {} };
}

export interface BalloonSummary {
  score: number;
  stars: 0 | 1 | 2 | 3;
  won: boolean;
  popped: number;
  total: number;
  escaped: number;
  wrongs: number;
  accuracy: number;
  bestCombo: number;
  /** Nốt yếu (bay mất / sai nhiều), tối đa 3. */
  weakNotes: number[];
}

export function summarize(game: BalloonPopGame): BalloonSummary {
  const s = game.getState();
  const weakNotes = Object.values(s.stats)
    .filter((n) => n.escapes + n.wrongs > 0)
    .sort((a, b) => b.escapes + b.wrongs - (a.escapes + a.wrongs) || a.midi - b.midi)
    .slice(0, 3)
    .map((n) => n.midi);
  return {
    score: s.score,
    stars: game.stars,
    won: s.status === 'won',
    popped: s.popped,
    total: game.config.balloons,
    escaped: s.escaped,
    wrongs: s.wrongs,
    accuracy: game.accuracy,
    bestCombo: s.bestCombo,
    weakNotes,
  };
}
