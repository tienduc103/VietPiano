import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Fireworks } from '../components/Fireworks';
import { PianoKeyboard } from '../components/PianoKeyboard';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { ScoreView } from '../components/ScoreView';
import { InputSourceBar } from '../components/curriculum/common';
import { useFrameClock, useKeyFlash } from '../components/games/shared';
import { Button, FullscreenButton, Icon, Segmented, Toggle } from '../components/ui';
import { soundOutput } from '../core/audio/SoundOutput';
import { micOnlyInput } from '../core/input/sourceFilter';
import { virtualInput } from '../core/input/VirtualInputProvider';
import type { NoteResult } from '../core/practice/PracticeEngine';
import { midiToLabel, pitchToLabel, type NoteLabelStyle } from '../core/music/notes';
import type { Hand } from '../core/lessons/types';
import {
  CHAINS_PER_SESSION,
  FiveFingerSession,
  placementsOf,
  type ChainOutcome,
  type SessionSettings,
  type SessionState,
} from '../core/fiveFinger/FiveFingerSession';
import { DIFFICULTY_LABEL, HAND_MODE_LABEL, placementOf, randomSeed, stepsToLesson, type FiveFingerDifficulty, type HandMode, type Movement, type StepNote } from '../core/fiveFinger/generator';
import { fingerFor, HAND_POSITIONS, placementKeys, separateHands, validOctaves, type PositionId } from '../core/fiveFinger/positions';
import { adviseDifficulty, handAccuracy, handReactionMs, troubleNotes, weakMovements, type ChainHistoryEntry, type FiveFingerStats } from '../core/fiveFinger/stats';
import { clearFiveFingerStats, loadFiveFingerSettings, loadFiveFingerStats, recordFiveFingerChain, saveFiveFingerSettings } from '../core/fiveFinger/storage';
import { useNoteInput } from '../hooks/useNoteInput';
import { useApp } from '../store/appStore';
import { useMic } from '../store/micStore';
import { useMidi } from '../store/midiStore';
import { usePlayingNow } from '../store/playingStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type Modal = 'settings' | 'progress' | null;

const TOP_BUTTON = 'px-3 text-sm';

const DIFFICULTY_HINT: Record<FiveFingerDifficulty, string> = {
  easy: 'Liền bậc, ít nhảy ngón · hiện tên nốt, ngón tay và phím cần đánh',
  medium: 'Có nhảy cách 1 phím và nốt lặp · ẩn tên nốt, vẫn hiện ngón tay',
  hard: 'Nhảy giữa bất kỳ 2 phím, trường độ thay đổi · chỉ có khuông nhạc',
};

