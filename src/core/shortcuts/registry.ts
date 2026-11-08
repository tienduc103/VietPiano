/**
 * ShortcutRegistry — mọi đích đến tạo được lối tắt, SUY TỪ dữ liệu sẵn có của app: giáo trình chính, hai giáo trình
 * dẫn dắt (Làm quen từng nốt, Khám phá nốt nhạc), Thư viện bài (`lessonManager`), danh mục trò chơi (trò có màn riêng,
 * trò tự do, trò của từng buổi) + danh sách màn cố định của router. Thuần TypeScript, không React.
 *
 * - `resolveTarget`: đích còn tồn tại không (sau cập nhật app) + tên / biểu tượng / đường dẫn hiển thị.
 * - `targetStatus`: còn tồn tại / buổi "nên học sau". Mở khoá giáo trình CHỈ LÀ GỢI Ý (quyết định sản phẩm,
 *   `curriculum/unlock.ts`): lối tắt mở đúng màn buổi học như khi bấm từ giáo trình, màn đó hiện "Nên học trước…".
 * - `targetKey`: khoá chuẩn hoá chống trùng — gồm các tham số làm đổi nội dung / chế độ.
 * - `sanitizeTarget`: chỉ nhận loại đích, ID và tham số trong danh sách cho phép (không URL, không mã).
 * - `browseTree` / `allDestinations` / `searchDestinations`: bộ chọn đích đến.
 */
import { DIFFICULTY_LABEL } from '../balloonPop/BalloonPopGame';
import { MODE_INFO, SOLFEGE } from '../balloonPop/notes';
import { sanitizeBalloonSettings } from '../balloonPop/storage';
import { CURRICULUM } from '../curriculum/content/curriculum';
import { DISCOVERY } from '../curriculum/content/discovery';
import { findGuidedLesson, guidedCourseOf } from '../curriculum/content/guided';
import { SUPPLEMENT } from '../curriculum/content/supplement';
import { text, type Curriculum, type CurriculumLesson, type Level } from '../curriculum/types';
import { findLesson, lessonStatus, orderedLessons, type Records } from '../curriculum/unlock';
import { ARCADE_KINDS, ARCADE_VARIANTS, isArcadeKind } from '../games/arcade';
import { curriculumGameIndex, GAME_INFO, GAME_ORDER, lessonsWithGame, STANDALONE_GAMES, type LessonGames } from '../games/catalog';
import { GAME_ICON, GAME_TITLE, type GameKind } from '../games/gameForLesson';
import { CATEGORY_LABELS, CATEGORY_ORDER, lessonManager } from '../lessons/LessonManager';
import { measureRange } from '../lessons/slice';
import type { Lesson } from '../lessons/types';
import {
  SHORTCUT_TARGET_TYPES,
  type BalloonPreset,
  type LessonStage,
  type PageId,
  type ShortcutColor,
  type ShortcutParams,
  type ShortcutTarget,
  type ShortcutTargetType,
  type StandaloneGameId,
} from './types';

// ─── Màn cố định ────────────────────────────────────────────────────────────────────────────────

export interface PageInfo {
  id: PageId;
  title: string;
  icon: string;
  hint: string;
}

/** Màn cố định của router (trang chủ không có — thanh lối tắt nằm ở đó). Tên lấy từ dữ liệu khi có. */
export const PAGES: readonly PageInfo[] = [
  { id: 'curriculum', title: 'Giáo trình', icon: '📚', hint: `${CURRICULUM.levels.length} cấp độ · từng buổi học` },
  { id: 'supplement', title: text(SUPPLEMENT.levels[0].title), icon: '🎵', hint: 'Mỗi buổi một nốt' },
  { id: 'note-discovery', title: text(DISCOVERY.title), icon: '🎹', hint: 'Mỗi buổi một nốt mới + ôn nốt cũ' },
  { id: 'library', title: 'Thư viện bài', icon: '📖', hint: 'Luyện tự do — bài tập và bài hát' },
  { id: 'song-library', title: 'Thư viện bài hát', icon: '🎼', hint: 'Mọi bài hát, cả tuyển tập khuông đôi' },
  { id: 'games', title: 'Trò chơi', icon: '🎮', hint: 'Mọi trò chơi' },
  { id: 'five-finger', title: '5 ngón · 8 nốt', icon: '🖐️', hint: 'Chuỗi 8 nốt tự sinh trong thế 5 ngón' },
  { id: 'coach', title: 'AI Piano Coach', icon: '🤖', hint: 'Chấm bài đàn theo bản nhạc' },
  { id: 'settings', title: 'Cài đặt', icon: '⚙️', hint: 'Micro, đàn MIDI, hiển thị, lối tắt…' },
];

