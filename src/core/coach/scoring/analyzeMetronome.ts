/**
 * So nốt với tiếng metronome (M1-T7) — THÔNG TIN, không trừ điểm (rubric giữ nguyên).
 *
 * Chấm nhịp của Coach là TƯƠNG ĐỐI (tempo cục bộ của chính người chơi) nên độ trễ cố định của máy không làm sai điểm, nhưng
 * cũng không thấy được việc "đánh sau tiếng click". Khi lúc ghi có bật metronome VÀ máy đã đo độ trễ, mỗi nhóm nốt đúng được
 * so với mốc kỳ vọng gần nhất trên lưới tiếng click: click + phần lẻ phách × độ dài phách (phần lẻ không đổi khi tạm dừng rồi
 * metronome bắt đầu lại). Nốt đã được bù độ trễ máy (`latencyMs`) trong `buildPerformance`; tiếng click là mốc lên lịch.
 * Kết luận: trung vị độ lệch (dương = sau tiếng click) + độ dao động (1,4826 × MAD).
 */
import { median } from '../latency/calibration';
import type { LatencyCalibration, MetronomeCheck } from '../types';
import type { AnalysisContext } from './context';

/** Ít hơn số nhóm nốt đúng này → không kết luận. */
export const METRONOME_MIN_GROUPS = 8;
/** |trung vị| ≤ mức này → "khớp metronome" (ngưỡng nghe ra lệch ≈ 30–40 ms). */
export const METRONOME_WITH_MS = 35;
/** Dao động lớn hơn max(60 ms, 15% phách) → "không bám metronome" (thường do tempo khác tiếng click). */
const UNSTEADY_MIN_MS = 60;
const UNSTEADY_RATIO = 0.15;

export interface MetronomeInput {
  /** Lúc ghi có bật metronome. */
  metronome: boolean;
  latencyMs: number;
  calibration: LatencyCalibration | null;
  outputChanged: boolean;
}

/** Không bật metronome → undefined (không nói gì). */
export function analyzeMetronome(ctx: AnalysisContext, input: MetronomeInput): MetronomeCheck | undefined {
  if (!input.metronome) return undefined;
  if (!input.calibration) return { status: 'not-calibrated' };
  const clicks = ctx.perf.clicks;
  const beatMs = 60000 / ctx.ref.targetBpm;
  const residuals: number[] = [];
  if (clicks.length >= 2 && Number.isFinite(beatMs) && beatMs > 0) {
    for (const g of ctx.ref.groups) {
      // Mốc của nhóm = nốt khớp ĐÚNG sớm nhất (hợp âm rải / hai tay lệch nhẹ không làm lệch kết luận).
      let on = Infinity;
      for (const i of g.notes) {
        const p = ctx.perfOf[i];
        if (ctx.status[i] !== 'correct' || p === null) continue;
        on = Math.min(on, ctx.perf.notes[p].onMs);
      }
      if (!Number.isFinite(on)) continue;
      const frac = (g.onsetBeat - Math.floor(g.onsetBeat + 1e-9)) * beatMs;
      let best = Infinity;
      for (const c of clicks) {
        const d = on - (c + frac);
        if (Math.abs(d) < Math.abs(best)) best = d;
      }
      if (Math.abs(best) <= beatMs / 2) residuals.push(best);
    }
  }
  if (residuals.length < METRONOME_MIN_GROUPS) return { status: 'too-few', groups: residuals.length };
  const center = median(residuals);
  const spread = 1.4826 * median(residuals.map((r) => Math.abs(r - center)));
  const verdict = spread > Math.max(UNSTEADY_MIN_MS, UNSTEADY_RATIO * beatMs) ? 'unsteady' : Math.abs(center) <= METRONOME_WITH_MS ? 'with' : center > 0 ? 'behind' : 'ahead';
  return {
    status: 'ok',
    offsetMs: Math.round(center),
    spreadMs: Math.round(spread),
    groups: residuals.length,
    verdict,
    latencyMs: Math.round(input.latencyMs),
    ...(input.outputChanged ? { outputChanged: true } : {}),
  };
}

/** Câu mô tả (giao diện, giải thích, nhận xét theo quy tắc). */
export function metronomeText(m: MetronomeCheck): string {
  switch (m.status) {
    case 'not-calibrated':
      return 'Có bật metronome nhưng máy chưa đo độ trễ cho thiết bị này — chưa so nốt với tiếng click (đo ở màn chuẩn bị).';
    case 'too-few':
      return `Có bật metronome nhưng chỉ có ${m.groups} nhóm nốt đúng để so — chưa đủ kết luận về việc bám tiếng click.`;
    case 'ok': {
      const what =
        m.verdict === 'with'
          ? `khớp tiếng metronome (lệch trung bình ${Math.abs(m.offsetMs)} ms)`
          : m.verdict === 'behind'
            ? `thường đánh SAU tiếng metronome khoảng ${m.offsetMs} ms`
            : m.verdict === 'ahead'
              ? `thường đánh TRƯỚC tiếng metronome khoảng ${-m.offsetMs} ms`
              : `không bám tiếng metronome (lệch thất thường ±${m.spreadMs} ms — thường do tempo khác tiếng click)`;
      return `So với metronome (đã bù độ trễ máy ${m.latencyMs} ms): ${what}.`;
    }
  }
}
