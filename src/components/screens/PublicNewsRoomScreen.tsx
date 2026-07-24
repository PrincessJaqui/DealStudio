/**
 * Public NewsRoom page, Phase 1a.
 *
 * What an investor sees when they open a share link. Mirrors the deal room:
 * main content on the left, a navigation rail on the right, here the rail is the
 * archive of past updates as cards, newest first. Selecting a card shows that
 * update; the content renders read-only from the same blocks the founder built.
 *
 * Anon-safe: reads through fetchPublicNewsroom (share token, published only).
 * No gating yet, every reader sees the whole update. Per-stage gating arrives
 * with Phase 2 and will be enforced server-side, not here.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, ExternalLink, TrendingUp } from 'lucide-react';
import { fetchPublicNewsroom, BLOCK_LABEL, type PublicNewsroom, type NewsBlock } from '../../lib/newsroom';

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '';

export function PublicNewsRoomScreen() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicNewsroom | null | 'missing'>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = token ? await fetchPublicNewsroom(token) : null;
      if (!live) return;
      if (!r) { setData('missing'); return; }
      setData(r);
      setActiveId(r.updates[0]?.id ?? null);
    })();
    return () => { live = false; };
  }, [token]);

  const active = useMemo(
    () => (data && data !== 'missing' ? data.updates.find(u => u.id === activeId) ?? null : null),
    [data, activeId],
  );

  if (data === null) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  if (data === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-[#f5f6f8]">
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#191f1d]">Updates not found</h1>
          <p className="mt-2 text-sm text-[#7f8c85]">This link may be wrong or the updates are no longer shared.</p>
        </div>
      </div>
    );
  }

  const grad = data.brand_from && data.brand_to
    ? { background: `linear-gradient(135deg, ${data.brand_from}, ${data.brand_to})` }
    : undefined;

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      {/* Header with the founder's brand */}
      <header className="bg-white border-b border-[#edf0f3]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center gap-3">
          <span className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center shrink-0" style={grad}>
            {data.logo_url
              ? <img src={data.logo_url} alt="" className="w-full h-full object-cover" />
              : <span className="text-white font-bold">{(data.company || 'C').charAt(0).toUpperCase()}</span>}
          </span>
          <div>
            <h1 className="font-bold text-[#191f1d] leading-tight">{data.company || 'Company'}</h1>
            <p className="text-xs text-[#7f8c85]">{data.title}</p>
          </div>
        </div>
      </header>

      {data.updates.length === 0 ? (
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <p className="text-sm text-[#7f8c85]">No updates published yet. Check back soon.</p>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[1fr_260px] gap-6">
          {/* Main content */}
          <main className="order-2 lg:order-1 min-w-0">
            {active && (
              <article className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-6 sm:p-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-brand)]">{fmtDate(active.published_at)}</p>
                <h2 className="mt-1 text-2xl font-bold text-[#191f1d]">{active.title}</h2>
                <div className="mt-6 space-y-8">
                  {active.blocks.map(b => <ReadBlock key={b.id} block={b} />)}
                </div>
              </article>
            )}
          </main>

          {/* Archive rail */}
          <aside className="order-1 lg:order-2">
            <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-4 lg:sticky lg:top-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-2">All updates</p>
              <div className="space-y-1">
                {data.updates.map(u => (
                  <button
                    key={u.id}
                    onClick={() => setActiveId(u.id)}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition ${u.id === activeId ? 'bg-[var(--ds-tint)]' : 'hover:bg-[#f5f6f8]'}`}
                  >
                    <span className="block text-sm font-medium text-[#191f1d] truncate">{u.title}</span>
                    <span className="block text-[11px] text-[#99a1af]">{fmtDate(u.published_at)}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}

      <footer className="max-w-5xl mx-auto px-6 py-8 text-center">
        <a href="https://dealstudio.io" target="_blank" rel="noreferrer" className="text-xs text-[#99a1af] hover:text-[#7f8c85] inline-flex items-center gap-1">
          Powered by DealStudio <ExternalLink className="w-3 h-3" />
        </a>
      </footer>
    </div>
  );
}

// ── Read-only block renderers ─────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wide text-[#7f8c85] mb-2">{title}</h3>
      {children}
    </section>
  );
}

function ReadBlock({ block }: { block: NewsBlock }) {
  const d = block.data;

  switch (block.type) {
    case 'overview':
      return d.text ? <p className="text-[15px] leading-relaxed text-[#191f1d] whitespace-pre-wrap">{d.text}</p> : null;

    case 'kpis':
      return (d.items?.length ? (
        <Section title="KPIs">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {d.items.map((k: any, i: number) => (
              <div key={i} className="rounded-xl bg-[#f5f6f8] px-3 py-3">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ds-brand)] truncate">{k.label}</p>
                <p className="font-bold text-xl text-[#191f1d] tabular-nums mt-0.5">{k.value || '\u2013'}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null);

    case 'revenue':
      return (
        <Section title="Revenue">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[['Qualified', d.qualified], ['Closed', d.closed], ['MRR', d.mrr], ['ARR', d.arr], ['One-time', d.oneTime], ['Projection', d.projection]]
              .filter(([, v]) => v)
              .map(([label, v]) => (
                <div key={label} className="rounded-xl bg-[#f5f6f8] px-3 py-3">
                  <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ds-brand)]">{label}</p>
                  <p className="font-bold text-lg text-[#191f1d] tabular-nums mt-0.5">{v}</p>
                </div>
              ))}
          </div>
          {d.note && <p className="mt-3 text-sm text-[#7f8c85] flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> {d.note}</p>}
        </Section>
      );

    case 'highlights':
      return (d.items?.filter((x: string) => x.trim()).length ? (
        <Section title="Highlights">
          <ol className="space-y-2">
            {d.items.filter((x: string) => x.trim()).map((it: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-[15px] text-[#191f1d]">
                <span className="shrink-0 w-6 h-6 rounded-full bg-[var(--ds-tint)] text-[var(--ds-brand)] text-xs font-bold flex items-center justify-center">{i + 1}</span>
                <span className="leading-relaxed">{it}</span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null);

    case 'challenges':
      return (d.items?.filter((x: string) => x.trim()).length ? (
        <Section title="Challenges">
          <ul className="space-y-1.5 list-disc pl-5 text-[15px] text-[#191f1d]">
            {d.items.filter((x: string) => x.trim()).map((it: string, i: number) => <li key={i} className="leading-relaxed">{it}</li>)}
          </ul>
        </Section>
      ) : null);

    case 'team':
      return d.text ? <Section title="Team"><p className="text-[15px] leading-relaxed text-[#191f1d] whitespace-pre-wrap">{d.text}</p></Section> : null;

    case 'news':
      return (d.items?.filter((n: any) => n.title || n.url).length ? (
        <Section title="In the News">
          <ul className="space-y-1.5">
            {d.items.filter((n: any) => n.title || n.url).map((n: any, i: number) => (
              <li key={i}>
                {n.url
                  ? <a href={n.url} target="_blank" rel="noreferrer" className="text-[15px] text-[var(--ds-brand)] hover:underline inline-flex items-center gap-1">{n.title || n.url} <ExternalLink className="w-3.5 h-3.5" /></a>
                  : <span className="text-[15px] text-[#191f1d]">{n.title}</span>}
              </li>
            ))}
          </ul>
        </Section>
      ) : null);

    case 'gbu':
      return ((d.good || d.bad || d.ugly) ? (
        <Section title="Good, Bad & Ugly">
          <div className="space-y-2.5">
            {[['Good', d.good], ['Bad', d.bad], ['Ugly', d.ugly]].filter(([, v]) => v).map(([label, v]) => (
              <div key={label}>
                <p className="text-xs font-bold text-[#7f8c85]">{label}</p>
                <p className="text-[15px] text-[#191f1d] leading-relaxed whitespace-pre-wrap">{v}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null);

    case 'quote':
      return d.text ? (
        <blockquote className="border-l-3 border-[var(--ds-brand)] pl-4 py-1">
          <p className="text-lg italic text-[#191f1d] leading-relaxed">{d.text}</p>
          {d.attribution && <footer className="mt-1 text-sm text-[#7f8c85]">{d.attribution}</footer>}
        </blockquote>
      ) : null;

    case 'signature':
      return ((d.name || d.text) ? (
        <div className="pt-2">
          {d.text && <p className="text-[15px] text-[#191f1d] leading-relaxed whitespace-pre-wrap">{d.text}</p>}
          {d.name && <p className="mt-2 font-semibold text-[#191f1d]">{d.name}</p>}
          {d.role && <p className="text-sm text-[#7f8c85]">{d.role}</p>}
        </div>
      ) : null);

    default:
      return null;
  }
}
