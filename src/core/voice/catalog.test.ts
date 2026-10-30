import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../curriculum/content/curriculum';
import { splitSentences, voiceKey, voiceLines } from './catalog';
import { phrases } from './phrases';

describe('danh mục câu cô giáo', () => {
  it('tách câu theo dấu chấm câu, chuẩn hoá khoảng trắng + Unicode', () => {
    expect(splitSentences('Giỏi lắm!  Nốt Đô.')).toEqual(['Giỏi lắm!', 'Nốt Đô.']);
    expect(splitSentences('Chào bé! Hôm nay học: Tìm nốt Đô. Bấm nút Bắt đầu nhé.')).toEqual(['Chào bé!', 'Hôm nay học: Tìm nốt Đô.', 'Bấm nút Bắt đầu nhé.']);
    expect(splitSentences('Đô, Rê, Mi')).toEqual(['Đô, Rê, Mi']);
    // "ô" dạng tổ hợp (o + dấu mũ) và dạng dựng sẵn cho cùng một khoá.
    expect(voiceKey('Đô')).toBe(voiceKey('Đô'));
  });

  const lines = new Set(voiceLines(CURRICULUM));

  it('phủ mọi câu mặc định (tách câu) của Wait Mode, bài tìm phím và đầu / cuối buổi', () => {
    const cues = [
      phrases.noteExpected({ pitch: 'F#4', finger: 4, hand: 'left' }),
      phrases.noteWrong({ pitch: 'Bb3' }, 1, 2),
      phrases.noteWrong({ pitch: 'C4', finger: 1, hand: 'right' }, 3),
      phrases.timeout({ pitch: 'G4', finger: 5, hand: 'right' }, 2),
      phrases.lessonStart('Tìm nốt Đô'),
      phrases.lessonComplete(false),
      phrases.voiceTest(),
      ...[0, 1, 2, 3, 4].map(phrases.noteCorrect),
    ];
    for (const c of cues) for (const s of splitSentences(c.voiceText ?? c.instructionText)) expect(lines, s).toContain(s);
  });

  it('có lời giới thiệu và đề bài của giáo trình, không trùng', () => {
    expect(lines).toContain('Nốt Đô trốn ngay bên trái hai anh em phím đen!');
    expect(lines).toContain('Chào bé!');
    expect(voiceLines(CURRICULUM).length).toBe(lines.size);
  });
});
