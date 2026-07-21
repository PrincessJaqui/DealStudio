/**
 * InterfaceStudioScreen — now a thin shell for platform admins.
 *
 * White-label branding moved into System Settings, where it belongs: it is a
 * setting, and it sat on its own page with a SECOND logo upload that competed
 * with the one in Settings > Identity. Both wrote the same column, so a founder
 * had two controls for one image and no way to tell which had won.
 *
 * What is left here is the Landing Page editor, which edits DealStudio's own
 * marketing site and is master-admin only. The branding panel is rendered from
 * the same shared component Settings uses, so there is one implementation.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, ExternalLink } from 'lucide-react';
import { LandingEditor } from './LandingEditor';
import { BrandingPanel } from '../dealstudio/BrandingPanel';
import { isPlatformAdmin } from '../../lib/billing';

export function InterfaceStudioScreen() {
  const nav = useNavigate();
  const [isMaster, setIsMaster] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'branding' | 'landing'>('landing');

  useEffect(() => { void isPlatformAdmin().then(setIsMaster); }, []);

  if (isMaster === null) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">Interface Studio</h1>
        <p className="text-sm text-[#7f8c85]">
          {isMaster
            ? 'Edit the public marketing site, and preview how branding lands.'
            : 'Your branding now lives in System Settings.'}
        </p>
      </div>

      {!isMaster ? (
        /* A customer who reaches this URL directly gets pointed at the new home
           rather than a dead page. */
        <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-8 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--ds-tint)] flex items-center justify-center">
            <Palette className="w-6 h-6 text-[var(--ds-brand)]" />
          </div>
          <h2 className="mt-4 font-bold text-[#191f1d]">Branding moved to Settings</h2>
          <p className="mt-1.5 text-sm text-[#7f8c85]">
            Your logo and brand colours are now in System Settings, together in one place.
          </p>
          <button
            onClick={() => nav('/admin/settings')}
            className="mt-5 inline-flex items-center gap-1.5 h-10 px-5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 transition"
          >
            Open System Settings <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="inline-flex bg-white border border-[#edf0f3] rounded-full p-1.5 gap-1 mb-5 shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]">
            {([['landing', 'Landing Page'], ['branding', 'Branding']] as const).map(([t, label]) => (
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

          {tab === 'landing' ? <LandingEditor /> : <BrandingPanel />}
        </>
      )}
    </div>
  );
}
