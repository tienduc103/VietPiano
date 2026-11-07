import { useMemo, useState } from 'react';
import type { CoachAiPayload } from '../../core/coach/ai/payload';
import type { CoachAudience } from '../../core/coach/ai/prompt';
import { cursorAt } from '../../core/coach/follower';
import { activeStep, planProgress } from '../../core/coach/practice/plan';
import type { ProgressReport } from '../../core/coach/progress/compare';
import { abSchedule, performanceSchedule, referenceSchedule, REPLAY_NOTICE, replayRange, resultMap } from '../../core/coach/replay';
import { formatNumber, notePosition } from '../../core/coach/scoring/context';
import { weakestMeasures } from '../../core/coach/scoring/ScoringEngine';
import type { CoachSettings } from '../../core/coach/settings';
import { coachStorage } from '../../core/coach/storage/CoachStorage';
import { COACH_MODE_LABEL, type AIFeedback, type BuiltPerformance, type NoteAlignment, type PracticePlan, type PracticeRecommendation, type RecordedSession, type ScoreReference, type ScoringResult } from '../../core/coach/types';
import type { Lesson } from '../../core/lessons/types';
import { midiToLabel, midiToName, type NoteLabelStyle } from '../../core/music/notes';
import { useCoachReplay } from '../../hooks/useCoachReplay';
import { Button, Card, Icon } from '../ui';
import { CoachFeedbackCard } from './CoachFeedbackCard';
import { CoachScoreView, noteLevel, type CoachSelection } from './CoachScoreView';
import { CriteriaMeters, ScoreSparkline } from './CriteriaMeters';

export interface ResultData {
  lesson: Lesson;
  baseLesson: Lesson;
  reference: ScoreReference;
  recorded: RecordedSession;
  perf: BuiltPerformance;
  result: ScoringResult;
  recs: PracticeRecommendation[];
  progress: ProgressReport;
  history: ScoringResult[];
  payload: CoachAiPayload;
  plan: PracticePlan | null;
  savedFeedback?: AIFeedback | null;
}

interface Props {
  data: ResultData;
  audience: CoachAudience;
  labelStyle: NoteLabelStyle;
  cfg: CoachSettings;
  onRetry: () => void;
  onPracticeSection: (m: [number, number], bpm: number | null) => void;
  onRecommendation: (rec: PracticeRecommendation, asPlan: boolean) => void;
  onContinuePlan: (plan: PracticePlan) => void;
}

const SPEEDS = [1, 0.75, 0.5] as const;

