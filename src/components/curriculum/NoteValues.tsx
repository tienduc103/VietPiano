import { equationLabel, termLabel, type NoteValue, type NoteValueEquation, type NoteValueTerm } from '../../core/curriculum/noteValues';

const HEAD_Y = 52;
const STEM_TOP = 10;

/** Đường elip xoay `deg` độ, để đục lỗ đầu nốt rỗng bằng evenodd (đúng cả nền sáng lẫn tối). */
function ellipsePath(cx: number, cy: number, rx: number, ry: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  const dx = rx * Math.cos(a);
  const dy = rx * Math.sin(a);
  return `M ${cx - dx} ${cy - dy} A ${rx} ${ry} ${deg} 1 0 ${cx + dx} ${cy + dy} A ${rx} ${ry} ${deg} 1 0 ${cx - dx} ${cy - dy} Z`;
}

const headPath = (value: NoteValue, cx: number): string => {
  if (value === 'w') return `${ellipsePath(cx, HEAD_Y, 11, 7, 0)} ${ellipsePath(cx, HEAD_Y, 6, 3.6, 60)}`;
  const outer = ellipsePath(cx, HEAD_Y, 9, 6.2, -20);
  return value === 'h' ? `${outer} ${ellipsePath(cx, HEAD_Y, 7.4, 3, -20)}` : outer;
};

/** Móc thứ `i` (đếm từ trên xuống) của một nốt đứng riêng. */
const flagPath = (x: number, i: number): string => {
  const y = STEM_TOP + i * 10;
  return `M ${x} ${y} C ${x + 1} ${y + 10} ${x + 14} ${y + 14} ${x + 10} ${y + 28} C ${x + 11} ${y + 17} ${x + 4} ${y + 15} ${x} ${y + 12} Z`;
};

/** Một nhóm hình nốt vẽ bằng SVG (không cần font): móc đơn / móc đôi đứng cạnh nhau nối bằng gạch như trên khuông. */
function NoteGlyphs({ value, count }: { value: NoteValue; count: number }) {
  const flags = value === '8' ? 1 : value === '16' ? 2 : 0;
  const gap = flags > 0 ? 28 : 32;
  const firstX = 14;
  const stemOffset = 8.2;
  const lastStem = firstX + (count - 1) * gap + stemOffset;
  const width = firstX + (count - 1) * gap + (flags > 0 && count === 1 ? 26 : 14);
  const xs = Array.from({ length: count }, (_, i) => firstX + i * gap);
  return (
    <svg viewBox={`0 0 ${width} 62`} width={width * 1.15} height={62 * 1.15} className="text-slate-800 dark:text-slate-100" fill="currentColor" aria-hidden="true" data-note-value={value}>
      {xs.map((x) => (
        <g key={x}>
          <path d={headPath(value, x)} fillRule="evenodd" />
          {value !== 'w' && <rect x={x + stemOffset - 1.1} y={STEM_TOP} width={2.2} height={HEAD_Y - STEM_TOP - 2} />}
          {count === 1 && Array.from({ length: flags }, (_, i) => <path key={i} d={flagPath(x + stemOffset, i)} />)}
        </g>
      ))}
      {count > 1 && Array.from({ length: flags }, (_, i) => <rect key={i} x={firstX + stemOffset - 1.1} y={STEM_TOP + i * 8} width={lastStem - firstX - stemOffset + 2.2} height={5} />)}
    </svg>
  );
}

function BeatChips({ beats }: { beats: number }) {
  return (
    <div className="flex h-[71px] items-center gap-1.5">
      {Array.from({ length: beats }, (_, i) => (
        <span key={i} className="grid size-10 place-items-center rounded-full bg-amber-100 text-lg font-bold text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
          {i + 1}
        </span>
      ))}
    </div>
  );
}

function Term({ term }: { term: NoteValueTerm }) {
  return (
    <div className="grid justify-items-center gap-1">
      {'beats' in term ? <BeatChips beats={term.beats} /> : <NoteGlyphs value={term.value} count={term.count} />}
      <span className="text-base font-semibold whitespace-nowrap text-slate-700 dark:text-slate-200">{termLabel(term)}</span>
    </div>
  );
}

/** Các phép so sánh trường độ, mỗi phép một ô, hai ô một hàng. */
export function NoteEquations({ equations }: { equations: readonly NoteValueEquation[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {equations.map((e) => {
        const label = equationLabel(e);
        return (
          <div key={label} className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 rounded-2xl bg-violet-50 px-4 py-2 dark:bg-violet-950/40" role="img" aria-label={label} data-testid="note-equation">
            <Term term={e.left} />
            <span className="text-3xl font-bold text-violet-600 dark:text-violet-300">=</span>
            <Term term={e.right} />
          </div>
        );
      })}
    </div>
  );
}
