import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * Đang chơi đàn trong một bài (Luyện tập đã bắt đầu / đồng hồ nhịp đang chạy, bài tập giáo trình đang làm):
 * ẩn các nút nổi (micro, tải lại) để không che khuông nhạc và không bấm nhầm. Đếm số nơi đang báo "đang chơi".
 */
export const usePlaying = create<{ count: number }>(() => ({ count: 0 }));

export const selectPlaying = (s: { count: number }) => s.count > 0;

/** Báo "đang chơi" trong lúc `active` (tự gỡ khi rời màn). */
export function usePlayingNow(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    usePlaying.setState((s) => ({ count: s.count + 1 }));
    return () => usePlaying.setState((s) => ({ count: Math.max(0, s.count - 1) }));
  }, [active]);
}
