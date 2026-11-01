import { useEffect, useMemo, useRef, useState } from 'react';
import { F1Canvas } from '../components/f1Racing/F1Canvas';
import { drawF1Car } from '../components/f1Racing/carArt';
import { InputSourceBar } from '../components/curriculum/common';
import { useStaffCards } from '../components/games/StaffShootView';
import { useGameState, useKeyFlash } from '../components/games/shared';
import { MicButton } from '../components/MicPanel';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { Button, FullscreenButton, Icon, Segmented, Toggle } from '../components/ui';
import { soundOutput } from '../core/audio/SoundOutput';
import { F1Audio } from '../core/f1Racing/audio';
import { CARS, DIFFICULTIES, DIFFICULTY_ORDER, STREAK_FOR_ASSIST, findCar, keyboardSpan, practiceNotes, resolveNavKeys, type CarDef, type F1Difficulty } from '../core/f1Racing/config';
import { F1RacingGame, f1Accuracy, type F1State } from '../core/f1Racing/F1RacingGame';
import { f1Leaderboard, formatRaceTime, loadF1Progress, loadF1Settings, recordF1Run, saveF1Settings, trophyFor, TROPHY_INFO, TROPHY_ORDER, type F1Progress, type F1Run, type F1Settings } from '../core/f1Racing/storage';
import { midiInput } from '../core/input/MIDIInputProvider';
import { micOnlyInput } from '../core/input/sourceFilter';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { midiToLabel, midiToName } from '../core/music/notes';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { usePlayingNow } from '../store/playingStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type Modal = 'settings' | 'trophies' | 'leaderboard' | null;
interface Finished {
  run: F1Run;
  isRecord: boolean;
  personalBest: F1Run;
  rank: number;
  rankOf: number;
}

/** Chờ chừng này sau vạch đích rồi mới hiện kết quả, để thấy xe chạy qua vạch. */
const RESULT_DELAY_MS = 1100;
/** Nốt đúng tô xanh thoáng qua (đã sang nốt mới); nốt sai vẫn là nốt cần đánh nên giữ đỏ lâu hơn. */
const NOTE_FLASH_MS = { hit: 250, wrong: 500 } as const;
/** Các nốt có thể chọn làm phím điều hướng. */
const NAV_CHOICES = Array.from({ length: 49 }, (_, i) => 36 + i);

/**
 * VietPiano F1 Racing. Một màn duy nhất theo quy ước trò chơi của VietPiano: "gara" chọn xe, độ khó và hồ sơ là
 * lớp phủ Sẵn sàng của màn chơi, cài đặt mở đè lên màn chơi (mở giữa ván thì tạm dừng).
 * Logic ở `core/f1Racing`; vẽ ở `components/f1Racing`; nốt từ `useNoteInput` (đàn MIDI, piano ảo, micro).
 */
