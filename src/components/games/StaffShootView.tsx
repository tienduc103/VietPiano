import { useEffect, useMemo, useState } from 'react';
import { pieceToLesson } from '../../core/curriculum/piece';
import type { UiMode } from '../../core/curriculum/types';
import { gameNoteName, type GameSpec } from '../../core/games/gameForLesson';
import { gameStars, makeNoteSequence, NoteCatchGame, type NoteCatchConfig } from '../../core/games/NoteCatchGame';
import { virtualInput } from '../../core/input/VirtualInputProvider';
import type { Clef } from '../../core/lessons/types';
import type { KeySignature } from '../../core/music/keySignature';
import { renderScore, scoreFontsReady } from '../../core/score/ScoreRenderer';
import { useNoteInput } from '../../hooks/useNoteInput';
import { useMic } from '../../store/micStore';
import { useSettings } from '../../store/settingsStore';
import { PianoKeyboard } from '../PianoKeyboard';
import { Hud, useFrameClock, useGameState, useKeyFlash, type GameResult } from './shared';

/** Đọc nốt cần thời gian hơn Hứng nốt rơi (không có tên nốt / làn phím gợi ý). */
const ADULT: Partial<NoteCatchConfig> = { count: 14, fallMs: 6500, minFallMs: 4200, gapMs: 2300, minGapMs: 1500, lives: 3 };
const KIDS: Partial<NoteCatchConfig> = { count: 10, fallMs: 8500, minFallMs: 6000, gapMs: 3200, minGapMs: 2400, lives: 5 };
const POP_MS = 400;
const LANES = 3;
/** Dải dọc (toạ độ VexFlow) giữ lại trên mỗi quả bóng. */
const STAFF_TOP = 38;
const STAFF_BAND = 108;

/** Vẽ sẵn mỗi nốt một khuông nhỏ (SVG) — một lần cho cả ván, không vẽ lại VexFlow mỗi khung hình. */
function useStaffSvgs(notes: readonly number[], clef: Clef, nameOf: (midi: number) => string, keySignature?: KeySignature): Map<number, string> | null {
  const [svgs, setSvgs] = useState<Map<number, string> | null>(null);
  useEffect(() => {
    let alive = true;
    void scoreFontsReady().then(() => {
      if (!alive) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
      document.body.appendChild(host);
      const out = new Map<number, string>();
      try {
        for (const m of new Set(notes)) {
          const lesson = pieceToLesson({ notation: `${nameOf(m)}/w`, clef, hand: clef === 'bass' ? 'left' : 'right', bpm: 60, timeSignature: [4, 4], keySignature }, `shoot-${m}`);
          const r = renderScore(host, lesson, { showNames: false, labelStyle: 'letter' });
          const svg = host.querySelector('svg');
          if (!svg) continue;
          r.cursor.remove(); // con trỏ nốt hiện tại
          // Cắt dải quanh 5 dòng kẻ (dòng trên y≈70, dưới y≈110) + chỗ cho dòng kẻ phụ — bỏ vùng tên nốt / số ngón.
          const box = svg.getBBox();
          const x = box.width > 0 ? box.x - 6 : 0;
          svg.setAttribute('viewBox', `${x} ${STAFF_TOP} ${box.width > 0 ? box.width + 12 : r.width} ${STAFF_BAND}`);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.removeAttribute('style');
          out.set(m, svg.outerHTML);
        }
      } catch (err) {
        console.error('[VietPiano] Lỗi vẽ khuông cho trò chơi', err);
      } finally {
        host.remove();
      }
      setSvgs(out);
    });
    return () => {
      alive = false;
    };
    // `nameOf` suy từ spec — cố định trong suốt ván.
  }, [notes, clef, keySignature]);
  return svgs;
}

