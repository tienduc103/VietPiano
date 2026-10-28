import { useCallback, useMemo, useState } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import { CLEF_LABEL, HAND_LABEL, type Lesson } from '../core/lessons/types';
import { computeTotals, type LessonProgress } from '../core/storage/ProgressStorage';
import { useApp } from '../store/appStore';
import { Button, FullscreenButton, Icon, formatDuration } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { MicError } from '../components/MicPanel';
import { ScoreExportDialog } from '../components/ScoreExportDialog';
import { useSettings } from '../store/settingsStore';
import { LearnerPanel } from '../components/LearnerPanel';
import { activeProfile, useProfiles } from '../store/profileStore';
import { sessionsForProfile } from '../core/profile/LearnerProfile';
import { assessLearner } from '../core/profile/assessment';
import { recommendLessons } from '../core/profile/recommend';

export function LibraryScreen() {
  const allProgress = useApp((s) => s.progress);
  const sessions = useApp((s) => s.sessions);
  const recent = useApp((s) => s.recent);
  const openLesson = useApp((s) => s.openLesson);
  const navigate = useApp((s) => s.navigate);
  const profiles = useProfiles((s) => s.profiles);
  const profile = useProfiles(activeProfile);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const assessment = useMemo(
    () =>
      profile
        ? assessLearner(profile, sessionsForProfile(sessions, profile.id, profiles), lessonManager.all(), Date.now(), undefined, labelStyle)
        : null,
    [profile, profiles, sessions, labelStyle],
  );
  const recommendations = useMemo(() => (profile && assessment ? recommendLessons(profile, assessment, lessonManager.all()) : []), [profile, assessment]);
  // Có hồ sơ đang chọn → thống kê và dấu hoàn thành theo riêng người học đó.
  const progress = assessment?.progress ?? allProgress;
  const totals = useMemo(() => computeTotals(progress), [progress]);
  const groups = lessonManager.byCategory();
  const recentLessons = recent.map((id) => lessonManager.get(id)).filter((l): l is Lesson => !!l);
  const attempts = totals.totalCorrect + totals.totalWrong;
  const [exporting, setExporting] = useState<Lesson | null>(null);
  const closeExport = useCallback(() => setExporting(null), []);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex items-center gap-4 pl-10">
          <Button variant="ghost" onClick={() => navigate({ name: 'dashboard' })} aria-label="Về trang chủ giáo trình" className="px-2">
            <Icon name="back" />
          </Button>
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-12 w-12" />
          <div className="flex-1">
            <h1 className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent dark:from-violet-300 dark:via-fuchsia-300 dark:to-orange-300">
              VietPiano
            </h1>
            <p className="text-slate-500 dark:text-slate-400">Thư viện bài — đánh đúng nốt, bản nhạc tự chuyển tiếp.</p>
          </div>
          <FullscreenButton />
          <Button onClick={() => navigate({ name: 'settings' })} aria-label="Cài đặt">
            <Icon name="settings" />
            <span>Cài đặt & micro</span>
          </Button>
        </header>

        {/* Micro bật được từ nút nổi ở thư viện → lỗi micro cũng phải hiện ở đây. */}
        <div className="mt-4 empty:hidden">
          <MicError />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Summary tone="sky" label="Thời gian luyện" value={formatDuration(totals.totalPracticeMs)} />
          <Summary tone="emerald" label="Nốt đúng" value={String(totals.totalCorrect)} />
          <Summary tone="amber" label="Độ chính xác" value={attempts ? `${Math.round((totals.totalCorrect / attempts) * 100)}%` : '—'} />
          <Summary tone="pink" label="Bài đã hoàn thành" value={`${totals.lessonsCompleted}/${lessonManager.all().length}`} />
        </div>

        <LearnerPanel profile={profile} assessment={assessment} recommendations={recommendations} />

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

        {groups.map((g, gi) => (
          <section key={g.category} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <span className={`h-5 w-1.5 rounded-full ${ACCENTS[gi % ACCENTS.length]}`} />
              {g.label}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.lessons.map((l) => (
                <LessonCard
                  key={l.id}
                  accent={ACCENTS[gi % ACCENTS.length]}
                  lesson={l}
                  progress={progress[l.id]}
                  onOpen={() => openLesson(l.id)}
                  onExport={() => setExporting(l)}
                />
              ))}
            </div>
          </section>
        ))}

        <p className="mt-10 text-center text-xs text-slate-400">
          Âm thanh micro chỉ được xử lý trên thiết bị này, không gửi lên Internet. Dữ liệu tiến độ lưu cục bộ.
        </p>
        <AppVersion className="mt-2" />
      </div>
      {exporting && <ScoreExportDialog lesson={exporting} labelStyle={labelStyle} onClose={closeExport} />}
    </div>
  );
}

