/**
 * "Flappy Note" — máy trạng thái + vật lý thuần (thời gian truyền vào, không tự hẹn giờ, không vẽ).
 *
 * Chim rơi theo trọng lực; mỗi lần đánh ĐÚNG nốt mục tiêu thì chim được một lực nâng và nốt mục tiêu
 * chuyển sang nốt kế (mỗi sự kiện tiến tối đa một nốt). Đánh sai: không được nâng, mất chuỗi, vẫn ở nốt đó.
 * Ống cản chạy từ phải sang trái; chạm ống / mặt đất mất một mạng rồi được bất tử một lúc (bay xuyên ống,
 * chạm đất thì nảy lên) — hết mạng là thua. Qua đủ `pipes` ống là về đích.
 *
 * Trường độ (`durations` khác rỗng, độ khó Siêu dễ): mỗi nốt mục tiêu mang một trường độ ghi trên khuông
 * (chuỗi nốt: theo giai điệu; ngẫu nhiên: bốc từ `durations`) — trường độ càng dài chim được nâng càng cao
 * (`liftScale`). Chỉ là trường độ ghi trên khuông: không đo thời gian giữ phím (micro không có Note Off).
 *
 * Vật phẩm (`itemChance`) nằm giữa hai ống, chim chạm vào là nhặt:
 * - ⚡ tia sét: tăng tốc ×`BOOST_SPEED`, chim tự lái theo tâm khe và bất tử tới khi qua `BOOST_PIPES` ống, rồi chậm dần
 *   về tốc độ thường (+ bất tử `BOOST_GRACE_MS`). Trong lúc đó nốt đúng vẫn sang nốt kế, gấp đôi điểm, không nâng chim.
 * - ❤️ trái tim: +1 mạng (tối đa số mạng đầu ván); đủ mạng thì +`HEART_BONUS` điểm.
 * - 👻 con ma: mọi ống chim sẽ gặp trong `GHOST_MS` tới biến mất (vẫn tính là đã qua khi tới chỗ chim → vẫn về đích được);
 *   trọng lực, đất vẫn còn → vẫn phải đánh nốt để giữ chim bay.
 *
 * Trước nốt đúng đầu tiên (`ready`) chim lơ lửng, ống đứng yên: người chơi có thời gian đọc nốt đầu.
 * Toạ độ thế giới: cao `WORLD_HEIGHT`, mặt đất ở `GROUND_Y`, chim ở x = `BIRD_X`; ống có x tăng dần
 * (cách nhau `spacing`), cuộn sang trái với `speed`. Bề ngang hiển thị do màn hình quyết định.
 */
import type { FlappyNote } from './levels';
import type { Random } from '../games/random';
import { DURATION_BEATS, type Duration } from '../lessons/types';

export const WORLD_HEIGHT = 600;
export const GROUND_Y = 540;
export const BIRD_X = 280;
export const BIRD_RADIUS = 24;
export const PIPE_WIDTH = 96;
/** Bán kính va chạm nhỏ hơn hình vẽ một chút cho dễ chịu. */
const HIT_RADIUS = BIRD_RADIUS * 0.72;
/** Khe ống không sát trần / đất quá. */
const GAP_MARGIN = 50;
/** Bước tích phân cố định (ổn định, không phụ thuộc tốc độ khung hình). */
const STEP_MS = 1000 / 120;
/** Khung hình bị trễ (tab nền…) → chỉ mô phỏng tối đa chừng này. */
const MAX_FRAME_MS = 100;

export type FlappyDifficulty = 'super-easy' | 'easy' | 'normal' | 'hard';
export const DIFFICULTIES: readonly FlappyDifficulty[] = ['super-easy', 'easy', 'normal', 'hard'];
export type FlappyStatus = 'ready' | 'playing' | 'paused' | 'won' | 'over';
export type FlappyMode = 'random' | 'sequence';

