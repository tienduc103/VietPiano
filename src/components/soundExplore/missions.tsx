/**
 * Nhiệm vụ dùng chung giữa các hoạt động (Tên lửa, Thỏ và Ốc sên, Khu vườn) và Chuyến phiêu lưu.
 * Mọi nhiệm vụ: lời dặn bằng giọng nói, ví dụ nghe lại được, phản hồi hoạt hình, thử không giới hạn,
 * không âm báo thất bại. Xong → nút ▶ lớn để sang nhiệm vụ sau (không tự chuyển quá nhanh).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { soundOutput } from '../../core/audio/SoundOutput';
import { classifyDuration } from '../../core/soundExplore/classify';
import { KEYBOARD_FROM, KEYBOARD_TO, LEVEL_PROFILES } from '../../core/soundExplore/config';
import { correctDurationSay, correctPitchSay, gardenSay, type SayKey } from '../../core/soundExplore/lesson';
import type { ActivityId } from '../../core/soundExplore/progress';
import {
  judgeDuration,
  judgeGarden,
  judgeRegister,
  PathFollower,
  type GardenTask,
  type HighLow,
  type ListenDurationTask,
  type ListenPitchTask,
  type ShortLong,
  type UpDown,
} from '../../core/soundExplore/tasks';
import { pitchHeight } from '../../core/soundExplore/classify';
import { afterVoice, BigButton, HoldBar, PitchFlyer, ReplayButton, Sky, StarBurst, useDemo, useExplore, useExploreNotes, type DemoNote } from './shared';

export interface MissionProps {
  activity: ActivityId;
  /** Có thì hiện nút ▶ sau khi xong; không có thì nhiệm vụ đứng yên ở trạng thái xong. */
  onNext?: () => void;
  onSolved?: () => void;
}

/** Trạng thái chung: đã xong chưa + số lần chưa đạt (lần thử đầu / thử lại). */
function useSolve(activity: ActivityId, onSolved?: () => void) {
  const api = useExplore();
  const [solved, setSolved] = useState(false);
  const misses = useRef(0);
  return {
    solved,
    get firstTry() {
      return misses.current === 0;
    },
    miss() {
      misses.current++;
    },
    solve() {
      if (solved) return;
      setSolved(true);
      api.star(activity);
      api.chime();
      onSolved?.();
    },
  };
}

function NextButton({ onNext }: { onNext?: () => void }) {
  if (!onNext) return null;
  return <BigButton icon="▶" label="Tiếp" tone="emerald" onClick={onNext} data-testid="se-next" className="min-w-28 animate-pulse" />;
}

/** Bắt đầu nhiệm vụ: đọc lời dặn rồi (tuỳ) phát ví dụ khi cô nói xong. */
function useIntro(say: SayKey, play?: () => void) {
  const api = useExplore();
  const playRef = useRef(play);
  playRef.current = play;
  useEffect(() => {
    api.say(say);
    if (!playRef.current) return;
    return afterVoice(() => playRef.current?.());
    // Mỗi nhiệm vụ một lần (component được dựng lại theo key khi đổi nhiệm vụ).
  }, []);
}

const HIGH_KEYS = (highMin: number) => new Set(Array.from({ length: KEYBOARD_TO - highMin + 1 }, (_, i) => highMin + i));
const LOW_KEYS = (lowMax: number) => new Set(Array.from({ length: lowMax - KEYBOARD_FROM + 1 }, (_, i) => KEYBOARD_FROM + i));

/** Tô vùng phím cao / thấp: mức 1 luôn tô, mức 2–3 chỉ sau lần chưa đúng (giảm gợi ý). */
function useZoneHint(register: HighLow | null, show: boolean) {
  const { settings, setKeyHint } = useExplore();
  useEffect(() => {
    if (!register || !show) {
      setKeyHint(null);
      return;
    }
    setKeyHint(register === 'high' ? HIGH_KEYS(settings.highMin) : LOW_KEYS(settings.lowMax));
    return () => setKeyHint(null);
  }, [register, show, settings.highMin, settings.lowMax, setKeyHint]);
}

