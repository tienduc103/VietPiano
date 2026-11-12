/**
 * AI cục bộ (Ollama) cho bài "Khám phá âm thanh" — CHỈ vai trò sư phạm: tổng hợp, động viên, gợi ý cho phụ huynh.
 *
 * - Kết quả đúng / sai, kỹ năng yếu, đề xuất hoạt động đều do QUY TẮC tính (`assessment.ts`); AI chỉ diễn đạt lại.
 * - Chỉ gửi số liệu tóm tắt dạng chữ (số lần thử, tỷ lệ, trạng thái) + tuổi; KHÔNG gửi tên bé, không gửi dữ liệu nốt.
 * - Câu trả lời là dữ liệu không tin cậy: kiểm tra độ dài + chặn mọi suy diễn trí tuệ / phát triển / sức khoẻ;
 *   không đạt → dùng nhận xét theo quy tắc.
 */
import type { ChatMessage } from '../feedback/OllamaClient';
import { LEVEL_LABEL } from './config';
import { assessAll, kidMessage, recommend, SKILL_LABEL, STATUS_LABEL } from './assessment';
import { ACTIVITY_TITLE } from './lesson';
import type { SoundExploreProgress } from './progress';

export function summaryForAi(p: SoundExploreProgress, age: number | null, now: number): string {
  const lines = [`Mức độ hiện tại: ${LEVEL_LABEL[p.settings.level]}.`];
  if (age !== null) lines.push(`Tuổi của bé: ${age}.`);
  const visited = Object.entries(p.visited)
    .filter(([, v]) => v)
    .map(([k]) => ACTIVITY_TITLE[k as keyof typeof ACTIVITY_TITLE]);
  lines.push(`Hoạt động đã chơi: ${visited.length ? visited.join(', ') : 'chưa có'}.`);
  for (const a of assessAll(p)) {
    const rate = a.recentRate === null ? 'chưa thử' : `${Math.round(a.recentRate * 100)}% đạt trong ${Math.min(12, a.attempts)} lần gần nhất`;
    lines.push(`- ${SKILL_LABEL[a.skill]}: ${STATUS_LABEL[a.status]} (${a.attempts} lần thử, ${rate}, nghe lại ${a.replays} lần, thử lại ${a.retries} lần, trên đàn MIDI ${a.midiAttempts} lần).`);
  }
  lines.push('Đề xuất theo quy tắc (giữ nguyên, không đổi):');
  for (const r of recommend(p, now)) lines.push(`- ${ACTIVITY_TITLE[r.suggestedActivity]}: ${r.reason}${r.parentApprovalRequired ? ' (cần phụ huynh đồng ý)' : ''}`);
  return lines.join('\n');
}

export function buildExploreMessages(p: SoundExploreProgress, age: number | null, now: number): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        'Bạn là cô giáo âm nhạc mầm non, viết tiếng Việt có dấu, giọng ấm áp.',
        'Bé 4–6 tuổi chơi bài "Khám phá âm thanh" (cao / thấp, dài / ngắn) trên đàn piano.',
        'CHỈ dựa vào số liệu được cung cấp. Không tự tính lại điểm, không bịa thêm hoạt động.',
        'TUYỆT ĐỐI không nhận xét về trí thông minh, năng khiếu, sự phát triển, tâm lý hay sức khoẻ của bé; không so sánh với trẻ khác.',
        'Kỹ năng "Chưa có đủ dữ liệu" thì nói là chưa đủ dữ liệu, không kết luận.',
        'Trả lời đúng 2 phần, mỗi phần mở đầu bằng nhãn:',
        'BÉ: một câu động viên ngắn cho bé (tối đa 25 từ, từ ngữ đơn giản).',
        'PHỤ HUYNH: 2–3 gạch đầu dòng gợi ý cách phụ huynh cùng chơi với bé tại nhà, bám theo đề xuất có sẵn.',
      ].join('\n'),
    },
    { role: 'user', content: summaryForAi(p, age, now) },
  ];
}

/** Từ ngữ suy diễn không được phép — có là bỏ cả câu trả lời. */
const FORBIDDEN = [
  /trí tuệ/i,
  /trí thông minh/i,
  /\biq\b/i,
  /thông minh/i,
  /năng khiếu/i,
  /chậm phát triển/i,
  /phát triển (chậm|kém|bất thường)/i,
  /tự kỷ/i,
  /adhd/i,
  /tăng động/i,
  /rối loạn/i,
  /khuyết tật/i,
  /bệnh/i,
  /khiếm thính/i,
  /thính lực/i,
  /chẩn đoán/i,
  /kém hơn (các )?bạn/i,
];

export interface ExploreAdvice {
  kid: string;
  parent: string;
  generatedBy: 'ai' | 'rules';
}

export function ruleAdvice(p: SoundExploreProgress, now: number): ExploreAdvice {
  return {
    kid: kidMessage(p),
    parent: recommend(p, now)
      .map((r) => `• ${ACTIVITY_TITLE[r.suggestedActivity]}: ${r.reason}`)
      .join('\n'),
    generatedBy: 'rules',
  };
}

/** Kiểm tra câu trả lời của AI; không hợp lệ → null (dùng `ruleAdvice`). */
export function parseAiAdvice(text: string): Omit<ExploreAdvice, 'generatedBy'> | null {
  const t = text.trim();
  if (!t || t.length > 1200) return null;
  if (FORBIDDEN.some((re) => re.test(t))) return null;
  const kid = /BÉ\s*:\s*([\s\S]*?)(?=PHỤ HUYNH\s*:|$)/i.exec(t)?.[1]?.trim();
  const parent = /PHỤ HUYNH\s*:\s*([\s\S]*)$/i.exec(t)?.[1]?.trim();
  if (!kid || !parent) return null;
  if (kid.split(/\s+/).length > 40) return null;
  return { kid: kid.replace(/\*+/g, ''), parent: parent.replace(/\*+/g, '') };
}
