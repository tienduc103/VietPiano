/**
 * Nhật ký Biểu diễn — TẠM THỜI (docs/perform-log.md): điều tra vì sao người chơi ở chế độ Biểu diễn bị chấm sai / lỡ
 * quá nhiều, trên mọi máy. Mỗi dòng log (NDJSON) là một `PerformLogEntry`:
 *  - `visit`: một máy mở app / đổi người chơi ("máy truy cập").
 *  - `perform`: một lượt Biểu diễn (màn Luyện tập hoặc bài Biểu diễn của giáo trình) — nốt cần đánh, MỌI sự kiện nốt
 *    nhận được (kể cả bị màn bỏ qua, kèm lý do), kết quả chấm, chẩn đoán + một dòng tóm tắt tiếng Việt.
 * Không có âm thanh: micro chỉ ghi cao độ đã nhận diện. Đổi cấu trúc → tăng `PERFORM_LOG_SCHEMA`.
 */
import type { NoteResult } from '../practice/PracticeEngine';
import type { PerformanceOutcome } from '../practice/PerformanceTracker';

export const PERFORM_LOG_SCHEMA = 1;

export type LogInputSource = 'mic' | 'midi' | 'virtual';

export interface LogDevice {
  /** Mã ngẫu nhiên cố định của trình duyệt trên máy này (localStorage). */
  id: string;
  /** Tên máy đặt ở Cài đặt → Nhật ký Biểu diễn ('' = chưa đặt). */
  name: string;
}

export interface LogPlayer {
  /** Hồ sơ người học đang chọn; null = chưa có hồ sơ. */
  id: string | null;
  name: string | null;
  age: number | null;
  experience: string | null;
}

/** Thông tin máy / trình duyệt (để biết lỗi chỉ xảy ra trên loại máy nào). */
export interface LogEnv {
  ua: string;
  platform: string;
  language: string;
  timeZone: string;
  /** Màn hình "rộngxcao@tỉ lệ điểm ảnh". */
  screen: string;
  viewport: string;
  /** Mở như app cài trên màn hình chính (PWA). */
  standalone: boolean;
  touchPoints: number;
  cores: number | null;
  memoryGb: number | null;
  /** Trình duyệt có Web MIDI. */
  webMidi: boolean;
  /** Trang đang mở (origin + đường dẫn, không có query). */
  page: string;
}

interface LogBase {
  v: typeof PERFORM_LOG_SCHEMA;
  /** Mã dòng log (chống ghi trùng khi gửi lại). */
  id: string;
  type: 'visit' | 'perform';
  /** Giờ máy khách (ISO). */
  at: string;
  /** Phiên bản app (`__APP_VERSION__`). */
  app: string;
  device: LogDevice;
  player: LogPlayer;
  env: LogEnv;
}

export interface VisitEntry extends LogBase {
  type: 'visit';
  /** open = mở app; player = đổi người chơi. */
  reason: 'open' | 'player';
}

/** Thiết bị MIDI đang nối (cấu hình dịch giọng / quãng tám sai → mọi nốt bị chấm sai). */
export interface LogMidiDevice {
  name: string;
  manufacturer: string;
  transport: string;
  enabled: boolean;
  transpose: number;
  octave: number;
  channel: 'all' | number;
  keyCount: number | null;
  lowestNote: number | null;
  limitToRange: boolean;
}

export interface PerformSetup {
  /** Tay đang tập. */
  hand: 'both' | 'right' | 'left';
  /** Làm bài có chấm điểm (giáo trình "Luyện tập" thì false; màn Luyện tập luôn true). */
  scored: boolean;
  /** Nhịp độ (♩/phút) lúc bắt đầu lượt. */
  bpm: number;
  /** % nhịp độ so với bài (màn Luyện tập); null = không áp dụng. */
  tempoPercent: number | null;
  countInBeats: number;
  checkPitch: boolean;
  octaveTolerant: boolean;
  maxWindowBeats: number;
  onTimeMs: number;
  minOnsetIntervalMs: number;
  debounceSamePitch: boolean;
  /** Chỉ chấm nốt đơn (nguồn vào chỉ có micro). */
  singleNotesOnly: boolean;
  /** Bù trễ micro (ms) trừ vào mốc nốt micro trước khi chấm. */
  micLatencyMs: number;
  metronome: boolean;
  pedalScored: boolean;
  pedalInput: boolean;
  /** Cài đặt nguồn nốt (auto / microphone / midi). */
  inputSource: string;
  mic: { status: string; fallback: boolean };
  midi: { status: string; devices: LogMidiDevice[] };
  recognizer: { a4: number; noiseGate: number; minConfidence: number; stableMs: number; onsetRatio: number };
  /** Độ trễ đầu ra âm thanh trình duyệt báo (ms; tiếng metronome tới tai muộn chừng này); null = không biết. */
  outputLatencyMs: number | null;
}

