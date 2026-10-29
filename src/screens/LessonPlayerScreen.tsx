import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CURRICULUM } from '../core/curriculum/content/curriculum';
import { lessonFeedback } from '../core/curriculum/feedback';
import { formatMistake, scoreLesson, starsFor, type ExerciseScore } from '../core/curriculum/scoring';
import { text, type Activity, type CurriculumLesson, type Exercise, type UiMode } from '../core/curriculum/types';
import { findLesson, missingPrerequisites, nextLessonAfter } from '../core/curriculum/unlock';
import { useApp, type LessonStage } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { useSettings } from '../store/settingsStore';
import { useUiMode } from '../hooks/useUiMode';
import { useWakeLock } from '../hooks/useAppLifecycle';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { InputSourceBar, IllustrationView } from '../components/curriculum/common';
import { ExerciseView } from '../components/curriculum/ExerciseView';
import { ReviewSession } from '../components/curriculum/ReviewSession';
import { GameStage } from '../components/games/GameStage';
import { AiCoachCard } from '../components/AiCoachCard';
import { lessonReport } from '../core/feedback/coachPrompt';
import { AiNoteHistory } from '../components/AiNoteHistory';
import { VoiceBar } from '../components/VoiceBar';
import { useVoiceCue, useVoiceScope } from '../hooks/useVoiceTeacher';
import { overrideCue, phrases } from '../core/voice/phrases';

/** Thời gian một bước tối đa được tính là luyện tập (bỏ đi giữa chừng thì không cộng cả buổi chiều). */
const MAX_STEP_MS = 15 * 60_000;

type Step = { type: 'overview' } | { type: 'activity'; activity: Activity } | { type: 'exercise'; exercise: Exercise };

/** Luồng một buổi: các bước của buổi → kết quả → Luyện tập → Trò chơi → buổi tiếp theo. */
type Phase = 'steps' | 'result' | LessonStage;

export function LessonPlayerScreen({ lessonId, stage }: { lessonId: string; stage?: LessonStage }) {
  const lesson = findLesson(CURRICULUM, lessonId);
  const navigate = useApp((s) => s.navigate);
  if (!lesson) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="mb-4 text-lg">Không tìm thấy buổi học.</p>
          <Button variant="primary" onClick={() => navigate({ name: 'curriculum' })}>
            Về giáo trình
          </Button>
        </div>
      </div>
    );
  }
  return <Player key={`${lesson.lessonId}-${stage ?? ''}`} lesson={lesson} stage={stage} />;
}

