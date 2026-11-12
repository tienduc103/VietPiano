import { useSettings } from '../../store/settingsStore';
import { Icon } from '../ui';

export interface CounterItem {
  /** Chữ hiện trên màn, vd "✓ 3". */
  text: string;
  /** Đọc cho trình đọc màn hình, vd "3 nốt đúng". */
  spoken: string;
  /** Chú thích khi rê chuột (giữ nguyên chữ cũ — e2e tìm theo title). */
  title: string;
  /** Lớp màu chữ. */
  tone: string;
  testId: string;
}

/**
 * Bộ đếm đúng/sai ở đầu màn Luyện tập. Bấm vào bộ đếm để ẩn / hiện (`hideNoteCounter`, cũng ở Cài đặt → Hiển thị):
 * lựa chọn được nhớ cho mọi bài — Chơi lại, Bài tiếp theo, mở lại app vẫn giữ nguyên.
 * Ẩn CHỈ bỏ con số trên màn: engine chấm, thống kê phiên, điểm, tiến độ không đọc cài đặt này; hết bài hộp thoại
 * kết quả luôn hiện đủ. Con số luôn lấy từ trạng thái chấm hiện tại → bật lại giữa bài hiện ngay số liệu tích luỹ.
 * Đang ẩn vẫn giữ một nút nhỏ (biểu tượng mắt gạch) ở đúng chỗ để bấm hiện lại.
 */
export function NoteCounter({ items, hiddenGlyph }: { items: readonly CounterItem[]; hiddenGlyph: string }) {
  const hidden = useSettings((s) => s.settings.hideNoteCounter);
  const update = useSettings((s) => s.update);
  return (
    <button
      type="button"
      onClick={() => update({ hideNoteCounter: !hidden })}
      aria-label={hidden ? 'Bộ đếm đúng/sai đang ẩn — bấm để hiện' : `${items.map((i) => i.spoken).join(', ')} — bấm để ẩn bộ đếm`}
      title={
        hidden
          ? 'Bộ đếm đang ẩn: app vẫn chấm, hết bài hiện đủ kết quả. Bấm để hiện số liệu tới lúc này.'
          : 'Bấm để ẩn bộ đếm đúng/sai trong lúc luyện (app vẫn chấm, hết bài hiện đủ kết quả)'
      }
      className="flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-4 rounded-xl px-2 text-lg font-semibold tabular-nums transition-colors hover:bg-slate-200/60 active:bg-slate-300/60 dark:hover:bg-slate-800/60"
      data-testid="note-counter"
      data-hidden={hidden || undefined}
    >
      {hidden ? (
        <span className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500" aria-hidden>
          <Icon name="eyeOff" className="h-5 w-5" />
          {hiddenGlyph}
        </span>
      ) : (
        items.map((i) => (
          <span key={i.testId} className={i.tone} title={i.title} data-testid={i.testId}>
            {i.text}
          </span>
        ))
      )}
    </button>
  );
}
