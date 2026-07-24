/**
 * dealStudio.ts — data layer for the investor DealStudio.
 *
 * Two surfaces share this file:
 *   - PUBLIC /investors (logged-out): reads go through a SECURITY DEFINER RPC
 *     via a raw anon fetch (never the Supabase client) so the auth-lock issue
 *     can't hang the page, and so the password hash is never exposed.
 *   - MASTER ADMIN DealStudio: authenticated CRUD through the Supabase client.
 *
 * Password hashing is done server-side (pgcrypto) inside the RPCs — the client
 * never sees or sets a raw hash.
 */

import { webUrl } from './runtime';
import { supabase } from './supabase';
import { trackEvent } from './analytics';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const DOC_BUCKET = 'deal-documents';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DealDocument {
  id: string;
  dealstudio_id: string;
  title: string;
  description: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  page_count: number | null;
  sort_order: number;
  is_deck: boolean;
  version: number;
  is_archived: boolean;
  replaced_by: string | null;
  created_at: string;
}

export interface DealIndustry { name: string; description: string; }
export interface DealAvailability { date: string; start: string; end: string; recurringWeekly: boolean; }

/** Calendly-style weekly schedule stored in dealstudios.availability (jsonb). */
export interface TimeRange { start: string; end: string; } // 'HH:MM'
export interface DealSchedule {
  weekly: Record<number, TimeRange[]>; // 0=Sun … 6=Sat
  meetingLength: number;               // minutes
  overrides: { date: string; ranges: TimeRange[] }[];
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function emptySchedule(): DealSchedule {
  return { weekly: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }, meetingLength: 30, overrides: [] };
}

/** Accept legacy array-shaped availability or a schedule object; always return a schedule. */
export function normalizeSchedule(raw: any): DealSchedule {
  const base = emptySchedule();
  if (!raw) return base;
  if (Array.isArray(raw)) {
    // Legacy [{date,start,end,recurringWeekly}] → map into overrides / weekly.
    for (const a of raw) {
      if (!a?.start || !a?.end) continue;
      if (a.recurringWeekly && a.date) {
        const d = new Date(a.date + 'T00:00:00').getDay();
        base.weekly[d].push({ start: a.start, end: a.end });
      } else if (a.date) {
        base.overrides.push({ date: a.date, ranges: [{ start: a.start, end: a.end }] });
      }
    }
    return base;
  }
  return {
    weekly: { ...base.weekly, ...(raw.weekly || {}) },
    meetingLength: raw.meetingLength || 30,
    overrides: Array.isArray(raw.overrides) ? raw.overrides : [],
  };
}

