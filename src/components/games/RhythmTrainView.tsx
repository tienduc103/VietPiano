import { useEffect, useMemo, useRef, useState } from 'react';
import { lessonTimeline, pieceToLesson } from '../../core/curriculum/piece';
import type { UiMode } from '../../core/curriculum/types';
import { soundOutput } from '../../core/audio/SoundOutput';
import type { GameSpec } from '../../core/games/gameForLesson';
import { gameStars } from '../../core/games/NoteCatchGame';
import { RhythmTrainGame } from '../../core/games/RhythmTrainGame';
import { midiInput } from '../../core/input/MIDIInputProvider';
import { measureLength } from '../../core/lessons/types';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { Toggle } from '../ui';
import { Hud, useFrameClock, useGameState, type GameResult } from './shared';

/** Độ trễ ước lượng micro (như bài Tiết tấu; chưa đo trên iPad thật). */
const MIC_LATENCY_MS = 60;
/** Vạch đèn cách mép trái (px). */
const SIGNAL_X = 140;
/** Đèn đổi màu trong chừng này sau mỗi lần gõ. */
const LIGHT_MS = 350;

/** Chữ đếm phách trên toa: "1", "1-2", "1-2-3-4"; nốt móc đơn "½". */
function countLabel(beats: number): string {
  if (beats < 1) return '½';
  return Array.from({ length: Math.round(beats) }, (_, i) => i + 1).join('-');
}