function Tile({ label, value, tone = 'default', testId }: { label: string; value: string | number; tone?: 'default' | 'good' | 'bad'; testId?: string }) {
  const color = tone === 'good' ? 'text-emerald-700 dark:text-emerald-300' : tone === 'bad' ? 'text-rose-700 dark:text-rose-300' : '';
  return (
    <div className="rounded-xl bg-white/80 px-3 py-2 ring-1 ring-violet-100 dark:bg-slate-800/80 dark:ring-violet-900" data-testid={testId}>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={`text-xl font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

const STATUS_TEXT: Record<NoteAlignment['status'], string> = {
  correct: 'Đúng nốt',
  octave: 'Sai quãng tám',
  wrong: 'Sai nốt',
  missing: 'Thiếu nốt',
  extra: 'Nốt thừa',
  repeated: 'Đánh lặp',
  simultaneous: 'Thừa (cùng lúc)',
  order: 'Sai thứ tự',
};

export function CoachResults({ data, audience, labelStyle, cfg, onRetry, onPracticeSection, onRecommendation, onContinuePlan }: Props) {
  const { result, reference: ref } = data;
  const [selection, setSelection] = useState<CoachSelection | null>(null);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const replay = useCoachReplay();
  const map = useMemo(() => resultMap(result), [result]);
  const firstOnset = data.perf.notes[0]?.onMs ?? 0;
  const sec = (ms: number) => `${formatNumber(Math.round((ms - firstOnset) / 10) / 100, 2)} s`;
  const name = (m: number) => `${midiToLabel(m, labelStyle)}${labelStyle === 'solfege' ? ` (${midiToName(m)})` : ''}`;

  const selectedMeasure: number | null =
    selection?.kind === 'measure'
      ? selection.measure
      : selection?.kind === 'note'
        ? (ref.notes.find((n) => n.staff === selection.staff && n.scoreIndex === selection.index)?.measure ?? null)
        : selection?.kind === 'extra'
          ? (result.alignment.find((a) => a.perfId === selection.perfId && a.refId === null)?.measure ?? null)
          : null;

  const play = (kind: 'mine' | 'reference' | 'ab', measures: [number, number] | null) => {
    const range = replayRange(ref, result, measures);
    const bpm = result.tempo.targetBpm * speed;
    const mine = performanceSchedule(data.perf, measures ? range : { fromMs: range.fromMs, toMs: Infinity }, speed);
    const std = referenceSchedule(data.lesson, measures ? range : { fromBeat: range.fromBeat, toBeat: Infinity }, bpm);
    const mineBeat = (t: number) => map.beatAt(range.fromMs + t * 1000 * speed);
    const refBeat = (t: number) => range.fromBeat + (t * bpm) / 60;
    if (kind === 'mine') replay.play('mine', mine, mineBeat);
    else if (kind === 'reference') replay.play('reference', std, refBeat);
    else {
      const ab = abSchedule(std, mine);
      replay.play('ab', ab.notes, (t) => (t < ab.bStart ? refBeat(t) : mineBeat(t - ab.bStart)), ab.bStart);
    }
  };
  const replayCursor = replay.beat !== null ? cursorAt(ref, replay.beat) : null;

  const measuresToReview = result.measures.filter((m) => m.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 8);
  const pedalIssues = result.issues.filter((i) => i.criterion === 'pedal');
  const weak = weakestMeasures(result, 4);
  const c = result.counts;
  const prog = data.progress;
  const plan = data.plan;
  const step = plan ? activeStep(plan) : null;

  return (
    <div className="mt-5 grid grid-cols-1 gap-4" data-testid="coach-results">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            {data.baseLesson.title}
            {data.recorded.session.measures ? ` · ô ${data.recorded.session.measures[0]}–${data.recorded.session.measures[1]}` : ''} · {COACH_MODE_LABEL[result.mode]}
          </div>
          <div className="mt-1 flex items-end gap-3">
            <span className="text-6xl font-extrabold tabular-nums" data-testid="coach-total">
              {result.total}
            </span>
            <span className="pb-2 text-lg text-slate-500">/100</span>
            <span
              className={`mb-2 rounded-full px-2 py-0.5 text-xs font-semibold ${result.confidence.overall === 'high' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : result.confidence.overall === 'medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200'}`}
              data-testid="coach-confidence"
            >
              Độ tin cậy {result.confidence.overall === 'high' ? 'cao' : result.confidence.overall === 'medium' ? 'trung bình' : 'thấp'}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Đúng" value={`${c.correct}/${c.refNotes}`} tone="good" testId="coach-count-correct" />
            <Tile label="Sai" value={c.wrong + c.octave + c.order} tone={c.wrong + c.octave + c.order ? 'bad' : 'default'} testId="coach-count-wrong" />
            <Tile label="Thiếu" value={c.missing} tone={c.missing ? 'bad' : 'default'} testId="coach-count-missing" />
            <Tile label="Thừa" value={c.extra + c.repeated + c.simultaneous} tone={c.extra + c.repeated + c.simultaneous ? 'bad' : 'default'} testId="coach-count-extra" />
          </div>
          {result.confidence.overall === 'low' && (
            <p className="mt-3 rounded-xl bg-rose-50 p-2 text-sm text-rose-800 ring-1 ring-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:ring-rose-800" role="alert" data-testid="coach-low-confidence">
              Chỉ đối chiếu được {Math.round(result.confidence.alignment * 100)}% bản nhạc — có thể đã chọn sai bài, chơi sai quãng tám cả bài hoặc chơi rất ít nốt. Điểm chỉ để tham khảo.
            </p>
          )}
          <p className="mt-3 text-sm" data-testid="coach-tempo">
            Tempo ♩≈{result.tempo.actualBpm === null ? '—' : Math.round(result.tempo.actualBpm)} (mục tiêu ♩={Math.round(result.tempo.targetBpm)})
            {result.tempo.drift !== null && Math.abs(result.tempo.drift) >= 0.1 ? ` · ${result.tempo.drift > 0 ? 'nhanh dần' : 'chậm dần'} ${Math.round(Math.abs(result.tempo.drift) * 100)}%` : ''}
          </p>
          {(result.hands.right || result.hands.left) && ref.twoHands && (
            <p className="mt-1 text-sm" data-testid="coach-hands">
              {result.hands.right ? `Tay phải ${Math.round(result.hands.right.accuracy * 100)}% đúng` : ''}
              {result.hands.left ? ` · tay trái ${Math.round(result.hands.left.accuracy * 100)}% đúng` : ''}
              {result.hands.syncRate !== null && result.hands.syncRate !== undefined ? ` · hai tay đồng bộ ${Math.round(result.hands.syncRate * 100)}%` : ''}
            </p>
          )}
          {prog.attempts > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-violet-50 p-2 dark:bg-slate-700/50" data-testid="coach-compare">
              <div className="text-sm">
                So với lần trước:{' '}
                <strong className={prog.deltaVsPrevious !== null && prog.deltaVsPrevious < 0 ? 'text-rose-700 dark:text-rose-300' : 'text-emerald-700 dark:text-emerald-300'}>
                  {prog.deltaVsPrevious === null ? '—' : `${prog.deltaVsPrevious > 0 ? '+' : ''}${prog.deltaVsPrevious}`}
                </strong>
                <br />
                TB {prog.attempts} lần: {prog.averageTotal ?? '—'} · cao nhất {prog.best ?? '—'}
              </div>
              <ScoreSparkline points={[...data.history.slice(-(prog.window)), result].map((r) => ({ total: r.total, at: r.createdAt }))} />
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Điểm từng tiêu chí</h2>
          <CriteriaMeters criteria={result.criteria} />
          {result.explanation.length > 0 && (
            <details className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              <summary className="cursor-pointer select-none">Cách tính điểm & dữ liệu chưa đủ</summary>
              <ul className="mt-1 list-disc pl-4" data-testid="coach-explanation">
                {result.explanation.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                <li>
                  Engine {result.engineVersion} · căn chỉnh {result.alignmentVersion} · trọng số {result.weightsVersion}. Mỗi lỗi có số điểm bị trừ; tổng điểm = 100 − tổng trừ.
                </li>
              </ul>
            </details>
          )}
        </Card>
      </div>

      <Card className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Lỗi trên khuông nhạc</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Chú giải">
            <span className="coach-legend-swatch bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">✓</span>đúng
            <span className="coach-legend-swatch bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">⏱</span>lệch thời điểm
            <span className="coach-legend-swatch bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">⌛</span>trường độ
            <span className="coach-legend-swatch bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">⏸</span>ngắt quãng
            <span className="coach-legend-swatch bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">✗</span>sai
            <span className="coach-legend-swatch bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">○</span>thiếu
            <span className="coach-legend-swatch bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">+</span>thừa
            <span className="coach-legend-swatch bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">P</span>pedal
          </div>
        </div>
        <div className="mt-2">
          <CoachScoreView lesson={data.lesson} reference={ref} result={result} labelStyle={labelStyle} cursor={replayCursor} selection={selection} onSelect={setSelection} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="coach-replay">
          <Button className="min-h-10 text-sm" onClick={() => (replay.kind === 'mine' ? replay.stop() : play('mine', null))} disabled={!replay.supported} data-testid="coach-play-mine">
            <Icon name={replay.kind === 'mine' ? 'pause' : 'play'} className="h-5 w-5" /> Bản của bạn
          </Button>
          <Button className="min-h-10 text-sm" onClick={() => (replay.kind === 'reference' ? replay.stop() : play('reference', null))} disabled={!replay.supported} data-testid="coach-play-reference">
            <Icon name={replay.kind === 'reference' ? 'pause' : 'volume'} className="h-5 w-5" /> Bản chuẩn
          </Button>
          <Button className="min-h-10 text-sm" onClick={() => (replay.kind === 'ab' ? replay.stop() : play('ab', weak))} disabled={!replay.supported || !weak} data-testid="coach-play-ab">
            A/B {weak ? `ô ${weak[0]}–${weak[1]}` : ''}
          </Button>
          <label className="text-sm">
            Tốc độ{' '}
            <select className="min-h-10 rounded-lg bg-white px-2 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800" value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof SPEEDS)[number])}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {Math.round(s * 100)}%
                </option>
              ))}
            </select>
          </label>
          {replay.part && <span className="text-sm font-semibold">{replay.part === 'A' ? 'A — bản chuẩn' : 'B — bản của bạn'}</span>}
          <span className="text-xs text-slate-500 dark:text-slate-400">{REPLAY_NOTICE}</span>
        </div>
        {measuresToReview.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="coach-measures">
            <span className="text-sm font-semibold">Ô cần chú ý:</span>
            {measuresToReview.map((m) => (
              <button
                key={m.measure}
                type="button"
                className={`min-h-10 rounded-full px-3 text-sm font-semibold ring-1 ${selectedMeasure === m.measure ? 'bg-fuchsia-600 text-white ring-fuchsia-600' : 'bg-white ring-rose-200 dark:bg-slate-800 dark:ring-rose-800'}`}
                onClick={() => setSelection({ kind: 'measure', measure: m.measure })}
                data-testid={`coach-measure-${m.measure}`}
              >
                Ô {m.measure} · −{formatNumber(Math.round(m.lost * 10) / 10)}
              </button>
            ))}
          </div>
        )}
        {selection && <SelectionDetail data={data} selection={selection} measure={selectedMeasure} name={name} sec={sec} onPlay={(k, m) => play(k, m)} onPractice={(m) => onPracticeSection(m, Math.round(result.tempo.targetBpm * 0.7))} />}
        {pedalIssues.length > 0 && (
          <div className="mt-3" data-testid="coach-pedal-issues">
            <div className="text-sm font-semibold text-violet-700 dark:text-violet-300">Pedal</div>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {pedalIssues.map((i) => (
                <li key={i.id}>
                  {i.message} <span className="text-xs text-slate-500">(−{formatNumber(i.deduction)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <CoachFeedbackCard
        result={result}
        payload={data.payload}
        audience={audience}
        timeoutSec={cfg.aiTimeoutSec}
        retries={cfg.aiRetries}
        saved={data.savedFeedback ?? null}
        onFeedback={(fb) => void coachStorage.saveFeedback(fb).catch(() => {})}
        onPractice={onPracticeSection}
      />

      {plan && (
        <Card className="ring-2 ring-fuchsia-200 dark:ring-fuchsia-800">
          <h2 className="font-semibold">Kế hoạch luyện: {plan.title}</h2>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-fuchsia-100 dark:bg-slate-700" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(planProgress(plan) * 100)} aria-label="Tiến độ kế hoạch">
            <div className="h-full rounded-full bg-fuchsia-500" style={{ width: `${Math.round(planProgress(plan) * 100)}%` }} />
          </div>
          <ol className="mt-2 grid gap-1 text-sm" data-testid="coach-plan-steps">
            {plan.steps.map((s, i) => (
              <li key={s.id} data-status={s.status}>
                {s.status === 'done' ? '✓' : s.status === 'skipped' ? '↷' : s.status === 'active' ? '▶' : '○'} {i + 1}. {s.title} — {s.measures ? `ô ${s.measures[0]}–${s.measures[1]}` : 'cả bài'}, ♩={s.bpm}
                {s.attempts.length ? ` · ${s.attempts.length} lần, gần nhất ${s.attempts[s.attempts.length - 1].score}` : ''}
              </li>
            ))}
          </ol>
          {plan.status === 'done' ? (
            <p className="mt-2 text-sm font-semibold">
              Xong kế hoạch: từ {plan.sourceScore} lên {plan.finalScore ?? '—'} điểm.
            </p>
          ) : (
            step && (
              <Button variant="primary" className="mt-2" onClick={() => onContinuePlan(plan)} midiNav="forward" data-testid="coach-plan-next">
                Bước tiếp: {step.title}
              </Button>
            )
          )}
        </Card>
      )}

      {data.recs.filter((r) => !dismissed.has(r.id)).length > 0 && (
        <Card>
          <h2 className="font-semibold">Bài luyện sửa lỗi đề xuất</h2>
          <ul className="mt-2 grid gap-2" data-testid="coach-recs">
            {data.recs
              .filter((r) => !dismissed.has(r.id))
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-violet-50 p-3 dark:bg-slate-700/50" data-testid={`coach-rec-${r.kind}`}>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {r.priority}. {r.title}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">{r.reason}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.measures && (
                      <Button variant="primary" className="min-h-10 text-sm" onClick={() => onRecommendation(r, true)} data-testid="coach-rec-plan">
                        Luyện theo kế hoạch 7 bước
                      </Button>
                    )}
                    <Button className="min-h-10 text-sm" onClick={() => onRecommendation(r, false)}>
                      {r.action.type === 'game' ? r.action.label : r.action.type === 'curriculum' ? r.action.label : r.action.type === 'practice' ? 'Mở màn Luyện tập' : 'Luyện ngay'}
                    </Button>
                    <Button variant="ghost" className="min-h-10 text-sm" onClick={() => setDismissed((d) => new Set(d).add(r.id))}>
                      Bỏ qua
                    </Button>
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Button variant="primary" onClick={onRetry} midiNav={step && plan?.status === 'active' ? undefined : 'forward'} data-testid="coach-again">
          <Icon name="restart" className="h-5 w-5" /> Ghi lại
        </Button>
        {weak && (
          <Button onClick={() => onPracticeSection(weak, Math.round(result.tempo.targetBpm * 0.7))} data-testid="coach-retry-weak">
            <Icon name="brackets" className="h-5 w-5" /> Luyện lại ô {weak[0]}–{weak[1]} (70%)
          </Button>
        )}
      </div>
    </div>
  );
}

function SelectionDetail({
  data,
  selection,
  measure,
  name,
  sec,
  onPlay,
  onPractice,
}: {
  data: ResultData;
  selection: CoachSelection;
  measure: number | null;
  name: (m: number) => string;
  sec: (ms: number) => string;
  onPlay: (kind: 'mine' | 'reference', m: [number, number]) => void;
  onPractice: (m: [number, number]) => void;
}) {
  const { result, reference: ref } = data;
  const entries =
    selection.kind === 'note'
      ? ref.notes.filter((n) => n.staff === selection.staff && n.scoreIndex === selection.index).map((n) => ({ n, a: result.alignment.find((x) => x.refId === n.id) }))
      : selection.kind === 'measure'
        ? ref.notes.filter((n) => n.measure === selection.measure).map((n) => ({ n, a: result.alignment.find((x) => x.refId === n.id) }))
        : [];
  const extras = result.alignment.filter((a) => a.refId === null && (selection.kind === 'extra' ? a.perfId === selection.perfId : selection.kind === 'measure' && a.measure === selection.measure));
  const issues = result.issues.filter((i) =>
    selection.kind === 'measure' ? i.measure === selection.measure : selection.kind === 'extra' ? i.perfNoteIds.includes(selection.perfId) && i.refNoteIds.length === 0 : i.refNoteIds.some((id) => entries.some((e) => e.n.id === id)),
  );
  return (
    <div className="mt-3 rounded-xl bg-white/80 p-3 ring-1 ring-fuchsia-200 dark:bg-slate-800/80 dark:ring-fuchsia-800" data-testid="coach-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{selection.kind === 'measure' ? `Ô ${selection.measure}` : selection.kind === 'extra' ? 'Nốt thừa' : entries[0] ? notePosition(ref, entries[0].n) : 'Nốt'}</h3>
        {measure !== null && (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-10 text-sm" onClick={() => onPlay('mine', [measure, measure])} data-testid="coach-detail-play">
              <Icon name="play" className="h-5 w-5" /> Nghe lại ô {measure}
            </Button>
            <Button className="min-h-10 text-sm" onClick={() => onPlay('reference', [measure, measure])}>
              <Icon name="volume" className="h-5 w-5" /> Bản chuẩn
            </Button>
            <Button variant="ghost" className="min-h-10 text-sm" onClick={() => onPractice([measure, measure])}>
              Luyện ô này
            </Button>
          </div>
        )}
      </div>
      {entries.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400">
              <tr>
                <th className="py-1 pr-3">Nốt chuẩn</th>
                <th className="py-1 pr-3">Bạn đánh</th>
                <th className="py-1 pr-3">Thời điểm chuẩn → thực tế</th>
                <th className="py-1 pr-3">Lệch</th>
                <th className="py-1 pr-3">Giữ / trường độ</th>
                <th className="py-1">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(({ n, a }) => {
                const lv = a ? noteLevel(a) : null;
                return (
                  <tr key={n.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="py-1 pr-3">
                      {name(n.midi)} <span className="text-xs text-slate-500">({n.hand === 'left' ? 'tay trái' : 'tay phải'})</span>
                    </td>
                    <td className="py-1 pr-3">{a?.perfMidi !== undefined ? name(a.perfMidi) : '—'}</td>
                    <td className="py-1 pr-3 tabular-nums">{a?.expectedMs !== undefined ? `${sec(a.expectedMs)} → ${a.actualMs !== undefined ? sec(a.actualMs) : '—'}` : '—'}</td>
                    <td className="py-1 pr-3 tabular-nums">{a?.deviationMs !== undefined ? `${a.deviationMs > 0 ? '+' : ''}${a.deviationMs} ms` : '—'}</td>
                    <td className="py-1 pr-3 tabular-nums">{a?.durationRatio !== undefined ? `${Math.round(a.durationRatio * 100)}%${a.soundingMs && a.heldMs && a.soundingMs > a.heldMs + 50 ? ' (ngân pedal)' : ''}` : '—'}</td>
                    <td className="py-1">{a ? `${lv?.mark} ${STATUS_TEXT[a.status]}${a.timing && a.timing !== 'ok' ? (a.timing === 'early' ? ', sớm' : ', muộn') : ''}${a.duration && a.duration !== 'ok' ? (a.duration === 'short' ? ', nhả sớm' : ', giữ lâu') : ''}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {extras.length > 0 && (
        <p className="mt-2 text-sm">
          Nốt thừa: {extras.map((x) => `${x.perfMidi !== undefined ? name(x.perfMidi) : '?'} lúc ${x.actualMs !== undefined ? sec(x.actualMs) : '—'}`).join(', ')}
        </p>
      )}
      {issues.length > 0 ? (
        <ul className="mt-2 list-disc pl-5 text-sm" data-testid="coach-detail-issues">
          {issues.map((i) => (
            <li key={i.id}>
              {i.message} <span className="text-xs text-slate-500">(−{formatNumber(i.deduction)} điểm)</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">Không có lỗi ở đây.</p>
      )}
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Thời điểm tính từ nốt đầu tiên; "chuẩn" = vị trí theo nhịp của chính bạn sau khi căn chỉnh tempo.</p>
    </div>
  );
}
