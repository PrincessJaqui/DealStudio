/**
 * BrandingPanel — the white-label colour controls, extracted so they can live in
 * System Settings rather than on their own page.
 *
 * Deliberately has NO logo upload. There used to be two places to upload a logo,
 * here and in Settings > Identity, which meant two sources of truth for one
 * image and a founder wondering which one "took". The logo now lives in
 * Identity only; this panel reads it for the preview and never writes it.
 *
 * Every colour in the app resolves through CSS variables, so editing these
 * repaints the whole UI live. Saves are debounced, because dragging a colour
 * picker fires continuously and each event would otherwise be a write.
 */

import { useEffect, useRef, useState } from 'react';
import { useAdminAuth } from './AdminGate';
import { applyOrgTheme, saveOrgBranding, type OrgTheme } from '../../lib/org';

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

export function BrandingPanel() {
  const { org, refreshOrg } = useAdminAuth();

  const [theme, setTheme] = useState<OrgTheme | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!org) return;
    setTheme({
      brand_from: org.brand_from,
      brand_to: org.brand_to,
      brand_accent: org.brand_accent,
      accent_to: org.accent_to,
    });
  }, [org]);

  // Live preview: paint the tokens as they are edited.
  useEffect(() => { if (theme) applyOrgTheme(theme); }, [theme]);

  const set = (patch: Partial<OrgTheme>) => setTheme(t => (t ? { ...t, ...patch } : t));
  const invalid = !theme || !Object.values(theme).every(v => HEX.test(v));

  const firstRun = useRef(true);
  useEffect(() => {
    if (!org || !theme || invalid) return;
    if (firstRun.current) { firstRun.current = false; return; }
    const t = setTimeout(() => {
      void (async () => {
        try {
          // logo_url is passed through untouched: this panel does not own it.
          await saveOrgBranding(org.id, { ...theme, logo_url: org.logo_url });
          await refreshOrg();
          setError('');
        } catch (e: any) {
          setError(e?.message || 'Could not save');
        }
      })();
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, invalid, org?.id]);

  if (!theme) return null;

  const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';

  return (
    <div className="space-y-5">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <div className={card}>
            <h2 className="font-bold text-[#191f1d]">Brand gradient</h2>
            <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">Primary buttons, active nav, headings.</p>
            <div className="flex flex-wrap gap-5">
              <Swatch label="From" value={theme.brand_from} onChange={(v) => set({ brand_from: v })} />
              <Swatch label="To" value={theme.brand_to} onChange={(v) => set({ brand_to: v })} />
            </div>
            <div className="mt-4 h-10 rounded-xl" style={{ background: `linear-gradient(90deg, ${theme.brand_from}, ${theme.brand_to})` }} />
          </div>

          <div className={card}>
            <h2 className="font-bold text-[#191f1d]">Accent gradient</h2>
            <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">Tabs, toggles, and data highlights.</p>
            <div className="flex flex-wrap gap-5">
              <Swatch label="From" value={theme.brand_accent} onChange={(v) => set({ brand_accent: v })} />
              <Swatch label="To" value={theme.accent_to} onChange={(v) => set({ accent_to: v })} />
            </div>
            <div className="mt-4 h-10 rounded-xl" style={{ background: `linear-gradient(90deg, ${theme.brand_accent}, ${theme.accent_to})` }} />
          </div>

          <p className="text-xs text-[#99a1af] px-1">
            Your logo lives in the Identity tab, so there is one place to change it.
          </p>
        </div>

        {/* Live preview */}
        <div className={card}>
          <h2 className="font-bold text-[#191f1d]">Preview</h2>
          <p className="text-sm text-[#7f8c85] mt-0.5 mb-4">This is how your deal room will look.</p>

          <div className="rounded-2xl border border-[#edf0f3] bg-[#f5f6f8] p-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full overflow-hidden bg-white border border-[#edf0f3] flex items-center justify-center shrink-0">
                {org?.logo_url
                  ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
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

            <div className="grid grid-cols-2 gap-2.5 mt-4">
              {[['Goal', '$750K'], ['Raised', '$0']].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white border border-[#edf0f3] px-3 py-2.5">
                  <p className="text-[10.5px] uppercase tracking-wider font-semibold" style={{ color: theme.brand_accent }}>{k}</p>
                  <p className="font-bold text-[19px] text-[#191f1d] tabular-nums">{v}</p>
                </div>
              ))}
            </div>

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
    </div>
  );
}
