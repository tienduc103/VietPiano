import { useEffect, useMemo, useRef, useState } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import {
  BALLOON_DIFFICULTIES,
  BALLOON_DURATIONS,
  BALLOON_SPEEDS,
  balloonConfig,
  BalloonPopGame,
  DIFFICULTY_CONFIG,
  DIFFICULTY_LABEL,
  HUNT_MISTAKES,
  huntConfig,
  RAMP_EVERY,
  rampFactor,
  RUSH_SIZE,
  SPEED_LABEL,
  summarize,
  type BalloonDifficulty,
  type BalloonState,
  type BalloonSummary,
} from '../core/balloonPop/BalloonPopGame';
import { BALLOON_MODES, exactPitch, HAND_LABEL, keyboardRange, letterOf, LETTERS, MODE_INFO, noteName, notePool, SOLFEGE } from '../core/balloonPop/notes';
import {
  balloonKey,
  BALLOON_CLEF_LABEL,
  BALLOON_CLEFS,
  DISPLAY_LABEL,
  GAME_TYPE_LABEL,
  BALLOON_GAME_TYPES,
  handFor,
  huntPool,
  loadBalloonRecords,
  loadBalloonSettings,
  nextDisplay,
  saveBalloonResult,
  saveBalloonSettings,
  totalBalloonStars,
  type BalloonSettings,
} from '../core/balloonPop/storage';
import type { GameRecord } from '../core/curriculum/progress';
import type { ArcadeRecords } from '../core/games/arcade';
import { FINGER_NAME } from '../core/flappyNote/levels';
import { chooseBaseC, keyHintsFor } from '../core/input/keyMapping';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { BalloonCanvas, LETTER_COLORS, staffKey } from '../components/balloonPop/BalloonCanvas';
import { HandFigure, InputSourceBar } from '../components/curriculum/common';
import { Stars, useGameState, useKeyFlash } from '../components/games/shared';
import { useNoteCards } from '../components/balloonPop/useNoteCards';
import { MicButton } from '../components/MicPanel';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { Button, FullscreenButton, Icon, Segmented } from '../components/ui';
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
/** Thẻ khuông trên bóng: bỏ số chỉ nhịp cho thật gọn. */
type Update = (p: Partial<BalloonSettings>) => void;

/**
 * Bóng bay nốt nhạc: bóng mang nốt bay lên thẳng phía trên phím đàn — đánh đúng nốt để nổ bóng trước khi bóng bay mất.
 * Một màn duy nhất: chơi (bóng · piano ảo) + bảng ⚙ Cài đặt (chế độ 1 tay / 2 tay / 7 nốt / full phím, tay, độ khó, tốc độ,
 * nguồn nốt, gợi ý) mở ngay trên màn chơi + kết quả. Nốt trên bóng: tên Đô Rê Mi / CDEFGAB, hình nốt, hoặc "?" nghe đoán.
 * Nhận nốt từ đàn MIDI, bàn phím máy tính, piano ảo và micro qua `useNoteInput`; kỷ lục theo hồ sơ ở localStorage.
 */
export function BalloonPopScreen() {
  const [settings, setSettingsState] = useState<BalloonSettings>(loadBalloonSettings);
  const profileKey = useCurriculum((s) => s.profileKey);
  const [records, setRecords] = useState<ArcadeRecords>(() => loadBalloonRecords(profileKey));
  useEffect(() => setRecords(loadBalloonRecords(profileKey)), [profileKey]);
  const update: Update = (patch) =>
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      saveBalloonSettings(next);
      return next;
    });

  return <BalloonPlay settings={settings} update={update} records={records} onResult={(key, r) => setRecords((prev) => saveBalloonResult(profileKey, prev, key, r))} />;
}

