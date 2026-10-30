import { useEffect, useMemo, useRef, useState } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import {
  BALLOON_DIFFICULTIES,
  BALLOON_SPEEDS,
  balloonConfig,
  BalloonPopGame,
  DIFFICULTY_CONFIG,
  DIFFICULTY_LABEL,
  SPEED_LABEL,
  summarize,
  type BalloonDifficulty,
  type BalloonSummary,
} from '../core/balloonPop/BalloonPopGame';
import { BALLOON_MODES, exactPitch, HAND_LABEL, keyboardRange, letterOf, LETTERS, MODE_INFO, noteName, notePool, SOLFEGE } from '../core/balloonPop/notes';
import { balloonKey, handFor, loadBalloonRecords, loadBalloonSettings, saveBalloonResult, saveBalloonSettings, totalBalloonStars, type BalloonSettings } from '../core/balloonPop/storage';
import type { GameRecord } from '../core/curriculum/progress';
import type { ArcadeRecords } from '../core/games/arcade';
import { FINGER_NAME } from '../core/flappyNote/levels';
import { chooseBaseC, keyHintsFor } from '../core/input/keyMapping';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { BalloonCanvas, LETTER_COLORS } from '../components/balloonPop/BalloonCanvas';
import { HandFigure, InputSourceBar } from '../components/curriculum/common';
import { Stars, useGameState, useKeyFlash } from '../components/games/shared';
import { MicButton } from '../components/MicPanel';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { Button, Card, FullscreenButton, Icon, Segmented } from '../components/ui';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { useMic } from '../store/micStore';
import { useSettings } from '../store/settingsStore';

const DIFFICULTY_HELP: Record<BalloonDifficulty, string> = {
  easy: `Mỗi lần một quả · ${DIFFICULTY_CONFIG.easy.lives} mạng · ${DIFFICULTY_CONFIG.easy.balloons} quả`,
  normal: `Tối đa ${DIFFICULTY_CONFIG.normal.maxActive} quả cùng lúc · ${DIFFICULTY_CONFIG.normal.lives} mạng · ${DIFFICULTY_CONFIG.normal.balloons} quả`,
  hard: `Tối đa ${DIFFICULTY_CONFIG.hard.maxActive} quả cùng lúc · ${DIFFICULTY_CONFIG.hard.lives} mạng · ${DIFFICULTY_CONFIG.hard.balloons} quả`,
};

const starsText = (r: GameRecord | undefined) => (r && r.plays > 0 ? `${'★'.repeat(r.bestStars)}${'☆'.repeat(3 - r.bestStars)} · kỷ lục ${r.bestScore}` : 'Chưa chơi');

type Update = (p: Partial<BalloonSettings>) => void;

/**
 * Bóng bay nốt nhạc: bóng mang tên nốt bay lên thẳng phía trên phím đàn — đánh đúng nốt để nổ bóng trước khi bóng bay mất.
 * Màn chọn (chế độ 1 tay / 2 tay / 7 nốt / full phím, độ khó, tốc độ, gợi ý) → chơi (bóng · piano ảo) → kết quả.
 * Nhận nốt từ đàn MIDI, bàn phím máy tính, piano ảo và micro qua `useNoteInput`; kỷ lục theo hồ sơ ở localStorage.
 */
export function BalloonPopScreen() {
  const [settings, setSettingsState] = useState<BalloonSettings>(loadBalloonSettings);
  const [playing, setPlaying] = useState(false);
  const profileKey = useCurriculum((s) => s.profileKey);
  const [records, setRecords] = useState<ArcadeRecords>(() => loadBalloonRecords(profileKey));
  useEffect(() => setRecords(loadBalloonRecords(profileKey)), [profileKey]);
  const update: Update = (patch) =>
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      saveBalloonSettings(next);
      return next;
    });

  if (playing)
    return (
      <BalloonPlay
        settings={settings}
        update={update}
        records={records}
        onResult={(key, r) => setRecords((prev) => saveBalloonResult(profileKey, prev, key, r))}
        onExit={() => setPlaying(false)}
      />
    );
  return (
    <BalloonSetup
      settings={settings}
      records={records}
      update={update}
      onStart={() => {
        soundOutput.unlock();
        setPlaying(true);
      }}
    />
  );
}

