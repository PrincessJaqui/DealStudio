/**
 * Billing + platform-admin data access. Money never moves through our code:
 * Stripe hosts checkout and the card portal, and the webhook is the only writer
 * of subscription state.
 */
import { webUrl } from './runtime';
import { supabase } from './supabase';

export type Plan = {
  id: string; name: string; price_cents: number; currency: string;
  interval: string; stripe_price_id: string | null; description: string; is_active: boolean;
};

export type Txn = {
  id: string; created_at: string; event_name: string; org_name: string | null;
  customer_email: string | null; stripe_invoice_id: string | null;
  amount_cents: number; currency: string; status: string; kind: string;
};

export type AdminOrg = {
  id: string; name: string;
  logo_url: string | null;
  handle: string | null;
  /** From user metadata. Null for anyone who signed up without giving a name. */
  owner_name: string | null;
  owner_email: string | null; owner_id: string | null;
  plan: string; plan_id: string | null; plan_name: string | null;
  subscription_status: string; suspended: boolean; comped: boolean;
  trial_ends_at: string; deal_count: number; created_at: string;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ''}` };
}

/** Starts Stripe Checkout and returns the URL to send the user to. */
export async function startCheckout(): Promise<string> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Could not start checkout');
  return json.url;
}

/** Opens the Stripe billing portal (update card, invoices, cancel). */
export async function openBillingPortal(): Promise<string> {
  const res = await fetch('/api/stripe/portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Could not open billing portal');
  return json.url;
}

export async function fetchPlans(): Promise<Plan[]> {
  const { data } = await supabase.from('plans').select('*').order('price_cents');
  return (data as Plan[]) ?? [];
}

export async function savePlan(p: Partial<Plan> & { id?: string }) {
  if (p.id) {
    const { error } = await supabase.from('plans').update(p).eq('id', p.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('plans').insert(p);
    if (error) throw error;
  }
}

export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) return false;
  return Boolean(data);
}

export async function adminListOrgs(): Promise<AdminOrg[]> {
  const { data, error } = await supabase.rpc('admin_list_orgs');
  if (error) { console.warn('[admin] orgs', error); return []; }
  return (data as AdminOrg[]) ?? [];
}

export async function adminUpdateOrg(orgId: string, patch: {
  suspended?: boolean; comped?: boolean; plan_id?: string; status?: string;
}) {
  const { error } = await supabase.rpc('admin_update_org', {
    p_org: orgId,
    p_suspended: patch.suspended ?? null,
    p_comped: patch.comped ?? null,
    p_plan_id: patch.plan_id ?? null,
    p_status: patch.status ?? null,
  });
  if (error) throw error;
}

/** Platform-wide transactions. `days` filters the window; null = all time. */
export async function adminListTransactions(days: number | null, kind?: string): Promise<Txn[]> {
  const since = days
    ? new Date(Date.now() - days * 86400000).toISOString()
    : null;
  const { data, error } = await supabase.rpc('admin_list_transactions', {
    p_since: since, p_kind: kind ?? null,
  });
  if (error) { console.warn('[admin] txns', error); return []; }
  return (data as Txn[]) ?? [];
}

/** This company's own transactions (RLS scopes it). */
export async function fetchMyTransactions(): Promise<Txn[]> {
  const { data } = await supabase
    .from('transactions')
    .select('id, created_at, event_name, customer_email, stripe_invoice_id, amount_cents, currency, status, kind')
    .order('created_at', { ascending: false })
    .limit(100);
  return ((data as any[]) ?? []).map(t => ({ ...t, org_name: null })) as Txn[];
}

export const money = (cents: number, currency = 'usd') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() })
    .format((cents ?? 0) / 100);

/** Master Admin: set a user's password. Server-side, platform-admin only. */
export async function adminSetPassword(userId: string, password: string) {
  const res = await fetch('/api/admin/set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ user_id: userId, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Could not set password');
  return json;
}

/* ── Hidden plans and add-ons ──────────────────────────────────────────────── */

export type Addon = {
  id: string;
  plan_id: string | null;
  name: string;
  description: string;
  price_cents: number;
  /** What is being counted: seat, each, month. */
  unit: string;
  /** Whether the price is a currency amount or a share. */
  unit_type: 'currency' | 'percentage';
  /** How often it recurs. */
  interval: 'month' | 'year';
  is_active: boolean;
};

export type OrgAddon = {
  addon_id: string;
  name: string;
  price_cents: number;
  unit: string;
  quantity: number;
};

/** Every plan, hidden ones included. Platform admins only. */
export async function adminListPlans() {
  const { data, error } = await supabase.rpc('admin_list_plans');
  if (error) throw error;
  return (data as any[]) ?? [];
}

export async function adminListAddons(): Promise<Addon[]> {
  const { data, error } = await supabase.rpc('admin_list_addons');
  if (error) throw error;
  return (data as Addon[]) ?? [];
}

export async function adminSaveAddon(a: {
  id?: string | null; plan_id?: string | null; name: string;
  description?: string; price_cents: number; unit?: string;
}) {
  const { error } = await supabase.rpc('admin_save_addon', {
    p_id: a.id ?? null,
    p_plan: a.plan_id ?? null,
    p_name: a.name,
    p_desc: a.description ?? '',
    p_price: a.price_cents,
    p_unit: a.unit ?? 'each',
  });
  if (error) throw error;
}

export async function adminDeleteAddon(id: string) {
  const { error } = await supabase.rpc('admin_delete_addon', { p_id: id });
  if (error) throw error;
}

/** Add-ons for one account, with the quantity each is set to (0 = off). */
export async function adminOrgAddons(orgId: string): Promise<OrgAddon[]> {
  const { data, error } = await supabase.rpc('admin_org_addons', { p_org: orgId });
  if (error) throw error;
  return (data as OrgAddon[]) ?? [];
}

export async function adminSetOrgAddon(orgId: string, addonId: string, qty: number) {
  const { error } = await supabase.rpc('admin_set_org_addon', {
    p_org: orgId, p_addon: addonId, p_qty: qty,
  });
  if (error) throw error;
}

/** Plan plus every add-on. The single source of truth for what an account costs. */
export async function orgMonthlyTotal(orgId: string): Promise<number> {
  const { data, error } = await supabase.rpc('org_monthly_total', { p_org: orgId });
  if (error) throw error;
  return (data as number) ?? 0;
}


/* ── Pricing setup ─────────────────────────────────────────────────────────── */

export type UnitType = 'currency' | 'percentage';
export type Interval = 'month' | 'year';

export async function adminSavePlan(p: {
  id?: string | null;
  name: string;
  description?: string;
  price_cents: number;
  unit_type?: UnitType;
  interval?: Interval;
  is_public?: boolean;
}) {
  const { error } = await supabase.rpc('admin_save_plan', {
    p_id: p.id ?? null,
    p_name: p.name,
    p_desc: p.description ?? '',
    p_price: p.price_cents,
    p_unit_type: p.unit_type ?? 'currency',
    p_interval: p.interval ?? 'month',
    p_public: p.is_public ?? true,
  });
  if (error) throw error;
}

/** Refuses if any account is on the plan, rather than orphaning them. */
export async function adminDeletePlan(id: string) {
  const { error } = await supabase.rpc('admin_delete_plan', { p_id: id });
  if (error) throw error;
}

export async function adminSaveAddonFull(a: {
  id?: string | null;
  plan_id?: string | null;
  name: string;
  description?: string;
  price_cents: number;
  unit?: string;
  unit_type?: UnitType;
  interval?: Interval;
}) {
  const { error } = await supabase.rpc('admin_save_addon', {
    p_id: a.id ?? null,
    p_plan: a.plan_id ?? null,
    p_name: a.name,
    p_desc: a.description ?? '',
    p_price: a.price_cents,
    p_unit: a.unit ?? 'each',
    p_unit_type: a.unit_type ?? 'currency',
    p_interval: a.interval ?? 'month',
  });
  if (error) throw error;
}

/* ── Team seats ────────────────────────────────────────────────────────────── */

export type SeatStatus = {
  included: number;
  purchased: number;
  allowed: number;
  used: number;
  can_add: boolean;
};

export async function orgSeatStatus(orgId: string): Promise<SeatStatus | null> {
  const { data, error } = await supabase.rpc('org_seat_status', { p_org: orgId });
  if (error) return null;
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

/** The database raises SEAT_REQUIRED when a company is out of paid seats. */
export function isSeatError(e: unknown): boolean {
  return String((e as any)?.message ?? '').includes('SEAT_REQUIRED');
}

/* ── Deal rooms ────────────────────────────────────────────────────────────── */

export type DealStatus = {
  included: number;
  purchased: number;
  allowed: number;
  used: number;
  can_add: boolean;
};

export async function orgDealStatus(orgId: string): Promise<DealStatus | null> {
  const { data, error } = await supabase.rpc('org_deal_status', { p_org: orgId });
  if (error) return null;
  return (Array.isArray(data) ? data[0] : data) ?? null;
}

/** The database raises DEAL_LIMIT when a company is out of paid deal rooms. */
export function isDealLimitError(e: unknown): boolean {
  return String((e as any)?.message ?? '').includes('DEAL_LIMIT');
}

/* ── Master admin: activation ──────────────────────────────────────────────── */

export type ActivateResult = {
  ok: boolean;
  reason?: string;
  message?: string;
  already?: boolean;
  org_id?: string;
  note?: string;
};

/**
 * Confirm a user's email and put them in a company.
 *
 * The account must already exist. We deliberately do NOT create auth users from
 * SQL: it corrupts the identities table and the user gets a 500 on next login.
 */
export async function adminActivateUser(
  email: string,
  company?: string,
  orgId?: string,
): Promise<ActivateResult> {
  const { data, error } = await supabase.rpc('admin_activate_and_assign', {
    p_email: email.trim(),
    p_company: company?.trim() || null,
    p_org: orgId ?? null,
  });
  if (error) return { ok: false, message: error.message };
  return (data ?? { ok: false }) as ActivateResult;
}

/* ── Master admin: credentials ─────────────────────────────────────────────── */

/**
 * Set a password for a user outright.
 *
 * The last resort, not the first. Prefer sending them a reset link: that way the
 * password is theirs and nobody else ever knew it. This exists for the case where
 * email is broken and a customer is locked out of their own raise.
 */
export async function adminSetPasswordByEmail(email: string, password: string): Promise<ActivateResult> {
  const { data, error } = await supabase.rpc('admin_set_user_password', {
    p_email: email.trim(),
    p_password: password,
  });
  if (error) return { ok: false, message: error.message };
  return (data ?? { ok: false }) as ActivateResult;
}

/**
 * Email them a link that signs them in and lets them choose a password.
 *
 * No admin key needed: this is an ordinary auth call. It also re-confirms an
 * unconfirmed address, so it doubles as "resend the confirmation email".
 */
export async function sendPasswordReset(email: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: webUrl('/reset-password'),
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** A one-time sign-in link. Useful when someone never received the confirmation. */
export async function sendMagicLink(email: string): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: webUrl('/admin') },
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/**
 * Create an account and email them a link to set their password.
 *
 * Uses signInWithOtp with shouldCreateUser, which creates the auth user through
 * GoTrue and mails a link. That matters: creating the row in SQL instead would
 * corrupt the identities table and 500 their first login. This is the supported
 * path, and it needs no service-role key.
 *
 * The link lands on /reset-password, where they choose a password. They name
 * their own company on first sign-in, so no company is required here.
 */
export async function adminCreateUser(
  email: string,
  fullName?: string,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: true,
      emailRedirectTo: webUrl('/reset-password'),
      data: fullName?.trim() ? { full_name: fullName.trim() } : undefined,
    },
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/* ── Platform dashboard ────────────────────────────────────────────────────── */

export type PlatformStats = {
  users: {
    total: number; confirmed: number; new_30d: number;
    active_7d: number; active_30d: number; never_signed_in: number;
  };
  companies: {
    total: number; paying: number; trialing: number; comped: number; expired: number;
  };
  deals: { total: number; active: number; draft: number };
  engagement: {
    investor_sessions: number; sessions_7d: number;
    total_page_views: number; total_deck_views: number;
    investors_tracked: number; committed_cents: number;
  };
  per_deal: Array<{
    slug: string; company: string; active: boolean;
    sessions: number; views: number; investors: number;
  }>;
};

export async function adminPlatformStats(): Promise<PlatformStats | null> {
  const { data, error } = await supabase.rpc('admin_platform_stats');
  if (error) return null;
  return (data as PlatformStats) ?? null;
}

export type PlatformAnalytics = {
  window_days: number;
  totals: {
    signups: number; investor_sessions: number; events: number;
    deals_created: number; meetings: number;
  };
  daily: { date: string; signups: number; sessions: number; events: number }[];
  top_deals: { slug: string; company: string; views: number; visitors: number }[];
  top_events: { name: string; count: number }[];
};

/** Time-series and leaderboards for the analytics dashboard. Master admin only;
 *  the RPC raises 'not authorized' for anyone else. */
export async function adminPlatformAnalytics(days = 30): Promise<PlatformAnalytics | null> {
  const { data, error } = await supabase.rpc('admin_platform_analytics', { p_days: days });
  if (error) { console.warn('[analytics]', error); return null; }
  return (data as PlatformAnalytics) ?? null;
}

/** Set a user's display name. Platform admins only, enforced in SQL. */
export async function adminSetUserName(
  userId: string,
  name: string,
): Promise<{ ok: boolean; name?: string | null; message?: string }> {
  const { data, error } = await supabase.rpc('admin_set_user_name', {
    p_user: userId,
    p_name: name,
  });
  if (error) return { ok: false, message: error.message };
  return (data ?? { ok: false }) as { ok: boolean; name?: string | null; message?: string };
}