const PAGE_IDS = new Set<string>(PAGES.map((p) => p.id));
const GAME_IDS = new Set<string>(STANDALONE_GAMES.map((g) => g.id));

export function isPageId(id: string): id is PageId {
  return PAGE_IDS.has(id);
}

export function isStandaloneGameId(id: string): id is StandaloneGameId {
  return GAME_IDS.has(id);
}

// ─── Đích đến ───────────────────────────────────────────────────────────────────────────────────

/** Nhóm lớn trong bộ chọn (cũng dùng gợi ý màu mặc định). */
export type DestinationGroup = 'pages' | 'curriculum' | 'supplement' | 'discovery' | 'library' | 'songs' | 'games';

export interface Destination {
  target: ShortcutTarget;
  /** Tên đầy đủ, kèm phần / đoạn / chế độ nếu có: "Buổi 2: Tìm nốt Đô · Trò chơi". */
  title: string;
  /** Tên gọn — tên mặc định khi tạo lối tắt. */
  shortName: string;
  icon: string;
  /** Vị trí trong app (không gồm tên): ["Giáo trình", "Cấp 1 — Làm quen Piano"]. */
  path: string[];
  group: DestinationGroup;
  /** Chú thích ngắn trong danh sách chọn. */
  hint?: string;
}

const STAGE_LABEL: Record<LessonStage, string> = { review: 'Luyện tập', game: 'Trò chơi' };
/** Phần mở thẳng của buổi — nhãn đầy đủ cho bộ chọn. */
export const LESSON_STAGE_LABEL: Record<LessonStage, string> = { review: 'Luyện tập sau buổi', game: 'Trò chơi sau buổi' };

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

/** Gộp tên / khoá kiểu dữ liệu ra một đích hiển thị. */
function make(target: ShortcutTarget, group: DestinationGroup, title: string, icon: string, path: string[], hint?: string, shortName = title): Destination {
  return { target, title, shortName, icon, path, group, ...(hint ? { hint } : {}) };
}

function pageDestination(id: PageId): Destination | null {
  const p = PAGES.find((x) => x.id === id);
  return p ? make({ type: 'page', id }, 'pages', p.title, p.icon, ['Trang chính'], p.hint) : null;
}

/** "Tìm nốt Đô, Rê" / "1 tay · 5 nốt · Dễ" — mô tả cấu hình Bóng bay đã ghim. */
export function balloonPresetLabel(preset: BalloonPreset): string {
  if (preset.game === 'hunt' && preset.huntLetters?.length) return `Tìm nốt ${preset.huntLetters.map((l) => SOLFEGE[l]).join(', ')}`;
  return [preset.mode ? MODE_INFO[preset.mode].label : '', preset.difficulty ? DIFFICULTY_LABEL[preset.difficulty] : ''].filter(Boolean).join(' · ') || 'Cấu hình đã ghim';
}

function gameDestination(id: StandaloneGameId, preset?: BalloonPreset): Destination | null {
  const g = STANDALONE_GAMES.find((x) => x.id === id);
  if (!g) return null;
  if (preset) {
    if (id !== 'balloon-pop') return null;
    const label = balloonPresetLabel(preset);
    return make({ type: 'game', id, params: { preset } }, 'games', `${g.title} · ${label}`, g.shortcutIcon, ['Trò chơi'], undefined, `${g.shortTitle} · ${label}`);
  }
  return make({ type: 'game', id }, 'games', g.title, g.shortcutIcon, ['Trò chơi'], g.description.split(' — ')[0], g.shortTitle);
}

