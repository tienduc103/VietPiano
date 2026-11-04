/**
 * 8 Stages giáo trình Khám phá nốt nhạc (Note Discovery) cho trẻ 4–8 tuổi.
 */
import type { DiscoveryStage } from './types';

export const NOTE_DISCOVERY_STAGES: readonly DiscoveryStage[] = [
  // ─────────────────────────────────────────────────────────────
  // STAGE 1: Khám phá bàn phím trắng, đen và nhóm 2/3 phím đen
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-1',
    number: 1,
    title: 'Khám phá bàn phím',
    subtitle: 'Phím trắng, phím đen và nhóm 2/3 phím đen',
    description: 'Bé làm quen với hai màu phím và nhận biết nhóm hai anh em phím đen, nhóm ba anh em phím đen.',
    learningObjectives: [
      'Phân biệt được phím trắng và phím đen trên piano',
      'Tìm đúng nhóm 2 phím đen trên đàn',
      'Tìm đúng nhóm 3 phím đen trên đàn',
      'Cảm nhận âm trầm ở bên trái, âm bổng ở bên phải bàn phím',
    ],
    prerequisites: [],
    keyboardRange: { from: 48, to: 72 }, // C3 đến C5
    noteRange: [60, 61, 63, 66, 68, 70],
    activities: [
      {
        id: 's1-intro',
        kind: 'intro',
        title: 'Làm quen phím đàn',
        instructions: 'Bàn phím piano có các phím trắng rộng rãi và các phím đen nhô cao xếp thành từng nhóm.',
        voicePrompt: 'Chào bé! Đàn piano có phím trắng và phím đen. Bé cùng chạm thử nhé!',
        items: [
          {
            midi: 60,
            instructionText: 'Chạm vào một phím trắng bất kỳ để nghe âm thanh trong trẻo nhé.',
            voiceText: 'Chạm vào một phím trắng bất kỳ nào!',
            highlightKey: true,
          },
          {
            midi: 61,
            instructionText: 'Đây là phím đen. Phím đen đứng thành nhóm 2 phím và nhóm 3 phím xen kẽ.',
            voiceText: 'Còn đây là phím đen. Phím đen đứng thành nhóm hai và ba phím đấy.',
            highlightKey: true,
          },
        ],
      },
      {
        id: 's1-find-black-groups',
        kind: 'find-key',
        title: 'Tìm nhóm phím đen',
        instructions: 'Bé hãy tìm và gõ vào các nhóm phím đen theo yêu cầu nhé!',
        voicePrompt: 'Bé hãy bấm vào nhóm phím đen theo yêu cầu nhé!',
        keyboardRange: { from: 48, to: 72 },
        retryOnWrong: true,
        rounds: [
          {
            target: { kind: 'black-group', groupSize: 2 },
            prompt: 'Bấm một phím thuộc nhóm 2 phím đen',
            voiceText: 'Bé bấm vào một phím thuộc nhóm hai phím đen nào!',
            displaySymbol: 'Nhóm 2 phím đen',
            hintLevel: 0,
          },
          {
            target: { kind: 'black-group', groupSize: 3 },
            prompt: 'Bấm một phím thuộc nhóm 3 phím đen',
            voiceText: 'Bây giờ bé tìm nhóm ba phím đen nhé!',
            displaySymbol: 'Nhóm 3 phím đen',
            hintLevel: 0,
          },
          {
            target: { kind: 'white-key' },
            prompt: 'Bấm một phím trắng bất kỳ',
            voiceText: 'Rất giỏi! Bé gõ một phím trắng bất kỳ nào.',
            hintLevel: 1,
          },
        ],
      },
      {
        id: 's1-listening',
        kind: 'listening',
        title: 'Nghe cao và thấp',
        instructions: 'Nghe hai âm thanh và cho biết âm thứ hai cao hơn hay thấp hơn âm thứ nhất.',
        voicePrompt: 'Bé nghe xem tiếng đàn thứ hai cao hơn hay thấp hơn nhé!',
        rounds: [
          {
            firstMidi: 48, // C3
            secondMidi: 72, // C5
            comparison: 'higher',
            prompt: 'Âm thanh thứ hai Cao hơn hay Thấp hơn âm thứ nhất?',
            voiceText: 'Âm thanh thứ hai cao hơn hay thấp hơn?',
          },
          {
            firstMidi: 67, // G4
            secondMidi: 55, // G3
            comparison: 'lower',
            prompt: 'Âm thanh thứ hai Cao hơn hay Thấp hơn âm thứ nhất?',
            voiceText: 'Âm thanh này cao hơn hay thấp hơn?',
          },
        ],
      },
      {
        id: 's1-memory',
        kind: 'memory-challenge',
        title: 'Thử thách phản xạ phím đàn',
        instructions: 'Bé gõ nhanh theo yêu cầu nhóm phím đen hoặc trắng nhé!',
        voicePrompt: 'Thử thách phản xạ nhanh! Cùng chơi nào!',
        notePool: [61, 63, 66, 68, 70],
        roundCount: 3,
        hintLevel: 1,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [1, 3, 7] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 2: Nhận biết Đô giữa C4 (MIDI 60)
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-2',
    number: 2,
    title: 'Nốt Đô giữa (C4)',
    subtitle: 'Nốt mốc quan trọng nhất của đàn piano',
    description: 'Bé tìm nốt Đô giữa ở bên trái nhóm 2 phím đen và nhận diện Đô giữa trên dòng kẻ phụ của khuông nhạc.',
    learningObjectives: [
      'Xác định nốt Đô nằm ngay bên trái nhóm 2 phím đen',
      'Định vị chính xác Đô giữa C4 (MIDI 60)',
      'Nhận biết nốt C4 trên dòng kẻ phụ dưới khuông khóa Sol',
      'Gõ đúng Đô giữa khi nhìn thấy ký hiệu trên khuông',
    ],
    prerequisites: ['stage-1'],
    keyboardRange: { from: 55, to: 67 }, // G3 đến G4
    noteRange: [60],
    activities: [
      {
        id: 's2-intro',
        kind: 'intro',
        title: 'Làm quen bạn Đô giữa',
        instructions: 'Nốt Đô luôn đứng ở ngay bên trái nhóm hai phím đen. Đô giữa nằm ở trung tâm cây đàn.',
        voicePrompt: 'Đây là bạn Đô giữa C4. Bạn Đô đứng ngay bên trái hai phím đen.',
        items: [
          {
            midi: 60,
            instructionText: 'Đô giữa (C4) có một vạch kẻ ngang qua bụng như chiếc đĩa bay nhỏ.',
            voiceText: 'Bé bấm bạn Đô giữa để nghe tiếng đàn nhé!',
            highlightKey: true,
            showStaffNote: true,
          },
        ],
      },
      {
        id: 's2-find-c4',
        kind: 'find-key',
        title: 'Tìm phím Đô giữa',
        instructions: 'Tìm phím Đô giữa C4 trên đàn nhé. Gợi ý: bên trái nhóm 2 phím đen.',
        voicePrompt: 'Bé tìm và bấm phím Đô giữa C4 nào!',
        keyboardRange: { from: 55, to: 67 },
        retryOnWrong: true,
        rounds: [
          {
            target: { kind: 'exact-midi', midi: 60 },
            prompt: 'Bấm nốt Đô giữa (C4)',
            voiceText: 'Bấm nốt Đô giữa C4',
            displayMidi: 60,
            displaySymbol: 'Đô (C4)',
            hintLevel: 0,
          },
          {
            target: { kind: 'exact-midi', midi: 60 },
            prompt: 'Bấm nốt Đô giữa (C4) - Không có gợi ý phím',
            voiceText: 'Tự tìm bạn Đô giữa nhé, không còn đèn gợi ý đâu!',
            displayMidi: 60,
            displaySymbol: 'Đô (C4)',
            hintLevel: 1,
          },
        ],
      },
      {
        id: 's2-staff-c4',
        kind: 'staff-recognition',
        title: 'Nhìn khuông nhạc đoán Đô giữa',
        instructions: 'Khi thấy nốt nhạc có một dòng kẻ phụ xuyên qua, đó chính là Đô giữa C4.',
        voicePrompt: 'Nốt này nằm trên dòng kẻ phụ. Bé bấm phím tương ứng nhé!',
        rounds: [
          {
            midi: 60,
            answerType: 'play',
            prompt: 'Đánh nốt nhạc bé thấy trên khuông',
            voiceText: 'Bé đánh nốt này trên đàn nào!',
            hintLevel: 0,
          },
          {
            midi: 60,
            answerType: 'choice',
            choices: ['Đô', 'Rê', 'Mi'],
            correctChoiceIndex: 0,
            prompt: 'Nốt trên dòng kẻ phụ tên là gì?',
            voiceText: 'Nốt này tên là gì nhỉ?',
          },
        ],
      },
      {
        id: 's2-sequence',
        kind: 'sequence',
        title: 'Gõ nhịp cùng Đô giữa',
        instructions: 'Bé gõ nốt Đô giữa 3 lần theo nhịp thật đều tay nhé!',
        voicePrompt: 'Bé gõ bạn Đô ba lần thật đều tay nào!',
        sequence: [60, 60, 60],
        allowPlaybackSample: true,
        titleSnippet: 'Ba tiếng Đô vui nhộn',
      },
      {
        id: 's2-memory',
        kind: 'memory-challenge',
        title: 'Thử thách phản xạ Đô giữa',
        instructions: 'Khi nốt Đô xuất hiện trên khuông, bé hãy gõ thật nhanh phím C4 nhé!',
        voicePrompt: 'Đô giữa xuất hiện! Gõ thật nhanh nào!',
        notePool: [60],
        roundCount: 3,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [1, 2, 5] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 3: Đô -- Rê -- Mi (C4, D4, E4)
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-3',
    number: 3,
    title: 'Bộ ba Đô – Rê – Mi',
    subtitle: 'Khám phá C4, D4, E4 và nhóm 2 phím đen',
    description: 'Đô bên trái, Rê ở giữa, Mi bên phải nhóm hai phím đen. Đọc nốt trên dòng và khe.',
    learningObjectives: [
      'Nhớ vị trí 3 phím: Đô (bên trái), Rê (ở giữa), Mi (bên phải 2 phím đen)',
      'Nhận biết C4 (dòng phụ), D4 (dưới dòng 1), E4 (dòng kẻ 1) trên khuông',
      'Đánh chuỗi giai điệu ngắn Đô – Rê – Mi',
    ],
    prerequisites: ['stage-2'],
    keyboardRange: { from: 57, to: 67 }, // A3 đến G4
    noteRange: [60, 62, 64],
    activities: [
      {
        id: 's3-intro',
        kind: 'intro',
        title: 'Giới thiệu Rê và Mi',
        instructions: 'Rê nằm ở giữa hai phím đen. Mi nằm ở bên phải hai phím đen.',
        voicePrompt: 'Hôm nay chúng mình làm quen với bạn Rê và bạn Mi nhé!',
        items: [
          {
            midi: 62,
            instructionText: 'Rê (D4) nằm giữa hai phím đen, treo lơ lửng sát dưới dòng kẻ 1.',
            voiceText: 'Rê nằm giữa hai phím đen, ngay dưới dòng một.',
            highlightKey: true,
            showStaffNote: true,
          },
          {
            midi: 64,
            instructionText: 'Mi (E4) nằm bên phải hai phím đen, nằm chính giữa dòng kẻ thứ nhất.',
            voiceText: 'Mi nằm bên phải hai phím đen, đậu trên dòng kẻ một.',
            highlightKey: true,
            showStaffNote: true,
          },
        ],
      },
      {
        id: 's3-find-cde',
        kind: 'find-key',
        title: 'Tìm phím Đô, Rê, Mi',
        instructions: 'Tìm đúng phím theo tên gọi trên đàn nhé.',
        voicePrompt: 'Bé hãy tìm phím đàn theo yêu cầu nhé!',
        keyboardRange: { from: 57, to: 67 },
        retryOnWrong: true,
        rounds: [
          {
            target: { kind: 'exact-midi', midi: 62 },
            prompt: 'Bấm nốt Rê (D4) - Ở giữa hai phím đen',
            voiceText: 'Bấm nốt Rê ở giữa hai phím đen nào!',
            displayMidi: 62,
            displaySymbol: 'Rê (D4)',
            hintLevel: 0,
          },
          {
            target: { kind: 'exact-midi', midi: 64 },
            prompt: 'Bấm nốt Mi (E4) - Bên phải hai phím đen',
            voiceText: 'Bấm nốt Mi ở bên phải hai phím đen!',
            displayMidi: 64,
            displaySymbol: 'Mi (E4)',
            hintLevel: 0,
          },
          {
            target: { kind: 'exact-midi', midi: 60 },
            prompt: 'Bấm lại nốt Đô giữa (C4)',
            voiceText: 'Bấm lại bạn Đô giữa C4 xem bé còn nhớ không nào!',
            displayMidi: 60,
            displaySymbol: 'Đô (C4)',
            hintLevel: 1,
          },
        ],
      },
      {
        id: 's3-staff-cde',
        kind: 'staff-recognition',
        title: 'Đọc nốt Đô, Rê, Mi trên khuông',
        instructions: 'Nhìn nốt trên khuông và gõ phím tương ứng.',
        voicePrompt: 'Nhìn nốt trên khuông và gõ phím tương ứng nhé!',
        rounds: [
          { midi: 60, answerType: 'play', prompt: 'Đánh nốt Đô giữa (dòng phụ)', voiceText: 'Đánh nốt trên khuông nào!', hintLevel: 0 },
          { midi: 62, answerType: 'play', prompt: 'Đánh nốt Rê (dưới dòng kẻ 1)', voiceText: 'Đánh nốt Rê nào!', hintLevel: 0 },
          { midi: 64, answerType: 'play', prompt: 'Đánh nốt Mi (trên dòng kẻ 1)', voiceText: 'Đánh nốt Mi nào!', hintLevel: 1 },
        ],
      },
      {
        id: 's3-sequence',
        kind: 'sequence',
        title: 'Bậc thang Đô – Rê – Mi',
        instructions: 'Gõ chuỗi nốt theo thứ tự từ thấp lên cao Đô -> Rê -> Mi.',
        voicePrompt: 'Cùng bước lên bậc thang Đô, Rê, Mi nào!',
        sequence: [60, 62, 64],
        allowPlaybackSample: true,
        titleSnippet: 'Bậc thang Đô – Rê – Mi',
      },
      {
        id: 's3-memory',
        kind: 'memory-challenge',
        title: 'Thử thách phản xạ C-D-E',
        instructions: 'Nhìn nhanh nốt trên khuông và gõ phím đúng không cần nhìn tên nốt.',
        voicePrompt: 'Thử thách phản xạ! Bé đọc nốt thật nhanh nhé!',
        notePool: [60, 62, 64],
        roundCount: 4,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [1, 3, 6] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 4: Fa -- Sol (F4, G4)
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-4',
    number: 4,
    title: 'Bộ đôi Fa – Sol',
    subtitle: 'Khám phá nhóm 3 phím đen và dòng khóa Sol',
    description: 'Fa bên trái nhóm 3 phím đen, Sol nằm ở khe đầu tiên của nhóm 3 phím đen (dòng kẻ 2).',
    learningObjectives: [
      'Nhận biết nhóm 3 phím đen trên đàn',
      'Định vị F4 (bên trái 3 phím đen) và G4 (dòng kẻ 2)',
      'Hiểu dòng kẻ 2 là dòng mang tên khóa Sol',
      'Chơi được chuỗi 5 nốt Đô – Rê – Mi – Fa – Sol',
    ],
    prerequisites: ['stage-3'],
    keyboardRange: { from: 57, to: 71 }, // A3 đến B4
    noteRange: [65, 67],
    activities: [
      {
        id: 's4-intro',
        kind: 'intro',
        title: 'Làm quen bạn Fa và bạn Sol',
        instructions: 'Fa đứng bên trái nhóm 3 phím đen. Sol nằm ở dòng thứ hai mang tên khóa Sol.',
        voicePrompt: 'Chào mừng bé đến với nhóm ba phím đen: bạn Fa và bạn Sol!',
        items: [
          {
            midi: 65,
            instructionText: 'Fa (F4) nằm ngay bên trái 3 phím đen, ở khe thứ 1 của khuông nhạc.',
            voiceText: 'Fa đứng bên trái ba phím đen, ở khe thứ nhất.',
            highlightKey: true,
            showStaffNote: true,
          },
          {
            midi: 67,
            instructionText: 'Sol (G4) nằm trên dòng kẻ thứ 2 - chính là dòng khóa Sol xoay quanh!',
            voiceText: 'Sol nằm trên dòng kẻ thứ hai, dòng mang tên khóa Sol đấy!',
            highlightKey: true,
            showStaffNote: true,
          },
        ],
      },
      {
        id: 's4-find-fg',
        kind: 'find-key',
        title: 'Tìm phím Fa và Sol',
        instructions: 'Tìm phím Fa và Sol dựa vào nhóm 3 phím đen nhé.',
        voicePrompt: 'Bé tìm phím Fa và Sol trên đàn nào!',
        keyboardRange: { from: 57, to: 71 },
        retryOnWrong: true,
        rounds: [
          {
            target: { kind: 'exact-midi', midi: 65 },
            prompt: 'Bấm nốt Fa (F4) - Bên trái nhóm 3 phím đen',
            voiceText: 'Bấm nốt Fa bên trái nhóm ba phím đen!',
            displayMidi: 65,
            displaySymbol: 'Fa (F4)',
            hintLevel: 0,
          },
          {
            target: { kind: 'exact-midi', midi: 67 },
            prompt: 'Bấm nốt Sol (G4) - Dòng khóa Sol',
            voiceText: 'Bấm nốt Sol nào!',
            displayMidi: 67,
            displaySymbol: 'Sol (G4)',
            hintLevel: 1,
          },
        ],
      },
      {
        id: 's4-staff-fg',
        kind: 'staff-recognition',
        title: 'Nhận diện Fa và Sol trên khuông',
        instructions: 'Khe 1 là Fa, dòng kẻ 2 là Sol. Bé hãy đọc thật chuẩn nhé.',
        voicePrompt: 'Đọc nốt trên khuông nhạc nào!',
        rounds: [
          { midi: 65, answerType: 'play', prompt: 'Đánh nốt Fa (khe 1)', voiceText: 'Đánh nốt Fa ở khe một nào!', hintLevel: 0 },
          { midi: 67, answerType: 'play', prompt: 'Đánh nốt Sol (dòng 2)', voiceText: 'Đánh nốt Sol ở dòng hai nào!', hintLevel: 1 },
        ],
      },
      {
        id: 's4-sequence',
        kind: 'sequence',
        title: 'Năm nốt Đô đến Sol',
        instructions: 'Đánh liên tục 5 nốt từ Đô đến Sol thật mượt mà nhé!',
        voicePrompt: 'Gõ chuỗi năm nốt Đô, Rê, Mi, Fa, Sol nào!',
        sequence: [60, 62, 64, 65, 67],
        allowPlaybackSample: true,
        titleSnippet: '5 nốt đầu tiên',
      },
      {
        id: 's4-memory',
        kind: 'memory-challenge',
        title: 'Thử thách 5 nốt C-D-E-F-G',
        instructions: 'Phản xạ nhanh 5 nốt đã học trên khuông.',
        voicePrompt: 'Thử thách phản xạ năm nốt! Bé sẵn sàng chưa?',
        notePool: [60, 62, 64, 65, 67],
        roundCount: 5,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [1, 3, 7] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 5: La -- Si -- Đô cao (A4, B4, C5)
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-5',
    number: 5,
    title: 'La – Si – Đô cao',
    subtitle: 'Hoàn thành trọn vẹn quãng 8 đầu tiên',
    description: 'La ở khe 2, Si ở dòng 3 (bên phải 3 phím đen), và Đô cao C5 ở khe 3 bên trái nhóm 2 phím đen tiếp theo.',
    learningObjectives: [
      'Định vị A4 (khe 2) và B4 (dòng kẻ 3)',
      'Nhận diện C5 (Đô cao, MIDI 72) ở khe 3',
      'Phân biệt Đô giữa (C4) và Đô cao (C5)',
      'Nắm trọn vẹn 8 phím trắng trong một quãng tám',
    ],
    prerequisites: ['stage-4'],
    keyboardRange: { from: 60, to: 74 }, // C4 đến D5
    noteRange: [69, 71, 72],
    activities: [
      {
        id: 's5-intro',
        kind: 'intro',
        title: 'Gặp gỡ La, Si và Đô cao',
        instructions: 'La nằm ở khe 2, Si ở dòng 3, và Đô cao C5 nằm ở khe 3.',
        voicePrompt: 'Chúng mình cùng làm quen với bạn La, bạn Si và bạn Đô cao C5 nhé!',
        items: [
          {
            midi: 69,
            instructionText: 'La (A4) nằm ở khe thứ 2 giữa dòng 2 và dòng 3.',
            voiceText: 'La nằm ở khe thứ hai của khuông nhạc.',
            highlightKey: true,
            showStaffNote: true,
          },
          {
            midi: 71,
            instructionText: 'Si (B4) nằm ngay bên phải nhóm 3 phím đen, trên dòng kẻ thứ 3.',
            voiceText: 'Si đứng bên phải nhóm ba phím đen, ở dòng ba.',
            highlightKey: true,
            showStaffNote: true,
          },
          {
            midi: 72,
            instructionText: 'Đô cao (C5) nằm ở khe thứ 3, bên trái nhóm 2 phím đen tiếp theo.',
            voiceText: 'Và đây là Đô cao C5, bạn của Đô giữa nhưng bổng hơn một quãng tám!',
            highlightKey: true,
            showStaffNote: true,
          },
        ],
      },
      {
        id: 's5-find-key',
        kind: 'find-key',
        title: 'Tìm phím La, Si, Đô cao',
        instructions: 'Tìm phím La, Si và Đô cao trên đàn.',
        voicePrompt: 'Tìm các phím La, Si và Đô cao nhé!',
        keyboardRange: { from: 60, to: 74 },
        retryOnWrong: true,
        rounds: [
          { target: { kind: 'exact-midi', midi: 69 }, prompt: 'Bấm nốt La (A4)', voiceText: 'Bấm nốt La nào!', displayMidi: 69, hintLevel: 0 },
          { target: { kind: 'exact-midi', midi: 71 }, prompt: 'Bấm nốt Si (B4)', voiceText: 'Bấm nốt Si nào!', displayMidi: 71, hintLevel: 0 },
          { target: { kind: 'exact-midi', midi: 72 }, prompt: 'Bấm nốt Đô cao (C5)', voiceText: 'Bấm nốt Đô cao C5 nào!', displayMidi: 72, hintLevel: 1 },
        ],
      },
      {
        id: 's5-staff-recognition',
        kind: 'staff-recognition',
        title: 'Đọc nốt La, Si, Đô cao trên khuông',
        instructions: 'Gõ đúng phím cho nốt La, Si hoặc Đô cao trên khuông.',
        voicePrompt: 'Bé đọc nốt trên khuông nhạc nhé!',
        rounds: [
          { midi: 69, answerType: 'play', prompt: 'Đánh nốt La (khe 2)', voiceText: 'Đánh nốt La nào!', hintLevel: 0 },
          { midi: 71, answerType: 'play', prompt: 'Đánh nốt Si (dòng 3)', voiceText: 'Đánh nốt Si nào!', hintLevel: 0 },
          { midi: 72, answerType: 'play', prompt: 'Đánh nốt Đô cao (khe 3)', voiceText: 'Đánh nốt Đô cao nào!', hintLevel: 1 },
        ],
      },
      {
        id: 's5-sequence',
        kind: 'sequence',
        title: 'Chuỗi nốt lên đỉnh Đô cao',
        instructions: 'Gõ chuỗi Sol – La – Si – Đô cao.',
        voicePrompt: 'Cùng leo lên đỉnh núi Đô cao: Sol, La, Si, Đô nào!',
        sequence: [67, 69, 71, 72],
        allowPlaybackSample: true,
        titleSnippet: 'Leo núi Đô cao',
      },
      {
        id: 's5-memory',
        kind: 'memory-challenge',
        title: 'Thử thách phản xạ La – Si – Đô cao',
        instructions: 'Gõ nhanh khi nốt xuất hiện trên khuông.',
        voicePrompt: 'Thử thách phản xạ! Chơi thật nhanh nào!',
        notePool: [69, 71, 72],
        roundCount: 4,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [1, 3, 7] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 6: Khuông nhạc khóa Sol từ C4 đến C5
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-6',
    number: 6,
    title: 'Khuông nhạc khóa Sol',
    subtitle: 'Đọc trôi chảy 8 nốt từ C4 đến C5',
    description: 'Thành thạo đọc nốt trên dòng và khe của khóa Sol: Đô - Rê - Mi - Fa - Sol - La - Si - Đô.',
    learningObjectives: [
      'Phân biệt rõ nốt nằm trên DÒNG và nốt nằm trong KHE',
      'Đọc nhanh bất kỳ nốt nào trong 8 nốt từ C4 đến C5',
      'Liên hệ trực tiếp vị trí trên khuông với phím đàn',
    ],
    prerequisites: ['stage-5'],
    keyboardRange: { from: 60, to: 72 }, // C4 đến C5
    noteRange: [60, 62, 64, 65, 67, 69, 71, 72],
    activities: [
      {
        id: 's6-staff-practice',
        kind: 'staff-recognition',
        title: 'Đọc nốt trên dòng và khe',
        instructions: 'Nhìn nốt trên khuông và gõ phím tương ứng không cần gợi ý màu.',
        voicePrompt: 'Bé hãy đọc nốt trên khuông và gõ phím đúng trên đàn nhé!',
        rounds: [
          { midi: 60, answerType: 'play', prompt: 'Nốt Đô giữa', voiceText: 'Đánh nốt Đô giữa', hintLevel: 1 },
          { midi: 64, answerType: 'play', prompt: 'Nốt Mi (dòng 1)', voiceText: 'Đánh nốt Mi', hintLevel: 1 },
          { midi: 67, answerType: 'play', prompt: 'Nốt Sol (dòng 2)', voiceText: 'Đánh nốt Sol', hintLevel: 1 },
          { midi: 71, answerType: 'play', prompt: 'Nốt Si (dòng 3)', voiceText: 'Đánh nốt Si', hintLevel: 1 },
          { midi: 65, answerType: 'play', prompt: 'Nốt Fa (khe 1)', voiceText: 'Đánh nốt Fa', hintLevel: 1 },
          { midi: 69, answerType: 'play', prompt: 'Nốt La (khe 2)', voiceText: 'Đánh nốt La', hintLevel: 1 },
          { midi: 72, answerType: 'play', prompt: 'Nốt Đô cao (khe 3)', voiceText: 'Đánh nốt Đô cao', hintLevel: 1 },
        ],
      },
      {
        id: 's6-find-key',
        kind: 'find-key',
        title: 'Tìm phím theo tên gọi',
        instructions: 'Bé nghe tên nốt và tìm nhanh phím đàn tương ứng.',
        voicePrompt: 'Nghe tên nốt và gõ phím trên đàn nhé!',
        keyboardRange: { from: 60, to: 72 },
        retryOnWrong: true,
        rounds: [
          { target: { kind: 'exact-midi', midi: 64 }, prompt: 'Bấm nốt Mi', voiceText: 'Bấm nốt Mi!', displaySymbol: 'Mi (E4)', hintLevel: 1 },
          { target: { kind: 'exact-midi', midi: 67 }, prompt: 'Bấm nốt Sol', voiceText: 'Bấm nốt Sol!', displaySymbol: 'Sol (G4)', hintLevel: 1 },
          { target: { kind: 'exact-midi', midi: 69 }, prompt: 'Bấm nốt La', voiceText: 'Bấm nốt La!', displaySymbol: 'La (A4)', hintLevel: 1 },
          { target: { kind: 'exact-midi', midi: 62 }, prompt: 'Bấm nốt Rê', voiceText: 'Bấm nốt Rê!', displaySymbol: 'Rê (D4)', hintLevel: 1 },
        ],
      },
      {
        id: 's6-listening',
        kind: 'listening',
        title: 'So sánh cao độ các nốt',
        instructions: 'Nghe hai nốt và nhận biết nốt thứ hai cao hơn hay thấp hơn.',
        voicePrompt: 'Nghe xem nốt thứ hai cao hơn hay thấp hơn nốt thứ nhất nhé!',
        rounds: [
          { firstMidi: 60, secondMidi: 67, comparison: 'higher', prompt: 'Nốt thứ hai Cao hơn hay Thấp hơn?', voiceText: 'Cao hơn hay thấp hơn?' },
          { firstMidi: 72, secondMidi: 64, comparison: 'lower', prompt: 'Nốt thứ hai Cao hơn hay Thấp hơn?', voiceText: 'Cao hơn hay thấp hơn?' },
        ],
      },
      {
        id: 's6-memory',
        kind: 'memory-challenge',
        title: 'Thử thách phản xạ toàn diện',
        instructions: '8 nốt xuất hiện ngẫu nhiên không có gợi ý tên hoặc màu.',
        voicePrompt: 'Thử thách phản xạ toàn diện 8 nốt! Cố lên bé nhé!',
        notePool: [60, 62, 64, 65, 67, 69, 71, 72],
        roundCount: 6,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [2, 4, 8] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 7: Chơi chuỗi nốt và giai điệu đơn giản
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-7',
    number: 7,
    title: 'Giai điệu vui vẻ',
    subtitle: 'Chơi các chuỗi nốt và giai điệu quen thuộc',
    description: 'Bé đánh chuỗi 3–5 nốt nhạc nối tiếp nhau tạo thành các giai điệu thân quen.',
    learningObjectives: [
      'Gõ nối tiếp chuỗi nốt theo thứ tự từ trái sang phải',
      'Dừng và đánh lại nốt đúng nếu bị gõ nhầm',
      'Cảm nhận tính liên tục của bài nhạc',
    ],
    prerequisites: ['stage-6'],
    keyboardRange: { from: 60, to: 72 }, // C4 đến C5
    noteRange: [60, 62, 64, 65, 67, 69, 71, 72],
    activities: [
      {
        id: 's7-seq-hotcross',
        kind: 'sequence',
        title: 'Giai điệu Bánh bao nóng (Mi – Rê – Đô)',
        instructions: 'Gõ chuỗi nốt đi xuống Mi -> Rê -> Đô.',
        voicePrompt: 'Cùng chơi khúc nhạc đi xuống: Mi, Rê, Đô nào!',
        sequence: [64, 62, 60],
        allowPlaybackSample: true,
        titleSnippet: 'Bánh bao nóng (Mi – Rê – Đô)',
      },
      {
        id: 's7-seq-mary',
        kind: 'sequence',
        title: 'Chú cừu nhỏ của Mary',
        instructions: 'Chuỗi 5 nốt quen thuộc: Mi - Rê - Đô - Rê - Mi.',
        voicePrompt: 'Bài hát Chú cừu nhỏ của Mary: Mi, Rê, Đô, Rê, Mi!',
        sequence: [64, 62, 60, 62, 64],
        allowPlaybackSample: true,
        titleSnippet: 'Chú cừu nhỏ',
      },
      {
        id: 's7-seq-scale',
        kind: 'sequence',
        title: 'Thang âm Đô trưởng đầy đủ',
        instructions: 'Đánh trọn vẹn 8 nốt từ Đô giữa lên Đô cao!',
        voicePrompt: 'Thang âm Đô trưởng: Đô, Rê, Mi, Fa, Sol, La, Si, Đô!',
        sequence: [60, 62, 64, 65, 67, 69, 71, 72],
        allowPlaybackSample: true,
        titleSnippet: 'Thang âm 8 nốt',
      },
      {
        id: 's7-memory',
        kind: 'memory-challenge',
        title: 'Thử thách phản xạ giai điệu',
        instructions: 'Đọc nốt nhanh và chính xác.',
        voicePrompt: 'Đọc nốt phản xạ nhanh nào!',
        notePool: [60, 62, 64, 65, 67, 69, 71, 72],
        roundCount: 6,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.8,
      minTestAccuracy: 0.85,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [2, 5, 10] },
  },

  // ─────────────────────────────────────────────────────────────
  // STAGE 8: Ôn tập ngẫu nhiên, không gợi ý
  // ─────────────────────────────────────────────────────────────
  {
    stageId: 'stage-8',
    number: 8,
    title: 'Đấu trường ghi nhớ',
    subtitle: 'Ôn tập độc lập không màu, không gợi ý',
    description: 'Đánh giá năng lực độc lập hoàn toàn: nốt xuất hiện ngẫu nhiên trên khuông, không có màu sắc và không có gợi ý phím.',
    learningObjectives: [
      'Đọc nốt chính xác độc lập 100% không cần hỗ trợ',
      'Đạt độ chính xác cao và phản xạ tự nhiên',
      'Sẵn sàng học các bài piano hoàn chỉnh',
    ],
    prerequisites: ['stage-7'],
    keyboardRange: { from: 60, to: 72 },
    noteRange: [60, 62, 64, 65, 67, 69, 71, 72],
    activities: [
      {
        id: 's8-independent-staff',
        kind: 'staff-recognition',
        title: 'Kiểm tra đọc khuông độc lập',
        instructions: 'Nốt xuất hiện ngẫu nhiên không có màu và không có tên nốt.',
        voicePrompt: 'Đọc nốt độc lập trên khuông! Bé hãy gõ thật chính xác nhé!',
        rounds: [
          { midi: 62, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 67, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 60, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 71, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 65, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 69, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 64, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
          { midi: 72, answerType: 'play', prompt: 'Đánh nốt trên khuông', voiceText: 'Đánh nốt trên khuông', hintLevel: 2 },
        ],
      },
      {
        id: 's8-grand-memory',
        kind: 'memory-challenge',
        title: 'Thử thách trí nhớ siêu phàm',
        instructions: '10 lượt nốt ngẫu nhiên để hoàn thành chứng nhận Master.',
        voicePrompt: 'Thử thách trí nhớ siêu phàm! Chinh phục huy hiệu khám phá nốt nhạc nào!',
        notePool: [60, 62, 64, 65, 67, 69, 71, 72],
        roundCount: 10,
        hintLevel: 2,
      },
    ],
    assessment: {
      minPracticeAccuracy: 0.85,
      minTestAccuracy: 0.9,
      requiresIndependentConfirmations: 2,
    },
    reviewRules: { spacedIntervalDays: [3, 7, 14, 30] },
  },
];
