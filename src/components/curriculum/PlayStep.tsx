import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { lessonTimeline, pedalRanges, pieceToLesson, timedNotes, type TimelineNote } from '../../core/curriculum/piece';
import { EXTRA_KEY, missedNoteKey, scorePerformance, scoreRhythm, scoreWait, wrongNoteKey, type ExerciseScore } from '../../core/curriculum/scoring';
import { text, type PlayExercise, type UiMode } from '../../core/curriculum/types';
import { soundOutput } from '../../core/audio/SoundOutput';
import { keyboardRange } from '../../core/input/keyMapping';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { midiInput } from '../../core/input/MIDIInputProvider';
import { accompanimentByNote, isAccompanimentMidi, measureLength, type Hand, type Lesson } from '../../core/lessons/types';
import { micOnlyInput } from '../../core/input/sourceFilter';
import { loudnessDb } from '../../core/music/dynamics';
import { midiToLabel, midiToName, pitchToLabel } from '../../core/music/notes';
import { DEFAULT_PRACTICE_CONFIG, PracticeEngine, type NoteResult } from '../../core/practice/PracticeEngine';
import { DEFAULT_PERFORMANCE_CONFIG, PerformanceTracker } from '../../core/practice/PerformanceTracker';
import { TEMPO_PERCENT_MAX, TEMPO_PERCENT_MIN } from '../../core/settings/DeviceSettings';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useMidi } from '../../store/midiStore';
import { useSettings } from '../../store/settingsStore';
import { useVoiceActive, useVoiceScope, useWaitCoachOptions } from '../../hooks/useVoiceTeacher';
import { voiceTeacher } from '../../core/voice/teacher';
import { WaitVoiceCoach, type HelpLevel } from '../../core/voice/WaitVoiceCoach';
import { PianoKeyboard } from '../PianoKeyboard';
import { HandsGuide } from '../HandsGuide';
import { ScoreView } from '../ScoreView';
import { Button, Icon, Segmented, Toggle } from '../ui';
import { Feedback, ListenButton, StepTitle } from './common';

/** Độ trễ ước lượng micro (như màn Luyện tập; chưa đo trên iPad thật). */
const MIC_LATENCY_MS = 60;
const LOOP_DELAY_MS = 1200;

type Kind = 'wait' | 'performance' | 'rhythm';

interface PlayStepProps {
  exercise: PlayExercise;
  mode: UiMode;
  /** % nhịp độ theo nhóm tuổi (bé tập chậm hơn). */
  tempoPercent: number;
  onDone: (score: ExerciseScore) => void;
}

const KIND_LABEL: Record<Kind, string> = { wait: 'Chờ nốt (không tính giờ)', performance: 'Theo nhịp (chấm nốt + nhịp)', rhythm: 'Tiết tấu (chỉ chấm nhịp)' };

/**
 * Một bài chơi theo khuông nhạc. Hai chế độ:
 *  - Làm bài: đúng chế độ của bài tập (Wait / Biểu diễn / Tiết tấu), nhịp độ cố định, chấm điểm và lưu.
 *  - Luyện tập: không chấm, tự chọn chờ nốt hay theo nhịp, chỉnh BPM, luyện từng tay, lặp lại.
 */