export interface FlappyConfig {
  /** px/s² (hướng xuống). */
  gravity: number;
  /** Vận tốc lên ngay sau một nốt đúng (px/s). */
  flapVelocity: number;
  maxFallSpeed: number;
  /** Tốc độ cuộn (px/s). */
  speed: number;
  /** Khoảng cách giữa hai ống liên tiếp (px). */
  spacing: number;
  /** Chiều cao khe ống (px). */
  gap: number;
  /** Tâm khe lệch tối đa so với ống trước (px) — để luôn bay kịp. */
  maxGapShift: number;
  /** Ống đầu tiên cách chim (px). */
  firstPipeOffset: number;
  /** Số ống cần vượt để về đích. */
  pipes: number;
  lives: number;
  /** Bất tử sau khi va chạm (ms). */
  invincibleMs: number;
  /** Bỏ sự kiện quá sát lần chuyển nốt (micro phát lặp nốt vừa đánh); sửa nhanh sau nốt sai thì không bị chặn. */
  minIntervalMs: number;
  /** Trường độ bốc ngẫu nhiên cho nốt mục tiêu (lặp lại = hay gặp hơn); rỗng = không dùng trường độ, mọi nốt nâng như nhau. */
  durations: readonly Duration[];
  /** Số nốt kế tiếp được biết trước. */
  upcoming: number;
  /** Xác suất có vật phẩm ở mỗi khoảng giữa hai ống (0 = không có vật phẩm). */
  itemChance: number;
  /** Phần vật phẩm là trái tim; còn lại chia đều tia sét / con ma. */
  heartShare: number;
}

const STANDARD = { durations: [], upcoming: 3 } as const;
const EASY_ITEMS = { itemChance: 0.25, heartShare: 0.45 } as const;

export const DIFFICULTY_CONFIG: Record<FlappyDifficulty, FlappyConfig> = {
  // Mỗi nốt nâng ít (nốt đen ≈ 50 px) nhưng rơi rất chậm → đánh nhiều nốt liên tục; nốt dài bay cao hơn.
  'super-easy': { gravity: 140, flapVelocity: 120, maxFallSpeed: 150, speed: 80, spacing: 470, gap: 290, maxGapShift: 70, firstPipeOffset: 760, pipes: 10, lives: 7, invincibleMs: 2500, minIntervalMs: 80, durations: ['8', 'q', 'q', 'q', 'h', 'h', 'w'], upcoming: 5, ...EASY_ITEMS },
  // Nâng một lần ≈ 1,8 s mới rơi về độ cao cũ → đủ thời gian đọc nốt.
  easy: { gravity: 260, flapVelocity: 230, maxFallSpeed: 260, speed: 110, spacing: 430, gap: 240, maxGapShift: 90, firstPipeOffset: 720, pipes: 12, lives: 5, invincibleMs: 2200, minIntervalMs: 120, ...STANDARD, ...EASY_ITEMS },
  normal: { gravity: 420, flapVelocity: 300, maxFallSpeed: 380, speed: 150, spacing: 410, gap: 205, maxGapShift: 120, firstPipeOffset: 720, pipes: 18, lives: 3, invincibleMs: 1800, minIntervalMs: 120, ...STANDARD, itemChance: 0.18, heartShare: 0.34 },
  hard: { gravity: 650, flapVelocity: 380, maxFallSpeed: 520, speed: 200, spacing: 390, gap: 180, maxGapShift: 150, firstPipeOffset: 760, pipes: 25, lives: 3, invincibleMs: 1500, minIntervalMs: 100, ...STANDARD, itemChance: 0.12, heartShare: 0.25 },
};

export const DIFFICULTY_LABEL: Record<FlappyDifficulty, string> = { 'super-easy': 'Siêu dễ', easy: 'Dễ', normal: 'Vừa', hard: 'Khó' };

/** Số nốt kế tiếp mặc định (hiện ở khu hướng dẫn). */
export const UPCOMING = 3;

export type PowerUpKind = 'bolt' | 'heart' | 'ghost';
export const ITEM_RADIUS = 24;
/** Tia sét: tốc độ cuộn gấp mấy lần, qua bao nhiêu ống, bất tử thêm bao lâu sau khi hết. */
export const BOOST_SPEED = 3;
export const BOOST_PIPES = 5;
export const BOOST_GRACE_MS = 1200;
/** Con ma: xoá ống trong chừng này thời gian tới (ms). */
export const GHOST_MS = 5000;
export const HEART_BONUS = 50;
/** Vật phẩm chỉ có từ khoảng trước ống thứ mấy; hai vật phẩm cách nhau ít nhất mấy ống. */
const ITEM_FIRST_PIPE = 3;
const ITEM_MIN_GAP = 3;
/** Tốc độ dọc tối đa lúc tự lái (px/s); nhịp đổi hệ số tốc độ (/s) lúc tăng / giảm. */
const AUTOPILOT_VY = 1000;
const SPEED_RAMP_UP = 8;
const SPEED_RAMP_DOWN = 4;

