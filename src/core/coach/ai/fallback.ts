/**
 * Nhận xét theo quy tắc (không cần AI): sinh từ kết quả chấm, cùng cấu trúc với câu trả lời của AI. Luôn có — kể cả khi
 * tắt AI, không có Ollama, AI trả JSON hỏng hay bịa (verify thay trường đó bằng câu ở đây). Mọi con số lấy từ payload.
 */
import type { CoachFeedbackContent, IssueType, ScoringResult } from '../types';
import type { CoachAiPayload } from './payload';
import type { CoachAudience } from './prompt';
import { weakestMeasures } from '../scoring/ScoringEngine';

const TIPS: Partial<Record<IssueType, string>> = {
  'wrong-note': 'Chơi chậm đoạn này, đọc tên từng nốt và nhìn phím trước khi đánh.',
  'chord-wrong-note': 'Tập riêng tay có hợp âm, bấm cả hợp âm thật chậm và kiểm tra từng phím.',
  'missing-note': 'Đọc trước nốt tiếp theo khi đang giữ nốt hiện tại để không bỏ sót.',
  'chord-missing-note': 'Đặt sẵn các ngón lên đủ phím của hợp âm rồi mới đánh.',
  octave: 'Nhìn kỹ vị trí nốt trên khuông và tìm đúng quãng tám (Đô giữa = C4) trước khi đánh.',
  order: 'Đánh chậm từng nốt theo đúng thứ tự trên khuông, đọc to tên nốt.',
  'extra-note': 'Thả lỏng tay, chỉ chạm phím cần đánh; tập chậm để không gõ thừa.',
  'repeated-note': 'Đánh dứt khoát một lần, nếu lỡ thì chơi tiếp, không gõ lại.',
  'simultaneous-extra': 'Giữ các ngón không dùng ở trên phím, không đè xuống.',
  early: 'Bật metronome ở tempo chậm và đếm to từng phách để không vội.',
  late: 'Đọc trước nốt sau trong lúc giữ nốt hiện tại; tập với metronome chậm.',
  'tempo-fast': 'Bật metronome đúng tempo mục tiêu và giữ theo, không tăng tốc.',
  'tempo-slow': 'Tập chậm cho chắc rồi tăng dần tempo tới mục tiêu.',
  'tempo-unstable': 'Giữ một tempo đều suốt bài — tập với metronome, đếm thầm.',
  hesitation: 'Tập riêng chỗ chuyển ô thật chậm cho tới khi chơi liền mạch không dừng.',
  'chord-async': 'Đặt sẵn ngón trên các phím rồi ấn cùng lúc.',
  'hands-async': 'Tập hai tay thật chậm, đếm to để hai tay vào cùng một lúc.',
  short: 'Giữ phím đủ trường độ — đếm thầm số phách trong lúc giữ.',
  long: 'Nhả phím đúng lúc sang nốt tiếp theo, đếm phách khi giữ.',
  'pedal-missing': 'Đạp pedal ngay sau khi đánh nốt đầu của đoạn có ký hiệu "Ped.".',
  'pedal-late': 'Đạp pedal ngay sau khi đánh nốt đầu ô, đừng chờ lâu.',
  'pedal-early': 'Chỉ đạp pedal ở chỗ có ký hiệu "Ped.".',
  'pedal-release-early': 'Giữ pedal tới hết đoạn có ký hiệu.',
  'pedal-release-late': 'Nhả pedal đúng chỗ kết thúc đường kẻ pedal.',
  'pedal-not-changed': 'Khi đổi hợp âm: đánh hợp âm mới, nhả pedal rồi đạp lại ngay.',
  'pedal-stray': 'Không đạp pedal ở chỗ không có ký hiệu.',
  'pedal-continuous': 'Bài này không dùng pedal — để chân nghỉ.',
  'dynamics-contrast': 'Phóng đại sự khác nhau giữa đoạn nhẹ (p) và đoạn mạnh (f).',
  hairpin: 'Tăng / giảm lực đánh dần dần qua từng nốt dưới hình nêm.',
  'velocity-uneven': 'Tập đánh các nốt giai điệu với lực đều nhau, nghe từng nốt.',
  balance: 'Đánh tay trái nhẹ hơn để giai điệu tay phải nổi lên.',
};

