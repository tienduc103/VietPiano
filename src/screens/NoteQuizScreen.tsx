import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundOutput } from '../core/audio/SoundOutput';
import {
  CHOICE_COUNTS,
  CLEF_CHOICES,
  DEFAULT_QUIZ_SETTINGS,
  effectiveChoices,
  MODE_LABEL,
  QUESTION_COUNTS,
  QUIZ_MODES,
  quizRecordKey,
  sanitizeQuizSettings,
  type ClefChoice,
  type NoteQuizSettings,
} from '../core/noteQuiz/config';
import { NoteQuizRound, summarizeQuiz, type QuizSummary } from '../core/noteQuiz/NoteQuizRound';
import { itemKeys, makeRound, similarQuestion, type QuizOption, type QuizQuestion } from '../core/noteQuiz/questions';
import { SIMILAR_TEXT } from '../core/noteQuiz/hints';
import { CLEF_LABEL, clefRange, DURATION_BEATS, DURATION_LOOK, DURATION_NAME, LETTERS, positionText, QUIZ_DURATIONS, SOLFEGE_NAME, staffStep } from '../core/noteQuiz/staff';
import { loadQuizData, saveQuizData, withRoundResult, type NoteQuizProfileData } from '../core/noteQuiz/storage';
import { emptyStats, practiceFor, preferFor, recordQuestion, supportFor, weakItems, weightFor, type QuizStats, type WeakItem } from '../core/noteQuiz/tracker';
import { endText, praiseText, questionText, QUIZ_SAY, quizCue } from '../core/noteQuiz/voice';
import { midiToName } from '../core/music/notes';
import { voiceTeacher } from '../core/voice/teacher';
import { TeacherAvatar, type TeacherMood } from '../components/noteQuiz/TeacherAvatar';
import { useQuizTiles } from '../components/noteQuiz/useQuizTiles';
import { HintStaff, NoteSample } from '../components/noteQuiz/HintVisuals';
import { Stars, useGameState } from '../components/games/shared';
import { PinShortcutButton } from '../components/shortcuts/PinShortcutButton';
import { Button, FullscreenButton, Icon, Segmented, Toggle } from '../components/ui';
import { useVoiceScope, useVoiceState } from '../hooks/useVoiceTeacher';
import { useApp } from '../store/appStore';
import { useCurriculum } from '../store/curriculumStore';
import { usePlayingNow } from '../store/playingStore';
import { useSettings } from '../store/settingsStore';

const CLEF_CHOICE_LABEL: Record<ClefChoice, string> = { ...CLEF_LABEL, mixed: 'Hỗn hợp' };
/** Thời gian chờ thêm sau khi cô khen xong rồi mới sang câu sau (bé kịp nhìn tên nốt + giải thích). */
const NEXT_AFTER_PRAISE_MS = 1200;

/** Tiếng đàn của nốt đúng: dài theo trường độ (nhịp 120) để bé nghe được nốt tròn ngân dài, móc đôi ngắn. */
const toneSeconds = (o: QuizOption) => Math.max(0.3, DURATION_BEATS[o.duration] * 0.5);

/** Tên + giải thích hiện SAU khi bé trả lời đúng. */
function optionName(q: QuizQuestion, o: QuizOption): string {
  if (q.mode === 'pitch') return SOLFEGE_NAME[o.letter];
  if (q.mode === 'duration') return DURATION_NAME[o.duration];
  return `${SOLFEGE_NAME[o.letter]} ${DURATION_NAME[o.duration]}`;
}
function explanation(q: QuizQuestion): string {
  const o = q.options[q.answer];
  const parts: string[] = [];
  if (q.letter) parts.push(`Nốt ${SOLFEGE_NAME[o.letter]} (${CLEF_LABEL[q.clef]}) ${positionText(o.midi, q.clef)}.`);
  if (q.duration) parts.push(`Nốt ${DURATION_NAME[o.duration]}: ${DURATION_LOOK[o.duration]}, ngân ${DURATION_BEATS[o.duration] >= 1 ? `${DURATION_BEATS[o.duration]} phách` : DURATION_BEATS[o.duration] === 0.5 ? 'nửa phách' : '¼ phách'}.`);
  return parts.join(' ');
}