const levelShort = (level: Level) => `Cấp ${level.number}`;

function levelDestination(id: string): Destination | null {
  const level = CURRICULUM.levels.find((l) => l.levelId === id);
  if (!level) return null;
  return make(
    { type: 'level', id },
    'curriculum',
    text(level.title),
    '📘',
    ['Giáo trình'],
    level.availability === 'coming-soon' ? 'Sắp có' : `${level.lessons.length} buổi`,
    levelShort(level),
  );
}

/** Buổi học của giáo trình chính hoặc giáo trình dẫn dắt. */
export function curriculumLessonById(lessonId: string): CurriculumLesson | undefined {
  return findLesson(CURRICULUM, lessonId) ?? findGuidedLesson(lessonId);
}

/** Phần mở thẳng hợp lệ của buổi: giáo trình dẫn dắt không có Luyện tập sau buổi. `null` = trang tổng quan buổi. */
export function stageOptions(lessonId: string): (LessonStage | null)[] {
  if (!curriculumLessonById(lessonId)) return [];
  return guidedCourseOf(lessonId) ? [null, 'game'] : [null, 'review', 'game'];
}

function lessonDestination(lessonId: string, stage?: LessonStage): Destination | null {
  const lesson = curriculumLessonById(lessonId);
  if (!lesson) return null;
  if (stage && !stageOptions(lessonId).includes(stage)) return null;
  const course = guidedCourseOf(lessonId);
  const base = course?.id === 'supplement' ? text(lesson.title) : `Buổi ${lesson.number}: ${text(lesson.title)}`;
  const suffix = stage ? ` · ${STAGE_LABEL[stage]}` : '';
  const target: ShortcutTarget = { type: 'lesson', id: lessonId, ...(stage ? { params: { stage } } : {}) };
  if (course) {
    const group: DestinationGroup = course.id === 'supplement' ? 'supplement' : 'discovery';
    const title = course.id === 'supplement' ? text(SUPPLEMENT.levels[0].title) : text(DISCOVERY.title);
    return make(target, group, base + suffix, course.id === 'supplement' ? '🎵' : '🎹', [title], weekTitle(course.curriculum, lesson));
  }
  const level = CURRICULUM.levels.find((l) => l.levelId === lesson.levelId);
  return make(
    target,
    'curriculum',
    base + suffix,
    stage === 'game' ? '🎮' : stage === 'review' ? '🎯' : '📗',
    ['Giáo trình', level ? text(level.title) : ''],
    weekTitle(CURRICULUM, lesson),
  );
}

function weekTitle(curriculum: Curriculum, lesson: CurriculumLesson): string | undefined {
  for (const level of curriculum.levels) {
    const week = level.weeks.find((w) => w.weekId === lesson.weekId);
    if (week) return `Tuần ${week.number}: ${text(week.title)}`;
  }
  return undefined;
}

/** "ô 3–5", "lấy đà–2" (cùng cách ghi với nút Đoạn ở màn Luyện tập). */
export function measuresLabel(lesson: Pick<Lesson, 'pickup'>, [from, to]: [number, number]): string {
  const label = (m: number) => (lesson.pickup && m === 0 ? 'lấy đà' : `ô ${m}`);
  return from === to ? label(from) : `${label(from)}–${to}`;
}

function validMeasures(lesson: Lesson, measures: [number, number]): boolean {
  const { first, last } = measureRange(lesson);
  const [a, b] = measures;
  return Number.isInteger(a) && Number.isInteger(b) && first <= a && a <= b && b <= last;
}

function practicePath(lesson: Lesson): string[] {
  return lesson.repertoire ? ['Thư viện bài hát', 'Tuyển tập khuông đôi'] : ['Thư viện bài', CATEGORY_LABELS[lesson.category]];
}

