/**
 * SystemSettingsScreen — company identity and the signed-in user's account.
 * Company name writes to the organization (RLS restricts it to members).
 * Email and password changes go through Supabase Auth, never through our own
 * tables, so credentials are only ever handled by the auth service.
 */

import { useEffect, useState } from 'react';
import { Loader2, Check, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../dealstudio/AdminGate';
import { saveOrgBranding } from '../../lib/org';

const card = 'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';
const field = 'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const label = 'block text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-1.5';
const primary = 'inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60';

type Note = { kind: 'ok' | 'err'; text: string } | null;

export function SystemSettingsScreen() {
  const { org } = useAdminAuth();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameNote, setNameNote] = useState<Note>(null);

  const [email, setEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailNote, setEmailNote] = useState<Note>(null);

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwNote, setPwNote] = useState<Note>(null);

  useEffect(() => { if (org) setName(org.name); }, [org]);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
  }, []);

  const saveName = async () => {
    if (!org || !name.trim()) return;
    setSavingName(true); setNameNote(null);
    try {
      await saveOrgBranding(org.id, { name: name.trim() });
      setNameNote({ kind: 'ok', text: 'Company name saved' });
    } catch (e: any) {
      setNameNote({ kind: 'err', text: e?.message || 'Could not save' });
    } finally { setSavingName(false); }
  };

  const saveEmail = async () => {
    if (!email.trim()) return;
    setSavingEmail(true); setEmailNote(null);
    const { error } = await supabase.auth.updateUser({ email: email.trim().toLowerCase() });
    setSavingEmail(false);
    setEmailNote(error
      ? { kind: 'err', text: error.message }
      : { kind: 'ok', text: 'Check your inbox to confirm the new address' });
  };

  const savePassword = async () => {
    if (pw.length < 8) { setPwNote({ kind: 'err', text: 'Use at least 8 characters' }); return; }
    if (pw !== pw2) { setPwNote({ kind: 'err', text: 'Passwords do not match' }); return; }
    setSavingPw(true); setPwNote(null);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSavingPw(false);
    if (error) { setPwNote({ kind: 'err', text: error.message }); return; }
    setPw(''); setPw2('');
    setPwNote({ kind: 'ok', text: 'Password updated' });
  };

  const noteEl = (n: Note) =>
    n ? <p className={`text-sm mt-2 ${n.kind === 'ok' ? 'text-[var(--ds-accent-ink)]' : 'text-red-600'}`}>{n.text}</p> : null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">System Settings</h1>
        <p className="text-sm text-[#7f8c85]">Your company and your account.</p>
      </div>

      <div className="space-y-5">
        <div className={card}>
          <h2 className="font-bold text-[#191f1d] mb-4">Company</h2>
          <label className={label}>Company name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Acme Robotics" />
          <div className="mt-4">
            <button onClick={() => void saveName()} disabled={savingName || !name.trim()} className={primary}>
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
          </div>
          {noteEl(nameNote)}
        </div>

        <div className={card}>
          <h2 className="font-bold text-[#191f1d] mb-4">Login email</h2>
          <label className={label}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className={field}
          />
          <div className="mt-4">
            <button onClick={() => void saveEmail()} disabled={savingEmail || !email.trim()} className={primary}>
              {savingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Update email
            </button>
          </div>
          {noteEl(emailNote)}
        </div>

        <div className={card}>
          <h2 className="font-bold text-[#191f1d] mb-4">Password</h2>
          <label className={label}>New password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              className={`${field} pr-10`}
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7f8c85] hover:text-[#191f1d]"
            >
              {showPw ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>

          <label className={`${label} mt-3`}>Confirm new password</label>
          <input
            type={showPw ? 'text' : 'password'}
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void savePassword(); }}
            autoComplete="new-password"
            className={field}
          />

          <div className="mt-4">
            <button onClick={() => void savePassword()} disabled={savingPw || !pw || !pw2} className={primary}>
              {savingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Update password
            </button>
          </div>
          {noteEl(pwNote)}
        </div>
      </div>
    </div>
  );
}
