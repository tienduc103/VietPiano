import { useEffect, useMemo, useRef, useState } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import type { GameRecord } from '../core/curriculum/progress';
import { DIFFICULTIES, DIFFICULTY_LABEL, DIFFICULTY_CONFIG, FlappyNoteGame, summarize, type FlappyDifficulty, type FlappySummary } from '../core/flappyNote/FlappyNoteGame';
import { FLAPPY_LEVELS, findLevel, melodyNotes, type FlappyLevel, type FlappyNote } from '../core/flappyNote/levels';
import {
  bestStarsOfLevel,
  flappyKey,
  loadFlappyRecords,
  loadFlappySettings,
  MAX_TOTAL_STARS,
  rankFor,
  saveFlappyResult,
  saveFlappySettings,
  totalStars,
  type FlappySettings,
} from '../core/flappyNote/storage';
import type { ArcadeRecords } from '../core/games/arcade';
import { keyboardFor } from '../core/games/gameForLesson';
import { chooseBaseC, keyHintsFor } from '../core/input/keyMapping';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { midiToLabel, pitchToLabel } from '../core/music/notes';
import { InputSourceBar } from '../components/curriculum/common';
import { FlappyCanvas } from '../components/flappyNote/FlappyCanvas';
import { NoteGuide, staffCardKey } from '../components/flappyNote/NoteGuide';
import { NoteStrip } from '../components/flappyNote/NoteStrip';
import { Stars, useGameState, useKeyFlash } from '../components/games/shared';
import { useStaffCards } from '../components/games/StaffShootView';
import { MicButton } from '../components/MicPanel';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { Button, FullscreenButton, Icon, Segmented } from '../components/ui';
import { useNoteInput } from '../hooks/useNoteInput';
import { useUiMode } from '../hooks/useUiMode';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { useMic } from '../store/micStore';
import { useSettings } from '../store/settingsStore';

const DIFFICULTY_HELP: Record<FlappyDifficulty, string> = {
  'super-easy': `Rơi rất chậm, đánh nhiều nốt liên tục; nốt dài (trắng, tròn) bay cao hơn · ${DIFFICULTY_CONFIG['super-easy'].lives} mạng · ${DIFFICULTY_CONFIG['super-easy'].pipes} ống`,
  easy: `Chim bay chậm, khe ống rộng, ${DIFFICULTY_CONFIG.easy.lives} mạng · ${DIFFICULTY_CONFIG.easy.pipes} ống`,
  normal: `Nhanh hơn, khe hẹp hơn, ${DIFFICULTY_CONFIG.normal.lives} mạng · ${DIFFICULTY_CONFIG.normal.pipes} ống`,
  hard: `Rơi nhanh — phải đọc nốt thật nhanh, ${DIFFICULTY_CONFIG.hard.lives} mạng · ${DIFFICULTY_CONFIG.hard.pipes} ống`,
};

const starsText = (r: GameRecord | undefined) => (r && r.plays > 0 ? `${'★'.repeat(r.bestStars)}${'☆'.repeat(3 - r.bestStars)} · kỷ lục ${r.bestScore}` : 'Chưa chơi');
/** Thẻ khuông của dải nốt: bỏ số chỉ nhịp cho thật gọn. */
const STRIP_STAFF = { timeSignature: false };

type Update = (p: Partial<FlappySettings>) => void;

/**
 * Flappy Note: chú chim nốt nhạc bay qua các ống — mỗi nốt đánh ĐÚNG là một lần vỗ cánh.
 * Một màn duy nhất: chơi (khu A hướng dẫn nốt · khu B trò chơi · khu C piano ảo) + bảng ⚙ Cài đặt (màn chơi, chế độ,
 * độ khó, gợi ý, nguồn nốt) mở ngay trên màn chơi + kết quả.
 * Nhận nốt từ đàn MIDI, bàn phím máy tính, piano ảo (và micro) qua `useNoteInput`; kỷ lục theo hồ sơ ở localStorage.
 */
