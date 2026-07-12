/**
 * AdminGate — email + password sign-in wall for the /admin editor.
 * Renders the login form when there is no session, a "not authorized" notice
 * when the signed-in user has no admin role, and its children (the editor)
 * once an admin session is confirmed. Wraps DealStudioScreen so that screen's
 * data loads only after auth. Investor surfaces are untouched.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Loader2, LogOut, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dsMark from '../../assets/dealstudio-mark.png';
import { refreshUserContext } from '../../lib/analytics';
import { fetchMyOrg, applyOrgTheme, type Organization } from '../../lib/org';

type Status = 'loading' | 'signedout' | 'notadmin' | 'admin';

/** Lets the admin screen render Sign out inside its own header. */
const AdminAuthContext = createContext<{ signOut: () => Promise<void>; org: Organization | null }>({ signOut: async () => {}, org: null });
export const useAdminAuth = () => useContext(AdminAuthContext);

async function resolve(): Promise<{ status: Status; org: Organization | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'signedout', org: null };
  await refreshUserContext();
  // Membership in an organization is what grants access. RLS enforces the same
  // rule server-side, so a user with no org simply sees nothing.
  const org = await fetchMyOrg();
  return { status: org ? 'admin' : 'notadmin', org };
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [org, setOrg] = useState<Organization | null>(null);
  const [email, setEmail] = useState('hello@dealstudio.io');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => resolve().then((r) => {
      if (!alive) return;
      setStatus(r.status);
      setOrg(r.org);
      applyOrgTheme(r.org);   // repaint the design tokens in the company's brand
    });
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function signIn() {
    setError('');
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (err) { setError(err.message || 'Sign in failed'); return; }
    // onAuthStateChange re-resolves status; clear the password field.
    setPassword('');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setStatus('signedout');
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" />
      </div>
    );
  }

  if (status === 'admin') {
    return (
      <AdminAuthContext.Provider value={{ signOut, org }}>
        {children}
      </AdminAuthContext.Provider>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-6">
        <img src={dsMark} alt="DealStudio" className="w-11 h-11 rounded-xl mb-4" />
        <h1 className="text-lg font-bold text-[#191f1d]">DealStudio Admin</h1>

        {status === 'notadmin' ? (
          <>
            <p className="text-sm text-[#7f8c85] mt-2">This account is not part of a company workspace yet. Ask an owner to invite you, or sign in with a different account.</p>
            <button
              onClick={signOut}
              className="mt-5 w-full rounded-xl border border-[#edf0f3] py-2.5 text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d]"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[#7f8c85] mt-1">Sign in to manage your deal studio.</p>

            <label className="block text-xs font-semibold text-[#7f8c85] mt-5 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }}
              autoComplete="username"
              className="w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40"
              placeholder="you@company.com"
            />

            <label className="block text-xs font-semibold text-[#7f8c85] mt-3 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }}
                autoComplete="current-password"
                className="w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 pr-10 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40"
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7f8c85] hover:text-[#191f1d]"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            <button
              onClick={() => void signIn()}
              disabled={busy || !email || !password}
              className="mt-5 w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
