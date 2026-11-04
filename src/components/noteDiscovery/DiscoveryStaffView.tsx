import { memo } from 'react';
import { getNoteDefinition } from '../../core/noteDiscovery/musicModel';
import type { HintLevel } from '../../core/noteDiscovery/types';

interface StaffNoteItem {
  midi: number;
  isCurrent: boolean;
  isCorrect?: boolean;
  isWrong?: boolean;
}

interface Props {
  notes: StaffNoteItem[];
  hintLevel: HintLevel;
  showNames?: boolean;
  reducedMotion?: boolean;
  className?: string;
}

const LINE_SPACING = 16;
const LINE_1_Y = 104; // Dòng 1 (E4)
const STAFF_LINES = [
  LINE_1_Y - 4 * LINE_SPACING, // Line 5 (40)
  LINE_1_Y - 3 * LINE_SPACING, // Line 4 (56)
  LINE_1_Y - 2 * LINE_SPACING, // Line 3 (72)
  LINE_1_Y - 1 * LINE_SPACING, // Line 2 (88 - Khóa Sol)
  LINE_1_Y, // Line 1 (104)
];

export const DiscoveryStaffView = memo(function DiscoveryStaffView({
  notes,
  hintLevel,
  showNames = true,
  reducedMotion = false,
  className = '',
}: Props) {
  const displayNotes = notes.length > 0 ? notes : [];
  const svgWidth = 600;
  const svgHeight = 170;

  // Tính tọa độ X cho các nốt (nếu 1 nốt thì ở giữa, nếu nhiều nốt thì dàn đều)
  const getNoteX = (index: number, total: number) => {
    if (total <= 1) return 330;
    const startX = 220;
    const endX = 520;
    const step = (endX - startX) / (total - 1 || 1);
    return startX + index * step;
  };

  return (
    <div
      className={`relative flex items-center justify-center rounded-3xl border border-violet-200/70 bg-white/95 p-4 shadow-lg backdrop-blur-xs select-none dark:border-violet-900/60 dark:bg-slate-900/90 ${className}`}
      data-testid="discovery-staff-view"
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="h-full max-h-52 w-full max-w-2xl overflow-visible"
        aria-label="Khuông nhạc khóa Sol"
      >
        {/* 5 Dòng kẻ chính */}
        {STAFF_LINES.map((y, idx) => (
          <line
            key={idx}
            x1="50"
            y1={y}
            x2="560"
            y2={y}
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-slate-400 dark:text-slate-500"
          />
        ))}

        {/* Khóa Sol (Treble Clef) biểu tượng vector chuẩn nét */}
        <g transform="translate(65, 20) scale(0.95)" className="text-violet-600 dark:text-violet-400">
          <path
            d="M26.2 92.5c-4.2-2.1-7.8-6.1-9.5-10.8-1.5-4.2-1.7-9.5-.4-14.2 2-7.2 7.1-13.6 13.5-17.2 4.2-2.3 8.8-3.4 13.5-3.3 2.5.1 4.9.6 7.2 1.6 1.8-6.8 2.2-14.1 1.2-21.2-1.1-7.5-4.1-14.7-8.5-20.7-2.6-3.6-5.8-6.8-9.3-9.4l1.8-2.6c5.8 4.2 10.8 9.6 14.6 15.8 4.6 7.5 7.3 16.3 7.8 25.3.3 5.8-.3 11.5-1.7 17.1 3.5 2.5 6.4 5.9 8.2 9.9 2.2 4.8 2.8 10.3 1.7 15.6-1.5 7.4-6.3 13.9-12.7 17.6-5 2.9-10.9 4-16.7 3.2-3.8-.5-7.5-2-10.7-4.7zm13-39.6c-4.5.3-8.8 2.3-12 5.5-3.6 3.7-5.5 8.9-5.1 14.2.4 5.3 3.1 10.2 7.3 13.4 3.8 2.9 8.7 4.1 13.4 3.4 5.3-.8 10-4.1 12.7-8.8 2.3-4.1 2.8-9.1 1.5-13.7-1.4-4.8-4.8-8.8-9.3-11-2.6-1.3-5.6-2.1-8.5-3zm.4 46.2v36.5c-1.8 1.4-4 2.3-6.3 2.5-3.6.3-7.2-1.5-9.2-4.5-2-3-2.2-6.9-.5-10.1 1.5-2.8 4.3-4.8 7.5-5.3 1.8-.3 3.7 0 5.4.8l.1-3.2c-2.3-.9-4.8-1.2-7.2-.8-4.8.8-9 3.9-11.2 8.3-2.3 4.6-2 10.2.8 14.5 2.8 4.3 7.7 6.9 12.8 6.7 4.2-.2 8.3-2.1 11-5.3 1.9-2.3 2.9-5.2 2.8-8.2V99c-2 .1-4-.1-6-.7z"
            fill="currentColor"
          />
        </g>

        {/* Vẽ các nốt nhạc */}
        {displayNotes.map((noteItem, idx) => {
          const noteDef = getNoteDefinition(noteItem.midi);
          const { staffPosition } = noteDef;
          const x = getNoteX(idx, displayNotes.length);
          const y = LINE_1_Y - staffPosition.staffStep * 8;
          const isStemUp = staffPosition.staffStep <= 3;
          const stemX = isStemUp ? x + 11 : x - 11;
          const stemY2 = isStemUp ? y - 48 : y + 48;

          const isCurrent = noteItem.isCurrent;
          const isCorrect = noteItem.isCorrect;
          const isWrong = noteItem.isWrong;

          // Màu sắc dựa theo trạng thái và gợi ý
          let noteFill = 'fill-slate-800 dark:fill-slate-100';
          let noteStroke = 'stroke-slate-800 dark:stroke-slate-100';

          if (isCorrect) {
            noteFill = 'fill-emerald-500';
            noteStroke = 'stroke-emerald-500';
          } else if (isWrong) {
            noteFill = 'fill-rose-500';
            noteStroke = 'stroke-rose-500';
          } else if (isCurrent) {
            noteFill = hintLevel === 0 ? 'fill-fuchsia-500' : 'fill-violet-600 dark:fill-violet-400';
            noteStroke = hintLevel === 0 ? 'stroke-fuchsia-500' : 'stroke-violet-600 dark:stroke-violet-400';
          }

          const showLabel = showNames && (hintLevel < 2 || isCorrect);

          return (
            <g
              key={idx}
              className={`transition-all duration-300 ${isCurrent && !reducedMotion ? 'scale-105' : ''}`}
            >
              {/* Dòng kẻ phụ (Ledger Line) - Cực kỳ quan trọng cho C4 */}
              {staffPosition.ledgerLinesBelow > 0 && (
                <line
                  x1={x - 22}
                  y1={y}
                  x2={x + 22}
                  y2={y}
                  stroke="currentColor"
                  strokeWidth="2.8"
                  className="text-slate-500 dark:text-slate-400"
                />
              )}

              {/* Vòng hào quang sáng bao quanh nốt hiện tại */}
              {isCurrent && (
                <circle
                  cx={x}
                  cy={y}
                  r="24"
                  className="fill-fuchsia-400/20 stroke-fuchsia-400/50 stroke-2 animate-pulse dark:fill-fuchsia-500/25"
                />
              )}

              {/* Đầu nốt (Note head: oval nghiêng tiêu chuẩn âm nhạc) */}
              <ellipse
                cx={x}
                cy={y}
                rx="12.5"
                ry="8.5"
                transform={`rotate(-22 ${x} ${y})`}
                className={`${noteFill} ${noteStroke} stroke-[1.5] transition-colors`}
              />

              {/* Đuôi nốt (Stem) */}
              <line
                x1={stemX}
                y1={y}
                x2={stemX}
                y2={stemY2}
                stroke="currentColor"
                strokeWidth="2.8"
                strokeLinecap="round"
                className={noteStroke}
              />

              {/* Nhãn tên nốt (chỉ hiện khi hintLevel cho phép hoặc khi đã trả lời đúng) */}
              {showLabel && (
                <g transform={`translate(${x}, ${y > 100 ? y + 26 : y + 36})`}>
                  <rect
                    x="-20"
                    y="-12"
                    width="40"
                    height="20"
                    rx="10"
                    className="fill-violet-100 stroke-violet-300 stroke-1 dark:fill-slate-800 dark:stroke-violet-700"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="text-xs font-bold fill-violet-900 dark:fill-violet-200"
                  >
                    {noteDef.solfege}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
