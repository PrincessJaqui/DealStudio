// supabase/functions/_shared/email-template.ts
//
// One branded HTML email shell for every DealStudio transactional email,
// matching the approved design: white card on a light-gray canvas, centered
// AC logo, a large bold headline, a bold greeting line, body copy, a green
// pill CTA button, and a plain-text fallback link.
//
// Table-based layout + inline styles for maximum client compatibility
// (Gmail, Apple Mail, Outlook). Used by send-waitlist-confirmation,
// send-player-welcome-email, send-ambassador-status-email,
// send-facility-approval, send-magic-link, and the event-reminder job.

export interface BrandedEmailOptions {
  headline: string;        // big bold hero line, e.g. "Get excited! You're approved!"
  greeting?: string;       // bold line under the headline, e.g. "Welcome to DealStudio, John!"
  bodyHtml: string;        // one or more <p>…</p> paragraphs
  ctaText?: string;        // button label, e.g. "Start Exploring"
  ctaUrl?: string;         // button + fallback link target
  logoUrl?: string;        // hosted AC logo (PNG). Falls back to the wordmark.
}

const BRAND_GREEN = '#76b252';
const TEXT_DARK = '#191f1d';
const TEXT_BODY = '#374151';
const CANVAS = '#f1f3f5';
const DEFAULT_LOGO = 'https://dealstudio.io/email-logo.png';

export function renderBrandedEmail(opts: BrandedEmailOptions): string {
  const { headline, greeting, bodyHtml, ctaText, ctaUrl, logoUrl = DEFAULT_LOGO } = opts;

  const logoBlock = `
    <img src="${logoUrl}" width="120" alt="DealStudio" style="display:block;margin:0 auto;max-width:120px;height:auto;border:0;outline:none;text-decoration:none;" />
  `;

  const greetingBlock = greeting
    ? `<p style="margin:0 0 20px 0;font-size:17px;font-weight:700;color:${TEXT_DARK};line-height:1.4;">${greeting}</p>`
    : '';

  const ctaBlock = ctaText && ctaUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto;">
        <tr>
          <td align="center" bgcolor="${BRAND_GREEN}" style="border-radius:999px;">
            <a href="${ctaUrl}" target="_blank"
               style="display:inline-block;padding:16px 44px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;background-color:${BRAND_GREEN};">
              ${ctaText}
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:24px 0 6px 0;font-size:14px;font-weight:700;color:${TEXT_DARK};">If the button does not work, use this link:</p>
      <p style="margin:0;font-size:14px;word-break:break-all;"><a href="${ctaUrl}" target="_blank" style="color:${BRAND_GREEN};text-decoration:none;">${ctaUrl}</a></p>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <title>${headline}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${CANVAS};-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;">
            <tr>
              <td style="padding:48px 48px 40px 48px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <div style="text-align:center;margin-bottom:36px;">${logoBlock}</div>
                <h1 style="margin:0 0 28px 0;font-size:32px;line-height:1.2;font-weight:800;color:${TEXT_DARK};">${headline}</h1>
                ${greetingBlock}
                <div style="font-size:16px;line-height:1.6;color:${TEXT_BODY};">${bodyHtml}</div>
                ${ctaBlock}
              </td>
            </tr>
          </table>
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
            <tr>
              <td style="padding:24px 48px;text-align:center;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#9ca3af;">
                © ${new Date().getFullYear()} DealStudio &nbsp;·&nbsp; <a href="https://dealstudio.io" style="color:#9ca3af;text-decoration:underline;">dealstudio.io</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
