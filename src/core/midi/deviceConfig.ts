/**
 * Cấu hình từng thiết bị MIDI: số phím / dải phím, dịch giọng (transpose), dịch quãng tám, lọc kênh, đường cong lực gõ.
 * Áp dụng trong MidiEngine TRƯỚC khi phát sự kiện nốt → mọi bài học / trò chơi nhận nốt đã chuẩn hoá,
 * không màn nào phải biết đàn có bao nhiêu phím hay đang dịch giọng.
 */
import { midiToLabel } from '../music/notes';
import type { DeviceProfile } from './deviceProfiles';

/** Số phím thường gặp (32: KeyStep / Keystation Mini; 73: một số đàn sân khấu). */
export const KEY_COUNT_PRESETS = [25, 32, 37, 49, 61, 73, 76, 88] as const;
export type KeyCount = (typeof KEY_COUNT_PRESETS)[number];

/** Phím thấp nhất mặc định theo số phím (quy ước Đô giữa = C4 = MIDI 60, khi nút Octave trên đàn ở 0). */
export const DEFAULT_LOWEST: Record<KeyCount, number> = {
  25: 48, // C3–C5
  32: 48, // C3–G5
  37: 48, // C3–C6
  49: 36, // C2–C6
  61: 36, // C2–C7
  73: 28, // E1–E7
  76: 28, // E1–G7
  88: 21, // A0–C8
};

export const TRANSPOSE_LIMIT = 12;
export const OCTAVE_LIMIT = 3;

/** soft: gõ nhẹ vẫn ra lực khá (controller phím mini cứng); hard: cần gõ mạnh hơn; fixed: luôn 100. */
export type VelocityCurve = 'normal' | 'soft' | 'hard' | 'fixed';

export interface MidiDeviceConfig {
  /** false: bỏ qua mọi tín hiệu của thiết bị này (vd cổng phụ của controller, đàn của người khác). */
  enabled: boolean;
  /** null = theo nhận dạng tên model, không có thì 88. */
  keyCount: KeyCount | null;
  /** Phím thấp nhất (MIDI) của đàn; null = mặc định theo số phím. */
  lowestNote: number | null;
  /** Dịch nửa cung −12…12. */
  transpose: number;
  /** Dịch quãng tám −3…3 (cho controller ít phím chơi được bài ở quãng khác). */
  octave: number;
  /** 'all' hoặc kênh 1–16 (theo cách đánh số người dùng thấy). */
  channel: 'all' | number;
  velocityCurve: VelocityCurve;
  /** true: bỏ nốt nằm ngoài dải phím đã khai báo (lọc phím của bàn phím thứ hai / pad gửi nốt). */
  limitToRange: boolean;
  /** Phát tiếng piano trong app khi gõ: auto = chỉ khi đàn không có loa (controller). */
  sound: 'auto' | 'on' | 'off';
}

export const DEFAULT_DEVICE_CONFIG: MidiDeviceConfig = {
  enabled: true,
  keyCount: null,
  lowestNote: null,
  transpose: 0,
  octave: 0,
  channel: 'all',
  velocityCurve: 'normal',
  limitToRange: false,
  sound: 'auto',
};

const clampInt = (v: unknown, min: number, max: number, def: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def;

export function sanitizeDeviceConfig(raw: unknown): MidiDeviceConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof MidiDeviceConfig, unknown>>;
  const keyCount = KEY_COUNT_PRESETS.includes(r.keyCount as KeyCount) ? (r.keyCount as KeyCount) : null;
  const channel = r.channel === 'all' ? 'all' : typeof r.channel === 'number' && r.channel >= 1 && r.channel <= 16 ? Math.round(r.channel) : 'all';
  return {
    enabled: r.enabled !== false,
    keyCount,
    lowestNote: r.lowestNote === null || r.lowestNote === undefined ? null : clampInt(r.lowestNote, 0, 127, 21),
    transpose: clampInt(r.transpose, -TRANSPOSE_LIMIT, TRANSPOSE_LIMIT, 0),
    octave: clampInt(r.octave, -OCTAVE_LIMIT, OCTAVE_LIMIT, 0),
    channel,
    velocityCurve: r.velocityCurve === 'soft' || r.velocityCurve === 'hard' || r.velocityCurve === 'fixed' ? r.velocityCurve : 'normal',
    limitToRange: r.limitToRange === true,
    sound: r.sound === 'on' || r.sound === 'off' ? r.sound : 'auto',
  };
}

