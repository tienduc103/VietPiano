/**
 * Lưu "Cầu vồng hai bàn tay" ở localStorage theo hồ sơ (`vietpiano.rainbow-hands.v1`): cài đặt, sticker đã nhận
 * (KHÔNG bao giờ bị trừ), số bạn thú đã về nhà, tóm tắt các buổi (tối đa 60) + vòng giữ nhịp (tối đa 40, để gợi ý
 * tăng tốc). Chỉ số liệu tóm tắt — không lưu âm thanh, không lưu log từng nốt. Safari chặn lưu → dữ liệu rỗng, game vẫn chạy.
 */
import type { Hand } from '../lessons/types';
import type { StickerKind, TempoRoundEntry } from './analysis';
import { STICKERS } from './analysis';
import type { TimingMode } from './RainbowEngine';
import type { HandSet } from './route';
import { sanitizeSettings, type RainbowMode, type RainbowSettings } from './settings';

export const RAINBOW_STORAGE_KEY = 'vietpiano.rainbow-hands.v1';
const GUEST = 'guest';
export const MAX_SESSIONS = 60;
export const MAX_TEMPO_ROUNDS = 40;

export interface SessionEntry {
  at: number;
  mode: RainbowMode | 'retry';
  hands: HandSet;
  timing: TimingMode;
  bpm: number | null;
  roundsTarget: number;
  /** Vòng chơi hết. */
  roundsComplete: number;
  /** Vòng đạt tiêu chí. */
  roundsPassed: number;
  accuracy: Partial<Record<Hand, number | null>>;
  /** Tỉ lệ bước hai tay cùng lúc; null = không phải bài hai tay. */
  together: number | null;
  /** Đoạn nên luyện ("Mi–Fa · tay trái"). */
  weak: string | null;
}

export interface StickerEntry {
  kind: StickerKind;
  at: number;
}

export interface RainbowProgress {
  stickers: StickerEntry[];
  animalsHome: number;
  sessions: SessionEntry[];
  tempo: TempoRoundEntry[];
}

interface ProfileData {
  settings: RainbowSettings;
  progress: RainbowProgress;
}

export function emptyProgress(): RainbowProgress {
  return { stickers: [], animalsHome: 0, sessions: [], tempo: [] };
}

function readAll(): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(RAINBOW_STORAGE_KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, unknown>): void {
  try {
    localStorage.setItem(RAINBOW_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // không chặn trò chơi
  }
}

function sanitizeProgress(raw: unknown): RainbowProgress {
  if (!raw || typeof raw !== 'object') return emptyProgress();
  const r = raw as Partial<RainbowProgress>;
  return {
    stickers: Array.isArray(r.stickers) ? r.stickers.filter((s) => s && typeof s.at === 'number' && s.kind in STICKERS) : [],
    animalsHome: typeof r.animalsHome === 'number' && r.animalsHome >= 0 ? Math.floor(r.animalsHome) : 0,
    sessions: Array.isArray(r.sessions) ? r.sessions.filter((s) => s && typeof s.at === 'number').slice(-MAX_SESSIONS) : [],
    tempo: Array.isArray(r.tempo) ? r.tempo.filter((t) => t && typeof t.bpm === 'number' && typeof t.passed === 'boolean').slice(-MAX_TEMPO_ROUNDS) : [],
  };
}

function load(profileId: string | null): ProfileData {
  const raw = readAll()[profileId ?? GUEST] as Partial<ProfileData> | undefined;
  return { settings: sanitizeSettings(raw?.settings), progress: sanitizeProgress(raw?.progress) };
}

function save(profileId: string | null, data: ProfileData): void {
  const all = readAll();
  writeAll({ ...all, [profileId ?? GUEST]: data });
}

export function loadRainbowSettings(profileId: string | null): RainbowSettings {
  return load(profileId).settings;
}

export function saveRainbowSettings(profileId: string | null, settings: RainbowSettings): void {
  const d = load(profileId);
  save(profileId, { ...d, settings: sanitizeSettings(settings) });
}

export function loadRainbowProgress(profileId: string | null): RainbowProgress {
  return load(profileId).progress;
}

export interface SessionResultInput {
  session: SessionEntry;
  /** Số vòng chơi hết trong buổi (mỗi vòng = một bạn thú về nhà). */
  animals: number;
  stickers: StickerKind[];
  tempoRounds: TempoRoundEntry[];
}

/** Ghi một buổi: CỘNG sticker / bạn thú (không bao giờ trừ), thêm tóm tắt buổi + vòng giữ nhịp. */
export function recordRainbowSession(profileId: string | null, input: SessionResultInput): RainbowProgress {
  const d = load(profileId);
  const p = d.progress;
  const next: RainbowProgress = {
    stickers: [...p.stickers, ...input.stickers.map((kind) => ({ kind, at: input.session.at }))],
    animalsHome: p.animalsHome + Math.max(0, input.animals),
    sessions: [...p.sessions, input.session].slice(-MAX_SESSIONS),
    tempo: [...p.tempo, ...input.tempoRounds].slice(-MAX_TEMPO_ROUNDS),
  };
  save(profileId, { ...d, progress: next });
  return next;
}

/** Độ chính xác chung của buổi gần nhất cùng chế độ (để thưởng "tiến bộ"). */
export function previousAccuracy(progress: RainbowProgress, mode: SessionEntry['mode'], hands: HandSet): number | null {
  const last = [...progress.sessions].reverse().find((s) => s.mode === mode && s.hands === hands);
  if (!last) return null;
  const values = Object.values(last.accuracy).filter((v): v is number => typeof v === 'number');
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}
