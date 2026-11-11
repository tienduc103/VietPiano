/**
 * "Luyện đoạn khó" ở kết quả Coach — DÙNG CHUNG cho mọi bài (bài kỹ thuật, bài hát, bài hai tay…), logic ở `core/smartPractice`.
 * - Bài thường: tempo đề xuất (Adaptive Tempo) + đoạn khó (chỉ khi lỗi lặp lại ở ≥ 2 lượt) → tạo bài bổ trợ / nghe mẫu / từng tay;
 *   chưa đủ dữ liệu → người học tự chọn đoạn (Manual Loop).
 * - Bài bổ trợ: đánh giá hiệu quả → mở rộng đoạn / chậm lại / quay lại bài gốc.
 * Không tự chuyển bài khi người học chưa bấm (đặc tả §15).
 */
import { useEffect, useMemo, useState } from 'react';
import { referenceFromLesson } from '../../core/coach/reference/fromLesson';
import type { ScoringResult } from '../../core/coach/types';
import type { Lesson } from '../../core/lessons/types';
import { lessonTempo } from '../../core/lessons/types';
import { pitchToLabel, type NoteLabelStyle } from '../../core/music/notes';
import { buildRemedialLesson, parseRemedialId } from '../../core/smartPractice/remedial';
import { PASSAGE_ERROR_LABEL, STRATEGY_LABEL, type AdaptiveTempo, type DifficultPassage, type RemedialOutcome } from '../../core/smartPractice/types';
import { findSourceLesson } from '../../core/technique/lessons';
import { smartPractice } from '../../hooks/useSmartPractice';
import { playLessonSample } from '../technique/playSample';
import { Button, Card, Icon } from '../ui';

interface Props {
  profileKey: string;
  /** Bài đang chấm (bài gốc, không phải đoạn ô cắt). */
  baseLesson: Lesson;
  result: ScoringResult;
  labelStyle: NoteLabelStyle;
  adaptiveTempo: boolean;
  /** Mở một bài trong Coach (màn chuẩn bị) — người học bấm Bắt đầu mới ghi. */
  onOpen: (lessonId: string, bpm: number, hand?: 'both' | 'right' | 'left') => void;
  onOpenTechnique: () => void;
}

export function SmartPracticePanel(p: Props) {
  const remedial = parseRemedialId(p.baseLesson.id);
  return (
    <div data-testid="smart-practice-panel">
    <Card className="ring-2 ring-teal-200 dark:ring-teal-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">🎯 Luyện đoạn khó · AI Smart Practice</h2>
        <Button variant="ghost" className="text-sm" onClick={p.onOpenTechnique} data-testid="smart-open-technique">
          Luyện kỹ thuật ngón tay →
        </Button>
      </div>
      {remedial ? <RemedialSection {...p} sourceId={remedial.sourceId} /> : <SourceSection {...p} />}
    </Card>
    </div>
  );
}

function names(xs: readonly string[], style: NoteLabelStyle): string {
  return xs.map((x) => pitchToLabel(x, style)).join(' – ');
}

function TempoLine({ tempo, onUse }: { tempo: AdaptiveTempo | null; onUse: (bpm: number) => void }) {
  if (!tempo) return null;
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" data-testid="smart-tempo">
      <span>
        <b>Tempo lượt tới: ♩={tempo.recommendedBpm}</b> — {tempo.reason}
        {tempo.stableBpm !== null && ` Tempo ổn định đã xác minh: ♩=${tempo.stableBpm}.`}
      </span>
      <Button className="min-h-10 text-sm" onClick={() => onUse(tempo.recommendedBpm)} data-testid="smart-use-tempo">
        Dùng ♩={tempo.recommendedBpm}
      </Button>
    </p>
  );
}

