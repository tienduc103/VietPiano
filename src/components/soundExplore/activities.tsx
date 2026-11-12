/**
 * Sáu hoạt động của bài "Khám phá âm thanh" (A–F) + trang tổng kết. Logic chấm ở `core/soundExplore`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { soundOutput } from '../../core/audio/SoundOutput';
import { pitchColor, pitchHeight } from '../../core/soundExplore/classify';
import { kidMessage } from '../../core/soundExplore/assessment';
import { gardenChoices } from '../../core/soundExplore/assessment';
import { LEVEL_PROFILES } from '../../core/soundExplore/config';
import { ACTIVITY_ICON, melodySay, SOUND_EXPLORE_LESSON } from '../../core/soundExplore/lesson';
import { awardSticker, setRecording, type ActivityId } from '../../core/soundExplore/progress';
import { PerformanceRecorder, recordingLength } from '../../core/soundExplore/recorder';
import { buildAdventure, listenDurationTask, listenPitchTask, nextGardenTask, type GardenTask, type ShortLong, type Task } from '../../core/soundExplore/tasks';
import { Fireworks } from '../Fireworks';
import { GardenMission, HoldMission, ListenDurationQuiz, ListenPitchQuiz, PathMission, PlayRegisterMission } from './missions';
import { afterVoice, BigButton, PitchFlyer, ReplayButton, Sky, useDemo, useExplore, useExploreNotes } from './shared';

// ─── A. Làm quen với âm thanh ────────────────────────────────────────────────────────

const RISE = [52, 57, 62, 67, 72, 77, 81];

/** Ba trang, mỗi trang MỘT khái niệm: lên / xuống · cao / thấp · ngắn / dài. Luôn nghe lại được, bỏ qua được. */
export function IntroActivity({ onDone }: { onDone: () => void }) {
  const api = useExplore();
  const demo = useDemo();
  const [page, setPage] = useState(0);
  const [flyer, setFlyer] = useState<number | null>(null);
  const [lit, setLit] = useState<'short' | 'long' | null>(null);

  const pages = useMemo(
    () => [
      {
        say: 'introPitch' as const,
        notes: [...RISE, ...[...RISE].reverse().slice(1)].map((midi, i) => ({ midi, start: i * 0.45, duration: 0.42 })),
        onNote: (i: number, notes: { midi: number }[]) => setFlyer(notes[i].midi),
      },
      {
        say: 'introDuration' as const,
        notes: [
          { midi: 64, start: 0, duration: 0.3 },
          { midi: 64, start: 1.3, duration: 2.4 },
        ],
        onNote: (i: number) => setLit(i === 0 ? 'short' : 'long'),
      },
    ],
    [],
  );
  const cur = pages[page];
  const play = () => demo.play(cur.notes, (i) => cur.onNote(i, cur.notes));

  useEffect(() => {
    api.say(cur.say);
    setLit(null);
    return afterVoice(play);
  }, [page]);

  const next = () => {
    if (page + 1 < pages.length) {
      setPage(page + 1);
      return;
    }
    api.star('intro');
    api.say('introDone', 'praise');
    onDone();
  };

  return (
    <div className="flex h-full gap-4" data-testid="se-intro" data-page={page}>
      {page === 0 ? (
        <Sky className="flex-1">
          <PitchFlyer midi={flyer} emoji="🚀" />
        </Sky>
      ) : (
        <div className="relative flex flex-1 items-center justify-around rounded-3xl bg-gradient-to-b from-amber-100 to-lime-200 dark:from-amber-950 dark:to-emerald-900">
          <div className={`grid justify-items-center gap-2 transition-transform ${lit === 'short' ? 'scale-125' : ''}`}>
            <span className="text-8xl" aria-hidden>
              🐰
            </span>
            <span className="h-4 w-12 rounded-full bg-gradient-to-r from-yellow-300 to-orange-400" aria-hidden />
          </div>
          <div className={`grid justify-items-center gap-2 transition-transform ${lit === 'long' ? 'scale-125' : ''}`}>
            <span className="text-8xl" aria-hidden>
              🐌
            </span>
            <span className="h-4 w-56 rounded-full bg-gradient-to-r from-yellow-300 to-orange-400" aria-hidden />
          </div>
        </div>
      )}
      <div className="flex flex-col items-center justify-end gap-3">
        <ReplayButton playing={demo.playing !== null} onClick={play} />
        <BigButton icon="▶" label="Tiếp" tone="emerald" onClick={next} data-testid="se-next" />
        <BigButton icon="⏭" label="Bỏ qua" tone="slate" onClick={onDone} data-testid="se-skip" className="min-h-14 text-2xl" />
      </div>
    </div>
  );
}

