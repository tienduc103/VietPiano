import { formatNumber } from '../../core/coach/scoring/context';
import type { CriterionScore } from '../../core/coach/types';

/** Mức của một tiêu chí: biểu tượng + chữ đi kèm màu (không chỉ dựa vào màu). */
export function criterionStatus(v: number): { icon: string; label: string; bar: string; text: string } {
  if (v >= 0.85) return { icon: '✓', label: 'Tốt', bar: 'bg-violet-500 dark:bg-violet-400', text: 'text-violet-700 dark:text-violet-300' };
  if (v >= 0.6) return { icon: '△', label: 'Cần luyện thêm', bar: 'bg-amber-500 dark:bg-amber-400', text: 'text-amber-700 dark:text-amber-300' };
  return { icon: '✗', label: 'Yếu', bar: 'bg-rose-500 dark:bg-rose-400', text: 'text-rose-700 dark:text-rose-300' };
}

/**
 * Điểm từng tiêu chí: mỗi hàng một meter (tỉ lệ so với 100%, rãnh cùng tông nhạt), phần trăm + điểm / trọng số bằng chữ.
 * Tiêu chí không đo được → "chưa đủ điều kiện chấm" kèm lý do, trọng số đã chia lại cho tiêu chí khác.
 */
export function CriteriaMeters({ criteria }: { criteria: readonly CriterionScore[] }) {
  return (
    <ul className="grid gap-3" data-testid="coach-criteria" aria-label="Điểm từng tiêu chí">
      {criteria.map((c) => {
        if (c.value === null)
          return (
            <li key={c.key} className="text-sm" data-testid={`coach-criterion-${c.key}`} data-value="null">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold text-slate-500 dark:text-slate-400">{c.label}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">chưa đủ điều kiện chấm</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.reason}</p>
            </li>
          );
        const pct = Math.round(c.value * 100);
        const st = criterionStatus(c.value);
        return (
          <li key={c.key} data-testid={`coach-criterion-${c.key}`} data-value={pct} title={`${c.label}: ${pct}% — ${formatNumber(Math.round(c.points * 10) / 10)}/${Math.round(c.effectiveWeight)} điểm`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{c.label}</span>
              <span className="tabular-nums">
                <span className={`font-bold ${st.text}`}>
                  {st.icon} {pct}%
                </span>
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                  {formatNumber(Math.round(c.points * 10) / 10)}/{Math.round(c.effectiveWeight)} điểm
                </span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-violet-100 dark:bg-slate-700" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${c.label} ${pct}%, ${st.label}`}>
              <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            {c.subScores.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {c.subScores
                  .filter((s) => s.value !== null)
                  .map((s) => `${s.label} ${Math.round((s.value as number) * 100)}%`)
                  .join(' · ')}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Sparkline điểm các lần chấm (một chuỗi: không cần chú giải; điểm cuối nhấn mạnh; chú thích từng điểm). */
export function ScoreSparkline({ points, width = 220, height = 56 }: { points: readonly { total: number; at: number }[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const pad = 6;
  const x = (i: number) => pad + (i * (width - 2 * pad)) / (points.length - 1);
  const y = (v: number) => pad + ((100 - v) * (height - 2 * pad)) / 100;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.total).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Điểm ${points.length} lần gần nhất: ${points.map((p) => p.total).join(', ')}`} className="overflow-visible">
      <path d={d} fill="none" strokeWidth={2} className="stroke-violet-500 dark:stroke-violet-400" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.total)} r={i === points.length - 1 ? 5 : 4} className={i === points.length - 1 ? 'fill-violet-600 stroke-white dark:fill-violet-300 dark:stroke-slate-800' : 'fill-white stroke-violet-500 dark:fill-slate-800 dark:stroke-violet-400'} strokeWidth={2}>
          <title>{`${new Date(p.at).toLocaleString('vi-VN')}: ${p.total}/100`}</title>
        </circle>
      ))}
      <text x={x(points.length - 1)} y={y(last.total) - 9} textAnchor="end" className="fill-slate-700 text-[11px] font-semibold dark:fill-slate-200">
        {last.total}
      </text>
    </svg>
  );
}
