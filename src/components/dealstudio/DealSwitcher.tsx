/**
 * DealSwitcher — jump between the company's deals from anywhere in the admin.
 * Shows the deal currently being edited (from the URL) and lists the rest.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, Check, Plus, Loader2 } from 'lucide-react';
import { fetchOrgDeals, type OrgDeal } from '../../lib/org';

export function DealSwitcher() {
  const nav = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [deals, setDeals] = useState<OrgDeal[] | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => { void fetchOrgDeals().then(setDeals); }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // With no slug in the URL the editor loads the most recent deal, which is the
  // first row of the same ordered query, so mirror that here.
  const current = slug
    ? deals?.find(d => d.slug === slug)
    : deals?.[0];

  if (!deals || deals.length === 0) return null;

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 h-9 px-3 rounded-xl border border-[#edf0f3] bg-white text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8] max-w-[220px]"
      >
        <span className="truncate">{current?.company_name || current?.slug || 'Select a deal'}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-[#7f8c85]" />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-30 w-64 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5">
          <p className="px-3 py-1.5 text-[11px] uppercase tracking-wider font-semibold text-[var(--ds-accent-ink)]">
            Your deals
          </p>

          <div className="max-h-72 overflow-y-auto">
            {deals.map(d => {
              const active = d.slug === current?.slug;
              return (
                <button
                  key={d.id}
                  onClick={() => { setOpen(false); nav(`/admin/d/${d.slug}`); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-left ${
                    active ? 'bg-[var(--ds-tint)]' : 'hover:bg-[#f5f6f8]'
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-[#191f1d] truncate">
                      {d.company_name || d.slug}
                    </span>
                    <span className="block text-xs text-[#7f8c85] truncate">
                      /d/{d.slug} · {d.is_active ? 'Live' : 'Draft'}
                    </span>
                  </span>
                  {active && <Check className="w-4 h-4 shrink-0 text-[var(--ds-brand)]" />}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { setOpen(false); nav('/admin/deals'); }}
            className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d] border-t border-[#edf0f3]"
          >
            <Plus className="w-4 h-4" /> New deal
          </button>
        </div>
      )}
    </div>
  );
}
