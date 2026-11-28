import type { Hand } from '../../core/lessons/types';
import { animalFor } from '../../core/rainbowHands/analysis';
import { ROUND_POSITIONS, type RouteStep } from '../../core/rainbowHands/route';

/** Nhân vật mỗi tay: khác con vật + nhãn chữ + vị trí (không chỉ dựa vào màu). */
export const HAND_CHAR: Record<Hand, { icon: string; name: string; tag: string; text: string; ring: string; bg: string }> = {
  left: { icon: '🐻', name: 'Gấu Trái', tag: 'TRÁI', text: 'text-sky-800 dark:text-sky-200', ring: 'ring-sky-400', bg: 'bg-sky-100 dark:bg-sky-900/60' },
  right: { icon: '🐰', name: 'Thỏ Phải', tag: 'PHẢI', text: 'text-orange-800 dark:text-orange-200', ring: 'ring-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/60' },
};

const BANDS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'];
/** Bầu trời đổi theo vòng cho đỡ nhàm (sáng → trưa → chiều → hoàng hôn → đêm sao). */
const SKIES = [
  'from-sky-300 via-sky-100 to-emerald-100 dark:from-sky-900 dark:via-slate-900 dark:to-emerald-950',
  'from-cyan-300 via-sky-100 to-lime-100 dark:from-cyan-950 dark:via-slate-900 dark:to-lime-950',
  'from-amber-200 via-rose-100 to-emerald-100 dark:from-amber-950 dark:via-slate-900 dark:to-emerald-950',
  'from-orange-300 via-pink-200 to-violet-200 dark:from-orange-950 dark:via-fuchsia-950 dark:to-violet-950',
  'from-indigo-400 via-violet-300 to-sky-200 dark:from-indigo-950 dark:via-violet-950 dark:to-slate-900',
];

const short = (name: string) => name.replace(' cao', '↑').replace(' thấp', '↓');
/** Tên nốt trên đá bước; ngược chiều hai tay khác nốt → "trái/phải". */
function stoneLabel(step: RouteStep): string {
  const names = [...new Set(step.notes.map((n) => short(n.name)))];
  return names.join('/');
}

/** Toạ độ % của vị trí 0–14 trên vòm cầu vồng (chân trái → đỉnh = Đô cao → chân phải). */
function arcPoint(pos: number, lane: number): { x: number; y: number } {
  const theta = Math.PI * (1 - pos / (ROUND_POSITIONS - 1));
  return { x: 50 + (39 + lane) * Math.cos(theta), y: 86 - (66 + lane * 1.4) * Math.sin(theta) };
}

export function RainbowScene({
  steps,
  index,
  hands,
  handsDone,
  round,
  roundsTarget,
  roundsComplete,
  celebrating,
  wrongHand,
  showNames,
}: {
  steps: readonly RouteStep[];
  index: number;
  hands: readonly Hand[];
  handsDone: readonly Hand[];
  round: number;
  roundsTarget: number;
  roundsComplete: number;
  celebrating: boolean;
  /** Tay vừa bấm sai (nhân vật lắc nhẹ). */
  wrongHand: Hand | null;
  showNames: boolean;
}) {
  const lit = Math.round((BANDS.length * Math.min(roundsComplete, roundsTarget)) / Math.max(1, roundsTarget));
  const pos = steps[Math.min(index, steps.length - 1)]?.pos ?? 0;
  const animal = animalFor(round);
  const homeCount = Math.min(roundsComplete, 12);
  return (
    <section
      className={`relative h-full min-h-40 overflow-hidden rounded-[2rem] bg-gradient-to-b shadow-inner ring-2 ring-white/60 transition-colors duration-700 ${SKIES[(round - 1) % SKIES.length]}`}
      data-testid="rainbow-scene"
      data-lit={lit}
      aria-label={`Cầu vồng: vòng ${round}, đã sáng ${lit}/${BANDS.length} dải màu`}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {BANDS.map((c, i) => {
          const r = 46 - i * 2.2;
          const ry = 76 - i * 3.1;
          return (
            <path
              key={c}
              d={`M ${50 - r} 90 A ${r} ${ry} 0 0 1 ${50 + r} 90`}
              fill="none"
              stroke={c}
              strokeWidth={2.2}
              strokeLinecap="round"
              opacity={i < lit ? 0.95 : 0.18}
              className="transition-opacity duration-700"
            />
          );
        })}
        <rect x="0" y="90" width="100" height="10" className="fill-emerald-500/70 dark:fill-emerald-800/80" />
      </svg>
      {/* Đá bước trên cầu vồng — chỉ các vị trí của lượt đang tập. */}
      {steps.map((s, i) => {
        const p = arcPoint(s.pos, 0);
        const done = i < index;
        const now = i === index;
        return (
          <div
            key={s.pos}
            className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[10px] font-black transition-all sm:text-xs ${
              now ? 'h-9 min-w-9 px-1 bg-white text-violet-700 shadow-lg ring-4 ring-fuchsia-400 sm:h-11 sm:min-w-11' : done ? 'h-6 min-w-6 px-1 bg-white/90 text-emerald-700 sm:h-7 sm:min-w-7' : 'h-6 min-w-6 px-1 bg-white/50 text-slate-600 sm:h-7 sm:min-w-7'
            }`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            data-testid={now ? 'rainbow-stone-current' : undefined}
          >
            {done ? '✓' : showNames ? stoneLabel(s) : i + 1}
          </div>
        );
      })}
      {/* Hai nhân vật đứng trên đá hiện tại: tay trái phía trong, tay phải phía ngoài. */}
      {hands.map((h) => {
        const p = arcPoint(pos, h === 'left' ? -9 : 6);
        const ready = handsDone.includes(h);
        const c = HAND_CHAR[h];
        return (
          <div
            key={h}
            className={`absolute z-10 grid -translate-x-1/2 -translate-y-1/2 justify-items-center transition-[left,top] duration-500 ease-out ${wrongHand === h ? 'animate-shake' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            data-testid={`rainbow-char-${h}`}
            data-ready={ready}
          >
            <span className={`relative text-4xl drop-shadow-md transition-transform sm:text-5xl ${ready ? '-translate-y-2 scale-110' : ''}`}>
              {c.icon}
              {ready && <span className="absolute -top-3 -right-4 rounded-full bg-emerald-500 px-1.5 text-sm font-black text-white shadow">✓</span>}
            </span>
            <span className={`rounded-full px-2 text-[10px] font-black ring-2 sm:text-xs ${c.bg} ${c.text} ${c.ring}`}>{c.tag}</span>
          </div>
        );
      })}
      {/* Bạn thú đi cùng vòng này; về tới nhà khi xong vòng. */}
      <div className="absolute bottom-[3%] left-[3%] z-10 text-3xl transition-all duration-1000 sm:text-4xl" style={celebrating ? { left: '84%' } : undefined} aria-label="Bạn thú đang đi cùng">
        {animal}
      </div>
      <div className="absolute right-[3%] bottom-[3%] grid justify-items-center" aria-label={`Đã về nhà ${roundsComplete} bạn thú`}>
        <span className="text-4xl sm:text-5xl">🏠</span>
        <span className="flex max-w-28 flex-wrap justify-center text-lg leading-none" data-testid="rainbow-home">
          {Array.from({ length: homeCount }, (_, i) => (
            <span key={i}>{animalFor(i + 1)}</span>
          ))}
        </span>
      </div>
    </section>
  );
}
