import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../../curriculum/content/curriculum';
import { DISCOVERY } from '../../curriculum/content/discovery';
import { findLesson } from '../../curriculum/unlock';
import { ARCADE_KINDS, ARCADE_VARIANTS } from '../../games/arcade';
import { STANDALONE_GAMES } from '../../games/catalog';
import { GAME_TITLE } from '../../games/gameForLesson';
import { resolveTarget } from '../registry';
import { courseLessons } from './context';
import { focusLesson, gameDrafts, gameOptions } from './play';
import { ARCADE_STARTER_VARIANT, GAME_KIND_SKILLS, lessonSkills, STANDALONE_GAME_SKILLS } from './skills';
import { passed, records, smartInput } from './testing';

const lesson = (id: string) => findLesson(CURRICULUM, id) ?? findLesson(DISCOVERY, id)!;

describe('kỹ năng của trò chơi (metadata thật, không gán mọi kỹ năng)', () => {
  it('mọi trò có màn riêng / mọi loại trò đều có kỹ năng, không trò nào gắn đủ mọi kỹ năng', () => {
    for (const g of STANDALONE_GAMES) expect(STANDALONE_GAME_SKILLS[g.id].length).toBeGreaterThan(0);
    for (const k of Object.keys(GAME_TITLE) as (keyof typeof GAME_TITLE)[]) expect(GAME_KIND_SKILLS[k].length).toBeGreaterThan(0);
    for (const skills of [...Object.values(STANDALONE_GAME_SKILLS), ...Object.values(GAME_KIND_SKILLS)]) expect(skills.length).toBeLessThanOrEqual(3);
  });

  it('cà chua không đồng hồ → không gắn "đọc nốt nhanh"; Bóng bay hiện tên nốt → không gắn đọc khuông', () => {
    expect(STANDALONE_GAME_SKILLS['tomato-harvest']).not.toContain('reading-speed');
    expect(STANDALONE_GAME_SKILLS['balloon-pop']).not.toContain('staff-reading');
    expect(STANDALONE_GAME_SKILLS['flappy-note']).toContain('reading-speed');
  });

  it('mọi đích trò chơi dùng cho gợi ý đều tồn tại trong registry (mức chơi tự do có thật)', () => {
    for (const o of gameOptions()) expect(resolveTarget(o.target), `${o.target.type}:${o.target.id}`).not.toBeNull();
    for (const k of ARCADE_KINDS) expect(ARCADE_VARIANTS[k].some((v) => v.id === ARCADE_STARTER_VARIANT[k])).toBe(true);
  });
});

describe('kỹ năng của buổi học — suy từ bài tập + hình minh hoạ', () => {
  it('buổi tìm phím / số ngón / đọc khuông / tiết tấu', () => {
    expect(lessonSkills(lesson('l1-01-keyboard'))).toEqual(['keyboard']);
    expect(lessonSkills(lesson('l1-02-find-c'))).toEqual(['note-names', 'keyboard']);
    expect(lessonSkills(lesson('l1-03-fingers'))).toContain('fingers');
    expect(lessonSkills(lesson('l1-06-staff'))).toContain('staff-reading');
  });

  it('mọi buổi của ba giáo trình đều suy được ít nhất một kỹ năng', () => {
    const empty = courseLessons().filter((c) => lessonSkills(c.lesson).length === 0).map((c) => c.lesson.lessonId);
    expect(empty).toEqual([]);
  });
});

describe('trò chơi phù hợp', () => {
  it('buổi "nhận biết nốt" (tên nốt → phím) → Bóng bay; buổi đọc khuông → trò đọc khuông', () => {
    const findC = gameDrafts(smartInput({ records: records(passed('l1-01-keyboard')) }));
    expect(focusLesson(smartInput({ records: records(passed('l1-01-keyboard')) }))?.lesson.lessonId).toBe('l1-02-find-c');
    expect(findC[0]).toMatchObject({ target: { type: 'game', id: 'balloon-pop' }, reason: 'Luyện tên nốt và vị trí phím, nhận biết bàn phím — kỹ năng của Buổi 2' });
    const done = ['l1-01-keyboard', 'l1-02-find-c', 'l1-03-fingers', 'l1-04-cde', 'l1-05-week1-test'].map((id) => passed(id));
    const staff = gameDrafts(smartInput({ records: records(...done) }));
    expect(staff[0].evidence).toMatchObject({ kind: 'skill-match', lessonId: 'l1-06-staff' });
    expect(staff[0].reason).toContain('đọc nốt trên khuông');
  });

  it('bé chỉ học "Khám phá nốt nhạc" → trò bám buổi tiếp theo của giáo trình đó, không phải Buổi 1 giáo trình chính', () => {
    const input = smartInput({ records: records(passed('nd-keyboard')) });
    const focus = focusLesson(input);
    expect(focus?.course).toBe('discovery');
    expect(focus?.lesson.lessonId).toBe('nd-c');
    expect(gameDrafts(input)[0].evidence).toMatchObject({ lessonId: 'nd-c' });
  });

  it('hết giờ chơi → không gợi ý trò', () => {
    expect(gameDrafts(smartInput({ gameTimeRemainingMs: 0 }))).toEqual([]);
  });
});
