import type { FlappyNote } from '../../core/flappyNote/levels';
import { staffCardKey } from './NoteGuide';

/**
 * Dải nốt sắp đánh ở giữa phía trên khu trò chơi (chơi có trường độ — độ khó Siêu dễ): nốt hiện tại thật to + các nốt kế tiếp,
 * mỗi thẻ chỉ có một đoạn khuông rất ngắn (khoá nhạc + nốt đúng trường độ), không ghi tên — để người chơi tự đọc nốt.
 */
export function NoteStrip({ notes, svgs }: { notes: readonly FlappyNote[]; svgs: Map<string, string> | null }) {
  return (
    <ol className="pointer-events-none absolute inset-x-0 top-2 flex items-start justify-center gap-2 px-2" aria-label="Các nốt chuẩn bị đánh" data-testid="flappy-strip">
      {notes.map((n, i) => {
        const current = i === 0;
        return (
          <li
            key={i}
            className={`rounded-2xl bg-white/95 px-1 text-slate-900 shadow-md dark:bg-slate-900/95 dark:text-slate-100 ${current ? 'h-36 ring-4 ring-fuchsia-400' : 'mt-3 h-24 ring-1 ring-sky-200 dark:ring-slate-700'}`}
            style={{ opacity: current ? 1 : 1 - i * 0.12 }}
            data-testid={current ? 'flappy-strip-current' : undefined}
            data-duration={n.duration}
          >
            <div className="h-full [&>svg]:h-full [&>svg]:w-auto" dangerouslySetInnerHTML={{ __html: svgs?.get(staffCardKey(n)) ?? '' }} />
          </li>
        );
      })}
    </ol>
  );
}
