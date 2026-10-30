import { useEffect, useState } from 'react';
import type { FlappyNote } from '../../core/flappyNote/levels';
import { DURATION_NAME, FINGER_NAME } from '../../core/flappyNote/levels';
import { parseNotes } from '../../core/lessons/notation';
import type { Lesson } from '../../core/lessons/types';
import { pitchToLabel, type NoteLabelStyle } from '../../core/music/notes';
import { GRAND_STAFF_GAP, renderScore, scoreFontsReady } from '../../core/score/ScoreRenderer';

const HAND_NAME = { right: 'Phải', left: 'Trái' } as const;

/** Khoá thẻ khuông vẽ sẵn của một nốt: cao độ + trường độ (không trường độ → nốt tròn). */
export const staffCardKey = (n: Pick<FlappyNote, 'midi' | 'duration'>) => `${n.midi}/${n.duration ?? 'w'}`;

/** Dải dọc (toạ độ VexFlow) giữ lại quanh khuông: 5 dòng kẻ + chỗ cho dòng kẻ phụ (như thẻ khuông của trò chơi). */
const STAFF_TOP = 38;
const STAFF_BAND = 108;

/**
 * Vẽ một khuông gồm nốt cần đánh (tô màu + con trỏ) và các nốt sắp đánh. Nốt không có trường độ vẽ là nốt đen cho gọn;
 * có cả nốt tay trái lẫn tay phải → khuông đôi. Giữ SVG cũ tới khi vẽ xong SVG mới (không nháy).
 */
function useGuideStaff(notes: readonly FlappyNote[]): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  const grand = new Set(notes.map((n) => n.clef)).size > 1;
  const key = `${grand ? 'grand' : notes[0]?.clef}|${notes.map((n) => `${n.pitch}/${n.duration ?? 'q'}/${n.hand}`).join(' ')}`;
  useEffect(() => {
    let alive = true;
    void scoreFontsReady().then(() => {
      if (!alive || notes.length === 0) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
      document.body.appendChild(host);
      try {
        const parsed = parseNotes(notes.map((n) => `${n.pitch}/${n.duration ?? 'q'}`).join(' '));
        const lesson: Lesson = {
          id: 'flappy-guide',
          title: '',
          description: '',
          category: 'notes',
          clef: grand ? 'grand' : notes[0].clef,
          timeSignature: [4, 4],
          difficulty: 1,
          hand: grand ? 'both' : notes[0].hand,
          notes: parsed.map((p, i) => ({ ...p, hand: notes[i].hand })),
          tempo: 60,
        };
        const r = renderScore(host, lesson, { showNames: false, labelStyle: 'letter', timeSignature: false });
        const el = host.querySelector('svg');
        if (!el) return;
        r.noteElements[0]?.classList.add('is-current');
        r.cursor.setAttribute('x', String(r.noteCenters[0] - 17));
        const box = el.getBBox();
        const x = box.width > 0 ? box.x - 6 : 0;
        const band = STAFF_BAND + (grand ? GRAND_STAFF_GAP : 0);
        el.setAttribute('viewBox', `${x} ${STAFF_TOP} ${box.width > 0 ? box.width + 12 : r.width} ${band}`);
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        el.removeAttribute('width');
        el.removeAttribute('height');
        el.removeAttribute('style');
        setSvg(el.outerHTML);
      } catch (err) {
        console.error('[VietPiano] Lỗi vẽ khuông Flappy Note', err);
      } finally {
        host.remove();
      }
    });
    return () => {
      alive = false;
    };
    // `key` gói đủ nội dung của `notes`.
  }, [key]);
  return svg;
}

/**
 * Khu A của Flappy Note: một khuông lớn có nốt cần đánh (tô màu) + các nốt sắp đánh, rồi tới phần chữ:
 * tên nốt, trường độ, ngón + tay gợi ý. Đổi ngay khi nốt mục tiêu đổi.
 */
export function NoteGuide({
  target,
  upcoming,
  labelStyle,
  showName,
  showFinger,
  showUpcoming,
  kids,
  flash,
}: {
  target: FlappyNote;
  upcoming: readonly FlappyNote[];
  labelStyle: NoteLabelStyle;
  showName: boolean;
  showFinger: boolean;
  showUpcoming: boolean;
  kids: boolean;
  /** Phản hồi lần đánh gần nhất (viền khung nốt). */
  flash: 'hit' | 'wrong' | null;
}) {
  const other: NoteLabelStyle = labelStyle === 'letter' ? 'solfege' : 'letter';
  const ring = flash === 'hit' ? 'ring-emerald-400' : flash === 'wrong' ? 'ring-rose-400 animate-shake' : 'ring-sky-200 dark:ring-sky-800';
  const shown = showUpcoming ? [target, ...upcoming] : [target];
  const svg = useGuideStaff(shown);
  return (
    <section className="grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-3xl bg-white/90 p-2 shadow-sm ring-1 ring-sky-100 dark:bg-slate-800/90 dark:ring-slate-700" aria-label="Hướng dẫn nốt nhạc" data-testid="flappy-guide">
      <div key={`${target.midi}-${flash}`} className={`h-32 rounded-2xl bg-white px-2 py-1 ring-4 sm:h-36 dark:bg-slate-900 ${ring}`} data-testid="flappy-target-staff" data-midi={target.midi} data-notes={shown.length}>
        {svg ? (
          <div className="h-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-slate-500">Đang vẽ khuông…</div>
        )}
      </div>
      <div className="grid min-w-44 gap-0.5 pr-2" aria-live="polite">
        <p className="text-sm text-slate-500 dark:text-slate-400">Nốt cần đánh</p>
        <p className={`font-extrabold leading-none text-violet-700 dark:text-violet-300 ${kids ? 'text-5xl' : 'text-4xl'}`} data-testid="flappy-target-name">
          {showName ? (
            <>
              {pitchToLabel(target.pitch, labelStyle)} <span className="text-2xl font-bold text-slate-500 dark:text-slate-400">{pitchToLabel(target.pitch, other)}</span>
            </>
          ) : (
            '?'
          )}
        </p>
        {target.duration && (
          <p className="text-sm font-semibold text-sky-700 dark:text-sky-300" data-testid="flappy-target-duration">
            {DURATION_NAME[target.duration]}
          </p>
        )}
        {showFinger && (
          <p className="text-lg font-semibold" data-testid="flappy-target-finger">
            {target.finger ? `Ngón ${target.finger} – ${FINGER_NAME[target.finger]}` : 'Tự chọn ngón'} · Tay {HAND_NAME[target.hand]}
          </p>
        )}
      </div>
    </section>
  );
}
