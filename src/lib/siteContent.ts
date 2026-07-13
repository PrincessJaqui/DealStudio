/**
 * Editable landing page.
 *
 * The page is a list of ordered blocks. If nothing has been saved, the app
 * falls back to the built-in page, so an empty table can never leave the
 * marketing site blank.
 */
import { supabase } from './supabase';

export type BlockType = 'hero' | 'features' | 'text' | 'image' | 'cta' | 'stats';

export interface LandingItem {
  title: string;
  body: string;
  image?: string;
  /** Key into FEATURE_ICONS. Absent means no icon, which renders fine. */
  icon?: string;
}

export interface LandingBlock {
  id: string;
  type: BlockType;
  eyebrow?: string;
  title?: string;
  body?: string;
  image?: string;
  ctaLabel?: string;
  ctaHref?: string;
  /** Second button. The live hero has one ("See a live demo"); without this,
   *  publishing the page quietly dropped it. */
  cta2Label?: string;
  cta2Href?: string;
  items?: LandingItem[];
  /** Dark blocks invert: used for the closing call to action. */
  dark?: boolean;
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  hero: 'Hero',
  features: 'Feature grid',
  text: 'Text section',
  image: 'Image',
  stats: 'Stat row',
  cta: 'Call to action',
};

export function blankBlock(type: BlockType): LandingBlock {
  const id = `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  switch (type) {
    case 'hero':
      return { id, type, eyebrow: '', title: '', body: '', ctaLabel: 'Get started', ctaHref: '/signup', cta2Label: '', cta2Href: '' };
    case 'features':
      return { id, type, title: '', body: '', items: [{ title: '', body: '' }] };
    case 'stats':
      return { id, type, items: [{ title: '', body: '' }] };
    case 'image':
      return { id, type, image: '', title: '' };
    case 'cta':
      return { id, type, title: '', body: '', ctaLabel: 'Start free', ctaHref: '/signup', dark: true };
    default:
      return { id, type, title: '', body: '' };
  }
}

export async function fetchLanding(): Promise<LandingBlock[]> {
  const { data, error } = await supabase.rpc('get_site_content', { p_key: 'landing' });
  if (error) { console.warn('[landing]', error.message); return []; }
  const blocks = (data as LandingBlock[]) ?? [];
  return Array.isArray(blocks) ? blocks : [];
}

export async function saveLanding(blocks: LandingBlock[]) {
  const { error } = await supabase.rpc('save_site_content', {
    p_key: 'landing', p_value: blocks,
  });
  if (error) throw error;
}

/** Uploads an image for the marketing page. Platform admins only (enforced server-side). */
export async function uploadSiteImage(file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `landing/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage
    .from('site-assets')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('site-assets').getPublicUrl(path).data.publicUrl;
}


/**
 * The page that ships with the app, as editable blocks.
 *
 * The editor used to open on a blank canvas, so changing one word of the
 * headline meant rebuilding the whole page. This is the same copy the built-in
 * page renders, so "Load current page" gives you the live page to edit.
 */
export const DEFAULT_LANDING: LandingBlock[] = [
  {
    id: 'b_hero',
    type: 'hero',
    eyebrow: '',
    title: 'Your Studio, Your Raise.',
    body: 'Build your deal, upload your deck, and manage investor access from a single command center.',
    ctaLabel: 'Start free for 30 days',
    ctaHref: '/signup',
    cta2Label: 'See a live demo',
    cta2Href: '/d/investors',
  },
  {
    id: 'b_features',
    type: 'features',
    title: 'The Professional Command Center for Your Raise',
    body: '',
    items: [
      {
        icon: 'lock',
        title: 'Gated access',
        body: 'Password, invite-only, or a private share link. Revoke anytime. You decide who sees what, per investor.',
      },
      {
        icon: 'trending-up',
        title: 'Live business model',
        body: 'An interactive revenue model and market funnel investors can explore. Edit once, everyone sees the latest.',
      },
      {
        icon: 'bar-chart',
        title: 'Investor analytics',
        body: 'See who opened the deck, what they read, and how long. Follow up on the ones leaning in.',
      },
    ],
  },
  {
    id: 'b_cta',
    type: 'cta',
    dark: true,
    title: 'Ready to open your deal room?',
    body: 'Publish a private, always-current investor page in minutes.',
    ctaLabel: 'Start free for 30 days',
    ctaHref: '/signup',
  },
];
