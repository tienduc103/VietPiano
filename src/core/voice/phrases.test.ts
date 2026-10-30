import { describe, expect, it } from 'vitest';
import { countWords, keyPositionHint, midiToSpeech, phrases, pitchToSpeech } from './phrases';
import { pickVietnameseVoice, speechParts } from './speakers';

describe('tên nốt đọc cho bé', () => {
  it('Đô Rê Mi Fa Sol La Si, thăng / giáng, không đọc quãng tám', () => {
    expect(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'].map(pitchToSpeech)).toEqual(['Đô', 'Rê', 'Mi', 'Fa', 'Sol', 'La', 'Si']);
    expect(pitchToSpeech('F#3')).toBe('Fa thăng');
    expect(pitchToSpeech('Bb4')).toBe('Si giáng');
    expect(midiToSpeech(61)).toBe('Đô thăng');
  });

  it('gợi ý vị trí phím theo nhóm phím đen', () => {
    expect(keyPositionHint('C4')).toBe('Đô nằm ngay bên trái hai phím đen.');
    expect(keyPositionHint('B3')).toBe('Si nằm ngay bên phải ba phím đen.');
    expect(keyPositionHint('F#4')).toBe('Fa thăng là một phím đen.');
  });
});

describe('câu mặc định', () => {
  const t = { pitch: 'G4', finger: 5, hand: 'left' as const };
  const all = [
    phrases.lessonStart('Ba nốt Đô Rê Mi'),
    phrases.playStart('Đô Rê Mi'),
    phrases.noteExpected(t),
    ...[0, 1, 2, 3, 4].map(phrases.noteCorrect),
    ...[1, 2, 3, 4].map((l) => phrases.noteWrong(t, l)),
    phrases.timeout(t, 1),
    phrases.timeout(t, 2),
    phrases.exerciseComplete(),
    phrases.exerciseResult(true),
    phrases.exerciseResult(false),
    phrases.lessonComplete(true),
    phrases.lessonComplete(false),
  ];

  it('ngắn gọn: tối đa 15 từ mỗi câu', () => {
    for (const c of all) expect(countWords(c.voiceText ?? c.instructionText), c.instructionText).toBeLessThanOrEqual(15);
  });

  it('không chê trách', () => {
    for (const c of all) expect(c.instructionText).not.toMatch(/sai rồi|kém|tệ|dở|phạt/i);
  });

  it('đọc tay trái + ngón', () => {
    expect(phrases.noteExpected(t).voiceText).toBe('Bé đánh nốt Sol, ngón 5 tay trái.');
  });
});

describe('chọn giọng tiếng Việt', () => {
  const v = (name: string, lang: string, localService = true) => ({ name, lang, localService });

  it('ưu tiên giọng trên máy, nữ, miền Bắc', () => {
    const voices = [v('Microsoft An - Vietnamese (Vietnam)', 'vi-VN'), v('Linh', 'vi-VN'), v('Samantha', 'en-US')];
    expect(pickVietnameseVoice(voices)?.name).toBe('Linh');
  });

  it('mặc định bỏ giọng trực tuyến (gửi chữ lên máy chủ)', () => {
    const voices = [v('Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', 'vi-VN', false)];
    expect(pickVietnameseVoice(voices)).toBeNull();
    expect(pickVietnameseVoice(voices, '', true)?.name).toContain('HoaiMy');
  });

  it('giọng đã chọn được ưu tiên nếu còn', () => {
    const voices = [v('Linh', 'vi-VN'), v('Microsoft An - Vietnamese (Vietnam)', 'vi_VN')];
    expect(pickVietnameseVoice(voices, 'Microsoft An - Vietnamese (Vietnam)')?.name).toContain('An');
    expect(pickVietnameseVoice(voices, 'Không còn')?.name).toBe('Linh');
  });

  it('không có giọng tiếng Việt → null', () => {
    expect(pickVietnameseVoice([v('Samantha', 'en-US')])).toBeNull();
  });
});

describe('ghép giọng thu sẵn', () => {
  const index = new Map([
    ['Giỏi lắm!', 'u/a.mp3'],
    ['Nốt Đô.', 'u/b.mp3'],
  ]);

  it('mỗi câu đơn một file, câu thiếu file đọc bằng giọng máy (gộp câu liền nhau)', () => {
    expect(speechParts('Giỏi lắm! Nốt Đô.', undefined, index, true)).toEqual([{ url: 'u/a.mp3' }, { url: 'u/b.mp3' }]);
    expect(speechParts('Giỏi lắm! Thử lại. Nhé! Nốt Đô.', undefined, index, true)).toEqual([{ url: 'u/a.mp3' }, { tts: 'Thử lại. Nhé!' }, { url: 'u/b.mp3' }]);
  });

  it('không có giọng máy: bỏ câu thiếu file; không có gì → rỗng', () => {
    expect(speechParts('Giỏi lắm! Thử lại.', undefined, index, false)).toEqual([{ url: 'u/a.mp3' }]);
    expect(speechParts('Thử lại.', undefined, index, false)).toEqual([]);
  });

  it('file riêng của câu (audioAsset) được ưu tiên', () => {
    expect(speechParts('Giỏi lắm!', 'voice/x.mp3', index, true, (a) => `/base/${a}`)).toEqual([{ url: '/base/voice/x.mp3' }]);
  });
});
