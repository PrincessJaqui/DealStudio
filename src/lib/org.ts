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
  /** The company's public URL segment: dealstudio.io/{handle}/{deck} */
  handle: string | null;
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
/**
 * The organization the signed-in user BELONGS to.
 *
 * This used to be `select * from organizations limit 1`, leaning entirely on RLS
 * to narrow the result. That works for a normal customer, who can only see their
 * own company. It fails badly for a platform admin, who can see EVERY company:
 * with no filter and no order, Postgres returns whichever row it likes, so a
 * master admin would get dropped into a random customer's account.
 *
 * Membership is now stated explicitly instead of being implied by RLS.
 */
export async function fetchMyOrg(): Promise<Organization | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;

  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('auth_user_id', uid)
    .limit(1)
    .maybeSingle();

  if (memberErr) {
    console.warn('[org] membership lookup failed', memberErr);
    return null;
  }
  if (!member?.org_id) return null;

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', member.org_id)
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


/**
 * Blends two hex colours. --ds-grad-mid is a real token used by the landing
 * page and the business model panel, but nothing ever themed it, so it stayed
 * the default blue while everything around it turned the customer's colour.
 * Deriving it from the two ends keeps every gradient coherent.
 */
function mixHex(a: string, b: string, t = 0.5): string {
  const parse = (h: string) => {
    const v = h.replace('#', '');
    const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
    return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
  };
  try {
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
    const hex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${hex(mix(r1, r2))}${hex(mix(g1, g2))}${hex(mix(b1, b2))}`;
  } catch {
    return a;
  }
}

export function applyOrgTheme(theme: OrgTheme | null) {
  const root = document.documentElement;
  const vars = ['--ds-grad-from', '--ds-grad-mid', '--ds-grad-to', '--ds-brand', '--ds-accent', '--ds-accent-to'];
  if (!theme) {
    vars.forEach(v => root.style.removeProperty(v));
    return;
  }
  root.style.setProperty('--ds-grad-from', theme.brand_from);
  root.style.setProperty('--ds-grad-mid', mixHex(theme.brand_from, theme.brand_to));
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
/**
 * Turn a public storage URL back into the path inside its bucket.
 *
 * Uploaded documents are recorded by URL, not by path, so the path has to be
 * recovered from the URL to delete the file. A public Supabase URL looks like
 *   .../storage/v1/object/public/<bucket>/<path...>
 * and everything after the bucket is the path.
 */
function storagePathFromUrl(url: string, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

/**
 * Delete the FILES belonging to a deal.
 *
 * The database cascade removes deal_documents rows; it does not touch Supabase
 * Storage, so the actual PDFs survived a deletion. The Privacy Policy promises
 * they are deleted, so until now the product was making a promise the code did
 * not keep.
 *
 * Must run BEFORE the rows are deleted: the rows are the only record of where
 * the files live. Delete them first and the files are orphaned forever, taking
 * up space and still holding a customer's confidential deck.
 */
export async function purgeDealFiles(dealId: string): Promise<number> {
  const { data: docs } = await supabase
    .from('deal_documents')
    .select('file_url')
    .eq('dealstudio_id', dealId);

  const paths = (docs ?? [])
    .map((d: { file_url: string }) => storagePathFromUrl(d.file_url, 'deal-documents'))
    .filter((p): p is string => !!p);

  if (paths.length === 0) return 0;

  const { error } = await supabase.storage.from('deal-documents').remove(paths);
  if (error) {
    console.warn('[storage] could not remove deal files', error);
    return 0;
  }
  return paths.length;
}

export async function deleteDeal(dealId: string, confirmSlug: string) {
  // Files first. Once delete_deal runs, the rows that point at them are gone and
  // the files can never be found again.
  await purgeDealFiles(dealId);

  const { data, error } = await supabase.rpc('delete_deal', {
    p_deal: dealId, p_confirm_slug: confirmSlug,
  });
  if (error) throw error;
  return data as { deleted: boolean; name: string; slug: string };
}

/**
 * Delete every file a company owns: every deal's documents, plus its logos.
 *
 * Logos are stored under an {orgId}/ prefix so they can be listed. Documents are
 * not (they land in a flat namespace), which is why they have to be found
 * through the database rather than by listing the bucket.
 */
export async function purgeOrgFiles(orgId: string): Promise<{ docs: number; logos: number }> {
  const { data: deals } = await supabase
    .from('dealstudios')
    .select('id')
    .eq('org_id', orgId);

  let docs = 0;
  for (const d of deals ?? []) {
    docs += await purgeDealFiles((d as { id: string }).id);
  }

  let logos = 0;
  const { data: files } = await supabase.storage.from('org-logos').list(orgId);
  if (files && files.length) {
    const paths = files.map((f) => `${orgId}/${f.name}`);
    const { error } = await supabase.storage.from('org-logos').remove(paths);
    if (!error) logos = paths.length;
  }

  return { docs, logos };
}

/* ── Team members ──────────────────────────────────────────────────────────── */

export type OrgMember = {
  ref: string;          // auth user id for a member, invite id for a pending one
  email: string;
  role: 'owner' | 'admin';
  is_you: boolean;
  pending: boolean;
  created_at: string;
};

export async function fetchOrgMembers(): Promise<OrgMember[]> {
  const { data, error } = await supabase.rpc('list_org_members');
  if (error) { console.warn('[team]', error.message); return []; }
  return (data as OrgMember[]) ?? [];
}

/** Adds by email. Existing accounts join at once; others wait as an invite. */
export async function addOrgMember(email: string, role: 'owner' | 'admin' = 'admin') {
  const { data, error } = await supabase.rpc('add_org_member', { p_email: email, p_role: role });
  if (error) throw error;
  return data as { added: boolean; pending?: boolean; reason?: string };
}

export async function removeOrgMember(m: OrgMember) {
  const fn = m.pending ? 'revoke_org_invite' : 'remove_org_member';
  const args = m.pending ? { p_invite: m.ref } : { p_user: m.ref };
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

export async function setOrgMemberRole(userId: string, role: 'owner' | 'admin') {
  const { error } = await supabase.rpc('set_org_member_role', { p_user: userId, p_role: role });
  if (error) throw error;
}

/** Attaches a pending invite after sign-in. Safe to call every time. */
export async function claimPendingInvites() {
  try { await supabase.rpc('claim_pending_invites'); } catch { /* not fatal */ }
}


/** The resolved theme a public deal room ships with (deal, then company). */
export type DealTheme = {
  brand_from: string | null;
  brand_to: string | null;
  brand_accent: string | null;
  accent_to: string | null;
  logo_url: string | null;
};

/**
 * Paints a deal room in its own colours. Any value left null falls through to
 * whatever the stylesheet already defines, so a partially themed deal still
 * renders coherently rather than half-blank.
 */
export function applyDealTheme(theme: DealTheme | null | undefined) {
  if (!theme) return;
  const root = document.documentElement;
  const set = (name: string, value: string | null) => {
    if (value) root.style.setProperty(name, value);
  };
  set('--ds-grad-from', theme.brand_from);
  set('--ds-grad-to', theme.brand_to);
  if (theme.brand_from && theme.brand_to) {
    set('--ds-grad-mid', mixHex(theme.brand_from, theme.brand_to));
  }
  set('--ds-brand', theme.brand_to ?? theme.brand_from);
  set('--ds-accent', theme.brand_accent);
  set('--ds-accent-to', theme.accent_to);
}


/**
 * Renames the company and carries the new name into every deal that was
 * following it. A deal with a name of its own (a round name, say) keeps it.
 * Returns how many deals were updated.
 */
export async function renameOrg(name: string): Promise<{ deals_updated: number }> {
  const { data, error } = await supabase.rpc('rename_org', { p_name: name });
  if (error) throw error;
  return (data as { deals_updated: number }) ?? { deals_updated: 0 };
}

/**
 * The company that invited this user, if their invite is still unclaimed.
 *
 * claim_pending_invites swallows failures (an org out of seats, say), so a user
 * can be left with no org AND a waiting invite. Without this we would offer them
 * a "name your company" screen and they would quietly create a second company
 * instead of joining the one that invited them.
 */
export async function myPendingInvite(): Promise<string | null> {
  const { data, error } = await supabase.rpc('my_pending_invite');
  if (error) return null;
  return (data as string) || null;
}

/* ── Company handle ────────────────────────────────────────────────────────── */

/** Turn a company's public URL into its deal slug. Null when there is no such
 *  room, which is also what a wrong handle returns: no cross-company peeking. */
export async function resolveDealSlug(handle: string, deck: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('resolve_deal_slug', {
    p_handle: handle,
    p_slug: deck,
  });
  if (error) return null;
  return (data as string) || null;
}

export async function setOrgHandle(
  orgId: string,
  handle: string,
): Promise<{ ok: boolean; handle?: string; message?: string }> {
  const { data, error } = await supabase.rpc('set_org_handle', {
    p_org: orgId,
    p_handle: handle,
  });
  if (error) return { ok: false, message: error.message };
  return (data ?? { ok: false }) as { ok: boolean; handle?: string; message?: string };
}

/**
 * The public URL for a deal room.
 *
 * Prefers the company handle. Falls back to the legacy /d/{slug} when a company
 * has not set one, so a room is never unreachable just because a handle is
 * missing.
 */
export function dealUrl(handle: string | null | undefined, slug: string): string {
  const origin = window.location.origin;
  return handle ? `${origin}/${handle}/${slug}` : `${origin}/d/${slug}`;
}
