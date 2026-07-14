/**
 * DealStudioScreen — Master Admin > DealStudio.
 * Manages the public /investors deal studio: details, documents (with archive),
 * visitors/approvals, and settings + activate/deactivate. Follows the canonical
 * admin page pattern (gradient icon header, auto-save pill, gray canvas, Radix
 * tabs, white cards, max-w-6xl).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Presentation, Plus, ExternalLink, Copy, Check, Power, CheckCircle2, Users, FileText, Trash2, RefreshCw, UploadCloud, GripVertical, Globe, X, LogOut, Eye, EyeOff, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { RichTextEditor } from '../RichTextEditor';
import { EventsCalendar } from '../EventsCalendar';
import { DealDocumentCard } from '../dealstudio/DealDocumentCard';
import { DealDocumentModal } from '../dealstudio/DealDocumentModal';
import { AvailabilityModal } from '../dealstudio/AvailabilityModal';
import { PdfDeckViewer } from '../dealstudio/PdfDeckViewer';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAuth } from '../dealstudio/AdminGate';
import { dealUrl, createDeal } from '../../lib/org';
import { isDealLimitError } from '../../lib/billing';
import { DealSwitcher } from '../dealstudio/DealSwitcher';
import dsMark from '../../assets/dealstudio-mark.png';
import { DealDocViewer } from '../dealstudio/DealDocViewer';
import { DealPeople } from '../dealstudio/DealPeople';
import { PillTabs } from '../dealstudio/PillTabs';
import { MarketEditor } from '../dealstudio/MarketEditor';
import { ValuePropEditor } from '../dealstudio/ValuePropEditor';
import { ProblemSolutionEditor } from '../dealstudio/ProblemSolutionEditor';
import { IndustryReadingEditor } from '../dealstudio/IndustryReadingEditor';
import { CompetitionEditor } from '../dealstudio/CompetitionEditor';
import { DealThemeEditor } from '../dealstudio/DealThemeEditor';
import { DeleteDealDialog } from '../dealstudio/DeleteDealDialog';
import type { OrgDeal } from '../../lib/org';
import { StatSlotField } from '../dealstudio/StatSlotField';
import {
  DEFAULT_STAT_SLOTS, resolveSectionOrder, SECTION_LABELS,
  type StatSlot, type SectionKey,
} from '../../lib/dealStudio';
import { DisplayOrder } from '../dealstudio/DisplayOrder';
import { TeamEditor } from '../dealstudio/TeamEditor';
import { BusinessModelEditor } from '../dealstudio/BusinessModelEditor';
import {
  DealStudio, DealDocument, DealAccessRow, DealFunnel, DealIndustry, DealSchedule, DocStat,
  adminFetchDealStudio, adminSaveDealStudio, adminSetActive, adminSetSharedPassword,
  adminFetchDocuments, adminDeleteDocument, adminDeleteDocuments, adminReorderDocuments, adminFetchAccess,
  adminFetchFunnel, adminFetchDocStats,
  scheduleDates, scheduleSlots, committedTotal, EMPTY_MARKET,
} from '../../lib/dealStudio';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">{label}</p>
      <p className="text-2xl font-bold text-[#191f1d] mt-2">{value}</p>
    </div>
  );
}

/** 14:30 reads as 2:30 PM. The cards are for scanning, not for configuring. */
function fmtSlot(t: string): string {
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function DealStudioScreen() {
  const nav = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const { org } = useAdminAuth();

  const [newDeal, setNewDeal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ndName, setNdName] = useState('');
  const [ndBusy, setNdBusy] = useState(false);
  const [ndErr, setNdErr] = useState('');

  // Branding starts as the company's current colours, so a new room looks like
  // the rest of the company on the first render rather than defaulting to ours.
  const [ndFrom, setNdFrom] = useState('');
  const [ndTo, setNdTo] = useState('');
  const [ndAccent, setNdAccent] = useState('');

  useEffect(() => {
    if (!newDeal || !org) return;
    setNdName('');
    setNdErr('');
    setNdFrom(org.brand_from);
    setNdTo(org.brand_to);
    setNdAccent(org.brand_accent);
  }, [newDeal, org]);

  const createNewDeal = async () => {
    if (!org || !ndName.trim()) return;
    setNdBusy(true); setNdErr('');
    try {
      const { deal_id, slug } = await createDeal(org.id, ndName.trim());
      await adminSaveDealStudio(deal_id, {
        brand_from: ndFrom, brand_to: ndTo, brand_accent: ndAccent,
      });
      setNewDeal(false);
      nav(`/admin/d/${slug}`);
    } catch (e) {
      // A deal limit is a real, expected answer here, not a crash.
      const msg = e instanceof Error ? e.message : String(e);
      setNdErr(isDealLimitError(msg)
        ? 'You have used every deal room on your plan. Add another in Billing.'
        : 'Could not create the deal.');
    } finally {
      setNdBusy(false);
    }
  };
  const [room, setRoom] = useState<DealStudio | null>(null);
  const [docs, setDocs] = useState<DealDocument[]>([]);
  const [access, setAccess] = useState<DealAccessRow[]>([]);
  const [funnel, setFunnel] = useState<DealFunnel | null>(null);
  const [tab, setTab] = useState('details');
  const [savedAt, setSavedAt] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [docModal, setDocModal] = useState<{ open: boolean; existing: DealDocument | null; deck?: boolean }>({ open: false, existing: null });
  const [sharedPw, setSharedPw] = useState('');
  const [pwShown, setPwShown] = useState(false);
  // Whether the user has engaged the shared-password field this session. Until
  // they do, a field with an existing password shows a masked placeholder and
  // the Set button leaves it unchanged, so it can't be wiped by accident.
  const [pwTouched, setPwTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [calDate, setCalDate] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [docStats, setDocStats] = useState<Record<string, DocStat>>({});
  const [availOpen, setAvailOpen] = useState(false);
  const [docView, setDocView] = useState<DealDocument | null>(null);
  const [siteOpen, setSiteOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragRef = useRef<{ drag: string | null; over: string | null }>({ drag: null, over: null });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Accumulates only the fields the user actually changed, merged across rapid
  // edits, so each save writes a minimal patch (never the whole row). One bad
  // field can no longer fail the entire save and wipe the form.
  const pendingPatch = useRef<Partial<DealStudio>>({});

  // Pointer-based drag reorder (works on touch + mouse, unlike HTML5 DnD).
  const startReorder = (id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { drag: id, over: id };
    setDragId(id);
    const move = (ev: PointerEvent) => {
      let found: string | null = null;
      document.querySelectorAll<HTMLElement>('[data-doc-card]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) found = el.dataset.docCard || null;
      });
      dragRef.current.over = found;
      setOverId(found);
    };
    const up = () => {
      const { drag, over } = dragRef.current;
      if (drag && over && drag !== over) {
        setDocs(prev => {
          const a = [...prev];
          const fi = a.findIndex(x => x.id === drag);
          const ti = a.findIndex(x => x.id === over);
          if (fi < 0 || ti < 0 || fi === ti) return prev;
          const [m] = a.splice(fi, 1);
          a.splice(ti, 0, m);
          void adminReorderDocuments(a.map((x, i) => ({ id: x.id, sort_order: i })));
          return a;
        });
      }
      dragRef.current = { drag: null, over: null };
      setDragId(null); setOverId(null);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const reloadDocs = async (roomId: string) => {
    const d = await adminFetchDocuments(roomId);
    setDocs(d);
    setDocStats(await adminFetchDocStats(roomId));
    const deck = d.find(x => x.is_deck);
  };
  const reloadVisitors = async (roomId: string) => {
    const rows = await adminFetchAccess(roomId);
    setAccess(rows);
    // The visit rows themselves are no longer read on this screen: the Deal Flow
    // table gets them merged with the pipeline from admin_deal_people, in one
    // call. Fetching them again here was a second round trip for nobody.
    setFunnel(await adminFetchFunnel(roomId));
    // Keep the public-facing raised amount in sync with committed deals.
    const total = committedTotal(rows);
    setRoom(prev => {
      if (prev && Number(prev.raised_amount) !== total) { void adminSaveDealStudio(roomId, { raised_amount: total }); return { ...prev, raised_amount: total }; }
      return prev;
    });
  };

  useEffect(() => {
    (async () => {
      setRoom(null);
      const r = await adminFetchDealStudio(slug);
      setRoom(r);
      if (r) { await reloadDocs(r.id); await reloadVisitors(r.id); }
    })();
  }, [slug]);

  // Debounced auto-save for the detail form (no explicit Save buttons).
  const update = (patch: Partial<DealStudio>) => {
    setRoom(prev => (prev ? { ...prev, ...patch } : prev));
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setRoom(prev => {
        if (!prev) return prev;
        const toSave = pendingPatch.current;
        pendingPatch.current = {};
        if (Object.keys(toSave).length === 0) return prev;
        setSaving(true);
        void adminSaveDealStudio(prev.id, toSave).then(res => {
          setSaving(false);
          if (res?.success) {
            setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
          } else {
            // Re-queue the unsaved fields so the next edit retries them, and
            // tell the user instead of silently losing their work.
            pendingPatch.current = { ...toSave, ...pendingPatch.current };
            toast.error('Could not save deal studio changes. Your edits are kept; try again.');
          }
        });
        return prev;
      });
    }, 800);
  };

  const toggleActive = async () => {
    if (!room) return;
    const next = !room.is_active;
    setRoom({ ...room, is_active: next });
    await adminSetActive(room.id, next);
    toast.success(next ? 'DealStudio activated' : 'DealStudio deactivated');
  };

  /**
   * The public URL for THIS deal.
   *
   * Was hard-coded to https://www.dealstudio.io/dealstudio, which had two
   * problems: www has no DNS record (so the link simply did not resolve), and
   * the path carried no slug, so it fell through to DEFAULT_SLUG. Every
   * customer's share link therefore pointed at the demo room instead of their
   * own deal.
   */
  const publicUrl = () =>
    room ? dealUrl(org?.handle ?? null, room.slug) : '';

  const copyLink = () => { navigator.clipboard?.writeText(publicUrl()); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const copyShareLink = () => { navigator.clipboard?.writeText(`${publicUrl()}?share=1`); setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); };

  const deleteDoc = async (doc: DealDocument) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    const r = await adminDeleteDocument(doc.id);
    if (r.success && room) { toast.success('Document deleted'); reloadDocs(room.id); }
    else toast.error('Delete failed');
  };

  const toggleSelect = (doc: DealDocument) => {
    setSelectedDocs(prev => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id); else next.add(doc.id);
      return next;
    });
  };
  const exitSelect = () => { setSelectMode(false); setSelectedDocs(new Set()); };
  const bulkDelete = async () => {
    if (!room || selectedDocs.size === 0) return;
    if (!window.confirm(`Delete ${selectedDocs.size} document${selectedDocs.size > 1 ? 's' : ''}?`)) return;
    const r = await adminDeleteDocuments(Array.from(selectedDocs));
    if (r.success) { toast.success(`${selectedDocs.size} deleted`); exitSelect(); reloadDocs(room.id); }
    else toast.error('Delete failed');
  };

  const setShared = async () => {
    if (!room) return;
    // If a password already exists and the user hasn't touched the field, the
    // masked dots are just an indicator — don't clear it out from under them.
    if (room.shared_password_hash && !pwTouched) {
      toast.info('Password unchanged');
      return;
    }
    const r = await adminSetSharedPassword(room.slug, sharedPw || null);
    if (r.success) {
      toast.success(sharedPw ? 'Shared password set' : 'Shared password cleared');
      setRoom(prev => prev ? { ...prev, shared_password_hash: sharedPw ? 'set' : null, shared_password_plain: sharedPw || null } as any : prev);
      setSharedPw('');
      setPwTouched(false);
    }
    else toast.error('Could not set password');
  };

  const availabilityEvents = useMemo(() => {
    if (!room?.availability) return [];
    return scheduleDates(room.availability as DealSchedule).map((d, i) => ({ id: `a${i}`, name: 'Meeting slot', date: d } as any));
  }, [room]);

  if (!room) {
    return <div className="p-8 text-center text-[#7f8c85]">Loading deal studio…</div>;
  }

  const raised = committedTotal(access);
  const committedCount = access.filter(a => a.stage === 'committed').length;
  const passedCount = access.filter(a => a.stage === 'passed').length;
  const activeCount = access.filter(a => a.stage !== 'committed' && a.stage !== 'passed').length;

  const tiles: [string, string][] = [
    ['Goal', room.raise_amount || (room.raise_goal ? `$${room.raise_goal.toLocaleString()}` : '$0')],
    ['Raised', `$${raised.toLocaleString()}`],
    ['Total Visits', String(funnel?.totalVisitors ?? 0)],
    ['Active', String(activeCount)],
    ['Committed', String(committedCount)],
    ['Passed', String(passedCount)],
  ];

  const deck = docs.find(d => d.is_deck) || null;
  const deckIsPdf = !!deck && (deck.file_name || deck.file_url || '').toLowerCase().endsWith('.pdf');

  /* The three side panels, defined once. Desktop shows them in the right
     rail; mobile places each one inside the tab it belongs to. */
  const funnelPanel = (
            <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-[#191f1d] flex items-center gap-2"><Users className="w-4 h-4 text-[var(--ds-brand)]" /> Investor Funnel</p>
                <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">Conv {funnel?.conversion ?? 0}%</span>
              </div>
              {(() => {
                const v = funnel?.totalVisitors ?? 0;
                if (v === 0) return <p className="text-sm text-[#99a1af] py-1">No activity yet.</p>;

                // Views is the raw total, so it sits apart from the funnel. The
                // three stages below all count PEOPLE, and their percentages are
                // of Visitors, which makes them comparable to each other.
                const totalViews = funnel?.views ?? 0;

                const stages = [
                  { label: 'Visitors', value: v, hint: 'unique emails' },
                  { label: 'Viewed deck', value: funnel?.deckViewers ?? 0, hint: 'unique emails' },
                  { label: 'Repeat visitors', value: funnel?.repeatVisitors ?? 0, hint: 'came back' },
                ];

                return (
                  <>
                    <div className="mb-4 pb-3 border-b border-[#f2f4f6] flex items-baseline justify-between">
                      <div>
                        <span className="text-sm text-[#7f8c85]">Views</span>
                        <span className="block text-[11px] text-[#b6bcc4]">every page view, repeats included</span>
                      </div>
                      <span className="text-2xl font-bold text-[var(--ds-accent-ink)]">{totalViews}</span>
                    </div>

                    {stages.map((s) => {
                      const widthPct = v ? Math.round((s.value / v) * 100) : 0;
                      const ofVisitors = v ? Math.round((s.value / v) * 100) : 0;
                      return (
                        <div key={s.label} className="mb-3">
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-[#7f8c85]">
                              {s.label}
                              <span className="block text-[11px] text-[#b6bcc4]">{s.hint}</span>
                            </span>
                            <span className="font-semibold text-[#191f1d]">
                              {s.value}
                              <span className="text-[#99a1af] font-normal ml-1">({ofVisitors}%)</span>
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-[var(--ds-tint)] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
                              style={{ width: `${Math.max(4, widthPct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>

  );

  const displayOrderPanel = (
            <DisplayOrder
              order={resolveSectionOrder((room as any).section_order)}
              onChange={(next: SectionKey[]) => update({ section_order: next } as any)}
            />

  );

  const calendarPanel = (
            <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] mb-2">Deal Calendar</p>
              <EventsCalendar
                events={availabilityEvents}
                selectedDate={calDate}
                onSelectDate={setCalDate}
                currentMonth={calMonth}
                onChangeMonth={setCalMonth}
              />

              {/* Hour blocks for the picked day. Reuses scheduleSlots, the same
                  generator the investor booking modal uses, so what you see here
                  cannot disagree with what an investor can actually book. */}
              {calDate && (() => {
                const sch = room.availability as DealSchedule | null;
                const slots = sch ? scheduleSlots(sch, calDate) : [];
                const label = new Date(calDate + 'T00:00:00').toLocaleDateString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric',
                });

                return (
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-[#191f1d]">{label}</p>
                      <span className="text-[11px] text-[#9ca3af]">
                        {slots.length
                          ? `${slots.length} slot${slots.length === 1 ? '' : 's'}`
                          : 'No availability'}
                      </span>
                    </div>

                    {slots.length === 0 ? (
                      <p className="text-xs text-[#9ca3af] py-3 text-center rounded-xl bg-[#f5f6f8] border border-[#edf0f3]">
                        Nothing set for this day.
                      </p>
                    ) : (
                      // Three across, scrolls when there are more.
                      <div className="grid grid-cols-3 gap-2 max-h-[132px] overflow-y-auto pr-1">
                        {slots.map(t => (
                          <div
                            key={t}
                            className="rounded-xl border border-[#edf0f3] bg-white px-2 py-2 text-center shadow-[0_2px_8px_-2px_rgba(0,0,0,0.06)]"
                          >
                            <p className="text-sm font-bold text-[#191f1d] leading-none">
                              {fmtSlot(t)}
                            </p>
                            <p className="mt-1 text-[10px] text-[#9ca3af]">
                              {sch?.meetingLength ?? 30} min
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <button onClick={() => setAvailOpen(true)} className="w-full h-10 mt-2 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-sm font-semibold flex items-center justify-center gap-1.5"><RefreshCw className="w-4 h-4" /> Edit availability</button>
            </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full shrink-0 overflow-hidden ring-2 ring-white bg-white shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] flex items-center justify-center">
            {org?.logo_url
              ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
              : <img src={dsMark} alt="" className="w-full h-full object-cover" />}
          </span>
          <div className="min-w-0">
            <DealSwitcher />
            <p className="text-sm text-[#7f8c85] px-1">Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">
          {savedAt && <span className="hidden sm:inline-flex items-center h-9 text-xs font-medium px-2.5 rounded-xl bg-[var(--ds-tint)] text-[var(--ds-brand)]">{saving ? 'Saving…' : `Saved ${savedAt}`}</span>}
          {/* The public link now uses the company handle, not the legacy /d/ path. */}
          <a href={dealUrl(org?.handle ?? null, room.slug)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm text-[#191f1d] hover:bg-[#f5f7f9]"><ExternalLink className="w-4 h-4" /> View</a>

          {/* Shows the STATE, not the action. A room that is live reads "Active"
              with a tick; clicking it still toggles. "Deactivate" next to a live
              room read like a warning about what had happened, not a button. */}
          <button
            onClick={toggleActive}
            title={room.is_active ? 'Live. Click to take it offline.' : 'Draft. Click to publish.'}
            className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-medium ${room.is_active ? 'bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)]' : 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'}`}
          >
            {room.is_active
              ? <><CheckCircle2 className="w-4 h-4" /> Active</>
              : <><Power className="w-4 h-4" /> Activate</>}
          </button>

          <button
            onClick={() => setNewDeal(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110"
          >
            <Plus className="w-4 h-4" /> New deal
          </button>

        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        {tiles.map(([l, v]) => <StatTile key={l} label={l} value={v} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
        {/* Left: tabs + content */}
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={setTab}>
            {/* Deal Studio has more tabs than fit on a phone, and nothing said the
                bar scrolls. PillTabs nudges it once, on the first visit. */}
            <PillTabs
              tabs={(() => {
                // One list drives the tabs and the investor room, so the admin
                // can never show a different order from the one investors read.
                const mid = resolveSectionOrder((room as any).section_order)
                  .map(k => [k, SECTION_LABELS[k]] as [string, string]);
                return [
                  ['details', 'Details'] as [string, string],
                  ...mid,
                  ['dealflow', 'Deal Flow'] as [string, string],
                  ['settings', 'Settings'] as [string, string],
                ];
              })()}
              value={tab}
              onChange={setTab}
              hintKey="dealstudio"
            />

            {/* MARKET */}
            <TabsContent value="articles" className="space-y-4">
              <IndustryReadingEditor
                value={(room as any).market ?? null}
                onChange={(mk) => update({ market: mk } as any)}
                dealId={room.id}
              />
            </TabsContent>

            <TabsContent value="problem" className="space-y-4">
              <ProblemSolutionEditor
                value={(room as any).value_prop ?? null}
                onChange={(vp) => update({ value_prop: vp } as any)}
              />
            </TabsContent>

            <TabsContent value="valueprop" className="space-y-4">
              <ValuePropEditor
                value={(room as any).value_prop ?? null}
                onChange={(vp) => update({ value_prop: vp } as any)}
              />
            </TabsContent>

            <TabsContent value="competition" className="space-y-4">
              <CompetitionEditor
                orgId={org?.id}
                value={(room as any).competition ?? null}
                onChange={(c) => update({ competition: c } as any)}
              />
            </TabsContent>

            <TabsContent value="market" className="space-y-4">
              <MarketEditor value={room.market} onChange={(mkt) => update({ market: mkt })} />
            </TabsContent>

            {/* BUSINESS MODEL — stored nested under market so it rides the same
                extras payload; edited on its own tab. */}
            <TabsContent value="businessmodel" className="space-y-4">
              <BusinessModelEditor
                value={room.market?.businessModel}
                onChange={(bm) => update({ market: { ...(room.market || EMPTY_MARKET), businessModel: bm } })}
              />
            </TabsContent>

            {/* TEAM */}
            <TabsContent value="team" className="space-y-4">
              <TeamEditor value={room.team} onChange={(members) => update({ team: members })} />
            </TabsContent>

            {/* DETAILS */}
            <TabsContent value="details" className="space-y-4">
              {/* Featured deck — the PDF investors see first at /investors.
                  "Update Document" replaces it (the old version is archived). */}
              <div className="relative rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] overflow-hidden">
                <button
                  onClick={() => setDocModal({ open: true, existing: deck, deck: true })}
                  className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#191f1d]/85 hover:bg-[#191f1d] text-white text-sm font-medium backdrop-blur transition-colors"
                >
                  <UploadCloud className="w-4 h-4" /> Update Document
                </button>
                {deck ? (
                  deckIsPdf ? (
                    <PdfDeckViewer url={deck.file_url} />
                  ) : (
                    <img src={deck.file_url} alt={deck.title} className="w-full max-h-[420px] object-contain bg-[#f5f7f9]" />
                  )
                ) : (
                  <button
                    onClick={() => setDocModal({ open: true, existing: null, deck: true })}
                    className="w-full h-64 flex flex-col items-center justify-center gap-2 text-[#99a1af] hover:bg-[#f5f6f8] transition-colors"
                  >
                    <UploadCloud className="w-10 h-10" />
                    <span className="text-sm font-medium text-[#7f8c85]">Upload your pitch deck</span>
                    <span className="text-xs">Shown at the top of the investor page</span>
                  </button>
                )}
              </div>

              <Card title="Deal Information" summary="The headline numbers an investor sees first: raise, stage, and your key stats.">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditableLabelField value={(room.field_labels as any)?.round ?? ''} fallback="Round" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), round: v } } as any)}><input value={room.round} onChange={e => update({ round: e.target.value })} className={inputCls} placeholder="Seed" /></EditableLabelField>
                  <EditableLabelField value={(room.field_labels as any)?.raise_amount ?? ''} fallback="Raise Amount" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), raise_amount: v } } as any)}><input value={room.raise_amount} onChange={e => update({ raise_amount: e.target.value })} className={inputCls} placeholder="$750K" /></EditableLabelField>
                  {(() => {
                    const slots: StatSlot[] = Array.isArray((room as any).stat_slots) && (room as any).stat_slots.length === 2
                      ? (room as any).stat_slots
                      : DEFAULT_STAT_SLOTS;
                    const setSlot = (i: number, next: StatSlot) => {
                      const copy = [...slots];
                      copy[i] = next;
                      update({ stat_slots: copy } as any);
                    };
                    return (
                      <>
                        {[0, 1].map(i => (
                          <StatSlotField
                            key={i}
                            slot={slots[i]}
                            teamSize={room.team_size || 0}
                            headquarters={room.headquarters || ''}
                            committedLabel={`$${raised.toLocaleString()}`}
                            onSlot={(next) => setSlot(i, next)}
                            onTeamSize={(n) => update({ team_size: n })}
                          />
                        ))}
                      </>
                    );
                  })()}
                </div>
                <EditableLabelField value={(room.field_labels as any)?.one_liner ?? ''} fallback="Company One-Liner" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), one_liner: v } } as any)}><input value={room.one_liner} onChange={e => update({ one_liner: e.target.value })} className={inputCls} placeholder="The marketplace for court sports" /></EditableLabelField>
                <Field label="Tags (comma separated)"><input value={room.tags?.join(', ') || ''} onChange={e => update({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className={inputCls} placeholder="Marketplace, Sports, B2B2C" /></Field>
              </Card>

              <Card title="Company Summary" summary="The short paragraph that opens your deal room.">
                <RichTextEditor value={room.summary_html} onChange={(html) => update({ summary_html: html })} placeholder="Describe for public visitors…" />
              </Card>

              <Card title="Industries" summary="The sectors you operate in. Investors filter on these.">
                <IndustryEditor value={room.industries || []} onChange={ind => update({ industries: ind })} />
              </Card>

              <Card title="Meeting Calendar" summary="The times investors can book with you. They pick a slot from the deal room.">
                <ToggleRow label="Enable meeting calendar" checked={room.meeting_enabled} onChange={v => update({ meeting_enabled: v })} />
                {room.meeting_enabled && (() => {
                  const sch = room.availability as DealSchedule;
                  const activeDays = Object.entries(sch.weekly || {}).filter(([, r]) => (r as any[]).length > 0).map(([d]) => DAY_ABBR[Number(d)]);
                  return (
                    <div className="flex items-center justify-between rounded-xl bg-[#f5f6f8] px-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-[#191f1d]">{activeDays.length ? activeDays.join(', ') : 'No hours set'}</p>
                        <p className="text-xs text-[#7f8c85]">{sch.meetingLength || 30}-minute meetings{sch.overrides?.length ? ` · ${sch.overrides.length} date override${sch.overrides.length > 1 ? 's' : ''}` : ''}</p>
                      </div>
                      <Button onClick={() => setAvailOpen(true)} className="h-9 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]">Edit availability</Button>
                    </div>
                  );
                })()}
              </Card>
            </TabsContent>

            {/* DOCUMENTS */}
            <TabsContent value="documents">
              <Card
                title="Documents"
                summary="The deck, the model, the data room. Investors open these from the deal room."
                action={!selectMode && !reorderMode ? (
                  <AddButton label="Document" onClick={() => setDocModal({ open: true, existing: null })} />
                ) : null}
              >
                {(selectMode || reorderMode || docs.length > 0) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {selectMode ? (
                      <>
                        <span className="text-xs text-[#7f8c85]">{selectedDocs.size} selected</span>
                        <Button onClick={bulkDelete} disabled={selectedDocs.size === 0} className="h-9 rounded-xl bg-red-500 text-white hover:bg-red-600 disabled:opacity-40"><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
                        <Button onClick={exitSelect} className="h-9 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]">Cancel</Button>
                      </>
                    ) : reorderMode ? (
                      <>
                        <span className="text-xs text-[#7f8c85]">Drag the handle to reorder</span>
                        <Button onClick={() => setReorderMode(false)} className="h-9 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]"><Check className="w-4 h-4 mr-1" /> Done</Button>
                      </>
                    ) : (
                      <>
                        {docs.length > 1 && <Button onClick={() => { exitSelect(); setReorderMode(true); }} className="h-9 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]"><GripVertical className="w-4 h-4 mr-1" /> Reorder</Button>}
                        {docs.length > 0 && <Button onClick={() => setSelectMode(true)} className="h-9 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]">Select</Button>}
                      </>
                    )}
                  </div>
                )}
                {docs.length === 0 ? (
                  <div className="text-center py-10 text-[#99a1af]"><FileText className="w-10 h-10 mx-auto mb-2 opacity-50" /><p className="text-sm">No documents yet. Add your pitch deck to get started.</p></div>
                ) : (
                  <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                    {docs.map(d => reorderMode ? (
                      <div
                        key={d.id}
                        data-doc-card={d.id}
                        style={{ touchAction: 'none' }}
                        className={`relative rounded-2xl transition ${dragId === d.id ? 'opacity-40 scale-[0.98]' : ''} ${overId === d.id && dragId !== d.id ? 'ring-2 ring-[var(--ds-brand)]' : ''}`}
                      >
                        <button
                          type="button"
                          onPointerDown={startReorder(d.id)}
                          aria-label="Drag to reorder"
                          style={{ touchAction: 'none' }}
                          className="absolute top-2 left-2 z-30 w-8 h-8 rounded-lg bg-white/95 backdrop-blur border border-[#edf0f3] shadow-[0_2px_8px_rgba(0,0,0,0.12)] flex items-center justify-center text-[#7f8c85] cursor-grab active:cursor-grabbing"
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <div className="pointer-events-none">
                          <DealDocumentCard doc={d} admin stat={docStats[d.id]} onOpen={() => {}} onEdit={() => {}} onDelete={() => {}} />
                        </div>
                      </div>
                    ) : (
                      <DealDocumentCard
                        key={d.id}
                        doc={d}
                        admin
                        selectMode={selectMode}
                        selected={selectedDocs.has(d.id)}
                        onToggleSelect={toggleSelect}
                        stat={docStats[d.id]}
                        onOpen={() => setDocView(d)}
                        onEdit={ex => setDocModal({ open: true, existing: ex })}
                        onDelete={deleteDoc}
                      />
                    ))}
                  </div>
                )}
              </Card>
            </TabsContent>

            {/* DEAL FLOW */}
            {/* One card, and only one. The old pipeline card listed the same
                investors a second time on the pre-0036 stage vocabulary, which
                the database no longer accepts, so half its buttons wrote a value
                that failed the check constraint. Everything it did lives in the
                table now. */}
            <TabsContent value="dealflow" className="space-y-5">
              <DealPeople
                dealId={room.id}
                slug={room.slug}
                handle={org?.handle ?? null}
                docs={docs}
                onChanged={() => reloadVisitors(room.id)}
              />
            </TabsContent>

            {/* SETTINGS */}
            <TabsContent value="settings" className="space-y-4">

              <Card
                title="Deal name"
                summary="What this deal is called across your console. Investors see it at the top of the room."
              >
                <Field label="Deal name">
                  <input
                    value={room.company_name || ''}
                    onChange={(e) => update({ company_name: e.target.value })}
                    placeholder="Series A"
                    className={inputCls}
                  />
                </Field>

                {/* The link is deliberately NOT derived from the name after creation.
                    Investors are already holding /d/{slug}, the gate looks them up by
                    slug, and their saved access grant is keyed on it. Re-slugging on a
                    rename would 404 every link already in an inbox and silently log
                    those investors out. So the name is yours to change; the link is
                    frozen. */}
                <div className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
                  <p className="flex items-start gap-2 text-xs text-[#7f8c85]">
                    <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      Renaming does not change the share link. It stays{' '}
                      <span className="font-mono text-[#191f1d]">/d/{room.slug}</span>, so
                      links you have already sent keep working.
                    </span>
                  </p>
                </div>
              </Card>

              {/* Mobile only: display order is a setting, so on a phone it sits
                  with the other settings rather than in a rail that is not there. */}
              <div className="lg:hidden">{displayOrderPanel}</div>

              <DealThemeEditor
                value={{
                  brand_from: (room as any).brand_from ?? null,
                  brand_to: (room as any).brand_to ?? null,
                  brand_accent: (room as any).brand_accent ?? null,
                  accent_to: (room as any).accent_to ?? null,
                }}
                orgFallback={{
                  brand_from: org?.brand_from ?? null,
                  brand_to: org?.brand_to ?? null,
                  brand_accent: org?.brand_accent ?? null,
                  accent_to: org?.accent_to ?? null,
                }}
                onChange={(patch) => update(patch as any)}
              />
              <Card title="Requirements" summary="What an investor must provide before they can open the room.">
                <ToggleRow label="Require email" checked={room.require_email} onChange={v => update({ require_email: v })} />
                <ToggleRow label="Require password" checked={room.require_password} onChange={v => update({ require_password: v })} />
                <ToggleRow label="Invite only (only approved emails)" checked={room.invite_only} onChange={v => update({ invite_only: v })} />
              </Card>

              <Card title="Sharing" summary="Who can reach this deal room, and what they need to get in.">
                <ToggleRow label="Anyone with the link (skip approval)" checked={room.anyone_with_link} onChange={v => update({ anyone_with_link: v })} />
                <ToggleRow label="Investors can share the link" checked={room.allow_share} onChange={v => update({ allow_share: v })} />
                <div className="mt-3">
                  <p className="text-xs font-semibold text-[#191f1d] mb-1">Standard link</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={publicUrl()} className={`${inputCls} flex-1`} />
                    <button onClick={copyLink} className="h-11 px-3 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:brightness-110 flex items-center gap-1.5 text-sm">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-[#191f1d] mb-1">Share link (no password)</p>
                  <p className="text-xs text-[#7f8c85] mb-1.5">Investors skip the password but still enter their email, so you keep their analytics.</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={`${publicUrl()}?share=1`} className={`${inputCls} flex-1`} />
                    <button onClick={copyShareLink} className="h-11 px-3 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)] flex items-center gap-1.5 text-sm">{shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{shareCopied ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
              </Card>
              <Card title="Shared room password" summary="One password for everyone you send the link to.">
                <p className="text-xs text-[#7f8c85] mb-2">
                  Optional single password any investor can use, alongside per-investor approvals.
                </p>

                <div className={`flex items-center gap-2 mb-2 text-xs font-medium ${room.shared_password_hash ? 'text-[var(--ds-accent-ink)]' : 'text-[#99a1af]'}`}>
                  {room.shared_password_hash ? <><Check className="w-4 h-4" /> Password is set</> : 'No password set'}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      value={pwTouched ? sharedPw : ((room as any).shared_password_plain ?? '')}
                      onChange={e => { setPwTouched(true); setSharedPw(e.target.value); }}
                      onFocus={() => { if (!pwTouched) { setSharedPw((room as any).shared_password_plain ?? ''); setPwTouched(true); } }}
                      type={pwShown ? 'text' : 'password'}
                      placeholder="Leave blank to clear"
                      className={`${inputCls} w-full pr-20`}
                    />

                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => setPwShown(v => !v)}
                        aria-label={pwShown ? 'Hide password' : 'Show password'}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-[#191f1d] hover:bg-[#f5f6f8]"
                      >
                        {pwShown ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>

                      {/* The point of a shared password is handing it to someone,
                          so copying it should not mean selecting it by hand. */}
                      <button
                        type="button"
                        onClick={() => {
                          const pw = pwTouched ? sharedPw : ((room as any).shared_password_plain ?? '');
                          if (!pw) return;
                          void navigator.clipboard.writeText(pw);
                          toast.success('Password copied');
                        }}
                        aria-label="Copy password"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-[#191f1d] hover:bg-[#f5f6f8]"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <Button onClick={setShared} className="h-11 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]">
                    Set
                  </Button>
                </div>
              </Card>
              <Card title="Status" summary="Live rooms are reachable by anyone with the link. Drafts are not.">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#191f1d]">DealStudio is <span className={room.is_active ? 'text-[var(--ds-brand)] font-semibold' : 'text-[#99a1af] font-semibold'}>{room.is_active ? 'active' : 'inactive'}</span></p>
                  <Switch checked={room.is_active} onCheckedChange={toggleActive} />
                </div>
              </Card>

              {/* Danger zone, last on the page. Deleting a deal room takes its
                  documents, its analytics and its investor list with it, so it
                  sits at the very bottom, behind a word you have to type. */}
              <div className="rounded-2xl border border-red-100 bg-red-50/40 p-5">
                <p className="font-bold text-[#191f1d]">Delete this deal</p>
                <p className="text-sm text-[#7f8c85] mt-1">
                  Removes the room, its documents, its analytics and its investor
                  list. Investors holding the link will see a not-found page.
                  This cannot be undone.
                </p>
                <button
                  onClick={() => setDeleting(true)}
                  className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" /> Delete deal
                </button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Mobile only. Desktop shows these in the right rail beside every tab.
              They used to be injected into the Deal Flow tab on a phone, which is
              the one tab that is now a single table, so they sit below the tab
              content instead. Same panels, rendered once, not copies. */}
          <div className="lg:hidden space-y-5 mt-5">
            {funnelPanel}
            {calendarPanel}
          </div>
        </div>

        {/* Right rail */}
        {/* Right rail. On mobile these three panels move into the tabs they
            belong to, so a phone is not asked to scroll past a funnel chart to
            reach the fields it came for. Same panels, rendered once, not copies. */}
        <div className="hidden lg:block space-y-5 lg:sticky lg:top-6">
          {funnelPanel}
          {displayOrderPanel}
          {calendarPanel}
        </div>
      </div>

      {docModal.open && (
        <DealDocumentModal roomId={room.id} existing={docModal.existing} defaultIsDeck={docModal.deck} onClose={() => setDocModal({ open: false, existing: null })} onSaved={() => reloadDocs(room.id)} />
      )}

      {availOpen && (
        <AvailabilityModal
          value={room.availability as DealSchedule}
          onClose={() => setAvailOpen(false)}
          onSave={(sch) => update({ availability: sch })}
        />
      )}

      {docView && <DealDocViewer doc={docView} onClose={() => setDocView(null)} />}
      {siteOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/60" onClick={() => setSiteOpen(false)}>
          <div className="mx-auto mt-6 flex h-[calc(100vh-3rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#edf0f3] px-4 py-2.5">
              <div className="inline-flex items-center gap-2 text-sm font-medium text-[#191f1d]"><Globe className="w-4 h-4 text-[var(--ds-brand)]" /> dealstudio.io</div>
              <div className="flex items-center gap-1">
                <a href="https://dealstudio.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-[var(--ds-brand)] hover:bg-[var(--ds-tint)]"><ExternalLink className="w-3.5 h-3.5" /> Open</a>
                <button onClick={() => setSiteOpen(false)} className="rounded-lg p-2 text-[#7f8c85] hover:bg-[#f5f7f9]" aria-label="Close preview"><X className="w-4 h-4" /></button>
              </div>
            </div>
            <iframe src="https://dealstudio.io" title="DealStudio site preview" className="flex-1 w-full border-0" />
          </div>
        </div>
      )}

      {/* New deal. Branding is pre-filled with the company's current colours so a
          new room looks like the company from the first render. */}
      {newDeal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setNewDeal(false)} />
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="w-full max-w-md mt-20 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_24px_60px_-16px_rgba(12,16,34,0.35)]">
              <div className="flex items-center gap-3 p-5 border-b border-[#edf0f3]">
                <h2 className="font-bold text-[#191f1d]">New deal</h2>
                <button
                  onClick={() => setNewDeal(false)}
                  aria-label="Close"
                  className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[#9ca3af] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1.5">
                  Deal name
                </label>
                <input
                  value={ndName}
                  onChange={(e) => setNdName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && ndName.trim()) void createNewDeal(); }}
                  placeholder="Series A"
                  autoFocus
                  className="w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                />

                <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85]">
                  Deal branding
                </p>
                <p className="text-xs text-[#9ca3af] mt-0.5 mb-3">
                  Starts from your company colours. You can change it later.
                </p>

                <div className="grid grid-cols-3 gap-3">
                  {([
                    ['Brand from', ndFrom, setNdFrom],
                    ['Brand to',   ndTo,   setNdTo],
                    ['Accent',     ndAccent, setNdAccent],
                  ] as const).map(([lab, val, set]) => (
                    <div key={lab}>
                      <label className="block text-[11px] text-[#7f8c85] mb-1">{lab}</label>
                      <div className="flex items-center gap-1.5 rounded-xl bg-[#f5f6f8] px-2 py-1.5">
                        <input
                          type="color"
                          value={val || '#0030CD'}
                          onChange={(e) => set(e.target.value)}
                          className="w-7 h-7 rounded-md border-0 bg-transparent cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-mono text-[#7f8c85] truncate">{val}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {ndErr && <p className="mt-4 text-sm text-red-600">{ndErr}</p>}

                <button
                  onClick={() => void createNewDeal()}
                  disabled={!ndName.trim() || ndBusy}
                  className="mt-5 w-full inline-flex items-center justify-center gap-1.5 h-11 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-50"
                >
                  {ndBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Create deal
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {deleting && room && (
        <DeleteDealDialog
          deal={{ id: room.id, slug: room.slug, company_name: room.company_name } as OrgDeal}
          onClose={() => setDeleting(false)}
          onDeleted={() => { setDeleting(false); nav('/admin'); }}
        />
      )}
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────

const inputCls = 'w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40';

/**
 * Every Deal Studio tab is a Card. Giving it the summary line here is what makes
 * the tabs uniform: each one now has a title, a line saying what the section is
 * for, and its action on the right -- the shape the Business Model page already
 * had and the others had each invented separately.
 *
 * The type scale matches the View List container exactly: bold 14px title, 12px
 * muted summary.
 */
function Card({ title, summary, action, children }: {
  title: string;
  /** One line on what this section is for. If it needs two, the section is doing too much. */
  summary?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#191f1d]">{title}</h3>
          {summary && <p className="text-xs text-[#7f8c85] mt-0.5">{summary}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** The add button every tab uses, so "+ Document" and "+ Add member" cannot end
 *  up as two different-looking controls. */
function AddButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 transition disabled:opacity-50"
    >
      <Plus className="w-4 h-4" /> {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-semibold text-[#7f8c85] mb-1">{label}</span>{children}</label>;
}

// Like Field, but the label itself is an editable input. Empty falls back to the
// default (shown as placeholder) and the investor page uses that same override.
function EditableLabelField({ value, fallback, onChange, children }: { value: string; fallback: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <input
        value={value}
        placeholder={fallback}
        onChange={e => onChange(e.target.value)}
        aria-label={`${fallback} label`}
        title="Rename this label"
        className="block w-full mb-1 bg-transparent text-xs font-semibold text-[#7f8c85] placeholder:text-[#7f8c85] rounded px-1 -ml-1 outline-none transition-colors hover:bg-[var(--ds-tint)] focus:bg-[var(--ds-tint)] focus:text-[var(--ds-brand)]"
      />
      {children}
    </label>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[#f5f6f8] px-3 py-2.5">
      <span className="text-sm text-[#191f1d]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function IndustryEditor({ value, onChange }: { value: DealIndustry[]; onChange: (v: DealIndustry[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((ind, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={ind.name} onChange={e => onChange(value.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Industry name" className={`${inputCls} flex-1`} />
          <input value={ind.description} onChange={e => onChange(value.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="Description" className={`${inputCls} flex-1`} />
          <button onClick={() => onChange(value.filter((_, j) => j !== i))} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"><Trash2 className="w-4 h-4" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...value, { name: '', description: '' }])} className="text-sm text-[var(--ds-brand)] hover:underline">+ Add another industry</button>

    </div>
  );
}
