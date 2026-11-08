import { useEffect, useMemo, useRef, useState } from 'react';
import { LESSON_STAGE_LABEL, measuresLabel, resolveTarget, stageOptions, suggestedColor, type Destination } from '../../core/shortcuts/registry';
import { cleanName, DEFAULT_SHORTCUT_ICON, findByTarget } from '../../core/shortcuts/ShortcutService';
import { SHORTCUT_COLORS, SHORTCUT_ICON_MAX, SHORTCUT_NAME_MAX, type LessonStage, type ShortcutColor, type ShortcutTarget } from '../../core/shortcuts/types';
import { lessonManager } from '../../core/lessons/LessonManager';
import { activeProfile, useProfiles } from '../../store/profileStore';
import { useShortcuts, type ShortcutEditorRequest } from '../../store/shortcutStore';
import { Button, Icon, Toggle } from '../ui';
import { DestinationPicker } from './DestinationPicker';
import { ShortcutChipFace, shortcutChipClass } from './ShortcutChip';
import { COLOR_LABEL, COLOR_SWATCH, FOCUS_RING, ICON_CHOICES } from './shortcutStyle';

const TITLE: Record<ShortcutEditorRequest['mode'], string> = { create: 'Tạo lối tắt', edit: 'Sửa lối tắt', pin: 'Ghim lối tắt' };
const SAVE_LABEL: Record<ShortcutEditorRequest['mode'], string> = { create: 'Lưu lối tắt', edit: 'Lưu thay đổi', pin: 'Ghim' };

const tone = (on: boolean) =>
  on
    ? 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-400 dark:bg-fuchsia-900/60 dark:text-fuchsia-100 dark:ring-fuchsia-500'
    : 'bg-white text-slate-700 ring-slate-200 hover:bg-violet-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700';
const chip = (on: boolean) => `min-h-12 rounded-xl px-3 text-sm font-semibold ring-1 transition-colors ${FOCUS_RING} ${tone(on)}`;
/** Ô chọn biểu tượng: emoji to, ô vuông 48px. */
const iconChip = (on: boolean) => `grid h-12 w-12 place-items-center rounded-xl text-2xl ring-1 transition-colors ${FOCUS_RING} ${tone(on)}`;

/**
 * Tạo / sửa / ghim lối tắt. Bước 1: chọn đích (bỏ qua khi ghim tại chỗ hoặc sửa lối tắt còn đích).
 * Bước 2: phần mở thẳng (buổi học) / đoạn (bài nhạc), tên, biểu tượng, màu, hiện trên trang chủ.
 * Trùng đích với lối tắt đã có → không lưu, đề xuất mở hoặc sửa lối tắt cũ.
 */