// ─── Nghe cao / thấp, lên / xuống ─────────────────────────────────────────────────────

export function ListenPitchQuiz({ task, activity, onNext, onSolved }: MissionProps & { task: ListenPitchTask }) {
  const api = useExplore();
  const s = useSolve(activity, onSolved);
  const demo = useDemo();
  const [flyer, setFlyer] = useState<number | null>(null);
  const skill = task.variant === 'register' ? 'pitchRecognition' : 'pitchDirection';
  const notes = useMemo<DemoNote[]>(() => {
    const gap = task.variant === 'run' ? 0.8 : 1.1;
    return task.notes.map((midi, i) => ({ midi, start: i * gap, duration: task.variant === 'run' ? 0.7 : 0.9 }));
  }, [task]);
  const play = () => demo.play(notes, (i) => setFlyer(task.notes[i]));
  useIntro(task.variant === 'register' ? 'listenRegister' : task.variant === 'compare' ? 'listenCompare' : 'listenRun', play);

  const answer = (a: HighLow | UpDown) => {
    if (s.solved) return;
    const ok = a === task.answer;
    api.attempt(skill, ok, s.firstTry, 'touch');
    if (ok) {
      demo.stop();
      setFlyer(task.notes[task.notes.length - 1]);
      api.say(correctPitchSay(task.answer), 'praise');
      s.solve();
    } else {
      s.miss();
      api.say('listenAgain');
      afterVoice(play);
    }
  };
  const options: { value: HighLow | UpDown; icon: string; label: string }[] =
    task.variant === 'register'
      ? [
          { value: 'high', icon: '☁️⬆️', label: 'Cao' },
          { value: 'low', icon: '🌱⬇️', label: 'Thấp' },
        ]
      : [
          { value: 'up', icon: '⬆️', label: 'Đi lên' },
          { value: 'down', icon: '⬇️', label: 'Đi xuống' },
        ];
  return (
    <div className="flex h-full gap-4" data-testid="se-listen-pitch" data-answer={task.answer}>
      <Sky className="flex-1">
        <div className="absolute inset-x-0 top-0 h-1/4 bg-white/25" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-lime-400/25" aria-hidden />
        <PitchFlyer midi={flyer} emoji="🚀" />
        <StarBurst show={s.solved} />
      </Sky>
      <div className="flex flex-col items-center justify-between gap-3">
        {options.map((o) => (
          <BigButton key={o.value} icon={o.icon} label={o.label} tone={o.value === 'high' || o.value === 'up' ? 'sky' : 'emerald'} className="min-h-28 min-w-32 text-5xl" onClick={() => answer(o.value)} disabled={s.solved} data-testid={`se-answer-${o.value}`} />
        ))}
        <ReplayButton
          playing={demo.playing !== null}
          onClick={() => {
            api.replayed(skill);
            play();
          }}
        />
        {s.solved && <NextButton onNext={onNext} />}
      </div>
    </div>
  );
}

// ─── Nghe ngắn / dài ─────────────────────────────────────────────────────────────────

