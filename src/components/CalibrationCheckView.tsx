import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  CHECK_LESSON,
  CalibrationCheck,
  lessonToCheckNotes,
  summarizeCheck,
  type CheckEventOutcome,
  type CheckState,
} from '../core/calibration/CalibrationCheck';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { lessonTempo, measureLength } from '../core/lessons/types';
import { midiToLabel, type NoteLabelStyle } from '../core/music/notes';
import type { NoteResult } from '../core/practice/PracticeEngine';
import { useMic } from '../store/micStore';
import { useSettings } from '../store/settingsStore';
import { PianoKeyboard } from './PianoKeyboard';
import { ScoreView } from './ScoreView';
import { Button } from './ui';

const NOTES = lessonToCheckNotes(CHECK_LESSON);
const BEATS_PER_MEASURE = measureLength(CHECK_LESSON.timeSignature);
const KEYBOARD_FROM = 57; // A3
const KEYBOARD_TO = 76; // E5
const HEARD_LOG = 10;

interface HeardEvent {
  id: number;
  midi: number;
  outcome: Exclude<CheckEventOutcome, 'ignored'>;
}

function createCheck(): CalibrationCheck {
  return new CalibrationCheck(NOTES, {
    bpm: lessonTempo(CHECK_LESSON),
    countInBeats: BEATS_PER_MEASURE,
    octaveTolerant: useSettings.getState().settings.octaveTolerant,
  });
}