function Player({ lesson, stage }: { lesson: CurriculumLesson; stage?: LessonStage }) {
  const navigate = useApp((s) => s.navigate);
  const mode = useUiMode();
  const records = useCurriculum((s) => s.records);
  const saveError = useCurriculum((s) => s.saveError);
  const { recordExercise, recordRun, markIntroDone, addTime, recordReview, recordGame } = useCurriculum.getState();
  useWakeLock(true);
  // Đổi buổi học (Player dựng lại theo key) → huỷ lời cô giáo của buổi cũ.
  useVoiceScope();

  const steps = useMemo<Step[]>(
    () => [{ type: 'overview' }, ...lesson.activities.map((activity) => ({ type: 'activity' as const, activity })), ...lesson.exercises.map((exercise) => ({ type: 'exercise' as const, exercise }))],
    [lesson],
  );
  const firstExercise = steps.findIndex((s) => s.type === 'exercise');
  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(stage ?? 'steps');
  const [attempt, setAttempt] = useState(0);
  /** Điểm các bài tập trong lần học này (màn kết quả chấm theo lần này). */
  const [runScores, setRunScores] = useState<Record<string, ExerciseScore>>({});
  const [justDone, setJustDone] = useState<ExerciseScore | null>(null);

  // Thời gian luyện: đo theo từng bước, cộng vào bản ghi khi xong bài tập hoặc khi rời màn.
  const stepStart = useRef(performance.now());
  const takeElapsed = useCallback(() => {
    const now = performance.now();
    const ms = Math.min(MAX_STEP_MS, now - stepStart.current);
    stepStart.current = now;
    return ms;
  }, []);
  useEffect(
    () => () => {
      void addTime(lesson, takeElapsed());
    },
    [lesson, addTime, takeElapsed],
  );

  const step = steps[stepIndex];
  const goTo = (i: number) => {
    if (step.type !== 'exercise' || phase !== 'steps') void addTime(lesson, takeElapsed());
    // Đã xem hết phần giới thiệu khi đi tới bài tập đầu tiên (hoặc hết buổi).
    if (lesson.activities.length && (i >= firstExercise || firstExercise < 0)) void markIntroDone(lesson);
    setJustDone(null);
    stepStart.current = performance.now();
    if (i >= steps.length) {
      setPhase('result');
      return;
    }
    setStepIndex(i);
  };

  const onExerciseDone = (exercise: Exercise, score: ExerciseScore) => {
    setRunScores((r) => ({ ...r, [exercise.id]: score }));
    setJustDone(score);
    void recordExercise(lesson, score, takeElapsed());
  };

  /** Sang Luyện tập / Trò chơi: thời gian trước đó cộng vào buổi, phần mới đo lại từ đầu. */
  const enterStage = (p: LessonStage) => {
    void addTime(lesson, takeElapsed());
    setJustDone(null);
    setPhase(p);
  };

  const retryLesson = () => {
    setRunScores({});
    setPhase('steps');
    setJustDone(null);
    setAttempt((a) => a + 1);
    setStepIndex(firstExercise >= 0 ? firstExercise : 0);
    stepStart.current = performance.now();
  };

  const runResult = useMemo(() => scoreLesson(lesson, runScores, true), [lesson, runScores]);
  const ranAll = lesson.exercises.every((e) => runScores[e.id]);
  const recordedRun = useRef(false);
  useEffect(() => {
    if (phase !== 'result' || recordedRun.current || !ranAll || lesson.exercises.length === 0) return;
    recordedRun.current = true;
    void recordRun(lesson, runResult.score);
  }, [phase, ranAll, lesson, runResult.score, recordRun]);
  useEffect(() => {
    if (phase === 'steps') recordedRun.current = false;
  }, [phase]);

  const record = records[lesson.lessonId];
  const next = nextLessonAfter(CURRICULUM, lesson.lessonId);
  const tempoPercent = lesson.ageVariants[mode]?.tempoPercent ?? 100;

  return (
    <div className={`flex h-full flex-col ${mode === 'kids' ? 'kids-mode' : ''}`} data-ui-mode={mode} data-testid="lesson-player">
      <header className="flex flex-wrap items-center gap-3 px-4 pt-[calc(1rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-2 pl-16">
        <Button variant="ghost" onClick={() => navigate({ name: 'curriculum' })} aria-label="Về giáo trình" className="px-2">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-sm text-slate-500 dark:text-slate-400">Buổi {lesson.number}</div>
          <h1 className="truncate text-xl font-bold" data-testid="lesson-title">
            {text(lesson.title)}
          </h1>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Các bước của buổi học">
          {steps.map((s, i) => {
            const ex = s.type === 'exercise' ? s.exercise : null;
            const sc = ex ? runScores[ex.id] : undefined;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setPhase('steps');
                  goTo(i);
                }}
                aria-current={phase === 'steps' && i === stepIndex ? 'step' : undefined}
                title={stepLabel(s)}
                className={`grid size-11 place-items-center rounded-full text-sm font-bold ring-2 ${
                  phase === 'steps' && i === stepIndex
                    ? 'bg-fuchsia-500 text-white ring-fuchsia-300'
                    : sc
                      ? sc.passed
                        ? 'bg-emerald-500 text-white ring-emerald-300'
                        : 'bg-amber-400 text-amber-950 ring-amber-200'
                      : 'bg-white text-violet-700 ring-violet-200 dark:bg-slate-800 dark:text-violet-200 dark:ring-violet-800'
                }`}
              >
                {s.type === 'overview' ? 'i' : s.type === 'activity' ? '★' : i - (firstExercise - 1)}
              </button>
            );
          })}
          <span className="mx-1 w-px self-stretch bg-violet-200 dark:bg-violet-800" aria-hidden />
          {(
            [
              { p: 'review', icon: '🎯', label: 'Luyện tập sau buổi', done: (record?.reviewCount ?? 0) > 0 },
              { p: 'game', icon: '🎮', label: 'Trò chơi', done: (record?.gamePlays ?? 0) > 0 },
            ] as const
          ).map((x) => (
            <button
              key={x.p}
              type="button"
              onClick={() => phase !== x.p && enterStage(x.p)}
              aria-current={phase === x.p ? 'step' : undefined}
              title={x.label}
              aria-label={x.label}
              data-testid={`nav-${x.p}`}
              className={`grid size-11 place-items-center rounded-full text-lg ring-2 ${
                phase === x.p
                  ? 'bg-fuchsia-500 ring-fuchsia-300'
                  : x.done
                    ? 'bg-emerald-100 ring-emerald-300 dark:bg-emerald-950 dark:ring-emerald-700'
                    : 'bg-white ring-violet-200 dark:bg-slate-800 dark:ring-violet-800'
              }`}
            >
              {x.icon}
            </button>
          ))}
        </nav>
        <FullscreenButton />
      </header>

      {saveError && (
        <p className="mx-4 rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="alert">
          {saveError}
        </p>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="mx-auto max-w-6xl">
          {phase !== 'game' && (
            <div className="mb-3">
              <VoiceBar mode={mode} />
            </div>
          )}
          {phase === 'review' ? (
            <ReviewSession lesson={lesson} mode={mode} tempoPercent={tempoPercent} onComplete={() => void recordReview(lesson, takeElapsed())} onGame={() => enterStage('game')} />
          ) : phase === 'game' ? (
            <GameStage
              lesson={lesson}
              mode={mode}
              onResult={(r) => void recordGame(lesson, r, takeElapsed())}
              onNext={next ? () => navigate({ name: 'lesson', lessonId: next.lessonId }) : undefined}
              onBack={() => navigate({ name: 'curriculum' })}
            />
          ) : phase === 'result' ? (
            <LessonResult
              lesson={lesson}
              mode={mode}
              scores={runScores}
              passedEver={record?.passed ?? false}
              onRetry={retryLesson}
              onReview={() => enterStage('review')}
              onNext={next ? () => navigate({ name: 'lesson', lessonId: next.lessonId }) : undefined}
              onBack={() => navigate({ name: 'curriculum' })}
            />
          ) : step.type === 'overview' ? (
            <Overview lesson={lesson} mode={mode} onStart={() => goTo(1)} />
          ) : step.type === 'activity' ? (
            <IntroStep key={step.activity.id} activity={step.activity} mode={mode} onDone={() => goTo(stepIndex + 1)} />
          ) : (
            <div className="grid gap-4">
              <InputSourceBar />
              {justDone ? (
                <ExerciseDone
                  score={justDone}
                  mode={mode}
                  required={step.exercise.required ?? true}
                  practice={(step.exercise.weight ?? 1) === 0}
                  onRetry={() => {
                    setJustDone(null);
                    setAttempt((a) => a + 1);
                    stepStart.current = performance.now();
                  }}
                  onNext={() => goTo(stepIndex + 1)}
                  last={stepIndex === steps.length - 1}
                />
              ) : (
                <ExerciseView key={`${step.exercise.id}-${attempt}`} exercise={step.exercise} mode={mode} tempoPercent={tempoPercent} onDone={(s) => onExerciseDone(step.exercise, s)} />
              )}
            </div>
          )}
        </div>
      </main>
      <AppVersion className="shrink-0 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] leading-none" />
    </div>
  );
}