export function F1RacingScreen() {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const profiles = useProfiles((s) => s.profiles);
  const inputSource = useSettings((s) => s.settings.inputSource);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const micStatus = useMic((s) => s.status);
  const micLive = useMic((s) => s.live);

  const [settings, setSettings] = useState<F1Settings>(loadF1Settings);
  const [progress, setProgress] = useState<F1Progress>(loadF1Progress);
  const [run, setRun] = useState(0);
  const [modal, setModal] = useState<Modal>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [midiLost, setMidiLost] = useState(false);

  const { difficulty } = settings;
  const car = findCar(settings.carId);
  const config = DIFFICULTIES[difficulty];
  const game = useMemo(() => new F1RacingGame({ difficulty, nav: settings.nav }), [difficulty, run]);
  const state = useGameState(game);
  const racing = state.status === 'racing' || state.status === 'countdown';
  usePlayingNow(racing);

  const updateSettings = (patch: Partial<F1Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveF1Settings(next);
    if (patch.nav) game.setNavKeys(patch.nav);
  };

  // --- Âm thanh ---
  const audio = useRef<F1Audio | null>(null);
  const micQuiet = micOnlyInput(inputSource, micStatus === 'running', midiInput.hasDevice());
  useEffect(() => {
    audio.current?.setLevels({ musicOn: settings.musicOn, musicVolume: settings.musicVolume, sfxOn: settings.sfxOn, sfxVolume: settings.sfxVolume, micQuiet });
  }, [settings.musicOn, settings.musicVolume, settings.sfxOn, settings.sfxVolume, micQuiet]);
  const unlockAudio = () => {
    soundOutput.unlock();
    audio.current ??= new F1Audio();
    audio.current.unlock();
    audio.current.setLevels({ musicOn: settings.musicOn, musicVolume: settings.musicVolume, sfxOn: settings.sfxOn, sfxVolume: settings.sfxVolume, micQuiet });
  };
  useEffect(() => () => audio.current?.dispose(), []);
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    a.setPaused(state.status === 'paused');
    if (state.status === 'racing') a.startRace();
    else if (state.status === 'finished' || state.status === 'ready') a.stopRace();
  }, [state.status, game]);
  useEffect(() => audio.current?.setEngineSpeed(state.speedPercent), [state.speedPercent]);
  useEffect(
    () =>
      game.onEvent((e) => {
        const a = audio.current;
        if (!a) return;
        if (e.type === 'countdown') a.countdownBeep();
        else if (e.type === 'go') a.countdownBeep(true);
        else if (e.type === 'correct') a.correct();
        else if (e.type === 'wrong') a.wrong();
        else if (e.type === 'speed-up') a.accelerate();
        else if (e.type === 'speed-down') a.decelerate();
        else if (e.type === 'lane') a.laneChange();
        else if (e.type === 'crash') {
          a.crash();
          a.decelerate();
        } else if (e.type === 'assist-on') a.assist();
        else if (e.type === 'finish') {
          a.finish();
          a.trophy();
        }
      }),
    [game],
  );

  // --- Nốt vào ---
  useNoteInput(
    {
      onNote: (event) => {
        const result = game.noteOn(event.midi, { hasRelease: event.source !== 'microphone' });
        if (result !== 'ignored' && event.source === 'virtual') soundOutput.playNote(event.midi, 0.35);
      },
      onNoteOff: (event) => game.noteOff(event.midi),
    },
    inputSource,
    { baseMidi: 60, listening: racing && !modal },
  );

  // Phím mũi tên: tiện cho máy tính chưa nối đàn.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.key === 'ArrowLeft') game.steer(-1);
      else if (e.key === 'ArrowRight') game.steer(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [game]);

  // --- Tự tạm dừng khi app không còn được dùng, và khi đàn MIDI bị ngắt ---
  useEffect(() => {
    const pause = () => game.pause(performance.now());
    const onVisibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', pause);
    window.addEventListener('blur', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('blur', pause);
    };
  }, [game]);
  useEffect(() => {
    let had = midiInput.state.devices.length > 0;
    return midiInput.stateChanges.on((s) => {
      const has = s.devices.length > 0;
      if (had && !has) {
        game.clearHeld();
        game.pause(performance.now());
        setMidiLost(true);
      } else if (has) setMidiLost(false);
      had = has;
    });
  }, [game]);

  // --- Về đích: lưu kết quả ---
  const recorded = useRef<F1RacingGame | null>(null);
  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(() => setShowResult(true), RESULT_DELAY_MS);
    if (recorded.current !== game && profile) {
      recorded.current = game;
      const accuracy = f1Accuracy(state.correct, state.wrong);
      const entry: F1Run = {
        profileId: profile.id,
        difficulty,
        carId: settings.carId,
        timeMs: game.raceTimeMs,
        accuracy,
        correct: state.correct,
        wrong: state.wrong,
        collisions: state.collisions,
        bestStreak: state.bestStreak,
        assistCount: state.assistCount,
        trophy: trophyFor(accuracy, state.collisions),
        achievedAt: Date.now(),
      };
      const out = recordF1Run(progress, entry);
      const rows = f1Leaderboard(out.progress, profiles, difficulty);
      setProgress(out.progress);
      setFinished({ run: entry, isRecord: out.isRecord, personalBest: out.progress.best[profile.id]?.[difficulty] ?? entry, rank: rows.findIndex((r) => r.profile.id === profile.id) + 1, rankOf: rows.length });
    }
    return () => window.clearTimeout(id);
  }, [state.status, game]);

  // --- Điều khiển ván ---
  const pendingStart = useRef(false);
  useEffect(() => {
    if (!pendingStart.current) return;
    pendingStart.current = false;
    game.start(performance.now());
  }, [game]);
  const newRun = (autoStart: boolean) => {
    pendingStart.current = autoStart;
    setFinished(null);
    setShowResult(false);
    setModal(null);
    setRun((v) => v + 1);
  };
  const start = () => {
    unlockAudio();
    game.start(performance.now());
  };
  const playAgain = () => {
    unlockAudio();
    newRun(true);
  };
  const chooseDifficulty = (value: F1Difficulty) => {
    updateSettings({ difficulty: value });
    newRun(false);
  };
  const resumeAfterModal = useRef(false);
  const openModal = (m: Exclude<Modal, null>) => {
    resumeAfterModal.current = racing;
    if (racing) game.pause(performance.now());
    setModal(m);
  };
  const closeModal = () => {
    setModal(null);
    if (resumeAfterModal.current) game.resume(performance.now());
    resumeAfterModal.current = false;
  };
  const togglePause = () => {
    if (state.status === 'paused') {
      unlockAudio();
      setMidiLost(false);
      game.resume(performance.now());
    } else game.pause(performance.now());
  };
  const exit = () => navigate({ name: 'games' });

  // --- Hiển thị nốt ---
  const cards = useMemo(() => practiceNotes(difficulty).map((midi) => ({ key: midi, notation: `${midiToName(midi)}/q`, clef: 'treble' as const })), [difficulty]);
  const staffSvgs = useStaffCards(cards, undefined, { timeSignature: false });
  const keyFlash = useKeyFlash(state.noteSeq, state.lastMidi, state.lastOutcome);
  const [noteFlash, setNoteFlash] = useState<{ kind: 'hit' | 'wrong'; midi: number } | null>(null);
  useEffect(() => {
    if (state.noteSeq === 0 || !state.lastOutcome || state.lastMidi === null) return;
    // Đúng: nốt vừa đánh (nốt cũ) tô xanh thoáng qua rồi tới nốt mới. Sai: nốt đang cần đánh tô đỏ.
    setNoteFlash({ kind: state.lastOutcome, midi: state.lastOutcome === 'hit' ? state.lastMidi : state.target });
    const id = window.setTimeout(() => setNoteFlash(null), NOTE_FLASH_MS[state.lastOutcome]);
    return () => window.clearTimeout(id);
  }, [state.noteSeq]);
  const shownMidi = noteFlash?.midi ?? state.target;
  const noteTone = noteFlash?.kind === 'hit' ? 'f1-note-hit' : noteFlash?.kind === 'wrong' ? 'f1-note-wrong animate-shake' : '';

  const help = config.helpAvailable;
  const showName = help && settings.showNames;
  const showKeyHint = help && settings.showKeyHint;
  const span = keyboardSpan(difficulty, state.nav);
  const navSet = useMemo(() => new Set([state.nav.left, state.nav.right]), [state.nav]);
  const labelFor = (midi: number) => {
    if (midi === state.nav.left) return `⬅ ${midiToLabel(midi, labelStyle)}`;
    if (midi === state.nav.right) return `${midiToLabel(midi, labelStyle)} ➡`;
    return showName ? midiToLabel(midi, labelStyle) : '';
  };

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden bg-gradient-to-b from-sky-200 to-emerald-100 text-slate-900 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100"
      data-testid="f1-racing"
      data-status={state.status}
      data-target={state.target}
      data-speed={state.speedPercent}
      data-lane={state.lane}
      data-distance={state.distanceM}
      data-streak={state.assistProgress}
      data-assist={state.assistActive ? 'on' : 'off'}
      data-correct={state.correct}
      data-wrong={state.wrong}
      data-nav-left={state.nav.left}
      data-nav-right={state.nav.right}
    >
      <header className="z-10 flex flex-wrap items-center gap-x-2 gap-y-1 bg-white/85 pr-2 pl-16 pt-[calc(.25rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-1 shadow-sm backdrop-blur dark:bg-slate-900/85">
        <Button variant="ghost" className="px-2" aria-label="Về danh sách trò chơi" onClick={exit}>
          <Icon name="back" />
        </Button>
        <Hud state={state} trackLength={config.trackLength} />
        {inputSource !== 'midi' && <MicButton compact />}
        <Button onClick={() => openModal('settings')} aria-label="Cài đặt" data-testid="f1-settings" className="px-3">
          ⚙
        </Button>
        <Button variant="primary" onClick={togglePause} disabled={!racing && state.status !== 'paused'} data-testid="f1-pause" className="px-3">
          <Icon name={state.status === 'paused' ? 'play' : 'pause'} /> <span className="hidden lg:inline">{state.status === 'paused' ? 'Tiếp' : 'Dừng'}</span>
        </Button>
        <FullscreenButton />
      </header>

      <main className="relative min-h-0 flex-1" aria-label="Đường đua">
        <F1Canvas game={game} car={car} />
        {state.assistActive && (
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-fuchsia-600 px-5 py-1.5 text-lg font-black whitespace-nowrap text-white shadow-lg" data-testid="f1-assist-banner" aria-live="polite">
            🛡️ Tự động né · còn {(state.assistLeftMs / 1000).toFixed(1).replace('.', ',')} giây
          </div>
        )}
        {state.status === 'racing' && state.speedPercent === 0 && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-rose-600 px-5 py-1.5 font-black whitespace-nowrap text-white shadow-lg" data-testid="f1-stopped">
            Xe đã dừng: đánh đúng nốt để chạy tiếp!
          </div>
        )}
      </main>

      <section className="z-10 grid shrink-0 grid-cols-1 gap-2 bg-white/90 p-2 pb-[calc(.5rem+env(safe-area-inset-bottom,0px))] shadow-[0_-2px_8px_rgba(0,0,0,.12)] sm:grid-cols-[minmax(190px,270px)_minmax(0,1fr)] dark:bg-slate-900/90" aria-label="Khuông nhạc và đàn">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl bg-white px-2 ring-2 ring-sky-200 dark:bg-slate-800 dark:ring-slate-600" data-testid="f1-note-card" data-note-state={noteFlash?.kind ?? 'idle'} data-shown={shownMidi}>
          <div className={`h-28 overflow-hidden sm:h-36 [@media(max-height:500px)]:h-20 [&>svg]:h-full [&>svg]:w-full ${noteTone}`} dangerouslySetInnerHTML={{ __html: staffSvgs?.get(shownMidi) ?? '' }} />
          <div className="grid min-w-14 justify-items-center text-center">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">NỐT CẦN ĐÁNH</span>
            <strong className="text-2xl text-violet-700 dark:text-violet-300" data-testid="f1-note-name">
              {showName ? midiToLabel(state.target, labelStyle) : '?'}
            </strong>
          </div>
        </div>
        <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-1">
          <div className="flex items-center justify-between gap-2 text-sm font-black" data-testid="f1-nav-guide">
            <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">⬅ Rẽ trái: {midiToLabel(state.nav.left, labelStyle)}</span>
            <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">Tay trái lái xe, tay phải đọc nốt</span>
            <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">Rẽ phải: {midiToLabel(state.nav.right, labelStyle)} ➡</span>
          </div>
          <div className="h-24 min-w-0 sm:h-28 [@media(max-height:500px)]:h-14" data-testid="f1-keyboard">
            <PianoKeyboard from={span.from} to={span.to} expected={showKeyHint ? state.target : null} detected={micLive?.midi ?? null} flash={keyFlash} labelStyle={labelStyle} highlighted={navSet} labelFor={labelFor} onPress={(m) => virtualInput.press(m)} onRelease={(m) => virtualInput.release(m)} />
          </div>
        </div>
      </section>

      {state.status === 'ready' && (
        <Garage
          settings={settings}
          car={car}
          canStart={!!profile}
          midiNav={!modal}
          onCar={(carId) => updateSettings({ carId })}
          onDifficulty={chooseDifficulty}
          onStart={start}
          onLeaderboard={() => openModal('leaderboard')}
          onTrophies={() => openModal('trophies')}
          onSettings={() => openModal('settings')}
          onExit={exit}
        />
      )}
      {state.status === 'paused' && !modal && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-slate-950/45 p-3" data-testid="f1-paused">
          <section className="grid max-w-lg justify-items-center gap-3 rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-slate-800">
            <h2 className="text-3xl font-black">⏸ Đang tạm dừng</h2>
            {midiLost && (
              <p className="rounded-xl bg-amber-100 p-3 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" data-testid="f1-midi-lost">
                🔌 Đàn MIDI vừa bị ngắt. Hãy cắm lại, hoặc chơi tiếp bằng piano ảo trên màn hình.
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={togglePause} midiNav="forward" className="min-h-14 text-lg" data-testid="f1-resume">
                ▶ Chơi tiếp
              </Button>
              <Button onClick={() => newRun(false)}>↻ Đua lại từ đầu</Button>
              <Button variant="ghost" onClick={exit} midiNav="back">
                Về danh sách game
              </Button>
            </div>
          </section>
        </div>
      )}
      {state.status === 'finished' && showResult && finished && (
        <Results result={finished} state={state} midiNav={!modal} onAgain={playAgain} onChangeCar={() => newRun(false)} onExit={exit} onLeaderboard={() => openModal('leaderboard')} onTrophies={() => openModal('trophies')} />
      )}
      {modal === 'settings' && <SettingsModal settings={settings} difficulty={difficulty} update={updateSettings} onClose={closeModal} />}
      {modal === 'trophies' && <TrophyModal progress={progress} profileId={profile?.id ?? null} onClose={closeModal} />}
      {modal === 'leaderboard' && <LeaderboardModal progress={progress} profiles={profiles} initial={difficulty} highlight={profile?.id ?? null} onClose={closeModal} />}
    </div>
  );
}

