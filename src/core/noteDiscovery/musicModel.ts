/**
 * Domain model cho Module Khám phá nốt nhạc (Note Discovery).
 * Phân định rạch ròi:
 * - MIDI note number (ví dụ 60)
 * - Pitch class (0..11)
 * - Octave (4, 5...)
 * - Scientific pitch notation ("C4", "D4"...)
 * - Tên nốt tiếng Việt ("Đô", "Rê", "Mi", "Fa", "Sol", "La", "Si")
 * - Clef ('treble' - Khóa Sol)
 * - Staff position (dòng kẻ / khe, tọa độ khuông, dòng kẻ phụ ledger lines)
 * - Mối quan hệ với nhóm phím đen (nhóm 2 phím đen, nhóm 3 phím đen)
 * - Quy tắc kiểm tra đầu vào (Expected input & Accepted input policy)
 */

export type ClefType = 'treble';

export type NoteLetter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';
export type SolfegeName = 'Đô' | 'Rê' | 'Mi' | 'Fa' | 'Sol' | 'La' | 'Si';

export interface BlackKeyGroupInfo {
  type: 2 | 3;
  /** MIDI của các phím đen trong nhóm tại cùng octave hoặc liền kề */
  midiNotes: readonly number[];
  /** Vị trí tương đối của nốt trắng so với nhóm phím đen */
  relativePosition: 'left' | 'inside-first' | 'inside-second' | 'right';
  description: string;
}

export type StaffLocationType = 'line' | 'space' | 'ledger-line' | 'ledger-space';

export interface StaffPositionInfo {
  clef: ClefType;
  /**
   * Tọa độ bước khuông (diatonic staff step), lấy dòng 1 (Line 1 = E4) làm mốc 0:
   * - C4: step -2 (dòng kẻ phụ thứ 1 bên dưới khuông)
   * - D4: step -1 (khe bên dưới dòng kẻ 1)
   * - E4: step 0 (dòng kẻ 1)
   * - F4: step 1 (khe 1)
   * - G4: step 2 (dòng kẻ 2 - dòng khóa Sol xoay quanh)
   * - A4: step 3 (khe 2)
   * - B4: step 4 (dòng kẻ 3)
   * - C5: step 5 (khe 3)
   */
  staffStep: number;
  locationType: StaffLocationType;
  /** Số thứ tự dòng kẻ (1..5) hoặc khe (1..4), hoặc thứ tự dòng kẻ phụ */
  index: number;
  /** Số dòng kẻ phụ cần vẽ (C4 = 1 dòng kẻ phụ dưới; C5 = 0 dòng kẻ phụ) */
  ledgerLinesBelow: number;
  ledgerLinesAbove: number;
  /** Mô tả tiếng Việt thân thiện */
  vietnameseDesc: string;
}

export interface NoteDefinition {
  midi: number;
  pitchClass: number; // 0..11
  octave: number;
  scientificName: string; // e.g. "C4"
  solfege: SolfegeName;
  letter: NoteLetter;
  isBlack: boolean;
  staffPosition: StaffPositionInfo;
  blackKeyLandmark?: BlackKeyGroupInfo;
}

/**
 * 8 nốt cơ bản của lộ trình Khám phá nốt nhạc (từ C4 đến C5)
 */