/** Bảng cài đặt mở trên màn chơi: chế độ, tay, độ khó, tốc độ, nguồn nốt, gợi ý. Đổi chế độ / độ khó / tốc độ → ván mới. */
function SettingsPanel({ settings, records, update, onClose }: { settings: BalloonSettings; records: ArcadeRecords; update: Update; onClose: () => void }) {
  const hands = MODE_INFO[settings.mode].hands;
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-slate-900/40 p-3" data-testid="balloon-settings-panel" onClick={onClose}>
      <section
        className="mx-auto grid max-w-4xl gap-4 rounded-3xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
        aria-label="Cài đặt trò Bóng bay"
      >
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-2xl font-bold">⚙ Cài đặt</h2>
          <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="balloon-total-stars">
            ★ {totalBalloonStars(records)} sao · {starsText(records[balloonKey(settings)])}
          </span>
          <Button variant="primary" onClick={onClose} data-testid="balloon-settings-done">
            ✓ Xong
          </Button>
        </header>

        <div className="grid gap-2">
          <h3 className="text-lg font-bold">Kiểu chơi</h3>
          <Segmented value={settings.game} onChange={(game) => update({ game })} options={BALLOON_GAME_TYPES.map((g) => ({ value: g, label: GAME_TYPE_LABEL[g] }))} />
          {settings.game === 'hunt' && <HuntPicker settings={settings} update={update} />}
        </div>

        <div className="grid gap-2">
          <h3 className="text-lg font-bold">Chế độ</h3>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Chế độ">
            {BALLOON_MODES.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === settings.mode}
                onClick={() => update({ mode: m, hand: handFor(m, settings.hand) })}
                data-testid={`balloon-mode-${m}`}
                className={`grid min-h-12 rounded-2xl px-3 py-2 text-left ring-2 transition-colors ${m === settings.mode ? 'bg-pink-500 text-white ring-pink-300' : 'bg-white/90 ring-pink-100 hover:ring-pink-300 dark:bg-slate-700 dark:ring-slate-600'}`}
              >
                <span className="font-bold">{MODE_INFO[m].label}</span>
                <span className="text-sm opacity-80">{MODE_INFO[m].description}</span>
              </button>
            ))}
          </div>
          {hands.length > 0 && <Segmented value={settings.hand} onChange={(hand) => update({ hand })} options={hands.map((h) => ({ value: h, label: HAND_LABEL[h] }))} />}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-2">
            <h3 className="text-lg font-bold">Độ khó</h3>
            <Segmented value={settings.difficulty} onChange={(difficulty) => update({ difficulty })} options={BALLOON_DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} />
            <p className="text-sm text-slate-500 dark:text-slate-400">{DIFFICULTY_HELP[settings.difficulty]}</p>
            <h3 className="text-lg font-bold">Tốc độ</h3>
            <Segmented value={settings.speed} onChange={(speed) => update({ speed })} options={BALLOON_SPEEDS.map((s) => ({ value: s, label: SPEED_LABEL[s] }))} />
            <p className="text-sm text-slate-500 dark:text-slate-400">Mỗi quả bay hết màn hình trong khoảng {(balloonConfig(settings.difficulty, settings.speed).riseMs / 1000).toFixed(1)} giây.{' '}
              {settings.game === 'hunt' ? 'Tìm nốt: tốc độ đổi theo đúng / sai.' : `Cứ ${RAMP_EVERY} quả nhanh thêm 10%, mở đầu bằng một đợt ${RUSH_SIZE} quả bay dồn dập.`}
            </p>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-lg font-bold">Nguồn nốt</h3>
            <InputSourceBar />
            <p className="text-xs text-slate-500 dark:text-slate-400">Đàn MIDI · micro · bàn phím máy tính (A S D F… từ nốt Đô) · piano ảo trên màn hình.</p>
            <h3 className="text-lg font-bold">Hiển thị &amp; gợi ý</h3>
            <HintControls settings={settings} update={update} />
            <h3 className="text-lg font-bold">Khoá đọc hình nốt</h3>
            <Segmented value={settings.staffClef} onChange={(staffClef) => update({ staffClef })} options={BALLOON_CLEFS.map((c) => ({ value: c, label: BALLOON_CLEF_LABEL[c] }))} />
            <p className="text-sm text-slate-500 dark:text-slate-400">Chế độ Hình nốt: bóng chỉ vẽ khuông ngắn + nốt, không vẽ khoá — đọc theo khoá chọn ở đây.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * Góc trên bên phải khu chơi: các quả sắp bay ra (nốt theo cách hiện hiện tại) + tốc độ hiện tại;
 * đang có đợt bóng nhanh → báo "⚡ Đợt bóng nhanh!".
 */
