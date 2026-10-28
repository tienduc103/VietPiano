/**
 * Giáo trình VietPiano: 6 cấp độ. Cấp 1–2 đã có nội dung; cấp 3–6 mới là khung (availability 'coming-soon')
 * để Curriculum Browser hiện đủ lộ trình. Thêm cấp mới: tạo `levelN.ts` (tuần + buổi) rồi gắn vào đây.
 */
import type { Curriculum, Level } from '../types';
import { LEVEL1_LESSONS, LEVEL1_WEEKS } from './level1';
import { LEVEL2_LESSONS, LEVEL2_WEEKS } from './level2';

const comingSoon = (number: number, title: string, description: string): Level => ({
  levelId: `level-${number}`,
  number,
  title,
  description,
  availability: 'coming-soon',
  weeks: [],
  lessons: [],
});

export const CURRICULUM: Curriculum = {
  curriculumId: 'vietpiano-basic',
  title: 'Giáo trình Piano VietPiano',
  contentVersion: 1,
  levels: [
    {
      levelId: 'level-1',
      number: 1,
      title: 'Cấp 1 — Làm quen Piano',
      description: 'Bàn phím, nốt Đô – Sol, đọc khuông nhạc, tiết tấu cơ bản và hai tay thay phiên. 4 tuần, 20 buổi.',
      availability: 'available',
      weeks: LEVEL1_WEEKS,
      lessons: LEVEL1_LESSONS,
    },
    {
      levelId: 'level-2',
      number: 2,
      title: 'Cấp 2 — Mở rộng tầm tay',
      description: 'Thế tay Sol, đủ bảy nốt, đổi thế tay, tay trái thế Sol, nhịp 3/4, quãng 5 và quãng 8. 4 tuần, 20 buổi.',
      availability: 'available',
      weeks: LEVEL2_WEEKS,
      lessons: LEVEL2_LESSONS,
    },
    comingSoon(3, 'Cấp 3 — Móc đơn và chấm dôi', 'Nốt móc đơn, nốt có chấm dôi, đảo phách đơn giản.'),
    comingSoon(4, 'Cấp 4 — Dấu thăng, dấu giáng', 'Phím đen trên khuông nhạc, hoá biểu Sol trưởng và Fa trưởng.'),
    comingSoon(5, 'Cấp 5 — Hai tay cùng lúc', 'Giai điệu tay phải với nốt trầm tay trái, phối hợp hai tay.'),
    comingSoon(6, 'Cấp 6 — Biểu diễn', 'Bài nhạc hoàn chỉnh, sắc thái mạnh nhẹ, biểu diễn trọn bài.'),
  ],
};
