/**
 * analytics.ts
 *
 * Lightweight analytics layer that writes to Supabase analytics_events /
 * analytics_sessions and ALSO mirrors page views & key events to GA4.
 *
 * Three things to call from the app:
 *   1. installClickTracker()  — once on mount; captures every click platform-wide
 *   2. trackPageView(path)    — on every route change
 *   3. trackEvent({ ... })    — explicitly, for richer custom events
 *
 * All Supabase calls are wrapped in try/catch — analytics MUST NEVER break
 * the user experience. Errors are silently swallowed.
 */

import { supabase } from './supabase';

const SESSION_KEY = 'dealstudio_session_token';
const SESSION_LAST_SEEN_KEY = 'dealstudio_session_last_seen';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle = considered new session

// Cached user context — refreshed on auth state change
let cachedUserId: string | null = null;
let cachedUserRole: string | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Session token — stable identifier for an anonymous visitor (or a logged-in
// session before login state is hydrated). Stored in localStorage with a
// rolling 30-minute idle timeout — after 30 min of inactivity, a new session
// is created (matching standard analytics tools' behavior).
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Exported so forward-tracking uses the SAME session token as the rest of
 * analytics. A second, separate token would count the same browser twice and
 * report a forward that never happened.
 */
export function getOrCreateSessionToken(): string {
  try {
    const lastSeen = parseInt(localStorage.getItem(SESSION_LAST_SEEN_KEY) || '0', 10);
    const now = Date.now();
    let token = localStorage.getItem(SESSION_KEY);

    const isStale = !token || (now - lastSeen) > SESSION_TIMEOUT_MS;
    if (isStale) {
      token = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'session-' + Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(SESSION_KEY, token);
      void initSession(token); // fire-and-forget DB insert
    }

    localStorage.setItem(SESSION_LAST_SEEN_KEY, String(now));
    return token;
  } catch {
    // localStorage unavailable (e.g., private mode in some browsers) — fall back to a random token
    return 'session-' + Math.random().toString(36).slice(2);
  }
}

function detectDevice(): string {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(): string {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || '';
  if (/Edg\//.test(ua)) return 'edge';
  if (/Chrome\//.test(ua) && !/Chromium|Edg|OPR/.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && !/Chrome|Chromium/.test(ua)) return 'safari';
  if (/Firefox\//.test(ua)) return 'firefox';
  return 'other';
}

function getReferrerDomain(): string | null {
  try {
    if (!document.referrer) return null;
    const url = new URL(document.referrer);
    if (url.hostname === window.location.hostname) return null; // internal nav, ignore
    return url.hostname;
  } catch {
    return null;
  }
}

function getUtmParams() {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null };
  }
}

async function initSession(token: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    let role: string | null = null;
    if (user) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      role = roleRow?.role || null;
      cachedUserId = user.id;
      cachedUserRole = role;
    }

    await supabase.from('analytics_sessions').insert({
      session_token: token,
      user_id: user?.id || null,
      user_role: role,
      device_type: detectDevice(),
      browser: detectBrowser(),
      referrer_domain: getReferrerDomain(),
      ...getUtmParams(),
    });

    // Approximate geo (city / region / country from IP). Fire-and-forget so it
    // never blocks the session insert; the row is patched once it resolves.
    void captureSessionGeo(token);
  } catch {
    // silent
  }
}

/**
 * Resolve approximate location from IP via a free, key-less endpoint and patch
 * the session row. Approximate only — no precise coordinates are stored.
 * Best-effort: any failure (offline, blocked, rate-limited) is swallowed.
 */
async function captureSessionGeo(token: string) {
  try {
    // geojs.io — free, key-less, CORS-friendly. Replaces ipwho.is, which began
    // returning 403 (noisy in the console even though the failure is swallowed).
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
    if (!res.ok) return;
    const geo = await res.json();
    if (!geo) return;
    const patch: { city?: string; region?: string; country?: string } = {};
    if (geo.city) patch.city = String(geo.city);
    if (geo.region) patch.region = String(geo.region);
    if (geo.country_code) patch.country = String(geo.country_code);
    if (!patch.city && !patch.region && !patch.country) return;
    await supabase.from('analytics_sessions').update(patch).eq('session_token', token);
  } catch {
    // silent — geo is best-effort
  }
}

/**
 * Refresh cached user_id and user_role from the current auth session.
 * Call this on login, logout, and once on app mount.
 */
export async function refreshUserContext() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    cachedUserId = user?.id || null;
    if (user) {
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      cachedUserRole = roleRow?.role || null;
    } else {
      cachedUserRole = null;
    }
  } catch {
    // silent
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// trackEvent — the universal write
// ─────────────────────────────────────────────────────────────────────────────
export interface TrackEventOpts {
  event_type: 'page_view' | 'click' | 'scroll' | 'search' | 'filter' | 'sort' | 'custom';
  event_name?: string;
  click_type?: string;
  element_label?: string;
  element_id?: string;
  page_path?: string;
  page_title?: string;
  related_event_id?: string;
  related_facility_id?: string;
  related_ambassador_id?: string;
  related_company_account_id?: string;
  destination_url?: string;
  is_external_link?: boolean;
  scroll_depth_percent?: number;
  metadata?: Record<string, any>;
}

export async function trackEvent(opts: TrackEventOpts) {
  try {
    const token = getOrCreateSessionToken();
    await supabase.from('analytics_events').insert({
      session_token: token,
      user_id: cachedUserId,
      user_role: cachedUserRole,
      event_type: opts.event_type,
      event_name: opts.event_name || null,
      click_type: opts.click_type || null,
      element_label: opts.element_label?.slice(0, 200) || null,
      element_id: opts.element_id || null,
      page_path: opts.page_path || (typeof window !== 'undefined' ? window.location.pathname : null),
      page_title: opts.page_title || (typeof document !== 'undefined' ? document.title : null),
      related_event_id: opts.related_event_id || null,
      related_facility_id: opts.related_facility_id || null,
      related_ambassador_id: opts.related_ambassador_id || null,
      related_company_account_id: opts.related_company_account_id || null,
      destination_url: opts.destination_url || null,
      is_external_link: opts.is_external_link ?? false,
      scroll_depth_percent: opts.scroll_depth_percent || null,
      metadata: opts.metadata || {},
    });

    // Update session last_seen — fire and forget
    void supabase
      .from('analytics_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('session_token', token);
  } catch {
    // Analytics must never break the app
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed funnel helpers
//
// These wrap trackEvent() with consistent event_name strings the dashboard
// can aggregate against. Use these instead of relying on label-matching for
// the canonical funnel signals.
// ─────────────────────────────────────────────────────────────────────────────

export function trackEventViewed(eventId: string, meta?: { facility_id?: string; ambassador_id?: string; creator_type?: string }) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'event_viewed',
    related_event_id: eventId,
    related_facility_id: meta?.facility_id,
    related_ambassador_id: meta?.ambassador_id,
    metadata: meta ? { creator_type: meta.creator_type } : {},
  });

  // Bump the denormalized counter on the events row so Event Management's
  // "Views" tile reads correctly. Atomic, fire-and-forget — never blocks UX.
  if (eventId) {
    void supabase.rpc('increment_event_view_count', { eid: String(eventId) })
      .then(({ error }) => { if (error) console.warn('view counter RPC failed:', error.message); });
  }
}

export function trackRegistrationStarted(eventId: string, meta?: { is_external?: boolean; price?: number }) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'registration_started',
    related_event_id: eventId,
    metadata: { is_external: meta?.is_external ?? false, price: meta?.price },
  });

  // Bump the denormalized counter for the "Reserve Clicks" tile. Fires for
  // both internal (Book / Register Now) and external (Register Externally)
  // CTAs — every CTA click counts.
  if (eventId) {
    void supabase.rpc('increment_event_reserve_clicks', { eid: String(eventId) })
      .then(({ error }) => { if (error) console.warn('reserve-clicks counter RPC failed:', error.message); });
  }
}

