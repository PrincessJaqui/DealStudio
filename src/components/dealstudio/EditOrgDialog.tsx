/**
 * EditOrgDialog — Master Admin's edit sheet for one company: plan, comped,
 * suspended, and a password reset for the owner.
 *
 * The password reset runs server-side under the service-role key, which is why
 * the endpoint re-checks that the caller is a platform admin rather than
 * trusting the UI.
 */

import { useState } from 'react';
import { Loader2, X, Eye, EyeOff, Check } from 'lucide-react';
import {
  adminUpdateOrg, adminSetPassword, adminOrgAddons, adminSetOrgAddon, orgMonthlyTotal,
  type AdminOrg, type Plan, type OrgAddon,
} from '../../lib/billing';
import { useEffect } from 'react';

export function EditOrgDialog({
  org, plans, onClose, onSaved,
}: {
  org: AdminOrg;
  plans: Plan[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [suspended, setSuspended] = useState(org.suspended);
  const [comped, setComped] = useState(org.comped);
  const [planId, setPlanId] = useState(org.plan_id ?? '');
  const [addons, setAddons] = useState<OrgAddon[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  // Add-ons for this account, plus what it actually costs. The total comes from
  // the database rather than being added up here, so the console and the
  // customer's bill cannot drift apart.
  const loadAddons = async () => {
    try {
      const [a, t] = await Promise.all([adminOrgAddons(org.id), orgMonthlyTotal(org.id)]);
      setAddons(a);
      setTotal(t);
    } catch {
      setAddons([]);
    }
  };
  useEffect(() => { void loadAddons(); }, [org.id, planId]);

  const setQty = async (addonId: string, qty: number) => {
    await adminSetOrgAddon(org.id, addonId, Math.max(0, qty));
    await loadAddons();
  };
  const [status, setStatus] = useState(org.subscription_status);

  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwNote, setPwNote] = useState('');

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const save = async () => {
    setBusy('save'); setError('');
    try {
      await adminUpdateOrg(org.id, {
        suspended, comped,
        plan_id: planId || undefined,
        status,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Could not save');
      setBusy('');
    }
  };

  const resetPassword = async () => {
    if (!org.owner_id) { setError('This company has no owner account'); return; }
    if (pw.length < 8) { setError('Password must be at least 8 characters'); return; }
    setBusy('pw'); setError(''); setPwNote('');
    try {
      await adminSetPassword(org.owner_id, pw);
      setPw('');
      setPwNote(`Password updated for ${org.owner_email}`);
    } catch (e: any) {
      setError(e?.message || 'Could not reset password');
    } finally {
      setBusy('');
    }
  };

  const field = 'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
  const label = 'block text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-1.5';

  const Toggle = ({ on, set, title, desc }: { on: boolean; set: (v: boolean) => void; title: string; desc: string }) => (
    <button
      onClick={() => set(!on)}
      className="w-full flex items-start gap-3 text-left rounded-xl border border-[#edf0f3] p-3 hover:bg-[#f5f6f8]"
    >
      <span className={`mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition ${
        on ? 'bg-gradient-to-r from-[var(--ds-accent)] to-[var(--ds-accent-to)]' : 'bg-[#dfe3e8]'
      }`}>
        <span className={`block w-4 h-4 rounded-full bg-white transition ${on ? 'ml-auto' : ''}`} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#191f1d]">{title}</span>
        <span className="block text-xs text-[#7f8c85]">{desc}</span>
      </span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />

      <div className="relative w-full max-w-md rounded-2xl bg-white border border-[#edf0f3] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.3)] p-6 my-auto">
        <button
          onClick={onClose}
          disabled={!!busy}
          aria-label="Close"
          className="absolute right-4 top-4 text-[#7f8c85] hover:text-[#191f1d] disabled:opacity-40"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-bold text-[#191f1d]">{org.name}</h2>
        <p className="text-sm text-[#7f8c85]">{org.owner_email ?? 'No owner'} · {org.deal_count} deal{org.deal_count === 1 ? '' : 's'}</p>

        <div className="mt-5 space-y-3">
          <div>
            <label className={label}>Plan</label>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={field}>
              <option value="">No plan assigned</option>
              {plans.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — ${(p.price_cents / 100).toFixed(0)}/mo
                </option>
              ))}
            </select>
          </div>

          {/* Add-ons for this account. Quantity 0 means off. */}
          {addons && addons.length > 0 && (
            <div>
              <label className={label}>Add-ons</label>
              <div className="mt-1 rounded-xl border border-[#edf0f3] divide-y divide-[#f2f4f6]">
                {addons.map(a => (
                  <div key={a.addon_id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#191f1d] truncate">{a.name}</p>
                      <p className="text-xs text-[#7f8c85]">
                        ${(a.price_cents / 100).toFixed(2)} {a.unit}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => void setQty(a.addon_id, a.quantity - 1)}
                        disabled={a.quantity === 0}
                        className="w-8 h-8 rounded-lg border border-[#edf0f3] text-[#7f8c85] hover:bg-[#f5f6f8] disabled:opacity-30"
                      >
                        &minus;
                      </button>
                      <span className="w-8 text-center text-sm font-semibold text-[#191f1d]">
                        {a.quantity}
                      </span>
                      <button
                        onClick={() => void setQty(a.addon_id, a.quantity + 1)}
                        className="w-8 h-8 rounded-lg border border-[#edf0f3] text-[#7f8c85] hover:bg-[#f5f6f8]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {total !== null && (
                <p className="mt-2 text-sm">
                  <span className="text-[#7f8c85]">Monthly total </span>
                  <span className="font-bold text-[var(--ds-accent-ink)]">
                    ${(total / 100).toFixed(2)}
                  </span>
                  <span className="text-[#9ca3af]"> (plan plus add-ons)</span>
                </p>
              )}
            </div>
          )}

          <div>
            <label className={label}>Subscription status</label>
            <select
              value={comped ? 'comped' : status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={comped}
              className={`${field} disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {comped
                ? <option value="comped">comped (full access, not billed)</option>
                : ['trialing', 'active', 'past_due', 'canceled'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
            </select>
            {comped && (
              <p className="text-xs text-[var(--ds-accent-ink)] mt-1">
                Comped overrides the billing status. Turn it off to set a status.
              </p>
            )}
          </div>

          <Toggle
            on={comped} set={setComped}
            title="Comped"
            desc="Full access without paying. Overrides billing."
          />
          <Toggle
            on={suspended} set={setSuspended}
            title="Suspended"
            desc="Locks the company out of the app entirely."
          />
        </div>

        <div className="mt-5 pt-5 border-t border-[#edf0f3]">
          <label className={label}>Reset owner password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="New password (8+ characters)"
              autoComplete="new-password"
              className={`${field} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              aria-label="Show password"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7f8c85] hover:text-[#191f1d]"
            >
              {showPw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={() => void resetPassword()}
            disabled={busy === 'pw' || pw.length < 8}
            className="mt-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8] disabled:opacity-50"
          >
            {busy === 'pw' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Set password
          </button>
          {pwNote && <p className="text-sm text-[var(--ds-accent-ink)] mt-2">{pwNote}</p>}
        </div>

        {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={!!busy}
            className="flex-1 h-10 rounded-xl border border-[#edf0f3] text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!!busy}
            className="flex-1 h-10 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60 inline-flex items-center justify-center gap-2"
          >
            {busy === 'save' && <Loader2 className="w-4 h-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