export interface PowerUp {
  id: number;
  kind: PowerUpKind;
  x: number;
  y: number;
}

/**
 * Hệ số vận tốc nâng theo trường độ: độ cao ∝ vận tốc² → nốt đen ×1, trắng ≈ ×1,5, tròn ≈ ×2,5 độ cao; móc đơn ≈ ×0,75.
 * Không có trường độ → ×1.
 */
export function liftScale(duration: Duration | undefined): number {
  return duration ? Math.sqrt(0.5 + DURATION_BEATS[duration] / 2) : 1;
}

export interface Pipe {
  id: number;
  x: number;
  /** Tâm khe (y). */
  gapY: number;
  gap: number;
  passed: boolean;
  /** Đồng hồ trò chơi lúc con ma xoá ống (không va chạm nữa, màn hình cho mờ dần). */
  vanishAt?: number;
}

/** Trạng thái thế giới — thay đổi mỗi khung hình, màn hình đọc trực tiếp để vẽ (không qua React). */
export interface FlappyWorld {
  birdY: number;
  /** Vận tốc dọc (dương = rơi). */
  birdVy: number;
  pipes: Pipe[];
  /** Quãng đường đã cuộn (px) — cho mây, đồi, mặt đất. */
  distance: number;
  /** Đồng hồ trò chơi (ms, không tính lúc tạm dừng). */
  clock: number;
  /** Thời điểm (đồng hồ trò chơi) của lần vỗ cánh / va chạm gần nhất. */
  flapAt: number;
  crashAt: number;
  invincibleUntil: number;
  items: PowerUp[];
  /** Số ống tia sét còn tự bay qua (0 = không tăng tốc). */
  boostLeft: number;
  /** Hệ số tốc độ cuộn hiện tại (1 = thường; tăng / giảm dần khi tia sét bắt đầu / hết). */
  speedFactor: number;
  /** Hết hiệu lực con ma (đồng hồ trò chơi). */
  ghostUntil: number;
}

export interface NoteStat {
  midi: number;
  /** Số lần làm nốt mục tiêu. */
  shown: number;
  hits: number;
  wrongs: number;
  /** Tổng thời gian từ lúc nốt thành mục tiêu tới lúc đánh đúng (ms). */
  reactionMs: number;
  /** Nốt đánh nhầm → số lần. */
  confusedWith: Record<number, number>;
}

export interface FlappyState {
  readonly status: FlappyStatus;
  readonly target: FlappyNote;
  readonly upcoming: readonly FlappyNote[];
  readonly score: number;
  readonly pipesPassed: number;
  readonly lives: number;
  readonly crashes: number;
  readonly hits: number;
  readonly wrongs: number;
  readonly combo: number;
  readonly bestCombo: number;
  readonly lastOutcome: 'hit' | 'wrong' | 'crash' | null;
  /** Vật phẩm nhặt gần nhất (`bonus`: trái tim lúc đủ mạng → đổi thành điểm); `at` = performance.now(). */
  readonly lastPowerUp: { readonly kind: PowerUpKind; readonly at: number; readonly bonus: boolean } | null;
  readonly powerUps: number;
  readonly lastMidi: number | null;
  /** performance.now() của sự kiện gần nhất (đánh nốt / va chạm). */
  readonly lastEventTime: number;
  readonly stats: Readonly<Record<number, NoteStat>>;
}

export const PIPE_POINTS = 100;
export const NOTE_POINTS = 10;
export const COMBO_POINTS = 5;
const MAX_COMBO_BONUS = 10;
export const LIFE_BONUS = 200;

/** Sao: về đích = 1; + chính xác ≥ 80% = 2; + không va chạm và chính xác ≥ 90% = 3. Thua = 0. */
export function flappyStars(r: { won: boolean; accuracy: number; crashes: number }): 0 | 1 | 2 | 3 {
  if (!r.won) return 0;
  if (r.crashes === 0 && r.accuracy >= 0.9) return 3;
  return r.accuracy >= 0.8 ? 2 : 1;
}