function Hud({ state, trackLength }: { state: F1State; trackLength: number }) {
  const percent = Math.min(100, (state.distanceM / trackLength) * 100);
  const speedColor = state.speedPercent >= 70 ? 'bg-emerald-500' : state.speedPercent >= 30 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm font-black tabular-nums" data-testid="f1-hud">
      <span data-testid="f1-time" title="Thời gian đua">
        ⏱ {formatRaceTime(state.timeMs)}
      </span>
      <span className="grid min-w-36 flex-1 gap-0.5" title="Quãng đường về đích">
        <span data-testid="f1-distance">
          🏁 {state.distanceM.toLocaleString('vi-VN')} / {trackLength.toLocaleString('vi-VN')} m
        </span>
        <span className="block h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <span className="block h-full rounded-full bg-sky-500" style={{ width: `${percent}%` }} data-testid="f1-progress" />
        </span>
      </span>
      <span className="grid min-w-24 gap-0.5" title="Tốc độ xe">
        <span data-testid="f1-speed">🏎️ {state.speedPercent}%</span>
        <span className="block h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <span className={`block h-full rounded-full transition-all ${speedColor}`} style={{ width: `${state.speedPercent}%` }} />
        </span>
      </span>
      <span data-testid="f1-streak" title="Chuỗi nốt đúng tới lần hỗ trợ kế">
        🔥 {state.assistProgress}/{STREAK_FOR_ASSIST}
      </span>
      <span className={`min-w-32 ${state.assistActive ? 'rounded-full bg-fuchsia-600 px-2 text-white' : 'text-slate-400 dark:text-slate-500'}`} data-testid="f1-assist">
        🛡️ {state.assistActive ? `${(state.assistLeftMs / 1000).toFixed(1).replace('.', ',')} s` : 'Tự né: chưa bật'}
      </span>
    </div>
  );
}

