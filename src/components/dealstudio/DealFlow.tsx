/**
 * DealFlow — investor pipeline (the old "Visitors" tab).
 * Track who you reached out to and when, who's viewing the deck and when
 * (pulled live from analytics), and close investors as committed (amount +
 * date) or passed, with notes. Everything auto-saves.
 */

import { useState } from 'react';
import { Plus, Trash2, X, Eye, Clock, Mail, Building2, BarChart3, Linkedin, Phone } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../ui/button';
import {
  DealAccessRow, DealVisitRow, DealDocument, STAGES,
  adminCreateInvestor, adminUpdateInvestor, adminDeleteInvestor, adminApproveAccess, committedTotal, formatDuration,
} from '../../lib/dealStudio';
import { DealViewerAnalytics } from './DealViewerAnalytics';
import { DeckPageBars } from './DeckPageBars';

const stagePill: Record<DealAccessRow['stage'], string> = {
  lead: 'bg-[#f5f7f9] text-[#7f8c85] border-[#edf0f3]',
  reached_out: 'bg-[#eef6fb] text-[#0e6f88] border-[#d4e9f1]',
  engaged: 'bg-[#fff7ed] text-[#b45309] border-[#f6e3cf]',
  committed: 'bg-[var(--ds-tint)] text-[var(--ds-brand)] border-[var(--ds-brd-2)]',
  passed: 'bg-[#fdecec] text-[#c0392b] border-[#f5d6d6]',
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const fmtMoney = (n: number) => `$${(n || 0).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

/** LinkedIn, phone, and a notes history live inside the existing `notes` text
 *  column as JSON, so no schema change is needed. Legacy plain-text notes are
 *  read as a single history entry. */
type NoteEntry = { text: string; at: string };
type NotesData = { linkedin: string; phone: string; history: NoteEntry[] };
function parseNotes(raw: string | null, createdAt: string): NotesData {
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && Array.isArray(j.history)) {
        return { linkedin: j.linkedin || '', phone: j.phone || '', history: j.history };
      }
    } catch { /* legacy plain-text note */ }
    if (raw.trim()) return { linkedin: '', phone: '', history: [{ text: raw, at: createdAt }] };
  }
  return { linkedin: '', phone: '', history: [] };
}
const serializeNotes = (d: NotesData) => JSON.stringify({ linkedin: d.linkedin || '', phone: d.phone || '', history: d.history || [] });
function noteWhen(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Inline per-viewer analytics: deck time-per-page + time per document opened. */
function InlineAnalytics({ roomId, deckId, deckUrl, visit, docs }: { roomId: string; deckId?: string; deckUrl?: string; visit: DealVisitRow; docs: DealDocument[] }) {
  const docRows = Object.entries(visit.sections || {})
    .filter(([k, s]) => k.startsWith('doc:') && (s as number) > 0)
    .map(([k, s]) => ({ id: k.slice(4), seconds: s as number }))
    .sort((a, b) => b.seconds - a.seconds);
  const maxDoc = Math.max(1, ...docRows.map(d => d.seconds));
  const docTitle = (id: string) => docs.find(d => d.id === id)?.title || 'Document';

  return (
    <div className="space-y-4">
      {deckId && visit.email && <DeckPageBars roomId={roomId} deckId={deckId} email={visit.email} deckUrl={deckUrl} />}
      <div>
        <p className="text-xs font-semibold text-[#7f8c85] mb-2">Time per document</p>
        {docRows.length === 0 ? (
          <p className="text-xs text-[#99a1af]">No document opens recorded for this viewer yet.</p>
        ) : (
          <div className="space-y-2">
            {docRows.map(d => (
              <div key={d.id} className="flex items-center gap-3">
                <span className="text-xs text-[#191f1d] flex-1 min-w-0 truncate">{docTitle(d.id)}</span>
                <div className="w-24 h-2 rounded-full bg-[var(--ds-tint)] overflow-hidden shrink-0"><div className="h-full bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]" style={{ width: `${Math.max(6, Math.round((d.seconds / maxDoc) * 100))}%` }} /></div>
                <span className="text-xs text-[#7f8c85] w-12 text-right tabular-nums shrink-0">{formatDuration(d.seconds)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  roomId: string;
  rows: DealAccessRow[];
  visits: DealVisitRow[];
  docs: DealDocument[];
  onChanged: () => void;
}

export function DealFlow({ roomId, rows, visits, docs, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [viewer, setViewer] = useState<{ visit: DealVisitRow; name?: string | null } | null>(null);
  const [openOther, setOpenOther] = useState<string | null>(null);
  const visitByEmail = new Map(visits.map(v => [(v.email || '').toLowerCase(), v]));
  const pipelineEmails = new Set(rows.map(r => (r.email || '').toLowerCase()));
  const otherViewers = visits.filter(v => v.email && !pipelineEmails.has((v.email || '').toLowerCase()));

  const counts = STAGES.map(s => ({ ...s, n: rows.filter(r => r.stage === s.id).length }));
  const raised = committedTotal(rows);
  const activeLeads = rows.filter(r => r.stage === 'lead' || r.stage === 'reached_out' || r.stage === 'engaged').length;
  const totalClosed = rows.filter(r => r.stage === 'committed').length;
  const deckId = docs.find(d => d.is_deck)?.id;
  const deckUrl = docs.find(d => d.is_deck)?.file_url;

  return (
    <div className="space-y-4">
      {/* Pipeline summary */}
      <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">Committed</p>
              <p className="text-2xl font-bold text-[#191f1d]">{fmtMoney(raised)}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#7f8c85]">Active leads</p>
              <p className="text-2xl font-bold text-[#191f1d]">{activeLeads}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#7f8c85]">Total closed</p>
              <p className="text-2xl font-bold text-[#191f1d]">{totalClosed}</p>
            </div>
          </div>
          <Button onClick={() => setAdding(true)} className="h-9 shrink-0 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]"><Plus className="w-4 h-4 mr-1" /> Add investor</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {counts.map(c => (
            <span key={c.id} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${stagePill[c.id]}`}>
              {c.label} <span className="font-bold">{c.n}</span>
            </span>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-10 text-center text-[#99a1af]">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No investors yet. Add the first one to start tracking your raise.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const v = visitByEmail.get((r.email || '').toLowerCase());
            return <InvestorRow key={r.id} row={r} visit={v} roomId={roomId} deckId={deckId} deckUrl={deckUrl} docs={docs} onChanged={onChanged} onAnalytics={v ? () => setViewer({ visit: v, name: r.name }) : undefined} />;
          })}
        </div>
      )}

      {/* All other viewers (visited but not in the pipeline) */}
      {otherViewers.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-4">
          <p className="text-sm font-bold text-[#191f1d] mb-1">Other viewers</p>
          <p className="text-xs text-[#7f8c85] mb-3">Visited the deal studio but not in your pipeline. Tap to see their deck pages.</p>
          <div className="divide-y divide-[#f0f0f0]">
            {otherViewers.map(v => (
              <div key={v.id}>
                <button onClick={() => setOpenOther(openOther === v.id ? null : v.id)} className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-[#f5f6f8] -mx-1 px-1 rounded-lg">
                  <span className="text-sm font-medium text-[#191f1d] truncate">{v.email || 'Anonymous'}</span>
                  <span className="text-xs text-[#7f8c85] shrink-0 flex items-center gap-2"><span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {v.deck_views}&times; deck</span><span>{Math.round(v.total_seconds)}s</span></span>
                </button>
                {openOther === v.id && (
                  <div className="mb-3 rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
                    <div className="flex items-center justify-between gap-4 mb-2">
                      <button onClick={() => setOpenOther(null)} className="text-xs font-semibold text-[#7f8c85] hover:text-[#191f1d]">Minimize</button>
                      <div className="flex items-center gap-4">
                        <button onClick={() => setViewer({ visit: v, name: v.email })} className="text-xs font-semibold text-[#7f8c85] hover:text-[var(--ds-brand)] hover:underline">Full breakdown</button>
                        {v.email && (
                          <button
                            onClick={async () => { await adminCreateInvestor(roomId, { email: v.email!, name: v.email! }); toast.success('Added to pipeline'); onChanged(); }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline"
                          ><Plus className="w-3.5 h-3.5" /> Add to pipeline</button>
                        )}
                      </div>
                    </div>
                    <InlineAnalytics roomId={roomId} deckId={deckId} deckUrl={deckUrl} visit={v} docs={docs} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {adding && <AddInvestorModal roomId={roomId} onClose={() => setAdding(false)} onSaved={onChanged} />}
      {viewer && <DealViewerAnalytics roomId={roomId} visit={viewer.visit} name={viewer.name} docs={docs} onClose={() => setViewer(null)} />}
    </div>
  );
}

function InvestorRow({ row, visit, roomId, deckId, deckUrl, docs, onChanged, onAnalytics }: { row: DealAccessRow; visit?: DealVisitRow; roomId: string; deckId?: string; deckUrl?: string; docs: DealDocument[]; onChanged: () => void; onAnalytics?: () => void }) {
  const initial = parseNotes(row.notes, row.created_at);
  const [amount, setAmount] = useState(row.committed_amount != null ? String(row.committed_amount) : '');
  const [openPages, setOpenPages] = useState(false);
  const [name, setName] = useState(row.name || '');
  const [linkedin, setLinkedin] = useState(initial.linkedin);
  const [phone, setPhone] = useState(initial.phone);
  const [history, setHistory] = useState<NoteEntry[]>(initial.history);
  const [newNote, setNewNote] = useState('');

  const save = async (patch: Partial<DealAccessRow>, reload = true) => {
    await adminUpdateInvestor(row.id, patch);
    if (reload) onChanged();
  };

  const setStage = (stage: DealAccessRow['stage']) => {
    const patch: Partial<DealAccessRow> = { stage };
    if (stage === 'committed' && !row.committed_at) patch.committed_at = today();
    save(patch);
  };

  const saveContact = (nextLinkedin: string, nextPhone: string, nextHistory: NoteEntry[]) => {
    void adminUpdateInvestor(row.id, { notes: serializeNotes({ linkedin: nextLinkedin, phone: nextPhone, history: nextHistory }) });
  };
  const addNote = () => {
    const text = newNote.trim();
    if (!text) return;
    const next = [{ text, at: new Date().toISOString() }, ...history];
    setHistory(next); setNewNote('');
    saveContact(linkedin, phone, next);
  };
  const deleteNote = (idx: number) => {
    const next = history.filter((_, i) => i !== idx);
    setHistory(next);
    saveContact(linkedin, phone, next);
  };

  const saveAmount = () => {
    const n = amount === '' ? null : Number(amount.replace(/[^0-9.]/g, '')) || 0;
    save({ committed_amount: n });
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${row.name || row.email}?`)) return;
    await adminDeleteInvestor(row.id);
    toast.success('Removed');
    onChanged();
  };

  const grantAccess = async () => {
    const pw = window.prompt(`Set a portal password for ${row.email} (they sign in with it to view the deal studio):`);
    if (pw === null) return;
    const r = await adminApproveAccess(row.id, pw, 'approved');
    if (r.success) { toast.success('Portal access granted'); onChanged(); }
    else toast.error('Could not grant access');
  };

  const deckViews = visit?.deck_views || 0;
  const lastSeen = visit?.last_seen_at || null;

  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <input value={name} onChange={e => setName(e.target.value)} onBlur={() => { if (name !== (row.name || '')) save({ name: name || null }, false); }}
            placeholder="Investor name" className="w-full bg-transparent text-sm font-bold text-[#191f1d] outline-none placeholder:font-medium placeholder:text-[#c0c6cc]" />
          <div className="flex items-center gap-2 flex-wrap">
            <a href={`mailto:${row.email}`} className="inline-flex items-center gap-1 text-xs text-[#7f8c85] hover:text-[var(--ds-brand)]"><Mail className="w-3 h-3" /> {row.email}</a>

            {/* Deck views per person, visible without expanding the row: it is
                the single strongest signal of interest in the whole pipeline. */}
            {deckViews > 0 && (
              <span
                title={`Opened the deck ${deckViews} time${deckViews === 1 ? '' : 's'}`}
                className="inline-flex items-center gap-1 rounded-full bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)] px-2 py-0.5 text-[11px] font-semibold"
              >
                <Eye className="w-3 h-3" /> {deckViews}&times; deck
              </span>
            )}
          </div>
        </div>
        <select
          value={row.stage}
          onChange={e => setStage(e.target.value as DealAccessRow['stage'])}
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold outline-none cursor-pointer ${stagePill[row.stage]}`}
        >
          {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Contact details */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        <label className="flex items-center gap-2 rounded-lg bg-[#f5f6f8] px-2.5 py-1.5">
          <Building2 className="w-3.5 h-3.5 text-[#99a1af] shrink-0" />
          <input defaultValue={row.firm || ''} onBlur={e => { if ((e.target.value || null) !== row.firm) save({ firm: e.target.value || null }, false); }} placeholder="Firm" className="w-full bg-transparent text-xs text-[#191f1d] outline-none placeholder:text-[#99a1af]" />
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-[#f5f6f8] px-2.5 py-1.5">
          <Linkedin className="w-3.5 h-3.5 text-[#99a1af] shrink-0" />
          <input value={linkedin} onChange={e => setLinkedin(e.target.value)} onBlur={() => saveContact(linkedin, phone, history)} placeholder="LinkedIn" className="w-full bg-transparent text-xs text-[#191f1d] outline-none placeholder:text-[#99a1af]" />
        </label>
        <label className="flex items-center gap-2 rounded-lg bg-[#f5f6f8] px-2.5 py-1.5">
          <Phone className="w-3.5 h-3.5 text-[#99a1af] shrink-0" />
          <input value={phone} onChange={e => setPhone(e.target.value)} onBlur={() => saveContact(linkedin, phone, history)} placeholder="Phone" className="w-full bg-transparent text-xs text-[#191f1d] outline-none placeholder:text-[#99a1af]" />
        </label>
      </div>

      {/* Meta: outreach + engagement */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        <label className="flex items-center gap-1.5 text-xs text-[#7f8c85]">
          Reached out
          <input type="date" defaultValue={row.reached_out_at || ''} onChange={e => save({ reached_out_at: e.target.value || null }, false)}
            className="h-8 rounded-lg bg-[#f5f6f8] px-2 text-xs text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-[#7f8c85]">
          Meeting
          <input type="datetime-local" defaultValue={row.meeting_at || ''} onChange={e => save({ meeting_at: e.target.value || null }, false)}
            className="h-8 rounded-lg bg-[#f5f6f8] px-2 text-xs text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
        </label>
        <span className="flex items-center gap-1.5 text-xs">
          <Eye className="w-3.5 h-3.5 text-[var(--ds-brand)]" />
          {deckViews > 0
            ? <span className="text-[#191f1d]">Viewed deck {deckViews}×{lastSeen ? <span className="text-[#99a1af]"> · last {timeAgo(lastSeen)}</span> : null}</span>
            : <span className="text-[#99a1af]">No deck views yet</span>}
        </span>
        {visit && visit.total_seconds > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-[#7f8c85]"><Clock className="w-3.5 h-3.5" /> {Math.round(visit.total_seconds)}s on page</span>
        )}
      </div>

      {/* Commitment (shown when committed) */}
      {row.stage === 'committed' && (
        <div className="flex flex-wrap items-center gap-3 mt-3 rounded-xl bg-[var(--ds-tint)] px-3 py-2.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--ds-brand)]">
            Amount
            <span className="text-[var(--ds-brand)]">$</span>
            <input value={amount} onChange={e => setAmount(e.target.value)} onBlur={saveAmount} inputMode="decimal" placeholder="0"
              className="h-8 w-28 rounded-lg bg-white border border-[var(--ds-brd-2)] px-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--ds-brand)]">
            Date
            <input type="date" defaultValue={row.committed_at || today()} onChange={e => save({ committed_at: e.target.value || null }, false)}
              className="h-8 rounded-lg bg-white border border-[var(--ds-brd-2)] px-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
          </label>
        </div>
      )}

      {/* Notes history */}
      <div className="mt-3">
        <div className="flex items-center gap-2">
          <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } }}
            placeholder="Add a note — context, next steps, why they passed…"
            className="flex-1 rounded-xl bg-[#f5f6f8] px-3 py-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" />
          <button onClick={addNote} disabled={!newNote.trim()} className="shrink-0 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Add note</button>
        </div>
        {history.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {history.map((n, i) => (
              <div key={i} className="group flex items-start justify-between gap-2 rounded-lg bg-[#f5f6f8] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm text-[#191f1d] whitespace-pre-wrap break-words">{n.text}</p>
                  <p className="text-[10px] text-[#99a1af] mt-0.5">{noteWhen(n.at)}</p>
                </div>
                <button onClick={() => deleteNote(i)} className="shrink-0 text-[#c0c6cc] opacity-0 group-hover:opacity-100 hover:text-[#dc2626]" aria-label="Delete note"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3">
          {row.status === 'approved'
            ? <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ds-brand)] font-medium">Portal access granted</span>
            : <button onClick={grantAccess} className="text-xs font-medium text-[var(--ds-brand)] hover:underline">Grant portal access</button>}
          {visit && (
            <button onClick={() => setOpenPages(o => !o)} className="inline-flex items-center gap-1 text-xs text-[#7f8c85] hover:text-[var(--ds-brand)]"><BarChart3 className="w-3.5 h-3.5" /> {openPages ? 'Hide analytics' : 'View analytics'}</button>
          )}
          {onAnalytics && <button onClick={onAnalytics} className="text-xs text-[#7f8c85] hover:text-[var(--ds-brand)] hover:underline">Full breakdown</button>}
        </div>
        <button onClick={remove} className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"><Trash2 className="w-3.5 h-3.5" /> Remove</button>
      </div>

      {openPages && visit && (
        <div className="mt-3 rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
          <InlineAnalytics roomId={roomId} deckId={deckId} deckUrl={deckUrl} visit={visit} docs={docs} />
        </div>
      )}
    </div>
  );
}

function AddInvestorModal({ roomId, onClose, onSaved }: { roomId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [firm, setFirm] = useState('');
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<DealAccessRow['stage']>('reached_out');
  const [reachedOut, setReachedOut] = useState(today());
  const [saving, setSaving] = useState(false);
  const input = 'w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40';

  const save = async () => {
    if (!email.trim()) { toast.error('Investor email is required'); return; }
    setSaving(true);
    const r = await adminCreateInvestor(roomId, { name, firm, email, stage, reached_out_at: reachedOut });
    setSaving(false);
    if (r.success) { toast.success('Investor added'); onSaved(); onClose(); }
    else toast.error('Could not add investor');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-[#edf0f3] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#edf0f3]">
          <h3 className="text-lg font-bold text-[#191f1d]">Add investor</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Name</label><input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="Jane Investor" /></div>
          <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Firm</label><input value={firm} onChange={e => setFirm(e.target.value)} className={input} placeholder="Acme Capital" /></div>
          <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Email</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" className={input} placeholder="jane@acme.vc" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Stage</label>
              <select value={stage} onChange={e => setStage(e.target.value as DealAccessRow['stage'])} className={input}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-semibold text-[#7f8c85] mb-1">Reached out</label><input type="date" value={reachedOut} onChange={e => setReachedOut(e.target.value)} className={input} /></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#edf0f3]">
          <Button onClick={onClose} className="h-10 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]">Cancel</Button>
          <Button onClick={save} disabled={saving} className="h-10 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)] disabled:opacity-50">Add investor</Button>
        </div>
      </div>
    </div>
  );
}
