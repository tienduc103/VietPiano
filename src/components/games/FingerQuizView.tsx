import { useEffect, useMemo, useState } from 'react';
import type { UiMode } from '../../core/curriculum/types';
import type { GameSpec } from '../../core/games/gameForLesson';
import { fingerSequence } from '../../core/games/gameForLesson';
import { KeyHuntGame, KIDS_KEY_HUNT_CONFIG } from '../../core/games/KeyHuntGame';
import { gameStars } from '../../core/games/NoteCatchGame';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { HandFigure, RoundDots } from '../curriculum/common';
import { PianoKeyboard } from '../PianoKeyboard';
import { Button } from '../ui';
import { Hud, useFrameClock, useGameState, useKeyFlash, type GameResult } from './shared';

const ROUNDS = 10;

/** "Đố số ngón tay": hình bàn tay sáng một ngón — đánh phím dưới ngón đó trong thế tay của buổi. */
export function FingerQuizView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'finger-quiz' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const { sequence, engine } = useMemo(() => {
    const sequence = fingerSequence(Object.keys(spec.fingers).map(Number), ROUNDS);
    const g = new KeyHuntGame(
      sequence.map((f) => (m: number) => m === spec.fingers[f]),
      kids ? KIDS_KEY_HUNT_CONFIG : {},
    );
    g.start(performance.now());
    return { sequence, engine: g };
  }, [spec, kids]);
  const state = useGameState(engine);
  const now = useFrameClock(state.status === 'playing', (t) => engine.tick(t));
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome);
  const [hinted, setHinted] = useState(-1);
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

  const finger = sequence[state.index];
  const remaining = engine.remaining(now);
  const dots = state.results.map((r) => (r === 'hit' ? 'correct' : r === 'miss' ? 'wrong' : 'pending'));
  // Gợi ý: số ngón vẽ trên các phím của thế tay (để nhớ lại thế tay).
  const keyFingers = useMemo(() => Object.fromEntries(Object.entries(spec.fingers).map(([f, m]) => [m, Number(f)])), [spec]);
  const handName = spec.hand === 'right' ? 'tay phải' : 'tay trái';
  return (
    <div className="grid gap-4" data-testid="finger-quiz">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo} />
        <RoundDots results={dots} index={state.index} />
      </div>
      <div className="grid items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 p-4 ring-1 ring-amber-200 sm:grid-cols-[auto_1fr] dark:from-amber-950 dark:to-orange-950 dark:ring-amber-900">
        <HandFigure hand={spec.hand} highlight={finger} />
        <div className="grid justify-items-center gap-3">
          <p className={`text-center font-bold text-orange-900 dark:text-orange-100 ${kids ? 'text-4xl' : 'text-3xl'}`} data-testid="finger-prompt" data-finger={finger}>
            Ngón {finger} — {handName}
          </p>
          <div className="h-3 w-full max-w-md overflow-hidden rounded-full bg-white/70 dark:bg-slate-800" role="progressbar" aria-label="Thời gian còn lại" aria-valuenow={Math.round(remaining * 100)}>
            <div className={`h-full rounded-full ${remaining > 0.3 ? 'bg-orange-500' : 'bg-rose-500'}`} style={{ width: `${remaining * 100}%` }} />
          </div>
          <p className="min-h-7 font-semibold" aria-live="polite">
            {state.lastOutcome === 'hit' ? '🎉 Đúng phím!' : state.lastOutcome === 'wrong' ? 'Chưa đúng — ngón đó nằm trên phím khác' : state.lastOutcome === 'miss' ? '⏰ Hết giờ!' : ''}
          </p>
          <Button variant="ghost" onClick={() => setHinted(state.index)} disabled={hinted === state.index} data-testid="finger-hint">
            💡 Xem lại thế tay
          </Button>
        </div>
      </div>
      <div className="h-40">
        <PianoKeyboard
          from={spec.keyboard.from}
          to={spec.keyboard.to}
          expected={null}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={settings.labelStyle}
          fingers={hinted === state.index ? keyFingers : undefined}
          onPress={(m) => virtualInput.press(m)}
        />
      </div>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">App chỉ kiểm tra phím bạn đánh, không biết bạn dùng ngón nào — hãy tự dùng đúng ngón nhé.</p>
    </div>
  );
}
