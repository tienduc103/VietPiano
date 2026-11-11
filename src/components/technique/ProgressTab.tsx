/**
 * Dashboard kỹ thuật (đặc tả §26): số bài / buổi / phút, kỹ năng (0..1, cùng định nghĩa giữa các bài — không so điểm tổng khác thang),
 * biểu đồ theo ngày, tempo ổn định, kỹ năng cần cải thiện, đoạn khó đã khắc phục, tỉ lệ hoàn thành. Lọc theo thời gian / cấp / nhóm / kỹ năng
 * (người học = hồ sơ đang chọn ở trang chủ). Cài đặt + xuất / xoá dữ liệu.
 */
import { useEffect, useMemo, useState } from 'react';
import { coachStorage } from '../../core/coach/storage/CoachStorage';
import type { PerformanceSession, ScoringResult } from '../../core/coach/types';
import type { TechniqueSettings } from '../../core/smartPractice/store';
import { buildDashboard, type DashboardFilter } from '../../core/technique/dashboard';
import { SKILL_LABEL, SKILL_ORDER, TECHNIQUE_GROUP_LABEL, TECHNIQUE_GROUP_ORDER, TECHNIQUE_LEVEL_LABEL, type SkillId, type TechniqueGroup, type TechniqueLevel } from '../../core/technique/types';
import { smartPractice } from '../../hooks/useSmartPractice';
import { Button, Card } from '../ui';

const DAY = 86_400_000;
const WINDOWS: { key: string; label: string; days: number | null }[] = [
  { key: '7', label: '7 ngày', days: 7 },
  { key: '30', label: '30 ngày', days: 30 },
  { key: '90', label: '90 ngày', days: 90 },
  { key: 'all', label: 'Tất cả', days: null },
];

const selectCls = 'min-h-12 rounded-xl bg-white px-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700';

