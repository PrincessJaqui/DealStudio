/**
 * BusinessModelSection — investor-facing revenue model. Reads the admin's model
 * (revenues + tiers) and presents a Projected Revenue banner, stream cards, a
 * tabbed assumptions calculator, a green mix + global-metrics card, and a
 * growth-projections table. Investors adjust the numbers as a what-if; the
 * data-entry grid stays admin-only.
 */
import { useMemo, useState } from 'react';
import { computeBusinessModel, revenueMonthly } from '../../lib/dealStudio';
import type { DealBusinessModel } from '../../lib/dealStudio';
import { useInViewOnce } from '../../lib/useInViewOnce';


const fmtCompact = (n: number) => {
  if (!isFinite(n) || n <= 0) return '$0';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
};
const fmtFull = (n: number) => `$${Math.round(isFinite(n) ? n : 0).toLocaleString()}`;
const fmtCents = (n: number) => `$${Math.round(isFinite(n) ? n : 0).toLocaleString()}`;
const shortLabel = (t: string) => (t.includes('&') ? t.split('&').pop()!.trim() : t) || 'Revenue';

type Row = { icon: '#' | '$' | '%'; label: string; suffix?: string; value: number; onChange: (n: number) => void };

function AssumptionRow({ row }: { row: Row }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const display = editing ? draft : (Number.isFinite(row.value) ? row.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0');
  return (
    <div className="ds-pulse ds-card flex items-center gap-3 rounded-xl border border-[#eceef0] bg-white p-3">
      <div className="w-11 h-11 rounded-xl bg-[#76b252] text-white flex items-center justify-center text-lg font-bold shrink-0">{row.icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-[#7f8c85] leading-tight">{row.label}</p>
        <div className="flex items-center">
          {row.icon === '$' && <span className="text-sm font-semibold text-[#191f1d]">$</span>}
          <input
            type="text" inputMode="decimal"
            value={display}
            onFocus={() => { setEditing(true); setDraft(row.value ? String(row.value) : ''); }}
            onBlur={() => setEditing(false)}
            onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); setDraft(raw); row.onChange(parseFloat(raw) || 0); }}
            className="w-full bg-transparent text-sm font-semibold text-[#191f1d] outline-none"
          />
        </div>
      </div>
      {row.suffix && <span className="text-sm text-[#99a1af] shrink-0">{row.suffix}</span>}
    </div>
  );
}