export function PlayStep({ exercise, mode, tempoPercent, onDone }: PlayStepProps) {
  const lesson = useMemo(() => pieceToLesson(exercise.piece, exercise.id), [exercise]);
  const timeline = useMemo(() => lessonTimeline(lesson), [lesson]);
  const baseBpm = Math.round((exercise.piece.bpm * tempoPercent) / 100);

  const [practice, setPractice] = useState(false);
  const [practiceKind, setPracticeKind] = useState<'wait' | 'timed'>('wait');
  const [hand, setHand] = useState<Hand | 'both'>('both');
  const [loop, setLoop] = useState(false);
  const [percent, setPercent] = useState(100);
  const [run, setRun] = useState(0);

  const kind: Kind = !practice ? exercise.mode : practiceKind === 'wait' ? 'wait' : exercise.mode === 'wait' ? 'performance' : exercise.mode;
  const bpm = practice ? Math.round((baseBpm * percent) / 100) : baseBpm;
  const handFilter = practice && hand !== 'both' ? hand : undefined;

  return (
    <div className="grid gap-4" data-testid="play-step">
      <StepTitle title={text(exercise.title)} instructions={exercise.instructions && text(exercise.instructions)}>
        <div className="flex flex-wrap items-center gap-2">
          <ListenButton piece={exercise.piece} bpm={bpm} />
          <Segmented
            value={practice ? 'practice' : 'test'}
            options={[
              { value: 'test', label: 'Làm bài (chấm điểm)' },
              { value: 'practice', label: 'Luyện tập' },
            ]}
            onChange={(v) => setPractice(v === 'practice')}
          />
        </div>
      </StepTitle>

      {practice && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900" data-testid="practice-options">
          <Segmented
            value={practiceKind}
            options={[
              { value: 'wait', label: 'Chờ nốt' },
              { value: 'timed', label: 'Theo nhịp' },
            ]}
            onChange={setPracticeKind}
          />
          {exercise.piece.hand === 'both' && (
            <Segmented
              value={hand}
              options={[
                { value: 'both', label: 'Hai tay' },
                { value: 'right', label: 'Tay phải' },
                { value: 'left', label: 'Tay trái' },
              ]}
              onChange={setHand}
            />
          )}
          {practiceKind === 'timed' && (
            <>
              <TempoControl percent={percent} bpm={bpm} onChange={setPercent} />
              <div className="min-w-44">
                <Toggle checked={loop} onChange={setLoop} label="Lặp lại" />
              </div>
            </>
          )}
          <span className="text-sm text-slate-500 dark:text-slate-400">Luyện tập không tính điểm.</span>
        </div>
      )}
      {!practice && (
        <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="play-kind">
          {KIND_LABEL[kind]} · ♩ = {bpm}
        </p>
      )}

      {kind === 'wait' ? (
        <WaitRunner
          key={`${run}-${practice}-${handFilter}`}
          exercise={exercise}
          lesson={lesson}
          timeline={timeline}
          hand={handFilter}
          mode={mode}
          scored={!practice}
          loop={practice && loop}
          onScored={onDone}
          onRestart={() => setRun((r) => r + 1)}
        />
      ) : (
        <TimedRunner
          key={`${run}-${practice}-${handFilter}-${kind}`}
          exercise={exercise}
          lesson={lesson}
          timeline={timeline}
          hand={handFilter}
          kind={kind}
          bpm={bpm}
          mode={mode}
          scored={!practice}
          loop={practice && loop}
          onScored={onDone}
          onRestart={() => setRun((r) => r + 1)}
        />
      )}
    </div>
  );
}

function TempoControl({ percent, bpm, onChange }: { percent: number; bpm: number; onChange: (p: number) => void }) {
  const step = (d: number) => onChange(Math.min(TEMPO_PERCENT_MAX, Math.max(TEMPO_PERCENT_MIN, percent + d)));
  return (
    <div className="flex items-center gap-1" data-testid="tempo-control">
      <Button variant="ghost" onClick={() => step(-10)} aria-label="Chậm hơn" className="px-3 text-xl" disabled={percent <= TEMPO_PERCENT_MIN}>
        −
      </Button>
      <div className="min-w-20 text-center font-bold tabular-nums">♩ = {bpm}</div>
      <Button variant="ghost" onClick={() => step(10)} aria-label="Nhanh hơn" className="px-3 text-xl" disabled={percent >= TEMPO_PERCENT_MAX}>
        +
      </Button>
    </div>
  );
}

interface RunnerProps {
  exercise: PlayExercise;
  lesson: Lesson;
  timeline: TimelineNote[];
  hand?: Hand;
  mode: UiMode;
  scored: boolean;
  loop: boolean;
  onScored: (s: ExerciseScore) => void;
  onRestart: () => void;
}

