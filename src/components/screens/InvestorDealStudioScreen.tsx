/**
 * InvestorDealStudioScreen — public, gated deal studio at /investors.
 * Logged-out surface: all reads use the anon RPC layer in dealStudio.ts.
 * Tracks page view, deck views, document opens, and per-section dwell time
 * (DocSend-style) and rolls it up into dealstudio_visits on unload.
 */

import { useParams } from 'react-router-dom';
import { PublicHeader } from '../dealstudio/PublicHeader';
import { applyDealTheme, resolveDealSlug } from '../../lib/org';
import { trackInviteOpen, fetchCommittedTotal } from '../../lib/dealStudio';
import { getOrCreateSessionToken } from '../../lib/analytics';
import { statSlotValue } from '../dealstudio/StatSlotField';
import { DEFAULT_STAT_SLOTS, resolveSectionOrder, scheduleSlots, type StatSlot, type SectionKey } from '../../lib/dealStudio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInViewOnce } from '../../lib/useInViewOnce';
import { MapPin, Calendar as CalIcon, Share2, Check, LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import { EventsCalendar } from '../EventsCalendar';
import { DealDocumentCard } from '../dealstudio/DealDocumentCard';
import { InvestorGate } from '../dealstudio/InvestorGate';
import { PdfDeckViewer } from '../dealstudio/PdfDeckViewer';
import { DealDocViewer } from '../dealstudio/DealDocViewer';
import { RequestMeetingModal } from '../dealstudio/RequestMeetingModal';
import { RichTextRenderer } from '../RichTextEditor';
import { MarketSection, IndustryReadingSection } from '../dealstudio/MarketSection';
import { ValuePropSection, ProblemSolutionSection, CompetitionSection } from '../dealstudio/ValuePropSection';
import { TeamSection } from '../dealstudio/TeamSection';
import { BusinessModelSection } from '../dealstudio/BusinessModelSection';
import {
  DealStudioPublic, DealDocument, DealSchedule, DealMarket, DealTeamMember, DealValueProp, DealCompetition, fetchDealStudioPublic, fetchDealExtras, trackDealView, recordDealVisit, fetchDealFieldLabels,
  adminFetchDealStudio, adminFetchDocuments, scheduleDates,
} from '../../lib/dealStudio';
import { toast } from 'sonner@2.0.3';

// DB slug for the room (independent of the public URL path, which is /dealstudio).
const DEFAULT_SLUG = 'investors';

// Remember a granted session on this device so a refresh doesn't re-prompt the
// gate. The gate is a soft wall (the public RPC already returns the room), so
// persisting a flag here is purely for the investor's convenience.

const ACCESS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const accessKey = (slug: string) => `dealstudio_access_${slug}`;
function readPersistedAccess(slug: string): boolean {
  try {
    const raw = localStorage.getItem(accessKey(slug));
    if (!raw) return false;
    const at = JSON.parse(raw)?.at;
    if (typeof at !== 'number') return false;
    if (Date.now() - at > ACCESS_TTL_MS) { localStorage.removeItem(accessKey(slug)); return false; }
    return true;
  } catch { return false; }
}
function writePersistedAccess(slug: string) {
  try { localStorage.setItem(accessKey(slug), JSON.stringify({ at: Date.now() })); } catch { /* noop */ }
}

/** Split rich-text HTML after the Nth <p>, returning a preview + whether more exists. */
function splitHtmlParagraphs(html: string, maxParas: number): { preview: string; hasMore: boolean } {
  if (!html || typeof window === 'undefined') return { preview: html, hasMore: false };
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nodes = Array.from(doc.body.childNodes);
    let pCount = 0;
    const kept: Node[] = [];
    for (const node of nodes) {
      kept.push(node);
      if (node.nodeType === 1 && (node as Element).tagName === 'P') {
        pCount++;
        if (pCount >= maxParas) break;
      }
    }
    const hasMore = kept.length < nodes.length;
    if (!hasMore) return { preview: html, hasMore: false };
    const div = doc.createElement('div');
    kept.forEach(n => div.appendChild(n.cloneNode(true)));
    return { preview: div.innerHTML, hasMore: true };
  } catch {
    return { preview: html, hasMore: false };
  }
}

