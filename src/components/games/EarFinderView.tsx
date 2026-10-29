import { useEffect, useMemo } from 'react';
import type { UiMode } from '../../core/curriculum/types';
import { soundOutput } from '../../core/audio/SoundOutput';
import { EarFinderGame, KIDS_EAR_FINDER_CONFIG } from '../../core/games/EarFinderGame';
import { gameNoteName, type GameSpec } from '../../core/games/gameForLesson';
import { gameStars } from '../../core/games/NoteCatchGame';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { pitchToLabel } from '../../core/music/notes';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { RoundDots } from '../curriculum/common';
import { Button } from '../ui';
import { Hud, useGameState, useKeyFlash, type GameResult } from './shared';

/** Chờ trước khi phát nốt; sau khi app chỉ ra đáp án thì chờ lâu hơn để kịp nhìn. */
const LEAD_MS = 700;
const AFTER_REVEAL_MS = 1800;
const NOTE_SEC = 1;

/** "Nghe nốt đoán phím": app phát một nốt, người học tìm phím; sai thì được gợi ý cao hơn / thấp hơn. */
export function EarFinderView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'ear-finder' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const engine = useMemo(() => new EarFinderGame(spec.notes, kids ? KIDS_EAR_FINDER_CONFIG : {}), [spec, kids]);
  const state = useGameState(engine);
  const name = (m: number) => pitchToLabel(gameNoteName(spec, m), settings.labelStyle);

  // Phát nốt cần tìm mỗi lần bước vào "listen"; phát xong mới tới lượt người học.
  useEffect(() => {
    if (state.status !== 'listen') return;
    const target = engine.target;
    const timers: number[] = [];
    timers.push(
      window.setTimeout(
        () => {
          const ms = soundOutput.playSequence([{ midi: target, start: 0, duration: NOTE_SEC, velocity: 90 }]);
          timers.push(window.setTimeout(() => engine.listenDone(), Math.max(ms, NOTE_SEC * 1000)));
        },
        state.lastOutcome === 'reveal' ? AFTER_REVEAL_MS : LEAD_MS,
      ),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      soundOutput.stop();
    };
  }, [state.listenId, state.status === 'listen']);

  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome === 'hit' ? 'hit' : state.lastOutcome ? 'wrong' : null);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource, { baseMidi: spec.keyboard.from });

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: state.hits, total: engine.config.rounds, bestCombo: state.bestCombo }),
      900,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const answering = state.status === 'answer';
  const revealed = state.lastOutcome === 'reveal' && state.status !== 'answer' ? state.lastTarget : null;
  const prompt =
    state.status === 'answer'
      ? state.lastOutcome === 'higher'
        ? '⬆️ Cao hơn nữa!'
        : state.lastOutcome === 'lower'
          ? '⬇️ Thấp hơn!'
          : kids
            ? 'Phím nào vừa hát nhỉ?'
            : 'Tìm phím của nốt vừa nghe'
      : state.lastOutcome === 'hit' && state.lastTarget !== null
        ? `🎉 Đúng rồi: ${name(state.lastTarget)}!`
        : revealed !== null
          ? `Đáp án là ${name(revealed)}`
          : 'Nghe kỹ nào…';
  const dots = engine.targets.map((_, i) => (i < state.round || state.status === 'finished' ? 'done' : 'pending'));
  return (
    <div className="grid gap-4" data-testid="ear-finder" data-status={state.status} data-target={state.status === 'answer' ? engine.target : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo}>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400" data-testid="ear-round">
            Vòng {Math.min(state.round + 1, engine.config.rounds)}/{engine.config.rounds}
          </span>
        </Hud>
        <RoundDots results={dots.map((d) => (d === 'done' ? 'correct' : 'pending'))} index={state.round} />
      </div>
      <div className="grid justify-items-center gap-3 rounded-3xl bg-gradient-to-br from-sky-100 to-violet-100 p-5 ring-1 ring-sky-200 dark:from-sky-950 dark:to-violet-950 dark:ring-sky-900">
        <div className={`text-6xl ${state.status === 'listen' ? 'animate-pulse' : ''}`} aria-hidden>
          {state.status === 'listen' ? '👂' : state.status === 'answer' ? '🎹' : '🏁'}
        </div>
        <p className={`text-center font-bold ${kids ? 'text-3xl' : 'text-2xl'}`} aria-live="polite" data-testid="ear-prompt">
          {prompt}
        </p>
        <div className="flex gap-2" aria-label={`Đã thử ${state.tries}/${engine.config.maxTries} lần`}>
          {Array.from({ length: engine.config.maxTries }, (_, i) => (
            <span key={i} className={`size-4 rounded-full ${answering && i < state.tries ? 'bg-rose-400' : 'bg-white/80 ring-1 ring-sky-300 dark:bg-slate-800'}`} />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => engine.replay()} disabled={!answering} data-testid="ear-replay">
            🔁 Nghe lại
          </Button>
          <Button variant="secondary" onClick={() => soundOutput.playNote(spec.reference, 0.8)} disabled={!answering} data-testid="ear-reference">
            🎯 Nghe nốt mốc {name(spec.reference)}
          </Button>
        </div>
      </div>
      <div className="h-40">
        <PianoKeyboard
          from={spec.keyboard.from}
          to={spec.keyboard.to}
          expected={revealed}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={settings.labelStyle}
          onPress={(m) => {
            if (answering) soundOutput.playNote(m, 0.4);
            virtualInput.press(m);
          }}
        />
      </div>
    </div>
  );
}
