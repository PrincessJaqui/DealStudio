/**
 * Organization context. Every authenticated surface is scoped to the company
 * the signed-in user belongs to. RLS enforces this server-side; this module is
 * the client's view of it.
 */
import { supabase } from './supabase';

export type Organization = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  brand_from: string;
  brand_to: string;
  brand_accent: string;
  plan: string;
  subscription_status: string;
  trial_ends_at: string;
};

export type OrgDeal = {
  id: string;
  slug: string;
  company_name: string;
  is_active: boolean;
  updated_at: string;
};

/** The org the current user belongs to, or null if they have none yet. */
export async function fetchMyOrg(): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[org] fetch failed', error);
    return null;
  }
  return (data as Organization) ?? null;
}

/** Creates the caller's organization and its first deal. Idempotent. */
export async function createMyOrg(name: string, dealSlug?: string) {
  const { data, error } = await supabase.rpc('create_org_for_current_user', {
    p_name: name,
    p_deal_slug: dealSlug ?? null,
  });
  if (error) throw error;
  return data as { org_id: string; deal_id?: string; slug?: string; created: boolean };
}

/** All deals belonging to the caller's org. RLS scopes this automatically. */
export async function fetchOrgDeals(): Promise<OrgDeal[]> {
  const { data, error } = await supabase
    .from('dealstudios')
    .select('id, slug, company_name, is_active, updated_at')
    .order('updated_at', { ascending: false });
  if (error) {
    console.warn('[org] deals fetch failed', error);
    return [];
  }
  return (data as OrgDeal[]) ?? [];
}

/** Creates an additional deal inside the org (Deal Manager). */
export async function createDeal(orgId: string, name: string, slug?: string) {
  const { data, error } = await supabase.rpc('create_deal', {
    p_org: orgId,
    p_name: name,
    p_slug: slug ?? null,
  });
  if (error) throw error;
  return data as { deal_id: string; slug: string };
}

/** Saves the org's branding (Interface Studio). */
export async function saveOrgBranding(
  orgId: string,
  patch: Partial<Pick<Organization, 'name' | 'logo_url' | 'brand_from' | 'brand_to' | 'brand_accent'>>,
) {
  const { error } = await supabase
    .from('organizations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', orgId);
  if (error) throw error;
}

/**
 * Paints the org's brand onto the Phase 1 design tokens. Every brand colour in
 * the app resolves through these three variables, so this reskins the whole UI.
 */
export function applyOrgTheme(org: Pick<Organization, 'brand_from' | 'brand_to' | 'brand_accent'> | null) {
  const root = document.documentElement;
  if (!org) {
    root.style.removeProperty('--ds-grad-from');
    root.style.removeProperty('--ds-grad-to');
    root.style.removeProperty('--ds-brand');
    root.style.removeProperty('--ds-accent');
    return;
  }
  root.style.setProperty('--ds-grad-from', org.brand_from);
  root.style.setProperty('--ds-grad-to', org.brand_to);
  root.style.setProperty('--ds-brand', org.brand_to);
  root.style.setProperty('--ds-accent', org.brand_accent);
}
