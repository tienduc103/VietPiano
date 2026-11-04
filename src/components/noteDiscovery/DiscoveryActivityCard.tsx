import { memo } from 'react';
import type { DiscoveryActivity } from '../../core/noteDiscovery/types';
import { Button } from '../ui';

interface Props {
  activity: DiscoveryActivity;
  roundIndex: number;
  promptText: string;
  feedbackText?: string;
  isWrong?: boolean;
  onChoice?: (choiceIndex: number) => void;
  onPlaySample?: () => void;
  onPlayListeningSound?: (which: 1 | 2) => void;
}

export const DiscoveryActivityCard = memo(function DiscoveryActivityCard({
  activity,
  roundIndex,
  promptText,
  feedbackText,
  isWrong,
  onChoice,
  onPlaySample,
  onPlayListeningSound,
}: Props) {
  return (
    <div
      className={`mx-auto w-full max-w-xl rounded-2xl p-4 text-center transition-all ${
        isWrong
          ? 'border-2 border-rose-400 bg-rose-50/90 dark:border-rose-700 dark:bg-rose-950/60'
          : 'border border-violet-100 bg-white/90 shadow-xs dark:border-slate-800 dark:bg-slate-900/80'
      }`}
    >
      <div className="text-base font-bold text-slate-800 dark:text-slate-100 sm:text-lg">
        {promptText}
      </div>

      {feedbackText && (
        <div className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
          {feedbackText}
        </div>
      )}

      {/* Activity 1 (Intro) hoặc 5 (Sequence): Nút nghe mẫu nếu có */}
      {onPlaySample && (
        <div className="mt-3 flex justify-center">
          <Button
            variant="secondary"
            onClick={onPlaySample}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-violet-700 dark:text-violet-300"
          >
            <span aria-hidden>🎵</span>
            <span>Nghe mẫu</span>
          </Button>
        </div>
      )}

      {/* Activity 3: Staff Recognition dạng trắc nghiệm chọn tên nốt */}
      {activity.kind === 'staff-recognition' && activity.rounds[roundIndex]?.answerType === 'choice' && (
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {activity.rounds[roundIndex].choices?.map((choiceText, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => onChoice?.(idx)}
              className="min-h-[48px] min-w-[72px] rounded-xl border-2 border-violet-200 bg-violet-50 px-5 py-2.5 text-base font-extrabold text-violet-900 shadow-sm transition-transform active:scale-95 dark:border-violet-800 dark:bg-slate-800 dark:text-violet-200"
            >
              {choiceText}
            </button>
          ))}
        </div>
      )}

      {/* Activity 4: Listening Practice */}
      {activity.kind === 'listening' && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => onPlayListeningSound?.(1)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold sm:text-sm"
            >
              <span aria-hidden>1️⃣</span>
              <span>Nghe âm 1</span>
            </Button>
            <Button
              variant="secondary"
              onClick={() => onPlayListeningSound?.(2)}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold sm:text-sm"
            >
              <span aria-hidden>2️⃣</span>
              <span>Nghe âm 2</span>
            </Button>
          </div>

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onChoice?.(0)}
              className="min-h-[48px] rounded-xl border-2 border-sky-300 bg-sky-50 px-4 py-2 font-bold text-sky-900 shadow-sm active:scale-95 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-200"
            >
              Cao hơn ⬆️
            </button>
            <button
              type="button"
              onClick={() => onChoice?.(1)}
              className="min-h-[48px] rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-2 font-bold text-amber-900 shadow-sm active:scale-95 dark:border-amber-800 dark:bg-slate-800 dark:text-amber-200"
            >
              Thấp hơn ⬇️
            </button>
            <button
              type="button"
              onClick={() => onChoice?.(2)}
              className="min-h-[48px] rounded-xl border-2 border-slate-300 bg-slate-50 px-4 py-2 font-bold text-slate-800 shadow-sm active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Bằng nhau ⏸️
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
