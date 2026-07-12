/**
 * AddonsCard — priced extras that layer on top of a plan.
 *
 * An add-on can be attached to a single plan, or left on "Any plan" so it can
 * be applied wherever it makes sense. Switching one on for a particular account
 * happens in that account's dialog, not here: this screen defines what exists,
 * not who has it.
 */

import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Check } from 'lucide-react';
import {
  adminListAddons, adminSaveAddon, adminDeleteAddon, adminListPlans,
  type Addon,
} from '../../lib/billing';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';
const field =
  'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';

export function AddonsCard() {
  const [addons, setAddons] = useState<Addon[] | null>(null);
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  // New add-on form
  const [name, setName] = useState('');
  const [price, setPrice] = useState('5');
  const [unit, setUnit] = useState('seat');
  const [planId, setPlanId] = useState<string>('');

  const load = async () => {
    try {
      const [a, p] = await Promise.all([adminListAddons(), adminListPlans()]);
      setAddons(a);
      setPlans(p.map((x: any) => ({ id: x.id, name: x.name })));
    } catch (e: any) {
      setError(e?.message || 'Could not load add-ons');
      setAddons([]);
    }
  };
  useEffect(() => { void load(); }, []);

  const add = async () => {
    const cents = Math.round(parseFloat(price || '0') * 100);
    if (!name.trim() || Number.isNaN(cents)) { setError('Name and price are required'); return; }
    setBusy('add'); setError('');
    try {
      await adminSaveAddon({
        name: name.trim(),
        price_cents: cents,
        unit,
        plan_id: planId || null,
      });
      setName(''); setPrice('5');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setBusy('');
    }
  };

  const remove = async (id: string) => {
    setBusy(id); setError('');
    try {
      await adminDeleteAddon(id);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Could not delete');
    } finally {
      setBusy('');
    }
  };

  const planName = (id: string | null) =>
    id ? (plans.find(p => p.id === id)?.name ?? 'Unknown plan') : 'Any plan';

  return (
    <div className={`${card} mt-4`}>
      <h2 className="font-bold text-[#191f1d]">Add-ons</h2>
      <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">
        Priced extras that layer on a plan. Switch them on per account in the account dialog.
      </p>

      <div className="grid gap-2 sm:grid-cols-[1fr_100px_110px_1fr_auto]">
        <input
          className={field}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Additional team member"
        />
        <input
          className={field}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="5"
        />
        <select className={field} value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="seat">per seat</option>
          <option value="each">each</option>
          <option value="month">per month</option>
        </select>
        <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          <option value="">Any plan</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button
          onClick={() => void add()}
          disabled={busy === 'add' || !name.trim()}
          className="inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
        >
          {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </button>
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

      {addons === null ? (
        <div className="flex items-center gap-2 text-sm text-[#7f8c85] py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading
        </div>
      ) : addons.length === 0 ? (
        <p className="text-sm text-[#9ca3af] py-4 text-center">No add-ons yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-[#f2f4f6]">
          {addons.map(a => (
            <div key={a.id} className="flex items-center gap-3 py-3">
              <span className="w-9 h-9 shrink-0 rounded-xl bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)] flex items-center justify-center text-xs font-bold">
                <Check className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#191f1d] truncate">{a.name}</p>
                <p className="text-xs text-[#7f8c85]">
                  ${(a.price_cents / 100).toFixed(2)} {a.unit} &middot; {planName(a.plan_id)}
                </p>
              </div>
              <button
                onClick={() => void remove(a.id)}
                disabled={busy === a.id}
                aria-label="Delete"
                className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
              >
                {busy === a.id
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