export const NOTE_DEFINITIONS: Record<number, NoteDefinition> = {
  60: {
    midi: 60,
    pitchClass: 0,
    octave: 4,
    scientificName: 'C4',
    solfege: 'Đô',
    letter: 'C',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: -2,
      locationType: 'ledger-line',
      index: 1,
      ledgerLinesBelow: 1,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Đô giữa (C4) nằm trên dòng kẻ phụ ngay dưới khuông nhạc',
    },
    blackKeyLandmark: {
      type: 2,
      midiNotes: [61, 63],
      relativePosition: 'left',
      description: 'Đô nằm ngay bên trái nhóm hai phím đen',
    },
  },
  62: {
    midi: 62,
    pitchClass: 2,
    octave: 4,
    scientificName: 'D4',
    solfege: 'Rê',
    letter: 'D',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: -1,
      locationType: 'ledger-space',
      index: 1,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Rê (D4) nằm ở khe ngay sát dưới dòng kẻ 1',
    },
    blackKeyLandmark: {
      type: 2,
      midiNotes: [61, 63],
      relativePosition: 'inside-first',
      description: 'Rê nằm ở chính giữa hai phím đen',
    },
  },
  64: {
    midi: 64,
    pitchClass: 4,
    octave: 4,
    scientificName: 'E4',
    solfege: 'Mi',
    letter: 'E',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: 0,
      locationType: 'line',
      index: 1,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Mi (E4) nằm trên dòng kẻ thứ 1 (dòng dưới cùng)',
    },
    blackKeyLandmark: {
      type: 2,
      midiNotes: [61, 63],
      relativePosition: 'right',
      description: 'Mi nằm ngay bên phải nhóm hai phím đen',
    },
  },
  65: {
    midi: 65,
    pitchClass: 5,
    octave: 4,
    scientificName: 'F4',
    solfege: 'Fa',
    letter: 'F',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: 1,
      locationType: 'space',
      index: 1,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Fa (F4) nằm ở khe thứ 1 (giữa dòng 1 và dòng 2)',
    },
    blackKeyLandmark: {
      type: 3,
      midiNotes: [66, 68, 70],
      relativePosition: 'left',
      description: 'Fa nằm ngay bên trái nhóm ba phím đen',
    },
  },
  67: {
    midi: 67,
    pitchClass: 7,
    octave: 4,
    scientificName: 'G4',
    solfege: 'Sol',
    letter: 'G',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: 2,
      locationType: 'line',
      index: 2,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Sol (G4) nằm trên dòng kẻ thứ 2 (dòng khóa Sol)',
    },
    blackKeyLandmark: {
      type: 3,
      midiNotes: [66, 68, 70],
      relativePosition: 'inside-first',
      description: 'Sol nằm ở khe đầu tiên của nhóm ba phím đen',
    },
  },
  69: {
    midi: 69,
    pitchClass: 9,
    octave: 4,
    scientificName: 'A4',
    solfege: 'La',
    letter: 'A',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: 3,
      locationType: 'space',
      index: 2,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'La (A4) nằm ở khe thứ 2 (giữa dòng 2 và dòng 3)',
    },
    blackKeyLandmark: {
      type: 3,
      midiNotes: [66, 68, 70],
      relativePosition: 'inside-second',
      description: 'La nằm ở khe thứ hai của nhóm ba phím đen',
    },
  },
  71: {
    midi: 71,
    pitchClass: 11,
    octave: 4,
    scientificName: 'B4',
    solfege: 'Si',
    letter: 'B',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: 4,
      locationType: 'line',
      index: 3,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Si (B4) nằm trên dòng kẻ thứ 3 (dòng chính giữa)',
    },
    blackKeyLandmark: {
      type: 3,
      midiNotes: [66, 68, 70],
      relativePosition: 'right',
      description: 'Si nằm ngay bên phải nhóm ba phím đen',
    },
  },
  72: {
    midi: 72,
    pitchClass: 0,
    octave: 5,
    scientificName: 'C5',
    solfege: 'Đô',
    letter: 'C',
    isBlack: false,
    staffPosition: {
      clef: 'treble',
      staffStep: 5,
      locationType: 'space',
      index: 3,
      ledgerLinesBelow: 0,
      ledgerLinesAbove: 0,
      vietnameseDesc: 'Đô cao (C5) nằm ở khe thứ 3 (giữa dòng 3 và dòng 4)',
    },
    blackKeyLandmark: {
      type: 2,
      midiNotes: [73, 75],
      relativePosition: 'left',
      description: 'Đô cao nằm ngay bên trái nhóm hai phím đen tiếp theo',
    },
  },
};

/**
 * Expected input requirement
 */
export type ExpectedInputType =
  | { kind: 'exact-midi'; midi: number }
  | { kind: 'pitch-class'; pitchClass: number }
  | { kind: 'black-group'; groupSize: 2 | 3 }
  | { kind: 'black-key' }
  | { kind: 'white-key' }
  | { kind: 'relative-pitch'; referenceMidi: number; comparison: 'higher' | 'lower' | 'equal' }
  | { kind: 'choice'; correctIndex: number };

