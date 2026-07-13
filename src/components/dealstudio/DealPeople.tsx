/**
 * DealPeople — one table of everyone connected to this deal.
 *
 * Pipeline and viewers used to be two lists. Someone who opened your deck three
 * times but was never added to the pipeline sat in a separate box below, which
 * is exactly backwards: that person is the most interesting row on the screen.
 * They are merged, and a viewer with no pipeline row still appears, staged
 * "Viewed deal".
 *
 * Two words that look alike and are not:
 *   Status (this table)  = the pipeline stage. Where they are in the raise.
 *   Blocked              = the access gate. Whether the room lets them in.
 * Marking someone Passed does not lock them out. Blocking does not wipe their
 * stage. Keeping these apart is why both can be trusted.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, ChevronUp, ChevronDown, MoreVertical, Eye, FileText, Share2,
  StickyNote, Ban, Mail, Pencil, X, Loader2, Check,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import {
  fetchDealPeople, setDealStage, fetchDealNotes, addDealNote, editDealNote,
  deleteDealNote, saveDealPerson, inviteUrl, formatDuration,
  STAGE_LABEL, STAGE_ORDER,
  type DealPerson, type DealStage, type DealNote, type DealDocument,
} from '../../lib/dealStudio';
import { adminBlockViewer } from '../../lib/dealStudio';

const num = (n: number | null | undefined) => (n || 0).toLocaleString();

/** Passed is red. Everything else is quiet: a pipeline that shouts is unreadable. */
const stageClass = (s: DealStage) =>
  s === 'passed'    ? 'bg-red-50 text-red-700 border-red-100'
  : s === 'committed' || s === 'closed'
                    ? 'bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)] border-transparent'
  : s === 'viewed'  ? 'bg-[var(--ds-tint)] text-[var(--ds-brand)] border-transparent'
                    : 'bg-[#f5f6f8] text-[#7f8c85] border-transparent';

