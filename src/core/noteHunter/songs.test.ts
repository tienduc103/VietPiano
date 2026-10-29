import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitMeasures } from '../lessons/notation';
import { measureLength } from '../lessons/types';
import { isLikelyEcho } from './AudioScheduler';
import { acceptHunterSource, filterHunterEvent } from './input';
import { summarize } from './NoteHunterGame';
import { findSong, hunterSongs, rangeMidis, songMidis, spelledPitch, TARGET_GROUPS, TARGET_RANGES, targetIndices } from './songs';
import { appendRun, DEFAULT_HUNTER_SETTINGS, loadRuns, sanitizeHunterSettings, saveRun, type HunterRun } from './storage';

describe('thư viện bài Săn nốt', () => {
  const songs = hunterSongs();

  it('có ít nhất 3 bài riêng (tự biên soạn / công cộng) và các bài hát một bè của thư viện', () => {
    const own = songs.filter((s) => s.songId.startsWith('hunter-'));
    expect(own.length).toBeGreaterThanOrEqual(3);
    own.forEach((s) => expect(s.source).toMatch(/tự biên soạn|phạm vi công cộng/));
    expect(songs.some((s) => s.songId === 'song-ode-to-joy')).toBe(true);
    expect(new Set(songs.map((s) => s.songId)).size).toBe(songs.length);
  });

  it('mọi bài: ô nhịp đủ phách, nốt trong tầm micro, dữ liệu nốt khớp khuông nhạc', () => {
    for (const s of songs) {
      const measures = splitMeasures(s.lesson.notes, measureLength(s.timeSignature), s.lesson.pickup);
      const full = measureLength(s.timeSignature);
      measures.slice(s.lesson.pickup ? 1 : 0).forEach((m) => expect(m.beats, `${s.songId}`).toBeCloseTo(full));
      expect(s.measureCount).toBe(measures.length);
      s.notes.forEach((n, i) => {
        expect(n.index).toBe(i);
        expect(n.pitch).toBe(s.lesson.notes[i].pitch);
        expect(n.voice).toBe(0);
        if (n.midiNumber !== null) {
          expect(n.midiNumber).toBe(s.lesson.notes[i].midi);
          expect(n.midiNumber).toBeGreaterThanOrEqual(36);
          expect(n.midiNumber).toBeLessThanOrEqual(84);
        }
        if (i > 0) expect(n.startBeat).toBeCloseTo(s.notes[i - 1].startBeat + s.notes[i - 1].durationBeats);
      });
    }
  });

  it('bài riêng có dấu lặng, nhịp 3/4 và hoá biểu', () => {
    expect(findSong('hunter-do-mi-sol')!.notes.some((n) => n.midiNumber === null)).toBe(true);
    const waltz = findSong('hunter-little-waltz')!;
    expect(waltz.timeSignature).toEqual([3, 4]);
    expect(waltz.keySignature).toBe('G');
    expect(spelledPitch(waltz, 66)).toBe('F#4');
  });

  it('mục tiêu = mọi lần xuất hiện của các nốt đã chọn, so theo MIDI (không nhầm quãng 8)', () => {
    const s = findSong('hunter-do-mi-sol')!;
    const c4 = targetIndices(s, [60]);
    expect(c4.length).toBeGreaterThan(3);
    c4.forEach((i) => expect(s.notes[i].midiNumber).toBe(60));
    expect(targetIndices(s, [72]).every((i) => s.notes[i].pitch === 'C5')).toBe(true);
    expect(targetIndices(s, [61])).toEqual([]);
  });

  it('nhóm nốt nằm trong khoảng đang chọn', () => {
    const s = findSong('hunter-do-mi-sol')!;
    const lv1 = TARGET_RANGES[0];
    expect(rangeMidis(lv1)).toHaveLength(13);
    expect(TARGET_GROUPS.find((g) => g.id === 'white')!.midis(lv1, s)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(TARGET_GROUPS.find((g) => g.id === 'in-song')!.midis(lv1, s)).toEqual(songMidis(s).filter((m) => m <= 72));
  });
});

describe('nguồn nốt và tiếng vọng', () => {
  it('chọn nguồn: Piano ảo chỉ nhận phím ảo; MIDI / Micro / Tự động như giáo trình', () => {
    expect(acceptHunterSource('midi', 'virtual', true)).toBe(false);
    expect(acceptHunterSource('microphone', 'virtual', false)).toBe(false);
    expect(acceptHunterSource('virtual', 'virtual', false)).toBe(true);
    expect(acceptHunterSource('microphone', 'midi', false)).toBe(false);
    expect(acceptHunterSource('midi', 'microphone', true)).toBe(false);
    // Tự động: có đàn MIDI thì bỏ micro (micro nghe chính tiếng đàn đó).
    expect(acceptHunterSource('microphone', 'auto', true)).toBe(false);
    expect(acceptHunterSource('microphone', 'auto', false)).toBe(true);
    expect(acceptHunterSource('virtual', 'midi', true)).toBe(true);
  });

  it('bỏ nốt micro trùng (hoặc là hoạ âm của) nốt app đang phát; nốt khác cao độ vẫn nhận', () => {
    const played = [{ midi: 64, start: 1000, end: 2000 }];
    expect(isLikelyEcho(64, 1500, played)).toBe(true);
    expect(isLikelyEcho(76, 1500, played)).toBe(true); // hoạ âm 2
    expect(isLikelyEcho(64, 2300, played)).toBe(true); // âm ngân sau khi tắt
    expect(isLikelyEcho(64, 2600, played)).toBe(false);
    expect(isLikelyEcho(60, 1900, played)).toBe(false);
    const ctx = { setting: 'auto' as const, midiConnected: false, headphones: false, played };
    expect(filterHunterEvent({ midi: 64, time: 1500, source: 'microphone' }, ctx)).toBe('echo');
    expect(filterHunterEvent({ midi: 64, time: 1500, source: 'microphone' }, { ...ctx, headphones: true })).toBe('accept');
    expect(filterHunterEvent({ midi: 64, time: 1500, source: 'virtual' }, ctx)).toBe('accept');
    expect(filterHunterEvent({ midi: 60, time: 1500, source: 'midi' }, { ...ctx, setting: 'microphone' })).toBe('source');
  });
});

describe('lưu kết quả Săn nốt', () => {
  afterEach(() => vi.unstubAllGlobals());

  const run = (at: number): HunterRun => ({ at, songId: 'hunter-do-mi-sol', mode: 'wait', bpm: 80, targets: [60], summary: summarize([]) });

  it('giữ tối đa N lần, mới nhất trước', () => {
    let runs: HunterRun[] = [];
    for (let i = 0; i < 5; i++) runs = appendRun(runs, run(i), 3);
    expect(runs.map((r) => r.at)).toEqual([4, 3, 2]);
  });

  it('lưu theo hồ sơ người học', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
    saveRun('p1', run(1));
    saveRun('p1', run(2));
    saveRun('p2', run(3));
    expect(loadRuns('p1').map((r) => r.at)).toEqual([2, 1]);
    expect(loadRuns('p2').map((r) => r.at)).toEqual([3]);
    expect(loadRuns(null)).toEqual([]);
  });

  it('không có localStorage → không lỗi', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadRuns('p1')).toEqual([]);
    expect(saveRun('p1', run(1))).toHaveLength(1);
  });

  it('cài đặt hỏng → giá trị mặc định / kẹp lại', () => {
    expect(sanitizeHunterSettings(null)).toEqual(DEFAULT_HUNTER_SETTINGS);
    const s = sanitizeHunterSettings({ bpm: 300, mode: 'x', targets: [60, 60, 99, 64], input: 'virtual', rangeId: 'c4-c5' });
    expect(s).toMatchObject({ bpm: 140, mode: 'wait', targets: [60, 64], input: 'virtual' });
  });
});