/** Bàn phím ảo phủ cả nốt đệm tay trái (bài hai tay cùng lúc) để người không có đàn vẫn thử được hai tay. */
function useKeyboardRange(timeline: TimelineNote[], lesson: Lesson) {
  return useMemo(
    () => keyboardRange([...timeline.filter((n) => n.midiNote !== null).map((n) => n.midiNote!), ...(lesson.accompaniment ?? []).flatMap((c) => c.midis)]),
    [timeline, lesson],
  );
}

function ScoreBox({ lesson, index, results, finished, wrongPulse, showNames }: { lesson: Lesson; index: number; results: readonly NoteResult[]; finished: boolean; wrongPulse: number; showNames?: boolean }) {
  const settings = useSettings((s) => s.settings);
  return (
    // Khuông đôi cao hơn (hai khuông + số ngón tay trái + tên nốt).
    <div className={`${lesson.clef === 'grand' ? 'h-80' : 'h-64'} rounded-2xl bg-white shadow-md shadow-violet-200/60 ring-1 ring-violet-100 dark:bg-slate-900 dark:shadow-none dark:ring-violet-900`}>
      <ScoreView lesson={lesson} index={index} results={results} status={finished ? 'finished' : 'waiting'} wrongPulse={wrongPulse} showNames={showNames ?? settings.showNoteNames} labelStyle={settings.labelStyle} />
    </div>
  );
}

function DisplayToggles() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  return (
    <div className="flex gap-1">
      <Button variant="ghost" aria-pressed={settings.showNoteNames} aria-label={settings.showNoteNames ? 'Ẩn tên nốt' : 'Hiện tên nốt'} onClick={() => update({ showNoteNames: !settings.showNoteNames })} className="px-2">
        <Icon name={settings.showNoteNames ? 'eye' : 'eyeOff'} />
      </Button>
      <Button variant="ghost" aria-pressed={settings.showKeyboard} aria-label={settings.showKeyboard ? 'Ẩn gợi ý bàn phím' : 'Hiện gợi ý bàn phím'} onClick={() => update({ showKeyboard: !settings.showKeyboard })} className="px-2">
        <Icon name="keyboard" />
      </Button>
    </div>
  );
}

// ── Wait Mode ─────────────────────────────────────────────────────────

