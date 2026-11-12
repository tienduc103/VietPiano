/**
 * Giao diện phụ huynh của bài "Khám phá âm thanh": báo cáo quan sát (không suy diễn), đề xuất, nhận xét AI cục bộ
 * (tuỳ chọn), chỉnh độ khó / ngưỡng, đặt lại, kiểm tra độ trễ.
 */
import { useState } from 'react';
import { OllamaError, ollamaConnectHint, resolveOllama, streamChat } from '../../core/feedback/OllamaClient';
import { midiToLabel } from '../../core/music/notes';
import { buildExploreMessages, parseAiAdvice, ruleAdvice, type ExploreAdvice } from '../../core/soundExplore/ai';
import { assessAll, gardenChoices, recommend, SKILL_LABEL, STATUS_LABEL, suggestedLevel, type SkillStatus } from '../../core/soundExplore/assessment';
import { LEVEL_LABEL, type ExploreLevel, type SoundExploreSettings } from '../../core/soundExplore/config';
import { ACTIVITY_ICON, ACTIVITY_TITLE, SOUND_EXPLORE_LESSON } from '../../core/soundExplore/lesson';
import { resetProgress, updateSettings, type ActivityId } from '../../core/soundExplore/progress';
import { activeProfile, useProfiles } from '../../store/profileStore';
import { useSettings } from '../../store/settingsStore';
import { ollamaCandidatesForPage } from '../AiCoachCard';
import { Button, Card, Segmented, Toggle } from '../ui';
import { useExplore } from './shared';

const STATUS_STYLE: Record<SkillStatus, string> = {
  insufficient: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  practice: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
};

export interface LatencyStats {
  source: string;
  samples: number;
  avgMs: number;
  maxMs: number;
}

