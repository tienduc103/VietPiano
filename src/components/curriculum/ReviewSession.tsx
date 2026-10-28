import { useMemo, useState } from 'react';
import { CURRICULUM } from '../../core/curriculum/content/curriculum';
import { buildReview, CUMULATIVE_PREFIX, type EarlierLesson } from '../../core/curriculum/review';
import { orderedLessons } from '../../core/curriculum/unlock';
import type { ExerciseScore } from '../../core/curriculum/scoring';
import { text, type CurriculumLesson, type UiMode } from '../../core/curriculum/types';
import { useCurriculum } from '../../store/curriculumStore';
import { Button, Icon } from '../ui';
import { InputSourceBar } from './common';
import { ExerciseView } from './ExerciseView';

/**
 * Phần Luyện tập sau buổi học: ôn lại các bài yếu nhất của buổi (sinh tự động, xem `core/curriculum/review.ts`).
 * Không chấm vào điểm buổi; xong thì báo `onComplete` (ghi số lần luyện tập) rồi mời sang Trò chơi.
 */
export function ReviewSession({
  lesson,
  mode,
  tempoPercent,
  onComplete,
  onGame,
}: {
  lesson: CurriculumLesson;
  mode: UiMode;
  tempoPercent: number;
  onComplete: () => void;
  onGame: () => void;
}) {
  const kids = mode === 'kids';
  const [run, setRun] = useState(0);
  // Sinh một lần cho mỗi lượt luyện (đọc tiến độ lúc bắt đầu, không sinh lại khi điểm vừa được ghi).
  const exercises = useMemo(() => {
    const records = useCurriculum.getState().records;
    const best = (id: string) => Object.fromEntries(Object.entries(records[id]?.exercises ?? {}).map(([exId, e]) => [exId, e.bestScore]));
    // Ôn cộng dồn: các buổi cùng cấp đã học trước buổi này.
    const level = CURRICULUM.levels.find((l) => l.levelId === lesson.levelId);
    const ordered = level ? orderedLessons(level) : [];
    const earlier: EarlierLesson[] = ordered
      .slice(0, Math.max(0, ordered.findIndex((l) => l.lessonId === lesson.lessonId)))
      .filter((l) => Object.keys(records[l.lessonId]?.exercises ?? {}).length > 0)
      .map((l) => ({ lesson: l, bestScores: best(l.lessonId), mistakes: records[l.lessonId].mistakes }));
    return buildReview(lesson, { bestScores: best(lesson.lessonId), mistakes: records[lesson.lessonId]?.mistakes, earlier });
  }, [lesson, run]);
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [scores, setScores] = useState<ExerciseScore[]>([]);
  const [justDone, setJustDone] = useState<ExerciseScore | null>(null);
  const finished = index >= exercises.length;

  const next = () => {
    setJustDone(null);
    if (index + 1 >= exercises.length) onComplete();
    setIndex(index + 1);
  };
  const again = () => {
    setRun((r) => r + 1);
    setIndex(0);
    setScores([]);
    setJustDone(null);
  };

  if (finished) {
    return (
      <section className="mx-auto grid max-w-2xl gap-5 rounded-3xl bg-white/90 p-6 text-center shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900" data-testid="review-done">
        <div className="text-6xl">🎯</div>
        <h2 className="text-2xl font-extrabold">{kids ? 'Luyện tập xong rồi!' : 'Hoàn thành phần luyện tập'}</h2>
        <ul className="grid gap-2 text-left">
          {exercises.map((e, i) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 px-4 py-2 dark:bg-slate-700/60">
              <span>{text(e.title)}</span>
              <span className="font-bold tabular-nums">{scores[i] ? `${scores[i].score}` : '—'}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={again} data-testid="review-again">
            <Icon name="restart" /> Luyện thêm lượt nữa
          </Button>
          <Button variant="primary" className="text-lg" onClick={onGame} data-testid="go-game">
            🎮 Tiếp: Trò chơi
          </Button>
        </div>
      </section>
    );
  }

  const exercise = exercises[index];
  return (
    <div className="grid gap-4" data-testid="review">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-2 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
        <span className="font-semibold text-amber-900 dark:text-amber-200">
          🎯 Luyện tập {index + 1}/{exercises.length} ·{' '}
          {exercises[index].id.startsWith(CUMULATIVE_PREFIX)
            ? kids
              ? 'nhớ lại bài cũ nào!'
              : 'khởi động: ôn lại buổi đã học'
            : kids
              ? 'ôn lại cho thật chắc nhé!'
              : 'ôn phần còn yếu của buổi — không tính điểm buổi'}
        </span>
        <Button variant="ghost" onClick={onGame} data-testid="review-skip">
          Bỏ qua → Trò chơi
        </Button>
      </div>
      <InputSourceBar />
      {justDone ? (
        <section className="rounded-3xl bg-white/90 p-6 text-center shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900" data-testid="review-step-done">
          <div className="text-4xl font-extrabold tabular-nums">{justDone.score}/100</div>
          <p className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400">{justDone.score >= 80 ? (kids ? 'Chắc tay rồi! 🎉' : 'Tốt') : kids ? 'Cố thêm chút nữa nhé 💪' : 'Nên luyện thêm phần này'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Button
              onClick={() => {
                setJustDone(null);
                setAttempt((a) => a + 1);
              }}
            >
              <Icon name="restart" /> Làm lại
            </Button>
            <Button variant="primary" onClick={next} data-testid="review-next">
              Tiếp tục
            </Button>
          </div>
        </section>
      ) : (
        <ExerciseView
          key={`${run}-${exercise.id}-${attempt}`}
          exercise={exercise}
          mode={mode}
          tempoPercent={tempoPercent}
          onDone={(s) => {
            setScores((xs) => {
              const out = xs.slice();
              out[index] = s;
              return out;
            });
            setJustDone(s);
          }}
        />
      )}
    </div>
  );
}
