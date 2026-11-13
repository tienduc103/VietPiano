/**
 * Phần dùng chung của bài "Khám phá âm thanh": ngữ cảnh (nguồn nốt, giọng cô, tiến độ), phát mẫu, nút lớn,
 * nhân vật bay theo cao độ, thanh thời gian giữ phím.
 */
import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { soundOutput } from '../../core/audio/SoundOutput';
import { approach, pitchHeight } from '../../core/soundExplore/classify';
import type { SoundExploreSettings } from '../../core/soundExplore/config';
import { cueFor, SAY, type SayKey } from '../../core/soundExplore/lesson';
import type { HeldKey, Press } from '../../core/soundExplore/PressTracker';
import type { ActivityId, AttemptInput, SkillId, SoundExploreProgress } from '../../core/soundExplore/progress';
import { voiceTeacher } from '../../core/voice/teacher';

/** Sự kiện nốt đã chuẩn hoá cho các hoạt động. `mic`: micro chỉ biết lúc bắt đầu (không đo được độ dài). */
export type ExploreNoteEvent = { kind: 'start'; key: HeldKey } | { kind: 'end'; press: Press } | { kind: 'mic'; midi: number; time: number };

export interface ExploreApi {
  settings: SoundExploreSettings;
  progress: SoundExploreProgress;
  update: (fn: (p: SoundExploreProgress, now: number) => SoundExploreProgress) => void;
  /** Ghi một lần thử (kỹ năng) + nguồn vào gần nhất. */
  attempt: (skill: SkillId, success: boolean, firstTry: boolean, input?: AttemptInput) => void;
  /** Bé bấm nghe lại ví dụ. */
  replayed: (skill: SkillId) => void;
  star: (activity: ActivityId) => void;
  say: (keys: SayKey | SayKey[], kind?: 'instruction' | 'praise') => void;
  /** Đọc một câu tự do (câu động viên theo quy tắc / của AI). */
  sayText: (text: string, kind?: 'instruction' | 'praise') => void;
  subscribe: (listener: (e: ExploreNoteEvent) => void) => () => void;
  /** Nguồn nốt gần nhất ('touch' khi bé chạm chọn đáp án). */
  lastInput: () => AttemptInput;
  /** Đang nghe nốt chỉ từ micro → hoạt động trường độ hướng dẫn dùng bàn phím trên màn hình. */
  micOnly: boolean;
  reducedMotion: boolean;
  /** Chuông nhỏ khi hoàn thành (không có âm báo thất bại); không kêu khi bé đang giữ phím. */
  chime: () => void;
  heldCount: () => number;
  /** Tô vùng phím gợi ý trên bàn phím ảo (null = bỏ). */
  setKeyHint: (keys: ReadonlySet<number> | null) => void;
}

export const ExploreContext = createContext<ExploreApi | null>(null);

export function useExplore(): ExploreApi {
  const api = useContext(ExploreContext);
  if (!api) throw new Error('useExplore ngoài ExploreContext');
  return api;
}

/** Nghe sự kiện nốt khi `active`. */
export function useExploreNotes(listener: (e: ExploreNoteEvent) => void, active = true): void {
  const { subscribe } = useExplore();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => {
    if (!active) return;
    return subscribe((e) => ref.current(e));
  }, [subscribe, active]);
}

/** Đọc câu cô giáo (nhiều câu ghép lại thành một lượt nói). */
export function sayCue(keys: SayKey | SayKey[], kind: 'instruction' | 'praise' = 'instruction') {
  const list = Array.isArray(keys) ? keys : [keys];
  const base = cueFor(list[0], kind);
  return { ...base, id: `se-${list.join('+')}`, instructionText: list.map((k) => SAY[k]).join(' ') };
}

/** Gọi `fn` khi cô giáo nói xong (tối đa 9 s; cô không nói → sau 400 ms). Trả về hàm huỷ. */
export function afterVoice(fn: () => void): () => void {
  const start = performance.now();
  let quiet = 0;
  const id = window.setInterval(() => {
    const s = voiceTeacher.getState();
    const elapsed = performance.now() - start;
    quiet = s.speaking ? 0 : quiet + 1;
    if ((elapsed > 400 && quiet >= 3) || elapsed > 9000) {
      window.clearInterval(id);
      fn();
    }
  }, 100);
  return () => window.clearInterval(id);
}

export interface DemoNote {
  midi: number;
  /** giây */
  start: number;
  duration: number;
}

/**
 * Phát ví dụ: mọi nốt CÙNG lực gõ (cao ≠ to). `onNote(i)` gọi đúng lúc nốt i bắt đầu kêu, `onEnd` khi xong.
 * Trả về hàm huỷ (dừng tiếng + hẹn giờ).
 */
export function playDemo(notes: readonly DemoNote[], onNote?: (i: number) => void, onEnd?: () => void): () => void {
  voiceTeacher.interrupt();
  const total = soundOutput.playSequence(notes.map((n) => ({ ...n, velocity: 80 })));
  const timers = notes.map((n, i) => window.setTimeout(() => onNote?.(i), (n.start + 0.08) * 1000));
  timers.push(window.setTimeout(() => onEnd?.(), Math.max(0, total - 300)));
  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    soundOutput.stop();
  };
}

