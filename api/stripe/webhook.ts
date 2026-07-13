/**
 * Stripe webhook. The single source of truth for subscription state and the
 * transaction ledger.
 *
 * Two things matter here:
 *  1. Signature verification needs the RAW body, so Vercel's body parser is
 *     disabled below. Parsing it first would break the signature.
 *  2. Events can arrive twice. `stripe_event_id` is unique, so replays upsert
 *     rather than double-charging the ledger.
 */
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const admin = createClient(
  process.env.VITE_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

export const config = { api: { bodyParser: false } };

function rawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Find the org for an event, by metadata first, then by customer id. */
async function resolveOrg(customerId?: string | null, metaOrg?: string | null) {
  if (metaOrg) return metaOrg;
  if (!customerId) return null;
  const { data } = await admin
    .from('organizations').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  return data?.id ?? null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  let event: Stripe.Event;
  try {
    const body = await rawBody(req);
    event = stripe.webhooks.constructEvent(
      body,
      req.headers['stripe-signature'] as string,
      process.env.STRIPE_WEBHOOK_SECRET as string,
    );
  } catch (e: any) {
    console.error('[webhook] bad signature', e?.message);
    return res.status(400).send(`Webhook Error: ${e?.message}`);
  }

  // Acknowledge fast; Stripe retries on timeout.
  res.status(200).json({ received: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        const orgId = await resolveOrg(s.customer as string, s.metadata?.org_id);
        if (orgId) {
          await admin.from('organizations').update({
            stripe_customer_id: s.customer as string,
            stripe_subscription_id: s.subscription as string,
            subscription_status: 'active',
            plan: 'pro',
            updated_at: new Date().toISOString(),
          }).eq('id', orgId);
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.created':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await resolveOrg(sub.customer as string, sub.metadata?.org_id);
        if (!orgId) break;

        const deleted = event.type === 'customer.subscription.deleted';

        await admin.from('organizations').update({
          stripe_subscription_id: sub.id,
          subscription_status: deleted ? 'canceled' : sub.status,
          updated_at: new Date().toISOString(),
        }).eq('id', orgId);

        // Mirror the subscription's line items into org_addons.
        //
        // Stripe is the source of truth for what a company is paying for, so the
        // entitlement follows the invoice rather than the other way round.
        // Without this a customer could buy a seat and still be refused it, or
        // cancel one and keep it forever. Both have happened to other people.
        // A cancelled subscription drops everything they PAID for. Anything an
        // admin comped is a gift, not a purchase, and survives.
        if (deleted) {
          await admin.from('org_addons').delete().eq('org_id', orgId).eq('comped', false);
          break;
        }

        const { data: catalog } = await admin
          .from('plan_addons').select('id, stripe_price_id').not('stripe_price_id', 'is', null);

        const byPrice = new Map<string, string>();
        for (const a of catalog ?? []) {
          if (a.stripe_price_id) byPrice.set(a.stripe_price_id as string, a.id as string);
        }

        const paidFor = new Map<string, number>();
        for (const item of sub.items.data) {
          const addonId = byPrice.get(item.price.id);
          if (addonId) paidFor.set(addonId, item.quantity ?? 1);
        }

        // Anything they no longer pay for is no longer theirs. Comped extras are
        // granted directly in the database with no Stripe price, so they are not
        // in `catalog` and are never touched here.
        const addonIds = [...byPrice.values()];
        if (addonIds.length) {
          const keep = [...paidFor.keys()];
          let del = admin
            .from('org_addons')
            .delete()
            .eq('org_id', orgId)
            .eq('comped', false)          // never reclaim a comped grant
            .in('addon_id', addonIds);
          if (keep.length) del = del.not('addon_id', 'in', `(${keep.join(',')})`);
          await del;
        }

        for (const [addonId, qty] of paidFor) {
          await admin.from('org_addons').upsert(
            { org_id: orgId, addon_id: addonId, quantity: qty, comped: false },
            { onConflict: 'org_id,addon_id' },
          );
        }

        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const orgId = await resolveOrg(inv.customer as string, null);
        const paid = event.type === 'invoice.paid';

        await admin.from('transactions').upsert({
          org_id: orgId,
          stripe_event_id: event.id,
          stripe_invoice_id: inv.id,
          event_name: paid ? 'Subscription payment' : 'Payment failed',
          customer_email: inv.customer_email,
          amount_cents: inv.amount_paid ?? inv.amount_due ?? 0,
          currency: inv.currency ?? 'usd',
          status: paid ? 'paid' : 'failed',
          kind: 'subscription',
        }, { onConflict: 'stripe_event_id' });

        if (orgId && !paid) {
          await admin.from('organizations')
            .update({ subscription_status: 'past_due' }).eq('id', orgId);
        }
        break;
      }

      case 'charge.refunded': {
        const ch = event.data.object as Stripe.Charge;
        const orgId = await resolveOrg(ch.customer as string, null);
        await admin.from('transactions').upsert({
          org_id: orgId,
          stripe_event_id: event.id,
          stripe_charge_id: ch.id,
          event_name: 'Refund',
          customer_email: ch.billing_details?.email ?? null,
          amount_cents: ch.amount_refunded ?? 0,
          currency: ch.currency ?? 'usd',
          status: 'refunded',
          kind: 'refund',
        }, { onConflict: 'stripe_event_id' });
        break;
      }
    }
  } catch (e) {
    console.error('[webhook] handler error', event.type, e);
  }
}