function stepLabel(s: Step): string {
  if (s.type === 'overview') return 'Giới thiệu buổi học';
  if (s.type === 'activity') return text(s.activity.title);
  return text(s.exercise.title);
}

function Overview({ lesson, mode, onStart }: { lesson: CurriculumLesson; mode: UiMode; onStart: () => void }) {
  const records = useCurriculum((s) => s.records);
  const missing = missingPrerequisites(lesson, records).map((id) => findLesson(CURRICULUM, id)).filter((l): l is CurriculumLesson => !!l);
  const variant = lesson.ageVariants[mode];
  const rec = records[lesson.lessonId];
  useVoiceScope();
  useVoiceCue(overrideCue(phrases.lessonStart(text(lesson.title)), lesson.voice), lesson.lessonId, mode);
  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]" data-testid="lesson-overview">
      <section className="rounded-3xl bg-white/90 p-6 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900">
        <p className={mode === 'kids' ? 'text-xl' : 'text-lg'}>{text(variant?.description ?? lesson.description)}</p>
        <h2 className="mt-5 font-semibold">Mục tiêu</h2>
        <ul className="mt-2 grid gap-1.5">
          {lesson.learningObjectives.map((o, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-500">✓</span>
              {text(o)}
            </li>
          ))}
        </ul>
        {variant?.tips?.map((t, i) => (
          <p key={i} className="mt-3 text-violet-700 dark:text-violet-300">
            💡 {text(t)}
          </p>
        ))}
        {lesson.notes?.map((n, i) => (
          <p key={i} className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-200">
            ℹ️ {text(n)}
          </p>
        ))}
        {missing.length > 0 && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="suggest-before">
            Nên học trước: {missing.map((l) => `Buổi ${l.number} – ${text(l.title)}`).join(', ')}. Bạn vẫn có thể học buổi này.
          </p>
        )}
        <Button variant="primary" className="mt-6 min-w-48 text-lg" onClick={onStart} data-testid="start-lesson">
          {rec?.passed ? 'Học lại' : rec ? 'Học tiếp' : 'Bắt đầu'}
        </Button>
      </section>
      <aside className="grid content-start gap-3">
        <Info label="Thời lượng" value={`~${lesson.estimatedDuration} phút`} />
        <Info label="Bài tập" value={`${lesson.exercises.length}`} />
        <Info label="Điểm đạt" value={`${lesson.assessment.passScore}/100${lesson.assessment.checkpoint ? ' · kiểm tra' : ''}`} />
        {rec && <Info label="Điểm cao nhất" value={rec.attempts > 0 ? `${rec.bestScore}/100` : '—'} />}
        {rec && rec.aiNotes.length > 0 && <AiNoteHistory notes={rec.aiNotes} />}
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900">
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function IntroStep({ activity, mode, onDone }: { activity: Activity; mode: UiMode; onDone: () => void }) {
  const [page, setPage] = useState(0);
  const p = activity.pages[page];
  const last = page === activity.pages.length - 1;
  const shown = text(mode === 'kids' && p.kids ? p.kids : p.body);
  useVoiceScope();
  useVoiceCue(p.voice ?? phrases.say(shown, 'step_start', 'intro_page'), `${activity.id}-${page}`, mode);
  return (
    <div className="grid gap-5" data-testid="intro-step">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold" data-testid="step-title">
          {text(p.title ?? activity.title)}
        </h2>
        <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
          {page + 1}/{activity.pages.length}
        </span>
      </div>
      <p className={mode === 'kids' ? 'text-2xl leading-relaxed' : 'text-lg'}>{shown}</p>
      {p.illustration && <IllustrationView ill={p.illustration} id={`${activity.id}-${page}`} />}
      <div className="flex gap-3">
        <Button onClick={() => setPage((x) => x - 1)} disabled={page === 0}>
          <Icon name="back" /> Trước
        </Button>
        <Button variant="primary" onClick={() => (last ? onDone() : setPage((x) => x + 1))} data-testid="intro-next">
          {last ? 'Bắt đầu luyện tập' : 'Tiếp'}
        </Button>
      </div>
    </div>
  );
}