function pad(n: number) { return String(n).padStart(2, '0'); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** Bookable date keys (YYYY-MM-DD) over the next `days` from `from`. */
export function scheduleDates(schedule: DealSchedule, from = new Date(), days = 90): string[] {
  const out: string[] = [];
  const overrideMap = new Map(schedule.overrides.map(o => [o.date, o.ranges]));
  for (let i = 0; i < days; i++) {
    const d = new Date(from); d.setDate(from.getDate() + i);
    const key = toKey(d);
    const ranges = overrideMap.get(key) ?? schedule.weekly[d.getDay()] ?? [];
    if (ranges.length > 0) out.push(key);
  }
  return out;
}

/** Slot start times for a given date, split by meeting length. */
export function scheduleSlots(schedule: DealSchedule, dateKey: string): string[] {
  const override = schedule.overrides.find(o => o.date === dateKey);
  const day = new Date(dateKey + 'T00:00:00').getDay();
  const ranges = override?.ranges ?? schedule.weekly[day] ?? [];
  const len = schedule.meetingLength || 30;
  const slots: string[] = [];
  for (const r of ranges) {
    const [sh, sm] = r.start.split(':').map(Number);
    const [eh, em] = r.end.split(':').map(Number);
    let t = sh * 60 + sm; const end = eh * 60 + em;
    while (t + len <= end) { slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`); t += len; }
  }
  return slots;
}

export interface DealSource { label: string; url: string; }
export interface DealMetric { value: string; note: string; sources: DealSource[]; }
export interface DealArticle {
  title: string; source: string; url: string; date: string;
  description?: string; image?: string; hideImage?: boolean;
  /**
   * Set when the founder uploaded a report rather than linking one.
   *
   * It matters: an uploaded PDF has no page to scrape, so the link-preview
   * fetch must not run against it, and the investor card should read as a
   * document rather than as an outbound link to a website.
   */
  file?: boolean;
  fileName?: string;
}
export type CalcUnit = 'currency' | 'percentage';
export type CalcFreq = 'monthly' | 'yearly' | 'per_event';
export interface ImpactedTier { id: string; tierName: string; unitType: CalcUnit; presetAmount: number; frequency: CalcFreq; }

/**
 * An add-on, and how it differs from an impacted tier. They look alike on screen
 * and they are not the same thing.
 *
 * An IMPACTED TIER is charged to every customer in its parent tier: the maths
 * multiplies it by the parent's full quantity. 5,000 founders on Pro, and an
 * Additional Seat impacted tier, bills 5,000 additional seats.
 *
 * An ADD-ON is optional, so it is charged to a SHARE of them. attachRate is that
 * share, as a percentage of the parent tier's quantity. 5,000 founders and a 10%
 * attach rate is 500 paying customers, and 500 more users.
 *
 * These add-ons have nothing to do with plan_addons and org_addons, which are the
 * billable extras a PLATFORM admin grants a customer. Same word, different half
 * of the product.
 */
export interface TierAddon {
  id: string; tierName: string; unitType: CalcUnit; presetAmount: number; frequency: CalcFreq;
  /** Percent of the parent tier's customers who buy it. 0 to 100. */
  attachRate: number;
}

export interface PricingTier {
  id: string; tierName: string; unitType: CalcUnit; presetAmount: number; frequency: CalcFreq;
  customerName: string; quantity: number; avgValue?: number;
  impacts?: boolean; impactedTiers?: ImpactedTier[];
  hasAddons?: boolean; addons?: TierAddon[];
}
export interface RevenueStream {
  id: string; name: string; details: string; target: number; tiers: PricingTier[];
  /** Optional cost of goods for this stream. `cogsMode` decides how `cogs` reads:
   *  'amount' is a flat monthly dollar cost, 'percent' is a share of the stream's
   *  monthly revenue. Absent or 0 means no COGS, and margin simply is not shown. */
  cogsMode?: 'amount' | 'percent';
  cogs?: number;
}

/** A monthly operating expense line. Global to the model, not tied to a stream,
 *  matching how opex actually works. Optional: no lines means no profit section. */
export interface ExpenseLine { id: string; name: string; monthly: number; }

export interface DealBusinessModel {
  revenues: RevenueStream[];
  annualGrowthRate: number;
  /** Optional operating expenses. Absent on every existing deal, which is why
   *  the profit section only appears once a founder adds a line. */
  expenses?: ExpenseLine[];
  /** Founder's explicit show/hide overrides, keyed by section. A section with
   *  data defaults to shown; setting false here hides it from investors even
   *  though it has data ("auto-check first, remove if unchecked"). */
  show?: { margin?: boolean; profit?: boolean };
}

const periodToMonthly = (freq: CalcFreq, totalPerPeriod: number): number =>
  freq === 'monthly' ? totalPerPeriod : totalPerPeriod / 12;
const unitRevenue = (unit: CalcUnit, amount: number, avgValue: number): number =>
  unit === 'percentage' ? (amount / 100) * avgValue : amount;

/** How many customers take a given add-on. Clamped: a 140% attach rate is a typo,
 *  and it would otherwise quietly inflate both revenue and the user count. */
export function addonQuantity(t: PricingTier, a: TierAddon): number {
  const rate = Math.min(100, Math.max(0, a.attachRate || 0));
  return (t.quantity || 0) * (rate / 100);
}

export function tierMonthlyRevenue(t: PricingTier): number {
  const q = t.quantity || 0;
  const av = t.avgValue || 0;
  let monthly = periodToMonthly(t.frequency, unitRevenue(t.unitType, t.presetAmount || 0, av) * q);

  // Impacted tiers: every customer in the tier pays.
  if (t.impacts) for (const it of (t.impactedTiers || [])) {
    monthly += periodToMonthly(it.frequency, unitRevenue(it.unitType, it.presetAmount || 0, av) * q);
  }

  // Add-ons: only the share of them given by the attach rate pays.
  if (t.hasAddons) for (const a of (t.addons || [])) {
    monthly += periodToMonthly(a.frequency, unitRevenue(a.unitType, a.presetAmount || 0, av) * addonQuantity(t, a));
  }

  return monthly;
}

/** Customers on a tier, plus the add-on customers it carries. Add-on buyers count
 *  as users, so they are in the denominator of Revenue per User as well as the
 *  numerator, which is the only way that figure stays honest. */
export function tierUsers(t: PricingTier): number {
  const base = t.quantity || 0;
  if (!t.hasAddons) return base;
  return base + (t.addons || []).reduce((s, a) => s + addonQuantity(t, a), 0);
}
export function revenueMonthly(r: RevenueStream): number {
  return (r.tiers || []).reduce((s, t) => s + tierMonthlyRevenue(t), 0);
}
/** Monthly COGS for a stream. Percent mode reads against that stream's own
 *  monthly revenue; amount mode is a flat monthly figure. Clamped at zero. */
export function streamMonthlyCogs(r: RevenueStream): number {
  const c = r.cogs || 0;
  if (c <= 0) return 0;
  if (r.cogsMode === 'percent') return Math.max(0, revenueMonthly(r) * (Math.min(100, c) / 100));
  return Math.max(0, c);
}

export interface ModelTotals {
  revenues: { id: string; name: string; monthly: number; annual: number; pctOfTotal: number; cogsMonthly: number }[];
  totalMonthly: number; totalAnnual: number; totalUsers: number; revenuePerUser: number;
  growth: { year: number; users: number; monthly: number; annual: number }[];
  // Cost side. All zero / false when the founder has entered nothing, so the
  // renderer can decide whether a section has earned its place.
  hasCogs: boolean;
  cogsMonthly: number; cogsAnnual: number;
  grossMonthly: number; grossAnnual: number; grossMarginPct: number;
  hasExpenses: boolean;
  expensesMonthly: number; expensesAnnual: number;
  operatingMonthly: number; operatingAnnual: number; operatingMarginPct: number;
}

export function computeBusinessModel(m: DealBusinessModel): ModelTotals {
  const revs = (m.revenues || []).map(r => {
    const monthly = revenueMonthly(r);
    return { id: r.id, name: r.name || 'Revenue', monthly, annual: monthly * 12, cogsMonthly: streamMonthlyCogs(r) };
  });
  const totalMonthly = revs.reduce((s, r) => s + r.monthly, 0);
  const totalAnnual = totalMonthly * 12;
  const totalUsers = (m.revenues || []).reduce((s, r) => s + (r.tiers || []).reduce((q, t) => q + tierUsers(t), 0), 0);
  const revenuePerUser = totalUsers > 0 ? totalAnnual / totalUsers : 0;
  const revenues = revs.map(r => ({ ...r, pctOfTotal: totalAnnual > 0 ? (r.annual / totalAnnual) * 100 : 0 }));
  const g = (m.annualGrowthRate || 0) / 100;
  const growth = [1, 2, 3, 4].map(year => {
    const factor = Math.pow(1 + g, year - 1);
    return { year, users: Math.round(totalUsers * factor), monthly: totalMonthly * factor, annual: totalAnnual * factor };
  });

  // Cost of goods, summed across streams.
  const cogsMonthly = revs.reduce((s, r) => s + r.cogsMonthly, 0);
  const hasCogs = cogsMonthly > 0;
  const grossMonthly = totalMonthly - cogsMonthly;
  const grossAnnual = grossMonthly * 12;
  const grossMarginPct = totalMonthly > 0 ? (grossMonthly / totalMonthly) * 100 : 0;

  // Operating expenses, global.
  const expensesMonthly = (m.expenses || []).reduce((s, e) => s + (e.monthly || 0), 0);
  const hasExpenses = expensesMonthly > 0;
  const operatingMonthly = grossMonthly - expensesMonthly;
  const operatingAnnual = operatingMonthly * 12;
  const operatingMarginPct = totalMonthly > 0 ? (operatingMonthly / totalMonthly) * 100 : 0;

  return {
    revenues, totalMonthly, totalAnnual, totalUsers, revenuePerUser, growth,
    hasCogs, cogsMonthly, cogsAnnual: cogsMonthly * 12,
    grossMonthly, grossAnnual, grossMarginPct,
    hasExpenses, expensesMonthly, expensesAnnual: expensesMonthly * 12,
    operatingMonthly, operatingAnnual, operatingMarginPct,
  };
}
export interface DealMarket {
  overview: string;
  tam: DealMetric;
  sam: DealMetric;
  som: DealMetric;
  articles: DealArticle[];
  articlesTextOnly?: boolean;
  businessModel?: DealBusinessModel;
}
/** How a team photo is framed. Width stays fixed in the investor view; the
 *  ratio changes the HEIGHT, so a row of cards keeps a straight left edge. */
export type PhotoRatio = '1x1' | '2x3' | '9x16';

export interface DealTeamMember {
  name: string; role: string; bio: string; photo_url: string;
  links: DealSource[]; resume_url?: string; resume_name?: string;
  /** Default 1x1. */
  photo_ratio?: PhotoRatio;
  /** The white ring and shadow, matching the logo treatment. On by default;
   *  a square headshot on a dark background can look better without it. */
  photo_ring?: boolean;
}

export const PHOTO_RATIO: Record<PhotoRatio, { label: string; cls: string }> = {
  '1x1':  { label: '1 : 1',  cls: 'aspect-square' },
  '2x3':  { label: '2 : 3',  cls: 'aspect-[2/3]' },
  '9x16': { label: '9 : 16', cls: 'aspect-[9/16]' },
};

export const EMPTY_BUSINESS_MODEL: DealBusinessModel = { revenues: [], annualGrowthRate: 0 };

export const EMPTY_METRIC: DealMetric = { value: '', note: '', sources: [] };
export const EMPTY_MARKET: DealMarket = {
  overview: '',
  tam: { value: '', note: '', sources: [] },
  sam: { value: '', note: '', sources: [] },
  som: { value: '', note: '', sources: [] },
  articles: [],
};

export interface DealStudio {
  id: string;
  slug: string;
  market?: DealMarket | null;
  team?: DealTeamMember[] | null;
  is_active: boolean;
  company_name: string;
  one_liner: string;
  round: string;
  raise_amount: string;
  raise_goal: number;
  raised_amount: number;
  team_size: number;
  headquarters: string;
  /** Where investors reach out. The investor-page Email button opens a message to
   *  this, falling back to the owner's login email when it is empty. */
  contact_email: string | null;
  field_labels?: Record<string, string> | null;
  hq_lat: number | null;
  hq_lng: number | null;
  tags: string[];
  industries: DealIndustry[];
  summary_html: string;
  hero_image_url: string | null;
  deck_document_id: string | null;
  share_image_url: string | null;
  share_image_source: 'auto' | 'custom';
  require_email: boolean;
  require_password: boolean;
  invite_only: boolean;
  demo_mode: boolean;
  demo_notice: string;
  anyone_with_link: boolean;
  allow_share: boolean;
  shared_password_hash?: string | null;
  meeting_enabled: boolean;
  availability: DealSchedule;
}

export interface DealStudioPublic extends DealStudio {
  documents: DealDocument[];
}

// ── Public (anon) reads via RPC ──────────────────────────────────────────────

async function rpcAnon(fn: string, args: Record<string, any>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Public market/team extras for the active room (anon-safe via RPC). */
export async function fetchDealExtras(slug = 'investors'): Promise<{
  market: DealMarket | null;
  team: DealTeamMember[] | null;
  valueProp: DealValueProp | null;
  competition: DealCompetition | null;
}> {
  try {
    const data = await rpcAnon('get_dealstudio_extras', { p_slug: slug });
    const row = (Array.isArray(data) ? data[0] : data) || {};
    return {
      market: (row.market as DealMarket) ?? null,
      team: (row.team as DealTeamMember[]) ?? null,
      valueProp: (row.value_prop as DealValueProp) ?? null,
      competition: (row.competition as DealCompetition) ?? null,
    };
  } catch (e) {
    console.warn('[dealStudio] extras fetch failed', e);
    return { market: null, team: null, valueProp: null, competition: null };
  }
}

export interface LinkPreview { title: string; description: string; image: string; site: string; url: string; }

/** Pull a link's title/description/image/site via the link-preview edge
 *  function (server-side fetch, since the browser cannot read other sites).
 *  Returns null on any failure; the caller keeps whatever the user typed. */
export type LinkPreviewResult =
  | { ok: true; preview: LinkPreview }
  | { ok: false; reason: 'bad-url' | 'not-enabled' | 'upstream' };

/**
 * Pull a link's title/description/image via the link-preview edge function.
 *
 * Failures used to return null and the editor just sat there, so a founder could
 * not tell a dead link from a service that was never switched on. The reason is
 * now reported, because those two problems have completely different fixes.
 */
export async function fetchLinkPreviewResult(url: string): Promise<LinkPreviewResult> {
  if (!url || !/^https?:\/\//i.test(url)) return { ok: false, reason: 'bad-url' };

  try {
    const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });

    // A CORS/401 rejection never reaches the function body: Supabase blocks the
    // preflight when "Verify JWT" is on. That is a configuration problem, not a
    // problem with the link the founder pasted.
    if (error) return { ok: false, reason: 'not-enabled' };
    if (!data || (data as any).error) return { ok: false, reason: 'upstream' };

    return { ok: true, preview: data as LinkPreview };
  } catch {
    return { ok: false, reason: 'not-enabled' };
  }
}

/** Back-compat: null on any failure. */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const r = await fetchLinkPreviewResult(url);
  return r.ok ? r.preview : null;
}



/* ── Deal Information stat slots ───────────────────────────────────────────── */

export type StatKind =
  | 'total_raised' | 'team_size' | 'instrument' | 'headquarters' | 'other';

export interface StatSlot {
  kind: StatKind;
  /** Only used when kind is 'other'. */
  label?: string;
  /** Used by every kind except team_size and headquarters, which read columns. */
  value?: string;
}

export const STAT_KIND_LABELS: Record<StatKind, string> = {
  total_raised: 'Committed',
  team_size: 'Team Size',
  instrument: 'Instrument',
  headquarters: 'Headquarters',
  other: 'Other',
};

export const DEFAULT_STAT_SLOTS: StatSlot[] = [
  { kind: 'team_size' },
  { kind: 'headquarters' },
];

/* ── Value Proposition ─────────────────────────────────────────────────────── */

export interface DealValuePillar { title: string; description: string; }

/** One problem paired with the thing you do about it.
 *  The titles are what an investor scans; the bodies are what they read if the
 *  title earns it. */
export interface ProblemSolution {
  id: string;
  problem_title?: string;
  problem: string;
  solution_title?: string;
  solution: string;
}

/** Collapsed cards need a header. Use the title if there is one, otherwise the
 *  opening words of the body, so a pair written before titles existed still
 *  reads as something rather than an empty bar. */
export function psHeader(text: string, title?: string, max = 44): string {
  const t = (title ?? '').trim();
  if (t) return t;
  const body = (text ?? '').trim().replace(/\s+/g, ' ');
  if (body.length <= max) return body;
  return body.slice(0, body.lastIndexOf(' ', max) > 0 ? body.lastIndexOf(' ', max) : max) + '\u2026';
}

export interface DealValueProp {
  headline: string;      // the one line an investor should remember
  /** Legacy single problem/solution. Kept so existing deals do not lose text. */
  problem: string;
  solution: string;
  pillars: DealValuePillar[];
  /** The statement that opens the Problem and Solution section. */
  statement?: string;
  /** Specific problems, each with its own answer. */
  pairs?: ProblemSolution[];
}

export const EMPTY_VALUE_PROP: DealValueProp = {
  headline: '', problem: '', solution: '', pillars: [], statement: '', pairs: [],
};


/* ── Competition matrix ────────────────────────────────────────────────────── */

/** A row in the comparison grid: the thing being compared on. */
export interface CompFeature {
  id: string;
  label: string;
}

export interface DealCompetitor {
  id: string;
  name: string;
  segment: string;
  weakness: string;
  logo?: string;
  url?: string;
  /** This column is the founder's own company, and is highlighted. */
  is_you?: boolean;
  /** featureId -> has it. Missing means no. */
  marks: Record<string, boolean>;
}

export interface DealCompetition {
  overview: string;
  edge: string;
  features: CompFeature[];
  competitors: DealCompetitor[];
}

export const EMPTY_COMPETITION: DealCompetition = {
  overview: '', edge: '', features: [], competitors: [],
};

export function newId(prefix = 'x'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}


/** Public deal studio payload (active room only, safe columns + active documents). */
export async function fetchDealStudioPublic(slug = 'investors'): Promise<DealStudioPublic | null> {
  try {
    const data = await rpcAnon('get_dealstudio_public', { p_slug: slug });
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    const room = (Array.isArray(data) ? data[0] : data) as DealStudioPublic;
    room.availability = normalizeSchedule(room.availability);
    if (Array.isArray(room.documents)) room.documents.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return room;
  } catch (e) {
    console.warn('[dealStudio] public fetch failed', e);
    return null;
  }
}

export type AccessResult = { granted: boolean; mode?: string; name?: string | null; reason?: string };

/** Verify investor access (shared password OR per-investor approved password). */
export async function verifyDealAccess(slug: string, email: string, password: string): Promise<AccessResult> {
  try {
    const data = await rpcAnon('dealstudio_verify_access', { p_slug: slug, p_email: email.trim().toLowerCase(), p_password: password });
    return (Array.isArray(data) ? data[0] : data) as AccessResult;
  } catch (e) {
    return { granted: false, reason: 'error' };
  }
}

/** Investor with no password requests access — creates a pending row for admin approval. */
export async function requestDealAccess(slug: string, email: string, name: string): Promise<{ ok: boolean }> {
  try {
    const data = await rpcAnon('dealstudio_request_access', { p_slug: slug, p_email: email.trim().toLowerCase(), p_name: name });
    return (Array.isArray(data) ? data[0] : data) as { ok: boolean };
  } catch {
    return { ok: false };
  }
}

// ── View / funnel tracking ───────────────────────────────────────────────────

export function trackDealView(roomId: string, name: string, meta: Record<string, any> = {}) {
  void trackEvent({
    event_type: 'custom',
    event_name: `dealstudio_${name}`,
    related_company_account_id: roomId,
    page_path: '/investors',
    metadata: meta,
  });
}

/** Just the editable Deal Information label overrides for the public investor
 *  page. Kept separate from get_dealstudio_public so that RPC does not need to
 *  change. Returns {} when none are set or on any failure. */
export async function fetchDealFieldLabels(slug = 'investors'): Promise<Record<string, string>> {
  try {
    const data = await rpcAnon('get_dealstudio_field_labels', { p_slug: slug });
    return (data && typeof data === 'object' && !Array.isArray(data)) ? (data as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Roll a visitor's session activity up into dealstudio_visits (best effort).
 *
 * The session token is what makes this honest. The client flushes on every tab
 * away, and each flush resends the session's RUNNING TOTAL. Keyed by session, the
 * server replaces that session's figures rather than adding to them, so ten
 * flushes in one sitting still count as one visit. Without the token, the same
 * sitting was recorded as ten visits and the deck views were added ten times over.
 */
export async function recordDealVisit(
  slug: string,
  email: string | null,
  sections: Record<string, number>,
  totalSeconds: number,
  deckViews: number,
  session: string,
) {
  try {
    await rpcAnon('dealstudio_record_visit', {
      p_slug: slug,
      p_email: email,
      p_sections: sections,
      p_total_seconds: Math.round(totalSeconds),
      p_deck_views: deckViews,
      p_session: session,
    });
  } catch { /* non-critical */ }
}

export async function requestMeeting(slug: string, email: string, name: string, date: string, start: string, end: string, note: string): Promise<{ ok: boolean; error?: string }> {
  let recorded = false;
  let notified = false;
  let error: string | undefined;

  // 1. Record the request in deal_meetings (needs the dealstudio_request_meeting RPC).
  try {
    await rpcAnon('dealstudio_request_meeting', { p_slug: slug, p_email: email, p_name: name, p_date: date, p_start: start, p_end: end, p_note: note });
    recorded = true;
  } catch (e: any) {
    let msg = e?.message || 'Request failed';
    try { const j = JSON.parse(msg); msg = j.message || j.hint || j.error || msg; } catch { /* keep raw */ }
    error = String(msg).slice(0, 240);
    console.warn('[dealStudio] requestMeeting record failed', error);
  }

  // 2. Email the team + confirm the investor (best-effort, independent of the record).
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-deal-meeting-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ slug, email, name, date, start, note }),
    });
    const j = await res.json().catch(() => ({}));
    notified = res.ok && j?.success !== false;
  } catch (e: any) {
    console.warn('[dealStudio] requestMeeting notify failed', e?.message || e);
  }

  if (recorded || notified) return { ok: true };
  return { ok: false, error: error || 'Could not send the request' };
}

// ── Admin (authenticated) reads + CRUD ───────────────────────────────────────

/**
 * Loads a deal for the admin editor. RLS scopes every read to the caller's
 * organization, so omitting the slug simply returns that org's newest deal.
 */
export async function adminFetchDealStudio(slug?: string): Promise<DealStudio | null> {
  let q = supabase.from('dealstudios').select('*');
  if (slug) q = q.eq('slug', slug);
  const { data, error } = await q
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.warn('[dealStudio] admin fetch', error); return null; }
  if (data) (data as any).availability = normalizeSchedule((data as any).availability);
  return data as DealStudio | null;
}

/**
 * Regenerate a deal's share image from its deck's first slide.
 *
 * Called when a deck is set or replaced. It renders slide 1 in the browser (see
 * lib/shareImage) and stores the PNG as the deal's og:image. It does NOTHING if
 * the deal's share image is 'custom' -- a founder who uploaded their own image
 * has opted out of the auto behaviour, and a deck swap must not clobber that.
 *
 * Best-effort: a deck that will not render leaves the previous image in place
 * rather than failing the upload that triggered this.
 */
export async function refreshDeckShareImage(dealId: string, deckUrl: string): Promise<{ ok: boolean; url?: string; reason?: string }> {
  try {
    const { data, error } = await supabase
      .from('dealstudios')
      .select('share_image_source')
      .eq('id', dealId)
      .single();

    // The column not existing (migration not run) surfaces here as an error,
    // rather than vanishing into a silent no-op like the old version.
    if (error) return { ok: false, reason: 'The share image columns are missing. Run migration 0047.' };
    if ((data as any)?.share_image_source === 'custom') return { ok: false, reason: 'custom' };

    const { deckShareImage } = await import('./shareImage');
    const file = await deckShareImage(deckUrl);
    if (!file) return { ok: false, reason: 'Could not read the deck PDF. It may be private (not publicly fetchable) or not a PDF.' };

    const up = await uploadDealFile(file, dealId);
    if (!up?.url) return { ok: false, reason: 'The rendered image could not be uploaded to storage.' };

    const { error: saveErr } = await supabase
      .from('dealstudios')
      .update({ share_image_url: up.url, share_image_source: 'auto' })
      .eq('id', dealId);
    if (saveErr) return { ok: false, reason: 'Could not save the image URL to the deal.' };

    return { ok: true, url: up.url };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Unknown error while generating the image.' };
  }
}

export async function adminSaveDealStudio(id: string, patch: Partial<DealStudio>): Promise<{ success: boolean }> {
  const { error } = await supabase.from('dealstudios').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) console.warn('[dealStudio] save failed', error);
  return { success: !error };
}

export async function adminSetActive(id: string, active: boolean) {
  return adminSaveDealStudio(id, { is_active: active });
}

/** Set / clear the optional shared room password (hashed server-side). */
export async function adminSetSharedPassword(slug: string, password: string | null): Promise<{ success: boolean }> {
  const { error } = await supabase.rpc('dealstudio_set_shared_password', { p_slug: slug, p_password: password });
  return { success: !error };
}

export async function adminFetchDocuments(roomId: string, includeArchived = false): Promise<DealDocument[]> {
  let q = supabase.from('deal_documents').select('*').eq('dealstudio_id', roomId).order('sort_order', { ascending: true }).order('version', { ascending: false });
  if (!includeArchived) q = q.eq('is_archived', false);
  const { data, error } = await q;
  if (error) { console.warn('[dealStudio] docs', error); return []; }
  return (data || []) as DealDocument[];
}

/**
 * Upload a deal file.
 *
 * `dealId` prefixes the path. Files used to land in a flat namespace shared by
 * every customer on the platform, which meant one company's confidential deck
 * sat next to another's with nothing but an unguessable timestamp between them,
 * and there was no way to LIST the files belonging to a company in order to
 * delete them.
 *
 * It is optional so existing callers keep working; old files stay reachable and
 * are still deleted via their database row.
 */
export async function uploadDealFile(
  file: File,
  dealId?: string,
): Promise<{ url: string; size: number; name: string } | null> {
  const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = dealId ? `${dealId}/${Date.now()}-${safe}` : `${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false, contentType: file.type });
  if (error) { console.warn('[dealStudio] upload', error); return null; }
  const { data } = supabase.storage.from(DOC_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, size: file.size, name: file.name };
}

export async function adminCreateDocument(doc: Partial<DealDocument>): Promise<{ success: boolean; data?: DealDocument }> {
  const { data, error } = await supabase.from('deal_documents').insert({
    dealstudio_id: doc.dealstudio_id,
    title: doc.title,
    description: doc.description || '',
    file_url: doc.file_url,
    file_name: doc.file_name,
    file_size: doc.file_size,
    page_count: doc.page_count ?? null,
    is_deck: doc.is_deck ?? false,
    sort_order: doc.sort_order ?? 0,
    version: 1,
  }).select().single();
  return { success: !error, data: data as DealDocument };
}

/**
 * Update a document. When the file changes we ARCHIVE the original (keeping its
 * row + view data) and insert a new version that supersedes it. Metadata-only
 * edits update in place.
 */
export async function adminUpdateDocument(existing: DealDocument, patch: Partial<DealDocument>, newFile?: { url: string; size: number; name: string }): Promise<{ success: boolean; data?: DealDocument }> {
  if (newFile) {
    const { data, error } = await supabase.from('deal_documents').insert({
      dealstudio_id: existing.dealstudio_id,
      title: patch.title ?? existing.title,
      description: patch.description ?? existing.description,
      file_url: newFile.url,
      file_name: newFile.name,
      file_size: newFile.size,
      page_count: patch.page_count ?? null,
      is_deck: patch.is_deck ?? existing.is_deck,
      sort_order: existing.sort_order,
      version: existing.version + 1,
    }).select().single();
    if (error || !data) return { success: false };
    // Archive the original and point it at the replacement.
    await supabase.from('deal_documents').update({ is_archived: true, replaced_by: (data as DealDocument).id }).eq('id', existing.id);
    return { success: true, data: data as DealDocument };
  }
  const { data, error } = await supabase.from('deal_documents').update({
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    is_deck: patch.is_deck ?? existing.is_deck,
    sort_order: patch.sort_order ?? existing.sort_order,
  }).eq('id', existing.id).select().single();
  return { success: !error, data: data as DealDocument };
}

export async function adminDeleteDocument(id: string): Promise<{ success: boolean }> {
  const { error } = await supabase.from('deal_documents').delete().eq('id', id);
  return { success: !error };
}

export async function adminDeleteDocuments(ids: string[]): Promise<{ success: boolean }> {
  if (ids.length === 0) return { success: true };
  const { error } = await supabase.from('deal_documents').delete().in('id', ids);
  return { success: !error };
}

export async function adminReorderDocuments(rooms: { id: string; sort_order: number }[]) {
  await Promise.all(rooms.map(r => supabase.from('deal_documents').update({ sort_order: r.sort_order }).eq('id', r.id)));
}

// ── Access list (Visitors / approvals) ───────────────────────────────────────

export interface DealAccessRow {
  id: string; dealstudio_id: string; email: string; name: string | null; firm: string | null;
  status: 'pending' | 'approved' | 'passed' | 'revoked'; invited: boolean;
  approved_at: string | null; created_at: string;
  // Deal-flow pipeline fields
  stage: 'lead' | 'reached_out' | 'engaged' | 'committed' | 'passed';
  reached_out_at: string | null;
  committed_amount: number | null;
  committed_at: string | null;
  meeting_at: string | null;
  notes: string | null;
}

export const STAGES: { id: DealAccessRow['stage']; label: string }[] = [
  { id: 'lead', label: 'Lead' },
  { id: 'reached_out', label: 'Reached out' },
  { id: 'engaged', label: 'In talks' },
  { id: 'committed', label: 'Committed' },
  { id: 'passed', label: 'Passed' },
];

export async function adminFetchAccess(roomId: string): Promise<DealAccessRow[]> {
  const { data, error } = await supabase.from('dealstudio_access').select('*').eq('dealstudio_id', roomId).order('created_at', { ascending: false });
  if (error) return [];
  return (data || []) as DealAccessRow[];
}

export async function adminCreateInvestor(roomId: string, patch: Partial<DealAccessRow>): Promise<{ success: boolean }> {
  const { error } = await supabase.from('dealstudio_access').upsert({
    dealstudio_id: roomId,
    email: (patch.email || '').trim().toLowerCase(),
    name: patch.name || null,
    firm: patch.firm || null,
    stage: patch.stage || 'lead',
    reached_out_at: patch.reached_out_at || null,
    notes: patch.notes || '',
    status: 'pending',
  }, { onConflict: 'dealstudio_id,email' });
  return { success: !error };
}

export async function adminUpdateInvestor(id: string, patch: Partial<DealAccessRow>): Promise<{ success: boolean }> {
  const { error } = await supabase.from('dealstudio_access').update(patch).eq('id', id);
  return { success: !error };
}

export async function adminDeleteInvestor(id: string): Promise<{ success: boolean }> {
  const { error } = await supabase.from('dealstudio_access').delete().eq('id', id);
  return { success: !error };
}

export function committedTotal(rows: DealAccessRow[]): number {
  return rows.filter(r => r.stage === 'committed').reduce((s, r) => s + (Number(r.committed_amount) || 0), 0);
}

export async function adminApproveAccess(accessId: string, password: string, status: 'approved' | 'passed' | 'revoked' = 'approved') {
  const { error } = await supabase.rpc('dealstudio_set_access_password', { p_access_id: accessId, p_password: password || null, p_status: status });
  return { success: !error };
}

export async function adminInviteInvestor(roomId: string, email: string, name: string, password: string) {
  const { error } = await supabase.rpc('dealstudio_invite', { p_room_id: roomId, p_email: email.trim().toLowerCase(), p_name: name, p_password: password });
  return { success: !error };
}

export async function adminRevokeAccess(accessId: string) {
  const { error } = await supabase.from('dealstudio_access').update({ status: 'revoked' }).eq('id', accessId);
  return { success: !error };
}

export interface DealVisitRow {
  id: string; email: string | null; session_token: string | null;
  first_seen_at: string; last_seen_at: string;
  page_views: number; deck_views: number; total_seconds: number; sections: Record<string, number>;
}

export async function adminFetchVisits(roomId: string): Promise<DealVisitRow[]> {
  const { data, error } = await supabase.from('dealstudio_visits').select('*').eq('dealstudio_id', roomId).order('last_seen_at', { ascending: false });
  if (error) return [];
  return (data || []) as DealVisitRow[];
}

export interface DealFunnel {
  /** Every page view, counting repeats. One person refreshing five times is 5. */
  views: number;
  /** Distinct people. One person is 1, however often they come back. */
  totalVisitors: number;
  /** Distinct people who opened the deck at least once. */
  deckViewers: number;
  /** Distinct people who came back after their first visit. */
  repeatVisitors: number;
  /** Total deck opens, counting repeats. Kept for the per-person views. */
  deckViews: number;
  active: number; pending: number; passed: number; conversion: number;
}

export async function adminFetchFunnel(roomId: string): Promise<DealFunnel> {
  const empty: DealFunnel = {
    views: 0, totalVisitors: 0, deckViewers: 0, repeatVisitors: 0,
    deckViews: 0, active: 0, pending: 0, passed: 0, conversion: 0,
  };
  try {
    const [{ data: visits }, { data: access }] = await Promise.all([
      supabase.from('dealstudio_visits')
        .select('id,email,session_token,page_views,deck_views')
        .eq('dealstudio_id', roomId),
      supabase.from('dealstudio_access').select('status').eq('dealstudio_id', roomId),
    ]);
    const v = visits || [];
    const a = access || [];

    // Count a person once, not once per session. Identify by email where we have
    // one, otherwise by anonymous session token.
    const identity = (r: any) =>
      r.email ? `e:${String(r.email).toLowerCase().trim()}`
      : r.session_token ? `s:${r.session_token}`
      : `id:${r.id}`;

    const byPerson: Record<string, { pv: number; dv: number }> = {};
    for (const r of v) {
      const k = identity(r);
      const cur = byPerson[k] || { pv: 0, dv: 0 };
      cur.pv += r.page_views || 0;
      cur.dv += r.deck_views || 0;
      byPerson[k] = cur;
    }
    const people = Object.values(byPerson);

    // Views is the raw total, including repeats. Everything below it counts
    // PEOPLE, which is why deck views are not simply summed: one investor
    // opening the deck five times is one person who viewed the deck, not five.
    const views          = people.reduce((s, p) => s + p.pv, 0);
    const deckViews      = people.reduce((s, p) => s + p.dv, 0);
    const totalVisitors  = people.length;
    const deckViewers    = people.filter(p => p.dv > 0).length;
    const repeatVisitors = people.filter(p => p.pv > 1).length;

    const active  = a.filter((r: any) => r.status === 'approved').length;
    const pending = a.filter((r: any) => r.status === 'pending').length;
    const passed  = a.filter((r: any) => r.status === 'passed').length;
    const conversion = totalVisitors ? Math.round((active / totalVisitors) * 100) : 0;

    return { views, totalVisitors, deckViewers, repeatVisitors, deckViews, active, pending, passed, conversion };
  } catch {
    return empty;
  }
}

export function formatBytes(n: number | null): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Per-document analytics (views + average time) ────────────────────────────
// Rides on analytics_events: 'dealstudio_document_open' (one per view) and
// 'dealstudio_document_view' (carries seconds in metadata).

export interface DocStat { views: number; avgSeconds: number; totalSeconds: number }

export async function adminFetchDocStats(roomId: string): Promise<Record<string, DocStat>> {
  const out: Record<string, DocStat> = {};
  try {
    const { data } = await supabase
      .from('analytics_events')
      .select('event_name, metadata')
      .eq('related_company_account_id', roomId)
      .in('event_name', ['dealstudio_document_open', 'dealstudio_deck_view', 'dealstudio_document_view']);
    const times: Record<string, number[]> = {};
    for (const row of (data || []) as any[]) {
      const id = row.metadata?.document_id;
      if (!id) continue;
      if (!out[id]) out[id] = { views: 0, avgSeconds: 0, totalSeconds: 0 };
      if (row.event_name === 'dealstudio_document_open' || row.event_name === 'dealstudio_deck_view') {
        out[id].views += 1;
      } else if (row.event_name === 'dealstudio_document_view') {
        const s = Number(row.metadata?.seconds) || 0;
        out[id].totalSeconds += s;
        (times[id] ||= []).push(s);
      }
    }
    for (const id of Object.keys(out)) {
      const arr = times[id] || [];
      out[id].avgSeconds = arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    }
  } catch { /* best effort */ }
  return out;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

// Per-page deck dwell (DocSend-style), from 'dealstudio_deck_page' events.
export interface PageStat { page: number; views: number; avgSeconds: number }

export async function adminFetchDeckPageStats(roomId: string, deckId: string, email?: string): Promise<PageStat[]> {
  try {
    const { data } = await supabase
      .from('analytics_events')
      .select('metadata')
      .eq('related_company_account_id', roomId)
      .eq('event_name', 'dealstudio_deck_page');
    const acc: Record<number, number[]> = {};
    for (const row of (data || []) as any[]) {
      if (row.metadata?.document_id && row.metadata.document_id !== deckId) continue;
      if (email && (row.metadata?.email || '').toLowerCase() !== email.toLowerCase()) continue;
      const p = Number(row.metadata?.page);
      const s = Number(row.metadata?.seconds) || 0;
      if (!p) continue;
      (acc[p] ||= []).push(s);
    }
    return Object.keys(acc).map(k => {
      const arr = acc[Number(k)];
      return { page: Number(k), views: arr.length, avgSeconds: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) };
    }).sort((a, b) => a.page - b.page);
  } catch {
    return [];
  }
}

/**
 * Captures a demo visitor's email as a lead on the demo deal. Server-side this
 * only writes to a deal flagged demo_mode, so it cannot touch a real customer's
 * investor list. Never throws: a failed capture must not block the visitor.
 */
export async function captureDemoLead(slug: string, email: string, name?: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('capture_demo_lead', {
      p_slug: slug, p_email: email, p_name: name ?? null,
    });
    if (error) { console.warn('[demo] lead capture failed', error.message); return false; }
    return true;
  } catch {
    return false;
  }
}

/* ── Section display order ─────────────────────────────────────────────────── */

/** The sections a founder can reorder. Details is pinned first; Deal Flow and
 *  Settings are admin-only and never appear here. */
export type SectionKey =
  | 'documents' | 'problem' | 'valueprop' | 'market' | 'competition'
  | 'businessmodel' | 'team' | 'articles';

export const SECTION_LABELS: Record<SectionKey, string> = {
  documents: 'Documents',
  problem: 'Problem & Solution',
  valueprop: 'Value Prop',
  market: 'Market',
  competition: 'Competition',
  businessmodel: 'Business Model',
  team: 'Team',
  articles: 'Industry Reading',
};

/**
 * Documents and articles sit at the BOTTOM by default.
 *
 * They are reference material: an investor reaches for them after the argument
 * has landed, not before it. Leading with a pile of files asks someone to do
 * homework before you have given them a reason to.
 */
export const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'problem', 'valueprop', 'team', 'market', 'businessmodel', 'competition',
  'documents', 'articles',
];

