/**
 * NotePoolProvider: Cung cấp tập nốt học tập dùng chung cho các mini-game:
 * - Tìm nốt nhạc (Bóng bay nốt nhạc - Hunt Mode)
 * - Thu hoạch cà chua (Tomato Harvest)
 * - Flappy Note
 * - F1 Racing
 *
 * Tự động điều chỉnh theo tiến độ học của từng học viên, ưu tiên các nốt cần ôn tập (trouble notes).
 * Đảm bảo fallback an toàn nếu học viên chưa có dữ liệu.
 */
import { isBlackKeyMidi, NOTE_DEFINITIONS } from './musicModel';
import { NOTE_DISCOVERY_STAGES } from './stages';
import { loadDiscoveryProgress } from './storage';
import { AdaptiveReviewService } from './AdaptiveReviewService';
import type { Letter } from '../balloonPop/notes';
import type { TomatoDifficulty } from '../tomatoHarvest/TomatoHarvestGame';

const DEFAULT_BEGINNER_NOTES = [60, 62, 64]; // C4, D4, E4 mặc định

export class NotePoolProvider {
  /**
   * Lấy danh sách các nốt MIDI học viên đã học qua các Stage đã đạt hoặc đang học
   */
  public static getLearnedNotes(profileKey = 'guest'): number[] {
    const progress = loadDiscoveryProgress(profileKey);
    const learned = new Set<number>();

    // Thu thập các nốt từ các stage đã pass (và các stage trước đó)
    let maxPassedStageNumber = 0;
    for (const stage of NOTE_DISCOVERY_STAGES) {
      const stageRecord = progress.completedStages[stage.stageId];
      if (stageRecord?.passed) {
        maxPassedStageNumber = Math.max(maxPassedStageNumber, stage.number);
      }
    }

    for (const stage of NOTE_DISCOVERY_STAGES) {
      if (stage.number <= maxPassedStageNumber) {
        stage.noteRange.forEach((m) => {
          if (!isBlackKeyMidi(m)) {
            learned.add(m);
          }
        });
      }
    }

    // Thu thập thêm các nốt đã từng được thực hành trong noteSkills
    for (const [midiStr, skill] of Object.entries(progress.noteSkills)) {
      if (skill.totalAttempts > 0) {
        const m = Number(midiStr);
        if (!isBlackKeyMidi(m)) {
          learned.add(m);
        }
      }
    }

    const whiteNotes = Array.from(learned).sort((a, b) => a - b);
    if (whiteNotes.length < 3) {
      return [...DEFAULT_BEGINNER_NOTES];
    }

    return whiteNotes;
  }

  /**
   * Lấy danh sách nốt ưu tiên ôn tập (trouble notes lên đầu, rồi đến các nốt cần ôn tập cách quãng)
   */
  public static getPrioritizedNotes(profileKey = 'guest'): number[] {
    const progress = loadDiscoveryProgress(profileKey);
    const learned = this.getLearnedNotes(profileKey);
    const troubleNotes = AdaptiveReviewService.getTroubleNotes(progress.noteSkills);

    const prioritized = new Set<number>();

    // 1. Nốt hay nhầm
    troubleNotes.forEach((m) => prioritized.add(m));

    // 2. Nốt đến hạn ôn tập
    const now = Date.now();
    for (const m of learned) {
      const skill = progress.noteSkills[m];
      if (skill && skill.nextReviewAt > 0 && skill.nextReviewAt <= now) {
        prioritized.add(m);
      }
    }

    // 3. Các nốt đã học còn lại
    learned.forEach((m) => prioritized.add(m));

    return Array.from(prioritized);
  }

  /**
   * Cung cấp cấu hình nốt cho trò "Tìm nốt nhạc" (Balloon Pop Hunt Mode)
   */
  public static getForBalloonHunt(profileKey = 'guest'): {
    huntLetters: Letter[];
    targetMidis: number[];
  } {
    const prioritized = this.getPrioritizedNotes(profileKey);
    const letters = new Set<Letter>();
    const targetMidis: number[] = [];

    for (const midi of prioritized) {
      const def = NOTE_DEFINITIONS[midi];
      if (def && !isBlackKeyMidi(midi)) {
        letters.add(def.letter as Letter);
        targetMidis.push(midi);
      }
    }

    if (letters.size === 0) {
      letters.add('C');
      letters.add('D');
      letters.add('E');
      targetMidis.push(60, 62, 64);
    }

    return {
      huntLetters: Array.from(letters),
      targetMidis,
    };
  }

  /**
   * Cung cấp cấu hình nốt và độ khó gợi ý cho "Thu hoạch cà chua"
   */
  public static getForTomatoHarvest(profileKey = 'guest'): {
    notes: number[];
    suggestedDifficulty: TomatoDifficulty;
  } {
    const learned = this.getLearnedNotes(profileKey);

    let suggestedDifficulty: TomatoDifficulty = 'easy';
    if (learned.length >= 7) {
      suggestedDifficulty = 'hard';
    } else if (learned.length >= 4) {
      suggestedDifficulty = 'medium';
    }

    return {
      notes: learned,
      suggestedDifficulty,
    };
  }

  /**
   * Cung cấp cấu hình nốt cho "Flappy Note"
   */
  public static getForFlappyNote(profileKey = 'guest'): {
    notes: number[];
    handPosition: 'C' | 'G';
  } {
    const learned = this.getLearnedNotes(profileKey);
    // Nếu đã học tới G4 (67) thì thế Đô 5 ngón C-D-E-F-G
    return {
      notes: learned,
      handPosition: learned.includes(67) ? 'C' : 'C',
    };
  }

  /**
   * Cung cấp dải nốt cho "F1 Racing"
   */
  public static getForF1Racing(profileKey = 'guest'): {
    lowMidi: number;
    highMidi: number;
    notes: number[];
  } {
    const learned = this.getLearnedNotes(profileKey);
    const low = Math.min(...learned, 60);
    const high = Math.max(...learned, 64);

    return {
      lowMidi: low,
      highMidi: high,
      notes: learned,
    };
  }
}
