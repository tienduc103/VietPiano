import { memo } from 'react';
import { Button } from '../ui';

interface Props {
  kind: 'activity-complete' | 'stage-complete' | 'paused';
  stageTitle: string;
  activityTitle: string;
  accuracy: number;
  onContinue: () => void;
  onRestart: () => void;
  onExit: () => void;
}

export const DiscoveryCompletionModal = memo(function DiscoveryCompletionModal({
  kind,
  stageTitle,
  activityTitle,
  accuracy,
  onContinue,
  onRestart,
  onExit,
}: Props) {
  const percent = Math.round(accuracy * 100);
  const isStageComplete = kind === 'stage-complete';
  const isPaused = kind === 'paused';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in"
    >
      <div className="w-full max-w-md rounded-3xl border border-violet-100 bg-white p-6 text-center shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {isPaused ? (
          <>
            <div className="text-4xl" aria-hidden>⏸️</div>
            <h2 className="mt-2 text-xl font-extrabold text-slate-800 dark:text-slate-100">
              Tạm dừng bài học
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {stageTitle} · {activityTitle}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button variant="primary" onClick={onContinue} className="min-h-[48px] font-bold">
                Tiếp tục học ▶️
              </Button>
              <Button variant="secondary" onClick={onRestart} className="min-h-[48px] font-semibold">
                Làm lại phần này 🔄
              </Button>
              <Button variant="ghost" onClick={onExit} className="min-h-[48px] font-semibold text-slate-500">
                Thoát ra ngoài
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="text-5xl" aria-hidden>
              {isStageComplete ? '🏆' : percent >= 80 ? '🌟' : '👍'}
            </div>
            <h2 className="mt-3 text-2xl font-black text-slate-800 dark:text-slate-100">
              {isStageComplete
                ? 'Tuyệt vời! Chinh phục chặng học!'
                : percent >= 80
                ? 'Hoàn thành xuất sắc!'
                : 'Đã hoàn thành!'}
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600 dark:text-slate-300">
              {isStageComplete
                ? `Bé đã vượt qua ${stageTitle}!`
                : `Bé đã hoàn thành ${activityTitle}!`}
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-violet-50 px-4 py-2 dark:bg-slate-800">
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Độ chính xác:</span>
              <span className="text-lg font-black text-violet-700 dark:text-violet-300">{percent}%</span>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <Button variant="primary" onClick={onContinue} className="min-h-[48px] text-base font-extrabold">
                {isStageComplete ? 'Chặng tiếp theo 🚀' : 'Hoạt động tiếp theo ➡️'}
              </Button>
              <Button variant="secondary" onClick={onRestart} className="min-h-[48px] font-semibold">
                Luyện tập lại 🔄
              </Button>
              <Button variant="ghost" onClick={onExit} className="min-h-[48px] font-semibold text-slate-500">
                Về danh sách chặng
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