// ─── B. Tên lửa cao độ ───────────────────────────────────────────────────────────────

type RocketMode = 'listen' | 'play' | 'path';

function ModeTabs<T extends string>({ value, options, onChange }: { value: T; options: { value: T; icon: string; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.value)}
          data-testid={`se-mode-${o.value}`}
          className={`grid min-h-14 min-w-16 place-items-center rounded-2xl text-3xl transition-colors ${value === o.value ? 'bg-violet-500 shadow-lg' : 'bg-white/70 dark:bg-slate-700/70'}`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

export function RocketActivity() {
  const api = useExplore();
  const [mode, setMode] = useState<RocketMode>('listen');
  const [round, setRound] = useState(0);
  const level = api.settings.level;
  const listenTask = useMemo(() => listenPitchTask(level, Math.random), [round, level]);
  const pathDir = useMemo<'up' | 'down'>(() => (Math.random() < 0.5 ? 'up' : 'down'), [round]);
  const next = () => setRound((r) => r + 1);
  return (
    <div className="flex h-full flex-col gap-3" data-testid="se-rocket">
      <ModeTabs
        value={mode}
        onChange={(m) => {
          setMode(m);
          next();
        }}
        options={[
          { value: 'listen', icon: '👂', label: 'Nghe và nhận biết' },
          { value: 'play', icon: '🎹', label: 'Đánh phím điều khiển tên lửa' },
          { value: 'path', icon: '〰️', label: 'Đi theo giai điệu' },
        ]}
      />
      <div className="min-h-0 flex-1">
        {mode === 'listen' && <ListenPitchQuiz key={round} task={listenTask} activity="rocket" onNext={next} />}
        {mode === 'play' && <RocketFree />}
        {mode === 'path' && (
          <PathMission key={round} direction={pathDir} length={LEVEL_PROFILES[level].pathLength} say={pathDir === 'up' ? 'pathUp' : 'pathDown'} activity="rocket" onNext={next} />
        )}
      </div>
    </div>
  );
}

/** Chế độ 2: phím nào → tên lửa tới độ cao đó (theo số nốt, không theo lực gõ). Không chấm. */
function RocketFree() {
  const api = useExplore();
  const [midi, setMidi] = useState<number | null>(null);
  useEffect(() => api.say('rocketPlay'), []);
  useExploreNotes((e) => {
    if (e.kind === 'start') setMidi(e.key.midi);
    else if (e.kind === 'mic') setMidi(e.midi);
  });
  return (
    <Sky>
      <div className="absolute inset-x-0 top-0 h-1/4 bg-white/25" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-lime-400/25" aria-hidden />
      <span className="absolute top-3 right-4 text-5xl" aria-hidden>
        ☁️
      </span>
      <span className="absolute right-4 bottom-3 text-5xl" aria-hidden>
        🌱
      </span>
      <PitchFlyer midi={midi} emoji="🚀" testId="se-rocket-free" />
    </Sky>
  );
}

// ─── C. Thỏ và Ốc sên ────────────────────────────────────────────────────────────────

export function DurationActivity() {
  const api = useExplore();
  const [mode, setMode] = useState<'listen' | 'play'>(api.micOnly ? 'listen' : 'play');
  const [round, setRound] = useState(0);
  const task = useMemo(() => listenDurationTask(Math.random), [round]);
  // Chế độ đánh: lượt đầu đo tự do, sau đó xen kẽ yêu cầu ngắn / dài.
  const target: ShortLong | null = round === 0 ? null : round % 2 ? 'short' : 'long';
  const next = () => setRound((r) => r + 1);
  return (
    <div className="flex h-full flex-col gap-3" data-testid="se-duration">
      <div className="flex items-center gap-3">
        <ModeTabs
          value={mode}
          onChange={(m) => {
            setMode(m);
            next();
          }}
          options={[
            { value: 'listen', icon: '👂', label: 'Nghe và chọn' },
            { value: 'play', icon: '🎹', label: 'Nhấn phím ngắn / dài' },
          ]}
        />
        {mode === 'play' && target === null && <BigButton icon="▶" label="Sang thử thách" tone="emerald" className="min-h-14 text-2xl" onClick={next} data-testid="se-next" />}
      </div>
      <div className="min-h-0 flex-1">
        {mode === 'listen' ? <ListenDurationQuiz key={round} task={task} activity="duration" onNext={next} /> : <HoldMission key={round} target={target} activity="duration" onNext={next} />}
      </div>
    </div>
  );
}

// ─── D. Khu vườn âm nhạc ─────────────────────────────────────────────────────────────

export function GardenActivity() {
  const api = useExplore();
  const choices = gardenChoices(api.progress);
  const [task, setTask] = useState<GardenTask>(() => nextGardenTask(choices, Math.random));
  const [round, setRound] = useState(0);
  const [blooms, setBlooms] = useState(0);
  return (
    <div className="h-full" data-testid="se-garden-activity" data-choices={choices}>
      <GardenMission
        key={round}
        task={task}
        blooms={blooms}
        activity="garden"
        onSolved={() => setBlooms((b) => b + 1)}
        onNext={() => {
          setTask(nextGardenTask(gardenChoices(api.progress), Math.random, task));
          setRound((r) => r + 1);
        }}
      />
    </div>
  );
}

// ─── E. Biểu diễn tự do ──────────────────────────────────────────────────────────────

const CHARACTERS = [
  { id: 'rocket', emoji: '🚀', label: 'Tên lửa' },
  { id: 'bird', emoji: '🐦', label: 'Chim nhỏ' },
  { id: 'rabbit', emoji: '🐰', label: 'Thỏ' },
  { id: 'snail', emoji: '🐌', label: 'Ốc sên' },
] as const;

interface Trail {
  id: number;
  midi: number;
  start: number;
  end: number | null;
}

/** Không chấm đúng / sai. Mỗi nốt: nhân vật bay tới độ cao, vệt sáng dài theo thời gian giữ, màu theo cao độ. */
export function FreePlayActivity() {
  const api = useExplore();
  const [char, setChar] = useState<(typeof CHARACTERS)[number]['emoji']>('🚀');
  const [midi, setMidi] = useState<number | null>(null);
  const [trails, setTrails] = useState<Trail[]>([]);
  const [now, setNow] = useState(() => performance.now());
  const [recording, setRecordingState] = useState(false);
  const [playingBack, setPlayingBack] = useState(false);
  const recorder = useRef(new PerformanceRecorder());
  const nextId = useRef(1);
  const playbackTimers = useRef<number[]>([]);
  const speed = api.reducedMotion ? 0.02 : 0.06; // % bề ngang mỗi ms

  useEffect(() => api.say('freeStart'), []);
  useEffect(() => () => playbackTimers.current.forEach((t) => window.clearTimeout(t)), []);

  // Đồng hồ khung hình khi còn vệt sáng trên màn.
  const active = trails.length > 0;
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      const t = performance.now();
      setNow(t);
      setTrails((tr) => tr.filter((x) => x.end === null || 80 - (t - x.start) * speed + ((x.end ?? t) - x.start) * speed > -5));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [active, speed]);

  const startTrail = (m: number, t: number) => {
    setMidi(m);
    setTrails((tr) => [...tr.slice(-40), { id: nextId.current++, midi: m, start: t, end: null }]);
  };
  const endTrail = (m: number, t: number) => setTrails((tr) => tr.map((x) => (x.midi === m && x.end === null ? { ...x, end: t } : x)));

  useExploreNotes((e) => {
    if (playingBack) return;
    if (e.kind === 'start') {
      startTrail(e.key.midi, e.key.onAt);
      recorder.current.noteOn(e.key.midi, e.key.onAt);
    } else if (e.kind === 'end') {
      endTrail(e.press.midi, e.press.offAt);
      recorder.current.noteOff(e.press.midi, e.press.offAt);
    } else {
      // Micro: không biết lúc thả → vệt ngắn cố định.
      startTrail(e.midi, e.time);
      recorder.current.noteOn(e.midi, e.time);
      window.setTimeout(() => {
        endTrail(e.midi, e.time + 300);
        recorder.current.noteOff(e.midi, e.time + 300);
      }, 300);
    }
    if (recorder.current.isRecording() && recorder.current.isFull(performance.now())) stopRecording();
  });

  const startRecording = () => {
    recorder.current.start(performance.now());
    setRecordingState(true);
    api.say('recordStart');
  };
  const stopRecording = () => {
    const notes = recorder.current.stop(performance.now());
    setRecordingState(false);
    if (notes.length) api.update((p, t) => setRecording(p, notes, t));
  };
  const playBack = () => {
    const notes = api.progress.recording;
    if (!notes.length) return;
    playbackTimers.current.forEach((t) => window.clearTimeout(t));
    setPlayingBack(true);
    api.say('playback');
    afterVoice(() => {
      soundOutput.playSequence(notes.map((n) => ({ midi: n.midi, start: n.at / 1000, duration: n.durationMs / 1000, velocity: 80 })));
      playbackTimers.current = notes.flatMap((n) => [
        window.setTimeout(() => startTrail(n.midi, performance.now()), n.at + 80),
        window.setTimeout(() => endTrail(n.midi, performance.now()), n.at + n.durationMs + 80),
      ]);
      playbackTimers.current.push(window.setTimeout(() => setPlayingBack(false), recordingLength(notes) + 400));
    });
  };

  return (
    <div className="flex h-full flex-col gap-3" data-testid="se-free">
      <div className="flex flex-wrap items-center gap-2">
        {CHARACTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-label={c.label}
            aria-pressed={char === c.emoji}
            onClick={() => setChar(c.emoji)}
            data-testid={`se-char-${c.id}`}
            className={`grid min-h-14 min-w-16 place-items-center rounded-2xl text-4xl ${char === c.emoji ? 'bg-violet-500 shadow-lg' : 'bg-white/70 dark:bg-slate-700/70'}`}
          >
            {c.emoji}
          </button>
        ))}
        <span className="flex-1" />
        {recording ? (
          <BigButton icon="⏹" label="Dừng ghi" tone="rose" className="min-h-14 text-3xl" onClick={stopRecording} data-testid="se-record-stop" />
        ) : (
          <BigButton icon="⏺" label="Ghi lại" tone="rose" className="min-h-14 text-3xl" onClick={startRecording} disabled={playingBack} data-testid="se-record" />
        )}
        <BigButton icon="▶" label="Nghe lại bản ghi" tone="sky" className="min-h-14 text-3xl" onClick={playBack} disabled={recording || playingBack || api.progress.recording.length === 0} data-testid="se-playback" />
      </div>
      <Sky className="flex-1">
        {trails.map((t) => {
          const len = ((t.end ?? now) - t.start) * speed;
          const right = 80 - (now - t.start) * speed + len;
          return (
            <span
              key={t.id}
              className="absolute h-4 rounded-full shadow-[0_0_14px_currentColor]"
              style={{ left: `${right - len}%`, width: `${Math.max(1.5, len)}%`, bottom: `calc(${(pitchHeight(t.midi) * 78).toFixed(1)}% + 6%)`, background: pitchColor(t.midi), color: pitchColor(t.midi) }}
              aria-hidden
            />
          );
        })}
        <div className="absolute inset-y-0 left-[80%] w-0">
          <PitchFlyer midi={midi} emoji={char} testId="se-free-flyer" />
        </div>
        {recording && (
          <span className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-rose-500 px-3 py-1 text-white" data-testid="se-recording">
            <span className="h-3 w-3 animate-pulse rounded-full bg-white" /> REC
          </span>
        )}
      </Sky>
    </div>
  );
}