export function ListenDurationQuiz({ task, activity, onNext, onSolved }: MissionProps & { task: ListenDurationTask }) {
  const api = useExplore();
  const s = useSolve(activity, onSolved);
  const demo = useDemo();
  const p = LEVEL_PROFILES[api.settings.level];
  const secOf = (d: ShortLong) => (d === 'short' ? p.demoShortSec : p.demoLongSec);
  const notes = useMemo<DemoNote[]>(() => {
    const first = secOf(task.order[0]);
    return [
      { midi: task.midi, start: 0, duration: first },
      { midi: task.midi, start: first + 1, duration: secOf(task.order[1]) },
    ];
  }, [task, p]);
  const play = () => demo.play(notes);
  useIntro(task.ask === 'short' ? 'listenShort' : 'listenLong', play);

  const answer = (i: 0 | 1) => {
    if (s.solved) return;
    const ok = i === task.answer;
    api.attempt('durationRecognition', ok, s.firstTry, 'touch');
    if (ok) {
      api.say(correctDurationSay(task.ask), 'praise');
      s.solve();
    } else {
      s.miss();
      api.say('listenAgain');
      afterVoice(play);
    }
  };
  return (
    <div className="flex h-full flex-col gap-4" data-testid="se-listen-duration" data-answer={task.answer}>
      <div className="relative grid flex-1 place-items-center rounded-3xl bg-gradient-to-b from-amber-100 to-lime-200 dark:from-amber-950 dark:to-emerald-900">
        <div className="text-8xl" aria-hidden>
          {task.ask === 'short' ? '🐰' : '🐌'}
          <span className="text-6xl">❓</span>
        </div>
        <StarBurst show={s.solved} />
      </div>
      <div className="flex items-center justify-center gap-4">
        {([0, 1] as const).map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => answer(i)}
            disabled={s.solved}
            aria-label={`Tiếng thứ ${i + 1}`}
            data-testid={`se-answer-${i}`}
            className={`relative grid min-h-28 min-w-44 place-items-center overflow-hidden rounded-3xl bg-white text-4xl font-black shadow-lg ring-4 transition-transform active:scale-95 dark:bg-slate-700 ${demo.playing === i ? 'ring-amber-400' : 'ring-transparent'} ${s.solved && i === task.answer ? 'ring-emerald-400' : ''}`}
          >
            <span aria-hidden>{i === 0 ? '●' : '●●'}</span>
            <span
              className="absolute bottom-0 left-0 h-3 bg-gradient-to-r from-yellow-300 to-orange-400"
              style={{ width: demo.playing === i ? '100%' : '0%', transition: demo.playing === i ? `width ${notes[i].duration}s linear` : 'none' }}
              aria-hidden
            />
          </button>
        ))}
        <ReplayButton
          playing={demo.playing !== null}
          onClick={() => {
            api.replayed('durationRecognition');
            play();
          }}
        />
        {s.solved && <NextButton onNext={onNext} />}
      </div>
    </div>
  );
}

// ─── Giữ phím ngắn / dài ─────────────────────────────────────────────────────────────

