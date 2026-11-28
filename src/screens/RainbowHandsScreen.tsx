import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { InputSourceBar } from '../components/curriculum/common';
import { useFrameClock, useGameState, useKeyFlash } from '../components/games/shared';
import { HAND_CHAR, RainbowScene } from '../components/rainbowHands/RainbowScene';
import { PinShortcutButton } from '../components/shortcuts/PinShortcutButton';
import { Button, FullscreenButton, Icon, Segmented, Toggle } from '../components/ui';
import { soundOutput } from '../core/audio/SoundOutput';
import { micOnlyInput } from '../core/input/sourceFilter';
import { virtualInput } from '../core/input/VirtualInputProvider';
import type { Hand } from '../core/lessons/types';
import { midiToLabel } from '../core/music/notes';
import {
  adviseTempo,
  animalFor,
  feedbackText,
  HAND_LABEL,
  missionRewards,
  overallAccuracy,
  retryPlan,
  STICKERS,
  summarize,
  summarizeRounds,
  weakSegment,
  type RetryPhase,
  type RoundSummary,
  type StickerKind,
  type Summary,
  type WeakSegment,
} from '../core/rainbowHands/analysis';
import { RainbowEngine, type EngineState } from '../core/rainbowHands/RainbowEngine';
import { buildRoute, buildSegment, FINGERING_SOURCE, handsOf, isMirrored, placementGuide, START_CHOICES, noteLabel, type HandSet, type RainbowPath, type RouteStep } from '../core/rainbowHands/route';
import {
  BPM_CHOICES,
  MODE_INFO,
  ON_TIME_CHOICES,
  PASS_CHOICES,
  resolvePlan,
  ROUND_CHOICES,
  SLOW_FACTOR,
  SYNC_CHOICES,
  type RainbowMode,
  type RainbowSettings,
} from '../core/rainbowHands/settings';
import { loadRainbowProgress, loadRainbowSettings, previousAccuracy, recordRainbowSession, saveRainbowSettings, type RainbowProgress } from '../core/rainbowHands/storage';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useGameTimeNow } from '../store/gameTimeStore';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { usePlayingNow } from '../store/playingStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type Modal = 'settings' | 'stickers' | null;
const HAND_TITLE: Record<Hand, string> = { left: 'Tay trái', right: 'Tay phải' };
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const PATH_LABEL: Record<RainbowPath, string> = { up: '⬆ Đi lên', down: '⬇ Đi xuống', round: '⛰ Cả vòng' };
const EFFECT_VELOCITY = { off: 0, low: 22, mid: 42 } as const;

/** Kết quả một lượt (nhiệm vụ / chặng tập lại / vòng chơi thêm) để hiện tổng kết. */
interface RunResult {
  rounds: RoundSummary[];
  summary: Summary;
  weak: WeakSegment | null;
  stickers: StickerKind[];
  feedback: string;
  tempoAdvice: number | null;
}

interface Retry {
  phases: RetryPhase[];
  index: number;
  weak: WeakSegment;
}

