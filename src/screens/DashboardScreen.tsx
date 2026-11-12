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
import { SmartShortcutBar } from '../components/shortcuts/SmartShortcutBar';

const scrollToLibrary = (behavior: ScrollBehavior) => document.getElementById('library')?.scrollIntoView({ behavior, block: 'start' });

/** Nút trên đầu trang: gọn lại để cả hàng nằm trên một dòng từ iPad ngang (≥ 1024px), vẫn cao 48px. */
const HEADER_BUTTON = 'shrink-0 px-2! text-sm! whitespace-nowrap';
/** Nút có biểu tượng dễ nhận (Trò chơi, Thư viện, Cài đặt): dưới 1280px chỉ hiện biểu tượng (tên vẫn đọc được qua sr-only). */
const ICON_ONLY_BELOW_XL = 'min-w-12 justify-center';
const LABEL_BELOW_XL = 'sr-only xl:not-sr-only';

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
        <header className="flex flex-wrap items-center gap-2 pl-10 lg:flex-nowrap" data-testid="dashboard-header">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-10 w-10 shrink-0 drop-shadow-sm" />
          <div className="min-w-32 flex-1">
            <h1 className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300">
              VietPiano
            </h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              {profile ? `${profile.avatar} Chào ${profile.name}!` : 'Học piano từng bước — nghe đàn của bạn qua micro hoặc MIDI.'}
            </p>
          </div>
          <div className="inline-flex shrink-0 rounded-xl bg-slate-200/80 p-1 ring-1 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-700/80" role="radiogroup" aria-label="Giao diện">
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
                className={`min-h-10 cursor-pointer rounded-lg px-2 text-sm font-semibold whitespace-nowrap transition-all duration-150 ${uiMode === v ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-slate-900/5 dark:bg-slate-900 dark:text-indigo-300 dark:ring-white/10' : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <FullscreenButton className="shrink-0" />
          <Button className={HEADER_BUTTON} onClick={() => navigate({ name: 'note-discovery' })} data-testid="open-note-discovery">
            <span aria-hidden>🎹</span>
            <span>Khám phá nốt</span>
          </Button>
          <Button className={HEADER_BUTTON} onClick={() => navigate({ name: 'supplement' })} data-testid="open-supplement">
            <span aria-hidden>🎵</span>
            <span>Làm quen nốt</span>
          </Button>
          <Button className={`${HEADER_BUTTON} ${ICON_ONLY_BELOW_XL}`} title="Trò chơi" onClick={() => navigate({ name: 'games' })} data-testid="open-games">
            <Icon name="gamepad" />
            <span className={LABEL_BELOW_XL}>Trò chơi</span>
          </Button>
          <Button className={`${HEADER_BUTTON} ${ICON_ONLY_BELOW_XL}`} title="Thư viện" onClick={() => scrollToLibrary('smooth')} data-testid="open-library">
            <Icon name="count" />
            <span className={LABEL_BELOW_XL}>Thư viện</span>
          </Button>
          <Button className={`${HEADER_BUTTON} ${ICON_ONLY_BELOW_XL}`} title="Cài đặt" onClick={() => navigate({ name: 'settings' })}>
            <Icon name="settings" />
            <span className={LABEL_BELOW_XL}>Cài đặt</span>
          </Button>
        </header>

        <div className="mt-4 empty:hidden">
          <MicError />
        </div>

        {/* Thanh hồ sơ + lối tắt cùng một hàng: lối tắt lấp phần trống bên phải, tự dồn vào menu ⋯ khi hẹp. */}
        <div className="mt-6 flex flex-wrap items-center gap-2" data-testid="profile-row">
          <ProfileSwitcher className="" hint="Lưu tiến độ giáo trình riêng cho từng người và tự chọn giao diện Trẻ em / Người lớn theo tuổi. Dữ liệu chỉ lưu trên máy này." />
          <SmartShortcutBar />
        </div>

        {level && progress && (
          <section className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-6 text-white shadow-xl shadow-indigo-500/20 ring-1 ring-white/20">
              <div className="text-xs font-semibold tracking-wider uppercase opacity-85">Đang học</div>
              <h2 className="mt-0.5 text-2xl font-extrabold tracking-tight" data-testid="current-level">
                {text(level.title)}
              </h2>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/20 p-0.5 ring-1 ring-white/20">
                <div className="h-full rounded-full bg-white shadow-xs transition-[width] duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 text-sm font-medium tabular-nums opacity-95" data-testid="level-progress">
                {progress.completed}/{progress.total} buổi · {pct}%
              </div>
              {next ? (
                <div className="mt-5 rounded-2xl bg-white/15 p-4 backdrop-blur-md ring-1 ring-white/25">
                  <div className="text-xs font-semibold tracking-wider uppercase opacity-85">
                    {nextStatus === 'in-progress' ? 'Đang học dở' : 'Buổi tiếp theo'}
                  </div>
                  <div className="mt-0.5 text-xl font-bold tracking-tight" data-testid="next-lesson">
                    Buổi {next.number}: {text(next.title)}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed opacity-90">{text(next.ageVariants[mode]?.description ?? next.description)}</p>
                  <Button variant="secondary" className="mt-4 min-w-48 text-lg shadow-md" onClick={() => navigate({ name: 'lesson', lessonId: next.lessonId })} data-testid="continue-learning">
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
              <Button onClick={() => navigate({ name: 'coach' })} data-testid="open-coach">
                <span aria-hidden>🤖</span> AI Piano Coach — chấm bài đàn
              </Button>
            </div>
          </section>
        )}

        <section className="mt-6 flex items-center gap-3">
          <h2 className="shrink-0 text-base font-semibold text-slate-800 dark:text-slate-100">
            Thành tích{' '}
            <span className="text-sm font-normal text-slate-500 tabular-nums dark:text-slate-400">
              {badges.filter((b) => b.earned).length}/{badges.length}
            </span>
          </h2>
          {/* Một dòng, cuộn ngang; thành tích đã đạt lên trước */}
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto whitespace-nowrap py-1" data-testid="achievements">
            {[...badges].sort((a, b) => Number(b.earned) - Number(a.earned)).map((b) => (
              <span
                key={b.id}
                title={b.title}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${b.earned ? 'bg-amber-100/90 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-900/50 dark:text-amber-100 dark:ring-amber-700' : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200/70 dark:bg-slate-800/80 dark:text-slate-500 dark:ring-slate-700/70'}`}
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
    <div className="rounded-2xl bg-white/95 px-4 py-3.5 shadow-sm shadow-slate-900/5 ring-1 ring-slate-200/80 backdrop-blur-md dark:bg-slate-900/85 dark:shadow-none dark:ring-slate-800">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-2xl font-bold text-slate-800 tabular-nums dark:text-slate-100">{value}</div>
    </div>
  );
}
