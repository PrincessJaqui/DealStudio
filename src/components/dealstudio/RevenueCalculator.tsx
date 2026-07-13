/**
 * RevenueCalculator — the shared revenue-model tool used by the admin editor
 * (admin=true, full structural editing) and the investor deal studio
 * (admin=false, investors adjust the numbers as a what-if). Both drive the same
 * DealBusinessModel and the same math in lib/dealStudio.
 */
import type { ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  computeBusinessModel,
  type DealBusinessModel, type RevenueStream, type PricingTier, type ImpactedTier,
  type CalcUnit, type CalcFreq,
} from '../../lib/dealStudio';

const genId = () => Math.random().toString(36).slice(2, 9);
const fmtUsd = (n: number) => `$${Math.round(isFinite(n) ? n : 0).toLocaleString()}`;
const fmtWhole = (n: number) => `$${Math.round(isFinite(n) ? n : 0).toLocaleString()}`;

const newImpacted = (): ImpactedTier => ({ id: genId(), tierName: '', unitType: 'percentage', presetAmount: 0, frequency: 'per_event' });
const newTier = (): PricingTier => ({ id: genId(), tierName: '', unitType: 'currency', presetAmount: 0, frequency: 'monthly', customerName: '', quantity: 0, avgValue: 0, impacts: false, impactedTiers: [] });
const newRevenue = (): RevenueStream => ({ id: genId(), name: '', details: '', target: 0, tiers: [newTier()] });

const UNIT_OPTS: { v: CalcUnit; label: string }[] = [
  { v: 'currency', label: 'Currency' },
  { v: 'percentage', label: 'Percentage' },
];
const FREQ_OPTS: { v: CalcFreq; label: string }[] = [
  { v: 'monthly', label: 'Per Month' },
  { v: 'per_event', label: 'Per Event' },
  { v: 'yearly', label: 'Yearly' },
];
const unitSuffix = (u: CalcUnit) => (u === 'percentage' ? '%' : '$');

