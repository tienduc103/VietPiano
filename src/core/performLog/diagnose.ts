/**
 * Nhật ký Biểu diễn (TẠM THỜI, docs/perform-log.md) — chẩn đoán một lượt từ nốt cần đánh + sự kiện nhận được:
 * vì sao bị chấm sai / lỡ nhiều (lệch đồng hồ đàn MIDI, trễ / sớm đều, lệch nhịp nên khớp nhầm nốt kề, sai quãng tám,
 * nốt bị màn bỏ, không có tín hiệu…). Chỉ thống kê — không đổi điểm.
 */
import type { Diagnosis, LogInputSource, LoggedEvent, LoggedNote, PerformEntry } from './types';

export interface DiagnoseOptions {
  /** Lệch tối đa vẫn trọn điểm nhịp (ms) — cùng `PerformanceConfig.onTimeMs`. */
  onTimeMs: number;
  /** Chấp nhận đúng tên nốt sai quãng tám (nốt lỡ xét sự kiện cùng tên nốt). */
  octaveTolerant?: boolean;
}

/** Ngưỡng nghi vấn. */
export const HINT_RULES = {
  /** |trung vị lag của đàn MIDI| vượt mức này → mốc thời gian của đàn lệch đồng hồ trang. */
  clockSkewMs: 40,
  /** |trung vị lệch thời điểm| vượt mức này → đánh trễ / sớm đều. */
  biasMs: 100,
  /** Tối thiểu số trường hợp để nêu một nghi vấn. */
  minCount: 3,
  /** Tỉ lệ tối thiểu trong nhóm (vd nốt kề / tổng nốt sai). */
  share: 0.3,
  /** Khoảng (phách) quanh nốt để tìm sự kiện cùng phím. */
  nearBeats: 1,
} as const;

/** Nhãn ngắn của từng mã nghi vấn (Cài đặt, tài liệu). */
export const HINT_LABELS: Record<string, string> = {
  'clock-skew': 'mốc thời gian của đàn MIDI lệch đồng hồ trang',
  late: 'đánh trễ đều',
  early: 'đánh sớm đều',
  misaligned: 'nốt "sai" là nốt kề — lệch nhịp nên khớp nhầm ô',
  octave: 'sai quãng tám',
  dropped: 'nốt bị màn bỏ trước khi chấm',
  ignored: 'nốt bị bỏ vì quá sát nốt trước',
  'no-input': 'phần lớn nốt không nhận được tín hiệu',
  'extras-near': 'đúng phím nhưng ngoài cửa sổ chấm (thành gõ thừa)',
};

