import { useEffect, useMemo, useState } from 'react';
import type { AiLinkMonitor } from '../../core/coach/ai/link';
import type { RecorderState } from '../../core/coach/recorder/PerformanceRecorder';
import type { ScoreReference } from '../../core/coach/types';
import type { Lesson } from '../../core/lessons/types';
import type { NoteLabelStyle } from '../../core/music/notes';
import { keyboardRange } from '../../core/input/keyMapping';
import { PianoKeyboard } from '../PianoKeyboard';
import { Button, Icon, formatDuration } from '../ui';
import { AiLinkChip } from './AiLinkStatus';
import { CoachScoreView } from './CoachScoreView';

interface Props {
  lesson: Lesson;
  reference: ScoreReference;
  state: RecorderState;
  countIn: number | null;
  cursor: { staff: 'melody' | 'accompaniment'; index: number } | null;
  measure: number | null;
  labelStyle: NoteLabelStyle;
  inputLabel: string;
  pedalAvailable: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onAbort: () => void;
  onPress: (midi: number) => void;
  onRelease: (midi: number) => void;
  busy: boolean;
  /** Trạng thái kết nối AI cục bộ (chỉ hiển thị; trong lúc đánh không gửi gì cho AI). */
  aiLink: AiLinkMonitor;
}

/**
 * Màn đang ghi: khuông nhạc + con trỏ bám vị trí, bàn phím ảo (tô phím đang giữ trên đàn MIDI; bấm được), đèn ghi, thời gian,
 * số nốt, ô hiện tại / tổng số ô, trạng thái AI cục bộ, Tạm dừng / Tiếp tục / Kết thúc. Không gọi AI, không chấm trong lúc chơi
 * (chip AI chỉ kiểm tra kết nối định kỳ).
 */
export function CoachRecording(p: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((x) => x + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const keys = useMemo(() => keyboardRange(p.reference.notes.length ? p.reference.notes.map((n) => n.midi) : [60, 72]), [p.reference]);
  const held = useMemo(() => new Set(p.state.held), [p.state.held]);
  const paused = p.state.status === 'paused';
  const last = p.reference.printedMeasures[p.reference.printedMeasures.length - 1];
  return (
    <div className="mt-5 grid grid-cols-1 gap-4" data-testid="coach-recording" data-status={p.state.status}>
      {/* Hai hàng cố định: chữ trạng thái AI / pedal đổi độ dài không làm thanh xuống dòng → khuông không nhảy lúc đang đánh. */}
      <div className="grid gap-2 rounded-2xl bg-white/80 p-3 ring-1 ring-violet-100 dark:bg-slate-800/80 dark:ring-violet-900">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-2 font-bold ${paused ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400'}`} data-testid="coach-rec-status">
            <span aria-hidden className={paused ? '' : 'animate-pulse'}>
              {paused ? '⏸' : '●'}
            </span>
            {paused ? 'Tạm dừng' : 'Đang ghi'}
          </span>
          <span className="tabular-nums">{formatDuration(p.state.activeMs)}</span>
          <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="coach-rec-notes">
            {p.state.notes} nốt đã ghi
          </span>
          <span className="text-sm" data-testid="coach-rec-measure">
            Ô {p.measure ?? '—'}/{last}
          </span>
          <span className="flex-1" />
          {paused ? (
            <Button onClick={p.onResume} data-testid="coach-resume">
              <Icon name="play" className="h-5 w-5" /> Tiếp tục
            </Button>
          ) : (
            <Button onClick={p.onPause} data-testid="coach-pause">
              <Icon name="pause" className="h-5 w-5" /> Tạm dừng
            </Button>
          )}
          <Button variant="primary" onClick={p.onStop} disabled={p.busy} data-testid="coach-stop">
            <Icon name="check" className="h-5 w-5" /> Kết thúc & chấm
          </Button>
          <Button variant="ghost" onClick={p.onAbort} disabled={p.busy}>
            Huỷ
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="coach-rec-input">
            {p.inputLabel}
            {p.pedalAvailable ? ` · pedal ${p.state.sustainDown ? 'đang đạp' : 'nhả'}` : ''}
          </span>
          <span className="flex-1" />
          <AiLinkChip monitor={p.aiLink} />
        </div>
      </div>
      <div className="relative min-w-0">
        <CoachScoreView lesson={p.lesson} reference={p.reference} result={null} labelStyle={p.labelStyle} cursor={p.cursor} height={240} />
        {p.countIn !== null && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-live="assertive">
            <span className="rounded-3xl bg-white/90 px-8 py-4 text-6xl font-extrabold text-fuchsia-600 shadow-lg dark:bg-slate-900/90 dark:text-fuchsia-300" data-testid="coach-countin">
              {p.countIn}
            </span>
          </div>
        )}
      </div>
      <div className="h-[22vh] min-h-32 min-w-0" data-testid="coach-keyboard">
        <PianoKeyboard from={keys.from} to={keys.to} expected={null} detected={null} flash={null} labelStyle={p.labelStyle} highlighted={held} onPress={p.onPress} onRelease={p.onRelease} />
      </div>
      <p className="text-center text-xs text-slate-500 dark:text-slate-400">Chơi một mạch tới hết rồi bấm "Kết thúc & chấm". Bàn phím máy tính: hàng A S D F… từ nốt Đô giữa.</p>
    </div>
  );
}