/**
 * Reads a stored order and returns a valid one.
 *
 * Drops anything unrecognised and appends anything missing, so a deal saved
 * before a new section existed still shows that section rather than silently
 * hiding it.
 */
export function resolveSectionOrder(raw: unknown): SectionKey[] {
  const seen = new Set<SectionKey>();
  const stored: SectionKey[] = [];

  if (Array.isArray(raw)) {
    for (const k of raw) {
      // Drop anything unrecognised, and dedupe: a repeated key would render the
      // same section twice and collide on its React key.
      if ((DEFAULT_SECTION_ORDER as string[]).includes(k as string) && !seen.has(k as SectionKey)) {
        seen.add(k as SectionKey);
        stored.push(k as SectionKey);
      }
    }
  }

  // Anything missing is appended rather than hidden, so a section added in a
  // later release still shows up for a deal saved before it existed.
  return [...stored, ...DEFAULT_SECTION_ORDER.filter(k => !seen.has(k))];
}

/* ── Viewer controls ───────────────────────────────────────────────────────── */

/** Permanently remove a viewer and their analytics. */
export async function adminDeleteVisit(visitId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_delete_visit', { p_visit: visitId });
  if (error) return false;
  return !!(data as { ok?: boolean })?.ok;
}

/** Keep the viewer, zero their counts. For clearing out your own test views. */
export async function adminResetVisit(visitId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_reset_visit', { p_visit: visitId });
  if (error) return false;
  return !!(data as { ok?: boolean })?.ok;
}

