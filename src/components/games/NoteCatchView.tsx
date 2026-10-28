import { useEffect, useMemo } from 'react';
import type { GameSpec } from '../../core/games/gameForLesson';
import { gameStars, KIDS_NOTE_CATCH_CONFIG, makeNoteSequence, NoteCatchGame } from '../../core/games/NoteCatchGame';
import type { UiMode } from '../../core/curriculum/types';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { midiToLabel } from '../../core/music/notes';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { keyCenterPercent, PianoKeyboard } from '../PianoKeyboard';
import { Hud, useFrameClock, useGameState, useKeyFlash, type GameResult } from './shared';

/** Nốt vừa hứng còn hiện hiệu ứng "nổ" chừng này. */
const POP_MS = 400;

/** "Hứng nốt rơi": nốt rơi theo làn thẳng phía trên phím của nó; đánh đúng trước khi chạm đáy. */
export function NoteCatchView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'note-catch' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const engine = useMemo(() => {
    const cfg = kids ? KIDS_NOTE_CATCH_CONFIG : {};
    const g = new NoteCatchGame(makeNoteSequence(spec.notes, cfg.count ?? 16), cfg);
    g.start(performance.now());
    return g;
  }, [spec, kids]);
  const state = useGameState(engine);
  const playing = state.status === 'playing';
  const now = useFrameClock(playing, (t) => engine.tick(t));
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource, { baseMidi: spec.keyboard.from });

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: state.hits, total: engine.total, bestCombo: state.bestCombo }),
      700,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const { from, to } = spec.keyboard;
  const size = kids ? 64 : 56;
  const visible = state.drops.filter((d) => d.spawnAt <= now && (d.state === 'pending' || (d.state === 'hit' && d.hitAt !== null && now - d.hitAt < POP_MS)));

  return (
    <div className="grid gap-3" data-testid="note-catch">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo}>
          <span aria-label={`${state.lives} mạng`} data-testid="game-lives">
            {'❤️'.repeat(state.lives)}
            <span className="opacity-25">{'🤍'.repeat(engine.config.lives - state.lives)}</span>
          </span>
        </Hud>
        <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
          {state.hits + state.misses}/{engine.total} nốt
        </span>
      </div>
      <div
        className="relative h-[min(46vh,380px)] overflow-hidden rounded-3xl bg-gradient-to-b from-indigo-950 via-violet-900 to-fuchsia-800 ring-1 ring-violet-300 dark:ring-violet-800"
        data-testid="catch-field"
      >
        {spec.notes.map((m) => (
          <div key={m} className="absolute top-0 bottom-0 w-px bg-white/10" style={{ left: `${keyCenterPercent(m, from, to)}%` }} />
        ))}
        <div className="absolute right-0 bottom-0 left-0 h-2 bg-gradient-to-r from-amber-300 via-pink-400 to-sky-300 opacity-80" />
        {visible.map((d) => {
          const p = Math.min(1, (now - d.spawnAt) / (d.landAt - d.spawnAt));
          const hit = d.state === 'hit';
          return (
            <div
              key={d.id}
              data-testid="drop"
              data-midi={d.midi}
              data-state={d.state}
              className={`absolute grid place-items-center rounded-full font-extrabold text-white shadow-lg ${hit ? 'scale-150 bg-emerald-400 opacity-0 transition duration-300' : 'bg-gradient-to-br from-amber-300 to-pink-500'}`}
              style={{
                width: size,
                height: size,
                left: `calc(${keyCenterPercent(d.midi, from, to)}% - ${size / 2}px)`,
                top: `calc(${p} * (100% - ${size}px))`,
                fontSize: kids ? 22 : 18,
              }}
            >
              {midiToLabel(d.midi, settings.labelStyle)}
            </div>
          );
        })}
        {state.status === 'ready' && <div className="absolute inset-0 grid place-items-center text-3xl font-bold text-white">Chuẩn bị…</div>}
      </div>
      <div className="h-36">
        <PianoKeyboard from={from} to={to} expected={null} detected={micLive?.midi ?? null} flash={flash} labelStyle={settings.labelStyle} onPress={(m) => virtualInput.press(m)} />
      </div>
    </div>
  );
}
