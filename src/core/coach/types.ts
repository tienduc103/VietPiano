/**
 * AI Piano Coach — mô hình dữ liệu dùng chung (xem docs/ai-coach/architecture.md §4).
 *
 * Bốn thành phần giao tiếp qua các kiểu ở đây:
 *  A. Recorder  → `RecordedSession` (log gốc, KHÔNG sửa mốc thời gian) → `BuiltPerformance` (nốt đã ghép, pedal, ngân)
 *  B. Scoring   → `ScoreReference` + `BuiltPerformance` → `ScoringResult` (issues truy vết được, có phiên bản)
 *  C. Teaching  → `AIFeedback` (AI cục bộ hoặc theo quy tắc), `PracticeRecommendation`, `PracticePlan`
 *  D. UI chỉ đọc các kiểu này.
 */
import type { InputSource } from '../input/NoteInputProvider';
import type { DynamicMark } from '../music/dynamics';
import type { PedalRange } from '../music/pedal';
import type { Hand } from '../lessons/types';

// ── Phiên bản thuật toán (lưu cùng mọi kết quả → chấm lại được bằng bản mới, không mất bản cũ) ──
export const RECORDER_VERSION = '1.0.0';
/** 1.1.0: nhận biết chơi lại (DTW có bước nhảy lùi) — đoạn chơi lại không còn bị tính nốt thừa. */
export const SCORING_ENGINE_VERSION = '1.1.0';
export const ALIGNMENT_VERSION = 'dtw-jumps-2';
export const WEIGHTS_VERSION = 'coach-weights-1';

/** Chế độ chấm: A kỹ thuật · B biểu diễn · C tiến bộ (= A + so với lịch sử của chính người học). */
export type CoachMode = 'technical' | 'performance' | 'progress';

export const COACH_MODE_LABEL: Record<CoachMode, string> = {
  technical: 'Chấm kỹ thuật',
  performance: 'Chấm biểu diễn',
  progress: 'Chấm tiến bộ',
};

/** Hồ sơ người học (`LearnerProfile.id`) hoặc 'guest' khi chưa có hồ sơ. */
export type ProfileKey = string;
export const GUEST_PROFILE = 'guest';

// ════════════════════════════ A. Ghi biểu diễn ════════════════════════════

export type SessionStatus = 'recording' | 'paused' | 'completed' | 'interrupted' | 'aborted';

/** Nguồn nốt cung cấp được gì — quyết định tiêu chí nào chấm được (không tuyên bố có pedal / velocity khi nguồn không gửi). */
export interface InputCapabilities {
  /** Biết lúc thả phím (MIDI, bàn phím ảo) → chấm trường độ. */
  noteOff: boolean;
  /** Lực gõ thật (MIDI). Micro chỉ có độ to tương đối (RMS) → `relativeLevel`. */
  velocity: boolean;
  relativeLevel: boolean;
  /** Đã nhận tín hiệu pedal vang CC 64 (trong phiên hoặc bước kiểm tra). */
  pedal: boolean;
  /** Bắt được nhiều nốt cùng lúc (MIDI, bàn phím ảo) — micro chỉ nốt đơn. */
  polyphonic: boolean;
}

export interface SessionInput {
  /** Nguồn chính của phiên. */
  source: InputSource;
  /** Tên đàn MIDI đang nối (nếu có). */
  deviceName?: string;
  /** Adapter MIDI: web-midi · native-bridge · simulated · composite. */
  backend?: string;
  capabilities: InputCapabilities;
}

export interface PerformanceSession {
  id: string;
  profileKey: ProfileKey;
  lessonId: string;
  lessonTitle: string;
  /** Đoạn ô [từ, tới] (số in) nếu chỉ ghi một đoạn. */
  measures?: [number, number];
  /** Tay được chấm. */
  hand: 'both' | Hand;
  mode: CoachMode;
  targetBpm: number;
  metronome: boolean;
  status: SessionStatus;
  /** Epoch ms. */
  startedAt: number;
  updatedAt: number;
  endedAt?: number;
  input: SessionInput;
  /** Bù trễ của nguồn khi PHÂN TÍCH (micro 60 ms) — log gốc không bị sửa. */
  latencyMs: number;
  recorderVersion: string;
  eventCount: number;
  /** Quy tắc pedal lúc ghi ('none-expected' = người dùng chọn "bài này không dùng pedal") — chấm lại dùng đúng quy tắc này. */
  pedalRule?: 'auto' | 'none-expected';
  /** Kế hoạch luyện / bước đang làm (M6). */
  planId?: string;
  planStepId?: string;
}