/** Một nốt cần đánh (dấu lặng không ghi) + kết quả chấm. */
export interface LoggedNote {
  /** Chỉ số trong danh sách nốt của PerformanceTracker. */
  i: number;
  /** Phách bắt đầu (nốt đen, từ đầu bài). */
  b: number;
  /** Trường độ (nốt đen). */
  d: number;
  /** Phím cần đánh (MIDI). */
  m: number;
  /** Tên nốt trên bản nhạc. */
  p?: string;
  h?: 'right' | 'left';
  k?: 'melody' | 'harmony' | 'left';
  /** Số ô in trên bản nhạc. */
  ms?: number;
  r: NoteResult;
  /** Lệch thời điểm (ms, âm = sớm). */
  off: number | null;
  /** Phím người chơi đánh vào ô của nốt này. */
  pm: number | null;
  /** Giữ phím / trường độ (khi có Note Off). */
  held: number | null;
}

export type LoggedOutcome = PerformanceOutcome | 'dropped';

/** Một sự kiện nốt nhận được trong lượt. */
export interface LoggedEvent {
  /** ms từ lúc bắt đầu lượt, theo mốc của chính sự kiện (`e.time`, chưa bù trễ). */
  t: number;
  src: LogInputSource;
  m: number;
  /** Lực gõ MIDI. */
  vel?: number;
  /** Micro: RMS lúc nhận nốt. */
  lvl?: number;
  /** performance.now() lúc nhận − e.time (ms). Lớn / âm bất thường = đồng hồ của nguồn (driver MIDI) lệch đồng hồ trang. */
  lag: number;
  /** Vị trí đồng hồ Biểu diễn (phách) ở mốc dùng để chấm (đã bù trễ micro). */
  beat: number | null;
  /** hit / wrong / extra / ignored (chống lặp hoặc chưa chạy) theo PerformanceTracker; dropped = bị bỏ trước khi chấm. */
  out: LoggedOutcome;
  /** Lý do bị bỏ (out = dropped). */
  why?: string;
  /** Nốt được chấm (hit / wrong). */
  note?: number;
  /** Lệch thời điểm so với nốt được chấm (ms). */
  off?: number;
}

export interface LoggedMark {
  t: number;
  k: 'start' | 'pause' | 'resume' | 'bpm' | 'end';
  beat: number;
  bpm?: number;
}

export interface Diagnosis {
  inputs: {
    total: number;
    bySource: Partial<Record<LogInputSource, number>>;
    graded: number;
    extra: number;
    ignored: number;
    /** Số nốt bị bỏ theo lý do. */
    dropped: Record<string, number>;
  };
  /** Lệch thời điểm các nốt đã đánh (đúng + sai cao độ). */
  timing: { n: number; medianMs: number | null; meanMs: number | null; p10Ms: number | null; p90Ms: number | null; early: number; late: number };
  /** Nốt sai cao độ: phím đánh là nốt kề (lệch nhịp → khớp nhầm ô), sai quãng tám, lệch nửa cung, lệch một bậc, khác. */
  wrong: { neighbor: number; octave: number; semitone: number; step: number; other: number };
  /**
   * Nốt bị lỡ, xét các sự kiện cùng phím trong ±1 phách: không có tín hiệu nào / bị màn bỏ / bị chống lặp /
   * rơi ngoài cửa sổ (gõ thừa) / đã được chấm cho nốt khác.
   */
  missed: { noInput: number; dropped: number; ignored: number; extra: number; other: number };
  /** Gõ thừa: cùng phím với một nốt trong ±1 phách (đánh lệch nhịp) hay lạc hẳn. */
  extras: { nearNote: number; stray: number };
  /** Trung vị `lag` theo nguồn. */
  lagMs: Partial<Record<LogInputSource, number>>;
  /** Mã nghi vấn (xem `HINT_LABELS`). */
  hints: string[];
}

export interface PerformLogResult {
  notes: number;
  correct: number;
  wrong: number;
  missed: number;
  extras: number;
  pitchAccuracy: number;
  timing: number;
  duration: number | null;
  completion: number;
  onTimeRatio: number;
  dynamics?: number | null;
  pedal?: number | null;
  /** Điểm 0–100 theo rubric Biểu diễn (cùng công thức màn Luyện tập / giáo trình). */
  score: number;
}

export interface PerformEntry extends LogBase {
  type: 'perform';
  screen: 'practice' | 'curriculum';
  /** finished = hết bài; restart = chơi lại giữa chừng; left = rời màn / đổi chế độ / đổi bài giữa chừng. */
  end: 'finished' | 'restart' | 'left';
  lesson: { id: string; title: string; slice?: [number, number]; timeSignature: [number, number]; pickup: number; tempo: number };
  setup: PerformSetup;
  /** Thời lượng lượt (ms, từ lúc bấm bắt đầu). */
  durationMs: number;
  notes: LoggedNote[];
  events: LoggedEvent[];
  /** Thả phím: [t, midi, nguồn]. */
  offs: [number, number, LogInputSource][];
  /** Pedal vang: [t, đạp]. */
  pedal: [number, boolean][];
  marks: LoggedMark[];
  /** Micro: cao độ nghe được mỗi khi đổi — [t, midi | null, cents, độ tin cậy, rms, có noteOn (1/0)]. */
  pitch?: [number, number | null, number, number, number, number][];
  result: PerformLogResult;
  diagnosis: Diagnosis;
  /** Một dòng tóm tắt tiếng Việt (summary.log của máy ghi). */
  summary: string;
}

export type PerformLogEntry = VisitEntry | PerformEntry;
