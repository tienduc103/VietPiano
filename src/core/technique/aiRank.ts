/**
 * Đề xuất hôm nay — Tầng 2: AI cục bộ (Ollama qua `AiProvider` của Coach) CHỈ được sắp xếp lại và viết lại lý do cho
 * ĐÚNG các bài tầng luật đã chọn. Không thêm / đổi bài, không đổi tempo, không bịa số liệu: câu trả lời coi là dữ liệu không tin cậy
 * → kiểm schema + xác minh; sai → giữ nguyên tầng luật. Không gửi tên học viên, không gửi log MIDI (đặc tả §20, §31).
 */
import type { AiProvider } from '../coach/ai/provider';
import { parseFeedbackJson } from '../coach/ai/verify';
import { SLOT_LABEL, type TodayPlan } from './recommend';
import { SKILL_LABEL } from './types';

export interface RankPayload {
  audience: 'kids' | 'adult';
  ageGroup: string | null;
  level: number;
  items: { ref: string; slot: string; title: string; skills: string[]; minutes: number; bpm: number; reason: string }[];
}

export const AI_RANK_SCHEMA = {
  type: 'object',
  properties: {
    order: { type: 'array', items: { type: 'string' } },
    reasons: { type: 'array', items: { type: 'object', properties: { ref: { type: 'string' }, text: { type: 'string' } }, required: ['ref', 'text'] } },
  },
  required: ['order', 'reasons'],
};

export function buildRankPayload(plan: TodayPlan, audience: 'kids' | 'adult', ageGroup: string | null): RankPayload {
  return {
    audience,
    ageGroup,
    level: plan.level,
    items: plan.items.map((it, i) => ({
      ref: `T${i + 1}`,
      slot: SLOT_LABEL[it.slot],
      title: it.title,
      skills: it.targetSkills.map((s) => SKILL_LABEL[s]),
      minutes: it.minutes,
      bpm: it.bpm,
      reason: it.reason,
    })),
  };
}

export function buildRankMessages(p: RankPayload): { role: 'system' | 'user'; content: string }[] {
  const tone = p.audience === 'kids' ? 'Viết cho trẻ nhỏ: câu rất ngắn, vui, khích lệ.' : 'Viết cho người lớn: ngắn gọn, cụ thể.';
  return [
    {
      role: 'system',
      content:
        'Bạn là trợ lý luyện piano trong ứng dụng VietPiano. Bạn nhận danh sách bài luyện hôm nay ĐÃ ĐƯỢC CHỌN theo luật (có mã T1, T2…). ' +
        'Nhiệm vụ: (1) sắp xếp lại thứ tự nếu hợp lý — bài Khởi động luôn đứng đầu; (2) viết lại lý do mỗi bài bằng tiếng Việt, tối đa 2 câu. ' +
        'CHỈ dùng thông tin có trong dữ liệu. KHÔNG thêm bài mới, KHÔNG đổi tempo / thời lượng, KHÔNG thêm con số không có trong lý do gốc, ' +
        'KHÔNG nói về ngón tay thực tế, tư thế, lực cơ (app không đo được). ' +
        tone +
        ' Trả về JSON đúng dạng {"order":["T1",...],"reasons":[{"ref":"T1","text":"..."}]}.',
    },
    { role: 'user', content: JSON.stringify(p) },
  ];
}

function numbers(s: string): Set<string> {
  return new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => x.replace(',', '.')));
}

export interface RankVerification {
  order: string[] | null;
  reasons: Record<string, string>;
  removed: string[];
}

/** Xác minh câu trả lời của AI so với payload. Thuần. */
export function verifyRank(raw: unknown, p: RankPayload): RankVerification {
  const refs = p.items.map((i) => i.ref);
  const out: RankVerification = { order: null, reasons: {}, removed: [] };
  if (!raw || typeof raw !== 'object') {
    out.removed.push('không phải JSON đối tượng');
    return out;
  }
  const r = raw as { order?: unknown; reasons?: unknown };
  if (Array.isArray(r.order)) {
    const o = r.order.filter((x): x is string => typeof x === 'string');
    const isPerm = o.length === refs.length && new Set(o).size === refs.length && o.every((x) => refs.includes(x));
    const warmFirst = p.items[0]?.slot !== SLOT_LABEL.warmup || o[0] === refs[0];
    if (isPerm && warmFirst) out.order = o;
    else out.removed.push(`thứ tự không hợp lệ: ${o.join(',')}`);
  }
  if (Array.isArray(r.reasons)) {
    for (const x of r.reasons) {
      if (!x || typeof x !== 'object') continue;
      const { ref, text } = x as { ref?: unknown; text?: unknown };
      if (typeof ref !== 'string' || typeof text !== 'string') continue;
      const item = p.items.find((i) => i.ref === ref);
      if (!item) {
        out.removed.push(`mã lạ ${ref}`);
        continue;
      }
      const t = text.trim().replace(/\s+/g, ' ');
      const allowed = new Set([...numbers(item.reason), ...numbers(item.title), String(item.bpm), String(item.minutes)]);
      const bad = [...numbers(t)].filter((n) => !allowed.has(n));
      if (t.length < 8 || t.length > 260 || /[<>]/.test(t)) out.removed.push(`${ref}: độ dài / ký tự không hợp lệ`);
      else if (bad.length) out.removed.push(`${ref}: số liệu không có trong dữ liệu (${bad.join(', ')})`);
      else out.reasons[ref] = t;
    }
  }
  return out;
}

export interface RankedPlan {
  plan: TodayPlan;
  source: 'ai' | 'rules';
  error?: string;
  removed: string[];
}

/** Áp kết quả AI đã xác minh vào kế hoạch (giữ nguyên bài, tempo, thời lượng). */
export function applyRank(plan: TodayPlan, p: RankPayload, v: RankVerification): TodayPlan {
  const withReasons = plan.items.map((it, i) => (v.reasons[p.items[i].ref] ? { ...it, reason: v.reasons[p.items[i].ref] } : it));
  if (!v.order) return { ...plan, items: withReasons };
  return { ...plan, items: v.order.map((ref) => withReasons[p.items.findIndex((x) => x.ref === ref)]) };
}

export async function aiRankToday(
  plan: TodayPlan,
  provider: AiProvider | null,
  opts: { audience: 'kids' | 'adult'; ageGroup: string | null; timeoutMs?: number; signal?: AbortSignal },
): Promise<RankedPlan> {
  if (!provider || plan.items.length < 2 || plan.fatigue) return { plan, source: 'rules', removed: [] };
  const payload = buildRankPayload(plan, opts.audience, opts.ageGroup);
  try {
    const text = await provider.chatJson({ messages: buildRankMessages(payload), schema: AI_RANK_SCHEMA, signal: opts.signal, timeoutMs: opts.timeoutMs ?? 30_000 });
    const v = verifyRank(parseFeedbackJson(text), payload);
    if (!v.order && !Object.keys(v.reasons).length) return { plan, source: 'rules', error: 'AI trả lời không dùng được', removed: v.removed };
    return { plan: applyRank(plan, payload, v), source: 'ai', removed: v.removed };
  } catch (e) {
    return { plan, source: 'rules', error: e instanceof Error ? e.message : String(e), removed: [] };
  }
}
