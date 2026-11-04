/**
 * Lưu "5 ngón – 8 nốt" ở localStorage: thống kê cá nhân theo hồ sơ + cài đặt buổi tập theo hồ sơ.
 * Safari chặn lưu → trả về dữ liệu rỗng, buổi tập vẫn chạy.
 */

import { CHAINS_PER_SESSION, DEFAULT_SESSION_SETTINGS, type SessionSettings } from './FiveFingerSession';
import { DIFFICULTY_LABEL, HAND_MODE_LABEL, type FiveFingerDifficulty, type HandMode } from './generator';
import { isPositionId, separateHands, validOctaves } from './positions';
import { applyChainResult, emptyStats, sanitizeStats, type ChainResultInput, type FiveFingerStats } from './stats';

const STATS_KEY = 'vietpiano.five-finger.stats.v1';
const SETTINGS_KEY = 'vietpiano.five-finger.settings.v1';
const GUEST = 'guest';

function readJson(key: string): Record<string, unknown> {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // không chặn buổi tập
  }
}

export function loadFiveFingerStats(profileId: string | null): FiveFingerStats {
  return sanitizeStats(readJson(STATS_KEY)[profileId ?? GUEST]);
}

export function recordFiveFingerChain(profileId: string | null, result: ChainResultInput): FiveFingerStats {
  const all = readJson(STATS_KEY);
  const next = applyChainResult(sanitizeStats(all[profileId ?? GUEST]), result);
  writeJson(STATS_KEY, { ...all, [profileId ?? GUEST]: next });
  return next;
}

export function clearFiveFingerStats(profileId: string | null): FiveFingerStats {
  const all = readJson(STATS_KEY);
  delete all[profileId ?? GUEST];
  writeJson(STATS_KEY, all);
  return emptyStats();
}

const isDifficulty = (v: unknown): v is FiveFingerDifficulty => typeof v === 'string' && v in DIFFICULTY_LABEL;
const isHandMode = (v: unknown): v is HandMode => typeof v === 'string' && v in HAND_MODE_LABEL;

export function sanitizeSessionSettings(raw: unknown): SessionSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SessionSettings>;
  const d = DEFAULT_SESSION_SETTINGS;
  const position = isPositionId(r.position) ? r.position : d.position;
  const rightOctave = typeof r.rightOctave === 'number' && validOctaves('right', position).includes(r.rightOctave) ? r.rightOctave : validOctaves('right', position)[0];
  const leftOctave =
    typeof r.leftOctave === 'number' && validOctaves('left', position).includes(r.leftOctave) ? r.leftOctave : (validOctaves('left', position).at(-1) ?? d.leftOctave);
  const hands = separateHands({ position, octave: leftOctave }, { position, octave: rightOctave });
  const bpm = typeof r.bpm === 'number' && r.bpm >= 40 && r.bpm <= 120 ? Math.round(r.bpm) : d.bpm;
  return {
    handMode: isHandMode(r.handMode) ? r.handMode : d.handMode,
    difficulty: isDifficulty(r.difficulty) ? r.difficulty : d.difficulty,
    position,
    rightOctave: hands.right.octave,
    leftOctave: hands.left.octave,
    chainsPerSession: CHAINS_PER_SESSION.includes(r.chainsPerSession as never) ? (r.chainsPerSession as SessionSettings['chainsPerSession']) : d.chainsPerSession,
    rhythm: typeof r.rhythm === 'boolean' ? r.rhythm : d.rhythm,
    bpm,
    handsFirst: typeof r.handsFirst === 'boolean' ? r.handsFirst : d.handsFirst,
    syncToleranceMs: typeof r.syncToleranceMs === 'number' && r.syncToleranceMs >= 80 && r.syncToleranceMs <= 600 ? r.syncToleranceMs : d.syncToleranceMs,
  };
}

export function loadFiveFingerSettings(profileId: string | null): SessionSettings {
  return sanitizeSessionSettings(readJson(SETTINGS_KEY)[profileId ?? GUEST]);
}

export function saveFiveFingerSettings(profileId: string | null, settings: SessionSettings): void {
  writeJson(SETTINGS_KEY, { ...readJson(SETTINGS_KEY), [profileId ?? GUEST]: settings });
}
