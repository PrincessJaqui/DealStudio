/**
 * Deal Flow, as its own page, across every deal the company owns.
 *
 * The per-deal Deal Flow tab answers "who is looking at THIS raise". This page
 * answers the question a founder with more than one deal actually has: "who is
 * looking at ANYTHING of mine, and at which one". Hence the Deal column, which
 * you can filter and sort by.
 *
 * Deliberately read-and-triage, not edit. Stage changes need a note, notes need
 * history, blocking needs a confirm, all of which live in the per-deal tab. So
 * a row here links straight through to that person on their own deal rather
 * than duplicating a thousand lines of editing UI that could drift out of sync.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Loader2, ChevronUp, ChevronDown, Download, ExternalLink, Eye, User as UserIcon,
} from 'lucide-react';
import { fetchOrgPeople, STAGE_LABEL, type OrgPerson, type DealStage } from '../../lib/dealStudio';

const DASH = '\u2013';

const fmtDate = (iso: string | null) => {
  if (!iso) return DASH;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? DASH : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const num = (n: number | undefined) => (n ?? 0).toLocaleString();
const money = (n: number) => (n > 0 ? '$' + Math.round(n).toLocaleString() : DASH);
const mins = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.round(s / 60)} min`);

type SortKey = 'deal_company' | 'name' | 'stage' | 'visits' | 'committed' | 'last_seen';

/** Small circular avatar with an initial fallback. */
function Avatar({ src, label }: { src?: string | null; label?: string | null }) {
  const [broken, setBroken] = useState(false);
  const letter = (label || '').trim().charAt(0).toUpperCase();
  return (
    <span className="w-7 h-7 shrink-0 rounded-full overflow-hidden ring-2 ring-white shadow-[0_2px_8px_-2px_rgba(12,16,34,0.22)] bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] flex items-center justify-center">
      {src && !broken
        ? <img src={src} alt="" loading="lazy" width={28} height={28} className="w-full h-full object-cover" onError={() => setBroken(true)} />
        : letter
          ? <span className="text-[11px] font-semibold text-white">{letter}</span>
          : <UserIcon className="w-3.5 h-3.5 text-white/70" />}
    </span>
  );
}

