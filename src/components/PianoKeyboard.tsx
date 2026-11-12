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
  /** Các phím tô sáng (hình minh hoạ giáo trình; tay trái ở bài hai tay). */
  highlighted?: ReadonlySet<number>;
  /** Phím cần đánh thêm của chùm nốt tay phải (nốt hoà âm), tô cùng màu nốt cần đánh nhưng nhạt hơn. */
  expectedExtra?: ReadonlySet<number>;
  /** Số ngón vẽ trên từng phím (hình minh hoạ thế tay). */
  fingers?: Readonly<Record<number, number>>;
  /** Hiện tên mọi phím trắng (mặc định chỉ hiện nốt Đô và nốt cần đánh). */
  allLabels?: boolean;
  /** Chữ trên từng phím trắng (thay cách hiện mặc định); "" = ẩn tên phím đó. */
  labelFor?: (midi: number) => string;
}

function keyClasses(midi: number, black: boolean, p: Props): string {
  if (p.flash?.midi === midi)
    return p.flash.kind === 'correct'
      ? 'from-emerald-400! via-emerald-500! to-emerald-500! bg-emerald-500! text-white! border-b-emerald-700!'
      : 'from-rose-500! via-rose-600! to-rose-600! bg-rose-500! text-white! border-b-rose-800!';
  if (p.detected === midi)
    return black
      ? 'from-cyan-500! to-cyan-600! bg-cyan-500! text-white! ring-2 ring-cyan-300'
      : 'from-cyan-100! to-cyan-200! bg-cyan-200! dark:from-cyan-700! dark:to-cyan-800! dark:bg-cyan-700!';
  if (p.expected === midi)
    return black
      ? 'from-fuchsia-500! to-fuchsia-600! bg-fuchsia-500! text-white! ring-4 ring-fuchsia-300/90'
      : 'from-fuchsia-50! to-fuchsia-100! bg-fuchsia-100! ring-4 ring-inset ring-fuchsia-500 dark:from-fuchsia-200! dark:to-fuchsia-300! dark:bg-fuchsia-200!';
  if (p.expectedExtra?.has(midi))
    return black
      ? 'from-fuchsia-400! to-fuchsia-500! bg-fuchsia-400! ring-2 ring-fuchsia-200'
      : 'from-fuchsia-50/70! to-fuchsia-50! bg-fuchsia-50! ring-4 ring-inset ring-fuchsia-300 dark:from-fuchsia-100! dark:to-fuchsia-200! dark:bg-fuchsia-100!';
  if (p.highlighted?.has(midi))
    return black
      ? 'from-amber-500! to-amber-600! bg-amber-500! ring-2 ring-amber-300'
      : 'from-amber-50! to-amber-100! bg-amber-100! ring-4 ring-inset ring-amber-400 dark:from-amber-200! dark:to-amber-300! dark:bg-amber-200!';
  return '';
}

/** Tâm phím `midi` theo % bề ngang bàn phím [from, to] — cùng cách chia như PianoKeyboard (để căn làn nốt rơi). */
export function keyCenterPercent(midi: number, from: number, to: number): number {
  let whites = 0;
  let before = 0;
  for (let m = from; m <= to; m++) {
    if (isBlackKey(m)) continue;
    if (m < midi) before++;
    whites++;
  }
  const w = 100 / whites;
  return isBlackKey(midi) ? before * w : (before + 0.5) * w;
}

export const PianoKeyboard = memo(function PianoKeyboard(props: Props) {
  const { from, to, labelStyle, keyHints, onPress, onRelease, fingers, allLabels, labelFor } = props;
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
            data-expected-extra={props.expectedExtra?.has(m) || undefined}
            onPointerDown={press(m)}
            onPointerUp={release(m)}
            onPointerLeave={release(m)}
            className={`relative flex flex-1 flex-col items-center justify-end rounded-b-lg border-x border-t border-b-4 border-slate-300/90 border-b-slate-300 bg-gradient-to-b from-slate-50/60 via-white to-white pb-1.5 text-[11px] font-semibold text-slate-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-75 active:border-b-2 active:bg-slate-200 dark:border-slate-600 dark:border-b-slate-700 dark:from-slate-200 dark:via-slate-100 dark:to-slate-200 dark:text-slate-700 ${keyClasses(m, false, props)}`}
          >
            {keyHints?.get(m) && (
              <span className="mb-0.5 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400 uppercase ring-1 ring-slate-200/70 dark:bg-slate-300 dark:text-slate-600">
                {keyHints.get(m)}
              </span>
            )}
            {fingerOf(m) && (
              <span className="mb-1 grid size-7 place-items-center rounded-full bg-gradient-to-b from-orange-400 to-orange-600 text-base font-bold text-white shadow-sm ring-1 ring-white/50" data-testid="key-finger">
                {fingerOf(m)}
              </span>
            )}
            {labelFor ? labelFor(m) : allLabels || midiToPitchClass(m) === 0 || props.expected === m ? midiToLabel(m, labelStyle) : ''}
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
          data-expected-extra={props.expectedExtra?.has(midi) || undefined}
          onPointerDown={press(midi)}
          onPointerUp={release(midi)}
          onPointerLeave={release(midi)}
          style={{ left: `${whiteIndex * whiteWidth - whiteWidth * 0.32}%`, width: `${whiteWidth * 0.64}%` }}
          className={`absolute top-0 flex h-[60%] items-end justify-center rounded-b-md border-x border-b-4 border-slate-900 border-b-slate-950 bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 pb-1 text-[10px] font-medium text-slate-300 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.15)] transition-all duration-75 active:border-b-2 active:from-slate-600 dark:from-slate-800 dark:to-black ${keyClasses(midi, true, props)}`}
        >
          {fingerOf(midi) && <span className="mb-1 grid size-6 place-items-center rounded-full bg-gradient-to-b from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm ring-1 ring-white/40">{fingerOf(midi)}</span>}
          {keyHints?.get(midi) && <span className="font-mono uppercase">{keyHints.get(midi)}</span>}
        </button>
      ))}
    </div>
  );
});
