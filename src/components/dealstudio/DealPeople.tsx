/**
 * DealPeople: the Deal Flow tab. One table of everyone connected to this deal.
 *
 * This is now the ENTIRE tab. It used to sit above a second card that listed the
 * same investors again on the old five-stage vocabulary (lead, reached out,
 * engaged), which the database has not allowed since 0036. Two lists, two
 * vocabularies, one set of people. That card is gone; everything it did lives
 * here.
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
  Search, ChevronUp, ChevronDown, MoreVertical, Eye, Share2,
  Ban, Mail, Pencil, X, Loader2, Check, Download, RefreshCw, Plus,
  RotateCcw, Trash2, Maximize2, Minimize2, UploadCloud, ImageOff,
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import {
  fetchDealPeople, setDealStage, fetchDealNotes, addDealNote, editDealNote,
  deleteDealNote, saveDealPerson, createDealPerson, setDealCommitted, deleteDealPerson,
  ensureDealPerson, adminResetVisit, inviteUrl, formatDuration, fetchLinkPreviewResult,
  uploadDealFile,
  STAGE_LABEL, STAGE_ORDER,
  type DealPerson, type DealStage, type DealNote, type DealDocument,
} from '../../lib/dealStudio';
import { adminBlockViewer } from '../../lib/dealStudio';
import { PillTabs } from './PillTabs';
import { DeckPageBars } from './DeckPageBars';

const num = (n: number | null | undefined) => (n || 0).toLocaleString();
const DASH = '\u2013';
const money = (n: number) => `$${(n || 0).toLocaleString()}`;

/** Passed is red. Everything else is quiet: a pipeline that shouts is unreadable. */
const stageClass = (s: DealStage) =>
  s === 'passed'    ? 'bg-red-50 text-red-700 border-red-100'
  : s === 'committed' || s === 'closed'
                    ? 'bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)] border-transparent'
  : s === 'viewed'  ? 'bg-[var(--ds-tint)] text-[var(--ds-brand)] border-transparent'
                    : 'bg-[#f5f6f8] text-[#7f8c85] border-transparent';

/** Jan 11, 2026. A date, not "3d ago": the founder is scanning for the one they
 *  have not touched since the last board meeting, and that is a date question. */
