// supabase/functions/_shared/magic-link.ts
//
// Mints a single-use magic link that signs an approved user in and lands them
// on the /set-password screen, where they create their own password
// (supabase.auth.updateUser). Used by the approval email functions
// (send-facility-approval, send-ambassador-status-email, send-player-welcome-email)
// now that registration no longer collects a password and confirm-user creates
// the auth credential with a random password the user never sees.
//
// IMPORTANT: <SITE_URL>/set-password must be present in the Supabase Auth
// "Redirect URLs" allowlist (Authentication → URL Configuration) or the link
// will be rejected on click.
//
// Returns the action_link URL, or null on any failure so callers can fall back
// to a plain login CTA without breaking the email send.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SET_PASSWORD_PATH = '/set-password';

export async function generateSetPasswordLink(email: string): Promise<string | null> {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey || !email) return null;

    const siteUrl = (Deno.env.get('SITE_URL') || 'https://dealstudio.io').replace(/\/+$/, '');
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${siteUrl}${SET_PASSWORD_PATH}` },
    });
    if (error) {
      console.warn('generateSetPasswordLink failed:', error.message);
      return null;
    }
    return (data as any)?.properties?.action_link || null;
  } catch (e) {
    console.warn('generateSetPasswordLink error:', (e as any)?.message || e);
    return null;
  }
}
