/**
 * Kiểm tra dữ liệu giáo trình (chạy trong unit test cho mọi cấp độ):
 * id duy nhất, tuần ↔ buổi khớp nhau, tiên quyết tồn tại và đi trước (không vòng),
 * bản nhạc đủ phách từng ô, nốt trong tầm micro, nhịp độ hợp lý, thứ tự sự kiện tăng dần,
 * câu hỏi / lượt tìm phím có đáp án hợp lệ, câu cô giáo đọc ngắn gọn.
 */
import { splitMeasures } from '../lessons/notation';
import { measureLength, type Lesson } from '../lessons/types';
import { nameToMidi } from '../music/notes';
import { keysMatching } from './keys';
import { lessonTimeline, pieceToLesson } from './piece';
import { text, type Curriculum, type Illustration, type Piece } from './types';
import { countWords } from '../voice/phrases';
import { VOICE_TRIGGERS, type VoiceCue } from '../voice/types';

/** Tầm micro nhận diện tin cậy (như test thư viện bài). */
export const MIC_MIN_MIDI = 36;
export const MIC_MAX_MIDI = 84;
export const MIN_BPM = 30;
export const MAX_BPM = 200;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Phần đệm: khuông đôi, giai điệu tay phải; đủ phách từng ô, cùng số ô với giai điệu; mọi nốt đệm THẤP HƠN nốt thấp
 * nhất của giai điệu (app bỏ qua nốt thấp hơn giai điệu — nốt đệm cao hơn sẽ bị chấm là sai / thừa) và trong tầm micro.
 */
function validateAccompaniment(piece: Piece, lesson: Lesson, where: string): string[] {
  const errors: string[] = [];
  if (piece.clef !== 'grand' || piece.hand !== 'right') errors.push(`${where}: bài có phần đệm phải là khuông đôi, giai điệu tay phải`);
  const acc = lesson.accompaniment ?? [];
  const full = measureLength(lesson.timeSignature);
  try {
    const accMeasures = splitMeasures(acc, full, lesson.pickup);
    accMeasures.forEach((m, i) => {
      const want = i === 0 && lesson.pickup ? lesson.pickup : full;
      if (Math.abs(m.beats - want) > 1e-9) errors.push(`${where}: phần đệm ô nhịp ${i + 1} có ${m.beats} phách, cần ${want}`);
    });
    const melodyMeasures = splitMeasures(lesson.notes, full, lesson.pickup).length;
    if (accMeasures.length !== melodyMeasures) errors.push(`${where}: phần đệm có ${accMeasures.length} ô nhịp, giai điệu có ${melodyMeasures}`);
  } catch (e) {
    return [...errors, `${where}: phần đệm — ${message(e)}`];
  }
  const melodyMin = Math.min(...lesson.notes.filter((n) => !n.rest).map((n) => n.midi));
  for (const chord of acc) {
    chord.pitches.forEach((p, i) => {
      if (chord.midis[i] >= melodyMin) errors.push(`${where}: nốt đệm ${p} không thấp hơn giai điệu`);
      if (chord.midis[i] < MIC_MIN_MIDI) errors.push(`${where}: nốt đệm ${p} ngoài tầm micro`);
    });
  }
  return errors;
}

export function validatePiece(piece: Piece, where: string): string[] {
  let lesson: Lesson;
  try {
    lesson = pieceToLesson(piece, where);
  } catch (e) {
    return [`${where}: ký hiệu lỗi — ${message(e)}`];
  }
  const errors: string[] = [];
  if (!lesson.notes.some((n) => !n.rest)) errors.push(`${where}: không có nốt nào để chơi`);
  if (piece.bpm < MIN_BPM || piece.bpm > MAX_BPM) errors.push(`${where}: nhịp độ ${piece.bpm} ngoài ${MIN_BPM}–${MAX_BPM}`);
  const full = measureLength(lesson.timeSignature);
  try {
    splitMeasures(lesson.notes, full, lesson.pickup).forEach((m, i) => {
      const want = i === 0 && lesson.pickup ? lesson.pickup : full;
      if (Math.abs(m.beats - want) > 1e-9) errors.push(`${where}: ô nhịp ${i + 1} có ${m.beats} phách, cần ${want}`);
    });
  } catch (e) {
    return [...errors, `${where}: ${message(e)}`];
  }
  for (const n of lesson.notes) {
    if (!n.rest && (n.midi < MIC_MIN_MIDI || n.midi > MIC_MAX_MIDI)) errors.push(`${where}: nốt ${n.pitch} ngoài tầm micro`);
  }
  if (piece.hand === 'both' && lesson.notes.some((n) => !n.hand)) errors.push(`${where}: bài hai tay phải ghi RH/LH cho mọi nốt`);
  if (piece.hand !== 'both' && piece.clef === 'grand' && !piece.accompaniment) errors.push(`${where}: khuông đôi chỉ dùng cho bài hai tay`);
  if (piece.accompaniment) errors.push(...validateAccompaniment(piece, lesson, where));
  if (piece.dynamics && new Set(Object.values(piece.dynamics)).size < 2) errors.push(`${where}: dấu sắc thái cần ít nhất hai mức khác nhau (để so mạnh – nhẹ)`);
  const timeline = lessonTimeline(lesson);
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i].startBeat <= timeline[i - 1].startBeat) errors.push(`${where}: sự kiện ${i} không đi sau sự kiện trước`);
  }
  return errors;
}

