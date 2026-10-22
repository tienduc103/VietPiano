import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useFullscreen } from '../hooks/useFullscreen';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-md shadow-fuchsia-500/30 hover:brightness-110 active:brightness-95',
  secondary:
    'bg-white text-violet-900 ring-1 ring-violet-200 shadow-sm hover:bg-violet-50 active:bg-violet-100 dark:bg-slate-800 dark:text-violet-100 dark:ring-violet-800 dark:hover:bg-slate-700',
  ghost: 'text-violet-800 hover:bg-violet-200/60 active:bg-violet-300/60 dark:text-violet-200 dark:hover:bg-violet-800/50',
  danger: 'bg-rose-500 text-white shadow-md shadow-rose-500/30 hover:bg-rose-400 active:bg-rose-600',
};

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold transition-colors disabled:opacity-40 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${checked ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500' : 'bg-slate-300 dark:bg-slate-600'}`}
      >
        <span
          className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : ''}`}
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
    <div className="inline-flex rounded-xl bg-violet-100 p-1 dark:bg-slate-700">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition-colors ${
            value === o.value ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'
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
    <section className={`rounded-2xl bg-white/90 p-5 shadow-sm shadow-violet-200/60 ring-1 ring-violet-100 dark:bg-slate-800/90 dark:shadow-none dark:ring-violet-900 ${className}`}>
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
  metronome: 'M9 3h6l4 18H5L9 3zM6 17h12M12 14l6-9',
  play: 'M7 4l13 8-13 8V4z',
  pause: 'M8 4v16M16 4v16',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = 'h-6 w-6' }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** Nút bật/tắt toàn màn hình; tự ẩn khi trình duyệt không hỗ trợ hoặc đã chạy dạng app. */
export function FullscreenButton({ className = '' }: { className?: string }) {
  const { supported, active, toggle } = useFullscreen();
  if (!supported) return null;
  return (
    <Button variant="ghost" onClick={toggle} aria-label={active ? 'Thoát toàn màn hình' : 'Toàn màn hình'} aria-pressed={active} className={`px-2 ${className}`}>
      <Icon name={active ? 'minimize' : 'maximize'} />
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
