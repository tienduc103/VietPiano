import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import { DURATION_BEATS, isAccompanimentMidi, lessonTempo, measureLength, HAND_LABEL, noteHand, type Finger, type Hand, type Lesson } from '../core/lessons/types';
import { midiToLabel, pitchToLabel } from '../core/music/notes';
import { computeAccuracy, PracticeEngine, DEFAULT_PRACTICE_CONFIG, type PracticeState } from '../core/practice/PracticeEngine';
import { DEFAULT_TEMPO_CONFIG, TempoFollower, type TempoState } from '../core/practice/TempoFollower';
import { TEMPO_PERCENT_MAX, TEMPO_PERCENT_MIN, type PracticeMode } from '../core/settings/DeviceSettings';
import type { NoteInputEvent } from '../core/input/NoteInputProvider';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import { chooseBaseC, keyboardRange, keyHintsFor, keyToMidi } from '../core/input/keyMapping';
import { ScoreView } from '../components/ScoreView';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { DetectedNote, FloatingMicNote, LevelMeter, MicButton, MicError } from '../components/MicPanel';
import { MidiBadge } from '../components/MidiPanel';
import { Button, FullscreenButton, Icon, formatDuration, type IconName } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { useSettings } from '../store/settingsStore';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useWakeLock } from '../hooks/useAppLifecycle';
import { useSessionRecorder } from '../hooks/useSessionRecorder';
import { useUiMode } from '../hooks/useUiMode';
import { AiCoachCard } from '../components/AiCoachCard';
import { practiceReport } from '../core/feedback/coachPrompt';

const FEEDBACK_MS = 900;
/**
 * Độ trễ ước lượng từ lúc gõ phím tới noteOn của micro (nửa khung 2048 mẫu + thời gian ổn định
 * cao độ). Chỉ dùng cho chế độ chạy theo nhịp để báo sớm/muộn sát hơn; chưa đo trên iPad thật.
 */
