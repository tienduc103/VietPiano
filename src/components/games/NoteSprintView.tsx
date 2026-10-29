import { useEffect, useMemo } from 'react';
import type { UiMode } from '../../core/curriculum/types';
import { gameNoteName, type GameSpec } from '../../core/games/gameForLesson';
import { KIDS_NOTE_SPRINT_CONFIG, NoteSprintGame } from '../../core/games/NoteSprintGame';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { Hud, useFrameClock, useGameState, useKeyFlash, type GameResult } from './shared';
import { useStaffSvgs } from './StaffShootView';

/** "Đua đọc nốt 60 giây": mỗi lúc một nốt trên khuông — đánh đúng thật nhanh, sai bị trừ giây. */
export function NoteSprintView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'note-sprint' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const svgs = useStaffSvgs(spec.notes, spec.clef, (m) => gameNoteName(spec, m));
  const engine = useMemo(() => new NoteSprintGame(spec.notes, kids ? KIDS_NOTE_SPRINT_CONFIG : {}), [spec, kids]);
  // Đồng hồ chỉ chạy khi đã vẽ xong khuông cho các nốt.
  useEffect(() => {
    if (svgs && engine.getState().status === 'ready') engine.start(performance.now());
  }, [svgs, engine]);
  const state = useGameState(engine);
  const now = useFrameClock(state.status === 'playing', (t) => engine.tick(t));
  const flash = useKeyFlash(state.lastEventTime, state.lastMidi, state.lastOutcome);
  useNoteInput({ onNote: (e) => engine.answer(e.midi, e.time) }, settings.inputSource, { baseMidi: spec.keyboard.from });

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: engine.stars, hits: state.hits, total: state.hits + state.wrongs, bestCombo: state.bestCombo }),
      700,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const remaining = engine.remaining(now);
  const seconds = state.status === 'ready' ? engine.config.durationMs / 1000 : Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const [one, two, three] = engine.config.starHits;
  return (
    <div className="grid gap-4" data-testid="note-sprint" data-status={state.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo}>
          <span className="tabular-nums" data-testid="sprint-hits">
            ✅ {state.hits}
          </span>
        </Hud>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          ★ {one} · ★★ {two} · ★★★ {three} nốt
        </span>
      </div>
      <div className="grid justify-items-center gap-3 rounded-3xl bg-gradient-to-br from-amber-100 to-rose-100 p-5 ring-1 ring-amber-200 dark:from-amber-950 dark:to-rose-950 dark:ring-amber-900">
        <div className={`text-4xl font-extrabold tabular-nums ${seconds <= 10 ? 'text-rose-600 dark:text-rose-300' : ''}`} data-testid="sprint-seconds">
          ⏱️ {seconds} giây
        </div>
        <div className="h-3 w-full max-w-xl overflow-hidden rounded-full bg-white/70 dark:bg-slate-800" role="progressbar" aria-label="Thời gian còn lại" aria-valuenow={Math.round(remaining * 100)}>
          <div className={`h-full rounded-full ${remaining > 0.2 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${remaining * 100}%` }} />
        </div>
        <div
          key={state.hits}
          className={`w-64 rounded-3xl bg-white p-2 text-slate-900 shadow-lg ring-4 sm:w-80 ${state.lastOutcome === 'wrong' && now - state.lastEventTime < 300 ? 'animate-shake ring-rose-400' : 'animate-pop ring-amber-300'}`}
          data-testid="sprint-card"
          data-midi={state.current}
        >
          {svgs ? (
            <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs.get(state.current) ?? '' }} />
          ) : (
            <div className="grid h-32 place-items-center text-xl font-bold">Đang chuẩn bị khuông nhạc…</div>
          )}
        </div>
        <p className="min-h-7 font-semibold" aria-live="polite">
          {state.status === 'finished' ? '⏰ Hết giờ!' : state.lastOutcome === 'hit' ? '🎉 Đúng!' : state.lastOutcome === 'wrong' ? `💥 Sai rồi — trừ ${engine.config.penaltyMs / 1000} giây` : kids ? 'Bấm phím của nốt trên khuông!' : 'Đọc nốt và đánh đúng phím'}
        </p>
      </div>
      <div className="h-36">
        <PianoKeyboard from={spec.keyboard.from} to={spec.keyboard.to} expected={null} detected={micLive?.midi ?? null} flash={flash} labelStyle={settings.labelStyle} onPress={(m) => virtualInput.press(m)} />
      </div>
    </div>
  );
}
