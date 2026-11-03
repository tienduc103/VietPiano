import type { ReactNode } from 'react';
import type { Finger, LeftHandStep } from '../core/lessons/types';
import { pitchToLabel, type NoteLabelStyle } from '../core/music/notes';

/**
 * Hướng dẫn hai tay của bài khuông đôi có phần đệm: mỗi bước hiện nốt + ngón của tay phải (giai điệu)
 * và tay trái (nốt/hợp âm đệm, hoặc "giữ" khi hợp âm đang ngân). `grading` = đang chấm cả hai tay:
 * nốt đã đánh đúng được gạch + tô xanh, tay đã đủ thì đánh dấu ✓.
 * `sizer` = bản vô hình chỉ để chừa chỗ: không gắn `data-testid` (trùng với bản thật).
 */
export function HandsGuide({
  rightPitch,
  rightFinger,
  left,
  pendingLeft,
  melodyDone,
  grading,
  labelStyle,
  sizer = false,
}: {
  rightPitch: string;
  rightFinger?: Finger;
  left: LeftHandStep;
  pendingLeft: readonly number[];
  melodyDone: boolean;
  grading: boolean;
  labelStyle: NoteLabelStyle;
  sizer?: boolean;
}) {
  const testId = (id: string) => (sizer ? undefined : id);
  const leftFingers = left.fingers.filter((f): f is Finger => f !== undefined);
  return (
    <div className="flex items-stretch gap-2" data-testid={testId('hands-guide')}>
      <HandBox label="Tay phải" done={grading && melodyDone}>
        <span className="text-4xl font-bold text-fuchsia-600 dark:text-fuchsia-300" data-testid={testId('expected-note')}>
          {pitchToLabel(rightPitch, labelStyle)}
        </span>
        {rightFinger && (
          <span className="text-lg font-bold text-orange-500 dark:text-orange-300" data-testid={testId('expected-finger')}>
            ngón {rightFinger}
          </span>
        )}
      </HandBox>
      <HandBox label="Tay trái" done={grading && left.midis.length > 0 && pendingLeft.length === 0}>
        {left.midis.length > 0 ? (
          <>
            <span className="flex gap-1.5 text-2xl font-bold" data-testid={testId('expected-left')}>
              {left.pitches.map((p, i) => {
                // Phím lặp trong bước (Alberti): gạch dần từ lần đầu, số lần còn thiếu giữ lại ở cuối.
                const later = left.midis.slice(i).filter((m) => m === left.midis[i]).length;
                const pressed = grading && later > pendingLeft.filter((m) => m === left.midis[i]).length;
                return (
                  <span key={i} className={pressed ? 'text-emerald-600 line-through decoration-2 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-300'}>
                    {pitchToLabel(p, labelStyle)}
                  </span>
                );
              })}
            </span>
            {leftFingers.length === left.midis.length && (
              <span className="text-lg font-bold text-orange-500 dark:text-orange-300" data-testid={testId('expected-left-finger')}>
                ngón {leftFingers.join('·')}
              </span>
            )}
          </>
        ) : (
          <span className="text-lg text-slate-500 dark:text-slate-400" data-testid={testId('expected-left')}>
            {left.held.length > 0 ? `giữ ${left.held.map((p) => pitchToLabel(p, labelStyle)).join(' ')}` : 'nghỉ'}
          </span>
        )}
      </HandBox>
    </div>
  );
}

// Cao cố định đủ cho hàng tên nốt + hàng số ngón: bước không ghi ngón / "giữ" hợp âm không làm ô thấp đi
// (ô co giãn theo từng nốt thì vùng khuông nhạc phía trên co giãn theo).
function HandBox({ label, done, children }: { label: string; done: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex min-h-23 min-w-28 flex-col items-center justify-center rounded-xl px-3 py-1 ring-1 ${done ? 'bg-emerald-50 ring-emerald-300 dark:bg-emerald-950 dark:ring-emerald-700' : 'ring-violet-100 dark:ring-violet-900'}`}
    >
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
        {done && ' ✓'}
      </span>
      {children}
    </div>
  );
}
