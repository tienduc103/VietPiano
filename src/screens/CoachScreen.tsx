import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FullscreenButton, Icon, Button } from '../components/ui';
import { CoachSetup, type InterruptedItem } from '../components/coach/CoachSetup';
import { CoachRecording } from '../components/coach/CoachRecording';
import { CoachResults, type ResultData } from '../components/coach/CoachResults';
import { CoachHistory } from '../components/coach/CoachHistory';
import { buildAiPayload } from '../core/coach/ai/payload';
import { ScoreFollower } from '../core/coach/follower';
import { applyAttempt, createPlan } from '../core/coach/practice/plan';
import { recommendPractice } from '../core/coach/practice/recommend';
import { progressReport } from '../core/coach/progress/compare';
import { buildPerformance } from '../core/coach/recorder/buildPerformance';
import { referenceFromLesson } from '../core/coach/reference/fromLesson';
import { scorePerformance } from '../core/coach/scoring/ScoringEngine';
import { resolveInput } from '../core/coach/input';
import { loadCoachSettings, saveCoachSettings, type CoachSettings } from '../core/coach/settings';
import { coachStorage, newId } from '../core/coach/storage/CoachStorage';
import { GUEST_PROFILE, type PerformanceSession, type PracticePlan, type PracticeRecommendation, type RecordedSession } from '../core/coach/types';
import { midiInput } from '../core/input/MIDIInputProvider';
import { LESSONS } from '../core/lessons/library';
import { measureRange, sliceLesson } from '../core/lessons/slice';
import { lessonTempo, measureLength, type Lesson } from '../core/lessons/types';
import { useMidiNavListening } from '../hooks/useMidiNav';
import { useCoachAiLink } from '../hooks/useCoachAiLink';
import { useCoachRecorder } from '../hooks/useCoachRecorder';
import { usePedalSeen } from '../hooks/usePedalSeen';
import { useUiMode } from '../hooks/useUiMode';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type Phase = { name: 'setup' } | { name: 'recording' } | { name: 'results'; data: ResultData } | { name: 'history' };

/** Phiên dở dang cũ hơn chừng này (lâu hơn chu kỳ lưu nháp — không phải phiên đang ghi ở tab khác) mới đề nghị khôi phục. */
const STALE_MS = 4_000;
/** Độ trễ micro (cùng giá trị chế độ Biểu diễn). */
const MIC_LATENCY_MS = 60;

function safeSlice(lesson: Lesson, m: [number, number] | null): Lesson {
  if (!m) return lesson;
  try {
    const r = measureRange(lesson);
    const a = Math.max(r.first, Math.min(m[0], r.last));
    const b = Math.max(a, Math.min(m[1], r.last));
    return a === r.first && b === r.last ? lesson : sliceLesson(lesson, a, b);
  } catch {
    return lesson;
  }
}