const HAND_TEXT: Record<Hand, string> = { right: 'Tay phải', left: 'Tay trái' };
const percent = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
const seconds = (ms: number | null | undefined) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`);
const noteName = (pitch: string, style: NoteLabelStyle) => pitchToLabel(pitch, style);

function movementText(m: Movement): string {
  return `${HAND_TEXT[m.hand]}: ngón ${fingerFor(m.hand, m.from)} → ngón ${fingerFor(m.hand, m.to)}`;
}

/** "5 ngón – 8 nốt liên tục": chuỗi 8 nốt sinh tự động, đúng đủ chuỗi → tự sang chuỗi mới. */
export function FiveFingerScreen() {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const profileId = profile?.id ?? null;
  const inputSource = useSettings((s) => s.settings.inputSource);
  const labelStyle = useSettings((s) => s.settings.labelStyle);
  const micLive = useMic((s) => s.live);
  const micRunning = useMic((s) => s.status === 'running');
  const midiConnected = useMidi((s) => s.status === 'ready' && s.devices.length > 0);
  const micOnly = micOnlyInput(inputSource, micRunning, midiConnected);

  const [settings, setSettings] = useState<SessionSettings>(() => loadFiveFingerSettings(profileId));
  const [stats, setStats] = useState<FiveFingerStats>(() => loadFiveFingerStats(profileId));
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const [run, setRun] = useState(0);
  const [replay, setReplay] = useState<ChainHistoryEntry | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const outcomesRef = useRef<ChainOutcome[]>([]);

  // Đổi hồ sơ → đọc lại cài đặt + thống kê của hồ sơ đó.
  const loadedFor = useRef(profileId);
  useEffect(() => {
    if (loadedFor.current === profileId) return;
    loadedFor.current = profileId;
    setSettings(loadFiveFingerSettings(profileId));
    setStats(loadFiveFingerStats(profileId));
  }, [profileId]);

  const session = useMemo(() => {
    outcomesRef.current = [];
    const hands: Hand[] = settings.handMode === 'right' ? ['right'] : settings.handMode === 'left' ? ['left'] : ['right', 'left'];
    return new FiveFingerSession(settings, {
      seed: randomSeed(),
      focus: () => weakMovements(statsRef.current, hands),
      ...(replay ? { replay: { seed: replay.seed, focus: replay.focus } } : {}),
      onChainDone: (o) => {
        outcomesRef.current.push(o);
        // Thời điểm lưu theo đồng hồ thật (thời gian nốt là performance.now).
        const next = recordFiveFingerChain(profileId, { ...o, at: Date.now() });
        statsRef.current = next;
        setStats(next);
      },
    });
    // `run` tạo buổi mới với cùng cài đặt.
  }, [settings, run, profileId, replay]);
  useEffect(() => () => session.dispose(), [session]);
  const state = useSyncExternalStore(
    (cb) => session.subscribe(cb),
    () => session.getState(),
  );
  const drill = state.drill;

  const sessionRef = useRef(session);
  sessionRef.current = session;
  useFrameClock(state.status === 'celebrating', (now) => sessionRef.current.tick(now));

  const playing = state.status === 'playing';
  usePlayingNow(playing || state.status === 'celebrating');
  // Hai tay cùng lúc cần nhận hai nốt cùng lúc: micro chỉ nhận một nốt mỗi lúc.
  const togetherBlocked = settings.handMode === 'together' && micOnly;

  // Ẩn app / mở bảng cài đặt → tạm dừng.
  useEffect(() => {
    const onVisibility = () => document.hidden && session.pause(performance.now());
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [session]);
  useEffect(() => {
    if (modal) session.pause(performance.now());
  }, [modal, session]);

  // Máy đếm nhịp khi chấm nhịp.
  useEffect(() => {
    if (!settings.rhythm || !playing) return;
    let beat = 0;
    const id = window.setInterval(() => soundOutput.click(beat++ % 4 === 0), 60000 / settings.bpm);
    return () => window.clearInterval(id);
  }, [settings.rhythm, settings.bpm, playing]);

  const held = useRef(new Set<number>());
  useNoteInput(
    {
      onNote: (e) => {
        // Đàn MIDI / bàn phím ảo gửi lặp Note On khi giữ phím → chỉ tính lần nhấn mới.
        if (e.source !== 'microphone') {
          if (held.current.has(e.midi)) return;
          held.current.add(e.midi);
        }
        const out = session.handleNote(e.midi, e.time);
        if (out !== 'ignored' && e.source === 'virtual') soundOutput.playNote(e.midi, 0.4);
      },
      onNoteOff: (e) => held.current.delete(e.midi),
    },
    inputSource,
    { baseMidi: placementKeys(placementOf(placementsOf(settings), settings.handMode === 'right' ? 'right' : 'left'))[0], listening: playing && !modal },
  );

  const level = settings.difficulty;
  const lesson = useMemo(
    () => stepsToLesson(state.steps, placementsOf(settings), { id: `five-finger-${state.chain.seed}-${state.phase}`, title: 'Chuỗi 5 ngón', fingers: level !== 'hard' }),
    [state.steps, state.chain.seed, state.phase, settings, level],
  );
  const results = useMemo<NoteResult[]>(() => drill.results.map((r) => r), [drill.results]);
  const [wrongPulse, setWrongPulse] = useState(0);
  useEffect(() => {
    if (drill.lastOutcome === 'wrong') setWrongPulse((p) => p + 1);
  }, [drill.lastEventTime, drill.lastOutcome]);
  const flash = useKeyFlash(drill.lastEventTime, drill.lastMidi, drill.lastOutcome === 'wrong' ? 'wrong' : drill.lastOutcome ? 'hit' : null);

  const pending: StepNote[] = playing ? drill.steps[drill.index].notes.filter((n) => !drill.hitMidis.includes(n.midi)) : [];
  const range = useMemo(() => {
    const keys = [...placementKeys(placementOf(placementsOf(settings), 'right')), ...placementKeys(placementOf(placementsOf(settings), 'left'))];
    const used = settings.handMode === 'right' ? keys.slice(0, 5) : settings.handMode === 'left' ? keys.slice(5) : keys;
    const lo = Math.min(...used);
    const hi = Math.max(...used);
    return { from: lo - (lo % 12), to: hi - (hi % 12) + 11 };
  }, [settings]);
  const positionFingers = useMemo(() => {
    const map: Record<number, number> = {};
    const hands = new Set(state.steps.flatMap((s) => s.notes.map((n) => n.hand)));
    for (const hand of hands) placementKeys(placementOf(placementsOf(settings), hand)).forEach((m, i) => (map[m] = fingerFor(hand, i)));
    return map;
  }, [settings, state.steps]);
  const positionKeys = useMemo(() => new Set(Object.keys(positionFingers).map(Number)), [positionFingers]);

  // Gợi ý trên bàn phím theo độ khó.
  const keyboardHints =
    level === 'easy'
      ? {
          expected: pending[0]?.midi ?? null,
          highlighted: new Set(pending.slice(1).map((n) => n.midi)),
          fingers: Object.fromEntries(pending.map((n) => [n.midi, n.finger])),
          labelFor: (m: number) => (positionKeys.has(m) ? midiToLabel(m, labelStyle) : ''),
        }
      : level === 'medium'
        ? { expected: null, fingers: positionFingers, labelFor: () => '' }
        : { expected: null, labelFor: () => '' };

  const restartSession = (patch?: Partial<SessionSettings>, replayEntry: ChainHistoryEntry | null = null) => {
    if (patch) {
      const next = { ...settings, ...patch };
      const hands = separateHands(placementOf(placementsOf(next), 'left'), placementOf(placementsOf(next), 'right'));
      const fixed = { ...next, leftOctave: hands.left.octave, rightOctave: hands.right.octave };
      saveFiveFingerSettings(profileId, fixed);
      setSettings(fixed);
    }
    setReplay(replayEntry);
    setRun((r) => r + 1);
  };

  const advice = adviseDifficulty(stats, settings.handMode, settings.difficulty);
  const sessionAccuracy = state.correctNotes + state.wrongNotes > 0 ? state.correctNotes / (state.correctNotes + state.wrongNotes) : null;
  const limitText = settings.chainsPerSession === 0 ? '∞' : String(settings.chainsPerSession);
  const phaseText = state.phase === 'main' ? null : `Luyện ${HAND_TEXT[state.phase].toLowerCase()} trước`;

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      data-testid="five-finger"
      data-status={state.status}
      data-chain={state.chainNumber}
      data-chains-done={state.chainsDone}
      data-step={drill.index}
      data-phase={state.phase}
      data-expected={pending.map((n) => n.midi).join(',')}
    >
      {/* Lề trái chừa chỗ cho nút nổi tải lại (góc trên bên trái). */}
      <header className="flex flex-wrap items-center gap-2 pt-[calc(.5rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pr-3 pb-2 pl-16">
        <Button variant="ghost" onClick={() => navigate({ name: 'dashboard' })} aria-label="Về trang chủ" midiNav={playing ? undefined : 'back'}>
          <Icon name="back" />
        </Button>
        <h1 className="text-xl font-black">🖐 5 ngón · 8 nốt</h1>
        <span className="rounded-full bg-violet-100 px-3 py-1 text-sm font-bold dark:bg-slate-700" data-testid="five-chain-counter">
          Chuỗi {state.chainNumber}/{limitText}
        </span>
        <span className="rounded-full bg-white/80 px-3 py-1 text-sm font-semibold dark:bg-slate-800">
          {HAND_MODE_LABEL[settings.handMode]} · {DIFFICULTY_LABEL[level]}
          {settings.rhythm ? ` · ♩=${settings.bpm}` : ''}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {state.status === 'paused' ? (
            <Button variant="primary" className={TOP_BUTTON} onClick={() => session.resume(performance.now())} data-testid="five-resume">
              <Icon name="play" /> Tiếp tục
            </Button>
          ) : (
            <Button className={TOP_BUTTON} onClick={() => session.pause(performance.now())} disabled={!playing && state.status !== 'celebrating'} data-testid="five-pause">
              <Icon name="pause" /> Tạm dừng
            </Button>
          )}
          <Button className={TOP_BUTTON} onClick={() => session.retry(performance.now())} disabled={state.status === 'ready' || state.status === 'finished'} data-testid="five-retry">
            <Icon name="restart" /> Luyện lại
          </Button>
          <Button variant="danger" className={TOP_BUTTON} onClick={() => session.end(performance.now())} disabled={state.status === 'ready' || state.status === 'finished'} data-testid="five-end">
            Kết thúc
          </Button>
          <Button className={TOP_BUTTON} onClick={() => setModal('settings')} data-testid="five-open-settings">
            <Icon name="settings" /> Cài đặt
          </Button>
          <FullscreenButton />
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-3">
        <div className="relative min-h-0 flex-1 rounded-2xl bg-white/90 shadow-sm ring-1 ring-violet-100 dark:bg-slate-800/90 dark:ring-violet-900">
          <ScoreView
            lesson={lesson}
            index={drill.index}
            results={results}
            status={drill.status === 'finished' ? 'finished' : drill.lastOutcome === 'wrong' ? 'wrong' : 'waiting'}
            wrongPulse={wrongPulse}
            showNames={level === 'easy'}
            labelStyle={labelStyle}
            minScale={0.6}
          />
        </div>
        {/* Cao cố định: hàng gợi ý đổi chiều cao theo từng nốt → vùng khuông co giãn, khuông nhảy (xem scoreFit). */}
        <div className="flex h-16 shrink-0 flex-nowrap items-center gap-3 overflow-hidden rounded-2xl bg-white/80 px-3 dark:bg-slate-800/80">
          <StepDots results={drill.results} index={drill.index} active={playing} />
          <span className="text-sm text-slate-600 dark:text-slate-300" data-testid="five-accuracy">
            Chính xác: {percent(sessionAccuracy)}
          </span>
          {phaseText && <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{phaseText}</span>}
          <TargetHint pending={pending} level={level} labelStyle={labelStyle} playing={playing} />
          <SyncMessage outcome={drill.lastOutcome} playing={playing} togetherSteps={state.steps.some((s) => s.notes.length > 1)} />
          <div className="ml-auto">
            <InputSourceBar />
          </div>
        </div>
        {togetherBlocked && (
          <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" role="alert">
            Hai tay cùng lúc cần đàn MIDI hoặc bàn phím ảo: micro chỉ nhận một nốt mỗi lúc. Hãy tắt micro hoặc nối đàn MIDI, hoặc chọn Luân phiên.
          </p>
        )}
      </main>

      <div className="h-[30%] min-h-36 shrink-0 px-3 pt-2 pb-[calc(8px+env(safe-area-inset-bottom,0px))]" data-testid="five-keyboard">
        <PianoKeyboard
          from={range.from}
          to={range.to}
          detected={micLive?.midi ?? null}
          flash={flash}
          labelStyle={labelStyle}
          onPress={(m) => virtualInput.press(m)}
          onRelease={(m) => virtualInput.release(m)}
          {...keyboardHints}
        />
      </div>

      {state.status === 'ready' && !modal && (
        <CenterOverlay>
          <div className="text-6xl" aria-hidden>
            🖐🎹
          </div>
          <h2 className="text-3xl font-black">5 ngón · 8 nốt liên tục</h2>
          <p className="max-w-xl text-sm">
            Đặt tay vào 5 phím, đánh đúng 8 nốt — xong chuỗi này app tự tạo chuỗi mới. Không có đồng hồ, không phạt khi bạn suy nghĩ lâu.
          </p>
          <p className="text-sm font-semibold">
            {HAND_MODE_LABEL[settings.handMode]} · {DIFFICULTY_LABEL[level]} · {HAND_POSITIONS.find((p) => p.id === settings.position)?.label} · {limitText} chuỗi
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">{DIFFICULTY_HINT[level]}</p>
          {replay && <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Mở lại chuỗi đã lưu (seed {replay.seed})</p>}
          <AdviceBanner advice={advice.advice} target={advice.target} onApply={() => restartSession({ difficulty: advice.target })} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              variant="primary"
              className="min-h-14 text-lg"
              onClick={() => session.start(performance.now())}
              disabled={togetherBlocked}
              midiNav={togetherBlocked ? undefined : 'forward'}
              data-testid="five-start"
            >
              ▶ Bắt đầu
            </Button>
            <Button onClick={() => setModal('settings')}>⚙ Cài đặt</Button>
            <Button onClick={() => setModal('progress')} data-testid="five-open-progress">
              📊 Tiến bộ
            </Button>
          </div>
        </CenterOverlay>
      )}

      {state.status === 'paused' && !modal && (
        <CenterOverlay>
          <h2 className="text-3xl font-black">⏸ Đang tạm dừng</h2>
          <Button variant="primary" onClick={() => session.resume(performance.now())} midiNav="forward">
            ▶ Tiếp tục
          </Button>
        </CenterOverlay>
      )}

      {state.status === 'celebrating' && state.celebrate && (
        <>
          {state.celebrate.next !== 'phase' && <Fireworks key={`${state.chainNumber}-${state.chainsDone}`} />}
          <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 grid place-items-center" data-testid="five-celebrate">
            <div className="animate-bounce rounded-3xl bg-white/95 px-8 py-4 text-center shadow-2xl ring-4 ring-emerald-300 dark:bg-slate-900/95">
              {state.celebrate.next === 'phase' ? (
                <p className="text-2xl font-black">✋ Xong {state.phase === 'right' ? 'tay phải! Giờ tới tay trái' : 'tay trái! Giờ hai tay cùng lúc'}</p>
              ) : (
                <>
                  <p className="text-3xl font-black">🎉 Hoàn thành chuỗi {state.chainNumber}!</p>
                  <p className="text-sm font-semibold">
                    Đúng {percent(state.celebrate.summary.accuracy)}
                    {state.celebrate.summary.rhythm ? ` · đúng nhịp ${state.celebrate.summary.rhythm.onTime}/${state.celebrate.summary.rhythm.intervals}` : ''}
                    {state.celebrate.next === 'chain' ? ' · chuỗi mới sắp tới…' : ''}
                  </p>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {state.status === 'finished' && !modal && (
        <SessionSummary
          state={state}
          outcomes={outcomesRef.current}
          stats={stats}
          settings={settings}
          labelStyle={labelStyle}
          onAgain={() => restartSession()}
          onApplyAdvice={(difficulty) => restartSession({ difficulty })}
          onProgress={() => setModal('progress')}
          onHome={() => navigate({ name: 'dashboard' })}
        />
      )}

      {modal === 'settings' && (
        <SettingsModal
          settings={settings}
          onChange={(patch) => restartSession(patch)}
          onClose={() => setModal(null)}
          micOnly={micOnly}
        />
      )}
      {modal === 'progress' && (
        <ProgressModal
          stats={stats}
          labelStyle={labelStyle}
          profileName={profile?.name ?? null}
          onReplay={(entry) => {
            restartSession({ handMode: entry.handMode, difficulty: entry.difficulty, position: entry.position }, entry);
            setModal(null);
          }}
          onClear={() => setStats(clearFiveFingerStats(profileId))}
          onClose={() => setModal(null)}
        />
      )}
      {state.status === 'ready' && !modal && (
        <div className="absolute right-3 bottom-2 left-3 z-30">
          <ProfileSwitcher className="" hint="Mỗi hồ sơ có thống kê và cài đặt 5 ngón riêng (lưu trên máy này)." />
        </div>
      )}
    </div>
  );
}

function CenterOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center p-3 pb-28">
      <section className="pointer-events-auto grid max-w-2xl justify-items-center gap-3 rounded-[2rem] bg-white/95 p-5 text-center shadow-2xl ring-2 ring-violet-300 dark:bg-slate-900/95">
        {children}
      </section>
    </div>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-50 overflow-y-auto bg-slate-950/55 p-4" role="dialog" aria-label={title}>
      <section className="mx-auto grid max-w-3xl gap-4 rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-800">
        <header className="flex items-center gap-3">
          <h2 className="flex-1 text-2xl font-black">{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Đóng" data-testid="five-close-modal">
            <Icon name="close" />
          </Button>
        </header>
        {children}
      </section>
    </div>
  );
}

function StepDots({ results, index, active }: { results: readonly string[]; index: number; active: boolean }) {
  return (
    <div className="flex gap-1.5" aria-label={`Nốt ${index + 1}/${results.length}`}>
      {results.map((r, i) => (
        <span
          key={i}
          className={`size-4 rounded-full ${r === 'correct' ? 'bg-emerald-500' : r === 'corrected' ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'} ${active && i === index ? 'ring-4 ring-fuchsia-400' : ''}`}
        />
      ))}
    </div>
  );
}

