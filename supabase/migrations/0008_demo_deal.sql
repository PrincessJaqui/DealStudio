-- ============================================================================
-- Demo mode.
-- A deal flagged demo_mode is the public "live demo": no password, no approval.
-- Visitors give an email and are told plainly that doing so joins the mailing
-- list, so consent is informed rather than buried. Their email is captured as
-- a lead on the deal, exactly like any other visitor.
-- The Master Admin edits it like any other deal, so the demo is always current.
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists demo_mode boolean not null default false,
  add column if not exists demo_notice text not null default
    'This is a live demo. By entering your email you''ll also join our mailing list — we''ll send occasional product updates and you can unsubscribe anytime.';

-- The platform's own deal ("Demo Deal") is the public demo: open, no password.
update public.dealstudios d
   set demo_mode        = true,
       require_password = false,
       require_email    = true,
       invite_only      = false,
       is_active        = true,
       updated_at       = now()
  from public.organizations o
 where o.id = d.org_id
   and o.name = 'DealStudio'
   and d.company_name = 'Demo Deal';

commit;

select company_name, slug, demo_mode, is_active, require_password
from public.dealstudios where demo_mode = true;