/** Giữ phím; `target` null = chỉ đo cho vui (thỏ nhảy / ốc sên bò), không chấm. */
export function HoldMission({ target, activity, onNext, onSolved }: MissionProps & { target: ShortLong | null }) {
  const api = useExplore();
  const s = useSolve(activity, onSolved);
  const demo = useDemo();
  const [heldSince, setHeldSince] = useState<number | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [hop, setHop] = useState(0);
  const [snailX, setSnailX] = useState(0);
  const micWarned = useRef(false);
  const p = LEVEL_PROFILES[api.settings.level];
  const play = target ? () => demo.play([{ midi: 60, start: 0, duration: target === 'short' ? p.demoShortSec : p.demoLongSec }]) : undefined;
  useIntro(target === 'short' ? 'holdShort' : target === 'long' ? 'holdLong' : 'durationPlay', play);

  useExploreNotes((e) => {
    if (e.kind === 'mic') {
      if (!micWarned.current) api.say('micNoDuration');
      micWarned.current = true;
      return;
    }
    if (e.kind === 'start') {
      setHeldSince(e.key.onAt);
      return;
    }
    if (api.heldCount() === 0) setHeldSince(null);
    if (e.press.aborted || s.solved) return;
    const ms = e.press.durationMs;
    const c = classifyDuration(ms, api.settings);
    if (c === 'tooQuick') return;
    setLastMs(ms);
    if (c === 'short') setHop((h) => h + 1);
    if (c === 'long') setSnailX((x) => Math.min(70, x + Math.min(35, ms / 120)));
    if (!target) {
      api.say(c === 'short' ? 'gotShort' : c === 'long' ? 'gotLong' : 'unclear', c === 'unclear' ? 'instruction' : 'praise');
      return;
    }
    const v = judgeDuration(ms, target, api.settings);
    if (v === null) return;
    if (v === 'unclear') {
      // Vùng giữa: không tính là chưa đạt, chỉ mời thử lại.
      api.say('unclear');
      return;
    }
    api.attempt('durationExecution', v === 'ok', s.firstTry, e.press.source);
    if (v === 'ok') {
      api.say(target === 'short' ? 'gotShort' : 'gotLong', 'praise');
      s.solve();
    } else {
      s.miss();
      api.say(v === 'needLonger' ? 'needLonger' : 'needShorter');
    }
  });

  return (
    <div className="flex h-full flex-col gap-3" data-testid="se-hold" data-target={target ?? 'free'}>
      <div className="relative flex-1 overflow-hidden rounded-3xl bg-gradient-to-b from-sky-200 to-lime-200 dark:from-sky-950 dark:to-emerald-900">
        {target && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-5 py-1 text-5xl dark:bg-slate-800/80" aria-hidden>
            {target === 'short' ? '🐰' : '🐌'}
          </div>
        )}
        <span
          key={hop}
          className={`absolute bottom-6 left-[12%] text-7xl ${hop && !api.reducedMotion ? 'animate-[se-hop_0.6s_ease-out]' : ''}`}
          data-testid="se-rabbit"
          data-hops={hop}
          aria-hidden
        >
          🐰
        </span>
        <span className="absolute bottom-6 text-7xl transition-[left] duration-1000" style={{ left: `${25 + snailX}%` }} data-testid="se-snail" data-x={Math.round(snailX)} aria-hidden>
          🐌
        </span>
        <StarBurst show={s.solved} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <HoldBar heldSince={heldSince} lastMs={lastMs} />
        </div>
        {play && (
          <ReplayButton
            playing={demo.playing !== null}
            onClick={() => {
              api.replayed('durationExecution');
              play();
            }}
          />
        )}
        {s.solved && <NextButton onNext={onNext} />}
      </div>
      {api.micOnly && (
        <p className="text-center text-sm text-amber-800 dark:text-amber-200" data-testid="se-mic-note">
          Micro không đo được độ dài tiếng — bé bấm bàn phím trên màn hình hoặc dùng đàn MIDI.
        </p>
      )}
    </div>
  );
}

// ─── Đánh vùng cao / thấp ────────────────────────────────────────────────────────────

export function PlayRegisterMission({ target, activity, onNext, onSolved }: MissionProps & { target: HighLow }) {
  const api = useExplore();
  const s = useSolve(activity, onSolved);
  const demo = useDemo();
  const [flyer, setFlyer] = useState<number | null>(null);
  const [hint, setHint] = useState(api.settings.level === 1);
  useZoneHint(target, hint && !s.solved);
  const example = target === 'high' ? 81 : 50;
  const play = () => demo.play([{ midi: example, start: 0, duration: 1 }], () => setFlyer(example));
  useIntro(target === 'high' ? 'playHigh' : 'playLow', play);

  useExploreNotes((e) => {
    if (e.kind === 'end' || s.solved) return;
    const midi = e.kind === 'mic' ? e.midi : e.key.midi;
    setFlyer(midi);
    const v = judgeRegister(midi, target, api.settings);
    api.attempt('pitchExecution', v === 'ok', s.firstTry, e.kind === 'mic' ? 'microphone' : e.key.source);
    if (v === 'ok') {
      api.say(target === 'high' ? 'correctHigh' : 'correctLow', 'praise');
      s.solve();
    } else {
      s.miss();
      setHint(true);
      api.say(target === 'high' ? 'notHighYet' : 'notLowYet');
    }
  });
  return (
    <div className="flex h-full gap-4" data-testid="se-play-register" data-target={target}>
      <Sky className="flex-1">
        <div className={`absolute inset-x-0 ${target === 'high' ? 'top-0' : 'bottom-0'} h-1/4 bg-yellow-200/50`} aria-hidden />
        <div className={`absolute right-4 ${target === 'high' ? 'top-3' : 'bottom-3'} text-6xl`} aria-hidden>
          {target === 'high' ? '☁️' : '🌱'}
        </div>
        <PitchFlyer midi={flyer} emoji="🚀" />
        <StarBurst show={s.solved} />
      </Sky>
      <div className="flex flex-col items-center justify-end gap-3">
        <ReplayButton
          playing={demo.playing !== null}
          onClick={() => {
            api.replayed('pitchExecution');
            play();
          }}
        />
        {s.solved && <NextButton onNext={onNext} />}
      </div>
    </div>
  );
}

