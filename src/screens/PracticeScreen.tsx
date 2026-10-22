import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import type { Lesson } from '../core/lessons/types';
import { midiToLabel } from '../core/music/notes';
import { computeAccuracy, PracticeEngine, DEFAULT_PRACTICE_CONFIG, type PracticeState } from '../core/practice/PracticeEngine';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { chooseBaseC, keyboardRange, keyHintsFor, keyToMidi } from '../core/input/keyMapping';
import { ScoreView } from '../components/ScoreView';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { DetectedNote, LevelMeter, MicButton, MicError } from '../components/MicPanel';
import { Button, FullscreenButton, Icon, formatDuration } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { useSettings } from '../store/settingsStore';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useWakeLock } from '../hooks/useAppLifecycle';
import { useSessionRecorder } from '../hooks/useSessionRecorder';

const FEEDBACK_MS = 900;

export function PracticeScreen({ lessonId }: { lessonId: string }) {
  const lesson = lessonManager.get(lessonId);
  const navigate = useApp((s) => s.navigate);
  if (!lesson) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="mb-4 text-lg">Không tìm thấy bài học.</p>
          <Button variant="primary" onClick={() => navigate({ name: 'library' })}>
            Về thư viện
          </Button>
        </div>
      </div>
    );
  }
  return <Practice key={lesson.id} lesson={lesson} />;
}

