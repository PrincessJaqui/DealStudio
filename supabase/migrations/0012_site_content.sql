-- ============================================================================
-- Editable landing page.
--
-- The landing page becomes a list of ordered blocks stored as jsonb. A platform
-- admin edits them; everyone else (including anonymous visitors) can only read.
--
-- If no blocks exist, the app falls back to the hard-coded page, so an empty
-- table can never produce a blank marketing site.
-- Safe to re-run.
-- ============================================================================
begin;

create table if not exists public.site_content (
  key        text primary key,
  value      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.site_content enable row level security;

-- Anyone may read the marketing page, signed in or not.
drop policy if exists site_content_read on public.site_content;
create policy site_content_read on public.site_content
  for select to anon, authenticated using (true);

-- Only platform admins may change it.
drop policy if exists site_content_write on public.site_content;
create policy site_content_write on public.site_content
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

/** Public read of a content key. Returns an empty array when unset. */
create or replace function public.get_site_content(p_key text default 'landing')
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select value from public.site_content where key = p_key),
    '[]'::jsonb
  );
$$;

/** Platform-admin write. */
create or replace function public.save_site_content(p_key text, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  insert into public.site_content (key, value, updated_at, updated_by)
  values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = auth.uid();

  return jsonb_build_object('saved', true);
end;
$$;

-- Images for the marketing page.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do update set public = true;

drop policy if exists site_assets_read on storage.objects;
create policy site_assets_read on storage.objects
  for select using (bucket_id = 'site-assets');

drop policy if exists site_assets_write on storage.objects;
create policy site_assets_write on storage.objects
  for all to authenticated
  using (bucket_id = 'site-assets' and public.is_platform_admin())
  with check (bucket_id = 'site-assets' and public.is_platform_admin());

grant select on public.site_content to anon, authenticated;
grant execute on function public.get_site_content(text)          to anon, authenticated;
grant execute on function public.save_site_content(text, jsonb)  to authenticated;

commit;

select 'landing page editor ready' as status;
