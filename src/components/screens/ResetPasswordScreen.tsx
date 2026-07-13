/**
 * ResetPasswordScreen — where a password reset link lands.
 *
 * Supabase puts a recovery session in the URL fragment and the client picks it
 * up, so by the time this renders the person is already authenticated for the
 * sole purpose of setting a new password.
 *
 * Without this route the reset email is a dead link, which is worse than having
 * no reset at all: it looks broken rather than absent.
 */

import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PublicHeader } from '../dealstudio/PublicHeader';
import dsMark from '../../assets/dealstudio-mark.png';

export function ResetPasswordScreen() {
  const nav = useNavigate();

  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    // The recovery token arrives in the URL fragment. supabase-js consumes it and
    // establishes a session; if there is no session, the link is stale or already
    // used, and we should say so rather than showing a form that cannot work.
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setValid(!!data.session);
      setReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (cancelled) return;
      setValid(!!session);
      setReady(true);
    });

    void check();
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  const submit = async () => {
    setError('');
    if (password.length < 8) return setError('Use at least 8 characters');

    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (e) return setError(e.message);
    setDone(true);
  };

  const field =
    'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 pr-10 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      <PublicHeader />

      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-6">
          <img src={dsMark} alt="" className="w-11 h-11 rounded-full object-cover mb-4" />

          {!ready ? (
            <div className="flex items-center gap-2 text-sm text-[#7f8c85]">
              <Loader2 className="w-4 h-4 animate-spin" /> Checking your link
            </div>
          ) : done ? (
            <div>
              <h1 className="text-lg font-bold text-[#191f1d]">Password updated</h1>
              <p className="text-sm text-[#7f8c85] mt-2">You are signed in.</p>
              <button
                onClick={() => nav('/admin')}
                className="mt-5 w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm inline-flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Go to your dashboard
              </button>
            </div>
          ) : !valid ? (
            <div>
              <h1 className="text-lg font-bold text-[#191f1d]">This link has expired</h1>
              <p className="text-sm text-[#7f8c85] mt-2 leading-relaxed">
                Reset links can only be used once, and they do not last long. Ask for
                a fresh one from the sign-in page.
              </p>
              <Link
                to="/admin"
                className="mt-5 block w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm text-center"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <div>
              <h1 className="text-lg font-bold text-[#191f1d]">Choose a new password</h1>
              <p className="text-sm text-[#7f8c85] mt-1">At least 8 characters.</p>

              <label className="block text-xs font-semibold text-[#7f8c85] mt-4 mb-1">
                New password
              </label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
                  className={field}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#191f1d]"
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

              <button
                onClick={() => void submit()}
                disabled={busy}
                className="mt-5 w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Set password
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