export function BusinessModelSection({ model }: { model: DealBusinessModel }) {
  const [local, setLocal] = useState<DealBusinessModel>(() => model || { revenues: [], annualGrowthRate: 0 });
  const [active, setActive] = useState(0);
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const revenues = local.revenues || [];
  const totals = useMemo(() => computeBusinessModel(local), [local]);
  if (revenues.length === 0) return null;

  const updateTier = (ri: number, ti: number, patch: Partial<DealBusinessModel['revenues'][number]['tiers'][number]>) =>
    setLocal(m => ({ ...m, revenues: m.revenues.map((r, i) => i === ri ? { ...r, tiers: r.tiers.map((t, j) => j === ti ? { ...t, ...patch } : t) } : r) }));
  const updateImpacted = (ri: number, ti: number, ii: number, patch: any) =>
    setLocal(m => ({ ...m, revenues: m.revenues.map((r, i) => i === ri ? { ...r, tiers: r.tiers.map((t, j) => j === ti ? { ...t, impactedTiers: (t.impactedTiers || []).map((x, k) => k === ii ? { ...x, ...patch } : x) } : t) } : r) }));

  const stream = revenues[active];
  const rows: Row[] = [];
  (stream?.tiers || []).forEach((t, ti) => {
    rows.push({ icon: t.unitType === 'percentage' ? '%' : '$', suffix: t.unitType === 'percentage' ? '%' : undefined, label: t.tierName || 'Amount', value: t.presetAmount, onChange: n => updateTier(active, ti, { presetAmount: n }) });
    rows.push({ icon: '#', label: t.customerName || 'Quantity', value: t.quantity, onChange: n => updateTier(active, ti, { quantity: n }) });
    if (t.unitType === 'percentage') rows.push({ icon: '$', label: `Average Value${t.tierName ? ` (${t.tierName})` : ''}`, value: t.avgValue || 0, onChange: n => updateTier(active, ti, { avgValue: n }) });
    (t.impactedTiers || []).forEach((it, ii) => {
      rows.push({ icon: it.unitType === 'percentage' ? '%' : '$', suffix: it.unitType === 'percentage' ? '%' : undefined, label: it.tierName || 'Impacted', value: it.presetAmount, onChange: n => updateImpacted(active, ti, ii, { presetAmount: n }) });
    });
  });

  const annualOf = (i: number) => revenueMonthly(revenues[i]) * 12;

  return (
    <div ref={ref} data-section="business_model" className={`rounded-2xl border border-[#edf0f3] bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5 ${inView ? 'ds-animate' : ''}`}>
      <h2 className="text-sm font-bold text-[#191f1d]">Business Model</h2>
      <p className="mt-1 text-sm text-[#7f8c85] leading-relaxed">Tap a stream, then adjust the numbers to model your own assumptions.</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        {/* LEFT: projected revenue + stream cards */}
        <div className="space-y-4">
          <div className="rounded-2xl bg-gradient-to-br from-[#5d8f41] to-[#76b252] px-6 py-5 text-white shadow-[0_4px_16px_-4px_rgba(63,102,41,0.5)]">
            <p className="text-sm font-semibold text-white/90">Projected Year 1 Revenue</p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-right">{fmtFull(totals.totalAnnual)}</p>
          </div>

          {revenues.map((r, i) => {
            const on = active === i;
            return (
              <button key={r.id} type="button" onClick={() => setActive(i)}
                style={{ animationDelay: `${i * 180}ms` }}
                className={`ds-pulse ds-card w-full text-left rounded-2xl border p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)] transition-colors ${on ? 'border-[#cce4b8] bg-[#eef6e6]' : 'border-[#edf0f3] bg-white hover:bg-[#f9fafb]'}`}>
                <div className="flex items-center gap-4">
                  <div className="w-[88px] h-[88px] rounded-full bg-gradient-to-br from-[#5d8f41] to-[#76b252] flex flex-col items-center justify-center text-white shrink-0">
                    <span className="text-base font-bold leading-none">{fmtCompact(annualOf(i))}</span>
                    <span className="mt-1 text-[10px] font-medium text-white/85">Annually</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-bold text-[#191f1d] truncate">{r.name || `Revenue ${i + 1}`}</span>
                      {Math.round(totals.revenues[i]?.pctOfTotal || 0) > 0 && <span className="text-[12px] font-bold text-[#76b252] shrink-0">{Math.round(totals.revenues[i]?.pctOfTotal || 0)}%</span>}
                    </div>
                    {r.details && <p className="mt-1 text-[13px] leading-[1.25] text-[#4a5565]">{r.details}</p>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* RIGHT: tabs + assumptions */}
        <div>
          {revenues.length > 1 && (
            <div className="inline-flex w-full items-center gap-1 rounded-full bg-[#f5f5f5] p-1 overflow-x-auto [&::-webkit-scrollbar]:hidden mb-4">
              {revenues.map((r, i) => (
                <button key={r.id} type="button" onClick={() => setActive(i)}
                  className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${active === i ? 'bg-gradient-to-br from-[#5d8f41] to-[#76b252] text-white shadow-sm' : 'text-[#7f8c85] hover:text-[#191f1d]'}`}>
                  {shortLabel(r.name)}
                </button>
              ))}
            </div>
          )}

          {stream && (
            <div className="rounded-2xl border border-[#edf0f3] bg-[#fafbfc] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.05)]">
              <p className="text-[15px] font-bold text-[#191f1d]">{stream.name || 'Revenue'}</p>
              <p className="text-xs text-[#7f8c85] mb-3">Set Assumptions</p>
              {rows.length === 0 ? (
                <p className="text-sm text-[#99a1af]">No adjustable assumptions for this stream.</p>
              ) : (
                <div className="space-y-2.5">
                  {rows.map((row, i) => <AssumptionRow key={i} row={row} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Green card: revenue mix + global metrics */}
      <div className="mt-6 grid gap-6 rounded-2xl bg-gradient-to-br from-[#5d8f41] to-[#6fa74b] p-6 text-white lg:grid-cols-2">
        <div>
          <h3 className="text-base font-bold mb-4">Revenue Mix</h3>
          <div className="space-y-3">
            {totals.revenues.map((r) => (
              <div key={r.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wide text-white/85">Actual {r.name}</span>
                  <span className="font-bold">{Math.round(r.pctOfTotal)}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                  <div className="ds-bar h-full rounded-full bg-white" style={{ width: `${Math.min(100, r.pctOfTotal)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold mb-4">Global Metrics</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-white/85">Total Monthly Revenue</span><span className="text-sm font-bold">{fmtCents(totals.totalMonthly)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-white/85">Total Annual Revenue</span><span className="text-sm font-bold">{fmtCents(totals.totalAnnual)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-white/85">Revenue per User</span><span className="text-sm font-bold">{fmtCents(totals.revenuePerUser)}</span></div>
          </div>
        </div>
      </div>

      {/* Growth projections */}
      <div className="mt-6 rounded-2xl border border-[#e6e9ec] bg-[#f2f4f6] p-6 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-[#191f1d]">Growth Assumptions</h3>
            <p className="text-xs text-[#7f8c85]">Set growth rate</p>
          </div>
          <div className="text-right w-fit">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#7f8c85]">Set Annual Growth Rate</p>
            <div className="ds-card mt-1 ml-auto flex items-center rounded-lg border border-[#e5e7eb] bg-white px-3 py-1.5 w-28">
              <input type="number" min={0} value={Number.isFinite(local.annualGrowthRate) ? local.annualGrowthRate : 0}
                onChange={e => setLocal(m => ({ ...m, annualGrowthRate: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-transparent text-sm font-medium text-[#191f1d] outline-none text-right" />
              <span className="text-sm text-[#99a1af]">%</span>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-[#e6e9ec] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-[#5d8f41] to-[#76b252] text-white text-left text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-4">Metric</th>
                  {totals.growth.map(g => <th key={g.year} className="py-2.5 px-4 text-right">Year {g.year}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#f2f4f6]"><td className="py-2.5 px-4 font-medium text-[#191f1d]">Total Users</td>{totals.growth.map(g => <td key={g.year} className="py-2.5 px-4 text-right text-[#4a5565]">{g.users.toLocaleString()}</td>)}</tr>
                <tr><td className="py-2.5 px-4 font-medium text-[#191f1d]">Total Revenue</td>{totals.growth.map((g, i) => <td key={g.year} className={`py-2.5 px-4 text-right font-semibold ${i === totals.growth.length - 1 ? 'text-[#5d8f41]' : 'text-[#191f1d]'}`}>{fmtCents(g.annual)}</td>)}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
