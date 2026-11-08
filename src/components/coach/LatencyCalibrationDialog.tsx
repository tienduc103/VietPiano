import { useEffect } from 'react';
import { CALIBRATION_BPM, CALIBRATION_CLICKS, CALIBRATION_LEAD_IN, calibrationQuality, tapStatusMessage, type TapAnalysis } from '../../core/coach/latency/calibration';
import { DEFAULT_LATENCY_MS, deviceKeyFor, deviceLabel } from '../../core/coach/latency/store';
import type { LatencyCalibration } from '../../core/coach/types';
import type { InputSource } from '../../core/input/NoteInputProvider';
import { useLatencyCalibration } from '../../hooks/useLatencyCalibration';
import { Button, Icon } from '../ui';

interface Props {
  source: InputSource;
  deviceName?: string;
  current: LatencyCalibration | null;
  micRunning: boolean;
  onEnableMic: () => void;
  onSave: (cal: LatencyCalibration) => void;
  onClose: () => void;
}

const HOW: Record<InputSource, string> = {
  midi: 'Gõ một phím bất kỳ trên đàn mỗi tiếng click.',
  virtual: 'Gõ phím cách (hoặc phím bất kỳ) trên bàn phím máy tính, hoặc chạm nút lớn bên dưới, mỗi tiếng click.',
  microphone: 'Đánh một nốt rõ trên đàn (vd Đô giữa) mỗi tiếng click; đặt micro gần đàn, phòng yên tĩnh.',
};

