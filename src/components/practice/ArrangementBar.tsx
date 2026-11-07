import { useCallback, useEffect, useRef, useState } from 'react';
import { familyLessons, levelMastered, practicePlan, recommendedLevel, type PracticePlanStep } from '../../core/lessons/arrangements';
import { loadPlanDone, markPlanStep, planStepFor, savePlanDone } from '../../core/lessons/arrangements/planProgress';
import { ARRANGEMENT_LEVEL_LABEL, type Lesson } from '../../core/lessons/types';
import { PRACTICE_HAND_LABEL, type PracticeHand } from '../../core/practice/handPractice';
import type { PracticeMode } from '../../core/settings/DeviceSettings';
import { useProfileProgress } from '../../hooks/useProfileProgress';
import { useApp } from '../../store/appStore';
import { activeProfile, useProfiles } from '../../store/profileStore';
import { Button, Icon } from '../ui';

const MODE_LABEL: Record<PracticeMode, string> = { wait: 'Chờ nốt', count: 'Đếm nốt', tempo: 'Theo nhịp', perform: 'Biểu diễn' };

/** Lộ trình luyện của bản phối + các bước đã xong (theo hồ sơ đang chọn). */
export function usePracticePlan(lesson: Lesson) {
  const profileId = useProfiles(activeProfile)?.id ?? 'default';
  const plan = practicePlan(lesson.id);
  const [done, setDone] = useState<number[]>(() => loadPlanDone(profileId, lesson.id));
  useEffect(() => setDone(loadPlanDone(profileId, lesson.id)), [profileId, lesson.id]);
  /** Ghi một lần chơi hết bài: `result` 0..1 (độ chính xác / điểm). */
  const record = useCallback(
    (hand: PracticeHand, mode: PracticeMode, result: number) => {
      const step = planStepFor(plan, hand, mode);
      setDone((prev) => {
        const next = markPlanStep(prev, step, result);
        if (next.length !== prev.length) savePlanDone(profileId, lesson.id, next);
        return next;
      });
    },
    [plan, profileId, lesson.id],
  );
  return { plan, done, record };
}

/**
 * Bài có nhiều bản phối: chọn cấp độ (Cơ bản / Trung cấp / Nâng cao — ✓ = đã vững, "gợi ý" = cấp nên tập theo tiến độ đã lưu)
 * và lộ trình luyện 5 bước của cấp đang mở (bấm một bước → đặt tay, chế độ, tốc độ tương ứng).
 */
export function ArrangementBar({
  lesson,
  plan,
  done,
  onApplyStep,
}: {
  lesson: Lesson;
  plan: readonly PracticePlanStep[];
  done: readonly number[];
  onApplyStep: (step: PracticePlanStep) => void;
}) {
  const openLesson = useApp((s) => s.openLesson);
  const progress = useProfileProgress();
  const family = lesson.arrangement!.family;
  const levels = familyLessons(family);
  const recommended = recommendedLevel(family, progress);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="inline-flex rounded-xl bg-violet-100 p-1 dark:bg-slate-700" role="radiogroup" aria-label="Cấp độ bản phối">
        {levels.map((l) => {
          const level = l.arrangement!.level;
          const current = l.id === lesson.id;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={current}
              data-testid={`arrangement-level-${level}`}
              title={l.tempoRange ? `${ARRANGEMENT_LEVEL_LABEL[level]} · ♩ ${l.tempoRange[0]}–${l.tempoRange[1]}` : ARRANGEMENT_LEVEL_LABEL[level]}
              onClick={() => !current && openLesson(l.id)}
              className={`flex min-h-12 items-center gap-1 rounded-lg px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                current ? 'bg-white text-fuchsia-700 shadow dark:bg-slate-900 dark:text-fuchsia-300' : 'text-violet-700 dark:text-slate-300'
              }`}
            >
              {ARRANGEMENT_LEVEL_LABEL[level]}
              {levelMastered(progress[l.id]) && <Icon name="check" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              {recommended?.id === l.id && !levelMastered(progress[l.id]) && (
                <span className="rounded-full bg-amber-200 px-1.5 text-[11px] font-bold text-amber-900" data-testid="arrangement-recommended">
                  gợi ý
                </span>
              )}
            </button>
          );
        })}
      </div>
      {plan.length > 0 && (
        <div ref={ref} className="relative">
          <Button variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="gap-1.5 px-3 text-sm" data-testid="practice-plan">
            <Icon name="list" className="h-5 w-5" />
            Lộ trình {done.length}/{plan.length}
          </Button>
          {open && (
            <div
              role="dialog"
              aria-label="Lộ trình luyện"
              className="absolute top-full left-0 z-30 mt-2 w-96 max-w-[90vw] rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-violet-100 dark:bg-slate-800 dark:ring-violet-900"
              data-testid="practice-plan-panel"
            >
              <p className="px-1 pb-2 text-sm text-slate-500 dark:text-slate-400">
                Bấm một bước để đặt sẵn tay, chế độ và tốc độ. Bước xong khi chơi hết bài đạt từ 80%.
              </p>
              <ol className="grid gap-1.5">
                {plan.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyStep(s);
                        setOpen(false);
                      }}
                      className="flex min-h-12 w-full items-start gap-3 rounded-xl px-3 py-2 text-left ring-1 ring-violet-100 hover:bg-violet-50 dark:ring-violet-900 dark:hover:bg-slate-700"
                      data-testid={`plan-step-${i}`}
                      data-done={done.includes(i) || undefined}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${done.includes(i) ? 'bg-emerald-500 text-white' : 'bg-violet-100 text-violet-700 dark:bg-slate-700 dark:text-slate-200'}`}
                      >
                        {done.includes(i) ? '✓' : i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-semibold">{s.title}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {PRACTICE_HAND_LABEL[s.hand]} · {MODE_LABEL[s.mode]}
                          {s.tempoPercent && s.tempoPercent !== 100 ? ` · ${s.tempoPercent}% nhịp độ` : ''} — {s.tip}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
