/**
 * Tham số theo chế độ chấm (docs/ai-coach/architecture.md §7). Thay đổi bất kỳ hằng số nào ở đây → tăng WEIGHTS_VERSION / SCORING_ENGINE_VERSION
 * để kết quả cũ vẫn truy được công thức đã dùng.
 *
 *  A · technical   : 40 / 25 / 15 / 10 / 10 (theo đặc tả), dung sai chặt.
 *  B · performance : 30 / 30 / 10 / 10 / 20 — ổn định nhịp, liên tục, tương quan lực đánh; chấp nhận tempo co giãn có chủ ý.
 *  C · progress    : chấm như A, thêm báo cáo tiến bộ so với lịch sử (core/coach/progress).
 */
import type { CoachMode, CriterionKey } from '../types';

export interface ModeParams {
  weights: Record<CriterionKey, number>;
  rhythm: { timing: number; tempo: number; stability: number; continuity: number; sync: number };
  dynamics: { contrast: number; hairpin: number; evenness: number; balance: number };
  /** Dung sai thời điểm = tỉ lệ × độ dài phách, kẹp trong [min, max] ms; 0 điểm ở 3 × dung sai. */
  timingTolRatio: number;
  timingTolMinMs: number;
  timingTolMaxMs: number;
  /** Cửa sổ tempo cục bộ (số ô mỗi bên) khi đo lệch thời điểm. */
  localWindowMeasures: number;
  /** Tempo so mục tiêu: trọn điểm trong ±tol, 0 điểm ở ±zero. */
  tempoTol: number;
  tempoZero: number;
  /** Độ ổn định tempo giữa các ô (hệ số biến thiên): trọn điểm ≤ full, 0 điểm ≥ zero. */
  stabilityFull: number;
  stabilityZero: number;
}

const TECHNICAL: ModeParams = {
  weights: { notes: 40, rhythm: 25, duration: 15, pedal: 10, dynamics: 10 },
  rhythm: { timing: 0.5, tempo: 0.15, stability: 0.15, continuity: 0.1, sync: 0.1 },
  dynamics: { contrast: 0.4, hairpin: 0.15, evenness: 0.3, balance: 0.15 },
  timingTolRatio: 0.1,
  timingTolMinMs: 50,
  timingTolMaxMs: 120,
  localWindowMeasures: 1,
  tempoTol: 0.08,
  tempoZero: 0.4,
  stabilityFull: 0.06,
  stabilityZero: 0.3,
};

const PERFORMANCE: ModeParams = {
  weights: { notes: 30, rhythm: 30, duration: 10, pedal: 10, dynamics: 20 },
  rhythm: { timing: 0.3, tempo: 0.1, stability: 0.25, continuity: 0.2, sync: 0.15 },
  dynamics: { contrast: 0.45, hairpin: 0.2, evenness: 0.15, balance: 0.2 },
  timingTolRatio: 0.15,
  timingTolMinMs: 75,
  timingTolMaxMs: 180,
  localWindowMeasures: 2,
  tempoTol: 0.2,
  tempoZero: 0.6,
  stabilityFull: 0.12,
  stabilityZero: 0.4,
};

export const MODE_PARAMS: Record<CoachMode, ModeParams> = {
  technical: TECHNICAL,
  performance: PERFORMANCE,
  progress: TECHNICAL,
};

/** Trọng số tuỳ biến (giáo trình / mục tiêu bài) đè lên trọng số của chế độ; giá trị âm / không hợp lệ bị bỏ. */
export function modeParams(mode: CoachMode, weights?: Partial<Record<CriterionKey, number>>): ModeParams {
  const base = MODE_PARAMS[mode];
  if (!weights) return base;
  const w = { ...base.weights };
  for (const [k, v] of Object.entries(weights) as [CriterionKey, number][]) if (k in w && Number.isFinite(v) && v >= 0) w[k] = v;
  return { ...base, weights: w };
}

/** Hai tay cùng phách lệch tối đa bấy nhiêu ms vẫn đồng bộ (= SYNC_MS của chế độ Biểu diễn). */
export const HANDS_SYNC_MS = 80;
/** Các nốt một hợp âm (cùng tay) lệch tối đa bấy nhiêu ms vẫn tính là cùng lúc. */
export const CHORD_SYNC_MS = 60;
/** Ngắt quãng: khoảng giữa hai nhóm > max(2 × kỳ vọng, kỳ vọng + 700 ms). */
export const HESITATION_RATIO = 2;
export const HESITATION_EXTRA_MS = 700;
/** Mỗi chỗ ngắt trừ chừng này điểm con "liên tục". */
export const HESITATION_PENALTY = 0.34;
/** Đánh lặp: cùng phím trong max(250 ms, ½ phách) sau nốt đã khớp. */
export const REPEAT_MIN_MS = 250;
export const REPEAT_BEAT_FRACTION = 0.5;
/** Nốt thừa đánh cùng lúc với một nhóm đã khớp (≤ ms). */
export const SIMULTANEOUS_MS = 70;
/** Sắc thái: đều lực trọn điểm ≤ 2.5 dB độ lệch chuẩn, 0 điểm ≥ 7 dB; cân bằng bè trọn điểm ≥ +1 dB, 0 điểm ≤ −3 dB. */
export const EVENNESS_FULL_DB = 2.5;
export const EVENNESS_ZERO_DB = 7;
export const BALANCE_FULL_DB = 1;
export const BALANCE_ZERO_DB = -3;
/** Cresc. / dim.: đổi ≥ 3 dB qua cả hình nêm là trọn điểm (cùng FULL_STEP_DB của sắc thái). */
export const HAIRPIN_FULL_DB = 3;
