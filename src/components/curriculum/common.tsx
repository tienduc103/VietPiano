import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { highlightedKeys } from '../../core/curriculum/keys';
import { lessonTimeline, pieceToLesson } from '../../core/curriculum/piece';
import { text, type Illustration, type Piece, type UiMode } from '../../core/curriculum/types';
import { scheduleNotes, soundOutput } from '../../core/audio/SoundOutput';
import type { InputSourceSetting } from '../../core/settings/DeviceSettings';
import { useSettings } from '../../store/settingsStore';
import { useMidi } from '../../store/midiStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { ScoreView } from '../ScoreView';
import { MicButton, MicError } from '../MicPanel';
import { MidiBadge } from '../MidiPanel';
import { Button, Icon } from '../ui';

const NO_RESULTS: never[] = [];

/** Khuông nhạc tĩnh (không con trỏ) cho hình minh hoạ / câu hỏi. */
export function StaticScore({ piece, id, showNames }: { piece: Piece; id: string; showNames?: boolean }) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const lesson = useMemo(() => pieceToLesson(piece, id), [piece, id]);
  return (
    <div className="h-48 rounded-2xl bg-white ring-1 ring-violet-100 dark:bg-slate-900 dark:ring-violet-900">
      <ScoreView lesson={lesson} index={0} results={NO_RESULTS} status="finished" wrongPulse={0} showNames={showNames ?? true} labelStyle={labelStyle} />
    </div>
  );
}

/** Phát mẫu bản nhạc bằng tiếng đàn tổng hợp. Lúc đang phát, nốt từ micro bị bỏ qua (micro nghe thấy loa). */
export function ListenButton({ piece, bpm, label = 'Nghe mẫu' }: { piece: Piece; bpm?: number; label?: string }) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => () => soundOutput.stop(), []);
  if (!soundOutput.isSupported()) return null;
  const start = () => {
    if (playing) {
      soundOutput.stop();
      setPlaying(false);
      return;
    }
    const ms = soundOutput.playSequence(scheduleNotes(lessonTimeline(pieceToLesson(piece, 'listen')), bpm ?? piece.bpm));
    setPlaying(true);
    window.setTimeout(() => setPlaying(false), ms);
  };
  return (
    <Button onClick={start} aria-pressed={playing} data-testid="listen">
      <Icon name={playing ? 'pause' : 'play'} />
      {playing ? 'Dừng' : label}
    </Button>
  );
}

/** Bàn tay với số ngón 1–5 (ngón cái = 1 ở cả hai tay). */
export function HandFigure({ hand, highlight }: { hand: 'right' | 'left'; /** Ngón được tô nổi (trò Đố số ngón tay). */ highlight?: number }) {
  // Toạ độ đầu ngón tay phải (ngón cái bên trái); tay trái lật gương.
  const fingers = [
    { n: 1, x: 32, y: 118, h: 46, rot: -38 },
    { n: 2, x: 70, y: 44, h: 70, rot: -8 },
    { n: 3, x: 102, y: 32, h: 80, rot: 0 },
    { n: 4, x: 134, y: 42, h: 72, rot: 8 },
    { n: 5, x: 162, y: 70, h: 54, rot: 18 },
  ];
  return (
    <svg viewBox="0 0 200 230" className="mx-auto h-56" role="img" aria-label={`Số ngón tay ${hand === 'right' ? 'phải' : 'trái'}`} data-testid="hand-figure">
      <g transform={hand === 'left' ? 'translate(200,0) scale(-1,1)' : undefined} className="text-amber-200 dark:text-amber-300/80">
        <rect x="52" y="110" width="116" height="100" rx="40" fill="currentColor" />
        {fingers.map((f) => (
          <rect key={f.n} x={f.x - 14} y={f.y} width="28" height={f.h + 40} rx="14" fill="currentColor" transform={`rotate(${f.rot} ${f.x} ${f.y + f.h + 40})`} />
        ))}
      </g>
      {fingers.map((f) => {
        const x = hand === 'left' ? 200 - f.x : f.x;
        return (
          <g key={f.n} data-finger={f.n} data-highlighted={highlight === f.n || undefined}>
            <circle cx={x} cy={f.y + 16} r={highlight === f.n ? 17 : 13} className={highlight === f.n ? 'fill-fuchsia-600' : highlight ? 'fill-orange-300' : 'fill-orange-500'} />
            <text x={x} y={f.y + 21} textAnchor="middle" className="fill-white text-[15px] font-bold">
              {f.n}
            </text>
          </g>
        );
      })}
      <text x="100" y="226" textAnchor="middle" className="fill-slate-500 text-[13px] dark:fill-slate-400">
        {hand === 'right' ? 'Tay phải' : 'Tay trái'}
      </text>
    </svg>
  );
}

