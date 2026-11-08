/**
 * Prompt "giáo viên piano AI" cho Coach + JSON schema của câu trả lời (Ollama `format` — structured output).
 * AI chỉ DIỄN GIẢI số liệu đã chấm: không trả điểm, không được thêm lỗi / ô nhịp / con số không có trong dữ liệu
 * (ai/verify.ts kiểm lại và bỏ câu vi phạm). Tiếng Việt trước; cấu trúc sẵn sàng cho ngôn ngữ khác (`language`).
 */
import type { ChatMessage } from '../../feedback/OllamaClient';
import type { CoachAiPayload } from './payload';

export const COACH_FEEDBACK_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' }, maxItems: 3 },
    priorities: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: { issueRef: { type: 'string' }, title: { type: 'string' }, explanation: { type: 'string' }, fix: { type: 'string' } },
        required: ['issueRef', 'title', 'explanation', 'fix'],
      },
    },
    practiceSection: {
      type: ['object', 'null'],
      properties: { fromMeasure: { type: 'integer' }, toMeasure: { type: 'integer' } },
      required: ['fromMeasure', 'toMeasure'],
    },
    practiceTempo: { type: ['integer', 'null'] },
    nextExercise: {
      type: ['object', 'null'],
      properties: { recommendationRef: { type: 'string' }, text: { type: 'string' } },
      required: ['text'],
    },
    comparison: { type: ['string', 'null'] },
  },
  required: ['summary', 'strengths', 'priorities', 'practiceSection', 'practiceTempo', 'nextExercise', 'comparison'],
} as const;

export type CoachAudience = 'kids' | 'adult';

export function buildAiMessages(payload: CoachAiPayload, audience: CoachAudience, language: 'vi' = 'vi'): ChatMessage[] {
  const kids = audience === 'kids';
  const system = [
    'Bạn là giáo viên piano người Việt, tận tâm, tích cực, nói cụ thể.',
    language === 'vi' ? 'Viết bằng tiếng Việt có dấu.' : '',
    kids
      ? 'Học viên là trẻ em: xưng "cô", gọi "con", câu ngắn, dễ hiểu, động viên; không dùng thuật ngữ khó.'
      : 'Học viên là thiếu niên / người lớn: xưng "tôi", gọi "bạn", giọng thân thiện, chuyên môn vừa phải.',
    'Dữ liệu là KẾT QUẢ ĐÃ CHẤM bằng thuật toán (JSON). Nhiệm vụ: diễn giải, KHÔNG chấm lại, KHÔNG nêu điểm khác với dữ liệu.',
    'Chỉ nhắc tới lỗi, ô nhịp, tên nốt và con số CÓ TRONG dữ liệu. Không bịa thêm lỗi, vị trí, số liệu hay lịch sử.',
    'Tiêu chí có percent = null là "không đo" — không nhận xét về tiêu chí đó.',
    'Không nhận xét ngón tay, âm sắc hay cảm xúc: app không đo được các thứ đó.',
    'tempo.metronome (nếu có) = so với tiếng click đã bù độ trễ máy: verdict "behind" = đánh SAU tiếng click, "ahead" = TRƯỚC, "with" = khớp, "unsteady" = không bám; deviationMs = độ lệch (ms). Chỉ là thông tin, không phải lỗi bị trừ điểm. Không có trường này thì không nói về việc bám metronome.',
    'Trả về DUY NHẤT một đối tượng JSON đúng schema:',
    '- summary: 2–3 câu nhận xét tổng quan.',
    '- strengths: 1–3 điểm làm tốt (dựa vào tiêu chí có phần trăm cao).',
    '- priorities: tối đa 3 lỗi cần ưu tiên; issueRef PHẢI là một mã "ref" trong mảng issues (vd "I3"); explanation = giải thích dễ hiểu; fix = cách sửa cụ thể.',
    '- practiceSection: đoạn ô nên luyện riêng (chọn trong measuresToReview / recommendations), hoặc null.',
    '- practiceTempo: tempo luyện lại (♩/phút, số nguyên, không quá lesson.targetBpm), hoặc null.',
    '- nextExercise: bài tập tiếp theo; recommendationRef là mã "ref" trong recommendations (vd "R1").',
    '- comparison: so với lần trước CHỈ khi có trường history, không thì null.',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: `Kết quả chấm:\n${JSON.stringify(payload)}` },
  ];
}
