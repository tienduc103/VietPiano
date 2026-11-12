import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { MidiNavAction } from '../core/input/midiNav';
import { useFullscreen } from '../hooks/useFullscreen';
import { useMidiNavTarget } from '../hooks/useMidiNav';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-md shadow-indigo-500/25 ring-1 ring-white/20 ring-inset hover:brightness-110 active:scale-[0.98] active:brightness-95',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-200/90 shadow-xs hover:bg-slate-50 hover:ring-violet-300 active:scale-[0.98] active:bg-slate-100 dark:bg-slate-800/95 dark:text-slate-100 dark:ring-slate-700/80 dark:hover:bg-slate-700/90 dark:hover:ring-violet-600',
  ghost:
    'text-slate-700 hover:bg-slate-200/60 hover:text-slate-900 active:bg-slate-300/60 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white',
  danger:
    'bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-md shadow-rose-500/25 ring-1 ring-white/20 ring-inset hover:brightness-110 active:scale-[0.98] active:brightness-95',
};

export function Button({
  variant = 'secondary',
  className = '',
  children,
  midiNav,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Đàn MIDI bấm hộ khi màn không nghe nốt: 'forward' = phím trắng / pedal, 'back' = phím đen. */
  midiNav?: MidiNavAction;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useMidiNavTarget(ref, midiNav);
  return (
    <button
      ref={ref}
      type="button"
      className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 dark:focus-visible:ring-offset-slate-900 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-1">
      <span className="text-slate-800 dark:text-slate-200">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${checked ? 'bg-gradient-to-r from-indigo-600 to-fuchsia-600 shadow-inner' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span
          className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-6' : ''}`}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-slate-200/75 p-1 ring-1 ring-slate-300/60 backdrop-blur-xs dark:bg-slate-800/90 dark:ring-slate-700/70">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-10 cursor-pointer rounded-lg px-4 text-sm font-semibold transition-all duration-150 ${
            value === o.value
              ? 'bg-white text-violet-700 shadow-xs ring-1 ring-slate-900/5 dark:bg-slate-900 dark:text-violet-300 dark:ring-white/10'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white/95 p-5 shadow-xs ring-1 ring-slate-200/80 backdrop-blur-sm dark:bg-slate-900/85 dark:shadow-none dark:ring-slate-800 ${className}`}>
      {children}
    </section>
  );
}

/** Icon SVG nét đơn giản, tránh phụ thuộc thư viện icon. */
const ICONS = {
  back: 'M15 18l-6-6 6-6',
  prev: 'M19 20L9 12l10-8v16zM5 19V5',
  next: 'M5 4l10 8-10 8V4zM19 5v14',
  restart: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5',
  // Mũi tên xoay theo chiều kim đồng hồ (tải lại) — ảnh gương của restart
  reload: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  micOff: 'M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M17 16.9A7 7 0 0 1 5 12v-2M19 10v2c0 .8-.1 1.5-.4 2.2M12 19v3',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M17.9 17.9A10 10 0 0 1 12 20c-7 0-11-8-11-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18 18 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22',
  keyboard: 'M2 6h20v12H2zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
  check: 'M20 6L9 17l-5-5',
  maximize: 'M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3',
  minimize: 'M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3',
  close: 'M18 6L6 18M6 6l12 12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  hourglass: 'M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4',
  count: 'M10 6h11M10 12h11M10 18h11M4 4v4M3 4h1M4 16h2l-2 3h2',
  metronome: 'M9 3h6l4 18H5L9 3zM6 17h12M12 14l6-9',
  play: 'M7 4l13 8-13 8V4z',
  pause: 'M8 4v16M16 4v16',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14',
  volumeOff: 'M11 5L6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6',
  gamepad: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.9 8.1A2.5 2.5 0 0 0 4.3 19.5c.9 0 1.7-.5 2.1-1.3L7.5 16h9l1.1 2.2c.4.8 1.2 1.3 2.1 1.3a2.5 2.5 0 0 0 2.5-2.8l-.9-8.1a4 4 0 0 0-4-3.6z',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  /** Tuỳ chọn hiển thị khuông nhạc. */
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  /** Chế độ Biểu diễn. */
  star: 'M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z',
  /** Lộ trình luyện. */
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  /** Luyện theo đoạn (ô nhịp). */
  brackets: 'M8 4H4v16h4M16 4h4v16h-4',
  /** Ghim lối tắt. */
  pin: 'M12 17v5M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9a2 2 0 0 1-1.1-1.8V7h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z',
  /** Kéo để đổi thứ tự. */
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-6 w-6' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/**
 * Nút bật/tắt toàn màn hình; tự ẩn khi trình duyệt không hỗ trợ hoặc đã chạy dạng app.
 * Khi đang toàn màn hình thì thu nhỏ, mờ bớt để không chiếm chỗ trên header.
 */
export function FullscreenButton({ className = '' }: { className?: string }) {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;
  return (
    <Button
      variant="ghost"
      onClick={toggle}
      aria-label={active ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
      aria-pressed={active}
      className={`${active ? 'min-h-9! rounded-lg px-1.5 opacity-60 hover:opacity-100' : 'px-2'} ${className}`}
    >
      <Icon name={active ? 'minimize' : 'maximize'} className={active ? 'h-4 w-4' : 'h-6 w-6'} />
    </Button>
  );
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h} giờ ${m} phút`;
  if (m > 0) return `${m} phút ${s.toString().padStart(2, '0')} giây`;
  return `${s} giây`;
}