export type MarkKind = 'start' | 'pause' | 'resume' | 'stop' | 'abort' | 'disconnect' | 'reconnect' | 'pedal-initial';

/**
 * Một sự kiện trong log gốc. `t` = mốc thời gian của NGUỒN − t0 (ms, số thực, không làm tròn); `rt` = lúc app nhận − t0.
 * Hai mốc khác nhau khi driver MIDI gắn mốc riêng (Windows) — phân tích tự ước lượng độ lệch, log giữ nguyên.
 */
export type PerformanceEvent =
  | {
      k: 'on';
      t: number;
      rt: number;
      /** MIDI sau cấu hình đàn (transpose / quãng tám). */
      n: number;
      /** Lực gõ 1–127; null = nguồn không có. */
      v: number | null;
      ch: number | null;
      /** Phím thô trước cấu hình đàn. */
      raw?: number;
      port?: string;
      src: InputSource;
      /** Micro: RMS lúc nhận nốt. */
      lv?: number;
      /** 1 = nhận lúc đang tạm dừng (không tính khi chấm, vẫn giữ trong log). */
      p?: 1;
    }
  | { k: 'off'; t: number; rt: number; n: number; ch: number | null; raw?: number; port?: string; src: InputSource; p?: 1 }
  | { k: 'cc'; t: number; rt: number; c: number; v: number; ch: number | null; port?: string; src: InputSource; p?: 1 }
  | { k: 'mark'; t: number; rt: number; m: MarkKind; info?: string };

/** Một phiên đã ghi: metadata + log gốc theo thứ tự nhận. */
export interface RecordedSession {
  session: PerformanceSession;
  events: PerformanceEvent[];
}

export type NoteEnd = 'release' | 'retrigger' | 'stop' | 'disconnect';

/** Nốt đã ghép từ log (thời gian = "thời gian hoạt động", đã bỏ khoảng tạm dừng và bù trễ). */
export interface PerformanceNote {
  /** Chỉ số trong `BuiltPerformance.notes` (xếp theo onset). */
  id: number;
  midi: number;
  onMs: number;
  /** Lúc thả phím; null = không biết (micro, hoặc còn giữ lúc dừng / mất kết nối). */
  offMs: number | null;
  endedBy: NoteEnd;
  /** Thời gian giữ phím; null = không đo được. */
  heldMs: number | null;
  /** Ít nhất bấy nhiêu ms (còn giữ lúc dừng ghi). */
  heldAtLeastMs?: number;
  /** Tiếng còn ngân tới (pedal vang / sostenuto); null = không biết. */
  soundingEndMs: number | null;
  releasedUnderPedal: boolean;
  velocity: number | null;
  /** Micro: RMS (độ to tương đối). */
  level?: number;
  channel: number | null;
  source: InputSource;
  /** Đánh lại phím khi chưa thả (Note On lặp). */
  retriggered?: boolean;
  /** Đánh lúc pedal mềm (CC 67) đang đạp. */
  softPedal?: boolean;
  /** Chỉ số sự kiện 'on' trong log gốc (truy vết). */
  eventIndex: number;
}

export interface PedalChange {
  t: number;
  value: number;
}

export interface PedalTrack {
  controller: 64 | 66 | 67;
  changes: PedalChange[];
  /** Khoảng đạp (giá trị ≥ 64), thời gian hoạt động; `up` = null khi chưa nhả tới lúc dừng. */
  intervals: { down: number; up: number | null }[];
  /** Có giá trị trung gian (half-pedal) — chỉ ghi nhận. */
  continuous: boolean;
  /** Đạp sẵn trước khi ghi (theo trạng thái app hoặc suy ra từ tín hiệu đầu tiên là "nhả"). */
  initialDown: boolean;
}

export interface ClockModel {
  /** Mốc dùng để phân tích: mốc nguồn + độ lệch, hoặc mốc nhận khi mốc nguồn dao động. */
  basis: 'source' | 'receive';
  offsetMs: number;
  jitterMs: number;
}

export interface BuiltPerformance {
  notes: PerformanceNote[];
  sustain: PedalTrack;
  sostenuto: PedalTrack;
  soft: PedalTrack;
  /** Khoảng tạm dừng [pause, resume] theo đồng hồ đã hiệu chỉnh (trước khi bỏ). */
  pausedIntervals: { from: number; to: number }[];
  /** Thời gian hoạt động lúc dừng ghi. */
  endMs: number;
  clock: ClockModel;
  /** Note Off không có Note On (vd phím bấm nút "Bắt đầu") — bỏ qua. */
  orphanOffs: number;
  disconnects: number;
  /** Có ít nhất một sự kiện CC 64 trong phiên. */
  sustainSeen: boolean;
}

