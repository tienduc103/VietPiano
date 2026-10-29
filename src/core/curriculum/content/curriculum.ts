/**
 * Giáo trình VietPiano: 6 cấp độ, đủ nội dung (mỗi cấp 4 tuần × 5 buổi). Cấp chưa có nội dung dùng
 * availability 'coming-soon' (Curriculum Browser hiện "Sắp có"). Thêm cấp mới: tạo `levelN.ts` (tuần + buổi) rồi gắn vào đây.
 */
import type { Curriculum } from '../types';
import { LEVEL1_LESSONS, LEVEL1_WEEKS } from './level1';
import { LEVEL2_LESSONS, LEVEL2_WEEKS } from './level2';
import { LEVEL3_LESSONS, LEVEL3_WEEKS } from './level3';
import { LEVEL4_LESSONS, LEVEL4_WEEKS } from './level4';
import { LEVEL5_LESSONS, LEVEL5_WEEKS } from './level5';
import { LEVEL6_LESSONS, LEVEL6_WEEKS } from './level6';

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
    {
      levelId: 'level-3',
      number: 3,
      title: 'Cấp 3 — Móc đơn và chấm dôi',
      description: 'Nốt móc đơn, dấu lặng móc đơn, nốt đen chấm dôi, đảo phách đơn giản và gam Đô trưởng luồn ngón. 4 tuần, 20 buổi.',
      availability: 'available',
      weeks: LEVEL3_WEEKS,
      lessons: LEVEL3_LESSONS,
    },
    {
      levelId: 'level-4',
      number: 4,
      title: 'Cấp 4 — Dấu thăng, dấu giáng',
      description: 'Dấu thăng, dấu giáng, dấu hoàn, nửa cung; hoá biểu và gam Sol trưởng, Fa trưởng; bài hai tay trong hai giọng. 4 tuần, 20 buổi.',
      availability: 'available',
      weeks: LEVEL4_WEEKS,
      lessons: LEVEL4_LESSONS,
    },
    {
      levelId: 'level-5',
      number: 5,
      title: 'Cấp 5 — Hai tay cùng lúc',
      description: 'Giai điệu tay phải với nốt trầm, hợp âm Đô – Fa – Sol, đệm valse và hợp âm rải tay trái; hai tay giọng Sol trưởng, Fa trưởng. App chấm giai điệu tay phải. 4 tuần, 20 buổi.',
      availability: 'available',
      weeks: LEVEL5_WEEKS,
      lessons: LEVEL5_LESSONS,
    },
    {
      levelId: 'level-6',
      number: 6,
      title: 'Cấp 6 — Biểu diễn',
      description: 'Sắc thái mạnh nhẹ (p, mp, mf, f; to dần, nhỏ dần), câu nhạc, hình thức A – B – A, nhịp độ; bài cổ điển phạm vi công cộng và buổi hoà nhạc tốt nghiệp. 4 tuần, 20 buổi.',
      availability: 'available',
      weeks: LEVEL6_WEEKS,
      lessons: LEVEL6_LESSONS,
    },
  ],
};