export function CoachScreen({ lessonId, measures }: { lessonId?: string; measures?: [number, number] }) {
  const navigate = useApp((s) => s.navigate);
  const openLesson = useApp((s) => s.openLesson);
  const updateSettings = useSettings((s) => s.update);
  const profile = useProfiles(activeProfile);
  const profileKey = profile?.id ?? GUEST_PROFILE;
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const audience = useUiMode() === 'kids' ? 'kids' : 'adult';
  const midiStatus = useMidi((s) => s.status);
  const midiDevices = useMidi((s) => s.devices);
  const micStatus = useMic((s) => s.status);
  const pedalSeen = usePedalSeen();

  const [cfg, setCfgState] = useState<CoachSettings>(() => {
    const s = loadCoachSettings();
    return lessonId && LESSONS.some((l) => l.id === lessonId) ? { ...s, lastLessonId: lessonId } : s;
  });
  const setCfg = useCallback((patch: Partial<CoachSettings>) => {
    setCfgState((s) => {
      const next = { ...s, ...patch };
      saveCoachSettings(next);
      return next;
    });
  }, []);
  const [section, setSection] = useState<[number, number] | null>(measures ?? null);
  const [hand, setHand] = useState<'both' | 'right' | 'left'>('both');
  const [planCtx, setPlanCtx] = useState<{ plan: PracticePlan; stepId: string } | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'setup' });
  const [interrupted, setInterrupted] = useState<InterruptedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Điều hướng bằng đàn MIDI nhận phím trước bộ ghi; lúc đang ghi phím là nốt.
  useMidiNavListening(phase.name === 'recording');
  const recorder = useCoachRecorder();
  // Kết nối AI cục bộ: kiểm tra khi mở màn + định kỳ, hiện ở màn chuẩn bị và trong lúc đánh.
  const aiLink = useCoachAiLink();

  const baseLesson = useMemo(() => LESSONS.find((l) => l.id === cfg.lastLessonId) ?? LESSONS.find((l) => l.id === 'scale-c-major') ?? LESSONS[0], [cfg.lastLessonId]);
  const lesson = useMemo(() => safeSlice(baseLesson, section), [baseLesson, section]);
  const twoHands = !!baseLesson.accompaniment?.length || baseLesson.hand === 'both';
  const effectiveHand = twoHands ? hand : 'both';
  const midiReady = midiStatus === 'ready' && midiDevices.length > 0;
  const input = resolveInput(cfg.input, midiReady, micStatus === 'running', pedalSeen);
  const bpm = Math.max(20, Math.round((lessonTempo(baseLesson) * cfg.tempoPercent) / 100));
  const reference = useMemo(
    () => referenceFromLesson(lesson, { hand: effectiveHand, singleNotesOnly: input.primary === 'microphone', targetBpm: bpm }),
    [lesson, effectiveHand, input.primary, bpm],
  );

  // Con trỏ khi đang ghi.
  const followerRef = useRef<ScoreFollower | null>(null);
  const [cursor, setCursor] = useState<{ staff: 'melody' | 'accompaniment'; index: number } | null>(null);
  const [measureNow, setMeasureNow] = useState<number | null>(null);

  // Phiên dở dang (app tắt giữa chừng).
  const refreshInterrupted = useCallback(async () => {
    try {
      const open = await coachStorage.listOpenSessions(profileKey);
      setInterrupted(open.filter((s) => Date.now() - s.updatedAt > STALE_MS).map((s) => ({ session: s })));
    } catch {
      setInterrupted([]);
    }
  }, [profileKey]);
  useEffect(() => {
    void refreshInterrupted();
  }, [refreshInterrupted]);

  /** Chấm một phiên đã ghi → lưu kết quả, gợi ý, tiến bộ, kế hoạch → màn kết quả. */
  const finishSession = useCallback(
    async (recorded: RecordedSession, lessonForScore: Lesson, plan: { plan: PracticePlan; stepId: string } | null) => {
      const s = recorded.session;
      const ref = referenceFromLesson(lessonForScore, { hand: s.hand, singleNotesOnly: s.input.source === 'microphone', targetBpm: s.targetBpm });
      const perf = buildPerformance(recorded);
      const capabilities = { ...s.input.capabilities, pedal: s.input.capabilities.pedal || perf.sustainSeen };
      const result = scorePerformance({ reference: ref, performance: perf, session: s, capabilities, mode: s.mode, pedalRule: s.pedalRule ?? 'auto' });
      await coachStorage.saveResult(result).catch((e) => console.warn('[VietPiano] Không lưu được kết quả chấm', e));
      const all = await coachStorage.listResults(profileKey, s.lessonId).catch(() => []);
      const history = all.filter((r) => r.id !== result.id && r.referenceId === result.referenceId && r.createdAt < result.createdAt);
      const recs = recommendPractice(result, ref);
      const progress = progressReport(history, cfg.historyWindow, result);
      const payload = buildAiPayload(result, ref, { learner: profile, shareName: cfg.aiShareName, recommendations: recs, progress, source: s.input.source, hand: s.hand });
      let updatedPlan: PracticePlan | null = null;
      if (plan) {
        updatedPlan = applyAttempt(plan.plan, { resultId: result.id, score: result.total, at: result.createdAt });
        await coachStorage.savePlan(updatedPlan).catch(() => {});
      }
      setPhase({ name: 'results', data: { lesson: lessonForScore, baseLesson: LESSONS.find((l) => l.id === s.lessonId) ?? lessonForScore, reference: ref, recorded, perf, result, recs, progress, history, payload, plan: updatedPlan } });
      setPlanCtx(null);
    },
    [cfg.historyWindow, cfg.aiShareName, profile, profileKey],
  );

  const start = useCallback(() => {
    setError(null);
    const follower = new ScoreFollower(reference);
    followerRef.current = follower;
    setCursor(follower.cursor());
    setMeasureNow(follower.measure);
    const beats = measureLength(lesson.timeSignature);
    const meta: Omit<PerformanceSession, 'status' | 'startedAt' | 'updatedAt' | 'endedAt' | 'eventCount' | 'recorderVersion'> = {
      id: newId('cs'),
      profileKey,
      lessonId: baseLesson.id,
      lessonTitle: baseLesson.title,
      ...(lesson.slice ? { measures: [lesson.slice.from, lesson.slice.to] as [number, number] } : {}),
      hand: effectiveHand,
      mode: cfg.mode,
      targetBpm: bpm,
      metronome: cfg.metronome && input.primary !== 'microphone',
      input: {
        source: input.primary,
        ...(input.primary === 'midi' && midiDevices[0] ? { deviceName: midiDevices[0].name } : {}),
        ...(input.primary === 'midi' && midiInput.backendKind ? { backend: midiInput.backendKind } : {}),
        capabilities: input.capabilities,
      },
      latencyMs: input.primary === 'microphone' ? MIC_LATENCY_MS : 0,
      pedalRule: cfg.pedalRule,
      ...(planCtx ? { planId: planCtx.plan.id, planStepId: planCtx.stepId } : {}),
    };
    recorder.start({
      meta,
      sources: input.sources,
      bpm,
      metronome: cfg.metronome && input.primary !== 'microphone',
      countInBeats: cfg.countIn ? beats + (lesson.pickup ? beats - lesson.pickup : 0) : 0,
      beatsPerMeasure: beats,
      pickup: lesson.pickup ?? 0,
      keyboardMidis: reference.notes.map((n) => n.midi),
      onNote: (midi) => {
        const f = followerRef.current;
        if (!f) return;
        f.handle(midi);
        setCursor(f.cursor());
        setMeasureNow(f.measure);
      },
    });
    setPhase({ name: 'recording' });
  }, [reference, lesson, baseLesson, profileKey, effectiveHand, cfg.mode, cfg.metronome, cfg.countIn, cfg.pedalRule, bpm, input, midiDevices, planCtx, recorder]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      const recorded = await recorder.stop();
      if (!recorded) return;
      await finishSession(recorded, lesson, planCtx);
    } catch (e) {
      console.error('[VietPiano] Lỗi chấm bài', e);
      setError('Không chấm được phiên này. Log gốc vẫn được lưu — thử mở lại trong Lịch sử.');
      setPhase({ name: 'setup' });
    } finally {
      setBusy(false);
    }
  }, [recorder, finishSession, lesson, planCtx]);

  const abort = useCallback(async () => {
    await recorder.abort();
    setPhase({ name: 'setup' });
  }, [recorder]);

  // Khôi phục phiên dở dang: chấm phần đã ghi.
  const recover = useCallback(
    async (s: PerformanceSession) => {
      setBusy(true);
      try {
        const rec = await coachStorage.getRecorded(s.id);
        if (!rec) return;
        await coachStorage.setSessionStatus(s.id, 'interrupted');
        const l = LESSONS.find((x) => x.id === s.lessonId);
        if (!l) {
          setError('Bài của phiên này không còn trong thư viện.');
          return;
        }
        await finishSession({ session: { ...rec.session, status: 'interrupted' }, events: rec.events }, safeSlice(l, s.measures ?? null), null);
      } finally {
        setBusy(false);
        void refreshInterrupted();
      }
    },
    [finishSession, refreshInterrupted],
  );
  const discard = useCallback(
    async (s: PerformanceSession) => {
      await coachStorage.deleteSession(s.id);
      void refreshInterrupted();
    },
    [refreshInterrupted],
  );

  /** Thực hiện một gợi ý luyện (mở đúng tính năng sẵn có). */
  const runRecommendation = useCallback(
    async (rec: PracticeRecommendation, data: ResultData, asPlan: boolean) => {
      const a = rec.action;
      if (asPlan) {
        const plan = createPlan(rec, referenceFromLesson(data.baseLesson, { hand: data.recorded.session.hand, targetBpm: lessonTempo(data.baseLesson) }), {
          id: newId('plan'),
          profileKey,
          lessonId: data.baseLesson.id,
          now: Date.now(),
          sourceResultId: data.result.id,
          sourceScore: data.result.total,
        });
        await coachStorage.savePlan(plan).catch(() => {});
        const step = plan.steps.find((s) => s.status === 'active')!;
        setPlanCtx({ plan, stepId: step.id });
        setSection(step.measures);
        setCfg({ lastLessonId: data.baseLesson.id, tempoPercent: Math.round((step.bpm / lessonTempo(data.baseLesson)) * 100) });
        if (rec.hand) setHand(rec.hand);
        setPhase({ name: 'setup' });
        return;
      }
      if (a.type === 'coach-section') {
        setSection(a.measures);
        setCfg({ lastLessonId: data.baseLesson.id, tempoPercent: a.tempoPercent });
        if (a.hand) setHand(a.hand);
        setPhase({ name: 'setup' });
      } else if (a.type === 'practice') {
        if (a.hand) updateSettings({ practiceHand: a.hand });
        updateSettings({ practiceMode: a.mode });
        openLesson(data.baseLesson.id, a.measures);
      } else if (a.type === 'game') navigate({ name: 'balloon-pop', returnTo: { name: 'coach' } });
      else if (a.type === 'curriculum') navigate({ name: 'lesson', lessonId: a.lessonId });
    },
    [profileKey, setCfg, navigate, openLesson, updateSettings],
  );

  /** Bước đang làm của một kế hoạch (mở từ lịch sử / kết quả). */
  const continuePlan = useCallback(
    (plan: PracticePlan) => {
      const step = plan.steps.find((s) => s.status === 'active');
      const l = LESSONS.find((x) => x.id === plan.lessonId);
      if (!step || !l) return;
      setPlanCtx({ plan, stepId: step.id });
      setSection(step.measures);
      setCfg({ lastLessonId: l.id, tempoPercent: Math.round((step.bpm / lessonTempo(l)) * 100) });
      setPhase({ name: 'setup' });
    },
    [setCfg],
  );

  const title = phase.name === 'history' ? 'Lịch sử chấm' : 'AI Piano Coach';
  return (
    <div className="h-full overflow-y-auto" data-testid="coach-screen" data-phase={phase.name}>
      <div className="mx-auto max-w-6xl px-4 pt-[calc(1.25rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10 sm:px-6">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button
            variant="ghost"
            className="px-2"
            aria-label={phase.name === 'setup' ? 'Về trang chủ' : 'Quay lại'}
            onClick={() => (phase.name === 'setup' ? navigate({ name: 'dashboard' }) : phase.name === 'recording' ? void abort() : setPhase({ name: 'setup' }))}
            midiNav={phase.name === 'recording' ? undefined : 'back'}
          >
            <Icon name="back" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold">{title}</h1>
            <p className="truncate text-sm text-slate-500 dark:text-slate-400">
              Ghi lại bài đàn, đối chiếu bản nhạc, chấm có căn cứ, chỉ lỗi trên khuông và gợi ý cách sửa. Dữ liệu chỉ lưu trên máy này.
            </p>
          </div>
          {phase.name !== 'recording' && phase.name !== 'history' && (
            <Button className="shrink-0 text-sm" onClick={() => setPhase({ name: 'history' })} data-testid="coach-open-history">
              <Icon name="list" className="h-5 w-5" /> Lịch sử
            </Button>
          )}
          <FullscreenButton className="shrink-0" />
        </header>

        {error && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800" role="alert">
            {error}
          </p>
        )}

        {phase.name === 'setup' && (
          <CoachSetup
            lessons={LESSONS}
            baseLesson={baseLesson}
            lesson={lesson}
            reference={reference}
            cfg={cfg}
            setCfg={setCfg}
            section={section}
            setSection={setSection}
            twoHands={twoHands}
            hand={effectiveHand}
            setHand={setHand}
            input={input}
            bpm={bpm}
            pedalSeen={pedalSeen}
            interrupted={interrupted}
            onRecover={recover}
            onDiscard={discard}
            plan={planCtx}
            onCancelPlan={() => setPlanCtx(null)}
            busy={busy}
            onStart={start}
            labelStyle={labelStyle}
            aiLink={aiLink}
          />
        )}
        {phase.name === 'recording' && recorder.state && (
          <CoachRecording
            lesson={lesson}
            reference={reference}
            state={recorder.state}
            countIn={recorder.countIn}
            cursor={cursor}
            measure={measureNow}
            labelStyle={labelStyle}
            inputLabel={input.label}
            pedalAvailable={input.capabilities.pedal}
            onPause={recorder.pause}
            onResume={recorder.resume}
            onStop={() => void stop()}
            onAbort={() => void abort()}
            onPress={recorder.press}
            onRelease={recorder.release}
            busy={busy}
            aiLink={aiLink}
          />
        )}
        {phase.name === 'results' && (
          <CoachResults
            data={phase.data}
            audience={audience}
            labelStyle={labelStyle}
            cfg={cfg}
            onRetry={() => setPhase({ name: 'setup' })}
            onPracticeSection={(m, tempoBpm) => {
              setSection(m);
              setCfg({ lastLessonId: phase.data.baseLesson.id, ...(tempoBpm ? { tempoPercent: Math.round((tempoBpm / lessonTempo(phase.data.baseLesson)) * 100) } : { tempoPercent: 70 }) });
              setPhase({ name: 'setup' });
            }}
            onRecommendation={(rec, asPlan) => void runRecommendation(rec, phase.data, asPlan)}
            onContinuePlan={continuePlan}
          />
        )}
        {phase.name === 'history' && (
          <CoachHistory
            profileKey={profileKey}
            profileName={profile?.name ?? 'Khách'}
            lessons={LESSONS}
            window={cfg.historyWindow}
            setWindow={(w) => setCfg({ historyWindow: w })}
            onOpen={(data) => setPhase({ name: 'results', data })}
            onContinuePlan={continuePlan}
            labelStyle={labelStyle}
            audience={audience}
            aiShareName={cfg.aiShareName}
            learner={profile}
          />
        )}
      </div>
    </div>
  );
}