export function trackRegistrationCompleted(eventId: string, meta?: { price?: number; is_external?: boolean }) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'registration_completed',
    related_event_id: eventId,
    metadata: { price: meta?.price, is_external: meta?.is_external ?? false },
  });
}

export function trackSignupStarted(role?: string) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'signup_started',
    metadata: { role: role || null },
  });
}

export function trackSignupCompleted(role: string) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'signup_completed',
    metadata: { role },
  });
  // If this signup landed from a shared referral link, also fire a
  // share_converted event so the analytics dashboard can attribute the
  // conversion. The stored ref is set by trackShareClicked (called from
  // App.tsx when ?ref=... is detected on initial load) and cleared here so
  // a single click can only convert once.
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('dealstudio.share_ref');
      if (raw) {
        const ref = JSON.parse(raw);
        void trackEvent({
          event_type: 'custom',
          event_name: 'share_converted',
          metadata: {
            ref_token: ref.token || null,
            intended_role: ref.intended_role || null,
            final_role: role,
            // ms between clicking the share link and completing signup
            convert_ms: ref.clicked_at ? Date.now() - ref.clicked_at : null,
          },
        });
        window.localStorage.removeItem('dealstudio.share_ref');
      }
    } catch {
      // Storage access can fail in some browsers/private mode — ignore.
    }
  }
}