function practiceDestination(id: string, measures?: [number, number]): Destination | null {
  const lesson = lessonManager.get(id);
  if (!lesson) return null;
  if (measures && !validMeasures(lesson, measures)) return null;
  const group: DestinationGroup = lesson.category === 'song' ? 'songs' : 'library';
  const icon = lesson.category === 'song' ? '🎵' : '🎹';
  const suffix = measures ? ` · ${measuresLabel(lesson, measures)}` : '';
  const target: ShortcutTarget = { type: 'practice', id, ...(measures ? { params: { measures } } : {}) };
  return make(target, group, lesson.title + suffix, icon, practicePath(lesson), lesson.description);
}

function arcadeDestination(id: string): Destination | null {
  const [kind, variantId, ...rest] = id.split(':');
  if (rest.length || !kind || !variantId || !isArcadeKind(kind)) return null;
  const variant = ARCADE_VARIANTS[kind].find((v) => v.id === variantId);
  if (!variant) return null;
  return make({ type: 'arcade', id }, 'games', `${GAME_TITLE[kind]} · ${variant.label}`, GAME_ICON[kind], ['Trò chơi', 'Trò chơi tự do'], variant.description, GAME_TITLE[kind]);
}

let lessonGameMap: Map<string, LessonGames> | null = null;
const lessonGames = () => (lessonGameMap ??= new Map(curriculumGameIndex().map((e) => [e.lesson.lessonId, e])));

/** Tách id `<lessonId>:<loại trò>`. */
export function parseLessonGameId(id: string): { lessonId: string; kind: string } | null {
  const i = id.lastIndexOf(':');
  return i > 0 && i < id.length - 1 ? { lessonId: id.slice(0, i), kind: id.slice(i + 1) } : null;
}

function lessonGameDestination(id: string): Destination | null {
  const parsed = parseLessonGameId(id);
  const entry = parsed && lessonGames().get(parsed.lessonId);
  if (!parsed || !entry || !entry.specs.some((s) => s.kind === parsed.kind)) return null;
  const kind = parsed.kind as GameKind;
  const where = `Cấp ${entry.level.number} · Buổi ${entry.lesson.number}`;
  return make(
    { type: 'lesson-game', id },
    'games',
    `${GAME_TITLE[kind]} · ${where}`,
    GAME_ICON[kind],
    ['Trò chơi', 'Trò chơi theo bài học'],
    text(entry.lesson.title),
    `${GAME_TITLE[kind]} · Buổi ${entry.lesson.number}`,
  );
}

/**
 * Đích còn tồn tại (và tham số hợp lệ) → thông tin hiển thị; không → null (nội dung đã bị xoá / đổi trong bản cập nhật).
 * Nhận cả dữ liệu thô (đọc từ bộ nhớ) — luôn qua `sanitizeTarget` trước.
 */
export function resolveTarget(raw: unknown): Destination | null {
  const t = sanitizeTarget(raw);
  if (!t) return null;
  const p = t.params ?? {};
  switch (t.type) {
    case 'page':
      return isPageId(t.id) ? pageDestination(t.id) : null;
    case 'game':
      return isStandaloneGameId(t.id) ? gameDestination(t.id, p.preset) : null;
    case 'level':
      return levelDestination(t.id);
    case 'lesson':
      return lessonDestination(t.id, p.stage);
    case 'practice':
      return practiceDestination(t.id, p.measures);
    case 'arcade':
      return arcadeDestination(t.id);
    case 'lesson-game':
      return lessonGameDestination(t.id);
  }
}

/**
 * ok            : mở được bình thường.
 * missing       : nội dung không còn (hiện thông báo, cho sửa / xoá lối tắt).
 * suggest-later : buổi còn buổi tiên quyết chưa đạt — vẫn mở được (mở khoá chỉ là gợi ý), màn buổi học tự nhắc.
 * coming-soon   : cấp độ chưa có nội dung.
 */
export type TargetStatus = 'ok' | 'missing' | 'suggest-later' | 'coming-soon';

/** Trạng thái đích theo tiến độ giáo trình của hồ sơ đang chọn (`records` của `curriculumStore`). */
export function targetStatus(target: unknown, records: Records = {}): TargetStatus {
  const dest = resolveTarget(target);
  if (!dest) return 'missing';
  if (dest.target.type === 'level') return CURRICULUM.levels.find((l) => l.levelId === dest.target.id)?.availability === 'coming-soon' ? 'coming-soon' : 'ok';
  if (dest.target.type === 'lesson') {
    const lesson = curriculumLessonById(dest.target.id);
    return lesson && lessonStatus(lesson, records) === 'suggest-later' ? 'suggest-later' : 'ok';
  }
  return 'ok';
}

