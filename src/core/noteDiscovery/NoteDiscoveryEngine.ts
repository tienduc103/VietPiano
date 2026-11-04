/**
 * NoteDiscoveryEngine: Máy trạng thái (FSM) thuần TypeScript quản lý toàn bộ phiên học Khám phá nốt nhạc.
 * Không phụ thuộc React, 100% testable bằng unit test.
 */
import {
  getNoteDefinition,
  validateExpectedInput,
  type NoteDefinition,
} from './musicModel';
import type {
  DiscoveryActivity,
  DiscoveryStage,
  HintLevel,
} from './types';

export type SessionStatus =
  | 'ready'
  | 'active'
  | 'step-correct'
  | 'step-wrong'
  | 'activity-complete'
  | 'stage-complete';

export interface AnswerResult {
  isCorrect: boolean;
  status: SessionStatus;
  feedbackText?: string;
  expectedMidi?: number;
  playedMidi?: number;
  responseTimeMs: number;
}

export interface ActivityProgress {
  totalRounds: number;
  currentRound: number; // 0-based
  correctRounds: number;
  wrongRounds: number;
  accuracy: number;
}

export interface NoteDiscoveryEngineState {
  stage: DiscoveryStage;
  activityIndex: number;
  activity: DiscoveryActivity;
  status: SessionStatus;
  roundIndex: number;
  totalRounds: number;
  /** Nốt nhạc hiện tại đang yêu cầu (nếu có) */
  currentNote: NoteDefinition | null;
  /** Danh sách nốt hiển thị trên khuông nhạc (cho Sequence hoặc Single Note) */
  staffNotes: { midi: number; isCurrent: boolean; isCorrect?: boolean; isWrong?: boolean }[];
  /** Phím đàn cần highlight trên bàn phím (nếu hint level cho phép) */
  highlightedKeys: number[];
  /** Nốt dự kiến (để PianoKeyboard tô viền nếu hint cho phép) */
  expectedKey: number | null;
  /** Mức độ gợi ý hiện tại */
  hintLevel: HintLevel;
  /** Tiến độ chuỗi nốt (cho Activity 5: Sequence) */
  sequenceIndex: number;
  sequenceMidis: number[];
  /** Kết quả lần bấm gần nhất (flash feedback) */
  lastOutcome: { midi: number; kind: 'correct' | 'wrong' } | null;
  lastOutcomeTime: number;
  /** Thống kê phiên */
  attempts: number;
  correctCount: number;
  responseTimes: number[];
  mistakes: Record<string, number>;
  activityProgress: ActivityProgress;
}

export class NoteDiscoveryEngine {
  private state: NoteDiscoveryEngineState;
  private readonly listeners = new Set<(s: NoteDiscoveryEngineState) => void>();
  private roundStartedAt: number = 0;
  private heldKeys = new Set<number>();
  private memoryRounds: number[] = [];

  constructor(stage: DiscoveryStage, activityIndex = 0) {
    this.state = this.buildInitialState(stage, activityIndex);
    this.startRound(0);
  }

  public getState(): NoteDiscoveryEngineState {
    return this.state;
  }

  public subscribe(listener: (s: NoteDiscoveryEngineState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn(this.state));
  }

  private buildInitialState(stage: DiscoveryStage, activityIndex = 0): NoteDiscoveryEngineState {
    const act = stage.activities[activityIndex] ?? stage.activities[0];
    const totalRounds = this.calculateTotalRounds(act);

    return {
      stage,
      activityIndex,
      activity: act,
      status: 'ready',
      roundIndex: 0,
      totalRounds,
      currentNote: null,
      staffNotes: [],
      highlightedKeys: [],
      expectedKey: null,
      hintLevel: act.hintLevelDefault ?? 0,
      sequenceIndex: 0,
      sequenceMidis: [],
      lastOutcome: null,
      lastOutcomeTime: 0,
      attempts: 0,
      correctCount: 0,
      responseTimes: [],
      mistakes: {},
      activityProgress: {
        totalRounds,
        currentRound: 0,
        correctRounds: 0,
        wrongRounds: 0,
        accuracy: 1,
      },
    };
  }