function SourceSection(p: Props) {
  const [passages, setPassages] = useState<DifficultPassage[] | null>(null);
  const [tempo, setTempo] = useState<AdaptiveTempo | null>(null);
  const reference = useMemo(() => referenceFromLesson(p.baseLesson), [p.baseLesson]);
  const graded = p.result.referenceId === reference.id;
  useEffect(() => {
    let live = true;
    void smartPractice.detectDifficultPassages(p.profileKey, p.baseLesson.id, [p.result]).then((x) => live && setPassages(x));
    if (p.adaptiveTempo) void smartPractice.getAdaptiveTempo(p.profileKey, p.baseLesson.id).then((t) => live && setTempo(t));
    return () => {
      live = false;
    };
  }, [p.profileKey, p.baseLesson.id, p.result, p.adaptiveTempo]);

  const bpmNow = p.result.tempo.targetBpm;
  const startRemedial = (ps: Pick<DifficultPassage, 'sourceId' | 'startGroup' | 'endGroup'> & Partial<DifficultPassage>, hand?: 'right' | 'left', exact = false) => {
    const bpm = Math.max(30, Math.round(bpmNow * (ps.tempoSensitive ? 0.6 : 0.7)));
    const made = smartPractice.createRemedialExercise(p.profileKey, ps, 0, { tempo: bpm, exact });
    if (made) p.onOpen(made.lesson.id, bpm, hand ?? (ps.handMode === 'both' ? undefined : ps.handMode));
  };

  return (
    <div className="mt-1">
      <TempoLine tempo={tempo} onUse={(bpm) => p.onOpen(p.baseLesson.id, bpm)} />
      {!graded && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Lượt này là một đoạn cắt / một tay — đoạn khó được tính trên các lượt chơi cả bài.</p>}
      {passages === null ? (
        <p className="mt-2 text-sm text-slate-500">Đang phân tích các lượt đã chơi…</p>
      ) : passages.length ? (
        <ul className="mt-2 grid gap-2" data-testid="smart-passages">
          {passages.map((ps) => (
            <PassageRow key={ps.id} ps={ps} reference={reference} lesson={p.baseLesson} labelStyle={p.labelStyle} bpm={Math.round(bpmNow * 0.7)} onPractice={(hand) => startRemedial(ps, hand)} />
          ))}
        </ul>
      ) : (
        <ManualPick reference={reference} labelStyle={p.labelStyle} onPick={(a, b) => startRemedial({ sourceId: p.baseLesson.id, startGroup: a, endGroup: b }, undefined, true)} />
      )}
    </div>
  );
}