function Practice({ lesson }: { lesson: Lesson }) {
  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.update);
  const navigate = useApp((s) => s.navigate);
  const openLesson = useApp((s) => s.openLesson);
  const micLive = useMic((s) => s.live);

  const midis = useMemo(() => lesson.notes.map((n) => n.midi), [lesson]);
  const engine = useMemo(() => new PracticeEngine(midis, { ...DEFAULT_PRACTICE_CONFIG }), [midis]);
  const state = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getState(),
  );
  const { restart } = useSessionRecorder(engine, lesson);

  useEffect(() => engine.setConfig({ octaveTolerant: settings.octaveTolerant }), [engine, settings.octaveTolerant]);
  useWakeLock(true);

  // Nối mọi nguồn nốt (micro + bàn phím ảo) vào Wait Mode.
  useEffect(() => {
    microphoneInput.resetRecognizer();
    const handle = (e: { midi: number; time: number }) => void engine.handleNote(e.midi, e.time);
    const offMic = microphoneInput.onNote(handle);
    const offVirtual = virtualInput.onNote(handle);
    return () => {
      offMic();
      offVirtual();
    };
  }, [engine]);

  // Hiện Đúng/Sai trong chốc lát rồi quay về "Đang chờ".
  const [showFeedback, setShowFeedback] = useState(false);
  useEffect(() => {
    if (state.lastEventTime === 0) return;
    setShowFeedback(true);
    const id = window.setTimeout(() => setShowFeedback(false), FEEDBACK_MS);
    return () => window.clearTimeout(id);
  }, [state.lastEventTime]);

  // Demo mode: bàn phím máy tính.
  const [baseC, setBaseC] = useState(() => chooseBaseC(midis));
  const keyHints = useMemo(() => keyHintsFor(baseC), [baseC]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowLeft') return engine.back(performance.now());
      if (e.key === 'ArrowRight') return engine.skip(performance.now());
      if (e.key === 'z' || e.key === 'Z') return setBaseC((b) => Math.max(24, b - 12));
      if (e.key === 'x' || e.key === 'X') return setBaseC((b) => Math.min(96, b + 12));
      const midi = keyToMidi(e.key, baseC);
      if (midi !== null) {
        e.preventDefault();
        virtualInput.press(midi);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, baseC]);

  const range = useMemo(() => {
    const r = keyboardRange(midis);
    return { from: Math.min(r.from, baseC), to: Math.max(r.to, baseC + 23) };
  }, [midis, baseC]);

  const expected = state.status === 'finished' ? null : state.expected[state.index];
  const flash =
    showFeedback && state.lastPlayedMidi !== null && (state.status === 'correct' || state.status === 'wrong')
      ? { midi: state.lastPlayedMidi, kind: state.status }
      : null;
  const done = state.results.filter((r) => r !== 'pending').length;
  const nextLesson = lessonManager.next(lesson.id);

  return (
    <div className="flex h-full flex-col">
      {/* ── Trên: tên bài, tiến độ ── */}
      <header className="flex items-center gap-3 px-4 pt-[calc(max(0.5rem,env(safe-area-inset-top))+var(--fullscreen-top-gap))] pb-2">
        <Button variant="ghost" onClick={() => navigate({ name: 'library' })} aria-label="Về thư viện" className="px-2">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{lesson.title}</h1>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${(done / midis.length) * 100}%` }} />
            </div>
            <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400" data-testid="progress-text">
              {done}/{midis.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-lg font-semibold tabular-nums">
          <span className="text-green-600 dark:text-green-400" title="Số nốt đúng">
            ✓ {state.correct}
          </span>
          <span className="text-red-600 dark:text-red-400" title="Số lần sai">
            ✗ {state.wrong}
          </span>
        </div>
        <Button
          variant="ghost"
          aria-label={settings.showNoteNames ? 'Ẩn tên nốt' : 'Hiện tên nốt'}
          aria-pressed={settings.showNoteNames}
          onClick={() => updateSettings({ showNoteNames: !settings.showNoteNames })}
          className="px-2"
        >
          <Icon name={settings.showNoteNames ? 'eye' : 'eyeOff'} />
        </Button>
        <Button
          variant="ghost"
          aria-label={settings.showKeyboard ? 'Ẩn bàn phím' : 'Hiện bàn phím'}
          aria-pressed={settings.showKeyboard}
          onClick={() => updateSettings({ showKeyboard: !settings.showKeyboard })}
          className="px-2"
        >
          <Icon name="keyboard" />
        </Button>
        <FullscreenButton />
      </header>

      {/* ── Giữa: khuông nhạc ── */}
      <main className="mx-3 min-h-0 flex-1 rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <ScoreView
          lesson={lesson}
          index={state.index}
          results={state.results}
          status={state.status}
          wrongPulse={state.wrong}
          showNames={settings.showNoteNames}
          labelStyle={settings.labelStyle}
        />
      </main>

      {/* ── Dưới: nhận diện, micro, điều khiển ── */}
      <section className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <MicButton />
          <LevelMeter className="w-full" />
        </div>
        <DetectedNote labelStyle={settings.labelStyle} />
        <StatusPanel state={state} expected={expected} showFeedback={showFeedback} labelStyle={settings.labelStyle} />
        <div className="ml-auto flex gap-2">
          <Button onClick={restart} aria-label="Chơi lại từ đầu" title="Chơi lại từ đầu">
            <Icon name="restart" />
          </Button>
          <Button onClick={() => engine.back(performance.now())} aria-label="Nốt trước" title="Nốt trước (←)">
            <Icon name="prev" />
          </Button>
          <Button onClick={() => engine.skip(performance.now())} aria-label="Bỏ qua nốt" title="Bỏ qua (→)" disabled={state.status === 'finished'}>
            <Icon name="next" />
          </Button>
        </div>
        <div className="basis-full empty:hidden">
          <MicError />
        </div>
      </section>

      {settings.showKeyboard && (
        <footer className="h-[20vh] min-h-28 px-3">
          <PianoKeyboard
            from={range.from}
            to={range.to}
            expected={expected}
            detected={micLive?.midi ?? null}
            flash={flash}
            labelStyle={settings.labelStyle}
            keyHints={keyHints}
            onPress={(m) => virtualInput.press(m)}
          />
        </footer>
      )}
      <AppVersion className="shrink-0 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] leading-none" />

      {state.status === 'finished' && (
        <FinishDialog
          state={state}
          onRetry={restart}
          onNext={nextLesson ? () => openLesson(nextLesson.id) : undefined}
          onLibrary={() => navigate({ name: 'library' })}
        />
      )}
    </div>
  );
}

function StatusPanel({
  state,
  expected,
  showFeedback,
  labelStyle,
}: {
  state: PracticeState;
  expected: number | null;
  showFeedback: boolean;
  labelStyle: 'letter' | 'solfege';
}) {
  let tone = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  let title = 'Đang chờ';
  let detail = '';
  if (state.status === 'finished') {
    tone = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200';
    title = 'Hoàn thành!';
  } else if (showFeedback && state.status === 'correct') {
    tone = 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200';
    title = 'Đúng!';
  } else if (showFeedback && state.status === 'wrong') {
    tone = 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200';
    title = 'Sai';
    detail = state.lastPlayedMidi !== null ? `bạn đánh ${midiToLabel(state.lastPlayedMidi, labelStyle)}` : '';
  }
  return (
    <div className="flex items-center gap-3" data-testid="status">
      <div
        key={`${state.status}-${state.lastEventTime}`}
        className={`min-w-36 rounded-xl px-4 py-2 text-center ${tone} ${showFeedback ? (state.status === 'wrong' ? 'animate-shake' : 'animate-pop') : ''}`}
        role="status"
        aria-live="polite"
      >
        <div className="text-xl font-bold" data-testid="status-title">
          {title}
        </div>
        {detail && <div className="text-sm">{detail}</div>}
      </div>
      {expected !== null && (
        <div className="text-center">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Cần đánh</div>
          <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-300" data-testid="expected-note">
            {midiToLabel(expected, labelStyle)}
          </div>
        </div>
      )}
    </div>
  );
}

function FinishDialog({
  state,
  onRetry,
  onNext,
  onLibrary,
}: {
  state: PracticeState;
  onRetry: () => void;
  onNext?: () => void;
  onLibrary: () => void;
}) {
  const accuracy = Math.round(computeAccuracy(state) * 100);
  const elapsed = state.finishedAt !== null && state.startedAt !== null ? state.finishedAt - state.startedAt : 0;
  const stars = accuracy >= 95 ? 3 : accuracy >= 80 ? 2 : 1;
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Kết quả">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
        <div className="text-5xl text-amber-400" aria-label={`${stars} sao`}>
          {'★'.repeat(stars)}
          <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(3 - stars)}</span>
        </div>
        <h2 className="mt-3 text-2xl font-bold">Hoàn thành bài!</h2>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
          <Stat label="Độ chính xác" value={`${accuracy}%`} />
          <Stat label="Thời gian" value={formatDuration(elapsed)} />
          <Stat label="Đúng" value={String(state.correct)} />
          <Stat label="Sai / Bỏ qua" value={`${state.wrong} / ${state.skipped}`} />
        </dl>
        <div className="mt-8 flex flex-col gap-2">
          {onNext && (
            <Button variant="primary" onClick={onNext}>
              Bài tiếp theo
            </Button>
          )}
          <Button onClick={onRetry}>Luyện lại</Button>
          <Button variant="ghost" onClick={onLibrary}>
            Về thư viện
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-700/60">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
