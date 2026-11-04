import { useMemo } from 'react';
import { NOTE_DISCOVERY_STAGES } from '../core/noteDiscovery/stages';
import { loadDiscoveryProgress } from '../core/noteDiscovery/storage';
import { AdaptiveReviewService } from '../core/noteDiscovery/AdaptiveReviewService';
import { NOTE_DEFINITIONS } from '../core/noteDiscovery/musicModel';
import type { MasteryLevel } from '../core/noteDiscovery/types';
import { useApp } from '../store/appStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { Button, FullscreenButton, Icon } from '../components/ui';

const MASTERY_BADGE: Record<MasteryLevel, { label: string; color: string }> = {
  new: { label: 'Mới', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  learning: { label: 'Đang làm quen', color: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  practicing: { label: 'Đang luyện tập', color: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  remembered: { label: 'Đã nhớ tốt', color: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  mastered: { label: 'Thành thạo ⭐', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
};

export function NoteDiscoveryOverviewScreen() {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const activeProfileId = profile?.id ?? 'guest';

  const progress = useMemo(() => {
    return loadDiscoveryProgress(activeProfileId);
  }, [activeProfileId]);

  const troubleNotes = useMemo(() => {
    return AdaptiveReviewService.getTroubleNotes(progress.noteSkills);
  }, [progress.noteSkills]);

  // Danh sách các nốt trọng tâm từ C4 đến C5
  const octaveNotes = [60, 62, 64, 65, 67, 69, 71, 72];

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-violet-100/70 via-sky-50 to-pink-100/60 p-4 text-slate-900 select-none dark:from-slate-950 dark:via-violet-950/30 dark:to-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-5xl pt-[calc(1rem+env(safe-area-inset-top,0px))] pb-12">
        {/* Header */}
        <header className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => navigate({ name: 'dashboard' })}
            aria-label="Về trang chủ"
            className="px-2.5 min-h-[44px]"
          >
            <Icon name="back" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl" aria-hidden>🎹</span>
              <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 sm:text-3xl">
                Khám phá nốt nhạc
              </h1>
            </div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
              Phương pháp Piano trực quan dành cho trẻ 4–8 tuổi · Học viên: {profile?.name ?? 'Khách'}
            </p>
          </div>

          <FullscreenButton className="shrink-0 min-h-[44px]" />
        </header>

        {/* Bảng theo dõi Mastery của từng nốt nhạc (Dành cho phụ huynh & bé) */}
        <section className="mt-6 rounded-3xl border border-violet-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xs dark:border-violet-900/60 dark:bg-slate-900/80">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-800 dark:text-slate-100 sm:text-lg">
              🌈 Bảng mức độ thành thạo các nốt (C4 – C5)
            </h2>
            {troubleNotes.length > 0 && (
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                Cần ôn thêm: {troubleNotes.map((m) => NOTE_DEFINITIONS[m]?.solfege).join(', ')}
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2.5 sm:grid-cols-8">
            {octaveNotes.map((midi) => {
              const def = NOTE_DEFINITIONS[midi];
              const skill = progress.noteSkills[midi];
              const mastery = skill?.masteryLevel ?? 'new';
              const badge = MASTERY_BADGE[mastery];

              return (
                <div
                  key={midi}
                  className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50/80 p-2 text-center dark:border-slate-800 dark:bg-slate-800/60"
                >
                  <span className="text-lg font-black text-violet-700 dark:text-violet-300">
                    {def.solfege}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {def.scientificName}
                  </span>
                  <span className={`mt-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.color}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Danh sách 8 Chặng học (8 Stages) */}
        <section className="mt-8">
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100">
            🗺️ Lộ trình 8 chặng học
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Bé học lần lượt từng chặng để xây dựng nền tảng vững chắc.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {NOTE_DISCOVERY_STAGES.map((stage) => {
              const stageProgress = progress.completedStages[stage.stageId];
              const isPassed = stageProgress?.passed ?? false;
              const isUnlocked = AdaptiveReviewService.canUnlockStage(stage, progress);

              return (
                <div
                  key={stage.stageId}
                  className={`flex flex-col justify-between rounded-3xl border p-5 transition-all shadow-xs ${
                    isPassed
                      ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30'
                      : isUnlocked
                      ? 'border-violet-200 bg-white/95 dark:border-slate-800 dark:bg-slate-900/90'
                      : 'border-slate-200 bg-slate-100/70 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-black text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                        Chặng {stage.number}
                      </span>
                      {isPassed ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          <span>✓ Đã đạt</span>
                          {stageProgress.bestScore > 0 && <span>({stageProgress.bestScore}%)</span>}
                        </span>
                      ) : !isUnlocked ? (
                        <span className="text-xs font-semibold text-slate-400">🔒 Chưa mở</span>
                      ) : (
                        <span className="text-xs font-bold text-violet-600 dark:text-violet-400">Sẵn sàng học</span>
                      )}
                    </div>

                    <h3 className="mt-2 text-base font-extrabold text-slate-800 dark:text-slate-100">
                      {stage.title}
                    </h3>
                    <p className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                      {stage.subtitle}
                    </p>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                      {stage.description}
                    </p>

                    <ul className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {stage.learningObjectives.slice(0, 2).map((obj, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="text-violet-500 font-bold">•</span>
                          <span className="truncate">{obj}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <Button
                      variant={isPassed ? 'secondary' : 'primary'}
                      disabled={!isUnlocked}
                      onClick={() => navigate({ name: 'note-discovery', stageId: stage.stageId })}
                      className="min-h-[44px] px-5 text-xs font-extrabold rounded-2xl"
                    >
                      {isPassed ? 'Luyện tập lại 🔄' : 'Bắt đầu học ▶️'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