export function FlappyNoteScreen() {
  const [settings, setSettingsState] = useState<FlappySettings>(loadFlappySettings);
  const profileKey = useCurriculum((s) => s.profileKey);
  const [records, setRecords] = useState<ArcadeRecords>(() => loadFlappyRecords(profileKey));
  useEffect(() => setRecords(loadFlappyRecords(profileKey)), [profileKey]);
  const update: Update = (patch) =>
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      saveFlappySettings(next);
      return next;
    });

  return <FlappyPlay settings={settings} update={update} records={records} onResult={(key, r) => setRecords((prev) => saveFlappyResult(profileKey, prev, key, r))} />;
}

/** Bảng cài đặt mở trên màn chơi: danh hiệu, màn chơi, chế độ + giai điệu, độ khó, gợi ý, nguồn nốt. Đổi màn / chế độ / độ khó → ván mới. */
function SettingsPanel({ settings, records, update, onClose }: { settings: FlappySettings; records: ArcadeRecords; update: Update; onClose: () => void }) {
  const level = findLevel(settings.levelId) ?? FLAPPY_LEVELS[0];
  const total = totalStars(records);
  const rank = rankFor(total);
  const melody = level.melodies.find((m) => m.id === settings.melodyId);
  const hints: { key: 'showName' | 'showFinger' | 'highlightKey' | 'showUpcoming' | 'sound'; label: string }[] = [
    { key: 'showName', label: 'Tên nốt' },
    { key: 'showFinger', label: 'Ngón tay' },
    { key: 'highlightKey', label: 'Tô phím cần đánh' },
    { key: 'showUpcoming', label: 'Nốt tiếp theo' },
    { key: 'sound', label: 'Âm thanh' },
  ];
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-slate-900/40 p-3" data-testid="flappy-settings-panel" onClick={onClose}>
      <section
        className="mx-auto grid max-w-5xl gap-4 rounded-3xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
        aria-label="Cài đặt Flappy Note"
      >
        <header className="flex flex-wrap items-center gap-4">
          <h2 className="text-2xl font-bold">⚙ Cài đặt</h2>
          <span className="text-4xl" aria-hidden>
            {rank.current.icon}
          </span>
          <div className="grid min-w-56 flex-1 gap-1">
            <p className="font-bold">{rank.current.title}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400" data-testid="flappy-total-stars">
              ★ {total}/{MAX_TOTAL_STARS} sao{rank.next ? ` · còn ${rank.next.stars - total} sao nữa để thành ${rank.next.icon} ${rank.next.title}` : ' · danh hiệu cao nhất!'}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-slate-700" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500" style={{ width: `${(total / MAX_TOTAL_STARS) * 100}%` }} />
            </div>
          </div>
          <Button variant="primary" className="min-w-40 text-lg" onClick={onClose} data-testid="flappy-settings-done">
            ✓ Xong
          </Button>
        </header>

        <div className="grid gap-2">
          <h3 className="text-lg font-bold">Màn chơi</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Màn chơi">
            {FLAPPY_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={l.id === level.id}
                onClick={() => update({ levelId: l.id, melodyId: l.melodies[0]?.id ?? '', mode: l.melodies.length ? settings.mode : 'random' })}
                data-testid={`flappy-level-${l.id}`}
                className={`grid min-h-12 rounded-2xl px-3 py-2 text-left ring-2 transition-colors ${l.id === level.id ? 'bg-sky-500 text-white ring-sky-300' : 'bg-white/90 ring-sky-100 hover:ring-sky-300 dark:bg-slate-700 dark:ring-slate-600'}`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{l.label}</span>
                  <span className={`shrink-0 text-xs ${l.id === level.id ? '' : 'text-amber-600 dark:text-amber-300'}`}>{starsText(bestStarsOfLevel(records, l.id))}</span>
                </span>
                <span className="truncate text-sm opacity-80">{l.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-2">
            <h3 className="text-lg font-bold">Chế độ</h3>
            <Segmented
              value={settings.mode}
              onChange={(mode) => update({ mode })}
              options={[
                { value: 'random', label: '🎲 Nốt ngẫu nhiên' },
                ...(level.melodies.length ? [{ value: 'sequence' as const, label: '🎼 Chuỗi nốt' }] : []),
              ]}
            />
            {settings.mode === 'sequence' && (
              <>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Giai điệu">
                  {level.melodies.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={m.id === settings.melodyId}
                      onClick={() => update({ melodyId: m.id })}
                      data-testid={`flappy-melody-${m.id}`}
                      className={`min-h-12 rounded-xl px-3 text-sm font-semibold ring-2 ${m.id === settings.melodyId ? 'bg-fuchsia-500 text-white ring-fuchsia-300' : 'bg-white/90 ring-violet-100 dark:bg-slate-700 dark:ring-violet-900'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {melody && <p className="text-xs text-slate-500 dark:text-slate-400">Nguồn: {melody.source}</p>}
              </>
            )}
            <h3 className="text-lg font-bold">Độ khó</h3>
            <Segmented value={settings.difficulty} onChange={(difficulty) => update({ difficulty })} options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {DIFFICULTY_HELP[settings.difficulty]} · {starsText(records[flappyKey(level.id, settings.difficulty)])}
            </p>
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-lg font-bold">Gợi ý</h3>
            <div className="flex flex-wrap gap-2">
              {hints.map((h) => (
                <button
                  key={h.key}
                  type="button"
                  role="switch"
                  aria-checked={settings[h.key]}
                  onClick={() => update({ [h.key]: !settings[h.key] })}
                  data-testid={`flappy-hint-${h.key}`}
                  className={`min-h-12 rounded-xl px-3 text-sm font-semibold ring-2 transition-colors ${settings[h.key] ? 'bg-violet-600 text-white ring-violet-300' : 'bg-white/90 text-slate-500 ring-slate-200 dark:bg-slate-700 dark:ring-slate-600'}`}
                >
                  {settings[h.key] ? '✓ ' : ''}
                  {h.label}
                </button>
              ))}
            </div>
            <h3 className="text-lg font-bold">Nguồn nốt</h3>
            <InputSourceBar />
            <p className="text-xs text-slate-500 dark:text-slate-400">Đàn MIDI · bàn phím máy tính (A S D F… từ nốt Đô) · piano ảo trên màn hình luôn dùng được.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Nốt của ván: chuỗi giai điệu (chế độ Chuỗi nốt) hoặc mọi nốt của màn. */
function runNotes(level: FlappyLevel, s: FlappySettings): FlappyNote[] {
  const melody = level.melodies.find((m) => m.id === s.melodyId);
  return s.mode === 'sequence' && melody ? melodyNotes(level, melody) : [...level.notes];
}

function FlappyPlay({
  settings,
  update,
  records,
  onResult,
}: {
  settings: FlappySettings;
  update: Update;
  records: ArcadeRecords;
  onResult: (key: string, r: { score: number; stars: number }) => void;
}) {
  const navigate = useApp((s) => s.navigate);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const inputSource = useSettings((s) => s.settings.inputSource);
  const micStatus = useMic((s) => s.status);
  const micLive = useMic((s) => s.live);
  const kids = useUiMode() === 'kids';
  const level = findLevel(settings.levelId) ?? FLAPPY_LEVELS[0];
  const notes = useMemo(() => runNotes(level, settings), [level, settings]);
  const recordKey = flappyKey(level.id, settings.difficulty);

  const [run, setRun] = useState(0);
  const game = useMemo(
    () => new FlappyNoteGame(notes, { mode: settings.mode === 'sequence' ? 'sequence' : 'random', difficulty: settings.difficulty }),
    // Ván mới mỗi lần "Chơi lại".
    [notes, settings.mode, settings.difficulty, run],
  );
  const state = useGameState(game);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelOpenRef = useRef(panelOpen);
  panelOpenRef.current = panelOpen;

  // Dải nốt giữa màn (Siêu dễ): thẻ khuông thật ngắn vẽ sẵn cho từng nốt × trường độ có thể gặp
  // (khoá Sol tay phải, khoá Fa tay trái; chỉ khoá nhạc + nốt, không số chỉ nhịp) để tập đọc nốt.
  const withDurations = game.config.durations.length > 0;
  const stripCards = useMemo(() => {
    if (!withDurations) return [];
    const durations = [...new Set([...game.config.durations, ...notes.flatMap((n) => (n.duration ? [n.duration] : []))])];
    return level.notes.flatMap((n) => durations.map((d) => ({ key: staffCardKey({ ...n, duration: d }), notation: `${n.pitch}/${d}`, clef: n.clef })));
  }, [level, notes, withDurations, game.config.durations]);
  const stripSvgs = useStaffCards(stripCards, undefined, STRIP_STAFF);

  const keyboard = useMemo(() => keyboardFor(level.notes.map((n) => n.midi)), [level]);
  const keyHints = useMemo(() => keyHintsFor(chooseBaseC([keyboard.from])), [keyboard]);
  const micRunning = micStatus === 'running';
  // Tiếng hiệu ứng lọt vào micro → chỉ phát khi micro tắt.
  const sfx = settings.sound && !micRunning;
  const sfxRef = useRef(sfx);
  sfxRef.current = sfx;

  useNoteInput(
    {
      onNote: (e) => {
        // Đang mở bảng cài đặt → không cất cánh / không tính nốt.
        if (panelOpenRef.current) return;
        const r = game.answer(e.midi, e.time);
        // Piano ảo / bàn phím máy tính không có tiếng — phát nốt để nghe cao độ (đàn MIDI tự có tiếng).
        if (r !== 'ignored' && e.source === 'virtual' && sfxRef.current) soundOutput.playNote(e.midi, 0.35);
      },
    },
    inputSource,
    { baseMidi: keyboard.from },
  );

  // Hiệu ứng âm thanh: qua ống, va chạm.
  const prev = useRef(state);
  useEffect(() => {
    const p = prev.current;
    prev.current = state;
    if (!sfxRef.current) return;
    if (state.pipesPassed > p.pipesPassed) {
      soundOutput.scheduleNote(84, 0, 0.08, 70);
      soundOutput.scheduleNote(91, 0.07, 0.12, 70);
    }
    if (state.crashes > p.crashes) soundOutput.scheduleNote(40, 0, 0.25, 110);
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
  const [result, setResult] = useState<{ summary: FlappySummary; previousBest: number; rankBefore: string; rankAfter: string } | null>(null);
  // Đổi cài đặt → ván mới: bỏ kết quả của ván cũ.
  useEffect(() => setResult(null), [game]);
  useEffect(() => {
    if (state.status !== 'won' && state.status !== 'over') return;
    const summary = summarize(game);
    const before = totalStars(records);
    const prevRecord = records[recordKey];
    const gained = Math.max(0, summary.stars - (prevRecord?.bestStars ?? 0));
    onResult(recordKey, { score: summary.score, stars: summary.stars });
    const id = window.setTimeout(
      () => setResult({ summary, previousBest: prevRecord?.bestScore ?? 0, rankBefore: rankFor(before).current.title, rankAfter: rankFor(before + gained).current.title }),
      900,
    );
    return () => window.clearTimeout(id);
    // Chỉ chạy khi ván vừa kết thúc.
  }, [state.status, game]);

  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome === 'crash' ? null : state.lastOutcome);
  const [guideFlash, setGuideFlash] = useState<'hit' | 'wrong' | null>(null);
  useEffect(() => {
    if (state.lastOutcome !== 'hit' && state.lastOutcome !== 'wrong') return;
    setGuideFlash(state.lastOutcome);
    const id = window.setTimeout(() => setGuideFlash(null), 350);
    return () => window.clearTimeout(id);
  }, [state.lastEventTime]);

  const restart = () => {
    soundOutput.unlock();
    setResult(null);
    setRun((r) => r + 1);
  };
  const openSettings = () => {
    game.pause(performance.now());
    setPanelOpen(true);
  };
  const closeSettings = () => {
    setPanelOpen(false);
    // Ván đã kết thúc (kết quả đang mở) → đóng bảng là vào ván mới với cài đặt hiện tại.
    const { status } = game.getState();
    if (status === 'won' || status === 'over') restart();
  };
  const paused = state.status === 'paused';
  const targetLabel = pitchToLabel(state.target.pitch, labelStyle);

  return (
    <div
      className="relative flex h-full flex-col gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:px-4"
      data-testid="flappy-screen"
      data-status={state.status}
      data-target={state.target.midi}
      data-lives={state.lives}
      data-pipes={state.pipesPassed}
    >
      <header className="flex flex-wrap items-center gap-2 pl-10">
        <Button variant="ghost" className="px-2" aria-label="Về mục Trò chơi" onClick={() => navigate({ name: 'games' })}>
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1 basis-48">
          <h1 className="truncate text-xl font-bold">🐤 Flappy Note · {level.label}</h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400">
            {settings.mode === 'sequence' ? `Chuỗi nốt: ${level.melodies.find((m) => m.id === settings.melodyId)?.label ?? ''}` : 'Nốt ngẫu nhiên'} · {DIFFICULTY_LABEL[settings.difficulty]}
          </p>
        </div>
        <div className="flex items-center gap-4 text-lg font-bold tabular-nums">
          <span data-testid="flappy-score">⭐ {state.score}</span>
          <span data-testid="flappy-pipes">
            🏁 {state.pipesPassed}/{game.config.pipes}
          </span>
          <span aria-label={`${state.lives} mạng`} data-testid="flappy-lives">
            {'❤️'.repeat(Math.max(0, state.lives))}
            <span className="opacity-30">{'🤍'.repeat(Math.max(0, game.config.lives - state.lives))}</span>
          </span>
          <span className={`text-fuchsia-600 transition-opacity dark:text-fuchsia-300 ${state.combo >= 2 ? 'opacity-100' : 'opacity-0'}`}>Chuỗi ×{state.combo}</span>
        </div>
        {inputSource !== 'midi' && <MicButton compact />}
        <Button onClick={openSettings} data-testid="flappy-settings" aria-label="Cài đặt">
          ⚙ Cài đặt
        </Button>
        <Button
          variant="primary"
          onClick={() => (paused ? game.resume(performance.now()) : game.pause(performance.now()))}
          disabled={state.status !== 'playing' && !paused}
          data-testid="flappy-pause"
          aria-label={paused ? 'Chơi tiếp' : 'Tạm dừng'}
          className="min-w-28"
        >
          <Icon name={paused ? 'play' : 'pause'} />
          {paused ? 'Tiếp' : 'Dừng'}
        </Button>
        <Button onClick={restart} aria-label="Chơi lại từ đầu" data-testid="flappy-restart">
          <Icon name="restart" />
        </Button>
        <FullscreenButton />
      </header>

      <NoteGuide
        target={state.target}
        upcoming={state.upcoming}
        labelStyle={labelStyle}
        showName={settings.showName}
        showFinger={settings.showFinger}
        // Có dải nốt sắp đánh trong khu trò chơi thì khu hướng dẫn không lặp lại.
        showUpcoming={settings.showUpcoming && !withDurations}
        kids={kids}
        flash={guideFlash}
      />

      <div className="relative min-h-48 flex-1 overflow-hidden rounded-3xl ring-1 ring-sky-200 dark:ring-slate-700">
        <FlappyCanvas game={game} />
        {withDurations && <NoteStrip notes={[state.target, ...state.upcoming]} svgs={stripSvgs} />}
        {state.status === 'ready' && !panelOpen && (
          <Overlay testId="flappy-ready">
            <p className="text-2xl font-extrabold">Đánh nốt {settings.showName ? targetLabel : 'trên khuông'} để cất cánh! 🐤</p>
            <p className="text-sm opacity-80">Mỗi nốt đúng = một lần vỗ cánh. Đánh sai thì chim không bay lên.</p>
            <Button className="min-h-12" onClick={openSettings} data-testid="flappy-ready-settings">
              ⚙ Đổi màn / độ khó
            </Button>
          </Overlay>
        )}
        {paused && !panelOpen && (
          <Overlay testId="flappy-paused">
            <p className="text-2xl font-extrabold">⏸ Đang tạm dừng</p>
            <Button variant="primary" onClick={() => game.resume(performance.now())}>
              <Icon name="play" /> Chơi tiếp
            </Button>
          </Overlay>
        )}
        {result && !panelOpen && (
          <ResultPanel
            result={result}
            labelStyle={labelStyle}
            level={level}
            record={records[recordKey]}
            stats={state.stats}
            onAgain={restart}
            onSetup={openSettings}
            onGames={() => navigate({ name: 'games' })}
          />
        )}
      </div>

      <div className="h-28 shrink-0 sm:h-32" data-testid="flappy-keyboard">
        <PianoKeyboard
          from={keyboard.from}
          to={keyboard.to}
          expected={settings.highlightKey ? state.target.midi : null}
          expectedFinger={settings.showFinger ? state.target.finger : undefined}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={labelStyle}
          keyHints={inputSource === 'midi' ? undefined : keyHints}
          onPress={(m) => virtualInput.press(m)}
          onRelease={(m) => virtualInput.release(m)}
        />
      </div>

      {panelOpen && <SettingsPanel settings={settings} records={records} update={update} onClose={closeSettings} />}
    </div>
  );
}

function Overlay({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/3 justify-center px-4" data-testid={testId}>
      <div className="pointer-events-auto grid justify-items-center gap-2 rounded-3xl bg-white/90 px-6 py-4 text-center text-slate-900 shadow-lg ring-2 ring-amber-300 dark:bg-slate-900/90 dark:text-slate-100">{children}</div>
    </div>
  );
}

function ResultPanel({
  result,
  labelStyle,
  level,
  record,
  stats,
  onAgain,
  onSetup,
  onGames,
}: {
  result: { summary: FlappySummary; previousBest: number; rankBefore: string; rankAfter: string };
  labelStyle: 'letter' | 'solfege';
  level: FlappyLevel;
  record: GameRecord | undefined;
  stats: ReturnType<FlappyNoteGame['getState']>['stats'];
  onAgain: () => void;
  onSetup: () => void;
  onGames: () => void;
}) {
  const s = result.summary;
  const name = (m: number) => {
    const pitch = level.notes.find((n) => n.midi === m)?.pitch;
    return pitch ? pitchToLabel(pitch, labelStyle) : midiToLabel(m, labelStyle);
  };
  return (
    <div className="absolute inset-0 grid place-items-center overflow-y-auto bg-slate-900/40 p-3" data-testid="flappy-result" data-won={s.won} data-stars={s.stars}>
      <section className="grid w-full max-w-xl gap-3 rounded-3xl bg-white p-5 text-center text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100">
        <Stars stars={s.stars} className="text-5xl" />
        <h2 className="text-2xl font-extrabold">{s.won ? (s.stars === 3 ? 'Bay hoàn hảo! 🏆' : 'Về đích rồi! 🎉') : 'Chim mệt rồi — thử lại nhé! 🐤'}</h2>
        <div className="text-4xl font-extrabold tabular-nums" data-testid="flappy-final-score">
          {s.score}
        </div>
        {s.score > result.previousBest && result.previousBest > 0 && <p className="font-bold text-fuchsia-600 dark:text-fuchsia-300">🏅 Kỷ lục mới!</p>}
        {result.rankAfter !== result.rankBefore && <p className="font-bold text-amber-600 dark:text-amber-300">🎖️ Danh hiệu mới: {result.rankAfter}</p>}
        <dl className="grid grid-cols-3 gap-2">
          <Stat label="Ống vượt qua" value={`${s.pipesPassed}/${s.pipes}`} />
          <Stat label="Chính xác" value={s.hits + s.wrongs > 0 ? `${Math.round(s.accuracy * 100)}%` : '—'} />
          <Stat label="Chuỗi dài nhất" value={`${s.bestCombo}`} />
          <Stat label="Nốt đúng" value={`${s.hits}`} />
          <Stat label="Đọc nốt TB" value={s.avgReactionMs === null ? '—' : `${(s.avgReactionMs / 1000).toFixed(1)} giây`} />
          <Stat label="Kỷ lục" value={`${Math.max(s.score, record?.bestScore ?? 0)}`} />
        </dl>
        {s.weakNotes.length > 0 && (
          <p className="text-sm" data-testid="flappy-weak-notes">
            Nốt cần luyện thêm:{' '}
            {s.weakNotes
              .map((m) => {
                const confused = Object.entries(stats[m]?.confusedWith ?? {}).sort((a, b) => b[1] - a[1])[0];
                return confused ? `${name(m)} (hay nhầm với ${name(Number(confused[0]))})` : name(m);
              })
              .join(', ')}
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onAgain} data-testid="flappy-again">
            <Icon name="restart" /> Chơi lại
          </Button>
          <Button onClick={onSetup} data-testid="flappy-change">
            Đổi màn / độ khó
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
    <div className="rounded-2xl bg-sky-50 px-2 py-2 ring-1 ring-sky-100 dark:bg-slate-700/60 dark:ring-slate-600">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
