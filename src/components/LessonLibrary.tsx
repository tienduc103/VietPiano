import { useCallback, useMemo, useState } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import { CLEF_LABEL, HAND_LABEL, type Lesson } from '../core/lessons/types';
import { computeTotals, type LessonProgress } from '../core/storage/ProgressStorage';
import { useApp } from '../store/appStore';
import { Button, Icon, formatDuration } from './ui';
import { ScoreExportDialog } from './ScoreExportDialog';
import { useSettings } from '../store/settingsStore';
import { LearnerPanel } from './LearnerPanel';
import { activeProfile, useProfiles } from '../store/profileStore';
import { sessionsForProfile } from '../core/profile/LearnerProfile';
import { assessLearner } from '../core/profile/assessment';
import { recommendLessons } from '../core/profile/recommend';

/**
 * Thư viện bài (nửa dưới trang chủ): thống kê, gợi ý + đánh giá theo hồ sơ, bài gần đây, các nhóm bài.
 * `id="library"` để route `library` (nút "Về thư viện", `?screen=library`) cuộn tới đây.
 */
export function LessonLibrary() {
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
    <section id="library" className="mt-10 scroll-mt-6" data-testid="library" aria-labelledby="library-title">
      <h2 id="library-title" className="text-2xl font-bold">
        Thư viện bài
      </h2>
      <p className="text-slate-500 dark:text-slate-400">Luyện tự do — đánh đúng nốt, bản nhạc tự chuyển tiếp.</p>

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
                <span className={l.titleColor}>{l.title}</span>
              </Button>
            ))}
          </div>
        </section>
      )}

      {groups.map((g, gi) => (
        <section key={g.category} className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <span className={`h-5 w-1.5 rounded-full ${ACCENTS[gi % ACCENTS.length]}`} />
            {g.category === 'song' ? (
              // Chữ "Bài hát" mở trang riêng; phần "Xem tất cả" ẩn với trình đọc màn hình để tên mục giữ nguyên.
              <button
                type="button"
                onClick={() => navigate({ name: 'song-library' })}
                data-testid="open-song-library"
                className="-my-2 inline-flex min-h-12 items-center gap-2 rounded-xl pr-3 text-left text-violet-700 transition-colors hover:text-fuchsia-600 active:text-fuchsia-700 dark:text-violet-300 dark:hover:text-fuchsia-300"
              >
                {g.label}
                <span className="text-sm font-medium opacity-80" aria-hidden>
                  Xem tất cả {lessonManager.songs().length} bài ›
                </span>
              </button>
            ) : (
              g.label
            )}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
      {exporting && <ScoreExportDialog lesson={exporting} labelStyle={labelStyle} onClose={closeExport} />}
    </section>
  );
}

/** Màu nhấn cho từng nhóm bài (xoay vòng). */
export const ACCENTS = [
  'bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500',
  'bg-gradient-to-r from-sky-500 to-cyan-400',
  'bg-gradient-to-r from-emerald-500 to-teal-400',
  'bg-gradient-to-r from-amber-500 to-orange-400',
  'bg-gradient-to-r from-rose-500 to-pink-500',
];

const SUMMARY_TONES = {
  sky: 'bg-gradient-to-br from-sky-50 to-sky-100/70 text-sky-950 ring-sky-200/80 dark:from-sky-950/70 dark:to-slate-900 dark:text-sky-100 dark:ring-sky-800/70',
  emerald: 'bg-gradient-to-br from-emerald-50 to-emerald-100/70 text-emerald-950 ring-emerald-200/80 dark:from-emerald-950/70 dark:to-slate-900 dark:text-emerald-100 dark:ring-emerald-800/70',
  amber: 'bg-gradient-to-br from-amber-50 to-amber-100/70 text-amber-950 ring-amber-200/80 dark:from-amber-950/70 dark:to-slate-900 dark:text-amber-100 dark:ring-amber-800/70',
  pink: 'bg-gradient-to-br from-pink-50 to-rose-100/70 text-pink-950 ring-pink-200/80 dark:from-pink-950/70 dark:to-slate-900 dark:text-pink-100 dark:ring-pink-800/70',
} as const;

function Summary({ label, value, tone }: { label: string; value: string; tone: keyof typeof SUMMARY_TONES }) {
  return (
    <section className={`rounded-2xl px-5 py-4 shadow-xs ring-1 ${SUMMARY_TONES[tone]}`}>
      <div className="text-xs font-semibold tracking-wide uppercase opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
    </section>
  );
}

export function LessonCard({
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
    <div className="group relative flex">
      <button
        type="button"
        onClick={onOpen}
        data-testid={`lesson-${lesson.id}`}
        className="relative flex min-w-0 flex-1 cursor-pointer flex-col overflow-hidden rounded-2xl bg-white/95 px-4 pt-4 pb-3 text-left shadow-xs ring-1 ring-slate-200/90 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md hover:ring-indigo-300 active:scale-[0.99] dark:bg-slate-800/90 dark:shadow-none dark:ring-slate-700/80 dark:hover:ring-indigo-500/70"
      >
        <span className={`absolute inset-x-0 top-0 h-1 ${accent}`} aria-hidden />
        <div className="flex items-start gap-2 pr-9">
          <h3
            className={`flex-1 text-base leading-snug font-semibold ${lesson.titleColor?.startsWith('text-') ? lesson.titleColor : ''}`}
            style={lesson.titleColor && !lesson.titleColor.startsWith('text-') ? { color: lesson.titleColor } : undefined}
          >
            {lesson.title}
          </h3>
          {completed && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/80 dark:bg-emerald-950/80 dark:text-emerald-300 dark:ring-emerald-800/60">
              <Icon name="check" className="h-3.5 w-3.5" />
              {Math.round((progress?.bestAccuracy ?? 0) * 100)}%
            </span>
          )}
        </div>
        <p className="mt-1 flex-1 truncate pr-9 text-sm text-slate-500 dark:text-slate-400" title={lesson.description}>
          {lesson.description}
        </p>
        <div className="mt-2 flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 ring-1 ring-indigo-200/60 dark:bg-indigo-950/80 dark:text-indigo-200 dark:ring-indigo-800/60">
            {CLEF_LABEL[lesson.clef]}
          </span>
          <span>{lesson.notes.length} nốt</span>
          <span>{HAND_LABEL[lesson.hand]}</span>
          <span className="ml-auto text-amber-500" aria-label={`Độ khó ${lesson.difficulty}`}>
            {'●'.repeat(lesson.difficulty)}
            <span className="text-slate-300 dark:text-slate-600">{'●'.repeat(3 - lesson.difficulty)}</span>
          </span>
          {progress && progress.sessions > 0 && (
            <span title="Số lần luyện · số lần chơi xong cả bài">
              · {progress.sessions} lần{progress.completions > 0 ? ` · xong ${progress.completions}` : ''}
            </span>
          )}
        </div>
      </button>
      {/* Nút riêng (không lồng trong nút mở bài): xuất bản nhạc thành ảnh để tự học. */}
      <button
        type="button"
        onClick={onExport}
        aria-label={`Xuất ảnh khuông nhạc: ${lesson.title}`}
        title="Xuất ảnh khuông nhạc"
        data-testid={`export-${lesson.id}`}
        className="absolute top-1.5 right-1 grid h-12 w-12 cursor-pointer place-items-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-700 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700/70 dark:hover:text-indigo-200"
      >
        <Icon name="image" />
      </button>
    </div>
  );
}