// ════════════════════════════ B. Bản nhạc tham chiếu ════════════════════════════

export type RefPart = 'melody' | 'harmony' | 'accompaniment';

export interface RefNote {
  /** Ổn định: `m:i` giai điệu, `h:i:k` hoà âm tay phải, `a:i:k` tay trái (i = chỉ số trong lesson.notes / accompaniment). */
  id: string;
  midi: number;
  pitch: string;
  onsetBeat: number;
  durationBeats: number;
  hand: Hand;
  part: RefPart;
  /** Số ô in (ô lấy đà = 0). */
  measure: number;
  measureIndex: number;
  /** Phách (nốt đen) tính từ đầu ô. */
  beatInMeasure: number;
  /** Chỉ số nốt trên khuông để tô màu (`lesson.notes` hoặc `lesson.accompaniment`). */
  scoreIndex: number;
  staff: 'melody' | 'accompaniment';
  /** Chỉ số nhóm (cùng phách). */
  group: number;
  dynamic?: DynamicMark;
  /** Lực gõ mẫu (sắc thái + cresc./dim.). */
  velocityTarget: number;
  /** Để sẵn cho nguồn có ký hiệu (MusicXML) — dữ liệu bài hiện tại không có. */
  articulation?: 'staccato' | 'legato' | 'tenuto';
  tieToNext?: boolean;
}

export interface RefGroup {
  index: number;
  onsetBeat: number;
  /** Chỉ số trong `ScoreReference.notes`. */
  notes: number[];
  measure: number;
  hands: Hand[];
}

export interface ScoreReference {
  id: string;
  title: string;
  source: 'lesson' | 'musicxml' | 'midi';
  timeSignature: [number, number];
  pickup: number;
  targetBpm: number;
  tempoRange?: [number, number];
  notes: RefNote[];
  groups: RefGroup[];
  /** Phách bắt đầu từng ô + phần tử cuối = hết bài. */
  measureStarts: number[];
  /** Số in của từng ô (theo chỉ số ô). */
  printedMeasures: number[];
  totalBeats: number;
  /** Ký hiệu pedal (theo phách); `graded` = false nếu bài chỉ gợi ý pedal. */
  pedal: { ranges: PedalRange[]; graded: boolean };
  /** Đoạn sắc thái theo nốt giai điệu (chỉ số `lesson.notes`). */
  dynamics: { mark: DynamicMark; from: number; to: number }[];
  hairpins: { from: number; to: number; type: 'cresc' | 'dim' }[];
  /** Bài có cả hai tay được chấm. */
  twoHands: boolean;
  /** Đoạn cắt của bài gốc. */
  slice?: { from: number; to: number };
}

// ════════════════════════════ Kết quả chấm ════════════════════════════

/** `replayed` = nốt đánh khi chơi lại đoạn đã chấm (sau khi dừng, quay lại đầu câu / đầu ô…) — không chấm, không tính thừa. */
export type AlignmentStatus = 'correct' | 'octave' | 'wrong' | 'missing' | 'extra' | 'repeated' | 'simultaneous' | 'order' | 'replayed';

export interface NoteAlignment {
  refId: string | null;
  perfId: number | null;
  status: AlignmentStatus;
  refMidi?: number;
  perfMidi?: number;
  hand?: Hand | 'unknown';
  /** Số ô in (nốt thừa: ô của vị trí trên trục phách). */
  measure: number | null;
  /** Thời điểm chuẩn sau căn chỉnh tempo / thực tế (ms, thời gian hoạt động). */
  expectedMs?: number;
  actualMs?: number;
  deviationMs?: number;
  timing?: 'early' | 'late' | 'ok';
  heldMs?: number | null;
  soundingMs?: number | null;
  expectedDurationMs?: number;
  durationRatio?: number;
  duration?: 'short' | 'long' | 'ok';
  velocity?: number | null;
}

export type CriterionKey = 'notes' | 'rhythm' | 'duration' | 'pedal' | 'dynamics';

export const CRITERION_LABEL: Record<CriterionKey, string> = {
  notes: 'Chính xác nốt',
  rhythm: 'Nhịp điệu',
  duration: 'Trường độ',
  pedal: 'Pedal',
  dynamics: 'Lực đánh & sắc thái',
};

