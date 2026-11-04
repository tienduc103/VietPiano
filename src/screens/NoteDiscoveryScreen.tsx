import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DiscoveryActivityCard } from '../components/noteDiscovery/DiscoveryActivityCard';
import { DiscoveryCompletionModal } from '../components/noteDiscovery/DiscoveryCompletionModal';
import { DiscoveryStaffView } from '../components/noteDiscovery/DiscoveryStaffView';
import { DiscoveryTopBar } from '../components/noteDiscovery/DiscoveryTopBar';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { soundOutput } from '../core/audio/SoundOutput';
import { NoteDiscoveryEngine } from '../core/noteDiscovery/NoteDiscoveryEngine';
import { NOTE_DISCOVERY_STAGES } from '../core/noteDiscovery/stages';
import type { DiscoveryStage } from '../core/noteDiscovery/types';
import { voiceTeacher } from '../core/voice/teacher';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useProfiles } from '../store/profileStore';
import { recordNoteAnswer, recordStageResult } from '../core/noteDiscovery/storage';
import { usePlayingNow } from '../store/playingStore';
import { useSettings } from '../store/settingsStore';

interface Props {
  stageId?: string;
}

export function NoteDiscoveryScreen({ stageId }: Props) {
  const navigate = useApp((s) => s.navigate);
  const inputSource = useSettings((s) => s.settings.inputSource);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const activeProfileId = useProfiles((s) => s.activeId) ?? 'guest';

  // Chọn stage dựa trên param hoặc mặc định stage-1
  const initialStage = useMemo(() => {
    return NOTE_DISCOVERY_STAGES.find((s) => s.stageId === stageId) ?? NOTE_DISCOVERY_STAGES[0];
  }, [stageId]);

  const [currentStage, setCurrentStage] = useState<DiscoveryStage>(initialStage);
  const [isPaused, setIsPaused] = useState(false);
  const [engineKey, setEngineKey] = useState(0);

  // Khởi tạo engine
  const engine = useMemo(() => {
    return new NoteDiscoveryEngine(currentStage, 0);
  }, [currentStage, engineKey]);

  // Đồng bộ state của engine với React
  const state = useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getState(),
  );

  const active = state.status === 'active' && !isPaused;
  usePlayingNow(active);

  // Chuyển set highlightedKeys thành ReadonlySet cho PianoKeyboard
  const highlightedSet = useMemo(() => {
    return new Set(state.highlightedKeys);
  }, [state.highlightedKeys]);

  // Flash feedback trên phím piano
  const [flash, setFlash] = useState<{ midi: number; kind: 'correct' | 'wrong' } | null>(null);
  useEffect(() => {
    if (!state.lastOutcome) return;
    setFlash(state.lastOutcome);
    const id = window.setTimeout(() => setFlash(null), 700);
    return () => window.clearTimeout(id);
  }, [state.lastOutcomeTime, state.lastOutcome]);

  // Đọc câu hướng dẫn khi bắt đầu lượt mới
  const lastSpokenRound = useRef<string | null>(null);
  const speakCurrentInstruction = useCallback(() => {
    const act = state.activity;
    let voiceText = act.voicePrompt ?? act.instructions;
    if (act.kind === 'find-key') {
      const r = act.rounds[state.roundIndex];
      if (r?.voiceText) voiceText = r.voiceText;
    } else if (act.kind === 'intro') {
      const it = act.items[state.roundIndex];
      if (it?.voiceText) voiceText = it.voiceText;
    } else if (act.kind === 'staff-recognition') {
      const r = act.rounds[state.roundIndex];
      if (r?.voiceText) voiceText = r.voiceText;
    } else if (act.kind === 'listening') {
      const r = act.rounds[state.roundIndex];
      if (r?.voiceText) voiceText = r.voiceText;
    } else if (act.kind === 'sequence') {
      if (act.voiceText) voiceText = act.voiceText;
    }

    voiceTeacher.say({
      trigger: 'step_start',
      instructionText: voiceText,
      voiceText,
      priority: 2,
    });
  }, [state.activity, state.roundIndex]);

  useEffect(() => {
    const roundKey = `${state.activity.id}-${state.roundIndex}-${state.sequenceIndex}`;
    if (lastSpokenRound.current !== roundKey) {
      lastSpokenRound.current = roundKey;
      speakCurrentInstruction();

      // Nếu là Activity 1 (Intro) và có cờ playSampleOnStart: phát âm thanh mẫu
      if (state.activity.kind === 'intro') {
        const it = state.activity.items[state.roundIndex];
        if (it?.midi) {
          window.setTimeout(() => {
            soundOutput.playNote(it.midi, 0.6);
          }, 400);
        }
      }
    }
  }, [state.activity, state.roundIndex, state.sequenceIndex, speakCurrentInstruction]);

  // Note Input Handler (Unified MIDI + Virtual + Microphone)
  const heldNotes = useRef(new Set<number>());
  useNoteInput(
    {
      onNote: (event) => {
        if (!active) return;
        if (event.source !== 'microphone') {
          if (heldNotes.current.has(event.midi)) return;
          heldNotes.current.add(event.midi);
        }

        // Phát tiếng nốt cho bàn phím ảo
        if (event.source === 'virtual') {
          soundOutput.playNote(event.midi, 0.45);
        }

        const res = engine.handleNoteOn(event.midi, event.time);

        recordNoteAnswer(activeProfileId, event.midi, {
          activityKind: state.activity.kind,
          isCorrect: res.isCorrect,
          responseTimeMs: res.responseTimeMs,
          usedHint: state.hintLevel < 2,
          isIndependentEvaluation: state.activity.kind === 'memory-challenge' || state.stage.number === 8,
        });

        // Âm thanh phản hồi đúng / sai
        if (inputSource !== 'microphone') {
          if (res.isCorrect) {
            soundOutput.scheduleNote(96, 0.02, 0.09, 50); // Chime ngọt ngào
          } else {
            soundOutput.scheduleNote(41, 0, 0.12, 35); // Âm trầm dịu dàng
          }
        }
      },
      onNoteOff: (event) => {
        heldNotes.current.delete(event.midi);
        engine.handleNoteOff(event.midi);
      },
    },
    inputSource,
    { listening: active },
  );

  // Ghi nhận khi hoàn thành stage
  useEffect(() => {
    if (state.status === 'stage-complete') {
      recordStageResult(activeProfileId, currentStage.stageId, {
        passed: state.activityProgress.accuracy >= currentStage.assessment.minPracticeAccuracy,
        score: Math.round(state.activityProgress.accuracy * 100),
        isIndependentEvaluation: currentStage.number === 8,
      });
    }
  }, [state.status, activeProfileId, currentStage.stageId, currentStage.assessment.minPracticeAccuracy, currentStage.number, state.activityProgress.accuracy]);
  const handlePlaySample = useCallback(() => {
    if (state.activity.kind === 'sequence') {
      state.sequenceMidis.forEach((midi, idx) => {
        window.setTimeout(() => {
          soundOutput.playNote(midi, 0.4);
        }, idx * 450);
      });
    } else if (state.currentNote) {
      soundOutput.playNote(state.currentNote.midi, 0.6);
    }
  }, [state.activity.kind, state.sequenceMidis, state.currentNote]);

  // Xử lý nghe âm thanh trong Activity 4 (Listening Practice)
  const handlePlayListeningSound = useCallback(
    (which: 1 | 2) => {
      if (state.activity.kind !== 'listening') return;
      const round = state.activity.rounds[state.roundIndex];
      if (!round) return;
      const midi = which === 1 ? round.firstMidi : round.secondMidi;
      soundOutput.playNote(midi, 0.7);
    },
    [state.activity, state.roundIndex],
  );

  // Xử lý chọn đáp án trắc nghiệm
  const handleChoice = useCallback(
    (choiceIndex: number) => {
      const res = engine.handleChoice(choiceIndex);
      if (res.isCorrect) {
        soundOutput.scheduleNote(96, 0.02, 0.09, 50);
      } else {
        soundOutput.scheduleNote(41, 0, 0.12, 35);
      }
    },
    [engine],
  );

  // Lấy câu gợi ý / prompt text cho Activity Card
  const currentPromptText = useMemo(() => {
    const act = state.activity;
    switch (act.kind) {
      case 'intro':
        return act.items[state.roundIndex]?.instructionText ?? act.instructions;
      case 'find-key':
        return act.rounds[state.roundIndex]?.prompt ?? act.instructions;
      case 'staff-recognition':
        return act.rounds[state.roundIndex]?.prompt ?? act.instructions;
      case 'listening':
        return act.rounds[state.roundIndex]?.prompt ?? act.instructions;
      case 'sequence':
        return `${act.titleSnippet ?? 'Đánh chuỗi nốt'}: nốt ${state.sequenceIndex + 1}/${state.sequenceMidis.length}`;
      case 'memory-challenge':
        return `Thử thách trí nhớ: Lượt ${state.roundIndex + 1}/${state.totalRounds}`;
      default:
        return (act as { instructions: string }).instructions;
    }
  }, [state.activity, state.roundIndex, state.sequenceIndex, state.sequenceMidis.length, state.totalRounds]);

  // Điều hướng chuyển bước hoặc hoàn thành
  const handleContinue = useCallback(() => {
    if (state.status === 'stage-complete') {
      // Tìm stage tiếp theo
      const currentIndex = NOTE_DISCOVERY_STAGES.findIndex((s) => s.stageId === currentStage.stageId);
      const nextStage = NOTE_DISCOVERY_STAGES[currentIndex + 1];
      if (nextStage) {
        setCurrentStage(nextStage);
        setEngineKey((k) => k + 1);
      } else {
        // Đã hoàn thành hết 8 chặng! Trở về màn hình dashboard
        navigate({ name: 'dashboard' });
      }
    } else {
      engine.advance();
    }
  }, [state.status, currentStage.stageId, engine, navigate]);

  const handleRestart = useCallback(() => {
    setIsPaused(false);
    setEngineKey((k) => k + 1);
  }, []);

  const handleExit = useCallback(() => {
    setIsPaused(false);
    navigate({ name: 'dashboard' });
  }, [navigate]);

  return (
    <div
      className="flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-violet-100/80 via-sky-50 to-pink-100/70 p-2 text-slate-900 select-none dark:from-slate-950 dark:via-violet-950/40 dark:to-slate-950 dark:text-slate-100"
      data-testid="note-discovery-screen"
    >
      {/* 1. KHU VỰC TRÊN (Top Bar) */}
      <DiscoveryTopBar
        stageNumber={currentStage.number}
        stageTitle={currentStage.title}
        activityTitle={state.activity.title}
        currentRound={state.roundIndex}
        totalRounds={state.totalRounds}
        onBack={handleExit}
        onReplayAudio={speakCurrentInstruction}
        onPause={() => setIsPaused(true)}
      />

      {/* 2. KHU VỰC TRUNG TÂM (Center Area) */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-1">
        <DiscoveryStaffView
          notes={state.staffNotes}
          hintLevel={state.hintLevel}
          showNames={state.hintLevel < 2}
          className="w-full max-w-2xl max-h-[42vh]"
        />

        <DiscoveryActivityCard
          activity={state.activity}
          roundIndex={state.roundIndex}
          promptText={currentPromptText}
          feedbackText={state.lastOutcome?.kind === 'wrong' ? 'Bé hãy thử lại nhé!' : undefined}
          isWrong={state.lastOutcome?.kind === 'wrong'}
          onChoice={handleChoice}
          onPlaySample={state.activity.kind === 'sequence' || state.activity.kind === 'intro' ? handlePlaySample : undefined}
          onPlayListeningSound={state.activity.kind === 'listening' ? handlePlayListeningSound : undefined}
        />
      </div>

      {/* 3. KHU VỰC DƯỚI (Bottom Area - Interactive Piano Keyboard) */}
      <div className="h-32 sm:h-40 md:h-44 w-full px-2 pb-1 shrink-0">
        <div className="h-full w-full overflow-hidden rounded-2xl border-2 border-slate-300 bg-white/70 p-1.5 shadow-md backdrop-blur-xs dark:border-slate-700 dark:bg-slate-900/80">
          <PianoKeyboard
            from={currentStage.keyboardRange.from}
            to={currentStage.keyboardRange.to}
            expected={state.expectedKey}
            detected={null}
            flash={flash}
            labelStyle={labelStyle}
            highlighted={highlightedSet}
            allLabels={state.hintLevel === 0}
            onPress={(midi) => {
              if (!active) return;
              soundOutput.playNote(midi, 0.45);
              const res = engine.handleNoteOn(midi);
              if (res.isCorrect) {
                soundOutput.scheduleNote(96, 0.02, 0.09, 50);
              } else {
                soundOutput.scheduleNote(41, 0, 0.12, 35);
              }
            }}
            onRelease={(midi) => {
              engine.handleNoteOff(midi);
            }}
          />
        </div>
      </div>

      {/* Hộp thoại Tạm dừng hoặc Hoàn thành */}
      {(isPaused || state.status === 'activity-complete' || state.status === 'stage-complete') && (
        <DiscoveryCompletionModal
          kind={isPaused ? 'paused' : state.status === 'stage-complete' ? 'stage-complete' : 'activity-complete'}
          stageTitle={currentStage.title}
          activityTitle={state.activity.title}
          accuracy={state.activityProgress.accuracy}
          onContinue={isPaused ? () => setIsPaused(false) : handleContinue}
          onRestart={handleRestart}
          onExit={handleExit}
        />
      )}
    </div>
  );
}