/** Xe xem trước, vẽ cùng hàm với xe trên đường. */
function CarPreview({ car, animated, height = 130 }: { car: CarDef; animated: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const logical = 150;
    const scale = height / logical;
    const width = Math.round(100 * scale);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    let raf = 0;
    const paint = () => {
      const now = performance.now();
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
      ctx.clearRect(0, 0, 100, logical);
      drawF1Car(ctx, 50, 66, car, { flame: animated ? 0.9 : 0.35, boost: animated && Math.floor(now / 900) % 3 === 0, time: animated ? now : 0 });
      if (animated) raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [car, animated, height]);
  return <canvas ref={ref} aria-hidden />;
}

function Garage({
  settings,
  car,
  canStart,
  midiNav,
  onCar,
  onDifficulty,
  onStart,
  onLeaderboard,
  onTrophies,
  onSettings,
  onExit,
}: {
  settings: F1Settings;
  car: CarDef;
  canStart: boolean;
  midiNav: boolean;
  onCar: (id: CarDef['id']) => void;
  onDifficulty: (d: F1Difficulty) => void;
  onStart: () => void;
  onLeaderboard: () => void;
  onTrophies: () => void;
  onSettings: () => void;
  onExit: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-gradient-to-b from-sky-300 via-sky-100 to-emerald-200 p-3 pl-16 dark:from-slate-900 dark:via-indigo-950 dark:to-slate-950" data-testid="f1-garage">
      <div className="mx-auto grid max-w-4xl gap-3 pt-[env(safe-area-inset-top,0px)]">
        <header className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" className="px-2" aria-label="Về danh sách trò chơi" onClick={onExit} midiNav={midiNav ? 'back' : undefined}>
            <Icon name="back" />
          </Button>
          <h1 className="flex-1 text-3xl font-black tracking-tight">🏎️ VietPiano F1 Racing</h1>
          <Button onClick={onSettings} data-testid="f1-garage-settings">
            ⚙ Âm thanh và phím
          </Button>
        </header>
        <p className="text-sm font-semibold">
          Đọc nốt trên khuông để giữ tốc độ, dùng hai phím đàn để đổi làn. Đúng 10 nốt liên tiếp: xe tự né chướng ngại trong 3 giây!
        </p>
        <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Chọn xe">
          {CARS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={c.id === car.id}
              onClick={() => onCar(c.id)}
              data-testid={`f1-car-${c.id}`}
              className={`grid min-h-12 justify-items-center gap-1 rounded-2xl bg-white/90 p-2 ring-2 transition dark:bg-slate-800/90 ${c.id === car.id ? 'scale-[1.03] ring-4 ring-fuchsia-500' : 'ring-white/50 hover:ring-fuchsia-300 dark:ring-slate-600'}`}
            >
              <CarPreview car={c} animated={c.id === car.id} />
              <span className="text-center text-sm leading-tight font-black">{c.name}</span>
            </button>
          ))}
        </div>
        <div className="grid justify-items-center gap-1 rounded-2xl bg-white/80 p-3 text-center dark:bg-slate-800/80">
          <Segmented value={settings.difficulty} onChange={onDifficulty} options={DIFFICULTY_ORDER.map((d) => ({ value: d, label: `${DIFFICULTIES[d].icon} ${DIFFICULTIES[d].label}` }))} />
          <p className="text-sm font-semibold" data-testid="f1-difficulty-summary">
            {DIFFICULTIES[settings.difficulty].summary}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onStart} disabled={!canStart} data-testid="f1-start" midiNav={midiNav ? 'forward' : undefined} className="min-h-14 px-8 text-xl">
            🏁 Bắt đầu
          </Button>
          <Button onClick={onLeaderboard} data-testid="f1-open-leaderboard">
            👨‍👩‍👧‍👦 Bảng xếp hạng
          </Button>
          <Button onClick={onTrophies} data-testid="f1-open-trophies">
            🏆 Bộ sưu tập cúp
          </Button>
        </div>
        {!canStart && <p className="text-center font-bold text-amber-800 dark:text-amber-300">Hãy tạo hoặc chọn hồ sơ bên dưới để lưu thành tích và bắt đầu đua.</p>}
        <ProfileSwitcher className="" hint="Tạo hồ sơ để có bộ sưu tập cúp riêng và lên bảng xếp hạng gia đình." />
      </div>
    </div>
  );
}