  private calculateTotalRounds(activity: DiscoveryActivity): number {
    switch (activity.kind) {
      case 'intro':
        return activity.items.length;
      case 'find-key':
        return activity.rounds.length;
      case 'staff-recognition':
        return activity.rounds.length;
      case 'listening':
        return activity.rounds.length;
      case 'sequence':
        return 1;
      case 'memory-challenge':
        return activity.roundCount;
    }
  }

  public startRound(roundIndex: number, now = Date.now()): void {
    const { activity } = this.state;
    this.roundStartedAt = now;

    let currentNote: NoteDefinition | null = null;
    let staffNotes: { midi: number; isCurrent: boolean }[] = [];
    let highlightedKeys: number[] = [];
    let expectedKey: number | null = null;
    let hintLevel: HintLevel = activity.hintLevelDefault ?? 0;
    let sequenceIndex = 0;
    let sequenceMidis: number[] = [];

    switch (activity.kind) {
      case 'intro': {
        const item = activity.items[roundIndex];
        if (item) {
          currentNote = getNoteDefinition(item.midi);
          if (item.showStaffNote) {
            staffNotes = [{ midi: item.midi, isCurrent: true }];
          }
          if (item.highlightKey) {
            highlightedKeys = [item.midi];
            expectedKey = item.midi;
          }
        }
        break;
      }

      case 'find-key': {
        const round = activity.rounds[roundIndex];
        if (round) {
          hintLevel = round.hintLevel ?? 0;
          if (round.target.kind === 'exact-midi') {
            currentNote = getNoteDefinition(round.target.midi);
            staffNotes = [{ midi: round.target.midi, isCurrent: true }];
            if (hintLevel === 0) {
              highlightedKeys = [round.target.midi];
              expectedKey = round.target.midi;
            }
          } else if (round.target.kind === 'black-group') {
            if (hintLevel === 0) {
              highlightedKeys = round.target.groupSize === 2 ? [61, 63] : [66, 68, 70];
            }
          }
        }
        break;
      }

      case 'staff-recognition': {
        const round = activity.rounds[roundIndex];
        if (round) {
          hintLevel = round.hintLevel ?? 0;
          currentNote = getNoteDefinition(round.midi);
          staffNotes = [{ midi: round.midi, isCurrent: true }];
          if (hintLevel === 0) {
            highlightedKeys = [round.midi];
            expectedKey = round.midi;
          }
        }
        break;
      }

      case 'listening': {
        const round = activity.rounds[roundIndex];
        if (round) {
          currentNote = getNoteDefinition(round.firstMidi);
          staffNotes = [
            { midi: round.firstMidi, isCurrent: false },
            { midi: round.secondMidi, isCurrent: true },
          ];
        }
        break;
      }

      case 'sequence': {
        sequenceMidis = [...activity.sequence];
        sequenceIndex = 0;
        staffNotes = sequenceMidis.map((m, idx) => ({ midi: m, isCurrent: idx === 0 }));
        const firstMidi = sequenceMidis[0];
        if (firstMidi !== undefined) {
          currentNote = getNoteDefinition(firstMidi);
          if (hintLevel === 0) {
            highlightedKeys = [firstMidi];
            expectedKey = firstMidi;
          }
        }
        break;
      }

      case 'memory-challenge': {
        if (this.memoryRounds.length === 0) {
          // Khởi tạo các nốt ngẫu nhiên từ pool
          const pool = activity.notePool;
          for (let i = 0; i < activity.roundCount; i++) {
            const picked = pool[Math.floor(Math.random() * pool.length)] ?? 60;
            this.memoryRounds.push(picked);
          }
        }
        const midi = this.memoryRounds[roundIndex] ?? 60;
        currentNote = getNoteDefinition(midi);
        staffNotes = [{ midi, isCurrent: true }];
        hintLevel = activity.hintLevel;
        // Memory challenge không highlight phím để kiểm tra độc lập
        break;
      }
    }

    this.state = {
      ...this.state,
      status: 'active',
      roundIndex,
      currentNote,
      staffNotes,
      highlightedKeys,
      expectedKey,
      hintLevel,
      sequenceIndex,
      sequenceMidis,
      activityProgress: {
        ...this.state.activityProgress,
        currentRound: roundIndex,
      },
    };
    this.notify();
  }

