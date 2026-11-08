import { useMemo } from 'react';
import { DISCOVERY, DISCOVERY_NOTE } from '../core/curriculum/content/discovery';
import { text } from '../core/curriculum/types';
import { levelProgress, lessonStatus, orderedLessons } from '../core/curriculum/unlock';
import { useApp } from '../store/appStore';
import { PinShortcutButton } from '../components/shortcuts/PinShortcutButton';
import { useCurriculum } from '../store/curriculumStore';
import { useUiMode } from '../hooks/useUiMode';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { useNoteCards } from '../components/balloonPop/useNoteCards';

const STATUS_LABEL = { available: 'Chưa học', 'suggest-later': 'Chưa học', 'in-progress': 'Đang học', completed: 'Đã đạt' } as const;
/** Biểu tượng các buổi không phải buổi nốt. */
const LESSON_ICON: Record<string, string> = { 'nd-keyboard': '🎹', 'nd-staff': '🎼', 'nd-melody': '🎵', 'nd-review': '🏆' };

/** Hình nốt kiểu thẻ bóng bay: khuông ngắn + nốt đen, không khoá. */
function NoteFigure({ svg }: { svg: string | undefined }) {
  return <span className="h-28 w-20 [&>svg]:h-full [&>svg]:w-full" aria-hidden data-testid="discovery-note-figure" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />;
}

/**
 * "Khám phá nốt nhạc": danh sách 11 buổi theo tuần. Mỗi thẻ mở buổi học (route `lesson`, chạy bằng LessonPlayer như
 * "Làm quen từng nốt"). Thứ tự chỉ là gợi ý — buổi nào cũng mở được; buổi nên học tiếp có viền nổi.
 */
export function NoteDiscoveryScreen() {
  const navigate = useApp((s) => s.navigate);
  const records = useCurriculum((s) => s.records);
  const mode = useUiMode();
  const kids = mode === 'kids';
  const level = DISCOVERY.levels[0];
  const lessons = orderedLessons(level);
  const progress = levelProgress(level, records);
  const cards = useMemo(() => Object.entries(DISCOVERY_NOTE).map(([key, n]) => ({ key, midi: n.midi, duration: 'q' as const })), []);
  const figures = useNoteCards(cards, 'treble');

  return (
    <div className="h-full overflow-y-auto" data-testid="note-discovery" data-ui-mode={mode}>
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button variant="ghost" className="px-2" aria-label="Về trang chủ" onClick={() => navigate({ name: 'dashboard' })}>
            <Icon name="back" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-500 dark:text-slate-400">Mỗi buổi một nốt mới + ôn nốt cũ</div>
            <h1 className="text-2xl font-extrabold">{text(level.title)}</h1>
          </div>
          <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-bold text-violet-800 dark:bg-violet-950 dark:text-violet-200" data-testid="discovery-progress">
            Đã đạt {progress.completed}/{progress.total}
          </span>
          <PinShortcutButton target={{ type: 'page', id: 'note-discovery' }} />
          <FullscreenButton />
        </header>
        <p className={`mt-3 ${kids ? 'text-xl' : 'text-lg'} text-slate-600 dark:text-slate-300`}>
          {kids ? 'Mỗi buổi bé làm quen một nốt mới rồi chơi cùng các nốt đã học: xem hình, nghe tiếng, giải câu đố, tìm phím, chơi trò chơi!' : text(level.description)}
        </p>

        {level.weeks.map((week) => (
          <section key={week.weekId} className="mt-7" aria-label={text(week.title)}>
            <h2 className="text-lg font-extrabold">{text(week.title)}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{text(week.description)}</p>
            <ol className="mt-3 grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {lessons
                .filter((l) => l.weekId === week.weekId)
                .map((l) => {
                  const note = DISCOVERY_NOTE[l.lessonId];
                  const status = lessonStatus(l, records);
                  const rec = records[l.lessonId];
                  const isNext = progress.next?.lessonId === l.lessonId;
                  return (
                    <li key={l.lessonId}>
                      <button
                        type="button"
                        onClick={() => navigate({ name: 'lesson', lessonId: l.lessonId })}
                        data-testid={`discovery-lesson-${l.lessonId}`}
                        data-status={status}
                        aria-current={isNext ? 'step' : undefined}
                        className={`grid min-h-48 w-full content-start justify-items-center gap-1.5 rounded-3xl p-5 text-white shadow-lg transition-transform active:scale-95 ${
                          status === 'completed'
                            ? 'bg-gradient-to-br from-emerald-600 to-teal-500 shadow-emerald-500/30'
                            : 'bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-fuchsia-500/30'
                        } ${isNext ? 'ring-4 ring-amber-300 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : ''}`}
                      >
                        <span className="text-sm font-semibold opacity-90">Buổi {l.number}</span>
                        {note ? (
                          <NoteFigure svg={figures?.get(l.lessonId)} />
                        ) : (
                          <span className="grid h-28 place-items-center text-6xl" aria-hidden>
                            {LESSON_ICON[l.lessonId] ?? '🎶'}
                          </span>
                        )}
                        <span className="text-center text-lg leading-tight font-extrabold">{text(l.title)}</span>
                        <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
                          {isNext && status !== 'in-progress' ? 'Học tiếp' : STATUS_LABEL[status]}
                          {rec && rec.attempts > 0 ? ` · ${rec.bestScore} điểm` : ''}
                        </span>
                        <span className="text-sm opacity-90">~{l.estimatedDuration} phút</span>
                      </button>
                    </li>
                  );
                })}
            </ol>
          </section>
        ))}
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
          Thứ tự buổi chỉ là gợi ý: buổi nào cũng mở được. Cách dạy giống "Làm quen nốt" (giới thiệu → câu đố → luyện phím → trò chơi), nhưng mỗi buổi còn trộn các nốt
          đã học để bé phân biệt và nhớ lâu.
        </p>
      </div>
      <AppVersion className="pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