function validateIllustration(ill: Illustration | undefined, where: string): string[] {
  if (!ill) return [];
  if (ill.type === 'staff' || ill.type === 'counting') {
    const errors = validatePiece(ill.piece, where);
    if (ill.type === 'counting' && errors.length === 0) {
      const notes = pieceToLesson(ill.piece, where).notes.length;
      if (ill.counts.length !== notes) errors.push(`${where}: ${ill.counts.length} chữ đếm cho ${notes} nốt`);
    }
    return errors;
  }
  if (ill.type === 'keyboard') {
    if (ill.from >= ill.to) return [`${where}: bàn phím from ≥ to`];
    if (ill.listen?.some((m) => m < MIC_MIN_MIDI || m > MIC_MAX_MIDI)) return [`${where}: nốt nghe mẫu ngoài tầm micro`];
  }
  if (ill.type === 'hand' && ill.highlight !== undefined && (ill.highlight < 1 || ill.highlight > 5)) return [`${where}: ngón tô nổi phải 1–5`];
  return [];
}

/** Câu đọc cho bé 4–8 tuổi nên 5–15 từ; dữ liệu cho phép tối đa 20 (lời dặn trang giới thiệu). */
export const VOICE_MAX_WORDS = 20;

export function validateVoice(cues: readonly VoiceCue[] | undefined, where: string): string[] {
  const errors: string[] = [];
  for (const c of cues ?? []) {
    if (!VOICE_TRIGGERS.includes(c.trigger)) errors.push(`${where}: trigger giọng nói lạ "${c.trigger}"`);
    const said = c.voiceText ?? c.instructionText;
    if (!c.instructionText.trim() || !said.trim()) errors.push(`${where}: câu giọng nói rỗng`);
    else if (countWords(said) > VOICE_MAX_WORDS) errors.push(`${where}: câu giọng nói dài ${countWords(said)} từ (tối đa ${VOICE_MAX_WORDS})`);
    if (c.audioAsset !== undefined && !/^[\w\-/]+\.(mp3|m4a|aac|ogg|wav)$/.test(c.audioAsset)) errors.push(`${where}: audioAsset "${c.audioAsset}" phải là đường dẫn tương đối tới file âm thanh`);
    if (c.cooldownMs !== undefined && c.cooldownMs < 0) errors.push(`${where}: cooldown âm`);
  }
  return errors;
}

