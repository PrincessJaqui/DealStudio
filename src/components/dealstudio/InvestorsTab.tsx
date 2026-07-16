/**
 * The platform-wide investor directory. Master admin only.
 *
 * The contact graph, as a working table. Reshaped from a flat read-only list into
 * something a platform admin actually manages from:
 *
 *   - Visits and Deals-seen are CENTERED and share the muted-number style; Visits
 *     comes before Deals-seen.
 *   - Sort arrows sit to the RIGHT of each label.
 *   - "Deals" is now "Details" -> opens a per-investor panel showing every deal
 *     they touched with that investor's own visits, page views, and last-seen.
 *   - "Last seen" is "Last login" = last time they opened any room.
 *   - The email column is gone; a row MENU at the end holds View details / Email.
 *   - A profile avatar sits before the name, a company logo before the company.
 *   - Columns drag to reorder, and the leftmost stays frozen while you scroll.
 *
 * Everything reads admin_all_investors, gated in the database on is_platform_admin.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, ChevronUp, ChevronDown, Download, Loader2, Mail, MoreVertical,
  Eye, X, GripVertical, ExternalLink, User as UserIcon,
} from 'lucide-react';
import { adminAllInvestors, type PlatformInvestor, type PlatformInvestorDeal } from '../../lib/dealStudio';

const DASH = '\u2013';
const fmtDate = (iso: string | null) => {
  if (!iso) return DASH;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? DASH : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const num = (n: number | undefined) => (n ?? 0).toLocaleString();

type ColId = 'who' | 'company' | 'linkedin' | 'visits' | 'deals' | 'last';
const DEFAULT_ORDER: ColId[] = ['who', 'company', 'linkedin', 'visits', 'deals', 'last'];

type SortKey = 'name' | 'company_name' | 'total_visits' | 'deal_count' | 'last_login';

function Avatar({ src, label, brand }: { src?: string | null; label?: string | null; brand?: boolean }) {
  const [broken, setBroken] = useState(false);
  const letter = (label || '').trim().charAt(0).toUpperCase();
  return (
    <span className={`w-7 h-7 shrink-0 rounded-full overflow-hidden ring-2 ring-white shadow-[0_2px_8px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center ${brand ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]' : 'bg-[#eef1f4]'}`}>
      {src && !broken
        ? <img src={src} alt="" loading="lazy" decoding="async" width={28} height={28} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : letter
          ? <span className={`text-[11px] font-semibold ${brand ? 'text-white' : 'text-[#7f8c85]'}`}>{letter}</span>
          : <UserIcon className="w-3.5 h-3.5 text-[#c7cdd4]" />}
    </span>
  );
}

export function InvestorsTab() {
  const [rows, setRows] = useState<PlatformInvestor[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('last_login');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [detailFor, setDetailFor] = useState<PlatformInvestor | null>(null);

  const ORDER_KEY = 'ds-investors-cols';
  const [order, setOrder] = useState<ColId[]>(() => {
    try {
      const raw = localStorage.getItem(ORDER_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ColId[];
        if (saved.length === DEFAULT_ORDER.length && DEFAULT_ORDER.every(c => saved.includes(c))) return saved;
      }
    } catch { /* ignore */ }
    return DEFAULT_ORDER;
  });
  const [dragCol, setDragCol] = useState<ColId | null>(null);
  useEffect(() => { try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* private mode */ } }, [order]);

  const moveCol = (from: ColId, to: ColId) => {
    if (from === to) return;
    setOrder(prev => {
      const next = prev.filter(c => c !== from);
      next.splice(next.indexOf(to), 0, from);
      return next;
    });
  };

  useEffect(() => { void (async () => setRows(await adminAllInvestors()))(); }, []);

  const filtered = useMemo(() => {
    let r = rows ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(p =>
        (p.email || '').toLowerCase().includes(needle) ||
        (p.name || '').toLowerCase().includes(needle) ||
        (p.company_name || '').toLowerCase().includes(needle) ||
        p.deals.some(d => (d.company || d.slug || '').toLowerCase().includes(needle)));
    }
    const val = (p: PlatformInvestor) => {
      if (sort === 'last_login') return p.last_login ? new Date(p.last_login).getTime() : 0;
      const v = p[sort];
      return typeof v === 'string' ? v.toLowerCase() : (v ?? 0);
    };
    return [...r].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === bv) return 0;
      const c = av > bv ? 1 : -1;
      return dir === 'asc' ? c : -c;
    });
  }, [rows, q, sort, dir]);

  const exportCsv = () => {
    const head = ['Email', 'Name', 'Company', 'LinkedIn', 'Visits', 'Deals seen', 'Deal names', 'Last login'];
    const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(',')];
    for (const p of filtered) {
      lines.push([
        p.email, p.name || '', p.company_name || '', p.linkedin || '',
        p.total_visits, p.deal_count,
        p.deals.map(d => d.company || d.slug).join('; '),
        p.last_login ? fmtDate(p.last_login) : '',
      ].map(cell).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'dealstudio-investors.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';

  const Th = ({ col, k, children, center, frozen }: {
    col: ColId; k?: SortKey; children: React.ReactNode; center?: boolean; frozen?: boolean;
  }) => {
    const on = k && sort === k;
    return (
      <th
        draggable
        onDragStart={() => setDragCol(col)}
        onDragEnd={() => setDragCol(null)}
        onDragOver={(e) => { if (dragCol && dragCol !== col) e.preventDefault(); }}
        onDrop={() => { if (dragCol) { moveCol(dragCol, col); setDragCol(null); } }}
        className={`font-semibold px-4 py-2.5 whitespace-nowrap bg-inherit cursor-grab active:cursor-grabbing ${center ? 'text-center' : 'text-left'} ${
          frozen ? 'sticky left-0 z-20 shadow-[6px_0_10px_-8px_rgba(12,16,34,0.35)]' : ''
        } ${dragCol === col ? 'opacity-40' : ''}`}
      >
        <span className={`inline-flex items-center gap-1 ${center ? 'justify-center' : ''}`}>
          <GripVertical className="w-3 h-3 text-[#d7dbe0] shrink-0" />
          {k ? (
            <button
              onClick={() => { if (on) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('desc'); } }}
              className="inline-flex items-center gap-1 hover:text-[#191f1d]"
            >
              {children}
              <span className="flex flex-col leading-none">
                <ChevronUp className={`w-3 h-3 ${on && dir === 'asc' ? 'text-[var(--ds-brand)]' : 'text-[#c7cdd4]'}`} />
                <ChevronDown className={`w-3 h-3 -mt-1 ${on && dir === 'desc' ? 'text-[var(--ds-brand)]' : 'text-[#c7cdd4]'}`} />
              </span>
            </button>
          ) : children}
        </span>
      </th>
    );
  };

  const Td = ({ children, center, frozen }: { children: React.ReactNode; center?: boolean; frozen?: boolean }) => (
    <td className={`px-4 py-3 whitespace-nowrap bg-inherit ${center ? 'text-center' : ''} ${
      frozen ? 'sticky left-0 z-10 shadow-[6px_0_10px_-8px_rgba(12,16,34,0.35)]' : ''
    }`}>{children}</td>
  );

  const COLS: Record<ColId, {
    th: (frozen: boolean) => React.ReactNode;
    td: (p: PlatformInvestor, frozen: boolean) => React.ReactNode;
  }> = {
    who: {
      th: (f) => <Th key="who" col="who" k="name" frozen={f}>Investor</Th>,
      td: (p, f) => (
        <Td key="who" frozen={f}>
          <span className="flex items-center gap-2.5">
            <Avatar src={p.contact_photo} label={p.name || p.email} brand />
            <span className="min-w-0">
              <span className="block font-medium text-[#191f1d] truncate max-w-[200px]">{p.name || p.email}</span>
              {p.name && <span className="block text-xs text-[#99a1af] truncate max-w-[200px]">{p.email}</span>}
            </span>
          </span>
        </Td>
      ),
    },
    company: {
      th: (f) => <Th key="company" col="company" k="company_name" frozen={f}>Company</Th>,
      td: (p, f) => (
        <Td key="company" frozen={f}>
          {p.company_name ? (
            <span className="flex items-center gap-2">
              <Avatar src={p.company_logo} label={p.company_name} />
              <span className="text-[#191f1d]">{p.company_name}</span>
            </span>
          ) : <span className="text-[#c7cdd4]">{DASH}</span>}
        </Td>
      ),
    },
    linkedin: {
      th: (f) => <Th key="linkedin" col="linkedin" frozen={f}>LinkedIn</Th>,
      td: (p, f) => (
        <Td key="linkedin" frozen={f}>
          {p.linkedin ? (
            <a href={p.linkedin} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[var(--ds-brand)] hover:underline">
              Profile <ExternalLink className="w-3 h-3" />
            </a>
          ) : <span className="text-[#c7cdd4]">{DASH}</span>}
        </Td>
      ),
    },
    visits: {
      th: (f) => <Th key="visits" col="visits" k="total_visits" center frozen={f}>Visits</Th>,
      td: (p, f) => <Td key="visits" center frozen={f}><span className="tabular-nums text-[#7f8c85]">{num(p.total_visits)}</span></Td>,
    },
    deals: {
      th: (f) => <Th key="deals" col="deals" k="deal_count" center frozen={f}>Deals seen</Th>,
      td: (p, f) => <Td key="deals" center frozen={f}><span className="tabular-nums text-[#7f8c85]">{num(p.deal_count)}</span></Td>,
    },
    last: {
      th: (f) => <Th key="last" col="last" k="last_login" frozen={f}>Last login</Th>,
      td: (p, f) => <Td key="last" frozen={f}><span className="text-[#7f8c85]">{fmtDate(p.last_login)}</span></Td>,
    },
  };

  if (rows === null) {
    return <div className={`${card} p-8 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#191f1d]">Investors</h3>
          <p className="text-xs text-[#7f8c85] mt-0.5">Every investor across every deal on the platform, and what they have seen.</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#99a1af]" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search investor or deal"
              className="w-full sm:w-64 h-9 bg-[#f5f6f8] rounded-xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30" />
          </div>
          <button onClick={exportCsv} className="w-9 h-9 rounded-full bg-[#f5f6f8] hover:bg-[#edf0f3] border border-[#edf0f3] flex items-center justify-center text-[#191f1d] shrink-0" title="Export as CSV" aria-label="Export as CSV">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-sm text-[#99a1af] text-center">{rows.length === 0 ? 'No investors yet.' : 'Nothing matches that.'}</p>
      ) : (
        <div className="rounded-2xl border border-[#edf0f3] overflow-x-auto ds-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white text-left text-[11px] uppercase tracking-wide text-[#7f8c85] border-b border-[#edf0f3]">
                {order.map((c, i) => COLS[c].th(i === 0))}
                <th className="px-4 py-2.5 bg-inherit" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.email} className="bg-white odd:bg-[#fafbfc] hover:bg-[#f5f6f8] border-b border-[#f5f6f8] last:border-0">
                  {order.map((c, i) => COLS[c].td(p, i === 0))}
                  <td className="px-4 py-3 text-right bg-inherit">
                    <button
                      onClick={(e) => {
                        if (menuFor === p.email) { setMenuFor(null); return; }
                        // Anchor the menu to the button's real position. Without a
                        // top/left the fixed menu landed at an unpredictable spot
                        // (often off-screen), which read as "the menu is broken".
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
                        setMenuFor(p.email);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#7f8c85] hover:bg-white hover:text-[#191f1d]"
                      aria-label={`Actions for ${p.email}`}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {menuFor === p.email && createPortal(
                      <>
                        <div className="fixed inset-0 z-[66]" onClick={() => setMenuFor(null)} />
                        <div className="fixed z-[67] w-48 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5"
                          style={{ top: menuPos.top, right: menuPos.right }}>
                          <button onClick={() => { setMenuFor(null); setDetailFor(p); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                            <Eye className="w-4 h-4" /> View details
                          </button>
                          <a href={`mailto:${p.email}`} onClick={() => setMenuFor(null)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                            <Mail className="w-4 h-4" /> Email
                          </a>
                          {p.linkedin && (
                            <a href={p.linkedin} target="_blank" rel="noreferrer" onClick={() => setMenuFor(null)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                              <ExternalLink className="w-4 h-4" /> LinkedIn
                            </a>
                          )}
                        </div>
                      </>,
                      document.body,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-[#99a1af]">Drag a column header to reorder. The first column stays pinned while you scroll.</p>

      {detailFor && <DetailPanel investor={detailFor} onClose={() => setDetailFor(null)} />}
    </div>
  );
}

function DetailPanel({ investor, onClose }: { investor: PlatformInvestor; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const deals = investor.deals || [];
  const mins = (s: number) => s < 60 ? `${Math.round(s)}s` : `${Math.round(s / 60)} min`;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-start justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl mt-[6vh]">
          {/* Identity header: everything about WHO the investor is, in one place. */}
          <div className="flex items-start gap-3 p-5 border-b border-[#edf0f3]">
            <Avatar src={investor.contact_photo} label={investor.name || investor.email} brand />
            <div className="min-w-0">
              <h2 className="font-bold text-[#191f1d] truncate">{investor.name || investor.email}</h2>
              <p className="text-xs text-[#7f8c85] truncate">
                {investor.email}
                {investor.company_name ? ` \u00b7 ${investor.company_name}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                {investor.linkedin && (
                  <a href={investor.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ds-brand)] hover:underline">
                    LinkedIn <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {investor.website && (
                  <a href={investor.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ds-brand)] hover:underline">
                    Website <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <a href={`mailto:${investor.email}`} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ds-brand)] hover:underline">
                  Email <Mail className="w-3 h-3" />
                </a>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="ml-auto shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#7f8c85] mb-3">
              Activity by deal ({deals.length})
            </p>

            {deals.length === 0 ? (
              <p className="text-sm text-[#99a1af] py-6 text-center">No deal activity recorded for this investor yet.</p>
            ) : (
              <div className="rounded-xl border border-[#edf0f3] overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-[#7f8c85] bg-[#fafbfc] border-b border-[#edf0f3]">
                      <th className="font-semibold px-4 py-2.5">Deal</th>
                      <th className="font-semibold px-4 py-2.5">Status</th>
                      <th className="font-semibold px-4 py-2.5 text-center">Views</th>
                      <th className="font-semibold px-4 py-2.5 text-center">Deck</th>
                      <th className="font-semibold px-4 py-2.5 text-center">Docs</th>
                      <th className="font-semibold px-4 py-2.5 text-center">Time</th>
                      <th className="font-semibold px-4 py-2.5 text-right">Last viewed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((d: PlatformInvestorDeal, i) => (
                      <tr key={i} className="border-b border-[#f5f6f8] last:border-0 odd:bg-[#fafbfc]">
                        <td className="px-4 py-3 font-medium text-[#191f1d] whitespace-nowrap">{d.company || d.slug}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full bg-[var(--ds-tint)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ds-brand)] capitalize">{d.status}</span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-[#7f8c85]">{num(d.page_views)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-[#7f8c85]">{num(d.deck_views)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-[#7f8c85]">{num(d.document_views)}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-[#7f8c85] whitespace-nowrap">{mins(d.total_seconds)}</td>
                        <td className="px-4 py-3 text-right text-[#7f8c85] whitespace-nowrap">{fmtDate(d.last_seen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
