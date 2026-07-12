/**
 * Opens the Stripe billing portal so a company can update its card, see
 * invoices, or cancel. Stripe hosts the UI; we never touch card data.
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const admin = createClient(
  process.env.VITE_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(token);
    if (!userData?.user) return res.status(401).json({ error: 'not authenticated' });

    const { data: member } = await admin
      .from('org_members').select('org_id').eq('auth_user_id', userData.user.id).limit(1).maybeSingle();
    if (!member) return res.status(400).json({ error: 'no organization' });

    const { data: org } = await admin
      .from('organizations').select('stripe_customer_id').eq('id', member.org_id).single();
    if (!org?.stripe_customer_id) return res.status(400).json({ error: 'no billing account yet' });

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const portal = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${origin}/admin/billing`,
    });
    return res.status(200).json({ url: portal.url });
  } catch (e: any) {
    console.error('[portal]', e);
    return res.status(500).json({ error: e?.message || 'portal failed' });
  }
}
