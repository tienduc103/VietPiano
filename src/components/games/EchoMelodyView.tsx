import { useEffect, useMemo, useState } from 'react';
import type { UiMode } from '../../core/curriculum/types';
import { soundOutput } from '../../core/audio/SoundOutput';
import { EchoMelodyGame, KIDS_ECHO_CONFIG } from '../../core/games/EchoMelodyGame';
import { gameNoteName, type GameSpec } from '../../core/games/gameForLesson';
import { gameStars } from '../../core/games/NoteCatchGame';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { pitchToLabel } from '../../core/music/notes';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { Button, Toggle } from '../ui';
import { Hud, useGameState, useKeyFlash, type GameResult } from './shared';

/** Chờ trước khi phát (để người học kịp nghe), lâu hơn sau khi đánh sai. */
const LEAD_MS = 700;
const AFTER_WRONG_MS = 1200;

/** "Giai điệu bí ẩn": nghe đoạn nhạc rồi đánh lại; đúng thì đoạn sau dài thêm một nốt. */
export function EchoMelodyView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'echo-melody' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const engine = useMemo(() => new EchoMelodyGame(spec.notes, kids ? KIDS_ECHO_CONFIG : {}), [spec, kids]);
  const state = useGameState(engine);
  // Bé: phím sáng lên theo từng nốt lúc phát (vừa nghe vừa nhìn); người lớn: chỉ nghe.
  const [showKeys, setShowKeys] = useState(kids);
  const [lit, setLit] = useState<number | null>(null);
  const [hint, setHint] = useState<number | null>(null);
  const noteSec = kids ? 0.75 : 0.6;

  // Phát đoạn nhạc mỗi lần bước vào "listen"; phát xong mới tới lượt người học.
  useEffect(() => {
    if (state.status !== 'listen') return;
    const melody = engine.melody;
    const timers: number[] = [];
    const lead = state.lastOutcome === 'wrong' ? AFTER_WRONG_MS : LEAD_MS;
    timers.push(
      window.setTimeout(() => {
        const ms = soundOutput.playSequence(melody.map((midi, i) => ({ midi, start: i * noteSec, duration: noteSec * 0.9, velocity: 90 })));
        melody.forEach((m, i) => timers.push(window.setTimeout(() => setLit(m), 80 + i * noteSec * 1000)));
        const total = Math.max(ms, melody.length * noteSec * 1000);
        timers.push(
          window.setTimeout(() => {
            setLit(null);
            engine.listenDone();
          }, total),
        );
      }, lead),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      soundOutput.stop();
      setLit(null);
    };
  }, [state.listenId, state.status === 'listen']);

  useEffect(() => setHint(null), [state.round]);

  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome === 'wrong' ? 'wrong' : state.lastOutcome ? 'hit' : null);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource, { baseMidi: spec.keyboard.from });

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: state.roundsCleared, total: engine.config.rounds, bestCombo: engine.config.startLength + state.roundsCleared - 1 }),
      900,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const length = engine.melody.length;
  const answering = state.status === 'answer';
  return (
    <div className="grid gap-4" data-testid="echo-melody" data-status={state.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={0}>
          <span aria-label={`${state.lives} mạng`}>
            {'❤️'.repeat(state.lives)}
            <span className="opacity-25">{'🤍'.repeat(engine.config.lives - state.lives)}</span>
          </span>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400" data-testid="echo-round">
            Vòng {Math.min(state.round + 1, engine.config.rounds)}/{engine.config.rounds} · {length} nốt
          </span>
        </Hud>
        <div className="w-64">
          <Toggle checked={showKeys} onChange={setShowKeys} label={<span className="text-sm">Hiện phím khi phát</span>} />
        </div>
      </div>
      <div className="grid justify-items-center gap-3 rounded-3xl bg-gradient-to-br from-indigo-100 to-fuchsia-100 p-5 ring-1 ring-fuchsia-200 dark:from-indigo-950 dark:to-fuchsia-950 dark:ring-fuchsia-900">
        <div className={`text-6xl ${state.status === 'listen' ? 'animate-pulse' : ''}`} aria-hidden>
          {state.status === 'listen' ? '👂' : state.status === 'answer' ? '🎹' : '🔮'}
        </div>
        <p className={`text-center font-bold ${kids ? 'text-3xl' : 'text-2xl'}`} aria-live="polite" data-testid="echo-prompt">
          {state.status === 'listen'
            ? state.lastOutcome === 'wrong'
              ? 'Chưa đúng — nghe lại nhé…'
              : state.lastOutcome === 'round'
                ? '🎉 Đúng rồi! Đoạn tiếp theo dài hơn…'
                : 'Nghe kỹ nào…'
            : state.status === 'answer'
              ? 'Đến lượt bạn: đánh lại đoạn vừa nghe'
              : state.roundsCleared === engine.config.rounds
                ? 'Xuất sắc!'
                : 'Hết lượt rồi!'}
        </p>
        <div className="flex gap-2" aria-label={`Đã đánh ${state.pos}/${length} nốt`}>
          {Array.from({ length }, (_, i) => (
            <span key={i} className={`size-5 rounded-full ${i < state.pos ? 'bg-emerald-500' : 'bg-white/80 ring-1 ring-fuchsia-300 dark:bg-slate-800'}`} />
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Button onClick={() => engine.replay()} disabled={!answering} data-testid="echo-replay">
            🔁 Nghe lại (−{engine.config.replayPenalty})
          </Button>
          <Button onClick={() => setHint(engine.hint())} disabled={!answering || hint !== null} data-testid="echo-hint">
            💡 Gợi ý nốt đầu{hint !== null ? `: ${pitchToLabel(gameNoteName(spec, hint), settings.labelStyle)}` : ` (−${engine.config.hintPenalty})`}
          </Button>
        </div>
      </div>
      <div className="h-40">
        <PianoKeyboard
          from={spec.keyboard.from}
          to={spec.keyboard.to}
          expected={answering && state.pos === 0 ? hint : null}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={settings.labelStyle}
          highlighted={showKeys && lit !== null ? new Set([lit]) : undefined}
          onPress={(m) => {
            if (answering) soundOutput.playNote(m, 0.4);
            virtualInput.press(m);
          }}
        />
      </div>
    </div>
  );
}
