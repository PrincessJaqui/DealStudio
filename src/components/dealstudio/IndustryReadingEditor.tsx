/**
 * IndustryReadingEditor — the articles an investor reads alongside the market.
 *
 * Split out of MarketEditor because Industry Reading is now its own section in
 * the investor room and its own tab here. One thing, one place.
 *
 * Articles still live on the market jsonb, so there is no migration: only where
 * they are EDITED has moved.
 */

import {
  Plus, Trash2, Loader2, Image as ImageIcon, EyeOff, Eye, ChevronUp, ChevronDown, RefreshCw,
} from 'lucide-react';
import { EMPTY_MARKET, fetchLinkPreviewResult, type DealMarket } from '../../lib/dealStudio';
import { useState } from 'react';

const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';

export function IndustryReadingEditor({
  value,
  onChange,
}: {
  value: DealMarket | null;
  onChange: (next: DealMarket) => void;
}) {
  const m: DealMarket = { ...EMPTY_MARKET, ...(value ?? {}) };
  const [fetching, setFetching] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState('');

  const setArticle = (i: number, patch: Partial<DealMarket['articles'][number]>) => {
    const next = [...m.articles];
    next[i] = { ...next[i], ...patch };
    onChange({ ...m, articles: next });
  };

  /** Order is the argument: the first article is the one they will actually read. */
  const moveArticle = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= m.articles.length) return;
    const next = [...m.articles];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...m, articles: next });
  };

  const pull = async (i: number, url: string) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    setFetching(f => ({ ...f, [i]: true }));
    setNote('');

    const r = await fetchLinkPreviewResult(url);
    setFetching(f => { const n = { ...f }; delete n[i]; return n; });

    if (!r.ok) {
      setNote(
        r.reason === 'not-enabled'
          ? 'Automatic previews are off. The link-preview function needs deploying in Supabase with JWT verification disabled. Until then, paste an image URL below.'
          : 'That link did not return a preview. Paste an image URL below.'
      );
      return;
    }

    const p = r.preview;
    setArticle(i, {
      title: m.articles[i]?.title || p.title,
      source: m.articles[i]?.source || p.site,
      description: p.description || '',
      image: p.image || '',
    });
  };

  return (
    <div className="space-y-4">
      {note && (
        <p className="rounded-xl bg-[#fff7ed] border border-[#fed7aa] px-4 py-3 text-sm text-[#9a3412]">
          {note}
        </p>
      )}
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
