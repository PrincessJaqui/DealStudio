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

const card = 'rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';
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
        {/* The section header, not a field label. It was labelCls, the uppercase
            grey style used on every INPUT label in this file, so the title of the
            tab and the caption on a text box were the same thing. */}
        <h3 className="text-sm font-bold text-[#191f1d]">Market overview</h3>
        <p className="text-xs text-[#7f8c85] mt-0.5">
          A sentence or two framing the market and why now. TAM, SAM and SOM cannot be pulled
          from a reliable public source, so enter your own figures and attach what justifies them.
        </p>
        <textarea className={input + ' mt-3 min-h-[80px]'} placeholder="A sentence or two framing the market and why now."
          value={m.overview} onChange={e => onChange({ ...m, overview: e.target.value })} />
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

    </div>
  );
}
