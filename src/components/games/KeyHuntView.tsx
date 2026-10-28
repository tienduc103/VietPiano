import { useEffect, useMemo } from 'react';
import type { GameSpec } from '../../core/games/gameForLesson';
import { KeyHuntGame, KIDS_KEY_HUNT_CONFIG } from '../../core/games/KeyHuntGame';
import { gameStars } from '../../core/games/NoteCatchGame';
import { shuffle } from '../../core/games/random';
import { matchesKeyTarget } from '../../core/curriculum/keys';
import { text, type UiMode } from '../../core/curriculum/types';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { RoundDots } from '../curriculum/common';
import { Hud, useFrameClock, useGameState, useKeyFlash, type GameResult } from './shared';

/** Số lượt một ván. */
const ROUNDS = 10;
const CRITTERS = ['🐸', '🐰', '🐱', '🐶', '🐥', '🦊'];

/** "Săn phím": làm theo yêu cầu trước khi hết giờ — càng nhanh càng nhiều điểm. */
export function KeyHuntView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'key-hunt' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const { rounds, engine } = useMemo(() => {
    let pool = shuffle(spec.rounds);
    while (pool.length < ROUNDS) pool = pool.concat(shuffle(spec.rounds));
    const rounds = pool.slice(0, ROUNDS);
    const g = new KeyHuntGame(
      rounds.map((r) => (m: number) => matchesKeyTarget(r.target, m)),
      kids ? KIDS_KEY_HUNT_CONFIG : {},
    );
    g.start(performance.now());
    return { rounds, engine: g };
  }, [spec, kids]);
  const state = useGameState(engine);
  const now = useFrameClock(state.status === 'playing', (t) => engine.tick(t));
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource, { baseMidi: 60 });

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: state.hits, total: engine.total, bestCombo: state.bestCombo }),
      700,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const remaining = engine.remaining(now);
  const dots = state.results.map((r) => (r === 'hit' ? 'correct' : r === 'miss' ? 'wrong' : 'pending'));
  return (
    <div className="grid gap-4" data-testid="key-hunt">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo} />
        <RoundDots results={dots} index={state.index} />
      </div>
      <div className="grid justify-items-center gap-3 rounded-3xl bg-gradient-to-br from-emerald-100 to-sky-100 p-5 ring-1 ring-emerald-200 dark:from-emerald-950 dark:to-sky-950 dark:ring-emerald-900">
        <div key={state.index} className="animate-pop text-6xl" aria-hidden>
          {CRITTERS[state.index % CRITTERS.length]}
        </div>
        <p className={`text-center font-bold text-emerald-900 dark:text-emerald-100 ${kids ? 'text-4xl' : 'text-3xl'}`} data-testid="hunt-prompt">
          {text(rounds[state.index].prompt)}
        </p>
        <div className="h-3 w-full max-w-xl overflow-hidden rounded-full bg-white/70 dark:bg-slate-800" role="progressbar" aria-label="Thời gian còn lại" aria-valuenow={Math.round(remaining * 100)}>
          <div className={`h-full rounded-full ${remaining > 0.3 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${remaining * 100}%` }} />
        </div>
        <p className="min-h-7 font-semibold" aria-live="polite">
          {state.lastOutcome === 'hit' ? '🎉 Bắt được!' : state.lastOutcome === 'wrong' ? '💨 Trượt rồi, thử phím khác!' : state.lastOutcome === 'miss' ? '⏰ Hết giờ!' : ''}
        </p>
      </div>
      <div className="h-40">
        <PianoKeyboard
          from={spec.keyboard.from}
          to={spec.keyboard.to}
          expected={null}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={settings.labelStyle}
          onPress={(m) => virtualInput.press(m)}
        />
      </div>
    </div>
  );
}
