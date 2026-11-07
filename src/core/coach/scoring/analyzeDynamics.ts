/**
 * Tiêu chí "Lực đánh & sắc thái" — chỉ khi nguồn có lực gõ (đàn MIDI: velocity → dB theo `loudnessDb`); micro chỉ có độ to
 * tương đối (RMS) → chỉ chấm tương phản giữa các đoạn; bàn phím ảo → "không đo". Không tuyên bố đo được âm sắc / cảm xúc.
 * Điểm con (trọng số theo chế độ):
 *  - contrast : đổi sắc thái p ↔ f giữa các đoạn liền kề (công thức cũ `dynamicsQuality`, 3 dB trọn điểm).
 *  - hairpin  : cresc. / dim. — xu hướng lực gõ qua hình nêm đổi ≥ 3 dB đúng chiều.
 *  - evenness : đều lực trong một đoạn (độ lệch chuẩn ≤ 2.5 dB trọn điểm, ≥ 7 dB 0 điểm) — chỉ với velocity thật.
 *  - balance  : giai điệu nổi hơn tay trái (≥ +1 dB trọn điểm, ≤ −3 dB 0 điểm) — chỉ khi chấm hai tay với velocity thật.
 * Velocity so với lực gõ mẫu của sắc thái: chỉ tham khảo (mỗi đàn một đường cong lực gõ), không trừ điểm.
 */
import { DYNAMIC_MARKS, DYNAMIC_NAMES, DYNAMIC_VELOCITY, dynamicsQuality, FULL_STEP_DB, loudnessDb } from '../../music/dynamics';
import type { RefNote, ScoringResult, SubScore } from '../types';
import { clamp01, combineSubScores, formatNumber, mean, measureLabel, std, type AnalysisContext, type CriterionOutcome, type IssueDraft } from './context';
import { BALANCE_FULL_DB, BALANCE_ZERO_DB, EVENNESS_FULL_DB, EVENNESS_ZERO_DB, HAIRPIN_FULL_DB } from './modes';
import { linearFit, median } from './tempoMap';

export interface DynamicsOutcome extends CriterionOutcome {
  info: NonNullable<ScoringResult['dynamicsInfo']>;
}

const range = (a: number, b: number) => (a === b ? measureLabel(a) : `Ô ${a}–${b}`);