// ─── Chuẩn hoá / khoá ───────────────────────────────────────────────────────────────────────────

const PRESET_KEYS = ['game', 'huntLetters', 'mode', 'hand', 'difficulty', 'speed', 'display', 'staffClef', 'labelStyle'] as const;

/** Giữ đúng các khoá đã ghim của cấu hình Bóng bay, giá trị đã làm sạch như màn Bóng bay đọc preset. */
export function sanitizeBalloonPreset(raw: unknown): BalloonPreset | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const full = sanitizeBalloonSettings(r);
  const out: Record<string, unknown> = {};
  for (const k of PRESET_KEYS) if (r[k] !== undefined) out[k] = full[k];
  return Object.keys(out).length > 0 ? (out as BalloonPreset) : undefined;
}

function sanitizeParams(type: ShortcutTargetType, id: string, raw: unknown): ShortcutParams | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: ShortcutParams = {};
  if (type === 'lesson' && (r.stage === 'review' || r.stage === 'game')) out.stage = r.stage;
  if (type === 'practice' && Array.isArray(r.measures) && r.measures.length === 2) {
    const [a, b] = r.measures as unknown[];
    if (Number.isInteger(a) && Number.isInteger(b) && (a as number) >= 0 && (a as number) <= (b as number) && (b as number) < 1000) out.measures = [a as number, b as number];
  }
  if (type === 'game' && id === 'balloon-pop') {
    const preset = sanitizeBalloonPreset(r.preset);
    if (preset) out.preset = preset;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Làm sạch đích đến đọc từ bộ nhớ / nhận từ màn khác: chỉ giữ loại đích + ID đúng dạng + tham số được phép của loại đó.
 * KHÔNG kiểm tra tồn tại (lối tắt tới nội dung đã mất vẫn giữ để người dùng sửa / xoá) — việc đó là của `resolveTarget`.
 */
export function sanitizeTarget(raw: unknown): ShortcutTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!SHORTCUT_TARGET_TYPES.includes(r.type as ShortcutTargetType) || typeof r.id !== 'string' || !ID_PATTERN.test(r.id)) return null;
  const type = r.type as ShortcutTargetType;
  const params = sanitizeParams(type, r.id, r.params);
  return params ? { type, id: r.id, params } : { type, id: r.id };
}

/** JSON ổn định (khoá xếp theo tên) — để hai cấu hình giống nhau cho cùng một khoá. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

/**
 * Khoá chuẩn hoá của đích: cùng nội dung + cùng tham số điều hướng ⇔ cùng khoá (chống tạo trùng lối tắt).
 * Vd "lesson|l1-02-find-c|stage=game", "practice|song-x|measures=3-5", "game|balloon-pop|preset={…}".
 */
export function targetKey(raw: ShortcutTarget): string {
  const t = sanitizeTarget(raw) ?? raw;
  const p = t.params ?? {};
  const parts: string[] = [t.type, t.id];
  if (p.stage) parts.push(`stage=${p.stage}`);
  if (p.measures) parts.push(`measures=${p.measures[0]}-${p.measures[1]}`);
  if (p.preset) parts.push(`preset=${stableJson(p.preset)}`);
  return parts.join('|');
}

/** Màu mặc định gợi ý theo nhóm. */
export function suggestedColor(group: DestinationGroup): ShortcutColor {
  const colors: Record<DestinationGroup, ShortcutColor> = {
    pages: 'violet',
    curriculum: 'pink',
    supplement: 'orange',
    discovery: 'rose',
    library: 'sky',
    songs: 'emerald',
    games: 'amber',
  };
  return colors[group];
}

// ─── Bộ chọn: cây duyệt + tìm kiếm ──────────────────────────────────────────────────────────────