/**
 * Block or unblock a viewer by email.
 *
 * Blocking sets their access status to 'revoked', which is the status the gate
 * already refuses. They are locked out for real, not just hidden from the list.
 */
export async function adminBlockViewer(
  dealId: string,
  email: string,
  blocked: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabase.rpc('admin_block_viewer', {
    p_deal: dealId, p_email: email, p_blocked: blocked,
  });
  if (error) return { ok: false, message: error.message };
  return (data ?? { ok: false }) as { ok: boolean; message?: string };
}

/* ── Deal people (pipeline + viewers, merged) ──────────────────────────────── */

/**
 * The pipeline stage. NOT the same thing as access status.
 *
 * `stage` is where someone is in the raise. `status` (elsewhere) is whether the
 * gate lets them in. Marking someone "passed" must not lock them out, and
 * blocking someone must not wipe their stage, so the two never merged.
 */
export type DealStage =
  | 'prospect' | 'met' | 'viewed' | 'lead' | 'interested'
  | 'negotiating' | 'committed' | 'closed' | 'passed';

export const STAGE_LABEL: Record<DealStage, string> = {
  prospect: 'Prospect',
  met: 'Met',
  viewed: 'Viewed deal',
  lead: 'Lead',
  interested: 'Interested',
  negotiating: 'Negotiating',
  committed: 'Committed',
  closed: 'Closed',
  passed: 'Passed',
};

