/**
 * Tiến độ bài "Khám phá âm thanh" theo hồ sơ: kỹ năng (số lần thử / đạt / nghe lại / thử lại), phiên hoạt động,
 * sao + hình dán, bản ghi biểu diễn tự do (CHỈ dữ liệu nốt). Hàm thuần — lưu ở `storage.ts`.
 */
import type { InputSource } from '../input/NoteInputProvider';
import { sanitizeSettings, type SoundExploreSettings } from './config';
import { sanitizeRecording, type RecordedNote } from './recorder';

export type ActivityId = 'intro' | 'rocket' | 'duration' | 'garden' | 'free' | 'adventure';
export const ACTIVITY_IDS: readonly ActivityId[] = ['intro', 'rocket', 'duration', 'garden', 'free', 'adventure'];

export type SkillId = 'pitchRecognition' | 'pitchDirection' | 'durationRecognition' | 'durationExecution' | 'pitchExecution';
export const SKILL_IDS: readonly SkillId[] = ['pitchRecognition', 'pitchDirection', 'durationRecognition', 'durationExecution', 'pitchExecution'];

/** Nguồn của lần thử: nốt (micro / bàn phím ảo / MIDI) hoặc chạm chọn đáp án. */
export type AttemptInput = InputSource | 'touch';

/** Số lần thử gần nhất giữ lại để đánh giá (đủ để không kết luận từ vài lần chơi). */
export const RECENT_WINDOW = 12;
const MAX_SESSIONS = 60;

export interface SkillRecord {
  attempts: number;
  successfulAttempts: number;
  /** Kết quả lần thử ĐẦU của từng câu, gần nhất ở cuối. */
  recent: boolean[];
  /** Số lần bé bấm nghe lại ví dụ. */
  replays: number;
  /** Số lần thử lại sau khi chưa đạt (không tính vào attempts). */
  retries: number;
  /** Lần thử trên đàn MIDI thật. */
  midiAttempts: number;
  midiSuccesses: number;
  updatedAt: number;
}

/** Mô hình `ActivitySession` của đặc tả. */
export interface ActivitySession {
  sessionId: string;
  learnerId: string;
  activityId: ActivityId;
  startedAt: number;
  endedAt: number;
  inputMode: AttemptInput;
  completed: boolean;
  /** Số lần nghe lại + gợi ý trong phiên → 'none' (0) | 'some' (1–3) | 'much' (≥ 4). */
  assistanceLevel: 'none' | 'some' | 'much';
}

export interface SoundExploreProgress {
  version: 1;
  settings: SoundExploreSettings;
  skills: Record<SkillId, SkillRecord>;
  sessions: ActivitySession[];
  /** Sao theo hoạt động (mỗi nhiệm vụ / câu đạt một sao, tối đa 99). */
  stars: Record<ActivityId, number>;
  /** Hoạt động đã trải nghiệm (đã mở và làm ít nhất một lần). */
  visited: Record<ActivityId, boolean>;
  /** Hình dán nhận được (mỗi chuyến phiêu lưu xong một hình). */
  stickers: string[];
  /** Kết quả lượt khu vườn gần nhất (đạt cả hai thành phần) → tự lên 4 lựa chọn khi đã quen. */
  gardenRecent: boolean[];
  /** Bản ghi biểu diễn tự do gần nhất (chỉ nốt MIDI). */
  recording: RecordedNote[];
  updatedAt: number;
}

export const STICKERS = ['🌟', '🦋', '🌈', '🐞', '🍀', '🎈', '🐳', '🌻', '🦄', '🍓'] as const;

export function emptySkill(): SkillRecord {
  return { attempts: 0, successfulAttempts: 0, recent: [], replays: 0, retries: 0, midiAttempts: 0, midiSuccesses: 0, updatedAt: 0 };
}

const zeroBy = <T>(v: T) => Object.fromEntries(ACTIVITY_IDS.map((a) => [a, v])) as Record<ActivityId, T>;