const MIC_LATENCY_MS = 60;
const TEMPO_STEP_PERCENT = 5;

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
  const { restart: restartWait } = useSessionRecorder(engine, lesson);

  // Chế độ chạy theo nhịp: khuông nhạc tự chạy, chỉ khớp thời điểm gõ phím, không xét cao độ.
  const mode = settings.practiceMode;
  const tempoMode = mode === 'tempo';
  const baseBpm = Math.round((lessonTempo(lesson) * settings.tempoPercent) / 100);
  const follower = useMemo(
    () =>
      new TempoFollower(
        lesson.notes.map((n) => DURATION_BEATS[n.duration]),
        { bpm: lessonTempo(lesson), countInBeats: measureLength(lesson.timeSignature) },
      ),
    [lesson],
  );
  const tempo = useSyncExternalStore(
    (cb) => follower.subscribe(cb),
    () => follower.getState(),
  );
  useEffect(() => follower.setBpm(baseBpm, performance.now()), [follower, baseBpm]);

  // Đồng hồ nhịp chạy theo khung hình khi đang đếm vào / đang chạy.
  const ticking = tempoMode && (tempo.status === 'running' || tempo.status === 'countIn');
  useEffect(() => {
    if (!ticking) return;
    let id = 0;
    const loop = () => {
      follower.tick(performance.now());
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [follower, ticking]);

  // Ẩn ứng dụng (micro bị tắt) hoặc tắt chế độ → tạm dừng để không chạy mất bài.
  useEffect(() => {
    if (!tempoMode) {
      follower.pause(performance.now());
      return;
    }
    const onVisibility = () => document.visibilityState === 'hidden' && follower.pause(performance.now());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [follower, tempoMode]);

  const restart = () => (tempoMode ? follower.restart() : restartWait());
  const toggleTempoRun = () => {
    const now = performance.now();
    if (tempo.status === 'running' || tempo.status === 'countIn') follower.pause(now);
    else if (tempo.status === 'finished') follower.restart();
    else follower.start(now);
  };
  const toggleTempoRunRef = useRef(toggleTempoRun);
  toggleTempoRunRef.current = toggleTempoRun;

  useEffect(
    () => engine.setConfig({ octaveTolerant: settings.octaveTolerant, advanceOnWrong: mode === 'count' }),
    [engine, settings.octaveTolerant, mode],
  );
  useWakeLock(true);

  // Nối mọi nguồn nốt (micro + đàn MIDI + bàn phím ảo) vào Wait Mode hoặc chế độ chạy theo nhịp.
  const tempoModeRef = useRef(tempoMode);
  tempoModeRef.current = tempoMode;
  useEffect(() => {
    microphoneInput.resetRecognizer();
    const handle = (e: NoteInputEvent) => {
      // Đàn MIDI đã nối thì micro cũng nghe chính tiếng đàn đó → bỏ để một phím không thành hai sự kiện.
      if (e.source === 'microphone' && midiInput.hasDevice()) return;
      // Bài có phần đệm: nốt tay trái đánh kèm không bị tính là sai.
      if (isAccompanimentMidi(lesson, e.midi)) return;
      if (tempoModeRef.current) follower.handleOnset(e.source === 'microphone' ? e.time - MIC_LATENCY_MS : e.time);
      else engine.handleNote(e.midi, e.time);
    };
    const offMic = microphoneInput.onNote(handle);
    const offMidi = midiInput.onNote(handle);
    const offVirtual = virtualInput.onNote(handle);
    return () => {
      offMic();
      offMidi();
      offVirtual();
    };
  }, [engine, follower, lesson]);

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
      if (e.key === ' ' && tempoModeRef.current) {
        e.preventDefault();
        return toggleTempoRunRef.current();
      }
      if (e.key === 'ArrowLeft' && !tempoModeRef.current) return engine.back(performance.now());
      if (e.key === 'ArrowRight' && !tempoModeRef.current) return engine.skip(performance.now());
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

  const expected = tempoMode
    ? tempo.status === 'finished'
      ? null
      : midis[tempo.index]
    : state.status === 'finished'
      ? null
      : state.expected[state.index];
  const currentIndex = tempoMode ? tempo.index : state.index;
  const currentNote = expected === null ? undefined : lesson.notes[currentIndex];
  const expectedFinger = currentNote?.finger;
  // Bài hai tay luôn nhắc tay nào; bài một tay chỉ nhắc khi có số ngón.
  const expectedHand = currentNote && (lesson.hand === 'both' || expectedFinger) ? noteHand(lesson, currentNote) : undefined;
  const flash =
    !tempoMode && showFeedback && state.lastPlayedMidi !== null && (state.status === 'correct' || state.status === 'wrong')
      ? { midi: state.lastPlayedMidi, kind: state.status }
      : null;
  const done = (tempoMode ? tempo.results : state.results).filter((r) => r !== 'pending').length;
  const nextLesson = lessonManager.next(lesson.id);

  return (
    <div className="flex h-full flex-col">
      {/* ── Trên: tên bài, tiến độ ── */}
      <header className="flex items-center gap-3 pr-4 pl-16 pt-[calc(1rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-2">
        <Button variant="ghost" onClick={() => navigate({ name: 'library' })} aria-label="Về thư viện" className="px-2">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{lesson.title}</h1>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-violet-100 dark:bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 transition-[width] duration-300" style={{ width: `${(done / midis.length) * 100}%` }} />
            </div>
            <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400" data-testid="progress-text">
              {done}/{midis.length}
            </span>
          </div>
        </div>
        {tempoMode ? (
          <div className="flex items-center gap-4 text-lg font-semibold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400" title="Số nốt đã đánh" data-testid="tempo-hits">
              ♪ {tempo.hits}
            </span>
            <span className="text-slate-500 dark:text-slate-400" title="Số nốt bị lỡ" data-testid="tempo-missed">
              lỡ {tempo.missed}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-lg font-semibold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400" title="Số nốt đúng">
              ✓ {state.correct}
            </span>
            <span className="text-rose-600 dark:text-rose-400" title="Số lần sai">
              ✗ {state.wrong}
            </span>
          </div>
        )}
        <ModePicker value={mode} onChange={(practiceMode) => updateSettings({ practiceMode })} />
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
      <main className="relative mx-3 min-h-0 flex-1 rounded-2xl bg-white shadow-md shadow-violet-200/60 ring-1 ring-violet-100 dark:bg-slate-900 dark:shadow-none dark:ring-violet-900">
        <ScoreView
          lesson={lesson}
          index={currentIndex}
          results={tempoMode ? tempo.results : state.results}
          status={tempoMode ? (tempo.status === 'finished' ? 'finished' : 'waiting') : state.status}
          wrongPulse={tempoMode ? 0 : state.wrong}
          showNames={settings.showNoteNames}
          labelStyle={settings.labelStyle}
        />
        <FloatingMicNote className="absolute top-2 right-2" />
      </main>

      {/* ── Dưới: nhận diện, micro, điều khiển ── */}
      <section className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <MicButton />
          <LevelMeter className="w-full" />
        </div>
        <DetectedNote labelStyle={settings.labelStyle} />
        <MidiBadge />
        {tempoMode ? (
          <TempoPanel
            tempo={tempo}
            bpm={baseBpm}
            percent={settings.tempoPercent}
            onPercent={(tempoPercent) => updateSettings({ tempoPercent })}
            onToggleRun={toggleTempoRun}
          />
        ) : (
          <StatusPanel
            state={state}
            expected={expected}
            expectedPitch={currentNote?.midi === expected ? currentNote?.pitch : undefined}
            finger={expectedFinger}
            hand={expectedHand}
            showFeedback={showFeedback}
            labelStyle={settings.labelStyle}
          />
        )}
        <div className="ml-auto flex gap-2">
          <Button onClick={restart} aria-label="Chơi lại từ đầu" title="Chơi lại từ đầu">
            <Icon name="restart" />
          </Button>
          {!tempoMode && (
            <>
              <Button onClick={() => engine.back(performance.now())} aria-label="Nốt trước" title="Nốt trước (←)">
                <Icon name="prev" />
              </Button>
              <Button onClick={() => engine.skip(performance.now())} aria-label="Bỏ qua nốt" title="Bỏ qua (→)" disabled={state.status === 'finished'}>
                <Icon name="next" />
              </Button>
            </>
          )}
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
            expectedFinger={expectedFinger}
            detected={micLive?.midi ?? null}
            flash={flash}
            labelStyle={settings.labelStyle}
            keyHints={keyHints}
            onPress={(m) => virtualInput.press(m)}
          />
        </footer>
      )}
      <AppVersion className="shrink-0 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] leading-none" />

      {tempoMode && tempo.status === 'finished' && (
        <TempoFinishDialog
          tempo={tempo}
          onRetry={() => follower.restart()}
          onNext={nextLesson ? () => openLesson(nextLesson.id) : undefined}
          onLibrary={() => navigate({ name: 'library' })}
        />
      )}
      {!tempoMode && state.status === 'finished' && (
        <FinishDialog
          title={lesson.title}
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
  expectedPitch,
  finger,
  hand,
  showFeedback,
  labelStyle,
}: {
  state: PracticeState;
  expected: number | null;
  /** Tên nốt như viết trong bài ("Bb4") để hiện đúng dấu giáng. */
  expectedPitch?: string;
  finger?: Finger;
  hand?: Hand;
  showFeedback: boolean;
  labelStyle: 'letter' | 'solfege';
}) {
  let tone = 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
  let title = 'Đang chờ';
  let detail = '';
  if (state.status === 'finished') {
    tone = 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white';
    title = 'Hoàn thành!';
  } else if (showFeedback && state.status === 'correct') {
    tone = 'bg-emerald-500 text-white shadow-md shadow-emerald-500/40';
    title = 'Đúng!';
  } else if (showFeedback && state.status === 'wrong') {
    tone = 'bg-rose-500 text-white shadow-md shadow-rose-500/40';
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
          <div className="text-4xl font-bold text-fuchsia-600 dark:text-fuchsia-300" data-testid="expected-note">
            {expectedPitch ? pitchToLabel(expectedPitch, labelStyle) : midiToLabel(expected, labelStyle)}
          </div>
        </div>
      )}
      {expected !== null && hand && (
        <div className="text-center">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400" data-testid="expected-hand">
            {HAND_LABEL[hand]}
          </div>
          {finger && (
            <div className="text-4xl font-bold text-orange-500 dark:text-orange-300" data-testid="expected-finger" aria-label={`Ngón ${finger}`}>
              ngón {finger}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MODES: { value: PracticeMode; label: string; icon: IconName; hint: string }[] = [
  { value: 'wait', label: 'Chờ nốt', icon: 'hourglass', hint: 'Chờ đánh đúng nốt mới chuyển sang nốt tiếp theo' },
  { value: 'count', label: 'Đếm nốt', icon: 'count', hint: 'Mỗi nốt nghe thấy chuyển một nốt; nốt sai tô đỏ' },
  { value: 'tempo', label: 'Theo nhịp', icon: 'metronome', hint: 'Khuông nhạc tự chạy theo nhịp, khớp lúc bạn gõ phím (không xét đúng/sai nốt)' },
];

function ModePicker({ value, onChange }: { value: PracticeMode; onChange: (m: PracticeMode) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="radiogroup" aria-label="Chế độ luyện tập">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={value === m.value}
          aria-label={m.label}
          title={m.hint}
          data-testid={`mode-${m.value}`}
          onClick={() => onChange(m.value)}
          className={`flex min-h-12 min-w-12 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors ${
            value === m.value ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'
          }`}
        >
          <Icon name={m.icon} className="h-5 w-5" />
          <span className="hidden lg:inline">{m.label}</span>
        </button>
      ))}
    </div>
  );
}

function TempoPanel({
  tempo,
  bpm,
  percent,
  onPercent,
  onToggleRun,
}: {
  tempo: TempoState;
  bpm: number;
  percent: number;
  onPercent: (percent: number) => void;
  onToggleRun: () => void;
}) {
  const running = tempo.status === 'running' || tempo.status === 'countIn';
  const step = (dir: 1 | -1) => onPercent(Math.min(TEMPO_PERCENT_MAX, Math.max(TEMPO_PERCENT_MIN, percent + dir * TEMPO_STEP_PERCENT)));

  let tone = 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
  let title = 'Sẵn sàng';
  let detail = 'Bấm ▶ hoặc đánh nốt đầu';
  if (tempo.status === 'countIn') {
    // Đếm ngược số phách còn lại trước nốt đầu.
    tone = 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200';
    title = String(-tempo.beat);
    detail = 'Chuẩn bị…';
  } else if (tempo.status === 'paused') {
    title = 'Tạm dừng';
    detail = 'Bấm ▶ để chạy tiếp';
  } else if (tempo.status === 'finished') {
    tone = 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white';
    title = 'Hết bài!';
    detail = '';
  } else if (tempo.status === 'running') {
    tone = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200';
    title = 'Đang chạy';
    detail = timingLabel(tempo.lastOffsetMs);
  }

  return (
    <div className="flex items-center gap-3" data-testid="tempo-panel">
      <Button variant="primary" onClick={onToggleRun} aria-label={running ? 'Tạm dừng' : 'Chạy'} title="Chạy / tạm dừng (phím cách)" data-testid="tempo-run">
        <Icon name={running ? 'pause' : 'play'} />
      </Button>
      <div className={`min-w-40 rounded-xl px-4 py-2 text-center ${tone}`} role="status" aria-live="polite">
        <div className="text-xl font-bold tabular-nums" data-testid="tempo-status">
          {title}
        </div>
        {detail && <div className="text-sm">{detail}</div>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => step(-1)} aria-label="Chậm hơn" disabled={percent <= TEMPO_PERCENT_MIN} className="px-3 text-xl">
          −
        </Button>
        <div className="min-w-24 text-center">
          <div className="text-2xl font-bold tabular-nums" data-testid="tempo-bpm">
            ♩={bpm}
          </div>
          <div className="text-xs text-slate-500 tabular-nums dark:text-slate-400" title="Nhịp độ đang theo người chơi">
            {running ? `theo bạn: ${Math.round(tempo.currentBpm)}` : `${percent}%`}
          </div>
        </div>
        <Button variant="ghost" onClick={() => step(1)} aria-label="Nhanh hơn" disabled={percent >= TEMPO_PERCENT_MAX} className="px-3 text-xl">
          +
        </Button>
      </div>
    </div>
  );
}

function timingLabel(offsetMs: number | null): string {
  if (offsetMs === null) return '';
  if (Math.abs(offsetMs) <= DEFAULT_TEMPO_CONFIG.onTimeMs) return 'Đúng nhịp';
  return offsetMs < 0 ? `Sớm ${Math.round(-offsetMs)} ms` : `Muộn ${Math.round(offsetMs)} ms`;
}

function TempoFinishDialog({
  tempo,
  onRetry,
  onNext,
  onLibrary,
}: {
  tempo: TempoState;
  onRetry: () => void;
  onNext?: () => void;
  onLibrary: () => void;
}) {
  const total = tempo.results.length;
  const onTimePct = tempo.hits === 0 ? 0 : Math.round((tempo.onTime / tempo.hits) * 100);
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-violet-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Kết quả chạy theo nhịp">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
        <h2 className="bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-2xl font-extrabold text-transparent dark:from-violet-300 dark:to-fuchsia-300">Hết bài!</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Chạy theo nhịp: chỉ tính lúc gõ phím, không xét đúng/sai nốt.</p>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
          <Stat label="Nốt đã đánh" value={`${tempo.hits}/${total}`} />
          <Stat label="Đúng nhịp" value={`${onTimePct}%`} />
          <Stat label="Bị lỡ" value={String(tempo.missed)} />
          <Stat label="Nhịp độ cuối" value={`♩=${Math.round(tempo.currentBpm)}`} />
        </dl>
        <div className="mt-8 flex flex-col gap-2">
          {onNext && (
            <Button variant="primary" onClick={onNext}>
              Bài tiếp theo
            </Button>
          )}
          <Button onClick={onRetry}>Chạy lại</Button>
          <Button variant="ghost" onClick={onLibrary}>
            Về thư viện
          </Button>
        </div>
      </div>
    </div>
  );
}

function FinishDialog({
  title,
  state,
  onRetry,
  onNext,
  onLibrary,
}: {
  title: string;
  state: PracticeState;
  onRetry: () => void;
  onNext?: () => void;
  onLibrary: () => void;
}) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const uiMode = useUiMode();
  const accuracy = Math.round(computeAccuracy(state) * 100);
  const elapsed = state.finishedAt !== null && state.startedAt !== null ? state.finishedAt - state.startedAt : 0;
  const stars = accuracy >= 95 ? 3 : accuracy >= 80 ? 2 : 1;
  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-violet-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Kết quả">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-slate-800">
        <div className="text-5xl text-amber-400 drop-shadow" aria-label={`${stars} sao`}>
          {'★'.repeat(stars)}
          <span className="text-slate-300 dark:text-slate-600">{'★'.repeat(3 - stars)}</span>
        </div>
        <h2 className="mt-3 bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-2xl font-extrabold text-transparent dark:from-violet-300 dark:to-fuchsia-300">Hoàn thành bài!</h2>
        <dl className="mt-6 grid grid-cols-2 gap-3 text-left">
          <Stat label="Độ chính xác" value={`${accuracy}%`} />
          <Stat label="Thời gian" value={formatDuration(elapsed)} />
          <Stat label="Đúng" value={String(state.correct)} />
          <Stat label="Sai / Bỏ qua" value={`${state.wrong} / ${state.skipped}`} />
        </dl>
        <div className="mt-4 text-left">
          <AiCoachCard report={practiceReport(title, state, labelStyle)} mode={uiMode} />
        </div>
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
    <div className="rounded-xl bg-violet-50 px-4 py-3 ring-1 ring-violet-100 dark:bg-slate-700/60 dark:ring-violet-900">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
