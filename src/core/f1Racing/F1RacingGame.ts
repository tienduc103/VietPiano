/**
 * Máy trạng thái thuần của VietPiano F1 Racing: thời gian truyền vào `tick(now)`, không phụ thuộc DOM hay FPS
 * (bước vật lý cố định, nên quãng đường và thời gian về đích như nhau ở mọi tốc độ khung hình).
 * Trạng thái cho React (`getState`) chỉ đổi khi có gì đáng hiện; canvas đọc `getWorld()` mỗi khung.
 */
import {
  ASSIST_MS,
  COUNTDOWN_MS,
  DEFAULT_NAV,
  DIFFICULTIES,
  IMMUNITY_MS,
  LANE_CHANGE_SEC,
  LANE_COUNT,
  SPEED_STEP,
  STREAK_FOR_ASSIST,
  practiceNotes,
  resolveNavKeys,
  type DifficultyConfig,
  type F1Difficulty,
  type NavKeys,
} from './config';
import { generateObstacles, overlaps, safestLane, type Obstacle, type ObstacleKind } from './track';

export type F1Status = 'ready' | 'countdown' | 'racing' | 'paused' | 'finished';
export type NoteResult = 'ignored' | 'nav' | 'correct' | 'wrong';

export type F1Event =
  | { type: 'countdown'; left: number }
  | { type: 'go' }
  | { type: 'correct'; midi: number }
  | { type: 'wrong'; midi: number }
  | { type: 'speed-up' }
  | { type: 'speed-down' }
  | { type: 'lane'; lane: number }
  | { type: 'crash'; kind: ObstacleKind; lane: number }
  | { type: 'assist-on' }
  | { type: 'assist-off' }
  | { type: 'finish' };

export interface F1State {
  status: F1Status;
  /** Tốc độ danh nghĩa 0–100, đổi đúng từng 10 điểm. */
  speedPercent: number;
  /** Quãng đường đã đi (m, làm tròn xuống, không vượt tổng). */
  distanceM: number;
  /** Thời gian đua (ms, làm tròn 100 ms; về đích thì là giá trị chính xác). */
  timeMs: number;
  /** Nốt cần đánh. */
  target: number;
  targetIndex: number;
  /** Làn đang hướng tới. */
  lane: number;
  correct: number;
  wrong: number;
  collisions: number;
  /** Chuỗi đúng liên tiếp (tính cả lúc đang được hỗ trợ). */
  streak: number;
  bestStreak: number;
  /** Tiến độ tới lần hỗ trợ kế (0–9). */
  assistProgress: number;
  assistActive: boolean;
  /** Thời gian hỗ trợ còn lại (ms, làm tròn lên 100 ms). */
  assistLeftMs: number;
  assistCount: number;
  /** Số giây đếm ngược còn lại (3, 2, 1). */
  countdown: number;
  lastOutcome: 'hit' | 'wrong' | null;
  lastMidi: number | null;
  /** Số lần đánh nốt được chấm (đổi → phản hồi trên UI). */
  noteSeq: number;
  nav: NavKeys;
}

/** Dữ liệu vẽ mỗi khung; canvas chỉ đọc. */
export interface F1World {
  /** Quãng đường chính xác, dừng ở vạch đích. */
  distance: number;
  /** Quãng đường để cuộn hình: chạy tiếp một đoạn sau vạch đích. */
  scroll: number;
  /** Vị trí ngang theo làn (số thực). */
  laneX: number;
  /** Tốc độ thật hiện tại (0–100), tiến dần tới `speedPercent`. */
  speed: number;
  /** Đồng hồ trò chơi (ms); dừng lúc tạm dừng. */
  clock: number;
  immuneUntil: number;
  obstacles: readonly Obstacle[];
}

/** Bước vật lý: 120 Hz đủ để không xuyên qua chướng ngại ở mọi tốc độ. */
const STEP_MS = 1000 / 120;
/** Khung bị trễ lâu (tab bị hãm) không làm xe nhảy cóc quá chừng này. */
const MAX_FRAME_MS = 250;
/** Tốc độ thật tiến tới tốc độ danh nghĩa (điểm % mỗi giây). */
const SPEED_EASE_PER_SEC = 150;
/** Micro không có Note Off: âm ngân lặp lại đúng nốt vừa đánh trong chừng này thì bỏ. */
const MIC_REPEAT_GUARD_MS = 300;
/** Sau vạch đích xe trôi chậm dần. */
const FINISH_COAST_PER_SEC = 60;

