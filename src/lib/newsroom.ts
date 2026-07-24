/**
 * NewsRoom data layer, Phase 1a.
 *
 * A NewsRoom is one per organization. An update is an ordered list of typed
 * content blocks plus a KPI list captured separately so trends can be drawn
 * from history later. Owner reads/writes go through the RLS-scoped client; the
 * public page reads by share token through an anon RPC, so no investor login is
 * needed and drafts never leave the database.
 */

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export type BlockType =
  | 'overview' | 'kpis' | 'revenue' | 'highlights' | 'challenges'
  | 'team' | 'news' | 'gbu' | 'quote' | 'signature';

/** One content block. `data` shape depends on `type`; the composer and the
 *  renderer each switch on `type`, so the union stays loose here on purpose. */
export interface NewsBlock {
  id: string;
  type: BlockType;
  data: any;
}

export interface NewsKpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
}

export interface NewsUpdate {
  id: string;
  newsroom_id: string;
  title: string;
  status: 'draft' | 'published';
  blocks: NewsBlock[];
  kpis: NewsKpi[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsRoom {
  id: string;
  org_id: string;
  title: string;
  share_token: string;
  created_at: string;
}

/** The default block a founder gets when adding each section type. Keeps the
 *  composer honest: every block starts valid, never undefined. */
export function emptyBlock(type: BlockType): NewsBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case 'overview':   return { id, type, data: { text: '' } };
    case 'kpis':       return { id, type, data: { items: [] } };
    case 'revenue':    return { id, type, data: { qualified: '', closed: '', mrr: '', arr: '', oneTime: '', projection: '', note: '' } };
    case 'highlights': return { id, type, data: { items: [''] } };
    case 'challenges': return { id, type, data: { items: [''] } };
    case 'team':       return { id, type, data: { text: '', members: [] } };
    case 'news':       return { id, type, data: { items: [{ title: '', url: '' }] } };
    case 'gbu':        return { id, type, data: { good: '', bad: '', ugly: '' } };
    case 'quote':      return { id, type, data: { text: '', attribution: '' } };
    case 'signature':  return { id, type, data: { name: '', role: '', text: '' } };
    default:           return { id, type, data: {} };
  }
}

export const BLOCK_LABEL: Record<BlockType, string> = {
  overview: 'Overview',
  kpis: 'KPIs',
  revenue: 'Revenue',
  highlights: 'Highlights',
  challenges: 'Challenges',
  team: 'Team',
  news: 'In the News',
  gbu: 'Good, Bad & Ugly',
  quote: 'Quote',
  signature: 'Signature',
};

// ── Owner side ──────────────────────────────────────────────────────────────

/** Get (or lazily create) my org's single newsroom. */
export async function fetchMyNewsroom(): Promise<NewsRoom | null> {
  const { data, error } = await supabase.rpc('newsroom_mine');
  if (error) { console.warn('[newsroom] mine', error); return null; }
  return (data as NewsRoom) ?? null;
}

export async function fetchUpdates(newsroomId: string): Promise<NewsUpdate[]> {
  const { data, error } = await supabase
    .from('newsroom_updates')
    .select('*')
    .eq('newsroom_id', newsroomId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[newsroom] updates', error); return []; }
  return (data ?? []) as NewsUpdate[];
}

/** Start a new draft, seeded from the most recent update so "keep the defaults"
 *  works: the founder's last structure carries forward, values cleared. */
export async function createUpdate(newsroomId: string, seed?: NewsUpdate): Promise<NewsUpdate | null> {
  const blocks = seed
    ? seed.blocks.map(b => ({ ...b, id: crypto.randomUUID() }))
    : [emptyBlock('overview'), emptyBlock('kpis'), emptyBlock('highlights')];
  const kpis = seed ? seed.kpis.map(k => ({ ...k, value: '' })) : [];

  const { data, error } = await supabase
    .from('newsroom_updates')
    .insert({ newsroom_id: newsroomId, title: 'Untitled update', blocks, kpis })
    .select('*')
    .single();
  if (error) { console.warn('[newsroom] create', error); return null; }
  return data as NewsUpdate;
}

export async function saveUpdate(
  id: string,
  patch: Partial<Pick<NewsUpdate, 'title' | 'blocks' | 'kpis' | 'status' | 'published_at'>>,
): Promise<boolean> {
  const { error } = await supabase
    .from('newsroom_updates')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.warn('[newsroom] save', error); return false; }
  return true;
}

export async function publishUpdate(id: string): Promise<boolean> {
  return saveUpdate(id, { status: 'published', published_at: new Date().toISOString() });
}

export async function deleteUpdate(id: string): Promise<boolean> {
  const { error } = await supabase.from('newsroom_updates').delete().eq('id', id);
  if (error) { console.warn('[newsroom] delete', error); return false; }
  return true;
}

// ── Public side (anon, by share token) ───────────────────────────────────────

export interface PublicNewsroom {
  title: string;
  company: string | null;
  logo_url: string | null;
  brand_from: string | null;
  brand_to: string | null;
  updates: Array<Pick<NewsUpdate, 'id' | 'title' | 'blocks' | 'kpis' | 'published_at'>>;
}

/** Read a published newsroom by its share token. Anon-safe: uses a raw fetch
 *  with the anon key, never the authed client, and the RPC returns only
 *  published updates. */
export async function fetchPublicNewsroom(token: string): Promise<PublicNewsroom | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/newsroom_public`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_token: token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data as PublicNewsroom) ?? null;
  } catch (e) {
    console.warn('[newsroom] public fetch', e);
    return null;
  }
}
