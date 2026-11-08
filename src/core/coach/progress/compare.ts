/**
 * Mode C — chấm tiến bộ / M7 phân tích lịch sử: so lần chấm mới với 3 / 5 / 10 lần gần nhất CỦA CHÍNH người học (cùng bài):
 * điểm trung bình, chênh lệch từng tiêu chí, xu hướng, lỗi tái diễn (cùng loại lỗi ở cùng ô trong ≥ 2 lần), tempo đạt được,
 * tỉ lệ giảm lỗi. Hàm thuần trên các `ScoringResult` đã lưu — không bịa số: mọi giá trị suy ra từ kết quả cũ.
 */
import { CRITERION_LABEL, type CriterionKey, type IssueType, type ScoringResult } from '../types';
import { linearFit } from '../scoring/tempoMap';

const KEYS: CriterionKey[] = ['notes', 'rhythm', 'duration', 'pedal', 'dynamics'];

export type IssueFamily = 'notes' | 'timing' | 'continuity' | 'duration' | 'pedal' | 'dynamics' | 'hands';

export const FAMILY_LABEL: Record<IssueFamily, string> = {
  notes: 'sai / thiếu nốt',
  timing: 'lệch nhịp',
  continuity: 'ngắt quãng',
  duration: 'trường độ',
  pedal: 'pedal',
  dynamics: 'lực đánh',
  hands: 'phối hợp hai tay',
};

export function issueFamily(type: IssueType): IssueFamily {
  if (type === 'early' || type === 'late' || type.startsWith('tempo')) return 'timing';
  if (type === 'hesitation' || type === 'restart' || type === 'repeated-note') return 'continuity';
  if (type === 'hands-async' || type === 'chord-async') return 'hands';
  if (type === 'short' || type === 'long') return 'duration';
  if (type.startsWith('pedal')) return 'pedal';
  if (type === 'dynamics-contrast' || type === 'hairpin' || type === 'velocity-uneven' || type === 'balance') return 'dynamics';
  return 'notes';
}

export interface CriterionTrend {
  key: CriterionKey;
  label: string;
  last: number | null;
  average: number | null;
  delta: number | null;
  trend: 'up' | 'down' | 'flat' | 'unknown';
}

export interface RecurringIssue {
  family: IssueFamily;
  measure: number;
  /** Số lần (trong cửa sổ) có lỗi này. */
  count: number;
  label: string;
}

export interface ProgressReport {
  /** Số lần chấm trước lần hiện tại được dùng để so. */
  attempts: number;
  window: number;
  current: { total: number; at: number } | null;
  previousTotal: number | null;
  averageTotal: number | null;
  best: number | null;
  deltaVsPrevious: number | null;
  deltaVsAverage: number | null;
  /** Điểm tăng trung bình mỗi lần (hồi quy trên cửa sổ + lần hiện tại). */
  slope: number | null;
  criteria: CriterionTrend[];
  recurring: RecurringIssue[];
  /** Tempo cao nhất đạt được khi đúng nốt ≥ 90%. */
  bestTempo: number | null;
  errors: { first: number; last: number; reduction: number | null } | null;
}

const errorCount = (r: ScoringResult) => r.counts.wrong + r.counts.missing + r.counts.extra + r.counts.octave + r.counts.order;
const value = (r: ScoringResult, k: CriterionKey) => r.criteria.find((c) => c.key === k)?.value ?? null;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * `history`: các lần chấm TRƯỚC (cùng hồ sơ + bài), cũ → mới; `current`: lần vừa chấm (nếu có).
 * Cửa sổ `n` (3, 5 hoặc 10) lấy các lần gần nhất của `history`.
 */