function WaitRunner({ exercise, lesson, timeline, hand, mode, scored, loop, onScored, onRestart }: RunnerProps) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  // Dấu lặng và nốt của tay không luyện không phải chờ.
  const playable = useMemo(() => timeline.filter((n) => n.midiNote !== null && (!hand || n.hand === hand)), [timeline, hand]);
  // Bài có phần đệm, luyện hai tay: tay trái ứng với từng nốt giai điệu (luyện riêng tay phải thì không có).
  const leftSteps = useMemo(() => {
    const steps = hand ? undefined : accompanimentByNote(lesson);
    return steps && playable.map((n) => steps[n.index]);
  }, [lesson, hand, playable]);
  const engine = useMemo(() => new PracticeEngine(playable.map((n) => n.midiNote!), { ...DEFAULT_PRACTICE_CONFIG }, leftSteps?.map((s) => s.midis)), [playable, leftSteps]);
  // Đàn MIDI / bàn phím ảo → chấm cả hai tay; chỉ có micro (một nốt mỗi lúc) → chỉ tay phải.
  const midiConnected = useMidi((s) => s.status === 'ready' && s.devices.length > 0);
  const micRunning = useMic((s) => s.status === 'running');
  const twoHands = !!leftSteps && !micOnlyInput(settings.inputSource, micRunning, midiConnected);
  const twoHandsRef = useRef(twoHands);
  twoHandsRef.current = twoHands;
  useEffect(() => engine.setConfig({ octaveTolerant: settings.octaveTolerant, twoHands }), [engine, settings.octaveTolerant, twoHands]);
  const state = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getState(),
  );
  const mistakes = useRef<string[]>([]);

  // Cô giáo giọng nói (Kids Mode): hướng dẫn theo tiến trình; sai nhiều lần → `help` tăng, màn hình gợi ý rõ hơn.
  const voiceActive = useVoiceActive(mode);
  const coachOptions = useWaitCoachOptions();
  const [help, setHelp] = useState<HelpLevel>(0);
  useVoiceScope();
  useEffect(() => {
    if (!voiceActive) return;
    const targets = playable.map((n) => ({ pitch: n.pitch, finger: n.finger, hand: n.hand }));
    const coach = new WaitVoiceCoach((c) => voiceTeacher.say(c), targets, text(exercise.title), coachOptions, exercise.voice, setHelp);
    coach.start(engine.getState());
    // Engine báo state ngay trong lúc xử lý nốt (đường MIDI) → để lời nói sang lượt sau, không chặn nhận nốt.
    let pending = 0;
    const off = engine.subscribe(() => {
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        coach.update(engine.getState());
      }, 0);
    });
    return () => {
      off();
      window.clearTimeout(pending);
      coach.dispose();
      setHelp(0);
    };
  }, [voiceActive, engine, playable, exercise, coachOptions]);

  useNoteInput(
    {
      onNote: (e) => {
        // Bài có phần đệm, chỉ chấm tay phải: nốt tay trái đánh kèm không bị tính là sai.
        if (!twoHandsRef.current && isAccompanimentMidi(lesson, e.midi)) return;
        const target = playable[engine.getState().index];
        const outcome = engine.handleNote(e.midi, e.time);
        if (outcome === 'wrong' && target) mistakes.current.push(wrongNoteKey(target.pitch, midiToName(e.midi)));
      },
    },
    settings.inputSource,
    { baseMidi: playable[0]?.midiNote ?? 60 },
  );

  const finished = state.status === 'finished';
  const sentRef = useRef(false);
  useEffect(() => {
    if (!finished || sentRef.current) return;
    sentRef.current = true;
    if (scored) {
      const reached = state.results.filter((r) => r === 'correct' || r === 'corrected' || r === 'wrong').length;
      onScored(scoreWait(exercise, { correct: state.correct, wrong: state.wrong, notes: playable.length, reached, mistakes: mistakes.current }));
    } else if (loop) {
      const id = window.setTimeout(onRestart, LOOP_DELAY_MS);
      return () => window.clearTimeout(id);
    }
  }, [finished, scored, loop, state, exercise, playable.length, onScored, onRestart]);

  const [flashOn, setFlashOn] = useState(false);
  useEffect(() => {
    if (state.lastEventTime === 0) return;
    setFlashOn(true);
    const id = window.setTimeout(() => setFlashOn(false), 900);
    return () => window.clearTimeout(id);
  }, [state.lastEventTime]);

  const results = useMemo(() => {
    const out: NoteResult[] = timeline.map(() => 'pending');
    playable.forEach((n, k) => (out[n.index] = state.results[k]));
    return out;
  }, [timeline, playable, state.results]);
  const current = playable[state.index];
  const expected = finished ? null : (current?.midiNote ?? null);
  const range = useKeyboardRange(timeline, lesson);
  const flash = flashOn && state.lastPlayedMidi !== null && (state.status === 'correct' || state.status === 'wrong') ? { midi: state.lastPlayedMidi, kind: state.status } : null;
  const done = state.results.filter((r) => r !== 'pending').length;
  const leftStep = finished ? undefined : leftSteps?.[state.index];
  const leftKeys = useMemo(() => new Set(twoHands ? state.pendingLeft : (leftStep?.midis ?? [])), [twoHands, state.pendingLeft, leftStep]);

  return (
    <div className="grid gap-3" data-testid="wait-runner">
      {leftSteps && (
        <p
          className={`rounded-xl px-4 py-2 text-sm ${twoHands ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'}`}
          data-testid="hands-notice"
          role="note"
        >
          {twoHands
            ? 'Chấm cả hai tay: đánh đúng nốt tay phải và đủ nốt tay trái (phím tô vàng) thì mới sang nốt tiếp.'
            : 'Micro chỉ nhận một nốt mỗi lúc nên chỉ chấm tay phải; tay trái cứ đánh theo hướng dẫn. Muốn chấm cả hai tay: nối đàn MIDI hoặc tắt micro và dùng bàn phím ảo.'}
        </p>
      )}
      <ScoreBox lesson={lesson} index={current?.index ?? 0} results={results} finished={finished} wrongPulse={state.wrong} showNames={help >= 1 || undefined} />
      <div className="flex flex-wrap items-center gap-4">
        {leftStep && current ? (
          <HandsGuide
            rightPitch={current.pitch}
            rightFinger={current.finger}
            left={leftStep}
            pendingLeft={state.pendingLeft}
            melodyDone={state.melodyDone}
            grading={twoHands}
            labelStyle={settings.labelStyle}
          />
        ) : (
          <div className="text-center" data-testid="expected">
            <div className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Cần đánh</div>
            <div className="text-4xl font-bold text-fuchsia-600 dark:text-fuchsia-300" data-testid="expected-note">
              {expected !== null && current ? pitchToLabel(current.pitch, settings.labelStyle) : '—'}
            </div>
          </div>
        )}
        {current?.finger && !finished && !leftStep && (
          <div className="text-center">
            <div className="text-xs text-slate-500 dark:text-slate-400">{current.hand === 'left' ? 'Tay trái' : 'Tay phải'}</div>
            <div className="text-3xl font-bold text-orange-500 dark:text-orange-300">ngón {current.finger}</div>
          </div>
        )}
        <div className="min-w-40 flex-1">
          <Feedback
            kind={flashOn && (state.status === 'correct' || state.status === 'wrong') ? state.status : null}
            mode={mode}
            eventKey={state.lastEventTime}
            detail={flashOn && state.status === 'wrong' && state.lastPlayedMidi !== null ? `bạn đánh ${midiToLabel(state.lastPlayedMidi, settings.labelStyle)}` : undefined}
          />
        </div>
        <span className="text-lg font-semibold tabular-nums" data-testid="progress-text">
          {done}/{playable.length}
        </span>
        <DisplayToggles />
        <div className="flex gap-2">
          <Button onClick={onRestart} aria-label="Chơi lại từ đầu" title="Chơi lại từ đầu">
            <Icon name="restart" />
          </Button>
          <Button onClick={() => engine.back(performance.now())} aria-label="Nốt trước">
            <Icon name="prev" />
          </Button>
          <Button onClick={() => engine.skip(performance.now())} aria-label="Bỏ qua nốt" disabled={finished}>
            <Icon name="next" />
          </Button>
        </div>
      </div>
      {finished && !scored && (
        <p className="text-center font-semibold text-emerald-700 dark:text-emerald-300">{loop ? 'Xong một lượt — chơi lại…' : 'Xong! Bấm ↺ để luyện lại hoặc chuyển sang "Làm bài".'}</p>
      )}
      {(settings.showKeyboard || help >= 2) && (
        // Bé sai nhiều lần: luôn hiện bàn phím, phím cần đánh sáng + khung nhấp nháy.
        <div className={`h-36 rounded-xl ${help >= 2 ? 'animate-pulse ring-4 ring-amber-400' : ''}`} data-testid="wait-keyboard" data-help={help || undefined}>
          <PianoKeyboard
            from={range.from}
            to={range.to}
            expected={state.melodyDone ? null : expected}
            expectedFinger={current?.finger}
            highlighted={leftKeys}
            detected={micLive?.midi ?? null}
            flash={flash}
            labelStyle={settings.labelStyle}
            onPress={(m) => virtualInput.press(m)}
            onRelease={(m) => virtualInput.release(m)}
          />
        </div>
      )}
    </div>
  );
}