export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Phân vị (nội suy tuyến tính) của dãy ĐÃ sắp xếp. */
function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function diagnose(notes: readonly LoggedNote[], events: readonly LoggedEvent[], opts: DiagnoseOptions): Diagnosis {
  const samePitch = (a: number, b: number) => a === b || (!!opts.octaveTolerant && (a - b) % 12 === 0);
  const near = (e: LoggedEvent, n: LoggedNote) => e.beat !== null && Math.abs(e.beat - n.b) <= HINT_RULES.nearBeats;
  // Có nốt từ đàn MIDI → micro (nếu bật) nghe chính tiếng đàn và bị bỏ là bình thường, không phải nguyên nhân lỡ nốt.
  // Không có nốt MIDI nào mà micro vẫn bị bỏ ("đàn MIDI" nối nhưng không gửi nốt) thì mới là vấn đề.
  const hasMidi = events.some((e) => e.src === 'midi');
  const benign = (e: LoggedEvent) => hasMidi && e.out === 'dropped' && e.why === 'mic-while-midi';
  const relevant = events.filter((e) => !benign(e));

  // Sự kiện nhận được.
  const bySource: Partial<Record<LogInputSource, number>> = {};
  const dropped: Record<string, number> = {};
  let graded = 0;
  let extra = 0;
  let ignored = 0;
  for (const e of events) {
    bySource[e.src] = (bySource[e.src] ?? 0) + 1;
    if (e.out === 'hit' || e.out === 'wrong') graded++;
    else if (e.out === 'extra') extra++;
    else if (e.out === 'ignored') ignored++;
    else dropped[e.why ?? 'filtered'] = (dropped[e.why ?? 'filtered'] ?? 0) + 1;
  }

  // Lệch thời điểm của nốt đã đánh.
  const offs = notes.filter((n) => (n.r === 'correct' || n.r === 'wrong') && n.off !== null).map((n) => n.off as number);
  const sortedOffs = [...offs].sort((a, b) => a - b);
  const timing = {
    n: offs.length,
    medianMs: offs.length ? round1(median(offs) as number) : null,
    meanMs: offs.length ? round1(offs.reduce((a, b) => a + b, 0) / offs.length) : null,
    p10Ms: offs.length ? round1(quantile(sortedOffs, 0.1)) : null,
    p90Ms: offs.length ? round1(quantile(sortedOffs, 0.9)) : null,
    early: offs.filter((o) => o < -opts.onTimeMs).length,
    late: offs.filter((o) => o > opts.onTimeMs).length,
  };

  // Nốt sai cao độ: phím đánh trùng nốt của mốc phách liền trước / liền sau → lệch nhịp, khớp nhầm ô.
  const onsets = [...new Set(notes.map((n) => n.b))].sort((a, b) => a - b);
  const midisAt = new Map<number, number[]>();
  for (const n of notes) midisAt.set(n.b, [...(midisAt.get(n.b) ?? []), n.m]);
  const wrong = { neighbor: 0, octave: 0, semitone: 0, step: 0, other: 0 };
  for (const n of notes) {
    if (n.r !== 'wrong' || n.pm === null) continue;
    const k = onsets.indexOf(n.b);
    const neighbors = [onsets[k - 1], onsets[k + 1]].flatMap((b) => (b === undefined ? [] : (midisAt.get(b) ?? [])));
    const diff = n.pm - n.m;
    if (neighbors.includes(n.pm)) wrong.neighbor++;
    else if (diff !== 0 && diff % 12 === 0) wrong.octave++;
    else if (Math.abs(diff) === 1) wrong.semitone++;
    else if (Math.abs(diff) === 2) wrong.step++;
    else wrong.other++;
  }

  // Nốt lỡ: có sự kiện cùng phím quanh đó không, và nó đã đi đâu.
  const missed = { noInput: 0, dropped: 0, ignored: 0, extra: 0, other: 0 };
  for (const n of notes) {
    if (n.r !== 'skipped' && n.r !== 'pending') continue;
    const around = relevant.filter((e) => samePitch(e.m, n.m) && near(e, n));
    if (!around.length) missed.noInput++;
    else if (around.some((e) => e.out === 'extra')) missed.extra++;
    else if (around.some((e) => e.out === 'dropped')) missed.dropped++;
    else if (around.some((e) => e.out === 'ignored')) missed.ignored++;
    else missed.other++;
  }

  // Gõ thừa: cùng phím với một nốt gần đó (đánh lệch quá cửa sổ) hay lạc hẳn.
  const extras = { nearNote: 0, stray: 0 };
  for (const e of events) {
    if (e.out !== 'extra') continue;
    if (notes.some((n) => samePitch(e.m, n.m) && near(e, n))) extras.nearNote++;
    else extras.stray++;
  }

  const lagMs: Partial<Record<LogInputSource, number>> = {};
  for (const src of ['mic', 'midi', 'virtual'] as const) {
    const lags = events.filter((e) => e.src === src).map((e) => e.lag);
    if (lags.length) lagMs[src] = round1(median(lags) as number);
  }

  const R = HINT_RULES;
  const wrongTotal = wrong.neighbor + wrong.octave + wrong.semitone + wrong.step + wrong.other;
  const droppedTotal = relevant.filter((e) => e.out === 'dropped').length;
  const hints: string[] = [];
  if (lagMs.midi !== undefined && Math.abs(lagMs.midi) > R.clockSkewMs) hints.push('clock-skew');
  if (timing.n >= R.minCount && timing.medianMs !== null && timing.medianMs > R.biasMs) hints.push('late');
  if (timing.n >= R.minCount && timing.medianMs !== null && timing.medianMs < -R.biasMs) hints.push('early');
  if (wrong.neighbor >= R.minCount && wrong.neighbor >= R.share * wrongTotal) hints.push('misaligned');
  if (wrong.octave >= R.minCount && wrong.octave >= R.share * wrongTotal) hints.push('octave');
  if (droppedTotal >= R.minCount) hints.push('dropped');
  if (ignored >= R.minCount) hints.push('ignored');
  if (notes.length >= 4 && missed.noInput >= 0.5 * notes.length) hints.push('no-input');
  if (extras.nearNote >= R.minCount) hints.push('extras-near');

  return { inputs: { total: events.length, bySource, graded, extra, ignored, dropped }, timing, wrong, missed, extras, lagMs, hints };
}

