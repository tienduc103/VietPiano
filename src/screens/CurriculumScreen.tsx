import { useState } from 'react';
import { CURRICULUM } from '../core/curriculum/content/curriculum';
import { text } from '../core/curriculum/types';
import { lessonStatus, levelProgress, missingPrerequisites, type LessonStatus } from '../core/curriculum/unlock';
import { lessonManager } from '../core/lessons/LessonManager';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { AppVersion } from '../components/AppVersion';

const STATUS: Record<LessonStatus, { label: string; tone: string }> = {
  completed: { label: '✓ Hoàn thành', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  'in-progress': { label: 'Đang học', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  available: { label: 'Đã mở', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200' },
  'suggest-later': { label: 'Nên học sau', tone: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
};

/** Curriculum Browser — 6 cấp độ → tuần → buổi, kèm trạng thái từng buổi. */
export function CurriculumScreen({ levelId }: { levelId?: string }) {
  const navigate = useApp((s) => s.navigate);
  const openLesson = useApp((s) => s.openLesson);
  const records = useCurriculum((s) => s.records);
  const [selected, setSelected] = useState(levelId ?? CURRICULUM.levels[0].levelId);
  const level = CURRICULUM.levels.find((l) => l.levelId === selected) ?? CURRICULUM.levels[0];
  const lessonsById = new Map(level.lessons.map((l) => [l.lessonId, l]));

  return (
    <div className="h-full overflow-y-auto" data-testid="curriculum">
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex items-center gap-3 pl-10">
          <Button variant="ghost" onClick={() => navigate({ name: 'dashboard' })} aria-label="Về trang chủ" className="px-2">
            <Icon name="back" />
          </Button>
          <h1 className="flex-1 text-3xl font-bold">{text(CURRICULUM.title)}</h1>
          <FullscreenButton />
        </header>

        <nav className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Cấp độ">
          {CURRICULUM.levels.map((l) => {
            const p = l.availability === 'available' ? levelProgress(l, records) : null;
            return (
              <button
                key={l.levelId}
                type="button"
                onClick={() => setSelected(l.levelId)}
                aria-pressed={l.levelId === level.levelId}
                data-testid={`level-${l.number}`}
                className={`min-h-20 rounded-2xl p-3 text-left ring-2 transition-colors ${
                  l.levelId === level.levelId ? 'bg-fuchsia-500 text-white ring-fuchsia-300' : 'bg-white/90 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900'
                }`}
              >
                <div className="text-sm font-semibold">Cấp {l.number}</div>
                <div className="text-xs opacity-80">{p ? `${p.completed}/${p.total} buổi` : 'Sắp có'}</div>
              </button>
            );
          })}
        </nav>

        <section className="mt-6">
          <h2 className="text-2xl font-bold">{text(level.title)}</h2>
          <p className="mt-1 text-slate-600 dark:text-slate-300">{text(level.description)}</p>
          {level.availability === 'coming-soon' && (
            <p className="mt-4 rounded-2xl bg-slate-100 p-5 text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid="coming-soon">
              Cấp độ này đang được soạn — chưa có bài học. Hãy hoàn thành cấp trước.
            </p>
          )}
        </section>

        {level.weeks.map((w) => (
          <section key={w.weekId} className="mt-8" data-testid={w.weekId}>
            <h3 className="text-lg font-semibold">{text(w.title)}</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">{text(w.description)}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {w.lessonIds.map((id) => {
                const l = lessonsById.get(id)!;
                const status = lessonStatus(l, records);
                const rec = records[id];
                const missing = missingPrerequisites(l, records).length > 0;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigate({ name: 'lesson', lessonId: id })}
                    data-testid={`cur-lesson-${id}`}
                    data-status={status}
                    className={`flex min-h-28 flex-col rounded-2xl bg-white/90 p-4 text-left shadow-sm ring-1 ring-violet-100 transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-800/90 dark:ring-violet-900 ${status === 'suggest-later' ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        Buổi {l.number}
                        {l.assessment.checkpoint ? ' · Kiểm tra' : ''}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[status].tone}`}>{STATUS[status].label}</span>
                    </div>
                    <span className="mt-1 text-lg font-semibold">{text(l.title)}</span>
                    <span className="mt-auto pt-2 text-sm text-slate-500 dark:text-slate-400">
                      ~{l.estimatedDuration} phút
                      {rec && rec.attempts > 0 ? ` · cao nhất ${rec.bestScore}` : ''}
                      {missing && status !== 'completed' ? ' · nên học buổi trước' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {w.extraPractice && w.extraPractice.length > 0 && (
              <details className="mt-3 rounded-2xl bg-violet-50/70 p-3 ring-1 ring-violet-100 dark:bg-slate-800/60 dark:ring-violet-900">
                <summary className="min-h-10 cursor-pointer content-center font-semibold">Luyện thêm ({w.extraPractice.length} bài trong thư viện)</summary>
                <ul className="mt-2 grid gap-2">
                  {w.extraPractice.map((x) => {
                    const lib = lessonManager.get(x.lessonId);
                    if (!lib) return null;
                    return (
                      <li key={x.lessonId}>
                        <button type="button" onClick={() => openLesson(x.lessonId)} className="min-h-12 w-full rounded-xl px-3 py-2 text-left hover:bg-violet-100 dark:hover:bg-slate-700" data-testid={`extra-${x.lessonId}`}>
                          <span className="font-semibold">{lib.title}</span>
                          <span className="block text-sm text-slate-500 dark:text-slate-400">{text(x.tip)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
          </section>
        ))}
      </div>
      <AppVersion className="pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