export function formatCalibrationDate(ms: number): string {
  return new Date(ms).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Hộp thoại đo độ trễ của thiết bị (M1-T7): gõ theo tiếng click → độ lệch trung vị + độ dao động → lưu cho thiết bị trên máy này.
 * Không có tín hiệu nhịp bằng hình (chỉ đếm số tiếng click đã đo) để người chơi bám TIẾNG click như khi chơi với metronome.
 */
export function LatencyCalibrationDialog(p: Props) {
  const { run, start, cancel, tap } = useLatencyCalibration(p.source);
  const label = deviceLabel(p.source, p.deviceName);
  const a = run.analysis;
  const needMic = p.source === 'microphone' && !p.micRunning;

  // Đổi nguồn / đàn giữa lúc đo (vd rút đàn) → huỷ lượt đo: lần gõ không còn cùng một thiết bị.
  useEffect(() => cancel, [p.source, p.deviceName, cancel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (run.phase === 'running') cancel();
      else p.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run.phase, cancel, p]);

  const save = () => {
    if (!a || a.status !== 'ok' || a.offsetMs === null || a.jitterMs === null) return;
    p.onSave({
      deviceKey: deviceKeyFor(p.source, p.deviceName),
      source: p.source,
      ...(p.deviceName ? { deviceName: p.deviceName } : {}),
      offsetMs: a.offsetMs,
      jitterMs: a.jitterMs,
      taps: a.used,
      clicks: CALIBRATION_CLICKS,
      bpm: CALIBRATION_BPM,
      method: 'tap',
      measuredAt: Date.now(),
      outputLatencyMs: run.outputLatencyMs,
    });
    p.onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="coach-latency-title"
      onClick={(e) => e.target === e.currentTarget && run.phase !== 'running' && p.onClose()}
      data-testid="coach-latency-dialog"
      data-phase={run.phase}
      data-origin={run.originMs ?? undefined}
      data-beat-ms={run.beatMs}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-800">
        <div className="flex items-start gap-3">
          <h2 id="coach-latency-title" className="flex-1 text-xl font-bold">
            ⏱ Đo độ trễ — {label}
          </h2>
          {run.phase !== 'running' && (
            <Button variant="ghost" className="min-h-10 px-2" aria-label="Đóng" onClick={p.onClose}>
              <Icon name="close" className="h-5 w-5" />
            </Button>
          )}
        </div>

        {run.phase === 'idle' && (
          <>
            <p className="text-sm">
              Đàn, loa / tai nghe và trình duyệt làm tiếng click và nốt bạn đánh đến muộn một chút — mỗi máy một khác. Đo một lần cho thiết bị
              này để Coach so nốt với tiếng metronome cho đúng.
            </p>
            <ul className="list-disc pl-5 text-sm">
              <li>
                App phát {CALIBRATION_LEAD_IN} tiếng click để bắt nhịp rồi {CALIBRATION_CLICKS} tiếng để đo (khoảng 15 giây).
              </li>
              <li>
                <strong>Gõ đúng lúc NGHE tiếng click</strong> — nghe, đừng nhìn màn hình. {HOW[p.source]}
              </li>
              <li>Dùng đúng loa / tai nghe sẽ dùng khi chơi (đổi loa / tai nghe Bluetooth thì đo lại).</li>
              {p.source === 'microphone' && <li>Coach không bật metronome khi nghe bằng micro nên số đo này chỉ dùng để bù trễ khi phân tích, không đổi điểm.</li>}
            </ul>
            <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="coach-latency-current">
              {p.current
                ? `Số đo hiện tại: ${p.current.offsetMs} ms (±${p.current.jitterMs} ms), đo lúc ${formatCalibrationDate(p.current.measuredAt)}.`
                : `Chưa đo — đang dùng mặc định ${DEFAULT_LATENCY_MS[p.source]} ms.`}
            </p>
            <div className="flex flex-wrap gap-2">
              {needMic ? (
                <Button variant="primary" onClick={p.onEnableMic}>
                  <Icon name="mic" className="h-5 w-5" /> Bật micro
                </Button>
              ) : (
                <Button variant="primary" onClick={start} data-testid="coach-latency-start">
                  Bắt đầu đo
                </Button>
              )}
              <Button onClick={p.onClose}>Đóng</Button>
            </div>
          </>
        )}

        {run.phase === 'running' && (
          <>
            <p className="text-lg font-semibold" aria-live="polite" data-testid="coach-latency-progress">
              {run.leadIn ? 'Bắt nhịp… (chưa đo)' : `Đang đo: ${run.clicksDone}/${CALIBRATION_CLICKS} tiếng click`}
              <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">đã gõ {run.taps}</span>
            </p>
            <OffsetStrip offsets={run.live} beatMs={run.beatMs} analysis={null} />
            {p.source === 'virtual' && (
              <button
                type="button"
                className="min-h-24 w-full rounded-2xl bg-violet-100 text-lg font-bold text-violet-900 ring-2 ring-violet-300 select-none active:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-100 dark:ring-violet-700"
                onPointerDown={(e) => {
                  e.preventDefault();
                  tap();
                }}
                data-testid="coach-latency-pad"
              >
                Chạm đây mỗi tiếng click
              </button>
            )}
            <div>
              <Button onClick={cancel}>Huỷ đo</Button>
            </div>
          </>
        )}

        {run.phase === 'done' && a && (
          <>
            {a.status === 'ok' && a.offsetMs !== null && a.jitterMs !== null ? (
              <div data-testid="coach-latency-result" data-offset={a.offsetMs} data-jitter={a.jitterMs}>
                <p className="text-3xl font-extrabold tabular-nums">Độ trễ: {a.offsetMs} ms</p>
                <p className="text-sm">
                  dao động ±{a.jitterMs} ms · {a.used}/{CALIBRATION_CLICKS} lần gõ được tính
                  {a.missed ? ` · bỏ lỡ ${a.missed}` : ''}
                  {a.extra ? ` · gõ thừa ${a.extra}` : ''}
                  {a.outliers ? ` · ${a.outliers} lần lệch xa bị bỏ` : ''}
                </p>
                <p className="mt-1 text-sm">
                  {calibrationQuality(a.jitterMs) === 'good' ? '✓ Ổn định — số đo tin được.' : '≈ Tạm được — có thể đo lại cho chắc.'}
                  {a.offsetMs < 0 ? ' Số âm: bạn thường gõ hơi trước tiếng click (thói quen bắt nhịp), app vẫn bù đúng.' : ''}
                </p>
                {run.outputLatencyMs !== null && <p className="text-xs text-slate-500 dark:text-slate-400">Trình duyệt báo độ trễ loa / tai nghe: {run.outputLatencyMs} ms (để nhận ra khi đổi thiết bị phát).</p>}
              </div>
            ) : (
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-800" role="alert" data-testid="coach-latency-failed" data-status={a.status}>
                {tapStatusMessage(a)}
              </p>
            )}
            <OffsetStrip offsets={a.matches.filter((m) => m.offsetMs !== null).map((m) => m.offsetMs!)} beatMs={run.beatMs} analysis={a} />
            <div className="flex flex-wrap gap-2">
              {a.status === 'ok' && (
                <Button variant="primary" onClick={save} data-testid="coach-latency-save">
                  Lưu cho {label}
                </Button>
              )}
              <Button onClick={start} data-testid="coach-latency-retry">
                Đo lại
              </Button>
              <Button variant="ghost" onClick={p.onClose}>
                Đóng
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Dải độ lệch: giữa = tiếng click, trái = gõ sớm, phải = gõ muộn (±nửa phách, cắt ở ±300 ms). Chấm = một lần gõ. HTML (chữ không co theo màn hình). */
function OffsetStrip({ offsets, beatMs, analysis }: { offsets: number[]; beatMs: number; analysis: TapAnalysis | null }) {
  const range = Math.min(300, Math.round(beatMs / 2));
  const pct = (ms: number) => ((Math.max(-range, Math.min(range, ms)) + range) / (2 * range)) * 100;
  const outlier = new Set(analysis?.matches.filter((m) => m.outlier).map((m) => m.offsetMs));
  const center = analysis?.status === 'ok' && analysis.offsetMs !== null ? analysis.offsetMs : null;
  return (
    <figure className="m-0">
      <div className="relative h-12" role="img" aria-label={`${offsets.length} lần gõ so với tiếng click${center !== null ? `, độ trễ ${center} ms` : ''}`} data-testid="coach-latency-strip">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded bg-slate-200 dark:bg-slate-600" />
        {[-range / 2, range / 2].map((t) => (
          <div key={t} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-slate-400 dark:bg-slate-500" style={{ left: `${pct(t)}%` }} />
        ))}
        <div className="absolute top-1 bottom-1 left-1/2 w-0.5 -translate-x-1/2 bg-slate-800 dark:bg-slate-100" />
        {center !== null && <div className="absolute top-0 bottom-0 w-1 -translate-x-1/2 rounded bg-violet-600 dark:bg-violet-400" style={{ left: `${pct(center)}%` }} />}
        {offsets.map((o, i) => (
          <span
            key={i}
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${outlier.has(o) ? 'border-2 border-slate-400 bg-transparent' : 'bg-violet-600/60 ring-1 ring-white dark:bg-violet-400/70 dark:ring-slate-800'}`}
            style={{ left: `${pct(o)}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>← sớm (−{range} ms)</span>
        <span className="font-semibold text-slate-700 dark:text-slate-200">tiếng click</span>
        <span>muộn (+{range} ms) →</span>
      </div>
      <figcaption className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Mỗi chấm là một lần gõ: bên trái vạch giữa = gõ trước tiếng click, bên phải = sau.{center !== null ? ' Vạch tím = độ trễ đo được.' : ''}
        {analysis && analysis.outliers > 0 ? ' Chấm rỗng = lần lệch xa, không tính.' : ''}
      </figcaption>
    </figure>
  );
}