export function emptyProgress(): SoundExploreProgress {
  return {
    version: 1,
    settings: sanitizeSettings({}),
    skills: Object.fromEntries(SKILL_IDS.map((s) => [s, emptySkill()])) as Record<SkillId, SkillRecord>,
    sessions: [],
    stars: zeroBy(0),
    visited: zeroBy(false),
    stickers: [],
    gardenRecent: [],
    recording: [],
    updatedAt: 0,
  };
}

const count = (v: unknown, max = 1e6) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
const bools = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is boolean => typeof x === 'boolean').slice(-max) : []);

function sanitizeSkill(raw: unknown): SkillRecord {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const attempts = count(r.attempts);
  const midiAttempts = count(r.midiAttempts);
  return {
    attempts,
    successfulAttempts: Math.min(attempts, count(r.successfulAttempts)),
    recent: bools(r.recent, RECENT_WINDOW),
    replays: count(r.replays),
    retries: count(r.retries),
    midiAttempts,
    midiSuccesses: Math.min(midiAttempts, count(r.midiSuccesses)),
    updatedAt: count(r.updatedAt, Number.MAX_SAFE_INTEGER),
  };
}

const INPUTS: readonly AttemptInput[] = ['microphone', 'virtual', 'midi', 'touch'];

function sanitizeSession(raw: unknown): ActivitySession | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sessionId !== 'string' || !ACTIVITY_IDS.includes(r.activityId as ActivityId)) return null;
  return {
    sessionId: r.sessionId.slice(0, 40),
    learnerId: typeof r.learnerId === 'string' ? r.learnerId.slice(0, 60) : 'guest',
    activityId: r.activityId as ActivityId,
    startedAt: count(r.startedAt, Number.MAX_SAFE_INTEGER),
    endedAt: count(r.endedAt, Number.MAX_SAFE_INTEGER),
    inputMode: INPUTS.includes(r.inputMode as AttemptInput) ? (r.inputMode as AttemptInput) : 'touch',
    completed: r.completed === true,
    assistanceLevel: r.assistanceLevel === 'some' || r.assistanceLevel === 'much' ? r.assistanceLevel : 'none',
  };
}

export function sanitizeProgress(raw: unknown): SoundExploreProgress {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Record<string, unknown>;
  const skills = (r.skills && typeof r.skills === 'object' ? r.skills : {}) as Record<string, unknown>;
  const stars = (r.stars && typeof r.stars === 'object' ? r.stars : {}) as Record<string, unknown>;
  const visited = (r.visited && typeof r.visited === 'object' ? r.visited : {}) as Record<string, unknown>;
  return {
    version: 1,
    settings: sanitizeSettings(r.settings),
    skills: Object.fromEntries(SKILL_IDS.map((s) => [s, sanitizeSkill(skills[s])])) as Record<SkillId, SkillRecord>,
    sessions: (Array.isArray(r.sessions) ? r.sessions : []).map(sanitizeSession).filter((s): s is ActivitySession => s !== null).slice(-MAX_SESSIONS),
    stars: Object.fromEntries(ACTIVITY_IDS.map((a) => [a, count(stars[a], 99)])) as Record<ActivityId, number>,
    visited: Object.fromEntries(ACTIVITY_IDS.map((a) => [a, visited[a] === true])) as Record<ActivityId, boolean>,
    stickers: (Array.isArray(r.stickers) ? r.stickers : []).filter((s): s is string => typeof s === 'string' && (STICKERS as readonly string[]).includes(s)).slice(-50),
    gardenRecent: bools(r.gardenRecent, 8),
    recording: sanitizeRecording(r.recording),
    updatedAt: count(r.updatedAt, Number.MAX_SAFE_INTEGER),
  };
}

// ─── Cập nhật (trả về bản mới, không sửa bản cũ) ─────────────────────────────────────

export interface AttemptInputData {
  skill: SkillId;
  success: boolean;
  input: AttemptInput;
  /** false: thử lại sau lần chưa đạt của CÙNG câu → chỉ đếm retries, không tính vào tỷ lệ. */
  firstTry: boolean;
  at: number;
}