// ─── F. Phiêu lưu âm nhạc ────────────────────────────────────────────────────────────

export function AdventureActivity({ onFinish }: { onFinish: () => void }) {
  const api = useExplore();
  const [run, setRun] = useState(0);
  const tasks = useMemo<Task[]>(() => buildAdventure(api.settings.level, Math.random), [run]);
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<boolean[]>([]);
  const [sticker, setSticker] = useState<string | null>(null);
  useEffect(() => {
    if (run === 0) api.say('adventureStart');
  }, []);

  const solved = () => {
    setDone((d) => {
      const next = [...d];
      next[index] = true;
      return next;
    });
  };
  const next = () => {
    if (index + 1 < tasks.length) {
      setIndex(index + 1);
      return;
    }
    let got = '';
    api.update((p, t) => {
      const r = awardSticker(p, t);
      got = r.sticker;
      return r.progress;
    });
    setSticker(got || '🌟');
    api.say('adventureDone', 'praise');
  };

  const task = tasks[index];
  const common = { activity: 'adventure' as ActivityId, onNext: next, onSolved: solved };
  return (
    <div className="flex h-full flex-col gap-3" data-testid="se-adventure" data-index={index} data-total={tasks.length} data-kind={task.kind}>
      <ol className="flex items-center gap-2" aria-label="Nhiệm vụ">
        {tasks.map((_, i) => (
          <li key={i} className={`grid h-12 w-12 place-items-center rounded-full text-2xl ${i === index ? 'bg-violet-500 ring-4 ring-violet-200' : 'bg-white/70 dark:bg-slate-700/70'}`} aria-label={`Nhiệm vụ ${i + 1}`}>
            {done[i] ? '⭐' : i === index ? '🧭' : '·'}
          </li>
        ))}
      </ol>
      <div className="relative min-h-0 flex-1">
        {sticker ? (
          <div className="grid h-full place-items-center rounded-3xl bg-gradient-to-b from-fuchsia-200 to-amber-100 dark:from-fuchsia-950 dark:to-amber-950" data-testid="se-adventure-done">
            {!api.reducedMotion && <Fireworks />}
            <div className="grid justify-items-center gap-4">
              <span className="text-9xl" aria-label="Hình dán mới">
                {sticker}
              </span>
              <div className="flex gap-3">
                <BigButton
                  icon="🔁"
                  label="Phiêu lưu lần nữa"
                  tone="violet"
                  onClick={() => {
                    setSticker(null);
                    setDone([]);
                    setIndex(0);
                    setRun((r) => r + 1);
                  }}
                  data-testid="se-adventure-again"
                />
                <BigButton icon="🏠" label="Tổng kết" tone="emerald" onClick={onFinish} data-testid="se-adventure-finish" />
              </div>
            </div>
          </div>
        ) : (
          <MissionView key={`${run}-${index}`} task={task} {...common} />
        )}
      </div>
    </div>
  );
}

