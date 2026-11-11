/**
 * Dữ liệu riêng của Smart Practice / Finger Coach theo hồ sơ (quyết định F3): CHỈ những gì không suy được từ kết quả Coach —
 * bài bổ trợ đã tạo, phản hồi với đề xuất (Bắt đầu / Đổi bài / Không phù hợp), lần báo mỏi. localStorage, khoá có phiên bản,
 * đọc qua `sanitize` (dữ liệu hỏng / phiên bản lạ → bỏ phần hỏng, không ném lỗi), giới hạn số mục (retention).
 * Cờ tính năng + tuỳ chọn ở khoá riêng (dùng chung mọi hồ sơ).
 */
import { parseRemedialId } from './remedial';
import type { RemedialExercise } from './types';

export const STORE_VERSION = 1;
export const STORE_PREFIX = 'vietpiano.smart-practice.v1:';
export const SETTINGS_KEY = 'vietpiano.technique.settings.v1';
export const MAX_REMEDIALS = 60;
export const MAX_FEEDBACK = 300;
export const MAX_FATIGUE = 30;

export type FeedbackAction = 'start' | 'swap' | 'unsuitable';

export interface RecommendationFeedback {
  at: number;
  /** Id bài được đề xuất (bài kỹ thuật / bài bổ trợ). */
  lessonId: string;
  slot: string;
  action: FeedbackAction;
}

export interface FatigueReport {
  at: number;
}

export interface SmartPracticeData {
  version: number;
  remedials: RemedialExercise[];
  feedback: RecommendationFeedback[];
  fatigue: FatigueReport[];
}

export interface TechniqueSettings {
  /** Cờ tính năng: tắt → ẩn lối vào + panel đoạn khó, dữ liệu giữ nguyên (rollback, F11). */
  enabled: boolean;
  /** Tự đề xuất tempo theo kết quả (người học vẫn chỉnh tay được). */
  adaptiveTempo: boolean;
  /** Dùng AI cục bộ để sắp xếp / diễn đạt lý do đề xuất (khi AI ở Cài đặt đang bật). */
  aiRank: boolean;
}

export const DEFAULT_TECHNIQUE_SETTINGS: TechniqueSettings = { enabled: true, adaptiveTempo: true, aiRank: true };

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length < 400;

function sanitizeRemedial(x: unknown, profileKey: string): RemedialExercise | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (!str(r.id) || !parseRemedialId(r.id) || !str(r.sourceId) || !num(r.startGroup) || !num(r.endGroup) || !num(r.createdAt)) return null;
  const status = r.status === 'mastered' || r.status === 'dismissed' ? r.status : 'active';
  const hand = r.handMode === 'left' || r.handMode === 'right' ? r.handMode : 'both';
  return {
    id: r.id,
    profileKey,
    sourceId: r.sourceId,
    sourceTitle: str(r.sourceTitle) ? r.sourceTitle : r.sourceId,
    passageId: str(r.passageId) ? r.passageId : null,
    startGroup: r.startGroup,
    endGroup: r.endGroup,
    variant: num(r.variant) ? Math.max(0, Math.min(2, Math.round(r.variant))) : 0,
    noteNames: Array.isArray(r.noteNames) ? r.noteNames.filter(str).slice(0, 16) : [],
    tempo: num(r.tempo) ? Math.max(20, Math.min(240, Math.round(r.tempo))) : 60,
    handMode: hand,
    ...(Array.isArray(r.byMeasures) && r.byMeasures.length === 2 && r.byMeasures.every(num) ? { byMeasures: [r.byMeasures[0], r.byMeasures[1]] as [number, number] } : {}),
    createdAt: r.createdAt,
    status,
  };
}

export function sanitizeData(raw: unknown, profileKey: string): SmartPracticeData {
  const empty: SmartPracticeData = { version: STORE_VERSION, remedials: [], feedback: [], fatigue: [] };
  if (!raw || typeof raw !== 'object') return empty;
  const d = raw as Record<string, unknown>;
  const remedials = (Array.isArray(d.remedials) ? d.remedials : []).map((x) => sanitizeRemedial(x, profileKey)).filter((x): x is RemedialExercise => !!x);
  const feedback = (Array.isArray(d.feedback) ? d.feedback : [])
    .filter((x): x is RecommendationFeedback => {
      const f = x as RecommendationFeedback;
      return !!f && num(f.at) && str(f.lessonId) && typeof f.slot === 'string' && (f.action === 'start' || f.action === 'swap' || f.action === 'unsuitable');
    })
    .map((f) => ({ at: f.at, lessonId: f.lessonId, slot: f.slot.slice(0, 40), action: f.action }));
  const fatigue = (Array.isArray(d.fatigue) ? d.fatigue : []).filter((x): x is FatigueReport => !!x && num((x as FatigueReport).at)).map((x) => ({ at: x.at }));
  return trim({ version: STORE_VERSION, remedials, feedback, fatigue });
}