function BalloonSetup({ settings, records, update, onStart }: { settings: BalloonSettings; records: ArcadeRecords; update: Update; onStart: () => void }) {
  const navigate = useApp((s) => s.navigate);
  const hands = MODE_INFO[settings.mode].hands;
  return (
    <div className="h-full overflow-y-auto" data-testid="balloon-setup">
      <div className="mx-auto grid max-w-5xl gap-4 px-6 pt-[calc(1rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-6">
        <header className="flex items-center gap-3 pl-10">
          <Button variant="ghost" onClick={() => navigate({ name: 'games' })} aria-label="Về mục Trò chơi" className="px-2">
            <Icon name="back" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold">🎈 Bóng bay nốt nhạc</h1>
            <p className="truncate text-sm text-slate-600 dark:text-slate-300">Bóng bay lên phía trên phím đàn — đánh đúng nốt để làm nổ bóng trước khi bóng bay mất!</p>
          </div>
          <FullscreenButton />
        </header>

        <Card className="flex flex-wrap items-center gap-4 py-3!">
          <span className="text-5xl" aria-hidden>
            🎈
          </span>
          <div className="grid min-w-56 flex-1 gap-1">
            <p className="text-xl font-bold">
              {MODE_INFO[settings.mode].label}
              {hands.length > 0 && ` · ${HAND_LABEL[settings.hand]}`} · {DIFFICULTY_LABEL[settings.difficulty]} · {SPEED_LABEL[settings.speed]}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="balloon-total-stars">
              ★ {totalBalloonStars(records)} sao · {starsText(records[balloonKey(settings)])}
            </p>
          </div>
          <Button variant="primary" className="min-h-16 min-w-56 text-xl" onClick={onStart} data-testid="balloon-start">
            ▶ Chơi ngay
          </Button>
        </Card>

        <section className="grid gap-2">
          <h2 className="text-lg font-bold">Chế độ</h2>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chế độ">
            {BALLOON_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === settings.mode}
                onClick={() => update({ mode: m, hand: handFor(m, settings.hand) })}
                data-testid={`balloon-mode-${m}`}
                className={`grid min-h-12 rounded-2xl px-3 py-2 text-left ring-2 transition-colors ${m === settings.mode ? 'bg-pink-500 text-white ring-pink-300' : 'bg-white/90 ring-pink-100 hover:ring-pink-300 dark:bg-slate-800 dark:ring-slate-700'}`}
              >
                <span className="font-bold">{MODE_INFO[m].label}</span>
                <span className="text-sm opacity-80">{MODE_INFO[m].description}</span>
              </button>
            ))}
          </div>
          {hands.length > 0 && <Segmented value={settings.hand} onChange={(hand) => update({ hand })} options={hands.map((h) => ({ value: h, label: HAND_LABEL[h] }))} />}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="grid content-start gap-3 py-4!">
            <div className="grid gap-2">
              <h2 className="text-lg font-bold">Độ khó</h2>
              <Segmented value={settings.difficulty} onChange={(difficulty) => update({ difficulty })} options={BALLOON_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} />
              <p className="text-sm text-slate-500 dark:text-slate-400">{DIFFICULTY_HELP[settings.difficulty]}</p>
            </div>
            <div className="grid gap-2">
              <h2 className="text-lg font-bold">Tốc độ</h2>
              <Segmented value={settings.speed} onChange={(speed) => update({ speed })} options={BALLOON_SPEEDS.map((s) => ({ value: s, label: SPEED_LABEL[s] }))} />
              <p className="text-sm text-slate-500 dark:text-slate-400">Mỗi quả bay hết màn hình trong khoảng {(balloonConfig(settings.difficulty, settings.speed).riseMs / 1000).toFixed(1)} giây.</p>
            </div>
            <div className="grid gap-2">
              <h2 className="text-lg font-bold">Nguồn nốt</h2>
              <InputSourceBar />
              <p className="text-xs text-slate-500 dark:text-slate-400">Đàn MIDI · micro · bàn phím máy tính (A S D F… từ nốt Đô) · piano ảo trên màn hình.</p>
            </div>
          </Card>
          <Card className="grid content-start gap-3 py-4!">
            <h2 className="text-lg font-bold">Gợi ý</h2>
            <HintControls settings={settings} update={update} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, testId, children }: { on: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      data-testid={testId}
      className={`min-h-12 rounded-xl px-3 text-sm font-semibold ring-2 transition-colors ${on ? 'bg-violet-600 text-white ring-violet-300' : 'bg-white/90 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'}`}
    >
      {on ? '✓ ' : ''}
      {children}
    </button>
  );
}