export const STAGE_ORDER: DealStage[] = [
  'prospect', 'met', 'viewed', 'lead', 'interested',
  'negotiating', 'committed', 'closed', 'passed',
];

/** A pipeline row from ANY of the org's deals, tagged with which deal. Powers
 *  the cross-deal Deal Flow page. */
export type OrgPerson = {
  deal_id: string;
  deal_slug: string;
  deal_company: string | null;
  access_id: string | null;
  email: string | null;
  name: string | null;
  company_name: string | null;
  company_logo: string | null;
  contact_photo: string | null;
  linkedin: string | null;
  website: string | null;
  stage: DealStage;
  blocked: boolean;
  visits: number;
  total_seconds: number;
  deck_views: number;
  doc_views: number;
  last_seen: string | null;
  committed: number;
  note_count: number;
};

/** Every person across every deal the caller's org owns. One RPC, not one per
 *  deal. Returns [] if migration 0052 has not run, rather than throwing. */
export async function fetchOrgPeople(): Promise<OrgPerson[]> {
  const { data, error } = await supabase.rpc('admin_org_people');
  if (error) { console.warn('[dealStudio] org people', error); return []; }
  return (data ?? []) as OrgPerson[];
}

export type DealPerson = {
  access_id: string | null;
  visit_id: string | null;
  email: string | null;
  name: string | null;
  company_name: string | null;
  company_logo: string | null;
  contact_photo: string | null;
  linkedin: string | null;
  website: string | null;
  stage: DealStage;
  blocked: boolean;
  share_token: string | null;
  visits: number;
  total_seconds: number;
  deck_views: number;
  doc_views: number;
  sections: Record<string, number>;
  last_seen: string | null;
  committed: number;
  note_count: number;
  /** When the most recent note was written. Null when there are none. */
  last_note_at: string | null;
  forwards: number;
};

