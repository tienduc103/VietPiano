import { useEffect, useMemo } from 'react';
import { CURRICULUM } from '../core/curriculum/content/curriculum';
import { text } from '../core/curriculum/types';
import { achievements, currentLevel, lessonStatus, levelProgress } from '../core/curriculum/unlock';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';
import { useUiMode } from '../hooks/useUiMode';
import { Button, FullscreenButton, Icon, formatDuration } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { MicError } from '../components/MicPanel';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { LessonLibrary } from '../components/LessonLibrary';

const scrollToLibrary = (behavior: ScrollBehavior) => document.getElementById('library')?.scrollIntoView({ behavior, block: 'start' });

/**
 * Trang chủ: phía trên là giáo trình (cấp đang học, tiến độ, buổi tiếp theo, thành tích),
 * phía dưới là Thư viện bài. `focus="library"` (route `library`) cuộn thẳng xuống thư viện.
 */
export function DashboardScreen({ focus }: { focus?: 'library' }) {
  const navigate = useApp((s) => s.navigate);
  const records = useCurriculum((s) => s.records);
  const loaded = useCurriculum((s) => s.loaded);
  const profile = useProfiles(activeProfile);
  const uiMode = useSettings((s) => s.settings.uiMode);
  const update = useSettings((s) => s.update);
  const mode = useUiMode();
  const kids = mode === 'kids';

  const level = currentLevel(CURRICULUM, records);
  const progress = level ? levelProgress(level, records) : null;
  const all = useMemo(() => Object.values(records), [records]);
  const practiceMs = all.reduce((a, r) => a + r.practiceMs, 0);
  const badges = achievements(CURRICULUM, records);
  const next = progress?.next ?? null;
  const nextStatus = next ? lessonStatus(next, records) : null;
  const recent = [...all].filter((r) => r.lastPracticedAt > 0).sort((a, b) => b.lastPracticedAt - a.lastPracticedAt)[0];
  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  useEffect(() => {
    if (focus === 'library') scrollToLibrary('instant');
  }, [focus]);

  return (
    <div className="h-full overflow-y-auto" data-testid="dashboard" data-ui-mode={mode}>
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex flex-wrap items-center gap-4 pl-10">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-12 w-12" />
          <div className="flex-1">
            <h1 className="bg-gradient-to-r from-violet-600 via-fuchsia-500 to-orange-400 bg-clip-text text-3xl font-extrabold tracking-tight text-transparent dark:from-violet-300 dark:via-fuchsia-300 dark:to-orange-300">
              VietPiano
            </h1>
            <p className="text-slate-500 dark:text-slate-400">
              {profile ? `${profile.avatar} Chào ${profile.name}!` : 'Học piano từng bước — nghe đàn của bạn qua micro hoặc MIDI.'}
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="radiogroup" aria-label="Giao diện">
            {(
              [
                ['auto', 'Tự động'],
                ['kids', 'Trẻ em'],
                ['adult', 'Người lớn'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={uiMode === v}
                onClick={() => update({ uiMode: v })}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${uiMode === v ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <FullscreenButton />
          <Button onClick={() => scrollToLibrary('smooth')} data-testid="open-library">
            <Icon name="count" />
            <span>Thư viện bài</span>
          </Button>
          <Button onClick={() => navigate({ name: 'settings' })} aria-label="Cài đặt">
            <Icon name="settings" />
            <span>Cài đặt & micro</span>
          </Button>
        </header>

        <div className="mt-4 empty:hidden">
          <MicError />
        </div>

        <ProfileSwitcher hint="Lưu tiến độ giáo trình riêng cho từng người và tự chọn giao diện Trẻ em / Người lớn theo tuổi. Dữ liệu chỉ lưu trên máy này." />

        {level && progress && (
          <section className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-500 p-6 text-white shadow-lg shadow-fuchsia-500/30">
              <div className="text-sm opacity-90">Đang học</div>
              <h2 className="text-2xl font-extrabold" data-testid="current-level">
                {text(level.title)}
              </h2>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/30">
                <div className="h-full rounded-full bg-white transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-sm tabular-nums" data-testid="level-progress">
                {progress.completed}/{progress.total} buổi · {pct}%
              </div>
              {next ? (
                <div className="mt-5 rounded-2xl bg-white/15 p-4">
                  <div className="text-sm opacity-90">{nextStatus === 'in-progress' ? 'Đang học dở' : 'Buổi tiếp theo'}</div>
                  <div className="text-xl font-bold" data-testid="next-lesson">
                    Buổi {next.number}: {text(next.title)}
                  </div>
                  <p className="mt-1 text-sm opacity-90">{text(next.ageVariants[mode]?.description ?? next.description)}</p>
                  <Button variant="secondary" className="mt-4 min-w-48 text-lg" onClick={() => navigate({ name: 'lesson', lessonId: next.lessonId })} data-testid="continue-learning">
                    <Icon name="play" />
                    {kids ? 'Học thôi!' : nextStatus === 'in-progress' ? 'Tiếp tục học' : 'Bắt đầu'}
                  </Button>
                </div>
              ) : (
                <p className="mt-5 text-xl font-bold">🎓 Đã hoàn thành cấp độ này!</p>
              )}
            </div>
            <div className="grid content-start gap-3">
              <Stat label="Thời gian luyện giáo trình" value={formatDuration(practiceMs)} />
              <Stat label="Buổi đã đạt" value={`${all.filter((r) => r.passed).length}`} />
              {recent && <Stat label="Lần học gần nhất" value={new Date(recent.lastPracticedAt).toLocaleDateString('vi-VN')} />}
              <Button onClick={() => navigate({ name: 'curriculum', levelId: level.levelId })} data-testid="open-curriculum">
                Xem toàn bộ giáo trình
              </Button>
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Thành tích</h2>
          <div className="flex flex-wrap gap-2" data-testid="achievements">
            {badges.map((b) => (
              <span
                key={b.id}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${b.earned ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'}`}
                data-earned={b.earned}
              >
                {b.earned ? '🏅 ' : '○ '}
                {b.title}
              </span>
            ))}
          </div>
        </section>

        {!loaded && <p className="mt-6 text-sm text-slate-500">Đang tải tiến độ…</p>}

        <LessonLibrary />
      </div>
      <AppVersion className="pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/80 dark:ring-violet-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}