function UpcomingPanel({ state, settings, withOctave, staffSvgs }: { state: BalloonState; settings: BalloonSettings; withOctave: boolean; staffSvgs: Map<string, string> | null }) {
  // Tìm nốt: tốc độ theo đúng / sai; Thường: theo mốc số bóng.
  const factor = settings.game === 'hunt' ? state.speed : rampFactor(Math.max(0, state.spawned - 1));
  const rush = state.balloons.some((b) => b.rush);
  const { display } = settings;
  return (
    <div className="pointer-events-none absolute top-2 right-2 grid justify-items-end gap-1" data-testid="balloon-upcoming" data-speed={factor.toFixed(1)}>
      {rush && (
        <span className="animate-pulse rounded-full bg-amber-400 px-3 py-1 text-sm font-extrabold text-slate-900 shadow" data-testid="balloon-rush">
          ⚡ Đợt bóng nhanh!
        </span>
      )}
      <div className="flex items-center gap-1.5 rounded-2xl bg-white/80 px-2 py-1 shadow-sm dark:bg-slate-900/70">
        <span className="text-xs leading-tight font-semibold text-slate-600 dark:text-slate-300">
          Sắp bay
          <br />
          <span className="tabular-nums">Tốc độ ×{factor.toFixed(1)}</span>
        </span>
        {state.upcoming.length === 0 && <span className="px-2 text-sm text-slate-500">— hết —</span>}
        {state.upcoming.map((u, i) => {
          const hidden = display === 'ear' || settings.hiddenLetters.includes(u.note.letter);
          const svg = display === 'staff' ? staffSvgs?.get(staffKey(u.note.midi, u.duration)) : undefined;
          return (
            <div key={i} className="grid justify-items-center" data-testid="balloon-upcoming-item" data-midi={u.note.midi} style={{ opacity: 1 - i * 0.2 }}>
              <div
                className="grid h-12 w-10 place-items-center rounded-[50%] text-sm font-extrabold text-white shadow [text-shadow:0_1px_2px_rgb(15_23_42/0.6)]"
                style={{ background: `radial-gradient(circle at 35% 30%, #fff 0, ${LETTER_COLORS[u.note.letter]} 35%)` }}
              >
                {svg ? (
                  <span className="h-10 w-7 rounded-md bg-white/95 text-slate-900 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
                ) : (
                  <span>{hidden || display === 'staff' ? '?' : noteName(u.note.midi, display === 'letter' ? 'letter' : 'solfege', withOctave)}</span>
                )}
              </div>
              <span className="h-2 w-px bg-slate-500" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Bảng chọn nốt cần đánh (kiểu Tìm nốt): ít nhất một nốt; nốt không có trong chế độ đang chọn bị mờ. */
function HuntPicker({ settings, update }: { settings: BalloonSettings; update: Update }) {
  const base = notePool(settings.mode, settings.hand);
  const available = new Set(base.map((n) => n.letter));
  const toggle = (l: (typeof LETTERS)[number]) => {
    const on = settings.huntLetters.includes(l);
    if (on && settings.huntLetters.length === 1) return;
    update({ huntLetters: on ? settings.huntLetters.filter((x) => x !== l) : LETTERS.filter((x) => x === l || settings.huntLetters.includes(x)) });
  };
  return (
    <div className="grid gap-2 rounded-2xl bg-violet-50 p-3 dark:bg-slate-700/60" data-testid="balloon-hunt-picker">
      <p className="text-sm">
        Chọn nốt cần tìm. Đánh <b>đúng</b> → bóng bay <b>chậm lại</b>; đánh <b>sai</b> hoặc để bóng bay mất → bóng <b>nhanh dần</b>. Sai {HUNT_MISTAKES} lần là hết ván.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Nốt cần tìm">
        {LETTERS.map((l) => {
          const on = settings.huntLetters.includes(l);
          return (
            <button
              key={l}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(l)}
              data-testid={`balloon-hunt-${l}`}
              className={`min-h-12 min-w-14 rounded-2xl px-3 font-extrabold ring-2 transition ${on ? 'text-white ring-transparent' : 'bg-white text-slate-500 ring-slate-200 dark:bg-slate-800 dark:ring-slate-600'} ${available.has(l) ? '' : 'opacity-40'}`}
              style={on ? { background: LETTER_COLORS[l] } : undefined}
            >
              {settings.labelStyle === 'letter' ? l : SOLFEGE[l]}
            </button>
          );
        })}
      </div>
      {!settings.huntLetters.some((l) => available.has(l)) && (
        <p className="text-sm text-amber-700 dark:text-amber-300">Chế độ này không có nốt đã chọn → chơi với mọi nốt của chế độ.</p>
      )}
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

/** Gợi ý dùng chung ở bảng cài đặt và thanh trên màn chơi: cách hiện nốt trên bóng, phím cần đánh, ngón tay, tên phím + ẩn từng nốt. */
function HintControls({ settings, update, compact = false }: { settings: BalloonSettings; update: Update; compact?: boolean }) {
  const toggleLetter = (l: (typeof LETTERS)[number]) =>
    update({ hiddenLetters: settings.hiddenLetters.includes(l) ? settings.hiddenLetters.filter((x) => x !== l) : LETTERS.filter((x) => x === l || settings.hiddenLetters.includes(x)) });
  const textOnBalloon = settings.display === 'letter' || settings.display === 'solfege';
  return (
    <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      <button
        type="button"
        onClick={() => update(nextDisplay(settings))}
        data-testid="balloon-display"
        data-display={settings.display}
        aria-label={`Nốt trên bóng: ${DISPLAY_LABEL[settings.display]} — bấm để đổi`}
        title="Đổi cách hiện nốt trên bóng: Đô Rê Mi → CDEFGAB → Hình nốt → ? (nghe đoán)"
        className="min-h-12 rounded-xl bg-fuchsia-600 px-3 text-sm font-bold text-white ring-2 ring-fuchsia-300"
      >
        {DISPLAY_LABEL[settings.display]} ⇄
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
      {(settings.showKeyLabels || textOnBalloon) && (
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Ẩn tên từng nốt (trên bóng và phím)" data-testid="balloon-hide-keys">
          <span className="px-1 text-xs text-slate-500 dark:text-slate-400">Ẩn tên:</span>
          {LETTERS.map((l) => {
            const hidden = settings.hiddenLetters.includes(l);
            return (
              <button
                key={l}
                type="button"
                aria-pressed={hidden}
                onClick={() => toggleLetter(l)}
                data-testid={`balloon-hide-${l}`}
                title={hidden ? 'Hiện lại tên nốt này' : 'Ẩn tên nốt này (trên bóng và phím)'}
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
}: {
  settings: BalloonSettings;
  update: Update;
  records: ArcadeRecords;
  onResult: (key: string, r: { score: number; stars: number }) => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const inputSource = useSettings((s) => s.settings.inputSource);
  const micStatus = useMic((s) => s.status);
  const micLive = useMic((s) => s.live);
  const { mode, hand, difficulty, speed, display } = settings;
  const recordKey = balloonKey(settings);
  const keyboard = useMemo(() => keyboardRange(mode, hand), [mode, hand]);
  const keyHints = useMemo(() => keyHintsFor(chooseBaseC([keyboard.from])), [keyboard]);
  const withOctave = exactPitch(mode);
  const [panelOpen, setPanelOpen] = useState(false);

  const [run, setRun] = useState(0);
  const hunt = settings.game === 'hunt';
  const huntKey = settings.huntLetters.join('');
  const pool = useMemo(
    () => (hunt ? huntPool(notePool(mode, hand), settings.huntLetters) : notePool(mode, hand)),
    // `huntKey` đại diện cho `settings.huntLetters`.
    [mode, hand, hunt, huntKey],
  );
  const game = useMemo(
    () => new BalloonPopGame(mode, pool, hunt ? huntConfig(difficulty, speed) : balloonConfig(difficulty, speed)),
    // Ván mới mỗi lần "Chơi lại" / đổi chế độ.
    [mode, pool, hunt, difficulty, speed, run],
  );
  const state = useGameState(game);
  const urgent = state.balloons[0] ?? null;

  // Hình nốt: vẽ sẵn mỗi nốt × trường độ một thẻ khuông (tay trái khoá Fa, tay phải khoá Sol) — chỉ khi đang dùng chế độ này.
  const cards = useMemo(
    () =>
      display === 'staff'
        ? pool.flatMap((n) => BALLOON_DURATIONS.map((d) => ({ key: staffKey(n.midi, d), midi: n.midi, duration: d })))
        : [],
    [pool, display],
  );
  const staffSvgs = useNoteCards(cards, settings.staffClef);

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

  // Hiệu ứng âm thanh: nổ bóng, bóng bay mất. Chế độ "?": mỗi quả bay lên kèm tiếng nốt của nó (micro tự bỏ nốt lúc app phát).
  const prev = useRef(state);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (display === 'ear' && state.spawned > p.spawned) {
      const b = state.balloons[state.balloons.length - 1];
      if (b) soundOutput.playNote(b.note.midi, 0.9);
    }
    if (!sfxRef.current) return;
    if (state.popped > p.popped) {
      soundOutput.scheduleNote(96, 0.02, 0.05, 60);
      soundOutput.scheduleNote(103, 0.06, 0.08, 50);
    }
    if (state.escaped > p.escaped) soundOutput.scheduleNote(43, 0, 0.3, 90);
  }, [state, display]);

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
  useEffect(() => setResult(null), [game]);
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

  const start = () => {
    soundOutput.unlock();
    game.start(performance.now());
  };
  const restart = () => {
    soundOutput.unlock();
    setResult(null);
    setRun((r) => r + 1);
  };
  const openSettings = () => {
    game.pause(performance.now());
    setResult(null);
    setPanelOpen(true);
  };
  const paused = state.status === 'paused';
  // Tên chỉ hiện ở chế độ tên chữ (hình nốt / nghe đoán: người chơi tự đọc / tự nghe).
  const urgentName = !urgent ? null : display === 'staff' || display === 'ear' || settings.hiddenLetters.includes(urgent.note.letter) ? '?' : noteName(urgent.note.midi, display, withOctave);
  const hint = display === 'staff' ? 'đọc hình nốt' : display === 'ear' ? 'nghe đoán nốt' : withOctave ? 'phải đúng phím' : 'chỉ cần đúng tên nốt';

  return (
    <div
      className="relative flex h-full flex-col gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:px-4"
      data-testid="balloon-screen"
      data-status={state.status}
      data-urgent={urgent?.note.midi ?? ''}
      data-balloons={state.balloons.length}
      data-popped={state.popped}
      data-lives={state.lives}
      data-fireworks={state.fireworks}
      data-mistakes={state.mistakes}
      data-speed={state.speed}
    >
      <header className="flex flex-wrap items-center gap-2 pl-10">
        <Button variant="ghost" className="px-2" aria-label="Về mục Trò chơi" onClick={() => navigate({ name: 'games' })}>
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="truncate text-xl font-bold">
            {hunt ? '🔎 Tìm nốt' : '🎈 Bóng bay'} · {MODE_INFO[mode].label}
          </h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {MODE_INFO[mode].hands.length > 0 && `${HAND_LABEL[hand]} · `}
            {DIFFICULTY_LABEL[difficulty]} · {SPEED_LABEL[speed]} · {hint}
          </p>
        </div>
        <div className="flex items-center gap-4 text-lg font-bold tabular-nums">
          <span data-testid="balloon-score">⭐ {state.score}</span>
          <span data-testid="balloon-count">
            🎈 {state.popped}
            {hunt ? '' : `/${game.config.balloons}`}
          </span>
          {hunt ? (
            <span
              aria-label={`Sai ${state.mistakes} trên ${HUNT_MISTAKES} lần`}
              data-testid="balloon-mistakes"
              className={state.mistakes >= HUNT_MISTAKES - 5 ? 'text-rose-600 dark:text-rose-400' : ''}
            >
              ✕ {state.mistakes}/{HUNT_MISTAKES}
            </span>
          ) : (
            <span aria-label={`${state.lives} mạng`} data-testid="balloon-lives">
              {'❤️'.repeat(Math.max(0, state.lives))}
              <span className="opacity-30">{'🤍'.repeat(Math.max(0, game.config.lives - state.lives))}</span>
            </span>
          )}
          <span className={`text-fuchsia-600 transition-opacity dark:text-fuchsia-300 ${state.combo >= 2 ? 'opacity-100' : 'opacity-0'}`}>Chuỗi ×{state.combo}</span>
        </div>
        {inputSource !== 'midi' && <MicButton compact />}
        <Button onClick={openSettings} data-testid="balloon-settings" aria-label="Cài đặt">
          ⚙ Cài đặt
        </Button>
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
          {display === 'ear' && (
            <Button onClick={() => urgent && soundOutput.playNote(urgent.note.midi, 0.9)} disabled={!urgent} data-testid="balloon-replay" aria-label="Nghe lại nốt của bóng cần nổ trước">
              🔊 Nghe lại
            </Button>
          )}
        </div>
        <div className="ml-auto">
          <HintControls settings={settings} update={update} compact />
        </div>
      </div>

      <div className="relative min-h-48 flex-1 overflow-hidden rounded-3xl ring-1 ring-sky-200 dark:ring-slate-700">
        <BalloonCanvas game={game} view={{ from: keyboard.from, to: keyboard.to, withOctave, showFinger: settings.showFinger, display, hiddenLetters: settings.hiddenLetters, staffSvgs }} />
        {state.status !== 'ready' && <UpcomingPanel state={state} settings={settings} withOctave={withOctave} staffSvgs={staffSvgs} />}
        {state.status === 'ready' && !panelOpen && (
          <Overlay testId="balloon-ready">
            <p className="text-2xl font-extrabold">Sẵn sàng chưa? 🎈</p>
            <p className="text-sm opacity-80">
              {MODE_INFO[mode].label}
              {MODE_INFO[mode].hands.length > 0 && ` · ${HAND_LABEL[hand]}`} · {DIFFICULTY_LABEL[difficulty]} · {SPEED_LABEL[speed]} · {starsText(records[recordKey])}
            </p>
            {hunt && (
              <p className="text-sm font-semibold" data-testid="balloon-hunt-notes">
                🔎 Tìm nốt: {[...new Set(pool.map((n) => n.letter))].map((l) => noteName(pool.find((n) => n.letter === l)!.midi, settings.labelStyle, false)).join(' · ')} — đúng thì
                bóng chậm lại, sai thì nhanh dần, sai {HUNT_MISTAKES} lần là hết.
              </p>
            )}
            <p className="text-sm opacity-80">
              {display === 'ear'
                ? 'Mỗi quả bay lên kèm tiếng nốt — nghe rồi đánh đúng nốt đó để làm nổ bóng!'
                : `Bóng bay lên phía trên phím của nó. Đánh đúng ${withOctave ? 'phím (đúng quãng tám)' : 'tên nốt'} để làm nổ bóng!`}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" className="min-h-14 text-lg" onClick={start} data-testid="balloon-go">
                <Icon name="play" /> Bắt đầu
              </Button>
              <Button className="min-h-14" onClick={openSettings} data-testid="balloon-ready-settings">
                ⚙ Đổi chế độ
              </Button>
            </div>
          </Overlay>
        )}
        {paused && !panelOpen && (
          <Overlay testId="balloon-paused">
            <p className="text-2xl font-extrabold">⏸ Đang tạm dừng</p>
            <Button variant="primary" onClick={() => game.resume(performance.now())}>
              <Icon name="play" /> Chơi tiếp
            </Button>
          </Overlay>
        )}
        {result && !panelOpen && (
          <ResultPanel
            result={result}
            name={(m) => noteName(m, settings.labelStyle, withOctave)}
            record={records[recordKey]}
            stats={state.stats}
            onAgain={restart}
            onSetup={openSettings}
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

      {panelOpen && <SettingsPanel settings={settings} records={records} update={update} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}

function Overlay({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-4" data-testid={testId}>
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
  // Tìm nốt: không giới hạn số bóng.
  const hunt = s.total === Infinity;
  return (
    <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-slate-900/40 p-3" data-testid="balloon-result" data-won={s.won} data-stars={s.stars}>
      <section className="grid w-full max-w-xl gap-3 rounded-3xl bg-white p-5 text-center text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100">
        <Stars stars={s.stars} className="text-5xl" />
        <h2 className="text-2xl font-extrabold">
          {hunt
            ? `Hết ${HUNT_MISTAKES} lần sai — tìm được ${s.popped} nốt! ${s.stars > 0 ? '🎉' : '🔎'}`
            : s.won
              ? s.stars === 3
                ? 'Không sót quả nào! 🏆'
                : 'Hoàn thành! 🎉'
              : 'Bóng bay mất nhiều quá — thử lại nhé! 🎈'}
        </h2>
        <div className="text-4xl font-extrabold tabular-nums" data-testid="balloon-final-score">
          {s.score}
        </div>
        {s.score > result.previousBest && result.previousBest > 0 && <p className="font-bold text-fuchsia-600 dark:text-fuchsia-300">🏅 Kỷ lục mới!</p>}
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Bóng nổ" value={hunt ? `${s.popped}` : `${s.popped}/${s.total}`} />
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
            ⚙ Đổi chế độ
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