function TargetHint({ pending, level, labelStyle, playing }: { pending: StepNote[]; level: FiveFingerDifficulty; labelStyle: NoteLabelStyle; playing: boolean }) {
  if (!playing || pending.length === 0) return <div className="flex-1" />;
  if (level === 'hard') return <div className="flex-1 text-base font-semibold text-slate-600 dark:text-slate-300">Đọc nốt trên khuông nhạc</div>;
  return (
    <div className="flex min-w-0 flex-1 flex-nowrap gap-2 overflow-hidden" data-testid="five-target">
      {pending.map((n) => (
        <span key={n.midi} className="shrink-0 rounded-xl bg-fuchsia-50 px-3 py-1 text-base font-bold text-fuchsia-900 dark:bg-fuchsia-950/50 dark:text-fuchsia-100">
          {HAND_TEXT[n.hand]} · ngón {n.finger}
          {level === 'easy' ? ` · ${noteName(n.pitch, labelStyle)}` : ''}
        </span>
      ))}
    </div>
  );
}

function SyncMessage({ outcome, playing, togetherSteps }: { outcome: string | null; playing: boolean; togetherSteps: boolean }) {
  if (!playing || !togetherSteps) return null;
  if (outcome === 'late-sync') return <span className="font-semibold text-amber-700 dark:text-amber-300">Hai tay chưa cùng lúc — đánh lại cùng nhau nhé</span>;
  if (outcome === 'partial') return <span className="font-semibold text-violet-700 dark:text-violet-300">Còn tay kia…</span>;
  return <span className="text-sm text-slate-500">Đánh hai phím cùng lúc</span>;
}