function PassageRow({
  ps,
  reference,
  lesson,
  labelStyle,
  bpm,
  onPractice,
}: {
  ps: DifficultPassage;
  reference: ReturnType<typeof referenceFromLesson>;
  lesson: Lesson;
  labelStyle: NoteLabelStyle;
  bpm: number;
  onPractice: (hand?: 'right' | 'left') => void;
}) {
  const twoHands = reference.twoHands;
  return (
    <li className="rounded-xl bg-teal-50 p-3 dark:bg-teal-900/20" data-testid="smart-passage">
      <div className="font-semibold">
        {names(ps.noteNames, labelStyle)} <span className="font-normal text-slate-500 dark:text-slate-400">· ô {ps.measure === ps.toMeasure ? ps.measure : `${ps.measure}–${ps.toMeasure}`}</span>
      </div>
      <div className="text-sm">
        {ps.errorTypes.map((e) => `${PASSAGE_ERROR_LABEL[e.type]} (${e.sessions} lượt)`).join(', ')} — có lỗi ở {ps.evidenceSessionIds.length}/{ps.analyzedSessions} lượt gần nhất
        {ps.timingDeviationMs ? `, chậm khoảng ${ps.timingDeviationMs} ms ở chỗ chuyển` : ''}. Độ tin cậy: {ps.confidence === 'high' ? 'cao' : 'trung bình'}.
        {ps.tempoSensitive && ' Lỗi nhiều hơn rõ rệt khi tăng tempo.'}
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-300">Cách luyện: {STRATEGY_LABEL[ps.strategy]}.</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="primary" className="min-h-10 text-sm" onClick={() => onPractice()} data-testid="smart-practice-passage">
          <Icon name="brackets" className="h-5 w-5" /> Luyện bài bổ trợ
        </Button>
        <Button
          className="min-h-10 text-sm"
          onClick={() => {
            try {
              playLessonSample(buildRemedialLesson(lesson, Math.max(0, ps.startGroup - 1), ps.endGroup, reference).lesson, bpm);
            } catch {
              /* bỏ qua */
            }
          }}
          data-testid="smart-listen-passage"
        >
          <Icon name="volume" className="h-5 w-5" /> Nghe mẫu
        </Button>
        {twoHands && (
          <>
            <Button className="min-h-10 text-sm" onClick={() => onPractice('right')}>
              Tay phải
            </Button>
            <Button className="min-h-10 text-sm" onClick={() => onPractice('left')}>
              Tay trái
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

function ManualPick({ reference, labelStyle, onPick }: { reference: ReturnType<typeof referenceFromLesson>; labelStyle: NoteLabelStyle; onPick: (a: number, b: number) => void }) {
  const opts = reference.groups.map((g) => {
    const n = g.notes.map((i) => reference.notes[i]).sort((a, b) => b.midi - a.midi)[0];
    return { g: g.index, label: `ô ${g.measure} · ${pitchToLabel(n.pitch, labelStyle)}` };
  });
  const [a, setA] = useState(0);
  const [b, setB] = useState(Math.min(2, opts.length - 1));
  return (
    <div className="mt-2 text-sm" data-testid="smart-manual">
      <p className="text-slate-600 dark:text-slate-300">
        Chưa đủ bằng chứng để kết luận đoạn khó (cần lỗi lặp lại ở ít nhất 2 lượt chơi cả bài). Bạn có thể tự chọn đoạn A–B để luyện:
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>
          <span className="block text-slate-500">Từ (A)</span>
          <select className="min-h-10 rounded-xl bg-white px-2 ring-1 ring-teal-200 dark:bg-slate-900 dark:ring-teal-800" value={a} onChange={(e) => { const v = Number(e.target.value); setA(v); if (b < v) setB(v); }} data-testid="smart-manual-from">
            {opts.map((o) => (
              <option key={o.g} value={o.g}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-slate-500">Tới (B)</span>
          <select className="min-h-10 rounded-xl bg-white px-2 ring-1 ring-teal-200 dark:bg-slate-900 dark:ring-teal-800" value={b} onChange={(e) => { const v = Number(e.target.value); setB(v); if (a > v) setA(v); }} data-testid="smart-manual-to">
            {opts.map((o) => (
              <option key={o.g} value={o.g}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Button className="min-h-10 text-sm" onClick={() => onPick(a, b)} data-testid="smart-manual-start">
          Luyện đoạn này
        </Button>
      </div>
    </div>
  );
}

function RemedialSection(p: Props & { sourceId: string }) {
  const [outcome, setOutcome] = useState<RemedialOutcome | null>(null);
  const source = findSourceLesson(p.sourceId);
  useEffect(() => {
    let live = true;
    void smartPractice.evaluateRemedialOutcome(p.profileKey, p.baseLesson.id, [p.result]).then((o) => live && setOutcome(o));
    return () => {
      live = false;
    };
  }, [p.profileKey, p.baseLesson.id, p.result]);
  const bpm = p.result.tempo.targetBpm;
  const extend = () => {
    const made = smartPractice.extendRemedial(p.profileKey, p.baseLesson.id, { tempo: bpm });
    if (made) p.onOpen(made.lesson.id, bpm);
  };
  return (
    <div className="mt-1 text-sm" data-testid="smart-remedial">
      <p>
        Bài bổ trợ của <b>{source?.title ?? p.sourceId}</b>. {outcome?.reason ?? 'Đang đánh giá…'}
      </p>
      {outcome && outcome.verdict !== 'not-enough-data' && (
        <p className="mt-1">
          Đoạn này trong bài gốc: có lỗi ở {Math.round((outcome.errorRateBefore ?? 0) * 100)}% lượt trước khi luyện → {Math.round((outcome.errorRateAfter ?? 0) * 100)}% sau khi luyện
          {outcome.verdict === 'improved' ? ' — đã cải thiện.' : '.'}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {outcome?.next === 'extend' && (
          <Button variant="primary" className="min-h-10 text-sm" onClick={extend} data-testid="smart-extend">
            Mở rộng đoạn
          </Button>
        )}
        <Button className="min-h-10 text-sm" onClick={() => p.onOpen(p.baseLesson.id, outcome?.next === 'slower' ? Math.max(30, Math.round(bpm * 0.85)) : bpm)} data-testid="smart-again">
          {outcome?.next === 'slower' ? `Luyện lại chậm hơn (♩=${Math.max(30, Math.round(bpm * 0.85))})` : 'Luyện lại đoạn này'}
        </Button>
        {source && (
          <Button variant={outcome?.next === 'return-to-source' ? 'primary' : 'secondary'} className="min-h-10 text-sm" onClick={() => p.onOpen(source.id, lessonTempo(source))} data-testid="smart-back-to-source">
            ↩ Quay lại bài gốc
          </Button>
        )}
      </div>
    </div>
  );
}
