/**
 * PricingSetup — one card per plan, with its add-ons nested inside it.
 *
 * Add-ons used to live in a separate list, which meant the thing you were
 * pricing and the extras that layer on it were in different places. Here an
 * add-on sits under the plan it belongs to, because that is the relationship.
 *
 * Nothing saves until Save is pressed on that plan, so a half-typed price never
 * reaches a customer's bill.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Check, EyeOff } from 'lucide-react';
import {
  adminListPlans, adminListAddons, adminSavePlan, adminDeletePlan,
  adminSaveAddonFull, adminDeleteAddon,
  type Addon, type UnitType, type Interval,
} from '../../lib/billing';

type Plan = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  unit_type: UnitType;
  interval: Interval;
  is_public: boolean;
  /** Not a secret. Sent to the browser on every checkout. The Stripe SECRET key
   *  lives in Vercel's environment and never touches this code or the database. */
  stripe_price_id: string | null;
};

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';
const box = 'rounded-2xl bg-[#f5f6f8] border border-[#edf0f3] p-4';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1';
const fieldWrap = 'rounded-xl bg-white border border-[#edf0f3] px-3 py-2';
const bare =
  'w-full bg-transparent text-sm text-[#191f1d] outline-none placeholder:text-[#b6bcc4]';

/** A labelled control with the label sitting inside the box, as in the mockup. */
function Field({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className={fieldWrap}>
      <span className="block text-[11px] text-[#9ca3af] mb-0.5">{label}</span>
      {children}
    </div>
  );
}

