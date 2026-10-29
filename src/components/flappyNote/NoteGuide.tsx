import type { FlappyNote } from '../../core/flappyNote/levels';
import { DURATION_NAME, FINGER_NAME } from '../../core/flappyNote/levels';
import { pitchToLabel, type NoteLabelStyle } from '../../core/music/notes';
import { HandFigure } from '../curriculum/common';

const HAND_NAME = { right: 'Phải', left: 'Trái' } as const;

/** Khoá thẻ khuông vẽ sẵn của một nốt: cao độ + trường độ (không trường độ → nốt tròn). */
export const staffCardKey = (n: Pick<FlappyNote, 'midi' | 'duration'>) => `${n.midi}/${n.duration ?? 'w'}`;

/**
 * Khu A của Flappy Note: nốt cần đánh trên khuông (SVG vẽ sẵn), tên nốt, ngón + tay gợi ý (hình bàn tay sáng ngón),
 * và 3 nốt tiếp theo. Đổi ngay khi nốt mục tiêu đổi (chỉ thay SVG đã có, không vẽ lại VexFlow).
 */
export function NoteGuide({
  target,
  upcoming,
  svgs,
  labelStyle,
  showName,
  showFinger,
  showUpcoming,
  kids,
  flash,
}: {
  target: FlappyNote;
  upcoming: readonly FlappyNote[];
  svgs: Map<string, string> | null;
  labelStyle: NoteLabelStyle;
  showName: boolean;
  showFinger: boolean;
  showUpcoming: boolean;
  kids: boolean;
  /** Phản hồi lần đánh gần nhất (viền khung nốt). */
  flash: 'hit' | 'wrong' | null;
}) {
  const other: NoteLabelStyle = labelStyle === 'letter' ? 'solfege' : 'letter';
  const ring = flash === 'hit' ? 'ring-emerald-400' : flash === 'wrong' ? 'ring-rose-400 animate-shake' : 'ring-sky-200 dark:ring-sky-800';
  return (
    <section className="grid min-h-0 grid-cols-[minmax(9rem,14rem)_1fr_auto] items-center gap-3 rounded-3xl bg-white/90 p-2 shadow-sm ring-1 ring-sky-100 sm:grid-cols-[minmax(10rem,16rem)_1fr_auto_auto] dark:bg-slate-800/90 dark:ring-slate-700" aria-label="Hướng dẫn nốt nhạc" data-testid="flappy-guide">
      <div key={`${target.midi}-${flash}`} className={`h-24 rounded-2xl bg-white p-1 ring-4 sm:h-28 dark:bg-slate-900 ${ring}`} data-testid="flappy-target-staff" data-midi={target.midi}>
        {svgs?.get(staffCardKey(target)) ? (
          <div className="h-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs.get(staffCardKey(target))! }} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">Đang vẽ khuông…</div>
        )}
      </div>
      <div className="grid min-w-0 gap-0.5" aria-live="polite">
        <p className="text-sm text-slate-500 dark:text-slate-400">Nốt cần đánh</p>
        <p className={`font-extrabold leading-none text-violet-700 dark:text-violet-300 ${kids ? 'text-5xl' : 'text-4xl'}`} data-testid="flappy-target-name">
          {showName ? (
            <>
              {pitchToLabel(target.pitch, labelStyle)} <span className="text-2xl font-bold text-slate-500 dark:text-slate-400">{pitchToLabel(target.pitch, other)}</span>
            </>
          ) : (
            '?'
          )}
        </p>
        {target.duration && (
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-300" data-testid="flappy-target-duration">
            {DURATION_NAME[target.duration]}
          </p>
        )}
        {showFinger && (
          <p className="text-lg font-semibold" data-testid="flappy-target-finger">
            {target.finger ? `Ngón ${target.finger} – ${FINGER_NAME[target.finger]}` : 'Tự chọn ngón'} · Tay {HAND_NAME[target.hand]}
          </p>
        )}
      </div>
      {showFinger && <HandFigure hand={target.hand} highlight={target.finger} className="h-24 sm:h-28" />}
      {showUpcoming && (
        <div className="col-span-full grid gap-1 sm:col-span-1" data-testid="flappy-upcoming">
          <p className="text-xs text-slate-500 dark:text-slate-400">Tiếp theo</p>
          <ol className="flex gap-1.5">
            {upcoming.map((n, i) => (
              <li key={i} className="grid w-20 justify-items-center rounded-xl bg-sky-50 p-1 ring-1 ring-sky-100 dark:bg-slate-700/60 dark:ring-slate-600" style={{ opacity: 1 - i * 0.22 }}>
                <div className="h-12 w-full rounded-lg bg-white dark:bg-slate-900 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs?.get(staffCardKey(n)) ?? '' }} />
                <span className="text-sm font-bold">{showName ? pitchToLabel(n.pitch, labelStyle) : '?'}</span>
                {showFinger && n.finger && <span className="text-xs text-slate-500 dark:text-slate-400">ngón {n.finger}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