/**
 * "Đố bé nốt gì?" (bé từ 4 tuổi): cô giáo hoạt hình hỏi bằng giọng nói + chữ, đáp án là HÌNH nốt trên khuông
 * (khoá + nốt, không chữ) — bé chạm ô đúng. Cao độ / Trường độ / Kết hợp; khoá Sol, Fa, Đô Alto, Đô Tenor, Hỗn hợp.
 * Một màn duy nhất: lớp phủ Sẵn sàng + bảng ⚙ Cài đặt mở trên màn chơi (đổi cài đặt → lượt mới). Không giới hạn thời gian.
 * Tiến độ, kỷ lục, thống kê lỗi theo hồ sơ (`core/noteQuiz/storage`). Xem docs/note-quiz.md.
 */
export function NoteQuizScreen() {
  const navigate = useApp((s) => s.navigate);
  const profileKey = useCurriculum((s) => s.profileKey);
  const [data, setDataState] = useState<NoteQuizProfileData>(() => loadQuizData(profileKey));
  const dataRef = useRef(data);
  const profileRef = useRef(profileKey);
  const setData = useCallback((fn: (d: NoteQuizProfileData) => NoteQuizProfileData) => {
    const next = fn(dataRef.current);
    dataRef.current = next;
    setDataState(next);
    saveQuizData(profileRef.current, next);
  }, []);
  useEffect(() => {
    if (profileRef.current === profileKey) return;
    profileRef.current = profileKey;
    const d = loadQuizData(profileKey);
    dataRef.current = d;
    setDataState(d);
  }, [profileKey]);
  const settings = data.settings;
  const voiceOff = useSettings((s) => s.settings.voiceTeacher === 'off' || s.settings.voiceMuted);
  useVoiceScope();

  const [run, setRun] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  // Bài luyện riêng phần bé hay nhầm (cấu hình tạm, không lưu). Đổi cài đặt → bỏ.
  const [practice, setPractice] = useState<{ settings: NoteQuizSettings; label: string } | null>(null);
  const active = practice?.settings ?? settings;
  const round = useMemo(
    () =>
      new NoteQuizRound(makeRound(active, Math.random, weightFor(dataRef.current.stats)), active, {
        // Mức hỗ trợ / phần ưu tiên gợi ý đọc thống kê MỚI NHẤT (cập nhật sau mỗi câu).
        support: (q) => supportFor(dataRef.current.stats, itemKeys(q)),
        prefer: (q) => preferFor(dataRef.current.stats, itemKeys(q)),
        makeSimilar: (q) => similarQuestion(q, active, Math.random),
      }),
    // Lượt mới khi đổi cài đặt / Chơi lại / luyện riêng.
    [active, run],
  );
  const state = useGameState(round);
  const q = state.question;
  const tiles = useQuizTiles(q?.clef ?? null, q?.options ?? null);
  const speaking = useVoiceState().speaking;
  usePlayingNow((state.status === 'asking' || state.status === 'answered') && !panelOpen);

  const update = (patch: Partial<NoteQuizSettings>) => {
    voiceTeacher.cancelAll();
    setPractice(null);
    setData((d) => ({ ...d, settings: sanitizeQuizSettings({ ...d.settings, ...patch }) }));
  };
  const say = (kind: 'question' | 'feedback' | 'end', text: string) => voiceTeacher.say(quizCue(kind, text));
  const readQuestion = () => {
    if (!q) return;
    voiceTeacher.unlock();
    voiceTeacher.interrupt();
    say('question', questionText(q));
  };

  // Câu mới → cô đọc câu hỏi (nếu bật "Cô tự đọc").
  const askKey = state.status === 'asking' ? `${run}:${state.index}` : null;
  useEffect(() => {
    if (askKey && q && active.autoRead && !panelOpen) say('question', questionText(q));
  }, [askKey]);

  // Trả lời đúng → sang câu sau khi cô khen xong (tiếng đàn → lời khen → chờ thêm chút). Bảng cài đặt mở → không tự sang.
  useEffect(() => {
    if (state.status !== 'answered' || panelOpen) return;
    const start = performance.now();
    let quietSince: number | null = null;
    const id = window.setInterval(() => {
      const now = performance.now();
      const busy = now < soundOutput.isPlayingUntil + 300 || voiceTeacher.getState().speaking;
      quietSince = busy ? null : (quietSince ?? now);
      if ((now - start > 1500 && quietSince !== null && now - quietSince >= NEXT_AFTER_PRAISE_MS) || now - start > 12000) {
        window.clearInterval(id);
        round.next();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [state.status, state.index, round, panelOpen]);

  // Hết lượt → lưu kết quả + cô chúc mừng (một lần mỗi lượt).
  const [summary, setSummary] = useState<QuizSummary | null>(null);
  useEffect(() => setSummary(null), [round]);
  useEffect(() => {
    if (state.status !== 'finished') return;
    const s = summarizeQuiz(state);
    setSummary(s);
    // Bài luyện riêng không tính vào kỷ lục của cấu hình chính.
    const key = practice ? `practice:${quizRecordKey(active)}` : quizRecordKey(settings);
    setData((d) => withRoundResult(d, { at: Date.now(), key, total: s.total, firstTry: s.firstTry, score: s.score, stars: s.stars, helped: s.helped, revealed: s.revealed }));
    say('end', endText(s.stars));
  }, [state.status, round]);

  const choose = (i: number) => {
    if (!q || panelOpen) return;
    soundOutput.unlock();
    voiceTeacher.unlock();
    // Đã trả lời: chạm lại ô đúng → nghe lại tiếng nốt.
    if (state.status === 'answered' && i === q.answer) {
      soundOutput.playNote(q.options[i].midi, toneSeconds(q.options[i]));
      return;
    }
    const outcome = round.answer(i, performance.now());
    if (outcome === 'correct') {
      soundOutput.playNote(q.options[i].midi, toneSeconds(q.options[i]));
      const result = round.getState().results[round.getState().results.length - 1];
      // Cô đã phải chỉ đáp án → làm thêm một câu tương tự.
      say('feedback', result.revealed && !result.followUp ? `${praiseText(q)} ${SIMILAR_TEXT}` : praiseText(q));
      setData((d) => ({ ...d, stats: recordQuestion(d.stats, q, result) }));
    } else if (outcome === 'wrong') {
      const hint = round.getState().hint;
      // Gợi ý luôn hiện chữ; đọc thành tiếng theo cài đặt.
      if (hint && active.hintVoice) say('feedback', hint.text);
    }
  };

  const start = () => {
    soundOutput.unlock();
    voiceTeacher.unlock();
    round.start();
  };
  const restart = () => {
    voiceTeacher.cancelAll();
    setSummary(null);
    setRun((r) => r + 1);
  };
  // Bài luyện riêng phần bé hay nhầm (từ tổng kết / bảng cài đặt).
  const startPractice = (w: WeakItem) => {
    voiceTeacher.cancelAll();
    setSummary(null);
    setPanelOpen(false);
    setPractice({ settings: practiceFor(w, settings), label: w.label });
    setRun((r) => r + 1);
  };
  const openSettings = () => {
    voiceTeacher.interrupt();
    setPanelOpen(true);
  };

  const answered = state.status === 'answered';
  const mood: TeacherMood = answered ? 'happy' : state.last && !state.last.correct ? 'encourage' : 'idle';
  const n = q?.options.length ?? effectiveChoices(settings);
  const cols = n === 2 ? 2 : n === 3 ? 3 : n === 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const bubble = state.status === 'ready' ? QUIZ_SAY.welcome : state.status === 'finished' ? (summary ? endText(summary.stars) : '') : q ? (answered ? praiseText(q) : questionText(q)) : '';
  const weak = useMemo(() => weakItems(data.stats), [data.stats]);
  const record = data.records[quizRecordKey(settings)];

  return (
    <div
      className="relative flex h-full flex-col gap-2 overflow-y-auto px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-4"
      data-testid="note-quiz"
      data-status={state.status}
      data-index={state.index}
      data-answer={q?.answer ?? ''}
      data-mode={q?.mode ?? settings.mode}
      data-clef={q?.clef ?? ''}
      data-hinted={state.hinted}
      data-hint-level={state.hint?.level ?? 0}
      data-practice={practice ? 'true' : 'false'}
    >
      <header className="flex flex-wrap items-center gap-2 pl-10">
        <Button variant="ghost" className="px-2" aria-label="Về Trò chơi" onClick={() => navigate({ name: 'games' })} data-testid="nq-exit" midiNav="back">
          <Icon name="back" />
        </Button>
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="truncate text-xl font-bold">🎵 Đố bé nốt gì?</h1>
          <p className="truncate text-sm text-slate-500 dark:text-slate-400" data-testid="nq-subtitle">
            {practice ? `🎯 Luyện riêng: ${practice.label} · ` : ''}
            {MODE_LABEL[active.mode]} · {CLEF_CHOICE_LABEL[active.clef]} · {effectiveChoices(active)} đáp án
          </p>
        </div>
        <div className="flex items-center gap-3 text-lg font-bold tabular-nums">
          <span data-testid="nq-progress">
            Câu {Math.min(state.index + 1, state.total)}/{state.total}
          </span>
          <span data-testid="nq-score">⭐ {state.score}</span>
        </div>
        <Button onClick={openSettings} data-testid="nq-settings" aria-label="Cài đặt">
          ⚙ Cài đặt
        </Button>
        <Button onClick={restart} aria-label="Chơi lại từ đầu" data-testid="nq-restart">
          <Icon name="restart" />
        </Button>
        <FullscreenButton />
      </header>

      {/* Cô giáo + câu hỏi (phía trên) */}
      <section className="flex shrink-0 flex-wrap items-center gap-2 rounded-3xl bg-white/90 p-2 sm:flex-nowrap sm:gap-3 shadow-sm ring-1 ring-pink-100 sm:p-3 dark:bg-slate-800/90 dark:ring-slate-700">
        <TeacherAvatar mood={mood} talking={speaking} className="h-16 w-auto shrink-0 sm:h-28" />
        <div className="relative order-last min-w-0 basis-full rounded-2xl bg-pink-50 px-3 py-2 sm:order-none sm:basis-0 sm:flex-1 sm:px-4 dark:bg-slate-700/70" aria-live="polite">
          <p className="text-xl leading-snug font-extrabold text-violet-800 sm:text-3xl dark:text-violet-200" data-testid="nq-question">
            {bubble}
          </p>
          {answered && q && (
            <p className="mt-1 text-sm text-slate-600 sm:text-base dark:text-slate-300" data-testid="nq-explain">
              {explanation(q)}
            </p>
          )}
          {state.hint && !answered && (
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-3 py-2 ring-2 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-800" data-testid="nq-hint" data-level={state.hint.level} data-cause={state.hint.cause}>
              <p className="min-w-0 flex-1 basis-56 text-sm font-semibold text-amber-900 sm:text-lg dark:text-amber-100">💡 {state.hint.text}</p>
              {active.hintVisual && state.hint.staff && <HintStaff clef={state.hint.staff.clef} step={state.hint.staff.step} />}
              {active.hintVisual && state.hint.sample && <NoteSample duration={state.hint.sample} />}
            </div>
          )}
          {voiceOff && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Giọng cô đang tắt (Cài đặt → Cô giáo) — chỉ hiện chữ.</p>}
        </div>
        <button
          type="button"
          onClick={readQuestion}
          disabled={!q || state.status === 'ready' || state.status === 'finished'}
          className="ml-auto grid h-16 w-16 shrink-0 place-items-center sm:ml-0 rounded-full bg-sky-500 text-3xl text-white shadow-lg shadow-sky-500/40 transition-transform active:scale-95 disabled:opacity-40 sm:h-20 sm:w-20"
          aria-label="Nghe lại câu hỏi"
          title="Nghe lại câu hỏi"
          data-testid="nq-replay"
        >
          <span className={speaking ? 'animate-pulse' : ''}>🔊</span>
        </button>
      </section>

      {/* Ô đáp án hình ảnh (phía dưới) */}
      <div
        className="grid min-h-[45vh] flex-1 gap-2 sm:min-h-0 sm:gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        data-testid="nq-options"
        data-count={n}
      >
        {q &&
          q.options.map((o, i) => {
            const wrong = state.wrongIndexes.includes(i);
            const isAnswer = i === q.answer;
            const glow = answered && isAnswer;
            const hint = state.hinted && isAnswer && !answered;
            const removed = !answered && !!state.hint?.eliminated.includes(i);
            const shake = state.last && !state.last.correct && state.last.index === i;
            const tile = tiles?.[i];
            return (
              <button
                key={`${run}:${state.index}:${i}:${shake ? state.last!.at : 0}`}
                type="button"
                onClick={() => choose(i)}
                disabled={(state.status !== 'asking' && !glow) || removed}
                aria-label={`Ô ${i + 1}`}
                data-testid="nq-option"
                data-index={i}
                data-midi={o.midi}
                data-duration={o.duration}
                data-step={staffStep(o.midi, q.clef)}
                data-vex-line={tile?.line ?? ''}
                data-state={glow ? 'correct' : wrong ? 'wrong' : removed ? 'removed' : hint ? 'reveal' : 'idle'}
                className={`relative flex min-h-24 min-w-0 flex-col items-stretch justify-center overflow-hidden rounded-3xl bg-white p-2 text-slate-900 shadow-md ring-4 transition dark:bg-slate-100 ${
                  glow
                    ? 'bg-emerald-50 shadow-[0_0_32px_rgb(16_185_129/0.7)] ring-emerald-400'
                    : hint
                      ? 'animate-pulse ring-amber-400'
                      : wrong
                        ? 'opacity-45 ring-rose-200'
                        : removed
                          ? 'scale-95 opacity-15 grayscale ring-slate-200'
                        : 'ring-violet-100 hover:ring-violet-300 active:scale-[0.98]'
                } ${shake ? 'animate-shake' : ''}`}
              >
                {tile ? (
                  <span className="pointer-events-none block min-h-0 flex-1 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: tile.svg }} />
                ) : (
                  <span className="grid flex-1 place-items-center text-slate-300" aria-hidden>
                    …
                  </span>
                )}
                {glow && (
                  <span className="pointer-events-none mx-auto mt-1 rounded-full bg-emerald-500 px-3 py-0.5 text-lg font-extrabold text-white" data-testid="nq-answer-name">
                    ✓ {optionName(q, o)}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      <div className="flex items-center justify-center gap-1.5" aria-hidden data-testid="nq-dots">
        {round.questions.map((_, i) => {
          const r = state.results[i];
          return <span key={i} className={`h-3 w-3 rounded-full ${round.isFollowUp(i) ? 'ring-2 ring-sky-400' : ''} ${r ? (r.wrong === 0 ? 'bg-emerald-500' : 'bg-amber-400') : i === state.index ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-600'}`} />;
        })}
        {answered && (
          <Button variant="primary" className="ml-3" onClick={() => round.next()} data-testid="nq-next" midiNav="forward">
            Câu tiếp ▶
          </Button>
        )}
      </div>

      {state.status === 'ready' && !panelOpen && (
        <Overlay testId="nq-ready">
          <p className="text-2xl font-extrabold">Sẵn sàng chưa? 🎵</p>
          <p className="text-sm opacity-80">
            {MODE_LABEL[settings.mode]} · {CLEF_CHOICE_LABEL[settings.clef]} · {effectiveChoices(settings)} đáp án · {settings.questions} câu · không giới hạn thời gian
          </p>
          {record && (
            <p className="text-sm opacity-80">
              {'★'.repeat(record.bestStars)}
              {'☆'.repeat(3 - record.bestStars)} · kỷ lục {record.bestScore} điểm · đã chơi {record.plays} lượt
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" className="min-h-16 px-8 text-xl" onClick={start} data-testid="nq-go" midiNav="forward">
              <Icon name="play" /> Bắt đầu
            </Button>
            <Button className="min-h-16" onClick={openSettings} data-testid="nq-ready-settings">
              ⚙ Cài đặt
            </Button>
          </div>
        </Overlay>
      )}

      {state.status === 'finished' && summary && !panelOpen && (
        <div className="absolute inset-0 z-10 grid place-items-center overflow-y-auto bg-slate-900/40 p-3" data-testid="nq-result" data-stars={summary.stars}>
          <section className="grid w-full max-w-xl gap-3 rounded-3xl bg-white p-5 text-center text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100">
            <Stars stars={summary.stars} className="text-6xl" />
            <h2 className="text-2xl font-extrabold">{endText(summary.stars)}</h2>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Đúng ngay" value={`${summary.firstTry}/${summary.total}`} />
              <Stat label="Điểm" value={`${summary.score}`} />
              <Stat label="Kỷ lục" value={`${Math.max(summary.score, record?.bestScore ?? 0)}`} />
            </dl>
            <WeakList items={weak} onPractice={startPractice} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" className="min-h-14 text-lg" onClick={restart} data-testid="nq-again" midiNav="forward">
                <Icon name="restart" /> Chơi lại
              </Button>
              {practice && (
                <Button
                  className="min-h-14"
                  onClick={() => {
                    setPractice(null);
                    setSummary(null);
                    setRun((r) => r + 1);
                  }}
                  data-testid="nq-practice-exit"
                >
                  Về lượt chơi chính
                </Button>
              )}
              <Button className="min-h-14" onClick={openSettings} data-testid="nq-result-settings">
                ⚙ Cài đặt
              </Button>
              <Button variant="ghost" className="min-h-14" onClick={() => navigate({ name: 'games' })}>
                Về Trò chơi
              </Button>
            </div>
          </section>
        </div>
      )}

      {panelOpen && (
        <SettingsPanel
          settings={settings}
          weak={weak}
          totals={data.stats.totals}
          onPractice={startPractice}
          update={update}
          onResetStats={() => setData((d) => ({ ...d, stats: emptyStats() }))}
          onClose={() => {
            setPanelOpen(false);
            // Đang giữa câu → đọc lại câu hỏi cho bé.
            if (round.getState().status === 'asking' && active.autoRead) readQuestion();
          }}
        />
      )}
    </div>
  );
}

function Overlay({ testId, children }: { testId: string; children: React.ReactNode }) {
  return (
    // Không che đầu trang (nút ← / ⚙ vẫn bấm được).
    <div className="pointer-events-none absolute inset-x-0 top-28 bottom-0 z-10 grid place-items-center p-4" data-testid={testId}>
      <div className="pointer-events-auto grid justify-items-center gap-3 rounded-3xl bg-white/95 px-6 py-5 text-center text-slate-900 shadow-lg ring-2 ring-pink-300 dark:bg-slate-900/95 dark:text-slate-100">
        <TeacherAvatar mood="happy" talking={false} className="h-28 w-auto" />
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-pink-50 px-2 py-2 ring-1 ring-pink-100 dark:bg-slate-700/60 dark:ring-slate-600">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** Cho phụ huynh: phần bé còn hay nhầm (theo dõi qua nhiều lượt). */
function WeakList({ items, totals, onPractice }: { items: WeakItem[]; totals?: QuizStats['totals']; onPractice?: (w: WeakItem) => void }) {
  if (items.length === 0 && !totals?.attempts) return null;
  return (
    <div className="rounded-2xl bg-amber-50 px-3 py-2 text-left text-sm dark:bg-amber-950/40" data-testid="nq-weak">
      <p className="font-semibold">{items.length > 0 ? 'Cô theo dõi — bé còn hay nhầm:' : 'Cô theo dõi'}</p>
      <ul className="list-disc pl-5">
        {items.map((w) => (
          <li key={w.key} className="py-0.5">
            {w.label}: nhầm {w.missed}/{w.asked} lần{w.confusedWith ? ` (hay chọn ${w.confusedWith.split(' · ')[0]})` : ''}
            {onPractice && (
              <button type="button" onClick={() => onPractice(w)} className="ml-2 min-h-10 rounded-xl bg-violet-600 px-3 text-xs font-bold text-white" data-testid="nq-practice">
                🎯 Luyện riêng
              </button>
            )}
          </li>
        ))}
      </ul>
      {items.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">Các lượt sau cô hỏi lại những phần này nhiều hơn và gợi ý đơn giản hơn; khi bé đúng ổn định, cô giảm dần gợi ý.</p>}
      {totals && totals.attempts > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="nq-totals">
          Tổng: {totals.attempts} lần chạm · sai cao độ {totals.pitchErrors} · sai trường độ {totals.durationErrors} · cần gợi ý {totals.helped} câu · cô chỉ đáp án {totals.revealed} câu
        </p>
      )}
    </div>
  );
}

function Chip({ on, onClick, testId, children }: { on: boolean; onClick: () => void; testId: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      className={`min-h-12 min-w-14 rounded-2xl px-3 font-bold ring-2 transition ${on ? 'bg-violet-600 text-white ring-violet-300' : 'bg-white text-slate-500 ring-slate-200 dark:bg-slate-800 dark:ring-slate-600'}`}
    >
      {children}
    </button>
  );
}

/** Bảng cài đặt cho phụ huynh / giáo viên, mở trên màn chơi. Đổi bất kỳ mục nào → lượt mới. */
function SettingsPanel({
  settings,
  weak,
  totals,
  onPractice,
  update,
  onResetStats,
  onClose,
}: {
  settings: NoteQuizSettings;
  weak: WeakItem[];
  totals: QuizStats['totals'];
  onPractice: (w: WeakItem) => void;
  update: (p: Partial<NoteQuizSettings>) => void;
  onResetStats: () => void;
  onClose: () => void;
}) {
  const toggleLetter = (l: (typeof LETTERS)[number]) => {
    const on = settings.letters.includes(l);
    if (on && settings.letters.length === 1) return;
    update({ letters: on ? settings.letters.filter((x) => x !== l) : LETTERS.filter((x) => x === l || settings.letters.includes(x)) });
  };
  const toggleDuration = (d: (typeof QUIZ_DURATIONS)[number]) => {
    const on = settings.durations.includes(d);
    if (on && settings.durations.length === 1) return;
    update({ durations: on ? settings.durations.filter((x) => x !== d) : QUIZ_DURATIONS.filter((x) => x === d || settings.durations.includes(x)) });
  };
  const rangeText = (clef: Exclude<ClefChoice, 'mixed'>) => {
    const r = clefRange(clef, settings.octaves);
    const name = (m: number) => `${SOLFEGE_NAME[midiToName(m)[0] as (typeof LETTERS)[number]]}${midiToName(m).slice(1)}`;
    return `${CLEF_LABEL[clef]}: ${name(r.from)} – ${name(r.to)}`;
  };
  return (
    <div className="absolute inset-0 z-20 overflow-y-auto bg-slate-900/40 p-3" data-testid="nq-settings-panel" onClick={onClose}>
      <section className="mx-auto grid max-w-4xl gap-4 rounded-3xl bg-white p-5 text-slate-900 shadow-xl dark:bg-slate-800 dark:text-slate-100" onClick={(e) => e.stopPropagation()} aria-label="Cài đặt Đố bé nốt gì">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="flex-1 text-2xl font-bold">⚙ Cài đặt (phụ huynh / giáo viên)</h2>
          <Button onClick={() => update({ ...DEFAULT_QUIZ_SETTINGS })} data-testid="nq-defaults">
            Mặc định bé 4 tuổi
          </Button>
          <Button variant="primary" onClick={onClose} data-testid="nq-settings-done">
            ✓ Xong
          </Button>
        </header>
        <PinShortcutButton variant="row" target={{ type: 'game', id: 'note-quiz' }} />
        <p className="text-sm text-slate-500 dark:text-slate-400">Đổi bất kỳ mục nào → bắt đầu lượt mới. Không giới hạn thời gian trả lời.</p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid content-start gap-2">
            <h3 className="text-lg font-bold">Chế độ</h3>
            <Segmented value={settings.mode} onChange={(mode) => update({ mode })} options={QUIZ_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {settings.mode === 'pitch'
                ? 'Mọi ô cùng trường độ — bé chỉ phân biệt cao độ ("đâu là nốt Đô?").'
                : settings.mode === 'duration'
                  ? 'Mọi ô cùng cao độ — bé phân biệt hình trường độ ("tìm nốt Tròn").'
                  : 'Cả tên nốt lẫn trường độ ("đâu là nốt Đô Tròn?").'}
            </p>
            <h3 className="text-lg font-bold">Khoá nhạc</h3>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Khoá nhạc">
              {CLEF_CHOICES.map((c) => (
                <Chip key={c} on={settings.clef === c} onClick={() => update({ clef: c })} testId={`nq-clef-${c}`}>
                  {CLEF_CHOICE_LABEL[c]}
                </Chip>
              ))}
            </div>
            <h3 className="text-lg font-bold">Số đáp án</h3>
            <Segmented value={String(settings.choices)} onChange={(v) => update({ choices: Number(v) as NoteQuizSettings['choices'] })} options={CHOICE_COUNTS.map((c) => ({ value: String(c), label: `${c}` }))} />
            {settings.mode === 'duration' && settings.choices === 6 && <p className="text-sm text-amber-700 dark:text-amber-300">Chế độ Trường độ chỉ có 5 hình trường độ → dùng 5 ô.</p>}
            <h3 className="text-lg font-bold">Số câu mỗi lượt</h3>
            <Segmented value={String(settings.questions)} onChange={(v) => update({ questions: Number(v) })} options={QUESTION_COUNTS.map((c) => ({ value: String(c), label: `${c}` }))} />
          </div>
          <div className="grid content-start gap-2">
            <h3 className="text-lg font-bold">Nốt cần học</h3>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Nốt cần học">
              {LETTERS.map((l) => (
                <Chip key={l} on={settings.letters.includes(l)} onClick={() => toggleLetter(l)} testId={`nq-letter-${l}`}>
                  {SOLFEGE_NAME[l]}
                </Chip>
              ))}
            </div>
            <h3 className="text-lg font-bold">Phạm vi nốt</h3>
            <Segmented value={String(settings.octaves)} onChange={(v) => update({ octaves: v === '2' ? 2 : 1 })} options={[{ value: '1', label: 'Một quãng tám' }, { value: '2', label: 'Hai quãng tám' }]} />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {(settings.clef === 'mixed' ? (['treble', 'bass', 'alto', 'tenor'] as const) : [settings.clef]).map(rangeText).join(' · ')}
            </p>
            <h3 className="text-lg font-bold">Trường độ cần học</h3>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Trường độ cần học">
              {QUIZ_DURATIONS.map((d) => (
                <Chip key={d} on={settings.durations.includes(d)} onClick={() => toggleDuration(d)} testId={`nq-duration-${d}`}>
                  {DURATION_NAME[d]}
                </Chip>
              ))}
            </div>
            <div className="grid gap-1 rounded-2xl bg-violet-50 px-3 py-1 dark:bg-slate-700/60">
              <Toggle checked={settings.smartHints} onChange={(smartHints) => update({ smartHints })} label="Cô giáo gợi ý thông minh" />
              {settings.smartHints && (
                <>
                  <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
                    <span>Gợi ý sau</span>
                    <Segmented value={String(settings.hintAfter)} onChange={(v) => update({ hintAfter: v === '2' ? 2 : 1 })} options={[{ value: '1', label: '1 lần sai' }, { value: '2', label: '2 lần sai' }]} />
                  </div>
                  <Toggle checked={settings.hintVoice} onChange={(hintVoice) => update({ hintVoice })} label="Đọc gợi ý bằng giọng cô giáo" />
                  <Toggle checked={settings.hintVisual} onChange={(hintVisual) => update({ hintVisual })} label="Hiển thị minh hoạ trực quan" />
                  <Toggle checked={settings.maxSupport} onChange={(maxSupport) => update({ maxSupport })} label="Hỗ trợ tối đa cho bé nhỏ" />
                </>
              )}
              <Toggle checked={settings.autoRead} onChange={(autoRead) => update({ autoRead })} label="Cô giáo tự đọc câu hỏi" />
            </div>
          </div>
        </div>
        <div className="grid gap-2">
          <WeakList items={weak} totals={totals} onPractice={onPractice} />
          {weak.length > 0 && (
            <Button variant="ghost" className="justify-self-start text-sm" onClick={onResetStats} data-testid="nq-reset-stats">
              Xoá theo dõi lỗi của bé này
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
