/**
 * Đoạn khó của MỌI bài đã chơi trong Coach 30 ngày qua (bài kỹ thuật, bài hát, bài hai tay…) + bài bổ trợ đã tạo và hiệu quả của chúng.
 * Chỉ hiện đoạn khó có lỗi lặp lại ở ≥ 2 lượt (không hiện lỗi giả khi chưa đủ bằng chứng).
 */
import { useEffect, useState } from 'react';
import { pitchToLabel } from '../../core/music/notes';
import { PASSAGE_ERROR_LABEL, STRATEGY_LABEL, type DifficultPassage, type RemedialExercise, type RemedialOutcome } from '../../core/smartPractice/types';
import { findSourceLesson, resolveLesson } from '../../core/technique/lessons';
import { lessonTempo } from '../../core/lessons/types';
import { smartPractice } from '../../hooks/useSmartPractice';
import { useSettings } from '../../store/settingsStore';
import { Button, Card, Icon } from '../ui';
import { playLessonSample } from './playSample';

export function PassagesTab({ profileKey, onOpen }: { profileKey: string; onOpen: (lessonId: string, bpm?: number, hand?: 'both' | 'right' | 'left') => void }) {
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const [passages, setPassages] = useState<DifficultPassage[] | null>(null);
  const [remedials, setRemedials] = useState<RemedialExercise[]>(() => smartPractice.store.load(profileKey).remedials);
  const [outcomes, setOutcomes] = useState<Record<string, RemedialOutcome | null>>({});
  const names = (xs: readonly string[]) => xs.map((x) => pitchToLabel(x, labelStyle)).join(' – ');

  useEffect(() => {
    let live = true;
    void smartPractice.recentPassages(profileKey).then((x) => live && setPassages(x));
    const rs = smartPractice.store.load(profileKey).remedials;
    setRemedials(rs);
    void Promise.all(rs.map(async (r) => [r.id, await smartPractice.evaluateRemedialOutcome(profileKey, r.id)] as const)).then((xs) => live && setOutcomes(Object.fromEntries(xs)));
    return () => {
      live = false;
    };
  }, [profileKey]);

  const practice = (p: DifficultPassage, hand?: 'right' | 'left') => {
    const src = findSourceLesson(p.sourceId);
    const bpm = Math.max(30, Math.round((src ? lessonTempo(src) : 60) * (p.tempoSensitive ? 0.6 : 0.7)));
    const made = smartPractice.createRemedialExercise(profileKey, p, 0, { tempo: bpm });
    if (made) onOpen(made.lesson.id, bpm, hand ?? (p.handMode === 'both' ? undefined : p.handMode));
  };
  const setStatus = (id: string, status: RemedialExercise['status']) => setRemedials(smartPractice.store.setRemedialStatus(profileKey, id, status).remedials);

  return (
    <section className="mt-5 grid gap-4" data-testid="technique-passages">
      <Card>
        <h2 className="text-lg font-bold">Đoạn khó đã phát hiện</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Tính từ các lượt chơi cả bài trong AI Piano Coach 30 ngày qua — chỉ hiện chỗ có lỗi lặp lại ở ít nhất 2 lượt. Dùng cho mọi bài: bài kỹ thuật, bài hát, bài hai tay.
        </p>
        {passages === null ? (
          <p className="mt-3 text-slate-500">Đang phân tích…</p>
        ) : passages.length === 0 ? (
          <p className="mt-3" data-testid="technique-no-passages">
            Chưa phát hiện đoạn khó. Chơi cả bài vài lượt trong Coach; nếu một chỗ sai lặp lại, nó sẽ hiện ở đây. Muốn luyện một đoạn ngay, mở bài trong Coach → kết quả → "Luyện đoạn khó" → tự chọn đoạn A–B.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {passages.map((p) => {
              const src = findSourceLesson(p.sourceId);
              return (
                <li key={p.id} className="rounded-xl bg-teal-50 p-3 dark:bg-teal-900/20" data-testid="technique-passage">
                  <div className="font-semibold">
                    {names(p.noteNames)} <span className="font-normal text-slate-500 dark:text-slate-400">· {src?.title ?? p.sourceId} · ô {p.measure}</span>
                  </div>
                  <div className="text-sm">
                    {p.errorTypes.map((e) => PASSAGE_ERROR_LABEL[e.type]).join(', ')} — {p.evidenceSessionIds.length}/{p.analyzedSessions} lượt
                    {p.timingDeviationMs ? `, chậm ~${p.timingDeviationMs} ms` : ''} · tin cậy {p.confidence === 'high' ? 'cao' : 'trung bình'}
                    {p.tempoSensitive ? ' · sai nhiều hơn khi nhanh' : ''}. {STRATEGY_LABEL[p.strategy]}.
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="primary" className="min-h-10 text-sm" onClick={() => practice(p)} data-testid="technique-passage-practice">
                      <Icon name="brackets" className="h-5 w-5" /> Luyện bài bổ trợ
                    </Button>
                    {src && (
                      <Button className="min-h-10 text-sm" onClick={() => onOpen(src.id)}>
                        Mở bài gốc
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-bold">Bài luyện bổ trợ đã tạo</h2>
        {remedials.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Chưa có bài bổ trợ nào.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {remedials.map((r) => {
              const o = outcomes[r.id];
              const lesson = resolveLesson(r.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800" data-testid="technique-remedial" data-status={r.status}>
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold">
                      {names(r.noteNames)} · {r.sourceTitle}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {r.status === 'mastered' ? '✓ Đã khắc phục' : r.status === 'dismissed' ? 'Đã thay bằng đoạn dài hơn / bỏ' : 'Đang luyện'}
                      {o ? ` · ${o.remedialAttempts} lượt, đạt ${o.remedialPassed}` : ''}
                      {o && o.verdict === 'improved' ? ` · bài gốc: lỗi ${Math.round((o.errorRateBefore ?? 0) * 100)}% → ${Math.round((o.errorRateAfter ?? 0) * 100)}%` : ''}
                      {o ? ` · ${o.reason}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lesson && (
                      <>
                        <Button className="min-h-10 text-sm" onClick={() => onOpen(r.id, r.tempo, r.handMode === 'both' ? undefined : r.handMode)}>
                          Luyện
                        </Button>
                        <Button className="min-h-10 text-sm" onClick={() => playLessonSample(lesson, r.tempo)} aria-label="Nghe mẫu">
                          <Icon name="volume" className="h-5 w-5" />
                        </Button>
                      </>
                    )}
                    {r.status === 'active' && (
                      <Button variant="ghost" className="min-h-10 text-sm" onClick={() => setStatus(r.id, 'dismissed')}>
                        Bỏ
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