const TITLE: Partial<Record<IssueType, string>> = {
  'wrong-note': 'Sai nốt',
  'chord-wrong-note': 'Sai nốt trong hợp âm',
  'missing-note': 'Thiếu nốt',
  'chord-missing-note': 'Thiếu nốt trong hợp âm',
  octave: 'Sai quãng tám',
  order: 'Sai thứ tự nốt',
  'extra-note': 'Nốt thừa',
  'repeated-note': 'Đánh lặp nốt',
  'simultaneous-extra': 'Đánh thừa cùng lúc',
  early: 'Đánh sớm',
  late: 'Đánh muộn',
  'tempo-fast': 'Nhanh hơn tempo mục tiêu',
  'tempo-slow': 'Chậm hơn tempo mục tiêu',
  'tempo-unstable': 'Tempo chưa ổn định',
  hesitation: 'Ngắt quãng giữa bài',
  'chord-async': 'Hợp âm chưa vào cùng lúc',
  'hands-async': 'Hai tay chưa đều',
  short: 'Nhả phím sớm',
  long: 'Giữ phím quá lâu',
  'pedal-missing': 'Thiếu pedal',
  'pedal-late': 'Đạp pedal muộn',
  'pedal-early': 'Đạp pedal sớm',
  'pedal-release-early': 'Nhả pedal sớm',
  'pedal-release-late': 'Nhả pedal muộn',
  'pedal-not-changed': 'Chưa thay pedal khi đổi hợp âm',
  'pedal-stray': 'Đạp pedal thừa',
  'pedal-continuous': 'Giữ pedal liên tục',
  'dynamics-contrast': 'Chưa rõ mạnh – nhẹ',
  hairpin: 'Chưa to dần / nhỏ dần',
  'velocity-uneven': 'Lực đánh chưa đều',
  balance: 'Giai điệu chưa nổi',
};

export const issueTip = (t: IssueType) => TIPS[t] ?? 'Tập chậm đoạn này rồi tăng dần tempo.';
export const issueTitle = (t: IssueType) => TITLE[t] ?? 'Cần luyện thêm';

export function ruleBasedFeedback(result: ScoringResult, payload: CoachAiPayload, audience: CoachAudience = 'adult'): CoachFeedbackContent {
  const kids = audience === 'kids';
  const you = kids ? 'Con' : 'Bạn';
  const measured = result.criteria.filter((c) => c.value !== null);
  const c = payload.counts;
  const tempo = payload.tempo.actual !== null ? ` Tempo ♩≈${payload.tempo.actual} (mục tiêu ♩=${payload.tempo.target}).` : '';
  const summary = `${you} đạt ${result.total}/100 (${payload.mode.toLowerCase()}). Đúng ${c.correct}/${c.notes} nốt${c.wrong + c.missing ? `, sai ${c.wrong}, thiếu ${c.missing}` : ''}${c.extra ? `, thừa ${c.extra}` : ''}.${tempo}`;

  const good = measured.filter((x) => (x.value as number) >= 0.9).sort((a, b) => (b.value as number) - (a.value as number));
  const best = [...measured].sort((a, b) => (b.value as number) - (a.value as number))[0];
  const strengths = good.length
    ? good.slice(0, 3).map((x) => `${x.label}: ${Math.round((x.value as number) * 100)}%.`)
    : best
      ? [`Phần làm tốt nhất: ${best.label.toLowerCase()} (${Math.round((best.value as number) * 100)}%).`]
      : [];

  // Ưu tiên: mỗi loại lỗi một mục, lỗi mất nhiều điểm nhất trước.
  const seen = new Set<string>();
  const priorities: CoachFeedbackContent['priorities'] = [];
  for (const i of payload.issues) {
    const issue = result.issues.find((x) => x.id === i.ref);
    if (!issue || seen.has(issue.type)) continue;
    seen.add(issue.type);
    priorities.push({ issueRef: i.ref, title: issueTitle(issue.type), explanation: i.message, fix: issueTip(issue.type) });
    if (priorities.length >= 3) break;
  }

  const weak = weakestMeasures(result, 4);
  const notesOk = (result.criteria.find((x) => x.key === 'notes')?.value ?? 1) >= 0.9;
  const practiceTempo = result.issues.length ? Math.round(payload.lesson.targetBpm * (notesOk ? 0.85 : 0.7)) : null;
  const rec = payload.recommendations[0];
  const h = payload.history;
  const comparison = h
    ? h.deltaVsPrevious === null
      ? null
      : `So với lần trước (${h.previousTotal}/100): ${h.deltaVsPrevious > 0 ? `tăng ${h.deltaVsPrevious}` : h.deltaVsPrevious < 0 ? `giảm ${-h.deltaVsPrevious}` : 'giữ nguyên'} điểm.${h.recurring.length ? ` Lỗi lặp lại: ${h.recurring[0]}.` : ''}`
    : null;
  return {
    summary,
    strengths,
    priorities,
    practiceSection: weak ? { fromMeasure: weak[0], toMeasure: weak[1] } : null,
    practiceTempo,
    nextExercise: rec ? { recommendationRef: rec.ref, text: `${rec.title}: ${rec.reason}` } : null,
    comparison,
  };
}
