/**
 * Note Discovery Storage: Lưu trữ tiến độ học tập và hồ sơ kỹ năng nốt theo từng học viên.
 * Tích hợp chặt chẽ với profile của VietPiano (multi-profile).
 */
import { AdaptiveReviewService } from './AdaptiveReviewService';
import type { ActivityKind, NoteDiscoveryProgress, NoteSkillStats } from './types';

const STORAGE_PREFIX = 'vietpiano-note-discovery';
const memoryFallback = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {
    // Fallback to memory
  }
  return memoryFallback.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fallback to memory
  }
  memoryFallback.set(key, value);
}

export function clearDiscoveryProgressForTest(): void {
  memoryFallback.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  } catch {
    // Ignore
  }
}

export function defaultDiscoveryProgress(profileKey = 'guest'): NoteDiscoveryProgress {
  return {
    profileKey,
    completedStages: {},
    currentStageId: 'stage-1',
    noteSkills: {},
    lastSessionAt: Date.now(),
  };
}

export function loadDiscoveryProgress(profileKey = 'guest'): NoteDiscoveryProgress {
  try {
    const raw = getStorageItem(`${STORAGE_PREFIX}:${profileKey}`);
    if (!raw) return defaultDiscoveryProgress(profileKey);
    const parsed = JSON.parse(raw) as NoteDiscoveryProgress;
    return {
      profileKey,
      completedStages: parsed.completedStages ?? {},
      currentStageId: parsed.currentStageId ?? 'stage-1',
      noteSkills: parsed.noteSkills ?? {},
      lastSessionAt: parsed.lastSessionAt ?? Date.now(),
    };
  } catch (err) {
    console.warn('[NoteDiscovery] Không đọc được tiến độ từ storage', err);
    return defaultDiscoveryProgress(profileKey);
  }
}

export function saveDiscoveryProgress(progress: NoteDiscoveryProgress): void {
  try {
    setStorageItem(`${STORAGE_PREFIX}:${progress.profileKey}`, JSON.stringify(progress));
  } catch (err) {
    console.warn('[NoteDiscovery] Không lưu được tiến độ vào storage', err);
  }
}

export function recordStageResult(
  profileKey: string,
  stageId: string,
  result: { passed: boolean; score: number; isIndependentEvaluation?: boolean },
  now = Date.now(),
): NoteDiscoveryProgress {
  const current = loadDiscoveryProgress(profileKey);
  const existing = current.completedStages[stageId] ?? {
    passed: false,
    passedAt: null,
    bestScore: 0,
    attempts: 0,
    independentEvaluationsPassed: 0,
  };

  const isPassedNow = existing.passed || result.passed;
  const passedAt = existing.passedAt ?? (result.passed ? now : null);
  const bestScore = Math.max(existing.bestScore, result.score);
  const attempts = existing.attempts + 1;
  const independentEvaluationsPassed =
    existing.independentEvaluationsPassed + (result.isIndependentEvaluation && result.passed ? 1 : 0);

  const updated: NoteDiscoveryProgress = {
    ...current,
    lastSessionAt: now,
    completedStages: {
      ...current.completedStages,
      [stageId]: {
        passed: isPassedNow,
        passedAt,
        bestScore,
        attempts,
        independentEvaluationsPassed,
      },
    },
  };

  saveDiscoveryProgress(updated);
  return updated;
}

export function recordNoteAnswer(
  profileKey: string,
  midi: number,
  answer: {
    activityKind: ActivityKind;
    isCorrect: boolean;
    responseTimeMs: number;
    usedHint: boolean;
    mistakeWithMidi?: number;
    isIndependentEvaluation?: boolean;
    now?: number;
  },
): NoteSkillStats {
  const progress = loadDiscoveryProgress(profileKey);
  const currentSkill = progress.noteSkills[midi] ?? AdaptiveReviewService.createDefaultNoteSkill(midi);
  const updatedSkill = AdaptiveReviewService.updateNoteSkill(currentSkill, answer);

  progress.noteSkills[midi] = updatedSkill;
  progress.lastSessionAt = answer.now ?? Date.now();

  saveDiscoveryProgress(progress);
  return updatedSkill;
}
