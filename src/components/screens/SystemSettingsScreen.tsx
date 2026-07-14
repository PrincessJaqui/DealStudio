/**
 * SystemSettingsScreen — company identity and the signed-in user's account.
 * Company name writes to the organization (RLS restricts it to members).
 * Email and password changes go through Supabase Auth, never through our own
 * tables, so credentials are only ever handled by the auth service.
 */

import { useEffect, useState } from 'react';
import { Loader2, Check, Upload, Trash2, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAdminAuth } from '../dealstudio/AdminGate';
import { TeamMembers } from '../dealstudio/TeamMembers';
import { Tabs, TabsContent } from '../ui/tabs';
import { PillTabs } from '../dealstudio/PillTabs';
import { LogoCropper } from '../dealstudio/LogoCropper';
import { saveOrgBranding, uploadOrgLogo, renameOrg, setOrgHandle } from '../../lib/org';

const card = 'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';
const field = 'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const label = 'block text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-1.5';
const primary = 'inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60';

type Note = { kind: 'ok' | 'err'; text: string } | null;


/** Teal "last saved" pill for a settings card. Renders nothing until saved. */
function SavedPill({ at }: { at?: string }) {
  if (!at) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)] text-xs font-semibold px-3 py-1">
      Last saved {at}
    </span>
  );
}

