import { useMemo } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import type { Lesson } from '../core/lessons/types';
import { computeTotals, type LessonProgress } from '../core/storage/ProgressStorage';
import { useApp } from '../store/appStore';
import { Button, Card, FullscreenButton, Icon, formatDuration } from '../components/ui';
import { AppVersion } from '../components/AppVersion';

export function LibraryScreen() {
  const progress = useApp((s) => s.progress);
  const recent = useApp((s) => s.recent);
  const openLesson = useApp((s) => s.openLesson);
  const navigate = useApp((s) => s.navigate);
  const totals = useMemo(() => computeTotals(progress), [progress]);
  const groups = lessonManager.byCategory();
  const recentLessons = recent.map((id) => lessonManager.get(id)).filter((l): l is Lesson => !!l);
  const attempts = totals.totalCorrect + totals.totalWrong;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 pt-[calc(max(1.5rem,env(safe-area-inset-top))+var(--fullscreen-top-gap))] pb-10">
        <header className="flex items-center gap-4">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-12 w-12" />
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">VietPiano</h1>
            <p className="text-slate-500 dark:text-slate-400">Đánh đúng nốt — bản nhạc tự chuyển tiếp.</p>
          </div>
          <FullscreenButton />
          <Button onClick={() => navigate({ name: 'settings' })} aria-label="Cài đặt">
            <Icon name="settings" />
            <span>Cài đặt & micro</span>
          </Button>
        </header>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Summary label="Thời gian luyện" value={formatDuration(totals.totalPracticeMs)} />
          <Summary label="Nốt đúng" value={String(totals.totalCorrect)} />
          <Summary label="Độ chính xác" value={attempts ? `${Math.round((totals.totalCorrect / attempts) * 100)}%` : '—'} />
          <Summary label="Bài đã hoàn thành" value={`${totals.lessonsCompleted}/${lessonManager.all().length}`} />
        </div>

        {recentLessons.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">Học gần đây</h2>
            <div className="flex flex-wrap gap-2">
              {recentLessons.map((l) => (
                <Button key={l.id} onClick={() => openLesson(l.id)}>
                  {l.title}
                </Button>
              ))}
            </div>
          </section>
        )}

        {groups.map((g) => (
          <section key={g.category} className="mt-8">
            <h2 className="mb-3 text-lg font-semibold">{g.label}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.lessons.map((l) => (
                <LessonCard key={l.id} lesson={l} progress={progress[l.id]} onOpen={() => openLesson(l.id)} />
              ))}
            </div>
          </section>
        ))}

        <p className="mt-10 text-center text-xs text-slate-400">
          Âm thanh micro chỉ được xử lý trên thiết bị này, không gửi lên Internet. Dữ liệu tiến độ lưu cục bộ.
        </p>
        <AppVersion className="mt-2" />
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-4!">
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function LessonCard({ lesson, progress, onOpen }: { lesson: Lesson; progress?: LessonProgress; onOpen: () => void }) {
  const completed = (progress?.completions ?? 0) > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`lesson-${lesson.id}`}
      className="flex min-h-36 flex-col rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-indigo-400 active:scale-[0.99] dark:bg-slate-800 dark:ring-slate-700 dark:hover:ring-indigo-500"
    >
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-lg leading-snug font-semibold">{lesson.title}</h3>
        {completed && (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-950 dark:text-green-300">
            <Icon name="check" className="h-3.5 w-3.5" />
            {Math.round((progress?.bestAccuracy ?? 0) * 100)}%
          </span>
        )}
      </div>
      <p className="mt-1 flex-1 text-sm text-slate-500 dark:text-slate-400">{lesson.description}</p>
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{lesson.clef === 'treble' ? 'Khoá Sol' : 'Khoá Fa'}</span>
        <span>{lesson.notes.length} nốt</span>
        <span>{lesson.hand === 'right' ? 'Tay phải' : 'Tay trái'}</span>
        <span className="ml-auto text-amber-500" aria-label={`Độ khó ${lesson.difficulty}`}>
          {'●'.repeat(lesson.difficulty)}
          <span className="text-slate-300 dark:text-slate-600">{'●'.repeat(3 - lesson.difficulty)}</span>
        </span>
        {progress && progress.sessions > 0 && <span>· {progress.sessions} lần</span>}
      </div>
    </button>
  );
}