export class FlappyNoteGame {
  readonly config: FlappyConfig;
  readonly mode: FlappyMode;
  private state: FlappyState;
  private readonly world: FlappyWorld;
  private readonly listeners = new Set<(s: FlappyState) => void>();
  private readonly pool: readonly FlappyNote[];
  /** Nốt hiện tại + các nốt kế tiếp đã định. */
  private queue: FlappyNote[] = [];
  private seqIndex = 0;
  private nextPipeId = 0;
  private nextItemId = 0;
  /** Chỉ số ống (thứ tự sinh) có vật phẩm ngay trước nó gần nhất. */
  private lastItemPipe = -Infinity;
  private spawned = 0;
  private lastNow: number | null = null;
  private lastAdvance = -Infinity;
  /** Đồng hồ trò chơi lúc nốt hiện tại thành mục tiêu. */
  private targetSince = 0;

  /**
   * `notes`: chế độ `random` → tập nốt bốc ngẫu nhiên (không lặp liền nhau); `sequence` → chuỗi đi lần lượt, hết thì vòng lại.
   */
  constructor(
    notes: readonly FlappyNote[],
    opts: { mode?: FlappyMode; config?: Partial<FlappyConfig>; difficulty?: FlappyDifficulty } = {},
    private readonly random: Random = Math.random,
  ) {
    this.mode = opts.mode ?? 'random';
    this.pool = this.mode === 'random' ? [...new Map(notes.map((n) => [n.midi, n])).values()] : [...notes];
    if (this.pool.length < (this.mode === 'random' ? 2 : 1)) throw new Error('Trò chơi cần ít nhất hai nốt');
    this.config = { ...DIFFICULTY_CONFIG[opts.difficulty ?? 'normal'], ...opts.config };
    this.world = {
      birdY: WORLD_HEIGHT * 0.42,
      birdVy: 0,
      pipes: [],
      distance: 0,
      clock: 0,
      flapAt: -Infinity,
      crashAt: -Infinity,
      invincibleUntil: -Infinity,
      items: [],
      boostLeft: 0,
      speedFactor: 1,
      ghostUntil: -Infinity,
    };
    while (this.queue.length < this.config.upcoming + 1) this.queue.push(this.draw());
    this.spawnPipes();
    const target = this.queue[0];
    this.state = {
      status: 'ready',
      target,
      upcoming: this.queue.slice(1),
      score: 0,
      pipesPassed: 0,
      lives: this.config.lives,
      crashes: 0,
      hits: 0,
      wrongs: 0,
      combo: 0,
      bestCombo: 0,
      lastOutcome: null,
      lastPowerUp: null,
      powerUps: 0,
      lastMidi: null,
      lastEventTime: 0,
      stats: { [target.midi]: emptyStat(target.midi, 1) },
    };
  }

  private draw(): FlappyNote {
    const { durations } = this.config;
    if (this.mode === 'sequence') {
      const n = this.pool[this.seqIndex % this.pool.length];
      this.seqIndex++;
      // Giữ trường độ của giai điệu khi chơi có trường độ, bỏ đi khi không.
      return durations.length > 0 ? { ...n, duration: n.duration ?? 'q' } : { ...n, duration: undefined };
    }
    const prev = this.queue[this.queue.length - 1];
    for (;;) {
      const n = this.pool[Math.floor(this.random() * this.pool.length)];
      if (n.midi === prev?.midi) continue;
      return { ...n, duration: durations.length > 0 ? durations[Math.floor(this.random() * durations.length)] : undefined };
    }
  }

  /** Sinh ống tới khi đủ xa phía trước (tối đa `pipes` ống). */
  private spawnPipes(): void {
    const { pipes, spacing, gap, maxGapShift, firstPipeOffset } = this.config;
    const lo = GAP_MARGIN + gap / 2;
    const hi = GROUND_Y - GAP_MARGIN - gap / 2;
    while (this.spawned < pipes) {
      const last = this.world.pipes[this.world.pipes.length - 1];
      const x = last ? last.x + spacing : BIRD_X + firstPipeOffset;
      if (x > BIRD_X + 2600) break;
      const base = last ? last.gapY : (lo + hi) / 2;
      const gapY = Math.min(hi, Math.max(lo, base + (this.random() * 2 - 1) * maxGapShift));
      this.world.pipes.push({ id: this.nextPipeId++, x, gapY, gap, passed: false });
      if (last) this.maybeSpawnItem(last, x, gapY);
      this.spawned++;
    }
  }

