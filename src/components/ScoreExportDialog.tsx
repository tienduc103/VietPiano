import { useEffect, useState } from 'react';
import type { Lesson } from '../core/lessons/types';
import type { NoteLabelStyle } from '../core/music/notes';
import { scoreFontsReady } from '../core/score/ScoreRenderer';
import { renderScoreSheet } from '../core/score/ScoreSheet';
import { sheetFileName } from '../core/score/sheetLayout';
import { Button, Icon, Toggle } from './ui';

interface Props {
  lesson: Lesson;
  labelStyle: NoteLabelStyle;
  onClose: () => void;
}

/** Tải file về máy bằng thẻ <a download> (máy tính; Safari iPad mở ảnh ở tab mới). */
function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Xem trước và xuất bản nhạc của một bài thành ảnh PNG để tự học (in ra, lưu vào Ảnh…).
 * Ảnh được dựng sẵn khi mở hộp thoại để lúc bấm "Lưu" gọi được Web Share ngay trong
 * thao tác chạm (Safari đòi user gesture).
 */
export function ScoreExportDialog({ lesson, labelStyle, onClose }: Props) {
  const [showNames, setShowNames] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setFile(null);
    setError(null);
    void scoreFontsReady()
      .then(() => {
        if (!alive) return null;
        const canvas = document.createElement('canvas');
        renderScoreSheet(canvas, lesson, { showNames, labelStyle });
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      })
      .then((blob) => {
        if (!alive || !blob) return;
        url = URL.createObjectURL(blob);
        setPreview(url);
        setFile(new File([blob], sheetFileName(lesson.title), { type: 'image/png' }));
      })
      .catch((err) => {
        console.error('[VietPiano] Lỗi xuất ảnh khuông nhạc', err);
        if (alive) setError('Không tạo được ảnh khuông nhạc.');
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [lesson, showNames, labelStyle]);

  const canShare = !!file && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: lesson.title });
    } catch (err) {
      // Người dùng đóng bảng chia sẻ → không làm gì; lỗi khác → tải về thay thế.
      if ((err as DOMException).name !== 'AbortError') downloadFile(file);
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label="Xuất ảnh khuông nhạc"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col rounded-3xl bg-white p-6 shadow-2xl dark:bg-slate-800">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-xl font-bold">Ảnh khuông nhạc</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{lesson.title} — lưu lại để tự xem, in hoặc chép tay.</p>
          </div>
          <Button autoFocus variant="ghost" onClick={onClose} aria-label="Đóng" className="px-2">
            <Icon name="close" />
          </Button>
        </div>

        <div className="mt-4 min-h-40 flex-1 overflow-y-auto overscroll-contain rounded-xl bg-slate-100 p-2 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
          {error ? (
            <p className="p-6 text-center text-red-600 dark:text-red-400">{error}</p>
          ) : preview ? (
            <img src={preview} alt={`Khuông nhạc bài ${lesson.title}`} data-testid="score-sheet-preview" className="w-full rounded-lg bg-white" />
          ) : (
            <p className="p-6 text-center text-slate-500">Đang vẽ khuông nhạc…</p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="min-w-56 flex-1">
            <Toggle checked={showNames} onChange={setShowNames} label="Ghi tên nốt dưới khuông" />
          </div>
          {canShare && (
            <Button variant="primary" onClick={() => void share()} disabled={!file}>
              <Icon name="share" />
              Lưu / chia sẻ ảnh
            </Button>
          )}
          <Button variant={canShare ? 'secondary' : 'primary'} onClick={() => file && downloadFile(file)} disabled={!file}>
            <Icon name="download" />
            Tải ảnh PNG
          </Button>
        </div>
      </div>
    </div>
  );
}
