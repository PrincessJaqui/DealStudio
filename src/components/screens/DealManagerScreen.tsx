/**
 * DealManagerScreen — every deal the company owns, and the entry point for
 * creating new ones. RLS scopes the list to the caller's organization, so this
 * simply asks for all deals and gets back only its own.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ExternalLink, Copy, Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useAdminAuth } from '../dealstudio/AdminGate';
import { fetchOrgDeals, createDeal, type OrgDeal } from '../../lib/org';
import { DeleteDealDialog } from '../dealstudio/DeleteDealDialog';

export function DealManagerScreen() {
  const { org } = useAdminAuth();
  const nav = useNavigate();

  const [deals, setDeals] = useState<OrgDeal[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<OrgDeal | null>(null);

  const load = async () => setDeals(await fetchOrgDeals());
  useEffect(() => { void load(); }, []);

  const submit = async () => {
    const name = newName.trim();
    if (!name || !org) return;
    setBusy(true);
    setError('');
    try {
      const { slug } = await createDeal(org.id, name);
      setNewName('');
      setCreating(false);
      nav(`/admin/d/${slug}`);
    } catch (e: any) {
      setError(e?.message || 'Could not create the deal');
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (slug: string) => {
    const url = `${window.location.origin}/d/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(slug);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">Deal Manager</h1>
          <p className="text-sm text-[#7f8c85]">Every deal room {org ? org.name : 'your company'} has created.</p>
        </div>
        <button
          onClick={() => setCreating(v => !v)}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 transition"
        >
          <Plus className="w-4 h-4" /> New deal
        </button>
      </div>

      {creating && (
        <div className="mb-5 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-1.5">Deal name</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
              placeholder="Series A, Northwind Robotics, ..."
              className="flex-1 bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
            <button
              onClick={() => void submit()}
              disabled={busy || !newName.trim()}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Create
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {deals === null ? (
        <div className="flex items-center gap-2 text-sm text-[#7f8c85]">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading deals
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl bg-white border border-[#edf0f3] p-10 text-center">
          <p className="font-semibold text-[#191f1d]">No deals yet</p>
          <p className="text-sm text-[#7f8c85] mt-1">Create your first deal room to start sharing with investors.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((d) => (
            <div
              key={d.id}
              className="ds-card rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5 flex flex-col"
            >
              <div className="flex items-start gap-2">
                <h2 className="font-bold text-[#191f1d] leading-snug truncate">{d.company_name || d.slug}</h2>
                <span
                  className={`ml-auto shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    d.is_active
                      ? 'bg-[var(--ds-tint)] text-[var(--ds-brand)]'
                      : 'bg-[#f5f6f8] text-[#7f8c85]'
                  }`}
                >
                  {d.is_active ? 'Live' : 'Draft'}
                </span>
              </div>
              <p className="text-xs text-[#7f8c85] mt-1 truncate">/d/{d.slug}</p>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#edf0f3]">
                <button
                  onClick={() => nav(`/admin/d/${d.slug}`)}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-medium text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
                >
                  <Pencil className="w-4 h-4" /> Edit
                </button>
                <a
                  href={`/d/${d.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[#edf0f3] text-[#7f8c85] hover:text-[#191f1d]"
                  title="View public page"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
                <button
                  onClick={() => void copyLink(d.slug)}
                  className="inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[#edf0f3] text-[#7f8c85] hover:text-[#191f1d]"
                  title="Copy share link"
                >
                  {copied === d.slug ? <Check className="w-4 h-4 text-[var(--ds-accent-ink)]" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setToDelete(d)}
                  className="ml-auto inline-flex items-center justify-center h-9 w-9 rounded-xl border border-[#edf0f3] text-[#7f8c85] hover:text-red-600 hover:border-red-200 hover:bg-red-50"
                  title="Delete deal"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toDelete && (
        <DeleteDealDialog
          deal={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={() => { setToDelete(null); void load(); }}
        />
      )}
    </div>
  );
}
