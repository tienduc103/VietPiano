/**
 * Giao diện của hai chế độ "Trường độ" và "Nhanh – chậm" (Cầu vồng hai bàn tay): thẻ hình nốt + thanh giữ phím,
 * bảng tốc độ máy đưa ra + đồng hồ tốc độ, hoạt hình cá sấu / sét / khúc củi, phần cài đặt và tổng kết riêng.
 * Chỉ hiển thị — chấm ở `core/rainbowHands` (RainbowEngine, SpeedJudge).
 */
import { useMemo, type ReactNode } from 'react';
import { useStaffCards } from '../games/StaffShootView';
import { Button, Segmented, Toggle } from '../ui';
import type { Hand } from '../../core/lessons/types';
import { midiToName } from '../../core/music/notes';
import type { HandStats, Summary } from '../../core/rainbowHands/analysis';
import { cardNotation, DURATION_INFO, holdEnough, RHYTHM_PATTERN_IDS, RHYTHM_PATTERNS, type RhythmPatternId } from '../../core/rainbowHands/durations';
import type { RainbowEngine } from '../../core/rainbowHands/RainbowEngine';
import type { HandSet, RouteStep } from '../../core/rainbowHands/route';
import { ON_TIME_CHOICES, SPEED_SEGMENT_CHOICES, type RainbowSettings } from '../../core/rainbowHands/settings';
import { speedBand, SPEED_IDS, SPEED_INFO, type Hazard, type SpeedEvent, type SpeedId, type SpeedJudge, type SpeedStats } from '../../core/rainbowHands/speed';
import { HAND_CHAR } from './RainbowScene';

const HAND_TITLE: Record<Hand, string> = { left: 'Tay trái', right: 'Tay phải' };

// ── Trường độ ────────────────────────────────────────────────────────────────

/** Thẻ hình nốt (khuông nhỏ, khoá theo tay) của mọi bước — vẽ một lần cho cả lượt. */
function useDurationCards(steps: readonly RouteStep[]) {
  const cards = useMemo(
    () =>
      steps.flatMap((s, i) =>
        s.duration ? s.notes.map((n) => ({ key: `${i}|${n.hand}`, notation: cardNotation(midiToName(n.midi), s.duration!), clef: n.hand === 'left' ? ('bass' as const) : ('treble' as const) })) : [],
      ),
    [steps],
  );
  return useStaffCards(cards, undefined, { timeSignature: false });
}

/**
 * Dải trường độ: bước hiện tại (to) + 3 bước tiếp theo, mỗi bước hình nốt + tên + số phách; thanh giữ phím từng tay
 * (đàn MIDI / bàn phím ảo). Micro → ghi "không đo giữ phím".
 */
export function DurationStrip({ steps, index, hands, engine, now, micOnly }: { steps: readonly RouteStep[]; index: number; hands: readonly Hand[]; engine: RainbowEngine; now: number; micOnly: boolean }) {
  const svgs = useDurationCards(steps);
  const hand = hands.includes('right') ? 'right' : 'left';
  // Nốt dài đang giữ (chưa hết số phách) vẫn là thẻ sáng — bé thấy mình đang giữ nốt gì.
  const held = engine.lastHold(hand);
  const from = held && held.index < index && held.releaseTime === null && now - held.hitTime < held.requiredMs ? held.index : index;
  const upcoming = steps.slice(from, from + 4);
  return (
    <section className="flex h-28 items-stretch gap-2 overflow-hidden rounded-3xl bg-white/90 px-3 py-2 shadow-md ring-2 ring-amber-200 dark:bg-slate-800/90 dark:ring-amber-900" data-testid="rainbow-duration-strip">
      {upcoming.map((s, k) => {
        const d = s.duration!;
        return (
          <div
            key={`${from + k}`}
            className={`grid min-w-24 grid-rows-[1fr_auto] justify-items-center rounded-2xl px-2 ${k === 0 ? 'bg-amber-100 ring-4 ring-amber-400 dark:bg-amber-900/50' : 'opacity-60'}`}
            data-testid={k === 0 ? 'rainbow-duration-current' : undefined}
            data-duration={d}
          >
            <div className="h-14 w-24 overflow-hidden [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svgs?.get(`${from + k}|${hand}`) ?? '' }} />
            <div className="text-center leading-tight">
              <div className={`font-black ${k === 0 ? 'text-base' : 'text-xs'}`}>{DURATION_INFO[d].short}</div>
              {k === 0 && <div className="text-[11px] text-slate-600 dark:text-slate-300">{DURATION_INFO[d].hint}</div>}
            </div>
          </div>
        );
      })}
      <div className="ml-auto grid min-w-48 content-center gap-1">
        {micOnly ? (
          <p className="text-xs text-slate-600 dark:text-slate-300">Micro không biết lúc thả phím → giữ phím: <b>không đo</b>. Nối đàn MIDI để chấm giữ phím.</p>
        ) : (
          hands.map((h) => <HoldBar key={h} hand={h} engine={engine} now={now} />)
        )}
      </div>
    </section>
  );
}

