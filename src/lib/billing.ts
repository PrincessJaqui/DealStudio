/**
 * Billing + platform-admin data access. Money never moves through our code:
 * Stripe hosts checkout and the card portal, and the webhook is the only writer
 * of subscription state.
 */
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
  id: string; name: string; owner_email: string | null; owner_id: string | null;
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
  unit: string;
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