/** White field box with a label, matching the mockup. */
function Box({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg bg-white border border-[#eceef0] px-3 py-2 min-w-0">
      <p className="text-[10px] text-[#7f8c85] mb-0.5 truncate">{label}</p>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, suffix, disabled, step }: { value: number; onChange: (n: number) => void; suffix?: string; disabled?: boolean; step?: number }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" inputMode="decimal" min={0} step={step ?? 1} disabled={disabled}
        value={Number.isFinite(value) ? value : 0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-transparent text-sm font-medium text-[#191f1d] outline-none disabled:text-[#4a5565]"
      />
      {suffix && <span className="text-xs text-[#99a1af] shrink-0">{suffix}</span>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (s: string) => void; placeholder?: string; disabled?: boolean }) {
  if (disabled) return <p className="text-sm font-medium text-[#191f1d] truncate">{value || <span className="text-[#9ca3af]">{placeholder}</span>}</p>;
  return <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} className="w-full bg-transparent text-sm font-medium text-[#191f1d] placeholder:text-[#9ca3af] outline-none" />;
}

function Select<T extends string>({ value, onChange, opts, disabled }: { value: T; onChange: (v: T) => void; opts: { v: T; label: string }[]; disabled?: boolean }) {
  if (disabled) return <p className="text-sm font-medium text-[#191f1d]">{opts.find(o => o.v === value)?.label || value}</p>;
  return (
    <select value={value} onChange={e => onChange(e.target.value as T)} className="w-full bg-transparent text-sm font-medium text-[#191f1d] outline-none">
      {opts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

export function RevenueCalculator({ value, onChange, admin }: { value: DealBusinessModel; onChange: (m: DealBusinessModel) => void; admin: boolean }) {
  const m: DealBusinessModel = { revenues: value?.revenues || [], annualGrowthRate: value?.annualGrowthRate || 0 };
  const totals = computeBusinessModel(m);

  const setRev = (ri: number, patch: Partial<RevenueStream>) => onChange({ ...m, revenues: m.revenues.map((r, i) => i === ri ? { ...r, ...patch } : r) });
  const setTier = (ri: number, ti: number, patch: Partial<PricingTier>) => setRev(ri, { tiers: m.revenues[ri].tiers.map((t, i) => i === ti ? { ...t, ...patch } : t) });
  const setImp = (ri: number, ti: number, ii: number, patch: Partial<ImpactedTier>) => setTier(ri, ti, { impactedTiers: (m.revenues[ri].tiers[ti].impactedTiers || []).map((x, i) => i === ii ? { ...x, ...patch } : x) });

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-[#191f1d]">Revenue Model Calculator</h2>
          <p className="text-sm text-[#7f8c85]">Set quantities and pricing to model your revenue mix</p>
        </div>
        {admin && (
          <button type="button" onClick={() => onChange({ ...m, revenues: [...m.revenues, newRevenue()] })}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] px-4 py-2 text-sm font-semibold text-white shadow-sm shrink-0">
            <Plus className="w-4 h-4" /> New Revenue
          </button>
        )}
      </div>

      {m.revenues.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-8 text-center">
          <p className="text-sm text-[#99a1af]">
            No business model created yet.{admin ? ' Add a revenue stream to start modeling.' : ''}
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {m.revenues.map((r, ri) => {
            const rMonthly = totals.revenues[ri]?.monthly || 0;
            return (
              <div key={r.id} className="self-start rounded-2xl border border-[#edf0f3] bg-white p-5 shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-bold text-[#191f1d]">{r.name || `Revenue ${ri + 1}`}</span>
                  {admin && (
                    <button type="button" onClick={() => onChange({ ...m, revenues: m.revenues.filter((_, i) => i !== ri) })}
                      className="rounded-lg p-1.5 text-[#99a1af] hover:bg-[#fef2f2] hover:text-[#dc2626]" aria-label="Remove revenue"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>

                <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-[#7f8c85]">Name</label>
                <div className="mt-1 rounded-lg bg-[#f2f4f6] px-3 py-2"><TextInput value={r.name} placeholder="Subscriptions" disabled={!admin} onChange={v => setRev(ri, { name: v })} /></div>

                <label className="mt-3 block text-[11px] font-bold uppercase tracking-wider text-[#7f8c85]">Details</label>
                <div className="mt-1 rounded-lg bg-[#f2f4f6] px-3 py-2">
                  {admin
                    ? <textarea value={r.details} placeholder="What this stream is" onChange={e => setRev(ri, { details: e.target.value })} className="w-full bg-transparent text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none resize-none min-h-[40px]" />
                    : <p className="text-sm text-[#4a5565]">{r.details}</p>}
                </div>

                {/* Pricing tiers */}
                <div className="mt-4 space-y-3">
                  {r.tiers.map((t, ti) => (
                    <div key={t.id} className="rounded-xl bg-[#f7f7f8] p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-2">Pricing Tier</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Box label="Tier Name"><TextInput value={t.tierName} placeholder="Facility Pro Plan" disabled={!admin} onChange={v => setTier(ri, ti, { tierName: v })} /></Box>
                        <Box label="Unit Type"><Select value={t.unitType} opts={UNIT_OPTS} disabled={!admin} onChange={v => setTier(ri, ti, { unitType: v })} /></Box>
                        <Box label="Preset Amount"><NumInput value={t.presetAmount} suffix={unitSuffix(t.unitType)} step={0.01} onChange={v => setTier(ri, ti, { presetAmount: v })} /></Box>
                        <Box label="Frequency"><Select value={t.frequency} opts={FREQ_OPTS} disabled={!admin} onChange={v => setTier(ri, ti, { frequency: v })} /></Box>
                        <Box label="Customer Name"><TextInput value={t.customerName} placeholder="Facility" disabled={!admin} onChange={v => setTier(ri, ti, { customerName: v })} /></Box>
                        <div className="flex items-stretch gap-1">
                          <div className="flex-1"><Box label="Quantity"><NumInput value={t.quantity} suffix="#" onChange={v => setTier(ri, ti, { quantity: v })} /></Box></div>
                          {admin && <button type="button" onClick={() => setRev(ri, { tiers: r.tiers.filter((_, i) => i !== ti) })} className="rounded-lg px-1 text-[#99a1af] hover:text-[#dc2626]" aria-label="Remove tier"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                        {t.unitType === 'percentage' && (
                          <div className="col-span-2"><Box label="Average Value Per Unit"><NumInput value={t.avgValue || 0} suffix="$" step={0.01} onChange={v => setTier(ri, ti, { avgValue: v })} /></Box></div>
                        )}
                      </div>

                      <label className="mt-2 flex items-center gap-2 text-xs text-[#4a5565] cursor-pointer">
                        <input type="checkbox" checked={!!t.impacts} disabled={!admin} onChange={e => setTier(ri, ti, { impacts: e.target.checked })} />
                        This tier impacts another tier
                      </label>

                      {t.impacts && (
                        <div className="mt-2 rounded-xl bg-[var(--ds-accent-tint)] border border-[var(--ds-accent)] p-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-2">Impacted Tier</p>
                          <div className="space-y-2">
                            {(t.impactedTiers || []).map((it, ii) => (
                              <div key={it.id} className="grid grid-cols-2 gap-2">
                                <Box label="Tier Name"><TextInput value={it.tierName} placeholder="Participant" disabled={!admin} onChange={v => setImp(ri, ti, ii, { tierName: v })} /></Box>
                                <Box label="Unit Type"><Select value={it.unitType} opts={UNIT_OPTS} disabled={!admin} onChange={v => setImp(ri, ti, ii, { unitType: v })} /></Box>
                                <Box label="Preset Amount"><NumInput value={it.presetAmount} suffix={unitSuffix(it.unitType)} step={0.01} onChange={v => setImp(ri, ti, ii, { presetAmount: v })} /></Box>
                                <div className="flex items-stretch gap-1">
                                  <div className="flex-1"><Box label="Frequency"><Select value={it.frequency} opts={FREQ_OPTS} disabled={!admin} onChange={v => setImp(ri, ti, ii, { frequency: v })} /></Box></div>
                                  {admin && <button type="button" onClick={() => setTier(ri, ti, { impactedTiers: (t.impactedTiers || []).filter((_, i) => i !== ii) })} className="rounded-lg px-1 text-[#99a1af] hover:text-[#dc2626]" aria-label="Remove impacted tier"><Trash2 className="w-4 h-4" /></button>}
                                </div>
                              </div>
                            ))}
                          </div>
                          {admin && (
                            <button type="button" onClick={() => setTier(ri, ti, { impactedTiers: [...(t.impactedTiers || []), newImpacted()] })} className="mt-2 ml-auto block text-xs font-semibold text-[var(--ds-brand)] hover:underline">+ Add More Impacted Tiers</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {admin && (
                  <button type="button" onClick={() => setRev(ri, { tiers: [...r.tiers, newTier()] })} className="mt-3 ml-auto block text-xs font-semibold text-[var(--ds-brand)] hover:underline">+ Add Pricing Tier</button>
                )}

                <div className="mt-4 border-t border-[#edf0f3] pt-3 space-y-2">
                  <div className="flex items-center justify-between"><span className="text-sm text-[#7f8c85]">Monthly Revenue</span><span className="text-sm font-bold text-[#191f1d]">{fmtUsd(rMonthly)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-sm font-semibold text-[#191f1d]">Annual Revenue</span><span className="text-sm font-bold text-[var(--ds-brand)]">{fmtUsd(rMonthly * 12)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {m.revenues.length > 0 && <ModelAnalytics value={m} onChange={onChange} />}
    </div>
  );
}

/** Revenue Mix Analysis, Global Metrics, and Growth Projections. Shared by the
 *  admin calculator and the investor view so the analytics stay identical. */
export function ModelAnalytics({ value, onChange }: { value: DealBusinessModel; onChange: (m: DealBusinessModel) => void }) {
  const m: DealBusinessModel = { revenues: value?.revenues || [], annualGrowthRate: value?.annualGrowthRate || 0 };
  const totals = computeBusinessModel(m);
  if (m.revenues.length === 0) return null;
  return (
    <>
      {/* Revenue Mix Analysis + Global Metrics */}
      <div className="mt-6 grid gap-6 rounded-2xl border border-[#edf0f3] bg-white p-6 shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] lg:grid-cols-[1.4fr_1fr]">
        <div>
          <h3 className="text-base font-bold text-[#191f1d] mb-4">Revenue Mix Analysis</h3>
          <div className="space-y-3">
            {totals.revenues.map((r) => (
              <div key={r.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold uppercase tracking-wide text-[#7f8c85]">Actual {r.name}</span>
                  <span className="font-bold text-[#191f1d]">{Math.round(r.pctOfTotal)}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#eef1f4] overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]" style={{ width: `${Math.min(100, r.pctOfTotal)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-base font-bold text-[#191f1d] mb-4">Global Metrics</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><span className="text-sm text-[#7f8c85]">Monthly Revenue</span><span className="text-base font-bold text-[var(--ds-brand)]">{fmtWhole(totals.totalMonthly)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-[#7f8c85]">Annual Revenue</span><span className="text-base font-bold text-[var(--ds-brand)]">{fmtWhole(totals.totalAnnual)}</span></div>
            <div className="flex items-center justify-between"><span className="text-sm text-[#7f8c85]">Revenue per User</span><span className="text-base font-bold text-[#191f1d]">{fmtWhole(totals.revenuePerUser)}</span></div>
          </div>
        </div>
      </div>

      {/* Growth Projections */}
      <div className="mt-6 rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-bold text-[#191f1d]">Growth Projections</h3>
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#7f8c85]">Annual Growth Rate</p>
            <div className="mt-1 rounded-lg bg-[#f2f4f6] px-3 py-1.5 w-28"><NumInput value={m.annualGrowthRate} suffix="%" onChange={v => onChange({ ...m, annualGrowthRate: v })} /></div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-[#7f8c85] border-b border-[#edf0f3]">
                <th className="py-2 pr-3">Metric</th>
                {totals.growth.map(g => <th key={g.year} className="py-2 px-3 text-right">Year {g.year}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#f2f4f6]"><td className="py-2 pr-3 font-medium text-[#191f1d]">Total Users</td>{totals.growth.map(g => <td key={g.year} className="py-2 px-3 text-right text-[#4a5565]">{g.users.toLocaleString()}</td>)}</tr>
              <tr><td className="py-2 pr-3 font-medium text-[#191f1d]">Total Revenue</td>{totals.growth.map(g => <td key={g.year} className={`py-2 px-3 text-right font-semibold ${g.year === 4 ? 'text-[var(--ds-brand)]' : 'text-[#191f1d]'}`}>{fmtWhole(g.annual)}</td>)}</tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
