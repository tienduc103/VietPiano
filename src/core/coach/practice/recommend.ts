/**
 * Gợi ý bài luyện sửa lỗi (M6): gom issue của một lần chấm theo vấn đề, xếp theo số điểm bị mất, lấy tối đa 3 vấn đề và ánh xạ
 * sang tính năng SẴN CÓ của VietPiano (Coach luyện đoạn + tempo chậm, màn Luyện tập theo tay / theo nhịp, trò Bóng bay đọc nốt,
 * buổi làm quen pedal của giáo trình). Lý do luôn kèm số liệu lấy từ kết quả chấm. Người dùng bỏ qua / đổi được (UI).
 */
import type { IssueType, PracticeRecommendation, RecommendationKind, ScoreReference, ScoringIssue, ScoringResult } from '../types';
import { formatNumber } from '../scoring/context';
import { weakestMeasures } from '../scoring/ScoringEngine';

/** Buổi giáo trình giới thiệu pedal vang (cấp 6). */
export const PEDAL_LESSON_ID = 'l6-17-sunset';

const FAMILY: Partial<Record<IssueType, RecommendationKind>> = {
  'wrong-note': 'note-reading',
  'missing-note': 'note-reading',
  octave: 'note-reading',
  order: 'note-reading',
  'extra-note': 'note-reading',
  'repeated-note': 'continuity',
  'simultaneous-extra': 'note-reading',
  'chord-wrong-note': 'hands-separate',
  'chord-missing-note': 'hands-separate',
  'hands-async': 'hands-separate',
  'chord-async': 'hands-separate',
  early: 'slow-metronome',
  late: 'slow-metronome',
  'tempo-fast': 'slow-metronome',
  'tempo-slow': 'slow-metronome',
  'tempo-unstable': 'slow-metronome',
  hesitation: 'continuity',
  short: 'duration',
  long: 'duration',
  'pedal-missing': 'pedal',
  'pedal-late': 'pedal',
  'pedal-early': 'pedal',
  'pedal-release-early': 'pedal',
  'pedal-release-late': 'pedal',
  'pedal-not-changed': 'pedal',
  'pedal-stray': 'pedal',
  'pedal-continuous': 'pedal',
  'dynamics-contrast': 'dynamics',
  hairpin: 'dynamics',
  'velocity-uneven': 'dynamics',
  balance: 'dynamics',
};

