import { useMemo, useRef, useState } from 'react';
import { CURRICULUM } from '../../core/curriculum/content/curriculum';
import type { CurriculumLesson, UiMode } from '../../core/curriculum/types';
import { orderedLessons } from '../../core/curriculum/unlock';
import { GAME_TITLE, gameForLesson } from '../../core/games/gameForLesson';
import { useCurriculum } from '../../store/curriculumStore';
import { InputSourceBar } from '../curriculum/common';
import { Button, Icon } from '../ui';
import { KeyHuntView } from './KeyHuntView';
import { NoteCatchView } from './NoteCatchView';
import { Stars, type GameResult } from './shared';

const HOW_TO: Record<'note-catch' | 'key-hunt', { adult: string; kids: string; icon: string }> = {
  'note-catch': {
    icon: '🌠',
    adult: 'Nốt nhạc rơi xuống theo làn phía trên phím của nó. Đánh đúng nốt trước khi chạm đáy để hứng. Để rơi 1 nốt là mất 1 mạng; càng về sau nốt rơi càng nhanh.',
    kids: 'Nốt nhạc đang rơi! Bấm đúng phím để hứng trước khi nốt chạm đất nhé. Hứng liên tiếp được thưởng thêm điểm!',
  },
  'key-hunt': {
    icon: '🐸',
    adult: 'Mỗi lượt có một yêu cầu tìm phím và thanh thời gian. Bấm đúng càng nhanh càng nhiều điểm; bấm sai thì mất chuỗi nhưng vẫn được thử tiếp.',
    kids: 'Các bạn thú đang trốn trên bàn phím! Đọc yêu cầu rồi bấm thật nhanh để bắt được bạn ấy.',
  },
};

/**
 * Trò chơi sau buổi học (sau phần Luyện tập): giới thiệu → chơi → kết quả (sao, điểm, kỷ lục).
 * Trò chơi suy từ nội dung buổi (`gameForLesson`); điểm không ảnh hưởng tiến độ buổi.
 */
export function GameStage({
  lesson,
  mode,
  onResult,
  onNext,
  onBack,
}: {
  lesson: CurriculumLesson;
  mode: UiMode;
  onResult: (r: GameResult) => void;
  onNext?: () => void;
  onBack: () => void;
}) {
  const kids = mode === 'kids';
  const spec = useMemo(() => {
    const level = CURRICULUM.levels.find((l) => l.levelId === lesson.levelId);
    const lessons = level ? orderedLessons(level) : [];
    return gameForLesson(lesson, lessons.slice(0, Math.max(0, lessons.findIndex((l) => l.lessonId === lesson.lessonId))));
  }, [lesson]);
  const record = useCurriculum((s) => s.records[lesson.lessonId]);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<GameResult | null>(null);
  /** Kỷ lục trước ván này (để báo "Kỷ lục mới"). */
  const previousBest = useRef(0);

  const start = () => {
    previousBest.current = record?.gameBestScore ?? 0;
    setRun((r) => r + 1);
    setPhase('play');
  };
  const end = (r: GameResult) => {
    setResult(r);
    setPhase('result');
    onResult(r);
  };
  const how = HOW_TO[spec.kind];

  if (phase === 'play') {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-2xl font-bold">
            {how.icon} {GAME_TITLE[spec.kind]}
          </h2>
          <Button variant="ghost" onClick={() => setPhase('intro')}>
            Dừng
          </Button>
        </div>
        <InputSourceBar />
        {spec.kind === 'note-catch' ? <NoteCatchView key={run} spec={spec} mode={mode} onEnd={end} /> : <KeyHuntView key={run} spec={spec} mode={mode} onEnd={end} />}
      </div>
    );
  }

  return (
    <section
      className="mx-auto grid max-w-2xl gap-5 rounded-3xl bg-white/90 p-6 text-center shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900"
      data-testid={phase === 'result' ? 'game-result' : 'game-intro'}
      data-game={spec.kind}
    >
      {phase === 'result' && result ? (
        <>
          <Stars stars={result.stars} />
          <h2 className="text-2xl font-extrabold">{result.stars === 3 ? (kids ? 'Siêu đỉnh! 🏆' : 'Xuất sắc!') : result.stars >= 1 ? (kids ? 'Giỏi lắm! 🎉' : 'Hoàn thành') : 'Thử lại nhé!'}</h2>
          <div className="text-5xl font-extrabold tabular-nums" data-testid="game-final-score">
            {result.score}
          </div>
          {result.score > previousBest.current && previousBest.current > 0 && <p className="font-bold text-fuchsia-600 dark:text-fuchsia-300">🏅 Kỷ lục mới!</p>}
          <dl className="grid grid-cols-3 gap-3">
            <Stat label={spec.kind === 'note-catch' ? 'Hứng được' : 'Bắt được'} value={`${result.hits}/${result.total}`} />
            <Stat label="Chuỗi dài nhất" value={`${result.bestCombo}`} />
            <Stat label="Kỷ lục" value={`${Math.max(result.score, previousBest.current)}`} />
          </dl>
        </>
      ) : (
        <>
          <div className="text-6xl">{how.icon}</div>
          <h2 className="text-2xl font-extrabold">{GAME_TITLE[spec.kind]}</h2>
          <p className={kids ? 'text-xl' : 'text-lg'}>{kids ? how.kids : how.adult}</p>
          {record && record.gamePlays > 0 && (
            <div className="grid justify-items-center gap-1">
              <Stars stars={record.gameBestStars} className="text-3xl" />
              <span className="text-sm text-slate-500 dark:text-slate-400">Kỷ lục: {record.gameBestScore} điểm</span>
            </div>
          )}
        </>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button variant={phase === 'result' && onNext ? 'secondary' : 'primary'} className="text-lg" onClick={start} data-testid={phase === 'result' ? 'game-again' : 'game-start'}>
          {phase === 'result' ? (
            <>
              <Icon name="restart" /> Chơi lại
            </>
          ) : (
            '▶ Bắt đầu chơi'
          )}
        </Button>
        {onNext && (
          <Button variant={phase === 'result' ? 'primary' : 'secondary'} className="text-lg" onClick={onNext} data-testid="game-next">
            Bài tiếp theo →
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          Về giáo trình
        </Button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-violet-50 px-3 py-2 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
