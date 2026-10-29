import { useEffect, useMemo, useRef } from 'react';
import type { UiMode } from '../../core/curriculum/types';
import { soundOutput } from '../../core/audio/SoundOutput';
import type { GameSpec } from '../../core/games/gameForLesson';
import { gameStars } from '../../core/games/NoteCatchGame';
import { KIDS_STEADY_BEAT_CONFIG, SteadyBeatGame, type BeatGrade } from '../../core/games/SteadyBeatGame';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useSettings } from '../../store/settingsStore';
import { Hud, useFrameClock, useGameState, type GameResult } from './shared';

/** Độ trễ ước lượng micro (như bài Tiết tấu; chưa đo trên iPad thật). */
const MIC_LATENCY_MS = 60;
const GUIDE_BEATS = 8;
/** Nghe trước bao nhiêu phách rồi mới gõ theo. */
const LISTEN_BEATS = 4;

const GRADE_TEXT: Record<BeatGrade, string> = { perfect: 'Đều!', good: 'Khá', off: 'Lệch', miss: 'Bỏ sót' };
const GRADE_DOT: Record<BeatGrade, string> = { perfect: 'bg-emerald-500', good: 'bg-lime-400', off: 'bg-amber-500', miss: 'bg-rose-500' };

/** "Giữ nhịp tim": gõ theo metronome, rồi metronome tắt — tự giữ nhịp đều. Không xét cao độ. */
export function SteadyBeatView({ spec, mode, onEnd }: { spec: Extract<GameSpec, { kind: 'steady-beat' }>; mode: UiMode; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const kids = mode === 'kids';
  const engine = useMemo(() => {
    const g = new SteadyBeatGame({ bpm: spec.bpm, silentBeats: spec.silentBeats, guideBeats: GUIDE_BEATS, ...(kids ? KIDS_STEADY_BEAT_CONFIG : {}) });
    g.start(performance.now() + 600);
    return g;
  }, [spec, kids]);
  const state = useGameState(engine);
  const nextClick = useRef(0);
  const now = useFrameClock(state.status === 'playing', (t) => {
    engine.tick(t);
    const clicks = engine.clicks;
    while (nextClick.current < clicks.length && clicks[nextClick.current].at <= t) {
      const c = clicks[nextClick.current++];
      if (t - c.at < 100) soundOutput.click(c.accent);
    }
  });
  useNoteInput({ onNote: (e) => engine.tap(e.time - (e.source === 'microphone' ? MIC_LATENCY_MS : 0)) }, settings.inputSource);

  useEffect(() => {
    if (state.status !== 'finished') return;
    const id = window.setTimeout(
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: engine.hits, total: engine.total, bestCombo: state.bestCombo }),
      1500,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const beat = Math.floor((now - state.startAt) / engine.beatMs);
  const phase = state.status === 'finished' ? 'done' : now < state.startAt ? 'ready' : now < engine.silentFrom ? (beat < LISTEN_BEATS ? 'listen' : 'follow') : 'solo';
  const fresh = now - state.lastEventTime < 250;
  // Lúc metronome còn kêu: tim đập theo phách; tự giữ nhịp: tim đập theo lần gõ.
  const pulse = phase === 'listen' || phase === 'follow' ? (now - state.startAt) % engine.beatMs < 150 : fresh;
  const dev = state.lastDeviation;
  const held = engine.heldBpm;
  return (
    <div className="grid gap-4" data-testid="steady-beat" data-phase={phase}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo}>
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{spec.bpm} BPM</span>
        </Hud>
        <div className="flex flex-wrap gap-1" aria-label={`Đã chấm ${state.grades.length}/${engine.total} phách`} data-testid="beat-dots">
          {Array.from({ length: engine.total }, (_, i) => {
            const g = state.grades[i];
            return <span key={i} className={`h-3 w-4 rounded-full ${g ? GRADE_DOT[g] : 'bg-violet-200 dark:bg-slate-600'}`} data-grade={g} />;
          })}
        </div>
      </div>
      <button
        type="button"
        className="grid min-h-72 select-none justify-items-center gap-3 rounded-3xl bg-gradient-to-br from-rose-100 to-pink-100 p-6 ring-1 ring-rose-200 active:brightness-95 dark:from-rose-950 dark:to-pink-950 dark:ring-rose-900"
        onPointerDown={() => engine.tap(performance.now())}
        data-testid="beat-pad"
        aria-label="Gõ nhịp"
      >
        <span className={`text-8xl transition-transform duration-100 ${pulse ? 'scale-125' : 'scale-100'}`} aria-hidden>
          💓
        </span>
        <span className={`font-bold ${kids ? 'text-3xl' : 'text-2xl'}`} aria-live="polite" data-testid="beat-prompt">
          {phase === 'ready' && 'Chuẩn bị…'}
          {phase === 'listen' && `Nghe nhịp… ${(beat % 4) + 1}`}
          {phase === 'follow' && `Gõ theo! ${(beat % 4) + 1}`}
          {phase === 'solo' && (state.lastOutcome && fresh ? GRADE_TEXT[state.lastOutcome] : 'Tự giữ nhịp — gõ tiếp thật đều!')}
          {phase === 'done' && (held ? `Bạn giữ được ${Math.round(held)} BPM (gốc ${spec.bpm})` : 'Hết lượt!')}
        </span>
        <span className="min-h-6 text-sm text-slate-600 dark:text-slate-300">
          {phase === 'solo' && dev !== null && Math.abs(dev) > engine.config.perfectPct ? `${dev > 0 ? 'Chậm hơn' : 'Nhanh hơn'} ${Math.round(Math.abs(dev) * 100)}%` : ''}
          {(phase === 'listen' || phase === 'follow') && 'Gõ phím đàn bất kỳ, hoặc chạm vào ô này'}
        </span>
      </button>
    </div>
  );
}