const fmtDate = (iso: string | null) => {
  if (!iso) return DASH;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? DASH : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * The pipeline, as Jaqui works it: Lead, Viewed deal, Negotiating, Committed,
 * Passed. Prospect, Met, Interested and Closed are off both the filter bar and
 * the Status dropdown.
 *
 * The database still allows all nine, so anyone already sitting on one of the
 * retired stages keeps it and still renders (see stageOptions below). Nothing is
 * rewritten underneath them without being asked.
 */
const PIPELINE: DealStage[] = ['lead', 'viewed', 'negotiating', 'committed', 'passed'];

/** A person on a retired stage keeps it in their dropdown, or the select would
 *  render blank and the first change would silently move them. */
const stageOptions = (current: DealStage): DealStage[] =>
  PIPELINE.includes(current) ? PIPELINE : [current, ...PIPELINE];

type SortKey =
  | 'email' | 'name' | 'company_name' | 'stage' | 'committed' | 'visits'
  | 'total_seconds' | 'deck_views' | 'doc_views' | 'forwards'
  | 'last_seen' | 'last_note_at';

/**
 * The access row, created on first write if this person only ever visited.
 * Every dialog below goes through this, so "no pipeline record yet" cannot come
 * back in one of them and not the others.
 */
const useAccessId = (dealId: string) => async (person: DealPerson): Promise<string | null> =>
  person.access_id ?? (person.email ? await ensureDealPerson(dealId, person.email, person.stage) : null);

/** The one control that opens a breakdown, so all five of them cannot drift.
 *  An eye, not an arrow: an arrow reads as "go somewhere", and these open a
 *  panel in place. */
function Drill({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="text-[#c7cdd4] hover:text-[var(--ds-brand)] disabled:text-[#e6e9ec] disabled:cursor-not-allowed"
    >
      <Eye className="w-4 h-4" />
    </button>
  );
}

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
  /** The FIRST load only. After that the table keeps what it has and shows the
   *  failure inline, rather than throwing the rows away. */
  const [loading, setLoading] = useState(true);
  /** Distinct from "no people". The RPC can fail, and that must not read as an
   *  empty pipeline, nor as a spinner that never stops. */
  const [failure, setFailure] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<DealStage | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('last_seen');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');

  const [menu, setMenu] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<{ top: number; right: number } | null>(null);

  const [adding, setAdding] = useState(false);
  /** Full screen. Eleven columns do not fit beside a 320px rail, so the table was
   *  a horizontal scroll with Last Note permanently off the end. */
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState<DealPerson | null>(null);
  const [deckFor, setDeckFor] = useState<DealPerson | null>(null);
  const [docsFor, setDocsFor] = useState<DealPerson | null>(null);
  const [notesFor, setNotesFor] = useState<DealPerson | null>(null);
  const [detailsFor, setDetailsFor] = useState<DealPerson | null>(null);
  const [committedFor, setCommittedFor] = useState<DealPerson | null>(null);
  const [stageFor, setStageFor] = useState<{ person: DealPerson; next: DealStage } | null>(null);

  const deck = docs.find(d => d.is_deck);

  const load = async () => {
    const r = await fetchDealPeople(dealId);
    setFailure(r.people === null ? (r.message || 'The database rejected the request.') : null);
    if (r.people) setPeople(r.people);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [dealId]);

  useEffect(() => {
    if (!expanded) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
    window.addEventListener('keydown', esc);
    // The page behind must not scroll while a full-screen panel is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = prev; };
  }, [expanded]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const rows = useMemo(() => {
    // No email, no row. Nobody reaches a deal room without giving one, so an
    // email-less row is a leftover from before dealstudio_record_visit required
    // it, and rendering it as "Anonymous" put a person in the pipeline who is not
    // a person.
    let r = (people ?? []).filter(p => !!(p.email || '').trim());
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
      if (sort === 'last_seen' || sort === 'last_note_at') {
        const raw = p[sort] as string | null;
        return raw ? new Date(raw).getTime() : 0;
      }
      if (typeof v === 'string') return v.toLowerCase();
      if (v == null) return '';
      return v as number | string;
    };
    return [...r].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av === bv) return 0;
      const c = av > bv ? 1 : -1;
      return dir === 'asc' ? c : -c;
    });
  }, [people, q, filter, sort, dir]);

  /** The rows on screen, as a CSV. What you filtered to is what you export. */
  const exportReport = () => {
    const head = [
      'Email', 'Contact', 'Company', 'Status', 'Committed', 'Visits', 'Total time',
      'Deck views', 'Document views', 'Forwards', 'Last viewed', 'Last note',
    ];
    const cell = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.map(cell).join(',')];
    for (const p of rows) {
      lines.push([
        p.email || '', p.name || '', p.company_name || '', STAGE_LABEL[p.stage],
        p.committed || 0,
        p.visits || 0, formatDuration(Math.round(p.total_seconds)),
        p.deck_views || 0, p.doc_views || 0, p.forwards || 0,
        p.last_seen ? fmtDate(p.last_seen) : '',
        p.last_note_at ? fmtDate(p.last_note_at) : '',
      ].map(cell).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-deal-flow.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
  const chip = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-[#191f1d] bg-[#f5f6f8] hover:bg-[#edf0f3] transition';

  // Only a load that has neither finished nor failed spins. A failed first load
  // used to leave people null forever, and the card span forever with it.
  if (loading) {
    return <div className={`${card} p-8 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  // The same circle as the deck's full-screen control, so the gesture is one
  // gesture in two places rather than two conventions.
  const iconBtn = 'w-9 h-9 rounded-full bg-[#f5f6f8] hover:bg-[#edf0f3] border border-[#edf0f3] flex items-center justify-center text-[#191f1d] transition shrink-0';

  const header = (
    /* Title, one line on what the section is for, actions right. */
    <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[#191f1d]">Deal Flow</h3>
        <p className="text-xs text-[#7f8c85] mt-0.5">
          Everyone in the pipeline and everyone who has opened the room, and what they read.
        </p>
      </div>

      <div className="sm:ml-auto flex flex-wrap items-center gap-2 shrink-0">
        <button onClick={exportReport} className={iconBtn} title="Export this report as CSV" aria-label="Export this report as CSV">
          <Download className="w-4 h-4" />
        </button>

        <button
          onClick={() => setExpanded(v => !v)}
          className={iconBtn}
          title={expanded ? 'Close full screen' : 'Open full screen'}
          aria-label={expanded ? 'Close full screen' : 'Open full screen'}
        >
          {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 transition"
        >
          <Plus className="w-4 h-4" /> New Investor
        </button>
      </div>
    </div>
  );

  const inner = (
    <>
      {header}

      {/* Status filter. Brand blue, so it cannot be mistaken for the teal page tabs. */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="min-w-0 lg:flex-1">
          <PillTabs
            tabs={[['all', 'All'] as [string, string], ...PIPELINE.map(s => [s, STAGE_LABEL[s]] as [string, string])]}
            value={filter}
            onChange={(v) => setFilter(v as DealStage | 'all')}
            hintKey="dealflow-status"
            tone="brand"
          />
        </div>

        <div className="relative shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#99a1af]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, company"
            className="w-full lg:w-64 h-10 bg-[#f5f6f8] rounded-xl pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
          />
        </div>
      </div>

      {failure ? (
        <div className="py-10 text-center">
          <p className="text-sm font-semibold text-[#191f1d]">Could not load the people on this deal.</p>
          <p className="mt-2 mx-auto max-w-lg rounded-xl bg-[#f5f6f8] border border-[#edf0f3] px-3 py-2 text-xs font-mono text-[#191f1d] break-words">
            {failure}
          </p>
          <p className="mt-2 text-xs text-[#7f8c85] max-w-lg mx-auto">
            That message is from Postgres, not the browser. This table reads one function,
            admin_deal_people, and it depends on objects created in migrations 0035, 0036,
            0037 and 0040. Run them in order, then run notify pgrst, reload schema.
          </p>
          <button onClick={() => void refresh()} className={`${chip} mt-4`}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-sm text-[#99a1af] text-center">
          {(people?.length ?? 0) === 0
            ? 'Nobody is on this deal yet. Add the first investor to start tracking your raise.'
            : 'Nothing matches that.'}
        </p>
      ) : (
        <div className="rounded-2xl border border-[#edf0f3] overflow-x-auto ds-scroll-x">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[#7f8c85] border-b border-[#edf0f3]">
                <Th k="email">Email</Th>
                <Th k="name">Contact</Th>
                <Th k="company_name">Company</Th>
                <Th k="stage">Status</Th>
                <Th k="committed" right>Committed</Th>
                <Th k="visits" right>Visits</Th>
                <Th k="total_seconds" right>Total Time</Th>
                <Th k="deck_views" right>Deck View</Th>
                <Th k="doc_views" right>Document Views</Th>
                <Th k="forwards" right>Forwards</Th>
                <Th k="last_seen" right>Last Viewed</Th>
                <Th k="last_note_at" right>Last Note</Th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>

            <tbody>
              {rows.map((p) => {
                const id = p.access_id || p.visit_id || p.email || '';
                return (
                  <tr key={id} className="border-b border-[#f5f6f8] last:border-0 odd:bg-[#fafbfc] hover:bg-[#f5f6f8]">
                    <td className="px-4 py-3 font-medium text-[#191f1d] whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {p.blocked && (
                          <span title="Blocked from the room" className="shrink-0">
                            <Ban className="w-3.5 h-3.5 text-red-600" />
                          </span>
                        )}
                        {p.email}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-[#7f8c85] whitespace-nowrap">{p.name || DASH}</td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.company_name ? (
                        <span className="flex items-center gap-2">
                          <span className="w-7 h-7 shrink-0 rounded-full overflow-hidden ring-2 ring-white bg-white shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center">
                            {p.company_logo
                              ? <img src={p.company_logo} alt="" className="w-full h-full object-cover" />
                              : <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-[10px] font-semibold">
                                  {p.company_name.trim().charAt(0).toUpperCase()}
                                </span>}
                          </span>
                          <span className="text-[#191f1d]">{p.company_name}</span>
                        </span>
                      ) : <span className="text-[#c7cdd4]">{DASH}</span>}
                    </td>

                    <td className="px-4 py-3">
                      <select
                        value={p.stage}
                        onChange={(e) => setStageFor({ person: p, next: e.target.value as DealStage })}
                        title="Change status"
                        className={`h-7 rounded-full border px-2 text-xs font-semibold cursor-pointer ${stageClass(p.stage)}`}
                      >
                        {stageOptions(p.stage).map(s => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
                      </select>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 tabular-nums text-[#7f8c85]">
                        {p.committed ? <span className="font-semibold text-[#191f1d]">{money(p.committed)}</span> : DASH}
                        <Drill label="Set the committed amount" onClick={() => setCommittedFor(p)} />
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums text-[#7f8c85]">{num(p.visits)}</td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 tabular-nums text-[#7f8c85]">
                        {formatDuration(Math.round(p.total_seconds))}
                        <Drill label="Time per section" onClick={() => setSections(p)} />
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 tabular-nums text-[#7f8c85]">
                        {num(p.deck_views)}
                        <Drill label="Time on the deck, page by page" onClick={() => setDeckFor(p)} />
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 tabular-nums text-[#7f8c85]">
                        {num(p.doc_views)}
                        <Drill label="Time per document" onClick={() => setDocsFor(p)} />
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

                    <td className="px-4 py-3 text-right text-[#7f8c85] whitespace-nowrap">{fmtDate(p.last_seen)}</td>

                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 text-[#7f8c85]">
                        {p.note_count ? fmtDate(p.last_note_at) : DASH}
                        <Drill label="Notes history" onClick={() => setNotesFor(p)} />
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => openMenu(id, e)}
                        aria-label={`Actions for ${p.email}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#7f8c85] hover:bg-white hover:text-[#191f1d]"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {menu === id && menuAt && createPortal(
                        <>
                          {/* Above the full-screen panel (z-65), below the dialogs
                              (z-70). The menu is portalled to the body, so it does
                              not inherit the panel's stacking context and would
                              otherwise open behind it. */}
                          <div className="fixed inset-0 z-[66]" onClick={() => setMenu(null)} />
                          <div
                            className="fixed z-[67] w-56 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5 text-left"
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

                            {/* Reset is for your own test views. Block revokes them at
                                the gate, it is not cosmetic. Delete is permanent and
                                takes their analytics with it. All three came off the
                                old View List, which this table replaced. */}
                            <button
                              disabled={!p.visit_id}
                              onClick={async () => {
                                setMenu(null);
                                if (await adminResetVisit(p.visit_id!)) { toast.success('Counts reset'); await load(); onChanged(); }
                                else toast.error('Could not reset');
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d] disabled:opacity-40"
                            >
                              <RotateCcw className="w-4 h-4" /> Reset counts
                            </button>

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

                            <button
                              onClick={async () => {
                                setMenu(null);
                                if (!confirm(`Permanently delete ${p.email} and their analytics? This cannot be undone.`)) return;
                                if (await deleteDealPerson(p.access_id, p.visit_id)) { toast.success('Deleted'); await load(); onChanged(); }
                                else toast.error('Could not delete');
                              }}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" /> Delete
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

      {adding && (
        <AddInvestorDialog
          dealId={dealId}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await load(); onChanged(); }}
        />
      )}

      {stageFor && (
        <StageDialog
          person={stageFor.person}
          dealId={dealId}
          next={stageFor.next}
          onClose={() => setStageFor(null)}
          onSaved={async () => { setStageFor(null); await load(); onChanged(); }}
        />
      )}

      {notesFor && (
        <NotesDialog
          person={notesFor}
          dealId={dealId}
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

      {committedFor && (
        <CommittedDialog
          person={committedFor}
          dealId={dealId}
          onClose={() => setCommittedFor(null)}
          onSaved={async () => { setCommittedFor(null); await load(); onChanged(); }}
        />
      )}

      {sections && (
        <SectionsDialog person={sections} docs={docs} onClose={() => setSections(null)} />
      )}
      {docsFor && (
        <SectionsDialog person={docsFor} docs={docs} docsOnly onClose={() => setDocsFor(null)} />
      )}

      {/* The deck drill-down is the page-by-page chart, not a single total. It was
          only reachable from the card that is now gone, and it is the best data
          in the product. */}
      {deckFor && (
        deck && deckFor.email
          ? (
            <Shell title={`Deck analytics: ${deckFor.name || deckFor.email}`} onClose={() => setDeckFor(null)}>
              <DeckPageBars roomId={dealId} deckId={deck.id} email={deckFor.email} deckUrl={deck.file_url} />
            </Shell>
          )
          : <SectionsDialog person={deckFor} docs={docs} deckOnly onClose={() => setDeckFor(null)} />
      )}
    </>
  );

  /**
   * Full screen is a portal, not a wider card.
   *
   * The table has eleven columns and lives beside a 320px rail, so Last Note was
   * always off the right edge and the founder was managing a pipeline through a
   * letterbox. Expanded, the same table gets the whole window.
   *
   * ONE scroll container, deliberately. The page behind is locked (see the effect
   * above), the panel scrolls vertically, and the table scrolls horizontally
   * inside it with no height cap of its own, so it never competes for the wheel.
   */
  if (expanded) {
    return createPortal(
      <div className="fixed inset-0 z-[65] bg-[#f5f6f8] overflow-y-auto ds-scroll-y p-3 sm:p-5">
        <div className={`${card} p-5`}>{inner}</div>
      </div>,
      document.body,
    );
  }

  return <div className={`${card} p-5`}>{inner}</div>;
}

/* Dialogs */

function Shell({ title, subtitle, onClose, children }: {
  title: string;
  /** Who this is about. A form with five fields and no name on it is a form you
   *  can fill in for the wrong person. */
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[71] flex items-start justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-lg mt-16 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_24px_60px_-16px_rgba(12,16,34,0.35)]">
          <div className="flex items-start gap-3 p-5 border-b border-[#edf0f3]">
            <div className="min-w-0">
              <h2 className="font-bold text-[#191f1d]">{title}</h2>
              {subtitle && <p className="text-xs text-[#7f8c85] mt-0.5 truncate">{subtitle}</p>}
            </div>
            <button onClick={onClose} aria-label="Close" className="ml-auto shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
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

/** New investor. Email is the key: it is what the visit rows join on, so a person
 *  added here and the same person opening the room are one row, not two. */
function AddInvestorDialog({
  dealId, onClose, onSaved,
}: { dealId: string; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);

  const field = 'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
  const label = 'block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1';
  const valid = /.+@.+\..+/.test(email.trim());

  return (
    <Shell title="New investor" onClose={onClose}>
      <div className="space-y-3">
        <div><label className={label}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} autoFocus className={field} placeholder="name@firm.com" /></div>
        <div><label className={label}>Contact name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Optional" /></div>
        <div><label className={label}>Company</label>
          <input value={company} onChange={e => setCompany(e.target.value)} className={field} placeholder="Optional" /></div>
      </div>

      <p className="mt-3 text-xs text-[#7f8c85]">
        They start as a Prospect. Adding them here does not grant access to the room.
      </p>

      <button
        onClick={async () => {
          setBusy(true);
          const r = await createDealPerson(dealId, { email, name, company_name: company });
          setBusy(false);
          if (r.ok) { toast.success('Investor added'); onSaved(); }
          else toast.error(r.message || 'Could not add them');
        }}
        disabled={!valid || busy}
        className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add investor
      </button>
    </Shell>
  );
}

/** The committed amount. This is what the Raised tile adds up, so it lives on the
 *  row, not in a card that no longer exists. */
function CommittedDialog({
  person, dealId, onClose, onSaved,
}: { person: DealPerson; dealId: string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState(person.committed ? String(person.committed) : '');
  const [busy, setBusy] = useState(false);
  const accessId = useAccessId(dealId);

  return (
    <Shell title="Committed" subtitle={person.email ?? undefined} onClose={onClose}>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1">Amount</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        autoFocus
        placeholder="250000"
        className="w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
      />
      <p className="mt-2 text-xs text-[#7f8c85]">
        Adds to Raised on this deal. Clear the field to remove the commitment.
      </p>

      <button
        onClick={async () => {
          setBusy(true);
          const id = await accessId(person);
          if (!id) { setBusy(false); toast.error('Could not save'); return; }
          const n = amount.trim() === '' ? null : Number(amount);
          const ok = await setDealCommitted(id, Number.isFinite(n as number) ? n : null);
          setBusy(false);
          if (ok) { toast.success('Saved'); onSaved(); }
          else toast.error('Could not save');
        }}
        disabled={busy}
        className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save
      </button>
    </Shell>
  );
}

/** Changing a status always costs a sentence. Three weeks later, "why is this
 *  one marked passed" needs an answer. */
function StageDialog({
  person, dealId, next, onClose, onSaved,
}: { person: DealPerson; dealId: string; next: DealStage; onClose: () => void; onSaved: () => void }) {
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState(person.committed ? String(person.committed) : '');
  const [busy, setBusy] = useState(false);
  const accessId = useAccessId(dealId);

  /** Committing IS the amount. Asking for the stage and then making the founder
   *  hunt for a second control to say how much is how Raised stays at zero on a
   *  deal that has commitments in it. */
  const wantsAmount = next === 'committed' || next === 'closed';

  return (
    <Shell title={`${STAGE_LABEL[person.stage]} to ${STAGE_LABEL[next]}`} subtitle={person.email ?? undefined} onClose={onClose}>
      {wantsAmount && (
        <div className="mb-4">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1">
            Amount committed
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal"
            autoFocus
            placeholder="250000"
            className="w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
          />
          <p className="mt-1 text-xs text-[#7f8c85]">Adds to Raised on this deal. Leave it blank to set it later.</p>
        </div>
      )}

      <p className="text-sm text-[#7f8c85] mb-3">
        Why is this changing? It goes into their notes history.
      </p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        autoFocus={!wantsAmount}
        placeholder="Term sheet sent, waiting on their counsel."
        className="w-full min-h-[90px] resize-y rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
      />
      <button
        onClick={async () => {
          setBusy(true);
          const id = await accessId(person);
          if (!id) { setBusy(false); toast.error('Could not update'); return; }

          // The amount goes first. If the stage saved and the amount failed, the
          // pipeline would say committed and Raised would not move, which is the
          // one inconsistency a founder will not forgive.
          if (wantsAmount && amount.trim() !== '') {
            const n = Number(amount);
            if (Number.isFinite(n)) await setDealCommitted(id, n);
          }

          const r = await setDealStage(id, next, note);
          setBusy(false);
          if (r.ok) { toast.success('Status updated'); onSaved(); }
          else toast.error(r.message || 'Could not update');
        }}
        disabled={!note.trim() || busy}
        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {wantsAmount ? 'Save status, amount and note' : 'Save status and note'}
      </button>
    </Shell>
  );
}

function NotesDialog({
  person, dealId, onClose, onChanged,
}: { person: DealPerson; dealId: string; onClose: () => void; onChanged: () => void }) {
  const [notes, setNotes] = useState<DealNote[] | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const accessId = useAccessId(dealId);

  // A viewer with no access row has no notes yet, which is not the same as
  // failing to load them. Do not call the RPC with a null id.
  const load = async () => setNotes(person.access_id ? await fetchDealNotes(person.access_id) : []);
  useEffect(() => { void load(); }, [person.access_id]);

  return (
    <Shell title="Notes" subtitle={person.email ?? undefined} onClose={onClose}>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add a note"
        className="w-full min-h-[70px] resize-y rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
      />
      <button
        onClick={async () => {
          if (!draft.trim()) return;
          const id = await accessId(person);
          if (id && await addDealNote(id, draft)) {
            setDraft('');
            setNotes(await fetchDealNotes(id));
            onChanged();
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
              {/* Who said it. A note with a date and no name is half a record once
                  more than one person is working the raise. */}
              {n.author && (
                <span className="text-[11px] font-semibold text-[#191f1d] truncate">{n.author}</span>
              )}
              <span className="text-[11px] text-[#9ca3af] ml-auto shrink-0">
                {new Date(n.created_at).toLocaleString()}
                {n.updated_at && ' (edited)'}
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
  const [pulling, setPulling] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  const field = 'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
  const label = 'block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1';
  const accessId = useAccessId(dealId);

  return (
    <Shell title="Details" subtitle={person.email ?? undefined} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className={label}>Email</label>
          {/* Read-only. The email is the key the visit rows join on, so editing it
              here would silently split one person into two. */}
          <p className="rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#7f8c85] truncate">{person.email}</p>
        </div>
        <div><label className={label}>Contact name</label>
          <input value={name} onChange={e => setName(e.target.value)} className={field} placeholder="Contact name" /></div>
        <div><label className={label}>Company</label>
          <input value={company} onChange={e => setCompany(e.target.value)} className={field} placeholder="Company" /></div>
        <div>
          <label className={label}>Image</label>

          <div className="flex items-center gap-3">
            {/* You cannot judge a URL. Circles, like every other avatar in the
                product, so what you see here is what the table will show. */}
            <span className="w-12 h-12 shrink-0 rounded-full overflow-hidden ring-2 ring-white bg-[#f5f6f8] shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center">
              {logo && !imgBroken
                ? <img src={logo} alt="" className="w-full h-full object-cover" onError={() => setImgBroken(true)} onLoad={() => setImgBroken(false)} />
                : <ImageOff className="w-4 h-4 text-[#c7cdd4]" />}
            </span>

            <div className="min-w-0 flex-1">
              <input
                value={logo}
                onChange={e => { setLogo(e.target.value); setImgBroken(false); }}
                className={field}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* Pull tries LinkedIn FIRST when there is a LinkedIn URL, then falls
                back to the website. See the note under this row: LinkedIn usually
                refuses, and the toast says which source actually worked, so a
                silent fallback never passes a company logo off as a headshot. */}
            <button
              type="button"
              disabled={(!website.trim() && !linkedin.trim()) || pulling}
              onClick={async () => {
                setPulling(true);
                setImgBroken(false);
                let got = '';
                let from = '';

                if (linkedin.trim()) {
                  const li = await fetchLinkPreviewResult(linkedin.trim());
                  if (li.ok && li.preview.image) { got = li.preview.image; from = 'LinkedIn'; }
                }
                if (!got && website.trim()) {
                  const w = await fetchLinkPreviewResult(website.trim());
                  if (w.ok && w.preview.image) { got = w.preview.image; from = 'their website'; }
                }

                setPulling(false);
                if (got) { setLogo(got); toast.success(`Pulled from ${from}`); }
                else toast.error('Nothing to pull. LinkedIn blocks this, and their site has no image.');
              }}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-[#191f1d] bg-[#f5f6f8] hover:bg-[#edf0f3] disabled:opacity-40"
            >
              {pulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Pull
            </button>

            {/* The one path to a headshot that always works. */}
            <label className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-[#191f1d] bg-[#f5f6f8] hover:bg-[#edf0f3] ${uploading ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Upload
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.currentTarget.value = '';
                  if (!file) return;
                  setUploading(true);
                  const up = await uploadDealFile(file, dealId);
                  setUploading(false);
                  if (up?.url) { setLogo(up.url); setImgBroken(false); toast.success('Image uploaded'); }
                  else toast.error('Could not upload that image');
                }}
              />
            </label>
          </div>

          <p className="mt-1.5 text-xs text-[#99a1af]">
            Pull tries LinkedIn, then their website. LinkedIn serves a sign-in wall to anything
            that is not a signed-in browser, so it usually returns nothing. Upload is the reliable
            way to get a face here.
          </p>
        </div>
        <div><label className={label}>LinkedIn</label>
          <input value={linkedin} onChange={e => setLinkedin(e.target.value)} className={field} placeholder="https://linkedin.com/in/..." /></div>
        <div><label className={label}>Website</label>
          <input value={website} onChange={e => setWebsite(e.target.value)} className={field} placeholder="https://..." /></div>
      </div>

      <button
        onClick={async () => {
          setBusy(true);
          const id = await accessId(person);
          if (!id) { setBusy(false); toast.error('Could not save'); return; }
          const ok = await saveDealPerson(id, {
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
    <Shell title={`${title}: ${person.name || person.email}`} onClose={onClose}>
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