export function SystemSettingsScreen() {
  const [tab, setTab] = useState('identity');

  const { org, refreshOrg } = useAdminAuth();

  const [handleDraft, setHandleDraft] = useState('');
  const [handleBusy, setHandleBusy] = useState(false);
  const [handleNote, setHandleNote] = useState('');
  const [handleOk, setHandleOk] = useState(false);

  useEffect(() => { setHandleDraft(org?.handle ?? ''); }, [org?.handle]);

  const saveHandle = async () => {
    if (!org) return;
    setHandleBusy(true); setHandleNote('');
    const r = await setOrgHandle(org.id, handleDraft.trim());
    setHandleBusy(false);
    setHandleOk(r.ok);
    setHandleNote(r.ok
      ? `Saved. Your rooms are now at dealstudio.io/${r.handle}/deal-name`
      : (r.message || 'Could not save that handle.'));
    if (r.ok) await refreshOrg();
  };


  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(org?.logo_url ?? null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoNote, setLogoNote] = useState('');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [savedAt, setSavedAt] = useState<Record<string, string>>({});

  const stamp = (key: string) =>
    setSavedAt(s => ({ ...s, [key]: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }));

  /** Picking a file opens the cropper; nothing uploads until it is positioned. */
  const onLogoPick = (file?: File) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setLogoNote('Choose an image file'); return; }
    if (file.size > 4 * 1024 * 1024) { setLogoNote('Keep it under 4MB'); return; }
    setLogoNote('');
    setCropFile(file);
  };

  /** The cropper hands back a square PNG, so the logo fills its container. */
  const onCropped = async (blob: Blob) => {
    if (!org) return;
    setCropFile(null);
    setLogoBusy(true);
    try {
      // Type from the blob: the cropper emits WebP where it can.
      const ext = blob.type === 'image/webp' ? 'webp' : 'png';
      const file = new File([blob], `logo.${ext}`, { type: blob.type });
      const url = await uploadOrgLogo(org.id, file);
      await saveOrgBranding(org.id, { logo_url: url });
      setLogoUrl(url);
      await refreshOrg();          // header picks it up at once
      stamp('company');
      setLogoNote('Logo updated');
    } catch (e: any) {
      setLogoNote(e?.message || 'Upload failed');
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    if (!org) return;
    setLogoBusy(true); setLogoNote('');
    try {
      await saveOrgBranding(org.id, { logo_url: null });
      setLogoUrl(null);
      await refreshOrg();
      stamp('company');
      setLogoNote('Logo removed');
    } catch (e: any) {
      setLogoNote(e?.message || 'Could not remove');
    } finally {
      setLogoBusy(false);
    }
  };

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
      // rename_org also carries the new name into every deal that was following
      // it, so the header, the deal switcher and the investor room all agree.
      const r = await renameOrg(name.trim());
      await refreshOrg();
      stamp('company');
      setNameNote({
        kind: 'ok',
        text: r.deals_updated > 0
          ? `Company name saved. ${r.deals_updated} deal${r.deals_updated === 1 ? '' : 's'} updated.`
          : 'Company name saved',
      });
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
    setPwNote({ kind: 'ok', text: 'Password updated' }); stamp('password');
  };

  const noteEl = (n: Note) =>
    n ? <p className={`text-sm mt-2 ${n.kind === 'ok' ? 'text-[var(--ds-accent-ink)]' : 'text-red-600'}`}>{n.text}</p> : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">System Settings</h1>
        <p className="text-sm text-[#7f8c85]">Your company and your account.</p>
      </div>

      <div className="space-y-5">
      {/* Settings split into tabs. It was one long scroll where a password field
          sat below team management below the company name, and nothing told you
          the page had more on it. */}
      <PillTabs
        tabs={[['identity', 'Identity'], ['team', 'Team'], ['security', 'Security']] as const}
        value={tab}
        onChange={setTab}
        hintKey="settings"
      />

      <Tabs value={tab} onValueChange={setTab} className="w-full">

        <TabsContent value="identity" className="space-y-5">
        <div className={card}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-[#191f1d]">Company</h2>
            <SavedPill at={savedAt.company} />
          </div>

          {/* The handle belongs with the company's identity, not buried in Deal
              Manager. Every deal room URL hangs off it. */}
          <label className={label}>Public handle</label>
          <div className="mt-1.5 mb-1 flex flex-wrap gap-2">
            <div className="flex-1 min-w-[240px] flex items-center rounded-xl bg-[#f5f6f8] px-3">
              <span className="text-sm text-[#9ca3af] shrink-0">dealstudio.io/</span>
              <input
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value.toLowerCase())}
                placeholder="your-company"
                className="flex-1 bg-transparent py-2.5 text-sm text-[#191f1d] outline-none min-w-0"
              />
            </div>
            <button
              onClick={() => void saveHandle()}
              disabled={handleBusy || !handleDraft.trim() || handleDraft.trim() === org?.handle}
              className="inline-flex items-center justify-center h-11 px-4 rounded-xl text-sm font-semibold text-white bg-[#191f1d] disabled:opacity-40"
            >
              Save handle
            </button>
          </div>
          {handleNote && (
            <p className={`mb-1 text-sm ${handleOk ? 'text-[var(--ds-accent-ink)]' : 'text-red-600'}`}>
              {handleNote}
            </p>
          )}
          <p className="mb-5 text-xs text-[#9ca3af]">
            Deal rooms live at dealstudio.io/{org?.handle || 'your-handle'}/deal-name.
            Links you have already shared keep working.
          </p>

          <label className={label}>Logo</label>
          <div className="flex items-center gap-4 mt-1.5 mb-5">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-white bg-white shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center">
              {logoUrl
                ? <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                : <ImageIcon className="w-5 h-5 text-[#c7cdd4]" />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-sm font-medium text-white ${logoBusy ? 'opacity-60' : 'hover:brightness-110 cursor-pointer'}`}>
                  {logoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {logoUrl ? 'Replace' : 'Upload'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={logoBusy}
                    onChange={(e) => { void onLogoPick(e.target.files?.[0]); e.currentTarget.value = ''; }}
                  />
                </label>

                {logoUrl && (
                  <button
                    onClick={() => void removeLogo()}
                    disabled={logoBusy}
                    className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#7f8c85] hover:text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-[#9ca3af] mt-1.5">
                PNG or SVG, square works best. Shown in your header and to investors. Max 2MB.
              </p>
            </div>
          </div>
          {noteEl(logoNote)}

          <label className={label}>Company name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder="Your company name" />
          <div className="mt-4">
            <button onClick={() => void saveName()} disabled={savingName || !name.trim()} className={primary}>
              {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
            </button>
          </div>
          {noteEl(nameNote)}
        </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-5">
          <TeamMembers />
        </TabsContent>

        <TabsContent value="security" className="space-y-5">
        <div className={card}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-[#191f1d]">Login email</h2>
            <SavedPill at={savedAt.email} />
          </div>
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
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-[#191f1d]">Password</h2>
            <SavedPill at={savedAt.password} />
          </div>
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
        </TabsContent>
      </Tabs>

      {cropFile && (
        <LogoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(blob) => { void onCropped(blob); }}
        />
      )}

      </div>
    </div>
  );
}