export interface BrowseNode {
  /** Khoá duy nhất trong cây (đường dẫn). */
  key: string;
  label: string;
  icon?: string;
  hint?: string;
  /** Chọn được làm đích (nhóm như "Cấp 1", "Trò chơi" vừa là đích vừa có mục con). */
  destination?: Destination;
  children?: BrowseNode[];
}

const leaf = (key: string, d: Destination | null, label = d?.title ?? ''): BrowseNode | null => (d ? { key, label, icon: d.icon, hint: d.hint, destination: d } : null);
const present = <T>(x: T | null | undefined): x is T => x != null;

function lessonLeaves(prefix: string, lessons: readonly CurriculumLesson[]): BrowseNode[] {
  return lessons.map((l) => leaf(`${prefix}/${l.lessonId}`, lessonDestination(l.lessonId))).filter(present);
}

function buildTree(): BrowseNode[] {
  const page = (id: PageId) => pageDestination(id) ?? undefined;
  const levels = CURRICULUM.levels.filter((l) => l.availability === 'available');
  const supplementLessons = SUPPLEMENT.levels.flatMap(orderedLessons);
  const discoveryLevel = DISCOVERY.levels[0];
  const discoveryById = new Map(discoveryLevel.lessons.map((l) => [l.lessonId, l]));
  const groups = lessonManager.byCategory();
  const songs = lessonManager.songs();
  const gameIndex = curriculumGameIndex();

  return [
    {
      key: 'pages',
      label: 'Trang chính',
      icon: '🏠',
      hint: 'Giáo trình, thư viện, trò chơi, cài đặt…',
      children: PAGES.map((p) => leaf(`pages/${p.id}`, pageDestination(p.id))).filter(present),
    },
    {
      key: 'curriculum',
      label: 'Giáo trình',
      icon: '📚',
      hint: `${levels.length} cấp độ`,
      destination: page('curriculum'),
      children: levels.map((level) => ({
        key: `curriculum/${level.levelId}`,
        label: text(level.title),
        icon: '📘',
        hint: `${level.lessons.length} buổi`,
        destination: levelDestination(level.levelId) ?? undefined,
        children: lessonLeaves(`curriculum/${level.levelId}`, orderedLessons(level)),
      })),
    },
    {
      key: 'supplement',
      label: text(SUPPLEMENT.levels[0].title),
      icon: '🎵',
      hint: `${supplementLessons.length} nốt`,
      destination: page('supplement'),
      children: lessonLeaves('supplement', supplementLessons),
    },
    {
      key: 'discovery',
      label: text(DISCOVERY.title),
      icon: '🎹',
      hint: `${discoveryLevel.lessons.length} buổi`,
      destination: page('note-discovery'),
      children: discoveryLevel.weeks.map((w) => ({
        key: `discovery/${w.weekId}`,
        label: `Tuần ${w.number}: ${text(w.title)}`,
        hint: text(w.description),
        children: lessonLeaves(`discovery/${w.weekId}`, w.lessonIds.map((id) => discoveryById.get(id)).filter(present)),
      })),
    },
    {
      key: 'library',
      label: 'Thư viện bài',
      icon: '📖',
      hint: `${groups.reduce((a, g) => a + g.lessons.length, 0)} bài`,
      destination: page('library'),
      children: [...groups]
        .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
        .map((g) => ({
          key: `library/${g.category}`,
          label: g.label,
          hint: `${g.lessons.length} bài`,
          children: g.lessons.map((l) => leaf(`library/${g.category}/${l.id}`, practiceDestination(l.id))).filter(present),
        })),
    },
    {
      key: 'songs',
      label: 'Thư viện bài hát',
      icon: '🎼',
      hint: `${songs.length} bài`,
      destination: page('song-library'),
      children: (
        [
          ['grand', 'Khuông đôi · hai tay', (l: Lesson) => l.clef === 'grand'],
          ['single', 'Một tay', (l: Lesson) => l.clef !== 'grand'],
        ] as const
      ).map(([key, label, match]) => {
        const list = songs.filter(match);
        return { key: `songs/${key}`, label, hint: `${list.length} bài`, children: list.map((l) => leaf(`songs/${key}/${l.id}`, practiceDestination(l.id))).filter(present) };
      }),
    },
    {
      key: 'games',
      label: 'Trò chơi',
      icon: '🎮',
      hint: 'Trò có màn riêng, trò tự do, trò theo bài học',
      destination: page('games'),
      children: [
        ...STANDALONE_GAMES.map((g) => leaf(`games/${g.id}`, gameDestination(g.id))).filter(present),
        {
          key: 'games/arcade',
          label: 'Trò chơi tự do',
          icon: '🕹️',
          hint: `${ARCADE_KINDS.length} trò · mức chơi soạn sẵn`,
          children: ARCADE_KINDS.map((kind) => ({
            key: `games/arcade/${kind}`,
            label: GAME_TITLE[kind],
            icon: GAME_ICON[kind],
            hint: GAME_INFO[kind].skill,
            children: ARCADE_VARIANTS[kind].map((v) => leaf(`games/arcade/${kind}/${v.id}`, arcadeDestination(`${kind}:${v.id}`), v.label)).filter(present),
          })),
        },
        {
          key: 'games/lesson',
          label: 'Trò chơi theo bài học',
          icon: '📗',
          hint: 'Nội dung lấy từ từng buổi học',
          children: GAME_ORDER.filter((k) => GAME_INFO[k].source === 'lesson').map((kind) => {
            const entries = lessonsWithGame(gameIndex, kind);
            return {
              key: `games/lesson/${kind}`,
              label: GAME_TITLE[kind],
              icon: GAME_ICON[kind],
              hint: `${GAME_INFO[kind].skill} · ${entries.length} buổi`,
              children: entries
                .map((e) =>
                  leaf(
                    `games/lesson/${kind}/${e.lesson.lessonId}`,
                    lessonGameDestination(`${e.lesson.lessonId}:${kind}`),
                    `Cấp ${e.level.number} · Buổi ${e.lesson.number}: ${text(e.lesson.title)}`,
                  ),
                )
                .filter(present),
            };
          }),
        },
      ],
    },
  ];
}

