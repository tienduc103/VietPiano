import type { ExerciseScore } from '../../core/curriculum/scoring';
import type { Exercise, UiMode } from '../../core/curriculum/types';
import { ChoiceQuizStep, KeyQuizStep, NoteReadingStep } from './QuizSteps';
import { PlayStep } from './PlayStep';

/** Một bài tập bất kỳ của giáo trình (dùng trong buổi học và phần Luyện tập sau buổi). */
export function ExerciseView({ exercise, mode, tempoPercent, onDone }: { exercise: Exercise; mode: UiMode; tempoPercent: number; onDone: (s: ExerciseScore) => void }) {
  switch (exercise.kind) {
    case 'key-quiz':
      return <KeyQuizStep exercise={exercise} mode={mode} onDone={onDone} />;
    case 'choice-quiz':
      return <ChoiceQuizStep exercise={exercise} mode={mode} onDone={onDone} />;
    case 'note-reading':
      return <NoteReadingStep exercise={exercise} mode={mode} onDone={onDone} />;
    case 'play':
      return <PlayStep exercise={exercise} mode={mode} tempoPercent={tempoPercent} onDone={onDone} />;
  }
}
