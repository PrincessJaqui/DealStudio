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
export interface DealArticle { title: string; source: string; url: string; date: string; description?: string; image?: string; hideImage?: boolean; }
export type CalcUnit = 'currency' | 'percentage';
export type CalcFreq = 'monthly' | 'yearly' | 'per_event';
export interface ImpactedTier { id: string; tierName: string; unitType: CalcUnit; presetAmount: number; frequency: CalcFreq; }
export interface PricingTier {
  id: string; tierName: string; unitType: CalcUnit; presetAmount: number; frequency: CalcFreq;
  customerName: string; quantity: number; avgValue?: number;
  impacts?: boolean; impactedTiers?: ImpactedTier[];
}
export interface RevenueStream { id: string; name: string; details: string; target: number; tiers: PricingTier[]; }
export interface DealBusinessModel { revenues: RevenueStream[]; annualGrowthRate: number; }

const periodToMonthly = (freq: CalcFreq, totalPerPeriod: number): number =>
  freq === 'monthly' ? totalPerPeriod : totalPerPeriod / 12;
const unitRevenue = (unit: CalcUnit, amount: number, avgValue: number): number =>
  unit === 'percentage' ? (amount / 100) * avgValue : amount;

export function tierMonthlyRevenue(t: PricingTier): number {
  const q = t.quantity || 0;
  const av = t.avgValue || 0;
  let monthly = periodToMonthly(t.frequency, unitRevenue(t.unitType, t.presetAmount || 0, av) * q);
  if (t.impacts) for (const it of (t.impactedTiers || [])) {
    monthly += periodToMonthly(it.frequency, unitRevenue(it.unitType, it.presetAmount || 0, av) * q);
  }
  return monthly;
}
export function revenueMonthly(r: RevenueStream): number {
  return (r.tiers || []).reduce((s, t) => s + tierMonthlyRevenue(t), 0);
}
export interface ModelTotals {
  revenues: { id: string; name: string; monthly: number; annual: number; pctOfTotal: number }[];
  totalMonthly: number; totalAnnual: number; totalUsers: number; revenuePerUser: number;
  growth: { year: number; users: number; monthly: number; annual: number }[];
}
export function computeBusinessModel(m: DealBusinessModel): ModelTotals {
  const revs = (m.revenues || []).map(r => {
    const monthly = revenueMonthly(r);
    return { id: r.id, name: r.name || 'Revenue', monthly, annual: monthly * 12 };
  });
  const totalMonthly = revs.reduce((s, r) => s + r.monthly, 0);
  const totalAnnual = totalMonthly * 12;
  const totalUsers = (m.revenues || []).reduce((s, r) => s + (r.tiers || []).reduce((q, t) => q + (t.quantity || 0), 0), 0);
  const revenuePerUser = totalUsers > 0 ? totalAnnual / totalUsers : 0;
  const revenues = revs.map(r => ({ ...r, pctOfTotal: totalAnnual > 0 ? (r.annual / totalAnnual) * 100 : 0 }));
  const g = (m.annualGrowthRate || 0) / 100;
  const growth = [1, 2, 3, 4].map(year => {
    const factor = Math.pow(1 + g, year - 1);
    return { year, users: Math.round(totalUsers * factor), monthly: totalMonthly * factor, annual: totalAnnual * factor };
  });
  return { revenues, totalMonthly, totalAnnual, totalUsers, revenuePerUser, growth };
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
export interface DealTeamMember { name: string; role: string; bio: string; photo_url: string; links: DealSource[]; resume_url?: string; resume_name?: string; }

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
  field_labels?: Record<string, string> | null;
  hq_lat: number | null;
  hq_lng: number | null;
  tags: string[];
  industries: DealIndustry[];
  summary_html: string;
  hero_image_url: string | null;
  deck_document_id: string | null;
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
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } });
    if (error || !data || (data as any).error) return null;
    return data as LinkPreview;
  } catch {
    return null;
  }
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
  total_raised: 'Total Raised',
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

export interface DealValueProp {
  headline: string;      // the one line an investor should remember
  problem: string;
  solution: string;
  pillars: DealValuePillar[];
}

export const EMPTY_VALUE_PROP: DealValueProp = {
  headline: '', problem: '', solution: '', pillars: [],
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

/** Roll a visitor's session activity up into dealstudio_visits (best effort). */
export async function recordDealVisit(slug: string, email: string | null, sections: Record<string, number>, totalSeconds: number, deckViews: number) {
  try {
    await rpcAnon('dealstudio_record_visit', {
      p_slug: slug,
      p_email: email,
      p_sections: sections,
      p_total_seconds: Math.round(totalSeconds),
      p_deck_views: deckViews,
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

export async function uploadDealFile(file: File): Promise<{ url: string; size: number; name: string } | null> {
  const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
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

export interface DealFunnel { pageViews: number; deckViews: number; repeatVisits: number; totalVisitors: number; active: number; pending: number; passed: number; conversion: number; }

export async function adminFetchFunnel(roomId: string): Promise<DealFunnel> {
  const empty: DealFunnel = { pageViews: 0, deckViews: 0, repeatVisits: 0, totalVisitors: 0, active: 0, pending: 0, passed: 0, conversion: 0 };
  try {
    const [{ data: visits }, { data: access }] = await Promise.all([
      supabase.from('dealstudio_visits').select('id,email,session_token,page_views,deck_views').eq('dealstudio_id', roomId),
      supabase.from('dealstudio_access').select('status').eq('dealstudio_id', roomId),
    ]);
    const v = visits || [];
    const a = access || [];
    const pageViews = v.reduce((s: number, r: any) => s + (r.page_views || 0), 0);
    const deckViews = v.reduce((s: number, r: any) => s + (r.deck_views || 0), 0);
    // Count a person once, not once per login/session. Identify by email when
    // present, otherwise by anonymous session token, otherwise the row itself.
    const identity = (r: any) =>
      r.email ? `e:${String(r.email).toLowerCase().trim()}`
      : r.session_token ? `s:${r.session_token}`
      : `id:${r.id}`;
    const pvByPerson: Record<string, number> = {};
    for (const r of v) {
      const k = identity(r);
      pvByPerson[k] = (pvByPerson[k] || 0) + (r.page_views || 0);
    }
    const totalVisitors = Object.keys(pvByPerson).length;
    // A repeat visitor is one person with more than one page view across visits.
    const repeatVisits = Object.values(pvByPerson).filter((n) => n > 1).length;
    const active = a.filter((r: any) => r.status === 'approved').length;
    const pending = a.filter((r: any) => r.status === 'pending').length;
    const passed = a.filter((r: any) => r.status === 'passed').length;
    const conversion = totalVisitors ? Math.round((active / totalVisitors) * 100) : 0;
    return { pageViews, deckViews, repeatVisits, totalVisitors, active, pending, passed, conversion };
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