const SOURCE_LABEL: Record<LogInputSource, string> = { mic: 'micro', midi: 'đàn MIDI', virtual: 'bàn phím ảo' };
const HAND_LABEL = { both: 'hai tay', right: 'tay phải', left: 'tay trái' } as const;
const END_LABEL = { finished: 'hết bài', restart: 'chơi lại giữa chừng', left: 'bỏ dở' } as const;

const signed = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x)}`;

/** Nghi vấn kèm số liệu, để đọc nhanh trong summary.log. */
export function hintText(code: string, d: Diagnosis, notes: number): string {
  switch (code) {
    case 'clock-skew':
      return `mốc đàn MIDI lệch ${signed(d.lagMs.midi ?? 0)} ms so với đồng hồ trang`;
    case 'late':
      return `trễ đều ~${Math.round(d.timing.medianMs ?? 0)} ms`;
    case 'early':
      return `sớm đều ~${Math.round(-(d.timing.medianMs ?? 0))} ms`;
    case 'misaligned': {
      const total = Object.values(d.wrong).reduce((a, b) => a + b, 0);
      return `${d.wrong.neighbor}/${total} nốt sai là nốt kề (lệch nhịp)`;
    }
    case 'octave':
      return `${d.wrong.octave} nốt sai quãng tám`;
    case 'dropped': {
      // Micro nghe tiếng đàn MIDI bị bỏ là bình thường → không kể vào nghi vấn khi lượt có nốt MIDI.
      const counted = Object.entries(d.inputs.dropped).filter(([k]) => !(k === 'mic-while-midi' && (d.inputs.bySource.midi ?? 0) > 0));
      const total = counted.reduce((a, [, v]) => a + v, 0);
      const why = counted
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', ');
      return `${total} nốt bị bỏ trước khi chấm (${why})`;
    }
    case 'ignored':
      return `${d.inputs.ignored} nốt bị chống lặp`;
    case 'no-input':
      return `${d.missed.noInput}/${notes} nốt không có tín hiệu`;
    case 'extras-near':
      return `${d.extras.nearNote} lần đúng phím nhưng ngoài cửa sổ chấm`;
    default:
      return HINT_LABELS[code] ?? code;
  }
}

/** Nguồn nốt chính của lượt (nhiều sự kiện nhất). */
export function mainSource(d: Diagnosis): LogInputSource | null {
  const entries = Object.entries(d.inputs.bySource) as [LogInputSource, number][];
  if (!entries.length) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Một dòng tóm tắt tiếng Việt của lượt Biểu diễn. */
export function summarize(e: Omit<PerformEntry, 'summary'>): string {
  const d = e.diagnosis;
  const r = e.result;
  const src = mainSource(d);
  // Tay theo chính các nốt được chấm (bài một tay vẫn có lựa chọn "hai tay" mặc định).
  const hands = new Set(e.notes.map((n) => n.h).filter((h) => h !== undefined));
  const hand = hands.size === 2 ? HAND_LABEL.both : hands.has('left') ? HAND_LABEL.left : hands.has('right') ? HAND_LABEL.right : HAND_LABEL[e.setup.hand];
  const parts = [
    `Biểu diễn ${e.screen === 'practice' ? 'Luyện tập' : 'giáo trình'}`,
    `"${e.lesson.title}" [${e.lesson.id}${e.lesson.slice ? ` ô ${e.lesson.slice[0]}–${e.lesson.slice[1]}` : ''}]`,
    hand,
    src ? SOURCE_LABEL[src] : 'không nhận được nốt nào',
    `♩=${e.setup.bpm}`,
    `${r.notes} nốt: đúng ${r.correct}, sai ${r.wrong}, lỡ ${r.missed}, thừa ${r.extras}`,
    `điểm ${r.score}`,
    END_LABEL[e.end],
  ];
  if (d.hints.length) parts.push(`nghi: ${d.hints.map((h) => hintText(h, d, r.notes)).join('; ')}`);
  return parts.join(' · ');
}
