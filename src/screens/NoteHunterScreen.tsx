import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import { keyboardFor } from '../core/games/gameForLesson';
import type { NoteInputEvent } from '../core/input/NoteInputProvider';
import { midiInput } from '../core/input/MIDIInputProvider';
import { virtualInput } from '../core/input/VirtualInputProvider';
import { isBlackKey, midiToName, pitchToLabel, type NoteLabelStyle } from '../core/music/notes';
import { AudioScheduler, type ScheduleOutput } from '../core/noteHunter/AudioScheduler';
import { filterHunterEvent } from '../core/noteHunter/input';
import { MAX_BPM, MIN_BPM } from '../core/noteHunter/MusicTransport';
import { MODE_LABEL, NoteHunterGame, summarize, weakestNotes, type HunterMode, type HunterState } from '../core/noteHunter/NoteHunterGame';
import { findSong, hunterSongs, rangeMidis, songMidis, spelledPitch, TARGET_GROUPS, TARGET_RANGES, targetIndices, type HunterSong } from '../core/noteHunter/songs';
import {
  loadHunterSettings,
  loadRuns,
  saveHunterSettings,
  saveRun,
  type HunterInputSetting,
  type HunterRun,
  type HunterSettings,
} from '../core/noteHunter/storage';
import { HunterScore, type HunterScoreHandle } from '../components/noteHunter/HunterScore';
import { useTargetSvgs } from '../components/noteHunter/useTargetSvgs';
import { MicButton, MicError } from '../components/MicPanel';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { Button, Card, FullscreenButton, Icon, Segmented, Toggle } from '../components/ui';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

const MODE_HELP: Record<HunterMode, string> = {
  wait: 'Bản nhạc dừng ở mỗi nốt mục tiêu, chờ bạn đánh đúng. Không tính thời gian, sai thì thử lại.',
  note: 'Như Wait Mode nhưng tính số lần đánh sai và thời gian phản ứng.',
  rhythm: 'Bản nhạc không dừng — đánh nốt mục tiêu đúng lúc nó tới. Lỡ nhịp là trượt.',
};

const INPUT_OPTIONS: { value: HunterInputSetting; label: string }[] = [
  { value: 'auto', label: 'Tự động' },
  { value: 'midi', label: 'MIDI' },
  { value: 'microphone', label: 'Micro' },
  { value: 'virtual', label: 'Piano ảo' },
];

/** Sai liên tiếp từ micro chừng này lần → gợi ý đổi sang MIDI / piano ảo. */
const MIC_WRONG_HINT = 3;

/** Đầu ra âm thanh thật cho AudioScheduler (WebAudio của SoundOutput). */
const soundSchedule: ScheduleOutput = {
  playNote: (midi, delayMs, durationMs, velocity) => soundOutput.scheduleNote(midi, delayMs / 1000, (durationMs / 1000) * 0.95, velocity),
  click: (delayMs, accent) => soundOutput.click(accent, delayMs / 1000),
};

const noop = () => () => undefined;

function useHunterState(game: NoteHunterGame | null): HunterState | null {
  const subscribe = useMemo(() => (game ? (cb: () => void) => game.subscribe(cb) : noop), [game]);
  return useSyncExternalStore(subscribe, () => game?.getState() ?? null);
}

function noteName(song: HunterSong, midi: number, style: NoteLabelStyle): string {
  return pitchToLabel(spelledPitch(song, midi) ?? midiToName(midi), style);
}

/**
 * Săn nốt (Note Hunter): chọn nốt mục tiêu → bản nhạc tự chạy, dừng ở mỗi nốt mục tiêu chờ người chơi đánh đúng.
 * Cột trái: danh sách mục tiêu + nốt hiện tại thật lớn; cột phải: khuông nhạc đang chạy; dưới: bàn phím ảo.
 */
