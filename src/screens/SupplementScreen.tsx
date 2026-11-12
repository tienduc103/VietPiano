import { useMemo } from 'react';
import { SUPPLEMENT, SUPPLEMENT_NOTE, SUPPLEMENT_UPCOMING } from '../core/curriculum/content/supplement';
import { text } from '../core/curriculum/types';
import { lessonStatus, orderedLessons } from '../core/curriculum/unlock';
import { useApp } from '../store/appStore';
import { PinShortcutButton } from '../components/shortcuts/PinShortcutButton';
import { useCurriculum } from '../store/curriculumStore';
import { useUiMode } from '../hooks/useUiMode';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { useNoteCards } from '../components/balloonPop/useNoteCards';
import type { Letter } from '../core/balloonPop/notes';

/** Nốt quãng 4 (khoá Sol) cho hình nốt trên thẻ. */
const LETTER_MIDI: Record<Letter, number> = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };

/** Hình nốt kiểu thẻ bóng bay: khuông ngắn + nốt đen, không khoá. */
function NoteFigure({ svg }: { svg: string | undefined }) {
  return <span className="h-32 w-[5.5rem] [&>svg]:h-full [&>svg]:w-full" aria-hidden data-testid="supplement-note-figure" dangerouslySetInnerHTML={{ __html: svg ?? '' }} />;
}

const STATUS_LABEL = { available: 'Chưa học', 'suggest-later': 'Chưa học', 'in-progress': 'Đang học', completed: 'Đã đạt' } as const;

/**
 * Giáo trình bổ sung "Làm quen từng nốt": mỗi thẻ một nốt → buổi học (route `lesson`):
 * Giới thiệu → Câu đố chọn hình → Luyện phím → Chọn trò chơi. Nốt chưa có bài hiện "Sắp có".
 */
export function SupplementScreen() {
  const navigate = useApp((s) => s.navigate);
  const records = useCurriculum((s) => s.records);
  const mode = useUiMode();
  const kids = mode === 'kids';
  const level = SUPPLEMENT.levels[0];
  const lessons = orderedLessons(level);
  const cards = useMemo(
    () => (Object.keys(LETTER_MIDI) as Letter[]).map((letter) => ({ key: letter, midi: LETTER_MIDI[letter], duration: 'q' as const })),
    [],
  );
  const figures = useNoteCards(cards, 'treble');

  return (
    <div className="h-full overflow-y-auto" data-testid="supplement" data-ui-mode={mode}>
      <div className="mx-auto max-w-6xl px-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button variant="ghost" className="px-2" aria-label="Về trang chủ" onClick={() => navigate({ name: 'dashboard' })}>
            <Icon name="back" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-500 dark:text-slate-400">{text(SUPPLEMENT.title)}</div>
            <h1 className="text-2xl font-extrabold">{text(level.title)}</h1>
          </div>
          <PinShortcutButton target={{ type: 'page', id: 'supplement' }} />
          <FullscreenButton />
        </header>
        <p className={`mt-3 ${kids ? 'text-xl' : 'text-lg'} text-slate-600 dark:text-slate-300`}>
          {kids ? 'Mỗi bài làm quen một nốt nhạc: xem hình, nghe tiếng, giải câu đố, tìm phím rồi chơi trò chơi!' : text(level.description)}
        </p>

        <ol className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Các nốt">
          {lessons.map((l) => {
            const note = SUPPLEMENT_NOTE[l.lessonId];
            const status = lessonStatus(l, records);
            const rec = records[l.lessonId];
            return (
              <li key={l.lessonId}>
                <button
                  type="button"
                  onClick={() => navigate({ name: 'lesson', lessonId: l.lessonId })}
                  data-testid={`supplement-lesson-${l.lessonId}`}
                  data-status={status}
                  className="grid min-h-48 w-full cursor-pointer content-start justify-items-center gap-2 rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-5 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/20 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xl active:scale-95"
                >
                  {note && <NoteFigure svg={figures?.get(note.letter)} />}
                  <span className="flex items-baseline gap-2">
                    <span className="text-lg font-extrabold">{note?.name ?? text(l.title)}</span>
                    <span className="text-lg font-semibold opacity-90">{note?.letter}</span>
                  </span>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-semibold backdrop-blur-xs ring-1 ring-white/20">
                    {STATUS_LABEL[status]}
                    {rec && rec.attempts > 0 ? ` · ${rec.bestScore} điểm` : ''}
                  </span>
                  <span className="text-sm opacity-90">~{l.estimatedDuration} phút</span>
                </button>
              </li>
            );
          })}
          {SUPPLEMENT_UPCOMING.map((n) => (
            <li key={n.letter}>
              <div
                className="grid min-h-48 content-start justify-items-center gap-2 rounded-3xl bg-white/70 p-5 text-slate-400 ring-2 ring-dashed ring-slate-200 dark:bg-slate-800/60 dark:text-slate-500 dark:ring-slate-700"
                aria-label={`${n.name} — sắp có`}
              >
                <NoteFigure svg={figures?.get(n.letter)} />
                <span className="flex items-baseline gap-2">
                  <span className="text-lg font-extrabold">{n.name}</span>
                  <span className="text-lg font-semibold">{n.letter}</span>
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold dark:bg-slate-700">Sắp có</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <AppVersion className="pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
    </div>
  );
}