/** Đoạn ô bao các issue (tối đa `max` ô, quanh ô mất nhiều điểm nhất). */
function spanOf(issues: readonly ScoringIssue[], first: number, last: number, max = 4): [number, number] | null {
  const lost = new Map<number, number>();
  for (const i of issues) if (i.measure !== null) lost.set(i.measure, (lost.get(i.measure) ?? 0) + i.deduction);
  if (!lost.size) return null;
  const worst = [...lost.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  let from = worst;
  let to = worst;
  while (to - from + 1 < max) {
    const before = lost.get(from - 1) ?? 0;
    const after = lost.get(to + 1) ?? 0;
    if (!before && !after) break;
    if (after >= before) to++;
    else from--;
  }
  return [Math.max(first, from), Math.min(last, to)];
}

const range = (m: [number, number]) => (m[0] === m[1] ? `ô ${m[0]}` : `ô ${m[0]}–${m[1]}`);
const pts = (x: number) => formatNumber(Math.round(x * 10) / 10);

export function recommendPractice(result: ScoringResult, ref: ScoreReference, opts: { max?: number } = {}): PracticeRecommendation[] {
  const max = opts.max ?? 3;
  const first = ref.printedMeasures[0] ?? 1;
  const last = ref.printedMeasures[ref.printedMeasures.length - 1] ?? first;
  const groups = new Map<RecommendationKind, ScoringIssue[]>();
  for (const i of result.issues) {
    const k = FAMILY[i.type];
    if (!k || i.deduction <= 0) continue;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  // Lỗi dồn vào một đoạn ngắn → ưu tiên "luyện riêng đoạn" (gom mọi loại lỗi của đoạn đó).
  const totalLost = result.issues.reduce((a, i) => a + i.deduction, 0);
  const weak = weakestMeasures(result, 4);
  const candidates: Omit<PracticeRecommendation, 'id' | 'priority'>[] = [];
  if (weak && totalLost > 0) {
    const inSpan = result.issues.filter((i) => i.measure !== null && i.measure >= weak[0] && i.measure <= weak[1]);
    const lost = inSpan.reduce((a, i) => a + i.deduction, 0);
    if (lost >= 0.4 * totalLost && inSpan.length >= 2) {
      candidates.push({
        kind: 'section',
        title: `Luyện riêng ${range(weak)}`,
        reason: `${range(weak)[0].toUpperCase()}${range(weak).slice(1)} làm mất ${pts(lost)} điểm (${inSpan.length} lỗi) — tách đoạn này, chơi chậm rồi tăng dần tempo.`,
        issueIds: inSpan.map((i) => i.id),
        lost,
        measures: weak,
        tempoPercent: 60,
        action: { type: 'coach-section', measures: weak, tempoPercent: 60 },
      });
    }
  }

  for (const [kind, list] of groups) {
    const lost = list.reduce((a, i) => a + i.deduction, 0);
    const span = spanOf(list, first, last) ?? ([first, Math.min(last, first + 3)] as [number, number]);
    const ids = list.map((i) => i.id);
    const n = list.length;
    switch (kind) {
      case 'note-reading':
        candidates.push({
          kind,
          title: 'Luyện đọc nốt và vị trí phím',
          reason: `${n} lỗi đánh sai / thiếu nốt làm mất ${pts(lost)} điểm, nhiều nhất ở ${range(span)}.`,
          issueIds: ids,
          lost,
          measures: span,
          action: n >= 4 ? { type: 'game', game: 'balloon-pop', label: 'Bóng bay nốt nhạc (đọc nốt + tìm phím)' } : { type: 'practice', measures: span, mode: 'wait' },
        });
        break;
      case 'slow-metronome':
        candidates.push({
          kind,
          title: 'Chơi theo metronome ở tempo chậm',
          reason: `${n} lỗi nhịp (sớm / muộn / tempo) làm mất ${pts(lost)} điểm.`,
          issueIds: ids,
          lost,
          measures: span,
          tempoPercent: 70,
          action: { type: 'coach-section', measures: span, tempoPercent: 70 },
        });
        break;
      case 'continuity':
        candidates.push({
          kind,
          title: 'Chơi liền mạch, không dừng giữa chừng',
          reason: `${n} chỗ ngắt quãng / đánh lặp làm mất ${pts(lost)} điểm, ở ${range(span)}.`,
          issueIds: ids,
          lost,
          measures: span,
          tempoPercent: 60,
          action: { type: 'coach-section', measures: span, tempoPercent: 60 },
        });
        break;
      case 'duration':
        candidates.push({
          kind,
          title: 'Giữ đủ trường độ từng nốt',
          reason: `${n} nốt nhả sớm / giữ quá lâu làm mất ${pts(lost)} điểm.`,
          issueIds: ids,
          lost,
          measures: span,
          tempoPercent: 70,
          action: { type: 'coach-section', measures: span, tempoPercent: 70 },
        });
        break;
      case 'hands-separate': {
        const hand = list.filter((i) => i.hand === 'left').length >= list.filter((i) => i.hand === 'right').length ? 'left' : 'right';
        candidates.push({
          kind,
          title: `Luyện riêng ${hand === 'left' ? 'tay trái' : 'tay phải'} rồi ghép hai tay`,
          reason: `${n} lỗi hợp âm / lệch hai tay làm mất ${pts(lost)} điểm, nhiều nhất ở ${range(span)}.`,
          issueIds: ids,
          lost,
          measures: span,
          hand,
          action: { type: 'practice', measures: span, mode: 'wait', hand },
        });
        break;
      }
      case 'pedal':
        candidates.push({
          kind,
          title: 'Luyện thay pedal theo hợp âm',
          reason: `${n} lỗi pedal làm mất ${pts(lost)} điểm, ở ${range(span)}.`,
          issueIds: ids,
          lost,
          measures: span,
          tempoPercent: 60,
          action: { type: 'coach-section', measures: span, tempoPercent: 60 },
        });
        break;
      case 'dynamics':
        candidates.push({
          kind,
          title: 'Luyện lực đánh mạnh – nhẹ',
          reason: `${n} lỗi lực đánh / sắc thái làm mất ${pts(lost)} điểm.`,
          issueIds: ids,
          lost,
          measures: span,
          tempoPercent: 80,
          action: { type: 'coach-section', measures: span, tempoPercent: 80 },
        });
        break;
      case 'section':
        break;
    }
  }
  // Đoạn đã có gợi ý "luyện riêng đoạn" thì bỏ gợi ý trùng đúng đoạn đó.
  const sectionRec = candidates.find((c) => c.kind === 'section');
  const list = candidates
    .filter((c) => c === sectionRec || !(sectionRec && c.action.type === 'coach-section' && c.measures?.[0] === sectionRec.measures?.[0] && c.measures?.[1] === sectionRec.measures?.[1]))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, max);
  return list.map((c, i) => ({ ...c, id: `R${i + 1}`, priority: i + 1 }));
}

/** Gợi ý mở buổi làm quen pedal khi bài có lỗi pedal và người học chưa quen (UI quyết định hiển thị). */
export function pedalLessonAction(): PracticeRecommendation['action'] {
  return { type: 'curriculum', lessonId: PEDAL_LESSON_ID, label: 'Buổi "Hoàng hôn" — làm quen pedal vang' };
}
