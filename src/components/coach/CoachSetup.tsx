import { useMemo } from 'react';
import type { AiLinkMonitor } from '../../core/coach/ai/link';
import { useAiLink } from '../../hooks/useCoachAiLink';
import { useApp } from '../../store/appStore';
import { useSettings } from '../../store/settingsStore';
import { ollamaUrlLabel } from '../AiCoachCard';
import { AiLinkChip, AiLinkDetail } from './AiLinkStatus';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../../core/lessons/LessonManager';
import { measureRange } from '../../core/lessons/slice';
import { lessonTempo, type Lesson } from '../../core/lessons/types';
import type { NoteLabelStyle } from '../../core/music/notes';
import type { CoachSettings } from '../../core/coach/settings';
import { COACH_MODE_LABEL, type CoachMode, type PerformanceSession, type PracticePlan, type ScoreReference } from '../../core/coach/types';
import type { ResolvedInput } from '../../core/coach/input';
import { midiInput } from '../../core/input/MIDIInputProvider';
import { toggleMicrophone, useMic } from '../../store/micStore';
import { useMidi } from '../../store/midiStore';
import { Button, Card, Icon, Segmented, Toggle } from '../ui';
import { CoachScoreView } from './CoachScoreView';

export interface InterruptedItem {
  session: PerformanceSession;
}

const MODE_HINT: Record<CoachMode, string> = {
  technical: 'Chính xác nốt 40 · nhịp 25 · trường độ 15 · pedal 10 · lực đánh 10. Dung sai chặt — cho luyện tập và kiểm tra.',
  performance: 'Nốt 30 · nhịp 30 · trường độ 10 · pedal 10 · lực đánh 20. Ưu tiên liền mạch, ổn định nhịp, tương quan lực đánh; chấp nhận co giãn tempo hợp lý.',
  progress: 'Chấm như kỹ thuật và so với các lần trước của chính bạn: điểm trung bình, tiêu chí tiến bộ, lỗi lặp lại, tempo đạt được.',
};

interface Props {
  lessons: readonly Lesson[];
  baseLesson: Lesson;
  lesson: Lesson;
  reference: ScoreReference;
  cfg: CoachSettings;
  setCfg: (patch: Partial<CoachSettings>) => void;
  section: [number, number] | null;
  setSection: (m: [number, number] | null) => void;
  twoHands: boolean;
  hand: 'both' | 'right' | 'left';
  setHand: (h: 'both' | 'right' | 'left') => void;
  input: ResolvedInput;
  bpm: number;
  pedalSeen: boolean;
  interrupted: InterruptedItem[];
  onRecover: (s: PerformanceSession) => void;
  onDiscard: (s: PerformanceSession) => void;
  plan: { plan: PracticePlan; stepId: string } | null;
  onCancelPlan: () => void;
  busy: boolean;
  onStart: () => void;
  labelStyle: NoteLabelStyle;
  /** Trạng thái kết nối AI cục bộ (dùng chung với màn đang ghi). */
  aiLink: AiLinkMonitor;
}