export function analyzeDynamics(ctx: AnalysisContext): DynamicsOutcome {
  const { ref, perf, params } = ctx;
  const cap = ctx.capabilities;
  const info: DynamicsOutcome['info'] = { sections: [] };
  if (!cap.velocity && !cap.relativeLevel) return { value: null, subScores: [], issues: [], info, reason: 'Nguồn vào không có lực gõ (bàn phím ảo) — không đo lực đánh' };

  const loud = (r: number): number | null => {
    const p = ctx.perfOf[r];
    if (p === null) return null;
    const n = perf.notes[p];
    if (cap.velocity) return n.velocity !== null ? loudnessDb({ velocity: n.velocity }) : null;
    return n.level !== undefined ? loudnessDb({ level: n.level }) : null;
  };
  const melody = ref.notes.map((n, i) => ({ n, i })).filter(({ n }) => n.part === 'melody');
  const line = melody.length ? melody : ref.notes.map((n, i) => ({ n, i }));
  const size = Math.max(0, ...ref.notes.filter((n) => n.staff === 'melody').map((n) => n.scoreIndex + 1));
  const loudAt: (number | null)[] = Array.from({ length: size }, () => null);
  const playable: boolean[] = Array.from({ length: size }, () => false);
  for (const { n, i } of melody) {
    playable[n.scoreIndex] = true;
    loudAt[n.scoreIndex] = loud(i);
  }
  const issues: IssueDraft[] = [];
  const subs: SubScore[] = [];
  const pending: { key: string; drafts: { issue: IssueDraft; units: number }[] }[] = [];
  const measureOfIndex = (idx: number) => melody.find(({ n }) => n.scoreIndex === idx)?.n.measure ?? melody[0]?.n.measure ?? 1;

  // ── tương phản giữa các đoạn ──
  const sections = ref.dynamics;
  if (sections.length >= 2) {
    const value = dynamicsQuality(sections, loudAt, playable);
    const levels = sections.map((s) => {
      const vs: number[] = [];
      let notes = 0;
      for (let i = s.from; i < s.to && i < size; i++) {
        if (!playable[i]) continue;
        notes++;
        const v = loudAt[i];
        if (v !== null) vs.push(v);
      }
      return vs.length >= Math.min(2, notes) && vs.length > 0 ? median(vs) : null;
    });
    const changes: { i: number; q: number; diff: number }[] = [];
    for (let i = 1; i < sections.length; i++) {
      const a = levels[i - 1];
      const b = levels[i];
      const dir = Math.sign(DYNAMIC_MARKS.indexOf(sections[i].mark) - DYNAMIC_MARKS.indexOf(sections[i - 1].mark));
      if (dir === 0 || a === null || b === null) continue;
      changes.push({ i, q: clamp01((dir * (b - a)) / FULL_STEP_DB), diff: b - a });
    }
    subs.push({ key: 'contrast', label: 'Đổi sắc thái (p ↔ f)', value, weight: params.dynamics.contrast, ...(value === null ? { reason: 'Chưa đủ nốt ở các đoạn sắc thái' } : {}) });
    pending.push({
      key: 'contrast',
      drafts: changes
        .filter((c) => c.q < 1)
        .map((c) => {
          const prev = sections[c.i - 1];
          const cur = sections[c.i];
          const m = measureOfIndex(cur.from);
          const louder = DYNAMIC_MARKS.indexOf(cur.mark) > DYNAMIC_MARKS.indexOf(prev.mark);
          return {
            units: (1 - c.q) / changes.length,
            issue: {
              criterion: 'dynamics' as const,
              type: 'dynamics-contrast' as const,
              severity: c.q < 0.5 ? ('major' as const) : ('minor' as const),
              measure: m,
              refNoteIds: [],
              perfNoteIds: [],
              value: Math.round(c.diff * 10) / 10,
              criterionDeduction: 0,
              confidence: cap.velocity ? ('high' as const) : ('low' as const),
              message: `${measureLabel(m)}: đổi từ ${prev.mark} (${DYNAMIC_NAMES[prev.mark]}) sang ${cur.mark} (${DYNAMIC_NAMES[cur.mark]}) nhưng lực đánh ${louder ? 'chỉ mạnh thêm' : 'chỉ nhẹ đi'} ${formatNumber(Math.abs(Math.round(c.diff * 10) / 10))} dB (cần ≥ ${FULL_STEP_DB} dB).`,
            },
          };
        }),
    });
  }

  // ── cresc. / dim. ──
  if (ref.hairpins.length) {
    const scores: { q: number; drafts?: { issue: IssueDraft; units: number } }[] = [];
    for (const h of ref.hairpins) {
      const pts = melody.filter(({ n }) => n.scoreIndex >= h.from && n.scoreIndex <= h.to).map(({ n, i }) => ({ n, v: loud(i) })).filter((x): x is { n: RefNote; v: number } => x.v !== null);
      if (pts.length < 3) continue;
      const fit = linearFit(
        pts.map((p) => p.n.onsetBeat),
        pts.map((p) => p.v),
      );
      if (!fit) continue;
      const change = fit.b * (pts[pts.length - 1].n.onsetBeat - pts[0].n.onsetBeat);
      const sign = h.type === 'cresc' ? 1 : -1;
      const q = clamp01((sign * change) / HAIRPIN_FULL_DB);
      const from = pts[0].n.measure;
      const to = pts[pts.length - 1].n.measure;
      scores.push({
        q,
        ...(q < 1
          ? {
              drafts: {
                units: 0,
                issue: {
                  criterion: 'dynamics',
                  type: 'hairpin',
                  severity: q < 0.5 ? 'major' : 'minor',
                  measure: from,
                  toMeasure: to,
                  refNoteIds: pts.map((p) => p.n.id),
                  perfNoteIds: [],
                  value: Math.round(change * 10) / 10,
                  criterionDeduction: 0,
                  confidence: cap.velocity ? 'high' : 'low',
                  message: `${range(from, to)}: ${h.type === 'cresc' ? 'cresc. (to dần)' : 'dim. (nhỏ dần)'} nhưng lực đánh ${change >= 0 ? 'tăng' : 'giảm'} ${formatNumber(Math.abs(Math.round(change * 10) / 10))} dB (cần ${sign > 0 ? 'tăng' : 'giảm'} ≥ ${HAIRPIN_FULL_DB} dB).`,
                },
              },
            }
          : {}),
      });
    }
    const value = scores.length ? mean(scores.map((s) => s.q)) : null;
    subs.push({ key: 'hairpin', label: 'To dần / nhỏ dần', value, weight: params.dynamics.hairpin, ...(value === null ? { reason: 'Chưa đủ nốt dưới hình nêm' } : {}) });
    pending.push({ key: 'hairpin', drafts: scores.filter((s) => s.drafts).map((s) => ({ ...s.drafts!, units: (1 - s.q) / scores.length })) });
  }

  // ── đều lực (velocity thật) ──
  if (cap.velocity) {
    const inHairpin = (n: RefNote) => n.staff === 'melody' && ref.hairpins.some((h) => n.scoreIndex >= h.from && n.scoreIndex <= h.to);
    const segments = sections.length ? sections.map((s) => line.filter(({ n }) => n.staff === 'melody' && n.scoreIndex >= s.from && n.scoreIndex < s.to)) : [line];
    const segs = segments
      .map((seg) => seg.filter(({ n }) => !inHairpin(n)).map(({ n, i }) => ({ n, v: loud(i) })).filter((x): x is { n: RefNote; v: number } => x.v !== null))
      .filter((s) => s.length >= 4);
    const totalCount = segs.reduce((a, s) => a + s.length, 0);
    const evaluated = segs.map((s) => {
      const sd = std(s.map((x) => x.v));
      const q = sd <= EVENNESS_FULL_DB ? 1 : clamp01(1 - (sd - EVENNESS_FULL_DB) / (EVENNESS_ZERO_DB - EVENNESS_FULL_DB));
      return { s, sd, q };
    });
    const value = evaluated.length ? evaluated.reduce((a, e) => a + (e.q * e.s.length) / totalCount, 0) : null;
    subs.push({ key: 'evenness', label: 'Đều lực', value, weight: params.dynamics.evenness, ...(value === null ? { reason: 'Cần ít nhất 4 nốt trong một đoạn' } : {}) });
    pending.push({
      key: 'evenness',
      drafts: evaluated
        .filter((e) => e.q < 1)
        .map((e) => {
          const med = median(e.s.map((x) => x.v));
          const worst = e.s.reduce((a, b) => (Math.abs(b.v - med) > Math.abs(a.v - med) ? b : a));
          const from = e.s[0].n.measure;
          const to = e.s[e.s.length - 1].n.measure;
          return {
            units: ((1 - e.q) * e.s.length) / totalCount,
            issue: {
              criterion: 'dynamics' as const,
              type: 'velocity-uneven' as const,
              severity: e.q < 0.5 ? ('major' as const) : ('minor' as const),
              measure: worst.n.measure,
              refNoteIds: [worst.n.id],
              perfNoteIds: [],
              value: Math.round(e.sd * 10) / 10,
              criterionDeduction: 0,
              confidence: 'medium' as const,
              message: `${range(from, to)}: lực đánh giai điệu chưa đều (độ lệch ${formatNumber(Math.round(e.sd * 10) / 10)} dB), lệch nhiều nhất ở ${measureLabel(worst.n.measure).toLowerCase()}.`,
            },
          };
        }),
    });
  }

  // ── giai điệu nổi hơn tay trái ──
  if (cap.velocity && ref.twoHands) {
    const diffs: number[] = [];
    for (const g of ref.groups) {
      const mel = g.notes.find((r) => ref.notes[r].part === 'melody' && ref.notes[r].hand === 'right');
      const left = g.notes.filter((r) => ref.notes[r].hand === 'left').map(loud).filter((v): v is number => v !== null);
      const m = mel === undefined ? null : loud(mel);
      if (m !== null && left.length) diffs.push(m - mean(left));
    }
    const value = diffs.length >= 3 ? (() => {
      const d = mean(diffs);
      return d >= BALANCE_FULL_DB ? 1 : clamp01((d - BALANCE_ZERO_DB) / (BALANCE_FULL_DB - BALANCE_ZERO_DB));
    })() : null;
    subs.push({ key: 'balance', label: 'Giai điệu nổi hơn phần đệm', value, weight: params.dynamics.balance, ...(value === null ? { reason: 'Cần ít nhất 3 chỗ hai tay cùng đánh' } : {}) });
    if (value !== null && value < 1)
      pending.push({
        key: 'balance',
        drafts: [
          {
            units: 1 - value,
            issue: {
              criterion: 'dynamics',
              type: 'balance',
              severity: value < 0.5 ? 'major' : 'minor',
              measure: null,
              refNoteIds: [],
              perfNoteIds: [],
              hand: 'left',
              value: Math.round(mean(diffs) * 10) / 10,
              criterionDeduction: 0,
              confidence: 'medium',
              message: `Giai điệu (tay phải) ${mean(diffs) >= 0 ? `chỉ to hơn phần đệm ${formatNumber(Math.round(mean(diffs) * 10) / 10)} dB` : `nhỏ hơn phần đệm ${formatNumber(Math.round(-mean(diffs) * 10) / 10)} dB`} — cần nổi rõ hơn (≥ ${BALANCE_FULL_DB} dB).`,
            },
          },
        ],
      });
  }

  // Tham khảo: velocity trung vị từng đoạn so với lực gõ mẫu (không trừ điểm).
  if (cap.velocity)
    info.sections = sections.map((s) => {
      const vs = melody.filter(({ n }) => n.scoreIndex >= s.from && n.scoreIndex < s.to).map(({ i }) => ctx.perfOf[i]).filter((p): p is number => p !== null).map((p) => perf.notes[p].velocity).filter((v): v is number => v !== null);
      return { mark: s.mark, medianVelocity: vs.length ? Math.round(median(vs)) : null, targetVelocity: DYNAMIC_VELOCITY[s.mark] };
    });

  const { value, share } = combineSubScores(subs);
  if (value === null) return { value: null, subScores: subs, issues: [], info, reason: subs.length ? 'Chưa đủ nốt đo được lực đánh' : cap.velocity ? 'Chưa đủ dữ liệu lực đánh' : 'Micro chỉ đo được độ to tương đối — bài không có dấu sắc thái để so' };
  for (const p of pending) for (const d of p.drafts) issues.push({ ...d.issue, criterionDeduction: d.units * (share.get(p.key) ?? 0) });
  return { value, subScores: subs, issues, info };
}
