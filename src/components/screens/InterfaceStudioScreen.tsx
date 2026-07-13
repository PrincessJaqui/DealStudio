/**
 * InterfaceStudioScreen — white-label theming. Companies set their brand
 * gradient and accent gradient, and upload a logo. Because every colour in the
 * app resolves through CSS variables, changing these repaints the entire UI.
 * Edits preview live; Save persists them to the organization.
 */

import { useEffect, useRef, useState } from 'react';
import { Loader2, UploadCloud, RotateCcw, Check } from 'lucide-react';
import { useAdminAuth } from '../dealstudio/AdminGate';
import { LogoCropper } from '../dealstudio/LogoCropper';
import { LandingEditor } from './LandingEditor';
import { isPlatformAdmin } from '../../lib/billing';
import {
  applyOrgTheme, saveOrgBranding, uploadOrgLogo, DEFAULT_THEME,
  type OrgTheme,
} from '../../lib/org';

const HEX = /^#[0-9a-fA-F]{6}$/;

function Swatch({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={HEX.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-10 w-12 shrink-0 rounded-xl border border-[#edf0f3] bg-white p-1 cursor-pointer"
      />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[#7f8c85]">{label}</p>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="w-28 bg-[#f5f6f8] rounded-lg px-2 py-1 text-sm font-mono text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
        />
      </div>
    </div>
  );
}

export function InterfaceStudioScreen() {
  const { org, refreshOrg } = useAdminAuth();

  const [theme, setTheme] = useState<OrgTheme | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [tab, setTab] = useState<'branding' | 'landing'>('branding');

  // The landing page is DealStudio's own marketing site, not the customer's.
  // The tab only exists for platform admins; the server rejects anyone else
  // regardless, but a tab a customer cannot use should not be shown at all.
  const [isMaster, setIsMaster] = useState(false);
  useEffect(() => { void isPlatformAdmin().then(setIsMaster); }, []);

  useEffect(() => {
    if (!org) return;
    setTheme({
      brand_from: org.brand_from,
      brand_to: org.brand_to,
      brand_accent: org.brand_accent,
      accent_to: org.accent_to,
    });
    setLogo(org.logo_url);
  }, [org]);

  // Live preview: paint the tokens as the user edits.
  useEffect(() => {
    if (theme) applyOrgTheme(theme);
  }, [theme]);

  const set = (patch: Partial<OrgTheme>) =>
    setTheme((t) => (t ? { ...t, ...patch } : t));

  const invalid = !theme || !Object.values(theme).every((v) => HEX.test(v));

  const save = async () => {
    if (!org || !theme || invalid) return;
    setSaving(true);
    setError('');
    try {
      await saveOrgBranding(org.id, { ...theme, logo_url: logo });
      await refreshOrg();   // header avatar picks up a new logo at once
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    } catch (e: any) {
      setError(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // Auto-save. Debounced, because dragging a colour picker fires constantly and
  // every one of those would otherwise be a write.
  const firstRun = useRef(true);
  useEffect(() => {
    if (!org || !theme || invalid) return;
    if (firstRun.current) { firstRun.current = false; return; }  // skip the initial load
    const t = setTimeout(() => { void save(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, logo, invalid, org?.id]);

  const reset = () => setTheme({ ...DEFAULT_THEME });

  /** Opens the cropper. Nothing uploads until the logo is positioned. */
  const pickLogo = (file: File) => {
    if (!org) return;
    setError('');
    setCropFile(file);
  };

  /** The cropper returns a square PNG, so the logo fills every container. */
  const onCropped = async (blob: Blob) => {
    if (!org) return;
    setCropFile(null);
    setError('');
    try {
      const url = await uploadOrgLogo(org.id, new File([blob], 'logo.png', { type: 'image/png' }));
      setLogo(url);   // auto-save picks it up
    } catch (e: any) {
      setError(e?.message || 'Logo upload failed');
    }
  };

  if (!theme) {
    return (
      <div className="max-w-6xl mx-auto px-6 pt-10">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" />
      </div>
    );
  }

  const card = 'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">Interface Studio</h1>
          <p className="text-sm text-[#7f8c85]">
            {tab === 'landing'
              ? 'Edit the public marketing page. Changes go live when you publish.'
              : 'Make DealStudio\u2122 look like your company. Changes preview instantly.'}
          </p>
        </div>
        <div className={`flex items-center gap-2 ${tab === 'landing' ? 'hidden' : ''}`}>
          {savedAt && (
            <span className="hidden sm:inline-flex items-center h-9 px-2.5 rounded-xl text-xs font-medium bg-[var(--ds-tint)] text-[var(--ds-brand)]">
              Saved {savedAt}
            </span>
          )}
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm text-[#7f8c85] hover:text-[#191f1d]"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={() => void save()}
            disabled={saving || invalid}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save
          </button>
        </div>
      </div>

      {isMaster && (
        <div className="inline-flex bg-white border border-[#edf0f3] rounded-full p-1.5 gap-1 mb-5 shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]">
          {([['branding', 'Branding'], ['landing', 'Landing Page']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-1.5 rounded-full text-sm font-medium transition ${
                tab === t
                  ? 'bg-gradient-to-br from-[var(--ds-accent)] to-[var(--ds-accent-to)] text-[var(--ds-on-accent)]'
                  : 'text-[#7f8c85] hover:text-[#191f1d]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && tab === 'branding' && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {isMaster && tab === 'landing' && <LandingEditor />}

      <div className={`grid gap-5 lg:grid-cols-2 ${tab === 'landing' ? 'hidden' : ''}`}>
        {/* Controls */}
        <div className="space-y-5">
          <div className={card}>
            <h2 className="font-bold text-[#191f1d]">Brand gradient</h2>
            <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">Primary buttons, active nav, headings.</p>
            <div className="flex flex-wrap gap-5">
              <Swatch label="From" value={theme.brand_from} onChange={(v) => set({ brand_from: v })} />
              <Swatch label="To" value={theme.brand_to} onChange={(v) => set({ brand_to: v })} />
            </div>
            <div
              className="mt-4 h-10 rounded-xl"
              style={{ background: `linear-gradient(90deg, ${theme.brand_from}, ${theme.brand_to})` }}
            />
          </div>

          <div className={card}>
            <h2 className="font-bold text-[#191f1d]">Accent gradient</h2>
            <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">Tabs, toggles, and data highlights.</p>
            <div className="flex flex-wrap gap-5">
              <Swatch label="From" value={theme.brand_accent} onChange={(v) => set({ brand_accent: v })} />
              <Swatch label="To" value={theme.accent_to} onChange={(v) => set({ accent_to: v })} />
            </div>
            <div
              className="mt-4 h-10 rounded-xl"
              style={{ background: `linear-gradient(90deg, ${theme.brand_accent}, ${theme.accent_to})` }}
            />
          </div>

          <div className={card}>
            <h2 className="font-bold text-[#191f1d]">Company logo</h2>
            <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">Shown on your deal rooms. PNG or SVG works best.</p>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full border border-[#edf0f3] bg-[#f5f6f8] flex items-center justify-center overflow-hidden shrink-0">
                {logo
                  ? <img src={logo} alt="" className="w-full h-full object-cover" />
                  : <span className="text-xs text-[#99a1af]">None</span>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickLogo(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
              >
                <UploadCloud className="w-4 h-4" /> Upload
              </button>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className={card}>
          <h2 className="font-bold text-[#191f1d]">Preview</h2>
          <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">This is how your deal room will look.</p>

          <div className="rounded-2xl border border-[#edf0f3] bg-[#f5f6f8] p-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-white border border-[#edf0f3] flex items-center justify-center shrink-0">
                {logo
                  ? <img src={logo} alt="" className="w-full h-full object-cover" />
                  : <span
                      className="w-full h-full flex items-center justify-center text-white font-bold"
                      style={{ background: `linear-gradient(135deg, ${theme.brand_from}, ${theme.brand_to})` }}
                    >{(org?.name || 'D').charAt(0).toUpperCase()}</span>}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-[#191f1d] truncate">{org?.name || 'Your company'}</p>
                <p className="text-xs text-[#7f8c85]">Seed / $750K</p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 mt-4 overflow-x-auto">
              {['Details', 'Market', 'Team'].map((t, i) => (
                <span
                  key={t}
                  className="shrink-0 rounded-xl px-3 py-1.5 text-sm font-medium"
                  style={i === 0
                    ? { background: `linear-gradient(90deg, ${theme.brand_accent}, ${theme.accent_to})`, color: '#04333A' }
                    : { color: '#7f8c85' }}
                >{t}</span>
              ))}
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-2.5 mt-4">
              {[['Goal', '$750K'], ['Raised', '$0']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white border border-[#edf0f3] px-3 py-2.5">
                  <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: theme.brand_accent }}>{k}</p>
                  <p className="font-bold text-[19px] text-[#191f1d] tabular-nums">{v}</p>
                </div>
              ))}
            </div>

            {/* Buttons + toggle */}
            <div className="flex items-center gap-2 mt-4">
              <span
                className="inline-flex items-center h-9 px-4 rounded-xl text-sm font-semibold text-white"
                style={{ background: `linear-gradient(135deg, ${theme.brand_from}, ${theme.brand_to})` }}
              >Schedule Meeting</span>
              <span
                className="inline-flex h-5 w-9 items-center rounded-full p-0.5"
                style={{ background: `linear-gradient(90deg, ${theme.brand_accent}, ${theme.accent_to})` }}
              >
                <span className="ml-auto block w-4 h-4 rounded-full bg-white" />
              </span>
            </div>
          </div>
        </div>
      </div>
      {cropFile && (
        <LogoCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onCropped={(blob) => { void onCropped(blob); }}
        />
      )}
    </div>
  );
}
