/**
 * VoiceTeacher — hàng đợi lời nói của cô giáo (thuần, nguồn phát truyền vào).
 *
 * Quy tắc:
 *  - Không đọc chồng: tại một thời điểm chỉ một câu. Câu mới ưu tiên ≥ câu đang đọc → ngắt câu cũ;
 *    thấp hơn → chờ (chỉ giữ MỘT câu chờ, câu mới hơn / ưu tiên cao hơn thay thế), câu chờ quá lâu bị bỏ.
 *  - Cooldown theo id: cùng câu không lặp lại trong `cooldownMs`.
 *  - Đang phát tiếng đàn mẫu (`quietUntil`) → không nói, đợi phát xong mới nói (bé cần tập trung nghe).
 *  - `cancelAll()` khi đổi bài / rời màn: huỷ câu đang đọc, câu chờ và hẹn giờ.
 *  - Tắt giọng nói: vẫn cập nhật chữ (bong bóng lời thoại) nhưng không phát.
 *  - `blocksMic(t)`: micro nghe thấy loa → màn học bỏ nốt micro trong lúc cô đang nói (MIDI không bị ảnh hưởng).
 */
import { DEFAULT_COOLDOWN_MS, DEFAULT_PRIORITY, type SpeechHandle, type Speaker, type VoiceCue } from './types';

/** Câu chờ (ưu tiên thấp) quá khoảng này thì không còn đúng lúc → bỏ. */
export const PENDING_MAX_AGE_MS = 4000;
/** Bỏ nốt micro thêm chừng này sau khi cô nói xong (âm vang của loa). */
export const MIC_GUARD_MS = 350;

export interface VoiceTeacherConfig {
  enabled: boolean;
  /** Tốc độ đọc (1 = bình thường; mặc định 0.85 cho bé). */
  rate: number;
}

export interface VoiceTeacherState {
  enabled: boolean;
  rate: number;
  /** Đang phát tiếng (TTS hoặc file). */
  speaking: boolean;
  /** Chữ của câu gần nhất (hiện trong bong bóng). */
  caption: string | null;
  /** Câu gần nhất (nút "Nghe lại"). */
  lastCue: VoiceCue | null;
  /** Câu gần nhất không phát được thành tiếng (không có giọng tiếng Việt / file lỗi) — UI báo chỉ hiện chữ. */
  silent: boolean;
  /** Đã có thao tác người dùng để mở khoá âm thanh (Safari). */
  unlocked: boolean;
}

interface Entry {
  cue: VoiceCue;
  at: number;
}

export interface VoiceTeacherDeps {
  speaker: Speaker;
  now?: () => number;
  /** performance.now() mà trước đó app còn đang phát tiếng đàn mẫu. */
  quietUntil?: () => number;
}

export const priorityOf = (c: VoiceCue) => c.priority ?? DEFAULT_PRIORITY[c.trigger];
const idOf = (c: VoiceCue) => c.id ?? c.trigger;

export class VoiceTeacher {
  private state: VoiceTeacherState;
  private readonly listeners = new Set<(s: VoiceTeacherState) => void>();
  private current: { entry: Entry; handle: SpeechHandle | null } | null = null;
  private pending: Entry | null = null;
  private quietTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSpoken = new Map<string, number>();
  private lastEndedAt = -Infinity;
  private readonly now: () => number;
  private readonly quietUntil: () => number;

  constructor(
    private readonly deps: VoiceTeacherDeps,
    config: VoiceTeacherConfig = { enabled: true, rate: 0.85 },
  ) {
    this.now = deps.now ?? (() => performance.now());
    this.quietUntil = deps.quietUntil ?? (() => 0);
    this.state = { ...config, speaking: false, caption: null, lastCue: null, silent: false, unlocked: false };
  }

  getState(): VoiceTeacherState {
    return this.state;
  }

