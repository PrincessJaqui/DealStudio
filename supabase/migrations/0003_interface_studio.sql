-- ============================================================================
-- DealStudio Phase 4: Interface Studio + System Settings.
--   - accent_to: the second stop of the accent gradient (tabs / toggles)
--   - org-logos: a public storage bucket for company logos
-- Safe to re-run.
-- ============================================================================
begin;

-- Accent is a gradient (tabs, toggles). brand_accent is its first stop.
alter table public.organizations
  add column if not exists accent_to text not null default '#00d6af';

-- Bring existing rows onto the new teal defaults.
update public.organizations
   set brand_accent = '#00c2c8'
 where brand_accent in ('#04B6C0', '#64D7CD');

-- ── Company logos ────────────────────────────────────────────────────────────
-- Public read (logos appear on public investor pages); writes are restricted to
-- members of the owning organization, enforced by the folder name being the org id.

insert into storage.buckets (id, name, public)
values ('org-logos', 'org-logos', true)
on conflict (id) do update set public = true;

drop policy if exists org_logos_public_read on storage.objects;
create policy org_logos_public_read on storage.objects
  for select using (bucket_id = 'org-logos');

drop policy if exists org_logos_member_write on storage.objects;
create policy org_logos_member_write on storage.objects
  for all to authenticated
  using (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] in (select public.my_org_ids()::text)
  )
  with check (
    bucket_id = 'org-logos'
    and (storage.foldername(name))[1] in (select public.my_org_ids()::text)
  );

commit;
