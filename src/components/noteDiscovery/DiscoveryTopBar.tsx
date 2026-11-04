import { memo } from 'react';
import { Button, FullscreenButton, Icon } from '../ui';

interface Props {
  stageNumber: number;
  stageTitle: string;
  activityTitle: string;
  currentRound: number;
  totalRounds: number;
  onBack: () => void;
  onReplayAudio: () => void;
  onPause: () => void;
  isPaused?: boolean;
}

export const DiscoveryTopBar = memo(function DiscoveryTopBar({
  stageNumber,
  stageTitle,
  activityTitle,
  currentRound,
  totalRounds,
  onBack,
  onReplayAudio,
  onPause,
}: Props) {
  const percent = totalRounds > 0 ? Math.min(100, Math.round(((currentRound + 1) / totalRounds) * 100)) : 0;

  return (
    <header className="flex items-center gap-3 py-2 px-4 backdrop-blur-xs">
      <Button
        variant="ghost"
        onClick={onBack}
        aria-label="Quay lại"
        className="px-2.5 min-h-[44px] touch-manipulation"
      >
        <Icon name="back" />
      </Button>

      {/* Thông tin bài học */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            Chặng {stageNumber}
          </span>
          <h1 className="truncate text-base font-extrabold text-slate-800 dark:text-slate-100 sm:text-lg">
            {stageTitle}
          </h1>
        </div>
        <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
          {activityTitle}
        </p>
      </div>

      {/* Thanh tiến độ */}
      <div className="hidden sm:flex flex-col items-center gap-1 w-36">
        <div className="flex justify-between w-full text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span>Tiến độ</span>
          <span>{currentRound + 1}/{totalRounds}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* Nút nghe lại hướng dẫn bằng giọng nói */}
      <Button
        variant="ghost"
        onClick={onReplayAudio}
        aria-label="Nghe lại hướng dẫn"
        className="min-h-[44px] min-w-[44px] px-2.5 text-violet-600 hover:bg-violet-100 dark:text-violet-300 dark:hover:bg-violet-950"
      >
        <span className="text-xl" aria-hidden>🔊</span>
      </Button>

      {/* Nút tạm dừng */}
      <Button
        variant="ghost"
        onClick={onPause}
        aria-label="Tạm dừng bài học"
        className="min-h-[44px] min-w-[44px] px-2.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Icon name="pause" />
      </Button>

      <FullscreenButton className="shrink-0 min-h-[44px]" />
    </header>
  );
});