  subscribe(listener: (s: VoiceTeacherState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<VoiceTeacherState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  setConfig(config: Partial<VoiceTeacherConfig>): void {
    if (config.enabled === false && this.state.enabled) this.interrupt();
    this.setState(config);
  }

  /** Gọi trong thao tác người dùng (chạm / bấm phím). */
  unlock(): void {
    if (this.state.unlocked) return;
    this.deps.speaker.unlock();
    this.setState({ unlocked: true });
  }

  /** Yêu cầu đọc một câu. Trả về false nếu bị bỏ (cooldown / ưu tiên thấp hơn câu chờ). */
  say(cue: VoiceCue): boolean {
    const now = this.now();
    const last = this.lastSpoken.get(idOf(cue));
    const cooldown = cue.cooldownMs ?? DEFAULT_COOLDOWN_MS[cue.trigger];
    if (last !== undefined && cooldown > 0 && now - last < cooldown) return false;
    const entry = { cue, at: now };
    if (this.current && priorityOf(cue) < priorityOf(this.current.entry.cue)) {
      if (this.pending && priorityOf(this.pending.cue) > priorityOf(cue)) return false;
      this.pending = entry;
      return true;
    }
    this.pending = null;
    this.start(entry);
    return true;
  }

  /** Đọc lại câu gần nhất (nút "Nghe lại") — bỏ qua cooldown và tiếng đàn mẫu đang phát. */
  replay(): void {
    const cue = this.state.lastCue;
    if (!cue) return;
    this.pending = null;
    this.start({ cue, at: this.now() }, true);
  }

  /** Ngắt câu đang đọc + câu chờ, giữ chữ trên màn hình (vd bé bấm "Nghe mẫu"). */
  interrupt(): void {
    this.pending = null;
    this.clearQuietTimer();
    this.stopCurrent();
  }

  /** Đổi bài / rời màn: huỷ mọi thứ, xoá bong bóng. */
  cancelAll(): void {
    this.interrupt();
    this.lastSpoken.clear();
    this.setState({ caption: null, lastCue: null, silent: false });
  }

  /** Nốt micro ở thời điểm `time` có thể là tiếng cô giáo qua loa. */
  blocksMic(time: number): boolean {
    if (this.current?.handle) return true;
    return time < this.lastEndedAt + MIC_GUARD_MS;
  }

  private stopCurrent(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    cur.handle?.cancel();
    if (cur.handle) this.lastEndedAt = this.now();
    if (this.state.speaking) this.setState({ speaking: false });
  }

  private clearQuietTimer(): void {
    if (this.quietTimer !== null) clearTimeout(this.quietTimer);
    this.quietTimer = null;
  }

  private start(entry: Entry, force = false): void {
    this.stopCurrent();
    this.clearQuietTimer();
    const { cue } = entry;
    const caption = cue.instructionText;
    if (!this.state.enabled) {
      this.setState({ caption, lastCue: cue, silent: false });
      return;
    }
    const now = this.now();
    const quiet = this.quietUntil();
    if (!force && now < quiet) {
      // Đợi tiếng đàn mẫu dứt rồi mới nói.
      this.pending = entry;
      this.quietTimer = setTimeout(() => {
        this.quietTimer = null;
        this.flush();
      }, quiet - now + 150);
      return;
    }
    this.lastSpoken.set(idOf(cue), now);
    const handle = this.deps.speaker.speak({ text: cue.voiceText ?? cue.instructionText, audioAsset: cue.audioAsset }, this.state.rate);
    const current = { entry, handle };
    this.current = handle ? current : null;
    this.setState({ caption, lastCue: cue, speaking: !!handle, silent: !handle });
    if (!handle) {
      this.flush();
      return;
    }
    void handle.done.then(() => {
      if (this.current !== current) return;
      this.current = null;
      this.lastEndedAt = this.now();
      this.setState({ speaking: false });
      this.flush();
    });
  }

  private flush(): void {
    const p = this.pending;
    if (!p || this.current) return;
    this.pending = null;
    // Câu ưu tiên thấp chờ quá lâu thì không còn đúng lúc (bé đã sang nốt khác).
    if (priorityOf(p.cue) < 3 && this.now() - p.at > PENDING_MAX_AGE_MS) return;
    this.start(p);
  }
}