/** "Bắn bóng trên khuông": bóng mang nốt vẽ trên khuông bay sang trái — đọc nốt rồi đánh trước khi bóng bay mất. */
export function StaffShootView({ spec, mode, golden, onEnd }: { spec: Extract<GameSpec, { kind: 'staff-shoot' }>; mode: UiMode; golden: number[]; onEnd: (r: GameResult) => void }) {
  const settings = useSettings((s) => s.settings);
  const micLive = useMic((s) => s.live);
  const kids = mode === 'kids';
  const svgs = useStaffSvgs(spec.notes, spec.clef, (m) => gameNoteName(spec, m), spec.keySignature);
  const engine = useMemo(() => {
    const cfg = { ...(kids ? KIDS : ADULT), golden };
    // Nốt vàng (hay đọc nhầm) xuất hiện nhiều hơn.
    return new NoteCatchGame(makeNoteSequence([...spec.notes, ...golden], cfg.count ?? 14), cfg);
  }, [spec, kids, golden]);
  // Chỉ bắt đầu khi đã vẽ xong khuông cho các nốt.
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
      () => onEnd({ score: state.score, stars: gameStars(engine.accuracy), hits: state.hits, total: engine.total, bestCombo: state.bestCombo }),
      700,
    );
    return () => window.clearTimeout(id);
    // Chỉ báo một lần khi ván vừa kết thúc.
  }, [state.status]);

  const w = kids ? 230 : 200;
  const visible = state.drops.filter((d) => d.spawnAt <= now && (d.state === 'pending' || (d.state === 'hit' && d.hitAt !== null && now - d.hitAt < POP_MS)));
  return (
    <div className="grid gap-3" data-testid="staff-shoot">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hud score={state.score} combo={state.combo}>
          <span aria-label={`${state.lives} mạng`} data-testid="game-lives">
            {'❤️'.repeat(state.lives)}
            <span className="opacity-25">{'🤍'.repeat(engine.config.lives - state.lives)}</span>
          </span>
        </Hud>
        <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
          {golden.length > 0 && <span className="mr-3">⭐ bóng vàng = nốt hay nhầm, ×2 điểm</span>}
          {state.hits + state.misses}/{engine.total} bóng
        </span>
      </div>
      <div className="relative h-[min(46vh,380px)] overflow-hidden rounded-3xl bg-gradient-to-b from-sky-300 via-sky-200 to-emerald-100 ring-1 ring-sky-300 dark:from-sky-900 dark:via-slate-800 dark:to-emerald-950 dark:ring-sky-800" data-testid="shoot-field">
        <div className="absolute top-0 bottom-0 left-0 w-2 bg-gradient-to-b from-rose-400 to-amber-400 opacity-70" />
        {visible.map((d) => {
          const p = Math.min(1, (now - d.spawnAt) / (d.landAt - d.spawnAt));
          const hit = d.state === 'hit';
          const gold = engine.isGolden(d.midi);
          return (
            <div
              key={d.id}
              data-testid="balloon"
              data-midi={d.midi}
              data-state={d.state}
              className={`absolute rounded-3xl bg-white p-1 text-slate-900 shadow-lg ${gold ? 'ring-4 ring-amber-400' : 'ring-2 ring-sky-400'} ${hit ? 'scale-125 opacity-0 transition duration-300' : ''}`}
              style={{ width: w, left: `calc(${1 - p} * (100% - ${w}px))`, top: `${6 + (d.id % LANES) * 30}%` }}
            >
              <span className="absolute -top-3 -right-2 text-2xl" aria-hidden>
                {gold ? '⭐' : '🎈'}
              </span>
              <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs?.get(d.midi) ?? '' }} />
            </div>
          );
        })}
        {!svgs && <div className="absolute inset-0 grid place-items-center text-2xl font-bold">Đang chuẩn bị khuông nhạc…</div>}
      </div>
      <div className="h-36">
        <PianoKeyboard from={spec.keyboard.from} to={spec.keyboard.to} expected={null} detected={micLive?.midi ?? null} flash={flash} labelStyle={settings.labelStyle} onPress={(m) => virtualInput.press(m)} />
      </div>
      <p className="text-center text-sm text-slate-500 dark:text-slate-400">Đọc nốt trên khuông rồi đánh đúng phím trước khi bóng bay khỏi mép trái.</p>
    </div>
  );
}