function HoldBar({ hand, engine, now }: { hand: Hand; engine: RainbowEngine; now: number }) {
  const h = engine.lastHold(hand);
  const c = HAND_CHAR[hand];
  if (!h) {
    return (
      <div className="text-xs text-slate-500" data-testid={`rainbow-hold-${hand}`}>
        {c.icon} {HAND_TITLE[hand]}: giữ phím đủ dài nhé
      </div>
    );
  }
  const heldMs = (h.releaseTime ?? now) - h.hitTime;
  const ratio = Math.min(1, heldMs / h.requiredMs);
  const enough = holdEnough(heldMs, h.requiredMs);
  const released = h.releaseTime !== null;
  const color = enough ? 'bg-emerald-500' : released ? 'bg-rose-500' : 'bg-violet-500';
  return (
    <div className="grid gap-0.5" data-testid={`rainbow-hold-${hand}`} data-hold={released ? (enough ? 'full' : 'short') : 'holding'}>
      <div className="flex justify-between text-[11px] font-bold">
        <span>
          {c.icon} {HAND_TITLE[hand]}
        </span>
        <span>{released ? (enough ? 'Giữ đủ 👍' : 'Nhả sớm quá') : enough ? 'Đủ rồi!' : 'Giữ tiếp…'}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className={`h-full ${color}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

// ── Nhanh – chậm ─────────────────────────────────────────────────────────────

const GAUGE_MIN = 100;
const GAUGE_MAX = 4000;
/** Vị trí % trên đồng hồ tốc độ (thang log: chậm bên trái, nhanh bên phải). */
const gaugePos = (ms: number) => 100 - (100 * Math.log(Math.min(GAUGE_MAX, Math.max(GAUGE_MIN, ms)) / GAUGE_MIN)) / Math.log(GAUGE_MAX / GAUGE_MIN);

const EVENT_TEXT: Record<SpeedEvent['kind'], string> = {
  ok: 'Vừa đúng tốc độ! 🌟',
  slow: 'Chậm quá rồi!',
  'slow-live': 'Chậm quá — cá sấu tới!',
  fast: 'Nhanh quá rồi!',
  free: 'Chặng mới — xem tốc độ nhé',
};

export function SpeedPanel({ judge, round, index, stepsCount, lastEvent, now, waiting }: { judge: SpeedJudge; round: number; index: number; stepsCount: number; lastEvent: SpeedEvent | null; now: number; waiting: boolean }) {
  const target = judge.target(round, index);
  const info = SPEED_INFO[target];
  const [lo, hi] = judge.band(round, index);
  const graded = !judge.isSegmentStart(index);
  const elapsed = waiting && graded ? judge.elapsed(now) : null;
  const needle = elapsed ?? lastEvent?.intervalMs ?? null;
  const nextChange = index + 1 < stepsCount && judge.isSegmentStart(index + 1) ? judge.target(round, index + 1) : null;
  const danger = judge.getDanger();
  return (
    <section className="grid h-28 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-3xl bg-white/90 px-3 py-2 shadow-md ring-2 ring-teal-200 dark:bg-slate-800/90 dark:ring-teal-900" data-testid="rainbow-speed-panel" data-speed={target}>
      <div className="grid justify-items-center text-center leading-tight">
        <span className="text-5xl" aria-hidden>
          {info.icon}
        </span>
        <span className="text-lg font-black uppercase" data-testid="rainbow-speed-target">
          {info.label}
        </span>
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-semibold">{graded ? info.cue : `${info.icon} Đổi tốc độ: ${info.label.toLowerCase()} — bấm nốt đầu chặng (chưa tính)`}</p>
        <div className="relative h-5 rounded-full bg-gradient-to-r from-sky-200 via-slate-100 to-rose-200 dark:from-sky-900 dark:via-slate-700 dark:to-rose-900" aria-label="Đồng hồ tốc độ: trái chậm, phải nhanh">
          <span className="absolute top-0 h-5 rounded-full bg-emerald-400/70 ring-2 ring-emerald-600" style={{ left: `${gaugePos(hi)}%`, width: `${gaugePos(lo) - gaugePos(hi)}%` }} />
          <span className="absolute -top-1 text-[11px] font-bold" style={{ left: 2 }}>
            🐌
          </span>
          <span className="absolute -top-1 right-1 text-[11px] font-bold">🐆</span>
          {needle !== null && <span className="absolute -top-1 h-7 w-1.5 -translate-x-1/2 rounded bg-slate-900 dark:bg-white" style={{ left: `${gaugePos(needle)}%` }} data-testid="rainbow-speed-needle" />}
        </div>
        <p className={`h-5 text-sm font-bold ${lastEvent?.kind === 'ok' ? 'text-emerald-700 dark:text-emerald-300' : lastEvent && lastEvent.kind !== 'free' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}`} data-testid="rainbow-speed-feedback">
          {lastEvent ? EVENT_TEXT[lastEvent.kind] : ''}
          {nextChange ? `  · Sắp đổi → ${SPEED_INFO[nextChange].icon} ${SPEED_INFO[nextChange].label}` : ''}
        </p>
      </div>
      <div className="grid justify-items-center text-center" aria-label={`Nguy hiểm ${danger}/3`} data-testid="rainbow-danger" data-danger={danger}>
        <span className="text-xs font-bold text-slate-500">Nguy hiểm</span>
        <span className="text-2xl">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < danger ? '' : 'opacity-20 grayscale'}>
              ⚠️
            </span>
          ))}
        </span>
      </div>
    </section>
  );
}

const HAZARD_ART: Record<Hazard, { icon: string; warn: string; caught: string; anim: string }> = {
  crocodile: { icon: '🐊', warn: 'Chậm quá! Cá sấu tới gần', caught: 'Cá sấu đớp mất rồi!', anim: 'animate-bounce' },
  lightning: { icon: '⚡', warn: 'Nhanh quá! Sét đánh', caught: 'Sét đánh trúng rồi!', anim: 'animate-pulse' },
  log: { icon: '🪵', warn: 'Nhanh quá! Củi rơi', caught: 'Khúc củi đập trúng rồi!', anim: 'animate-bounce' },
};

/** Hoạt hình cảnh báo trong cảnh cầu vồng (không chặn thao tác). */
export function HazardOverlay({ event }: { event: SpeedEvent | null }) {
  const hazard = event?.caught ?? event?.hazard ?? null;
  if (!event || !hazard) return null;
  const art = HAZARD_ART[hazard];
  const caught = !!event.caught;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center" data-testid="rainbow-hazard" data-hazard={hazard} data-caught={caught}>
      <div className={`grid justify-items-center rounded-3xl px-6 py-3 text-center shadow-xl ${caught ? 'bg-rose-100/95 ring-4 ring-rose-400 dark:bg-rose-950/90' : 'bg-white/85 dark:bg-slate-900/85'}`}>
        <span className={`${caught ? 'text-8xl' : 'text-6xl'} ${art.anim}`}>{art.icon}</span>
        <span className="text-lg font-black">{caught ? art.caught : art.warn}</span>
        {caught && <span className="text-sm font-semibold">Không sao — chơi tiếp nào! (Không mất sticker)</span>}
      </div>
    </div>
  );
}

// ── Cài đặt ──────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="min-w-40 font-semibold">{label}</span>
      {children}
    </div>
  );
}

export function RhythmSpeedSettings({ settings, micOnly, onChange }: { settings: RainbowSettings; micOnly: boolean; onChange: (p: Partial<RainbowSettings>) => void }) {
  if (settings.mode === 'durations') {
    return (
      <>
        <Row label="Mẫu trường độ">
          <div className="flex flex-wrap gap-1.5" data-testid="rainbow-rhythm-patterns">
            {RHYTHM_PATTERN_IDS.map((id: RhythmPatternId) => (
              <Button key={id} variant={settings.rhythm === id ? 'primary' : 'secondary'} className="min-h-10 px-3 text-sm" onClick={() => onChange({ rhythm: id })} aria-pressed={settings.rhythm === id}>
                {RHYTHM_PATTERNS[id].label}
              </Button>
            ))}
          </div>
        </Row>
        <p className="-mt-2 text-xs text-slate-500">
          Tròn 4 phách · trắng 2 · đen 1 · móc đơn ½ · móc kép ¼. Máy đếm nhịp chạy đều; app chấm lúc bấm và{' '}
          {micOnly ? 'KHÔNG đo giữ phím vì đang dùng micro (micro không biết lúc thả phím).' : 'thời gian giữ phím (đàn MIDI / bàn phím ảo). Thả phím lúc đang đạp pedal không bị tính nhả sớm.'}{' '}
          Móc kép nhanh — nên chọn ♩=40–60.
        </p>
      </>
    );
  }
  if (settings.mode !== 'speed') return null;
  return (
    <>
      <Row label="Tay luyện">
        <Segmented
          value={settings.speedHands}
          onChange={(speedHands: HandSet) => onChange({ speedHands })}
          options={[
            { value: 'right', label: 'Tay phải' },
            { value: 'left', label: 'Tay trái' },
            { value: 'both', label: 'Hai tay' },
          ]}
        />
      </Row>
      <div className="grid gap-1" data-testid="rainbow-speed-choices">
        <span className="font-semibold">Tốc độ máy được đưa ra</span>
        <div className="flex flex-wrap gap-3">
          {SPEED_IDS.map((id: SpeedId) => {
            const on = settings.speeds.includes(id);
            const [lo, hi] = speedBand(id, settings.speedEase);
            return (
              <Toggle
                key={id}
                checked={on}
                onChange={(v) => {
                  const next = v ? SPEED_IDS.filter((x) => x === id || settings.speeds.includes(x)) : settings.speeds.filter((x) => x !== id);
                  if (next.length) onChange({ speeds: next });
                }}
                label={`${SPEED_INFO[id].icon} ${SPEED_INFO[id].label} (${(lo / 1000).toLocaleString('vi-VN')}–${(hi / 1000).toLocaleString('vi-VN')} s/nốt)`}
              />
            );
          })}
        </div>
      </div>
      <Row label="Đổi tốc độ sau mỗi">
        <Segmented value={String(settings.speedSegment)} onChange={(v) => onChange({ speedSegment: Number(v) as RainbowSettings['speedSegment'] })} options={SPEED_SEGMENT_CHOICES.map((n) => ({ value: String(n), label: n === 15 ? 'cả vòng' : `${n} nốt` }))} />
      </Row>
      <Row label="Vòng đạt khi đúng tốc độ ≥">
        <Segmented value={String(settings.passOnTime)} onChange={(v) => onChange({ passOnTime: Number(v) })} options={ON_TIME_CHOICES.map((x) => ({ value: String(x), label: `${Math.round(x * 100)}%` }))} />
      </Row>
      <Row label="Mức">
        <Segmented
          value={settings.speedEase}
          onChange={(speedEase: RainbowSettings['speedEase']) => onChange({ speedEase })}
          options={[
            { value: 'easy', label: 'Dễ (bé nhỏ, dải rộng)' },
            { value: 'normal', label: 'Chuẩn' },
          ]}
        />
      </Row>
      <p className="-mt-2 text-xs text-slate-500">
        Không theo nhịp nhạc: app đo khoảng cách giữa hai lần bấm đúng. Chậm quá → cá sấu, nhanh quá → sét / khúc củi; 3 lần → "bị bắt" (hoạt hình rồi chơi tiếp, không mất sticker).
        Nốt đầu mỗi chặng không tính.{micOnly ? ' Micro: thật nhanh có thể khó nhận — nên dùng đàn MIDI.' : ''}
      </p>
    </>
  );
}

/** Mô tả ngắn của chế độ (màn Sẵn sàng). */
export function modeDetail(settings: RainbowSettings): string | null {
  if (settings.mode === 'durations') return `🎼 ${RHYTHM_PATTERNS[settings.rhythm].label}`;
  if (settings.mode === 'speed') return `Máy đưa ra: ${settings.speeds.map((s) => `${SPEED_INFO[s].icon} ${SPEED_INFO[s].label}`).join(' · ')}`;
  return null;
}

// ── Tổng kết ─────────────────────────────────────────────────────────────────

function Stat({ label, value, testId }: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="rounded-2xl bg-amber-50 p-2 dark:bg-slate-700" data-testid={testId}>
      <dt className="text-xs text-slate-500 dark:text-slate-300">{label}</dt>
      <dd className="text-lg font-black">{value}</dd>
    </div>
  );
}

export function HoldResults({ summary, hands }: { summary: Summary; hands: readonly Hand[] }) {
  const rows = hands.map((h) => [h, summary.hands[h]] as const).filter((x): x is readonly [Hand, HandStats] => !!x[1]);
  if (!rows.some(([, s]) => s.holdFull + s.holdShort + s.holdUnmeasured > 0)) return null;
  return (
    <dl className="grid w-full grid-cols-2 gap-2" data-testid="rainbow-hold-results">
      {rows.map(([h, s]) => (
        <Stat key={h} label={`${HAND_TITLE[h]}: giữ đủ · nhả sớm · không đo`} value={`${s.holdFull} · ${s.holdShort} · ${s.holdUnmeasured}`} testId={`rainbow-hold-stat-${h}`} />
      ))}
    </dl>
  );
}

export function SpeedResults({ stats, caught }: { stats: SpeedStats; caught: readonly Hazard[] }) {
  const used = SPEED_IDS.filter((id) => stats.bySpeed[id].graded > 0);
  return (
    <dl className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4" data-testid="rainbow-speed-results">
      <Stat label="Đúng tốc độ" value={`${stats.ok}/${stats.graded}`} testId="rainbow-speed-ok" />
      {used.map((id) => {
        const s = stats.bySpeed[id];
        return <Stat key={id} label={`${SPEED_INFO[id].icon} ${SPEED_INFO[id].label}: đúng · chậm · nhanh`} value={`${s.ok} · ${s.slow} · ${s.fast}`} />;
      })}
      <Stat label="Bị bắt (không trừ gì)" value={caught.length ? caught.map((c) => HAZARD_ART[c].icon).join('') : '0'} testId="rainbow-speed-caught" />
    </dl>
  );
}
