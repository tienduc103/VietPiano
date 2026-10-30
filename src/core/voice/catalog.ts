/**
 * Danh mục câu cô giáo có thể nói → script `npm run voice` tạo sẵn file mp3 (giọng HoaiMy) cho từng câu,
 * app phát file thay vì đọc bằng giọng của máy (Chrome trên Windows không có giọng tiếng Việt).
 *
 * Câu dài được tách theo dấu chấm câu: mỗi câu đơn một file, khi phát thì nối các file lại
 * ("Giỏi lắm!" + đề bài) → ít file hơn nhiều so với lưu mọi tổ hợp.
 */
import type { Curriculum } from '../curriculum/types';
import { text } from '../curriculum/types';
import { phrases, type NoteTarget } from './phrases';
import type { VoiceCue } from './types';

/** Khoá tra cứu của một câu: chuẩn hoá Unicode + khoảng trắng (chữ tiếng Việt gõ có thể ở dạng tổ hợp). */
export function voiceKey(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Tách thành câu đơn theo . ! ? … (giữ dấu). "Giỏi lắm! Nốt Đô." → ["Giỏi lắm!", "Nốt Đô."] */
export function splitSentences(s: string): string[] {
  return voiceKey(s)
    .split(/(?<=[.!?…])\s+/)
    .map((x) => x.trim())
    .filter((x) => /[\p{L}\p{N}]/u.test(x));
}

/** Câu sẽ đọc của một cue (giống `VoiceTeacher`: voiceText nếu có). */
export const spokenText = (c: VoiceCue) => c.voiceText ?? c.instructionText;

/** Nốt có tên riêng khi đọc (thăng / giáng thường gặp). Không đọc quãng tám nên chỉ cần một quãng. */
export const SPOKEN_PITCHES = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].map((p) => `${p}4`);

/** Mọi tổ hợp nốt × ngón × tay mà câu nốt cần đánh / nhắc có thể nhắc tới. */
function noteTargets(): NoteTarget[] {
  const out: NoteTarget[] = [];
  for (const pitch of SPOKEN_PITCHES) {
    out.push({ pitch });
    for (let finger = 1; finger <= 5; finger++) for (const hand of ['right', 'left'] as const) out.push({ pitch, finger, hand });
  }
  return out;
}

/** Mọi câu đơn (đã chuẩn hoá, không trùng) cô giáo có thể nói với giáo trình này. */
export function voiceLines(curriculum: Curriculum): string[] {
  const cues: VoiceCue[] = [
    phrases.playStart(''),
    phrases.exerciseComplete(),
    phrases.exerciseResult(true),
    phrases.exerciseResult(false),
    phrases.lessonComplete(true),
    phrases.lessonComplete(false),
    phrases.voiceTest(),
  ];
  for (let n = 0; n < 6; n++) cues.push(phrases.noteCorrect(n));
  for (const t of noteTargets()) {
    cues.push(phrases.noteExpected(t), phrases.timeout(t, 1), phrases.timeout(t, 2));
    for (let level = 1; level <= 3; level++) for (let n = 0; n < 3; n++) cues.push(phrases.noteWrong(t, level, n));
  }

  for (const level of curriculum.levels) {
    for (const l of level.lessons) {
      cues.push(phrases.lessonStart(text(l.title)), ...(l.voice ?? []));
      for (const a of l.activities) {
        for (const p of a.pages) {
          if (p.voice) cues.push(p.voice);
          // Kids Mode đọc `kids` (nếu có), giao diện người lớn ("Luôn bật") đọc `body`.
          cues.push(phrases.say(text(p.body)));
          if (p.kids) cues.push(phrases.say(text(p.kids)));
        }
      }
      for (const ex of l.exercises) {
        cues.push(...(ex.voice ?? []));
        if (ex.kind === 'key-quiz') {
          // Câu khen / nhắc nhẹ + đề bài: tách câu nên chỉ cần mỗi phần một lần.
          for (const r of ex.rounds) {
            for (let n = 0; n < 5; n++) cues.push(phrases.quizRound(text(r.prompt), 'correct', true, n), phrases.quizRound(text(r.prompt), 'wrong', true, n));
          }
        }
      }
    }
  }
  return [...new Set(cues.flatMap((c) => splitSentences(spokenText(c))))];
}