export function PricingSetup() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<Plan>>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      const [p, a] = await Promise.all([adminListPlans(), adminListAddons()]);
      setPlans(p as Plan[]);
      setAddons(a);
    } catch (e: any) {
      setError(e?.message || 'Could not load pricing');
      setPlans([]);
    }
  };
  useEffect(() => { void load(); }, []);

  const edit = (id: string, patch: Partial<Plan>) =>
    setDraft(d => ({ ...d, [id]: { ...d[id], ...patch } }));

  const val = <K extends keyof Plan>(p: Plan, k: K): Plan[K] =>
    (draft[p.id]?.[k] ?? p[k]) as Plan[K];

  const dirty = (id: string) => !!draft[id] && Object.keys(draft[id]).length > 0;

  const savePlan = async (p: Plan) => {
    setBusy(p.id); setError(''); setNote('');
    try {
      await adminSavePlan({
        id: p.id,
        name: String(val(p, 'name')),
        description: String(val(p, 'description') ?? ''),
        price_cents: Number(val(p, 'price_cents')),
        unit_type: val(p, 'unit_type'),
        interval: val(p, 'interval'),
        is_public: Boolean(val(p, 'is_public')),
      });
      setDraft(d => { const n = { ...d }; delete n[p.id]; return n; });
      setNote('Saved');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy('');
    }
  };

  const newPlan = async () => {
    setBusy('new'); setError('');
    try {
      await adminSavePlan({ name: 'New plan', price_cents: 2000, is_public: true });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not create');
    } finally {
      setBusy('');
    }
  };

  const removePlan = async (p: Plan) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    setBusy(p.id); setError('');
    try {
      await adminDeletePlan(p.id);
      await load();
    } catch (e: any) {
      // The server refuses if accounts are on it, and says so.
      setError(e?.message || 'Could not delete');
    } finally {
      setBusy('');
    }
  };

  /* ── add-ons ── */
  const addonsFor = (planId: string) => addons.filter(a => a.plan_id === planId);

  const addAddon = async (planId: string) => {
    setBusy(planId); setError('');
    try {
      await adminSaveAddonFull({
        plan_id: planId, name: '', price_cents: 500, unit: 'seat',
        unit_type: 'currency', interval: 'month',
      });
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not add');
    } finally {
      setBusy('');
    }
  };

  const saveAddon = async (a: Addon, patch: Partial<Addon>) => {
    const next = { ...a, ...patch };
    setAddons(list => list.map(x => (x.id === a.id ? next : x)));
    try {
      await adminSaveAddonFull({
        id: a.id,
        plan_id: next.plan_id,
        name: next.name,
        description: next.description,
        price_cents: next.price_cents,
        unit: next.unit,
        unit_type: next.unit_type ?? 'currency',
        interval: next.interval ?? 'month',
      });
    } catch (e: any) {
      setError(e?.message || 'Could not save add-on');
    }
  };

  const removeAddon = async (id: string) => {
    setBusy(id);
    try {
      await adminDeleteAddon(id);
      await load();
    } finally {
      setBusy('');
    }
  };

  if (plans === null) {
    return <div className={card}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-col sm:flex-row sm:items-center gap-3`}>
        <div>
          <h2 className="font-bold text-[#191f1d]">Set Pricing</h2>
          <p className="text-sm text-[#7f8c85]">
            Plans, and the add-ons that layer on top of them.
          </p>
        </div>
        <button
          onClick={() => void newPlan()}
          disabled={busy === 'new'}
          className="sm:ml-auto inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
        >
          {busy === 'new' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add New Plan
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {note && <p className="text-sm text-[var(--ds-accent-ink)]">{note}</p>}

      <div className="grid gap-4 lg:grid-cols-2 items-start">
      {plans.map((p, i) => (
        <div key={p.id} className={card}>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="font-bold text-[#191f1d]">
              {String(val(p, 'name') ?? '').trim() || `Plan ${i + 1}`}
            </h3>
            {!val(p, 'is_public') && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#eef0f3] text-[#7f8c85] text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wide">
                <EyeOff className="w-3 h-3" /> Private
              </span>
            )}
            {dirty(p.id) && (
              <button
                onClick={() => void savePlan(p)}
                disabled={busy === p.id}
                className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
              >
                {busy === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
            )}
          </div>

          <label className={lbl}>Name</label>
          <div className="flex items-center gap-2 mb-4">
            <input
              value={String(val(p, 'name'))}
              onChange={(e) => edit(p.id, { name: e.target.value })}
              placeholder="Pro Plan"
              className="flex-1 rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
            <button
              onClick={() => void removePlan(p)}
              aria-label="Delete plan"
              className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[#c7cdd4] hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <label className={lbl}>Details</label>
          <textarea
            value={String(val(p, 'description') ?? '')}
            onChange={(e) => edit(p.id, { description: e.target.value })}
            placeholder="What this plan includes."
            className="w-full mb-4 min-h-[80px] resize-y rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30 placeholder:text-[#b6bcc4]"
          />

          {/* Checkout refuses to run without this, and until now there was nowhere
              to put it. A price ID is not a secret: it is sent to the browser on
              every checkout. The Stripe SECRET key never comes near this app --
              it lives in Vercel's environment and nowhere else. */}
          <label className={lbl}>Stripe price ID</label>
          <input
            value={String(val(p, 'stripe_price_id') ?? '')}
            onChange={(e) => edit(p.id, { stripe_price_id: e.target.value.trim() })}
            placeholder="price_1AbCdEfGhIjKlMnO"
            spellCheck={false}
            className="w-full mb-1 rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm font-mono text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30 placeholder:text-[#b6bcc4]"
          />
          <p className="mb-4 text-xs text-[#9ca3af]">
            {val(p, 'stripe_price_id')
              ? 'Customers can be charged for this plan.'
              : 'Without this, checkout will refuse to start. Stripe dashboard, Product, Pricing.'}
          </p>

          {/* ── Pricing tier ── */}
          <div className={box}>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--ds-brand)] mb-3">
              Pricing tier
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Unit Type">
                <select
                  value={val(p, 'unit_type')}
                  onChange={(e) => edit(p.id, { unit_type: e.target.value as UnitType })}
                  className={`${bare} cursor-pointer`}
                >
                  <option value="currency">Currency</option>
                  <option value="percentage">Percentage</option>
                </select>
              </Field>

              <Field label="Set Price">
                <div className="flex items-center gap-2">
                  <input
                    value={(Number(val(p, 'price_cents')) / 100).toFixed(2)}
                    onChange={(e) => {
                      const n = Math.round(parseFloat(e.target.value || '0') * 100);
                      edit(p.id, { price_cents: Number.isFinite(n) ? n : 0 });
                    }}
                    inputMode="decimal"
                    className={bare}
                  />
                  <span className="text-xs text-[#9ca3af] shrink-0">
                    {val(p, 'unit_type') === 'percentage' ? '%' : 'USD'}
                  </span>
                </div>
              </Field>

              <Field label="Frequency">
                <select
                  value={val(p, 'interval')}
                  onChange={(e) => edit(p.id, { interval: e.target.value as Interval })}
                  className={`${bare} cursor-pointer`}
                >
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </Field>

              <label className="flex items-center gap-2 text-sm text-[#191f1d] cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={!val(p, 'is_public')}
                  onChange={(e) => edit(p.id, { is_public: !e.target.checked })}
                  className="h-4 w-4 rounded"
                />
                <span>
                  Private plan
                  <span className="block text-[11px] text-[#9ca3af]">
                    Hidden from customers. Assign it to an account directly.
                  </span>
                </span>
              </label>
            </div>

            {/* ── Add-ons ── */}
            <div className="mt-4 pt-4 border-t border-[#e6e9ec]">
              <div className="flex items-center gap-2 mb-3">
                <Check className="w-4 h-4 text-[var(--ds-accent-ink)]" />
                <span className="text-sm font-semibold text-[#191f1d]">Add-Ons</span>
              </div>

              {addonsFor(p.id).map(a => (
                <div key={a.id} className="rounded-2xl bg-[var(--ds-accent-tint)] p-4 mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-3">
                    Add-on
                  </p>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Add-On Name">
                      <input
                        defaultValue={a.name}
                        onBlur={(e) => { if (e.target.value !== a.name) void saveAddon(a, { name: e.target.value }); }}
                        placeholder="Additional User"
                        className={bare}
                      />
                    </Field>

                    <Field label="Unit Type">
                      <select
                        value={a.unit_type ?? 'currency'}
                        onChange={(e) => void saveAddon(a, { unit_type: e.target.value as UnitType })}
                        className={`${bare} cursor-pointer`}
                      >
                        <option value="currency">Currency</option>
                        <option value="percentage">Percentage</option>
                      </select>
                    </Field>

                    {/* Seat and deal add-ons cannot be BOUGHT without this, which
                        means the limits we enforce are dead ends until it is set. */}
                    <Field label="Stripe price ID">
                      <input
                        defaultValue={a.stripe_price_id ?? ''}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (a.stripe_price_id ?? '')) void saveAddon(a, { stripe_price_id: v || null });
                        }}
                        placeholder="price_1AbCdEf"
                        spellCheck={false}
                        className={`${bare} font-mono`}
                      />
                    </Field>

                    <Field label="Set Price">
                      <div className="flex items-center gap-2">
                        <input
                          defaultValue={(a.price_cents / 100).toFixed(2)}
                          onBlur={(e) => {
                            const n = Math.round(parseFloat(e.target.value || '0') * 100);
                            if (Number.isFinite(n) && n !== a.price_cents) void saveAddon(a, { price_cents: n });
                          }}
                          inputMode="decimal"
                          className={bare}
                        />
                        <span className="text-xs text-[#9ca3af] shrink-0">
                          {(a.unit_type ?? 'currency') === 'percentage' ? '%' : 'USD'}
                        </span>
                      </div>
                    </Field>

                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Field label="Frequency">
                          <select
                            value={a.interval ?? 'month'}
                            onChange={(e) => void saveAddon(a, { interval: e.target.value as Interval })}
                            className={`${bare} cursor-pointer`}
                          >
                            <option value="month">Monthly</option>
                            <option value="year">Yearly</option>
                          </select>
                        </Field>
                      </div>
                      <button
                        onClick={() => void removeAddon(a.id)}
                        disabled={busy === a.id}
                        aria-label="Delete add-on"
                        className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-white"
                      >
                        {busy === a.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              <button
                onClick={() => void addAddon(p.id)}
                disabled={busy === p.id}
                className="block ml-auto text-sm font-semibold text-[var(--ds-accent-ink)] hover:underline"
              >
                + Add More Add Ons
              </button>
            </div>
          </div>
        </div>
      ))}
      </div>

      {plans.length === 0 && (
        <div className={`${card} py-10 text-center`}>
          <p className="text-sm text-[#9ca3af]">No plans yet.</p>
        </div>
      )}
    </div>
  );
}