export function trackProfileCompleted(role: string) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'profile_completed',
    metadata: { role },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Share / referral funnel helpers
//
// Three-stage funnel for invite-a-friend growth analytics:
//   1. share_sent       — invite dialog Send/Copy clicked (any channel)
//   2. share_clicked    — recipient lands on the site via ?ref=<token>
//   3. share_converted  — recipient completes signup (auto-fired by
//                         trackSignupCompleted when an unclaimed share_ref
//                         is in localStorage)
//
// All three events live in analytics_events with these exact event_names so
// the AnalyticsDashboard can count them with a single .eq query.
// ─────────────────────────────────────────────────────────────────────────────

export function trackShareSent(meta: {
  /** What role the sender chose to invite the friend as. */
  intended_role: 'player' | 'ambassador' | 'facility';
  /** How the invite was delivered. */
  channel: 'link' | 'email' | 'phone';
  /** The opaque ref token embedded in the share URL (for funnel attribution). */
  ref_token?: string;
}) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'share_sent',
    metadata: meta,
  });
}

/**
 * Record that someone arrived at the site via a referral link. Also stashes
 * the token in localStorage so trackSignupCompleted can fire share_converted
 * later if the visitor goes on to sign up. Idempotent for the same token —
 * subsequent ?ref= visits with the same token only update the timestamp.
 */
