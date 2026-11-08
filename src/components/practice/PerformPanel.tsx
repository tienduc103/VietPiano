import type { ReactNode } from 'react';
import { starsFor } from '../../core/curriculum/scoring';
import type { PerformanceResult, PerformanceState } from '../../core/practice/PerformanceTracker';
import { weakestSpan, type PerformBreakdown } from '../../core/practice/performPlan';
import { TEMPO_PERCENT_MAX, TEMPO_PERCENT_MIN } from '../../core/settings/DeviceSettings';
import { Button, Icon } from '../ui';

const TEMPO_STEP_PERCENT = 5;

/** Bảng điều khiển chế độ Biểu diễn: chạy / tạm dừng, đếm vào, đúng nhịp – sớm – muộn, tốc độ, metronome. */
export function PerformPanel({
  state,
  bpm,
  percent,
  onPercent,
  onToggle,
  metronome,
  onMetronome,
}: {
  state: PerformanceState;
  bpm: number;
  percent: number;
  onPercent: (percent: number) => void;
  onToggle: () => void;
  metronome: boolean;
  onMetronome: (on: boolean) => void;
}) {
  const running = state.status === 'running' || state.status === 'countIn';
  const step = (dir: 1 | -1) => onPercent(Math.min(TEMPO_PERCENT_MAX, Math.max(TEMPO_PERCENT_MIN, percent + dir * TEMPO_STEP_PERCENT)));
  let tone = 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
  let title = 'Sẵn sàng';
  let detail = 'Bấm ▶ để đếm vào';
  if (state.status === 'countIn') {
    tone = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    title = String(Math.max(1, Math.ceil(-state.beat)));
    detail = 'Chuẩn bị…';
  } else if (state.status === 'paused') {
    title = 'Tạm dừng';
    detail = 'Bấm ▶ để chơi tiếp (đếm vào lại)';
  } else if (state.status === 'finished') {
    tone = 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white';
    title = 'Hết bài!';
    detail = '';
  } else if (state.status === 'running') {
    tone = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    title = 'Đang biểu diễn';
    detail =
      state.lastOutcome === 'wrong'
        ? 'Sai nốt — cứ chơi tiếp'
        : state.lastOutcome === 'extra'
          ? 'Thừa nốt'
          : state.lastOffsetMs === null
            ? 'Sai không dừng'
            : Math.abs(state.lastOffsetMs) <= 150
              ? 'Đúng nhịp'
              : state.lastOffsetMs < 0
                ? `Sớm ${Math.round(-state.lastOffsetMs)} ms`
                : `Muộn ${Math.round(state.lastOffsetMs)} ms`;
  }
  return (
    <div className="flex items-center gap-3" data-testid="perform-panel">
      <Button variant="primary" onClick={onToggle} aria-label={running ? 'Tạm dừng' : 'Bắt đầu biểu diễn'} data-testid="perform-run">
        <Icon name={running ? 'pause' : 'play'} />
      </Button>
      <div className={`w-52 rounded-xl px-4 py-2 text-center ${tone}`} role="status" aria-live="polite">
        <div className="text-xl font-bold tabular-nums" data-testid="perform-status">
          {title}
        </div>
        {detail && <div className="text-sm">{detail}</div>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => step(-1)} aria-label="Chậm hơn" disabled={running || percent <= TEMPO_PERCENT_MIN} className="px-3 text-xl">
          −
        </Button>
        <div className="min-w-24 text-center">
          <div className="text-2xl font-bold tabular-nums" data-testid="perform-bpm">
            ♩={bpm}
          </div>
          <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{percent}% · đồng hồ cố định</div>
        </div>
        <Button variant="ghost" onClick={() => step(1)} aria-label="Nhanh hơn" disabled={running || percent >= TEMPO_PERCENT_MAX} className="px-3 text-xl">
          +
        </Button>
      </div>
      <Button
        variant="ghost"
        onClick={() => onMetronome(!metronome)}
        aria-pressed={metronome}
        aria-label={metronome ? 'Tắt tiếng metronome' : 'Bật tiếng metronome'}
        title="Tiếng metronome (đếm vào + mỗi phách). Dùng micro thì nên đeo tai nghe."
        className={`px-2 ${metronome ? '' : 'opacity-50'}`}
      >
        <Icon name="metronome" />
      </Button>
    </div>
  );
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'Không đo' : `${Math.round(v * 100)}%`);

