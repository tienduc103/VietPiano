import { memo } from 'react';
import type { Finger } from '../core/lessons/types';
import { isBlackKey, midiToLabel, midiToPitchClass, type NoteLabelStyle } from '../core/music/notes';

interface Props {
  from: number;
  to: number;
  /** Nốt cần đánh (tô viền). */
  expected: number | null;
  /** Ngón tay gợi ý cho nốt cần đánh (bài cho bé). */
  expectedFinger?: Finger;
  /** Nốt micro đang nghe thấy. */
  detected: number | null;
  /** Kết quả lần đánh gần nhất. */
  flash: { midi: number; kind: 'correct' | 'wrong' } | null;
  labelStyle: NoteLabelStyle;
  /** Ký tự bàn phím máy tính tương ứng (demo mode). */
  keyHints?: Map<number, string>;
  onPress: (midi: number) => void;
  /** Thả phím (để chấm trường độ). */
  onRelease?: (midi: number) => void;
  /** Các phím tô sáng (hình minh hoạ giáo trình). */
  highlighted?: ReadonlySet<number>;
  /** Số ngón vẽ trên từng phím (hình minh hoạ thế tay). */
  fingers?: Readonly<Record<number, number>>;
  /** Hiện tên mọi phím trắng (mặc định chỉ hiện nốt Đô và nốt cần đánh). */
  allLabels?: boolean;
}

function keyClasses(midi: number, black: boolean, p: Props): string {
  if (p.flash?.midi === midi) return p.flash.kind === 'correct' ? 'bg-emerald-400! text-white' : 'bg-rose-500! text-white';
  if (p.detected === midi) return black ? 'bg-cyan-500!' : 'bg-cyan-200! dark:bg-cyan-700!';
  if (p.expected === midi) return black ? 'bg-fuchsia-500! ring-4 ring-fuchsia-300' : 'bg-fuchsia-100! ring-4 ring-inset ring-fuchsia-500 dark:bg-fuchsia-200!';
  if (p.highlighted?.has(midi)) return black ? 'bg-amber-500! ring-2 ring-amber-300' : 'bg-amber-100! ring-4 ring-inset ring-amber-400 dark:bg-amber-200!';
  return '';
}

export const PianoKeyboard = memo(function PianoKeyboard(props: Props) {
  const { from, to, labelStyle, keyHints, onPress, onRelease, fingers, allLabels } = props;
  const whites: number[] = [];
  const blacks: { midi: number; whiteIndex: number }[] = [];
  for (let m = from; m <= to; m++) {
    if (isBlackKey(m)) blacks.push({ midi: m, whiteIndex: whites.length });
    else whites.push(m);
  }
  const whiteWidth = 100 / whites.length;

  const press = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    onPress(midi);
  };
  const release = (midi: number) => (onRelease ? () => onRelease(midi) : undefined);
  const fingerOf = (midi: number) => (props.expected === midi && props.expectedFinger) || fingers?.[midi];

  return (
    <div className="relative h-full w-full touch-none select-none" role="group" aria-label="Bàn phím piano ảo">
      <div className="flex h-full">
        {whites.map((m) => (
          <button
            key={m}
            type="button"
            aria-label={midiToLabel(m, labelStyle)}
            data-midi={m}
            data-highlighted={props.highlighted?.has(m) || undefined}
            onPointerDown={press(m)}
            onPointerUp={release(m)}
            onPointerLeave={release(m)}
            className={`relative flex flex-1 flex-col items-center justify-end rounded-b-lg border border-slate-300 bg-white pb-1.5 text-[11px] font-semibold text-slate-500 transition-colors active:bg-slate-200 dark:border-slate-600 dark:bg-slate-200 dark:text-slate-600 ${keyClasses(m, false, props)}`}
          >
            {keyHints?.get(m) && (
              <span className="mb-0.5 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400 uppercase dark:bg-slate-300">
                {keyHints.get(m)}
              </span>
            )}
            {fingerOf(m) && (
              <span className="mb-1 grid size-7 place-items-center rounded-full bg-orange-500 text-base font-bold text-white" data-testid="key-finger">
                {fingerOf(m)}
              </span>
            )}
            {allLabels || midiToPitchClass(m) === 0 || props.expected === m ? midiToLabel(m, labelStyle) : ''}
          </button>
        ))}
      </div>
      {blacks.map(({ midi, whiteIndex }) => (
        <button
          key={midi}
          type="button"
          aria-label={midiToLabel(midi, labelStyle)}
          data-midi={midi}
          data-highlighted={props.highlighted?.has(midi) || undefined}
          onPointerDown={press(midi)}
          onPointerUp={release(midi)}
          onPointerLeave={release(midi)}
          style={{ left: `${whiteIndex * whiteWidth - whiteWidth * 0.32}%`, width: `${whiteWidth * 0.64}%` }}
          className={`absolute top-0 flex h-[60%] items-end justify-center rounded-b-md bg-gradient-to-b from-slate-700 to-slate-950 pb-1 text-[10px] text-slate-400 shadow-md active:bg-slate-700 dark:bg-black ${keyClasses(midi, true, props)}`}
        >
          {fingerOf(midi) && <span className="mb-1 grid size-6 place-items-center rounded-full bg-orange-500 text-sm font-bold text-white">{fingerOf(midi)}</span>}
          {keyHints?.get(midi) && <span className="font-mono uppercase">{keyHints.get(midi)}</span>}
        </button>
      ))}
    </div>
  );
});
