/**
 * Cách đặt khuông nhạc một dòng vào vùng nhìn: tỉ lệ phóng + vị trí theo chiều dọc.
 *
 * Vùng nhìn thường co giãn vài chục px khi chơi (ô hướng dẫn tay trái có / không có số ngón, lời cô giáo
 * xuống dòng…). Nếu tính lại tỉ lệ mỗi lần như vậy thì cả khuông phóng to – thu nhỏ, nhảy lên xuống theo
 * từng nốt → khó đọc. Nên giữ nguyên tỉ lệ + vị trí đã chọn khi chiều cao chỉ đổi ít (`tolerance`);
 * đổi nhiều (xoay máy, ẩn/hiện bàn phím, toàn màn hình) hoặc đổi bài mới đặt lại.
 */

export interface ScoreFit {
  /** Tỉ lệ phóng khuông nhạc. */
  scale: number;
  /** Khoảng cách từ mép trên vùng nhìn tới mép trên khuông (px, đã phóng). */
  top: number;
  /** Chiều cao vùng nhìn lúc chọn tỉ lệ. */
  viewportHeight: number;
  /** Chiều cao khuông nhạc (đơn vị vẽ) lúc chọn tỉ lệ — đổi bài / cách vẽ thì đặt lại. */
  scoreHeight: number;
}

export interface ScoreFitOptions {
  minScale: number;
  maxScale: number;
  /** Tỉ lệ phóng khi chưa đo được vùng nhìn. */
  fallbackScale: number;
  /**
   * Chiều cao vùng nhìn đổi trong khoảng này (tỉ lệ so với lúc chọn) thì giữ nguyên. Vùng nhìn co lại thì
   * phần dưới khuông bị khuất tối đa chừng ấy — phần đó là khoảng trống dưới hàng tên nốt / pedal (~17%).
   */
  tolerance?: number;
}

export const SCORE_FIT_TOLERANCE = 0.08;

/** Chọn tỉ lệ + vị trí cho khuông nhạc; giữ nguyên `prev` nếu vùng nhìn chỉ đổi chiều cao chút ít. */
export function fitScore(prev: ScoreFit | null, viewportHeight: number, scoreHeight: number, opts: ScoreFitOptions): ScoreFit {
  const tolerance = opts.tolerance ?? SCORE_FIT_TOLERANCE;
  if (
    prev &&
    viewportHeight > 0 &&
    prev.viewportHeight > 0 &&
    prev.scoreHeight === scoreHeight &&
    Math.abs(viewportHeight - prev.viewportHeight) <= prev.viewportHeight * tolerance
  ) {
    return prev;
  }
  const scale = viewportHeight > 0 ? Math.max(opts.minScale, Math.min(opts.maxScale, viewportHeight / scoreHeight)) : opts.fallbackScale;
  // Canh giữa theo chiều dọc (khuông cao hơn vùng nhìn thì cắt đều hai đầu, như trước).
  const top = viewportHeight > 0 ? (viewportHeight - scoreHeight * scale) / 2 : 0;
  return { scale, top, viewportHeight, scoreHeight };
}