export function NoteHunterScreen() {
  const back = useApp((s) => s.back);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const profileId = useProfiles((s) => s.activeId);
  const [settings, setSettingsState] = useState<HunterSettings>(loadHunterSettings);
  const setSettings = (patch: Partial<HunterSettings>) =>
    setSettingsState((s) => {
      const next = { ...s, ...patch };
      saveHunterSettings(next);
      return next;
    });
  const songs = useMemo(() => hunterSongs(), []);
  const song = findSong(settings.songId) ?? songs[0];
  const [game, setGame] = useState<NoteHunterGame | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [runs, setRuns] = useState<HunterRun[]>(() => loadRuns(profileId));
  useEffect(() => setRuns(loadRuns(profileId)), [profileId]);

  const start = (targets = settings.targets) => {
    const s = findSong(settings.songId) ?? songs[0];
    const g = new NoteHunterGame(s, targets, { mode: settings.mode, bpm: settings.bpm });
    if (!g.hasTargets()) return;
    soundOutput.unlock();
    g.start(performance.now());
    setGame(g);
    setGameKey((k) => k + 1);
  };

  if (!game) {
    return <HunterSetup settings={settings} song={song} songs={songs} runs={runs} labelStyle={labelStyle} onChange={setSettings} onStart={() => start()} onBack={back} />;
  }
  return (
    <HunterPlay
      key={gameKey}
      game={game}
      settings={settings}
      labelStyle={labelStyle}
      onChange={setSettings}
      onExit={() => setGame(null)}
      onSaved={(run) => setRuns(saveRun(profileId, run))}
      onPractice={(targets) => {
        setSettings({ targets });
        start(targets);
      }}
    />
  );
}

// ── Cài đặt ─────────────────────────────────────────────────────────