/** "Đèn giao thông tiết tấu": toa tàu (nốt) chạy tới vạch đèn — gõ một phím bất kỳ đúng lúc toa chạm vạch. */
export function RhythmTrainView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'rhythm-train' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micRunning = useMic((s) => s.status === 'running');
  const kids = mode === 'kids';
  const pxPerBeat = kids ? 150 : 120;
  const { engine, countIn } = useMemo(() => {
    const lesson = pieceToLesson(spec.piece, 'rhythm-train');
    const pattern = lessonTimeline(lesson).map((n) => ({ startBeat: n.startBeat, durationBeats: n.durationBeats, rest: n.midiNote === null }));
    const countIn = measureLength(lesson.timeSignature);
    const g = new RhythmTrainGame(pattern, { bpm: Math.round(spec.piece.bpm * (kids ? 0.85 : 1)), countInBeats: countIn });
    g.start(performance.now() + 400);
    return { engine: g, countIn };
  }, [spec, kids]);
  const state = useGameState(engine);

  // Tiếng metronome: mặc định tắt khi đang dùng micro (micro có thể nghe nhầm tiếng click).
  const usingMic = micRunning && !midiInput.hasDevice() && settings.inputSource !== 'midi';
  const [metronome, setMetronome] = useState(() => !usingMic || settings.metronomeWithMic);
  const metronomeRef = useRef(metronome);
  metronomeRef.current = metronome;
  const nextBeat = useRef(0);
  const now = useFrameClock(state.status === 'playing', (t) => {
    engine.tick(t);
    const beats = engine.getState().beats;
    while (nextBeat.current < beats.length && beats[nextBeat.current].at <= t) {
      const b = beats[nextBeat.current++];
      if (metronomeRef.current && t - b.at < 100) soundOutput.click(b.accent);
    }
  });
  useNoteInput({ onNote: (e) => engine.answer(e.time - (e.source === 'microphone' ? MIC_LATENCY_MS : 0)) }, settings.inputSource);

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: state.perfect + state.good, total: engine.total, bestCombo: state.bestCombo }),
      700,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const current = state.beats.filter((b) => b.at <= now).at(-1);
  const counting = current?.countIn ? state.beats.filter((b) => b.countIn && b.loop === current.loop && b.at <= now).length : null;
  const loop = current?.loop ?? 0;
  const fresh = now - state.lastEventTime < LIGHT_MS;
  const light = !fresh || !state.lastOutcome ? 'idle' : state.lastOutcome === 'perfect' ? 'green' : state.lastOutcome === 'good' ? 'yellow' : 'red';
  const judge = { perfect: 'Perfect!', good: 'Good', miss: 'Trượt', rest: '🛑 Đang nghỉ mà!', stray: 'Lệch nhịp' } as const;

  return (
    <div className="grid gap-3" data-testid="rhythm-train">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo}>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Vòng {loop + 1}/{engine.config.loops}
            {loop > 0 ? ` · nhanh hơn ${Math.round(engine.config.tempoStep * loop * 100)}%` : ''}
          </span>
        </Hud>
        <div className="w-60">
          <Toggle checked={metronome} onChange={setMetronome} label={<span className="text-sm">Tiếng metronome</span>} />
        </div>
      </div>
      <div className="relative h-44 overflow-hidden rounded-3xl bg-gradient-to-b from-slate-800 to-slate-900 ring-1 ring-slate-600" data-testid="rhythm-track">
        <div className="absolute right-0 bottom-9 left-0 h-1.5 bg-slate-500" />
        {state.wagons.map((w) => {
          const x = SIGNAL_X + ((w.at - now) / w.beatMs) * pxPerBeat;
          const width = w.durationBeats * pxPerBeat - 8;
          if (x > 2000 || x + width < -40) return null;
          const tone = w.rest
            ? w.result === 'broken'
              ? 'border-rose-400 bg-rose-500/30 text-rose-100'
              : 'border-dashed border-slate-400 bg-transparent text-slate-300'
            : w.result === 'perfect'
              ? 'bg-emerald-500 text-white'
              : w.result === 'good'
                ? 'bg-lime-400 text-lime-950'
                : w.result === 'miss'
                  ? 'bg-rose-500/70 text-white'
                  : 'bg-gradient-to-br from-amber-300 to-orange-500 text-orange-950';
          return (
            <div
              key={w.id}
              data-testid="wagon"
              data-rest={w.rest || undefined}
              data-result={w.result}
              className={`absolute bottom-11 grid h-16 place-items-center rounded-xl border-2 border-transparent text-lg font-extrabold ${tone}`}
              style={{ left: x, width }}
            >
              {w.rest ? 'nghỉ' : countLabel(w.durationBeats)}
            </div>
          );
        })}
        <div className="absolute top-0 bottom-0 w-1 bg-white/80" style={{ left: SIGNAL_X - 2 }} />
        <div className="absolute top-2 grid gap-1 rounded-xl bg-slate-950 p-1.5 ring-1 ring-slate-600" style={{ left: SIGNAL_X - 18 }} aria-hidden>
          {(['red', 'yellow', 'green'] as const).map((c) => (
            <span
              key={c}
              className={`size-6 rounded-full ${light === c ? (c === 'red' ? 'bg-rose-500' : c === 'yellow' ? 'bg-amber-400' : 'bg-emerald-400') + ' shadow-[0_0_14px] shadow-current' : 'bg-slate-700'}`}
            />
          ))}
        </div>
        {counting !== null && (
          <div className="absolute inset-0 grid place-items-center text-6xl font-black text-white/90" data-testid="count-in">
            {counting}
          </div>
        )}
        <div className="absolute right-4 bottom-1 left-4 flex justify-end text-sm text-slate-400">Gõ khi toa chạm vạch trắng · dấu lặng thì nghỉ</div>
      </div>
      <p className={`min-h-9 text-center font-bold ${kids ? 'text-3xl' : 'text-2xl'}`} aria-live="polite" data-testid="rhythm-judge">
        {fresh && state.lastOutcome ? judge[state.lastOutcome] : ''}
        {fresh && state.lastOffset !== null && !kids && state.lastOutcome !== 'perfect' ? (
          <span className="ml-2 text-base text-slate-500">{state.lastOffset < 0 ? `sớm ${-state.lastOffset} ms` : `trễ ${state.lastOffset} ms`}</span>
        ) : null}
      </p>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          engine.answer(performance.now());
        }}
        className="mx-auto grid h-28 w-full max-w-md touch-none place-items-center rounded-3xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-3xl font-black text-white shadow-lg shadow-fuchsia-500/30 select-none active:scale-95"
        data-testid="rhythm-tap"
      >
        GÕ
      </button>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        Gõ phím bất kỳ trên đàn (micro / MIDI), bàn phím máy tính, hoặc chạm nút GÕ. Đếm vào {countIn} phách trước mỗi vòng.
      </p>
    </div>
  );
}
