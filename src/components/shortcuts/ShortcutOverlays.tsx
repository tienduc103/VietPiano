import { useEffect } from 'react';
import { useShortcuts } from '../../store/shortcutStore';
import { Button, Icon } from '../ui';
import { ShortcutEditorDialog } from './ShortcutEditorDialog';
import { FOCUS_RING } from './shortcutStyle';

const UNDO_MS = 8000;

/**
 * Lớp phủ dùng chung của lối tắt, gắn một lần ở App: hộp thoại tạo / sửa / ghim, thanh "Hoàn tác" sau khi xoá,
 * thông báo lối tắt có nội dung không còn (cho chọn lại đích hoặc xoá), lỗi lưu.
 */
export function ShortcutOverlays() {
  const editor = useShortcuts((s) => s.editor);
  const closeEditor = useShortcuts((s) => s.closeEditor);
  return (
    <>
      {editor && <ShortcutEditorDialog key={JSON.stringify(editor)} request={editor} onClose={closeEditor} />}
      <BrokenShortcutDialog />
      <UndoToast />
    </>
  );
}

function UndoToast() {
  const undo = useShortcuts((s) => s.undo);
  const saveError = useShortcuts((s) => s.saveError);
  const undoRemove = useShortcuts((s) => s.undoRemove);
  const dismiss = useShortcuts((s) => s.dismissUndo);
  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(dismiss, UNDO_MS);
    return () => window.clearTimeout(t);
  }, [undo, dismiss]);
  if (!undo && !saveError) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-[75] grid justify-items-center gap-2 px-4">
      {saveError && (
        <p
          className="pointer-events-auto max-w-xl rounded-2xl bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-lg ring-1 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-800"
          role="alert"
        >
          {saveError}
        </p>
      )}
      {undo && (
        <div
          className="pointer-events-auto flex max-w-xl items-center gap-2 rounded-2xl bg-slate-900 py-1 pr-1 pl-4 text-white shadow-xl dark:bg-slate-100 dark:text-slate-900"
          role="status"
          data-testid="shortcut-undo"
        >
          <span className="min-w-0 truncate">
            Đã xoá lối tắt “{undo.shortcut.icon} {undo.shortcut.name}”
          </span>
          <button
            type="button"
            onClick={undoRemove}
            className={`min-h-12 shrink-0 rounded-xl px-3 font-bold text-fuchsia-300 hover:bg-white/10 dark:text-fuchsia-700 dark:hover:bg-slate-900/10 ${FOCUS_RING}`}
            data-testid="shortcut-undo-button"
          >
            Hoàn tác
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Đóng"
            className={`grid min-h-12 min-w-12 shrink-0 place-items-center rounded-xl hover:bg-white/10 dark:hover:bg-slate-900/10 ${FOCUS_RING}`}
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function BrokenShortcutDialog() {
  const broken = useShortcuts((s) => s.broken);
  const close = useShortcuts((s) => s.closeBroken);
  const remove = useShortcuts((s) => s.remove);
  const openEditor = useShortcuts((s) => s.openEditor);
  useEffect(() => {
    if (!broken) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [broken, close]);
  if (!broken) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="alertdialog"
      aria-modal
      aria-labelledby="broken-shortcut-title"
      onClick={(e) => e.target === e.currentTarget && close()}
      data-testid="shortcut-broken"
    >
      <div className="grid w-full max-w-md gap-3 rounded-3xl bg-white p-6 text-slate-900 shadow-2xl dark:bg-slate-800 dark:text-slate-100">
        <div className="text-5xl" aria-hidden>
          🧭
        </div>
        <h2 id="broken-shortcut-title" className="text-xl font-bold">
          Không mở được “{broken.icon} {broken.name}”
        </h2>
        <p className="text-slate-600 dark:text-slate-300">
          Nội dung của lối tắt này không còn trong phiên bản VietPiano đang dùng (có thể đã được đổi hoặc gỡ khi cập nhật). Bạn có thể chọn lại nội dung cho lối tắt, hoặc xoá nó.
        </p>
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Để sau
          </Button>
          <Button variant="danger" onClick={() => remove(broken.id)} data-testid="shortcut-broken-delete">
            Xoá lối tắt
          </Button>
          <Button variant="primary" autoFocus onClick={() => openEditor({ mode: 'edit', id: broken.id })} data-testid="shortcut-broken-edit">
            Chọn lại nội dung
          </Button>
        </div>
      </div>
    </div>
  );
}
