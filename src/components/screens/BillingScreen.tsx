/**
 * BillingScreen — the company's own plan, card, and payment history.
 * Card details are handled entirely by Stripe's hosted portal; we never see them.
 */
import { useEffect, useState } from 'react';
import { Loader2, CreditCard, ExternalLink } from 'lucide-react';
import { useAdminAuth } from '../dealstudio/AdminGate';
import {
  startCheckout, openBillingPortal, fetchPlans, fetchMyTransactions, money,
  type Plan, type Txn,
} from '../../lib/billing';

const card = 'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';

export function BillingScreen() {
  const { org } = useAdminAuth();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void fetchPlans().then(setPlans);
    void fetchMyTransactions().then(setTxns);
  }, []);

  const go = async (fn: () => Promise<string>, key: string) => {
    setBusy(key); setError('');
    try { window.location.href = await fn(); }
    catch (e: any) { setError(e?.message || 'Something went wrong'); setBusy(''); }
  };

  const plan = plans[0];
  const active = org?.subscription_status === 'active';
  const trialLeft = org
    ? Math.max(0, Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">Billing & Payments</h1>
        <p className="text-sm text-[#7f8c85]">Manage your plan and payment method.</p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className={`${card} p-5`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#edf0f3] bg-[var(--ds-tint)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)]">Plan</p>
            <p className="font-bold text-[#191f1d] mt-1">
              {plan ? `${plan.name} ${money(plan.price_cents)}/mo` : 'Pro Plan'}
            </p>
            <p className="text-sm text-[#7f8c85] mt-0.5">
              {org?.comped ? 'Complimentary access'
                : active ? 'Active subscription'
                : trialLeft > 0 ? `${trialLeft} days left in trial`
                : 'Trial ended'}
            </p>
            {!active && !org?.comped && (
              <button
                onClick={() => void go(startCheckout, 'checkout')}
                disabled={busy === 'checkout'}
                className="mt-3 inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
              >
                {busy === 'checkout' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Subscribe
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-[#edf0f3] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)]">Payment method</p>
            <p className="text-sm text-[#7f8c85] mt-1">
              {org?.stripe_customer_id ? 'Managed securely by Stripe.' : 'No card on file yet.'}
            </p>
            <button
              onClick={() => void go(openBillingPortal, 'portal')}
              disabled={busy === 'portal' || !org?.stripe_customer_id}
              className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8] disabled:opacity-50"
            >
              {busy === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Manage billing
            </button>
          </div>
        </div>
      </div>

      <div className={`${card} mt-5`}>
        <div className="p-5 border-b border-[#edf0f3]">
          <h2 className="font-bold text-[#191f1d]">Payment history</h2>
        </div>
        {txns === null ? (
          <div className="p-5"><Loader2 className="w-4 h-4 animate-spin text-[#7f8c85]" /></div>
        ) : txns.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#7f8c85]">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#7f8c85] border-b border-[#edf0f3]">
                  {['Date', 'Event', 'Amount', 'Status'].map(h => (
                    <th key={h} className="font-semibold px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map(t => (
                  <tr key={t.id} className="border-b border-[#f2f4f6] last:border-0">
                    <td className="px-5 py-3 text-[#7f8c85] whitespace-nowrap">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-[#191f1d]">{t.event_name}</td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{money(t.amount_cents, t.currency)}</td>
                    <td className="px-5 py-3 capitalize text-[#7f8c85]">{t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
