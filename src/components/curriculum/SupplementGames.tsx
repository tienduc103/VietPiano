import { useState } from 'react';
import { SOLFEGE } from '../../core/balloonPop/notes';
import { SUPPLEMENT_GAMES, type SupplementGame } from '../../core/curriculum/content/supplement';
import type { CurriculumLesson, UiMode } from '../../core/curriculum/types';
import { GAME_ICON, GAME_TITLE } from '../../core/games/gameForLesson';
import { useApp } from '../../store/appStore';
import { useCurriculum } from '../../store/curriculumStore';
import { GamePlayer } from '../games/GameStage';
import { Button } from '../ui';
import type { GameResult } from '../games/shared';

const DESCRIPTION: Record<string, string> = {
  'balloon-hunt': 'Bóng bay lên trên phím của nó — chỉ nổ bóng nốt cần tìm, tránh bom!',
  'key-hunt': 'Đọc yêu cầu rồi bấm thật nhanh đúng phím.',
  'staff-shoot': 'Nhìn nốt vẽ trên khuông rồi bấm đúng phím để bắn bóng.',
  'note-catch': 'Bấm đúng phím để hứng nốt trước khi chạm đất.',
};

function gameInfo(g: SupplementGame): { id: string; icon: string; title: string; description: string } {
  if (g.type === 'balloon-hunt') {
    return { id: 'balloon-hunt', icon: '🎈', title: `Bóng bay: tìm nốt ${g.letters.map((l) => SOLFEGE[l]).join(', ')}`, description: DESCRIPTION['balloon-hunt'] };
  }
  return { id: g.spec.kind, icon: GAME_ICON[g.spec.kind], title: GAME_TITLE[g.spec.kind], description: DESCRIPTION[g.spec.kind] ?? '' };
}

/**
 * Bước cuối buổi giáo trình bổ sung: bé tự chọn một trò tìm nốt của buổi (đã cấu hình sẵn nốt).
 * Không tính vào điểm buổi; trò trong app ghi kỷ lục vào bản ghi buổi, Bóng bay lưu kỷ lục riêng của trò.
 */
export function SupplementGames({
  lesson,
  mode,
  onResult,
  onNext,
  onBack,
}: {
  lesson: CurriculumLesson;
  mode: UiMode;
  onResult: (r: GameResult & { kind: string }) => void;
  onNext?: () => void;
  onBack: () => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const record = useCurriculum((s) => s.records[lesson.lessonId]);
  const games = SUPPLEMENT_GAMES[lesson.lessonId] ?? [];
  const [picked, setPicked] = useState<number | null>(null);
  const kids = mode === 'kids';

  const chosen = picked === null ? undefined : games[picked];
  if (chosen && chosen.type === 'lesson') {
    return (
      <GamePlayer
        key={picked}
        specs={[chosen.spec]}
        mode={mode}
        recordOf={(k) => record?.games?.[k]}
        onResult={onResult}
        onNext={onNext}
        onBack={() => setPicked(null)}
        backLabel="Chọn trò khác"
      />
    );
  }

  const open = (i: number) => {
    const g = games[i];
    if (g.type === 'balloon-hunt') {
      navigate({
        name: 'balloon-pop',
        preset: { game: 'hunt', huntLetters: g.letters, mode: 'one-hand', hand: 'right', difficulty: 'easy', display: 'solfege', labelStyle: 'solfege' },
        returnTo: { name: 'lesson', lessonId: lesson.lessonId, stage: 'game' },
      });
      return;
    }
    setPicked(i);
  };

  return (
    <section className="mx-auto grid max-w-4xl gap-4" data-testid="supplement-games">
      <h2 className={`text-center font-extrabold ${kids ? 'text-3xl' : 'text-2xl'}`}>{kids ? 'Chọn một trò chơi nào! 🎮' : 'Chọn trò chơi'}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {games.map((g, i) => {
          const info = gameInfo(g);
          const rec = g.type === 'lesson' ? record?.games?.[g.spec.kind] : undefined;
          return (
            <button
              key={info.id}
              type="button"
              onClick={() => open(i)}
              data-testid={`supplement-game-${info.id}`}
              className="grid min-h-44 content-start justify-items-center gap-2 rounded-3xl bg-white/90 p-5 text-center shadow-sm ring-2 ring-violet-100 transition-transform hover:ring-fuchsia-300 active:scale-95 dark:bg-slate-800/90 dark:ring-violet-900"
            >
              <span className="text-6xl" aria-hidden>
                {info.icon}
              </span>
              <span className="text-lg font-bold">{info.title}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300">{info.description}</span>
              {rec && rec.plays > 0 && (
                <span className="text-sm text-amber-600 dark:text-amber-300">
                  {'★'.repeat(rec.bestStars)}
                  {'☆'.repeat(3 - rec.bestStars)} · kỷ lục {rec.bestScore}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">Trò chơi không tính vào điểm buổi — chơi bao nhiêu lần cũng được.</p>
      <div className="flex flex-wrap justify-center gap-3">
        {onNext && (
          <Button variant="primary" onClick={onNext} data-testid="supplement-next">
            Nốt tiếp theo →
          </Button>
        )}
        <Button variant="ghost" onClick={onBack} data-testid="supplement-games-back">
          Về giáo trình bổ sung
        </Button>
      </div>
    </section>
  );
}
