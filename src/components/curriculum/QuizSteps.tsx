import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { matchesKeyTarget } from '../../core/curriculum/keys';
import { QuizEngine } from '../../core/curriculum/QuizEngine';
import { questionKey, scoreQuiz, wrongNoteKey, type ExerciseScore } from '../../core/curriculum/scoring';
import { text, type ChoiceQuizExercise, type KeyQuizExercise, type NoteReadingExercise, type Piece, type UiMode } from '../../core/curriculum/types';
import { midiToLabel, midiToName, pitchToLabel, requireMidi } from '../../core/music/notes';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useSettings } from '../../store/settingsStore';
import { useMic } from '../../store/micStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { Button } from '../ui';
import { Feedback, IllustrationView, RoundDots, StaticScore, StepTitle } from './common';

export interface StepProps<E> {
  exercise: E;
  mode: UiMode;
  onDone: (score: ExerciseScore) => void;
}

/** Hiện phản hồi trong chốc lát sau mỗi lần trả lời. */
function useFlash(eventTime: number, ms = 900): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (eventTime === 0) return;
    setOn(true);
    const id = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(id);
  }, [eventTime, ms]);
  return on;
}

function useEngine<A>(engine: QuizEngine<A>) {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getState(),
  );
}

/** Báo kết quả khi engine vừa xong (đợi phản hồi lượt cuối hiện ra một chút). */
function useFinish(finished: boolean, done: () => void) {
  useEffect(() => {
    if (!finished) return;
    const id = window.setTimeout(done, 700);
    return () => window.clearTimeout(id);
    // `done` đổi mỗi lần render; chỉ cần chạy khi vừa xong.
  }, [finished]);
}

// ── Tìm phím trên đàn ─────────────────────────────────────────────────

export function KeyQuizStep({ exercise, mode, onDone }: StepProps<KeyQuizExercise>) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const engine = useMemo(
    () => new QuizEngine<number>(exercise.rounds.map((r) => (midi: number) => matchesKeyTarget(r.target, midi)), { retry: exercise.retry }),
    [exercise],
  );
  const state = useEngine(engine);
  const flash = useFlash(state.lastEventTime);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource);
  useFinish(state.status === 'finished', () =>
    onDone(
      scoreQuiz(exercise, 'keyboard', {
        correct: state.correct,
        rounds: engine.rounds,
        answered: state.results.filter((r) => r !== 'pending').length,
        mistakes: state.mistakes.map((m) => questionKey(text(exercise.rounds[m.round].prompt))),
      }),
    ),
  );
  const round = exercise.rounds[state.index];
  return (
    <div className="grid gap-5" data-testid="key-quiz">
      <StepTitle title={text(exercise.title)} instructions={exercise.instructions && text(exercise.instructions)}>
        <RoundDots results={state.results} index={state.index} />
      </StepTitle>
      <p className={`text-center font-bold text-fuchsia-700 dark:text-fuchsia-300 ${mode === 'kids' ? 'text-4xl' : 'text-3xl'}`} data-testid="quiz-prompt">
        {text(round.prompt)}
      </p>
      <Feedback
        kind={flash ? state.lastOutcome : null}
        mode={mode}
        eventKey={state.lastEventTime}
        detail={flash && state.lastOutcome === 'wrong' && state.lastAnswer !== null ? `bạn bấm ${midiToLabel(state.lastAnswer, settings.labelStyle)}` : undefined}
      />
      <div className="h-44">
        <PianoKeyboard
          from={exercise.keyboard.from}
          to={exercise.keyboard.to}
          expected={null}
          detected={micLive?.midi ?? null}
          flash={flash && state.lastAnswer !== null && state.lastOutcome ? { midi: state.lastAnswer, kind: state.lastOutcome } : null}
          labelStyle={settings.labelStyle}
          onPress={(m) => virtualInput.press(m)}
        />
      </div>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">Bấm trên đàn thật (micro / MIDI) hoặc chạm bàn phím trên màn hình.</p>
    </div>
  );
}

// ── Câu hỏi trắc nghiệm ──────────────────────────────────────────────

