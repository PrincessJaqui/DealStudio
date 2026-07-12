import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, LogOut } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { refreshUserContext } from '../../lib/analytics';

type Status = 'loading' | 'signedout' | 'notadmin' | 'admin';

async function resolveStatus(): Promise<Status> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'signedout';
  await refreshUserContext();
  const { data: roleRow } = await supabase
    .from('user_roles').select('role').eq('auth_user_id', user.id).maybeSingle();
  return roleRow?.role === 'admin' ? 'admin' : 'notadmin';
}

export function AdminGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [email, setEmail] = useState('hello@dealstudio.io');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    resolveStatus().then((s) => { if (alive) setStatus(s); });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      resolveStatus().then((s) => { if (alive) setStatus(s); });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  async function signIn() {
    setError(''); setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    setBusy(false);
    if (err) { setError(err.message || 'Sign in failed'); return; }
    setPassword('');
  }

  async function signOut() { await supabase.auth.signOut(); setStatus('signedout'); }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-[#503DBB]" />
      </div>
    );
  }

  if (status === 'admin') {
    return (
      <div className="relative">
        {children}
        <button onClick={signOut}
          className="fixed top-4 right-4 z-50 flex items-center gap-1.5 bg-white/90 backdrop-blur rounded-xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] px-3 py-2 text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d]">
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-6">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#242473] to-[#503DBB] flex items-center justify-center text-white font-bold text-lg mb-4">D</div>
        <h1 className="text-lg font-bold text-[#191f1d]">DealStudio Admin</h1>
        {status === 'notadmin' ? (
          <>
            <p className="text-sm text-[#7f8c85] mt-2">This account is signed in but is not an admin. Ask for admin access, or sign in with a different account.</p>
            <button onClick={signOut} className="mt-5 w-full rounded-xl border border-[#edf0f3] py-2.5 text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d]">Sign out</button>
          </>
        ) : (
          <>
            <p className="text-sm text-[#7f8c85] mt-1">Sign in to manage your deal studio.</p>
            <label className="block text-xs font-semibold text-[#7f8c85] mt-5 mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }} autoComplete="username"
              className="w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[#503DBB]/40" placeholder="you@company.com" />
            <label className="block text-xs font-semibold text-[#7f8c85] mt-3 mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void signIn(); }} autoComplete="current-password"
              className="w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[#503DBB]/40" placeholder="Your password" />
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <button onClick={() => void signIn()} disabled={busy || !email || !password}
              className="mt-5 w-full rounded-xl bg-gradient-to-br from-[#242473] to-[#503DBB] text-white font-semibold py-2.5 text-sm disabled:opacity-60 flex items-center justify-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
