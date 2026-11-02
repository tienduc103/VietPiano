import { useCallback, useMemo, useState } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import type { Lesson } from '../core/lessons/types';
import { useApp } from '../store/appStore';
import { useSettings } from '../store/settingsStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { sessionsForProfile } from '../core/profile/LearnerProfile';
import { assessLearner } from '../core/profile/assessment';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { ACCENTS, LessonCard } from '../components/LessonLibrary';
import { ScoreExportDialog } from '../components/ScoreExportDialog';

type SongFilter = 'all' | 'grand' | 'single';

const FILTERS: { value: SongFilter; label: string; match: (l: Lesson) => boolean }[] = [
  { value: 'all', label: 'Tất cả', match: () => true },
  { value: 'grand', label: 'Khuông đôi · hai tay', match: (l) => l.clef === 'grand' },
  { value: 'single', label: 'Một tay', match: (l) => l.clef !== 'grand' },
];

/** So tên bài không phân biệt dấu và hoa thường. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

/** Trang riêng: mọi bài hát (bấm chữ "Bài hát" ở Thư viện bài), gồm tuyển tập khuông đôi có pedal và chọn tay. */
export function SongLibraryScreen() {
  const navigate = useApp((s) => s.navigate);
  const openLesson = useApp((s) => s.openLesson);
  const allProgress = useApp((s) => s.progress);
  const sessions = useApp((s) => s.sessions);
  const profiles = useProfiles((s) => s.profiles);
  const profile = useProfiles(activeProfile);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const progress = useMemo(
    () => (profile ? assessLearner(profile, sessionsForProfile(sessions, profile.id, profiles), lessonManager.all(), Date.now(), undefined, labelStyle).progress : allProgress),
    [profile, profiles, sessions, labelStyle, allProgress],
  );

  const songs = lessonManager.songs();
  const [filter, setFilter] = useState<SongFilter>('all');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState<Lesson | null>(null);
  const closeExport = useCallback(() => setExporting(null), []);

  const needle = fold(query.trim());
  const shown = songs.filter((l) => FILTERS.find((f) => f.value === filter)!.match(l) && (!needle || fold(l.title).includes(needle)));

  return (
    <div className="h-full overflow-y-auto" data-testid="song-library">
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button variant="ghost" className="px-2" aria-label="Về thư viện" onClick={() => navigate({ name: 'library' })} midiNav="back">
            <Icon name="back" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold">Thư viện bài hát</h1>
            <p className="text-slate-500 dark:text-slate-400">{songs.length} bài · bài khuông đôi chọn được Hai tay / Tay phải / Tay trái, đàn MIDI chấm cả pedal.</p>
          </div>
          <FullscreenButton />
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="radiogroup" aria-label="Lọc bài hát">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                data-testid={`song-filter-${f.value}`}
                onClick={() => setFilter(f.value)}
                className={`min-h-12 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                  filter === f.value ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'
                }`}
              >
                {f.label} ({songs.filter(f.match).length})
              </button>
            ))}
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm tên bài…"
            aria-label="Tìm tên bài"
            data-testid="song-search"
            className="min-h-12 min-w-48 flex-1 rounded-xl bg-white px-4 ring-1 ring-violet-200 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-800 dark:ring-violet-900"
          />
        </div>

        {shown.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((l) => (
              <LessonCard key={l.id} accent={ACCENTS[l.clef === 'grand' ? 0 : 1]} lesson={l} progress={progress[l.id]} onOpen={() => openLesson(l.id)} onExport={() => setExporting(l)} />
            ))}
          </div>
        ) : (
          <p className="mt-10 text-center text-slate-500 dark:text-slate-400" data-testid="song-empty">
            Không tìm thấy bài nào.
          </p>
        )}
        <AppVersion className="mt-8" />
      </div>
      {exporting && <ScoreExportDialog lesson={exporting} labelStyle={labelStyle} onClose={closeExport} />}
    </div>
  );
}