export type DealNote = {
  id: string;
  body: string;
  kind: 'note' | 'stage';
  created_at: string;
  updated_at: string | null;
  /** Who wrote it. Name if they set one, otherwise their email. Null on notes
   *  written before the author was recorded. */
  author: string | null;
};

/**
 * Null means the call FAILED. An empty array means the deal genuinely has nobody
 * on it. These were the same value, and that hid a real outage: when
 * admin_deal_people is missing from the database (migrations 0036, 0037 and 0041
 * install it), the RPC 404s, this returned [], and Deal Flow rendered "Nobody is
 * on this deal yet" over a deal with hundreds of recorded views. A missing
 * migration must not look like an empty pipeline.
 */
export type DealPeopleResult = {
  /** Null means the call FAILED. Empty array means the deal genuinely has nobody. */
  people: DealPerson[] | null;
  /** The database's own words, so the screen can say what is wrong instead of spinning. */
  message?: string;
};

export interface PlatformInvestorDeal {
  slug: string;
  company: string | null;
  status: string;
  page_views: number;
  deck_views: number;
  document_views: number;
  total_seconds: number;
  last_seen: string | null;
}

export interface PlatformInvestor {
  email: string;
  name: string | null;
  company_name: string | null;
  company_logo: string | null;
  contact_photo: string | null;
  linkedin: string | null;
  website: string | null;
  deal_count: number;
  deals: PlatformInvestorDeal[];
  total_visits: number;
  last_login: string | null;
}