/** "Cầu vồng hai bàn tay": hai bạn thú (tay trái / tay phải) đi qua cầu vồng theo tám nốt Đô trưởng. */
export function RainbowHandsScreen() {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const profileId = profile?.id ?? null;
  const inputSource = useSettings((s) => s.settings.inputSource);
  const micLive = useMic((s) => s.live);
  const micRunning = useMic((s) => s.status === 'running');
  const midiConnected = useMidi((s) => s.status === 'ready' && s.devices.length > 0);
  const micOnly = micOnlyInput(inputSource, micRunning, midiConnected);

  const [settings, setSettings] = useState<RainbowSettings>(() => loadRainbowSettings(profileId));
  const [progress, setProgress] = useState<RainbowProgress>(() => loadRainbowProgress(profileId));
  const [modal, setModal] = useState<Modal>(null);
  const [run, setRun] = useState(0);
  const [retry, setRetry] = useState<Retry | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [weakDismissed, setWeakDismissed] = useState(false);

  const loadedFor = useRef(profileId);
  useEffect(() => {
    if (loadedFor.current === profileId) return;
    loadedFor.current = profileId;
    setSettings(loadRainbowSettings(profileId));
    setProgress(loadRainbowProgress(profileId));
    setRetry(null);
    setRun((r) => r + 1);
  }, [profileId]);

  const plan = resolvePlan(settings);
  const startLeft = plan.starts.left;
  const startRight = plan.starts.right;
  const phase = retry ? retry.phases[retry.index] : null;
  const handSet: HandSet = phase ? phase.hands : plan.hands;
  const hands = handsOf(handSet);
  const steps = useMemo(
    () => {
      // Vùng phím thật (ngược chiều có thể lùi tay trái); deps là số nguyên để không dựng lại ván mỗi lần vẽ.
      const route = { starts: { left: startLeft, right: startRight }, motion: plan.motion };
      return phase ? buildSegment(phase.from, phase.to, { ...route, hands: phase.hands }) : buildRoute({ ...route, hands: plan.hands, path: plan.path });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, plan.hands, plan.path, plan.motion, startLeft, startRight],
  );
  const timing = phase ? 'wait' : plan.timing;
  const rounds = phase ? phase.rounds : plan.rounds;
  // "Tập chậm" chỉ đổi ván khi đang giữ nhịp (nhịp thật đổi); ở chế độ chờ chỉ làm chậm phần nghe mẫu.
  const engineKey = `${run}|${timing}|${rounds}|${settings.syncToleranceMs}|${timing === 'tempo' ? plan.bpm : ''}`;
  const prevEngine = useRef<RainbowEngine | null>(null);
  const engine = useMemo(() => {
    const e = new RainbowEngine(steps, { timing, rounds, bpm: plan.bpm, syncToleranceMs: settings.syncToleranceMs }, prevEngine.current?.heldKeys() ?? []);
    prevEngine.current = e;
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, engineKey]);
  const state = useGameState(engine);
  useEffect(() => {
    setResult(null);
    setWeakDismissed(false);
  }, [engine]);

  const running = state.status === 'playing' || state.status === 'count-in' || state.status === 'celebrating';
  usePlayingNow(running);
  useGameTimeNow(running && !modal);
  useFrameClock(running, (now) => engine.tick(now));

  // Chế độ hai nốt cùng lúc mà chỉ có micro → không chấm (micro chỉ nhận một nốt mỗi lúc).
  const twoNoteBlocked = micOnly && handSet === 'both';

  // ── Nguồn nốt: mất kết nối → tạm dừng, không chấm lỗi ──
  const startedWith = useRef<'midi' | 'mic' | 'other'>('other');
  const inputKind = () => (midiConnected && inputSource !== 'microphone' ? 'midi' : micOnly ? 'mic' : 'other');
  useEffect(() => {
    if (!running) return;
    const lost = (startedWith.current === 'midi' && !midiConnected) || (startedWith.current === 'mic' && !micRunning);
    if (lost) {
      engine.releaseAll();
      engine.pause(performance.now(), 'input-lost');
    }
  }, [running, midiConnected, micRunning, engine]);

  useEffect(() => {
    const onVisibility = () => document.hidden && engine.pause(performance.now(), 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [engine]);

  // ── Hiệu ứng âm thanh: nhỏ, chỉ khi xong vòng, KHÔNG phát khi nghe bằng micro ──
  const effectsOn = settings.volume !== 'off' && !micOnly;
  const chime = () => {
    if (!effectsOn) return;
    const v = EFFECT_VELOCITY[settings.volume];
    [84, 88, 91].forEach((m, i) => soundOutput.scheduleNote(m, i * 0.09, 0.12, v));
  };

  const listening = running && !modal;
  useNoteInput(
    {
      onNote: (e) => {
        const out = engine.noteOn(e.midi, e.time, e.source);
        if (e.source === 'virtual' && out !== 'held') soundOutput.playNote(e.midi, 0.4);
        if (out === 'round') chime();
      },
      onNoteOff: (e) => engine.noteOff(e.midi),
    },
    inputSource,
    { baseMidi: plan.starts[hands.includes('right') ? 'right' : 'left'], listening },
  );

  // ── Metronome của chế độ giữ nhịp: lên lịch theo đồng hồ âm thanh, mỗi phách một lần ──
  const scheduled = useRef(new Set<number>());
  useEffect(() => {
    scheduled.current.clear();
  }, [engine]);
  useEffect(() => {
    if (timing !== 'tempo' || !running) return;
    const id = window.setInterval(() => {
      const now = performance.now();
      engine.beatTimes().forEach((t, i) => {
        const key = Math.round(t);
        if (t < now - 20 || t > now + 160 || scheduled.current.has(key)) return;
        scheduled.current.add(key);
        soundOutput.click(i % 4 === 0, Math.max(0, (t - now) / 1000));
      });
    }, 40);
    return () => window.clearInterval(id);
  }, [timing, running, engine, state.round, state.status]);

  // ── Nghe mẫu: dừng chấm trong lúc phát, phát cả hai tay ──
  const [sampleUntil, setSampleUntil] = useState(0);
  const playSample = () => {
    soundOutput.unlock();
    const wasRunning = running;
    if (wasRunning) engine.pause(performance.now(), 'listening');
    const stepSec = (timing === 'tempo' ? 60 / plan.bpm : 0.55) / (settings.slow && timing !== 'tempo' ? SLOW_FACTOR : 1);
    const ms = soundOutput.playSequence(steps.flatMap((s, i) => s.notes.map((n) => ({ midi: n.midi, start: i * stepSec, duration: stepSec * 0.9, velocity: 80 }))));
    setSampleUntil(performance.now() + ms);
    window.setTimeout(() => {
      setSampleUntil(0);
      if (wasRunning && engine.getState().pauseReason === 'listening') engine.resume(performance.now());
    }, ms + 200);
  };
  const sampling = sampleUntil > 0;

  // ── Lưu kết quả khi xong lượt (mỗi lần "done" một lần) ──
  const recordedEnded = useRef(0);
  useEffect(() => {
    recordedEnded.current = 0;
  }, [engine]);
  useEffect(() => {
    if (state.status !== 'done' || recordedEnded.current >= state.roundsEnded) return;
    const fromRound = recordedEnded.current;
    const extra = fromRound > 0;
    recordedEnded.current = state.roundsEnded;
    const roundInfos = engine.getRounds().slice(fromRound);
    const firstRound = roundInfos[0]?.round ?? 1;
    const records = engine.getRecords().filter((r) => r.round >= firstRound && r.closed);
    const criteria = { accuracy: settings.passAccuracy, onTime: settings.passOnTime };
    const roundSummaries = summarizeRounds(records, roundInfos, timing, criteria);
    const summary = summarize(records);
    const weak = weakSegment(engine.getRecords(), 2, plan.motion);
    const accuracy = meanAccuracy(summary);
    const mode = phase ? 'retry' : settings.mode;
    const stickers = phase || extra ? [] : missionRewards({ roundsTarget: rounds, rounds: roundSummaries, sync: summary.sync, accuracy, previousAccuracy: previousAccuracy(progress, mode, handSet) });
    const complete = roundSummaries.filter((r) => r.complete).length;
    const tempoRounds = timing === 'tempo' ? roundSummaries.map((r) => ({ bpm: plan.bpm, passed: r.passed, at: Date.now() })) : [];
    const next = recordRainbowSession(profileId, {
      session: {
        at: Date.now(),
        mode,
        hands: handSet,
        timing,
        bpm: timing === 'tempo' ? plan.bpm : null,
        roundsTarget: roundInfos.length,
        roundsComplete: complete,
        roundsPassed: roundSummaries.filter((r) => r.passed).length,
        accuracy: Object.fromEntries(hands.map((h) => [h, summary.hands[h]?.accuracy ?? null])),
        together: summary.sync && summary.sync.complete ? summary.sync.together / summary.sync.complete : null,
        weak: weak ? `${weak.label} · ${HAND_LABEL[weak.hand]}` : null,
      },
      animals: phase ? 0 : complete,
      stickers,
      tempoRounds,
    });
    setProgress(next);
    if (stickers.length > 0 || complete > 0) chime();
    setResult({
      rounds: roundSummaries,
      summary,
      weak,
      stickers,
      feedback: feedbackText({ roundsComplete: complete, weak, sync: summary.sync, timing }),
      tempoAdvice: timing === 'tempo' ? adviseTempo(next.tempo, plan.bpm) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.roundsEnded, engine]);

  // ── Điều khiển ──
  const start = () => {
    soundOutput.unlock();
    startedWith.current = inputKind();
    engine.start(performance.now());
  };
  const resume = () => {
    startedWith.current = inputKind();
    engine.resume(performance.now());
  };
  const togglePause = () => (state.status === 'paused' ? resume() : engine.pause(performance.now(), 'user'));
  const newRun = () => {
    setModal(null);
    setRun((r) => r + 1);
  };
  const resumeAfterSettings = useRef(false);
  const openSettings = () => {
    resumeAfterSettings.current = running;
    if (running) engine.pause(performance.now(), 'settings');
    setModal('settings');
  };
  const closeModal = () => {
    setModal(null);
    if (resumeAfterSettings.current && engine.getState().pauseReason === 'settings') resume();
    resumeAfterSettings.current = false;
  };
  /** Đổi cài đặt: thứ làm thay đổi ván → ván mới; gợi ý / số ngón / âm lượng / tập chậm (chế độ chờ) giữ nguyên ván. */
  const updateSettings = (patch: Partial<RainbowSettings>) => {
    const next = { ...settings, ...patch };
    saveRainbowSettings(profileId, next);
    setSettings(next);
    const cosmetic = (['hints', 'fingers', 'volume', 'slow', 'passAccuracy', 'passOnTime'] as const).some((k) => k in patch) && Object.keys(patch).length === 1;
    if (!cosmetic) {
      setRetry(null);
      resumeAfterSettings.current = false;
      setRun((r) => r + 1);
    }
  };
  const startRetry = (weak: WeakSegment) => {
    setRetry({ phases: retryPlan(weak, plan.hands === 'both'), index: 0, weak });
    setRun((r) => r + 1);
  };
  const nextRetryPhase = () => {
    if (!retry) return;
    if (retry.index + 1 < retry.phases.length) setRetry({ ...retry, index: retry.index + 1 });
    else setRetry(null);
    setRun((r) => r + 1);
  };

  // ── Gợi ý trên bàn phím ──
  const pending = running && state.status !== 'celebrating' && state.status !== 'count-in' ? engine.pendingNotes() : [];
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome === 'wrong' ? 'wrong' : state.lastOutcome === 'hit' || state.lastOutcome === 'step' || state.lastOutcome === 'round' ? 'hit' : null);
  const lo = Math.min(...hands.map((h) => plan.starts[h]));
  const hi = Math.max(...hands.map((h) => plan.starts[h])) + 12;
  const showFingers = settings.fingers && settings.hints !== 'none';
  const keyFingers = showFingers ? Object.fromEntries(pending.filter((n) => n.finger).map((n) => [n.midi, n.finger!])) : undefined;
  const pendingLabel = new Map(pending.map((n) => [n.midi, n]));
  const keyboard = {
    expected: state.fixMidi ?? (settings.hints === 'full' ? (pending[0]?.midi ?? null) : null),
    expectedExtra: settings.hints === 'none' ? undefined : new Set(pending.map((n) => n.midi).filter((m) => m !== state.fixMidi)),
    labelFor: (m: number) => {
      const n = pendingLabel.get(m);
      if (n && settings.hints === 'full') return `${HAND_CHAR[n.hand].tag[0]}·${n.name.replace(/ (cao|thấp)$/, '')}`;
      return m % 12 === 0 ? midiToLabel(m, 'solfege') : '';
    },
  };

  const current = state.steps[Math.min(state.index, state.steps.length - 1)];
  const modeTitle = phase ? `🔁 ${phase.label}` : `${MODE_INFO[settings.mode].icon} ${MODE_INFO[settings.mode].label}`;

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-violet-100 via-sky-50 to-emerald-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950"
      data-testid="rainbow-hands"
      data-status={state.status}
      data-pause={state.pauseReason ?? ''}
      data-round={state.round}
      data-rounds-complete={state.roundsComplete}
      data-step={state.index}
      data-expected={pending.map((n) => n.midi).join(',')}
      data-mode={phase ? 'retry' : settings.mode}
    >
      <header className="z-10 flex flex-wrap items-center gap-2 bg-white/80 pt-[calc(.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pr-3 pb-2 pl-16 shadow-sm backdrop-blur dark:bg-slate-900/80">
        <Button variant="ghost" className="px-2" aria-label="Thoát về mục Trò chơi" onClick={() => navigate({ name: 'games' })} midiNav={running ? undefined : 'back'}>
          <Icon name="back" />
        </Button>
        <div className="min-w-40 flex-1">
          <h1 className="text-xl font-black sm:text-2xl">🌈 Cầu vồng hai bàn tay</h1>
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            {modeTitle}
            {timing === 'tempo' ? ` · ♩=${plan.bpm}` : ''}
          </p>
        </div>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-black dark:bg-slate-700" data-testid="rainbow-round-counter">
          Vòng {Math.min(state.round, state.roundsTarget)}/{state.roundsTarget}
        </span>
        <Button className="px-3 text-sm" onClick={togglePause} disabled={!running && state.status !== 'paused'} data-testid="rainbow-pause">
          <Icon name={state.status === 'paused' ? 'play' : 'pause'} /> {state.status === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
        </Button>
        <Button className="px-3 text-sm" onClick={playSample} disabled={sampling} data-testid="rainbow-sample">
          <Icon name="volume" /> Nghe mẫu
        </Button>
        <Button className="px-3 text-sm" variant={settings.slow ? 'primary' : 'secondary'} aria-pressed={settings.slow} onClick={() => updateSettings({ slow: !settings.slow })} data-testid="rainbow-slow">
          🐢 Tập chậm
        </Button>
        <Button className="px-3" onClick={openSettings} aria-label="Cài đặt (phụ huynh)" data-testid="rainbow-open-settings">
          ⚙
        </Button>
        <FullscreenButton />
      </header>

      <main className="grid min-h-0 flex-1 grid-rows-[minmax(150px,1fr)_auto] gap-2 px-2 py-2 sm:px-4">
        <RainbowScene
          steps={state.steps}
          index={state.index}
          hands={hands}
          handsDone={state.handsDone}
          round={state.round}
          roundsTarget={state.roundsTarget}
          roundsComplete={state.roundsComplete}
          celebrating={state.status === 'celebrating'}
          wrongHand={state.lastOutcome === 'wrong' ? state.lastHand : null}
          showNames={settings.hints !== 'none'}
        />
        <StepPanel engine={engine} state={state} hands={hands} current={current} hints={settings.hints} fingers={settings.fingers} />
      </main>

      <div className="h-[26%] min-h-32 shrink-0 px-2 pt-1 pb-[calc(8px+env(safe-area-inset-bottom,0px))] sm:px-4" data-testid="rainbow-keyboard">
        <PianoKeyboard
          from={lo}
          to={hi}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle="solfege"
          onPress={(m) => virtualInput.press(m)}
          onRelease={(m) => virtualInput.release(m)}
          fingers={keyFingers}
          {...keyboard}
        />
      </div>

      {state.status === 'count-in' && state.countdown !== null && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" data-testid="rainbow-countdown">
          <span className="rounded-full bg-white/90 px-10 py-4 text-7xl font-black text-violet-700 shadow-2xl dark:bg-slate-900/90">{state.countdown}</span>
        </div>
      )}

      {state.status === 'celebrating' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/4 z-20 grid place-items-center" data-testid="rainbow-celebrate">
          <div className="animate-bounce rounded-3xl bg-white/95 px-8 py-4 text-center shadow-2xl ring-4 ring-emerald-300 dark:bg-slate-900/95">
            <p className="text-3xl font-black">
              {animalFor(state.round - (timing === 'tempo' ? 1 : 0))} về nhà rồi!
            </p>
            <p className="text-sm font-semibold">
              Xong vòng {state.roundsEnded}/{state.roundsTarget} · thêm một mảnh cầu vồng 🌈
            </p>
          </div>
        </div>
      )}

      {state.status === 'ready' && !modal && (
        <ReadyOverlay
          settings={settings}
          phase={phase}
          hands={hands}
          twoNoteBlocked={twoNoteBlocked}
          micOnly={micOnly}
          onMode={(mode) => updateSettings({ mode })}
          onStart={start}
          onSettings={openSettings}
          onStickers={() => setModal('stickers')}
          onCancelRetry={phase ? () => (setRetry(null), setRun((r) => r + 1)) : undefined}
        />
      )}

      {state.status === 'paused' && !modal && state.pauseReason !== 'listening' && (
        <PausedOverlay reason={state.pauseReason} startedWith={startedWith.current} onResume={resume} onExit={() => navigate({ name: 'games' })} />
      )}

      {state.status === 'done' && result && !modal && (
        <ResultOverlay
          result={result}
          state={state}
          hands={hands}
          timing={timing}
          retry={retry}
          weakDismissed={weakDismissed}
          onDismissWeak={() => setWeakDismissed(true)}
          onRetry={startRetry}
          onNextPhase={nextRetryPhase}
          onMore={() => engine.playMore(performance.now())}
          onAgain={newRun}
          onTempo={(bpm) => updateSettings({ bpm })}
          onStickers={() => setModal('stickers')}
          onRest={() => navigate({ name: 'games' })}
        />
      )}

      {modal === 'settings' && <SettingsModal settings={settings} micOnly={micOnly} onChange={updateSettings} onClose={closeModal} />}
      {modal === 'stickers' && <StickerModal progress={progress} profileName={profile?.name ?? null} onClose={() => setModal(null)} />}
      {state.status === 'ready' && !modal && (
        <div className="absolute right-3 bottom-2 left-3 z-30">
          <ProfileSwitcher className="" hint="Mỗi hồ sơ có sticker, bạn thú và cài đặt Cầu vồng riêng (lưu trên máy này)." />
        </div>
      )}
    </div>
  );
}

function meanAccuracy(s: Summary): number | null {
  const v = Object.values(s.hands)
    .map((h) => h?.accuracy)
    .filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : overallAccuracy(s);
}

const DIRECTION_TEXT = { up: '⬆ Đi lên', turn: '🔝 Quay đầu', down: '⬇ Đi xuống' } as const;
/** Ngược chiều: hai tay tách xa nhau rồi gom lại. */
const CONTRARY_TEXT = { up: '↔ Tách ra', turn: '🔝 Quay đầu', down: '→← Gom lại' } as const;
const directionText = (step: RouteStep) => (step.motion === 'contrary' ? CONTRARY_TEXT : DIRECTION_TEXT)[step.direction];
/** Mũi tên hướng của một tay ở bước này. */
function handArrow(step: RouteStep, hand: Hand): string {
  if (step.direction === 'turn') return '↺';
  const up = (step.direction === 'up') !== isMirrored(hand, step.motion);
  return up ? '⬆' : '⬇';
}

function StepPanel({ engine, state, hands, current, hints, fingers }: { engine: RainbowEngine; state: EngineState; hands: Hand[]; current: EngineState['steps'][number]; hints: RainbowSettings['hints']; fingers: boolean }) {
  const next = state.steps[state.index + 1] ?? null;
  const active = state.status === 'playing' || state.status === 'paused';
  return (
    <section className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-3xl bg-white/90 px-3 py-2 shadow-md ring-2 ring-violet-200 dark:bg-slate-800/90 dark:ring-violet-900" data-testid="rainbow-step-panel">
      <div className="grid justify-items-center gap-0.5 text-center">
        <span className="text-lg font-black text-violet-700 dark:text-violet-300" data-testid="rainbow-direction">
          {directionText(current)}
        </span>
        <span className="text-xs font-semibold text-slate-500">
          Bước {Math.min(state.index + 1, state.steps.length)}/{state.steps.length}
        </span>
        <StepDots count={state.steps.length} index={state.index} />
      </div>
      <div className="flex min-w-0 flex-wrap justify-center gap-2">
        {hands.map((h) => {
          const note = current.notes.find((n) => n.hand === h)!;
          const done = state.handsDone.includes(h);
          const nextNote = next?.notes.find((n) => n.hand === h);
          const c = HAND_CHAR[h];
          return (
            <div key={h} className={`grid min-w-44 grid-cols-[auto_1fr] items-center gap-2 rounded-2xl px-3 py-1 ring-2 ${c.bg} ${c.ring} ${done ? 'opacity-70' : ''}`} data-testid={`rainbow-card-${h}`}>
              <span className="text-3xl" aria-hidden>
                {c.icon}
              </span>
              <div className="leading-tight">
                <div className={`text-xs font-black ${c.text}`}>
                  {h === 'left' ? '◀ TAY TRÁI' : 'TAY PHẢI ▶'} {current.motion === 'contrary' && <span aria-label="hướng">{handArrow(current, h)}</span>} {done && '· ✓ sẵn sàng'}
                </div>
                <div className="text-2xl font-black">
                  {hints === 'none' ? '♪' : note.name}
                  {fingers && hints !== 'none' && note.finger ? <span className="ml-2 text-base font-bold text-slate-600 dark:text-slate-300">ngón {note.finger}</span> : null}
                </div>
                {nextNote && hints !== 'none' && <div className="text-xs text-slate-600 dark:text-slate-300">tiếp: {nextNote.name}</div>}
              </div>
            </div>
          );
        })}
      </div>
      <Feedback state={state} hands={hands} active={active} tempo={state.timing === 'tempo'} pendingCount={engine.pendingNotes().length} />
    </section>
  );
}

function StepDots({ count, index }: { count: number; index: number }) {
  return (
    <div className="flex max-w-40 flex-wrap justify-center gap-0.5" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`size-2 rounded-full ${i < index ? 'bg-emerald-500' : i === index ? 'bg-fuchsia-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
      ))}
    </div>
  );
}

/** Lời nhắc ngắn — cao cố định để khung không nhảy. */
function Feedback({ state, hands, active, tempo, pendingCount }: { state: EngineState; hands: Hand[]; active: boolean; tempo: boolean; pendingCount: number }) {
  let text = hands.length > 1 ? 'Hai tay cùng bấm nhé' : 'Bấm phím sáng màu';
  let tone = 'text-slate-600 dark:text-slate-300';
  if (state.status === 'ready') text = 'Sẵn sàng!';
  else if (!active) text = '';
  else if (state.lastOutcome === 'wrong' && state.lastHand) {
    text = `${HAND_TITLE[state.lastHand]}: thử phím ${state.fixMidi !== null ? noteLabel(state.fixMidi) : ''} đang sáng nhé`;
    tone = 'text-rose-700 dark:text-rose-300';
  } else if (state.lastOutcome === 'uncertain') {
    text = 'App nghe chưa rõ — bấm lại nhé (không tính lỗi)';
    tone = 'text-amber-700 dark:text-amber-300';
  } else if (tempo && state.lastTiming) {
    text = state.lastTiming === 'on-time' ? 'Đúng nhịp! 👏' : state.lastTiming === 'late' ? 'Hơi trễ một chút' : state.lastTiming === 'early' ? 'Hơi sớm một chút' : 'Theo nhịp nhé';
    tone = state.lastTiming === 'on-time' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300';
  } else if (state.lastOutcome === 'hit' && hands.length > 1 && pendingCount > 0) {
    text = `Còn ${HAND_TITLE[hands.find((h) => !state.handsDone.includes(h)) ?? 'left'].toLowerCase()}…`;
    tone = 'text-violet-700 dark:text-violet-300';
  } else if (state.lastOutcome === 'step' || state.lastOutcome === 'round') {
    text = 'Giỏi lắm! 🌟';
    tone = 'text-emerald-700 dark:text-emerald-300';
  }
  return (
    <p className={`h-12 w-48 overflow-hidden text-sm font-bold ${tone}`} aria-live="polite" data-testid="rainbow-feedback">
      {text}
    </p>
  );
}

function CenterOverlay({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-y-auto p-3 pb-28" data-testid={testId}>
      <section className="pointer-events-auto grid max-w-3xl justify-items-center gap-3 rounded-[2rem] bg-white/95 p-5 text-center shadow-2xl ring-2 ring-violet-300 dark:bg-slate-900/95">{children}</section>
    </div>
  );
}

function ReadyOverlay({
  settings,
  phase,
  hands,
  twoNoteBlocked,
  micOnly,
  onMode,
  onStart,
  onSettings,
  onStickers,
  onCancelRetry,
}: {
  settings: RainbowSettings;
  phase: RetryPhase | null;
  hands: Hand[];
  twoNoteBlocked: boolean;
  micOnly: boolean;
  onMode: (m: RainbowMode) => void;
  onStart: () => void;
  onSettings: () => void;
  onStickers: () => void;
  onCancelRetry?: () => void;
}) {
  const plan = resolvePlan(settings);
  return (
    <CenterOverlay testId="rainbow-ready">
      <div className="text-5xl" aria-hidden>
        🐻🌈🐰
      </div>
      <h2 className="text-3xl font-black">{phase ? phase.label : 'Cầu vồng hai bàn tay'}</h2>
      {!phase && (
        <>
          <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label="Chế độ">
            {(Object.keys(MODE_INFO) as RainbowMode[]).map((m) => (
              <Button key={m} variant={settings.mode === m ? 'primary' : 'secondary'} className="min-h-12 px-3 text-sm" onClick={() => onMode(m)} aria-pressed={settings.mode === m}>
                {MODE_INFO[m].icon} {MODE_INFO[m].label}
              </Button>
            ))}
          </div>
          <p className="max-w-xl text-sm">{MODE_INFO[settings.mode].hint}</p>
          <p className="text-sm font-semibold">
            {plan.hands === 'both' ? 'Hai tay' : HAND_TITLE[plan.hands]} · {PATH_LABEL[plan.path]} · {plan.rounds} vòng
            {plan.timing === 'tempo' ? ` · ♩=${plan.bpm}` : ' · không đồng hồ'}
          </p>
        </>
      )}
      <ul className="grid gap-1 text-left text-sm" data-testid="rainbow-placement">
        {hands.map((h) => (
          <li key={h} className={`rounded-xl px-3 py-1 ${HAND_CHAR[h].bg}`}>
            {HAND_CHAR[h].icon} {placementGuide(h, plan.starts[h], plan.motion)}
          </li>
        ))}
      </ul>
      {twoNoteBlocked && (
        <p className="max-w-xl rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" role="alert" data-testid="rainbow-mic-block">
          Micro chỉ nhận MỘT nốt mỗi lúc nên chưa chấm được hai tay. Hãy nối đàn MIDI, hoặc tắt micro để bấm bàn phím trên màn hình — hoặc chọn “Tập từng tay”.
        </p>
      )}
      {micOnly && !twoNoteBlocked && <p className="text-xs text-slate-600 dark:text-slate-300">Đang nghe bằng micro: chỉ chấm một tay. Lần app nghe chưa rõ không tính là lỗi của bé.</p>}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" className="min-h-14 text-lg" onClick={onStart} disabled={twoNoteBlocked} midiNav={twoNoteBlocked ? undefined : 'forward'} data-testid="rainbow-start">
          ▶ Bắt đầu
        </Button>
        {twoNoteBlocked && <Button onClick={() => onMode('single')}>✋ Tập từng tay</Button>}
        <Button onClick={onSettings}>⚙ Phụ huynh</Button>
        <Button onClick={onStickers} data-testid="rainbow-open-stickers">
          📒 Sổ sticker
        </Button>
        {onCancelRetry && (
          <Button variant="ghost" onClick={onCancelRetry}>
            Bỏ qua, về bài chính
          </Button>
        )}
      </div>
    </CenterOverlay>
  );
}

function PausedOverlay({ reason, startedWith, onResume, onExit }: { reason: EngineState['pauseReason']; startedWith: 'midi' | 'mic' | 'other'; onResume: () => void; onExit: () => void }) {
  return (
    <CenterOverlay testId="rainbow-paused">
      <h2 className="text-3xl font-black">{reason === 'input-lost' ? '🔌 Mất kết nối' : '⏸ Đang tạm dừng'}</h2>
      {reason === 'input-lost' ? (
        <div className="grid max-w-xl gap-2 text-sm">
          <p>
            {startedWith === 'midi'
              ? 'Đàn MIDI vừa ngắt. Kiểm tra dây cáp và bật lại đàn — app tự nhận lại đàn.'
              : 'Micro đã tắt (hoặc quyền dùng micro bị thu hồi). Bấm nút micro bên dưới để bật lại; trình duyệt hỏi quyền thì chọn Cho phép.'}
          </p>
          <p className="font-semibold">Đây không phải lỗi của bé — app không chấm trong lúc mất kết nối, phần đánh dở của bước sẽ đánh lại.</p>
          <div className="justify-self-center">
            <InputSourceBar />
          </div>
        </div>
      ) : (
        <p className="text-sm">Không có nốt nào được tính trong lúc dừng.</p>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onResume} midiNav="forward" data-testid="rainbow-resume">
          ▶ Tiếp tục
        </Button>
        <Button variant="ghost" onClick={onExit}>
          Thoát
        </Button>
      </div>
    </CenterOverlay>
  );
}

function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="rounded-2xl bg-violet-50 p-2 dark:bg-slate-700" data-testid={testId}>
      <dt className="text-xs text-slate-500 dark:text-slate-300">{label}</dt>
      <dd className="text-lg font-black">{value}</dd>
    </div>
  );
}

function ResultOverlay({
  result,
  state,
  hands,
  timing,
  retry,
  weakDismissed,
  onDismissWeak,
  onRetry,
  onNextPhase,
  onMore,
  onAgain,
  onTempo,
  onStickers,
  onRest,
}: {
  result: RunResult;
  state: EngineState;
  hands: Hand[];
  timing: 'wait' | 'tempo';
  retry: Retry | null;
  weakDismissed: boolean;
  onDismissWeak: () => void;
  onRetry: (w: WeakSegment) => void;
  onNextPhase: () => void;
  onMore: () => void;
  onAgain: () => void;
  onTempo: (bpm: number) => void;
  onStickers: () => void;
  onRest: () => void;
}) {
  const { summary, rounds } = result;
  const complete = rounds.filter((r) => r.complete).length;
  const passed = rounds.filter((r) => r.passed).length;
  const uncertain = hands.reduce((s, h) => s + (summary.hands[h]?.uncertain ?? 0), 0);
  const sync = summary.sync;
  const lastPhase = retry ? retry.index + 1 >= retry.phases.length : true;
  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/50 p-3" data-testid="rainbow-result">
      <section className="grid w-full max-w-3xl justify-items-center gap-3 rounded-[2rem] bg-white p-5 text-center shadow-2xl dark:bg-slate-800">
        <div className="text-5xl">{complete > 0 ? '🌈🏠' : '🌧️'}</div>
        <h2 className="text-3xl font-black">{retry ? 'Xong chặng tập lại!' : complete >= rounds.length ? 'Nhiệm vụ hoàn thành!' : 'Hết lượt chơi'}</h2>
        <p className="text-lg font-semibold" data-testid="rainbow-feedback-text">
          {result.feedback}
        </p>
        <dl className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Vòng đã chơi hết" value={`${complete}/${rounds.length}`} testId="rainbow-stat-complete" />
          <Stat label="Vòng đạt tiêu chí" value={passed} testId="rainbow-stat-passed" />
          {hands.map((h) => (
            <Stat key={h} label={`${HAND_TITLE[h]} chính xác`} value={pct(summary.hands[h]?.accuracy)} testId={`rainbow-stat-acc-${h}`} />
          ))}
          {sync && (
            <Stat
              label={timing === 'tempo' ? 'Hai tay cùng lúc' : 'Đủ hai nốt · cùng lúc'}
              value={`${sync.complete} · ${sync.together} (${pct(sync.complete ? sync.together / sync.complete : null)})`}
              testId="rainbow-stat-sync"
            />
          )}
          {timing === 'tempo' &&
            hands.map((h) => {
              const s = summary.hands[h];
              return <Stat key={`t-${h}`} label={`${HAND_TITLE[h]}: đúng nhịp · trễ/sớm · thiếu`} value={s ? `${s.onTime} · ${s.late + s.early} · ${s.missed}` : '—'} />;
            })}
        </dl>
        {uncertain > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">App nghe chưa rõ {uncertain} lần — không tính là lỗi của bé.</p>}
        {result.stickers.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2" data-testid="rainbow-stickers-earned">
            {result.stickers.map((k) => (
              <span key={k} className="rounded-2xl bg-amber-50 px-3 py-2 font-bold ring-2 ring-amber-300 dark:bg-amber-950/40">
                {STICKERS[k].icon} {STICKERS[k].label}
              </span>
            ))}
          </div>
        )}
        {result.tempoAdvice && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40" data-testid="rainbow-tempo-advice">
            <span>Bé đã đạt tiêu chí nhiều vòng liền ở nhịp này. Phụ huynh có muốn thử ♩={result.tempoAdvice}?</span>
            <Button onClick={() => onTempo(result.tempoAdvice!)}>Thử ♩={result.tempoAdvice}</Button>
          </div>
        )}
        {!retry && result.weak && !weakDismissed && (
          <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/40" data-testid="rainbow-weak">
            <span>
              Gợi ý: tập lại đoạn <b>{result.weak.label}</b> của {HAND_LABEL[result.weak.hand]}
              {hands.length > 1 ? ' — tay đó tập riêng trước, rồi ghép hai tay.' : '.'}
            </span>
            <Button variant="primary" onClick={() => onRetry(result.weak!)} data-testid="rainbow-retry">
              🔁 Tập lại đoạn này
            </Button>
            <Button variant="ghost" onClick={onDismissWeak}>
              Bỏ qua
            </Button>
          </div>
        )}
        <p className="font-bold text-violet-700 dark:text-violet-300">☕ Nghỉ tay một chút nhé — hoặc chơi tiếp nếu bé muốn.</p>
        <div className="flex flex-wrap justify-center gap-2">
          {retry ? (
            <Button variant="primary" onClick={onNextPhase} midiNav="forward" data-testid="rainbow-next-phase">
              {lastPhase ? '↩ Về bài chính' : `▶ ${retry.phases[retry.index + 1].label}`}
            </Button>
          ) : (
            <Button variant="primary" onClick={onMore} data-testid="rainbow-more">
              ➕ Chơi thêm 1 vòng
            </Button>
          )}
          <Button onClick={onAgain} data-testid="rainbow-again">
            ↻ Nhiệm vụ mới
          </Button>
          <Button onClick={onStickers}>📒 Sổ sticker</Button>
          <Button variant="ghost" onClick={onRest} midiNav="back" data-testid="rainbow-rest">
            ☕ Nghỉ thôi
          </Button>
        </div>
        <p className="text-xs text-slate-500">Vòng {state.roundsEnded} đã chơi · dữ liệu chỉ là phím được bấm — app không biết bé dùng ngón nào.</p>
      </section>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4" role="dialog" aria-label={title}>
      <section className="mx-auto grid max-w-3xl gap-4 rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-800">
        <header className="flex items-center gap-3">
          <h2 className="flex-1 text-2xl font-black">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng" data-testid="rainbow-close-modal">
            <Icon name="close" />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-40 font-semibold">{label}</span>
      {children}
    </div>
  );
}

function SettingsModal({ settings, micOnly, onChange, onClose }: { settings: RainbowSettings; micOnly: boolean; onChange: (p: Partial<RainbowSettings>) => void; onClose: () => void }) {
  const plan = resolvePlan(settings);
  const hands = handsOf(plan.hands);
  return (
    <ModalShell title="⚙ Phần phụ huynh" onClose={onClose}>
      <PinShortcutButton variant="row" target={{ type: 'game', id: 'rainbow-hands' }} />
      <p className="text-sm text-slate-600 dark:text-slate-300">Đổi chế độ, tay, vùng phím, số vòng hoặc nhịp sẽ bắt đầu ván mới. Gợi ý, số ngón, âm lượng giữ nguyên ván.</p>
      <Row label="Chế độ">
        <Segmented value={settings.mode} onChange={(mode: RainbowMode) => onChange({ mode })} options={(Object.keys(MODE_INFO) as RainbowMode[]).map((m) => ({ value: m, label: MODE_INFO[m].label }))} />
      </Row>
      {settings.mode === 'single' && (
        <Row label="Tay luyện">
          <Segmented value={settings.hand} onChange={(hand: Hand) => onChange({ hand })} options={[{ value: 'left', label: '🐻 Tay trái' }, { value: 'right', label: '🐰 Tay phải' }]} />
        </Row>
      )}
      {settings.mode === 'tempo' && (
        <Row label="Tay luyện">
          <Segmented value={settings.tempoHands} onChange={(tempoHands: HandSet) => onChange({ tempoHands })} options={[{ value: 'both', label: 'Hai tay' }, { value: 'left', label: 'Tay trái' }, { value: 'right', label: 'Tay phải' }]} />
        </Row>
      )}
      {(settings.mode === 'single' || settings.mode === 'steps' || settings.mode === 'contrary') && (
        <Row label="Đường đi">
          <Segmented value={settings.path} onChange={(path: RainbowPath) => onChange({ path })} options={(['up', 'down', 'round'] as const).map((p) => ({ value: p, label: PATH_LABEL[p] }))} />
        </Row>
      )}
      {(['left', 'right'] as const).map((h) => (
        <Row key={h} label={`Đô bắt đầu ${HAND_TITLE[h].toLowerCase()}`}>
          <Segmented
            value={String(settings.starts[h])}
            onChange={(v) => onChange({ starts: { ...settings.starts, [h]: Number(v) } })}
            options={START_CHOICES[h].map((m) => ({ value: String(m), label: `${noteLabel(m)}${m === 60 ? ' (Đô giữa)' : ''}` }))}
          />
        </Row>
      ))}
      <ul className="-mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
        {hands.map((h) => (
          <li key={h}>{placementGuide(h, plan.starts[h], plan.motion)}</li>
        ))}
        {plan.motion === 'contrary' && plan.starts.left !== settings.starts.left && (
          <li className="font-semibold text-violet-700 dark:text-violet-300" data-testid="rainbow-contrary-shift">
            Ngược chiều: tay trái tự lùi xuống vùng {noteLabel(plan.starts.left)}–{noteLabel(plan.starts.left + 12)} để hai tay không cùng bấm một phím ở bước đầu (như bài mẫu).
          </li>
        )}
      </ul>
      <Row label="Số vòng của nhiệm vụ">
        <Segmented value={String(settings.rounds)} onChange={(v) => onChange({ rounds: Number(v) as RainbowSettings['rounds'] })} options={ROUND_CHOICES.map((n) => ({ value: String(n), label: `${n} vòng` }))} />
      </Row>
      {plan.hands === 'both' && (
        <Row label="Ngưỡng “cùng lúc”">
          <Segmented
            value={String(settings.syncToleranceMs)}
            onChange={(v) => onChange({ syncToleranceMs: Number(v) })}
            options={SYNC_CHOICES.map((ms) => ({ value: String(ms), label: `${ms === 400 ? 'Dễ' : ms === 250 ? 'Vừa' : 'Chặt'} (${(ms / 1000).toLocaleString('vi-VN')} s)` }))}
          />
        </Row>
      )}
      {plan.hands === 'both' && micOnly && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Micro chỉ nhận một nốt mỗi lúc — chế độ hai tay cần đàn MIDI hoặc bàn phím trên màn hình.</p>}
      {settings.mode === 'tempo' && (
        <>
          <Row label="Tốc độ (phụ huynh chọn)">
            <Segmented value={String(settings.bpm)} onChange={(v) => onChange({ bpm: Number(v) })} options={BPM_CHOICES.map((b) => ({ value: String(b), label: `♩=${b}` }))} />
          </Row>
          <Row label="Vòng đạt khi đúng nhịp ≥">
            <Segmented value={String(settings.passOnTime)} onChange={(v) => onChange({ passOnTime: Number(v) })} options={ON_TIME_CHOICES.map((x) => ({ value: String(x), label: pct(x) }))} />
          </Row>
          <p className="-mt-2 text-xs text-slate-500">App chỉ gợi ý tăng tốc khi 3 vòng liền ở nhịp này đều đạt tiêu chí. Bật “Tập chậm” → nhịp × {SLOW_FACTOR}.</p>
        </>
      )}
      <Row label="Vòng đạt khi mỗi tay đúng ≥">
        <Segmented value={String(settings.passAccuracy)} onChange={(v) => onChange({ passAccuracy: Number(v) })} options={PASS_CHOICES.map((x) => ({ value: String(x), label: pct(x) }))} />
      </Row>
      <Row label="Mức gợi ý">
        <Segmented
          value={settings.hints}
          onChange={(hints: RainbowSettings['hints']) => onChange({ hints })}
          options={[
            { value: 'full', label: 'Đầy đủ' },
            { value: 'light', label: 'Vừa' },
            { value: 'none', label: 'Ít' },
          ]}
        />
      </Row>
      <p className="-mt-2 text-xs text-slate-500">Đầy đủ: tô phím + tên nốt + số ngón · Vừa: tô nhạt, không tên trên phím · Ít: chỉ tô phím cần sửa sau khi sai.</p>
      <Toggle checked={settings.fingers} onChange={(fingers) => onChange({ fingers })} label={`Hiện số ngón theo mẫu bài “${FINGERING_SOURCE[plan.motion].title}” (${FINGERING_SOURCE[plan.motion].id})`} />
      <Row label="Âm lượng hiệu ứng">
        <Segmented
          value={settings.volume}
          onChange={(volume: RainbowSettings['volume']) => onChange({ volume })}
          options={[
            { value: 'off', label: 'Tắt' },
            { value: 'low', label: 'Nhỏ' },
            { value: 'mid', label: 'Vừa' },
          ]}
        />
      </Row>
      <p className="-mt-2 text-xs text-slate-500">Hiệu ứng chỉ kêu khi xong vòng và luôn tắt khi nghe bằng micro (không che tiếng đàn, không làm nhận nhầm nốt).</p>
      <Row label="Nguồn nốt">
        <InputSourceBar />
      </Row>
      <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        App chỉ biết phím nào được bấm (và lúc nào). App không nhận biết ngón tay, tư thế hay bàn tay thật. Chỉ lưu số liệu tóm tắt vào hồ sơ trên máy này, không ghi âm.
      </p>
    </ModalShell>
  );
}

function StickerModal({ progress, profileName, onClose }: { progress: RainbowProgress; profileName: string | null; onClose: () => void }) {
  const counts = new Map<StickerKind, number>();
  for (const s of progress.stickers) counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
  const recent = progress.sessions.slice(-6).reverse();
  return (
    <ModalShell title={`📒 Sổ sticker${profileName ? ` — ${profileName}` : ''}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rainbow-sticker-book">
        {(Object.keys(STICKERS) as StickerKind[]).map((k) => {
          const n = counts.get(k) ?? 0;
          return (
            <div key={k} className={`grid justify-items-center rounded-2xl p-3 ring-2 ${n ? 'bg-amber-50 ring-amber-300 dark:bg-amber-950/30' : 'bg-slate-100 opacity-60 ring-slate-300 grayscale dark:bg-slate-700'}`}>
              <span className="text-4xl">{STICKERS[k].icon}</span>
              <strong className="text-sm">{STICKERS[k].label}</strong>
              <span className="text-xs">{n ? `× ${n}` : STICKERS[k].why}</span>
            </div>
          );
        })}
      </div>
      <p className="text-center text-lg font-bold" data-testid="rainbow-animals-total">
        🏠 Đã đưa {progress.animalsHome} bạn thú về nhà
      </p>
      <div>
        <h3 className="font-bold">Các lần chơi gần đây</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có — cùng đi qua cầu vồng nào!</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {recent.map((s) => (
              <li key={s.at} className="rounded-xl bg-slate-50 px-3 py-1 dark:bg-slate-700">
                {new Date(s.at).toLocaleDateString('vi-VN')} · {s.mode === 'retry' ? 'Tập lại đoạn' : MODE_INFO[s.mode].label} · chơi hết {s.roundsComplete}/{s.roundsTarget} · đạt {s.roundsPassed}
                {Object.entries(s.accuracy).map(([h, a]) => ` · ${HAND_LABEL[h as Hand]} ${pct(a)}`)}
                {s.together !== null ? ` · cùng lúc ${pct(s.together)}` : ''}
                {s.weak ? ` · nên tập: ${s.weak}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-slate-500">Sticker không bao giờ bị trừ khi chơi sai. Không có bảng xếp hạng.</p>
    </ModalShell>
  );
}