// ─── Đường bay theo giai điệu ───────────────────────────────────────────────────────

export function PathMission({ direction, length, say, activity, onNext, onSolved }: MissionProps & { direction: UpDown; length: number; say: SayKey }) {
  const api = useExplore();
  const s = useSolve(activity, onSolved);
  const demo = useDemo();
  const follower = useMemo(() => new PathFollower(direction, length), [direction, length]);
  const [played, setPlayed] = useState<readonly number[]>([]);
  const [flyer, setFlyer] = useState<number | null>(null);
  const wrongs = useRef(0);
  const exampleNotes = useMemo(() => Array.from({ length }, (_, i) => (direction === 'up' ? 60 + i * 4 : 72 - i * 4)), [direction, length]);
  const play = () => demo.play(exampleNotes.map((midi, i) => ({ midi, start: i * 0.7, duration: 0.6 })), (i) => setFlyer(exampleNotes[i]));
  useIntro(say, play);

  useExploreNotes((e) => {
    if (e.kind === 'end' || s.solved) return;
    const midi = e.kind === 'mic' ? e.midi : e.key.midi;
    const r = follower.feed(midi);
    if (r === 'wrongDirection' || r === 'same') {
      wrongs.current++;
      api.say(r === 'same' ? 'pathSame' : direction === 'up' ? 'pathWrongUp' : 'pathWrongDown');
      return;
    }
    setFlyer(midi);
    setPlayed([...follower.played()]);
    if (r === 'done') {
      api.attempt('pitchDirection', wrongs.current === 0, true, e.kind === 'mic' ? 'microphone' : e.key.source);
      api.say('pathDone', 'praise');
      s.solve();
    }
  });
  return (
    <div className="flex h-full gap-4" data-testid="se-path" data-direction={direction} data-progress={played.length}>
      <Sky className="flex-1">
        {Array.from({ length }, (_, i) => {
          const pos = (i + 0.5) / length;
          const reached = i < played.length;
          const h = reached ? pitchHeight(played[i]) : direction === 'up' ? 0.15 + pos * 0.7 : 0.85 - pos * 0.7;
          return (
            <span
              key={i}
              className={`absolute -translate-x-1/2 text-4xl ${reached ? '' : 'opacity-40 grayscale'}`}
              style={{ left: `${10 + pos * 70}%`, bottom: `calc(${(h * 78).toFixed(1)}% + 4%)` }}
              aria-hidden
            >
              ⭐
            </span>
          );
        })}
        <PitchFlyer midi={flyer} emoji="🚀" />
        <StarBurst show={s.solved} />
      </Sky>
      <div className="flex flex-col items-center justify-end gap-3">
        <div className="text-5xl" aria-hidden>
          {direction === 'up' ? '⬆️' : '⬇️'}
        </div>
        <ReplayButton
          playing={demo.playing !== null}
          onClick={() => {
            api.replayed('pitchDirection');
            play();
          }}
        />
        {s.solved && <NextButton onNext={onNext} />}
      </div>
    </div>
  );
}

// ─── Khu vườn: cao độ + trường độ ────────────────────────────────────────────────────