function Results({ result, state, midiNav, onAgain, onChangeCar, onExit, onLeaderboard, onTrophies }: { result: Finished; state: F1State; midiNav: boolean; onAgain: () => void; onChangeCar: () => void; onExit: () => void; onLeaderboard: () => void; onTrophies: () => void }) {
  const { run } = result;
  const trophy = TROPHY_INFO[run.trophy];
  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/60 p-3" data-testid="f1-results" data-trophy={run.trophy}>
      <section className="grid w-full max-w-2xl justify-items-center gap-2 rounded-[2rem] bg-white p-5 text-center shadow-2xl dark:bg-slate-800">
        <h2 className="text-3xl font-black text-emerald-700 dark:text-emerald-300">🏁 Về đích rồi!</h2>
        <div className="flex items-center gap-3">
          <span className="text-6xl" aria-hidden>
            {trophy.icon}
          </span>
          <div className="text-left">
            <strong className="block text-2xl" data-testid="f1-trophy">
              {trophy.label}
            </strong>
            <span className="text-sm text-slate-500 dark:text-slate-400">{trophy.rule}</span>
          </div>
        </div>
        <dl className="grid w-full grid-cols-3 gap-2 sm:grid-cols-4">
          <Stat label="Thời gian đua" value={formatRaceTime(run.timeMs)} testId="f1-result-time" />
          <Stat label="Nốt đúng" value={run.correct} testId="f1-result-correct" />
          <Stat label="Đánh sai" value={run.wrong} testId="f1-result-wrong" />
          <Stat label="Độ chính xác" value={`${Math.round(run.accuracy * 100)}%`} testId="f1-result-accuracy" />
          <Stat label="Va chạm" value={run.collisions} testId="f1-result-collisions" />
          <Stat label="Chuỗi dài nhất" value={run.bestStreak} />
          <Stat label="Lần hỗ trợ" value={run.assistCount} />
          <Stat label="Tốc độ cuối" value={`${state.speedPercent}%`} />
        </dl>
        <p className="font-bold" data-testid="f1-result-record">
          {result.isRecord ? '🎉 Kỷ lục cá nhân mới!' : `Kỷ lục cá nhân: ${formatRaceTime(result.personalBest.timeMs)}`}
        </p>
        <p className="font-bold" data-testid="f1-result-rank">
          Bảng xếp hạng gia đình: hạng {result.rank}/{result.rankOf}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onAgain} midiNav={midiNav ? 'forward' : undefined} data-testid="f1-again">
            ↻ Chơi lại
          </Button>
          <Button onClick={onChangeCar} data-testid="f1-change-car">
            🏎️ Đổi xe
          </Button>
          <Button onClick={onLeaderboard}>👨‍👩‍👧‍👦 Xếp hạng</Button>
          <Button onClick={onTrophies}>🏆 Cúp</Button>
          <Button variant="ghost" onClick={onExit} midiNav={midiNav ? 'back' : undefined} data-testid="f1-exit">
            Về danh sách game
          </Button>
        </div>
      </section>
    </div>
  );
}

