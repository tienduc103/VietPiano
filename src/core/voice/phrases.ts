/**
 * Câu nói mặc định của cô giáo cho bé 4–8 tuổi: ngắn (5–15 từ), một yêu cầu mỗi câu, luôn tích cực.
 * Tên nốt đọc theo Đô – Rê – Mi (không đọc số quãng tám: bé chưa cần).
 */
import type { VoiceCue } from './types';

const SOLFEGE: Record<string, string> = { C: 'Đô', D: 'Rê', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const PC_TO_PITCH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** "C4" → "Đô", "F#4" → "Fa thăng", "Bb3" → "Si giáng". Tên lạ → giữ nguyên. */
export function pitchToSpeech(pitch: string): string {
  const m = /^([A-G])([#b]?)-?\d$/.exec(pitch);
  if (!m) return pitch;
  return SOLFEGE[m[1]] + (m[2] === '#' ? ' thăng' : m[2] === 'b' ? ' giáng' : '');
}

export function midiToSpeech(midi: number): string {
  return pitchToSpeech(`${PC_TO_PITCH[((midi % 12) + 12) % 12]}4`);
}

/** Vị trí phím trắng so với nhóm phím đen — mốc bé đã học ở tuần 1. */
const WHITE_KEY_HINT: Record<string, string> = {
  C: 'ngay bên trái hai phím đen',
  D: 'ở giữa hai phím đen',
  E: 'ngay bên phải hai phím đen',
  F: 'ngay bên trái ba phím đen',
  G: 'ở giữa ba phím đen, bên trái',
  A: 'ở giữa ba phím đen, bên phải',
  B: 'ngay bên phải ba phím đen',
};

/** Gợi ý tìm phím: "Đô nằm ngay bên trái hai phím đen." / "Fa thăng là một phím đen." */
export function keyPositionHint(pitch: string): string {
  const m = /^([A-G])([#b]?)/.exec(pitch);
  if (!m) return '';
  const name = pitchToSpeech(pitch);
  return m[2] ? `${name} là một phím đen.` : `${name} nằm ${WHITE_KEY_HINT[m[1]]}.`;
}

export function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Chọn một biến thể theo bộ đếm (đều, xác định được trong test). */
function pick<T>(list: readonly T[], n: number): T {
  return list[((n % list.length) + list.length) % list.length];
}

const PRAISE = ['Giỏi lắm!', 'Đúng rồi!', 'Hay quá!', 'Tuyệt vời!', 'Bé làm tốt lắm!'];
const SOFT_WRONG = ['Chưa đúng, mình thử lại nhé.', 'Gần đúng rồi! Thử lại nào.', 'Không sao, thử lại nhé.'];

export interface NoteTarget {
  pitch: string;
  finger?: number;
  hand?: 'left' | 'right';
}

function fingerPart(t: NoteTarget): string {
  if (!t.finger) return '';
  return `, ngón ${t.finger}${t.hand === 'left' ? ' tay trái' : ''}`;
}

export const phrases = {
  lessonStart(title: string): VoiceCue {
    return { trigger: 'lesson_start', instructionText: `Chào bé! Hôm nay học: ${title}. Bấm nút Bắt đầu nhé.` };
  },

  /** Tên bài hay có chữ cái nốt ("C – D – E") — TTS đọc thành "xê đê e" → chỉ hiện, không đọc tên bài. */
  playStart(title: string): VoiceCue {
    return { id: 'step_start:play', trigger: 'step_start', instructionText: `${title} — nhìn nốt sáng màu nhé!`, voiceText: 'Mình cùng chơi đàn nhé! Bé nhìn nốt sáng màu.' };
  },

  noteExpected(t: NoteTarget): VoiceCue {
    const name = pitchToSpeech(t.pitch);
    return { id: 'note_expected', trigger: 'note_expected', instructionText: `Đánh nốt ${name}${fingerPart(t)}.`, voiceText: `Bé đánh nốt ${name}${fingerPart(t)}.` };
  },

  noteCorrect(n: number): VoiceCue {
    return { id: 'note_correct', trigger: 'note_correct', instructionText: pick(PRAISE, n) };
  },

  /** `level`: số lần sai liên tiếp ở nốt này — sai càng nhiều, cô giúp càng cụ thể. */
  noteWrong(t: NoteTarget, level: number, n = 0): VoiceCue {
    const name = pitchToSpeech(t.pitch);
    const text =
      level <= 1
        ? `${pick(SOFT_WRONG, n)} Nốt ${name}.`
        : level === 2
          ? `Không sao đâu! ${keyPositionHint(t.pitch)}`
          : `Cô giúp nhé: bé bấm phím đang sáng màu${fingerPart(t)}.`;
    return { id: `note_wrong:${Math.min(level, 3)}`, trigger: 'note_wrong', instructionText: text };
  },

  /** Bé chưa đánh: nhắc nhẹ, lần sau cụ thể hơn. */
  timeout(t: NoteTarget, count: number): VoiceCue {
    const name = pitchToSpeech(t.pitch);
    const text = count <= 1 ? `Bé ơi, mình đánh nốt ${name} nhé${fingerPart(t)}.` : `${keyPositionHint(t.pitch)} Bé thử bấm nhé!`;
    return { id: 'timeout', trigger: 'timeout', instructionText: text };
  },

  exerciseComplete(): VoiceCue {
    return { id: 'exercise_complete', trigger: 'lesson_complete', instructionText: 'Hoan hô! Bé chơi xong cả bài rồi!' };
  },

  /** Màn kết quả một bài tập (bài chấm điểm). */
  exerciseResult(passed: boolean): VoiceCue {
    return { id: 'exercise_result', trigger: 'lesson_complete', instructionText: passed ? 'Hoan hô! Bé làm xong bài rồi!' : 'Bé cố gắng lắm! Mình thử lại nhé.' };
  },

  lessonComplete(passed: boolean): VoiceCue {
    return {
      trigger: 'lesson_complete',
      instructionText: passed ? 'Hoan hô! Bé học xong buổi hôm nay rồi!' : 'Bé đã cố gắng lắm! Mình luyện thêm nhé.',
    };
  },

  /**
   * Bài tìm phím nhiều lượt, sau mỗi lần trả lời: đọc đề (`prompt` = đề đang hỏi, null = hết bài).
   * Đúng → khen + đề mới; sai được thử lại → nhắc nhẹ + đề cũ; sai ở bài kiểm tra → sang đề mới, không chê.
   */
  quizRound(prompt: string | null, outcome: 'correct' | 'wrong' | null, retry: boolean, n: number): VoiceCue {
    if (prompt === null) return phrases.exerciseComplete();
    if (outcome === 'correct') return { id: 'quiz_prompt', trigger: 'note_correct', instructionText: `${pick(PRAISE, n)} ${prompt}` };
    if (outcome === 'wrong' && retry) return { id: 'quiz_retry', trigger: 'note_wrong', instructionText: `${pick(SOFT_WRONG, n)} ${prompt}`, cooldownMs: 0 };
    return { id: 'quiz_prompt', trigger: 'note_expected', instructionText: prompt };
  },

  /** Câu đọc tự do (lời dặn trang giới thiệu, đề bài tìm phím). */
  say(textToSay: string, trigger: VoiceCue['trigger'] = 'step_start', id?: string): VoiceCue {
    return { id: id ?? trigger, trigger, instructionText: textToSay };
  },
};

/** Câu khai báo trong dữ liệu bài (nếu có) thay câu mặc định cùng trigger. */
export function overrideCue(fallback: VoiceCue, custom: readonly VoiceCue[] | undefined): VoiceCue {
  const c = custom?.find((x) => x.trigger === fallback.trigger);
  return c ? { id: fallback.id, ...c } : fallback;
}
