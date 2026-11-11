/**
 * Giáo trình luyện kỹ thuật ngón tay: 5 cấp × 13 nhóm. Trạng thái bài suy từ kết quả Coach (đạt / đang luyện / chưa đủ tiên quyết —
 * chỉ là gợi ý, bài vẫn mở được). Mở bài → khuông nhạc có số ngón, giải thích kỹ thuật, nghe mẫu, luyện + chấm trong Coach.
 */
import { useEffect, useMemo, useState } from 'react';
import { coachStorage } from '../../core/coach/storage/CoachStorage';
import type { ScoringResult } from '../../core/coach/types';
import { isPassed, stableTempo, tempoAttempts } from '../../core/smartPractice/tempo';
import { FINGER_EXERCISES } from '../../core/technique/catalog';
import { HAND_MODE_LABEL, SKILL_LABEL, TECHNIQUE_GROUP_LABEL, TECHNIQUE_GROUP_ORDER, TECHNIQUE_LEVEL_LABEL, type FingerExercise, type TechniqueLevel } from '../../core/technique/types';
import { useSettings } from '../../store/settingsStore';
import { ScoreView } from '../ScoreView';
import { Button, Card, Icon } from '../ui';
import { playLessonSample } from './playSample';

type Status = 'passed' | 'practicing' | 'open' | 'locked';

const STATUS_LABEL: Record<Status, string> = { passed: '✓ Đã đạt', practicing: '… Đang luyện', open: 'Có thể học', locked: '🔒 Chưa đủ bài trước' };

export function TechniqueLibrary({ profileKey, onOpen }: { profileKey: string; onOpen: (lessonId: string, bpm?: number, hand?: 'both' | 'right' | 'left') => void }) {
  const [results, setResults] = useState<ScoringResult[]>([]);
  const [level, setLevel] = useState<TechniqueLevel>(1);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void coachStorage
      .listResults(profileKey)
      .then((r) => live && setResults(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [profileKey]);

  const info = useMemo(() => {
    const of = (e: FingerExercise) => results.filter((r) => r.lessonId === e.lesson.id && r.referenceId === e.lesson.id);
    const passed = new Set(FINGER_EXERCISES.filter((e) => of(e).some((r) => isPassed(r, e.scoringConfig.passScore))).map((e) => e.id));
    return new Map(
      FINGER_EXERCISES.map((e) => {
        const rs = of(e);
        const status: Status = passed.has(e.id) ? 'passed' : rs.length ? 'practicing' : e.prerequisites.every((p) => passed.has(p)) ? 'open' : 'locked';
        return [e.id, { status, best: rs.length ? Math.max(...rs.map((r) => r.total)) : null, attempts: rs.length, stable: stableTempo(tempoAttempts(rs, e.scoringConfig.passScore)) }] as const;
      }),
    );
  }, [results]);

  const levelEx = FINGER_EXERCISES.filter((e) => e.level === level);
  return (
    <section className="mt-5" data-testid="technique-library">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cấp độ">
        {([1, 2, 3, 4, 5] as TechniqueLevel[]).map((lv) => {
          const all = FINGER_EXERCISES.filter((e) => e.level === lv);
          const done = all.filter((e) => info.get(e.id)?.status === 'passed').length;
          return (
            <button
              key={lv}
              type="button"
              role="radio"
              aria-checked={level === lv}
              onClick={() => setLevel(lv)}
              className={`min-h-12 rounded-xl px-3 text-sm font-semibold ring-1 ${level === lv ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'}`}
              data-testid={`technique-level-${lv}`}
            >
              {TECHNIQUE_LEVEL_LABEL[lv]} <span className="opacity-75">({done}/{all.length})</span>
            </button>
          );
        })}
      </div>
      {TECHNIQUE_GROUP_ORDER.filter((g) => levelEx.some((e) => e.group === g)).map((g) => (
        <div key={g} className="mt-4">
          <h3 className="font-bold text-slate-700 dark:text-slate-200">{TECHNIQUE_GROUP_LABEL[g]}</h3>
          <ul className="mt-2 grid gap-2">
            {levelEx
              .filter((e) => e.group === g)
              .map((e) => {
                const st = info.get(e.id)!;
                return (
                  <li key={e.id} data-testid="technique-exercise" data-id={e.id} data-status={st.status}>
                    <Card>
                      <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => setOpenId(openId === e.id ? null : e.id)} aria-expanded={openId === e.id}>
                        <span className="min-w-0">
                          <span className="font-semibold">{e.title}</span>
                          <span className="block text-sm text-slate-500 dark:text-slate-400">
                            {HAND_MODE_LABEL[e.handMode]} · {e.targetSkills.map((s) => SKILL_LABEL[s]).join(', ')} · ~{e.estimatedMinutes} phút · ♩ {e.tempoRange[0]}–{e.tempoRange[1]}
                          </span>
                        </span>
                        <span className="text-sm">
                          {STATUS_LABEL[st.status]}
                          {st.best !== null && ` · cao nhất ${st.best}`}
                          {st.stable !== null && ` · ổn định ♩=${st.stable}`}
                        </span>
                      </button>
                      {openId === e.id && <ExerciseDetail e={e} onOpen={onOpen} />}
                    </Card>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ExerciseDetail({ e, onOpen }: { e: FingerExercise; onOpen: (lessonId: string, bpm?: number, hand?: 'both' | 'right' | 'left') => void }) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const pending = useMemo(() => e.lesson.notes.map(() => 'pending' as const), [e.lesson]);
  const tempo = e.lesson.tempo ?? e.tempoRange[0];
  const twoHands = e.handMode === 'together' || e.handMode === 'alternate';
  const pre = e.prerequisites.map((id) => FINGER_EXERCISES.find((x) => x.id === id)?.title).filter(Boolean);
  return (
    <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700" data-testid="technique-detail">
      <p className="text-sm">{e.lesson.description}</p>
      <p className="mt-1 text-sm">
        <b>Kỹ thuật:</b> {e.tips}
      </p>
      {e.measureNote && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Đo lường: {e.measureNote}</p>}
      {pre.length > 0 && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Nên học trước: {pre.join(', ')} (chỉ là gợi ý).</p>}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Số ngón trên khuông là gợi ý — app không biết bạn dùng ngón nào.</p>
      <div className="mt-2 h-48 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        <ScoreView lesson={e.lesson} index={0} results={pending} status="waiting" wrongPulse={0} showNames={false} labelStyle={labelStyle} showFingers />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" className="text-sm" onClick={() => onOpen(e.lesson.id, tempo)} data-testid="technique-practice">
          <Icon name="play" className="h-5 w-5" /> Luyện & chấm (đàn MIDI / bàn phím ảo)
        </Button>
        <Button className="text-sm" onClick={() => playLessonSample(e.lesson, tempo)} data-testid="technique-listen">
          <Icon name="volume" className="h-5 w-5" /> Nghe mẫu
        </Button>
        {twoHands && (
          <>
            <Button className="text-sm" onClick={() => onOpen(e.lesson.id, tempo, 'right')}>
              Tay phải
            </Button>
            <Button className="text-sm" onClick={() => onOpen(e.lesson.id, tempo, 'left')}>
              Tay trái
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
