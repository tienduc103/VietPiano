import { useEffect, useMemo } from 'react';
import type { UiMode } from '../../core/curriculum/types';
import { soundOutput } from '../../core/audio/SoundOutput';
import type { GameSpec } from '../../core/games/gameForLesson';
import { intervalName, makeIntervalRounds } from '../../core/games/intervals';
import { KeyHuntGame } from '../../core/games/KeyHuntGame';
import { gameStars } from '../../core/games/NoteCatchGame';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { midiToLabel } from '../../core/music/notes';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { RoundDots } from '../curriculum/common';
import { Hud, useFrameClock, useGameState, useKeyFlash, type GameResult } from './shared';

const ROUNDS = 10;
/** Chờ chút sau khi sang lượt rồi mới phát nốt gốc (không đè tiếng phím vừa đánh). */
const ROOT_DELAY_MS = 350;

/** "Thám tử quãng": từ nốt gốc, đánh nốt cách nó đúng quãng cho trước — chấm như Săn phím (có giới hạn thời gian). */
export function IntervalDetectiveView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'interval-detective' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const { rounds, engine } = useMemo(() => {
    const rounds = makeIntervalRounds({ ...spec.keyboard, intervals: spec.intervals, directions: spec.directions }, ROUNDS);
    const g = new KeyHuntGame(
      rounds.map((r) => (m: number) => m === r.target),
      { roundMs: kids ? 15_000 : 10_000 },
    );
    g.start(performance.now());
    return { rounds, engine: g };
  }, [spec, kids]);
  const state = useGameState(engine);
  const now = useFrameClock(state.status === 'playing', (t) => engine.tick(t));
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource, { baseMidi: spec.keyboard.from });

  const round = rounds[state.index];
  // Phát nốt gốc mỗi lượt mới (micro bỏ nốt trong lúc app phát).
  useEffect(() => {
    if (state.status !== 'playing') return;
    const id = window.setTimeout(() => soundOutput.playNote(round.root, 0.7), ROOT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [state.index, state.status]);

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
  const rootName = midiToLabel(round.root, settings.labelStyle);
  return (
    <div className="grid gap-4" data-testid="interval-detective" data-target={round.target}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo} />
        <RoundDots results={dots} index={state.index} />
      </div>
      <div className="grid justify-items-center gap-3 rounded-3xl bg-gradient-to-br from-slate-100 to-indigo-100 p-5 ring-1 ring-indigo-200 dark:from-slate-900 dark:to-indigo-950 dark:ring-indigo-900">
        <div key={state.index} className="animate-pop text-6xl" aria-hidden>
          🕵️
        </div>
        <p className={`text-center font-bold text-indigo-950 dark:text-indigo-100 ${kids ? 'text-3xl' : 'text-2xl'}`} data-testid="interval-prompt">
          Từ <span className="text-fuchsia-600 dark:text-fuchsia-300">{rootName}</span>, đánh {intervalName(round.semitones)} {round.direction === 'up' ? 'đi lên ⬆️' : 'đi xuống ⬇️'}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          = {round.semitones} nửa cung {round.direction === 'up' ? 'phía trên' : 'phía dưới'} (tính cả phím đen)
        </p>
        <div className="h-3 w-full max-w-xl overflow-hidden rounded-full bg-white/70 dark:bg-slate-800" role="progressbar" aria-label="Thời gian còn lại" aria-valuenow={Math.round(remaining * 100)}>
          <div className={`h-full rounded-full ${remaining > 0.3 ? 'bg-indigo-500' : 'bg-rose-500'}`} style={{ width: `${remaining * 100}%` }} />
        </div>
        <p className="min-h-7 font-semibold" aria-live="polite">
          {state.lastOutcome === 'hit' ? '🎉 Phá án thành công!' : state.lastOutcome === 'wrong' ? '🔍 Chưa đúng, đếm lại nhé!' : state.lastOutcome === 'miss' ? '⏰ Hết giờ!' : ''}
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
          highlighted={new Set([round.root])}
          onPress={(m) => virtualInput.press(m)}
        />
      </div>
    </div>
  );
}