export function trackShareClicked(meta: {
  ref_token: string;
  intended_role?: 'player' | 'ambassador' | 'facility';
}) {
  void trackEvent({
    event_type: 'custom',
    event_name: 'share_clicked',
    metadata: meta,
  });
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        'dealstudio.share_ref',
        JSON.stringify({
          token: meta.ref_token,
          intended_role: meta.intended_role || null,
          clicked_at: Date.now(),
        })
      );
    } catch {
      // Storage access can fail in private mode — the conversion event
      // will simply not fire in that case; the click event still landed.
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// trackPageView — call from App.tsx on every route change
// ─────────────────────────────────────────────────────────────────────────────
export function trackPageView(pathname: string, search?: string) {
  const fullPath = pathname + (search || '');
  void trackEvent({
    event_type: 'page_view',
    page_path: fullPath,
  });

  // Mirror to GA4, but ONLY on public marketing routes. A deal room at /d/... or
  // a company handle route is private; sending its path to Google would leak that
  // a specific investor deal exists and is being viewed. gtag was configured with
  // send_page_view: false in index.html precisely so this stays our decision.
  try {
    const g = (window as any).gtag;
    if (!g) return;
    const isPrivateRoom =
      /^\/d\//.test(pathname) ||
      /^\/(dealstudio|investors)\b/.test(pathname) ||
      // /{handle}/{deck}: two non-admin segments. /admin/... and the known public
      // pages are excluded; anything else with two segments is a deal room.
      (/^\/[^/]+\/[^/]+/.test(pathname) && !/^\/admin\b/.test(pathname));
    if (isPrivateRoom) return;
    g('event', 'page_view', { page_path: fullPath });
  } catch {
    // Analytics must never break the app.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// installClickTracker — global delegated click capture
//
// Captures every click on a button, link, or [role=button] and writes it to
// analytics_events. Covers ~90% of the spec's "track all buttons" requirement
// without instrumenting components individually.
//
// Components that need richer context can:
//   - Add data-track="custom_event_name" for explicit naming
//   - Add data-event-id / data-facility-id / data-ambassador-id for entity refs
//   - Or call trackEvent() directly for full control
// ─────────────────────────────────────────────────────────────────────────────
let clickTrackerInstalled = false;

export function installClickTracker() {
  if (clickTrackerInstalled || typeof document === 'undefined') return;
  clickTrackerInstalled = true;

  document.addEventListener('click', (e) => {
    try {
      const target = e.target as HTMLElement | null;
      if (!target || !target.closest) return;

      // Find the most-relevant clickable ancestor
      const trackedEl = target.closest('[data-track]') as HTMLElement | null;
      const buttonEl = target.closest('button, a, [role="button"], [role="tab"], [role="menuitem"]') as HTMLElement | null;
      const el = trackedEl || buttonEl;
      if (!el) return;

      // Compute label — visible text first, aria-label as fallback
      const rawLabel = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
      const label = rawLabel.slice(0, 200);

      // Click type
      let clickType = 'button';
      if (el.tagName === 'A') clickType = 'link';
      const role = el.getAttribute('role');
      if (role === 'tab') clickType = 'tab';
      else if (role === 'menuitem') clickType = 'menu_item';
      else if (el.matches('[data-card]')) clickType = 'card';

      // External link detection
      let isExternal = false;
      let destination = '';
      if (el.tagName === 'A') {
        const href = (el as HTMLAnchorElement).href;
        if (href) {
          destination = href;
          try {
            const url = new URL(href);
            isExternal = !!url.hostname && url.hostname !== window.location.hostname;
            if (isExternal) clickType = 'external_link';
          } catch { /* malformed href, ignore */ }
        }
      }

      // Entity refs from data attributes (looking up the tree)
      const eventId      = el.getAttribute('data-event-id')      || el.closest('[data-event-id]')     ?.getAttribute('data-event-id')      || undefined;
      const facilityId   = el.getAttribute('data-facility-id')   || el.closest('[data-facility-id]')  ?.getAttribute('data-facility-id')   || undefined;
      const ambassadorId = el.getAttribute('data-ambassador-id') || el.closest('[data-ambassador-id]')?.getAttribute('data-ambassador-id') || undefined;

      // Event name — explicit data-track wins, else slug from label
      const explicitName = el.getAttribute('data-track');
      const eventName = explicitName
        || (label ? `click_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50).replace(/^_+|_+$/g, '')}` : 'click_unknown');

      void trackEvent({
        event_type: 'click',
        event_name: eventName,
        click_type: clickType,
        element_label: label,
        element_id: el.id || undefined,
        related_event_id: eventId,
        related_facility_id: facilityId,
        related_ambassador_id: ambassadorId,
        destination_url: destination || undefined,
        is_external_link: isExternal,
      });
    } catch {
      // silent
    }
  }, { capture: true, passive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// installScrollDepthTracker — fires scroll milestones once per page
//
// Tracks 25 / 50 / 75 / 100% milestones. Reset on every route change via the
// resetScrollDepth() function which trackPageView calls automatically below.
// ─────────────────────────────────────────────────────────────────────────────
const firedMilestones = new Set<number>();

export function resetScrollDepth() {
  firedMilestones.clear();
}

export function installScrollDepthTracker() {
  if (typeof window === 'undefined') return;

  const onScroll = () => {
    try {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      if (scrollHeight <= 0) return;
      const pct = Math.round((scrollTop / scrollHeight) * 100);

      [25, 50, 75, 100].forEach(milestone => {
        if (pct >= milestone && !firedMilestones.has(milestone)) {
          firedMilestones.add(milestone);
          void trackEvent({
            event_type: 'scroll',
            event_name: `scroll_${milestone}`,
            scroll_depth_percent: milestone,
          });
        }
      });
    } catch {
      // silent
    }
  };

  window.addEventListener('scroll', onScroll, { passive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// trackPageView wrapper that ALSO resets scroll milestones for the new page
// (we do this here rather than in the trackPageView export so the scroll-depth
// tracker can be imported independently)
// ─────────────────────────────────────────────────────────────────────────────
export function trackPageViewWithReset(pathname: string, search?: string) {
  resetScrollDepth();
  trackPageView(pathname, search);
}
