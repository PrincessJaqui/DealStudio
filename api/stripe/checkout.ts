/**
 * Creates a Stripe Checkout session for a company's subscription.
 * Verifies the caller's Supabase session, resolves their organization, and
 * ensures a Stripe customer exists before starting checkout.
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
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return res.status(401).json({ error: 'not authenticated' });
    const user = userData.user;

    const { data: member } = await admin
      .from('org_members').select('org_id').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (!member) return res.status(400).json({ error: 'no organization' });

    const { data: org } = await admin
      .from('organizations').select('*').eq('id', member.org_id).single();

    const { data: plan } = await admin
      .from('plans').select('*').eq('is_active', true).limit(1).maybeSingle();
    const priceId = plan?.stripe_price_id || process.env.STRIPE_PRICE_ID;
    if (!priceId) return res.status(500).json({ error: 'no Stripe price configured' });

    // Reuse the customer across checkouts so invoices stay on one record.
    let customerId = org?.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: org?.name ?? undefined,
        metadata: { org_id: org.id },
      });
      customerId = customer.id;
      await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id);
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/admin/billing?checkout=success`,
      cancel_url: `${origin}/admin/billing?checkout=cancelled`,
      subscription_data: { metadata: { org_id: org.id } },
      metadata: { org_id: org.id },
allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error('[checkout]', e);
    return res.status(500).json({ error: e?.message || 'checkout failed' });
  }
}
