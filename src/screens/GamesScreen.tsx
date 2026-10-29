import { useEffect, useMemo, useRef, useState } from 'react';
import { CURRICULUM } from '../core/curriculum/content/curriculum';
import type { GameRecord } from '../core/curriculum/progress';
import { text } from '../core/curriculum/types';
import { currentLevel, lessonStatus } from '../core/curriculum/unlock';
import {
  applyArcadeResult,
  arcadeKey,
  ARCADE_VARIANTS,
  bestOfKind,
  isArcadeKind,
  loadArcadeRecords,
  saveArcadeRecords,
  type ArcadeKind,
  type ArcadeRecords,
  type ArcadeVariant,
} from '../core/games/arcade';
import { curriculumGameIndex, GAME_INFO, GAME_ORDER, lessonLabel, lessonsWithGame, specSummary, type LessonGames } from '../core/games/catalog';
import { GAME_ICON, GAME_TITLE, type GameKind } from '../core/games/gameForLesson';
import { GamePlayer, GameStage } from '../components/games/GameStage';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { useUiMode } from '../hooks/useUiMode';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { useSettings } from '../store/settingsStore';

type Tab = 'games' | 'lessons';
type Playing = { type: 'lesson'; entry: LessonGames; kind: GameKind } | { type: 'arcade'; kind: ArcadeKind; variant: ArcadeVariant };

const TAB_KEY = 'vietpiano-games-tab';
const loadTab = (): Tab => {
  try {
    return localStorage.getItem(TAB_KEY) === 'lessons' ? 'lessons' : 'games';
  } catch {
    return 'games';
  }
};

const starsText = (r: GameRecord | undefined) => (r && r.plays > 0 ? `${'★'.repeat(r.bestStars)}${'☆'.repeat(3 - r.bestStars)} · kỷ lục ${r.bestScore}` : 'Chưa chơi');

/**
 * Mục Trò chơi: tab "Theo trò chơi" (chọn trò → chọn buổi học / mức chơi) và tab "Theo buổi học"
 * (chọn cấp → các buổi, mỗi buổi liệt kê trò của nó). Mọi buổi đều mở (mở khoá chỉ là gợi ý), buổi chưa học có nhãn.
 * Kỷ lục trò của buổi học dùng chung với trò sau buổi (`LessonRecord.games`); trò tự do lưu riêng (`arcade.ts`).
 */