/**
 * Every investor across every deal on the platform. Master admin only; the RPC
 * raises 'not authorized' for anyone else, so this is not a permission the UI
 * grants, it is one the database enforces.
 */
export async function adminAllInvestors(): Promise<PlatformInvestor[]> {
  const { data, error } = await supabase.rpc('admin_all_investors');
  if (error) { console.warn('[dealStudio] all investors', error); return []; }
  return (data ?? []) as PlatformInvestor[];
}

export async function fetchDealPeople(dealId: string): Promise<DealPeopleResult> {
  const { data, error } = await supabase.rpc('admin_deal_people', { p_deal: dealId });
  if (error) {
    console.warn('[dealStudio] people', error);
    // Postgres says exactly what is missing. Swallowing that and showing a
    // spinner, or an empty pipeline, cost hours: "function owns_deal does not
    // exist" and "relation dealstudio_notes does not exist" are the whole answer
    // and they were only visible in a collapsed console object.
    return { people: null, message: [error.code, error.message].filter(Boolean).join(': ') };
  }
  return { people: (data ?? []) as DealPerson[] };
}

/**
 * Add someone to the pipeline by hand.
 *
 * Not an upsert. The uniqueness rule on this table is an expression index on
 * (dealstudio_id, lower(email)), and PostgREST cannot target an expression index
 * with on_conflict, so an upsert here fails at the database. A plain insert is
 * used and the duplicate comes back as 23505, which is the honest answer anyway:
 * that person is already on this deal.
 *
 * Returns the new access id, because the caller usually has a note to file
 * against it, and a note needs a row to hang on.
 *
 * The stage is set directly on the insert and NOT through admin_set_stage. That
 * function demands a note explaining the change, and rightly so, but this is not
 * a change: it is where the person starts. Access status stays 'pending' either
 * way, because putting someone in your pipeline is not the same as letting them
 * into the room.
 */