function AdviceBanner({ advice, target, onApply }: { advice: 'harder' | 'easier' | 'stay'; target: FiveFingerDifficulty; onApply: () => void }) {
  if (advice === 'stay') return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm dark:bg-emerald-950/40" data-testid="five-advice">
      <span>
        {advice === 'harder'
          ? `Bạn đã làm tốt 3 chuỗi liên tiếp — thử mức ${DIFFICULTY_LABEL[target]}?`
          : `Mức này đang hơi khó — thử mức ${DIFFICULTY_LABEL[target]}? (App cũng ưu tiên luyện những chuyển động còn yếu.)`}
      </span>
      <Button onClick={onApply}>Chuyển sang {DIFFICULTY_LABEL[target]}</Button>
    </div>
  );
}

function SettingsModal({ settings, onChange, onClose, micOnly }: { settings: SessionSettings; onChange: (p: Partial<SessionSettings>) => void; onClose: () => void; micOnly: boolean }) {
  const usesRight = settings.handMode !== 'left';
  const usesLeft = settings.handMode !== 'right';
  return (
    <ModalShell title="⚙ Cài đặt 5 ngón" onClose={onClose}>
      <p className="text-sm text-slate-600 dark:text-slate-300">Đổi cài đặt sẽ bắt đầu buổi tập mới.</p>
      <Row label="Tay">
        <Segmented value={settings.handMode} onChange={(handMode: HandMode) => onChange({ handMode })} options={(Object.keys(HAND_MODE_LABEL) as HandMode[]).map((v) => ({ value: v, label: HAND_MODE_LABEL[v] }))} />
      </Row>
      {settings.handMode === 'together' && micOnly && <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">Micro chỉ nhận một nốt mỗi lúc — hai tay cùng lúc cần đàn MIDI hoặc bàn phím ảo.</p>}
      <Row label="Độ khó">
        <Segmented value={settings.difficulty} onChange={(difficulty: FiveFingerDifficulty) => onChange({ difficulty })} options={(['easy', 'medium', 'hard'] as const).map((v) => ({ value: v, label: DIFFICULTY_LABEL[v] }))} />
      </Row>
      <p className="-mt-2 text-xs text-slate-500">{DIFFICULTY_HINT[settings.difficulty]}</p>
      <Row label="Vị trí bàn tay">
        <div className="flex flex-wrap gap-1.5">
          {HAND_POSITIONS.map((p) => (
            <Button key={p.id} variant={settings.position === p.id ? 'primary' : 'secondary'} className="min-h-10 px-3 text-sm" onClick={() => onChange({ position: p.id as PositionId, rightOctave: validOctaves('right', p.id)[0], leftOctave: validOctaves('left', p.id).at(-1) })}>
              {p.label}
            </Button>
          ))}
        </div>
      </Row>
      {usesRight && (
        <OctaveRow hand="right" settings={settings} onChange={(rightOctave) => onChange({ rightOctave })} />
      )}
      {usesLeft && <OctaveRow hand="left" settings={settings} onChange={(leftOctave) => onChange({ leftOctave })} />}
      <Row label="Số chuỗi mỗi buổi">
        <Segmented
          value={String(settings.chainsPerSession)}
          onChange={(v) => onChange({ chainsPerSession: Number(v) as SessionSettings['chainsPerSession'] })}
          options={CHAINS_PER_SESSION.map((n) => ({ value: String(n), label: n === 0 ? 'Không giới hạn' : String(n) }))}
        />
      </Row>
      <Toggle checked={settings.rhythm} onChange={(rhythm) => onChange({ rhythm })} label="Chấm nhịp (máy đếm nhịp, vẫn chờ nốt đúng)" />
      {settings.rhythm && (
        <Row label="Nhịp độ">
          <Segmented value={String(settings.bpm)} onChange={(v) => onChange({ bpm: Number(v) })} options={[50, 60, 72, 84].map((b) => ({ value: String(b), label: `♩=${b}` }))} />
        </Row>
      )}
      {settings.handMode === 'together' && (
        <>
          <Toggle checked={settings.handsFirst} onChange={(handsFirst) => onChange({ handsFirst })} label="Luyện từng tay trước (tay phải → tay trái → hai tay)" />
          <Row label="Độ đồng thời">
            <Segmented
              value={String(settings.syncToleranceMs)}
              onChange={(v) => onChange({ syncToleranceMs: Number(v) })}
              options={[
                { value: '400', label: 'Dễ (0,4 s)' },
                { value: '250', label: 'Vừa (0,25 s)' },
                { value: '150', label: 'Chặt (0,15 s)' },
              ]}
            />
          </Row>
        </>
      )}
      <Row label="Nguồn nốt">
        <InputSourceBar />
      </Row>
    </ModalShell>
  );
}

function OctaveRow({ hand, settings, onChange }: { hand: Hand; settings: SessionSettings; onChange: (octave: number) => void }) {
  const octaves = validOctaves(hand, settings.position);
  const current = hand === 'right' ? settings.rightOctave : settings.leftOctave;
  const p = placementOf(placementsOf(settings), hand);
  return (
    <Row label={`${HAND_TEXT[hand]} (từ ${pitchToLabel(`${HAND_POSITIONS.find((x) => x.id === p.position)!.letters[0]}${current}`, 'letter')})`}>
      <Segmented
        value={String(current)}
        onChange={(v) => onChange(Number(v))}
        options={octaves.map((o) => ({ value: String(o), label: `Quãng tám ${o}` }))}
      />
    </Row>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-36 font-semibold">{label}</span>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-violet-50 p-3 dark:bg-slate-700">
      <dt className="text-xs text-slate-500 dark:text-slate-300">{label}</dt>
      <dd className="text-xl font-black">{value}</dd>
    </div>
  );
}

function SessionSummary({
  state,
  outcomes,
  stats,
  settings,
  labelStyle,
  onAgain,
  onApplyAdvice,
  onProgress,
  onHome,
}: {
  state: SessionState;
  outcomes: readonly ChainOutcome[];
  stats: FiveFingerStats;
  settings: SessionSettings;
  labelStyle: NoteLabelStyle;
  onAgain: () => void;
  onApplyAdvice: (d: FiveFingerDifficulty) => void;
  onProgress: () => void;
  onHome: () => void;
}) {
  const main = outcomes.filter((o) => !o.phase);
  const byHand = (hand: Hand) => {
    let correct = 0;
    let wrong = 0;
    for (const o of outcomes) {
      correct += o.steps.reduce((s, st) => s + st.notes.filter((n) => n.hand === hand).length, 0);
      wrong += o.attempts.filter((a) => !a.ok && a.expected.hand === hand).length;
    }
    return correct + wrong === 0 ? null : correct / (correct + wrong);
  };
  const reactions = outcomes.flatMap((o) => o.records.map((r) => r.reactionMs)).filter((x): x is number => x !== null);
  const rhythm = main.reduce((acc, o) => (o.summary.rhythm ? { on: acc.on + o.summary.rhythm.onTime, all: acc.all + o.summary.rhythm.intervals } : acc), { on: 0, all: 0 });
  const sync = main.reduce((acc, o) => acc + o.summary.lateSync, 0);
  const accuracy = state.correctNotes + state.wrongNotes ? state.correctNotes / (state.correctNotes + state.wrongNotes) : null;
  const advice = adviseDifficulty(stats, settings.handMode, settings.difficulty);
  const weak = weakMovements(stats);
  const trouble = troubleNotes(stats);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-slate-950/50 p-3" data-testid="five-summary">
      <section className="grid w-full max-w-2xl justify-items-center gap-3 rounded-[2rem] bg-white p-6 text-center shadow-2xl dark:bg-slate-800">
        <div className="text-6xl">🏁</div>
        <h2 className="text-3xl font-black">Kết thúc buổi tập</h2>
        <dl className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Chuỗi hoàn thành" value={state.chainsDone} />
          <Stat label="Nốt đúng" value={percent(accuracy)} />
          <Stat label="Phản ứng TB" value={seconds(reactions.length ? reactions.reduce((s, x) => s + x, 0) / reactions.length : null)} />
          {settings.rhythm ? <Stat label="Đúng nhịp" value={rhythm.all ? `${rhythm.on}/${rhythm.all}` : '—'} /> : <Stat label="Hai tay lệch" value={settings.handMode === 'together' ? sync : '—'} />}
          {(['right', 'left'] as const).map((h) => (byHand(h) === null ? null : <Stat key={h} label={`${HAND_TEXT[h]} đúng`} value={percent(byHand(h))} />))}
        </dl>
        {trouble.length > 0 && (
          <p className="text-sm">
            Nốt hay sai:{' '}
            {trouble.map((n) => `${noteName(n.pitch, labelStyle)} (${HAND_TEXT[n.hand].toLowerCase()}, ngón ${n.finger})`).join(', ')}
          </p>
        )}
        {weak.length > 0 && <p className="text-sm">Chuyển động đang được luyện thêm: {weak.map(movementText).join('; ')}</p>}
        <AdviceBanner advice={advice.advice} target={advice.target} onApply={() => onApplyAdvice(advice.target)} />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onAgain} midiNav="forward" data-testid="five-again">
            ↻ Buổi tập mới
          </Button>
          <Button onClick={onProgress}>📊 Tiến bộ</Button>
          <Button variant="ghost" onClick={onHome} midiNav="back">
            Về trang chủ
          </Button>
        </div>
      </section>
    </div>
  );
}