// ── Biểu diễn / Tiết tấu (đồng hồ nhịp cố định) ──────────────────────

function TimedRunner({ exercise, lesson, timeline, hand, kind, bpm, mode, scored, loop, onScored, onRestart }: RunnerProps & { kind: 'performance' | 'rhythm'; bpm: number }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const micRunning = useMic((s) => s.status === 'running');
  const beatsPerMeasure = measureLength(lesson.timeSignature);
  const tracker = useMemo(
    () =>
      new PerformanceTracker(timedNotes(timeline, hand), {
        bpm,
        countInBeats: beatsPerMeasure,
        checkPitch: kind === 'performance',
        octaveTolerant: settings.octaveTolerant,
        pedal: kind === 'performance' ? pedalRanges(lesson) : [],
      }),
    // Đổi BPM giữa chừng dùng setBpm, không tạo lại.
    [timeline, hand, kind, beatsPerMeasure, lesson],
  );
  // Pedal vang: chỉ đàn MIDI gửi được (Control Change 64); micro / bàn phím ảo → tiêu chí pedal "không đo".
  const hasPedal = kind === 'performance' && !!lesson.pedal?.length;
  const midiConnected = useMidi((s) => s.status === 'ready' && s.devices.length > 0);
  const pedalInput = midiConnected && settings.inputSource !== 'microphone';
  useEffect(() => tracker.setPedalInput(pedalInput), [tracker, pedalInput]);
  useEffect(() => midiInput.onPedal((e) => tracker.handlePedal(e.down, e.time)), [tracker]);
  useEffect(() => tracker.setBpm(bpm, performance.now()), [tracker, bpm]);
  const state = useSyncExternalStore(
    (cb) => tracker.subscribe(cb),
    () => tracker.getState(),
  );
  const running = state.status === 'running' || state.status === 'countIn';

  // Tiếng metronome: mặc định tắt khi đang dùng micro (micro có thể nghe nhầm tiếng click).
  const usingMic = micRunning && !midiInput.hasDevice() && settings.inputSource !== 'midi';
  const [metronome, setMetronome] = useState(() => !usingMic || settings.metronomeWithMic);

  // Đồng hồ nhịp chạy theo khung hình; click metronome ở mỗi phách.
  const metronomeRef = useRef(metronome);
  metronomeRef.current = metronome;
  useEffect(() => {
    if (!running) return;
    let id = 0;
    let lastBeat = Math.floor(tracker.getState().beat);
    const loopFn = () => {
      tracker.tick(performance.now());
      const b = Math.floor(tracker.getState().beat);
      if (b !== lastBeat) {
        lastBeat = b;
        if (metronomeRef.current && tracker.getState().status !== 'finished') {
          soundOutput.click(((b % beatsPerMeasure) + beatsPerMeasure) % beatsPerMeasure === 0);
        }
      }
      id = requestAnimationFrame(loopFn);
    };
    id = requestAnimationFrame(loopFn);
    return () => cancelAnimationFrame(id);
  }, [tracker, running, beatsPerMeasure]);

  // Ẩn app → tạm dừng (micro cũng bị tắt).
  useEffect(() => {
    const onVis = () => document.visibilityState === 'hidden' && tracker.pause(performance.now());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      tracker.pause(performance.now());
    };
  }, [tracker]);

  const playable = timeline.filter((n) => n.midiNote !== null);
  useNoteInput(
    {
      onNote: (e) => {
        // Bài có phần đệm: nốt tay trái đánh kèm không bị tính là thừa.
        if (isAccompanimentMidi(lesson, e.midi)) return;
        tracker.handleNoteOn(e.midi, e.source === 'microphone' ? e.time - MIC_LATENCY_MS : e.time, loudnessDb(e));
      },
      onNoteOff: (e) => {
        if (!isAccompanimentMidi(lesson, e.midi)) tracker.handleNoteOff(e.midi, e.time);
      },
    },
    settings.inputSource,
    { baseMidi: playable[0]?.midiNote ?? 60 },
  );

  const finished = state.status === 'finished';
  const sentRef = useRef(false);
  useEffect(() => {
    if (!finished || sentRef.current) return;
    sentRef.current = true;
    if (scored) {
      const r = tracker.result();
      const mistakes: string[] = [];
      timeline.forEach((n, i) => {
        if (n.midiNote === null || (hand && n.hand !== hand)) return;
        if (state.results[i] === 'wrong' && kind === 'performance') mistakes.push(wrongNoteKey(n.pitch, midiToName(state.playedMidis[i]!)));
        if (state.results[i] === 'skipped') mistakes.push(missedNoteKey(n.pitch));
      });
      for (let k = 0; k < state.extras; k++) mistakes.push(EXTRA_KEY);
      onScored(kind === 'performance' ? scorePerformance(exercise, r, mistakes) : scoreRhythm(exercise, r, mistakes));
    } else if (loop) {
      const id = window.setTimeout(onRestart, LOOP_DELAY_MS);
      return () => window.clearTimeout(id);
    }
  }, [finished, scored, loop, tracker, timeline, hand, kind, state, exercise, onScored, onRestart]);

  const toggle = () => {
    const now = performance.now();
    if (running) tracker.pause(now);
    else if (finished) onRestart();
    else tracker.start(now);
  };

  const current = timeline[state.index];
  const expected = running && current?.midiNote !== null && (!hand || current?.hand === hand) ? (current?.midiNote ?? null) : null;
  const range = useKeyboardRange(timeline, lesson);
  const beatInMeasure = state.beat >= 0 ? Math.floor(state.beat) % beatsPerMeasure : null;
  const hits = state.results.filter((r) => r === 'correct').length;
  const flash = state.lastOutcome === 'hit' || state.lastOutcome === 'wrong' ? state.lastOutcome : null;

  return (
    <div className="grid gap-3" data-testid="timed-runner">
      <ScoreBox lesson={lesson} index={state.index} results={state.results} finished={finished || state.status === 'idle'} wrongPulse={0} />
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" onClick={toggle} aria-label={running ? 'Tạm dừng' : 'Bắt đầu'} data-testid="timed-run" className="min-w-36">
          <Icon name={running ? 'pause' : 'play'} />
          {running ? 'Tạm dừng' : finished ? 'Chơi lại' : state.status === 'paused' ? 'Chạy tiếp' : 'Bắt đầu'}
        </Button>
        <BeatIndicator status={state.status} beat={state.beat} beatsPerMeasure={beatsPerMeasure} current={beatInMeasure} />
        <TimingLabel offsetMs={state.lastOffsetMs} outcome={flash ?? (state.lastOutcome === 'extra' ? 'extra' : null)} mode={mode} eventKey={state.lastEventTime} />
        <span className="text-lg font-semibold tabular-nums" data-testid="timed-hits" title="Số nốt đúng">
          ✓ {hits}/{playable.filter((n) => !hand || n.hand === hand).length}
        </span>
        <div className="min-w-48">
          <Toggle checked={metronome} onChange={setMetronome} label={<span className="text-sm">Tiếng metronome</span>} />
        </div>
        <DisplayToggles />
        <Button onClick={onRestart} aria-label="Chơi lại từ đầu">
          <Icon name="restart" />
        </Button>
      </div>
      {usingMic && metronome && <p className="text-sm text-amber-700 dark:text-amber-300">Đang dùng micro: nên đeo tai nghe để micro không nghe nhầm tiếng metronome.</p>}
      {hasPedal && (
        <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="pedal-panel">
          {pedalInput ? (
            <span
              className={`rounded-full px-3 py-1 font-semibold ${state.pedalDown ? 'bg-fuchsia-500 text-white' : 'bg-violet-100 text-violet-700 dark:bg-slate-700 dark:text-slate-300'}`}
              data-testid="pedal-state"
            >
              Pedal: {state.pedalDown ? 'đang đạp' : 'nhả'}
            </span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300" data-testid="pedal-unmeasured">
              Bài có ký hiệu pedal ("Ped." dưới khuông). Chỉ đàn MIDI gửi được pedal — micro và bàn phím ảo thì tiêu chí Pedal "không đo".
            </span>
          )}
        </div>
      )}
      {state.status === 'idle' && <p className="text-sm text-slate-500 dark:text-slate-400">Bấm "Bắt đầu": app đếm vào {beatsPerMeasure} phách rồi khuông nhạc chạy theo nhịp. Đánh đúng lúc con trỏ tới nốt.</p>}
      {finished && !scored && <p className="text-center font-semibold text-emerald-700 dark:text-emerald-300">{loop ? 'Hết bài — lặp lại…' : 'Hết bài! Bấm "Chơi lại" để luyện tiếp.'}</p>}
      {settings.showKeyboard && (
        <div className="h-36">
          <PianoKeyboard
            from={range.from}
            to={range.to}
            expected={kind === 'performance' ? expected : null}
            expectedFinger={kind === 'performance' ? current?.finger : undefined}
            detected={micLive?.midi ?? null}
            flash={null}
            labelStyle={settings.labelStyle}
            onPress={(m) => virtualInput.press(m)}
            onRelease={(m) => virtualInput.release(m)}
          />
        </div>
      )}
    </div>
  );
}