export async function createDealPerson(
  dealId: string,
  patch: {
    email: string;
    name?: string | null;
    company_name?: string | null;
    company_logo?: string | null;
    contact_photo?: string | null;
    linkedin?: string | null;
    website?: string | null;
    stage?: DealStage;
  },
): Promise<{ ok: boolean; id?: string; message?: string }> {
  const { data, error } = await supabase
    .from('dealstudio_access')
    .insert({
      dealstudio_id: dealId,
      email: patch.email.trim().toLowerCase(),
      name: patch.name?.trim() || null,
      company_name: patch.company_name?.trim() || null,
      company_logo: patch.company_logo?.trim() || null,
      contact_photo: patch.contact_photo?.trim() || null,
      linkedin: patch.linkedin?.trim() || null,
      website: patch.website?.trim() || null,
      stage: patch.stage || 'lead',
      status: 'pending',
    })
    .select('id')
    .single();

  if (!error) return { ok: true, id: data?.id as string };
  if (error.code === '23505') return { ok: false, message: 'That email is already on this deal.' };
  return { ok: false, message: error.message };
}

/**
 * The access row for this person, creating it if they only ever existed as a
 * visit.
 *
 * Someone who opened the room has no dealstudio_access row until a founder adds
 * them by hand, and every write in the people table hangs off that row: notes,
 * stage, committed amount, their name. So the table showed them, and then refused
 * to let anyone touch them ("This viewer has no pipeline record yet"), which is
 * backwards. Opening the deck IS being in the pipeline.
 *
 * The stage passed in is the one already showing on their row, so making them
 * writable never silently moves them: a viewer stays Viewed deal.
 */
export async function ensureDealPerson(
  dealId: string, email: string, stage: DealStage = 'viewed',
): Promise<string | null> {
  const addr = email.trim().toLowerCase();
  if (!addr) return null;

  const { data: found } = await supabase
    .from('dealstudio_access')
    .select('id')
    .eq('dealstudio_id', dealId)
    .ilike('email', addr)
    .maybeSingle();
  if (found?.id) return found.id as string;

  const { data, error } = await supabase
    .from('dealstudio_access')
    .insert({ dealstudio_id: dealId, email: addr, stage, status: 'pending' })
    .select('id')
    .single();
  if (error) { console.warn('[dealStudio] ensurePerson', error); return null; }
  return (data?.id as string) ?? null;
}

/** Change someone's stage. A note is required, and the change is recorded. */
export async function setDealStage(
  accessId: string, stage: DealStage, note: string,
): Promise<{ ok: boolean; message?: string }> {
  const { data, error } = await supabase.rpc('admin_set_stage', {
    p_access: accessId, p_stage: stage, p_note: note,
  });
  if (error) return { ok: false, message: error.message };
  return (data ?? { ok: false }) as { ok: boolean; message?: string };
}

export async function fetchDealNotes(accessId: string): Promise<DealNote[]> {
  const { data, error } = await supabase.rpc('admin_deal_notes', { p_access: accessId });
  if (error) return [];
  return (data ?? []) as DealNote[];
}

/**
 * Through an RPC, not a table insert. A browser cannot set auth.uid(), so the
 * client-side insert left `author` null on every hand-written note, and the notes
 * history could not say who said it. The database writes the author now, and the
 * client is no longer able to write a note without one.
 */
export async function addDealNote(accessId: string, body: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('admin_add_note', {
    p_access: accessId, p_body: body,
  });
  if (error) { console.warn('[dealStudio] addNote', error); return false; }
  return !!(data as { ok?: boolean })?.ok;
}

export async function editDealNote(noteId: string, body: string): Promise<boolean> {
  const { error } = await supabase
    .from('dealstudio_notes')
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq('id', noteId);
  return !error;
}

export async function deleteDealNote(noteId: string): Promise<boolean> {
  const { error } = await supabase.from('dealstudio_notes').delete().eq('id', noteId);
  return !error;
}

/** Add or update the details a founder keeps about a person. */
export async function saveDealPerson(
  accessId: string,
  patch: Partial<Pick<DealPerson, 'name' | 'company_name' | 'company_logo' | 'contact_photo' | 'linkedin' | 'website'>>,
): Promise<boolean> {
  const { error } = await supabase.from('dealstudio_access').update(patch).eq('id', accessId);
  return !error;
}

/**
 * What they committed. This is the number the Raised tile adds up, and the one
 * the investor room shows when the founder chose to display it, so it has to be
 * editable from the people table: the old pipeline card was the only place it
 * could be set, and that card is gone.
 *
 * Clearing it clears the date with it. A commitment with no amount and an amount
 * with no date are both half a record.
 */
export async function setDealCommitted(accessId: string, amount: number | null): Promise<boolean> {
  const { error } = await supabase
    .from('dealstudio_access')
    .update({
      committed_amount: amount,
      committed_at: amount == null ? null : new Date().toISOString(),
    })
    .eq('id', accessId);
  return !error;
}

/**
 * Remove someone entirely: their pipeline row AND their analytics.
 *
 * Two tables, because a person can exist in either. Deleting only the access row
 * would leave their visits behind, and they would reappear in the table on the
 * next load as a viewer with no name.
 */
export async function deleteDealPerson(
  accessId: string | null, visitId: string | null,
): Promise<boolean> {
  let ok = true;
  if (visitId) ok = await adminDeleteVisit(visitId) && ok;
  if (accessId) ok = (await adminDeleteInvestor(accessId)).success && ok;
  return ok;
}

/**
 * Someone's personal link.
 *
 * Every distinct browser that opens it is recorded. The first is presumed to be
 * them; the rest are people the link reached that we never sent it to. That is a
 * FORWARD, and it is a proxy, not a measurement: the same investor on a phone
 * and a laptop looks like one forward, and a forward nobody opens looks like
 * none. Never present it as "shares".
 */
export function inviteUrl(handle: string | null, slug: string, token: string): string {
  // WEB_ORIGIN, not window.location.origin: this link goes in an email and gets
  // opened on someone else's device, so it must be the public site even when the
  // founder generated it from inside the native app.
  const base = handle ? webUrl(`/${handle}/${slug}`) : webUrl(`/d/${slug}`);
  return `${base}?i=${token}`;
}

/** Called by the investor page when it is opened with ?i={token}. */
export async function trackInviteOpen(token: string, session: string): Promise<void> {
  await supabase.rpc('track_invite_open', { p_token: token, p_session: session });
}

/**
 * The live committed total for a public deal room.
 *
 * Returns null unless the founder chose to display it. The server enforces that,
 * not the client: a number the founder never chose to show should not be sitting
 * in the payload for anyone who opens dev tools.
 */
export async function fetchCommittedTotal(slug: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('deal_committed_total', { p_slug: slug });
  if (error) return null;
  return data == null ? null : Number(data);
}