function Row({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-3 py-2 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900" data-testid={testId}>
      <dt className="text-sm text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className="font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Phần tổng kết dùng chung: điểm từng tay, đồng bộ hai tay, ô nhịp nhiều lỗi + nút luyện lại đoạn đó, gợi ý lên cấp.
 * `rhythm`: tiết tấu (null = chế độ không có đồng hồ nhịp → "không đo").
 */
export function ResultBreakdown({
  hands,
  sync,
  rhythm,
  measures,
  measureLabel,
  onPracticeMeasures,
  levelUp,
}: {
  hands: { right?: number | null; left?: number | null };
  sync?: number | null;
  rhythm?: number | null;
  measures: readonly { measure: number; total: number }[];
  measureLabel?: (m: number) => string;
  onPracticeMeasures?: (from: number, to: number) => void;
  levelUp?: { label: string; onClick: () => void } | null;
}) {
  const span = weakestSpan(measures);
  const label = measureLabel ?? ((m: number) => `ô ${m}`);
  return (
    <div className="mt-4 grid gap-2 text-left" data-testid="result-breakdown">
      <dl className="grid grid-cols-2 gap-2">
        {hands.right !== undefined && <Row label="Tay phải" value={pct(hands.right)} testId="score-right" />}
        {hands.left !== undefined && <Row label="Tay trái" value={pct(hands.left)} testId="score-left" />}
        {rhythm !== undefined && <Row label="Tiết tấu" value={rhythm === null ? 'Không đo' : pct(rhythm)} testId="score-rhythm" />}
        {sync !== undefined && sync !== null && <Row label="Hai tay cùng lúc" value={pct(sync)} testId="score-sync" />}
      </dl>
      {measures.length > 0 ? (
        <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100" data-testid="weak-measures">
          <div>
            <span className="font-semibold">Ô nhiều lỗi:</span> {measures.slice(0, 3).map((m) => `${label(m.measure)} (${m.total})`).join(', ')}
          </div>
          {span && onPracticeMeasures && (
            <Button className="mt-2 w-full" onClick={() => onPracticeMeasures(span.from, span.to)} data-testid="practice-weak">
              Luyện lại {span.from === span.to ? label(span.from) : `${label(span.from)}–${span.to}`} (chờ nốt)
            </Button>
          )}
        </div>
      ) : (
        <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Không ô nào có lỗi — tuyệt vời!</p>
      )}
      {levelUp && (
        <Button variant="primary" onClick={levelUp.onClick} data-testid="level-up">
          Lên cấp: {levelUp.label}
        </Button>
      )}
    </div>
  );
}

/** Một ô số nốt ở tổng kết Biểu diễn. */
function Count({ label, value, tone = '', testId }: { label: string; value: string; tone?: string; testId: string }) {
  return (
    <div className="rounded-lg bg-violet-50 px-2 py-1.5 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900" data-testid={testId}>
      <dt className="text-xs text-slate-600 dark:text-slate-300">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

/** Hộp thoại tổng kết lượt Biểu diễn. */
export function PerformFinishDialog({
  title,
  breakdown,
  counts,
  durationMs,
  children,
  onRetry,
  onLibrary,
  extra,
}: {
  title: string;
  breakdown: PerformBreakdown;
  /**
   * Số nốt của lượt (`PerformanceTracker.result()`; bộ đếm đầu màn ✗ = sai + bị lỡ) — luôn hiện, kể cả khi bộ đếm đang ẩn.
   * Nốt đã đánh = đúng + sai, cùng định nghĩa với tiêu chí "Hoàn thành bài".
   */
  counts: Pick<PerformanceResult, 'notes' | 'correct' | 'wrong' | 'missed'>;
  durationMs?: number;
  /** Nhận xét AI. */
  children?: ReactNode;
  onRetry: () => void;
  onLibrary: () => void;
  /** Điểm từng tay, ô hay sai, lên cấp. */
  extra: ReactNode;
}) {
  const stars = starsFor(breakdown.score);
  return (
    <div className="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-violet-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Kết quả biểu diễn">
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-800">
        <div className="text-5xl text-amber-400 drop-shadow" aria-label={`${stars} sao`}>
          {'★'.repeat(stars)}
          <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(3 - stars)}</span>
        </div>
        <h2 className="mt-2 bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-2xl font-extrabold text-transparent dark:from-violet-300 dark:to-fuchsia-300">
          Biểu diễn xong!
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
        <div className="mt-3 text-4xl font-black tabular-nums" data-testid="perform-score">
          {breakdown.score}
          <span className="text-lg font-semibold text-slate-400">/100</span>
        </div>
        <dl className="mt-3 grid grid-cols-4 gap-2" data-testid="perform-counts">
          <Count label="Nốt đã đánh" value={`${counts.correct + counts.wrong}/${counts.notes}`} testId="perform-played" />
          <Count label="Đúng" value={String(counts.correct)} tone="text-emerald-600 dark:text-emerald-400" testId="perform-result-correct" />
          <Count label="Sai" value={String(counts.wrong)} tone="text-rose-600 dark:text-rose-400" testId="perform-result-wrong" />
          <Count label="Bị lỡ" value={String(counts.missed)} testId="perform-result-missed" />
        </dl>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-left">
          {breakdown.criteria.map((c) => (
            <Row key={c.key} label={c.label} value={pct(c.value)} testId={`criterion-${c.key}`} />
          ))}
          {durationMs !== undefined && <Row label="Thời gian" value={`${Math.round(durationMs / 1000)} giây`} />}
        </dl>
        {extra}
        {children && <div className="mt-4 text-left">{children}</div>}
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={onRetry} data-testid="perform-retry">
            Biểu diễn lại
          </Button>
          <Button variant="ghost" onClick={onLibrary}>
            Về thư viện
          </Button>
        </div>
      </div>
    </div>
  );
}
