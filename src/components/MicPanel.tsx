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
        className={`h-full rounded-full transition-[width] duration-75 ${rms >= gate ? 'bg-gradient-to-r from-emerald-400 to-lime-400' : 'bg-slate-400'}`}
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
          ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/30 hover:brightness-110'
          : status === 'suspended' || paused
            ? 'animate-pulse bg-orange-500 text-white'
            : 'bg-white text-violet-900 ring-1 ring-violet-200 hover:bg-violet-50 dark:bg-slate-700 dark:text-slate-100 dark:ring-violet-800'
      }`}
    >
      <Icon name={on ? 'mic' : 'micOff'} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

export function MicError() {
  const error = useMic((s) => s.error);
  const fallback = useMic((s) => s.fallback);
  const status = useMic((s) => s.status);
  const paused = useMic((s) => s.pausedByBackground);
  if (status === 'error' && error) {
    return (
      <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
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
  if (fallback && status === 'running') {
    return (
      <p role="status" data-testid="mic-fallback" className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200">
        Micro đang chạy ở chế độ dự phòng: iOS không cho thu âm thô nên đã bật xử lý giọng nói của hệ thống. Nhận diện
        vẫn dùng được nhưng có thể kém hơn một chút, nhất là nốt ngân dài.
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
        <div className="relative h-3 rounded-full bg-gradient-to-r from-rose-300 via-emerald-300 to-rose-300 dark:from-rose-800 dark:via-emerald-700 dark:to-rose-800">
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

/**
 * Nút micro nổi, luôn hiển thị (trừ khi tắt trong Cài đặt): bấm để bật/tắt micro;
 * khi micro chạy thì hiện nốt đang nghe + cents. Vị trí do nơi dùng truyền vào qua `className`.
 */
export function FloatingMicNote({ className }: { className: string }) {
  const enabled = useSettings((s) => s.settings.showFloatingNote);
  const status = useMic((s) => s.status);
  const paused = useMic((s) => s.pausedByBackground);
  if (!enabled) return null;
  const on = status === 'running';
  const resumable = status === 'suspended' || paused;
  const failed = status === 'error';
  return (
    <button
      type="button"
      onClick={() => void toggleMicrophone()}
      data-testid="floating-mic"
      aria-pressed={on}
      aria-label={
        on ? 'Tắt micro (nút nổi)' : resumable ? 'Bật lại micro (nút nổi)' : failed ? 'Lỗi micro — bấm để thử lại (nút nổi)' : 'Bật micro (nút nổi)'
      }
      className={`z-10 flex min-h-12 min-w-12 items-center justify-center gap-2 rounded-2xl px-3 py-1.5 shadow-lg ring-1 transition-colors select-none ${
        on
          ? 'bg-white/90 ring-emerald-400/60 dark:bg-slate-800/90'
          : resumable
            ? 'animate-pulse bg-orange-500 text-white ring-orange-600/40'
            : failed
              ? 'bg-rose-600 text-white ring-rose-700/40'
              : 'bg-white/90 text-violet-900 ring-slate-900/10 dark:bg-slate-800/90 dark:text-slate-100 dark:ring-white/10'
      } ${className}`}
    >
      {on ? <LiveNote /> : <Icon name={status === 'starting' ? 'mic' : 'micOff'} />}
    </button>
  );
}

function LiveNote() {
  // Chọn từng giá trị nguyên thuỷ (không lấy cả object `live`) để chỉ render lại khi nốt hoặc cents đổi.
  const liveMidi = useMic((s) => s.live?.midi ?? null);
  const cents = useMic((s) => (s.live ? Math.round(s.live.cents) : null));
  // Tiếng đàn tắt dần xuống dưới ngưỡng nhiễu rất nhanh → khi không còn cao độ thì giữ nốt vừa nhận được.
  const lastNote = useMic((s) => s.lastNote);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const midi = liveMidi ?? lastNote;
  return (
    <>
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="min-w-12 text-center leading-tight" data-testid="floating-mic-note">
        <span className={`block text-2xl font-bold tabular-nums ${liveMidi === null && midi !== null ? 'opacity-60' : ''}`}>
          {midi === null ? '…' : midiToLabel(midi, labelStyle)}
        </span>
        <span className="block text-[10px] text-slate-500 tabular-nums dark:text-slate-400">
          {cents !== null ? `${cents > 0 ? '+' : ''}${cents} cents` : midi !== null ? 'vừa nghe' : 'đang nghe'}
        </span>
      </span>
    </>
  );
}
