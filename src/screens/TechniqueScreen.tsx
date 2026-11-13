/**
 * Luyện kỹ thuật ngón tay + AI Smart Practice (docs/finger-coach/architecture.md). Route `technique`, `?screen=technique`.
 * Tab: Hôm nay (≤ 3 bài đề xuất theo luật, AI cục bộ chỉ sắp xếp / diễn đạt) · Giáo trình (5 cấp, 13 nhóm) · Đoạn khó · Tiến bộ.
 * Bài chạy trong AI Piano Coach (ghi MIDI + chấm thật) — màn này không tự chấm, không giả kết quả.
 */
import { useCallback, useEffect, useState } from 'react';
import { FullscreenButton, Button, Card, Icon } from '../components/ui';
import { ollamaCandidatesForPage } from '../components/AiCoachCard';
import { PinShortcutButton } from '../components/shortcuts/PinShortcutButton';
import { TechniqueLibrary } from '../components/technique/TechniqueLibrary';
import { PassagesTab } from '../components/technique/PassagesTab';
import { ProgressTab } from '../components/technique/ProgressTab';
import { OllamaProvider } from '../core/coach/ai/provider';
import { GUEST_PROFILE } from '../core/coach/types';
import { ageGroup } from '../core/profile/LearnerProfile';
import { activeFatigue, smartPracticeStore } from '../core/smartPractice/store';
import { aiRankToday } from '../core/technique/aiRank';
import { SLOT_LABEL, type TodayItem, type TodayPlan } from '../core/technique/recommend';
import { SKILL_LABEL, TECHNIQUE_LEVEL_LABEL } from '../core/technique/types';
import { useUiMode } from '../hooks/useUiMode';
import { smartPractice, useTechniqueSettings } from '../hooks/useSmartPractice';
import { useApp } from '../store/appStore';
import { activeProfile, useProfiles } from '../store/profileStore';
import { useSettings } from '../store/settingsStore';

type Tab = 'today' | 'library' | 'passages' | 'progress';

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: '✨ Hôm nay' },
  { key: 'library', label: '📚 Giáo trình' },
  { key: 'passages', label: '🎯 Đoạn khó' },
  { key: 'progress', label: '📈 Tiến bộ' },
];

