/**
 * Stripe Checkout.
 *
 * Charges the org's OWN plan plus every add-on it holds, as separate subscription
 * line items, so Stripe reflects what a company is actually paying for.
 *
 * Two bugs this replaces:
 *
 *  1. It picked `plans where is_active limit 1` -- no filter, no order, i.e.
 *     whichever plan Postgres felt like. With 4 active plans a customer could be
 *     charged for a plan they never chose.
 *
 *  2. It only billed the plan. Extra seats and extra deal rooms never reached the
 *     invoice, which made the seat and deal limits dead ends: a customer hit the
 *     wall with no way to pay past it.
 *
 * Secrets come from the environment and are never in the repo.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

const admin = createClient(
  process.env.VITE_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'not signed in' });

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return res.status(401).json({ error: 'not signed in' });

    const { data: member } = await admin
      .from('org_members').select('org_id').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (!member?.org_id) return res.status(403).json({ error: 'no company' });

    const { data: org } = await admin
      .from('organizations').select('*').eq('id', member.org_id).single();
    if (!org) return res.status(403).json({ error: 'no company' });

    // The org's OWN plan. Never "some active plan".
    if (!org.plan_id) {
      return res.status(400).json({ error: 'This company has no plan selected.' });
    }

    const { data: plan } = await admin
      .from('plans').select('*').eq('id', org.plan_id).single();

    if (!plan?.stripe_price_id) {
      return res.status(400).json({
        error: `Plan "${plan?.name ?? 'unknown'}" has no Stripe price ID. Add it in Pricing Setup.`,
      });
    }

    // Every add-on the company holds, each its own line item with its own
    // quantity. This is what makes extra seats and deal rooms billable.
    const { data: addons } = await admin
      .from('org_addons')
      .select('quantity, plan_addons ( name, stripe_price_id )')
      .eq('org_id', org.id)
      .gt('quantity', 0);

    const line_items: Array<{ price: string; quantity: number }> = [
      { price: plan.stripe_price_id, quantity: 1 },
    ];

    const unpriced: string[] = [];

    for (const row of addons ?? []) {
      const a = (row as any).plan_addons;
      if (!a) continue;
      if (!a.stripe_price_id) {
        // Refuse loudly rather than silently give it away free.
        unpriced.push(a.name);
        continue;
      }
      line_items.push({ price: a.stripe_price_id, quantity: (row as any).quantity });
    }

    if (unpriced.length) {
      return res.status(400).json({
        error: `These add-ons have no Stripe price ID: ${unpriced.join(', ')}. Add them in Pricing Setup.`,
      });
    }

    // One customer record per company, so invoices stay together.
    let customerId = org.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: org.name ?? undefined,
        metadata: { org_id: org.id },
      });
      customerId = customer.id;
      await admin.from('organizations').update({ stripe_customer_id: customerId }).eq('id', org.id);
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items,
      success_url: `${origin}/admin/billing?checkout=success`,
      cancel_url: `${origin}/admin/billing?checkout=cancelled`,
      subscription_data: { metadata: { org_id: org.id } },
      metadata: { org_id: org.id },
      allow_promotion_codes: true,
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error('[stripe/checkout]', e);
    return res.status(500).json({ error: e?.message || 'checkout failed' });
  }
}