export type IssueType =
  // nốt
  | 'wrong-note'
  | 'chord-wrong-note'
  | 'missing-note'
  | 'chord-missing-note'
  | 'octave'
  | 'extra-note'
  | 'repeated-note'
  | 'simultaneous-extra'
  | 'order'
  // nhịp
  | 'early'
  | 'late'
  | 'tempo-fast'
  | 'tempo-slow'
  | 'tempo-unstable'
  | 'hesitation'
  /** Dừng lại rồi chơi lại từ một chỗ phía trước (tính như một chỗ ngắt quãng). */
  | 'restart'
  | 'chord-async'
  | 'hands-async'
  // trường độ
  | 'short'
  | 'long'
  // pedal
  | 'pedal-missing'
  | 'pedal-late'
  | 'pedal-early'
  | 'pedal-release-early'
  | 'pedal-release-late'
  | 'pedal-not-changed'
  | 'pedal-stray'
  | 'pedal-continuous'
  // sắc thái
  | 'dynamics-contrast'
  | 'hairpin'
  | 'velocity-uneven'
  | 'balance';

export interface ScoringIssue {
  id: string;
  criterion: CriterionKey;
  type: IssueType;
  severity: 'minor' | 'major';
  /** Số ô in; null = cả bài. */
  measure: number | null;
  /** Phách trong ô (nốt đen). */
  beat?: number;
  /** Ô cuối khi issue trải nhiều ô. */
  toMeasure?: number;
  refNoteIds: string[];
  perfNoteIds: number[];
  hand?: Hand | 'unknown';
  expectedMidi?: number;
  actualMidi?: number;
  expectedMs?: number;
  actualMs?: number;
  deviationMs?: number;
  /** Giá trị đo (tỉ lệ trường độ, BPM, dB…). */
  value?: number;
  /** Phần giá trị tiêu chí (0..1) issue này làm mất. */
  criterionDeduction: number;
  /** Điểm /100 issue này làm mất (sau trọng số hiệu dụng). */
  deduction: number;
  confidence: 'high' | 'medium' | 'low';
  /** Câu tiếng Việt sinh theo quy tắc từ số liệu. */
  message: string;
}

export interface SubScore {
  key: string;
  label: string;
  value: number | null;
  weight: number;
  /** Lý do không đo. */
  reason?: string;
}

export interface CriterionScore {
  key: CriterionKey;
  label: string;
  /** 0..1; null = chưa đủ điều kiện chấm. */
  value: number | null;
  /** Trọng số gốc theo chế độ. */
  weight: number;
  /** Sau khi chia lại cho tiêu chí đo được (tổng 100). */
  effectiveWeight: number;
  /** Điểm đạt được /100 (= effectiveWeight × value). */
  points: number;
  subScores: SubScore[];
  /** Mã issue làm mất điểm tiêu chí này. */
  issueIds: string[];
  reason?: string;
}

export interface MeasureSummary {
  measure: number;
  notes: number;
  correct: number;
  wrong: number;
  missing: number;
  extra: number;
  timing: number;
  duration: number;
  pedal: number;
  /** Điểm /100 các issue trong ô làm mất. */
  lost: number;
}

export interface HandSummary {
  notes: number;
  correct: number;
  wrong: number;
  missing: number;
  accuracy: number;
  /** Lệch thời điểm trung bình tuyệt đối (ms). */
  meanAbsDeviationMs: number | null;
  timing: number | null;
  /** Nhịp ở các nốt tay này đánh riêng (tay kia không gõ cùng lúc). */
  independentTiming: number | null;
}