function Criteria({ score }: { score: ExerciseScore }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {score.criteria.map((c) => (
        <div key={c.key} className="rounded-xl bg-violet-50 px-3 py-2 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900">
          <dt className="text-xs text-slate-500 dark:text-slate-400">
            {c.label} ({c.weight}%)
          </dt>
          <dd className="text-lg font-bold tabular-nums">{c.value === null ? 'không đo' : `${Math.round(c.value * 100)}%`}</dd>
        </div>
      ))}
    </dl>
  );
}

function ExerciseDone({
  score,
  mode,
  required,
  practice,
  onRetry,
  onNext,
  last,
}: {
  score: ExerciseScore;
  mode: UiMode;
  required: boolean;
  /** Bài luyện tập: không tính vào điểm buổi. */
  practice: boolean;
  onRetry: () => void;
  onNext: () => void;
  last: boolean;
}) {
  const kids = mode === 'kids';
  useVoiceScope();
  useVoiceCue(phrases.exerciseResult(score.passed || practice), score, mode, 'encouragement');
  const stars = starsFor(score.score);
  return (
    <section className="rounded-3xl bg-white/90 p-6 text-center shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900" data-testid="exercise-done">
      {kids && (
        <div className="text-5xl text-amber-400" aria-label={`${stars} sao`}>
          {'★'.repeat(stars)}
          <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(3 - stars)}</span>
        </div>
      )}
      <div className="mt-2 text-4xl font-extrabold tabular-nums" data-testid="exercise-score">
        {score.score}/100
      </div>
      <p className={`mt-1 font-semibold ${score.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} data-testid="exercise-verdict">
        {practice
          ? kids
            ? 'Khởi động xong! 👍'
            : 'Xong bài luyện tập (không tính điểm)'
          : score.passed
            ? kids
              ? 'Đạt rồi! 🎉'
              : 'Đạt'
            : required
              ? kids
                ? 'Chưa đạt — thử lại nhé!'
                : 'Chưa đạt yêu cầu'
              : 'Chưa đạt (bài không bắt buộc)'}
      </p>
      {!kids && (
        <div className="mx-auto mt-4 max-w-2xl text-left">
          <Criteria score={score} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button onClick={onRetry}>
          <Icon name="restart" /> Làm lại
        </Button>
        <Button variant="primary" onClick={onNext} data-testid="exercise-next">
          {last ? 'Xem kết quả' : 'Tiếp tục'}
        </Button>
      </div>
    </section>
  );
}

function LessonResult({
  lesson,
  mode,
  scores,
  passedEver,
  onRetry,
  onReview,
  onNext,
  onBack,
}: {
  lesson: CurriculumLesson;
  mode: UiMode;
  scores: Record<string, ExerciseScore>;
  passedEver: boolean;
  onRetry: () => void;
  /** Sang phần Luyện tập (rồi Trò chơi) trước khi học buổi tiếp theo. */
  onReview: () => void;
  onNext?: () => void;
  onBack: () => void;
}) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const recordAiNote = useCurriculum((s) => s.recordAiNote);
  // Mốc của lần làm này: nhận xét AI "Viết lại" ghi đè cùng mốc thay vì thêm bản mới.
  const [runAt] = useState(() => Date.now());
  const result = scoreLesson(lesson, scores, true);
  const list = lesson.exercises.map((e) => ({ e, s: scores[e.id] }));
  const done = list.filter((x) => x.s).map((x) => x.s!);
  const scored = list.filter((x) => (x.e.weight ?? 1) > 0 && x.s);
  const accuracy = scored.length ? scored.reduce((a, x) => a + x.s!.accuracy, 0) / scored.length : 0;
  const mistakes = new Map<string, number>();
  for (const s of done) for (const m of s.mistakes) mistakes.set(m, (mistakes.get(m) ?? 0) + 1);
  const topMistakes = [...mistakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const feedback = lessonFeedback(result, done, mode);
  const kids = mode === 'kids';
  const stars = starsFor(result.score);
  useVoiceScope();
  useVoiceCue(overrideCue(phrases.lessonComplete(result.passed), lesson.voice), runAt, mode, 'encouragement');

  return (
    <section className="mx-auto grid max-w-3xl gap-5 rounded-3xl bg-white/90 p-6 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900" data-testid="lesson-result" aria-label="Kết quả buổi học">
      <div className="text-center">
        {kids && (
          <div className="text-6xl text-amber-400" aria-label={`${stars} sao`}>
            {'★'.repeat(stars)}
            <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(3 - stars)}</span>
          </div>
        )}
        <h2 className="mt-2 text-2xl font-extrabold">{result.passed ? (kids ? 'Hoàn thành buổi học!' : 'Đạt buổi học') : 'Kết quả buổi học'}</h2>
        <div className="mt-2 text-5xl font-extrabold tabular-nums" data-testid="lesson-score">
          {result.score}/100
        </div>
        <p className={`mt-1 font-semibold ${result.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} data-testid="lesson-verdict">
          {result.passed ? 'Đạt' : passedEver ? 'Lần này chưa đạt (buổi đã đạt trước đó — vẫn giữ)' : `Chưa đạt (cần ${lesson.assessment.passScore} điểm và đạt mọi bài bắt buộc)`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Info label="Độ chính xác" value={`${Math.round(accuracy * 100)}%`} />
        <Info label="Bài tập đạt" value={`${done.filter((s) => s.passed).length}/${lesson.exercises.length}`} />
        <Info label="Điểm đạt" value={`${lesson.assessment.passScore}`} />
      </dl>

      <div className="grid gap-2">
        {feedback.map((f, i) => (
          <p key={i} className={kids ? 'text-xl' : ''} data-testid="lesson-feedback">
            {f}
          </p>
        ))}
      </div>

      {done.length > 0 && (
        <AiCoachCard
          report={lessonReport(lesson, scores, labelStyle)}
          mode={mode}
          onDone={(t, model) => void recordAiNote(lesson, { at: runAt, score: result.score, text: t, model })}
        />
      )}

      <ul className="grid gap-2">
        {list.map(({ e, s }) => (
          <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-violet-50 px-4 py-2 dark:bg-slate-700/60">
            <span>
              {text(e.title)}
              {(e.weight ?? 1) === 0 && <span className="ml-2 text-xs text-slate-500">(luyện tập)</span>}
            </span>
            <span className={`font-bold tabular-nums ${!s ? 'text-slate-400' : s.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {s ? `${s.score}${s.passed ? ' ✓' : ''}` : 'chưa làm'}
            </span>
          </li>
        ))}
      </ul>

      {topMistakes.length > 0 && (
        <div>
          <h3 className="font-semibold">{kids ? 'Chỗ cần luyện thêm' : 'Lỗi trong lần này'}</h3>
          <ul className="mt-2 grid gap-1 text-sm" data-testid="lesson-mistakes">
            {topMistakes.map(([k, n]) => (
              <li key={k}>
                {formatMistake(k, labelStyle)}
                {n > 1 && <span className="text-slate-500"> × {n}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={onRetry} data-testid="lesson-retry">
          <Icon name="restart" /> Luyện lại
        </Button>
        <Button variant="primary" className="text-lg" onClick={onReview} data-testid="go-review">
          🎯 Tiếp: Luyện tập → Trò chơi
        </Button>
        {onNext && (
          <Button variant="ghost" onClick={onNext} data-testid="lesson-next">
            Bỏ qua, sang bài tiếp
          </Button>
        )}
        <Button variant="ghost" onClick={onBack}>
          Về giáo trình
        </Button>
      </div>
    </section>
  );
}