export function GardenMission({ task, activity, onNext, onSolved, blooms = 0 }: MissionProps & { task: GardenTask; blooms?: number }) {
  const api = useExplore();
  const s = useSolve(activity, onSolved);
  const demo = useDemo();
  const [heldSince, setHeldSince] = useState<number | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const [hint, setHint] = useState(api.settings.level === 1);
  const judged = useRef(false);
  const micWarned = useRef(false);
  useZoneHint(task.register, hint && !s.solved);
  const exampleMidi = task.register === 'high' ? 79 : 50;
  const play = () => demo.play([{ midi: exampleMidi, start: 0, duration: task.duration === 'long' ? 2 : 0.35 }]);
  useIntro(gardenSay(task), play);

  useExploreNotes((e) => {
    if (e.kind === 'mic') {
      if (!micWarned.current) api.say('micNoDuration');
      micWarned.current = true;
      return;
    }
    if (e.kind === 'start') {
      setHeldSince(e.key.onAt);
      return;
    }
    if (api.heldCount() === 0) setHeldSince(null);
    if (s.solved) return;
    const v = judgeGarden(e.press, task, api.settings);
    if (!v) return;
    setLastMs(e.press.durationMs);
    const first = !judged.current;
    judged.current = true;
    api.attempt('pitchExecution', v.pitch === 'ok', first, e.press.source);
    if (v.duration !== 'unclear') api.attempt('durationExecution', v.duration === 'ok', first, e.press.source);
    if (first) api.update((p, now) => ({ ...p, gardenRecent: [...p.gardenRecent, v.outcome === 'bloom'].slice(-8), updatedAt: now }));
    const pitchOk: SayKey = task.register === 'high' ? 'highOk' : 'lowOk';
    const durOk: SayKey = task.duration === 'long' ? 'longOk' : 'shortOk';
    const pitchFix: SayKey = task.register === 'high' ? 'needHigher' : 'needLower';
    const durFix: SayKey = task.duration === 'long' ? 'needLonger' : 'needShorter';
    switch (v.outcome) {
      case 'bloom':
        api.say('bloom', 'praise');
        s.solve();
        return;
      case 'fixDuration':
        api.say([pitchOk, durFix]);
        break;
      case 'retryUnclear':
        api.say([pitchOk, 'unclear']);
        break;
      case 'fixPitch':
        setHint(true);
        api.say(v.duration === 'ok' ? [durOk, pitchFix] : [pitchFix]);
        break;
      case 'retryBoth':
        setHint(true);
        api.say('retryBoth');
        afterVoice(play);
        break;
    }
    s.miss();
  });

  return (
    <div className="flex h-full flex-col gap-3" data-testid="se-garden" data-register={task.register} data-duration={task.duration}>
      <div className="relative flex flex-1 items-end justify-center gap-6 overflow-hidden rounded-3xl bg-gradient-to-b from-sky-200 via-sky-100 to-lime-300 pb-4 dark:from-sky-950 dark:via-sky-900 dark:to-emerald-900">
        <div className="absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/85 px-5 py-1 text-5xl dark:bg-slate-800/85" aria-hidden data-testid="se-garden-target">
          <span>{task.register === 'high' ? '⬆️' : '⬇️'}</span>
          <span>{task.duration === 'long' ? '🐌' : '🐰'}</span>
        </div>
        <div className="flex items-end gap-1 text-5xl" aria-hidden data-testid="se-garden-blooms" data-count={blooms + (s.solved ? 1 : 0)}>
          {Array.from({ length: Math.min(8, blooms) }, (_, i) => (
            <span key={i}>🌸</span>
          ))}
        </div>
        <span className={`text-8xl transition-transform duration-700 ${s.solved ? 'scale-125' : 'scale-75 opacity-80'}`} aria-hidden data-testid="se-flower">
          {s.solved ? '🌸' : '🌱'}
        </span>
        <StarBurst show={s.solved} />
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <HoldBar heldSince={heldSince} lastMs={lastMs} />
        </div>
        <ReplayButton
          playing={demo.playing !== null}
          onClick={() => {
            api.replayed('durationExecution');
            play();
          }}
        />
        {s.solved && <NextButton onNext={onNext} />}
      </div>
    </div>
  );
}

/** Chuông nhỏ khi hoàn thành: 2 nốt rất cao, lực gõ thấp (nhỏ hơn tiếng đàn), chỉ khi bé không giữ phím. */
export function playChime(volume: number): void {
  const v = Math.round(15 + Math.min(1, Math.max(0, volume)) * 35);
  soundOutput.scheduleNote(96, 0.05, 0.15, v);
  soundOutput.scheduleNote(100, 0.18, 0.25, v);
}