export function ParentPanel({ onClose, onOpenActivity, latency }: { onClose: () => void; onOpenActivity: (a: ActivityId) => void; latency: () => LatencyStats[] }) {
  const api = useExplore();
  const p = api.progress;
  const s = p.settings;
  const set = (patch: Partial<SoundExploreSettings>) => api.update((x, now) => updateSettings(x, patch, now));
  const assessments = assessAll(p);
  const recs = recommend(p, Date.now());
  const up = suggestedLevel(p);
  const midiExec = assessments.filter((a) => a.skill === 'durationExecution' || a.skill === 'pitchExecution');
  const midiTried = midiExec.reduce((n, a) => n + a.midiAttempts, 0);
  const [resetTarget, setResetTarget] = useState<ActivityId | 'all'>('all');
  const [confirmReset, setConfirmReset] = useState(false);
  const [lat, setLat] = useState<LatencyStats[] | null>(null);

  return (
    <div className="grid gap-4 pb-6" data-testid="se-parent">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold">Góc phụ huynh — {SOUND_EXPLORE_LESSON.title}</h2>
        <Button variant="primary" onClick={onClose} data-testid="se-parent-close">
          Về trang của bé
        </Button>
      </div>

      <Card>
        <h3 className="font-bold">Báo cáo quan sát</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Chỉ tổng hợp kết quả trò chơi đã ghi trên máy này. Cần ít nhất 6 lần thử mới đánh giá một kỹ năng; đây không phải kết luận về khả năng của bé.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="se-report-activities">
          {SOUND_EXPLORE_LESSON.activities.map((a) => (
            <span key={a.id} className={`rounded-full px-3 py-1 text-sm ${p.visited[a.id] ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
              {ACTIVITY_ICON[a.id]} {a.title} {p.visited[a.id] ? `· ⭐ ${p.stars[a.id]}` : '· chưa chơi'}
            </span>
          ))}
        </div>
        <table className="mt-4 w-full text-left text-sm" data-testid="se-report-skills">
          <thead className="text-slate-500 dark:text-slate-400">
            <tr>
              <th className="py-1 pr-2">Kỹ năng</th>
              <th className="py-1 pr-2">Đánh giá</th>
              <th className="py-1 pr-2">Lần thử</th>
              <th className="py-1 pr-2">Gần đây</th>
              <th className="py-1 pr-2">Nghe lại / thử lại</th>
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr key={a.skill} className="border-t border-slate-100 dark:border-slate-700" data-skill={a.skill} data-status={a.status}>
                <td className="py-2 pr-2">{SKILL_LABEL[a.skill]}</td>
                <td className="py-2 pr-2">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                </td>
                <td className="py-2 pr-2">
                  {a.successfulAttempts}/{a.attempts}
                </td>
                <td className="py-2 pr-2">{a.recentRate === null ? '—' : `${Math.round(a.recentRate * 100)}%`}</td>
                <td className="py-2 pr-2">
                  {a.replays} / {a.retries}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm" data-testid="se-report-midi">
          <b>Trên đàn MIDI:</b>{' '}
          {midiTried === 0
            ? 'chưa có lần thử nào bằng đàn MIDI (bàn phím trên màn hình / micro vẫn được tính ở bảng trên).'
            : midiExec.map((a) => `${SKILL_LABEL[a.skill]} ${a.midiSuccesses}/${a.midiAttempts}`).join(' · ')}
        </p>
      </Card>

      <Card>
        <h3 className="font-bold">Đề xuất lần sau (theo quy tắc)</h3>
        <ul className="mt-2 grid gap-2" data-testid="se-recommendations">
          {recs.map((r, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span className="flex-1">
                {ACTIVITY_ICON[r.suggestedActivity]} <b>{ACTIVITY_TITLE[r.suggestedActivity]}</b> — {r.reason}
              </span>
              {r.parentApprovalRequired && up ? (
                <Button variant="primary" onClick={() => set({ level: up })} data-testid="se-accept-level">
                  Đồng ý lên {LEVEL_LABEL[up]}
                </Button>
              ) : (
                <Button onClick={() => onOpenActivity(r.suggestedActivity)}>Mở hoạt động</Button>
              )}
            </li>
          ))}
        </ul>
        <AiAdvice />
      </Card>

      <Card>
        <h3 className="font-bold">Độ khó và ngưỡng</h3>
        <div className="mt-3 grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-40">Mức độ</span>
            <Segmented<string>
              value={String(s.level)}
              onChange={(v) => set({ level: Number(v) as ExploreLevel })}
              options={([1, 2, 3] as const).map((l) => ({ value: String(l), label: LEVEL_LABEL[l] }))}
            />
          </div>
          <p className="-mt-2 text-sm text-slate-500 dark:text-slate-400">Mức không tự tăng theo thời gian chơi — app chỉ đề xuất khi kết quả nhiều lần đều tốt, phụ huynh quyết định.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-40">Khu vườn</span>
            <Segmented<string>
              value={String(s.gardenChoices)}
              onChange={(v) => set({ gardenChoices: v === 'auto' ? 'auto' : (Number(v) as 2 | 4) })}
              options={[
                { value: 'auto', label: `Tự động (đang ${gardenChoices(p)})` },
                { value: '2', label: '2 lựa chọn' },
                { value: '4', label: '4 lựa chọn' },
              ]}
            />
          </div>
          <Range label="Âm ngắn: tối đa" value={s.shortMaxMs} min={300} max={1200} step={50} unit="ms" onChange={(v) => set({ shortMaxMs: v })} testId="se-short-max" />
          <Range label="Âm dài: từ" value={s.longMinMs} min={800} max={4000} step={100} unit="ms" onChange={(v) => set({ longMinMs: v })} testId="se-long-min" />
          <Range label="Bỏ qua chạm dưới" value={s.shortMinMs} min={50} max={300} step={10} unit="ms" onChange={(v) => set({ shortMinMs: v })} />
          <p className="-mt-2 text-sm text-slate-500 dark:text-slate-400">
            Khoảng giữa {s.shortMaxMs}–{s.longMinMs} ms là "chưa rõ": bé được mời thử lại, không bị tính chưa đạt. Đây là ngưỡng trò chơi, không phải định nghĩa nhạc lý.
            Thời gian đo là lúc giữ phím thật — pedal vang không làm dài thêm.
          </p>
          <Range label="Vùng thấp: tới" value={s.lowMax} min={45} max={65} step={1} unit="" format={(v) => midiToLabel(v, 'solfege')} onChange={(v) => set({ lowMax: v })} />
          <Range label="Vùng cao: từ" value={s.highMin} min={60} max={84} step={1} unit="" format={(v) => midiToLabel(v, 'solfege')} onChange={(v) => set({ highMin: v })} />
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Hiển thị và âm thanh</h3>
        <div className="mt-2 grid gap-1">
          <Toggle checked={s.reducedMotion} onChange={(v) => set({ reducedMotion: v })} label="Giảm chuyển động" />
          <Toggle checked={s.flipLayout} onChange={(v) => set({ flipLayout: v })} label="Lật giao diện (bàn phím ở trên)" />
          <Toggle checked={s.effectSounds} onChange={(v) => set({ effectSounds: v })} label="Tiếng chuông khi hoàn thành" />
          <Range label="Âm lượng hiệu ứng" value={Math.round(s.effectVolume * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => set({ effectVolume: v / 100 })} />
          <p className="text-sm text-slate-500 dark:text-slate-400">Bài không có nhạc nền và không có âm báo thất bại. Chuông hiệu ứng luôn nhỏ hơn tiếng đàn và không kêu khi bé đang giữ phím.</p>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold">Kiểm tra độ trễ</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Đánh vài phím (đàn MIDI hoặc bàn phím trên màn hình) trong lúc bé chơi rồi bấm Đo: thời gian từ lúc app nhận phím tới khi hình vẽ lại. Đo độ trễ loa / đàn chi tiết: AI Piano Coach.
        </p>
        <Button className="mt-2" onClick={() => setLat(latency())} data-testid="se-latency">
          Đo
        </Button>
        {lat && (
          <ul className="mt-2 text-sm" data-testid="se-latency-result">
            {lat.length === 0 ? <li>Chưa có phím nào — hãy đánh vài phím rồi đo lại.</li> : lat.map((l) => <li key={l.source}>{`${l.source}: trung bình ${l.avgMs} ms, lớn nhất ${l.maxMs} ms (${l.samples} phím)`}</li>)}
          </ul>
        )}
      </Card>

      <Card>
        <h3 className="font-bold">Đặt lại</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <select
            className="min-h-12 rounded-xl bg-violet-50 px-3 dark:bg-slate-700"
            value={resetTarget}
            onChange={(e) => {
              setResetTarget(e.target.value as ActivityId | 'all');
              setConfirmReset(false);
            }}
            aria-label="Đặt lại hoạt động"
          >
            <option value="all">Toàn bộ kết quả (giữ cài đặt)</option>
            {SOUND_EXPLORE_LESSON.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          {confirmReset ? (
            <Button
              variant="danger"
              onClick={() => {
                api.update((x, now) => resetProgress(x, now, resetTarget === 'all' ? undefined : resetTarget));
                setConfirmReset(false);
              }}
              data-testid="se-reset-confirm"
            >
              Chắc chắn đặt lại
            </Button>
          ) : (
            <Button onClick={() => setConfirmReset(true)} data-testid="se-reset">
              Đặt lại
            </Button>
          )}
        </div>
        {p.sessions.length > 0 && (
          <ul className="mt-3 text-sm text-slate-500 dark:text-slate-400" aria-label="Phiên gần đây">
            {p.sessions
              .slice(-5)
              .reverse()
              .map((x) => (
                <li key={x.sessionId}>
                  {new Date(x.startedAt).toLocaleString('vi-VN')} · {ACTIVITY_TITLE[x.activityId]} · {Math.max(1, Math.round((x.endedAt - x.startedAt) / 60000))} phút · {x.completed ? 'có hoàn thành' : 'chưa hoàn thành'}
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Range({ label, value, min, max, step, unit, onChange, format, testId }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void; format?: (v: number) => string; testId?: string }) {
  return (
    <label className="flex flex-wrap items-center gap-3">
      <span className="w-40">{label}</span>
      <input type="range" className="min-h-12 flex-1 accent-fuchsia-500" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid={testId} />
      <span className="w-20 text-right font-mono">{format ? format(value) : `${value}${unit ? ` ${unit}` : ''}`}</span>
    </label>
  );
}

/** Nhận xét AI cục bộ — bấm mới gọi; tắt / lỗi → nhận xét theo quy tắc, không chặn bài. */
function AiAdvice() {
  const api = useExplore();
  const { aiCoachEnabled, ollamaUrl, ollamaModel } = useSettings((s) => s.settings);
  const profile = useProfiles(activeProfile);
  const [advice, setAdvice] = useState<ExploreAdvice>(() => ruleAdvice(api.progress, Date.now()));
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'rejected'>('idle');
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setStatus('loading');
    setError(null);
    try {
      const { baseUrl } = await resolveOllama(ollamaCandidatesForPage(ollamaUrl));
      const text = await streamChat({ baseUrl, model: ollamaModel, messages: buildExploreMessages(api.progress, profile?.age ?? null, Date.now()), temperature: 0.3 });
      const parsed = parseAiAdvice(text);
      if (parsed) {
        setAdvice({ ...parsed, generatedBy: 'ai' });
        setStatus('idle');
      } else {
        setAdvice(ruleAdvice(api.progress, Date.now()));
        setStatus('rejected');
      }
    } catch (e) {
      setAdvice(ruleAdvice(api.progress, Date.now()));
      setStatus('error');
      setError(e instanceof OllamaError && e.kind === 'network' ? ollamaConnectHint(location.origin) : String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div className="mt-4 rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 ring-1 ring-violet-200 dark:from-slate-700/60 dark:to-slate-700/30 dark:ring-violet-800" data-testid="se-advice" data-by={advice.generatedBy}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{advice.generatedBy === 'ai' ? '🤖 Nhận xét của AI cục bộ' : '📋 Nhận xét theo quy tắc'}</h4>
        {aiCoachEnabled ? (
          <Button onClick={ask} disabled={status === 'loading'} data-testid="se-ask-ai">
            {status === 'loading' ? 'AI đang viết…' : 'Viết bằng AI cục bộ'}
          </Button>
        ) : (
          <span className="text-sm text-slate-500 dark:text-slate-400">AI cục bộ đang tắt (Cài đặt → AI)</span>
        )}
      </div>
      <p className="mt-2">
        <b>Cho bé:</b> {advice.kid}{' '}
        <Button variant="ghost" className="min-h-10 px-2 text-sm" onClick={() => api.sayText(advice.kid, 'praise')}>
          🔊 Đọc cho bé
        </Button>
      </p>
      <p className="mt-1 whitespace-pre-line">
        <b>Cho phụ huynh:</b>
        {'\n'}
        {advice.parent}
      </p>
      {status === 'rejected' && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Câu trả lời của AI không đạt yêu cầu (sai định dạng hoặc suy diễn ngoài số liệu) — đang dùng nhận xét theo quy tắc.</p>}
      {status === 'error' && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300" role="alert">
          Không dùng được AI cục bộ — đang dùng nhận xét theo quy tắc. {error}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">AI chỉ nhận số liệu tóm tắt + tuổi, không nhận tên bé hay dữ liệu nốt; kết quả đúng / sai do quy tắc tính.</p>
    </div>
  );
}