function HunterSetup({
  settings,
  song,
  songs,
  runs,
  labelStyle,
  onChange,
  onStart,
  onBack,
}: {
  settings: HunterSettings;
  song: HunterSong;
  songs: HunterSong[];
  runs: HunterRun[];
  labelStyle: NoteLabelStyle;
  onChange: (patch: Partial<HunterSettings>) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const range = TARGET_RANGES.find((r) => r.id === settings.rangeId) ?? TARGET_RANGES[0];
  const inSong = useMemo(() => new Set(songMidis(song)), [song]);
  const selected = new Set(settings.targets);
  const count = targetIndices(song, settings.targets).length;
  const toggle = (m: number) => onChange({ targets: selected.has(m) ? settings.targets.filter((x) => x !== m) : [...settings.targets, m].sort((a, b) => a - b) });
  const songRuns = runs.filter((r) => r.songId === song.songId).slice(0, 5);

  return (
    <div className="h-full overflow-y-auto" data-testid="hunter-setup">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 pt-[calc(1.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10 sm:px-6">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button variant="ghost" onClick={onBack} aria-label="Quay lại" className="px-2">
            <Icon name="back" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">🎯 Săn nốt</h1>
            <p className="text-slate-500 dark:text-slate-400">Chọn nốt cần săn — bản nhạc tự chạy và dừng ở mỗi nốt đó chờ bạn đánh đúng.</p>
          </div>
          <FullscreenButton />
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <h2 className="mb-3 text-xl font-bold">Bài nhạc</h2>
            <div className="grid max-h-80 gap-2 overflow-y-auto pr-1" role="listbox" aria-label="Chọn bài nhạc">
              {songs.map((s) => (
                <button
                  key={s.songId}
                  type="button"
                  role="option"
                  aria-selected={s.songId === song.songId}
                  data-testid={`hunter-song-${s.songId}`}
                  onClick={() => onChange({ songId: s.songId, bpm: s.tempo })}
                  className={`min-h-12 rounded-xl px-4 py-2 text-left ring-1 transition-colors ${
                    s.songId === song.songId ? 'bg-violet-100 ring-violet-400 dark:bg-violet-900/60' : 'bg-white ring-slate-200 hover:bg-violet-50 dark:bg-slate-800 dark:ring-slate-700'
                  }`}
                >
                  <div className="font-semibold">{s.title}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {s.composer} · {'★'.repeat(s.difficulty)} · {s.measureCount} ô nhịp · {s.timeSignature.join('/')}
                    {s.keySignature && s.keySignature !== 'C' ? ` · ${s.keySignature}` : ''}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Nốt mục tiêu</h2>
            <div className="mb-3 flex flex-wrap gap-2">
              <Segmented
                value={range.id}
                options={TARGET_RANGES.map((r) => ({ value: r.id, label: r.label }))}
                onChange={(id) => {
                  const r = TARGET_RANGES.find((x) => x.id === id)!;
                  onChange({ rangeId: id, targets: settings.targets.filter((m) => m >= r.from && m <= r.to) });
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn nốt">
              {rangeMidis(range).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={selected.has(m)}
                  data-testid={`hunter-note-${m}`}
                  onClick={() => toggle(m)}
                  title={inSong.has(m) ? 'Có trong bài' : 'Không có trong bài'}
                  className={`relative min-h-12 min-w-12 rounded-lg px-2 text-sm font-semibold ring-1 transition-colors ${
                    selected.has(m)
                      ? 'bg-violet-600 text-white ring-violet-600'
                      : isBlackKey(m)
                        ? 'bg-slate-800 text-slate-100 ring-slate-800 dark:bg-slate-950'
                        : 'bg-white text-slate-700 ring-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:ring-slate-600'
                  } ${inSong.has(m) ? '' : 'opacity-50'}`}
                >
                  {noteName(song, m, labelStyle)}
                  {inSong.has(m) && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-400" aria-hidden />}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {TARGET_GROUPS.map((g) => (
                <Button key={g.id} className="min-h-10 text-sm" onClick={() => onChange({ targets: [...new Set([...settings.targets, ...g.midis(range, song)])].sort((a, b) => a - b) })}>
                  + {g.label}
                </Button>
              ))}
              <Button variant="ghost" className="min-h-10 text-sm" onClick={() => onChange({ targets: [] })}>
                Bỏ chọn hết
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Chấm xanh = nốt có trong bài. Nhận nốt theo đúng cao độ và quãng 8 (Đô4 ≠ Đô5).</p>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Cách chơi</h2>
            <Segmented value={settings.mode} options={(['wait', 'note', 'rhythm'] as const).map((m) => ({ value: m, label: MODE_LABEL[m] }))} onChange={(mode) => onChange({ mode })} />
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300" data-testid="hunter-mode-help">
              {MODE_HELP[settings.mode]}
            </p>
            <label className="mt-4 block">
              <span className="flex justify-between font-semibold">
                <span>Tốc độ</span>
                <span className="tabular-nums" data-testid="hunter-bpm">
                  {settings.bpm} BPM
                </span>
              </span>
              <input
                type="range"
                min={MIN_BPM}
                max={MAX_BPM}
                step={1}
                value={settings.bpm}
                onChange={(e) => onChange({ bpm: Number(e.target.value) })}
                className="mt-2 h-12 w-full accent-violet-600"
                aria-label="Tốc độ (BPM)"
              />
            </label>
            <Toggle checked={settings.showNames} onChange={(showNames) => onChange({ showNames })} label="Hiện tên nốt (hỗ trợ)" />
            <Toggle checked={settings.keyLabels} onChange={(keyLabels) => onChange({ keyLabels })} label="Hiện nhãn trên bàn phím ảo" />
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Nguồn nốt</h2>
            <InputSettings settings={settings} onChange={onChange} />
          </Card>
        </div>

        <Card className="flex flex-wrap items-center gap-4">
          <div className="flex-1">
            {count > 0 ? (
              <p className="text-lg" data-testid="hunter-target-count">
                <b>{song.title}</b>: <b>{count}</b> nốt mục tiêu ({settings.targets.filter((m) => inSong.has(m)).map((m) => noteName(song, m, labelStyle)).join(', ')})
              </p>
            ) : (
              <p className="text-lg font-semibold text-rose-600 dark:text-rose-400" data-testid="hunter-no-targets" role="alert">
                {settings.targets.length === 0
                  ? 'Chưa chọn nốt mục tiêu nào.'
                  : `Bài "${song.title}" không có nốt nào trong số đã chọn (${settings.targets.map((m) => noteName(song, m, labelStyle)).join(', ')}).`}{' '}
                Hãy chọn nốt có chấm xanh, bấm "+ Mọi nốt có trong bài", hoặc đổi bài.
              </p>
            )}
          </div>
          <Button variant="primary" className="min-w-48 text-lg" disabled={count === 0} onClick={onStart} data-testid="hunter-start">
            <Icon name="play" /> Bắt đầu
          </Button>
        </Card>

        {songRuns.length > 0 && (
          <Card>
            <h2 className="mb-2 text-xl font-bold">Lần chơi gần đây — {song.title}</h2>
            <ul className="grid gap-1 text-sm" data-testid="hunter-history">
              {songRuns.map((r) => (
                <li key={r.at} className="flex flex-wrap gap-x-4 tabular-nums">
                  <span className="text-slate-500">{new Date(r.at).toLocaleString('vi-VN')}</span>
                  <span>{MODE_LABEL[r.mode]}</span>
                  <span>{r.bpm} BPM</span>
                  <span>
                    {r.summary.hit}/{r.summary.total} nốt
                  </span>
                  <span>{r.summary.wrong} lỗi</span>
                  {r.summary.avgReactionMs !== null && r.mode === 'note' && <span>phản ứng TB {(r.summary.avgReactionMs / 1000).toFixed(1)} s</span>}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function InputSettings({ settings, onChange }: { settings: HunterSettings; onChange: (patch: Partial<HunterSettings>) => void }) {
  const midi = useMidi();
  const micStatus = useMic((s) => s.status);
  const usesMic = settings.input === 'microphone' || settings.input === 'auto';
  return (
    <div className="grid gap-3">
      <div role="group" aria-label="Nguồn nốt">
        <Segmented value={settings.input} options={INPUT_OPTIONS} onChange={(input) => onChange({ input })} />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {settings.input === 'auto' && 'Nhận từ đàn MIDI nếu đã nối, nếu không thì micro; bàn phím ảo luôn dùng được.'}
        {settings.input === 'midi' && 'Chỉ nhận đàn MIDI nối dây (Chrome/Edge trên máy tính; iPad không hỗ trợ Web MIDI) + bàn phím ảo.'}
        {settings.input === 'microphone' && 'Nghe tiếng đàn thật qua micro + bàn phím ảo.'}
        {settings.input === 'virtual' && 'Chỉ bấm bàn phím ảo trên màn hình (hoặc phím a s d f… trên máy tính).'}
      </p>
      {settings.input !== 'virtual' && settings.input !== 'microphone' && (
        <p className="text-sm" data-testid="hunter-midi-status">
          Đàn MIDI:{' '}
          {midi.status === 'unsupported'
            ? 'trình duyệt không hỗ trợ Web MIDI'
            : midi.status === 'ready' && midi.devices.length > 0
              ? `đã nối ${midi.devices.map((d) => d.name).join(', ')}`
              : midi.status === 'ready'
                ? 'chưa thấy đàn nào'
                : midi.status === 'idle'
                  ? 'chưa bật (Cài đặt → Đàn MIDI)'
                  : midi.status}
        </p>
      )}
      {usesMic && (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <MicButton />
            {micStatus !== 'running' && settings.input === 'microphone' && <span className="text-sm text-amber-700 dark:text-amber-300">Bật micro để chơi bằng đàn thật.</span>}
          </div>
          <MicError />
          <Toggle checked={settings.headphones} onChange={(headphones) => onChange({ headphones })} label="Tôi dùng tai nghe (loa không lọt vào micro)" />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Không dùng tai nghe: app bỏ qua nốt micro trùng với nốt app đang phát (tiếng vọng từ loa) — cách này giảm nhầm nhưng không loại bỏ hết.
            Nếu micro hay nghe nhầm, hãy dùng tai nghe, đàn MIDI hoặc bàn phím ảo.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Màn chơi ────────────────────────────────────────────────────────

function HunterPlay({
  game,
  settings,
  labelStyle,
  onChange,
  onExit,
  onSaved,
  onPractice,
}: {
  game: NoteHunterGame;
  settings: HunterSettings;
  labelStyle: NoteLabelStyle;
  onChange: (patch: Partial<HunterSettings>) => void;
  onExit: () => void;
  onSaved: (run: HunterRun) => void;
  onPractice: (targets: number[]) => void;
}) {
  const state = useHunterState(game)!;
  const song = game.song;
  const scoreRef = useRef<HunterScoreHandle>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const scheduler = useMemo(() => new AudioScheduler(soundSchedule), []);
  const micRunning = useMic((s) => s.status === 'running');
  const midiConnected = useMidi((s) => s.status === 'ready' && s.devices.length > 0);
  const [micWrongStreak, setMicWrongStreak] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Vòng khung hình: đồng hồ → lịch âm thanh → con trỏ (DOM trực tiếp). Chạy cả khi tạm dừng để huỷ âm thanh.
  useEffect(() => {
    let id = 0;
    const loop = () => {
      const now = performance.now();
      game.tick(now);
      scheduler.update(game, now);
      const s = game.getState();
      const beat = game.positionAt(now);
      scoreRef.current?.setBeat(beat, s.status === 'WAITING_FOR_NOTE');
      if (progressRef.current) progressRef.current.style.width = `${Math.max(0, Math.min(100, (beat / song.totalBeats) * 100))}%`;
      if (measureRef.current) {
        const n = song.notes[Math.max(0, Math.min(song.notes.length - 1, noteAt(song, beat)))];
        measureRef.current.textContent = beat < 0 ? 'Đếm vào' : `Ô nhịp ${n.measureIndex + 1}/${song.measureCount}`;
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(id);
      scheduler.reset();
    };
  }, [game, scheduler, song]);

  // App vào nền → tạm dừng (âm thanh dừng theo).
  useEffect(() => {
    const onHide = () => document.hidden && game.pause(performance.now());
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [game]);

  // Hết bài → lưu kết quả một lần.
  const savedRef = useRef(false);
  useEffect(() => {
    if (state.status !== 'COMPLETED' || savedRef.current) return;
    savedRef.current = true;
    onSaved({ at: Date.now(), songId: song.songId, mode: game.config.mode, bpm: state.bpm, targets: [...game.targetSet], summary: summarize(state.targets) });
  }, [state.status]);
  useEffect(() => {
    if (state.status === 'PLAYING' && state.cursor === 0) savedRef.current = false;
  }, [state.status, state.cursor]);

  const onNote = useCallback(
    (e: NoteInputEvent) => {
      const s = settingsRef.current;
      const verdict = filterHunterEvent(e, { setting: s.input, midiConnected: midiInput.hasDevice(), headphones: s.headphones, played: scheduler.recentPlayback(e.time) });
      if (verdict !== 'accept') return;
      if (e.source === 'virtual') {
        // Phím ảo không có tiếng đàn thật → app phát; ghi lại để micro không nhận lại chính tiếng này.
        soundOutput.playNote(e.midi, 0.5);
        scheduler.notePlayed({ midi: e.midi, start: e.time, end: e.time + 500 });
      }
      const outcome = game.noteOn({ midi: e.midi, time: e.time, velocity: e.velocity, source: e.source });
      if (e.source === 'microphone') setMicWrongStreak((n) => (outcome === 'wrong' ? n + 1 : outcome === 'correct' ? 0 : n));
    },
    [game, scheduler],
  );
  // `useNoteInput` nhận 3 giá trị của giáo trình; "Piano ảo" lọc thêm ở `filterHunterEvent`.
  const hookSetting = settings.input === 'virtual' ? 'auto' : settings.input;
  const allMidis = useMemo(() => [...new Set([...songMidis(song), ...game.targetSet])], [song, game]);
  const keyboard = useMemo(() => keyboardFor(allMidis), [allMidis]);
  useNoteInput({ onNote, onNoteOff: (e) => game.noteOff(e.midi) }, hookSetting, { playbackGuard: false, baseMidi: keyboard.from });

  const now = () => performance.now();
  const { status } = state;
  const current = state.targets[state.cursor] ?? null;
  const summary = useMemo(() => summarize(state.targets), [state.targets]);
  const resolved = state.targets.filter((t) => t.status !== 'pending').length;
  const keyFlash = useFlash(state);
  const togglePlay = () => {
    if (status === 'PLAYING' || status === 'WAITING_FOR_NOTE') game.pause(now());
    else if (status === 'PAUSED') {
      soundOutput.unlock();
      game.resume(now());
    } else {
      soundOutput.unlock();
      scheduler.reset();
      game.restart(now());
    }
  };
  const restart = () => {
    soundOutput.unlock();
    scheduler.reset();
    setMicWrongStreak(0);
    game.restart(now());
  };
  const playing = status === 'PLAYING' || status === 'WAITING_FOR_NOTE';

  return (
    <div className="flex h-full flex-col gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] sm:px-4" data-testid="hunter-screen" data-status={status}>
      <header className="flex flex-wrap items-center gap-2 pl-10">
        <Button
          variant="ghost"
          className="px-2"
          aria-label="Về cài đặt Săn nốt"
          onClick={() => {
            game.reset();
            scheduler.reset();
            onExit();
          }}
        >
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="truncate text-xl font-bold" data-testid="hunter-title">
            {song.title} <span className="text-base font-normal text-slate-500">· {song.composer}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 text-sm text-slate-600 tabular-nums dark:text-slate-300">
            <span ref={measureRef}>Đếm vào</span>
            <span>{MODE_LABEL[game.config.mode]}</span>
            <span>{state.bpm} BPM</span>
            <span data-testid="hunter-progress">
              Mục tiêu {summary.hit}/{summary.total}
            </span>
            <span data-testid="hunter-errors">
              {game.config.mode === 'wait' ? 'Thử lại' : 'Lỗi'} {summary.wrong}
              {summary.missed > 0 ? ` · Lỡ ${summary.missed}` : ''}
            </span>
          </div>
        </div>
        {(settings.input === 'microphone' || (settings.input === 'auto' && !midiConnected)) && <MicButton compact />}
        <Button variant="primary" onClick={togglePlay} data-testid="hunter-play-toggle" aria-label={playing ? 'Tạm dừng' : 'Phát'} className="min-w-28">
          <Icon name={playing ? 'pause' : 'play'} />
          {playing ? 'Dừng' : status === 'PAUSED' ? 'Tiếp tục' : 'Phát'}
        </Button>
        <Button onClick={restart} data-testid="hunter-restart" aria-label="Chơi lại từ đầu">
          <Icon name="restart" />
        </Button>
        <FullscreenButton />
      </header>
      <div className="h-1.5 overflow-hidden rounded-full bg-violet-100 dark:bg-slate-700" aria-hidden>
        <div ref={progressRef} className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: 0 }} />
      </div>

      <Banners
        settings={settings}
        micRunning={micRunning}
        midiConnected={midiConnected}
        micWrongStreak={micWrongStreak}
        onUseVirtual={() => {
          onChange({ input: 'virtual' });
          setMicWrongStreak(0);
        }}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-3 md:grid-cols-2 md:grid-rows-1">
        <div className="flex min-h-0 flex-col gap-3">
          <TargetList game={game} state={state} labelStyle={labelStyle} />
          <CurrentTarget game={game} state={state} current={current} showNames={settings.showNames} labelStyle={labelStyle} />
        </div>
        <section className="order-first flex min-h-0 flex-col rounded-2xl bg-white/90 ring-1 ring-violet-100 md:order-none dark:bg-slate-800/90 dark:ring-violet-900">
          <div className="min-h-0 flex-1">
            <HunterScore
              ref={scoreRef}
              song={song}
              targets={state.targets}
              upcoming={state.approaching || status === 'WAITING_FOR_NOTE' ? state.cursor : null}
              leadInBeats={game.leadInBeats}
              showNames={settings.showNames}
              labelStyle={labelStyle}
            />
          </div>
          <p className="px-4 pb-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-violet-600 dark:text-violet-300">Tím</span> = nốt bạn đánh · xám = app tự phát ·{' '}
            {resolved}/{state.targets.length} mục tiêu đã qua
          </p>
        </section>
      </div>

      <div className="h-[22vh] max-h-44 min-h-28 shrink-0" data-testid="hunter-keyboard">
        <PianoKeyboard
          from={keyboard.from}
          to={keyboard.to}
          expected={settings.showNames && status === 'WAITING_FOR_NOTE' && current ? current.midi : null}
          detected={null}
          flash={keyFlash}
          labelStyle={labelStyle}
          allLabels={settings.keyLabels}
          onPress={(m) => virtualInput.press(m)}
          onRelease={(m) => virtualInput.release(m)}
        />
      </div>

      {status === 'COMPLETED' && (
        <Summary
          game={game}
          state={state}
          labelStyle={labelStyle}
          onRestart={restart}
          onPractice={onPractice}
          onSettings={() => {
            game.reset();
            onExit();
          }}
        />
      )}
    </div>
  );
}

function noteAt(song: HunterSong, beat: number): number {
  let i = 0;
  while (i + 1 < song.notes.length && song.notes[i + 1].startBeat <= beat) i++;
  return i;
}

/** Phím vừa đánh tô xanh / đỏ trong chốc lát. */
function useFlash(state: HunterState) {
  const [flash, setFlash] = useState<{ midi: number; kind: 'correct' | 'wrong' } | null>(null);
  const fb = state.feedback;
  useEffect(() => {
    if (!fb || fb.kind === 'miss') return;
    setFlash({ midi: fb.midi, kind: fb.kind });
    const id = window.setTimeout(() => setFlash(null), 300);
    return () => window.clearTimeout(id);
  }, [fb?.seq]);
  return flash;
}

function Banners({
  settings,
  micRunning,
  midiConnected,
  micWrongStreak,
  onUseVirtual,
}: {
  settings: HunterSettings;
  micRunning: boolean;
  midiConnected: boolean;
  micWrongStreak: number;
  onUseVirtual: () => void;
}) {
  const box = 'flex flex-wrap items-center gap-3 rounded-xl px-4 py-2 text-sm';
  if (settings.input === 'microphone' && !micRunning) {
    return (
      <div className={`${box} bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100`} data-testid="hunter-mic-off">
        Micro đang tắt — bấm nút micro để nghe đàn thật, hoặc dùng bàn phím ảo bên dưới.
      </div>
    );
  }
  if (settings.input === 'midi' && !midiConnected) {
    return (
      <div className={`${box} bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100`} data-testid="hunter-midi-off">
        Chưa nhận được đàn MIDI (iPad / Safari không có Web MIDI). Dùng bàn phím ảo, hoặc đổi nguồn sang Micro.
      </div>
    );
  }
  if (micWrongStreak >= MIC_WRONG_HINT) {
    return (
      <div className={`${box} bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100`} data-testid="hunter-mic-hint">
        Micro có vẻ nghe nhầm nốt (phòng ồn, tiếng loa, đàn lệch?). Thử dùng tai nghe, đàn MIDI, hoặc
        <Button className="min-h-10 text-sm" onClick={onUseVirtual}>
          Chuyển sang piano ảo
        </Button>
      </div>
    );
  }
  if (settings.mode === 'rhythm' && settings.input !== 'virtual' && settings.input !== 'midi' && !midiConnected && !settings.headphones) {
    return (
      <div className={`${box} bg-sky-50 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100`}>
        Rhythm Mode với micro: micro nhận nốt trễ một chút và có thể nghe nhầm tiếng loa — nên dùng tai nghe hoặc đàn MIDI.
      </div>
    );
  }
  return null;
}

function TargetList({ game, state, labelStyle }: { game: NoteHunterGame; state: HunterState; labelStyle: NoteLabelStyle }) {
  const song = game.song;
  const midis = useMemo(() => [...game.targetSet].sort((a, b) => a - b), [game]);
  const svgs = useTargetSvgs(song, midis);
  const current = state.targets[state.cursor];
  return (
    <section className="hidden min-h-0 flex-[2] overflow-y-auto rounded-2xl bg-white/90 p-3 ring-1 ring-violet-100 md:block dark:bg-slate-800/90 dark:ring-violet-900" aria-label="Nốt mục tiêu">
      <h2 className="mb-2 text-sm font-bold tracking-wide text-violet-700 uppercase dark:text-violet-300">Nốt mục tiêu</h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
        {midis.map((m) => {
          const all = state.targets.filter((t) => t.midi === m);
          const met = all.filter((t) => t.status !== 'pending').length;
          const done = all.length > 0 && met === all.length;
          const active = current?.midi === m;
          return (
            <li
              key={m}
              data-testid={`hunter-target-${m}`}
              data-done={done || undefined}
              className={`rounded-xl p-2 ring-1 transition-colors ${
                active ? 'bg-violet-100 ring-violet-500 dark:bg-violet-900/60' : done ? 'bg-emerald-50 ring-emerald-300 dark:bg-emerald-900/30 dark:ring-emerald-700' : 'ring-slate-200 dark:ring-slate-700'
              }`}
            >
              <div className="h-14 text-[var(--hunter-target)] [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs?.get(m) ?? '' }} />
              <div className="flex items-center justify-between text-sm">
                <b>{noteName(song, m, labelStyle)}</b>
                <span className="tabular-nums">{all.length === 0 ? 'không có' : `${met}/${all.length}`}</span>
              </div>
              {done && <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">✓ Xong</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CurrentTarget({
  game,
  state,
  current,
  showNames,
  labelStyle,
}: {
  game: NoteHunterGame;
  state: HunterState;
  current: HunterState['targets'][number] | null;
  showNames: boolean;
  labelStyle: NoteLabelStyle;
}) {
  const song = game.song;
  const midis = useMemo(() => [...game.targetSet], [game]);
  const svgs = useTargetSvgs(song, midis);
  const fb = state.feedback;
  // Hiệu ứng ngắn khi đánh đúng: hiện nốt vừa săn được (xanh) trong chốc lát.
  const [justHit, setJustHit] = useState<{ midi: number; seq: number } | null>(null);
  useEffect(() => {
    if (fb?.kind !== 'correct') return;
    setJustHit({ midi: fb.targetMidi, seq: fb.seq });
    const id = window.setTimeout(() => setJustHit(null), 450);
    return () => window.clearTimeout(id);
  }, [fb?.seq]);
  const shown = justHit?.midi ?? current?.midi ?? null;
  const waiting = state.status === 'WAITING_FOR_NOTE';
  const wrong = fb?.kind === 'wrong' && waiting && current && fb.targetMidi === current.midi ? fb : null;
  const label = justHit
    ? 'Đúng rồi!'
    : state.status === 'PAUSED'
      ? 'Tạm dừng'
      : waiting
        ? 'Đang chờ — đánh nốt này'
        : state.approaching
          ? 'Sắp đến…'
          : current
            ? 'Nốt mục tiêu tiếp theo'
            : 'Đã săn hết nốt mục tiêu';

  return (
    <section
      className={`relative flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl p-2 ring-2 transition-colors md:flex-[3] md:p-3 ${
        justHit
          ? 'bg-emerald-50 ring-emerald-400 dark:bg-emerald-900/30'
          : waiting
            ? 'bg-violet-50 ring-violet-500 dark:bg-violet-950/60'
            : state.approaching
              ? 'bg-white/90 ring-violet-300 dark:bg-slate-800/90'
              : 'bg-white/90 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900'
      }`}
      data-testid="hunter-current"
      data-midi={current?.midi}
      aria-live="polite"
    >
      <div className={`text-lg font-bold ${justHit ? 'text-emerald-600 dark:text-emerald-400' : 'text-violet-700 dark:text-violet-300'}`} data-testid="hunter-current-status">
        {label}
      </div>
      {shown !== null && (
        <div
          key={justHit?.seq ?? 'current'}
          className={`min-h-0 w-full max-w-md flex-1 md:max-h-56 [&>svg]:h-full [&>svg]:w-full ${justHit ? 'animate-hunter-hit text-emerald-600 dark:text-emerald-400' : 'text-[var(--hunter-target)]'}`}
          dangerouslySetInnerHTML={{ __html: svgs?.get(shown) ?? '' }}
        />
      )}
      {shown !== null && showNames && (
        <div className="text-2xl font-black md:text-3xl" data-testid="hunter-current-name">
          {noteName(song, shown, labelStyle)}
        </div>
      )}
      <div className="h-6 text-base font-semibold text-rose-600 dark:text-rose-400" data-testid="hunter-feedback">
        {wrong ? `Chưa đúng — bạn đánh ${noteName(song, wrong.midi, labelStyle)}${wrong.midi % 12 === wrong.targetMidi % 12 ? ' (sai quãng 8)' : ''}. Thử lại!` : ''}
      </div>
    </section>
  );
}

function Summary({
  game,
  state,
  labelStyle,
  onRestart,
  onPractice,
  onSettings,
}: {
  game: NoteHunterGame;
  state: HunterState;
  labelStyle: NoteLabelStyle;
  onRestart: () => void;
  onPractice: (targets: number[]) => void;
  onSettings: () => void;
}) {
  const song = game.song;
  const s = summarize(state.targets);
  const weak = weakestNotes(s);
  const mode = game.config.mode;
  const time = state.finishedAt && state.startedAt ? Math.round((state.finishedAt - state.startedAt) / 1000) : null;
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Tổng kết">
      <Card className="max-h-full w-full max-w-xl overflow-y-auto">
        <div data-testid="hunter-summary">
          <h2 className="text-2xl font-bold">🎉 Xong bài {song.title}</h2>
          <p className="text-slate-500">
            {MODE_LABEL[mode]} · {state.bpm} BPM{time !== null ? ` · ${time} giây` : ''}
          </p>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/30">
              <dt className="text-sm">Đã săn</dt>
              <dd className="text-2xl font-bold tabular-nums" data-testid="hunter-summary-hit">
                {s.hit}/{s.total}
              </dd>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 dark:bg-rose-900/30">
              <dt className="text-sm">{mode === 'wait' ? 'Lần thử lại' : 'Lỗi'}</dt>
              <dd className="text-2xl font-bold tabular-nums" data-testid="hunter-summary-wrong">
                {s.wrong}
                {s.missed ? ` + ${s.missed} lỡ` : ''}
              </dd>
            </div>
            <div className="rounded-xl bg-violet-50 p-3 dark:bg-violet-900/30">
              <dt className="text-sm">{mode === 'rhythm' ? 'Lệch nhịp TB' : 'Đúng ngay lần đầu'}</dt>
              <dd className="text-2xl font-bold tabular-nums">{mode === 'rhythm' ? (s.avgTimingMs === null ? '—' : `${s.avgTimingMs} ms`) : `${Math.round(s.accuracy * 100)}%`}</dd>
            </div>
          </dl>
          {mode === 'note' && s.avgReactionMs !== null && <p className="mt-3">Thời gian phản ứng trung bình: <b>{(s.avgReactionMs / 1000).toFixed(2)} giây</b></p>}
          <table className="mt-4 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Nốt</th>
                <th>Gặp</th>
                <th>Đúng</th>
                <th>{mode === 'wait' ? 'Thử lại' : 'Sai'}</th>
                {mode === 'note' && <th>Phản ứng TB</th>}
              </tr>
            </thead>
            <tbody>
              {s.perNote.map((n) => (
                <tr key={n.midi} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-1 font-semibold">{noteName(song, n.midi, labelStyle)}</td>
                  <td>{n.count}</td>
                  <td>{n.hit}</td>
                  <td>{n.wrong + n.missed}</td>
                  {mode === 'note' && <td>{n.avgReactionMs === null ? '—' : `${(n.avgReactionMs / 1000).toFixed(2)} s`}</td>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Kết quả đã lưu cho người học đang chọn.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onRestart} data-testid="hunter-again">
              <Icon name="restart" /> Chơi lại
            </Button>
            {weak.length > 0 && (
              <Button onClick={() => onPractice(weak)} data-testid="hunter-practice-weak">
                Luyện nốt hay sai: {weak.map((m) => noteName(song, m, labelStyle)).join(', ')}
              </Button>
            )}
            <Button variant="ghost" onClick={onSettings} data-testid="hunter-settings">
              Đổi bài / nốt
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
