-- ============================================================================
-- Company handles: dealstudio.io/{handle}/{deck}
--
-- Each company picks a handle, and its deal rooms live under it. The old
-- /d/{slug} links KEEP WORKING: investors are already holding those, and a raise
-- is the worst possible moment to hand someone a 404.
--
-- Deal slugs stay globally unique. That is what makes the legacy /d/{slug} route
-- unambiguous, and dropping it to scope slugs per-company would make every old
-- link a guess. The handle is a nicer front door to the same room, not a new
-- addressing scheme underneath.
--
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.organizations
  add column if not exists handle text;

-- A handle sits at the root of the domain, so it has to look like a URL segment
-- and it must never shadow a real route.
create or replace function public.is_valid_handle(p text)
returns boolean
language sql immutable as $$
  select p ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and p !~ '--'
     and p not in (
       -- Every top-level route in the app, plus the ones we are likely to add.
       -- A company called "Admin" taking /admin would lock Jaqui out of her own
       -- product, so this list is not optional.
       'admin','api','app','assets','auth','billing','blog','d','dashboard',
       'dealstudio','docs','help','home','investors','login','logout','master',
       'privacy','pricing','public','reset-password','settings','signup','static',
       'support','terms','www'
     );
$$;

alter table public.organizations
  drop constraint if exists organizations_handle_valid;

alter table public.organizations
  add constraint organizations_handle_valid
  check (handle is null or public.is_valid_handle(handle));

create unique index if not exists organizations_handle_key
  on public.organizations (lower(handle))
  where handle is not null;

commit;

-- ---------------------------------------------------------------------------
-- Backfill a handle for every existing company, from its name.
-- Done outside the constraint transaction so a bad name cannot block the whole
-- migration: anything unusable simply stays null and gets set in the UI.
-- ---------------------------------------------------------------------------
begin;

do $$
declare
  r        record;
  base     text;
  cand     text;
  n        int;
begin
  for r in select id, name from public.organizations where handle is null loop
    base := regexp_replace(lower(coalesce(r.name, '')), '[^a-z0-9]+', '-', 'g');
    base := trim(both '-' from base);
    base := left(base, 30);

    if base = '' or length(base) < 3 then
      base := 'company';
    end if;

    cand := base;
    n := 0;

    -- Walk until the handle is both valid and free.
    while (not public.is_valid_handle(cand))
       or exists (select 1 from public.organizations
                   where lower(handle) = lower(cand)) loop
      n := n + 1;
      cand := left(base, 30) || '-' || n::text;
      if n > 200 then
        cand := null;
        exit;
      end if;
    end loop;

    if cand is not null then
      update public.organizations set handle = cand where id = r.id;
    end if;
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Let a company set its own handle.
-- ---------------------------------------------------------------------------
begin;

create or replace function public.set_org_handle(p_org uuid, p_handle text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_h text;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not authorized';
  end if;

  v_h := lower(trim(coalesce(p_handle, '')));

  if not public.is_valid_handle(v_h) then
    return jsonb_build_object(
      'ok', false,
      'message', 'Handles are 3 to 40 characters, lowercase letters, numbers and dashes, and cannot be a reserved word.'
    );
  end if;

  if exists (
    select 1 from public.organizations
     where lower(handle) = v_h and id <> p_org
  ) then
    return jsonb_build_object('ok', false, 'message', 'That handle is taken.');
  end if;

  update public.organizations set handle = v_h where id = p_org;

  return jsonb_build_object('ok', true, 'handle', v_h);
end;
$$;

grant execute on function public.set_org_handle(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Resolve {handle}/{deck} to the deal slug.
--
-- Deliberately returns ONLY the slug, not the room. The room still comes from
-- get_dealstudio_public, which already strips the password hash and the org id.
-- Duplicating that logic here would mean two places to get a leak wrong.
-- ---------------------------------------------------------------------------
create or replace function public.resolve_deal_slug(p_handle text, p_slug text)
returns text
language sql stable security definer set search_path = public as $$
  select d.slug
    from public.dealstudios d
    join public.organizations o on o.id = d.org_id
   where lower(o.handle) = lower(trim(p_handle))
     and lower(d.slug)   = lower(trim(p_slug))
   limit 1;
$$;

grant execute on function public.resolve_deal_slug(text, text) to anon, authenticated;

commit;
