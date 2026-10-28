import { useState } from 'react';
import { AGE_GROUP_LABELS, EXPERIENCE_LABELS, ageGroup, type LearnerProfile } from '../core/profile/LearnerProfile';
import type { Assessment, Criterion } from '../core/profile/assessment';
import type { Recommendation } from '../core/profile/recommend';
import { CATEGORY_LABELS } from '../core/lessons/LessonManager';
import { HAND_LABEL } from '../core/lessons/types';
import { useApp } from '../store/appStore';
import { Button, Card, formatDuration } from './ui';

interface Props {
  profile: LearnerProfile | null;
  assessment: Assessment | null;
  recommendations: Recommendation[];
}

/**
 * Phần theo hồ sơ người học trong Thư viện bài: bài gợi ý theo hồ sơ, đánh giá thời gian học,
 * khả năng chơi đàn và các tiêu chí khác. Chọn / tạo hồ sơ ở `ProfileSwitcher` đầu trang chủ.
 */
export function LearnerPanel({ profile, assessment, recommendations }: Props) {
  return (
    <>
      {profile && assessment && (
        <>
          <section className="mt-6" data-testid="recommendations">
            <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
              <span className="h-5 w-1.5 rounded-full bg-gradient-to-b from-fuchsia-500 to-orange-400" />
              Gợi ý cho {profile.name}
            </h2>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {AGE_GROUP_LABELS[ageGroup(profile.age)]} · trình độ {assessment.skill.level.toLowerCase()} · ưu tiên bài độ khó {assessment.skill.targetDifficulty}/3
            </p>
            {recommendations.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.map((r) => (
                  <RecommendationCard key={r.lesson.id} rec={r} />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                Tuyệt vời! Đã thuộc hết các bài phù hợp — thử các bài khó hơn trong thư viện bên dưới.
              </p>
            )}
          </section>
          <AssessmentCard profile={profile} assessment={assessment} />
        </>
      )}
    </>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const openLesson = useApp((s) => s.openLesson);
  const { lesson } = rec;
  return (
    <button
      type="button"
      onClick={() => openLesson(lesson.id)}
      data-testid={`rec-${lesson.id}`}
      className="flex min-h-24 flex-col rounded-2xl bg-gradient-to-br from-white to-fuchsia-50 p-4 text-left shadow-sm ring-1 ring-fuchsia-200 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] dark:from-slate-800 dark:to-fuchsia-950/40 dark:ring-fuchsia-900"
    >
      <div className="flex items-start gap-2">
        <h3 className="flex-1 leading-snug font-semibold">{lesson.title}</h3>
        <span className="text-orange-400" aria-label={`Độ khó ${lesson.difficulty}`}>
          {'●'.repeat(lesson.difficulty)}
          <span className="text-slate-300 dark:text-slate-600">{'●'.repeat(3 - lesson.difficulty)}</span>
        </span>
      </div>
      <p className="mt-1 text-sm font-medium text-fuchsia-700 dark:text-fuchsia-300">{rec.reason}</p>
      <p className="mt-auto pt-2 text-xs text-slate-500 dark:text-slate-400">
        {CATEGORY_LABELS[lesson.category]} · {HAND_LABEL[lesson.hand]} · {lesson.notes.length} nốt
      </p>
    </button>
  );
}

const barTone = (score: number) => (score >= 75 ? 'bg-emerald-500' : score >= 45 ? 'bg-amber-400' : 'bg-rose-500');

function Meter({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      {value !== null && <div className={`h-full rounded-full ${barTone(value)}`} style={{ width: `${Math.max(4, value)}%` }} />}
    </div>
  );
}

function AssessmentCard({ profile, assessment }: { profile: LearnerProfile; assessment: Assessment }) {
  const [showAll, setShowAll] = useState(false);
  const { time, skill, criteria } = assessment;
  const goalPct = Math.min(100, Math.round((time.last7DaysMs / time.weeklyGoalMs) * 100));
  const tips = criteria.filter((c) => c.tip && c.score !== null);

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Đánh giá của {profile.name}</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400">Khai báo ban đầu: {EXPERIENCE_LABELS[profile.experience].label}</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200 dark:bg-sky-950/50 dark:ring-sky-800" data-testid="assess-time">
          <div className="text-sm font-medium text-sky-800 dark:text-sky-200">Thời gian học</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{formatDuration(time.totalMs)}</div>
          <div className="mt-3 flex justify-between text-sm">
            <span>7 ngày qua</span>
            <span className="tabular-nums">
              {Math.round(time.last7DaysMs / 60_000)}/{profile.dailyMinutes * 7} phút
            </span>
          </div>
          <div className="mt-1">
            <Meter value={time.sessions ? goalPct : null} label="Mục tiêu tuần" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span>🔥 Chuỗi {time.streakDays} ngày</span>
            <span>{time.activeDays} ngày đã tập</span>
            <span>{time.sessions} phiên</span>
          </div>
        </div>

        <div className="rounded-2xl bg-violet-50 p-4 ring-1 ring-violet-200 dark:bg-violet-950/50 dark:ring-violet-800" data-testid="assess-skill">
          <div className="text-sm font-medium text-violet-800 dark:text-violet-200">Khả năng chơi đàn</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold">{skill.level}</span>
            <span className="text-slate-500 tabular-nums dark:text-slate-400">{skill.score}/100</span>
          </div>
          <div className="mt-3">
            <Meter value={skill.score} label="Điểm khả năng" />
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span>{skill.lessonsPassed} bài đạt ≥ 80%</span>
            <span>Bài khó nhất đã qua: {skill.hardestPassed ? `${skill.hardestPassed}/3` : '—'}</span>
            <span>Chính xác: {skill.accuracy === null ? '—' : `${Math.round(skill.accuracy * 100)}%`}</span>
            <span data-testid="reading-speed">
              Đọc nốt: {assessment.notes.readingMs === null ? '—' : `${(assessment.notes.readingMs / 1000).toFixed(1).replace('.', ',')} giây/nốt`}
            </span>
          </div>
          {assessment.notes.trouble.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm" data-testid="trouble-notes">
              <span className="text-slate-600 dark:text-slate-300">Hay sai:</span>
              {assessment.notes.trouble.map((t) => (
                <span key={t.midi} className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                  {t.label} · {Math.round(t.missRate * 100)}%
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {tips.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {tips.slice(0, 3).map((c) => (
            <li key={c.key} className="flex gap-2">
              <span aria-hidden>💡</span>
              <span>
                <b>{c.label}:</b> {c.tip}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Button variant="ghost" className="mt-3 -ml-2" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
        {showAll ? 'Ẩn các tiêu chí khác' : `Xem các tiêu chí khác (${criteria.length})`}
      </Button>
      {showAll && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="criteria">
          {criteria.map((c) => (
            <CriterionTile key={c.key} c={c} />
          ))}
        </div>
      )}
    </Card>
  );
}

function CriterionTile({ c }: { c: Criterion }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-700">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{c.label}</span>
        <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">{c.score === null ? 'chưa đủ dữ liệu' : `${c.score}/100`}</span>
      </div>
      <div className="mt-2">
        <Meter value={c.score} label={c.label} />
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{c.detail}</p>
      {c.tip && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">💡 {c.tip}</p>}
    </div>
  );
}