/** Màu nhấn cho từng nhóm bài (xoay vòng). */
const ACCENTS = [
  'bg-gradient-to-r from-violet-500 to-fuchsia-500',
  'bg-gradient-to-r from-sky-400 to-cyan-400',
  'bg-gradient-to-r from-emerald-400 to-lime-400',
  'bg-gradient-to-r from-orange-400 to-amber-400',
  'bg-gradient-to-r from-pink-500 to-rose-400',
];

const SUMMARY_TONES = {
  sky: 'bg-sky-100 text-sky-950 ring-sky-200 dark:bg-sky-950/70 dark:text-sky-100 dark:ring-sky-800',
  emerald: 'bg-emerald-100 text-emerald-950 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-100 dark:ring-emerald-800',
  amber: 'bg-amber-100 text-amber-950 ring-amber-200 dark:bg-amber-950/70 dark:text-amber-100 dark:ring-amber-800',
  pink: 'bg-pink-100 text-pink-950 ring-pink-200 dark:bg-pink-950/70 dark:text-pink-100 dark:ring-pink-800',
} as const;

function Summary({ label, value, tone }: { label: string; value: string; tone: keyof typeof SUMMARY_TONES }) {
  return (
    <section className={`rounded-2xl px-5 py-4 shadow-sm ring-1 ${SUMMARY_TONES[tone]}`}>
      <div className="text-sm font-medium opacity-75">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </section>
  );
}

function LessonCard({
  lesson,
  progress,
  accent,
  onOpen,
  onExport,
}: {
  lesson: Lesson;
  progress?: LessonProgress;
  accent: string;
  onOpen: () => void;
  onExport: () => void;
}) {
  const completed = (progress?.completions ?? 0) > 0;
  return (
    <div className="relative flex">
      <button
        type="button"
        onClick={onOpen}
        data-testid={`lesson-${lesson.id}`}
        className="relative flex min-h-36 flex-1 flex-col overflow-hidden rounded-2xl bg-white p-5 pt-6 text-left shadow-sm shadow-violet-200/60 ring-1 ring-violet-100 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-fuchsia-300 active:scale-[0.99] dark:bg-slate-800 dark:shadow-none dark:ring-violet-900 dark:hover:ring-fuchsia-500"
      >
        <span className={`absolute inset-x-0 top-0 h-1.5 ${accent}`} aria-hidden />
        <div className="flex items-start gap-2 pr-11">
          <h3 className="flex-1 text-lg leading-snug font-semibold">{lesson.title}</h3>
          {completed && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Icon name="check" className="h-3.5 w-3.5" />
              {Math.round((progress?.bestAccuracy ?? 0) * 100)}%
            </span>
          )}
        </div>
        <p className="mt-1 flex-1 text-sm text-slate-500 dark:text-slate-400">{lesson.description}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700 dark:bg-violet-900 dark:text-violet-200">{CLEF_LABEL[lesson.clef]}</span>
          <span>{lesson.notes.length} nốt</span>
          <span>{HAND_LABEL[lesson.hand]}</span>
          <span className="ml-auto text-orange-400" aria-label={`Độ khó ${lesson.difficulty}`}>
            {'●'.repeat(lesson.difficulty)}
            <span className="text-slate-300 dark:text-slate-600">{'●'.repeat(3 - lesson.difficulty)}</span>
          </span>
          {progress && progress.sessions > 0 && <span>· {progress.sessions} lần</span>}
        </div>
      </button>
      {/* Nút riêng (không lồng trong nút mở bài): xuất bản nhạc thành ảnh để tự học. */}
      <button
        type="button"
        onClick={onExport}
        aria-label={`Xuất ảnh khuông nhạc: ${lesson.title}`}
        title="Xuất ảnh khuông nhạc"
        data-testid={`export-${lesson.id}`}
        className="absolute top-2.5 right-2 grid h-12 w-12 place-items-center rounded-xl text-violet-700 transition-colors hover:bg-violet-100 active:bg-violet-200 dark:text-violet-200 dark:hover:bg-violet-800/60"
      >
        <Icon name="image" />
      </button>
    </div>
  );
}
