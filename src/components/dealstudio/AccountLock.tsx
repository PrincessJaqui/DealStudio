/**
 * AccountLock — shown when a company may no longer use the app.
 *
 * Two distinct cases, deliberately handled differently:
 *
 *  - Suspended: an action the platform took. The customer cannot fix this by
 *    paying, so we do not dangle a payment button at them. They need to talk to
 *    a human.
 *
 *  - Trial over / payment lapsed: the customer CAN fix this, so the screen is a
 *    door, not a wall. Billing and sign-out stay reachable.
 *
 * Nothing here deletes anything. Their deals, documents and investors are all
 * intact and come straight back the moment they subscribe.
 */

import { Lock, CreditCard, Loader2, LogOut } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { startCheckout } from '../../lib/billing';
import type { Organization } from '../../lib/org';
import { PublicHeader } from './PublicHeader';

export function AccountLock({ org }: { org: Organization }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const suspended = org.suspended;

  const subscribe = async () => {
    setBusy(true);
    setError('');
    try {
      window.location.href = await startCheckout();
    } catch (e: any) {
      setError(e?.message || 'Could not open checkout');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      <PublicHeader variant="quiet" />

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-7 text-center">
          <span className="w-12 h-12 rounded-2xl bg-[#f5f6f8] flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-[#7f8c85]" />
          </span>

          <h1 className="text-xl font-bold text-[#191f1d] mt-4">
            {suspended ? 'This account is suspended' : 'Your trial has ended'}
          </h1>

          <p className="text-sm text-[#7f8c85] mt-2 leading-relaxed">
            {suspended
              ? 'Access to ' + org.name + ' has been paused. Your deals and documents are safe and nothing has been deleted. Please get in touch and we will sort it out.'
              : 'Subscribe to get back into ' + org.name + '. Your deals, documents and investors are exactly where you left them.'}
          </p>

          {error && <p className="text-sm text-red-600 mt-4">{error}</p>}

          {suspended ? (
            <a
              href="mailto:hello@dealstudio.io"
              className="mt-6 inline-flex items-center justify-center w-full h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
            >
              Contact support
            </a>
          ) : (
            <button
              onClick={() => void subscribe()}
              disabled={busy}
              className="mt-6 inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Subscribe
            </button>
          )}

          <button
            onClick={() => void supabase.auth.signOut().then(() => window.location.assign('/'))}
            className="mt-3 inline-flex items-center justify-center gap-1.5 w-full h-10 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#7f8c85] hover:text-[#191f1d]"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * True when the org may use the app. Mirrors the org_entitled() SQL function.
 * The server is still the real boundary; this only decides what to render.
 */
export function isEntitled(org: Organization | null): boolean {
  if (!org) return false;
  if (org.suspended) return false;
  if (org.comped) return true;
  if (org.subscription_status === 'active') return true;

  // 'trialing' is a label, not a licence: nothing ever flips it back, so a
  // company would stay entitled forever. The trial's END DATE is the authority.
  const trialLive = new Date(org.trial_ends_at).getTime() > Date.now();
  if (org.subscription_status === 'trialing') return trialLive;

  return trialLive;
}