export function TechniqueScreen({ tab: initialTab }: { tab?: Tab }) {
  const navigate = useApp((s) => s.navigate);
  const profile = useProfiles(activeProfile);
  const profileKey = profile?.id ?? GUEST_PROFILE;
  const audience = useUiMode() === 'kids' ? 'kids' : 'adult';
  const [tab, setTab] = useState<Tab>(initialTab ?? 'today');
  const [settings, updateSettings] = useTechniqueSettings();
  const [fatigueAt, setFatigueAt] = useState<number | null>(() => activeFatigue(smartPracticeStore.load(profileKey), Date.now())?.at ?? null);

  /** Mở bài trong Coach (màn chuẩn bị) — Coach ghi MIDI thật và chấm. */
  const open = useCallback(
    (lessonId: string, bpm?: number, hand?: 'both' | 'right' | 'left') => navigate({ name: 'coach', lessonId, ...(bpm ? { bpm } : {}), ...(hand ? { hand } : {}), returnTo: 'technique' }),
    [navigate],
  );

  const reportFatigue = () => {
    const now = Date.now();
    smartPracticeStore.reportFatigue(profileKey, now);
    setFatigueAt(now);
  };

  return (
    <div className="h-full overflow-y-auto" data-testid="technique-screen" data-tab={tab}>
      <div className="mx-auto max-w-6xl px-4 pt-[calc(1.25rem+env(safe-area-inset-top,0px)+var(--fullscreen-top-gap))] pb-10 sm:px-6">
        <header className="flex flex-wrap items-center gap-3 pl-10">
          <Button variant="ghost" className="px-2" aria-label="Về trang chủ" onClick={() => navigate({ name: 'dashboard' })} midiNav="back">
            <Icon name="back" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold">Luyện kỹ thuật ngón tay</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">5 ngón, 8 ngón, chuỗi 8 nốt, chuyển ngón — chấm bằng dữ liệu MIDI thật, gợi ý bài theo kết quả của bạn.</p>
          </div>
          <Button variant="secondary" className="shrink-0 text-sm" onClick={() => navigate({ name: 'five-finger' })} data-testid="technique-open-five-finger">
            🖐 5 ngón · 8 nốt (chờ nốt)
          </Button>
          <PinShortcutButton target={{ type: 'page', id: 'technique' }} />
          <FullscreenButton className="shrink-0" />
        </header>

        {!settings.enabled ? (
          <Card className="mt-5">
            <p>Tính năng Luyện kỹ thuật ngón tay đang tắt. Dữ liệu cũ vẫn được giữ.</p>
            <Button variant="primary" className="mt-3" onClick={() => updateSettings({ enabled: true })} data-testid="technique-enable">
              Bật lại
            </Button>
          </Card>
        ) : (
          <>
            <nav className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Mục luyện kỹ thuật">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  className={`min-h-12 rounded-xl px-4 font-semibold ring-1 ${tab === t.key ? 'bg-violet-600 text-white ring-violet-600' : 'bg-white text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700'}`}
                  onClick={() => setTab(t.key)}
                  data-testid={`technique-tab-${t.key}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <SafetyNote fatigueAt={fatigueAt} onFatigue={reportFatigue} kids={audience === 'kids'} />

            {tab === 'today' && <TodayTab profileKey={profileKey} audience={audience} age={profile?.age ?? null} dailyMinutes={profile?.dailyMinutes ?? null} aiRank={settings.aiRank} fatigueAt={fatigueAt} onOpen={open} />}
            {tab === 'library' && <TechniqueLibrary profileKey={profileKey} onOpen={open} />}
            {tab === 'passages' && <PassagesTab profileKey={profileKey} onOpen={open} />}
            {tab === 'progress' && <ProgressTab profileKey={profileKey} profileName={profile?.name ?? 'Khách'} settings={settings} updateSettings={updateSettings} />}
          </>
        )}
      </div>
    </div>
  );
}

function SafetyNote({ fatigueAt, onFatigue, kids }: { fatigueAt: number | null; onFatigue: () => void; kids: boolean }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-900/20 dark:text-amber-100 dark:ring-amber-800">
      <p className="min-w-0 flex-1">
        {kids
          ? 'Tay mềm như cục bông, tập chậm thôi nhé. Mỏi tay thì nghỉ!'
          : 'Ưu tiên thả lỏng, chính xác và đều trước khi tăng tốc. Không gồng, không ép giãn ngón. App chỉ đo được nốt, thời điểm, thời gian giữ phím và lực gõ MIDI — không biết bạn dùng ngón nào, tư thế hay độ căng cơ.'}
        {fatigueAt && ` Bạn đã báo mỏi lúc ${new Date(fatigueAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} — hôm nay nên nghỉ ngơi.`}
      </p>
      <Button className="min-h-10 shrink-0 text-sm" onClick={onFatigue} data-testid="technique-fatigue">
        😮‍💨 Tôi thấy mỏi tay
      </Button>
    </div>
  );
}

function TodayTab({
  profileKey,
  audience,
  age,
  dailyMinutes,
  aiRank,
  fatigueAt,
  onOpen,
}: {
  profileKey: string;
  audience: 'kids' | 'adult';
  age: number | null;
  dailyMinutes: number | null;
  aiRank: boolean;
  fatigueAt: number | null;
  onOpen: (lessonId: string, bpm?: number, hand?: 'both' | 'right' | 'left') => void;
}) {
  const aiEnabled = useSettings((s) => s.settings.aiCoachEnabled);
  const ollamaUrl = useSettings((s) => s.settings.ollamaUrl);
  const ollamaModel = useSettings((s) => s.settings.ollamaModel);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [plan, setPlan] = useState<TodayPlan | null>(null);
  const [source, setSource] = useState<'rules' | 'ai' | 'loading-ai'>('rules');
  const [aiError, setAiError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    const ctrl = new AbortController();
    void (async () => {
      const rules = await smartPractice.getPracticeRecommendations(profileKey, { skip, audience, ...(dailyMinutes ? { minutesAvailable: dailyMinutes } : {}) });
      if (!live) return;
      setPlan(rules);
      setSource('rules');
      setAiError(null);
      // Tầng 2: AI cục bộ chỉ khi đang bật ở Cài đặt → AI; lỗi / tắt → giữ đề xuất theo luật.
      if (!aiEnabled || !aiRank || rules.fatigue || rules.items.length < 2) return;
      setSource('loading-ai');
      const provider = new OllamaProvider({ candidates: () => ollamaCandidatesForPage(ollamaUrl), model: ollamaModel });
      const ranked = await aiRankToday(rules, provider, { audience, ageGroup: age ? ageGroup(age) : null, signal: ctrl.signal });
      if (!live) return;
      setPlan(ranked.plan);
      setSource(ranked.source);
      setAiError(ranked.error ?? null);
    })();
    return () => {
      live = false;
      ctrl.abort();
    };
  }, [profileKey, skip, audience, age, dailyMinutes, aiEnabled, aiRank, ollamaUrl, ollamaModel, fatigueAt, version]);

  const start = (it: TodayItem) => {
    smartPracticeStore.addFeedback(profileKey, { at: Date.now(), lessonId: it.lessonId, slot: it.slot, action: 'start' });
    if (it.remedial) smartPracticeStore.upsertRemedial(profileKey, { ...it.remedial, profileKey, createdAt: Date.now(), status: 'active' });
    onOpen(it.lessonId, it.bpm);
  };
  const swap = (it: TodayItem) => {
    smartPracticeStore.addFeedback(profileKey, { at: Date.now(), lessonId: it.lessonId, slot: it.slot, action: 'swap' });
    setSkip((s) => new Set([...s, it.lessonId]));
  };
  const unsuitable = (it: TodayItem) => {
    smartPracticeStore.addFeedback(profileKey, { at: Date.now(), lessonId: it.lessonId, slot: it.slot, action: 'unsuitable' });
    setVersion((v) => v + 1);
  };

  if (!plan) return <p className="mt-6 text-slate-500">Đang chọn bài cho hôm nay…</p>;
  return (
    <section className="mt-5" data-testid="technique-today" data-source={source}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Bài luyện hôm nay</h2>
        <span className="text-sm text-slate-500 dark:text-slate-400" data-testid="technique-today-source">
          {TECHNIQUE_LEVEL_LABEL[plan.level]} ·{' '}
          {source === 'loading-ai' ? 'AI cục bộ đang sắp xếp…' : source === 'ai' ? 'Lý do do AI cục bộ diễn đạt (đã kiểm tra với số liệu)' : 'Đề xuất theo quy tắc từ kết quả của bạn'}
          {aiError ? ` · AI: ${aiError}` : ''}
        </span>
      </div>
      {plan.note && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-900/20">{plan.note}</p>}
      {skip.size > 0 && (
        <button type="button" className="mt-2 text-sm text-violet-700 underline dark:text-violet-300" onClick={() => setSkip(new Set())}>
          Hiện lại các bài đã đổi
        </button>
      )}
      <ol className="mt-3 grid gap-3 md:grid-cols-3">
        {plan.items.map((it, i) => (
          <li key={it.lessonId} data-testid="technique-today-item">
            <Card className="flex h-full flex-col">
              <div className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                Bài {i + 1} · {SLOT_LABEL[it.slot]}
              </div>
              <h3 className="mt-1 text-lg font-bold">{it.title}</h3>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {it.targetSkills.map((s) => SKILL_LABEL[s]).join(' · ')} · ~{it.minutes} phút · ♩={it.bpm}
              </div>
              <p className="mt-2 flex-1 text-sm" data-testid="technique-today-reason">
                {it.reason}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" className="text-sm" onClick={() => start(it)} data-testid="technique-today-start">
                  <Icon name="play" className="h-5 w-5" /> Bắt đầu
                </Button>
                <Button className="text-sm" onClick={() => swap(it)} data-testid="technique-today-swap">
                  Đổi bài
                </Button>
                <Button variant="ghost" className="text-sm" onClick={() => unsuitable(it)} data-testid="technique-today-unsuitable">
                  Không phù hợp
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      {plan.items.length === 0 && <p className="mt-3 text-slate-500">Không còn bài phù hợp hôm nay — nghỉ ngơi hoặc chọn bài ở Giáo trình.</p>}
    </section>
  );
}