export function validateCurriculum(curriculum: Curriculum): string[] {
  const errors: string[] = [];
  const lessonIds = new Set<string>();
  for (const level of curriculum.levels) {
    if (level.availability === 'available' && level.lessons.length === 0) errors.push(`${level.levelId}: cấp đã mở nhưng không có buổi nào`);
    for (const l of level.lessons) {
      if (lessonIds.has(l.lessonId)) errors.push(`${l.lessonId}: trùng id`);
      lessonIds.add(l.lessonId);
    }
  }

  // Thứ tự học = thứ tự tuần → buổi; tiên quyết phải đi trước (nên không thể có vòng).
  const order = new Map<string, number>();
  curriculum.levels.forEach((level) => level.weeks.forEach((w) => w.lessonIds.forEach((id) => order.set(id, order.size))));

  for (const level of curriculum.levels) {
    const inWeeks = level.weeks.flatMap((w) => w.lessonIds);
    if (new Set(inWeeks).size !== inWeeks.length) errors.push(`${level.levelId}: một buổi nằm ở nhiều tuần`);
    for (const id of inWeeks) if (!level.lessons.some((l) => l.lessonId === id)) errors.push(`${level.levelId}: tuần trỏ tới buổi không tồn tại ${id}`);

    for (const l of level.lessons) {
      const at = l.lessonId;
      const w = level.weeks.find((x) => x.lessonIds.includes(l.lessonId));
      if (!w) errors.push(`${at}: không thuộc tuần nào`);
      else if (w.weekId !== l.weekId) errors.push(`${at}: weekId ${l.weekId} khác tuần chứa nó (${w.weekId})`);
      if (l.levelId !== level.levelId) errors.push(`${at}: levelId sai`);
      if (!text(l.title)) errors.push(`${at}: thiếu tiêu đề`);
      if (l.learningObjectives.length === 0) errors.push(`${at}: thiếu mục tiêu học`);
      if (l.estimatedDuration <= 0) errors.push(`${at}: thời lượng không hợp lệ`);
      if (l.activities.length + l.exercises.length === 0) errors.push(`${at}: buổi trống`);
      if (l.assessment.passScore < 0 || l.assessment.passScore > 100) errors.push(`${at}: passScore ngoài 0–100`);
      for (const p of [...l.prerequisites, ...l.unlockCriteria.lessonsPassed]) {
        if (!lessonIds.has(p)) errors.push(`${at}: tiên quyết không tồn tại ${p}`);
        else if ((order.get(p) ?? Infinity) >= (order.get(l.lessonId) ?? -1)) errors.push(`${at}: tiên quyết ${p} không đi trước`);
      }

      const ids = [...l.activities.map((a) => a.id), ...l.exercises.map((e) => e.id)];
      if (new Set(ids).size !== ids.length) errors.push(`${at}: trùng id hoạt động / bài tập`);
      if (l.exercises.length > 0 && !l.exercises.some((e) => e.required ?? true)) errors.push(`${at}: không có bài tập bắt buộc nào`);

      l.activities.forEach((a) =>
        a.pages.forEach((p, pi) => {
          errors.push(...validateIllustration(p.illustration, `${at}/${a.id}#${pi + 1}`));
          errors.push(...validateVoice(p.voice && [p.voice], `${at}/${a.id}#${pi + 1}`));
        }),
      );
      errors.push(...validateVoice(l.voice, at));

      for (const ex of l.exercises) {
        const where = `${at}/${ex.id}`;
        errors.push(...validateVoice(ex.voice, where));
        switch (ex.kind) {
          case 'play':
            errors.push(...validatePiece(ex.piece, where));
            break;
          case 'key-quiz':
            if (ex.rounds.length === 0) errors.push(`${where}: không có lượt nào`);
            ex.rounds.forEach((r, i) => {
              if (keysMatching(r.target, ex.keyboard.from, ex.keyboard.to).length === 0) errors.push(`${where}: lượt ${i + 1} không có phím đúng trên bàn phím`);
            });
            if (ex.pass.minCorrect !== undefined && ex.pass.minCorrect > ex.rounds.length) errors.push(`${where}: minCorrect lớn hơn số lượt`);
            break;
          case 'choice-quiz':
            if (ex.questions.length === 0) errors.push(`${where}: không có câu hỏi nào`);
            ex.questions.forEach((q, i) => {
              if (q.answer < 0 || q.answer >= q.options.length) errors.push(`${where}: câu ${i + 1} đáp án ngoài lựa chọn`);
              errors.push(...validateIllustration(q.illustration, `${where}#${i + 1}`));
              if (q.optionImages) {
                if (q.optionImages.length !== q.options.length) errors.push(`${where}: câu ${i + 1} có ${q.optionImages.length} hình cho ${q.options.length} lựa chọn`);
                q.optionImages.forEach((ill, j) => errors.push(...validateIllustration(ill, `${where}#${i + 1}/hình ${j + 1}`)));
              }
            });
            break;
          case 'note-reading':
            if (ex.sequence.length === 0) errors.push(`${where}: không có nốt nào`);
            for (const p of [...ex.sequence, ...(ex.choices ?? [])]) {
              const m = nameToMidi(p);
              if (m === null) errors.push(`${where}: tên nốt sai ${p}`);
              else if (m < MIC_MIN_MIDI || m > MIC_MAX_MIDI) errors.push(`${where}: ${p} ngoài tầm micro`);
            }
            if (ex.answer === 'name') {
              if (!ex.choices?.length) errors.push(`${where}: thiếu lựa chọn tên nốt`);
              else for (const p of ex.sequence) if (!ex.choices.includes(p)) errors.push(`${where}: ${p} không có trong lựa chọn`);
            }
            break;
        }
      }
    }
  }
  return errors;
}
