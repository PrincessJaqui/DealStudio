/**
 * MasterAdminScreen — the platform owner's console. Sits above tenancy: it can
 * see and edit every organization. The server enforces this (is_platform_admin);
 * this screen simply refuses to render for anyone else.
 */

import { useEffect, useState } from 'react';
import {
  Loader2, DollarSign, Plus, Download, RefreshCw, Search, Check, X, Shield,
  ChevronUp, ChevronDown, Pencil,
} from 'lucide-react';
import { EditOrgDialog } from '../dealstudio/EditOrgDialog';
import { LandingEditor } from './LandingEditor';
import { AddonsCard } from '../dealstudio/AddonsCard';
import {
  adminListOrgs, adminUpdateOrg, adminListTransactions, adminListPlans, savePlan,
  isPlatformAdmin, money, type AdminOrg, type Txn, type Plan,
} from '../../lib/billing';

const card = 'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]';
const RANGES: { label: string; days: number | null }[] = [
  { label: '24h', days: 1 }, { label: '7d', days: 7 },
  { label: '30d', days: 30 }, { label: '90d', days: 90 },
  { label: 'All', days: null },
];

function StatusPill({ s }: { s: string }) {
  const tone =
    s === 'paid' ? 'bg-[#e7f7f4] text-[var(--ds-accent-ink)]'
    : s === 'failed' ? 'bg-red-50 text-red-600'
    : s === 'refunded' ? 'bg-amber-50 text-amber-700'
    : 'bg-[#f5f6f8] text-[#7f8c85]';
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${tone}`}>{s}</span>;
}

export function MasterAdminScreen() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'users' | 'plans' | 'landing' | 'transactions'>('users');

  useEffect(() => { void isPlatformAdmin().then(setAllowed); }, []);

  if (allowed === null) {
    return <div className="max-w-6xl mx-auto px-6 pt-10"><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }
  if (!allowed) {
    return (
      <div className="max-w-md mx-auto px-6 pt-16 text-center">
        <Shield className="w-8 h-8 mx-auto text-[#7f8c85]" />
        <h1 className="mt-3 text-lg font-bold text-[#191f1d]">Not available</h1>
        <p className="text-sm text-[#7f8c85] mt-1">This console is limited to platform administrators.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">User Management</h1>
        <p className="text-sm text-[#7f8c85]">Master Admin</p>
      </div>

      <div className={`${card} !rounded-full p-1.5 inline-flex gap-1 mb-5`}>
        {(['users', 'plans', 'landing', 'transactions'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-1.5 rounded-full text-sm font-medium capitalize transition ${
              tab === t
                ? 'bg-gradient-to-r from-[var(--ds-accent)] to-[var(--ds-accent-to)] text-[var(--ds-on-accent)]'
                : 'text-[#7f8c85] hover:text-[#191f1d]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab />
        : tab === 'plans' ? <><PlansCard /><AddonsCard /></>
        : tab === 'landing' ? <LandingEditor />
        : <TransactionsTab />}
    </div>
  );
}

/* ── Users ─────────────────────────────────────────────────────────────────── */

type SortKey = 'name' | 'owner_email' | 'subscription_status' | 'deal_count' | 'created_at';

function UsersTab() {
  const [orgs, setOrgs] = useState<AdminOrg[] | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminOrg | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'created_at', dir: -1 });

  const load = async () => setOrgs(await adminListOrgs());
  useEffect(() => { void load(); void adminListPlans().then(setPlans as any); }, []);

  const act = async (id: string, patch: Parameters<typeof adminUpdateOrg>[1]) => {
    setBusy(id);
    try { await adminUpdateOrg(id, patch); await load(); }
    finally { setBusy(null); }
  };

  const toggleSort = (key: SortKey) =>
    setSort(s => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) } : { key, dir: 1 }));

  const rows = (orgs ?? [])
    .filter(o => !q || `${o.name} ${o.owner_email ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const k = sort.key;
      const av = k === 'deal_count' ? a.deal_count : String(a[k] ?? '').toLowerCase();
      const bv = k === 'deal_count' ? b.deal_count : String(b[k] ?? '').toLowerCase();
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });

  const SortTh = ({ label, k }: { label: string; k: SortKey }) => (
    <th className="font-semibold px-5 py-3 whitespace-nowrap">
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-[#191f1d]">
        {label}
        <span className="flex flex-col -space-y-1.5">
          <ChevronUp className={`w-3 h-3 ${sort.key === k && sort.dir === 1 ? 'text-[var(--ds-brand)]' : 'text-[#c7cdd4]'}`} />
          <ChevronDown className={`w-3 h-3 ${sort.key === k && sort.dir === -1 ? 'text-[var(--ds-brand)]' : 'text-[#c7cdd4]'}`} />
        </span>
      </button>
    </th>
  );

  return (
    <>
      <div className={card}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 border-b border-[#edf0f3]">
          <div>
            <h2 className="font-bold text-[#191f1d]">Companies</h2>
            <p className="text-sm text-[#7f8c85]">Every organization on the platform.</p>
          </div>
          <div className="sm:ml-auto relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#99a1af]" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search company or email"
              className="w-full sm:w-72 bg-[#f5f6f8] rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
          </div>
        </div>

        {orgs === null ? (
          <div className="p-5 flex items-center gap-2 text-sm text-[#7f8c85]">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[#7f8c85]">No companies yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[#7f8c85] border-b border-[#edf0f3]">
                  <SortTh label="Company" k="name" />
                  <SortTh label="Owner" k="owner_email" />
                  <SortTh label="Status" k="subscription_status" />
                  <SortTh label="Deals" k="deal_count" />
                  <SortTh label="Joined" k="created_at" />
                  <th className="font-semibold px-5 py-3 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(o => {
                  const trialing = new Date(o.trial_ends_at) > new Date()
                    && o.subscription_status !== 'active';
                  return (
                    <tr key={o.id} className="border-b border-[#f2f4f6] last:border-0">
                      <td className="px-5 py-3 font-semibold text-[#191f1d] whitespace-nowrap">{o.name}</td>
                      <td className="px-5 py-3 text-[#7f8c85] whitespace-nowrap">{o.owner_email ?? '—'}</td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {o.suspended ? <StatusPill s="failed" />
                          : o.comped ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--ds-tint)] text-[var(--ds-brand)]">Comped</span>
                          : trialing ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Trial</span>
                          : <StatusPill s={o.subscription_status === 'active' ? 'paid' : o.subscription_status} />}
                      </td>
                      <td className="px-5 py-3 tabular-nums">{o.deal_count}</td>
                      <td className="px-5 py-3 text-[#7f8c85] whitespace-nowrap">
                        {new Date(o.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setEditing(o)}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#edf0f3] text-xs font-medium text-[#191f1d] hover:bg-[#f5f6f8] whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            disabled={busy === o.id}
                            onClick={() => void act(o.id, { suspended: !o.suspended })}
                            className={`h-8 px-2.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                              o.suspended
                                ? 'border border-[#edf0f3] text-[#7f8c85] hover:text-[#191f1d]'
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`}
                          >
                            {o.suspended ? 'Restore' : 'Suspend'}
                          </button>
                          {busy === o.id && <Loader2 className="w-4 h-4 animate-spin text-[#7f8c85]" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <EditOrgDialog
          org={editing}
          plans={plans}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      )}
    </>
  );
}

/* ── Plans ─────────────────────────────────────────────────────────────────── */

function PlansCard() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('20');
  const [newHidden, setNewHidden] = useState(false);

  const load = async () => setPlans(await adminListPlans() as any);
  useEffect(() => { void load(); }, []);

  const commit = async (p: Plan) => {
    const raw = editing[p.id];
    if (raw === undefined) return;
    const cents = Math.round(parseFloat(raw) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    setSaving(p.id);
    try {
      await savePlan({ id: p.id, price_cents: cents });
      await load();
      setEditing(e => { const n = { ...e }; delete n[p.id]; return n; });
    } finally { setSaving(null); }
  };

  const add = async () => {
    const cents = Math.round(parseFloat(newPrice) * 100);
    if (!newName.trim() || !Number.isFinite(cents)) return;
    // A hidden plan is never offered to customers; it only applies when you put
    // an account on it deliberately.
    await savePlan({ name: newName.trim(), price_cents: cents, is_public: !newHidden } as any);
    setNewName(''); setNewPrice('20'); setNewHidden(false); setAdding(false);
    await load();
  };

  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div>
          <h2 className="font-bold text-[#191f1d]">Set Monthly Subscription Fees</h2>
          <p className="text-sm text-[#7f8c85]">Set recurring monthly charges.</p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          className="sm:ml-auto inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
        >
          <Plus className="w-4 h-4" /> Add New Plan
        </button>
      </div>

      {adding && (
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Plan name"
              className="flex-1 bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
            <input
              value={newPrice} onChange={e => setNewPrice(e.target.value)}
              inputMode="decimal" placeholder="20"
              className="w-full sm:w-32 bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
            <button onClick={() => void add()} className="h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
              Create
            </button>
          </div>

          <label className="mt-2 flex items-center gap-2 text-sm text-[#191f1d] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newHidden}
              onChange={e => setNewHidden(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--ds-brd)]"
            />
            Private plan
            <span className="text-xs text-[#9ca3af]">
              Never shown to customers. Only applies to accounts you put on it.
            </span>
          </label>
        </div>
      )}

      {plans === null ? (
        <Loader2 className="w-4 h-4 animate-spin text-[#7f8c85]" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(p => {
            const dirty = editing[p.id] !== undefined;
            return (
              <div key={p.id} className="rounded-2xl bg-[#f5f6f8] border border-[#edf0f3] p-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
                  <DollarSign className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[#7f8c85] truncate flex items-center gap-1.5">
                    {p.name}
                    {(p as any).is_public === false && (
                      <span className="shrink-0 rounded-full bg-[#eef0f3] text-[#7f8c85] text-[10px] font-semibold px-1.5 py-0.5 uppercase tracking-wide">
                        Private
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-1">
                    <span className="text-[#191f1d] font-semibold">$</span>
                    <input
                      value={dirty ? editing[p.id] : (p.price_cents / 100).toString()}
                      onChange={e => setEditing(s => ({ ...s, [p.id]: e.target.value }))}
                      inputMode="decimal"
                      className="w-16 bg-transparent font-bold text-[#191f1d] outline-none border-b border-transparent focus:border-[var(--ds-brand)]"
                    />
                    {dirty && (
                      <>
                        <button onClick={() => void commit(p)} className="text-[var(--ds-accent-ink)]" aria-label="Save">
                          {saving === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditing(s => { const n = { ...s }; delete n[p.id]; return n; })}
                          className="text-[#7f8c85]" aria-label="Cancel"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                  {!p.stripe_price_id && (
                    <p className="text-[11px] text-amber-700 mt-0.5">No Stripe price linked</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Transactions ──────────────────────────────────────────────────────────── */

function TransactionsTab() {
  const [txns, setTxns] = useState<Txn[] | null>(null);
  const [days, setDays] = useState<number | null>(7);
  const [kind, setKind] = useState<string | null>(null);
  const [updated, setUpdated] = useState<string>('');

  const load = async () => {
    setTxns(null);
    setTxns(await adminListTransactions(days, kind ?? undefined));
    setUpdated(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [days, kind]);

  const exportCsv = () => {
    const rows = txns ?? [];
    const head = ['Date', 'Event', 'Company', 'Customer', 'Invoice', 'Amount', 'Status'];
    const body = rows.map(t => [
      new Date(t.created_at).toISOString(),
      t.event_name, t.org_name ?? '', t.customer_email ?? '',
      t.stripe_invoice_id ?? '', (t.amount_cents / 100).toFixed(2), t.status,
    ]);
    const csv = [head, ...body]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `dealstudio-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = (txns ?? [])
    .filter(t => t.status === 'paid')
    .reduce((s, t) => s + t.amount_cents, 0);

  return (
    <div className={card}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5 border-b border-[#edf0f3]">
        <span className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
          <DollarSign className="w-5 h-5" />
        </span>
        <div>
          <h2 className="font-bold text-[#191f1d]">Transactions</h2>
          <p className="text-sm text-[#7f8c85]">See revenue and payment history.</p>
        </div>
        <div className="sm:ml-auto flex items-center gap-2">
          <button onClick={exportCsv} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]">
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button onClick={() => void load()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#7f8c85] hover:text-[#191f1d]">
            <RefreshCw className="w-4 h-4" /> {updated ? `Updated ${updated}` : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-5">
        <div className="inline-flex bg-[#f5f6f8] rounded-full p-1 gap-1">
          {[['Revenue', null], ['Subscription', 'subscription'], ['Fees', 'fee']].map(([label, k]) => (
            <button
              key={label as string}
              onClick={() => setKind(k as string | null)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${
                kind === k
                  ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                  : 'text-[#7f8c85]'
              }`}
            >{label as string}</button>
          ))}
        </div>

        <div className="sm:ml-auto inline-flex bg-[#f5f6f8] rounded-full p-1 gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                days === r.days
                  ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                  : 'text-[#7f8c85]'
              }`}
            >{r.label}</button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-3">
        <span className="text-sm text-[#7f8c85]">Collected in range: </span>
        <span className="font-bold text-[#191f1d] tabular-nums">{money(total)}</span>
      </div>

      {txns === null ? (
        <div className="p-5 flex items-center gap-2 text-sm text-[#7f8c85]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading
        </div>
      ) : txns.length === 0 ? (
        <p className="p-8 text-center text-sm text-[#7f8c85]">No transactions in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[#7f8c85] border-y border-[#edf0f3]">
                {['Date and Time', 'Event Name', 'Customer', 'Transaction ID', 'Amount', 'Status'].map(h => (
                  <th key={h} className="font-semibold px-5 py-3 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.map(t => (
                <tr key={t.id} className="border-b border-[#f2f4f6] last:border-0">
                  <td className="px-5 py-3 text-[#7f8c85] whitespace-nowrap">
                    {new Date(t.created_at).toLocaleString([], {
                      month: 'short', day: 'numeric', year: 'numeric',
                      hour: 'numeric', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-5 py-3 text-[#191f1d] whitespace-nowrap">{t.event_name}</td>
                  <td className="px-5 py-3 text-[#7f8c85] whitespace-nowrap">
                    {t.org_name || t.customer_email || '—'}
                  </td>
                  <td className="px-5 py-3 text-[#7f8c85] font-mono text-xs truncate max-w-[180px]">
                    {t.stripe_invoice_id ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-semibold text-[#191f1d] tabular-nums whitespace-nowrap">
                    {money(t.amount_cents, t.currency)}
                  </td>
                  <td className="px-5 py-3"><StatusPill s={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
