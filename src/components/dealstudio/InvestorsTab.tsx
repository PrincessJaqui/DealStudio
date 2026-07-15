/**
 * The platform-wide investor directory. Master admin only.
 *
 * Every investor who has touched any deal on DealStudio, deduplicated by email,
 * with how many deals each has seen and which ones. This is the contact graph:
 * the asset that gets more valuable the more deals run through the platform, and
 * the one thing a competitor cannot copy by rebuilding the features.
 *
 * It reads one function, admin_all_investors, which the database gates on
 * is_platform_admin. A founder who somehow reached this component would get an
 * empty list and a warning in the console, not another org's investors.
 */

import { useEffect, useMemo, useState } from 'react';
import { Search, ChevronUp, ChevronDown, Download, Loader2, Mail } from 'lucide-react';
import { adminAllInvestors, type PlatformInvestor } from '../../lib/dealStudio';

const DASH = '\u2013';
const fmtDate = (iso: string | null) => {
  if (!iso) return DASH;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? DASH : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

type SortKey = 'email' | 'name' | 'company_name' | 'deal_count' | 'total_visits' | 'last_seen';

export function InvestorsTab() {
  const [rows, setRows] = useState<PlatformInvestor[] | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

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
      if (sort === 'last_seen') return p.last_seen ? new Date(p.last_seen).getTime() : 0;
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
    const head = ['Email', 'Name', 'Company', 'Deals seen', 'Deal names', 'Total visits', 'Last seen'];
    const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(',')];
    for (const p of filtered) {
      lines.push([
        p.email, p.name || '', p.company_name || '', p.deal_count,
        p.deals.map(d => d.company || d.slug).join('; '),
        p.total_visits, p.last_seen ? fmtDate(p.last_seen) : '',
      ].map(cell).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dealstudio-investors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => {
    const on = sort === k;
    return (
      <th className={`font-semibold px-4 py-2.5 whitespace-nowrap ${right ? 'text-right' : ''}`}>
        <button
          onClick={() => { if (on) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('desc'); } }}
          className={`inline-flex items-center gap-1 hover:text-[#191f1d] ${right ? 'flex-row-reverse' : ''}`}
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

  if (rows === null) {
    return <div className={`${card} p-8 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#191f1d]">Investors</h3>
          <p className="text-xs text-[#7f8c85] mt-0.5">
            Every investor across every deal on the platform, and what they have seen.
          </p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#99a1af]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search investor or deal"
              className="w-full sm:w-64 h-9 bg-[#f5f6f8] rounded-xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
          </div>
          <button
            onClick={exportCsv}
            className="w-9 h-9 rounded-full bg-[#f5f6f8] hover:bg-[#edf0f3] border border-[#edf0f3] flex items-center justify-center text-[#191f1d] shrink-0"
            title="Export as CSV"
            aria-label="Export as CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-sm text-[#99a1af] text-center">
          {rows.length === 0 ? 'No investors yet.' : 'Nothing matches that.'}
        </p>
      ) : (
        <div className="rounded-2xl border border-[#edf0f3] overflow-x-auto ds-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#7f8c85] border-b border-[#edf0f3]">
                <Th k="email">Email</Th>
                <Th k="name">Name</Th>
                <Th k="company_name">Company</Th>
                <Th k="deal_count" right>Deals seen</Th>
                <th className="font-semibold px-4 py-2.5">Deals</th>
                <Th k="total_visits" right>Visits</Th>
                <Th k="last_seen" right>Last seen</Th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.email} className="border-b border-[#f5f6f8] last:border-0 odd:bg-[#fafbfc] hover:bg-[#f5f6f8]">
                  <td className="px-4 py-3 font-medium text-[#191f1d] whitespace-nowrap">{p.email}</td>
                  <td className="px-4 py-3 text-[#7f8c85] whitespace-nowrap">{p.name || DASH}</td>
                  <td className="px-4 py-3 text-[#7f8c85] whitespace-nowrap">{p.company_name || DASH}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#191f1d] font-semibold">{p.deal_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[280px]">
                      {p.deals.slice(0, 4).map((d, i) => (
                        <span key={i} className="rounded-full bg-[var(--ds-tint)] text-[var(--ds-brand)] text-[11px] font-medium px-2 py-0.5 whitespace-nowrap">
                          {d.company || d.slug}
                        </span>
                      ))}
                      {p.deals.length > 4 && (
                        <span className="text-[11px] text-[#99a1af] px-1">+{p.deals.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[#7f8c85]">{(p.total_visits || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-[#7f8c85] whitespace-nowrap">{fmtDate(p.last_seen)}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`mailto:${p.email}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#7f8c85] hover:bg-white hover:text-[var(--ds-brand)]"
                      title={`Email ${p.email}`}
                      aria-label={`Email ${p.email}`}
                    >
                      <Mail className="w-4 h-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