export function ChoiceQuizStep({ exercise, mode, onDone }: StepProps<ChoiceQuizExercise>) {
  const engine = useMemo(() => new QuizEngine<number>(exercise.questions.map((q) => (i: number) => i === q.answer), { retry: false, minIntervalMs: 0 }), [exercise]);
  const state = useEngine(engine);
  // Sau mỗi câu: giữ câu vừa trả lời trên màn hình một lúc để thấy đáp án đúng.
  const [reveal, setReveal] = useState<{ q: number; chosen: number } | null>(null);
  useEffect(() => {
    if (!reveal) return;
    const id = window.setTimeout(() => setReveal(null), 900);
    return () => window.clearTimeout(id);
  }, [reveal]);
  useFinish(state.status === 'finished' && reveal === null, () =>
    onDone(
      scoreQuiz(exercise, 'theory', {
        correct: state.correct,
        rounds: engine.rounds,
        answered: state.results.filter((r) => r !== 'pending').length,
        mistakes: state.mistakes.map((m) => questionKey(text(exercise.questions[m.round].prompt))),
      }),
    ),
  );
  const shown = reveal ? reveal.q : state.index;
  const q = exercise.questions[shown];
  const choose = (i: number) => {
    if (reveal || state.status === 'finished') return;
    setReveal({ q: state.index, chosen: i });
    engine.answer(i, performance.now());
  };
  return (
    <div className="grid gap-5" data-testid="choice-quiz">
      <StepTitle title={text(exercise.title)} instructions={exercise.instructions && text(exercise.instructions)}>
        <RoundDots results={state.results} index={shown} />
      </StepTitle>
      <p className={`font-bold ${mode === 'kids' ? 'text-3xl' : 'text-2xl'}`} data-testid="quiz-prompt">
        {text(q.prompt)}
      </p>
      {q.illustration && <IllustrationView ill={q.illustration} id={`${exercise.id}-${shown}`} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {q.options.map((o, i) => {
          const isAnswer = reveal && i === q.answer;
          const isWrongPick = reveal && i === reveal.chosen && i !== q.answer;
          return (
            <Button
              key={i}
              onClick={() => choose(i)}
              data-testid={`choice-${i}`}
              className={`min-h-16 text-lg ${isAnswer ? 'bg-emerald-500! text-white!' : isWrongPick ? 'bg-rose-500! text-white!' : ''}`}
            >
              {text(o)}
            </Button>
          );
        })}
      </div>
      <Feedback kind={reveal ? (reveal.chosen === q.answer ? 'correct' : 'wrong') : null} mode={mode} eventKey={state.lastEventTime} />
    </div>
  );
}

// ── Đọc nốt trên khuông ──────────────────────────────────────────────

export function NoteReadingStep({ exercise, mode, onDone }: StepProps<NoteReadingExercise>) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const play = exercise.answer === 'play';
  const engine = useMemo(
    () =>
      new QuizEngine<string>(
        exercise.sequence.map((p) => (ans: string) => (play ? requireMidi(ans) === requireMidi(p) : ans === p)),
        { retry: false },
      ),
    [exercise, play],
  );
  const state = useEngine(engine);
  const flash = useFlash(state.lastEventTime);
  const [hinted, setHinted] = useState(-1);
  useNoteInput({ onNote: (e) => play && engine.answer(midiToName(e.midi), e.time) }, settings.inputSource, { computerKeys: play });
  useFinish(state.status === 'finished', () =>
    onDone(
      scoreQuiz(exercise, 'recognition', {
        correct: state.correct,
        rounds: engine.rounds,
        answered: state.results.filter((r) => r !== 'pending').length,
        mistakes: state.mistakes.map((m) => wrongNoteKey(exercise.sequence[m.round], m.answer)),
      }),
    ),
  );
  const pitch = exercise.sequence[state.index];
  const piece: Piece = useMemo(
    () => ({ notation: `${pitch}/w`, clef: exercise.clef, hand: exercise.clef === 'bass' ? 'left' : 'right', bpm: 60, timeSignature: [4, 4] }),
    [pitch, exercise.clef],
  );
  const showHint = hinted === state.index;
  const lastMistake = state.mistakes[state.mistakes.length - 1];
  const range = exercise.clef === 'bass' ? { from: 41, to: 60 } : { from: 57, to: 77 };
  return (
    <div className="grid gap-5" data-testid="note-reading">
      <StepTitle
        title={text(exercise.title)}
        instructions={exercise.instructions ? text(exercise.instructions) : play ? 'Nhìn nốt trên khuông rồi đánh nốt đó.' : 'Nốt này tên là gì?'}
      >
        <RoundDots results={state.results} index={state.index} />
      </StepTitle>
      <div className="mx-auto w-full max-w-md">
        <StaticScore piece={piece} id={`${exercise.id}-${state.index}`} showNames={showHint} />
      </div>
      <Feedback
        kind={flash ? state.lastOutcome : null}
        mode={mode}
        eventKey={state.lastEventTime}
        detail={flash && state.lastOutcome === 'wrong' && lastMistake ? `nốt vừa rồi là ${pitchToLabel(exercise.sequence[lastMistake.round], settings.labelStyle)}` : undefined}
      />
      {play ? (
        <div className="h-40">
          <PianoKeyboard
            from={range.from}
            to={range.to}
            expected={showHint ? requireMidi(pitch) : null}
            detected={micLive?.midi ?? null}
            flash={null}
            labelStyle={settings.labelStyle}
            onPress={(m) => virtualInput.press(m)}
          />
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-3">
          {(exercise.choices ?? []).map((c) => (
            <Button key={c} className="min-h-16 min-w-24 text-2xl" data-testid={`name-${c}`} onClick={() => engine.answer(c, performance.now())}>
              {pitchToLabel(c, settings.labelStyle)}
            </Button>
          ))}
        </div>
      )}
      <div className="text-center">
        <Button
          variant="ghost"
          disabled={showHint}
          onClick={() => {
            engine.hint();
            setHinted(state.index);
          }}
        >
          Gợi ý (lượt này không tính đúng lần đầu)
        </Button>
      </div>
    </div>
  );
}
