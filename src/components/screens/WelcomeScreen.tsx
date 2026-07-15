/**
 * The page a new founder lands on after clicking "Confirm email address."
 *
 * Before this, Supabase sent confirmed users straight to /admin, which drops them
 * into the app with no sign that anything worked, the click just... went
 * somewhere. This acknowledges it: you're set, here's the way in. It is a small
 * thing that makes the product feel like it is paying attention, which for a
 * trust-first product is not a small thing at all.
 *
 * Intentionally plain and self-contained, so it renders instantly and never
 * depends on session state that may still be hydrating right after a redirect.
 */

import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

export function WelcomeScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[#f5f6f8]">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-8 text-center">
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
