import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { PinShortcutButton } from '../components/shortcuts/PinShortcutButton';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { VoiceBar } from '../components/VoiceBar';
import { InputSourceBar } from '../components/curriculum/common';
import { AdventureActivity, DurationActivity, FreePlayActivity, GardenActivity, IntroActivity, RocketActivity, SummaryView } from '../components/soundExplore/activities';
import { playChime } from '../components/soundExplore/missions';
import { ParentPanel, type LatencyStats } from '../components/soundExplore/ParentPanel';
import { ExploreContext, sayCue, type ExploreApi, type ExploreNoteEvent } from '../components/soundExplore/shared';
import '../components/soundExplore/soundExplore.css';
import { Button, FullscreenButton, Icon } from '../components/ui';
import { soundOutput } from '../core/audio/SoundOutput';
import { Emitter } from '../core/input/NoteInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import { micOnlyInput } from '../core/input/sourceFilter';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { recommend } from '../core/soundExplore/assessment';
import { KEYBOARD_FROM, KEYBOARD_TO } from '../core/soundExplore/config';
import { ACTIVITY_ICON, SOUND_EXPLORE_LESSON } from '../core/soundExplore/lesson';
import { PressTracker } from '../core/soundExplore/PressTracker';
import { addSession, addStar, assistanceLevel, markVisited, recordAttempt, recordReplay, type ActivityId, type AttemptInput, type SoundExploreProgress } from '../core/soundExplore/progress';
import { loadExploreProgress, saveExploreProgress } from '../core/soundExplore/storage';
import { voiceTeacher } from '../core/voice/teacher';
import { useNoteInput } from '../hooks/useNoteInput';
import { useVoiceActive, useVoiceScope } from '../hooks/useVoiceTeacher';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { usePlayingNow } from '../store/playingStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type View = 'home' | ActivityId | 'summary' | 'parent';

/** Bỏ nốt micro chừng này sau khi thả phím ảo (micro nghe tiếng loa của phím ảo). */
const VIRTUAL_ECHO_MS = 500;
/** Giữ nút Phụ huynh chừng này mới mở (bé bấm nhầm không vào được). */
const PARENT_HOLD_MS = 1200;

const reducedMotionMedia = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

/**
 * Bài "Khám phá âm thanh — Cao độ và Trường độ" (giáo trình "Làm quen từng nốt", phần nhập môn, bé 4–6 tuổi).
 * Route `sound-explore` (`?screen=sound-explore`). Xem docs/sound-explore.md.
 */