export function DealFlowScreen() {
  const nav = useNavigate();
  const [rows, setRows] = useState<OrgPerson[] | null>(null);
  const [q, setQ] = useState('');
  const [dealFilter, setDealFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => { void (async () => setRows(await fetchOrgPeople()))(); }, []);

  // The deals present in the data, for the Deal filter.
  const deals = useMemo(() => {
    const seen = new Map<string, string>();
    (rows ?? []).forEach(r => { if (!seen.has(r.deal_id)) seen.set(r.deal_id, r.deal_company || r.deal_slug); });
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows ?? [];
    if (dealFilter !== 'all') r = r.filter(p => p.deal_id === dealFilter);
    if (stageFilter !== 'all') r = r.filter(p => p.stage === stageFilter);

    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(p =>
        (p.email || '').toLowerCase().includes(needle) ||
        (p.name || '').toLowerCase().includes(needle) ||
        (p.company_name || '').toLowerCase().includes(needle) ||
        (p.deal_company || '').toLowerCase().includes(needle));
    }

    const val = (p: OrgPerson) => {
      if (sort === 'last_seen') return p.last_seen ? new Date(p.last_seen).getTime() : 0;
      const v = p[sort];
      return typeof v === 'string' ? v.toLowerCase() : (v ?? 0);
    };
    return [...r].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === bv) return 0;
      return (av > bv ? 1 : -1) * (dir === 'asc' ? 1 : -1);
    });
  }, [rows, q, dealFilter, stageFilter, sort, dir]);

  const exportCsv = () => {
    const head = ['Deal', 'Email', 'Contact', 'Company', 'Status', 'Committed', 'Visits', 'Time', 'Last viewed'];
    const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(',')];
    for (const p of filtered) {
      lines.push([
        p.deal_company || p.deal_slug, p.email || '', p.name || '', p.company_name || '',
        STAGE_LABEL[p.stage] ?? p.stage, p.committed || 0, p.visits,
        Math.round(p.total_seconds / 60) + ' min', p.last_seen ? fmtDate(p.last_seen) : '',
      ].map(cell).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'dealstudio-deal-flow.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';
  const pill = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition ${
      on ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
         : 'text-[#7f8c85] hover:bg-[#edf0f3]'
    }`;

  const Th = ({ k, children, center }: { k: SortKey; children: React.ReactNode; center?: boolean }) => {
    const on = sort === k;
    return (
      <th className={`font-semibold px-4 py-2.5 whitespace-nowrap ${center ? 'text-center' : 'text-left'}`}>
        <button
          onClick={() => { if (on) setDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSort(k); setDir('desc'); } }}
          className={`inline-flex items-center gap-1 hover:text-[#191f1d] ${center ? 'justify-center' : ''}`}
        >
          {children}
          <span className="flex flex-col leading-none">
            <ChevronUp className={`w-3 h-3 ${on && dir === 'asc' ? 'text-[var(--ds-brand)]' : 'text-[#c7cdd4]'}`} />
            <ChevronDown className={`w-3 h-3 -mt-1 ${on && dir === 'desc' ? 'text-[var(--ds-brand)]' : 'text-[#c7cdd4]'}`} />
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">Deal Flow</h1>
        <p className="text-sm text-[#7f8c85]">Every investor across every deal you run, and where each one stands.</p>
      </div>

      {rows === null ? (
        <div className={`${card} p-8 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>
      ) : (
        <div className={`${card} p-5`}>
          {/* Filters */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] shrink-0">Deal</label>
              <select
                value={dealFilter}
                onChange={e => setDealFilter(e.target.value)}
                className="h-9 rounded-xl bg-[#f5f6f8] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30 cursor-pointer max-w-[220px] truncate"
              >
                <option value="all">All deals</option>
                {deals.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>

            <div className="lg:ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#99a1af]" />
                <input
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search name, email, company"
                  className="w-full sm:w-64 h-9 bg-[#f5f6f8] rounded-xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                />
              </div>
              <button
                onClick={exportCsv}
                className="w-9 h-9 rounded-full bg-[#f5f6f8] hover:bg-[#edf0f3] border border-[#edf0f3] flex items-center justify-center shrink-0"
                title="Export as CSV"
                aria-label="Export as CSV"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Stage pills */}
          <div className="flex gap-1 overflow-x-auto ds-scroll-x mb-4 bg-[#f5f6f8] rounded-full p-1 w-fit max-w-full">
            <button onClick={() => setStageFilter('all')} className={pill(stageFilter === 'all')}>All</button>
            {(['lead', 'viewed', 'negotiating', 'committed', 'passed'] as DealStage[]).map(st => (
              <button key={st} onClick={() => setStageFilter(st)} className={pill(stageFilter === st)}>
                {STAGE_LABEL[st]}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-10 text-sm text-[#99a1af] text-center">
              {(rows ?? []).length === 0 ? 'No investors yet. Share a deal room to start tracking.' : 'Nothing matches those filters.'}
            </p>
          ) : (
            <div className="rounded-2xl border border-[#edf0f3] overflow-x-auto ds-scroll-x">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="bg-white text-[11px] uppercase tracking-wide text-[#7f8c85] border-b border-[#edf0f3]">
                    <Th k="deal_company">Deal</Th>
                    <Th k="name">Investor</Th>
                    <Th k="stage">Status</Th>
                    <Th k="committed" center>Committed</Th>
                    <Th k="visits" center>Visits</Th>
                    <th className="font-semibold px-4 py-2.5 text-center">Time</th>
                    <Th k="last_seen">Last viewed</Th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={`${p.deal_id}-${p.email}-${i}`} className="bg-white odd:bg-[#fafbfc] hover:bg-[#f5f6f8] border-b border-[#f5f6f8] last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--ds-tint)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ds-brand)] max-w-[180px]">
                          <span className="truncate">{p.deal_company || p.deal_slug}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="flex items-center gap-2.5">
                          <Avatar src={p.contact_photo} label={p.name || p.email} />
                          <span className="min-w-0">
                            <span className="block font-medium text-[#191f1d] truncate max-w-[190px]">{p.name || p.email}</span>
                            {p.name && <span className="block text-xs text-[#99a1af] truncate max-w-[190px]">{p.email}</span>}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-block rounded-full bg-[#f5f6f8] px-2.5 py-0.5 text-[11px] font-semibold text-[#7f8c85]">
                          {STAGE_LABEL[p.stage] ?? p.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums whitespace-nowrap text-[#191f1d] font-medium">{money(p.committed)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-[#7f8c85]">{num(p.visits)}</td>
                      <td className="px-4 py-3 text-center tabular-nums text-[#7f8c85] whitespace-nowrap">{mins(p.total_seconds)}</td>
                      <td className="px-4 py-3 text-[#7f8c85] whitespace-nowrap">{fmtDate(p.last_seen)}</td>
                      <td className="px-4 py-3 text-right">
                        {/* Editing lives on the deal itself, where a stage change can
                            demand its note and a block can ask for confirmation. */}
                        <button
                          onClick={() => nav(`/admin/d/${p.deal_slug}#dealflow`)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline whitespace-nowrap"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-xs text-[#99a1af]">
            <Eye className="w-3 h-3 inline mr-1 -mt-0.5" />
            Showing {filtered.length} of {(rows ?? []).length}. Open a row to change status or add a note on that deal.
          </p>
        </div>
      )}
    </div>
  );
}
