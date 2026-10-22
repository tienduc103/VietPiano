import { midiToLabel, type NoteLabelStyle } from '../core/music/notes';
import { useMic, toggleMicrophone } from '../store/micStore';
import { useSettings } from '../store/settingsStore';
import { Icon } from './ui';

/** Thanh mức âm lượng, có vạch đánh dấu noise gate. */
export function LevelMeter({ className = '' }: { className?: string }) {
  const rms = useMic((s) => s.rms);
  const gate = useSettings((s) => s.settings.noiseGate);
  // Thang log: 0.0005 → 0%, 0.3 → 100%
  const toPct = (v: number) => Math.max(0, Math.min(100, ((Math.log10(Math.max(v, 0.0005)) + 3.3) / 2.78) * 100));
  return (
    <div className={`relative h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 ${className}`} aria-hidden>
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${rms >= gate ? 'bg-emerald-500' : 'bg-slate-400'}`}
        style={{ width: `${toPct(rms)}%` }}
      />
      <div className="absolute top-0 h-full w-0.5 bg-amber-500" style={{ left: `${toPct(gate)}%` }} title="Ngưỡng nhiễu" />
    </div>
  );
}

/** Nút bật/tắt micro kèm trạng thái. */
export function MicButton({ compact = false }: { compact?: boolean }) {
  const status = useMic((s) => s.status);
  const paused = useMic((s) => s.pausedByBackground);
  const on = status === 'running';
  const label =
    status === 'starting'
      ? 'Đang bật…'
      : on
        ? 'Micro đang bật'
        : status === 'suspended' || paused
          ? 'Bật lại micro'
          : 'Bật micro';
  return (
    <button
      type="button"
      onClick={() => void toggleMicrophone()}
      data-testid="mic-button"
      aria-pressed={on}
      className={`inline-flex min-h-12 items-center gap-2 rounded-xl px-4 font-semibold transition-colors ${
        on
          ? 'bg-emerald-600 text-white hover:bg-emerald-500'
          : status === 'suspended' || paused
            ? 'animate-pulse bg-amber-500 text-white'
            : 'bg-slate-200 text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100'
      }`}
    >
      <Icon name={on ? 'mic' : 'micOff'} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export function MicError() {
  const error = useMic((s) => s.error);
  const status = useMic((s) => s.status);
  const paused = useMic((s) => s.pausedByBackground);
  if (status === 'error' && error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {error.message}
      </p>
    );
  }
  if (paused || status === 'suspended') {
    return (
      <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Micro đã tạm dừng khi ứng dụng chạy nền hoặc bị hệ thống ngắt. Bấm “Bật lại micro” để tiếp tục.
      </p>
    );
  }
  return null;
}

/** Nốt đang nghe thấy + đồng hồ lệch cents. */
export function DetectedNote({ labelStyle }: { labelStyle: NoteLabelStyle }) {
  const live = useMic((s) => s.live);
  const status = useMic((s) => s.status);
  const cents = live?.cents ?? 0;
  const inTune = Math.abs(cents) <= 10;
  return (
    <div className="flex items-center gap-4" data-testid="detected-note">
      <div className="w-24 text-center">
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Nghe thấy</div>
        <div className="text-4xl font-bold tabular-nums">{live ? midiToLabel(live.midi, labelStyle) : status === 'running' ? '…' : '—'}</div>
      </div>
      <div className="w-36">
        <div className="relative h-3 rounded-full bg-gradient-to-r from-red-300 via-emerald-300 to-red-300 dark:from-red-800 dark:via-emerald-700 dark:to-red-800">
          <div
            className={`absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${live ? (inTune ? 'bg-emerald-700 dark:bg-emerald-300' : 'bg-slate-800 dark:bg-white') : 'hidden'}`}
            style={{ left: `${50 + cents}%` }}
          />
        </div>
        <div className="mt-1 text-center text-xs text-slate-500 tabular-nums dark:text-slate-400">
          {live ? `${cents > 0 ? '+' : ''}${cents.toFixed(0)} cents · ${live.frequency.toFixed(1)} Hz` : 'cao độ (cents)'}
        </div>
      </div>
    </div>
  );
}