  /** Vật phẩm ở giữa ống trước và ống vừa sinh (chỉ số `spawned`), độ cao trung bình hai khe → luôn bay tới được. */
  private maybeSpawnItem(prev: Pipe, x: number, gapY: number): void {
    const { itemChance, heartShare } = this.config;
    const i = this.spawned;
    if (itemChance <= 0 || i < ITEM_FIRST_PIPE || i - this.lastItemPipe < ITEM_MIN_GAP) return;
    if (this.random() >= itemChance) return;
    const r = this.random();
    const kind: PowerUpKind = r < heartShare ? 'heart' : r < heartShare + (1 - heartShare) / 2 ? 'bolt' : 'ghost';
    this.lastItemPipe = i;
    this.world.items.push({ id: this.nextItemId++, kind, x: (prev.x + PIPE_WIDTH + x) / 2, y: (prev.gapY + gapY) / 2 });
  }

  /** Đang tăng tốc (tia sét). */
  get boosting(): boolean {
    return this.world.boostLeft > 0;
  }

  /** Còn bao lâu hết con ma (ms, 0 = không có). */
  get ghostLeftMs(): number {
    return Math.max(0, this.world.ghostUntil - this.world.clock);
  }

  getState(): FlappyState {
    return this.state;
  }

  getWorld(): Readonly<FlappyWorld> {
    return this.world;
  }

