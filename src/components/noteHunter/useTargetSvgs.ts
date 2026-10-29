import { useEffect, useState } from 'react';
import { DURATION_BEATS, measureLength, type Duration } from '../../core/lessons/types';
import { midiToName } from '../../core/music/notes';
import { spelledPitch, type HunterSong } from '../../core/noteHunter/songs';
import { renderScore, scoreFontsReady } from '../../core/score/ScoreRenderer';

/** Dải dọc (toạ độ VexFlow) giữ lại quanh 5 dòng kẻ + dòng kẻ phụ — bỏ vùng tên nốt / số ngón. */
const STAFF_TOP = 38;
const STAFF_BAND = 108;

/** Trường độ lấp đủ một ô nhịp của bài (3/4 → trắng chấm), không có thì nốt tròn. */
function fullMeasureDuration(song: HunterSong): Duration {
  const beats = measureLength(song.timeSignature);
  return (Object.keys(DURATION_BEATS) as Duration[]).find((d) => Math.abs(DURATION_BEATS[d] - beats) < 1e-9) ?? 'w';
}

/**
 * Vẽ sẵn mỗi nốt mục tiêu một ô khuông nhỏ (SVG, một lần cho cả ván) theo đúng khoá, hoá biểu, số chỉ nhịp
 * và cách ghi thăng/giáng của bài — như `useStaffSvgs` của trò Bắn bóng nhưng không cố định 4/4.
 */
export function useTargetSvgs(song: HunterSong, midis: readonly number[]): Map<number, string> | null {
  const [svgs, setSvgs] = useState<Map<number, string> | null>(null);
  const key = [...midis].sort((a, b) => a - b).join(',');
  useEffect(() => {
    let alive = true;
    void scoreFontsReady().then(() => {
      if (!alive) return;
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden';
      document.body.appendChild(host);
      const out = new Map<number, string>();
      const dur = fullMeasureDuration(song);
      try {
        for (const m of new Set(midis)) {
          const pitch = spelledPitch(song, m) ?? midiToName(m);
          const lesson = { ...song.lesson, id: `hunter-target-${m}`, notes: [{ pitch, midi: m, duration: dur }], pickup: undefined, sections: undefined, dynamics: undefined };
          const r = renderScore(host, lesson, { showNames: false, labelStyle: 'letter' });
          const svg = host.querySelector('svg');
          if (!svg) continue;
          r.cursor.remove();
          const box = svg.getBBox();
          const x = box.width > 0 ? box.x - 6 : 0;
          svg.setAttribute('viewBox', `${x} ${STAFF_TOP} ${box.width > 0 ? box.width + 12 : r.width} ${STAFF_BAND}`);
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.removeAttribute('style');
          out.set(m, svg.outerHTML);
        }
      } catch (err) {
        console.error('[VietPiano] Lỗi vẽ khuông nốt mục tiêu', err);
      } finally {
        host.remove();
      }
      if (alive) setSvgs(out);
    });
    return () => {
      alive = false;
    };
    // `key` đại diện cho `midis` (mảng mới mỗi lần render).
  }, [song, key]);
  return svgs;
}