/** Giới hạn dung lượng: bỏ mục cũ nhất (bài bổ trợ đang luyện được giữ trước). */
export function trim(d: SmartPracticeData): SmartPracticeData {
  const remedials = [...d.remedials].sort((a, b) => (a.status === 'active') === (b.status === 'active') ? b.createdAt - a.createdAt : a.status === 'active' ? -1 : 1).slice(0, MAX_REMEDIALS);
  return {
    version: STORE_VERSION,
    remedials,
    feedback: [...d.feedback].sort((a, b) => a.at - b.at).slice(-MAX_FEEDBACK),
    fatigue: [...d.fatigue].sort((a, b) => a.at - b.at).slice(-MAX_FATIGUE),
  };
}

export class SmartPracticeStore {
  constructor(private readonly storage: KV | null = defaultStorage()) {}

  private key(profileKey: string) {
    return STORE_PREFIX + profileKey;
  }

  load(profileKey: string): SmartPracticeData {
    try {
      const raw = this.storage?.getItem(this.key(profileKey));
      return sanitizeData(raw ? JSON.parse(raw) : null, profileKey);
    } catch {
      return sanitizeData(null, profileKey);
    }
  }

  save(profileKey: string, d: SmartPracticeData): SmartPracticeData {
    const t = trim(d);
    try {
      this.storage?.setItem(this.key(profileKey), JSON.stringify(t));
    } catch {
      /* hết chỗ / chế độ riêng tư — dữ liệu chỉ còn trong phiên */
    }
    return t;
  }

  update(profileKey: string, f: (d: SmartPracticeData) => SmartPracticeData): SmartPracticeData {
    return this.save(profileKey, f(this.load(profileKey)));
  }

  /** Thêm / cập nhật bài bổ trợ (cùng id → giữ ngày tạo cũ, cập nhật phần còn lại). */
  upsertRemedial(profileKey: string, r: RemedialExercise): SmartPracticeData {
    return this.update(profileKey, (d) => {
      const old = d.remedials.find((x) => x.id === r.id);
      return { ...d, remedials: [...d.remedials.filter((x) => x.id !== r.id), { ...r, profileKey, createdAt: old?.createdAt ?? r.createdAt }] };
    });
  }

  setRemedialStatus(profileKey: string, id: string, status: RemedialExercise['status']): SmartPracticeData {
    return this.update(profileKey, (d) => ({ ...d, remedials: d.remedials.map((x) => (x.id === id ? { ...x, status } : x)) }));
  }

  addFeedback(profileKey: string, f: RecommendationFeedback): SmartPracticeData {
    return this.update(profileKey, (d) => ({ ...d, feedback: [...d.feedback, f] }));
  }

  reportFatigue(profileKey: string, at: number): SmartPracticeData {
    return this.update(profileKey, (d) => ({ ...d, fatigue: [...d.fatigue, { at }] }));
  }

  /** Xuất dữ liệu của hồ sơ (JSON). */
  export(profileKey: string): string {
    return JSON.stringify({ kind: 'vietpiano-smart-practice', profileKey, ...this.load(profileKey) }, null, 2);
  }

  /** Xoá dữ liệu Smart Practice của hồ sơ (kết quả chấm của Coach xoá riêng ở Lịch sử Coach). */
  clear(profileKey: string): void {
    try {
      this.storage?.removeItem(this.key(profileKey));
    } catch {
      /* bỏ qua */
    }
  }

  loadSettings(): TechniqueSettings {
    try {
      const raw = this.storage?.getItem(SETTINGS_KEY);
      const s = raw ? (JSON.parse(raw) as Partial<TechniqueSettings>) : {};
      return {
        enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_TECHNIQUE_SETTINGS.enabled,
        adaptiveTempo: typeof s.adaptiveTempo === 'boolean' ? s.adaptiveTempo : DEFAULT_TECHNIQUE_SETTINGS.adaptiveTempo,
        aiRank: typeof s.aiRank === 'boolean' ? s.aiRank : DEFAULT_TECHNIQUE_SETTINGS.aiRank,
      };
    } catch {
      return { ...DEFAULT_TECHNIQUE_SETTINGS };
    }
  }

  saveSettings(s: TechniqueSettings): void {
    try {
      this.storage?.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* bỏ qua */
    }
  }
}

export const smartPracticeStore = new SmartPracticeStore();

/** Báo mỏi còn hiệu lực (12 giờ, quyết định F12). */
export const FATIGUE_WINDOW_MS = 12 * 3_600_000;

export function activeFatigue(d: Pick<SmartPracticeData, 'fatigue'>, now: number): FatigueReport | null {
  const last = d.fatigue[d.fatigue.length - 1];
  return last && now - last.at < FATIGUE_WINDOW_MS && last.at <= now ? last : null;
}