const OUTCOME_STYLE: Record<HeardEvent['outcome'], { label: string; cls: string }> = {
  accepted: { label: 'đúng', cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
  wrong: { label: 'sai', cls: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
  extra: { label: 'thừa', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
};

/**
 * Kiểm tra sau căn chỉnh: khuông nhạc chạy theo nhịp, dừng chờ ở mỗi nốt tới khi nghe đúng.
 * Không phát tiếng gõ nhịp (micro sẽ nghe thấy) — nhịp chỉ hiển thị bằng hình.
 */
export function CalibrationCheckView({ labelStyle, onClose }: { labelStyle: NoteLabelStyle; onClose: () => void }) {
  const [check, setCheck] = useState(createCheck);
  const state = useSyncExternalStore(
    (l) => check.subscribe(l),
    () => check.getState(),
  );
  const [clock, setClock] = useState({ beat: 0, waiting: false });
  const [heard, setHeard] = useState<HeardEvent[]>([]);
  const live = useMic((s) => s.live);

  const active = state.status === 'countIn' || state.status === 'running';

  // Đồng hồ nhịp: cập nhật mỗi khung hình nhưng chỉ vẽ lại khi đổi phách / trạng thái chờ.
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const loop = () => {
      const now = performance.now();
      check.tick(now);
      const beat = Math.floor(check.position(now));
      const waiting = check.isWaiting(now);
      setClock((c) => (c.beat === beat && c.waiting === waiting ? c : { beat, waiting }));
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [check, active]);

  useEffect(() => {
    if (!active) return;
    let nextId = 0;
    return microphoneInput.onNote((e) => {
      const outcome = check.handleNote(e.midi, e.time);
      if (outcome === 'ignored') return;
      const id = nextId++;
      setHeard((h) => [...h.slice(-(HEARD_LOG - 1)), { id, midi: e.midi, outcome }]);
    });
  }, [check, active]);

  const start = async (target = check) => {
    if (!microphoneInput.isActive()) {
      await microphoneInput.start().catch(() => undefined);
      if (!microphoneInput.isActive()) return;
    }
    microphoneInput.resetRecognizer();
    setHeard([]);
    target.start(performance.now());
  };

  // Tạo bài mới để áp dụng cài đặt vừa sửa (vd bật chấp nhận sai quãng tám).
  const restart = () => {
    const next = createCheck();
    setCheck(next);
    void start(next);
  };

  const results = useMemo<NoteResult[]>(
    () => state.results.map((r) => (!r.accepted ? 'pending' : r.wrong.length || r.extra ? 'corrected' : 'correct')),
    [state.results],
  );
  const index = Math.min(state.index, NOTES.length - 1);
  const expected = state.status === 'finished' || state.index >= NOTES.length ? null : NOTES[state.index].midi;

  return (
    <div className="w-full rounded-xl bg-white p-4 ring-1 ring-violet-200 dark:bg-slate-800 dark:ring-violet-800" data-testid="calibration-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-lg font-semibold">Kiểm tra nhận diện theo nhịp</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Khuông nhạc chạy theo nhịp ♩={lessonTempo(CHECK_LESSON)} và dừng chờ ở mỗi nốt cho tới khi máy nghe đúng. Hãy đánh
            đúng từng nốt — mọi nốt “sai” hay “thừa” là do máy nghe nhầm.
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Đóng
        </Button>
      </div>

      <div className="mt-3 h-40 rounded-lg bg-white text-slate-900 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700">
        <ScoreView
          lesson={CHECK_LESSON}
          index={index}
          results={results}
          status={state.status === 'finished' ? 'finished' : 'waiting'}
          wrongPulse={state.wrongCount}
          showNames
          labelStyle={labelStyle}
        />
      </div>

      {state.status === 'finished' ? (
        <CheckSummaryView state={state} labelStyle={labelStyle} onRestart={restart} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {state.status === 'idle' ? (
              <Button variant="primary" onClick={() => void start()} data-testid="calibration-check-start">
                Bắt đầu
              </Button>
            ) : (
              <Button onClick={restart}>Bắt đầu lại</Button>
            )}
            <BeatIndicator state={state} beat={clock.beat} />
            <div className="min-h-7 font-semibold" role="status" data-testid="calibration-check-status">
              {state.status === 'idle' && <span className="text-slate-500 dark:text-slate-400">Bấm “Bắt đầu”, đếm 4 phách rồi đánh.</span>}
              {state.status === 'countIn' && <span className="text-amber-700 dark:text-amber-300">Chuẩn bị…</span>}
              {state.status === 'running' && expected !== null && (
                <span className={clock.waiting ? 'text-violet-700 dark:text-violet-300' : 'text-emerald-700 dark:text-emerald-300'}>
                  {clock.waiting ? `Đang chờ nốt ${midiToLabel(expected, labelStyle)}…` : 'Đang chạy'}
                </span>
              )}
            </div>
            <span className="ml-auto text-sm text-slate-500 tabular-nums dark:text-slate-400">
              {Math.min(state.index, NOTES.length)}/{NOTES.length}
            </span>
          </div>
          <HeardLog heard={heard} labelStyle={labelStyle} />
          <div className="mt-3 h-24">
            <PianoKeyboard
              from={KEYBOARD_FROM}
              to={KEYBOARD_TO}
              expected={expected}
              detected={live?.midi ?? null}
              flash={null}
              labelStyle={labelStyle}
              onPress={() => undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Các chấm phách trong ô nhịp; lúc đếm vào hiện số phách còn lại. */
function BeatIndicator({ state, beat }: { state: CheckState; beat: number }) {
  if (state.status === 'idle') return null;
  const inMeasure = ((beat % BEATS_PER_MEASURE) + BEATS_PER_MEASURE) % BEATS_PER_MEASURE;
  return (
    <div className="flex items-center gap-2" aria-hidden data-testid="beat-indicator">
      {state.status === 'countIn' && <span className="w-6 text-center text-2xl font-bold tabular-nums">{-beat}</span>}
      {Array.from({ length: BEATS_PER_MEASURE }, (_, i) => (
        <span
          key={i}
          className={`h-4 w-4 rounded-full transition-colors ${
            i === inMeasure ? (i === 0 ? 'bg-fuchsia-500' : 'bg-violet-500') : 'bg-slate-200 dark:bg-slate-700'
          }`}
        />
      ))}
    </div>
  );
}

function HeardLog({ heard, labelStyle }: { heard: HeardEvent[]; labelStyle: NoteLabelStyle }) {
  return (
    <div className="mt-3 flex min-h-10 flex-wrap items-center gap-2" data-testid="calibration-check-heard">
      <span className="text-sm text-slate-500 dark:text-slate-400">Máy nghe thấy:</span>
      {heard.length === 0 && <span className="text-sm text-slate-400">—</span>}
      {heard.map((h) => (
        <span key={h.id} className={`rounded-lg px-2.5 py-1 font-bold ${OUTCOME_STYLE[h.outcome].cls}`}>
          {midiToLabel(h.midi, labelStyle)} <span className="text-xs font-medium">{OUTCOME_STYLE[h.outcome].label}</span>
        </span>
      ))}
    </div>
  );
}

function CheckSummaryView({ state, labelStyle, onRestart }: { state: CheckState; labelStyle: NoteLabelStyle; onRestart: () => void }) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const summary = summarizeCheck(NOTES, state.results);
  const problems = state.results
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.wrong.length > 0 || r.extra > 0);
  const nextOnset = Math.min(2.5, Math.round((settings.onsetRatio + 0.15) * 100) / 100);
  const nextStable = Math.min(300, settings.stableMs + 30);

  return (
    <div className="mt-3" data-testid="calibration-check-summary">
      <p className="text-2xl font-bold">
        Máy nghe đúng ngay {summary.clean}/{summary.total} nốt
      </p>
      <p className="text-slate-600 tabular-nums dark:text-slate-300">
        Nghe sai nốt: {summary.wrongEvents} · sai quãng tám: {summary.octaveEvents} · nghe thừa: {summary.extraEvents}
      </p>
      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {problems.map(({ r, i }) => (
            <li key={i}>
              Nốt {i + 1} ({midiToLabel(NOTES[i].midi, labelStyle)}):{' '}
              {[
                r.wrong.length > 0 && `nghe thành ${r.wrong.map((m) => midiToLabel(m, labelStyle)).join(', ')}`,
                r.extra > 0 && `nghe thừa ${r.extra} lần sau khi đánh`,
              ]
                .filter(Boolean)
                .join('; ')}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        {summary.advice.length === 0 && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Máy nghe đúng tất cả các nốt — có thể bắt đầu học.
          </p>
        )}
        {summary.advice.includes('extra-notes') && (
          <Advice text="Âm ngân của nốt vừa đánh bị tính là đánh lại (Wait Mode có thể nhảy nốt).">
            {settings.onsetRatio < 2.5 && (
              <Button onClick={() => update({ onsetRatio: nextOnset })}>
                Tăng ngưỡng đánh lại ×{settings.onsetRatio.toFixed(2)} → ×{nextOnset.toFixed(2)}
              </Button>
            )}
          </Advice>
        )}
        {summary.advice.includes('octave-errors') && (
          <Advice text="Máy nghe nhầm quãng tám (thường gặp ở nốt trầm hoặc khi micro xa đàn).">
            {!settings.octaveTolerant && <Button onClick={() => update({ octaveTolerant: true })}>Bật chấp nhận sai quãng tám</Button>}
          </Advice>
        )}
        {summary.advice.includes('wrong-notes') && (
          <Advice text="Máy nghe thành nốt khác. Nếu bạn chắc đã đánh đúng, hãy tăng thời gian giữ ổn định hoặc căn chỉnh lại ở nơi yên tĩnh hơn.">
            {settings.stableMs < 300 && (
              <Button onClick={() => update({ stableMs: nextStable })}>
                Tăng thời gian ổn định {settings.stableMs} → {nextStable} ms
              </Button>
            )}
          </Advice>
        )}
      </div>

      <div className="mt-4">
        <Button variant="primary" onClick={onRestart}>
          Kiểm tra lại
        </Button>
      </div>
    </div>
  );
}

function Advice({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <span className="flex-1">{text}</span>
      {children}
    </div>
  );
}