export function ProgressTab({
  profileKey,
  profileName,
  settings,
  updateSettings,
}: {
  profileKey: string;
  profileName: string;
  settings: TechniqueSettings;
  updateSettings: (p: Partial<TechniqueSettings>) => void;
}) {
  const [data, setData] = useState<{ results: ScoringResult[]; sessions: PerformanceSession[] } | null>(null);
  const [win, setWin] = useState('30');
  const [level, setLevel] = useState<TechniqueLevel | ''>('');
  const [group, setGroup] = useState<TechniqueGroup | ''>('');
  const [skill, setSkill] = useState<SkillId | ''>('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([coachStorage.listResults(profileKey).catch(() => []), coachStorage.listSessions(profileKey).catch(() => [])]).then(([results, sessions]) => live && setData({ results, sessions }));
    return () => {
      live = false;
    };
  }, [profileKey]);

  const now = Date.now();
  const filter: DashboardFilter = useMemo(() => {
    const days = WINDOWS.find((w) => w.key === win)?.days ?? null;
    return { ...(days ? { from: now - days * DAY } : {}), ...(level ? { level } : {}), ...(group ? { group } : {}), ...(skill ? { skill } : {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, level, group, skill]);
  const dash = useMemo(() => (data ? buildDashboard(data.results, data.sessions, smartPractice.store.load(profileKey).remedials, now, filter) : null), [data, filter, profileKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportData = async () => {
    const coach = await coachStorage.exportProfile(profileKey).catch(() => null);
    const blob = new Blob([JSON.stringify({ smartPractice: JSON.parse(smartPractice.store.export(profileKey)), coach }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vietpiano-ky-thuat-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  const clearData = () => {
    if (!window.confirm(`Xoá dữ liệu Luyện kỹ thuật (bài bổ trợ, phản hồi đề xuất, báo mỏi) của "${profileName}"? Lịch sử chấm của Coach giữ nguyên (xoá ở Coach → Lịch sử).`)) return;
    smartPractice.store.clear(profileKey);
    setMsg('Đã xoá dữ liệu Luyện kỹ thuật của hồ sơ này.');
  };

  return (
    <section className="mt-5 grid gap-4" data-testid="technique-progress">
      <Card>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <span className="font-semibold">Người học: {profileName}</span>
          <label>
            <span className="block text-slate-500">Thời gian</span>
            <select className={selectCls} value={win} onChange={(e) => setWin(e.target.value)} data-testid="progress-window">
              {WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="block text-slate-500">Cấp độ</span>
            <select className={selectCls} value={level} onChange={(e) => setLevel(e.target.value ? (Number(e.target.value) as TechniqueLevel) : '')}>
              <option value="">Tất cả</option>
              {([1, 2, 3, 4, 5] as TechniqueLevel[]).map((l) => (
                <option key={l} value={l}>
                  {TECHNIQUE_LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="block text-slate-500">Nhóm bài</span>
            <select className={selectCls} value={group} onChange={(e) => setGroup(e.target.value as TechniqueGroup | '')}>
              <option value="">Tất cả</option>
              {TECHNIQUE_GROUP_ORDER.map((g) => (
                <option key={g} value={g}>
                  {TECHNIQUE_GROUP_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="block text-slate-500">Kỹ năng</span>
            <select className={selectCls} value={skill} onChange={(e) => setSkill(e.target.value as SkillId | '')}>
              <option value="">Tất cả</option>
              {SKILL_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SKILL_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {!dash ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Bài đã luyện" value={dash.exercisesPracticed} />
            <Tile label="Buổi luyện" value={dash.sessions} />
            <Tile label="Phút luyện" value={dash.minutes} />
            <Tile label="Hoàn thành" value={`${dash.passedExercises}/${dash.totalExercises} (${Math.round(dash.completionRate * 100)}%)`} testId="progress-completion" />
          </div>

          <Card>
            <h3 className="font-bold">Kỹ năng</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Giá trị tiêu chí đo được (0–100%), gần đây được tính nặng hơn. "Chưa đo" = chưa có dữ liệu MIDI phù hợp (vd. bài một tay → không có phối hợp hai tay).</p>
            <ul className="mt-2 grid gap-2 md:grid-cols-2" data-testid="progress-skills">
              {SKILL_ORDER.filter((s) => !skill || s === skill).map((s) => {
                const p = dash.skills[s];
                const series = dash.series.map((d) => d.values[s]).filter((v): v is number => v !== undefined);
                return (
                  <li key={s} className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800" data-skill={s}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{SKILL_LABEL[s]}</span>
                      <span>
                        {p.proficiency === null ? 'Chưa đo' : `${Math.round(p.proficiency * 100)}%`}
                        {p.trend !== null && ` ${p.trend > 0.02 ? '▲' : p.trend < -0.02 ? '▼' : '▶'} ${Math.round(p.trend * 100)}`}
                        {p.proficiency !== null && ` · ${p.samples} lượt`}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.round((p.proficiency ?? 0) * 100)}%` }} />
                    </div>
                    <Spark values={series} label={SKILL_LABEL[s]} />
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h3 className="font-bold">Cần cải thiện</h3>
              {dash.weakSkills.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {dash.weakSkills.map((w) => (
                    <li key={w.skillId}>
                      {SKILL_LABEL[w.skillId]}: {Math.round(w.proficiency! * 100)}%
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Chưa đủ dữ liệu, hoặc mọi kỹ năng đều ≥ 85%.</p>
              )}
              <h3 className="mt-4 font-bold">Đoạn khó đã khắc phục</h3>
              {dash.fixedPassages.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {dash.fixedPassages.map((f) => (
                    <li key={f.id}>
                      {f.noteNames.join(' – ')} · {f.sourceTitle}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Chưa có.</p>
              )}
            </Card>
            <Card>
              <h3 className="font-bold">Tempo ổn định theo bài</h3>
              {dash.stableTempos.length ? (
                <ul className="mt-2 grid gap-1 text-sm" data-testid="progress-tempos">
                  {dash.stableTempos.map((t) => (
                    <li key={t.exerciseId}>
                      {t.title}: <b>♩={t.stableBpm}</b> <span className="text-slate-500">(khoảng {t.range[0]}–{t.range[1]})</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Cần ít nhất 2 lượt đạt ở cùng tempo.</p>
              )}
            </Card>
          </div>
        </>
      )}

      <Card>
        <h3 className="font-bold">Cài đặt & dữ liệu</h3>
        <div className="mt-2 grid gap-2 text-sm">
          <Toggle label="Tempo thích ứng (tự đề xuất tempo theo kết quả)" checked={settings.adaptiveTempo} onChange={(v) => updateSettings({ adaptiveTempo: v })} />
          <Toggle label="Dùng AI cục bộ để sắp xếp / diễn đạt bài hôm nay (khi AI đang bật ở Cài đặt)" checked={settings.aiRank} onChange={(v) => updateSettings({ aiRank: v })} />
          <Toggle label="Bật tính năng Luyện kỹ thuật ngón tay + Luyện đoạn khó" checked={settings.enabled} onChange={(v) => updateSettings({ enabled: v })} testId="technique-flag" />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="text-sm" onClick={() => void exportData()} data-testid="technique-export">
            Xuất dữ liệu (JSON)
          </Button>
          <Button variant="ghost" className="text-sm" onClick={clearData} data-testid="technique-clear">
            Xoá dữ liệu Luyện kỹ thuật
          </Button>
        </div>
        {msg && <p className="mt-2 text-sm">{msg}</p>}
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Dữ liệu chỉ lưu trên máy này, theo từng hồ sơ. AI cục bộ chỉ nhận tên bài, kỹ năng, số liệu tóm tắt — không nhận tên học viên hay log MIDI.</p>
      </Card>
    </section>
  );
}

function Tile({ label, value, testId }: { label: string; value: string | number; testId?: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700" data-testid={testId}>
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  );
}

function Toggle({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input type="checkbox" className="h-6 w-6" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span>{label}</span>
    </label>
  );
}

function Spark({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 220;
  const h = 36;
  const x = (i: number) => 4 + (i * (w - 8)) / (values.length - 1);
  const y = (v: number) => 4 + (1 - v) * (h - 8);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label} theo ngày: ${values.map((v) => Math.round(v * 100)).join(', ')}%`} className="mt-1">
      <path d={d} fill="none" strokeWidth={2} className="stroke-violet-500 dark:stroke-violet-400" strokeLinejoin="round" />
    </svg>
  );
}
