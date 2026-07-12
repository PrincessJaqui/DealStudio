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
  accent_to: string;
  plan: string;
  subscription_status: string;
  trial_ends_at: string;
  suspended: boolean;
  comped: boolean;
  stripe_customer_id: string | null;
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
  patch: Partial<Pick<Organization, 'name' | 'logo_url' | 'brand_from' | 'brand_to' | 'brand_accent' | 'accent_to'>>,
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
export type OrgTheme = Pick<Organization, 'brand_from' | 'brand_to' | 'brand_accent' | 'accent_to'>;

export function applyOrgTheme(theme: OrgTheme | null) {
  const root = document.documentElement;
  const vars = ['--ds-grad-from', '--ds-grad-to', '--ds-brand', '--ds-accent', '--ds-accent-to'];
  if (!theme) {
    vars.forEach(v => root.style.removeProperty(v));
    return;
  }
  root.style.setProperty('--ds-grad-from', theme.brand_from);
  root.style.setProperty('--ds-grad-to', theme.brand_to);
  root.style.setProperty('--ds-brand', theme.brand_to);
  root.style.setProperty('--ds-accent', theme.brand_accent);
  root.style.setProperty('--ds-accent-to', theme.accent_to);
}

export const DEFAULT_THEME: OrgTheme = {
  brand_from: '#627FD9',
  brand_to: '#0030CD',
  brand_accent: '#00c2c8',
  accent_to: '#00d6af',
};

/** Uploads a company logo and returns its public URL. */
export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${orgId}/logo-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from('org-logos')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('org-logos').getPublicUrl(path);
  return data.publicUrl;
}

/** What deleting a deal would destroy. Read-only. */
export async function previewDeleteDeal(dealId: string) {
  const { data, error } = await supabase.rpc('deal_delete_preview', { p_deal: dealId });
  if (error) throw error;
  return data as {
    name: string; slug: string;
    documents: number; investors: number; visits: number; meetings: number;
  } | null;
}

/**
 * Permanently deletes a deal and everything attached to it. The caller must
 * pass the deal's own slug, which the server re-checks, so a mistaken click
 * cannot destroy the wrong room.
 */
export async function deleteDeal(dealId: string, confirmSlug: string) {
  const { data, error } = await supabase.rpc('delete_deal', {
    p_deal: dealId, p_confirm_slug: confirmSlug,
  });
  if (error) throw error;
  return data as { deleted: boolean; name: string; slug: string };
}
