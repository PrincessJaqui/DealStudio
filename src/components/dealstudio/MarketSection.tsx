/**
 * MarketSection — investor-facing market sizing + industry articles.
 * Signature element: a nested TAM > SAM > SOM funnel. Each band is selectable
 * and reveals the figure's methodology note and the source links that justify
 * it, so the number always carries its evidence.
 */
import { useState, useRef, useEffect } from 'react';
import { useInViewOnce } from '../../lib/useInViewOnce';
import { ArrowUpRight, FileText } from 'lucide-react';
import type { DealMarket, DealMetric, DealArticle } from '../../lib/dealStudio';

type Key = 'tam' | 'sam' | 'som';

/** Clamps body copy to 5 lines with a right-aligned Read more, matching the
 *  rest of the deal studio's text and toggle style. */
function ClampText({ text, className }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 2);
  }, [text]);
  return (
    <div>
      <p ref={ref} className={`${className || ''} ${expanded ? '' : 'line-clamp-5'}`}>{text}</p>
      {(overflowing || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="mt-1 ml-auto block text-sm font-semibold text-[var(--ds-accent-ink)] hover:underline"
        >
          {expanded ? 'Read less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

/** Fall back to the link's domain rather than showing a bare "Untitled". */
function hostOf(url?: string): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

// Investor article card: image banner when available, clickable to the source,
// with an expandable summary. Styled to match the deal-document cards.
function ArticleCard({ a, textOnly }: { a: DealArticle; textOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const hasDesc = !!(a.description && a.description.trim());
  const showImage = !textOnly && !!a.image;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] transition-shadow hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.12)]">
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="group block">
        {showImage ? (
          <div className="aspect-[16/9] w-full overflow-hidden bg-[#f5f7f9]">
            <img src={a.image} alt="" loading="lazy" className="h-full w-full object-cover"
              onError={e => { const p = e.currentTarget.parentElement as HTMLElement | null; if (p) p.style.display = 'none'; }} />
          </div>
        ) : null}
        <div className="p-3">
          <div className="flex items-start gap-2">
            {!showImage && (
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ds-tint)] text-[var(--ds-brand)]"><FileText className="w-4 h-4" /></span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#191f1d] line-clamp-2 group-hover:text-[var(--ds-brand)]">{a.title || a.source || hostOf(a.url) || 'Untitled'}</span>
              <span className="mt-0.5 block truncate text-xs text-[#99a1af]">{[a.source, a.date].filter(Boolean).join(' · ')}</span>
            </span>
            <ArrowUpRight className="w-4 h-4 shrink-0 text-[#cbd5cf] group-hover:text-[var(--ds-brand)]" />
          </div>
        </div>
      </a>
      {hasDesc && (
        <div className="px-3 pb-3">
          <p className={`text-xs leading-relaxed text-[#7f8c85] ${open ? '' : 'line-clamp-2'}`}>{a.description}</p>
          <button type="button" onClick={() => setOpen(o => !o)} className="mt-1 ml-auto block text-xs font-semibold text-[var(--ds-brand)] hover:underline">
            {open ? 'Show less' : 'Show more'}
          </button>
        </div>
      )}
    </div>
  );
}

const BANDS: { key: Key; label: string; full: string }[] = [
  { key: 'tam', label: 'TAM', full: 'Total addressable market' },
  { key: 'sam', label: 'SAM', full: 'Serviceable addressable market' },
  { key: 'som', label: 'SOM', full: 'Serviceable obtainable market' },
];

function hasContent(m?: DealMetric | null) {
  return !!m && (!!m.value || !!m.note || (m.sources || []).length > 0);
}

export function MarketSection({ market }: { market: DealMarket }) {
  const [active, setActive] = useState<Key>('som');
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const anyMetric = hasContent(market.tam) || hasContent(market.sam) || hasContent(market.som);
  const showMarket = anyMetric || !!market.overview;
  if (!showMarket) return null;

  const metric = market[active];
  const cardCls = 'rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';

  return (
    <div ref={ref} data-section="market" className={`${cardCls} ${inView ? 'ds-animate' : ''}`}>
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Market</h2>
      {market.overview && (
        <div className="mb-4">
          <ClampText text={market.overview} className="text-sm leading-relaxed text-[#4a5565]" />
        </div>
      )}

      {anyMetric && (
        <>
          {/* Concentric market sizing: TAM outer, SAM middle, SOM center.
              Schematic (not to scale, since the figures span orders of magnitude). */}
          <div className="flex flex-col items-center gap-5 sm:flex-row" role="tablist" aria-label="Market sizing">
            <svg viewBox="0 0 200 200" className="ds-pulse-pie h-44 w-44 shrink-0" aria-hidden="true">
              <defs>
                <linearGradient id="selGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--ds-accent)" />
                  <stop offset="100%" stopColor="var(--ds-accent-to)" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="92" fill={active === 'tam' ? 'url(#selGrad)' : 'var(--ds-accent-ring-1)'} className="cursor-pointer transition-all"
                onClick={() => setActive('tam')} />
              <circle cx="100" cy="100" r="64" fill={active === 'sam' ? 'url(#selGrad)' : 'var(--ds-accent-ring-2)'} className="cursor-pointer transition-all"
                onClick={() => setActive('sam')} />
              <circle cx="100" cy="100" r="36" fill={active === 'som' ? 'url(#selGrad)' : 'var(--ds-accent-ring-3)'} className="cursor-pointer transition-all"
                onClick={() => setActive('som')} />
              <text x="100" y="105" textAnchor="middle" className="fill-white font-bold" style={{ fontSize: '14px' }}>{metric?.value || '—'}</text>
            </svg>

            <div className="w-full space-y-2 sm:flex-1">
              {BANDS.map((b, bi) => {
                const m = market[b.key];
                const on = active === b.key;
                return (
                  <button
                    key={b.key}
                    role="tab"
                    aria-selected={on}
                    type="button"
                    onClick={() => setActive(b.key)}
                    style={{ animationDelay: `${bi * 180}ms` }}
                    className={`ds-pulse ds-card relative flex w-full items-center justify-between gap-3 rounded-2xl border px-5 py-4 text-left transition-colors ${on ? 'border-transparent bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] shadow-[0_6px_20px_-6px_rgba(63,102,41,0.6)]' : 'border-[#edf0f3] bg-white hover:bg-[#f5f6f8]'}`}
                  >
                    <span className="min-w-0">
                      <span className={`block text-[11px] font-bold uppercase tracking-wider ${on ? 'text-white' : 'text-[var(--ds-brand)]'}`}>{b.label}</span>
                      <span className={`block text-xs ${on ? 'text-white/85' : 'text-[#7f8c85]'}`}>{b.full}</span>
                    </span>
                    <span className={`text-xl font-bold ${on ? 'text-white' : 'text-[var(--ds-brand)]'}`}>{m?.value || '—'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected metric detail */}
          <div className="mt-4 rounded-xl border border-[#edf0f3] bg-[#f5f6f8] p-4">
            {metric?.note
              ? <ClampText text={metric.note} className="text-sm leading-relaxed text-[#4a5565]" />
              : <p className="text-sm leading-relaxed text-[#99a1af]">No methodology note for {active.toUpperCase()} yet.</p>}
            {(metric?.sources || []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metric.sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-brd)] bg-white px-3 py-1 text-xs font-medium text-[var(--ds-accent-ink)] hover:bg-[var(--ds-accent-tint)] transition-colors"
                  >
                    {s.label || 'Source'} <ArrowUpRight className="w-3 h-3" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Industry & Market Reading — split into its own section so it can be ordered
 *  independently (below Documents in the investor view). */
export function IndustryReadingSection({ market }: { market: DealMarket }) {
  const [showAll, setShowAll] = useState(false);
  const articles = market.articles || [];
  if (articles.length === 0) return null;
  return (
    <div data-section="reading" className="rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Industry &amp; Market Reading</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(showAll ? articles : articles.slice(0, 2)).map((a, i) => (
          <ArticleCard key={i} a={a} textOnly={a.hideImage || market.articlesTextOnly} />
        ))}
      </div>
      {articles.length > 2 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="mt-3 ml-auto block text-sm font-semibold text-[var(--ds-brand)] hover:underline"
        >
          {showAll ? 'Show less' : `Show all ${articles.length} Articles`}
        </button>
      )}
    </div>
  );
}
