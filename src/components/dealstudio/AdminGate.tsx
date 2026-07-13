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
import { PublicHeader } from './PublicHeader';
import { refreshUserContext } from '../../lib/analytics';
import { fetchMyOrg, createMyOrg, applyOrgTheme, claimPendingInvites, myPendingInvite, type Organization } from '../../lib/org';
import { AccountLock, isEntitled } from './AccountLock';
import { isPlatformAdmin } from '../../lib/billing';

type Status = 'loading' | 'signedout' | 'notadmin' | 'needsorg' | 'admin';

/** Lets the admin screen render Sign out inside its own header. */
const AdminAuthContext = createContext<{ signOut: () => Promise<void>; org: Organization | null; refreshOrg: () => Promise<void> }>({ signOut: async () => {}, org: null, refreshOrg: async () => {} });
export const useAdminAuth = () => useContext(AdminAuthContext);

async function resolve(): Promise<{ status: Status; org: Organization | null; invitedBy?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'signedout', org: null };
  await refreshUserContext();
  // Membership in an organization is what grants access. RLS enforces the same
  // rule server-side, so a user with no org simply sees nothing.
  // An invited colleague has no org until their invite is claimed, so try that
  // before concluding they have no company.
  let org = await fetchMyOrg();

  if (!org) {
    await claimPendingInvites();
    org = await fetchMyOrg();
  }

  // Still nothing? They may have just confirmed their email. With confirmation
  // on, signup has no session, so the org could not be created then -- the
  // company name was carried in user metadata instead. Create it now, or they
  // arrive at a confirmed account with no company and get locked out of their
  // own product.
  if (!org) {
    const { data: auth } = await supabase.auth.getUser();
    const company = String(auth?.user?.user_metadata?.company ?? '').trim();
    if (company) {
      try {
        await createMyOrg(company, company);
        org = await fetchMyOrg();
      } catch {
        // Already created by a parallel tab, or a race. Re-read and move on.
        org = await fetchMyOrg();
      }
    }
  }

  if (org) return { status: 'admin', org };

  // No company. Two very different people end up here, and offering the wrong
  // screen to the second one is destructive.
  //
  // If an invite is still waiting, the claim failed (their company is out of
  // seats, most likely). Do NOT offer to create a company: they would end up in
  // a second, separate one instead of the company that invited them.
  const invitedBy = await myPendingInvite();
  if (invitedBy) {
    return { status: 'notadmin', org: null, invitedBy };
  }

  // Otherwise they genuinely have no company: a master admin made the account,
  // or a signup lost its company metadata. They name it themselves.
  return { status: 'needsorg', org: null };
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [org, setOrg] = useState<Organization | null>(null);
  const [isMaster, setIsMaster] = useState<boolean | null>(null);
  const [email, setEmail] = useState('hello@dealstudio.io');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [invitedBy, setInvitedBy] = useState<string | null>(null);

  /** A signed-in user with no company names it here and is straight into their
   *  own workspace. No invite, no waiting on anyone. */
  const setupCompany = async () => {
    const name = newCompany.trim();
    if (!name) return setError('Company name is required');

    setBusy(true);
    setError('');
    try {
      await createMyOrg(name, name);
      const fresh = await fetchMyOrg();
      if (!fresh) throw new Error('Could not create your company');
      setOrg(fresh);
      applyOrgTheme(fresh);
      setStatus('admin');
    } catch (e: any) {
      setError(e?.message || 'Could not create your company');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    const load = () => resolve().then((r) => {
      if (!alive) return;
      setStatus(r.status);
      setOrg(r.org);
      setInvitedBy(r.invitedBy ?? null);
      if (r.org) { void isPlatformAdmin().then(v => { if (alive) setIsMaster(v); }); } else { setIsMaster(false); }
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

  /** Re-reads the org so a rename or new logo appears in the header at once. */
  async function refreshOrg() {
    const fresh = await fetchMyOrg();
    if (fresh) { setOrg(fresh); applyOrgTheme(fresh); }
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
    // Wait for the platform-admin answer before deciding, or an operator could
    // see their own console flash a lock screen.
    if (isMaster === null) {
      return (
        <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" />
        </div>
      );
    }

    // Platform admins run the platform; they are never locked out of it.
    if (!isMaster && org && !isEntitled(org)) {
      return <AccountLock org={org} />;
    }

    return (
      <AdminAuthContext.Provider value={{ signOut, org, refreshOrg }}>
        {children}
      </AdminAuthContext.Provider>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-6">
        <img src={dsMark} alt="DealStudio" className="w-11 h-11 rounded-full object-cover mb-4" />
        <h1 className="text-lg font-bold text-[#191f1d]">DealStudio&trade; Admin</h1>

        {status === 'needsorg' ? (
          <>
            <h1 className="text-lg font-bold text-[#191f1d]">Name your company</h1>
            <p className="text-sm text-[#7f8c85] mt-2 leading-relaxed">
              This is what investors will see at the top of your deal room. You can
              change it later in Settings.
            </p>

            <label className="block text-xs font-semibold text-[#7f8c85] mt-4 mb-1">
              Company
            </label>
            <input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void setupCompany(); }}
              placeholder="Northwind Robotics"
              autoFocus
              className="w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />

            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

            <button
              onClick={() => void setupCompany()}
              disabled={busy || !newCompany.trim()}
              className="mt-5 w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Create my workspace
            </button>

            <button
              onClick={signOut}
              className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d]"
            >
              Sign out
            </button>
          </>
        ) : status === 'notadmin' ? (
          <>
            <p className="text-sm text-[#7f8c85] mt-2 leading-relaxed">
              {invitedBy
                ? `Your invite to ${invitedBy} is still waiting. That usually means they are out of seats. Ask an owner there to add a seat, then sign in again.`
                : 'This account is not part of a company workspace yet. Ask an owner to invite you, or sign in with a different account.'}
            </p>
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
    </div>
  );
}