export function SoundExploreScreen() {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const profileId = profile?.id ?? null;
  const inputSource = useSettings((s) => s.settings.inputSource);
  const micRunning = useMic((s) => s.status === 'running');
  const midiDevices = useMidi((s) => (s.status === 'ready' ? s.devices.length : 0));
  const micOnly = micOnlyInput(inputSource, micRunning, midiDevices > 0);
  const voiceActive = useVoiceActive('kids');
  const autoRead = useSettings((s) => s.settings.voiceAutoRead);
  const encourage = useSettings((s) => s.settings.voiceEncourage);
  useVoiceScope();

  // ─── Tiến độ theo hồ sơ ───
  const [progress, setProgress] = useState<SoundExploreProgress>(() => loadExploreProgress(profileId));
  const progressRef = useRef(progress);
  const profileRef = useRef(profileId);
  useEffect(() => {
    if (profileRef.current === profileId) return;
    profileRef.current = profileId;
    const p = loadExploreProgress(profileId);
    progressRef.current = p;
    setProgress(p);
  }, [profileId]);
  const update = useCallback((fn: (p: SoundExploreProgress, now: number) => SoundExploreProgress) => {
    const next = fn(progressRef.current, Date.now());
    if (next === progressRef.current) return;
    progressRef.current = next;
    setProgress(next);
    saveExploreProgress(profileRef.current, next);
  }, []);
  const settings = progress.settings;
  const reducedMotion = settings.reducedMotion || reducedMotionMedia();

  // ─── Màn đang mở + phiên hoạt động ───
  const [view, setView] = useState<View>('home');
  const session = useRef<{ activity: ActivityId; startedAt: number; helps: number; stars: number; input: AttemptInput } | null>(null);
  const closeSession = useCallback(() => {
    const s = session.current;
    if (!s) return;
    session.current = null;
    const endedAt = Date.now();
    update((p) =>
      addSession(p, {
        sessionId: `${s.startedAt.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        learnerId: profileRef.current ?? 'guest',
        activityId: s.activity,
        startedAt: s.startedAt,
        endedAt,
        inputMode: s.input,
        completed: p.stars[s.activity] > s.stars,
        assistanceLevel: assistanceLevel(s.helps),
      }),
    );
  }, [update]);
  const open = useCallback(
    (v: View) => {
      closeSession();
      voiceTeacher.cancelAll();
      if (v !== 'home' && v !== 'summary' && v !== 'parent') {
        session.current = { activity: v, startedAt: Date.now(), helps: 0, stars: progressRef.current.stars[v], input: 'touch' };
        update((p, now) => markVisited(p, v, now));
      }
      setView(v);
    },
    [closeSession, update],
  );
  useEffect(() => () => closeSession(), [closeSession]);
  const inActivity = view !== 'home' && view !== 'summary' && view !== 'parent';
  // Đang làm hoạt động: ẩn các nút nổi (micro…) như mọi màn đang chơi đàn.
  usePlayingNow(inActivity);

  // ─── Nguồn nốt: micro + MIDI + bàn phím ảo → PressTracker → sự kiện cho hoạt động ───
  const tracker = useMemo(() => new PressTracker(), []);
  const emitter = useMemo(() => new Emitter<ExploreNoteEvent>(), []);
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());
  const [micKey, setMicKey] = useState<number | null>(null);
  const [keyHint, setKeyHint] = useState<ReadonlySet<number> | null>(null);
  const lastInput = useRef<AttemptInput>('touch');
  const virtualEchoUntil = useRef(0);
  const latencySamples = useRef<{ source: string; ms: number }[]>([]);
  const syncHeld = () => setHeld(new Set(tracker.heldKeys().map((k) => k.midi)));
  // Kiểm tra độ trễ: từ mốc sự kiện tới khung hình kế tiếp (lúc hoạt hình phản ứng). Giữ 60 mẫu gần nhất.
  const sampleLatency = (source: string, eventTime: number) =>
    requestAnimationFrame(() => {
      const list = latencySamples.current;
      list.push({ source, ms: Math.max(0, performance.now() - eventTime) });
      if (list.length > 60) list.splice(0, list.length - 60);
    });

  useNoteInput(
    {
      onNote: (e) => {
        // Mốc đo thời gian giữ phím: lúc app NHẬN sự kiện (mốc Web MIDI do driver gắn có thể lệch — docs/midi.md).
        const now = performance.now();
        sampleLatency(e.source, e.time);
        if (e.source === 'microphone') {
          if (now < virtualEchoUntil.current || tracker.heldKeys().some((k) => k.source === 'virtual')) return;
          lastInput.current = 'microphone';
          if (session.current) session.current.input = 'microphone';
          setMicKey(e.midi);
          window.setTimeout(() => setMicKey((m) => (m === e.midi ? null : m)), 350);
          emitter.emit({ kind: 'mic', midi: e.midi, time: now });
          return;
        }
        const out = tracker.handle({ noteNumber: e.midi, eventType: 'noteOn', velocity: e.velocity ?? 80, timestamp: now, sourceDevice: e.source });
        if (out?.kind !== 'start') return;
        lastInput.current = e.source;
        if (session.current) session.current.input = e.source;
        if (e.source === 'virtual') soundOutput.liveNoteOn(e.midi, 80);
        syncHeld();
        emitter.emit(out);
      },
      onNoteOff: (e) => {
        const out = tracker.handle({ noteNumber: e.midi, eventType: 'noteOff', timestamp: performance.now(), sourceDevice: e.source });
        if (out?.kind !== 'end') return;
        if (out.press.source === 'virtual') {
          soundOutput.liveNoteOff(e.midi);
          virtualEchoUntil.current = performance.now() + VIRTUAL_ECHO_MS;
        }
        syncHeld();
        emitter.emit(out);
      },
    },
    inputSource,
    { baseMidi: 60, listening: inActivity },
  );

  // Pedal vang: chỉ ghi trạng thái, không kéo dài thời gian giữ phím.
  useEffect(() => midiInput.onPedal((e) => tracker.handle({ noteNumber: 64, eventType: e.down ? 'pedalDown' : 'pedalUp', timestamp: performance.now(), sourceDevice: 'midi' })), [tracker]);

  // Đổi hoạt động / rút đàn / rời màn → thả mọi phím (lần nhấn dở dang không chấm), tắt tiếng phím ảo.
  const releaseAll = useCallback(() => {
    for (const press of tracker.releaseAll(performance.now())) emitter.emit({ kind: 'end', press });
    soundOutput.liveAllOff();
    setHeld(new Set());
  }, [tracker, emitter]);
  useEffect(() => releaseAll, [view, releaseAll]);
  const prevDevices = useRef(midiDevices);
  useEffect(() => {
    if (midiDevices < prevDevices.current) releaseAll();
    prevDevices.current = midiDevices;
  }, [midiDevices, releaseAll]);
  // App vào nền → thả phím (không nhận được Note Off khi ẩn).
  useEffect(() => {
    const onHide = () => document.hidden && releaseAll();
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [releaseAll]);

  // ─── API cho các hoạt động ───
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const voiceRef = useRef({ voiceActive, autoRead, encourage });
  voiceRef.current = { voiceActive, autoRead, encourage };
  const api = useMemo<ExploreApi>(() => {
    const speak = (cue: ReturnType<typeof sayCue>, kind: 'instruction' | 'praise') => {
      const v = voiceRef.current;
      if (!v.voiceActive || !(kind === 'instruction' ? v.autoRead : v.encourage)) return;
      voiceTeacher.say(cue);
    };
    return {
      settings,
      progress,
      update,
      micOnly,
      reducedMotion,
      attempt: (skill, success, firstTry, input) => update((p, now) => recordAttempt(p, { skill, success, firstTry, input: input ?? lastInput.current, at: now })),
      replayed: (skill) => {
        if (session.current) session.current.helps++;
        update((p, now) => recordReplay(p, skill, now));
      },
      star: (activity) => update((p, now) => addStar(p, activity, now)),
      say: (keys, kind = 'instruction') => speak(sayCue(keys, kind), kind),
      sayText: (text, kind = 'instruction') => speak({ id: `se-text-${text.length}`, trigger: kind === 'praise' ? 'note_correct' : 'step_start', instructionText: text }, kind),
      subscribe: (l) => emitter.on(l),
      lastInput: () => lastInput.current,
      chime: () => {
        const s = settingsRef.current;
        if (s.effectSounds && tracker.heldKeys().length === 0) playChime(s.effectVolume);
      },
      heldCount: () => tracker.heldKeys().length,
      setKeyHint,
    };
  }, [settings, progress, update, micOnly, reducedMotion, emitter, tracker]);

  const latency = (): LatencyStats[] => {
    const by = new Map<string, number[]>();
    for (const s of latencySamples.current) by.set(s.source, [...(by.get(s.source) ?? []), s.ms]);
    const NAME: Record<string, string> = { midi: 'Đàn MIDI', virtual: 'Bàn phím trên màn hình', microphone: 'Micro' };
    return [...by].map(([source, ms]) => ({ source: NAME[source] ?? source, samples: ms.length, avgMs: Math.round(ms.reduce((a, b) => a + b, 0) / ms.length), maxMs: Math.round(Math.max(...ms)) }));
  };

  const unlock = () => {
    soundOutput.unlock();
    voiceTeacher.unlock();
  };
  const home = () => open('home');
  const firstRec = recommend(progress, 0).find((r) => !r.parentApprovalRequired)?.suggestedActivity;
  useEffect(() => {
    if (view === 'home') api.say('home');
  }, [view]);

  const activity = (
    <>
      {view === 'intro' && <IntroActivity onDone={home} />}
      {view === 'rocket' && <RocketActivity />}
      {view === 'duration' && <DurationActivity />}
      {view === 'garden' && <GardenActivity />}
      {view === 'free' && <FreePlayActivity />}
      {view === 'adventure' && <AdventureActivity onFinish={() => open('summary')} />}
    </>
  );

  return (
    <ExploreContext.Provider value={api}>
      <div className="flex h-full flex-col overflow-hidden" data-testid="sound-explore" data-view={view} data-level={settings.level} onPointerDownCapture={unlock}>
        <header className="flex flex-wrap items-center gap-2 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-2">
          <Button
            variant="ghost"
            className="px-2"
            aria-label={view === 'home' ? 'Về giáo trình Làm quen từng nốt' : 'Về trang chọn trò'}
            onClick={() => (view === 'home' ? navigate({ name: 'supplement' }) : home())}
            midiNav="back"
            data-testid="se-back"
          >
            <Icon name="back" />
          </Button>
          <h1 className="text-lg font-extrabold sm:text-xl" data-testid="se-title">
            {view === 'home' || view === 'parent' || view === 'summary' ? '🎵 Khám phá âm thanh' : `${ACTIVITY_ICON[view]} ${SOUND_EXPLORE_LESSON.activities.find((a) => a.id === view)?.title}`}
          </h1>
          <div className="min-w-0 flex-1">
            <VoiceBar mode="kids" />
          </div>
          {view !== 'parent' && <InputSourceBar />}
          <ParentGate onOpen={() => open('parent')} />
          {/* Chọn / tạo hồ sơ là việc của phụ huynh → chỉ ở góc phụ huynh (màn của bé gọn, không chữ). */}
          {view === 'parent' && <ProfileSwitcher />}
          {/* Ghim cạnh nút toàn màn hình như các màn khác; ẩn trong lúc bé đang chơi một hoạt động. */}
          {!inActivity && <PinShortcutButton target={{ type: 'page', id: 'sound-explore' }} />}
          <FullscreenButton />
        </header>

        <main className={`flex min-h-0 flex-1 gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${settings.flipLayout ? 'flex-col-reverse' : 'flex-col'}`}>
          {view === 'parent' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ParentPanel onClose={home} onOpenActivity={(a) => open(a)} latency={latency} />
            </div>
          ) : view === 'home' ? (
            <HomeGrid progress={progress} recommended={firstRec} onOpen={open} />
          ) : view === 'summary' ? (
            <SummaryView onHome={home} />
          ) : (
            <>
              <div className="min-h-0 flex-1">{activity}</div>
              <div className="h-36 shrink-0 sm:h-40" data-testid="se-keyboard">
                <PianoKeyboard
                  from={KEYBOARD_FROM}
                  to={KEYBOARD_TO}
                  expected={null}
                  detected={micKey}
                  flash={null}
                  labelStyle="solfege"
                  labelFor={() => ''}
                  highlighted={held}
                  expectedExtra={keyHint ?? undefined}
                  onPress={(m) => virtualInput.press(m)}
                  onRelease={(m) => virtualInput.release(m)}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </ExploreContext.Provider>
  );
}

function HomeGrid({ progress, recommended, onOpen }: { progress: SoundExploreProgress; recommended?: ActivityId; onOpen: (v: View) => void }) {
  const colors: Record<ActivityId, string> = {
    intro: 'from-sky-400 to-cyan-300',
    rocket: 'from-indigo-500 to-sky-400',
    duration: 'from-pink-400 to-amber-300',
    garden: 'from-emerald-500 to-lime-300',
    free: 'from-fuchsia-500 to-violet-400',
    adventure: 'from-amber-500 to-orange-400',
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label="Hoạt động">
        {SOUND_EXPLORE_LESSON.activities.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onOpen(a.id)}
              aria-label={a.title}
              data-testid={`se-open-${a.id}`}
              className={`relative grid min-h-40 w-full content-center justify-items-center gap-2 rounded-3xl bg-gradient-to-br p-4 text-white shadow-lg transition-transform active:scale-95 ${colors[a.id]} ${recommended === a.id ? 'ring-8 ring-yellow-300' : ''}`}
            >
              <span className="absolute top-2 left-3 grid h-9 w-9 place-items-center rounded-full bg-white/30 text-lg font-black" aria-hidden>
                {String.fromCharCode(65 + i)}
              </span>
              <span className="text-7xl drop-shadow" aria-hidden>
                {a.icon}
              </span>
              <span className="text-base font-bold">{a.title}</span>
              <span className="rounded-full bg-white/25 px-3 text-sm font-semibold" aria-hidden>
                {progress.visited[a.id] ? `⭐ ${progress.stars[a.id]}` : '✨ Mới'}
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={() => onOpen('summary')}
            aria-label="Tổng kết"
            data-testid="se-open-summary"
            className="grid min-h-40 w-full content-center justify-items-center gap-2 rounded-3xl bg-gradient-to-br from-yellow-300 to-amber-200 p-4 text-amber-900 shadow-lg transition-transform active:scale-95"
          >
            <span className="text-7xl" aria-hidden>
              🏆
            </span>
            <span className="text-base font-bold">Tổng kết</span>
          </button>
        </li>
      </ol>
    </div>
  );
}

/** Nút Phụ huynh: giữ 1,2 giây mới mở (bé bấm lướt không vào được). */
function ParentGate({ onOpen }: { onOpen: () => void }) {
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => cancel, []);
  return (
    <button
      type="button"
      className={`relative min-h-12 overflow-hidden rounded-xl bg-white px-3 text-sm font-semibold text-violet-800 ring-1 ring-violet-200 dark:bg-slate-800 dark:text-violet-200 dark:ring-violet-800`}
      onPointerDown={() => {
        setHolding(true);
        timer.current = window.setTimeout(() => {
          cancel();
          onOpen();
        }, PARENT_HOLD_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => {
        // Bàn phím: Enter / Space mở luôn (phụ huynh dùng máy tính).
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label="Góc phụ huynh (giữ để mở)"
      title="Giữ để mở góc phụ huynh"
      data-testid="se-parent-open"
    >
      <span className="absolute inset-y-0 left-0 bg-violet-200/70 dark:bg-violet-700/60" style={{ width: holding ? '100%' : '0%', transition: holding ? `width ${PARENT_HOLD_MS}ms linear` : 'none' }} aria-hidden />
      <span className="relative">👪 Phụ huynh</span>
    </button>
  );
}