function MissionView({ task, ...p }: { task: Task; activity: ActivityId; onNext: () => void; onSolved: () => void }) {
  switch (task.kind) {
    case 'listen-pitch':
      return <ListenPitchQuiz task={task} {...p} />;
    case 'listen-duration':
      return <ListenDurationQuiz task={task} {...p} />;
    case 'play-register':
      return <PlayRegisterMission target={task.target} {...p} />;
    case 'hold':
      return <HoldMission target={task.target} {...p} />;
    case 'garden':
      return <GardenMission task={task} {...p} />;
    case 'melody':
      return <PathMission direction={task.direction} length={task.length} say={melodySay(task.direction, task.length)} {...p} />;
  }
}

// ─── Tổng kết ────────────────────────────────────────────────────────────────────────

export function SummaryView({ onHome }: { onHome: () => void }) {
  const api = useExplore();
  const message = kidMessage(api.progress);
  useEffect(() => {
    api.say('summary');
    return afterVoice(() => api.sayText(message, 'praise'));
  }, []);
  return (
    <div className="grid h-full content-center justify-items-center gap-6 rounded-3xl bg-gradient-to-b from-amber-100 to-fuchsia-100 p-6 dark:from-amber-950 dark:to-fuchsia-950" data-testid="se-summary">
      <ul className="flex flex-wrap justify-center gap-4">
        {SOUND_EXPLORE_LESSON.activities.map((a) => (
          <li key={a.id} className="grid min-w-24 justify-items-center rounded-2xl bg-white/80 p-3 dark:bg-slate-800/80" aria-label={`${a.title}: ${api.progress.stars[a.id]} sao`}>
            <span className="text-5xl" aria-hidden>
              {ACTIVITY_ICON[a.id]}
            </span>
            <span className="text-2xl font-bold" data-testid={`se-stars-${a.id}`}>
              ⭐ {api.progress.stars[a.id]}
            </span>
          </li>
        ))}
      </ul>
      {api.progress.stickers.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2 text-5xl" aria-label="Hình dán" data-testid="se-stickers">
          {api.progress.stickers.slice(-12).map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      )}
      <BigButton icon="🏠" label="Về trang chọn trò" tone="violet" onClick={onHome} data-testid="se-home" />
    </div>
  );
}