function Can({ ok, label, why }: { ok: boolean; label: string; why?: string }) {
  return (
    <li className="flex items-start gap-2 text-sm" data-testid={`coach-can-${label}`} data-ok={ok}>
      <span aria-hidden className={`mt-0.5 font-bold ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
        {ok ? '✓' : '—'}
      </span>
      <span>
        <span className="font-semibold">{label}</span>
        {!ok && why ? <span className="text-slate-500 dark:text-slate-400"> · {why}</span> : null}
      </span>
    </li>
  );
}

export function CoachSetup(p: Props) {
  // Mỗi trường một selector (zustand v5: selector trả về object mới mỗi lần → vòng lặp render).
  const midi = { status: useMidi((s) => s.status), devices: useMidi((s) => s.devices), error: useMidi((s) => s.error) };
  const micStatus = useMic((s) => s.status);
  const range = useMemo(() => measureRange(p.baseLesson), [p.baseLesson]);
  const grouped = useMemo(
    () => CATEGORY_ORDER.map((c) => ({ c, list: p.lessons.filter((l) => l.category === c) })).filter((g) => g.list.length),
    [p.lessons],
  );
  const hasPedalMarks = !!p.baseLesson.pedal?.length && !p.baseLesson.pedalOptional;
  const step = p.plan?.plan.steps.find((s) => s.id === p.plan?.stepId);
  const measureOptions = Array.from({ length: range.last - range.first + 1 }, (_, i) => range.first + i);
  const from = p.section?.[0] ?? range.first;
  const to = p.section?.[1] ?? range.last;
  const caps = p.input.capabilities;
  const supported = midiInput.isSupported();

  return (
    <div className="mt-5 grid grid-cols-1 gap-4" data-testid="coach-setup">
      {p.plan && step && (
        <Card className="ring-2 ring-fuchsia-300 dark:ring-fuchsia-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Kế hoạch luyện: {p.plan.plan.title}</div>
              <div className="font-semibold" data-testid="coach-plan-step">
                Bước {p.plan.plan.steps.indexOf(step) + 1}/{p.plan.plan.steps.length}: {step.title} — {step.measures ? `ô ${step.measures[0]}–${step.measures[1]}` : 'cả bài'}, ♩={step.bpm}
                {step.requiredPasses > 1 ? ` · cần đạt ≥ ${step.passScore} điểm ${step.requiredPasses} lần liên tiếp (đã ${step.passes})` : step.passScore ? ` · cần ≥ ${step.passScore} điểm` : ''}
              </div>
            </div>
            <Button variant="ghost" className="text-sm" onClick={p.onCancelPlan}>
              Thoát kế hoạch
            </Button>
          </div>
        </Card>
      )}

      {p.interrupted.length > 0 && (
        <Card className="ring-2 ring-amber-300 dark:ring-amber-700">
          <h2 className="font-semibold">Có phiên ghi chưa kết thúc</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">App đã tắt / tải lại trong lúc ghi. Log đã được lưu nháp — chấm phần đã ghi hoặc bỏ đi.</p>
          <ul className="mt-2 grid gap-2">
            {p.interrupted.map(({ session: s }) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-2 dark:bg-amber-900/20" data-testid="coach-interrupted">
                <span className="text-sm">
                  {s.lessonTitle} · {new Date(s.startedAt).toLocaleString('vi-VN')} · {s.eventCount} sự kiện
                </span>
                <span className="flex gap-2">
                  <Button className="min-h-10 text-sm" disabled={p.busy} onClick={() => p.onRecover(s)} data-testid="coach-recover">
                    Chấm phần đã ghi
                  </Button>
                  <Button variant="ghost" className="min-h-10 text-sm" disabled={p.busy} onClick={() => p.onDiscard(s)}>
                    Bỏ phiên này
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
          <h2 className="font-semibold">1. Bài nhạc</h2>
          <label className="mt-2 block text-sm">
            <span className="text-slate-500 dark:text-slate-400">Chọn bài</span>
            <select
              className="mt-1 min-h-12 w-full rounded-xl bg-white px-3 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800"
              value={p.baseLesson.id}
              onChange={(e) => {
                p.setCfg({ lastLessonId: e.target.value });
                p.setSection(null);
                p.setHand('both');
              }}
              data-testid="coach-lesson"
            >
              {grouped.map((g) => (
                <optgroup key={g.c} label={CATEGORY_LABELS[g.c]}>
                  {g.list.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap items-end gap-3 text-sm">
            <label>
              <span className="text-slate-500 dark:text-slate-400">Từ ô</span>
              <select className="mt-1 block min-h-12 rounded-xl bg-white px-3 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800" value={from} onChange={(e) => p.setSection([Number(e.target.value), Math.max(Number(e.target.value), to)])} data-testid="coach-from">
                {measureOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'lấy đà' : m}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-slate-500 dark:text-slate-400">Tới ô</span>
              <select className="mt-1 block min-h-12 rounded-xl bg-white px-3 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800" value={to} onChange={(e) => p.setSection([Math.min(from, Number(e.target.value)), Number(e.target.value)])} data-testid="coach-to">
                {measureOptions.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? 'lấy đà' : m}
                  </option>
                ))}
              </select>
            </label>
            {p.section && (
              <Button variant="ghost" className="text-sm" onClick={() => p.setSection(null)}>
                Cả bài
              </Button>
            )}
            {p.twoHands && <Segmented value={p.hand} onChange={p.setHand} options={[{ value: 'both', label: 'Hai tay' }, { value: 'right', label: 'Tay phải' }, { value: 'left', label: 'Tay trái' }]} />}
          </div>
          <div className="mt-3">
            <CoachScoreView lesson={p.lesson} reference={p.reference} result={null} labelStyle={p.labelStyle} height={170} />
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {p.reference.notes.length} nốt cần chấm · {p.lesson.timeSignature.join('/')} · tempo gợi ý ♩={lessonTempo(p.baseLesson)}
            {p.baseLesson.source ? ` · ${p.baseLesson.source}` : ''}
          </p>
        </Card>

        <div className="grid min-w-0 content-start gap-4">
          <Card>
            <h2 className="font-semibold">2. Chế độ chấm</h2>
            <div className="mt-2">
              <Segmented value={p.cfg.mode} onChange={(mode) => p.setCfg({ mode })} options={(['technical', 'performance', 'progress'] as const).map((m) => ({ value: m, label: COACH_MODE_LABEL[m] }))} />
            </div>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="coach-mode-hint">
              {MODE_HINT[p.cfg.mode]}
            </p>
          </Card>

          <Card>
            <h2 className="font-semibold">3. Đàn & tín hiệu</h2>
            <div className="mt-2">
              <Segmented
                value={p.cfg.input}
                onChange={(input) => p.setCfg({ input })}
                options={[
                  { value: 'auto', label: 'Tự động' },
                  { value: 'midi', label: 'Đàn MIDI' },
                  { value: 'virtual', label: 'Phím ảo' },
                  { value: 'microphone', label: 'Micro' },
                ]}
              />
            </div>
            <p className="mt-2 text-sm" data-testid="coach-input">
              Đang dùng: <strong>{p.input.label}</strong>
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {!supported
                ? 'Trình duyệt này không có Web MIDI (Safari / iPad) — dùng bàn phím ảo hoặc micro; MIDI trên iPad cần app native.'
                : midi.status === 'ready'
                  ? midi.devices.length
                    ? `Đàn MIDI: ${midi.devices.map((d) => d.name).join(', ')}`
                    : 'Chưa thấy đàn MIDI — cắm đàn, hoặc bật "Dùng đàn MIDI" ở Cài đặt.'
                  : midi.status === 'idle'
                    ? 'MIDI chưa bật — bật ở Cài đặt → Đàn MIDI.'
                    : (midi.error ?? `MIDI: ${midi.status}`)}
            </p>
            {p.cfg.input === 'microphone' && micStatus !== 'running' && (
              <Button className="mt-2 text-sm" onClick={() => void toggleMicrophone()} data-testid="coach-mic-on">
                <Icon name="mic" className="h-5 w-5" /> Bật micro
              </Button>
            )}
            {p.input.primary === 'midi' && (
              <p className="mt-2 text-sm" data-testid="coach-pedal-check" data-ok={p.pedalSeen}>
                {p.pedalSeen ? '✓ Đã nhận tín hiệu pedal (CC 64).' : '🦶 Đạp thử pedal một lần để kiểm tra đàn có gửi tín hiệu pedal.'}
              </p>
            )}
            <ul className="mt-3 grid gap-1" aria-label="Tiêu chí chấm được với nguồn này">
              <Can ok label="Chính xác nốt" />
              <Can ok label="Nhịp điệu" />
              <Can ok={caps.noteOff} label="Trường độ" why="micro không báo lúc thả phím" />
              <Can ok={caps.pedal && (hasPedalMarks || p.cfg.pedalRule === 'none-expected')} label="Pedal" why={!hasPedalMarks && p.cfg.pedalRule !== 'none-expected' ? 'bài không có ký hiệu pedal' : 'chưa có tín hiệu pedal từ đàn'} />
              <Can ok={caps.velocity || (caps.relativeLevel && (p.baseLesson.dynamics?.length ?? 0) >= 2)} label="Lực đánh" why={caps.relativeLevel ? 'micro chỉ đo được mạnh nhẹ tương đối giữa các đoạn' : 'bàn phím ảo không có lực gõ'} />
            </ul>
            {!hasPedalMarks && (
              <div className="mt-2">
                <Toggle checked={p.cfg.pedalRule === 'none-expected'} onChange={(v) => p.setCfg({ pedalRule: v ? 'none-expected' : 'auto' })} label={<span className="text-sm">Bài này không dùng pedal — chấm cả đạp pedal thừa</span>} />
              </div>
            )}
          </Card>

          <AiCard cfg={p.cfg} setCfg={p.setCfg} aiLink={p.aiLink} />

          <Card>
            <h2 className="font-semibold">4. Tempo</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button className="min-w-12 px-0" aria-label="Chậm hơn" onClick={() => p.setCfg({ tempoPercent: Math.max(40, p.cfg.tempoPercent - 5) })}>
                −
              </Button>
              <span className="min-w-28 text-center text-lg font-bold tabular-nums" data-testid="coach-bpm">
                ♩={p.bpm} <span className="text-sm font-normal text-slate-500">({p.cfg.tempoPercent}%)</span>
              </span>
              <Button className="min-w-12 px-0" aria-label="Nhanh hơn" onClick={() => p.setCfg({ tempoPercent: Math.min(150, p.cfg.tempoPercent + 5) })}>
                +
              </Button>
            </div>
            <div className="mt-2 grid gap-1">
              <Toggle checked={p.cfg.metronome && p.input.primary !== 'microphone'} onChange={(metronome) => p.setCfg({ metronome })} label={<span className="text-sm">Metronome{p.input.primary === 'microphone' ? ' (tắt khi dùng micro — micro nghe nhầm tiếng click)' : ''}</span>} />
              <Toggle checked={p.cfg.countIn} onChange={(countIn) => p.setCfg({ countIn })} label={<span className="text-sm">Đếm vào một ô trước khi chơi</span>} />
            </div>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" className="min-w-56 text-lg" onClick={p.onStart} disabled={p.busy || !p.reference.notes.length} midiNav="forward" data-testid="coach-start">
          <span aria-hidden>●</span> Bắt đầu ghi
        </Button>
        <AiLinkChip monitor={p.aiLink} />
        <span className="text-sm text-slate-500 dark:text-slate-400">Không gọi AI trong lúc chơi — app chỉ ghi lại, chấm sau khi bạn bấm "Kết thúc".</span>
      </div>
    </div>
  );
}

/**
 * Cấu hình AI cục bộ của Coach: địa chỉ / model dùng chung Cài đặt → AI; timeout, số lần thử lại, gửi tên — riêng Coach.
 * Trạng thái kết nối tự kiểm tra khi mở màn + định kỳ (`useCoachAiLink`), nút "Kiểm tra lại" kiểm tra ngay.
 */
function AiCard({ cfg, setCfg, aiLink }: { cfg: CoachSettings; setCfg: (patch: Partial<CoachSettings>) => void; aiLink: AiLinkMonitor }) {
  const { aiCoachEnabled, ollamaUrl, ollamaModel } = useSettings((s) => s.settings);
  const navigate = useApp((s) => s.navigate);
  const link = useAiLink(aiLink);
  const checking = link.state === 'checking' || link.refreshing;
  return (
    <Card>
      <h2 className="font-semibold">5. Nhận xét AI (cục bộ)</h2>
      {aiCoachEnabled ? (
        <p className="mt-1 text-sm">
          Model <strong>{ollamaModel}</strong> · {ollamaUrlLabel(ollamaUrl)}
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">AI đang tắt — vẫn có nhận xét theo quy tắc từ kết quả chấm.</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button className="min-h-10 text-sm" onClick={() => navigate({ name: 'settings' })}>
          Cài đặt AI
        </Button>
        {aiCoachEnabled && (
          <Button className="min-h-10 text-sm" onClick={() => aiLink.refresh()} disabled={checking} data-testid="coach-ai-check">
            {checking ? 'Đang kiểm tra…' : 'Kiểm tra lại'}
          </Button>
        )}
      </div>
      <AiLinkDetail monitor={aiLink} />
      {aiCoachEnabled && (
        <div className="mt-2 grid gap-1 text-sm">
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span>Chờ AI tối đa</span>
            <select className="min-h-10 rounded-lg bg-white px-2 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800" value={cfg.aiTimeoutSec} onChange={(e) => setCfg({ aiTimeoutSec: Number(e.target.value) })} data-testid="coach-ai-timeout">
              {[30, 60, 120, 300].map((v) => (
                <option key={v} value={v}>
                  {v} giây
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-12 items-center justify-between gap-3">
            <span>Thử lại khi lỗi</span>
            <select className="min-h-10 rounded-lg bg-white px-2 ring-1 ring-violet-200 dark:bg-slate-900 dark:ring-violet-800" value={cfg.aiRetries} onChange={(e) => setCfg({ aiRetries: Number(e.target.value) })}>
              {[0, 1, 2, 3].map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? 'không' : `${v} lần`}
                </option>
              ))}
            </select>
          </label>
          <Toggle checked={cfg.aiShareName} onChange={(aiShareName) => setCfg({ aiShareName })} label={<span>Gửi tên học viên cho AI (mặc định chỉ gửi nhóm tuổi + trình độ)</span>} />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chỉ gửi số liệu chấm tóm tắt — không gửi âm thanh, không gửi log MIDI. Xem đúng dữ liệu đã gửi trong thẻ nhận xét. Kiểm tra kết nối (cả trong lúc đánh) chỉ hỏi danh sách model, không gửi dữ liệu.
          </p>
        </div>
      )}
    </Card>
  );
}