export function GamesScreen() {
  const navigate = useApp((s) => s.navigate);
  const records = useCurriculum((s) => s.records);
  const profileKey = useCurriculum((s) => s.profileKey);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const mode = useUiMode();
  const index = useMemo(() => curriculumGameIndex(), []);
  const levels = useMemo(() => [...new Map(index.map((e) => [e.level.levelId, e.level])).values()], [index]);

  const [tab, setTabState] = useState<Tab>(loadTab);
  const setTab = (t: Tab) => {
    setTabState(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // chỉ là tiện ích
    }
  };
  const [kind, setKind] = useState<GameKind | null>(null);
  const [levelId, setLevelId] = useState(() => currentLevel(CURRICULUM, records)?.levelId ?? levels[0]?.levelId);
  const [playing, setPlaying] = useState<Playing | null>(null);
  const [arcade, setArcade] = useState<ArcadeRecords>(() => loadArcadeRecords(profileKey));
  useEffect(() => {
    setArcade(loadArcadeRecords(profileKey));
  }, [profileKey]);

  /** Thời gian chơi tính từ lúc mở trò / ván trước (cộng vào thời gian học của buổi). */
  const since = useRef(0);
  const play = (p: Playing) => {
    since.current = performance.now();
    setPlaying(p);
  };
  const elapsed = () => {
    const t = performance.now();
    const ms = t - since.current;
    since.current = t;
    return ms;
  };

  const scroller = useRef<HTMLDivElement>(null);
  // Khối lệnh (không trả về giá trị): Chromium mới trả Promise từ scrollTo, React coi là hàm dọn dẹp.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [playing, kind, tab]);

  if (playing) {
    const title = playing.type === 'lesson' ? lessonLabel(playing.entry.level, playing.entry.lesson) : `${GAME_TITLE[playing.kind]} · ${playing.variant.label}`;
    return (
      <div ref={scroller} className="h-full overflow-y-auto" data-testid="games-screen" data-ui-mode={mode}>
        <div className="mx-auto max-w-5xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
          <header className="mb-4 flex items-center gap-3 pl-10">
            <Button variant="ghost" onClick={() => setPlaying(null)} aria-label="Về danh sách trò chơi" className="px-2">
              <Icon name="back" />
            </Button>
            <p className="flex-1 truncate text-lg font-semibold text-slate-600 dark:text-slate-300" data-testid="games-playing-title">
              {title}
            </p>
            <FullscreenButton />
          </header>
          {playing.type === 'lesson' ? (
            <GameStage
              lesson={playing.entry.lesson}
              mode={mode}
              initialKind={playing.kind}
              backLabel="Về danh sách trò chơi"
              onResult={(r) => void useCurriculum.getState().recordGame(playing.entry.lesson, r, elapsed())}
              onBack={() => setPlaying(null)}
            />
          ) : (
            <GamePlayer
              key={playing.variant.id}
              specs={[playing.variant.spec]}
              mode={mode}
              recordOf={() => arcade[arcadeKey(playing.kind, playing.variant.id)]}
              onResult={(r) => {
                const next = applyArcadeResult(arcade, arcadeKey(playing.kind, playing.variant.id), r);
                setArcade(next);
                saveArcadeRecords(profileKey, next);
              }}
              onBack={() => setPlaying(null)}
              backLabel="Về danh sách trò chơi"
            />
          )}
        </div>
      </div>
    );
  }

  const levelEntries = index.filter((e) => e.level.levelId === levelId);
  const statusTag = (e: LessonGames) => {
    const st = lessonStatus(e.lesson, records);
    return st === 'completed' ? (
      <Tag tone="done">✓ Đã học</Tag>
    ) : st === 'in-progress' ? (
      <Tag tone="doing">Đang học</Tag>
    ) : (
      <Tag tone="new" testId="tag-not-learned">
        Chưa học
      </Tag>
    );
  };
  const levelChips = (count?: (levelId: string) => number) => (
    <nav className="flex flex-wrap gap-2" aria-label="Cấp độ">
      {levels.map((l) => (
        <button
          key={l.levelId}
          type="button"
          onClick={() => setLevelId(l.levelId)}
          aria-pressed={l.levelId === levelId}
          data-testid={`games-level-${l.number}`}
          className={`min-h-12 rounded-2xl px-4 text-left ring-2 transition-colors ${
            l.levelId === levelId ? 'bg-fuchsia-500 text-white ring-fuchsia-300' : 'bg-white/90 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900'
          }`}
        >
          <span className="font-semibold">Cấp {l.number}</span>
          {count && <span className="ml-1 text-xs opacity-80">· {count(l.levelId)} buổi</span>}
        </button>
      ))}
    </nav>
  );

  return (
    <div ref={scroller} className="h-full overflow-y-auto" data-testid="games-screen" data-ui-mode={mode}>
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button variant="ghost" onClick={() => (kind ? setKind(null) : navigate({ name: 'dashboard' }))} aria-label={kind ? 'Về danh sách trò chơi' : 'Về trang chủ'} className="px-2">
            <Icon name="back" />
          </Button>
          <h1 className="flex-1 text-3xl font-bold">🎮 Trò chơi</h1>
          <div className="inline-flex rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="tablist" aria-label="Cách xem">
            {(
              [
                ['games', 'Theo trò chơi'],
                ['lessons', 'Theo buổi học'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setKind(null);
                }}
                data-testid={`games-tab-${t}`}
                className={`min-h-12 rounded-lg px-4 font-semibold ${tab === t ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <FullscreenButton />
        </header>

        {tab === 'games' && !kind && (
          <section className="mt-6 grid gap-6">
            <button
              type="button"
              onClick={() => navigate({ name: 'note-hunter' })}
              data-testid="open-note-hunter"
              className="flex min-h-16 items-center gap-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 py-4 text-left text-white shadow-md shadow-fuchsia-500/30 hover:brightness-110"
            >
              <span className="text-4xl" aria-hidden>
                🎯
              </span>
              <span className="flex-1">
                <span className="block text-xl font-bold">Săn nốt (Note Hunter)</span>
                <span className="block text-sm opacity-90">Chọn nốt cần săn — bản nhạc tự chạy và dừng ở mỗi nốt đó chờ bạn đánh đúng. Đọc nốt trên khuông · MIDI, micro, piano ảo.</span>
              </span>
            </button>
            {(['lesson', 'arcade'] as const).map((source) => (
              <div key={source} className="grid gap-3">
                <div>
                  <h2 className="text-xl font-bold">{source === 'lesson' ? 'Trò chơi của các buổi học' : 'Trò chơi mới · chơi tự do'}</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {source === 'lesson'
                      ? 'Nội dung lấy từ buổi học (nốt, tiết tấu, thế tay của buổi) — chọn trò rồi chọn buổi. Kỷ lục dùng chung với trò sau buổi.'
                      : 'Không gắn với buổi học — chọn mức chơi soạn sẵn.'}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {GAME_ORDER.filter((k) => GAME_INFO[k].source === source).map((k) => {
                    const count = lessonsWithGame(index, k).length;
                    const best = isArcadeKind(k) ? bestOfKind(arcade, k) : undefined;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setKind(k)}
                        data-testid={`game-card-${k}`}
                        className="grid min-h-36 grid-cols-[auto_1fr] items-start gap-x-4 gap-y-1 rounded-3xl bg-white/90 p-4 text-left shadow-sm ring-1 ring-violet-100 transition hover:ring-2 hover:ring-fuchsia-300 dark:bg-slate-800/90 dark:ring-violet-900"
                      >
                        <span className="row-span-3 text-5xl" aria-hidden>
                          {GAME_ICON[k]}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-lg font-bold">
                          {GAME_TITLE[k]}
                          {source === 'arcade' && <Tag tone="new">Mới</Tag>}
                        </span>
                        <span className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">{GAME_INFO[k].skill}</span>
                        <span className="text-sm text-slate-600 dark:text-slate-300">
                          {GAME_INFO[k].description}
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {source === 'lesson' ? `Có ở ${count} buổi học` : `${ARCADE_VARIANTS[k as ArcadeKind].length} mức chơi · ${starsText(best)}`}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </section>
        )}

        {tab === 'games' && kind && (
          <section className="mt-6 grid gap-4" data-testid={`game-detail-${kind}`}>
            <div className="flex items-center gap-4 rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900">
              <span className="text-6xl" aria-hidden>
                {GAME_ICON[kind]}
              </span>
              <div className="grid gap-1">
                <h2 className="text-2xl font-extrabold">{GAME_TITLE[kind]}</h2>
                <p className="text-sm font-semibold text-fuchsia-700 dark:text-fuchsia-300">{GAME_INFO[kind].skill}</p>
                <p className="text-slate-600 dark:text-slate-300">{GAME_INFO[kind].description}</p>
              </div>
            </div>
            {isArcadeKind(kind) ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {ARCADE_VARIANTS[kind].map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => play({ type: 'arcade', kind, variant: v })}
                    data-testid={`arcade-${kind}-${v.id}`}
                    className="grid min-h-28 gap-1 rounded-2xl bg-white/90 p-4 text-left ring-2 ring-violet-100 transition hover:ring-fuchsia-300 dark:bg-slate-800 dark:ring-violet-900"
                  >
                    <span className="text-lg font-bold">{v.label}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{v.description}</span>
                    <span className="text-sm text-amber-600 dark:text-amber-300">{starsText(arcade[arcadeKey(kind, v.id)])}</span>
                  </button>
                ))}
              </div>
            ) : (
              <>
                {levelChips((id) => lessonsWithGame(index, kind).filter((e) => e.level.levelId === id).length)}
                <ul className="grid gap-2">
                  {lessonsWithGame(levelEntries, kind).map((e) => {
                    const spec = e.specs.find((s) => s.kind === kind)!;
                    return (
                      <li key={e.lesson.lessonId}>
                        <button
                          type="button"
                          onClick={() => play({ type: 'lesson', entry: e, kind })}
                          data-testid={`game-lesson-${e.lesson.lessonId}`}
                          className="flex min-h-16 w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-white/90 px-4 py-3 text-left ring-1 ring-violet-100 transition hover:ring-2 hover:ring-fuchsia-300 dark:bg-slate-800/90 dark:ring-violet-900"
                        >
                          <span className="w-16 shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">Buổi {e.lesson.number}</span>
                          <span className="grid min-w-48 flex-1">
                            <span className="font-bold">{text(e.lesson.title)}</span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">{specSummary(spec, labelStyle)}</span>
                          </span>
                          {statusTag(e)}
                          <span className="w-40 text-right text-sm text-amber-600 dark:text-amber-300">{starsText(records[e.lesson.lessonId]?.games?.[kind])}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {tab === 'lessons' && (
          <section className="mt-6 grid gap-4">
            {levelChips()}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Mỗi buổi có 2–3 trò suy từ nội dung của buổi. Buổi chưa học vẫn chơi được — chỉ là gợi ý nên học trước.
            </p>
            <ul className="grid gap-3">
              {levelEntries.map((e) => (
                <li key={e.lesson.lessonId} className="grid gap-3 rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900" data-testid={`games-lesson-${e.lesson.lessonId}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Buổi {e.lesson.number}</span>
                    <h2 className="flex-1 text-lg font-bold">{text(e.lesson.title)}</h2>
                    {statusTag(e)}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {e.specs.map((s) => (
                      <button
                        key={s.kind}
                        type="button"
                        onClick={() => play({ type: 'lesson', entry: e, kind: s.kind })}
                        data-testid={`lesson-game-${e.lesson.lessonId}-${s.kind}`}
                        className="flex min-h-16 items-center gap-3 rounded-2xl bg-violet-50 px-3 py-2 text-left ring-1 ring-violet-100 transition hover:ring-2 hover:ring-fuchsia-300 dark:bg-slate-700/60 dark:ring-violet-900"
                      >
                        <span className="text-3xl" aria-hidden>
                          {GAME_ICON[s.kind]}
                        </span>
                        <span className="grid">
                          <span className="font-bold">{GAME_TITLE[s.kind]}</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {GAME_INFO[s.kind].skill} · {specSummary(s, labelStyle)}
                          </span>
                          <span className="text-xs text-amber-600 dark:text-amber-300">{starsText(records[e.lesson.lessonId]?.games?.[s.kind])}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function Tag({ tone, testId, children }: { tone: 'done' | 'doing' | 'new'; testId?: string; children: React.ReactNode }) {
  const cls =
    tone === 'done'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
      : tone === 'doing'
        ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200'
        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`} data-testid={testId}>
      {children}
    </span>
  );
}