export interface F1Options {
  difficulty: F1Difficulty;
  nav?: NavKeys;
  rng?: () => number;
  /** Bỏ qua bộ sinh, dùng chướng ngại soạn sẵn (test). */
  obstacles?: Obstacle[];
  /** Bỏ qua bộ sinh nốt, dùng dãy nốt lặp lại (test). */
  notes?: number[];
}

export class F1RacingGame {
  readonly difficulty: F1Difficulty;
  readonly config: DifficultyConfig;
  private readonly rng: () => number;
  private readonly noteSource: readonly number[] | null;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(e: F1Event) => void>();
  private readonly held = new Set<number>();
  private readonly hitIds = new Set<number>();
  private readonly obstacles: Obstacle[];
  private bag: number[] = [];
  private lastFrame: number | null = null;
  private accumulator = 0;
  private resumeTo: 'countdown' | 'racing' = 'racing';
  private countdownMs = COUNTDOWN_MS;
  private assistMs = 0;
  private lastCorrectMidi: number | null = null;
  private lastCorrectClock = -Infinity;
  private exactTimeMs = 0;
  private state: F1State;
  private world: F1World;

  constructor(options: F1Options) {
    this.difficulty = options.difficulty;
    this.config = DIFFICULTIES[options.difficulty];
    this.rng = options.rng ?? Math.random;
    this.noteSource = options.notes ?? null;
    this.obstacles = options.obstacles ?? generateObstacles(options.difficulty, this.rng);
    const target = this.drawNote(null, 0);
    const { left, right } = resolveNavKeys(options.nav ?? DEFAULT_NAV, options.difficulty);
    this.state = {
      status: 'ready',
      speedPercent: 100,
      distanceM: 0,
      timeMs: 0,
      target,
      targetIndex: 0,
      lane: 1,
      correct: 0,
      wrong: 0,
      collisions: 0,
      streak: 0,
      bestStreak: 0,
      assistProgress: 0,
      assistActive: false,
      assistLeftMs: 0,
      assistCount: 0,
      countdown: Math.ceil(COUNTDOWN_MS / 1000),
      lastOutcome: null,
      lastMidi: null,
      noteSeq: 0,
      nav: { left, right },
    };
    this.world = { distance: 0, scroll: 0, laneX: 1, speed: 100, clock: 0, immuneUntil: -Infinity, obstacles: this.obstacles };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Sự kiện rời rạc cho âm thanh và hiệu ứng. */
  onEvent(listener: (e: F1Event) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  getState(): F1State {
    return this.state;
  }

  getWorld(): F1World {
    return this.world;
  }

  /** Thời gian đua chính xác (ms). */
  get raceTimeMs(): number {
    return this.exactTimeMs;
  }

  start(now: number): void {
    if (this.state.status !== 'ready') return;
    this.lastFrame = now;
    this.accumulator = 0;
    this.set({ status: 'countdown', countdown: Math.ceil(COUNTDOWN_MS / 1000) });
    this.emit({ type: 'countdown', left: this.state.countdown });
  }

  pause(now: number): void {
    if (this.state.status !== 'racing' && this.state.status !== 'countdown') return;
    this.tick(now);
    if (this.state.status !== 'racing' && this.state.status !== 'countdown') return;
    this.resumeTo = this.state.status;
    this.set({ status: 'paused' });
  }

  resume(now: number): void {
    if (this.state.status !== 'paused') return;
    this.lastFrame = now;
    this.set({ status: this.resumeTo });
  }

  /** Đổi phím điều hướng giữa ván (Cài đặt), vẫn tách khỏi tầm luyện tập. */
  setNavKeys(nav: NavKeys): void {
    const { left, right } = resolveNavKeys(nav, this.difficulty);
    this.set({ nav: { left, right } });
  }

  /**
   * Một lần nhấn phím. `hasRelease`: nguồn có báo thả phím (MIDI, piano ảo) thì giữ phím hoặc đàn gửi lặp Note On
   * không tính lần nữa. Micro không có Note Off nên chỉ chặn âm ngân của nốt vừa đúng.
   */
  noteOn(midi: number, { hasRelease = true }: { hasRelease?: boolean } = {}): NoteResult {
    if (hasRelease) {
      if (this.held.has(midi)) return 'ignored';
      this.held.add(midi);
    }
    if (this.state.status !== 'racing') return 'ignored';
    const { nav } = this.state;
    if (midi === nav.left) {
      this.steer(-1);
      return 'nav';
    }
    if (midi === nav.right) {
      this.steer(1);
      return 'nav';
    }
    if (!hasRelease && midi === this.lastCorrectMidi && this.world.clock - this.lastCorrectClock < MIC_REPEAT_GUARD_MS) return 'ignored';
    return midi === this.state.target ? this.onCorrect(midi) : this.onWrong(midi);
  }

  noteOff(midi: number): void {
    this.held.delete(midi);
  }

  /** Đàn bị ngắt: không còn Note Off nào về nữa, phím đang giữ coi như đã thả. */
  clearHeld(): void {
    this.held.clear();
  }

  /** Rẽ một làn. Đang tự né thì xe do game lái; ở làn ngoài cùng thì giữ nguyên. */
  steer(direction: -1 | 1): boolean {
    if (this.state.status !== 'racing' || this.state.assistActive) return false;
    const lane = this.state.lane + direction;
    if (lane < 0 || lane >= LANE_COUNT) return false;
    this.set({ lane });
    this.emit({ type: 'lane', lane });
    return true;
  }

  tick(now: number): void {
    const { status } = this.state;
    if (status === 'ready' || status === 'paused') {
      this.lastFrame = now;
      return;
    }
    const last = this.lastFrame ?? now;
    this.lastFrame = now;
    this.accumulator += Math.min(MAX_FRAME_MS, Math.max(0, now - last));
    while (this.accumulator >= STEP_MS) {
      this.accumulator -= STEP_MS;
      this.step(STEP_MS);
    }
    this.publish();
  }

  private step(ms: number): void {
    const status = this.state.status;
    if (status === 'countdown') {
      this.countdownMs -= ms;
      if (this.countdownMs <= 0) {
        this.set({ status: 'racing', countdown: 0 });
        this.emit({ type: 'go' });
        return;
      }
      const left = Math.ceil(this.countdownMs / 1000);
      if (left !== this.state.countdown) {
        this.set({ countdown: left });
        this.emit({ type: 'countdown', left });
      }
      return;
    }
    const sec = ms / 1000;
    const w = this.world;
    if (status === 'finished') {
      const speed = Math.max(0, w.speed - FINISH_COAST_PER_SEC * sec);
      this.world = { ...w, speed, scroll: w.scroll + (speed / 100) * this.config.maxSpeedMps * sec, clock: w.clock + ms };
      return;
    }
    if (status !== 'racing') return;

    const clock = w.clock + ms;
    this.exactTimeMs += ms;

    // Tốc độ thật tiến dần tới tốc độ danh nghĩa; 0% là dừng hẳn.
    const delta = this.state.speedPercent - w.speed;
    const ease = SPEED_EASE_PER_SEC * sec;
    const speed = Math.abs(delta) <= ease ? this.state.speedPercent : w.speed + Math.sign(delta) * ease;
    const travelled = w.distance + (speed / 100) * this.config.maxSpeedMps * sec;
    const distance = Math.min(this.config.trackLength, travelled);

    // Tự né: game lái, luôn hướng tới làn an toàn.
    if (this.state.assistActive && Math.abs(w.laneX - this.state.lane) < 1e-6) {
      const safe = safestLane(this.obstacles, distance, this.state.lane);
      if (safe !== this.state.lane) {
        const lane = this.state.lane + Math.sign(safe - this.state.lane);
        this.set({ lane });
        this.emit({ type: 'lane', lane });
      }
    }

    // Chuyển làn: trượt đều, không vượt làn đích.
    const slide = sec / LANE_CHANGE_SEC;
    const laneDelta = this.state.lane - w.laneX;
    const laneX = Math.abs(laneDelta) <= slide ? this.state.lane : w.laneX + Math.sign(laneDelta) * slide;

    this.world = { ...w, clock, speed, distance, scroll: w.scroll + (distance - w.distance), laneX };
    this.checkCollisions();
    this.tickAssist(ms);

    if (travelled >= this.config.trackLength) {
      this.set({ status: 'finished', timeMs: this.exactTimeMs, distanceM: this.config.trackLength });
      this.emit({ type: 'finish' });
    }
  }

  private checkCollisions(): void {
    const w = this.world;
    for (const o of this.obstacles) {
      if (this.hitIds.has(o.id) || !overlaps(o, w.distance, w.laneX)) continue;
      // Mỗi chướng ngại chỉ tính một lần: đang chạm mà được miễn thì cũng coi như đã qua,
      // nếu không xe dừng ở 0% ngay trên chướng ngại sẽ bị trừ lại khi hết miễn.
      this.hitIds.add(o.id);
      if (this.state.assistActive || w.clock < w.immuneUntil) continue;
      this.world = { ...w, immuneUntil: w.clock + IMMUNITY_MS };
      this.set({ collisions: this.state.collisions + 1, speedPercent: Math.max(0, this.state.speedPercent - SPEED_STEP) });
      this.emit({ type: 'crash', kind: o.kind, lane: o.lanes[0] });
      return;
    }
  }

  private tickAssist(ms: number): void {
    if (!this.state.assistActive) return;
    this.assistMs -= ms;
    if (this.assistMs > 1e-6) return;
    this.assistMs = 0;
    this.set({ assistActive: false, assistLeftMs: 0 });
    this.emit({ type: 'assist-off' });
  }

  private onCorrect(midi: number): NoteResult {
    const s = this.state;
    const streak = s.streak + 1;
    const speedPercent = Math.min(100, s.speedPercent + SPEED_STEP);
    // Đang hỗ trợ: không cộng dồn; chuỗi 10 nốt mới chỉ bắt đầu tính sau khi hết 3 giây.
    let assistProgress = s.assistActive ? 0 : s.assistProgress + 1;
    const trigger = assistProgress >= STREAK_FOR_ASSIST;
    if (trigger) {
      assistProgress = 0;
      this.assistMs = ASSIST_MS;
    }
    const targetIndex = s.targetIndex + 1;
    this.lastCorrectMidi = midi;
    this.lastCorrectClock = this.world.clock;
    this.set({
      correct: s.correct + 1,
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      speedPercent,
      target: this.drawNote(s.target, targetIndex),
      targetIndex,
      assistProgress,
      lastOutcome: 'hit',
      lastMidi: midi,
      noteSeq: s.noteSeq + 1,
      ...(trigger ? { assistActive: true, assistLeftMs: ASSIST_MS, assistCount: s.assistCount + 1 } : {}),
    });
    this.emit({ type: 'correct', midi });
    if (speedPercent > s.speedPercent) this.emit({ type: 'speed-up' });
    if (trigger) this.emit({ type: 'assist-on' });
    return 'correct';
  }

  private onWrong(midi: number): NoteResult {
    const s = this.state;
    const speedPercent = Math.max(0, s.speedPercent - SPEED_STEP);
    this.set({ wrong: s.wrong + 1, streak: 0, assistProgress: 0, speedPercent, lastOutcome: 'wrong', lastMidi: midi, noteSeq: s.noteSeq + 1 });
    this.emit({ type: 'wrong', midi });
    if (speedPercent < s.speedPercent) this.emit({ type: 'speed-down' });
    return 'wrong';
  }

  /** Bốc nốt từ túi xáo trộn: đủ mọi nốt trong tầm rồi mới lặp, hai nốt liền nhau luôn khác nhau. */
  private drawNote(previous: number | null, index: number): number {
    if (this.noteSource) return this.noteSource[index % this.noteSource.length];
    if (this.bag.length === 0) {
      this.bag = practiceNotes(this.difficulty);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(this.rng() * (i + 1)));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
      if (this.bag[this.bag.length - 1] === previous) [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
    }
    return this.bag.pop()!;
  }

  /** Đồng bộ các số hiển thị (đổi theo thời gian) rồi báo React nếu có khác biệt. */
  private publish(): void {
    if (this.state.status !== 'racing') return;
    const distanceM = Math.floor(this.world.distance);
    const timeMs = Math.floor(this.exactTimeMs / 100) * 100;
    const assistLeftMs = this.state.assistActive ? Math.ceil(this.assistMs / 100) * 100 : 0;
    if (distanceM !== this.state.distanceM || timeMs !== this.state.timeMs || assistLeftMs !== this.state.assistLeftMs) this.set({ distanceM, timeMs, assistLeftMs });
  }

  private set(patch: Partial<F1State>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private emit(event: F1Event): void {
    this.eventListeners.forEach((l) => l(event));
  }
}

/** Độ chính xác: nốt đúng / tổng nốt đã chấm. Nốt điều hướng không tính; chưa đánh nốt nào → 0. */
export function f1Accuracy(correct: number, wrong: number): number {
  const total = correct + wrong;
  return total === 0 ? 0 : correct / total;
}