export function InvestorDealStudioScreen({ isMasterAdmin = false }: { isMasterAdmin?: boolean }) {
  // Three shapes reach this screen:
  //   /{handle}/{deck}  the canonical URL
  //   /d/{slug}         the legacy link investors may already be holding
  //   /investors        the demo alias
  // The handle route needs a lookup before we know the slug, so the slug is
  // state rather than a straight read of the params.
  const { slug: routeSlug, handle: routeHandle, deck: routeDeck } =
    useParams<{ slug?: string; handle?: string; deck?: string }>();

  const [resolvedSlug, setResolvedSlug] = useState<string | null>(
    routeHandle && routeDeck ? null : (routeSlug || DEFAULT_SLUG)
  );
  const [slugMissing, setSlugMissing] = useState(false);

  useEffect(() => {
    if (!routeHandle || !routeDeck) {
      setResolvedSlug(routeSlug || DEFAULT_SLUG);
      return;
    }
    let cancelled = false;
    void (async () => {
      const s = await resolveDealSlug(routeHandle, routeDeck);
      if (cancelled) return;
      if (s) setResolvedSlug(s);
      else setSlugMissing(true);
    })();
    return () => { cancelled = true; };
  }, [routeHandle, routeDeck, routeSlug]);

  const SLUG = resolvedSlug ?? '';


  // The live committed total. Null unless the founder chose to show it.
  const [committed, setCommitted] = useState<number | null>(null);
  useEffect(() => {
    if (!SLUG) return;
    void (async () => setCommitted(await fetchCommittedTotal(SLUG)))();
  }, [SLUG]);

  // Opened via someone's personal link. Record which browser it was: the first
  // is presumed to be them, any others are people the link was forwarded to.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('i');
    if (!token) return;
    void trackInviteOpen(token, getOrCreateSessionToken());
  }, []);
  const docsView = useInViewOnce<HTMLDivElement>();
  const [room, setRoom] = useState<DealStudioPublic | null>(null);

  const [granted, setGranted] = useState(() => readPersistedAccess(SLUG));

  // On a /{handle}/{deck} URL the slug is not known on the first render, so the
  // initialiser above reads the storage key "dealstudio_access_" and gets false.
  // Without this, an investor holding a valid 30-day grant is re-prompted by the
  // gate on every single visit to a handle link.
  useEffect(() => {
    if (!SLUG) return;
    if (readPersistedAccess(SLUG)) setGranted(true);
  }, [SLUG]);

  /**
   * The sticky sidebar's height, measured rather than guessed.
   *
   * Every hard-coded version of this was wrong, and had to be: the panel's real
   * top depends on whether the draft banner is showing, and on whether you have
   * scrolled far enough for the header to be the only thing above it. A height of
   * calc(100vh - 92px) is correct in exactly one of those situations and hangs
   * off the bottom of the screen in the rest, taking the calendar with it.
   *
   * So: measure where the panel actually starts, and make it exactly as tall as
   * the space left below it. It ends at the bottom of the screen every time.
   */
  const sideRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sideRef.current;
    if (!el) return;

    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Below lg the rail is part of the normal page stack and keeps its
        // natural height.
        if (window.innerWidth < 1024) { el.style.height = ''; return; }

        const rect = el.getBoundingClientRect();
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

        // The app renders with body { zoom: 0.9 } (see index.css).
        //
        // That matters more than it looks. getBoundingClientRect returns VISUAL
        // pixels, which are scaled by the zoom. offsetHeight returns LAYOUT
        // pixels, which are not. And style.height sets LAYOUT pixels. Measuring in
        // one space and writing in the other is wrong by exactly the zoom factor,
        // so every height set here was 10 percent off.
        const visualScale = el.offsetHeight > 0 ? rect.height / el.offsetHeight : 1;
        const availableVisual = viewportHeight - rect.top - 16;
        const layoutHeight = availableVisual / (visualScale || 1);

        el.style.height = `${Math.max(280, layoutHeight)}px`;
      });
    };

    fit();
    window.addEventListener('scroll', fit, { passive: true });
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
    };

    // `granted` is the dependency that was missing, and it is the whole bug.
    //
    // A gated investor sees InvestorGate, which returns EARLY -- the rail is not
    // in the DOM. `room` loads while the gate is still up, the effect fires,
    // sideRef.current is null, it gives up. Access is then granted, the rail
    // mounts, but `room` has not changed, so the effect never runs again and no
    // height is ever set. Without a bounded height, overflow-y-auto has nothing
    // to scroll.
    //
    // There is deliberately no ResizeObserver here: it would be watching the same
    // element whose height this effect sets, which is a feedback loop. The height
    // depends on rect.top and the viewport, not on the content.
  }, [room, granted]);
  const [fieldLabels, setFieldLabels] = useState<Record<string, string>>({});
  const [market, setMarket] = useState<DealMarket | null>(null);
  const [team, setTeam] = useState<DealTeamMember[] | null>(null);
  const [valueProp, setValueProp] = useState<DealValueProp | null>(null);
  const [competition, setCompetition] = useState<DealCompetition | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(() => { try { return localStorage.getItem('dealstudio_email'); } catch { return null; } });
  const [activeDoc, setActiveDoc] = useState<DealDocument | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareDeal = () => {
    // Anchor to the deal's own slug rather than the current path. On the legacy
    // /dealstudio route the pathname carries no slug, so a copied link would
    // fall through to the default room instead of this one.
    // Share the URL they actually arrived on. This screen has no org, so it
    // cannot look the handle up -- but if they came in on a handle URL, that is
    // the link worth passing along.
    const base = routeHandle && routeDeck
      ? `${window.location.origin}/${routeHandle}/${routeDeck}`
      : `${window.location.origin}/d/${SLUG}`;
    const link = `${base}?share=1`;
    navigator.clipboard?.writeText(link);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 1800);
  };
  const [openIndustry, setOpenIndustry] = useState<number | null>(null);
  const [docsExpanded, setDocsExpanded] = useState(false);

  // dwell tracking
  const sectionsRef = useRef<Record<string, number>>({});
  const deckViewsRef = useRef(0);
  const startRef = useRef(Date.now());
  // Active (foreground) time accounting so a tab left open in the background
  // does not log hours or days of "viewing" time.
  const activeMsRef = useRef(0);
  const lastResumeRef = useRef(Date.now());
  const docOpenRef = useRef<{ id: string; at: number } | null>(null);

  useEffect(() => {
    // The slug is not known yet on a /{handle}/{deck} URL. Firing the fetch with
    // an empty slug would flash "not found" before the real room arrives.
    if (!SLUG) return;

    let alive = true;
    (async () => {
      if (isMasterAdmin) {
        // Authenticated path — returns the room even when inactive, for preview.
        const r = await adminFetchDealStudio(SLUG);
        if (!alive) return;
        if (r) { const d = await adminFetchDocuments(r.id); setRoom({ ...r, documents: d } as DealStudioPublic); setMarket((r as any).market ?? null); setTeam((r as any).team ?? null); setValueProp((r as any).value_prop ?? null); setCompetition((r as any).competition ?? null); setFieldLabels(((r as any).field_labels as Record<string, string>) || {}); }
        else setRoom(null);
      } else {
        const r = await fetchDealStudioPublic(SLUG);
        if (!alive) return;
        setRoom(r);
        // The room paints itself in the deal's colours, falling back to the
        // company's. Without this a customer's investor page showed our blue.
        applyDealTheme((r as any).theme);
        void fetchDealFieldLabels(SLUG).then(fl => { if (alive) setFieldLabels(fl); });
        const ex = await fetchDealExtras(SLUG);
        if (!alive) return;
        setMarket(ex.market);
        setValueProp(ex.valueProp);
        setCompetition(ex.competition);
        setTeam(ex.team);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [isMasterAdmin]);

  // Gate logic: master admins always skip it. Otherwise open only when the room
  // has an access requirement and we haven't been granted yet. A granted session
  // is remembered on the device (30 days) so a refresh doesn't re-prompt.
  // Share links (?share=1) let an investor in with just their email — no
  // password — while still capturing the email for analytics.
  const shareMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('share') === '1';
  const gateRequired = !isMasterAdmin && !!room && !granted && (shareMode || room.require_password || room.invite_only || room.require_email);
  const requirePassword = !shareMode && !!room && room.require_password;
  const gateRequireEmail = shareMode ? true : (!!room && room.require_email);

  // Section dwell observer (runs once content is shown).
  useEffect(() => {
    if (!room || gateRequired || isMasterAdmin) return;
    trackDealView(room.id, 'page_view', { email });
    // Register this visitor immediately (a fresh email should show up in the
    // visitor count on arrival, not only when they leave). flush() updates it later.
    void recordDealVisit(SLUG, email, {}, 0, 0, getOrCreateSessionToken());
    const deck = room.documents.find(d => d.is_deck);
    if (deck) { trackDealView(room.id, 'deck_view', { document_id: deck.id, title: deck.title }); deckViewsRef.current += 1; }
    startRef.current = Date.now();
    activeMsRef.current = 0;
    lastResumeRef.current = Date.now();
    // Pause the dwell clock whenever the tab is backgrounded, resume on return.
    const onVis = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        activeMsRef.current += now - lastResumeRef.current;
      } else {
        lastResumeRef.current = now;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const visible = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      const now = Date.now();
      entries.forEach((en) => {
        const key = (en.target as HTMLElement).dataset.section || '';
        if (!key) return;
        if (en.isIntersecting) {
          visible.set(key, now);
        } else if (visible.has(key)) {
          sectionsRef.current[key] = (sectionsRef.current[key] || 0) + (now - (visible.get(key) || now)) / 1000;
          visible.delete(key);
        }
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('[data-section]').forEach(el => io.observe(el));

    const flush = () => {
      const now = Date.now();
      visible.forEach((t, key) => { sectionsRef.current[key] = (sectionsRef.current[key] || 0) + (now - t) / 1000; });
      visible.clear();
      // Attribute the deck's on-screen dwell to the deck document for per-doc avg time.
      const deckSeconds = sectionsRef.current['deck'];
      if (deck && deckSeconds && deckSeconds > 0) trackDealView(room.id, 'document_view', { document_id: deck.id, seconds: Math.round(deckSeconds) });
      const total = Math.min(
        (activeMsRef.current + (document.visibilityState === 'visible' ? (now - lastResumeRef.current) : 0)) / 1000,
        3 * 60 * 60 // hard cap: no single session logs more than 3 hours
      );
      void recordDealVisit(SLUG, email, sectionsRef.current, total, deckViewsRef.current, getOrCreateSessionToken());
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { io.disconnect(); window.removeEventListener('beforeunload', flush); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', onHide); document.removeEventListener('visibilitychange', onVis); flush(); };
  }, [room, gateRequired, email, isMasterAdmin]);

  const availabilityEvents = useMemo(() => {
    if (!room?.availability) return [];
    return scheduleDates(room.availability as DealSchedule).map((d, i) => ({ id: `avail-${i}`, name: 'Available', date: d } as any));
  }, [room]);

  const openDoc = (doc: DealDocument) => {
    setActiveDoc(doc);
    if (room && !isMasterAdmin) trackDealView(room.id, doc.is_deck ? 'deck_view' : 'document_open', { document_id: doc.id, title: doc.title });
    if (doc.is_deck) deckViewsRef.current += 1;
    docOpenRef.current = { id: doc.id, at: Date.now() };
  };

  const closeDoc = () => {
    const open = docOpenRef.current;
    if (open && room && !isMasterAdmin) {
      const seconds = (Date.now() - open.at) / 1000;
      sectionsRef.current[`doc:${open.id}`] = (sectionsRef.current[`doc:${open.id}`] || 0) + seconds;
      trackDealView(room.id, 'document_view', { document_id: open.id, seconds: Math.round(seconds) });
    }
    docOpenRef.current = null;
    setActiveDoc(null);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center"><div className="w-8 h-8 border-2 border-[var(--ds-brand)] border-t-transparent rounded-full animate-spin" /></div>;
  }
  // A handle URL that matched no room. Distinct from "still loading", which
  // would otherwise spin forever on a typo'd link.
  if (slugMissing) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-[#191f1d]">Deal room not found</h1>
          <p className="text-sm text-[#7f8c85] mt-2">
            Check the link, or ask whoever shared it for a new one.
          </p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold text-[#191f1d]">DealStudio unavailable</h1>
          <p className="text-[#7f8c85] mt-2">This deal studio isn&rsquo;t active right now. Please check back later.</p>
        </div>
      </div>
    );
  }
  if (gateRequired) {
    // Demo mode: open to anyone, email only, with the mailing-list consent stated
    // plainly on the gate rather than buried in fine print.
    const isDemo = Boolean(room.demo_mode);
    return <InvestorGate
      slug={SLUG}
      companyName={room.company_name}
      requirePassword={isDemo ? false : requirePassword}
      requireEmail={isDemo ? true : gateRequireEmail}
      skipVerify={isDemo ? true : shareMode}
      demoNotice={isDemo ? room.demo_notice : undefined}
      heroImageUrl={room.hero_image_url}
      onGranted={(e) => { setEmail(e); setGranted(true); writePersistedAccess(SLUG); }}
    />;
  }

  const deck = room.documents.find(d => d.is_deck) || null;
  const lbl = (key: string, fallback: string) => (fieldLabels[key]?.trim() || fallback);
  // Round and Amount are fixed. The other two are whatever the founder chose.
  const slots: StatSlot[] =
    Array.isArray((room as any).stat_slots) && (room as any).stat_slots.length === 2
      ? (room as any).stat_slots
      : DEFAULT_STAT_SLOTS;

  const tiles = [
    { label: lbl('round', 'Series'), value: room.round || '\u2014' },
    { label: lbl('raise_amount', 'Amount'), value: room.raise_amount || '\u2014' },
    ...slots.map(sl => statSlotValue(sl, room, committed ?? undefined)),
  ];
  // The Headquarters field is the source of truth for company location, so it
  // wins. Coordinates are only a fallback for a deal that has them but never had
  // the text: otherwise a founder could edit Headquarters and watch the map sit
  // stubbornly on an old pin.
  const mapSrc = room.headquarters
    ? `https://maps.google.com/maps?q=${encodeURIComponent(room.headquarters)}&z=12&output=embed`
    : room.hq_lat && room.hq_lng
      ? `https://maps.google.com/maps?q=${room.hq_lat},${room.hq_lng}&z=12&output=embed`
      : '';

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      <PublicHeader variant={room.demo_mode ? 'full' : 'quiet'} />
      {isMasterAdmin && (
        <div className={`w-full text-center text-sm font-medium py-2 px-4 ${room.is_active ? 'bg-[var(--ds-tint)] text-[var(--ds-brand)]' : 'bg-[#fff7ed] text-[#b45309]'}`}>
          {room.is_active ? 'Admin preview — this deal studio is live.' : 'Admin preview — this deal studio is inactive and not visible to investors yet.'}
        </div>
      )}
      <div className="max-w-6xl mx-auto p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Main column (flattens into the grid on mobile via display:contents) */}
        <div className="contents lg:block lg:space-y-6 min-w-0">
          {/* Featured deck */}
          {deck && (
            <div data-section="deck" className="order-3 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] overflow-hidden">
              <div className="lg:hidden px-5 pt-5 pb-2"><h2 className="text-sm font-bold text-[#191f1d]">Deck</h2></div>
              <PdfDeckViewer
                url={deck.file_url}
                onPageView={(p, seconds) => { if (room && !isMasterAdmin) trackDealView(room.id, 'deck_page', { document_id: deck.id, page: p, seconds, email: email || undefined }); }}
              />
            </div>
          )}

          {/* Company header */}
          <div data-section="header" className="order-2 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
            <h2 className="lg:hidden text-sm font-bold text-[#191f1d] mb-2">Overview</h2>
            <h1 className="hidden lg:block text-2xl font-bold text-[#191f1d]">{room.company_name}</h1>
            {room.one_liner && <p className="hidden lg:block text-[#7f8c85] mt-1">{room.one_liner}</p>}
            {room.headquarters && <p className="flex items-center gap-1 text-sm text-[var(--ds-accent-ink)] lg:mt-2"><MapPin className="w-4 h-4" /> {room.headquarters}</p>}
            {(room.tags?.length > 0 || room.industries?.length > 0) && (
              <div className="flex flex-wrap gap-2 mt-3">
                {room.tags?.map(t => <span key={t} className="rounded-full bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)] text-xs font-medium px-3 py-1">{t}</span>)}
                {room.industries?.map((ind, i) => (
                  <button
                    key={`ind-${i}`}
                    type="button"
                    onClick={() => setOpenIndustry(openIndustry === i ? null : i)}
                    className={`rounded-full text-xs font-medium px-3 py-1 border transition-colors ${openIndustry === i ? 'bg-[#191f1d] text-white border-transparent' : 'bg-[#f5f7f9] text-[#7f8c85] border-[#edf0f3] hover:bg-[#edf0f3]'}`}
                  >
                    {ind.name}
                  </button>
                ))}
              </div>
            )}
            {openIndustry !== null && room.industries?.[openIndustry] && (
              <div className="mt-3 rounded-xl bg-[#f5f7f9] border border-[#edf0f3] p-3">
                <p className="text-xs font-semibold text-[#191f1d]">{room.industries[openIndustry].name}</p>
                <p className="text-xs text-[#7f8c85] mt-0.5 leading-relaxed">{room.industries[openIndustry].description || 'No description added yet.'}</p>
              </div>
            )}
          </div>

          {/* Deal information tiles */}
          <div data-section="deal_info" className="order-4 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
            <h2 className="text-sm font-bold text-[#191f1d] mb-3">Deal Information</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {tiles.map(t => (
                <div key={t.label} className="rounded-2xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] p-4 text-white">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{t.label}</p>
                  <p className="text-xl font-bold mt-3 text-right leading-tight">{t.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* About */}
          {room.summary_html && (
            <div data-section="about" className="order-5 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
              <h2 className="text-sm font-bold text-[#191f1d] mb-3">About {room.company_name}</h2>
              {(() => {
                const { preview, hasMore } = splitHtmlParagraphs(room.summary_html, 4);
                return (
                  <>
                    <RichTextRenderer html={aboutExpanded || !hasMore ? room.summary_html : preview} className="text-[14px] leading-[1.55] text-[#191f1d]" />
                    {hasMore && (
                      <button onClick={() => setAboutExpanded(e => !e)} className="mt-3 ml-auto block text-sm font-semibold text-[var(--ds-accent-ink)] hover:underline">
                        {aboutExpanded ? 'Read less' : 'Read more'}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* Sections render in the order the founder set. One list drives the
              admin tabs and this room, so they cannot disagree. */}
          {(() => {
            const docsBlock = (
              <div
                ref={docsView.ref}
                data-section="documents"
                className={`rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5 ${docsView.inView ? 'ds-animate' : ''}`}
              >
                <h2 className="text-sm font-bold text-[#191f1d] mb-3">Deal Documents</h2>
                {room.documents.length === 0 ? (
                  <p className="text-sm text-[#99a1af]">No documents shared yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      {(docsExpanded ? room.documents : room.documents.slice(0, 2)).map(d => <DealDocumentCard key={d.id} doc={d} onOpen={openDoc} />)}
                    </div>
                    {room.documents.length > 2 && (
                      <button onClick={() => setDocsExpanded(e => !e)} className="mt-3 ml-auto block text-sm font-semibold text-[var(--ds-accent-ink)] hover:underline">
                        {docsExpanded ? 'Show less' : `Show all ${room.documents.length} documents`}
                      </button>
                    )}
                  </>
                )}
              </div>
            );

            const byKey: Record<SectionKey, React.ReactNode> = {
              documents: docsBlock,
              problem: valueProp ? <ProblemSolutionSection value={valueProp} /> : null,
              valueprop: valueProp ? <ValuePropSection value={valueProp} /> : null,
              market: market ? <MarketSection market={market} /> : null,
              competition: competition ? <CompetitionSection value={competition} /> : null,
              businessmodel: market?.businessModel ? <BusinessModelSection model={market.businessModel} /> : null,
              team: team ? <TeamSection team={team} /> : null,
              articles: market ? <IndustryReadingSection market={market} /> : null,
            };

            return resolveSectionOrder((room as any).section_order).map((k, i) => {
              const node = byKey[k];
              if (!node) return null;
              return (
                <div key={k} className="order-none" style={{ order: 5 + i }}>
                  {node}
                </div>
              );
            });
          })()}

        </div>

        {/* Right rail. Flattens into the grid on mobile via display:contents.

            The height is set in JS, not here. Every hard-coded calc() was wrong
            for at least one state: the panel's real top moves depending on the
            draft banner and on how far you have scrolled, so a single fixed
            number always overhung the fold somewhere and cut off the calendar.
            See the fit() effect above. */}
        {/* Two elements, two jobs.
            OUTER: sticky, plus the measured viewport height. min-h-0 stops the grid
                   item being stretched to its content height, which would leave
                   nothing to scroll.
            INNER: the scrolling.
            One element doing both is what the last several attempts kept trying,
            and it is fragile in Safari. */}
        <div
          ref={sideRef}
          className="contents lg:block lg:self-start lg:sticky lg:top-[84px] lg:min-h-0"
        >
          {/* The px/-mx pair is not cosmetic. Setting overflow-y also makes
              overflow-x a clip box, so without side padding the cards' drop shadows
              get sliced flat at the left and right edges. The padding gives them
              room inside the clip; the negative margin puts the column back. */}
          <div className="contents lg:block lg:h-full lg:min-h-0 lg:space-y-6 lg:overflow-y-auto lg:-mx-3 lg:px-3 ds-scroll-y">
          <div className="order-1 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5 text-center">
            {/* A white ring plus a soft shadow, so the mark sits ON the card
                rather than flat against it. The hairline border alone left it
                looking pasted on. */}
            <div className="w-20 h-20 rounded-full bg-[#f5f7f9] ring-4 ring-white mx-auto mb-3 overflow-hidden flex items-center justify-center shadow-[0_6px_18px_-4px_rgba(12,16,34,0.28)]">
              {(() => {
                // Resolved theme logo first (deal, then company), then the hero
                // image, then initials. The logo never showed here because this
                // only ever looked at hero_image_url.
                const logo = (room as any).theme?.logo_url || room.hero_image_url;
                return logo
                  ? <img src={logo} alt="" className="w-full h-full object-cover" />
                  : <span className="text-2xl font-bold text-[var(--ds-brand)]">{(room.company_name || '?').trim().charAt(0).toUpperCase()}</span>;
              })()}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85]">Company</p>
            <p className="text-lg font-bold text-[#191f1d]">{room.company_name}</p>
            {room.one_liner && (
              <p className="lg:hidden text-sm text-[#7f8c85] mt-1">
                {(() => {
                  const parts = room.one_liner.split(/\s+and\s+/);
                  if (parts.length < 2) return room.one_liner;
                  return <>{parts[0]}<br />{'and ' + parts.slice(1).join(' and ')}</>;
                })()}
              </p>
            )}
            {room.meeting_enabled && (
              <Button onClick={() => setMeetingOpen(true)} className="w-full h-10 mt-3 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]">Schedule Meeting</Button>
            )}
            {room.allow_share && (
              <button onClick={shareDeal} className="w-full h-10 mt-2 rounded-full border border-[var(--ds-brand)] text-[var(--ds-brand)] hover:bg-[var(--ds-tint)] flex items-center justify-center gap-1.5 text-sm font-medium transition-colors">
                {shareCopied ? <><Check className="w-4 h-4" /> Link copied</> : <><Share2 className="w-4 h-4" /> Share this deal</>}
              </button>
            )}
            {granted && !isMasterAdmin && (
              <button
                onClick={() => {
                  try { localStorage.removeItem(accessKey(SLUG)); localStorage.removeItem('dealstudio_email'); } catch { /* noop */ }
                  setEmail(null);
                  setGranted(false);
                }}
                className="w-full h-9 mt-2 rounded-full text-[13px] font-medium text-[#7f8c85] hover:text-[#191f1d] hover:bg-[#f5f7f9] flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-4 h-4" /> Log out
              </button>
            )}
          </div>

          {mapSrc && (
            <div data-section="hq" className="order-11 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] mb-2">Headquartered</p>
              {/* The radius goes on a wrapper, not the iframe: iOS Safari does not
                  clip an iframe's own content to its border-radius, so the map
                  spilled past the rounded corners. `block` also kills the inline
                  baseline gap that left a sliver under it. Height scales with the
                  viewport rather than sitting at a fixed 224px on a narrow phone. */}
              <div className="overflow-hidden rounded-xl">
                <iframe
                  src={mapSrc}
                  title="Headquarters"
                  loading="lazy"
                  className="block w-full h-44 sm:h-56 border-0"
                />
              </div>
            </div>
          )}

          {room.meeting_enabled && (
            <div data-section="calendar" className="order-12 lg:order-none rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-4">
              <p className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] mb-2"><span className="flex items-center gap-1"><CalIcon className="w-3.5 h-3.5" /> Availability</span></p>
              <EventsCalendar events={availabilityEvents} selectedDate={selectedDate} onSelectDate={(d) => setSelectedDate(d)} currentMonth={new Date()} onChangeMonth={() => {}} />

              {/* Picking a date used to do nothing: selectedDate was stored and
                  never read. Now it shows the actual bookable times, generated by
                  scheduleSlots -- the same function the booking modal uses, so what
                  an investor sees here cannot disagree with what they can book. */}
              {selectedDate && (() => {
                const slots = scheduleSlots(room.availability as DealSchedule, selectedDate);
                const label = new Date(selectedDate + 'T00:00:00')
                  .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                const len = (room.availability as DealSchedule)?.meetingLength || 30;

                return (
                  <div className="mt-3 border-t border-[#edf0f3] pt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] mb-2">
                      {label}
                    </p>

                    {/* The slot grid has no max-height and no overflow. It used to be
                        its own 160px scroller nested inside the sidebar's scroller:
                        two scroll containers competing for one wheel gesture, which
                        made the slots below the fold effectively unreachable. The
                        sidebar is the single scroll container now. */}
                    {slots.length === 0 ? (
                      <p className="text-sm text-[#99a1af]">No times available on this day.</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {slots.map(t => (
                          <button
                            key={t}
                            onClick={() => { setSelectedSlot(t); setMeetingOpen(true); }}
                            className={`rounded-lg border px-2 py-1.5 text-[13px] font-medium transition ${
                              selectedSlot === t
                                ? 'border-[var(--ds-accent)] bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)]'
                                : 'border-[#edf0f3] bg-white text-[#191f1d] hover:border-[var(--ds-accent)]'
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}

                    {slots.length > 0 && (
                      <p className="text-[11px] text-[#9ca3af] mt-2">
                        {slots.length} slot{slots.length === 1 ? '' : 's'}, {len} min each
                      </p>
                    )}
                  </div>
                );
              })()}
              <Button onClick={() => setMeetingOpen(true)} className="w-full h-10 mt-3 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)]">Request a meeting</Button>
              <p className="text-xs text-[#99a1af] mt-2 text-center">Dots mark open dates. Pick a slot or request your own time.</p>
            </div>
          )}

          {/* A real element, not padding. Chrome ignores a scroll container's
              padding-bottom at the end of the scroll, so the calendar would sit
              flush against the edge. An element cannot be ignored. */}
          <div className="hidden lg:block h-6" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Document viewer */}
      {activeDoc && (
        <DealDocViewer
          doc={activeDoc}
          onClose={closeDoc}
          onPageView={activeDoc.is_deck ? (p, seconds) => { if (room && !isMasterAdmin) trackDealView(room.id, 'deck_page', { document_id: activeDoc.id, page: p, seconds, email: email || undefined }); } : undefined}
        />
      )}

      {meetingOpen && (
        <RequestMeetingModal
          slug={SLUG}
          schedule={room.availability as DealSchedule}
          defaultEmail={email}
          defaultDate={selectedDate}
          defaultSlot={selectedSlot}
          onClose={() => setMeetingOpen(false)}
          onSubmitted={() => { if (room && !isMasterAdmin) trackDealView(room.id, 'meeting_requested', {}); }}
        />
      )}
    </div>
  );
}