export interface ScoringResult {
  id: string;
  sessionId: string;
  profileKey: ProfileKey;
  lessonId: string;
  /** Bản nhạc đã dùng để chấm (bài gốc hoặc đoạn cắt `id@từ-tới`) — so tiến bộ đúng cùng bản. */
  referenceId: string;
  mode: CoachMode;
  engineVersion: string;
  alignmentVersion: string;
  weightsVersion: string;
  createdAt: number;
  /** 0–100, làm tròn. */
  total: number;
  criteria: CriterionScore[];
  counts: {
    refNotes: number;
    correct: number;
    octave: number;
    wrong: number;
    missing: number;
    extra: number;
    repeated: number;
    simultaneous: number;
    order: number;
    performed: number;
    /** Nốt đánh khi chơi lại đoạn đã chấm (không chấm) — kết quả engine < 1.1.0 không có. */
    replayed?: number;
    /** Số lần dừng lại rồi chơi lại giữa bài (không tính chơi thêm sau khi đã hết bài). */
    restarts?: number;
  };
  alignment: NoteAlignment[];
  issues: ScoringIssue[];
  measures: MeasureSummary[];
  tempo: {
    targetBpm: number;
    actualBpm: number | null;
    perMeasure: { measure: number; bpm: number }[];
    /** Tempo phần cuối / phần đầu − 1 (dương = nhanh dần). */
    drift: number | null;
  };
  hands: Partial<Record<Hand, HandSummary>> & { syncRate?: number | null; meanOffsetMs?: number | null };
  pedalInfo?: { ranges: number; intervals: number; continuous: boolean; sostenutoUsed: boolean; softUsed: boolean };
  dynamicsInfo?: { sections: { mark: DynamicMark; medianVelocity: number | null; targetVelocity: number }[] };
  capabilities: InputCapabilities;
  confidence: { alignment: number; overall: 'high' | 'medium' | 'low' };
  /** Tiêu chí không chấm + lý do (giải thích chia lại trọng số). */
  unavailable: { criterion: CriterionKey; reason: string }[];
  explanation: string[];
  /** Bản đồ phách → ms (để phát lại / con trỏ); mỗi mốc [phách, ms]. */
  tempoMap: [number, number][];
  /**
   * Chỉ khi có chơi lại: các lượt chơi liền theo thời gian (`toMs` null = tới hết) + bản đồ tempo riêng từng lượt → con trỏ phát
   * lại "bản của bạn" đi đúng chỗ đang chơi lại (nhảy lùi về chỗ chơi lại).
   */
  passes?: { fromMs: number; toMs: number | null; tempoMap: [number, number][] }[];
}

// ════════════════════════════ C. Dạy học ════════════════════════════

export interface CoachFeedbackContent {
  summary: string;
  strengths: string[];
  priorities: { issueRef?: string; title: string; explanation: string; fix: string }[];
  practiceSection?: { fromMeasure: number; toMeasure: number } | null;
  practiceTempo?: number | null;
  nextExercise?: { recommendationRef?: string; text: string } | null;
  comparison?: string | null;
}

export interface AIFeedback {
  id: string;
  resultId: string;
  sessionId: string;
  profileKey: ProfileKey;
  createdAt: number;
  source: 'ai' | 'rules';
  provider?: string;
  model?: string;
  latencyMs?: number;
  content: CoachFeedbackContent;
  verification: { ok: boolean; removed: string[]; replaced: string[] };
  error?: string;
}

export type RecommendationKind =
  | 'section'
  | 'slow-metronome'
  | 'note-reading'
  | 'hands-separate'
  | 'duration'
  | 'pedal'
  | 'dynamics'
  | 'continuity';

export interface PracticeRecommendation {
  id: string;
  kind: RecommendationKind;
  priority: number;
  title: string;
  /** Lý do kèm số liệu từ kết quả chấm. */
  reason: string;
  issueIds: string[];
  /** Điểm /100 các issue liên quan làm mất. */
  lost: number;
  measures?: [number, number];
  tempoPercent?: number;
  hand?: Hand;
  /** Mở tính năng sẵn có của VietPiano. */
  action:
    | { type: 'coach-section'; measures: [number, number]; tempoPercent: number; hand?: Hand }
    | { type: 'practice'; measures?: [number, number]; mode: 'wait' | 'tempo' | 'perform'; hand?: Hand }
    | { type: 'game'; game: 'note-sprint' | 'balloon-pop' | 'steady-beat'; label: string }
    | { type: 'curriculum'; lessonId: string; label: string };
}

export type PlanStepKind = 'isolate' | 'slow' | 'consistency' | 'tempo-up' | 'extend' | 'full' | 'rescore';

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  title: string;
  measures: [number, number] | null;
  bpm: number;
  /** Số lần đạt liên tiếp cần có. */
  requiredPasses: number;
  passScore: number;
  passes: number;
  status: 'todo' | 'active' | 'done' | 'skipped';
  attempts: { resultId: string; score: number; at: number; passed: boolean }[];
}

/** Tiến độ luyện sửa lỗi (PracticeProgress của đặc tả). */
export interface PracticePlan {
  id: string;
  profileKey: ProfileKey;
  lessonId: string;
  createdAt: number;
  updatedAt: number;
  sourceResultId: string;
  sourceScore: number;
  recommendationId: string;
  title: string;
  targetBpm: number;
  steps: PlanStep[];
  status: 'active' | 'done' | 'dismissed';
  /** Kết quả lần chấm lại cuối (bước 7). */
  finalScore?: number;
}
