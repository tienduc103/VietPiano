/**
 * SoundOutput — phát tiếng đàn mẫu và tiếng metronome bằng WebAudio tổng hợp (không file âm thanh,
 * chạy offline). AudioContext riêng, tách khỏi micro; chỉ tạo khi người dùng bấm (Safari cần user gesture).
 *
 * Micro nghe thấy cả tiếng loa → trong lúc phát mẫu, màn học bỏ nốt từ micro (`isPlayingUntil`).
 * Tiếng click metronome là tiếng ồn ngắn qua lọc thông cao — không có cao độ rõ nên YIN không nhận thành nốt,
 * nhưng vẫn có thể làm NoteRecognizer thấy onset → mặc định chỉ bật tiếng metronome khi không dùng micro.
 */
import { midiToFrequency } from '../music/notes';

export interface ScheduledNote {
  midi: number;
  /** Giây kể từ lúc bắt đầu phát. */
  start: number;
  duration: number;
  velocity: number;
}

/** Dòng thời gian (nốt đen) → lịch phát (giây) ở nhịp `bpm`. */
export function scheduleNotes(notes: readonly { midiNote: number | null; startBeat: number; durationBeats: number; velocity: number }[], bpm: number): ScheduledNote[] {
  const sec = 60 / bpm;
  return notes
    .filter((n): n is typeof n & { midiNote: number } => n.midiNote !== null)
    .map((n) => ({ midi: n.midiNote, start: n.startBeat * sec, duration: n.durationBeats * sec, velocity: n.velocity }));
}

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null;
}

class SoundOutputImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private active: AudioScheduledSourceNode[] = [];
  private playingUntil = 0;

  isSupported(): boolean {
    return audioContextCtor() !== null;
  }

  /** Tạo / đánh thức AudioContext — gọi trong lúc người dùng bấm (Safari) trước khi lên lịch phát từ vòng khung hình. */
  unlock(): void {
    this.ensure();
  }

  /** performance.now() mà trước đó âm thanh mẫu còn đang phát. */
  get isPlayingUntil(): number {
    return this.playingUntil;
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const C = audioContextCtor();
    if (!C) return null;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Một nốt kiểu piano đơn giản: vài hoạ âm sine, tấn công nhanh, tắt dần. Trả về các nút để huỷ được. */
  private tone(midi: number, at: number, duration: number, velocity: number): { env: GainNode; oscs: OscillatorNode[] } {
    const ctx = this.ctx!;
    const f = midiToFrequency(midi);
    const peak = 0.25 * (velocity / 127);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.008);
    env.gain.exponentialRampToValueAtTime(peak * 0.35, at + Math.min(0.4, duration));
    env.gain.setValueAtTime(peak * 0.35, at + duration);
    env.gain.exponentialRampToValueAtTime(0.0001, at + duration + 0.25);
    env.connect(this.master!);
    const oscs: OscillatorNode[] = [];
    for (const [mult, amp] of [
      [1, 1],
      [2, 0.35],
      [3, 0.12],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(env);
      osc.start(at);
      osc.stop(at + duration + 0.3);
      this.track(osc);
      oscs.push(osc);
    }
    return { env, oscs };
  }

  private track(node: AudioScheduledSourceNode): void {
    this.active.push(node);
    node.onended = () => {
      this.active = this.active.filter((n) => n !== node);
    };
  }

  /** Phát mẫu; trả về thời lượng (ms). */
  playSequence(notes: readonly ScheduledNote[]): number {
    const ctx = this.ensure();
    if (!ctx || notes.length === 0) return 0;
    this.stop();
    const t0 = ctx.currentTime + 0.08;
    for (const n of notes) this.tone(n.midi, t0 + n.start, n.duration * 0.95, n.velocity);
    const endSec = Math.max(...notes.map((n) => n.start + n.duration)) + 0.4;
    this.playingUntil = performance.now() + (endSec + 0.08) * 1000;
    return endSec * 1000;
  }

  playNote(midi: number, durationSec = 0.6): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.tone(midi, ctx.currentTime + 0.01, durationSec, 90);
    this.playingUntil = Math.max(this.playingUntil, performance.now() + (durationSec + 0.4) * 1000);
  }

  /**
   * Lên lịch một nốt sau `delaySec` (trò Săn nốt lên lịch trước ngắn theo đồng hồ bài nhạc).
   * `cancel()`: nốt chưa kêu thì không kêu nữa, đang kêu thì tắt nhanh (không click).
   */
  scheduleNote(midi: number, delaySec: number, durationSec: number, velocity: number): { cancel: () => void } {
    const ctx = this.ensure();
    if (!ctx) return { cancel: () => undefined };
    const { env, oscs } = this.tone(midi, ctx.currentTime + 0.01 + Math.max(0, delaySec), durationSec, velocity);
    this.playingUntil = Math.max(this.playingUntil, performance.now() + (delaySec + durationSec + 0.4) * 1000);
    return {
      cancel: () => {
        const now = ctx.currentTime;
        env.gain.cancelScheduledValues(now);
        env.gain.setTargetAtTime(0, now, 0.01);
        for (const osc of oscs) {
          try {
            osc.stop(now + 0.06);
          } catch {
            // đã dừng
          }
        }
      },
    };
  }

  /** Tiếng click metronome sau `delaySec` (mặc định ngay bây giờ); phách mạnh (đầu ô nhịp) cao hơn. */
  click(accent: boolean, delaySec = 0): { cancel: () => void } {
    const none = { cancel: () => undefined };
    const ctx = this.ensure();
    if (!ctx) return none;
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = accent ? 3000 : 1800;
    const g = ctx.createGain();
    g.gain.value = accent ? 0.9 : 0.5;
    src.connect(filter).connect(g).connect(this.master!);
    src.start(ctx.currentTime + Math.max(0, delaySec));
    this.track(src);
    return {
      cancel: () => {
        try {
          src.stop();
        } catch {
          // đã dừng
        }
      },
    };
  }

  stop(): void {
    for (const n of this.active) {
      try {
        n.stop();
      } catch {
        // đã dừng
      }
    }
    this.active = [];
    this.playingUntil = 0;
  }
}

export const soundOutput = new SoundOutputImpl();