/** Gợi ý dùng chung ở màn chọn và trong lúc chơi: kiểu tên nốt, phím cần đánh, ngón tay, tên phím + ẩn từng phím. */
function HintControls({ settings, update, compact = false }: { settings: BalloonSettings; update: Update; compact?: boolean }) {
  const toggleLetter = (l: (typeof LETTERS)[number]) =>
    update({ hiddenLetters: settings.hiddenLetters.includes(l) ? settings.hiddenLetters.filter((x) => x !== l) : LETTERS.filter((x) => x === l || settings.hiddenLetters.includes(x)) });
  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <button
        type="button"
        onClick={() => update({ labelStyle: settings.labelStyle === 'letter' ? 'solfege' : 'letter' })}
        data-testid="balloon-label-style"
        aria-label="Đổi kiểu tên nốt"
        className="min-h-12 rounded-xl bg-fuchsia-600 px-3 text-sm font-bold text-white ring-2 ring-fuchsia-300"
      >
        {settings.labelStyle === 'letter' ? 'C D E F G A B' : 'Đô Rê Mi Pha Sol La Si'} ⇄
      </button>
      <Toggle on={settings.showTargetKey} onClick={() => update({ showTargetKey: !settings.showTargetKey })} testId="balloon-hint-target">
        Phím cần đánh
      </Toggle>
      <Toggle on={settings.showFinger} onClick={() => update({ showFinger: !settings.showFinger })} testId="balloon-hint-finger">
        Ngón tay
      </Toggle>
      <Toggle on={settings.showKeyLabels} onClick={() => update({ showKeyLabels: !settings.showKeyLabels })} testId="balloon-hint-labels">
        Tên phím
      </Toggle>
      <Toggle on={settings.sound} onClick={() => update({ sound: !settings.sound })} testId="balloon-hint-sound">
        Âm thanh
      </Toggle>
      {settings.showKeyLabels && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Ẩn tên từng phím" data-testid="balloon-hide-keys">
          <span className="px-1 text-xs text-slate-500 dark:text-slate-400">Ẩn phím:</span>
          {LETTERS.map((l) => {
            const hidden = settings.hiddenLetters.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={hidden}
                onClick={() => toggleLetter(l)}
                data-testid={`balloon-hide-${l}`}
                title={hidden ? 'Hiện lại tên phím này' : 'Ẩn tên phím này'}
                className={`min-h-12 min-w-12 rounded-xl px-2 text-sm font-bold ring-2 ${hidden ? 'bg-slate-200 text-slate-400 line-through ring-slate-300 dark:bg-slate-700' : 'bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}
                style={hidden ? undefined : { boxShadow: `inset 0 -4px 0 ${LETTER_COLORS[l]}` }}
              >
                {settings.labelStyle === 'letter' ? l : SOLFEGE[l]}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => update({ hiddenLetters: settings.hiddenLetters.length === LETTERS.length ? [] : [...LETTERS] })}
            data-testid="balloon-hide-all"
            className="min-h-12 rounded-xl px-2 text-xs font-semibold text-violet-700 underline dark:text-violet-300"
          >
            {settings.hiddenLetters.length === LETTERS.length ? 'Hiện hết' : 'Ẩn hết'}
          </button>
        </div>
      )}
    </div>
  );
}

function BalloonPlay({
  settings,
  update,
  records,
  onResult,
  onExit,
}: {
  settings: BalloonSettings;
  update: Update;
  records: ArcadeRecords;
  onResult: (key: string, r: { score: number; stars: number }) => void;
  onExit: () => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const inputSource = useSettings((s) => s.settings.inputSource);
  const micStatus = useMic((s) => s.status);
  const micLive = useMic((s) => s.live);
  const { mode, hand, difficulty, speed } = settings;
  const recordKey = balloonKey(settings);
  const keyboard = useMemo(() => keyboardRange(mode, hand), [mode, hand]);
  const keyHints = useMemo(() => keyHintsFor(chooseBaseC([keyboard.from])), [keyboard]);
  const withOctave = exactPitch(mode);

  const [run, setRun] = useState(0);
  const game = useMemo(
    () => new BalloonPopGame(mode, notePool(mode, hand), balloonConfig(difficulty, speed)),
    // Ván mới mỗi lần "Chơi lại".
    [mode, hand, difficulty, speed, run],
  );
  const state = useGameState(game);
  const urgent = state.balloons[0] ?? null;

  const micRunning = micStatus === 'running';
  // Tiếng hiệu ứng lọt vào micro → chỉ phát khi micro tắt.
  const sfx = settings.sound && !micRunning;
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;

  useNoteInput(
    {
      onNote: (e) => {
        const r = game.answer(e.midi, e.time);
        // Piano ảo / bàn phím máy tính không có tiếng — phát nốt để nghe cao độ (đàn MIDI tự có tiếng).
        if (r !== 'ignored' && e.source === 'virtual' && sfxRef.current) soundOutput.playNote(e.midi, 0.35);
      },
    },
    inputSource,
    { baseMidi: keyboard.from },
  );

  // Hiệu ứng âm thanh: nổ bóng, bóng bay mất.
  const prev = useRef(state);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!sfxRef.current) return;
    if (state.popped > p.popped) {
      soundOutput.scheduleNote(96, 0.02, 0.05, 60);
      soundOutput.scheduleNote(103, 0.06, 0.08, 50);
    }
    if (state.escaped > p.escaped) soundOutput.scheduleNote(43, 0, 0.3, 90);
  }, [state]);

  // App vào nền / chuyển tab → tạm dừng.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) game.pause(performance.now());
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [game]);

  // Kết thúc ván → lưu kỷ lục (một lần).
  const [result, setResult] = useState<{ summary: BalloonSummary; previousBest: number } | null>(null);
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'over') return;
    const summary = summarize(game);
    const previousBest = records[recordKey]?.bestScore ?? 0;
    onResult(recordKey, { score: summary.score, stars: summary.stars });
    const id = window.setTimeout(() => setResult({ summary, previousBest }), 700);
    return () => window.clearTimeout(id);
    // Chỉ chạy khi ván vừa kết thúc.
  }, [state.status, game]);

  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome === 'pop' ? 'hit' : state.lastOutcome === 'wrong' ? 'wrong' : null);
  const highlighted = useMemo(() => (settings.showTargetKey ? new Set(state.balloons.slice(1).map((b) => b.note.midi)) : undefined), [state.balloons, settings.showTargetKey]);
  const labelFor = (m: number) => {
    const l = letterOf(m);
    if (!l || !settings.showKeyLabels || settings.hiddenLetters.includes(l)) return '';
    return noteName(m, settings.labelStyle, withOctave);
  };

  const restart = () => {
    soundOutput.unlock();
    setResult(null);
    setRun((r) => r + 1);
  };
  const paused = state.status === 'paused';
  const urgentName = urgent ? noteName(urgent.note.midi, settings.labelStyle, withOctave) : null;

  return (
    <div
      className="flex h-full flex-col gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:px-4"
      data-testid="balloon-screen"
      data-status={state.status}
      data-urgent={urgent?.note.midi ?? ''}
      data-balloons={state.balloons.length}
      data-popped={state.popped}
      data-lives={state.lives}
    >
      <header className="flex flex-wrap items-center gap-2 pl-10">
        <Button variant="ghost" className="px-2" aria-label="Về màn chọn Bóng bay" onClick={onExit}>
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="truncate text-xl font-bold">🎈 Bóng bay · {MODE_INFO[mode].label}</h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {MODE_INFO[mode].hands.length > 0 && `${HAND_LABEL[hand]} · `}
            {DIFFICULTY_LABEL[difficulty]} · {SPEED_LABEL[speed]} · {withOctave ? 'phải đúng phím' : 'chỉ cần đúng tên nốt'}
          </p>
        </div>
        <div className="flex items-center gap-4 text-lg font-bold tabular-nums">
          <span data-testid="balloon-score">⭐ {state.score}</span>
          <span data-testid="balloon-count">
            🎈 {state.popped}/{game.config.balloons}
          </span>
          <span aria-label={`${state.lives} mạng`} data-testid="balloon-lives">
            {'❤️'.repeat(Math.max(0, state.lives))}
            <span className="opacity-30">{'🤍'.repeat(Math.max(0, game.config.lives - state.lives))}</span>
          </span>
          <span className={`text-fuchsia-600 transition-opacity dark:text-fuchsia-300 ${state.combo >= 2 ? 'opacity-100' : 'opacity-0'}`}>Chuỗi ×{state.combo}</span>
        </div>
        {inputSource !== 'midi' && <MicButton compact />}
        <Button
          variant="primary"
          onClick={() => (paused ? game.resume(performance.now()) : game.pause(performance.now()))}
          disabled={state.status !== 'playing' && !paused}
          data-testid="balloon-pause"
          aria-label={paused ? 'Chơi tiếp' : 'Tạm dừng'}
          className="min-w-28"
        >
          <Icon name={paused ? 'play' : 'pause'} />
          {paused ? 'Tiếp' : 'Dừng'}
        </Button>
        <Button onClick={restart} aria-label="Chơi lại từ đầu" data-testid="balloon-restart">
          <Icon name="restart" />
        </Button>
        <FullscreenButton />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white/90 px-3 py-1.5 shadow-sm ring-1 ring-pink-100 dark:bg-slate-800/90 dark:ring-slate-700">
        <div className="flex min-w-48 items-center gap-3" aria-live="polite" data-testid="balloon-guide">
          {settings.showFinger && urgent && <HandFigure hand={urgent.note.hand} highlight={urgent.note.finger} className="h-16" />}
          <div className="grid">
            <span className="text-xs text-slate-500 dark:text-slate-400">Bóng cần nổ trước</span>
            <span className="text-2xl leading-tight font-extrabold text-violet-700 dark:text-violet-300" data-testid="balloon-target-name">
              {urgentName ?? '…'}
            </span>
            {settings.showFinger && urgent && (
              <span className="text-sm font-semibold" data-testid="balloon-target-finger">
                {HAND_LABEL[urgent.note.hand]} · ngón {urgent.note.finger} – {FINGER_NAME[urgent.note.finger]}
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto">
          <HintControls settings={settings} update={update} compact />
        </div>
      </div>

      <div className="relative min-h-48 flex-1 overflow-hidden rounded-3xl ring-1 ring-sky-200 dark:ring-slate-700">
        <BalloonCanvas game={game} view={{ from: keyboard.from, to: keyboard.to, labelStyle: settings.labelStyle, withOctave, showFinger: settings.showFinger }} />
        {state.status === 'ready' && (
          <Overlay testId="balloon-ready">
            <p className="text-2xl font-extrabold">Sẵn sàng chưa? 🎈</p>
            <p className="text-sm opacity-80">
              Bóng bay lên phía trên phím của nó. Đánh đúng {withOctave ? 'phím (đúng quãng tám)' : 'tên nốt'} để làm nổ bóng!
            </p>
            <Button variant="primary" className="min-h-14 text-lg" onClick={() => game.start(performance.now())} data-testid="balloon-go">
              <Icon name="play" /> Bắt đầu
            </Button>
          </Overlay>
        )}
        {paused && (
          <Overlay testId="balloon-paused">
            <p className="text-2xl font-extrabold">⏸ Đang tạm dừng</p>
            <Button variant="primary" onClick={() => game.resume(performance.now())}>
              <Icon name="play" /> Chơi tiếp
            </Button>
          </Overlay>
        )}
        {result && (
          <ResultPanel
            result={result}
            name={(m) => noteName(m, settings.labelStyle, withOctave)}
            record={records[recordKey]}
            stats={state.stats}
            onAgain={restart}
            onSetup={onExit}
            onGames={() => navigate({ name: 'games' })}
          />
        )}
      </div>

      <div className={`shrink-0 ${mode === 'full' ? 'h-32 sm:h-36' : 'h-28 sm:h-32'}`} data-testid="balloon-keyboard">
        <PianoKeyboard
          from={keyboard.from}
          to={keyboard.to}
          expected={settings.showTargetKey && urgent ? urgent.note.midi : null}
          expectedFinger={settings.showFinger && urgent ? urgent.note.finger : undefined}
          highlighted={highlighted}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={settings.labelStyle}
          labelFor={labelFor}
          keyHints={inputSource === 'midi' || mode === 'full' ? undefined : keyHints}
          onPress={(m) => virtualInput.press(m)}
          onRelease={(m) => virtualInput.release(m)}
        />
      </div>
    </div>
  );
}

function Overlay({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center px-4" data-testid={testId}>
      <div className="pointer-events-auto grid justify-items-center gap-2 rounded-3xl bg-white/90 px-6 py-4 text-center text-slate-900 shadow-lg ring-2 ring-pink-300 dark:bg-slate-900/90 dark:text-slate-100">{children}</div>
    </div>
  );
}

function ResultPanel({
  result,
  name,
  record,
  stats,
  onAgain,
  onSetup,
  onGames,
}: {
  result: { summary: BalloonSummary; previousBest: number };
  name: (midi: number) => string;
  record: GameRecord | undefined;
  stats: ReturnType<BalloonPopGame['getState']>['stats'];
  onAgain: () => void;
  onSetup: () => void;
  onGames: () => void;
}) {
  const s = result.summary;
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-slate-900/40 p-3" data-testid="balloon-result" data-won={s.won} data-stars={s.stars}>
      <section className="grid w-full max-w-xl gap-3 rounded-3xl bg-white p-5 text-center text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100">
        <Stars stars={s.stars} className="text-5xl" />
        <h2 className="text-2xl font-extrabold">{s.won ? (s.stars === 3 ? 'Không sót quả nào! 🏆' : 'Hoàn thành! 🎉') : 'Bóng bay mất nhiều quá — thử lại nhé! 🎈'}</h2>
        <div className="text-4xl font-extrabold tabular-nums" data-testid="balloon-final-score">
          {s.score}
        </div>
        {s.score > result.previousBest && result.previousBest > 0 && <p className="font-bold text-fuchsia-600 dark:text-fuchsia-300">🏅 Kỷ lục mới!</p>}
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Bóng nổ" value={`${s.popped}/${s.total}`} />
          <Stat label="Chính xác" value={s.popped + s.wrongs > 0 ? `${Math.round(s.accuracy * 100)}%` : '—'} />
          <Stat label="Chuỗi dài nhất" value={`${s.bestCombo}`} />
          <Stat label="Bay mất" value={`${s.escaped}`} />
          <Stat label="Đánh sai" value={`${s.wrongs}`} />
          <Stat label="Kỷ lục" value={`${Math.max(s.score, record?.bestScore ?? 0)}`} />
        </dl>
        {s.weakNotes.length > 0 && (
          <p className="text-sm" data-testid="balloon-weak-notes">
            Nốt cần luyện thêm:{' '}
            {s.weakNotes
              .map((m) => {
                const confused = Object.entries(stats[m]?.confusedWith ?? {}).sort((a, b) => b[1] - a[1])[0];
                const other = confused ? name(Number(confused[0])) : '';
                return other ? `${name(m)} (hay nhầm với ${other})` : name(m);
              })
              .join(', ')}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onAgain} data-testid="balloon-again">
            <Icon name="restart" /> Chơi lại
          </Button>
          <Button onClick={onSetup} data-testid="balloon-change">
            Đổi chế độ
          </Button>
          <Button variant="ghost" onClick={onGames}>
            Về Trò chơi
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-pink-50 px-2 py-2 ring-1 ring-pink-100 dark:bg-slate-700/60 dark:ring-slate-600">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