export function ShortcutEditorDialog({ request, onClose }: { request: ShortcutEditorRequest; onClose: () => void }) {
  const items = useShortcuts((s) => s.items);
  const create = useShortcuts((s) => s.create);
  const update = useShortcuts((s) => s.update);
  const openShortcut = useShortcuts((s) => s.open);
  const openEditor = useShortcuts((s) => s.openEditor);
  const profile = useProfiles(activeProfile);

  const editing = request.mode === 'edit' ? items.find((s) => s.id === request.id) : undefined;
  const pin = request.mode === 'pin' ? request : null;
  /** Đích lúc mở hộp thoại (null: tạo mới, hoặc lối tắt đang sửa đã hỏng). */
  const [initialDest] = useState(() => {
    const t = pin?.target ?? editing?.target;
    return t ? resolveTarget(t) : null;
  });

  const [step, setStep] = useState<'pick' | 'form'>(initialDest ? 'form' : 'pick');
  const [target, setTarget] = useState<ShortcutTarget | null>(initialDest?.target ?? null);
  const dest = useMemo(() => (target ? resolveTarget(target) : null), [target]);
  const [name, setName] = useState(editing?.name ?? pin?.name ?? initialDest?.shortName ?? '');
  const [icon, setIcon] = useState(editing?.icon ?? pin?.icon ?? initialDest?.icon ?? DEFAULT_SHORTCUT_ICON);
  const [color, setColor] = useState<ShortcutColor>(editing?.color ?? (initialDest ? suggestedColor(initialDest.group) : 'violet'));
  const [showOnHome, setShowOnHome] = useState(editing?.showOnHome ?? true);
  const [error, setError] = useState<string | null>(null);
  /** Người dùng đã tự sửa → đổi đích không ghi đè. */
  const touched = useRef({ name: !!editing || !!pin?.name, icon: !!editing || !!pin?.icon, color: !!editing });
  /** Đoạn ô của bài lúc mở (để bật / tắt "chỉ đoạn này"). */
  const initialMeasures = useRef(initialDest?.target.type === 'practice' ? initialDest.target.params?.measures : undefined);

  useEffect(() => {
    // Lối tắt đang sửa bị xoá (tab khác / hoàn tác…) → đóng.
    if (request.mode === 'edit' && !editing) onClose();
  }, [request.mode, editing, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Người dùng bàn phím bắt đầu trong hộp thoại (không tự mở bàn phím ảo iPad: focus khung, không focus ô nhập);
  // đóng → trả focus về nút đã mở.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  /** Đổi đích; tên / biểu tượng / màu theo đích mới trừ khi người dùng đã tự đặt. */
  const applyDestination = (d: Destination, goForm = true) => {
    setTarget(d.target);
    if (!touched.current.name) setName(d.shortName);
    if (!touched.current.icon) setIcon(d.icon);
    if (!touched.current.color) setColor(suggestedColor(d.group));
    setError(null);
    if (goForm) setStep('form');
  };
  const retarget = (t: ShortcutTarget) => {
    const d = resolveTarget(t);
    if (d) applyDestination(d, false);
  };

  const duplicate = target ? findByTarget(items, target, editing?.id) : undefined;
  const canSave = !!dest && !duplicate && cleanName(name).length > 0;
  const stages = target?.type === 'lesson' ? stageOptions(target.id) : [];
  const stage = target?.params?.stage ?? null;
  const practiceLesson = target?.type === 'practice' ? lessonManager.get(target.id) : undefined;

  const save = () => {
    if (!target || !canSave) return;
    const input = { name, icon, color, target, showOnHome };
    const r = editing ? update(editing.id, input) : create(input);
    if (r.ok) onClose();
    else if (r.reason === 'duplicate') setError(`Đã có lối tắt “${r.existing.name}” tới nội dung này.`);
    else if (r.reason === 'limit') setError('Đã có quá nhiều lối tắt. Xoá bớt lối tắt không dùng rồi thử lại.');
    else setError('Không lưu được lối tắt này.');
  };

  const brokenEdit = !!editing && !resolveTarget(editing.target);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={TITLE[request.mode]}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="shortcut-editor"
      data-step={step}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex w-full max-w-2xl flex-col rounded-3xl bg-white p-5 text-slate-900 shadow-2xl outline-none dark:bg-slate-800 dark:text-slate-100 ${step === 'pick' ? 'h-[min(42rem,calc(100dvh-2rem))]' : 'max-h-[calc(100dvh-2rem)]'}`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{TITLE[request.mode]}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {step === 'pick' ? 'Bước 1/2 · Chọn nội dung muốn mở nhanh' : 'Bước 2/2 · Tên, biểu tượng và màu'} ·{' '}
              {profile ? `lưu cho hồ sơ ${profile.avatar} ${profile.name}` : 'lưu trên máy này'}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng" className="px-2">
            <Icon name="close" />
          </Button>
        </div>

        {step === 'pick' ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
            {brokenEdit && (
              <p className="rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="alert">
                Nội dung cũ của lối tắt “{editing?.name}” không còn trong phiên bản này — chọn nội dung mới.
              </p>
            )}
            <DestinationPicker onPick={(d) => applyDestination(d)} />
            {dest && (
              <div className="flex justify-end">
                <Button onClick={() => setStep('form')}>Quay lại bước 2</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
            {dest && (
              <div
                className="flex items-center gap-3 rounded-2xl bg-violet-50 p-3 ring-1 ring-violet-100 dark:bg-slate-900/60 dark:ring-violet-900"
                data-testid="shortcut-editor-destination"
              >
                <span className="text-3xl leading-none" aria-hidden>
                  {dest.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Mở thẳng tới · {dest.path.join(' › ')}</div>
                  <div className="truncate font-semibold">{dest.title}</div>
                </div>
                <Button variant="ghost" onClick={() => setStep('pick')} className="shrink-0 px-3 text-sm" data-testid="shortcut-editor-change">
                  Đổi
                </Button>
              </div>
            )}

            {target && stages.length > 1 && (
              <fieldset>
                <legend className="text-sm font-semibold">Mở phần</legend>
                <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Mở phần">
                  {stages.map((s) => (
                    <button
                      key={s ?? 'overview'}
                      type="button"
                      role="radio"
                      aria-checked={stage === s}
                      onClick={() => retarget({ type: 'lesson', id: target.id, ...(s ? { params: { stage: s as LessonStage } } : {}) })}
                      className={chip(stage === s)}
                      data-testid={`shortcut-stage-${s ?? 'overview'}`}
                    >
                      {s ? LESSON_STAGE_LABEL[s] : 'Buổi học (trang tổng quan)'}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {target && practiceLesson && initialMeasures.current && (
              <fieldset>
                <legend className="text-sm font-semibold">Đoạn</legend>
                <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Đoạn">
                  {[initialMeasures.current, undefined].map((m) => (
                    <button
                      key={m ? 'slice' : 'full'}
                      type="button"
                      role="radio"
                      aria-checked={(target.params?.measures !== undefined) === !!m}
                      onClick={() => retarget({ type: 'practice', id: target.id, ...(m ? { params: { measures: m } } : {}) })}
                      className={chip((target.params?.measures !== undefined) === !!m)}
                    >
                      {m ? `Chỉ ${measuresLabel(practiceLesson, m)}` : 'Cả bài'}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {duplicate && (
              <div
                className="rounded-2xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-100 dark:ring-amber-800"
                role="alert"
                data-testid="shortcut-duplicate"
              >
                <p className="font-semibold">
                  Đã có lối tắt “{duplicate.icon} {duplicate.name}” tới nội dung này.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      onClose();
                      openShortcut(duplicate);
                    }}
                  >
                    Mở lối tắt đó
                  </Button>
                  <Button onClick={() => openEditor({ mode: 'edit', id: duplicate.id })} data-testid="shortcut-duplicate-edit">
                    Sửa lối tắt đó
                  </Button>
                </div>
              </div>
            )}

            <label className="block">
              <span className="text-sm font-semibold">Tên</span>
              <input
                value={name}
                maxLength={SHORTCUT_NAME_MAX}
                onChange={(e) => {
                  touched.current.name = true;
                  setName(e.target.value);
                }}
                placeholder="Ví dụ: 🍅 Thu hoạch"
                className="mt-1 block min-h-12 w-full rounded-xl bg-white px-4 text-base ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-600"
                data-testid="shortcut-name"
              />
            </label>

            <fieldset>
              <legend className="text-sm font-semibold">Biểu tượng</legend>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  value={icon}
                  maxLength={SHORTCUT_ICON_MAX}
                  onChange={(e) => {
                    touched.current.icon = true;
                    setIcon(e.target.value);
                  }}
                  aria-label="Biểu tượng (gõ hoặc dán emoji)"
                  className="min-h-12 w-20 rounded-xl bg-white text-center text-2xl ring-1 ring-slate-300 outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:ring-slate-600"
                  data-testid="shortcut-icon"
                />
                {[...new Set([dest?.icon, ...ICON_CHOICES].filter((x): x is string => !!x))].map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => {
                      touched.current.icon = true;
                      setIcon(x);
                    }}
                    aria-pressed={icon === x}
                    aria-label={`Biểu tượng ${x}`}
                    className={iconChip(icon === x)}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-semibold">Màu nền</legend>
              <div className="mt-1 flex flex-wrap gap-2" role="radiogroup" aria-label="Màu nền">
                {SHORTCUT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={color === c}
                    aria-label={COLOR_LABEL[c]}
                    title={COLOR_LABEL[c]}
                    onClick={() => {
                      touched.current.color = true;
                      setColor(c);
                    }}
                    className={`grid h-12 w-12 place-items-center rounded-full ring-2 ${COLOR_SWATCH[c]} ${color === c ? 'ring-fuchsia-500' : 'ring-transparent'} ${FOCUS_RING}`}
                  >
                    {color === c && <Icon name="check" className="h-5 w-5 text-slate-800 dark:text-white" />}
                  </button>
                ))}
              </div>
            </fieldset>

            <Toggle
              label={
                <span>
                  Hiện trên thanh lối tắt ở trang chủ
                  <span className="block text-sm text-slate-500 dark:text-slate-400">Tắt thì lối tắt chỉ có trong menu ⋯ và trong Cài đặt.</span>
                </span>
              }
              checked={showOnHome}
              onChange={setShowOnHome}
            />

            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-900/60">
              <span className="text-sm text-slate-500 dark:text-slate-400">Xem trước:</span>
              <span className={shortcutChipClass({ color })} data-testid="shortcut-preview">
                <ShortcutChipFace shortcut={{ name: cleanName(name) || '…', icon: icon.trim() || DEFAULT_SHORTCUT_ICON, color }} />
              </span>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-200" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        {step === 'form' && (
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button variant="ghost" onClick={onClose}>
              Huỷ
            </Button>
            <Button variant="primary" onClick={save} disabled={!canSave} className="min-w-40" data-testid="shortcut-save">
              {request.mode === 'pin' && <Icon name="pin" className="h-5 w-5" />}
              {SAVE_LABEL[request.mode]}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
