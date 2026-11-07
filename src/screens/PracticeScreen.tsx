import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { lessonManager } from '../core/lessons/LessonManager';
import { accompanimentByNote, hasRightHarmony, isAccompanimentMidi, lessonTempo, measureLength, HAND_LABEL, type Lesson } from '../core/lessons/types';
import { midiToLabel, midiToName, pitchToLabel } from '../core/music/notes';
import { computeAccuracy, isPerfect, PracticeEngine, DEFAULT_PRACTICE_CONFIG, type PracticeState } from '../core/practice/PracticeEngine';
import { DEFAULT_TEMPO_CONFIG, TempoFollower, type TempoState } from '../core/practice/TempoFollower';
import { TEMPO_PERCENT_MAX, TEMPO_PERCENT_MIN, type PracticeMode } from '../core/settings/DeviceSettings';
import type { NoteInputEvent } from '../core/input/NoteInputProvider';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import { micOnlyInput } from '../core/input/sourceFilter';
import { chooseBaseC, keyboardRange, keyHintsFor, keyToMidi } from '../core/input/keyMapping';
import { ScoreView } from '../components/ScoreView';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { HandsGuide } from '../components/HandsGuide';
import { DetectedNote, FloatingMicNote, LevelMeter, MicButton, MicError } from '../components/MicPanel';
import { MidiBadge } from '../components/MidiPanel';
import { Button, FullscreenButton, Icon, formatDuration, type IconName } from '../components/ui';
import { AppVersion } from '../components/AppVersion';
import { useSettings } from '../store/settingsStore';
import { useApp, type Route } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { useWakeLock } from '../hooks/useAppLifecycle';
import { useSessionRecorder } from '../hooks/useSessionRecorder';
import { useUiMode } from '../hooks/useUiMode';
import { AiCoachCard } from '../components/AiCoachCard';
import { Fireworks } from '../components/Fireworks';
import { practiceReport, tempoReport } from '../core/feedback/coachPrompt';
import type { AiNote, AiNoteMode } from '../core/feedback/aiNotes';
import { AiNoteHistory } from '../components/AiNoteHistory';
import { useLibraryAiNotes } from '../hooks/useLibraryAiNotes';
import { useListenSample } from '../hooks/useListenSample';
import { usePlayingNow } from '../store/playingStore';
import { pedalRanges } from '../core/curriculum/piece';
import { PracticePedal, stepPedalRanges, waitPedalPosition } from '../core/practice/PracticePedal';
import {
  distinctStepGuides,
  hasHandChoice,
  isOtherHandMidi,
  isUngradedHarmonyMidi,
  melodyStepExtras,
  practiceTrack,
  PRACTICE_HAND_LABEL,
  resultsOnScore,
  stepGuide,
  type PracticeHand,
  type PracticeTrack,
  type StepGuide,
  type TrackStep,
} from '../core/practice/handPractice';
import { ScoreDisplayMenu } from '../components/practice/ScoreDisplayMenu';
import { ArrangementBar, usePracticePlan } from '../components/practice/ArrangementBar';
import { MeasureRangeMenu } from '../components/practice/MeasureRangeMenu';
import { PerformFinishDialog, PerformPanel, ResultBreakdown } from '../components/practice/PerformPanel';
import { LEVEL_UP_ACCURACY, nextLevel, type PracticePlanStep } from '../core/lessons/arrangements';
import { originalMeasure, sliceLesson } from '../core/lessons/slice';
import { ARRANGEMENT_LEVEL_LABEL } from '../core/lessons/types';
import { stepIndexAtBeat } from '../core/practice/handPractice';
import { planResultsOnScore, type PerformNote } from '../core/practice/performPlan';
import { handAccuracy, measureErrorsFrom, stepMeasures, WaitTally } from '../core/practice/waitBreakdown';
import { performReport, type PracticeExtras } from '../core/feedback/coachPrompt';
import type { PerformanceState } from '../core/practice/PerformanceTracker';
import type { PerformBreakdown } from '../core/practice/performPlan';
import { usePracticePerformance } from '../hooks/usePracticePerformance';
import { usePedalSeen } from '../hooks/usePedalSeen';
import { useProfiles } from '../store/profileStore';
import type { ReactNode } from 'react';

const FEEDBACK_MS = 900;
/**
 * Độ trễ ước lượng từ lúc gõ phím tới noteOn của micro (nửa khung 2048 mẫu + thời gian ổn định
 * cao độ). Chỉ dùng cho chế độ chạy theo nhịp để báo sớm/muộn sát hơn; chưa đo trên iPad thật.
 */
const MIC_LATENCY_MS = 60;
const TEMPO_STEP_PERCENT = 5;

/** Bàn phím ảo: luôn hiện / tự ẩn lúc đang đánh (vẫn giữ chỗ) / ẩn hẳn. */
type KeyboardMode = 'on' | 'auto' | 'off';
const KEYBOARD_MODE_LABEL: Record<KeyboardMode, string> = { on: 'Hiện', auto: 'Tự ẩn', off: 'Ẩn' };
const nextKeyboardMode = (m: KeyboardMode): KeyboardMode => (m === 'on' ? 'auto' : m === 'auto' ? 'off' : 'on');

