/**
 * Điểm mở rộng AI cục bộ cho Lối tắt thông minh (P8 — TUỲ CHỌN, chưa nối Ollama trong bản này).
 *
 * AI chỉ được SẮP XẾP LẠI và VIẾT LẠI LÝ DO cho các đề xuất ĐÃ qua bộ lọc của engine:
 * - không thêm đích mới, không đổi đích, không mở khoá bài, không đụng lối tắt thủ công (AI không nhận / trả đích nào);
 * - câu trả lời là dữ liệu không tin cậy: kiểm tra dạng, chỉ nhận khoá đã biết; lý do mới phải bám số liệu (mọi con số
 *   trong câu phải có trong lý do / tên gốc), không chứa đường dẫn hay thẻ HTML;
 * - lỗi / quá giờ / không có AI → giữ nguyên thứ tự theo quy tắc (rule-based luôn chạy được một mình);
 * - chỉ gửi số liệu tóm tắt dạng chữ của các đề xuất + nhóm tuổi: không tên học viên, không âm thanh, không log MIDI.
 * Không gọi trên đường xử lý nốt MIDI / điều hướng: nơi gọi chạy sau khi đã có danh sách theo quy tắc.
 */
import { ageGroup, type AgeGroup, type LearnerProfile } from '../../profile/LearnerProfile';
import type { SmartCandidate, SmartEvidence, SmartType } from './types';

export interface SmartAiRequest {
  ageGroup: AgeGroup | null;
  candidates: { key: string; type: SmartType; label: string; reason: string; evidence: SmartEvidence }[];
}

/** Bộ chuyển đổi tới một AI cục bộ (vd Ollama) — trả về JSON thô `{ order?: string[], reasons?: { [key]: string } }`. */
export interface SmartAiAdapter {
  rank(request: SmartAiRequest, signal: AbortSignal): Promise<unknown>;
}

export const AI_TIMEOUT_MS = 4000;
export const AI_REASON_MAX = 140;

export function buildAiRequest(candidates: readonly SmartCandidate[], profile: Pick<LearnerProfile, 'age'> | null): SmartAiRequest {
  return {
    ageGroup: profile ? ageGroup(profile.age) : null,
    candidates: candidates.map((c) => ({ key: c.candidateKey, type: c.type, label: c.label, reason: c.reason, evidence: c.evidence })),
  };
}

const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

/** Lý do AI viết lại: chữ thường, ngắn, không link / HTML, không bịa số. */
function acceptableReason(next: unknown, original: SmartCandidate): next is string {
  if (typeof next !== 'string') return false;
  const s = next.trim();
  if (!s || s.length > AI_REASON_MAX || /[<>]|https?:|www\./i.test(s)) return false;
  const known = new Set([...numbersIn(original.reason), ...numbersIn(original.label)]);
  return numbersIn(s).every((n) => known.has(n));
}

export interface AiApplyResult {
  candidates: SmartCandidate[];
  applied: boolean;
  /** Phần câu trả lời bị bỏ (khoá lạ, lý do không hợp lệ…) — để ghi log, không hiện cho người học. */
  rejected: string[];
}

/** Áp kết quả AI lên danh sách đã lọc; mọi thứ không hợp lệ bị bỏ qua, phần thiếu giữ thứ tự quy tắc. */
export function applyAiRanking(candidates: readonly SmartCandidate[], raw: unknown): AiApplyResult {
  const rejected: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { candidates: [...candidates], applied: false, rejected: ['response'] };
  const r = raw as { order?: unknown; reasons?: unknown };
  const byKey = new Map(candidates.map((c) => [c.candidateKey, c]));

  const ordered: SmartCandidate[] = [];
  const seen = new Set<string>();
  if (Array.isArray(r.order)) {
    for (const k of r.order) {
      if (typeof k !== 'string' || !byKey.has(k)) {
        rejected.push(`order:${String(k).slice(0, 60)}`);
        continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      ordered.push(byKey.get(k)!);
    }
  } else if (r.order !== undefined) rejected.push('order');
  for (const c of candidates) if (!seen.has(c.candidateKey)) ordered.push(c);

  let changedReason = false;
  const reasons = r.reasons && typeof r.reasons === 'object' && !Array.isArray(r.reasons) ? (r.reasons as Record<string, unknown>) : {};
  if (r.reasons !== undefined && reasons !== r.reasons) rejected.push('reasons');
  const out = ordered.map((c) => {
    if (!(c.candidateKey in reasons)) return c;
    const next = reasons[c.candidateKey];
    if (!acceptableReason(next, c)) {
      rejected.push(`reason:${c.candidateKey}`);
      return c;
    }
    changedReason = true;
    return { ...c, reason: next.trim() };
  });
  for (const k of Object.keys(reasons)) if (!byKey.has(k)) rejected.push(`reason:${k.slice(0, 60)}`);

  const reordered = out.some((c, i) => c.candidateKey !== candidates[i]?.candidateKey);
  return { candidates: out, applied: reordered || changedReason, rejected };
}

export interface AiRankOutcome {
  candidates: SmartCandidate[];
  source: 'rules' | 'ai';
  rejected: string[];
  error?: string;
}

/** Hỏi AI (nếu có) trong giới hạn thời gian; mọi lỗi → giữ danh sách theo quy tắc. */
export async function rankWithAi(
  candidates: readonly SmartCandidate[],
  adapter: SmartAiAdapter | null,
  profile: Pick<LearnerProfile, 'age'> | null,
  timeoutMs = AI_TIMEOUT_MS,
): Promise<AiRankOutcome> {
  const rules: AiRankOutcome = { candidates: [...candidates], source: 'rules', rejected: [] };
  if (!adapter || candidates.length < 2) return rules;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Báo quá giờ TRƯỚC khi huỷ: câu trả lời đến đúng lúc huỷ không được thắng cuộc đua.
        reject(new Error('timeout'));
        controller.abort();
      }, timeoutMs);
    });
    const raw = await Promise.race([adapter.rank(buildAiRequest(candidates, profile), controller.signal), timeout]);
    if (controller.signal.aborted) throw new Error('timeout');
    const applied = applyAiRanking(candidates, raw);
    return applied.applied ? { candidates: applied.candidates, source: 'ai', rejected: applied.rejected } : { ...rules, rejected: applied.rejected };
  } catch (err) {
    return { ...rules, error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
