import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildAiPayload } from '../../core/coach/ai/payload';
import type { CoachAudience } from '../../core/coach/ai/prompt';
import { activeStep } from '../../core/coach/practice/plan';
import { recommendPractice } from '../../core/coach/practice/recommend';
import { progressReport, progressText, skillProfile } from '../../core/coach/progress/compare';
import { buildPerformance } from '../../core/coach/recorder/buildPerformance';
import { referenceFromLesson } from '../../core/coach/reference/fromLesson';
import { scorePerformance } from '../../core/coach/scoring/ScoringEngine';
import { scoringWeightsFor } from '../../core/technique/lessons';
import { coachStorage } from '../../core/coach/storage/CoachStorage';
import { COACH_MODE_LABEL, SCORING_ENGINE_VERSION, type PerformanceSession, type PracticePlan, type ScoringResult } from '../../core/coach/types';
import { measureRange, sliceLesson } from '../../core/lessons/slice';
import type { Lesson } from '../../core/lessons/types';
import type { NoteLabelStyle } from '../../core/music/notes';
import type { LearnerProfile } from '../../core/profile/LearnerProfile';
import { Button, Card, Segmented } from '../ui';
import type { ResultData } from './CoachResults';
import { ScoreSparkline } from './CriteriaMeters';

interface Props {
  profileKey: string;
  profileName: string;
  lessons: readonly Lesson[];
  window: 3 | 5 | 10;
  setWindow: (w: 3 | 5 | 10) => void;
  onOpen: (data: ResultData) => void;
  onContinuePlan: (plan: PracticePlan) => void;
  labelStyle: NoteLabelStyle;
  audience: CoachAudience;
  aiShareName: boolean;
  learner: LearnerProfile | null;
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function lessonFor(lessons: readonly Lesson[], s: PerformanceSession): Lesson | null {
  const l = lessons.find((x) => x.id === s.lessonId);
  if (!l) return null;
  if (!s.measures) return l;
  try {
    const r = measureRange(l);
    return s.measures[0] === r.first && s.measures[1] === r.last ? l : sliceLesson(l, s.measures[0], s.measures[1]);
  } catch {
    return l;
  }
}

export function CoachHistory(p: Props) {
  const [results, setResults] = useState<ScoringResult[]>([]);
  const [sessions, setSessions] = useState<PerformanceSession[]>([]);
  const [plans, setPlans] = useState<PracticePlan[]>([]);
  const [lessonFilter, setLessonFilter] = useState<string>('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [r, s, pl] = await Promise.all([coachStorage.listResults(p.profileKey), coachStorage.listSessions(p.profileKey), coachStorage.listPlans(p.profileKey)]).catch(() => [[], [], []] as [ScoringResult[], PerformanceSession[], PracticePlan[]]);
    setResults(r);
    setSessions(s);
    setPlans(pl);
  }, [p.profileKey]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const titles = useMemo(() => Object.fromEntries(p.lessons.map((l) => [l.id, l.title])), [p.lessons]);
  const lessonIds = [...new Set(results.map((r) => r.lessonId))];
  const shown = (lessonFilter ? results.filter((r) => r.lessonId === lessonFilter) : results).slice().sort((a, b) => b.createdAt - a.createdAt);
  const latest = shown[0];
  const sameRef = latest ? results.filter((r) => r.referenceId === latest.referenceId).sort((a, b) => a.createdAt - b.createdAt) : [];
  const report = latest ? progressReport(sameRef.slice(0, -1), p.window, sameRef[sameRef.length - 1]) : null;
  const skill = skillProfile(results, Date.now() - 30 * 24 * 3600 * 1000);
  const activePlans = plans.filter((x) => x.status === 'active');
  const sessionOf = (r: ScoringResult) => sessions.find((s) => s.id === r.sessionId);

  const open = async (r: ScoringResult, rescore = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const rec = await coachStorage.getRecorded(r.sessionId);
      if (!rec) return setMsg('Không tìm thấy log gốc của lần này.');
      const lesson = lessonFor(p.lessons, rec.session);
      if (!lesson) return setMsg('Bài của lần này không còn trong thư viện.');
      const s = rec.session;
      const ref = referenceFromLesson(lesson, { hand: s.hand, singleNotesOnly: s.input.source === 'microphone', targetBpm: s.targetBpm });
      const perf = buildPerformance(rec);
      let result = r;
      if (rescore) {
        // Chấm lại log gốc bằng engine hiện tại → bản ghi MỚI (khoá có phiên bản), kết quả cũ giữ nguyên.
        result = scorePerformance({ reference: ref, performance: perf, session: s, capabilities: { ...s.input.capabilities, pedal: s.input.capabilities.pedal || perf.sustainSeen }, mode: r.mode, pedalRule: s.pedalRule ?? 'auto', weights: scoringWeightsFor(s.lessonId) });
        await coachStorage.saveResult(result);
      }
      const history = results.filter((x) => x.referenceId === result.referenceId && x.createdAt < r.createdAt && x.id !== result.id);
      const recs = recommendPractice(result, ref);
      const progress = progressReport(history, p.window, result);
      const payload = buildAiPayload(result, ref, { learner: p.learner, shareName: p.aiShareName, recommendations: recs, progress, source: s.input.source, hand: s.hand });
      const fbs = await coachStorage.feedbackForResult(result.id).catch(() => []);
      p.onOpen({ lesson, baseLesson: p.lessons.find((x) => x.id === s.lessonId) ?? lesson, reference: ref, recorded: rec, perf, result, recs, progress, history, payload, plan: null, savedFeedback: fbs[fbs.length - 1] ?? null });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-5 grid grid-cols-1 gap-4" data-testid="coach-history">
      {msg && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" role="alert">
          {msg}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-semibold">Các lần chấm của {p.profileName}</h2>
            <select className="min-h-12 rounded-xl bg-white px-3 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800" value={lessonFilter} onChange={(e) => setLessonFilter(e.target.value)} data-testid="coach-history-lesson">
              <option value="">Mọi bài ({results.length})</option>
              {lessonIds.map((id) => (
                <option key={id} value={id}>
                  {titles[id] ?? id} ({results.filter((r) => r.lessonId === id).length})
                </option>
              ))}
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Chưa có lần chấm nào. Ghi một bài để bắt đầu theo dõi tiến bộ.</p>
          ) : (
            <ul className="mt-3 grid gap-2" data-testid="coach-history-list">
              {shown.map((r) => {
                const s = sessionOf(r);
                const old = r.engineVersion !== SCORING_ENGINE_VERSION;
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 p-2 dark:bg-slate-700/50" data-testid="coach-history-item">
                    <span className="w-12 text-center text-xl font-bold tabular-nums">{r.total}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="font-semibold">{titles[r.lessonId] ?? r.lessonId}</span>
                      {s?.measures ? ` · ô ${s.measures[0]}–${s.measures[1]}` : ''}
                      <br />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(r.createdAt).toLocaleString('vi-VN')} · {COACH_MODE_LABEL[r.mode]} · ♩≈{r.tempo.actualBpm === null ? '—' : Math.round(r.tempo.actualBpm)} · engine {r.engineVersion}
                      </span>
                    </span>
                    <Button className="min-h-10 text-sm" disabled={busy} onClick={() => void open(r)} data-testid="coach-history-open">
                      Xem
                    </Button>
                    {old && (
                      <Button variant="ghost" className="min-h-10 text-sm" disabled={busy} onClick={() => void open(r, true).then(reload)}>
                        Chấm lại bằng engine {SCORING_ENGINE_VERSION}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="min-h-10 text-sm"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm('Xoá lần chấm này (cả log ghi và nhận xét)? Không khôi phục được.')) void coachStorage.deleteSession(r.sessionId).then(reload);
                      }}
                    >
                      Xoá
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-4">
          {report && latest && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Tiến bộ: {titles[latest.lessonId] ?? latest.lessonId}</h2>
                <Segmented value={String(p.window) as '3' | '5' | '10'} onChange={(v) => p.setWindow(Number(v) as 3 | 5 | 10)} options={[{ value: '3', label: '3 lần' }, { value: '5', label: '5 lần' }, { value: '10', label: '10 lần' }]} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-4" data-testid="coach-progress">
                <div className="text-sm">
                  Gần nhất <strong className="text-2xl tabular-nums">{report.current?.total}</strong>
                  <br />
                  TB {report.attempts} lần trước: {report.averageTotal ?? '—'} · thay đổi {report.deltaVsAverage === null ? '—' : `${report.deltaVsAverage > 0 ? '+' : ''}${report.deltaVsAverage}`}
                </div>
                <ScoreSparkline points={sameRef.slice(-(p.window + 1)).map((r) => ({ total: r.total, at: r.createdAt }))} />
              </div>
              <ul className="mt-2 grid gap-1 text-sm">
                {report.criteria
                  .filter((c) => c.last !== null)
                  .map((c) => (
                    <li key={c.key}>
                      {c.trend === 'up' ? '↑' : c.trend === 'down' ? '↓' : c.trend === 'flat' ? '→' : '·'} {c.label}: {Math.round((c.last as number) * 100)}%
                      {c.delta !== null ? ` (${c.delta > 0 ? '+' : ''}${Math.round(c.delta * 100)} so với trung bình)` : ''}
                    </li>
                  ))}
              </ul>
              {report.recurring.length > 0 && <p className="mt-2 text-sm">Lỗi lặp lại: {report.recurring.slice(0, 4).map((x) => x.label).join('; ')}.</p>}
              {report.bestTempo !== null && <p className="text-sm">Tempo cao nhất khi đúng ≥ 90% nốt: ♩≈{report.bestTempo}.</p>}
              {report.errors && <p className="text-sm">Số lỗi nốt: {report.errors.first} → {report.errors.last}{report.errors.reduction !== null ? ` (${report.errors.reduction >= 0 ? 'giảm' : 'tăng'} ${Math.round(Math.abs(report.errors.reduction) * 100)}%)` : ''}.</p>}
            </Card>
          )}

          <Card>
            <h2 className="font-semibold">Hồ sơ kỹ năng (30 ngày)</h2>
            <ul className="mt-2 grid gap-1 text-sm" data-testid="coach-skill">
              {skill.criteria.map((c) => (
                <li key={c.key}>
                  {c.label}: {c.average === null ? 'chưa đo' : `${Math.round(c.average * 100)}%`}
                </li>
              ))}
            </ul>
            {skill.topFamilies.length > 0 && <p className="mt-2 text-sm">Hay gặp: {skill.topFamilies.map((f) => `${f.label} (${f.results} lần)`).join(', ')}.</p>}
          </Card>

          {activePlans.length > 0 && (
            <Card>
              <h2 className="font-semibold">Kế hoạch đang luyện</h2>
              <ul className="mt-2 grid gap-2">
                {activePlans.map((pl) => (
                  <li key={pl.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      {titles[pl.lessonId] ?? pl.lessonId}: {pl.title} — {activeStep(pl)?.title}
                    </span>
                    <Button className="min-h-10 text-sm" onClick={() => p.onContinuePlan(pl)}>
                      Tiếp tục
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="font-semibold">Báo cáo & dữ liệu</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Dữ liệu chỉ lưu trên máy này, riêng từng hồ sơ. Xuất file để gửi phụ huynh / giáo viên.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button className="min-h-10 text-sm" onClick={() => download(`vietpiano-coach-${p.profileName}.txt`, progressText(p.profileName, results, titles), 'text/plain;charset=utf-8')} disabled={!results.length} data-testid="coach-export-text">
                Báo cáo văn bản
              </Button>
              <Button className="min-h-10 text-sm" onClick={() => void coachStorage.exportProfile(p.profileKey).then((x) => download(`vietpiano-coach-${p.profileName}.json`, JSON.stringify(x, null, 1), 'application/json'))} disabled={!results.length}>
                Dữ liệu JSON
              </Button>
              <Button
                variant={confirmAll ? 'danger' : 'ghost'}
                className="min-h-10 text-sm"
                disabled={!results.length && !sessions.length}
                onClick={() => {
                  if (!confirmAll) return setConfirmAll(true);
                  setConfirmAll(false);
                  void coachStorage.deleteProfile(p.profileKey).then(reload);
                }}
                data-testid="coach-delete-all"
              >
                {confirmAll ? 'Bấm lần nữa để xoá vĩnh viễn' : 'Xoá toàn bộ lịch sử của hồ sơ này'}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