export function progressReport(history: readonly ScoringResult[], n: number, current?: ScoringResult): ProgressReport {
  const past = [...history].sort((a, b) => a.createdAt - b.createdAt).slice(-n);
  const seq = current ? [...past, current] : past;
  const latest = current ?? past[past.length - 1] ?? null;
  const before = current ? past : past.slice(0, -1);
  const previous = before[before.length - 1] ?? null;
  const averageTotal = avg(before.map((r) => r.total));
  const criteria: CriterionTrend[] = KEYS.map((key) => {
    const last = latest ? value(latest, key) : null;
    const average = avg(before.map((r) => value(r, key)).filter((v): v is number => v !== null));
    const delta = last !== null && average !== null ? last - average : null;
    return { key, label: CRITERION_LABEL[key], last, average, delta, trend: delta === null ? 'unknown' : delta > 0.03 ? 'up' : delta < -0.03 ? 'down' : 'flat' };
  });

  // Lỗi tái diễn: (nhóm lỗi, ô) xuất hiện ở ≥ 2 lần trong cửa sổ (tính cả lần hiện tại).
  const seen = new Map<string, { family: IssueFamily; measure: number; count: number }>();
  for (const r of seq) {
    const keys = new Set<string>();
    for (const i of r.issues) {
      if (i.measure === null) continue;
      const fam = issueFamily(i.type);
      keys.add(`${fam}@${i.measure}`);
    }
    for (const k of keys) {
      const [family, m] = k.split('@');
      const cur = seen.get(k) ?? { family: family as IssueFamily, measure: Number(m), count: 0 };
      cur.count++;
      seen.set(k, cur);
    }
  }
  const recurring = [...seen.values()]
    .filter((x) => x.count >= 2)
    .sort((a, b) => b.count - a.count || a.measure - b.measure)
    .slice(0, 8)
    .map((x) => ({ ...x, label: `${FAMILY_LABEL[x.family]} ở ô ${x.measure} (${x.count}/${seq.length} lần)` }));

  const tempos = seq.filter((r) => (value(r, 'notes') ?? 0) >= 0.9 && r.tempo.actualBpm !== null).map((r) => r.tempo.actualBpm as number);
  const fit = seq.length >= 3 ? linearFit(seq.map((_, i) => i), seq.map((r) => r.total)) : null;
  const firstErr = seq.length ? errorCount(seq[0]) : 0;
  const lastErr = seq.length ? errorCount(seq[seq.length - 1]) : 0;
  return {
    attempts: before.length,
    window: n,
    current: latest ? { total: latest.total, at: latest.createdAt } : null,
    previousTotal: previous?.total ?? null,
    averageTotal: averageTotal === null ? null : Math.round(averageTotal * 10) / 10,
    best: seq.length ? Math.max(...seq.map((r) => r.total)) : null,
    deltaVsPrevious: latest && previous ? latest.total - previous.total : null,
    deltaVsAverage: latest && averageTotal !== null ? Math.round((latest.total - averageTotal) * 10) / 10 : null,
    slope: fit ? Math.round(fit.b * 10) / 10 : null,
    criteria,
    recurring,
    bestTempo: tempos.length ? Math.round(Math.max(...tempos)) : null,
    errors: seq.length >= 2 ? { first: firstErr, last: lastErr, reduction: firstErr > 0 ? Math.round(((firstErr - lastErr) / firstErr) * 100) / 100 : null } : null,
  };
}

export interface SkillProfile {
  results: number;
  lessons: number;
  criteria: { key: CriterionKey; label: string; average: number | null }[];
  /** Nhóm lỗi hay gặp nhất (số lần chấm có nhóm lỗi đó). */
  topFamilies: { family: IssueFamily; label: string; results: number }[];
}

/** Hồ sơ kỹ năng của một người học trên mọi bài, các lần chấm từ `sinceMs`. */
export function skillProfile(results: readonly ScoringResult[], sinceMs = 0): SkillProfile {
  const list = results.filter((r) => r.createdAt >= sinceMs);
  const fam = new Map<IssueFamily, number>();
  for (const r of list) for (const f of new Set(r.issues.map((i) => issueFamily(i.type)))) fam.set(f, (fam.get(f) ?? 0) + 1);
  return {
    results: list.length,
    lessons: new Set(list.map((r) => r.lessonId)).size,
    criteria: KEYS.map((key) => ({ key, label: CRITERION_LABEL[key], average: avg(list.map((r) => value(r, key)).filter((v): v is number => v !== null)) })),
    topFamilies: [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([family, n]) => ({ family, label: FAMILY_LABEL[family], results: n })),
  };
}

/** Báo cáo văn bản cho phụ huynh / giáo viên (xuất file, không có hệ thống phân quyền). */
export function progressText(name: string, results: readonly ScoringResult[], titles: Record<string, string>, now = Date.now()): string {
  const lines = [`Báo cáo AI Piano Coach — ${name}`, `Lập lúc: ${new Date(now).toLocaleString('vi-VN')}`, `Số lần chấm: ${results.length}`, ''];
  const byLesson = new Map<string, ScoringResult[]>();
  for (const r of results) byLesson.set(r.lessonId, [...(byLesson.get(r.lessonId) ?? []), r]);
  for (const [lessonId, rs] of byLesson) {
    const sorted = [...rs].sort((a, b) => a.createdAt - b.createdAt);
    const rep = progressReport(sorted.slice(0, -1), 10, sorted[sorted.length - 1]);
    lines.push(`• ${titles[lessonId] ?? lessonId}: ${sorted.length} lần, gần nhất ${rep.current?.total ?? '—'}/100, cao nhất ${rep.best ?? '—'}/100${rep.deltaVsPrevious !== null ? `, so lần trước ${rep.deltaVsPrevious >= 0 ? '+' : ''}${rep.deltaVsPrevious}` : ''}.`);
    if (rep.recurring.length) lines.push(`  Lỗi lặp lại: ${rep.recurring.slice(0, 3).map((x) => x.label).join('; ')}.`);
    if (rep.bestTempo !== null) lines.push(`  Tempo cao nhất khi đúng ≥ 90% nốt: ♩≈${rep.bestTempo}.`);
  }
  const skill = skillProfile(results);
  lines.push('', 'Trung bình từng tiêu chí:');
  for (const c of skill.criteria) lines.push(`  ${c.label}: ${c.average === null ? 'chưa đo' : `${Math.round(c.average * 100)}%`}`);
  lines.push('', 'Dữ liệu chỉ lưu trên thiết bị này. Điểm do thuật toán chấm từ dữ liệu MIDI; nhận xét AI (nếu có) chỉ diễn giải các số liệu đó.');
  return lines.join('\n');
}
