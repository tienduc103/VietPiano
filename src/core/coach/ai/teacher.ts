/**
 * Local AI Teaching Engine: kết quả chấm → nhận xét có cấu trúc. Luồng: payload tóm tắt → AI cục bộ (timeout, retry có giới hạn)
 * → tách JSON + kiểm schema → xác minh với số liệu → dùng; mọi thất bại (tắt AI, mất kết nối, JSON hỏng, hết giờ) → nhận xét
 * theo quy tắc. Không bao giờ chặn luồng học, không bao giờ đổi điểm số.
 */
import type { AIFeedback, ScoringResult } from '../types';
import { ruleBasedFeedback } from './fallback';
import type { CoachAiPayload } from './payload';
import { buildAiMessages, COACH_FEEDBACK_SCHEMA, type CoachAudience } from './prompt';
import { AiTimeoutError, type AiProvider } from './provider';
import { coerceFeedback, parseFeedbackJson, verifyFeedback } from './verify';

export interface FeedbackRequest {
  provider: AiProvider | null;
  payload: CoachAiPayload;
  result: ScoringResult;
  audience: CoachAudience;
  timeoutMs: number;
  /** Số lần thử lại khi lỗi (0–3). */
  retries: number;
  signal?: AbortSignal;
  now?: () => number;
  id: string;
}

export const MAX_RETRIES = 3;

export async function requestCoachFeedback(req: FeedbackRequest): Promise<AIFeedback> {
  const now = req.now ?? Date.now;
  const fallback = ruleBasedFeedback(req.result, req.payload, req.audience);
  const base = { id: req.id, resultId: req.result.id, sessionId: req.result.sessionId, profileKey: req.result.profileKey };
  const rules = (error?: string): AIFeedback => ({
    ...base,
    createdAt: now(),
    source: 'rules',
    content: fallback,
    verification: { ok: true, removed: [], replaced: [] },
    ...(error ? { error } : {}),
  });
  if (!req.provider) return rules();

  const messages = buildAiMessages(req.payload, req.audience);
  const tries = 1 + Math.max(0, Math.min(MAX_RETRIES, Math.round(req.retries)));
  let lastError = '';
  for (let i = 0; i < tries; i++) {
    if (req.signal?.aborted) return rules('Đã huỷ');
    const t0 = now();
    try {
      const text = await req.provider.chatJson({ messages, schema: COACH_FEEDBACK_SCHEMA, signal: req.signal, timeoutMs: req.timeoutMs });
      const parsed = coerceFeedback(parseFeedbackJson(text));
      if (!parsed) {
        lastError = 'AI trả lời không đúng định dạng JSON';
        continue;
      }
      const v = verifyFeedback(parsed, req.payload, fallback);
      return {
        ...base,
        createdAt: now(),
        source: 'ai',
        provider: req.provider.id,
        model: req.provider.model,
        latencyMs: Math.round(now() - t0),
        content: v.content,
        verification: { ok: v.ok, removed: v.removed, replaced: v.replaced },
      };
    } catch (e) {
      const kind = (e as { kind?: string }).kind;
      if (kind === 'aborted') return rules('Đã huỷ');
      lastError = e instanceof AiTimeoutError ? e.message : e instanceof Error ? e.message : String(e);
      // Không kết nối được thì thử lại cũng vô ích.
      if (kind === 'network') break;
    }
  }
  return rules(lastError || 'AI không trả lời');
}