export function IllustrationView({ ill, id }: { ill: Illustration; id: string }) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  switch (ill.type) {
    case 'keyboard': {
      const highlighted = new Set(highlightedKeys(ill.highlight, ill.from, ill.to));
      return (
        <div className="h-40 w-full" data-testid="illustration-keyboard">
          <PianoKeyboard
            from={ill.from}
            to={ill.to}
            expected={null}
            detected={null}
            flash={null}
            labelStyle={labelStyle}
            highlighted={highlighted}
            fingers={ill.fingers}
            allLabels={ill.labels}
            onPress={(m) => soundOutput.playNote(m)}
          />
        </div>
      );
    }
    case 'hand':
      return <HandFigure hand={ill.hand} />;
    case 'staff':
      return (
        <div className="grid gap-3">
          <StaticScore piece={ill.piece} id={id} />
          {ill.listen && (
            <div>
              <ListenButton piece={ill.piece} />
            </div>
          )}
        </div>
      );
    case 'counting':
      return (
        <div className="grid gap-3">
          <StaticScore piece={ill.piece} id={id} showNames={false} />
          <div className="flex flex-wrap items-center gap-2" aria-label="Cách đếm">
            <span className="text-sm text-slate-500 dark:text-slate-400">Đếm:</span>
            {ill.counts.map((c, i) => (
              <span key={i} className="rounded-lg bg-amber-100 px-3 py-1 font-mono text-lg font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
                {c}
              </span>
            ))}
          </div>
          <div>
            <ListenButton piece={ill.piece} />
          </div>
        </div>
      );
  }
}

const SOURCE_OPTIONS: { value: InputSourceSetting; label: string }[] = [
  { value: 'auto', label: 'Tự động' },
  { value: 'microphone', label: 'Micro' },
  { value: 'midi', label: 'Đàn MIDI' },
];

/** Chọn nguồn nốt (micro / đàn MIDI) + trạng thái + lỗi; bàn phím ảo luôn dùng được. */
export function InputSourceBar() {
  const source = useSettings((s) => s.settings.inputSource);
  const midiEnabled = useSettings((s) => s.settings.midiEnabled);
  const update = useSettings((s) => s.update);
  const midi = useMidi();
  const midiProblem =
    source === 'midi' && (!midiEnabled || midi.status === 'unsupported' || midi.devices.length === 0)
      ? midi.status === 'unsupported'
        ? 'Trình duyệt này không có Web MIDI (iPad / Safari) — hãy dùng micro.'
        : !midiEnabled
          ? 'Chưa bật đàn MIDI trong Cài đặt.'
          : 'Chưa thấy đàn MIDI — kiểm tra dây cắm.'
      : null;
  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="input-source">
      <div className="inline-flex rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="radiogroup" aria-label="Nguồn nốt">
        {SOURCE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={source === o.value}
            onClick={() => update({ inputSource: o.value })}
            className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${source === o.value ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {source !== 'midi' && <MicButton compact />}
      <MidiBadge />
      {midiProblem && (
        <span className="text-sm text-amber-700 dark:text-amber-300" role="alert">
          {midiProblem}
        </span>
      )}
      <div className="basis-full empty:hidden">
        <MicError />
      </div>
    </div>
  );
}

/** Phản hồi ngắn sau mỗi lần trả lời; Kids Mode có biểu tượng vui. */
export function Feedback({ kind, mode, detail, eventKey }: { kind: 'correct' | 'wrong' | null; mode: UiMode; detail?: string; eventKey: number }) {
  if (!kind) return <div className="min-h-16" />;
  const kids = mode === 'kids';
  const title = kind === 'correct' ? (kids ? '🎉 Giỏi quá!' : 'Đúng') : kids ? '💪 Thử lại nào!' : 'Chưa đúng';
  return (
    <div
      key={eventKey}
      role="status"
      aria-live="polite"
      data-testid="feedback"
      className={`min-h-16 rounded-2xl px-5 py-3 text-center ${kind === 'correct' ? 'animate-pop bg-emerald-500 text-white' : 'animate-shake bg-rose-500 text-white'} ${kids ? 'text-2xl' : 'text-lg'}`}
    >
      <div className="font-bold">{title}</div>
      {detail && <div className="text-sm opacity-90">{detail}</div>}
    </div>
  );
}

/** Dải chấm tiến độ các lượt (xanh = đúng, cam = đúng sau khi sai, đỏ = sai). */
export function RoundDots({ results, index }: { results: readonly string[]; index: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`Lượt ${index + 1}/${results.length}`} data-testid="round-dots">
      {results.map((r, i) => (
        <span
          key={i}
          className={`h-3 w-6 rounded-full ${
            r === 'correct' ? 'bg-emerald-500' : r === 'corrected' ? 'bg-amber-400' : r === 'wrong' ? 'bg-rose-500' : i === index ? 'bg-fuchsia-400' : 'bg-violet-200 dark:bg-slate-600'
          }`}
        />
      ))}
    </div>
  );
}

export function StepTitle({ title, instructions, children }: { title: string; instructions?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-bold" data-testid="step-title">
          {title}
        </h2>
        {instructions && <p className="mt-1 text-slate-600 dark:text-slate-300">{instructions}</p>}
      </div>
      {children}
    </div>
  );
}

export { text };
