/**
 * MarketEditor — admin editor for the Market tab. Controlled: every edit flows
 * up via onChange, which the screen debounces and auto-saves (no Save button).
 * Edits market overview, TAM/SAM/SOM (value + methodology note + source links),
 * and a list of industry/market articles.
 */
import { useState } from 'react';
import { Plus, Trash2, RefreshCw, Loader2, ChevronUp, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { EMPTY_MARKET, fetchLinkPreview } from '../../lib/dealStudio';
import type { DealMarket, DealMetric, DealArticle, DealSource } from '../../lib/dealStudio';

const card = 'rounded-2xl border border-[#edf0f3] bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';
const input = 'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';

const METRICS: { key: 'tam' | 'sam' | 'som'; label: string; hint: string }[] = [
  { key: 'tam', label: 'TAM', hint: 'Total addressable market' },
  { key: 'sam', label: 'SAM', hint: 'Serviceable addressable market' },
  { key: 'som', label: 'SOM', hint: 'Serviceable obtainable market' },
];

function SourceList({ sources, onChange }: { sources: DealSource[]; onChange: (s: DealSource[]) => void }) {
  return (
    <div className="space-y-2">
      {sources.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className={input + ' flex-[2]'} placeholder="Label (e.g. Statista 2025)" value={s.label}
            onChange={e => onChange(sources.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <input className={input + ' flex-[3]'} placeholder="https://..." value={s.url}
            onChange={e => onChange(sources.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
          <button type="button" onClick={() => onChange(sources.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg p-2 text-[#99a1af] hover:bg-[#fef2f2] hover:text-[#dc2626]" aria-label="Remove source">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...sources, { label: '', url: '' }])}
        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline">
        <Plus className="w-3.5 h-3.5" /> Add source link
      </button>
    </div>
  );
}

export function MarketEditor({ value, onChange }: { value: DealMarket | null | undefined; onChange: (m: DealMarket) => void }) {
  const m: DealMarket = { ...EMPTY_MARKET, ...(value || {}) };
  const [fetching, setFetching] = useState<Record<number, boolean>>({});
  const setMetric = (k: 'tam' | 'sam' | 'som', patch: Partial<DealMetric>) => onChange({ ...m, [k]: { ...m[k], ...patch } });
  const setArticle = (i: number, patch: Partial<DealArticle>) => onChange({ ...m, articles: m.articles.map((a, j) => j === i ? { ...a, ...patch } : a) });
  const moveArticle = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= m.articles.length) return;
    const next = [...m.articles];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...m, articles: next });
  };
  // Pull title/source/description/image from the link. Fills empty title/source
  // (so a manual title is kept) and always refreshes the preview image/text.
  const pull = async (i: number, url: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    setFetching(f => ({ ...f, [i]: true }));
    const p = await fetchLinkPreview(url);
    setFetching(f => { const n = { ...f }; delete n[i]; return n; });
    if (!p) return;
    setArticle(i, {
      title: m.articles[i]?.title || p.title,
      source: m.articles[i]?.source || p.site,
      description: p.description || '',
      image: p.image || '',
    });
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <label className={labelCls}>Market overview</label>
        <textarea className={input + ' mt-2 min-h-[80px]'} placeholder="A sentence or two framing the market and why now."
          value={m.overview} onChange={e => onChange({ ...m, overview: e.target.value })} />
        <p className="mt-2 text-xs text-[#99a1af]">TAM, SAM, and SOM can&apos;t be pulled from a reliable public source, so enter your figures and attach the links and notes that justify how you arrived at each. Changes save automatically.</p>
      </div>

      {METRICS.map(({ key, label, hint }) => {
        const metric = m[key];
        return (
          <div key={key} className={card}>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold text-[#191f1d]">{label}</span>
              <span className="text-xs text-[#99a1af]">{hint}</span>
            </div>
            <div className="mt-3 grid gap-3">
              <div>
                <label className={labelCls}>Value</label>
                <input className={input + ' mt-1'} placeholder="$4.2B" value={metric.value} onChange={e => setMetric(key, { value: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>How you got here</label>
                <textarea className={input + ' mt-1 min-h-[64px]'} placeholder="Methodology and assumptions behind this number." value={metric.note} onChange={e => setMetric(key, { note: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Source links</label>
                <div className="mt-2"><SourceList sources={metric.sources} onChange={s => setMetric(key, { sources: s })} /></div>
              </div>
            </div>
          </div>
        );
      })}

      <div className={card}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#191f1d]">Industry &amp; market articles</span>
          <button type="button" onClick={() => onChange({ ...m, articles: [...m.articles, { title: '', source: '', url: '', date: '', description: '', image: '' }] })}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add article
          </button>
        </div>
        <p className="mt-1 text-xs text-[#99a1af]">Paste a link and tab out — the title, source, summary, and image fill in automatically. Use the toggle on each article to hide just that image for investors.</p>
        {m.articles.length === 0 ? (
          <p className="mt-3 text-sm text-[#99a1af]">No articles yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {m.articles.map((a, i) => (
              <div key={i} className="rounded-xl border border-[#edf0f3] p-3">
                {/* Link first — pasting it pulls the rest. */}
                <div className="flex items-center gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button type="button" onClick={() => moveArticle(i, -1)} disabled={i === 0}
                      className="rounded p-0.5 text-[#99a1af] hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)] disabled:opacity-30" aria-label="Move article up">
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => moveArticle(i, 1)} disabled={i === m.articles.length - 1}
                      className="rounded p-0.5 text-[#99a1af] hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)] disabled:opacity-30" aria-label="Move article down">
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  <input className={input} placeholder="https://..." value={a.url}
                    onChange={e => setArticle(i, { url: e.target.value })}
                    onBlur={e => pull(i, e.target.value.trim())} />
                  <button type="button" onClick={() => pull(i, a.url)} disabled={!a.url || !!fetching[i]}
                    className="shrink-0 rounded-lg p-2 text-[#7f8c85] hover:bg-[var(--ds-tint)] hover:text-[var(--ds-brand)] disabled:opacity-40" aria-label="Refetch preview">
                    {fetching[i] ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                  <button type="button" onClick={() => onChange({ ...m, articles: m.articles.filter((_, j) => j !== i) })}
                    className="shrink-0 rounded-lg p-2 text-[#99a1af] hover:bg-[#fef2f2] hover:text-[#dc2626]" aria-label="Remove article">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-2 flex gap-3">
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-[#edf0f3] bg-[#f5f6f8] flex items-center justify-center">
                    {a.image ? (
                      <img src={a.image} alt="" className="h-full w-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-[#c7cdd4]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input className={input} placeholder="Title" value={a.title} onChange={e => setArticle(i, { title: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2">
                      <input className={input} placeholder="Source" value={a.source} onChange={e => setArticle(i, { source: e.target.value })} />
                      <input className={input} placeholder="Date (e.g. Mar 2025)" value={a.date} onChange={e => setArticle(i, { date: e.target.value })} />
                    </div>
                    {/* Auto-fill needs the link-preview function. This field means an
                        article can still carry an image without it. */}
                    <input
                      className={input}
                      placeholder="Image URL (https://... , optional)"
                      value={a.image ?? ''}
                      onChange={e => setArticle(i, { image: e.target.value.trim() })}
                    />
                  </div>
                </div>
                {!!a.image && (
                  <label className="mt-2 flex items-center gap-2 text-xs font-medium text-[#191f1d] cursor-pointer select-none">
                    <input type="checkbox" checked={!!a.hideImage} onChange={e => setArticle(i, { hideImage: e.target.checked })}
                      className="h-4 w-4 rounded border-[var(--ds-brd)] text-[var(--ds-brand)] focus:ring-[var(--ds-brand)]" />
                    Hide this image for investors
                  </label>
                )}
                {fetching[i] && <p className="mt-2 text-xs text-[#99a1af] inline-flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Reading the link…</p>}
                {!!a.description && (
                  <textarea className={input + ' mt-2 min-h-[56px]'} placeholder="Summary (auto-filled)" value={a.description}
                    onChange={e => setArticle(i, { description: e.target.value })} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