export function effectiveKeyCount(cfg: MidiDeviceConfig, profile: DeviceProfile | null): KeyCount {
  if (cfg.keyCount) return cfg.keyCount;
  const guess = profile?.keyCount;
  return KEY_COUNT_PRESETS.includes(guess as KeyCount) ? (guess as KeyCount) : 88;
}

/** Dải phím vật lý của đàn (MIDI thô, chưa dịch giọng). */
export function physicalRange(cfg: MidiDeviceConfig, profile: DeviceProfile | null): { low: number; high: number } {
  const keys = effectiveKeyCount(cfg, profile);
  const low = Math.min(127 - keys + 1, cfg.lowestNote ?? DEFAULT_LOWEST[keys]);
  return { low, high: low + keys - 1 };
}

/** Độ dịch tổng (nửa cung). */
export function totalShift(cfg: MidiDeviceConfig): number {
  return cfg.transpose + cfg.octave * 12;
}

/** Dải nốt app nhận được sau khi dịch. */
export function mappedRange(cfg: MidiDeviceConfig, profile: DeviceProfile | null): { low: number; high: number } {
  const { low, high } = physicalRange(cfg, profile);
  const s = totalShift(cfg);
  return { low: Math.max(0, low + s), high: Math.min(127, high + s) };
}

/** Phím thô → nốt app nhận; null = bỏ (ngoài dải khi `limitToRange`, hoặc dịch ra ngoài 0–127). */
export function mapNote(raw: number, cfg: MidiDeviceConfig, profile: DeviceProfile | null): number | null {
  if (cfg.limitToRange) {
    const { low, high } = physicalRange(cfg, profile);
    if (raw < low || raw > high) return null;
  }
  const n = raw + totalShift(cfg);
  return n >= 0 && n <= 127 ? n : null;
}

/** Kênh 0–15 có được nhận không. */
export function acceptsChannel(cfg: MidiDeviceConfig, channel: number): boolean {
  return cfg.channel === 'all' || cfg.channel === channel + 1;
}

/** Lực gõ 1–127 sau đường cong. */
export function applyVelocityCurve(velocity: number, curve: VelocityCurve): number {
  const v = Math.min(127, Math.max(1, velocity));
  if (curve === 'fixed') return 100;
  if (curve === 'normal') return v;
  const exp = curve === 'soft' ? 0.6 : 1.6;
  return Math.min(127, Math.max(1, Math.round(127 * Math.pow(v / 127, exp))));
}

/** Đàn có tự phát tiếng không → quyết định app có phát tiếng piano khi gõ. */
export function shouldPlaySound(cfg: MidiDeviceConfig, profile: DeviceProfile | null): boolean {
  if (cfg.sound !== 'auto') return cfg.sound === 'on';
  return profile?.hasBuiltInSound === false;
}

/**
 * Gợi ý khi dải nốt nhận được không phủ tầm nốt của bài học (MIDI 36–84) — controller 25/37 phím.
 * Trả về null nếu phủ đủ.
 */
export function rangeAdvice(cfg: MidiDeviceConfig, profile: DeviceProfile | null, need = { low: 48, high: 84 }): string | null {
  const { low, high } = mappedRange(cfg, profile);
  if (low <= need.low && high >= need.high) return null;
  const label = (m: number) => midiToLabel(m, 'letter');
  return `Đàn đang nhận ${label(low)}–${label(high)}; nhiều bài dùng ${label(need.low)}–${label(need.high)}. Dùng nút Octave trên đàn hoặc chỉnh "Quãng tám" khi bài cần nốt cao / thấp hơn.`;
}
