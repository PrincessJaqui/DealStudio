// supabase/functions/send-deal-meeting-request/index.ts
//
// Notify the DealStudio team when an investor requests a meeting from the deal
// room, and send the investor a brief confirmation. Invoked best-effort by
// requestMeeting() in src/lib/dealStudio.ts after the meeting row is recorded.
//
// Inputs (JSON body):
//   • slug   — deal studio slug (e.g. "investors"), used to look up the company
//   • email  — requester email (optional but expected)
//   • name   — requester name (optional)
//   • date   — requested date string (optional)
//   • start  — requested time string (optional)
//   • note   — requester note (optional)
//
// Returns: { success, teamEmailed, requesterEmailed, error? }
//
// Deploy: supabase functions deploy send-deal-meeting-request --project-ref uahvdqzgbmrndmkhiqlb

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { renderBrandedEmail } from '../_shared/email-template.ts';
import { adminClient } from '../_shared/organizer.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://dealstudio.io').replace(/\/+$/, '');
const TEAM_INBOX = Deno.env.get('DEALSTUDIO_INBOX') || 'hello@dealstudio.io';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function escapeHtml(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY || !to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: 'DealStudio <hello@dealstudio.io>', to: [to], subject, html }),
    });
    if (!res.ok) { console.warn('meeting-request resend failed:', await res.text()); return false; }
    return true;
  } catch (e) { console.warn('meeting-request send error:', (e as any)?.message || e); return false; }
}

interface Payload { slug?: string; email?: string; name?: string; date?: string; start?: string; note?: string; }

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const p: Payload = await req.json();
    const requester = (p.email || '').trim().toLowerCase();
    const name = (p.name || '').trim();

    // Resolve the company name from the room (best-effort).
    let company = 'your deal studio';
    try {
      const admin = adminClient();
      const { data } = await admin.from('dealstudios').select('company_name').eq('slug', p.slug || 'investors').maybeSingle();
      if (data?.company_name) company = data.company_name;
    } catch (_) { /* fall back to default */ }

    const whenBits: string[] = [];
    if (p.date) whenBits.push(escapeHtml(p.date));
    if (p.start) whenBits.push(escapeHtml(p.start));
    const when = whenBits.join(' at ') || 'No specific time provided';
    const dealUrl = `${SITE_URL}/dealstudio`;

    // 1. Notify the team.
    const teamBody = `
      <p><strong>${escapeHtml(name || requester || 'An investor')}</strong> requested a meeting from the ${escapeHtml(company)} deal studio.</p>
      <p style="margin:0"><strong>Email:</strong> ${escapeHtml(requester || 'not provided')}</p>
      <p style="margin:0"><strong>Requested time:</strong> ${when}</p>
      ${p.note ? `<p style="margin-top:12px"><strong>Note:</strong> ${escapeHtml(p.note)}</p>` : ''}
    `;
    const teamHtml = renderBrandedEmail({
      headline: 'New meeting request',
      greeting: `${company} deal studio`,
      bodyHtml: teamBody,
      ctaText: 'Open the deal studio',
      ctaUrl: dealUrl,
    });
    const teamEmailed = await sendEmail(TEAM_INBOX, `New meeting request — ${company}`, teamHtml);

    // 2. Confirm to the requester.
    let requesterEmailed = false;
    if (requester) {
      const reqHtml = renderBrandedEmail({
        headline: 'Thanks — we got your request',
        greeting: name ? `Hi ${escapeHtml(name)},` : undefined,
        bodyHtml: `
          <p>We received your request to meet with the ${escapeHtml(company)} team.</p>
          <p style="margin:0"><strong>Requested time:</strong> ${when}</p>
          <p style="margin-top:12px">We'll be in touch shortly to confirm.</p>
        `,
      });
      requesterEmailed = await sendEmail(requester, `Your meeting request with ${company}`, reqHtml);
    }

    return json({ success: teamEmailed || requesterEmailed, teamEmailed, requesterEmailed });
  } catch (e) {
    return json({ success: false, error: (e as any)?.message || 'error' }, 500);
  }
});