const timeAgo = (iso: string | null) => {
  if (!iso) return '—';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / 1440)}d ago`;
};

type SortKey =
  | 'email' | 'name' | 'company_name' | 'stage' | 'visits'
  | 'total_seconds' | 'deck_views' | 'doc_views' | 'forwards' | 'last_seen';

export function DealPeople({
  dealId, slug, handle, docs, onChanged,
}: {
  dealId: string;
  slug: string;
  handle: string | null;
  docs: DealDocument[];
  onChanged: () => void;
}) {
  const [people, setPeople] = useState<DealPerson[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DealStage | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const [menu, setMenu] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<{ top: number; right: number } | null>(null);

  const [sections, setSections] = useState<DealPerson | null>(null);
  const [deckFor, setDeckFor] = useState<DealPerson | null>(null);
  const [docsFor, setDocsFor] = useState<DealPerson | null>(null);
  const [notesFor, setNotesFor] = useState<DealPerson | null>(null);
  const [detailsFor, setDetailsFor] = useState<DealPerson | null>(null);
  const [stageFor, setStageFor] = useState<{ person: DealPerson; next: DealStage } | null>(null);

  const load = async () => setPeople(await fetchDealPeople(dealId));
  useEffect(() => { void load(); }, [dealId]);

  const rows = useMemo(() => {
    let r = people ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) {
      r = r.filter(p =>
        (p.email || '').toLowerCase().includes(needle) ||
        (p.name || '').toLowerCase().includes(needle) ||
        (p.company_name || '').toLowerCase().includes(needle));
    }
    if (filter !== 'all') r = r.filter(p => p.stage === filter);

    const val = (p: DealPerson) => {
      const v = p[sort as keyof DealPerson];
      if (sort === 'stage') return STAGE_ORDER.indexOf(p.stage);
      if (typeof v === 'string') return v.toLowerCase();
      if (v == null) return sort === 'last_seen' ? 0 : '';
      return v as number | string;
    };
    return [...r].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === bv) return 0;
      const c = av > bv ? 1 : -1;
      return dir === 'asc' ? c : -c;
    });
  }, [people, q, filter, sort, dir]);

  const Th = ({ k, children, right }: { k: SortKey; children: React.ReactNode; right?: boolean }) => (
    <th className={`font-semibold px-4 py-2.5 whitespace-nowrap ${right ? 'text-right' : ''}`}>
      <button
        onClick={() => { if (sort === k) setDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSort(k); setDir('desc'); } }}
        className={`inline-flex items-center gap-1 hover:text-[#191f1d] ${right ? 'flex-row-reverse' : ''}`}
      >
        {children}
        {sort === k && (dir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
      </button>
    </th>
  );

  const openMenu = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (menu === id) { setMenu(null); setMenuAt(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const H = 170;
    const below = window.innerHeight - r.bottom;
    setMenuAt({
      top: Math.max(8, below < H ? r.top - H - 4 : r.bottom + 6),
      right: window.innerWidth - r.right,
    });
    setMenu(id);
  };

  const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';

  if (people === null) {
    return <div className={`${card} p-8 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  return (
    <div className={card}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-[#edf0f3]">
        <div>
          <p className="text-sm font-bold text-[#191f1d]">People</p>
          <p className="text-xs text-[#7f8c85]">
            Everyone in the pipeline, and everyone who has opened the room.
          </p>
        </div>

        <div className="sm:ml-auto flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as DealStage | 'all')}
            className="h-9 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none cursor-pointer"
          >
            <option value="all">All statuses</option>
            {STAGE_ORDER.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
          </select>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#99a1af]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, company"
              className="w-full sm:w-60 h-9 bg-[#f5f6f8] rounded-xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-6 text-sm text-[#99a1af] text-center">
          {people.length === 0 ? 'Nobody has opened this deal room yet.' : 'Nothing matches that.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#7f8c85] border-b border-[#edf0f3]">
                <Th k="email">Email</Th>
                <Th k="name">Contact</Th>
                <Th k="company_name">Company</Th>
                <Th k="stage">Status</Th>
                <Th k="visits" right>Visits</Th>
                <Th k="total_seconds" right>Time</Th>
                <th className="font-semibold px-4 py-2.5 text-right whitespace-nowrap">Sections</th>
                <Th k="deck_views" right>Deck</Th>
                <Th k="doc_views" right>Docs</Th>
                <Th k="forwards" right>Forwards</Th>
                <Th k="last_seen" right>Last seen</Th>
                <th className="font-semibold px-4 py-2.5 text-right whitespace-nowrap">Notes</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {rows.map((p) => {
                const id = p.access_id || p.visit_id || p.email || '';
                return (
                  <tr key={id} className="border-b border-[#f5f6f8] last:border-0 hover:bg-[#fafbfc]">
                    <td className="px-4 py-3 font-medium text-[#191f1d] whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {p.blocked && (
                          <span title="Blocked from the room" className="shrink-0">
                            <Ban className="w-3.5 h-3.5 text-red-600" />
                          </span>
                        )}
                        {p.email || 'Anonymous'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-[#7f8c85] whitespace-nowrap">{p.name || '—'}</td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.company_name ? (
                        <span className="flex items-center gap-2">
                          <span className="w-6 h-6 shrink-0 rounded-full overflow-hidden ring-2 ring-white bg-white shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center">
                            {p.company_logo
                              ? <img src={p.company_logo} alt="" className="w-full h-full object-cover" />
                              : <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-[10px] font-semibold">
                                  {p.company_name.trim().charAt(0).toUpperCase()}
                                </span>}
                          </span>
                          <span className="text-[#191f1d]">{p.company_name}</span>
                        </span>
                      ) : <span className="text-[#c7cdd4]">—</span>}
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={p.stage}
                        disabled={!p.access_id}
                        onChange={(e) => setStageFor({ person: p, next: e.target.value as DealStage })}
                        title={p.access_id ? 'Change status' : 'Add details first to track this person'}
                        className={`h-7 rounded-full border px-2 text-xs font-semibold cursor-pointer disabled:cursor-not-allowed ${stageClass(p.stage)}`}
                      >
                        {STAGE_ORDER.map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums text-[#7f8c85]">{num(p.visits)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#7f8c85]">{formatDuration(Math.round(p.total_seconds))}</td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSections(p)}
                        className="text-xs font-semibold text-[var(--ds-brand)] hover:underline"
                      >
                        View
                      </button>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 tabular-nums text-[#7f8c85]">
                        {num(p.deck_views)}
                        <button onClick={() => setDeckFor(p)} title="Full deck analytics" className="text-[#c7cdd4] hover:text-[var(--ds-brand)]">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 tabular-nums text-[#7f8c85]">
                        {num(p.doc_views)}
                        <button onClick={() => setDocsFor(p)} title="Time per document" className="text-[#c7cdd4] hover:text-[var(--ds-brand)]">
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span
                        className="inline-flex items-center gap-1.5 tabular-nums text-[#7f8c85]"
                        title="Distinct browsers other than theirs that opened their personal link. Evidence of a forward, not an exact count of shares."
                      >
                        {num(p.forwards)}
                        <Share2 className="w-3.5 h-3.5 text-[#c7cdd4]" />
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right text-[#7f8c85] whitespace-nowrap">{timeAgo(p.last_seen)}</td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setNotesFor(p)}
                        disabled={!p.access_id}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline disabled:text-[#c7cdd4] disabled:no-underline"
                      >
                        <StickyNote className="w-3.5 h-3.5" /> {num(p.note_count)}
                      </button>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => openMenu(id, e)}
                        aria-label={`Actions for ${p.email || 'this person'}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menu === id && menuAt && createPortal(
                        <>
                          <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
                          <div
                            className="fixed z-[61] w-56 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5 text-left"
                            style={{ top: menuAt.top, right: menuAt.right }}
                          >
                            <button
                              onClick={() => { setMenu(null); setDetailsFor(p); }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
                            >
                              <Pencil className="w-4 h-4" /> Add details
                            </button>

                            <button
                              disabled={!p.email || !p.share_token}
                              onClick={() => {
                                setMenu(null);
                                const link = inviteUrl(handle, slug, p.share_token!);
                                const subject = encodeURIComponent('Take a look at our deal');
                                const body = encodeURIComponent(
                                  `Hi${p.name ? ' ' + p.name.split(' ')[0] : ''},\n\nHere is our deal room:\n${link}\n\nHappy to walk you through it.\n`,
                                );
                                window.location.href = `mailto:${p.email}?subject=${subject}&body=${body}`;
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d] disabled:opacity-40"
                            >
                              <Mail className="w-4 h-4" /> Send deal link
                            </button>

                            <div className="my-1 border-t border-[#edf0f3]" />

                            <button
                              disabled={!p.email}
                              onClick={async () => {
                                setMenu(null);
                                const r = await adminBlockViewer(dealId, p.email!, !p.blocked);
                                if (r.ok) {
                                  toast.success(p.blocked ? 'Access restored' : `${p.email} can no longer open this room`);
                                  await load(); onChanged();
                                } else toast.error(r.message || 'Could not change access');
                              }}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40 ${
                                p.blocked
                                  ? 'text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]'
                                  : 'text-red-600 hover:bg-red-50'
                              }`}
                            >
                              <Ban className="w-4 h-4" /> {p.blocked ? 'Unblock' : 'Block access'}
                            </button>
                          </div>
                        </>,
                        document.body,
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stageFor && (
        <StageDialog
          person={stageFor.person}
          next={stageFor.next}
          onClose={() => setStageFor(null)}
          onSaved={async () => { setStageFor(null); await load(); onChanged(); }}
        />
      )}

      {notesFor?.access_id && (
        <NotesDialog
          person={notesFor}
          onClose={() => setNotesFor(null)}
          onChanged={async () => { await load(); onChanged(); }}
        />
      )}

      {detailsFor && (
        <DetailsDialog
          person={detailsFor}
          dealId={dealId}
          onClose={() => setDetailsFor(null)}
          onSaved={async () => { setDetailsFor(null); await load(); onChanged(); }}
        />
      )}

      {sections && (
        <SectionsDialog person={sections} docs={docs} onClose={() => setSections(null)} />
      )}
      {docsFor && (
        <SectionsDialog person={docsFor} docs={docs} docsOnly onClose={() => setDocsFor(null)} />
      )}
      {deckFor && (
        <SectionsDialog person={deckFor} docs={docs} deckOnly onClose={() => setDeckFor(null)} />
      )}
    </div>
  );
}

/* ── Dialogs ───────────────────────────────────────────────────────────────── */

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-start justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-lg mt-16 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_24px_60px_-16px_rgba(12,16,34,0.35)]">
          <div className="flex items-center gap-3 p-5 border-b border-[#edf0f3]">
            <h2 className="font-bold text-[#191f1d]">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}

/** Changing a status always costs a sentence. Three weeks later, "why is this
 *  one marked passed" needs an answer. */
function StageDialog({
  person, next, onClose, onSaved,
}: { person: DealPerson; next: DealStage; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Shell title={`${STAGE_LABEL[person.stage]} to ${STAGE_LABEL[next]}`} onClose={onClose}>
      <p className="text-sm text-[#7f8c85] mb-3">
        Why is this changing? It goes into their notes history.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        autoFocus
        placeholder="Term sheet sent, waiting on their counsel."
        className="w-full min-h-[90px] resize-y rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
      />
      <button
        onClick={async () => {
          if (!person.access_id) return;
          setBusy(true);
          const r = await setDealStage(person.access_id, next, note);
          setBusy(false);
          if (r.ok) { toast.success('Status updated'); onSaved(); }
          else toast.error(r.message || 'Could not update');
        }}
        disabled={!note.trim() || busy}
        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        Save status and note
      </button>
    </Shell>
  );
}

function NotesDialog({
  person, onClose, onChanged,
}: { person: DealPerson; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState<DealNote[] | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const load = async () => setNotes(await fetchDealNotes(person.access_id!));
  useEffect(() => { void load(); }, [person.access_id]);

  return (
    <Shell title={`Notes — ${person.name || person.email}`} onClose={onClose}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note"
        className="w-full min-h-[70px] resize-y rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
      />
      <button
        onClick={async () => {
          if (!draft.trim()) return;
          if (await addDealNote(person.access_id!, draft)) {
            setDraft(''); await load(); onChanged();
          } else toast.error('Could not add the note');
        }}
        disabled={!draft.trim()}
        className="mt-2 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-[#191f1d] disabled:opacity-40"
      >
        Add note
      </button>

      <div className="mt-5 space-y-3 max-h-[45vh] overflow-y-auto ds-scroll-y">
        {notes === null ? (
          <Loader2 className="w-4 h-4 animate-spin text-[var(--ds-brand)]" />
        ) : notes.length === 0 ? (
          <p className="text-sm text-[#99a1af]">No notes yet.</p>
        ) : notes.map(n => (
          <div key={n.id} className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
            <div className="flex items-center gap-2 mb-1">
              {n.kind === 'stage' && (
                <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">Status change</span>
              )}
              <span className="text-[11px] text-[#9ca3af] ml-auto">
                {new Date(n.created_at).toLocaleString()}
                {n.updated_at && ' · edited'}
              </span>
            </div>

            {editing === n.id ? (
              <>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="w-full min-h-[60px] resize-y rounded-lg bg-white px-2.5 py-2 text-sm outline-none"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={async () => {
                      if (await editDealNote(n.id, editBody)) { setEditing(null); await load(); }
                      else toast.error('Could not save');
                    }}
                    className="h-7 px-3 rounded-lg text-xs font-semibold text-white bg-[#191f1d]"
                  >Save</button>
                  <button onClick={() => setEditing(null)} className="h-7 px-3 rounded-lg text-xs font-semibold text-[#7f8c85]">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-[#191f1d] whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1.5 flex gap-3">
                  <button
                    onClick={() => { setEditing(n.id); setEditBody(n.body); }}
                    className="text-xs font-semibold text-[#7f8c85] hover:text-[var(--ds-brand)]"
                  >Edit</button>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this note?')) return;
                      if (await deleteDealNote(n.id)) { await load(); onChanged(); }
                    }}
                    className="text-xs font-semibold text-[#7f8c85] hover:text-red-600"
                  >Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function DetailsDialog({
  person, dealId, onClose, onSaved,
}: { person: DealPerson; dealId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(person.name ?? '');
  const [company, setCompany] = useState(person.company_name ?? '');
  const [logo, setLogo] = useState(person.company_logo ?? '');
  const [linkedin, setLinkedin] = useState(person.linkedin ?? '');
  const [website, setWebsite] = useState(person.website ?? '');
  const [busy, setBusy] = useState(false);

  const field = 'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
  const label = 'block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1';

  return (
    <Shell title="Details" onClose={onClose}>
      <div className="space-y-3">
        <div><label className={label}>Contact name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Dana Whitfield" /></div>
        <div><label className={label}>Company</label>
          <input value={company} onChange={e => setCompany(e.target.value)} className={field} placeholder="Northwind Capital" /></div>
        <div><label className={label}>Company logo URL</label>
          <input value={logo} onChange={e => setLogo(e.target.value)} className={field} placeholder="https://..." /></div>
        <div><label className={label}>LinkedIn</label>
          <input value={linkedin} onChange={e => setLinkedin(e.target.value)} className={field} placeholder="https://linkedin.com/in/..." /></div>
        <div><label className={label}>Website</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} className={field} placeholder="https://..." /></div>
      </div>

      <button
        onClick={async () => {
          if (!person.access_id) {
            toast.error('This viewer has no pipeline record yet.');
            return;
          }
          setBusy(true);
          const ok = await saveDealPerson(person.access_id, {
            name: name.trim() || null,
            company_name: company.trim() || null,
            company_logo: logo.trim() || null,
            linkedin: linkedin.trim() || null,
            website: website.trim() || null,
          });
          setBusy(false);
          if (ok) { toast.success('Saved'); onSaved(); }
          else toast.error('Could not save');
        }}
        disabled={busy}
        className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-50"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save details
      </button>
    </Shell>
  );
}

/** Time per section, per document, or the deck alone. Same data, three lenses. */
function SectionsDialog({
  person, docs, docsOnly, deckOnly, onClose,
}: {
  person: DealPerson;
  docs: DealDocument[];
  docsOnly?: boolean;
  deckOnly?: boolean;
  onClose: () => void;
}) {
  const entries = Object.entries(person.sections || {}).filter(([, v]) => (v as number) > 0);

  const docRows = entries
    .filter(([k]) => k.startsWith('doc:'))
    .map(([k, v]) => ({ label: docs.find(d => d.id === k.slice(4))?.title || 'Document', seconds: v as number }));

  const sectionRows = entries
    .filter(([k]) => !k.startsWith('doc:'))
    .map(([k, v]) => ({ label: k.replace(/_/g, ' '), seconds: v as number }));

  const rows = (deckOnly
    ? docRows.filter(r => docs.find(d => d.is_deck && d.title === r.label))
    : docsOnly ? docRows : sectionRows
  ).sort((a, b) => b.seconds - a.seconds);

  const max = Math.max(1, ...rows.map(r => r.seconds));
  const title = deckOnly ? 'Deck analytics' : docsOnly ? 'Time per document' : 'Time per section';

  return (
    <Shell title={`${title} — ${person.name || person.email}`} onClose={onClose}>
      {rows.length === 0 ? (
        <p className="text-sm text-[#99a1af]">Nothing recorded yet.</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => (
            <div key={r.label} className="flex items-center gap-3">
              <span className="text-sm text-[#191f1d] flex-1 min-w-0 truncate capitalize">{r.label}</span>
              <div className="w-32 h-2 rounded-full bg-[var(--ds-tint)] overflow-hidden shrink-0">
                <div
                  className="h-full bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
                  style={{ width: `${Math.max(6, Math.round((r.seconds / max) * 100))}%` }}
                />
              </div>
              <span className="text-xs text-[#7f8c85] w-14 text-right tabular-nums shrink-0">
                {formatDuration(r.seconds)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