function ProgressModal({
  stats,
  labelStyle,
  profileName,
  onReplay,
  onClear,
  onClose,
}: {
  stats: FiveFingerStats;
  labelStyle: NoteLabelStyle;
  profileName: string | null;
  onReplay: (entry: ChainHistoryEntry) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const trouble = troubleNotes(stats, 5);
  const weak = weakMovements(stats, ['right', 'left'], 5);
  const recent = stats.history.filter((h) => !h.phase).slice(-8).reverse();
  return (
    <ModalShell title={`📊 Tiến bộ 5 ngón${profileName ? ` — ${profileName}` : ''}`} onClose={onClose}>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="five-progress">
        {(['right', 'left'] as const).map((h) => (
          <Stat key={h} label={`${HAND_TEXT[h]}: đúng / phản ứng`} value={`${percent(handAccuracy(stats.hands[h]))} · ${seconds(handReactionMs(stats.hands[h]))}`} />
        ))}
        <Stat label="Chuỗi đã xong" value={stats.history.filter((h) => !h.phase).length} />
        <Stat label="Đúng nhịp (chấm nhịp)" value={stats.rhythm.intervals ? percent(stats.rhythm.onTime / stats.rhythm.intervals) : '—'} />
        <Stat label="Hai tay cùng lúc" value={stats.sync.steps ? percent(stats.sync.together / stats.sync.steps) : '—'} />
      </dl>
      <div>
        <h3 className="font-bold">Nốt hay sai</h3>
        {trouble.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có — tiếp tục luyện nhé!</p>
        ) : (
          <ul className="text-sm">
            {trouble.map((n) => (
              <li key={`${n.hand}-${n.midi}`}>
                {noteName(n.pitch, labelStyle)} — {HAND_TEXT[n.hand].toLowerCase()}, ngón được hướng dẫn {n.finger}: sai {n.wrong} lần
                {n.topConfusion !== null ? `, hay nhầm sang ${midiToLabel(n.topConfusion, labelStyle)}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="font-bold">Chuyển động còn yếu (được ưu tiên khi sinh chuỗi)</h3>
        {weak.length === 0 ? <p className="text-sm text-slate-500">Chưa có.</p> : <ul className="text-sm">{weak.map((m) => <li key={`${m.hand}${m.from}${m.to}`}>{movementText(m)}</li>)}</ul>}
      </div>
      <div>
        <h3 className="font-bold">Chuỗi gần đây</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có chuỗi nào.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {recent.map((h) => (
              <li key={`${h.at}-${h.seed}`} className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  {new Date(h.at).toLocaleDateString('vi-VN')} · {HAND_MODE_LABEL[h.handMode]} · {DIFFICULTY_LABEL[h.difficulty]} · đúng {percent(h.accuracy)}
                </span>
                <Button className="min-h-10 px-3 text-sm" onClick={() => onReplay(h)}>
                  Luyện lại chuỗi này
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
        Ngón tay ở đây là ngón được hướng dẫn cho từng nốt. Micro và đàn MIDI thông thường không biết bạn dùng ngón nào, nên app không kết luận bạn dùng sai ngón.
      </p>
      <div>
        <Button variant="ghost" onClick={onClear}>
          Xoá thống kê 5 ngón của hồ sơ này
        </Button>
      </div>
    </ModalShell>
  );
}
