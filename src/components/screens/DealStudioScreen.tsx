/**
 * DealStudioScreen — Master Admin > DealStudio.
 * Manages the public /investors deal studio: details, documents (with archive),
 * visitors/approvals, and settings + activate/deactivate. Follows the canonical
 * admin page pattern (gradient icon header, auto-save pill, gray canvas, Radix
 * tabs, white cards, max-w-6xl).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Presentation, Plus, ExternalLink, Copy, Check, Power, Users, FileText, Trash2, RefreshCw, UploadCloud, GripVertical, Globe, X, LogOut,
} from 'lucide-react';
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
import { useAdminAuth } from '../dealstudio/AdminGate';
import dsMark from '../../assets/dealstudio-mark.png';
import { DealDocViewer } from '../dealstudio/DealDocViewer';
import { DealFlow } from '../dealstudio/DealFlow';
import { MarketEditor } from '../dealstudio/MarketEditor';
import { TeamEditor } from '../dealstudio/TeamEditor';
import { BusinessModelEditor } from '../dealstudio/BusinessModelEditor';
import {
  DealStudio, DealDocument, DealAccessRow, DealVisitRow, DealFunnel, DealIndustry, DealSchedule, DocStat,
  adminFetchDealStudio, adminSaveDealStudio, adminSetActive, adminSetSharedPassword,
  adminFetchDocuments, adminDeleteDocument, adminDeleteDocuments, adminReorderDocuments, adminFetchAccess,
  adminFetchVisits, adminFetchFunnel, adminFetchDocStats,
  scheduleDates, committedTotal, EMPTY_MARKET,
} from '../../lib/dealStudio';

const PUBLIC_URL = 'https://www.dealstudio.io/dealstudio';
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">{label}</p>
      <p className="text-2xl font-bold text-[#191f1d] mt-2">{value}</p>
    </div>
  );
}

export function DealStudioScreen() {
  const [room, setRoom] = useState<DealStudio | null>(null);
  const [docs, setDocs] = useState<DealDocument[]>([]);
  const [access, setAccess] = useState<DealAccessRow[]>([]);
  const [visits, setVisits] = useState<DealVisitRow[]>([]);
  const [funnel, setFunnel] = useState<DealFunnel | null>(null);
  const [tab, setTab] = useState('details');
  const [savedAt, setSavedAt] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [docModal, setDocModal] = useState<{ open: boolean; existing: DealDocument | null; deck?: boolean }>({ open: false, existing: null });
  const [sharedPw, setSharedPw] = useState('');
  // Whether the user has engaged the shared-password field this session. Until
  // they do, a field with an existing password shows a masked placeholder and
  // the Set button leaves it unchanged, so it can't be wiped by accident.
  const [pwTouched, setPwTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [docStats, setDocStats] = useState<Record<string, DocStat>>({});
  const [availOpen, setAvailOpen] = useState(false);
  const [docView, setDocView] = useState<DealDocument | null>(null);
  const { signOut } = useAdminAuth();
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
    setVisits(await adminFetchVisits(roomId));
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
      const r = await adminFetchDealStudio('investors');
      setRoom(r);
      if (r) { await reloadDocs(r.id); await reloadVisitors(r.id); }
    })();
  }, []);

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

  const copyLink = () => { navigator.clipboard?.writeText(PUBLIC_URL); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const copyShareLink = () => { navigator.clipboard?.writeText(`${PUBLIC_URL}?share=1`); setShareCopied(true); setTimeout(() => setShareCopied(false), 1500); };

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
      setRoom(prev => prev ? { ...prev, shared_password_hash: sharedPw ? 'set' : null } : prev);
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

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <img src={dsMark} alt="" className="w-11 h-11 rounded-xl shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-[#191f1d] leading-tight truncate">DealStudio</h1>
            <p className="text-sm text-[#7f8c85]">Master Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0">
          {savedAt && <span className="hidden sm:inline-flex items-center h-9 text-xs font-medium px-2.5 rounded-xl bg-[var(--ds-tint)] text-[var(--ds-brand)]">{saving ? 'Saving…' : `Saved ${savedAt}`}</span>}
          <a href="/dealstudio" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm text-[#191f1d] hover:bg-[#f5f7f9]"><ExternalLink className="w-4 h-4" /> View</a>
          <button onClick={toggleActive} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-medium ${room.is_active ? 'bg-[var(--ds-tint)] text-[var(--ds-brand)]' : 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'}`}>
            <Power className="w-4 h-4" /> {room.is_active ? 'Active' : 'Activate'}
          </button>
          <button onClick={() => void signOut()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm text-[#7f8c85] hover:text-[#191f1d] hover:bg-[#f5f7f9]">
            <LogOut className="w-4 h-4" /> Sign out
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
            <div className="mb-4 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsList className="bg-[#f5f7f9] border border-[#edf0f3] rounded-2xl p-1 gap-1 inline-flex">
                {([['details', 'Details'], ['documents', 'Documents'], ['market', 'Market'], ['businessmodel', 'Business Model'], ['team', 'Team'], ['dealflow', 'Deal Flow'], ['settings', 'Settings']] as const).map(([t, label]) => (
                  <TabsTrigger key={t} value={t} className="shrink-0 whitespace-nowrap rounded-xl px-4 py-1.5 text-sm font-medium data-[state=active]:bg-[var(--ds-brand)] data-[state=active]:text-white text-[#7f8c85]">{label}</TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* MARKET */}
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
              <div className="relative rounded-2xl border border-[#edf0f3] bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] overflow-hidden">
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

              <Card title="Deal Information">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditableLabelField value={(room.field_labels as any)?.round ?? ''} fallback="Round" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), round: v } } as any)}><input value={room.round} onChange={e => update({ round: e.target.value })} className={inputCls} placeholder="Seed" /></EditableLabelField>
                  <EditableLabelField value={(room.field_labels as any)?.raise_amount ?? ''} fallback="Raise Amount" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), raise_amount: v } } as any)}><input value={room.raise_amount} onChange={e => update({ raise_amount: e.target.value })} className={inputCls} placeholder="$750K" /></EditableLabelField>
                  <EditableLabelField value={(room.field_labels as any)?.team_size ?? ''} fallback="Team Size" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), team_size: v } } as any)}><input type="number" value={room.team_size || ''} onChange={e => update({ team_size: parseInt(e.target.value) || 0 })} className={inputCls} placeholder="4" /></EditableLabelField>
                  <EditableLabelField value={(room.field_labels as any)?.headquarters ?? ''} fallback="Headquarters" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), headquarters: v } } as any)}><input value={room.headquarters} onChange={e => update({ headquarters: e.target.value })} className={inputCls} placeholder="Kansas City, MO" /></EditableLabelField>
                </div>
                <EditableLabelField value={(room.field_labels as any)?.one_liner ?? ''} fallback="Company One-Liner" onChange={v => update({ field_labels: { ...((room.field_labels as any) || {}), one_liner: v } } as any)}><input value={room.one_liner} onChange={e => update({ one_liner: e.target.value })} className={inputCls} placeholder="The marketplace for court sports" /></EditableLabelField>
                <Field label="Tags (comma separated)"><input value={room.tags?.join(', ') || ''} onChange={e => update({ tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className={inputCls} placeholder="Marketplace, Sports, B2B2C" /></Field>
              </Card>

              <Card title="Company Summary">
                <RichTextEditor value={room.summary_html} onChange={(html) => update({ summary_html: html })} placeholder="Describe for public visitors…" />
              </Card>

              <Card title="Industries">
                <IndustryEditor value={room.industries || []} onChange={ind => update({ industries: ind })} />
              </Card>

              <Card title="Meeting Calendar">
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
                action={!selectMode && !reorderMode ? (
                  <button onClick={() => setDocModal({ open: true, existing: null })} aria-label="Add documents"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white shadow-sm hover:opacity-90">
                    <Plus className="w-5 h-5" />
                  </button>
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
            <TabsContent value="dealflow">
              <DealFlow roomId={room.id} rows={access} visits={visits} docs={docs} onChanged={() => reloadVisitors(room.id)} />
            </TabsContent>

            {/* SETTINGS */}
            <TabsContent value="settings" className="space-y-4">
              <Card title="Requirements">
                <ToggleRow label="Require email" checked={room.require_email} onChange={v => update({ require_email: v })} />
                <ToggleRow label="Require password" checked={room.require_password} onChange={v => update({ require_password: v })} />
                <ToggleRow label="Invite only (only approved emails)" checked={room.invite_only} onChange={v => update({ invite_only: v })} />
              </Card>

              <Card title="Sharing">
                <ToggleRow label="Anyone with the link (skip approval)" checked={room.anyone_with_link} onChange={v => update({ anyone_with_link: v })} />
                <ToggleRow label="Investors can share the link" checked={room.allow_share} onChange={v => update({ allow_share: v })} />
                <div className="mt-3">
                  <p className="text-xs font-semibold text-[#191f1d] mb-1">Standard link</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={PUBLIC_URL} className={`${inputCls} flex-1`} />
                    <button onClick={copyLink} className="h-11 px-3 rounded-xl bg-[#f5f7f9] hover:bg-[#edf0f3] text-[#191f1d] flex items-center gap-1.5 text-sm">{copied ? <Check className="w-4 h-4 text-[var(--ds-brand)]" /> : <Copy className="w-4 h-4" />}{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-xs font-semibold text-[#191f1d] mb-1">Share link (no password)</p>
                  <p className="text-xs text-[#7f8c85] mb-1.5">Investors skip the password but still enter their email, so you keep their analytics.</p>
                  <div className="flex items-center gap-2">
                    <input readOnly value={`${PUBLIC_URL}?share=1`} className={`${inputCls} flex-1`} />
                    <button onClick={copyShareLink} className="h-11 px-3 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)] flex items-center gap-1.5 text-sm">{shareCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{shareCopied ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
              </Card>
              <Card title="Shared room password">
                <p className="text-xs text-[#7f8c85] mb-2">Optional single password any investor can use (in addition to per-investor approvals). Stored hashed.</p>
                <div className={`flex items-center gap-2 mb-2 text-xs font-medium ${room.shared_password_hash ? 'text-[var(--ds-brand)]' : 'text-[#99a1af]'}`}>
                  {room.shared_password_hash ? <><Check className="w-4 h-4" /> Password is set</> : 'No password set'}
                </div>
                <div className="flex items-center gap-2">
                  {(() => {
                    const masked = !!room.shared_password_hash && !pwTouched;
                    return (
                      <input
                        value={masked ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : sharedPw}
                        onChange={e => setSharedPw(e.target.value)}
                        onFocus={() => { if (masked) setPwTouched(true); }}
                        readOnly={masked}
                        type="text"
                        placeholder={room.shared_password_hash ? 'Enter a new password (or leave blank to clear)' : 'Leave blank to clear'}
                        className={`${inputCls} flex-1`}
                      />
                    );
                  })()}
                  <Button onClick={setShared} className="h-11 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]">Set</Button>
                </div>
              </Card>
              <Card title="Status">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[#191f1d]">DealStudio is <span className={room.is_active ? 'text-[var(--ds-brand)] font-semibold' : 'text-[#99a1af] font-semibold'}>{room.is_active ? 'active' : 'inactive'}</span></p>
                  <Switch checked={room.is_active} onCheckedChange={toggleActive} />
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right rail */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-[#191f1d] flex items-center gap-2"><Users className="w-4 h-4 text-[var(--ds-brand)]" /> Investor Funnel</p>
              <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">Conv {funnel?.conversion ?? 0}%</span>
            </div>
            {(() => {
              const v = funnel?.totalVisitors ?? 0;
              if (v === 0) return <p className="text-sm text-[#99a1af] py-1">No activity yet.</p>;
              const stages = [
                { label: 'Visitors', value: v },
                { label: 'Viewed deck', value: funnel?.deckViews ?? 0 },
                { label: 'Repeat visits', value: funnel?.repeatVisits ?? 0 },
              ];
              const top = Math.max(1, ...stages.map(s => s.value));
              return stages.map((s, i) => {
                const widthPct = Math.round((s.value / top) * 100);
                const ofTop = v ? Math.round((s.value / v) * 100) : 0;
                return (
                  <div key={s.label} className="mb-3">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-[#7f8c85]">{s.label}</span>
                      <span className="font-semibold text-[#191f1d]">{s.value}{i > 0 && <span className="text-[#99a1af] font-normal ml-1">({ofTop}%)</span>}</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[var(--ds-tint)] overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]" style={{ width: `${Math.max(4, widthPct)}%` }} /></div>
                  </div>
                );
              });
            })()}
          </div>

          <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] mb-2">Deal Calendar</p>
            <EventsCalendar events={availabilityEvents} selectedDate={null} onSelectDate={() => {}} currentMonth={calMonth} onChangeMonth={setCalMonth} />
            <button onClick={() => setAvailOpen(true)} className="w-full h-10 mt-2 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-sm font-semibold flex items-center justify-center gap-1.5"><RefreshCw className="w-4 h-4" /> Edit availability</button>
          </div>
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
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────

const inputCls = 'w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40';

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-center justify-between gap-3 mb-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><h3 className="shrink-0 text-sm font-bold text-[#191f1d]">{title}</h3>{action && <div className="shrink-0">{action}</div>}</div>
      <div className="space-y-3">{children}</div>
    </div>
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