function SettingsModal({ settings, difficulty, update, onClose }: { settings: F1Settings; difficulty: F1Difficulty; update: (p: Partial<F1Settings>) => void; onClose: () => void }) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const resolved = resolveNavKeys(settings.nav, difficulty);
  const navSelect = (label: string, side: 'left' | 'right') => (
    <label className="grid gap-1 font-semibold">
      {label}
      <select value={settings.nav[side]} onChange={(e) => update({ nav: { ...settings.nav, [side]: Number(e.target.value) } })} data-testid={`f1-nav-${side}`} className="min-h-12 rounded-xl bg-violet-50 px-3 dark:bg-slate-700">
        {NAV_CHOICES.map((m) => (
          <option key={m} value={m}>
            {midiToLabel(m, labelStyle)}
          </option>
        ))}
      </select>
    </label>
  );
  const volume = (label: string, value: number, on: boolean, key: 'musicVolume' | 'sfxVolume') => (
    <label className="grid gap-1 text-sm font-semibold">
      {label}: {Math.round(value * 100)}%
      <input type="range" min={0} max={1} step={0.05} value={value} disabled={!on} onChange={(e) => update({ [key]: Number(e.target.value) })} data-testid={`f1-${key}`} className="h-8 w-full accent-fuchsia-600" />
    </label>
  );
  return (
    <ModalShell title="⚙ Cài đặt F1 Racing" onClose={onClose} testId="f1-settings-panel">
      <div className="grid gap-2">
        <h3 className="font-black">🎹 Nguồn nốt</h3>
        <InputSourceBar />
        <p className="text-xs text-slate-500 dark:text-slate-400">Đang nghe bằng micro thì game tự tắt nhạc và hiệu ứng, để micro không nghe nhầm thành nốt.</p>
      </div>
      <div className="grid gap-2">
        <h3 className="font-black">🕹️ Phím điều hướng</h3>
        <div className="grid grid-cols-2 gap-3">
          {navSelect('⬅ Rẽ trái', 'left')}
          {navSelect('Rẽ phải ➡', 'right')}
        </div>
        {resolved.relocated && (
          <p className="rounded-xl bg-amber-100 p-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" data-testid="f1-nav-relocated">
            Phím đã chọn trùng tầm nốt luyện tập hoặc trùng nhau, nên ở cấp này game dùng: rẽ trái {midiToLabel(resolved.left, labelStyle)}, rẽ phải {midiToLabel(resolved.right, labelStyle)}.
          </p>
        )}
      </div>
      {DIFFICULTIES[difficulty].helpAvailable && (
        <div className="grid gap-2">
          <h3 className="font-black">💡 Trợ giúp (cấp Dễ)</h3>
          <Toggle checked={settings.showNames} onChange={(showNames) => update({ showNames })} label="Hiện tên nốt" />
          <Toggle checked={settings.showKeyHint} onChange={(showKeyHint) => update({ showKeyHint })} label="Gợi ý phím cần đánh trên piano ảo" />
        </div>
      )}
      <div className="grid gap-2">
        <h3 className="font-black">🔊 Âm thanh</h3>
        <Toggle checked={settings.musicOn} onChange={(musicOn) => update({ musicOn })} label="🎵 Nhạc nền" />
        {volume('Âm lượng nhạc', settings.musicVolume, settings.musicOn, 'musicVolume')}
        <Toggle checked={settings.sfxOn} onChange={(sfxOn) => update({ sfxOn })} label="🏎️ Hiệu ứng và động cơ" />
        {volume('Âm lượng hiệu ứng', settings.sfxVolume, settings.sfxOn, 'sfxVolume')}
      </div>
    </ModalShell>
  );
}

