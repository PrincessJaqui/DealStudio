/**
 * SignupScreen — public sign-up. Creates the auth user, then their company and
 * first deal via one RPC. New companies get a 30-day trial; no card up front.
 */
import { webUrl } from '../../lib/runtime';
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createMyOrg } from '../../lib/org';
import dsMark from '../../assets/dealstudio-mark.png';
import { PublicHeader } from '../dealstudio/PublicHeader';

export function SignupScreen() {
  const nav = useNavigate();
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setError('');
    if (!company.trim()) return setError('Company name is required');
    if (password.length < 8) return setError('Use at least 8 characters');
    setBusy(true);
    try {
      const { error: signErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          // Without this, Supabase falls back to the project's Site URL for the
          // confirmation link. If that is still pointing at localhost, every
          // confirmation email is a dead link.
          emailRedirectTo: webUrl('/welcome'),

          // The company name has to survive the email round trip. When
          // confirmation is on there is no session at signup, so the org cannot
          // be created here -- and it used to be silently thrown away, leaving a
          // confirmed user with no company at all.
          data: { company: company.trim() },
        },
      });
      if (signErr) throw signErr;

      // Confirmation required: no session yet. This is success, not an error.
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) {
        setBusy(false);
        setSent(true);
        return;
      }

      await createMyOrg(company.trim(), company.trim());
      nav('/admin');
    } catch (e: any) {
      setError(e?.message || 'Could not create your account');
      setBusy(false);
    }
  };

  const field = 'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
  const label = 'block text-xs font-semibold text-[#7f8c85] mt-3 mb-1';

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-6">
        <img src={dsMark} alt="" className="w-11 h-11 rounded-full object-cover mb-4" />

        {/* Once the email is out, the form is done. Leaving it live with a red
            line under the password read as a failure, so people retried and hit
            "user already registered", which really is an error. */}
        {sent ? (
          <div>
            <h1 className="text-lg font-bold text-[#191f1d]">Check your inbox</h1>
            <p className="text-sm text-[#7f8c85] mt-2 leading-relaxed">
              We sent a confirmation link to{' '}
              <span className="font-semibold text-[#191f1d]">{email.trim().toLowerCase()}</span>.
              Open it to finish setting up {company.trim()}.
            </p>
            <div className="mt-4 rounded-xl bg-[var(--ds-accent-tint)] px-4 py-3">
              <p className="text-[13px] text-[var(--ds-accent-ink)] leading-relaxed">
                No email after a minute or two? Check spam, then try signing in.
              </p>
            </div>
            <Link
              to="/admin"
              className="mt-5 block w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm text-center"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
        <>
        <h1 className="text-lg font-bold text-[#191f1d]">Start your deal room</h1>
        <p className="text-sm text-[#7f8c85] mt-1">30 days free. No card required.</p>

        <label className={label}>Company</label>
        <input value={company} onChange={e => setCompany(e.target.value)} className={field} placeholder="Acme Robotics" />

        <label className={label}>Work email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" className={field} placeholder="you@company.com" />

        <label className={label}>Password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
            autoComplete="new-password"
            className={`${field} pr-10`}
            placeholder="At least 8 characters"
          />
          <button type="button" onClick={() => setShowPw(v => !v)} aria-label="Show password"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7f8c85] hover:text-[#191f1d]">
            {showPw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <button
          onClick={() => void submit()}
          disabled={busy || !email || !password || !company}
          className="mt-5 w-full rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white font-semibold py-2.5 text-sm disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Create account
        </button>

        </>
        )}

        {/* Terms bind a customer only if they were told at sign-up. Without this
            line the documents are decorative. */}
        <p className="text-center text-xs text-[#9ca3af] mt-3 leading-relaxed">
          By creating an account you agree to the{' '}
          <Link to="/terms" className="font-medium text-[var(--ds-brand)] hover:underline">Terms of Service</Link>
          {' '}and{' '}
          <Link to="/privacy" className="font-medium text-[var(--ds-brand)] hover:underline">Privacy Policy</Link>.
        </p>

        <p className="text-center text-sm text-[#7f8c85] mt-4">
          Already have an account? <Link to="/admin" className="font-semibold text-[var(--ds-brand)]">Sign in</Link>
        </p>
      </div>
      </div>
    </div>
  );
}