/**
 * Nhóm phím đen: xác định nhóm 2 hay nhóm 3 phím đen
 */
export function getBlackKeyGroup(midi: number): 2 | 3 | null {
  const pc = ((midi % 12) + 12) % 12;
  if (pc === 1 || pc === 3) return 2; // C# (1), D# (3)
  if (pc === 6 || pc === 8 || pc === 10) return 3; // F# (6), G# (8), A# (10)
  return null;
}

export function isBlackKeyMidi(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return [1, 3, 6, 8, 10].includes(pc);
}

/**
 * Lấy thông tin nốt nhạc theo MIDI. Hỗ trợ tra cứu ngoài khoảng 60..72.
 */
export function getNoteDefinition(midi: number): NoteDefinition {
  if (NOTE_DEFINITIONS[midi]) {
    return NOTE_DEFINITIONS[midi];
  }
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const isBlack = isBlackKeyMidi(midi);
  const solfeges: SolfegeName[] = ['Đô', 'Đô', 'Rê', 'Rê', 'Mi', 'Fa', 'Fa', 'Sol', 'Sol', 'La', 'La', 'Si'];
  const letters: NoteLetter[] = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

  // Tính diatonic step tương đối
  const diatonicOffset: Record<number, number> = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  const dStep = (octave - 4) * 7 + (diatonicOffset[pc] ?? 0) - 2;

  return {
    midi,
    pitchClass: pc,
    octave,
    scientificName: `${letters[pc]}${octave}`,
    solfege: solfeges[pc],
    letter: letters[pc],
    isBlack,
    staffPosition: {
      clef: 'treble',
      staffStep: dStep,
      locationType: dStep % 2 === 0 ? 'line' : 'space',
      index: Math.abs(dStep),
      ledgerLinesBelow: dStep < -1 ? Math.floor(Math.abs(dStep) / 2) : 0,
      ledgerLinesAbove: dStep > 8 ? Math.floor((dStep - 8 + 1) / 2) : 0,
      vietnameseDesc: `${solfeges[pc]}${octave}`,
    },
  };
}

/**
 * Kiểm tra câu trả lời của học viên theo yêu cầu bài
 */
export function validateExpectedInput(
  expected: ExpectedInputType,
  actual: { midi?: number; choiceIndex?: number },
): { isCorrect: boolean; feedbackText?: string } {
  if (expected.kind === 'choice') {
    const isCorrect = actual.choiceIndex === expected.correctIndex;
    return { isCorrect };
  }

  if (actual.midi === undefined) {
    return { isCorrect: false };
  }

  const { midi } = actual;
  const actualPc = ((midi % 12) + 12) % 12;

  switch (expected.kind) {
    case 'exact-midi': {
      if (midi === expected.midi) return { isCorrect: true };
      const isSamePc = actualPc === ((expected.midi % 12) + 12) % 12;
      if (isSamePc) {
        const expectedDef = getNoteDefinition(expected.midi);
        const actualOctave = Math.floor(midi / 12) - 1;
        const msg = actualOctave < expectedDef.octave ? 'Bé tìm đúng nốt nhưng bị thấp hơn một quãng tám nhé!' : 'Bé tìm đúng nốt nhưng bị cao hơn một quãng tám nhé!';
        return { isCorrect: false, feedbackText: msg };
      }
      return { isCorrect: false };
    }

    case 'pitch-class': {
      return { isCorrect: actualPc === expected.pitchClass };
    }

    case 'black-key': {
      return { isCorrect: isBlackKeyMidi(midi) };
    }

    case 'white-key': {
      return { isCorrect: !isBlackKeyMidi(midi) };
    }

    case 'black-group': {
      const group = getBlackKeyGroup(midi);
      return { isCorrect: group === expected.groupSize };
    }

    case 'relative-pitch': {
      if (expected.comparison === 'higher') return { isCorrect: midi > expected.referenceMidi };
      if (expected.comparison === 'lower') return { isCorrect: midi < expected.referenceMidi };
      return { isCorrect: midi === expected.referenceMidi };
    }
  }
}