function TrophyModal({ progress, profileId, onClose }: { progress: F1Progress; profileId: string | null; onClose: () => void }) {
  return (
    <ModalShell title="🏆 Bộ sưu tập cúp" onClose={onClose} testId="f1-trophy-panel">
      {DIFFICULTY_ORDER.map((d) => {
        const counts = profileId ? progress.trophies[profileId]?.[d] : undefined;
        return (
          <div key={d} className="grid gap-2">
            <h3 className="font-black">
              {DIFFICULTIES[d].icon} {DIFFICULTIES[d].label}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TROPHY_ORDER.map((t) => {
                const n = counts?.[t] ?? 0;
                return (
                  <div key={t} className={`grid justify-items-center rounded-2xl p-2 text-center ring-2 ${n > 0 ? 'bg-amber-50 ring-amber-300 dark:bg-amber-950/30' : 'bg-slate-100 opacity-60 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600'}`} data-testid={`f1-trophy-${d}-${t}`} data-count={n}>
                    <span className={`text-4xl ${n > 0 ? '' : 'grayscale'}`}>{TROPHY_INFO[t].icon}</span>
                    <strong className="text-sm">{TROPHY_INFO[t].label}</strong>
                    <span className="text-xs">{n > 0 ? `× ${n}` : TROPHY_INFO[t].rule}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </ModalShell>
  );
}

function LeaderboardModal({ progress, profiles, initial, highlight, onClose }: { progress: F1Progress; profiles: ReturnType<typeof useProfiles.getState>['profiles']; initial: F1Difficulty; highlight: string | null; onClose: () => void }) {
  const [difficulty, setDifficulty] = useState<F1Difficulty>(initial);
  const rows = f1Leaderboard(progress, profiles, difficulty);
  return (
    <ModalShell title="👨‍👩‍👧‍👦 Bảng xếp hạng gia đình" onClose={onClose} testId="f1-leaderboard-panel">
      <Segmented value={difficulty} onChange={setDifficulty} options={DIFFICULTY_ORDER.map((d) => ({ value: d, label: DIFFICULTIES[d].label }))} />
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-slate-100 p-5 text-center dark:bg-slate-700">Chưa có thành tích ở cấp {DIFFICULTIES[difficulty].label}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="f1-leaderboard">
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400">
                <th className="p-2">Hạng</th>
                <th className="p-2">Người chơi</th>
                <th className="p-2">Xe</th>
                <th className="p-2">Độ khó</th>
                <th className="p-2">Thời gian</th>
                <th className="p-2">Chính xác</th>
                <th className="p-2">Va chạm</th>
                <th className="p-2">Cúp cao nhất</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.profile.id} className={`font-semibold ${row.profile.id === highlight ? 'bg-fuchsia-50 dark:bg-fuchsia-950/40' : ''}`} data-testid={`f1-row-${row.profile.id}`}>
                  <td className="p-2 text-lg font-black">{i === 0 ? '👑' : `#${i + 1}`}</td>
                  <td className="p-2">
                    {row.profile.avatar} {row.profile.name}
                  </td>
                  <td className="p-2">{findCar(row.best.carId).name}</td>
                  <td className="p-2">{DIFFICULTIES[row.best.difficulty].label}</td>
                  <td className="p-2 tabular-nums">{formatRaceTime(row.best.timeMs)}</td>
                  <td className="p-2 tabular-nums">{Math.round(row.best.accuracy * 100)}%</td>
                  <td className="p-2 tabular-nums">{row.best.collisions}</td>
                  <td className="p-2 whitespace-nowrap">
                    {TROPHY_INFO[row.top].icon} {TROPHY_INFO[row.top].label}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500 dark:text-slate-400">Xếp theo thời gian về đích, rồi độ chính xác, rồi số lần va chạm. Mỗi người một dòng: ván tốt nhất.</p>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, testId, children }: { title: string; onClose: () => void; testId: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4" data-testid={testId}>
      <section className="mx-auto grid max-w-3xl gap-4 rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-800" role="dialog" aria-modal="true" aria-label={title}>
        <header className="flex items-center gap-3">
          <h2 className="flex-1 text-2xl font-black">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng" data-testid="f1-modal-close">
            <Icon name="close" />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="rounded-2xl bg-sky-50 p-2 dark:bg-slate-700">
      <dt className="text-xs text-slate-500 dark:text-slate-300">{label}</dt>
      <dd className="text-lg font-black tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