/** Quản lý một ví dụ đang phát (huỷ khi phát cái mới / rời màn). */
export function useDemo() {
  const cancel = useRef<(() => void) | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  return {
    playing,
    play(notes: readonly DemoNote[], onNote?: (i: number) => void) {
      cancel.current?.();
      cancel.current = playDemo(
        notes,
        (i) => {
          setPlaying(i);
          onNote?.(i);
        },
        () => setPlaying(null),
      );
    },
    stop() {
      cancel.current?.();
      cancel.current = null;
      setPlaying(null);
    },
  };
}

/** Nút lớn cho bé (≥ 80px), biểu tượng là chính, chữ chỉ để phụ huynh / trình đọc màn hình. */
export function BigButton({ icon, label, tone = 'violet', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; tone?: 'violet' | 'sky' | 'amber' | 'emerald' | 'rose' | 'slate' }) {
  const tones = {
    violet: 'bg-violet-500 text-white shadow-violet-500/40',
    sky: 'bg-sky-500 text-white shadow-sky-500/40',
    amber: 'bg-amber-400 text-amber-950 shadow-amber-500/40',
    emerald: 'bg-emerald-500 text-white shadow-emerald-500/40',
    rose: 'bg-rose-400 text-white shadow-rose-500/40',
    slate: 'bg-white text-slate-700 shadow-slate-400/30 dark:bg-slate-700 dark:text-slate-100',
  } as const;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`grid min-h-20 min-w-20 place-items-center rounded-3xl px-4 text-4xl font-bold shadow-lg transition-transform active:scale-95 disabled:opacity-40 ${tones[tone]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  );
}

/** Nút nghe lại ví dụ (luôn có). */
export function ReplayButton({ onClick, label = 'Nghe lại', playing }: { onClick: () => void; label?: string; playing?: boolean }) {
  return <BigButton icon={<span className={playing ? 'animate-pulse' : ''}>🔊</span>} label={label} tone="sky" onClick={onClick} data-testid="se-replay" />;
}

/**
 * Nhân vật bay theo cao độ: độ cao = `pitchHeight(midi)`, đi mượt bằng `approach` (giới hạn mỗi khung, không giật).
 * Giảm chuyển động → nhảy thẳng tới vị trí. `midi` null → đứng ở giữa.
 */
export function PitchFlyer({ midi, emoji, size = 'text-6xl', testId = 'se-flyer' }: { midi: number | null; emoji: string; size?: string; testId?: string }) {
  const { reducedMotion } = useExplore();
  const target = midi === null ? 0.5 : pitchHeight(midi);
  const [y, setY] = useState(target);
  const yRef = useRef(y);
  useEffect(() => {
    if (reducedMotion) {
      yRef.current = target;
      setY(target);
      return;
    }
    let id = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const next = approach(yRef.current, target, t - last);
      last = t;
      yRef.current = next;
      setY(next);
      if (next !== target) id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [target, reducedMotion]);
  return (
    <div
      className={`pointer-events-none absolute left-1/2 -translate-x-1/2 ${size}`}
      style={{ bottom: `calc(${(y * 78).toFixed(2)}% + 4%)` }}
      data-testid={testId}
      data-height={target.toFixed(2)}
      aria-hidden
    >
      {emoji}
    </div>
  );
}

/** Thanh thời gian giữ phím: vùng thỏ (ngắn) · vùng "?" · vùng ốc sên (dài). Chạy theo đồng hồ khi đang giữ. */
export function HoldBar({ heldSince, lastMs }: { heldSince: number | null; lastMs: number | null }) {
  const { settings } = useExplore();
  const max = settings.longMinMs * 1.6;
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (heldSince === null) return;
    let id = 0;
    const loop = () => {
      setNow(performance.now());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [heldSince]);
  const ms = heldSince !== null ? now - heldSince : (lastMs ?? 0);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="relative h-10 w-full overflow-hidden rounded-full bg-white/70 ring-2 ring-white dark:bg-slate-800/70" data-testid="se-hold-bar" aria-hidden>
      <div className="absolute inset-y-0 bg-pink-200/70 dark:bg-pink-900/50" style={{ left: pct(settings.shortMinMs), width: `calc(${pct(settings.shortMaxMs)} - ${pct(settings.shortMinMs)})` }} />
      <div className="absolute inset-y-0 right-0 bg-lime-200/70 dark:bg-lime-900/50" style={{ left: pct(settings.longMinMs) }} />
      <div
        className={`absolute inset-y-1 left-1 rounded-full bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-400 shadow-[0_0_16px_rgba(251,191,36,0.9)] ${heldSince === null ? 'opacity-60' : ''}`}
        style={{ width: `calc(${pct(ms)} - 0.5rem)` }}
      />
      <span className="absolute top-1/2 -translate-y-1/2 text-2xl" style={{ left: `calc(${pct(settings.shortMinMs)} + 0.25rem)` }}>
        🐰
      </span>
      <span className="absolute top-1/2 right-2 -translate-y-1/2 text-2xl">🐌</span>
    </div>
  );
}

/** Bầu trời hoạt hình làm nền cảnh. */
export function Sky({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative h-full min-h-64 w-full overflow-hidden rounded-3xl bg-gradient-to-b from-sky-300 via-sky-200 to-lime-200 dark:from-indigo-950 dark:via-sky-900 dark:to-emerald-900 ${className}`}>
      {children}
    </div>
  );
}

/** Ngôi sao thưởng nổi lên khi hoàn thành. */
export function StarBurst({ show }: { show: boolean }) {
  const { reducedMotion } = useExplore();
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center" data-testid="se-star" aria-hidden>
      <span className={`text-8xl drop-shadow-lg ${reducedMotion ? '' : 'animate-bounce'}`}>⭐</span>
    </div>
  );
}
