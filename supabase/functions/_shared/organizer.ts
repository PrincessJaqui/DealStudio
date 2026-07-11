// supabase/functions/_shared/organizer.ts
//
// Resolve an event's organizer (creator) — display name + contact email — from
// the event's created_by_type / created_by_id (which is the creator's
// auth_user_id). Runs server-side with the service role, so it is not subject
// to the RLS that would block a registrant's browser session from reading
// another account's profile/email.
//
// Used by send-event-registration-confirmation (organizer name on the player's
// email) and send-registration-received (notify the organizer of a new signup).

import { createClient } from 'jsr:@supabase/supabase-js@2';

export interface EventWithOrganizer {
  id: string;
  name: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  address: string | null;
  organizerName: string;
  organizerEmail: string;   // '' when none / master-admin
  createdByType: string | null;
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function resolveEventWithOrganizer(admin: any, eventId: string): Promise<EventWithOrganizer | null> {
  if (!eventId) return null;
  const { data: ev } = await admin
    .from('events')
    .select('id, name, date, time, location, address, created_by_type, created_by_id')
    .eq('id', eventId)
    .maybeSingle();
  if (!ev) return null;

  let organizerName = '';
  let organizerEmail = '';
  const type = ev.created_by_type as string | null;

  try {
    if (ev.created_by_id && (type === 'coach' || type === 'ambassador')) {
      const { data: c } = await admin
        .from('coach_profiles')
        .select('first_name, last_name, email')
        .eq('auth_user_id', ev.created_by_id)
        .maybeSingle();
      if (c) {
        organizerName = `${c.first_name || ''} ${c.last_name || ''}`.trim();
        organizerEmail = String(c.email || '').toLowerCase();
      }
    } else if (ev.created_by_id && type === 'facility') {
      const { data: f } = await admin
        .from('facility_profiles')
        .select('account_name, contact_email, email')
        .eq('auth_user_id', ev.created_by_id)
        .maybeSingle();
      if (f) {
        organizerName = String(f.account_name || '').trim();
        organizerEmail = String(f.contact_email || f.email || '').toLowerCase();
      }
    }
  } catch (e) {
    console.warn('resolveEventWithOrganizer profile lookup failed:', (e as any)?.message || e);
  }

  return {
    id: ev.id,
    name: ev.name ?? null,
    date: ev.date ?? null,
    time: ev.time ?? null,
    location: ev.location ?? null,
    address: ev.address ?? null,
    organizerName,
    organizerEmail,
    createdByType: type,
  };
}
