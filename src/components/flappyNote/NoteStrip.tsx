import { liftScale } from '../../core/flappyNote/FlappyNoteGame';
import { DURATION_NAME, type FlappyNote } from '../../core/flappyNote/levels';
import { pitchToLabel, type NoteLabelStyle } from '../../core/music/notes';
import { staffCardKey } from './NoteGuide';

/**
 * Dải nốt sắp đánh ở giữa phía trên khu trò chơi (chơi có trường độ — độ khó Siêu dễ): nốt hiện tại + các nốt kế tiếp,
 * mỗi nốt vẽ trên khuông đúng trường độ, kèm cột "độ cao bay" (nốt càng dài chim bay càng cao).
 */
export function NoteStrip({ notes, svgs, labelStyle, showName }: { notes: readonly FlappyNote[]; svgs: Map<string, string> | null; labelStyle: NoteLabelStyle; showName: boolean }) {
  return (
    <ol className="pointer-events-none absolute inset-x-0 top-2 flex items-end justify-center gap-1.5 px-2" aria-label="Các nốt chuẩn bị đánh" data-testid="flappy-strip">
      {notes.map((n, i) => {
        const current = i === 0;
        // Độ cao bay tương đối ∝ vận tốc nâng² (nốt đen = 1).
        const height = liftScale(n.duration) ** 2;
        return (
          <li
            key={i}
            className={`grid justify-items-center rounded-2xl bg-white/90 p-1 shadow-sm dark:bg-slate-900/90 ${current ? 'w-28 ring-4 ring-fuchsia-400' : 'w-20 ring-1 ring-sky-200 dark:ring-slate-700'}`}
            style={{ opacity: current ? 1 : 1 - i * 0.12 }}
            data-testid={current ? 'flappy-strip-current' : undefined}
            data-duration={n.duration}
          >
            <div className="flex w-full items-end gap-1">
              <div className={`min-w-0 flex-1 [&>svg]:h-full [&>svg]:w-full ${current ? 'h-16' : 'h-12'}`} dangerouslySetInnerHTML={{ __html: svgs?.get(staffCardKey(n)) ?? '' }} />
              <div className="flex h-12 w-2 shrink-0 items-end rounded-full bg-sky-100 dark:bg-slate-700" title="Độ cao bay">
                <div className="w-full rounded-full bg-gradient-to-t from-amber-400 to-fuchsia-500" style={{ height: `${Math.min(100, height * 40)}%` }} />
              </div>
            </div>
            <span className={`font-bold ${current ? 'text-base' : 'text-sm'}`}>{showName ? pitchToLabel(n.pitch, labelStyle) : '?'}</span>
            {n.duration && <span className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">{DURATION_NAME[n.duration]}</span>}
          </li>
        );
      })}
    </ol>
  );
}
