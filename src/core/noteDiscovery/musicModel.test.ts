import { describe, expect, it } from 'vitest';
import {
  getBlackKeyGroup,
  getNoteDefinition,
  isBlackKeyMidi,
  NOTE_DEFINITIONS,
  validateExpectedInput,
} from './musicModel';

describe('Note Discovery - Music Domain Model', () => {
  it('định nghĩa chính xác 8 nốt cơ bản C4 đến C5', () => {
    const c4 = NOTE_DEFINITIONS[60];
    expect(c4).toBeDefined();
    expect(c4.scientificName).toBe('C4');
    expect(c4.solfege).toBe('Đô');
    expect(c4.octave).toBe(4);
    expect(c4.pitchClass).toBe(0);
    expect(c4.isBlack).toBe(false);

    // C4 nằm trên dòng kẻ phụ dưới khuông khóa Sol
    expect(c4.staffPosition.clef).toBe('treble');
    expect(c4.staffPosition.locationType).toBe('ledger-line');
    expect(c4.staffPosition.ledgerLinesBelow).toBe(1);
    expect(c4.staffPosition.staffStep).toBe(-2);

    // C5 (MIDI 72)
    const c5 = NOTE_DEFINITIONS[72];
    expect(c5.scientificName).toBe('C5');
    expect(c5.solfege).toBe('Đô');
    expect(c5.octave).toBe(5);
    expect(c5.staffPosition.locationType).toBe('space');
    expect(c5.staffPosition.ledgerLinesBelow).toBe(0);
    expect(c5.staffPosition.staffStep).toBe(5);
  });

  it('định vị chính xác các dòng và khe trên khuông nhạc', () => {
    // D4: khe dưới dòng 1
    const d4 = NOTE_DEFINITIONS[62];
    expect(d4.staffPosition.staffStep).toBe(-1);
    expect(d4.staffPosition.locationType).toBe('ledger-space');

    // E4: dòng kẻ 1
    const e4 = NOTE_DEFINITIONS[64];
    expect(e4.staffPosition.staffStep).toBe(0);
    expect(e4.staffPosition.locationType).toBe('line');
    expect(e4.staffPosition.index).toBe(1);

    // F4: khe 1
    const f4 = NOTE_DEFINITIONS[65];
    expect(f4.staffPosition.staffStep).toBe(1);
    expect(f4.staffPosition.locationType).toBe('space');
    expect(f4.staffPosition.index).toBe(1);

    // G4: dòng 2 (dòng khóa Sol)
    const g4 = NOTE_DEFINITIONS[67];
    expect(g4.staffPosition.staffStep).toBe(2);
    expect(g4.staffPosition.locationType).toBe('line');
    expect(g4.staffPosition.index).toBe(2);

    // A4: khe 2
    const a4 = NOTE_DEFINITIONS[69];
    expect(a4.staffPosition.staffStep).toBe(3);
    expect(a4.staffPosition.locationType).toBe('space');
    expect(a4.staffPosition.index).toBe(2);

    // B4: dòng 3
    const b4 = NOTE_DEFINITIONS[71];
    expect(b4.staffPosition.staffStep).toBe(4);
    expect(b4.staffPosition.locationType).toBe('line');
    expect(b4.staffPosition.index).toBe(3);
  });

  it('phân biệt chính xác nhóm 2 và nhóm 3 phím đen', () => {
    // Nhóm 2 phím đen: C#4 (61), D#4 (63)
    expect(getBlackKeyGroup(61)).toBe(2);
    expect(getBlackKeyGroup(63)).toBe(2);
    expect(isBlackKeyMidi(61)).toBe(true);
    expect(isBlackKeyMidi(63)).toBe(true);

    // Nhóm 3 phím đen: F#4 (66), G#4 (68), A#4 (70)
    expect(getBlackKeyGroup(66)).toBe(3);
    expect(getBlackKeyGroup(68)).toBe(3);
    expect(getBlackKeyGroup(70)).toBe(3);
    expect(isBlackKeyMidi(66)).toBe(true);
    expect(isBlackKeyMidi(68)).toBe(true);
    expect(isBlackKeyMidi(70)).toBe(true);

    // Phím trắng: không thuộc nhóm phím đen
    expect(getBlackKeyGroup(60)).toBeNull();
    expect(getBlackKeyGroup(62)).toBeNull();
    expect(isBlackKeyMidi(60)).toBe(false);
  });

  it('validateExpectedInput xử lý đúng các yêu cầu và phân biệt quãng tám', () => {
    // Exact MIDI
    const resExact = validateExpectedInput({ kind: 'exact-midi', midi: 60 }, { midi: 60 });
    expect(resExact.isCorrect).toBe(true);

    // Đúng pitch class C nhưng sai octave (C5 thay vì C4) -> báo sai kèm phản hồi quãng tám
    const resWrongOctave = validateExpectedInput({ kind: 'exact-midi', midi: 60 }, { midi: 72 });
    expect(resWrongOctave.isCorrect).toBe(false);
    expect(resWrongOctave.feedbackText).toContain('cao hơn một quãng tám');

    // Pitch class match (cho phép bất kỳ octave nào)
    const resPc = validateExpectedInput({ kind: 'pitch-class', pitchClass: 0 }, { midi: 72 });
    expect(resPc.isCorrect).toBe(true);

    // Nhóm phím đen
    const resGroup2 = validateExpectedInput({ kind: 'black-group', groupSize: 2 }, { midi: 61 });
    expect(resGroup2.isCorrect).toBe(true);
    const resGroupWrong = validateExpectedInput({ kind: 'black-group', groupSize: 2 }, { midi: 66 });
    expect(resGroupWrong.isCorrect).toBe(false);

    // So sánh cao độ (Listening Practice)
    const resHigher = validateExpectedInput(
      { kind: 'relative-pitch', referenceMidi: 60, comparison: 'higher' },
      { midi: 67 },
    );
    expect(resHigher.isCorrect).toBe(true);

    const resLower = validateExpectedInput(
      { kind: 'relative-pitch', referenceMidi: 67, comparison: 'lower' },
      { midi: 60 },
    );
    expect(resLower.isCorrect).toBe(true);
  });

  it('getNoteDefinition tính toán chính xác cho các nốt ngoài khoảng định nghĩa sẵn', () => {
    // C3 (MIDI 48)
    const c3 = getNoteDefinition(48);
    expect(c3.scientificName).toBe('C3');
    expect(c3.octave).toBe(3);
    expect(c3.solfege).toBe('Đô');
    expect(c3.isBlack).toBe(false);

    // C6 (MIDI 84)
    const c6 = getNoteDefinition(84);
    expect(c6.scientificName).toBe('C6');
    expect(c6.octave).toBe(6);
  });
});