let tree: BrowseNode[] | null = null;
/** Cây duyệt của bộ chọn (tính một lần, chỉ khi mở bộ chọn). */
export function browseTree(): BrowseNode[] {
  return (tree ??= buildTree());
}

let flat: Destination[] | null = null;
/** Mọi đích đến (không trùng khoá), theo thứ tự cây duyệt. */
export function allDestinations(): Destination[] {
  if (flat) return flat;
  const seen = new Set<string>();
  const out: Destination[] = [];
  const walk = (nodes: readonly BrowseNode[]) => {
    for (const n of nodes) {
      if (n.destination) {
        const k = targetKey(n.destination.target);
        if (!seen.has(k)) {
          seen.add(k);
          out.push(n.destination);
        }
      }
      if (n.children) walk(n.children);
    }
  };
  walk(browseTree());
  return (flat = out);
}

/** Chuẩn hoá để tìm kiếm: bỏ dấu tiếng Việt, đ → d, chữ thường. */
export function foldSearchText(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Tìm đích theo tên (không phân biệt dấu, hoa thường; mọi từ phải có). Ưu tiên: tên bắt đầu bằng cụm tìm →
 * tên chứa cụm → tên chứa mọi từ → đường dẫn / chú thích chứa mọi từ.
 */
export function searchDestinations(query: string, limit = 50, list: readonly Destination[] = allDestinations()): Destination[] {
  const q = foldSearchText(query);
  if (!q) return [];
  const tokens = q.split(' ');
  const scored: { d: Destination; score: number; i: number }[] = [];
  list.forEach((d, i) => {
    const title = foldSearchText(`${d.title} ${d.shortName}`);
    const all = `${title} ${foldSearchText(`${d.path.join(' ')} ${d.hint ?? ''}`)}`;
    if (!tokens.every((t) => all.includes(t))) return;
    const score = foldSearchText(d.title).startsWith(q) ? 0 : title.includes(q) ? 1 : tokens.every((t) => title.includes(t)) ? 2 : 3;
    scored.push({ d, score, i });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.d);
}
