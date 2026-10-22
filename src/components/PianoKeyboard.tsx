import { memo } from 'react';
import { isBlackKey, midiToLabel, midiToPitchClass, type NoteLabelStyle } from '../core/music/notes';

interface Props {
  from: number;
  to: number;
  /** Nốt cần đánh (tô viền). */
  expected: number | null;
  /** Nốt micro đang nghe thấy. */
  detected: number | null;
  /** Kết quả lần đánh gần nhất. */
  flash: { midi: number; kind: 'correct' | 'wrong' } | null;
  labelStyle: NoteLabelStyle;
  /** Ký tự bàn phím máy tính tương ứng (demo mode). */
  keyHints?: Map<number, string>;
  onPress: (midi: number) => void;
}

function keyClasses(midi: number, black: boolean, p: Props): string {
  if (p.flash?.midi === midi) return p.flash.kind === 'correct' ? 'bg-green-500! text-white' : 'bg-red-500! text-white';
  if (p.detected === midi) return black ? 'bg-sky-600!' : 'bg-sky-200! dark:bg-sky-700!';
  if (p.expected === midi) return black ? 'bg-indigo-500! ring-4 ring-indigo-400' : 'bg-indigo-100! ring-4 ring-inset ring-indigo-500 dark:bg-indigo-900!';
  return '';
}

export const PianoKeyboard = memo(function PianoKeyboard(props: Props) {
  const { from, to, labelStyle, keyHints, onPress } = props;
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

  return (
    <div className="relative h-full w-full touch-none select-none" role="group" aria-label="Bàn phím piano ảo">
      <div className="flex h-full">
        {whites.map((m) => (
          <button
            key={m}
            type="button"
            aria-label={midiToLabel(m, labelStyle)}
            data-midi={m}
            onPointerDown={press(m)}
            className={`relative flex flex-1 flex-col items-center justify-end rounded-b-lg border border-slate-300 bg-white pb-1.5 text-[11px] font-semibold text-slate-500 transition-colors active:bg-slate-200 dark:border-slate-600 dark:bg-slate-200 dark:text-slate-600 ${keyClasses(m, false, props)}`}
          >
            {keyHints?.get(m) && (
              <span className="mb-0.5 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400 uppercase dark:bg-slate-300">
                {keyHints.get(m)}
              </span>
            )}
            {midiToPitchClass(m) === 0 || props.expected === m ? midiToLabel(m, labelStyle) : ''}
          </button>
        ))}
      </div>
      {blacks.map(({ midi, whiteIndex }) => (
        <button
          key={midi}
          type="button"
          aria-label={midiToLabel(midi, labelStyle)}
          data-midi={midi}
          onPointerDown={press(midi)}
          style={{ left: `${whiteIndex * whiteWidth - whiteWidth * 0.32}%`, width: `${whiteWidth * 0.64}%` }}
          className={`absolute top-0 flex h-[60%] items-end justify-center rounded-b-md bg-slate-900 pb-1 text-[10px] text-slate-400 shadow-md active:bg-slate-700 dark:bg-black ${keyClasses(midi, true, props)}`}
        >
          {keyHints?.get(midi) && <span className="font-mono uppercase">{keyHints.get(midi)}</span>}
        </button>
      ))}
    </div>
  );
});
