/**
 * The page a new founder lands on after clicking "Confirm email address."
 *
 * Two outcomes arrive at this same URL, and they must not look the same:
 *
 *   Success  Supabase appends #access_token=... and the account is live.
 *   Failure  Supabase appends #error=access_denied&error_code=otp_expired when
 *            the link was already used or has aged out.
 *
 * Before this, the failure case rendered the cheerful "You're set!" page (or a
 * blank screen), so someone whose link had expired was told everything worked
 * and then could not log in. Now an expired link says so plainly and offers a
 * fresh one, because "it expired" is only useful next to a way to fix it.
 *
 * The hash is read once on mount and then cleared from the address bar: it holds
 * an access token, and that does not belong sitting in a URL a founder might
 * copy, screenshot, or paste into a support chat.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertCircle, Loader2, Mail } from 'lucide-react';
import { sendPasswordReset } from '../../lib/billing';

type Outcome = 'ok' | 'expired';

export function WelcomeScreen() {
  const [outcome, setOutcome] = useState<Outcome>('ok');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const p = new URLSearchParams(hash);

    if (p.get('error') || p.get('error_code')) {
      setOutcome('expired');
    }

    // Whatever it said, do not leave tokens in the address bar.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const resend = async () => {
    const addr = email.trim();
    if (!/.+@.+\..+/.test(addr)) { setProblem('Enter the email you signed up with.'); return; }
    setProblem(null);
    setSending(true);
    const r = await sendPasswordReset(addr);
    setSending(false);
    if (r.ok) setSent(true);
    else setProblem(r.message || 'Could not send that. Try again in a minute.');
  };

  const card = 'w-full max-w-md bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-8 text-center';

  if (outcome === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[#f5f6f8]">
        <div className={card}>
          <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center bg-amber-50">
            <AlertCircle className="w-7 h-7 text-amber-600" />
          </div>

          <h1 className="mt-5 text-xl font-bold text-[#191f1d]">That link has expired</h1>
          <p className="mt-2 text-sm text-[#7f8c85] leading-relaxed">
            Confirmation links can only be used once, and they time out. Enter your email and
            we will send you a fresh one.
          </p>

          {sent ? (
            <div className="mt-6 rounded-xl bg-[var(--ds-tint)] px-4 py-3.5 text-sm text-[var(--ds-brand)] font-medium">
              Sent. Check your inbox for a new link.
            </div>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setProblem(null); }}
                onKeyDown={e => { if (e.key === 'Enter') void resend(); }}
                placeholder="you@company.com"
                className="mt-6 w-full h-11 rounded-xl bg-[#f5f6f8] px-3.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
              />
              {problem && <p className="mt-2 text-xs text-red-600">{problem}</p>}
              <button
                onClick={() => void resend()}
                disabled={sending}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 disabled:opacity-60 transition"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Send me a new link
              </button>
            </>
          )}

          <p className="mt-4 text-xs text-[#99a1af]">
            Still stuck? Email{' '}
            <a href="mailto:hello@dealstudio.io" className="font-semibold text-[var(--ds-brand)]">hello@dealstudio.io</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#f5f6f8]">
      <div className={card}>
        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
          <CheckCircle2 className="w-7 h-7 text-white" />
        </div>

        <h1 className="mt-5 text-xl font-bold text-[#191f1d]">You're set!</h1>
        <p className="mt-2 text-sm text-[#7f8c85] leading-relaxed">
          Your email is confirmed and your DealStudio account is ready. Sign in to build your
          first deal room and start bringing investors along.
        </p>

        <Link
          to="/admin"
          className="mt-6 inline-flex w-full items-center justify-center h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 transition"
        >
          Log in
        </Link>

        <p className="mt-4 text-xs text-[#99a1af]">
          Need a hand? Email us at{' '}
          <a href="mailto:hello@dealstudio.io" className="font-semibold text-[var(--ds-brand)]">hello@dealstudio.io</a>
        </p>
      </div>
    </div>
  );
}