  subscribe(listener: (s: FlappyState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<FlappyState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  get accuracy(): number {
    const total = this.state.hits + this.state.wrongs;
    return total === 0 ? 0 : this.state.hits / total;
  }

  get stars(): 0 | 1 | 2 | 3 {
    return flappyStars({ won: this.state.status === 'won', accuracy: this.accuracy, crashes: this.state.crashes });
  }

  /** Vị trí đích (x của ống cuối + bề ngang ống) — chỉ có khi đã sinh đủ ống. */
  get finishX(): number | null {
    if (this.spawned < this.config.pipes) return null;
    const last = this.world.pipes[this.world.pipes.length - 1];
    return last ? last.x + PIPE_WIDTH + 140 : null;
  }

  answer(midi: number, now: number): 'hit' | 'wrong' | 'ignored' {
    if (this.state.status !== 'ready' && this.state.status !== 'playing') return 'ignored';
    if (now - this.lastAdvance < this.config.minIntervalMs) return 'ignored';
    // Mô phỏng tới thời điểm sự kiện để lực nâng tính đúng lúc (có thể vừa va chạm / về đích).
    this.tick(now);
    const s = this.state;
    if (s.status !== 'ready' && s.status !== 'playing') return 'ignored';
    const base = { lastMidi: midi, lastEventTime: now };
    const target = s.target;
    const stat = { ...(s.stats[target.midi] ?? emptyStat(target.midi, 1)) };
    if (midi !== target.midi) {
      stat.wrongs++;
      stat.confusedWith = { ...stat.confusedWith, [midi]: (stat.confusedWith[midi] ?? 0) + 1 };
      this.setState({ ...base, wrongs: s.wrongs + 1, combo: 0, lastOutcome: 'wrong', stats: { ...s.stats, [target.midi]: stat } });
      return 'wrong';
    }
    this.lastAdvance = now;
    // Nốt đúng đầu tiên: chim cất cánh, ống bắt đầu chạy.
    if (s.status === 'ready') this.lastNow = now;
    const w = this.world;
    stat.hits++;
    stat.reactionMs += Math.max(0, w.clock - this.targetSince);
    // Tia sét: chim đang tự lái → nốt đúng chỉ tính điểm (gấp đôi), không nâng.
    const boosting = this.boosting;
    if (!boosting) w.birdVy = -this.config.flapVelocity * liftScale(target.duration);
    w.flapAt = w.clock;
    this.queue.shift();
    this.queue.push(this.draw());
    const next = this.queue[0];
    this.targetSince = w.clock;
    const stats = { ...s.stats, [target.midi]: stat };
    const nextStat = stats[next.midi] ?? emptyStat(next.midi, 0);
    stats[next.midi] = { ...nextStat, shown: nextStat.shown + 1 };
    const combo = s.combo + 1;
    this.setState({
      ...base,
      status: 'playing',
      hits: s.hits + 1,
      combo,
      bestCombo: Math.max(s.bestCombo, combo),
      score: s.score + (NOTE_POINTS + COMBO_POINTS * Math.min(s.combo, MAX_COMBO_BONUS)) * (boosting ? 2 : 1),
      lastOutcome: 'hit',
      target: next,
      upcoming: this.queue.slice(1),
      stats,
    });
    return 'hit';
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

  /** Gọi mỗi khung hình. */
  tick(now: number): void {
    if (this.state.status !== 'playing') {
      this.lastNow = now;
      return;
    }
    // Sự kiện micro mang thời điểm hơi sớm hơn khung vừa vẽ → không lùi đồng hồ (tránh mô phỏng lặp).
    if (this.lastNow !== null && now < this.lastNow) return;
    const from = this.lastNow ?? now;
    this.lastNow = now;
    let left = Math.min(MAX_FRAME_MS, Math.max(0, now - from));
    while (left > 0 && this.state.status === 'playing') {
      const dt = Math.min(STEP_MS, left);
      left -= dt;
      this.step(dt, now);
    }
  }

  private step(dtMs: number, now: number): void {
    const c = this.config;
    const w = this.world;
    const dt = dtMs / 1000;
    w.clock += dtMs;
    const factor = w.boostLeft > 0 ? BOOST_SPEED : 1;
    w.speedFactor = factor > w.speedFactor ? Math.min(factor, w.speedFactor + SPEED_RAMP_UP * dt) : Math.max(factor, w.speedFactor - SPEED_RAMP_DOWN * dt);
    if (w.boostLeft > 0) {
      // Tự lái: lướt về tâm khe của ống sắp tới, không trọng lực.
      const next = w.pipes.find((p) => !p.passed);
      const goal = next ? next.gapY : WORLD_HEIGHT * 0.42;
      const dy = Math.max(-AUTOPILOT_VY * dt, Math.min(AUTOPILOT_VY * dt, goal - w.birdY));
      w.birdY += dy;
      w.birdVy = dy / dt;
    } else {
      w.birdVy = Math.min(c.maxFallSpeed, w.birdVy + c.gravity * dt);
      w.birdY += w.birdVy * dt;
    }
    if (w.birdY < BIRD_RADIUS) {
      w.birdY = BIRD_RADIUS;
      w.birdVy = Math.max(0, w.birdVy);
    }
    const speed = c.speed * w.speedFactor;
    const dx = speed * dt;
    w.distance += dx;
    for (const p of w.pipes) p.x -= dx;
    for (const it of w.items) it.x -= dx;

    let passed = 0;
    for (const p of w.pipes) {
      if (!p.passed && p.x + PIPE_WIDTH < BIRD_X - HIT_RADIUS) {
        p.passed = true;
        passed++;
      }
    }
    if (passed > 0) {
      const pipesPassed = this.state.pipesPassed + passed;
      this.setState({ pipesPassed, score: this.state.score + passed * PIPE_POINTS });
      if (w.boostLeft > 0) {
        w.boostLeft = Math.max(0, w.boostLeft - passed);
        // Hết tia sét: chậm dần (speedFactor), bất tử thêm một chút để kịp đánh nốt; chim thôi lướt, bắt đầu rơi.
        if (w.boostLeft === 0) {
          w.invincibleUntil = Math.max(w.invincibleUntil, w.clock + BOOST_GRACE_MS);
          w.birdVy = 0;
        }
      }
      if (pipesPassed >= c.pipes) {
        this.setState({ status: 'won', score: this.state.score + this.state.lives * LIFE_BONUS });
        return;
      }
    }
    w.pipes = w.pipes.filter((p) => p.x > -PIPE_WIDTH - 400);
    w.items = w.items.filter((it) => it.x > -400);
    this.spawnPipes();
    this.pickItems(now);
    // Con ma: ống nào tới chỗ chim trước khi hết hiệu lực thì biến mất (vẫn đếm "đã qua" như thường ở trên).
    if (w.clock < w.ghostUntil) {
      const reach = BIRD_X + HIT_RADIUS + (speed * (w.ghostUntil - w.clock)) / 1000;
      for (const p of w.pipes) if (!p.passed && p.vanishAt === undefined && p.x <= reach) p.vanishAt = w.clock;
    }

    const invincible = w.clock < w.invincibleUntil || w.boostLeft > 0;
    const onGround = w.birdY + HIT_RADIUS >= GROUND_Y;
    if (onGround) {
      // Không để chim chui xuống đất; lúc bất tử thì nảy lên.
      w.birdY = GROUND_Y - HIT_RADIUS;
      if (invincible) w.birdVy = -c.flapVelocity * 0.8;
    }
    if (invincible) return;
    if (onGround || this.hitsPipe()) this.crash(now);
  }

  private hitsPipe(): boolean {
    const y = this.world.birdY;
    // Hình tròn ↔ hai hình chữ nhật (ống trên, ống dưới).
    return this.world.pipes.some((p) => p.vanishAt === undefined && (circleHitsRect(BIRD_X, y, p.x, p.x + PIPE_WIDTH, -Infinity, p.gapY - p.gap / 2) || circleHitsRect(BIRD_X, y, p.x, p.x + PIPE_WIDTH, p.gapY + p.gap / 2, Infinity)));
  }

  private pickItems(now: number): void {
    const w = this.world;
    const reach = (HIT_RADIUS + ITEM_RADIUS) ** 2;
    const taken = w.items.filter((it) => (it.x - BIRD_X) ** 2 + (it.y - w.birdY) ** 2 <= reach);
    if (taken.length === 0) return;
    w.items = w.items.filter((it) => !taken.includes(it));
    for (const it of taken) {
      const s = this.state;
      let bonus = false;
      if (it.kind === 'heart') {
        bonus = s.lives >= this.config.lives;
        this.setState(bonus ? { score: s.score + HEART_BONUS } : { lives: s.lives + 1 });
      } else if (it.kind === 'bolt') {
        w.boostLeft = Math.max(w.boostLeft, Math.min(BOOST_PIPES, this.config.pipes - s.pipesPassed));
      } else {
        w.ghostUntil = w.clock + GHOST_MS;
      }
      this.setState({ lastPowerUp: { kind: it.kind, at: now, bonus }, powerUps: this.state.powerUps + 1 });
    }
  }

  private crash(now: number): void {
    const w = this.world;
    const lives = this.state.lives - 1;
    w.crashAt = w.clock;
    w.invincibleUntil = w.clock + this.config.invincibleMs;
    w.birdVy = -this.config.flapVelocity * 0.8;
    this.setState({ lives, crashes: this.state.crashes + 1, combo: 0, lastOutcome: 'crash', lastEventTime: now, status: lives <= 0 ? 'over' : 'playing' });
  }
}

function circleHitsRect(cx: number, cy: number, x0: number, x1: number, y0: number, y1: number): boolean {
  const dx = Math.max(x0, Math.min(cx, x1)) - cx;
  const dy = Math.max(y0, Math.min(cy, y1)) - cy;
  return dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS;
}

function emptyStat(midi: number, shown: number): NoteStat {
  return { midi, shown, hits: 0, wrongs: 0, reactionMs: 0, confusedWith: {} };
}

export interface FlappySummary {
  score: number;
  stars: 0 | 1 | 2 | 3;
  won: boolean;
  pipesPassed: number;
  pipes: number;
  hits: number;
  wrongs: number;
  accuracy: number;
  bestCombo: number;
  crashes: number;
  /** Trung bình thời gian đọc nốt → đánh đúng (ms); null khi chưa đánh đúng nốt nào. */
  avgReactionMs: number | null;
  /** Nốt yếu (sai nhiều / chậm), tối đa 3. */
  weakNotes: number[];
}

export function summarize(game: FlappyNoteGame): FlappySummary {
  const s = game.getState();
  const stats = Object.values(s.stats);
  const reaction = stats.reduce((a, n) => a + n.reactionMs, 0);
  const hitsWithReaction = stats.reduce((a, n) => a + n.hits, 0);
  const avg = (n: NoteStat) => (n.hits > 0 ? n.reactionMs / n.hits : Infinity);
  const weakNotes = stats
    .filter((n) => n.wrongs > 0)
    .sort((a, b) => b.wrongs - a.wrongs || avg(b) - avg(a) || 0)
    .slice(0, 3)
    .map((n) => n.midi);
  return {
    score: s.score,
    stars: game.stars,
    won: s.status === 'won',
    pipesPassed: s.pipesPassed,
    pipes: game.config.pipes,
    hits: s.hits,
    wrongs: s.wrongs,
    accuracy: game.accuracy,
    bestCombo: s.bestCombo,
    crashes: s.crashes,
    avgReactionMs: hitsWithReaction > 0 ? reaction / hitsWithReaction : null,
    weakNotes,
  };
}