function BeatIndicator({ status, beat, beatsPerMeasure, current }: { status: string; beat: number; beatsPerMeasure: number; current: number | null }) {
  if (status === 'countIn') {
    return (
      <div className="min-w-24 rounded-xl bg-amber-100 px-4 py-2 text-center text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="status" data-testid="count-in">
        <div className="text-xs">Đếm vào</div>
        <div className="text-3xl font-bold tabular-nums">{Math.max(1, Math.ceil(-beat))}</div>
      </div>
    );
  }
  return (
    <div className="flex gap-1.5" aria-label={current === null ? 'Phách' : `Phách ${current + 1}`} data-testid="beat-indicator">
      {Array.from({ length: beatsPerMeasure }, (_, i) => (
        <span
          key={i}
          className={`grid size-10 place-items-center rounded-full text-lg font-bold ${
            current === i && status === 'running' ? 'scale-110 bg-fuchsia-500 text-white' : 'bg-violet-100 text-violet-700 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          {i + 1}
        </span>
      ))}
    </div>
  );
}

function TimingLabel({ offsetMs, outcome, mode, eventKey }: { offsetMs: number | null; outcome: 'hit' | 'wrong' | 'extra' | null; mode: UiMode; eventKey: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (eventKey === 0) return;
    setVisible(true);
    const id = window.setTimeout(() => setVisible(false), 900);
    return () => window.clearTimeout(id);
  }, [eventKey]);
  if (!visible || !outcome) return <div className="min-h-12 min-w-40" />;
  const onTime = offsetMs !== null && Math.abs(offsetMs) <= DEFAULT_PERFORMANCE_CONFIG.onTimeMs;
  let label: string;
  if (outcome === 'extra') label = mode === 'kids' ? '🤫 Chưa tới nốt!' : 'Gõ thừa';
  else if (onTime) label = mode === 'kids' ? '🎯 Đúng nhịp!' : 'Đúng nhịp';
  else if (offsetMs !== null) label = mode === 'kids' ? (offsetMs < 0 ? 'Hơi sớm' : 'Hơi muộn') : `${offsetMs < 0 ? 'Sớm' : 'Muộn'} ${Math.round(Math.abs(offsetMs))} ms`;
  else label = '';
  const tone = outcome === 'wrong' || outcome === 'extra' ? 'bg-rose-500 text-white' : onTime ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-950';
  return (
    <div key={eventKey} role="status" className={`min-w-40 animate-pop rounded-xl px-4 py-2 text-center font-bold ${tone}`} data-testid="timing-label">
      {outcome === 'wrong' ? `Sai nốt · ${label}` : label}
    </div>
  );
}