export function recordAttempt(p: SoundExploreProgress, a: AttemptInputData): SoundExploreProgress {
  const s = p.skills[a.skill];
  const next: SkillRecord = a.firstTry
    ? {
        ...s,
        attempts: s.attempts + 1,
        successfulAttempts: s.successfulAttempts + (a.success ? 1 : 0),
        recent: [...s.recent, a.success].slice(-RECENT_WINDOW),
        midiAttempts: s.midiAttempts + (a.input === 'midi' ? 1 : 0),
        midiSuccesses: s.midiSuccesses + (a.input === 'midi' && a.success ? 1 : 0),
        updatedAt: a.at,
      }
    : { ...s, retries: s.retries + 1, updatedAt: a.at };
  return { ...p, skills: { ...p.skills, [a.skill]: next }, updatedAt: a.at };
}

export function recordReplay(p: SoundExploreProgress, skill: SkillId, at: number): SoundExploreProgress {
  const s = p.skills[skill];
  return { ...p, skills: { ...p.skills, [skill]: { ...s, replays: s.replays + 1, updatedAt: at } }, updatedAt: at };
}

export function addStar(p: SoundExploreProgress, activity: ActivityId, at: number): SoundExploreProgress {
  return { ...p, stars: { ...p.stars, [activity]: Math.min(99, p.stars[activity] + 1) }, updatedAt: at };
}

export function markVisited(p: SoundExploreProgress, activity: ActivityId, at: number): SoundExploreProgress {
  if (p.visited[activity]) return p;
  return { ...p, visited: { ...p.visited, [activity]: true }, updatedAt: at };
}

export function recordGarden(p: SoundExploreProgress, bloom: boolean, at: number): SoundExploreProgress {
  return { ...p, gardenRecent: [...p.gardenRecent, bloom].slice(-8), updatedAt: at };
}

/** Hình dán kế tiếp (xoay vòng bộ hình). */
export function awardSticker(p: SoundExploreProgress, at: number): { progress: SoundExploreProgress; sticker: string } {
  const sticker = STICKERS[p.stickers.length % STICKERS.length];
  return { progress: { ...p, stickers: [...p.stickers, sticker].slice(-50), updatedAt: at }, sticker };
}

export function assistanceLevel(helps: number): ActivitySession['assistanceLevel'] {
  return helps <= 0 ? 'none' : helps < 4 ? 'some' : 'much';
}

export function addSession(p: SoundExploreProgress, s: ActivitySession): SoundExploreProgress {
  return { ...p, sessions: [...p.sessions, s].slice(-MAX_SESSIONS), updatedAt: s.endedAt };
}

export function updateSettings(p: SoundExploreProgress, patch: Partial<SoundExploreSettings>, at: number): SoundExploreProgress {
  return { ...p, settings: sanitizeSettings({ ...p.settings, ...patch }), updatedAt: at };
}

/** Giữ cài đặt (phụ huynh đã chỉnh), xoá kết quả. `activity` → chỉ đặt lại sao / đã trải nghiệm của hoạt động đó. */
export function resetProgress(p: SoundExploreProgress, at: number, activity?: ActivityId): SoundExploreProgress {
  if (activity) {
    return {
      ...p,
      stars: { ...p.stars, [activity]: 0 },
      visited: { ...p.visited, [activity]: false },
      sessions: p.sessions.filter((s) => s.activityId !== activity),
      ...(activity === 'garden' ? { gardenRecent: [] } : {}),
      ...(activity === 'free' ? { recording: [] } : {}),
      updatedAt: at,
    };
  }
  return { ...emptyProgress(), settings: p.settings, updatedAt: at };
}

export function setRecording(p: SoundExploreProgress, notes: RecordedNote[], at: number): SoundExploreProgress {
  return { ...p, recording: sanitizeRecording(notes), updatedAt: at };
}
