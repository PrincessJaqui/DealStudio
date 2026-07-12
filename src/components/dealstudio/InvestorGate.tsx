/**
 * InvestorGate — email/password wall for the public deal studio.
 * If the investor has no password they can request access, which creates a
 * pending approval (and emails hello@dealstudio.io via the approval edge fn).
 */

import { useState } from 'react';
import { PublicHeader } from './PublicHeader';
import { Loader2, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { verifyDealAccess, requestDealAccess } from '../../lib/dealStudio';

interface Props {
  slug: string;
  companyName: string;
  requirePassword: boolean;
  requireEmail?: boolean;
  /** When set, this is the public demo: shown instead of the access copy. */
  demoNotice?: string;
  /** Share-link mode: grant on email alone, without server verification. */
  skipVerify?: boolean;
  heroImageUrl?: string | null;
  onGranted: (email: string) => void;
}

export function InvestorGate({ slug, companyName, requirePassword, requireEmail = true, skipVerify = false, heroImageUrl, demoNotice, onGranted }: Props) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'enter' | 'request'>('enter');
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);

  const submit = async () => {
    setError('');
    if ((requireEmail || mode === 'request') && !email.trim()) { setError('Enter your email'); return; }
    setBusy(true);
    try {
      if (mode === 'request') {
        const r = await requestDealAccess(slug, email, name);
        if (r.ok) setRequested(true);
        else setError('Could not submit the request. Try again.');
        return;
      }
      if (skipVerify) {
        // Share link: the link itself is the credential; just capture the email.
        try { localStorage.setItem('dealstudio_email', email.trim().toLowerCase()); } catch { /* ignore */ }
        onGranted(email.trim().toLowerCase());
        return;
      }
      const res = await verifyDealAccess(slug, email, requirePassword ? password : '');
      if (res.granted) {
        try { localStorage.setItem('dealstudio_email', email.trim().toLowerCase()); } catch { /* ignore */ }
        onGranted(email.trim().toLowerCase());
      } else {
        setError(requirePassword ? 'That email and password don\u2019t match an approved investor.' : 'Access is not available for that email.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col">
      <PublicHeader variant={demoNotice ? 'full' : 'quiet'} />
      <div className="flex-1 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="rounded-t-2xl overflow-hidden h-28 bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] relative">
          {heroImageUrl && <img src={heroImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="bg-white rounded-xl px-3 py-2 shadow-sm text-base font-bold leading-none text-[var(--ds-brand)]">DealStudio<span className="text-[#191f1d]">.io</span></span>
            <span className="text-white text-sm font-semibold">{companyName}&trade;</span>
          </div>
        </div>

        <div className="bg-white rounded-b-2xl border border-t-0 border-[#edf0f3] shadow-[0_8px_30px_-8px_rgba(0,0,0,0.15)] p-6">
          {requested ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--ds-tint)] flex items-center justify-center mx-auto mb-3"><Mail className="w-6 h-6 text-[var(--ds-brand)]" /></div>
              <h2 className="text-lg font-bold text-[#191f1d]">Request received</h2>
              <p className="text-sm text-[#7f8c85] mt-1">We&rsquo;ll review your request and email you access at <span className="font-medium text-[#191f1d]">{email}</span>.</p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] flex items-center justify-center mb-4 shadow">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-xl font-bold text-[#191f1d]">
                {demoNotice ? 'View the live demo' : mode === 'request' ? 'Request access' : 'Investor access'}
              </h2>
              <p className="text-sm text-[#7f8c85] mt-1 mb-5">
                {demoNotice
                  ? 'Enter your email to explore a real deal studio.'
                  : mode === 'request'
                    ? 'No password yet? Request one and we\u2019ll approve you shortly.'
                    : 'Enter your email and password to view the deal studio.'}
              </p>

              <div className="space-y-3">
                <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@firm.com" className="w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
                {mode === 'request' && (
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)" className="w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
                )}
                {mode === 'enter' && requirePassword && (
                  <div className="relative">
                    <input value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Password" className="w-full h-11 rounded-xl bg-[#f5f6f8] pl-3 pr-11 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" onKeyDown={e => e.key === 'Enter' && submit()} />
                    <button type="button" onClick={() => setShowPassword(s => !s)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-[#7f8c85] hover:text-[#191f1d]">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              {demoNotice && (
                <p className="text-xs text-[#7f8c85] mt-3 rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3 text-left">
                  {demoNotice}
                </p>
              )}

              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

              <Button onClick={submit} disabled={busy} className="w-full h-11 mt-4 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)] font-semibold disabled:opacity-50">
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{demoNotice ? 'View demo' : mode === 'request' ? 'Submit request' : 'Enter DealStudio'}
              </Button>

              {requirePassword && (
                <button type="button" onClick={() => { setMode(mode === 'enter' ? 'request' : 'enter'); setError(''); }} className="w-full text-center text-xs text-[var(--ds-brand)] hover:underline mt-3">
                  {mode === 'enter' ? 'No password? Request access' : 'Have a password? Sign in'}
                </button>
              )}
            </>
          )}
        </div>
        <p className="text-center text-[11px] text-[#99a1af] mt-4">Powered by DealStudio</p>
      </div>
    </div>
    </div>
  );
}