  /**
   * Xử lý note-on từ MIDI / virtual keyboard / mic
   */
  public handleNoteOn(midi: number, time = Date.now()): AnswerResult {
    // Chống double event nếu phím đang được giữ
    if (this.heldKeys.has(midi)) {
      return { isCorrect: false, status: this.state.status, responseTimeMs: 0 };
    }
    this.heldKeys.add(midi);

    return this.evaluateAnswer({ midi }, time);
  }

  public handleNoteOff(midi: number): void {
    this.heldKeys.delete(midi);
  }

  /**
   * Xử lý lựa chọn trắc nghiệm (cho Activity 3 hoặc 4)
   */
  public handleChoice(choiceIndex: number, time = Date.now()): AnswerResult {
    return this.evaluateAnswer({ choiceIndex }, time);
  }

  private evaluateAnswer(input: { midi?: number; choiceIndex?: number }, now = Date.now()): AnswerResult {
    if (this.state.status !== 'active') {
      return { isCorrect: false, status: this.state.status, responseTimeMs: 0 };
    }

    const { activity, roundIndex } = this.state;
    const responseTime = Math.max(0, now - this.roundStartedAt);
    let isCorrect = false;
    let feedbackText: string | undefined;
    let targetMidi: number | undefined;

    switch (activity.kind) {
      case 'intro': {
        const item = activity.items[roundIndex];
        if (item && input.midi !== undefined) {
          isCorrect = input.midi === item.midi;
          targetMidi = item.midi;
        }
        break;
      }

      case 'find-key': {
        const round = activity.rounds[roundIndex];
        if (round) {
          const val = validateExpectedInput(round.target, input);
          isCorrect = val.isCorrect;
          feedbackText = val.feedbackText;
          if (round.target.kind === 'exact-midi') targetMidi = round.target.midi;
        }
        break;
      }

      case 'staff-recognition': {
        const round = activity.rounds[roundIndex];
        if (round) {
          if (round.answerType === 'play' && input.midi !== undefined) {
            isCorrect = input.midi === round.midi;
            targetMidi = round.midi;
          } else if (round.answerType === 'choice' && input.choiceIndex !== undefined) {
            isCorrect = input.choiceIndex === round.correctChoiceIndex;
            targetMidi = round.midi;
          }
        }
        break;
      }

      case 'listening': {
        const round = activity.rounds[roundIndex];
        if (round && input.choiceIndex !== undefined) {
          // 0: Cao hơn, 1: Thấp hơn, 2: Bằng nhau
          const choiceMap = ['higher', 'lower', 'equal'] as const;
          const chosen = choiceMap[input.choiceIndex];
          isCorrect = chosen === round.comparison;
        }
        break;
      }

      case 'sequence': {
        const expectedMidi = this.state.sequenceMidis[this.state.sequenceIndex];
        targetMidi = expectedMidi;
        if (input.midi !== undefined && expectedMidi !== undefined) {
          isCorrect = input.midi === expectedMidi;
        }
        break;
      }

      case 'memory-challenge': {
        const expectedMidi = this.memoryRounds[roundIndex] ?? 60;
        targetMidi = expectedMidi;
        if (input.midi !== undefined) {
          isCorrect = input.midi === expectedMidi;
        }
        break;
      }
    }

    // Ghi nhận thống kê
    const attempts = this.state.attempts + 1;
    const correctCount = this.state.correctCount + (isCorrect ? 1 : 0);
    const responseTimes = [...this.state.responseTimes, responseTime];
    const mistakes = { ...this.state.mistakes };
    if (!isCorrect && input.midi !== undefined && targetMidi !== undefined) {
      const key = `${targetMidi}->${input.midi}`;
      mistakes[key] = (mistakes[key] ?? 0) + 1;
    }

    // Xử lý tiến độ theo từng loại hoạt động
    if (activity.kind === 'sequence') {
      if (isCorrect) {
        const nextSeqIdx = this.state.sequenceIndex + 1;
        const isSequenceComplete = nextSeqIdx >= this.state.sequenceMidis.length;
        const newStaffNotes = this.state.sequenceMidis.map((m, idx) => ({
          midi: m,
          isCurrent: idx === nextSeqIdx,
          isCorrect: idx < nextSeqIdx,
        }));

        if (isSequenceComplete) {
          this.state = {
            ...this.state,
            status: 'activity-complete',
            sequenceIndex: nextSeqIdx,
            staffNotes: newStaffNotes,
            lastOutcome: { midi: input.midi ?? targetMidi ?? 60, kind: 'correct' },
            lastOutcomeTime: now,
            attempts,
            correctCount,
            responseTimes,
            mistakes,
          };
        } else {
          const nextMidi = this.state.sequenceMidis[nextSeqIdx];
          this.state = {
            ...this.state,
            sequenceIndex: nextSeqIdx,
            currentNote: nextMidi !== undefined ? getNoteDefinition(nextMidi) : null,
            expectedKey: this.state.hintLevel === 0 ? nextMidi ?? null : null,
            highlightedKeys: this.state.hintLevel === 0 && nextMidi !== undefined ? [nextMidi] : [],
            staffNotes: newStaffNotes,
            lastOutcome: { midi: input.midi ?? targetMidi ?? 60, kind: 'correct' },
            lastOutcomeTime: now,
            attempts,
            correctCount,
            responseTimes,
            mistakes,
          };
        }
        this.notify();
        return { isCorrect: true, status: this.state.status, responseTimeMs: responseTime };
      } else {
        // Chuỗi nốt đánh sai: không tự chuyển, giữ vị trí chờ đánh lại
        this.state = {
          ...this.state,
          lastOutcome: { midi: input.midi ?? 0, kind: 'wrong' },
          lastOutcomeTime: now,
          attempts,
          mistakes,
        };
        this.notify();
        return { isCorrect: false, status: 'active', feedbackText, responseTimeMs: responseTime };
      }
    }

    // Các hoạt động khác:
    const correctRounds = this.state.activityProgress.correctRounds + (isCorrect ? 1 : 0);
    const wrongRounds = this.state.activityProgress.wrongRounds + (isCorrect ? 0 : 1);
    const totalDone = correctRounds + wrongRounds;
    const accuracy = totalDone > 0 ? correctRounds / totalDone : 1;

    const nextRound = roundIndex + 1;
    const isActivityComplete = nextRound >= this.state.totalRounds;
    const newStatus: SessionStatus = isCorrect
      ? isActivityComplete
        ? 'activity-complete'
        : 'step-correct'
      : 'step-wrong';

    this.state = {
      ...this.state,
      status: newStatus,
      lastOutcome: { midi: input.midi ?? targetMidi ?? 60, kind: isCorrect ? 'correct' : 'wrong' },
      lastOutcomeTime: now,
      attempts,
      correctCount,
      responseTimes,
      mistakes,
      activityProgress: {
        ...this.state.activityProgress,
        correctRounds,
        wrongRounds,
        accuracy,
      },
    };
    this.notify();

    return {
      isCorrect,
      status: newStatus,
      feedbackText,
      expectedMidi: targetMidi,
      playedMidi: input.midi,
      responseTimeMs: responseTime,
    };
  }

  public advance(): void {
    if (this.state.status === 'activity-complete') {
      const nextActIndex = this.state.activityIndex + 1;
      if (nextActIndex >= this.state.stage.activities.length) {
        this.state = { ...this.state, status: 'stage-complete' };
        this.notify();
        return;
      }
      // Chuyển sang activity tiếp theo trong stage
      this.state = this.buildInitialState(this.state.stage, nextActIndex);
      this.memoryRounds = [];
      this.startRound(0);
      return;
    }

    // Chuyển round tiếp theo
    this.startRound(this.state.roundIndex + 1);
  }

  public retryCurrentRound(): void {
    this.startRound(this.state.roundIndex);
  }
}