export function PracticeScreen({ lessonId }: { lessonId: string }) {
  const base = lessonManager.get(lessonId);
  const navigate = useApp((s) => s.navigate);
  // Luyện theo đoạn: route có `measures` → đoạn cắt của bài (đoạn không hợp lệ → cả bài).
  const from = useApp((s) => (s.route.name === 'practice' ? s.route.measures?.[0] : undefined));
  const to = useApp((s) => (s.route.name === 'practice' ? s.route.measures?.[1] : undefined));
  const lesson = useMemo(() => {
    if (!base || from === undefined || to === undefined) return base;
    try {
      return sliceLesson(base, from, to);
    } catch {
      return base;
    }
  }, [base, from, to]);
  if (!lesson || !base) {
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
  return <Practice key={`${lesson.id}:${lesson.slice ? `${lesson.slice.from}-${lesson.slice.to}` : 'all'}`} lesson={lesson} base={base} />;
}

function Practice({ lesson, base }: { lesson: Lesson; base: Lesson }) {
  const settings = useSettings((s) => s.settings);
  const updateSettings = useSettings((s) => s.update);
  const navigate = useApp((s) => s.navigate);
  const openLesson = useApp((s) => s.openLesson);
  // Mở từ Thư viện bài hát → quay về trang đó.
  const fromSongs = useApp((s) => s.route.name === 'practice' && !!s.route.fromSongs);
  const libraryRoute: Route = fromSongs ? { name: 'song-library' } : { name: 'library' };
  const micLive = useMic((s) => s.live);

  // Chế độ chạy theo nhịp: khuông nhạc tự chạy, chỉ khớp thời điểm gõ phím, không xét cao độ.
  const mode = settings.practiceMode;
  const tempoMode = mode === 'tempo';
  // Biểu diễn: đồng hồ nhịp cố định, chơi một mạch, sai không dừng — chấm cao độ + nhịp cả hai tay.
  const performMode = mode === 'perform';

  // Bài có phần đệm: đàn MIDI / bàn phím ảo gửi từng phím → chấm cả hai tay;
  // micro (không có đàn MIDI) chỉ nhận một nốt mỗi lúc → chỉ chấm tay phải (hoặc nốt đơn tay trái khi tập tay trái).
  const midiConnected = useMidi((s) => s.status === 'ready' && s.devices.length > 0);
  const micRunning = useMic((s) => s.status === 'running');
  const micOnly = micOnlyInput('auto', micRunning, midiConnected);
  // Đàn MIDI chưa gửi tín hiệu pedal nào → không biết có pedal → điểm pedal "không đo" (không phạt).
  const pedalSeen = usePedalSeen();
  const pedalMeasured = midiConnected && pedalSeen;

  // Chọn tay (bài khuông đôi có phần đệm): dòng tập = các bước PracticeEngine / TempoFollower chờ.
  const handChoice = hasHandChoice(lesson);
  const wantedHand: PracticeHand = handChoice ? settings.practiceHand : 'both';
  // Chỉ tay trái phụ thuộc micro (bỏ hợp âm) — tay khác giữ nguyên dòng tập khi bật/tắt micro (không mất tiến độ).
  const leftSingleOnly = wantedHand === 'left' && micOnly && !tempoMode;
  const track = useMemo(
    () => practiceTrack(lesson, wantedHand, leftSingleOnly) ?? practiceTrack(lesson, 'right', false)!,
    [lesson, wantedHand, leftSingleOnly],
  );
  const leftUnavailable = wantedHand === 'left' && track.hand !== 'left';
  const hand = track.hand;

  const midis = useMemo(() => track.steps.map((s) => s.midis[0]), [track]);
  const leftHand = useMemo(() => (hand === 'both' ? accompanimentByNote(lesson) : undefined), [lesson, hand]);
  const guideSizes = useMemo(() => distinctStepGuides(lesson, track, leftHand), [lesson, track, leftHand]);
  // Chùm nốt tay phải (quãng 3, quãng 6, hợp âm): đàn MIDI / bàn phím ảo chấm đủ cả chùm; micro chỉ chấm nốt giai điệu.
  const rightChords = hasRightHarmony(lesson);
  const engine = useMemo(() => {
    // Tay trái: nốt thấp nhất của hợp âm là nốt chính, các nốt còn lại chấm như phần "tay trái" của bước.
    // Hai tay / tay phải: nốt hoà âm tay phải (+ tay trái khi tập hai tay) là nốt phụ của bước.
    const extra = hand === 'left' ? track.steps.map((s) => s.midis.slice(1)) : melodyStepExtras(lesson, leftHand, rightChords);
    return new PracticeEngine(midis, { ...DEFAULT_PRACTICE_CONFIG }, extra);
  }, [midis, track, hand, leftHand, lesson, rightChords]);
  const state = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getState(),
  );
  // Số ô in (theo bài gốc) của từng bước — lỗi theo ô cho tổng kết + lịch sử "đoạn hay sai".
  const stepMeasureNumbers = useMemo(() => stepMeasures(lesson, track).map((m) => originalMeasure(lesson, m)), [lesson, track]);
  const { restart: restartWait } = useSessionRecorder(engine, lesson, hand === 'both' ? undefined : hand, {
    mode: mode === 'count' ? 'count' : 'wait',
    stepMeasures: stepMeasureNumbers,
  });
  // Chờ / Đếm nốt: ghi từng lần bấm phím để chấm riêng từng tay (lượt mới khi đổi tay / bài).
  const tally = useMemo(() => new WaitTally(lesson, hand, leftHand?.map((s) => s.midis)), [lesson, hand, leftHand]);

  const baseBpm = Math.round((lessonTempo(lesson) * settings.tempoPercent) / 100);
  const follower = useMemo(
    () =>
      new TempoFollower(
        track.steps.map((s) => s.beats),
        // Tay trái bắt đầu sau dấu lặng → đếm vào thêm cho khớp nhịp.
        { bpm: lessonTempo(lesson), countInBeats: measureLength(lesson.timeSignature) + track.steps[0].startBeat },
      ),
    [lesson, track],
  );
  const tempo = useSyncExternalStore(
    (cb) => follower.subscribe(cb),
    () => follower.getState(),
  );
  useEffect(() => follower.setBpm(baseBpm, performance.now()), [follower, baseBpm]);

  const perf = usePracticePerformance({
    lesson,
    hand,
    singleNotesOnly: micOnly,
    enabled: performMode,
    bpm: baseBpm,
    octaveTolerant: settings.octaveTolerant,
    withPedal: !!lesson.pedal?.length && !lesson.pedalOptional,
    pedalInput: pedalMeasured,
    metronomeDefault: !micRunning || settings.metronomeWithMic,
  });
  /** Bước (nốt giai điệu / nốt đệm khi tập tay trái) đang ở dưới đồng hồ Biểu diễn. */
  const performStep = stepIndexAtBeat(track.steps, Math.max(0, perf.state.beat));

  // Đồng hồ nhịp chạy theo khung hình khi đang đếm vào / đang chạy.
  const ticking = tempoMode && (tempo.status === 'running' || tempo.status === 'countIn');
  // Đang chơi (đã đánh nốt đầu / đồng hồ nhịp chạy) → ẩn nút nổi; hết bài hoặc chơi lại từ đầu → hiện lại.
  const playingNow = tempoMode ? ticking : performMode ? perf.running : state.startedAt !== null && state.status !== 'finished';
  usePlayingNow(playingNow);
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

  // Nghe mẫu: phát từ đầu ô nhịp đang tập; lúc đang phát bỏ mọi nốt vào (không chấm) và con trỏ chạy theo tiếng đàn.
  const listen = useListenSample(lesson, track.steps);
  const listeningRef = useRef(false);
  listeningRef.current = listen.playing;
  const toggleListen = () => {
    if (listen.playing) return listen.stop();
    follower.pause(performance.now());
    perf.tracker.pause(performance.now());
    listen.start(tempoMode ? tempo.index : performMode ? performStep : state.index, baseBpm);
  };
  const stopListen = listen.stop;
  useEffect(() => stopListen(), [mode, stopListen]);

  const restart = () => {
    listen.stop();
    if (tempoMode) follower.restart();
    else if (performMode) perf.restart();
    else {
      tally.reset();
      restartWait();
    }
  };
  const toggleTempoRun = () => {
    const now = performance.now();
    if (tempo.status === 'running' || tempo.status === 'countIn') follower.pause(now);
    else if (tempo.status === 'finished') follower.restart();
    else follower.start(now);
  };
  const toggleTempoRunRef = useRef(toggleTempoRun);
  toggleTempoRunRef.current = toggleTempoRun;

  // Hai tay: chấm cả tay trái khi không chỉ có micro. Tay trái: chấm đủ nốt hợp âm (micro đã bỏ hợp âm khỏi dòng tập).
  const twoHands = hand === 'both' && !!leftHand && !tempoMode && !micOnly;
  const chordGrading = hand === 'left' && !tempoMode && !performMode;
  // Tay phải có chùm nốt: chấm cả nốt hoà âm khi nốt đến từ đàn MIDI / bàn phím ảo.
  const rightChordGrading = hand === 'right' && rightChords && !tempoMode && !micOnly;
  /** Đang chấm nốt phụ của bước (hoà âm tay phải và / hoặc tay trái). */
  const extrasGraded = twoHands || chordGrading || rightChordGrading;
  useEffect(
    () => engine.setConfig({ octaveTolerant: settings.octaveTolerant, advanceOnWrong: mode === 'count', twoHands: extrasGraded }),
    [engine, settings.octaveTolerant, mode, extrasGraded],
  );
  useWakeLock(true);

  // Nối mọi nguồn nốt (micro + đàn MIDI + bàn phím ảo) vào Wait Mode hoặc chế độ chạy theo nhịp.
  const tempoModeRef = useRef(tempoMode);
  tempoModeRef.current = tempoMode;
  const twoHandsRef = useRef(twoHands);
  twoHandsRef.current = twoHands;
  const handRef = useRef(hand);
  handRef.current = hand;
  const extrasGradedRef = useRef(extrasGraded);
  extrasGradedRef.current = extrasGraded;
  const trackRef = useRef(track);
  trackRef.current = track;
  const performModeRef = useRef(performMode);
  performModeRef.current = performMode;
  const perfRef = useRef(perf);
  perfRef.current = perf;
  const tallyRef = useRef(tally);
  tallyRef.current = tally;
  useEffect(() => {
    microphoneInput.resetRecognizer();
    const handle = (e: NoteInputEvent) => {
      // Đàn MIDI đã nối thì micro cũng nghe chính tiếng đàn đó → bỏ để một phím không thành hai sự kiện.
      if (e.source === 'microphone' && midiInput.hasDevice()) return;
      if (listeningRef.current) return;
      // Bài có phần đệm, chỉ chấm tay phải: nốt tay trái đánh kèm không bị tính là sai (tập tay trái: ngược lại).
      if (handRef.current !== 'both') {
        if (isOtherHandMidi(lesson, handRef.current, e.midi)) return;
      } else if (!twoHandsRef.current && isAccompanimentMidi(lesson, e.midi)) return;
      // Không chấm nốt phụ (micro / Theo nhịp): nốt hoà âm của chùm nốt đang tập (hoặc vừa qua) không tính sai.
      if (!extrasGradedRef.current && handRef.current !== 'left') {
        const steps = trackRef.current.steps;
        const at = tempoModeRef.current
          ? follower.getState().index
          : performModeRef.current
            ? stepIndexAtBeat(steps, Math.max(0, perfRef.current.tracker.getState().beat))
            : engine.getState().index;
        if ([at, at - 1].some((k) => steps[k] && isUngradedHarmonyMidi(lesson, steps[k].scoreIndex, e.midi))) return;
      }
      if (performModeRef.current) return perfRef.current.handleNoteOn(e);
      if (tempoModeRef.current) return void follower.handleOnset(e.source === 'microphone' ? e.time - MIC_LATENCY_MS : e.time);
      const before = engine.getState();
      engine.handleNote(e.midi, e.time);
      tallyRef.current.record(before, engine.getState(), e.midi);
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

  // Pedal vang: chỉ đàn MIDI gửi được (Control Change 64); micro / bàn phím ảo → "không đo".
  // Pedal chỉ là gợi ý (bản Cơ bản) → không chấm, không hiện trạng thái.
  const hasPedal = !!lesson.pedal?.length && !lesson.pedalOptional;
  const pedal = useMemo(() => new PracticePedal(), []);
  const pedalState = useSyncExternalStore(
    (cb) => pedal.subscribe(cb),
    () => pedal.getState(),
  );
  // Cùng trục với vị trí ghi sự kiện: Theo nhịp = phách thật, Chờ / Đếm nốt = số bước (`PracticePedal.ts`).
  const pedalTarget = useMemo(() => {
    if (!hasPedal) return null;
    const beats = pedalRanges(lesson);
    if (tempoMode) return { ranges: beats, end: track.steps[track.steps.length - 1].startBeat + track.steps[track.steps.length - 1].beats };
    return { ranges: stepPedalRanges(beats, track.steps.map((s) => s.startBeat)), end: track.steps.length };
  }, [lesson, hasPedal, tempoMode, track]);
  const pedalPosition = useRef<(time: number) => number>(() => 0);
  pedalPosition.current = (time) =>
    tempoMode
      ? follower.positionAt(time) + track.steps[0].startBeat
      : waitPedalPosition(engine.getState().index, track.steps.length, engine.getState().status === 'finished');
  useEffect(() => midiInput.onPedal((e) => pedal.handle(e.down, pedalPosition.current(e.time), !listeningRef.current)), [pedal]);
  // Đổi tay / chế độ, chơi lại → lượt mới; lùi nốt → bỏ các lần đạp phía sau.
  useEffect(() => pedal.reset(pedalPosition.current(performance.now())), [pedal, engine, follower, tempoMode]);
  const waitIndexRef = useRef(state.index);
  useEffect(() => {
    if (!tempoMode && state.status !== 'finished' && state.index < waitIndexRef.current) pedal.rewind(waitPedalPosition(state.index, track.steps.length, false));
    waitIndexRef.current = state.index;
  }, [pedal, tempoMode, state.index, state.status, track]);
  const tempoIdle = tempo.status === 'idle';
  useEffect(() => {
    if (tempoMode && tempoIdle) pedal.reset(-Infinity);
  }, [pedal, tempoMode, tempoIdle]);
  /** Điểm pedal: bài không có pedal → undefined; không có đàn MIDI → null ("không đo"). */
  const pedalScore = !pedalTarget ? undefined : pedalMeasured ? pedal.score(pedalTarget.ranges, pedalTarget.end) : null;

  // Bản phối nhiều cấp độ: lộ trình 5 bước; hết bài đạt yêu cầu → đánh dấu bước ứng với tay + chế độ đang tập.
  const practicePlanState = usePracticePlan(lesson);
  const recordPlan = practicePlanState.record;
  const applyPlanStep = (step: PracticePlanStep) => {
    listen.stop();
    updateSettings({ practiceHand: step.hand, practiceMode: step.mode, tempoPercent: step.tempoPercent ?? 100 });
  };
  const finishedWait = !tempoMode && state.status === 'finished';
  useEffect(() => {
    if (finishedWait && !lesson.slice) recordPlan(hand, mode, computeAccuracy(state));
    // Chỉ ghi lúc vừa hết bài.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedWait]);
  const recordSession = useApp((s) => s.recordSession);
  const perfDone = performMode && perf.finished && !!perf.breakdown;
  useEffect(() => {
    if (!perfDone || !perf.breakdown) return;
    const b = perf.breakdown;
    const playedMs = Math.round(perf.tracker.totalBeats * perf.tracker.beatMs);
    void recordSession({
      lessonId: lesson.id,
      profileId: useProfiles.getState().activeId ?? undefined,
      startedAt: Date.now() - playedMs,
      durationMs: playedMs,
      correct: b.result.correct,
      wrong: b.result.wrong + b.result.missed,
      skipped: 0,
      completed: true,
      notesReached: b.result.notes,
      totalNotes: b.result.notes,
      mode: 'perform',
      score: b.score,
      measureErrors: Object.fromEntries(b.measures.map((m) => [String(originalMeasure(lesson, m.measure)), m.total])),
      ...(hand === 'both' ? {} : { hand }),
      ...(lesson.slice ? { measures: [lesson.slice.from, lesson.slice.to] as [number, number] } : {}),
    });
    if (!lesson.slice) recordPlan(hand, 'perform', b.score / 100);
    // Chỉ ghi lúc vừa hết bài.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfDone]);
  const finishedTempo = tempoMode && tempo.status === 'finished';
  useEffect(() => {
    if (finishedTempo && !lesson.slice) recordPlan(hand, 'tempo', tempo.hits ? (tempo.onTime / tempo.hits) * (tempo.hits / tempo.results.length) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedTempo]);

  // Hiện Đúng/Sai trong chốc lát rồi quay về "Đang chờ".
  const [showFeedback, setShowFeedback] = useState(false);
  const aiNotes = useLibraryAiNotes(lesson.id);
  const [showAiNotes, setShowAiNotes] = useState(false);
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
    const r = keyboardRange([...lesson.notes.map((n) => n.midi), ...(lesson.accompaniment ?? []).flatMap((c) => c.midis)]);
    return { from: Math.min(r.from, baseC), to: Math.max(r.to, baseC + 23) };
  }, [lesson, baseC]);

  const expected = listen.playIndex !== null
    ? midis[listen.playIndex]
    : tempoMode
    ? tempo.status === 'finished'
      ? null
      : midis[tempo.index]
    : performMode
      ? perf.finished
        ? null
        : midis[performStep]
    : state.status === 'finished'
      ? null
      : state.expected[state.index];
  const currentIndex = listen.playIndex ?? (tempoMode ? tempo.index : performMode ? performStep : state.index);
  const currentStep: TrackStep | undefined = expected === null ? undefined : track.steps[currentIndex];
  const currentNote = track.staff === 'melody' && currentStep ? lesson.notes[currentStep.scoreIndex] : undefined;
  const expectedFinger = currentNote?.finger;
  // Bài có phần đệm: tay trái ở nốt hiện tại; phím tô vàng = nốt tay trái cần đánh (đang chấm: chỉ nốt còn thiếu).
  const leftStep = currentNote && leftHand?.[currentIndex];
  // Tay trái: hợp âm → mọi nốt chưa đánh tô vàng (nốt đơn dùng viền "cần đánh" như tay phải).
  const leftChord = hand === 'left' && currentStep && currentStep.midis.length > 1 ? currentStep : undefined;
  const chordGraded = chordGrading && !listen.playing;
  // Chùm nốt tay phải ở bước hiện tại: nốt hoà âm tô cùng màu nốt cần đánh (đang chấm: chỉ nốt còn thiếu).
  const harmony = useMemo(() => (hand !== 'left' && currentNote?.harmony) || [], [hand, currentNote]);
  const harmonyMidiSet = useMemo(() => new Set(harmony.map((h) => h.midi)), [harmony]);
  const extraKeys = useMemo(
    () => new Set(harmony.map((h) => h.midi).filter((m) => !(extrasGraded && !listen.playing && !tempoMode && !performMode) || state.pendingLeft.includes(m))),
    [harmony, extrasGraded, listen.playing, tempoMode, performMode, state.pendingLeft],
  );
  const leftKeys = useMemo(() => {
    if (leftChord) return new Set(chordGraded ? [...(state.melodyDone ? [] : [leftChord.midis[0]]), ...state.pendingLeft] : leftChord.midis);
    return new Set(twoHands && !listen.playing && !performMode ? state.pendingLeft.filter((m) => !harmonyMidiSet.has(m)) : (leftStep?.midis ?? []));
  }, [leftChord, chordGraded, twoHands, listen.playing, performMode, state.pendingLeft, state.melodyDone, leftStep, harmonyMidiSet]);
  const leftChordFingers = useMemo(() => {
    const f: Record<number, number> = {};
    if (!leftChord) {
      // Ngón của nốt hoà âm tay phải.
      for (const h of harmony) if (h.finger) f[h.midi] = h.finger;
      return harmony.length ? f : undefined;
    }
    leftChord.midis.forEach((m, i) => {
      const finger = leftChord.fingers[i];
      if (finger) f[m] = finger;
    });
    return f;
  }, [leftChord, harmony]);
  // Tự ẩn bàn phím lúc đang đánh: chỉ khi nốt đến từ micro / đàn MIDI (chạm bàn phím ảo thì phải thấy phím);
  // nghe mẫu → hiện lại để xem con trỏ theo tiếng đàn.
  // Tự ẩn chỉ làm bàn phím trong suốt, VẪN giữ chỗ: khung khuông nhạc không đổi chiều cao → khuông không co giãn / nhảy.
  const keyboardInput = !micRunning && !midiConnected;
  const keyboardMode: KeyboardMode = !settings.showKeyboard ? 'off' : settings.hideKeyboardWhilePlaying ? 'auto' : 'on';
  const keyboardAutoHidden = keyboardMode === 'auto' && playingNow && !listen.playing && !keyboardInput;
  const keyboardExpected = leftChord || (!performMode && state.melodyDone && !listen.playing) ? null : expected;
  const stepFinger = hand === 'left' ? currentStep?.fingers[0] : expectedFinger;
  const rawResults = tempoMode ? tempo.results : state.results;
  const scoreSize = track.staff === 'melody' ? lesson.notes.length : (lesson.accompaniment?.length ?? 0);
  const scoreResults = useMemo(
    () =>
      performMode
        ? planResultsOnScore(perf.plan, perf.state.results, track.staff, scoreSize)
        : resultsOnScore(track, rawResults, scoreSize, 'pending' as (typeof rawResults)[number]),
    [performMode, perf.plan, perf.state.results, track, rawResults, scoreSize],
  );
  const scoreIndex = (track.steps[currentIndex] ?? track.steps[track.steps.length - 1]).scoreIndex;
  const flash =
    !tempoMode && !performMode && showFeedback && state.lastPlayedMidi !== null && (state.status === 'correct' || state.status === 'wrong')
      ? { midi: state.lastPlayedMidi, kind: state.status }
      : null;
  const done = (performMode ? perf.state.results : tempoMode ? tempo.results : state.results).filter((r) => r !== 'pending').length;
  // Biểu diễn hai tay: tô cả nốt / hợp âm tay trái đúng – sai trên khuông Fa.
  const accSize = lesson.accompaniment?.length ?? 0;
  const performAccResults = useMemo(
    () => (performMode && hand === 'both' && accSize ? planResultsOnScore(perf.plan, perf.state.results, 'accompaniment', accSize) : undefined),
    [performMode, hand, accSize, perf.plan, perf.state.results],
  );
  const progressTotal = performMode ? perf.plan.length : midis.length;
  const nextLesson = lessonManager.next(lesson.id);

  // Tổng kết: điểm từng tay, ô hay sai (số ô theo bài gốc), luyện lại đoạn, gợi ý lên cấp (bản phối nhiều cấp).
  const practiceMeasures = (a: number, b: number) => {
    updateSettings({ practiceMode: 'wait' });
    openLesson(base.id, [a, b]);
  };
  const next = !lesson.slice ? nextLevel(lesson) : undefined;
  const levelUpFor = (result: number) =>
    next && hand === 'both' && result + 1e-9 >= LEVEL_UP_ACCURACY ? { label: ARRANGEMENT_LEVEL_LABEL[next.arrangement!.level], onClick: () => openLesson(next.id) } : null;
  const measureLabel = (m: number) => (base.pickup && m === 0 ? 'ô lấy đà' : `ô ${m}`);
  const waitFinished = !tempoMode && !performMode && state.status === 'finished';
  const waitSummary = useMemo(() => {
    if (!waitFinished) return null;
    const t = tally.handTallies();
    const hands = hand === 'both' ? { right: handAccuracy(t.right), left: twoHands ? handAccuracy(t.left) : null } : hand === 'right' ? { right: handAccuracy(t.right) } : { left: handAccuracy(t.left) };
    const errors = measureErrorsFrom(tally.wrongPerStep(), state.results, stepMeasureNumbers);
    const measures = Object.entries(errors)
      .map(([measure, total]) => ({ measure: Number(measure), total }))
      .sort((x, y) => y.total - x.total || x.measure - y.measure);
    return { hands, measures };
  }, [waitFinished, tally, hand, twoHands, state.results, stepMeasureNumbers]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Trên: tên bài, tiến độ ── */}
      <header className="flex items-center gap-3 pr-4 pl-16 pt-[calc(1rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-2">
        <Button variant="ghost" onClick={() => navigate(libraryRoute)} aria-label="Về thư viện" className="px-2">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className={`truncate text-xl font-bold ${lesson.titleColor ?? ''}`}>{lesson.title}</h1>
          <div className="mt-1 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-violet-100 dark:bg-slate-700">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-orange-400 transition-[width] duration-300" style={{ width: `${(done / progressTotal) * 100}%` }} />
            </div>
            <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400" data-testid="progress-text">
              {done}/{progressTotal}
            </span>
          </div>
        </div>
        {performMode ? (
          <div className="flex items-center gap-4 text-lg font-semibold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400" title="Số nốt đúng" data-testid="perform-correct">
              ✓ {perf.state.results.filter((r) => r === 'correct').length}
            </span>
            <span className="text-rose-600 dark:text-rose-400" title="Số nốt sai hoặc bị lỡ" data-testid="perform-wrong">
              ✗ {perf.state.results.filter((r) => r === 'wrong' || r === 'skipped').length}
            </span>
          </div>
        ) : tempoMode ? (
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
        {aiNotes.notes.length > 0 && (
          <Button variant="ghost" onClick={() => setShowAiNotes(true)} aria-label="Nhận xét AI các lần trước" title="Nhận xét AI các lần trước" className="px-2" data-testid="open-ai-notes">
            🤖 <span className="tabular-nums">{aiNotes.notes.length}</span>
          </Button>
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
        <ScoreDisplayMenu lesson={lesson} />
        {/* Một nút, ba chế độ (Hiện → Tự ẩn → Ẩn), bề rộng cố định: hàng tiêu đề không xê dịch khi đổi. */}
        <Button
          variant="ghost"
          aria-label={`Bàn phím: ${KEYBOARD_MODE_LABEL[keyboardMode]} (bấm để đổi)`}
          title={
            keyboardMode === 'auto'
              ? keyboardInput
                ? 'Bàn phím tự ẩn khi đang đánh — chỉ có tác dụng khi dùng micro hoặc đàn MIDI (bàn phím ảo đang là nguồn nốt)'
                : 'Bàn phím tự ẩn khi đang đánh, hết bài / chơi lại / nghe mẫu thì hiện lại'
              : `Bàn phím: ${KEYBOARD_MODE_LABEL[keyboardMode]} — bấm để chuyển sang "${KEYBOARD_MODE_LABEL[nextKeyboardMode(keyboardMode)]}"`
          }
          onClick={() => {
            const next = nextKeyboardMode(keyboardMode);
            updateSettings({ showKeyboard: next !== 'off', hideKeyboardWhilePlaying: next === 'auto' });
          }}
          className={`w-24 justify-center gap-1.5 px-2 text-sm font-semibold ${keyboardMode === 'off' ? 'opacity-60' : ''}`}
          data-testid="keyboard-mode"
          data-mode={keyboardMode}
        >
          <Icon name="keyboard" />
          <span className="whitespace-nowrap">{KEYBOARD_MODE_LABEL[keyboardMode]}</span>
        </Button>
        <FullscreenButton />
      </header>

      {handChoice && (
        // Hẹp (iPad ngang 1024 px): ô thông báo xuống dòng riêng, dùng trọn bề ngang thay vì bị ép thành cột cao (khuông nhỏ lại).
        <div className="mx-3 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {lesson.arrangement && <ArrangementBar lesson={lesson} plan={practicePlanState.plan} done={practicePlanState.done} onApplyStep={applyPlanStep} />}
          <MeasureRangeMenu lesson={lesson} base={base} />
          <HandPicker value={wantedHand} onChange={(practiceHand) => (listen.stop(), updateSettings({ practiceHand }))} />
          <HandsNotice
            track={track}
            alternating={!lesson.accompaniment?.length}
            leftUnavailable={leftUnavailable}
            twoHands={twoHands}
            midiConnected={midiConnected}
            micOnly={micOnly}
            tempoMode={tempoMode}
            performMode={performMode}
            rightChords={rightChords}
          />
        </div>
      )}

      {/* ── Giữa: khuông nhạc ── */}
      <main className="relative mx-3 min-h-0 flex-1 rounded-2xl bg-white shadow-md shadow-violet-200/60 ring-1 ring-violet-100 dark:bg-slate-900 dark:shadow-none dark:ring-violet-900">
        <ScoreView
          lesson={lesson}
          index={scoreIndex}
          results={scoreResults}
          staff={track.staff}
          // Cửa sổ laptop thấp: thu nhỏ cho vừa cả khuông đôi + tên nốt + pedal thay vì cắt mất.
          minScale={0.5}
          dim={hand === 'right' ? 'left' : hand === 'left' ? 'right' : undefined}
          status={
            listen.playing ? 'waiting' : tempoMode ? (tempo.status === 'finished' ? 'finished' : 'waiting') : performMode ? (perf.finished ? 'finished' : 'waiting') : state.status
          }
          wrongPulse={tempoMode || performMode ? 0 : state.wrong}
          accResults={performMode && hand === 'both' ? performAccResults : undefined}
          showNames={settings.showNoteNames}
          labelStyle={settings.labelStyle}
          showFingers={settings.showFingers}
          showChords={settings.showChordSymbols}
          showPedal={settings.showPedalMarks}
          zoom={settings.scoreZoom}
          colorHands={settings.colorHands}
        />
        <FloatingMicNote className="absolute top-2 right-2" />
      </main>

      {/* ── Dưới: nhận diện, micro, điều khiển ── */}
      <section className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <MicButton />
          <LevelMeter className="w-full" />
        </div>
        <DetectedNote labelStyle={settings.labelStyle} />
        <MidiBadge />
        {hasPedal &&
          (midiConnected ? (
            <span
              className={`min-w-23 rounded-full px-3 py-1 text-center text-sm font-semibold whitespace-nowrap ${pedalState.down ? 'bg-fuchsia-500 text-white' : 'bg-violet-100 text-violet-700 dark:bg-slate-700 dark:text-slate-300'}`}
              title='Đạp và nhả theo ký hiệu "Ped." dưới khuông; đạp ngay sau khi đánh nốt đầu ô là đúng kỹ thuật'
              data-testid="pedal-state"
            >
              Pedal: {pedalState.down ? 'đạp' : 'nhả'}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" title="Chỉ đàn MIDI gửi được pedal" data-testid="pedal-unmeasured">
              Pedal: không đo
            </span>
          ))}
        {performMode ? (
          <PerformPanel
            state={perf.state}
            bpm={baseBpm}
            percent={settings.tempoPercent}
            onPercent={(tempoPercent) => updateSettings({ tempoPercent })}
            onToggle={perf.toggle}
            metronome={perf.metronome}
            onMetronome={perf.setMetronome}
          />
        ) : tempoMode ? (
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
            guide={expected === null ? undefined : stepGuide(lesson, track, leftHand, currentIndex)}
            guideSizes={guideSizes}
            chordGraded={chordGraded}
            twoHands={twoHands && !listen.playing}
            showFeedback={showFeedback && !listen.playing}
            listening={listen.playing}
            labelStyle={settings.labelStyle}
          />
        )}
        <div className="ml-auto flex gap-2">
          {listen.supported && (
            <Button onClick={toggleListen} aria-pressed={listen.playing} title="Nghe mẫu từ đầu ô nhịp đang tập (cả hai tay, có pedal)" className="min-w-35" data-testid="listen-sample">
              <Icon name={listen.playing ? 'pause' : 'play'} />
              {listen.playing ? 'Dừng' : 'Nghe mẫu'}
            </Button>
          )}
          <Button onClick={restart} aria-label="Chơi lại từ đầu" title="Chơi lại từ đầu">
            <Icon name="restart" />
          </Button>
          {!tempoMode && !performMode && (
            <>
              <Button onClick={() => (listen.stop(), engine.back(performance.now()))} aria-label="Nốt trước" title="Nốt trước (←)">
                <Icon name="prev" />
              </Button>
              <Button onClick={() => (listen.stop(), engine.skip(performance.now()))} aria-label="Bỏ qua nốt" title="Bỏ qua (→)" disabled={state.status === 'finished'}>
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
        <footer
          className={`h-[20vh] min-h-28 px-3 transition-[opacity,visibility] duration-300 ${keyboardAutoHidden ? 'pointer-events-none invisible opacity-0' : 'opacity-100'}`}
          aria-hidden={keyboardAutoHidden || undefined}
          data-testid="practice-keyboard"
          data-auto-hidden={keyboardAutoHidden || undefined}
        >
          <PianoKeyboard
            from={range.from}
            to={range.to}
            expected={keyboardExpected}
            expectedFinger={stepFinger}
            expectedExtra={extraKeys}
            highlighted={tempoMode && !leftChord ? undefined : leftKeys}
            fingers={leftChordFingers}
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
          title={handTitle(lesson, hand)}
          midis={midis}
          bpm={baseBpm}
          onAiNote={aiNotes.add}
          tempo={tempo}
          pedalScore={pedalScore}
          onRetry={() => follower.restart()}
          onNext={nextLesson ? () => openLesson(nextLesson.id) : undefined}
          onLibrary={() => navigate(libraryRoute)}
        />
      )}
      {waitFinished && waitSummary && (
        <FinishDialog
          title={handTitle(lesson, hand)}
          mode={mode === 'count' ? 'count' : 'wait'}
          onAiNote={aiNotes.add}
          state={state}
          pedalScore={pedalScore}
          pedalReason={midiConnected ? 'chưa nhận tín hiệu pedal từ đàn' : 'cần đàn MIDI'}
          extra={{ hands: waitSummary.hands, weakMeasures: waitSummary.measures.slice(0, 3) }}
          breakdown={
            lesson.clef === 'grand' ? (
              <ResultBreakdown
                hands={waitSummary.hands}
                rhythm={null}
                measures={waitSummary.measures}
                measureLabel={measureLabel}
                onPracticeMeasures={lesson.slice ? undefined : practiceMeasures}
                levelUp={levelUpFor(computeAccuracy(state))}
              />
            ) : undefined
          }
          onRetry={restart}
          onNext={nextLesson ? () => openLesson(nextLesson.id) : undefined}
          onLibrary={() => navigate(libraryRoute)}
        />
      )}
      {performMode && perf.finished && perf.breakdown && (
        <PerformFinishDialog
          title={handTitle(lesson, hand)}
          breakdown={perf.breakdown}
          onRetry={perf.restart}
          onLibrary={() => navigate(libraryRoute)}
          extra={
            <ResultBreakdown
              hands={{
                ...(hand !== 'left' ? { right: perf.breakdown.hands.right?.pitchAccuracy ?? null } : {}),
                ...(hand !== 'right' ? { left: perf.breakdown.hands.left?.pitchAccuracy ?? null } : {}),
              }}
              sync={perf.breakdown.sync}
              measures={perf.breakdown.measures.map((m) => ({ ...m, measure: originalMeasure(lesson, m.measure) }))}
              measureLabel={measureLabel}
              onPracticeMeasures={lesson.slice ? undefined : practiceMeasures}
              levelUp={levelUpFor(perf.breakdown.score / 100)}
            />
          }
        >
          <PerformAiNote title={handTitle(lesson, hand)} plan={perf.plan} state={perf.state} breakdown={perf.breakdown} bpm={baseBpm} micOnly={micOnly} onAiNote={aiNotes.add} />
        </PerformFinishDialog>
      )}
      {showAiNotes && (
        <div className="fixed inset-0 z-20 grid place-items-center bg-violet-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Nhận xét AI các lần trước" onClick={() => setShowAiNotes(false)}>
          <div className="grid w-full max-w-lg gap-3" onClick={(e) => e.stopPropagation()}>
            <AiNoteHistory notes={aiNotes.notes} className="bg-white shadow-2xl dark:bg-slate-800" />
            <Button onClick={() => setShowAiNotes(false)}>Đóng</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPanel({
  state,
  guide,
  guideSizes,
  twoHands,
  chordGraded,
  showFeedback,
  listening,
  labelStyle,
}: {
  state: PracticeState;
  /** Khối "Cần đánh" của bước hiện tại (hết bài → không có). */
  guide?: StepGuide;
  /** Mọi khối của bài: vẽ vô hình để chừa chỗ bằng khối rộng nhất (hàng điều khiển không đổi bề rộng theo từng nốt). */
  guideSizes: readonly StepGuide[];
  /** Đang chấm cả hai tay: đánh dấu nốt đã đánh / còn thiếu. */
  twoHands?: boolean;
  /** Tập tay trái, bước là hợp âm: `chordGraded` → gạch nốt đã đánh. */
  chordGraded?: boolean;
  showFeedback: boolean;
  /** Đang nghe mẫu: con trỏ chạy theo tiếng đàn, chưa chấm. */
  listening?: boolean;
  labelStyle: 'letter' | 'solfege';
}) {
  let tone = 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200';
  let title = listening ? 'Đang nghe mẫu' : 'Đang chờ';
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
        className={`flex min-h-16 w-36 flex-col justify-center rounded-xl px-4 py-2 text-center leading-tight ${tone} ${showFeedback ? (state.status === 'wrong' ? 'animate-shake' : 'animate-pop') : ''}`}
        role="status"
        aria-live="polite"
      >
        <div className="text-xl font-bold" data-testid="status-title">
          {title}
        </div>
        {detail && <div className="text-sm">{detail}</div>}
      </div>
      <div className="grid items-center justify-items-center [&>*]:[grid-area:1/1]">
        {guideSizes.map((g, i) => (
          <div key={i} className="invisible" aria-hidden>
            <ExpectedGuide guide={g} state={EMPTY_GUIDE_STATE} labelStyle={labelStyle} sizer />
          </div>
        ))}
        {guide && <ExpectedGuide guide={guide} state={state} twoHands={twoHands} chordGraded={chordGraded} labelStyle={labelStyle} />}
      </div>
    </div>
  );
}

const EMPTY_GUIDE_STATE = { pendingLeft: [], melodyDone: false } satisfies Pick<PracticeState, 'pendingLeft' | 'melodyDone'>;

/** Khối "Cần đánh" của một bước. `sizer` = bản vô hình chừa chỗ: không gắn `data-testid` (trùng với bản thật). */
function ExpectedGuide({
  guide,
  state,
  twoHands,
  chordGraded,
  labelStyle,
  sizer = false,
}: {
  guide: StepGuide;
  state: Pick<PracticeState, 'pendingLeft' | 'melodyDone'>;
  twoHands?: boolean;
  chordGraded?: boolean;
  labelStyle: 'letter' | 'solfege';
  sizer?: boolean;
}) {
  const { midi, pitch, finger, hand, left, chord } = guide;
  const testId = (id: string) => (sizer ? undefined : id);
  if (left) {
    return (
      <HandsGuide
        rightPitch={pitch ?? midiToName(midi)}
        rightFinger={finger}
        rightHarmony={guide.harmony}
        left={left}
        pendingLeft={state.pendingLeft}
        melodyDone={state.melodyDone}
        grading={!!twoHands}
        labelStyle={labelStyle}
        sizer={sizer}
      />
    );
  }
  if (chord) {
    return (
      <div className="text-center">
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Cần đánh · tay trái</div>
        <div className="flex gap-1.5 text-3xl font-bold" data-testid={testId('expected-note')}>
          {chord.pitches.map((p, i) => {
            const pressed = chordGraded && (i === 0 ? state.melodyDone : !state.pendingLeft.includes(chord.midis[i]));
            return (
              <span key={i} className={pressed ? 'text-emerald-600 line-through decoration-2 dark:text-emerald-400' : 'text-fuchsia-600 dark:text-fuchsia-300'}>
                {pitchToLabel(p, labelStyle)}
              </span>
            );
          })}
        </div>
        {chord.fingers.every(Boolean) && (
          <div className="text-lg font-bold text-orange-500 dark:text-orange-300" data-testid={testId('expected-finger')}>
            ngón {chord.fingers.join('·')}
          </div>
        )}
      </div>
    );
  }
  // Chùm nốt tay phải (tập riêng tay phải): mọi nốt của chùm, nốt đã đánh gạch đi khi đang chấm đủ chùm.
  const harmony = guide.harmony ?? [];
  const chordFingers = [...harmony.map((h) => h.finger), finger];
  return (
    <div className="flex items-center gap-3">
      <div className="text-center">
        <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Cần đánh</div>
        {harmony.length === 0 ? (
          <div className="text-4xl font-bold text-fuchsia-600 dark:text-fuchsia-300" data-testid={testId('expected-note')}>
            {pitch ? pitchToLabel(pitch, labelStyle) : midiToLabel(midi, labelStyle)}
          </div>
        ) : (
          <div className="flex gap-1.5 text-3xl font-bold" data-testid={testId('expected-note')}>
            {[...harmony.map((h) => ({ p: h.pitch, done: !!twoHands && !state.pendingLeft.includes(h.midi) })), { p: pitch ?? midiToName(midi), done: !!twoHands && state.melodyDone }].map(
              (x, i) => (
                <span key={i} className={x.done ? 'text-emerald-600 line-through decoration-2 dark:text-emerald-400' : 'text-fuchsia-600 dark:text-fuchsia-300'}>
                  {pitchToLabel(x.p, labelStyle)}
                </span>
              ),
            )}
          </div>
        )}
      </div>
      {hand && (
        <div className="text-center">
          <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400" data-testid={testId('expected-hand')}>
            {HAND_LABEL[hand]}
          </div>
          {harmony.length === 0
            ? finger && (
                <div className="text-4xl font-bold text-orange-500 dark:text-orange-300" data-testid={testId('expected-finger')} aria-label={`Ngón ${finger}`}>
                  ngón {finger}
                </div>
              )
            : chordFingers.every(Boolean) && (
                <div className="text-3xl font-bold text-orange-500 dark:text-orange-300" data-testid={testId('expected-finger')}>
                  ngón {chordFingers.join('·')}
                </div>
              )}
        </div>
      )}
    </div>
  );
}

/** Tên bài kèm tay đang tập (hộp thoại kết quả, nhận xét AI). */
function handTitle(lesson: Lesson, hand: PracticeHand): string {
  return hand === 'both' ? lesson.title : `${lesson.title} — ${PRACTICE_HAND_LABEL[hand].toLowerCase()}`;
}

/** Báo cho người chơi bài có phần đệm đang tập tay nào và app chấm những gì. */
function HandsNotice({
  track,
  alternating,
  leftUnavailable,
  twoHands,
  midiConnected,
  micOnly,
  tempoMode,
  performMode,
  rightChords,
}: {
  track: PracticeTrack;
  /** Bài hai tay thay phiên: mỗi lúc một nốt nên micro cũng chấm được cả hai tay. */
  alternating: boolean;
  leftUnavailable: boolean;
  twoHands: boolean;
  midiConnected: boolean;
  micOnly: boolean;
  tempoMode: boolean;
  performMode: boolean;
  /** Tay phải có chùm nốt (quãng, hợp âm). */
  rightChords: boolean;
}) {
  const device = midiConnected ? '🎹 Đàn MIDI' : '⌨️ Bàn phím ảo';
  let ok = true;
  let text: string;
  if (performMode && !alternating && track.hand !== 'left') {
    ok = !micOnly;
    text = micOnly
      ? '🎤 Biểu diễn bằng micro: chỉ chấm giai điệu (nốt cao nhất tay phải) theo nhịp; tay trái và nốt hoà âm cứ đánh, không tính. Nối đàn MIDI hoặc dùng bàn phím ảo để chấm cả hai tay.'
      : `${device}: Biểu diễn theo đồng hồ nhịp cố định — chấm ${track.hand === 'both' ? 'cả hai tay' : 'tay phải'}${rightChords ? ' (đủ chùm nốt)' : ''}, thời điểm, thả phím; sai không dừng.`;
  } else if (alternating && track.hand === 'both') {
    text = tempoMode
      ? '🥁 Hai tay thay phiên theo nhịp: khuông tự chạy theo từng nốt của cả hai tay, chỉ chấm thời điểm gõ.'
      : '✋ Hai tay thay phiên: mỗi lúc một nốt nên app chấm lần lượt cả hai tay, kể cả qua micro.';
  } else if (leftUnavailable) {
    ok = false;
    text =
      '🎤 Tay trái bài này toàn hợp âm mà micro chỉ nhận một nốt mỗi lúc, nên chưa tập riêng tay trái được — đang tập tay phải. Nối đàn MIDI hoặc tắt micro và dùng bàn phím ảo để tập tay trái.';
  } else if (track.hand === 'left') {
    if (tempoMode) text = '🥁 Tập tay trái theo nhịp: khuông tự chạy theo các nốt / hợp âm tay trái, chỉ chấm thời điểm gõ.';
    else if (micOnly) {
      ok = track.skippedChords === 0;
      text =
        track.skippedChords > 0
          ? `🎤 Tập tay trái bằng micro: chỉ chấm nốt đơn, bỏ qua ${track.skippedChords} hợp âm vì micro chỉ nhận một nốt mỗi lúc (vẫn đánh theo khuông). Nối đàn MIDI hoặc dùng bàn phím ảo để chấm cả hợp âm.`
          : '🎤 Tập tay trái bằng micro: chấm từng nốt tay trái; nốt tay phải đánh kèm không bị tính sai.';
    } else if (track.steps.some((s) => s.midis.length > 1)) text = `${device}: tập tay trái — hợp âm phải đánh đủ các nốt (thứ tự nào cũng được) mới sang bước tiếp.`;
    else text = `${device}: tập tay trái — chấm từng nốt tay trái; nốt tay phải đánh kèm không bị tính sai.`;
  } else if (track.hand === 'right') {
    text =
      rightChords && micOnly
        ? '✋ Tập tay phải bằng micro: chỉ chấm nốt giai điệu (nốt cao nhất của chùm nốt), nốt hoà âm và tay trái đánh kèm không tính sai.'
        : '✋ Tập tay phải: chỉ chấm nốt tay phải' + (rightChords ? ' (đủ cả chùm nốt)' : '') + ', tay trái làm mờ; nốt tay trái đánh kèm không bị tính sai.';
  } else if (twoHands) {
    text = `${device}: chấm cả hai tay. Đánh đúng nốt tay phải${rightChords ? ' (đủ chùm nốt)' : ''} và đủ nốt tay trái (phím tô vàng, thứ tự nào cũng được) thì mới sang nốt tiếp; nốt tay trái sai cũng tính lỗi.`;
  } else if (tempoMode) {
    ok = false;
    text = '🥁 Chế độ Theo nhịp chỉ chấm thời điểm giai điệu tay phải. Chọn Chờ nốt hoặc Đếm nốt để chấm cả hai tay (đàn MIDI hoặc bàn phím ảo).';
  } else {
    ok = false;
    text =
      '🎤 Micro chỉ nhận một nốt mỗi lúc nên app chỉ chấm giai điệu tay phải; tay trái cứ đánh theo hướng dẫn, không bị tính sai. Muốn chấm cả hai tay: nối đàn MIDI (Chrome/Edge trên máy tính, bật ở Cài đặt) hoặc tắt micro và dùng bàn phím ảo.';
  }
  return (
    <p
      className={`min-w-72 flex-1 rounded-xl px-4 py-2 text-sm ${ok ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}
      data-testid="hands-notice"
      role="note"
    >
      {text}
    </p>
  );
}

const HANDS: PracticeHand[] = ['both', 'right', 'left'];

/** Chọn tay tập: hai tay / chỉ tay phải / chỉ tay trái. */
function HandPicker({ value, onChange }: { value: PracticeHand; onChange: (h: PracticeHand) => void }) {
  return (
    <div className="inline-flex shrink-0 rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="radiogroup" aria-label="Tay tập">
      {HANDS.map((h) => (
        <button
          key={h}
          type="button"
          role="radio"
          aria-checked={value === h}
          data-testid={`hand-${h}`}
          onClick={() => onChange(h)}
          className={`min-h-12 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
            value === h ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'
          }`}
        >
          {PRACTICE_HAND_LABEL[h]}
        </button>
      ))}
    </div>
  );
}

const MODES: { value: PracticeMode; label: string; icon: IconName; hint: string }[] = [
  { value: 'wait', label: 'Chờ nốt', icon: 'hourglass', hint: 'Chờ đánh đúng nốt mới chuyển sang nốt tiếp theo' },
  { value: 'count', label: 'Đếm nốt', icon: 'count', hint: 'Mỗi nốt nghe thấy chuyển một nốt; nốt sai tô đỏ' },
  { value: 'tempo', label: 'Theo nhịp', icon: 'metronome', hint: 'Khuông nhạc tự chạy theo nhịp, khớp lúc bạn gõ phím (không xét đúng/sai nốt)' },
  { value: 'perform', label: 'Biểu diễn', icon: 'star', hint: 'Chơi một mạch theo nhịp cố định, sai không dừng; chấm nốt, nhịp, từng tay rồi tổng kết' },
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
          {/* 4 chế độ: nhãn chữ chỉ hiện ở màn rộng (≥ 1280 px) để tên bài không bị ép ở iPad ngang 1024 px. */}
          <span className="hidden xl:inline">{m.label}</span>
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
      <div className={`w-52 rounded-xl px-4 py-2 text-center ${tone}`} role="status" aria-live="polite">
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

/** Lưu nhận xét AI của lần chơi này: mốc `at` cố định theo lần mở hộp thoại → "Viết lại" ghi đè. */
function useAiNoteSaver(score: number, mode: AiNoteMode, onAiNote: (note: AiNote) => void) {
  const [at] = useState(() => Date.now());
  return (text: string, model: string) => onAiNote({ at, score, text, model, mode });
}

function TempoFinishDialog({
  title,
  midis,
  bpm,
  onAiNote,
  tempo,
  pedalScore,
  onRetry,
  onNext,
  onLibrary,
}: {
  title: string;
  midis: readonly number[];
  bpm: number;
  onAiNote: (note: AiNote) => void;
  tempo: TempoState;
  pedalScore?: number | null;
  onRetry: () => void;
  onNext?: () => void;
  onLibrary: () => void;
}) {
  const total = tempo.results.length;
  const onTimePct = tempo.hits === 0 ? 0 : Math.round((tempo.onTime / tempo.hits) * 100);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const uiMode = useUiMode();
  const report = tempoReport(title, tempo, midis, labelStyle, bpm, pedalScore);
  const saveNote = useAiNoteSaver(report.score, 'tempo', onAiNote);
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
          <PedalStat score={pedalScore} />
        </dl>
        <div className="mt-4 text-left">
          <AiCoachCard report={report} mode={uiMode} onDone={saveNote} />
        </div>
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
  mode,
  onAiNote,
  state,
  pedalScore,
  pedalReason,
  extra,
  breakdown,
  onRetry,
  onNext,
  onLibrary,
}: {
  title: string;
  mode: AiNoteMode;
  onAiNote: (note: AiNote) => void;
  state: PracticeState;
  pedalScore?: number | null;
  pedalReason?: string;
  /** Điểm từng tay, ô hay sai — đưa vào báo cáo cho AI. */
  extra?: PracticeExtras;
  /** Khối tổng kết từng tay / ô nhịp / lên cấp (bài khuông đôi). */
  breakdown?: ReactNode;
  onRetry: () => void;
  onNext?: () => void;
  onLibrary: () => void;
}) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const uiMode = useUiMode();
  const accuracy = Math.round(computeAccuracy(state) * 100);
  const elapsed = state.finishedAt !== null && state.startedAt !== null ? state.finishedAt - state.startedAt : 0;
  const stars = accuracy >= 95 ? 3 : accuracy >= 80 ? 2 : 1;
  const report = practiceReport(title, state, labelStyle, pedalScore, extra);
  const saveNote = useAiNoteSaver(report.score, mode, onAiNote);
  return (
    <div className="fixed inset-0 z-20 grid place-items-center overflow-y-auto bg-violet-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal aria-label="Kết quả">
      {isPerfect(state) && <Fireworks />}
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
          <PedalStat score={pedalScore} reason={pedalReason} />
        </dl>
        {breakdown}
        <div className="mt-4 text-left">
          <AiCoachCard report={report} mode={uiMode} onDone={saveNote} />
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

/** Nhận xét AI cục bộ của lượt Biểu diễn (số liệu đã chấm → AI chỉ diễn giải). */
function PerformAiNote({
  title,
  plan,
  state,
  breakdown,
  bpm,
  micOnly,
  onAiNote,
}: {
  title: string;
  plan: readonly PerformNote[];
  state: PerformanceState;
  breakdown: PerformBreakdown;
  bpm: number;
  micOnly: boolean;
  onAiNote: (note: AiNote) => void;
}) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const uiMode = useUiMode();
  const report = performReport(title, plan, state, breakdown, labelStyle, bpm, micOnly ? ['Nguồn vào là micro: chỉ chấm giai điệu (một nốt mỗi lúc), không chấm tay trái và nốt hoà âm.'] : []);
  const saveNote = useAiNoteSaver(report.score, 'perform', onAiNote);
  return <AiCoachCard report={report} mode={uiMode} onDone={saveNote} />;
}

/** Điểm pedal ở hộp thoại kết quả; bài không có pedal → không hiện. Không tính vào độ chính xác nốt. */
function PedalStat({ score, reason = 'cần đàn MIDI' }: { score?: number | null; reason?: string }) {
  if (score === undefined) return null;
  return (
    <div className="col-span-2" data-testid="pedal-score">
      <Stat label="Pedal (đạp – nhả đúng ký hiệu)" value={score === null ? `Không đo — ${reason}` : `${Math.round(score * 100)}%`} />
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
