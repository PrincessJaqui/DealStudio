-- ============================================================================
-- NewsRoom, Phase 1a: composer + blog-style page. No email, no gating yet.
--
-- One NewsRoom per organization. Each published update is an immutable snapshot
-- of ordered content blocks, so a link shared today keeps showing today's
-- numbers even after the next update goes out. Investors read the page through a
-- share token (anon), the same way the public deal room works, so no investor
-- account is needed in v1.
--
-- KPI values are stored on every update from day one, even though the trend
-- pop-up and email come in later phases. That is deliberate: trends can only be
-- drawn from history that was captured all along, and back-filling it later is
-- impossible.
-- ============================================================================

-- ── PROJECT GUARD ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'dealstudios'
  ) then
    raise exception
      E'\n\n####################################################\n'
      '#  STOP -- WRONG SUPABASE PROJECT.                 #\n'
      '#  The "dealstudios" table was not found.          #\n'
      '#  Expected project ref: fitjoizptvxposunejgz      #\n'
      '#  Migration aborted. Nothing was changed.         #\n'
      '####################################################\n';
  end if;
end $$;

begin;

-- One NewsRoom per org. share_token drives the public page URL.
create table if not exists public.newsrooms (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  title        text not null default 'Company Updates',
  share_token  text not null default encode(gen_random_bytes(16), 'hex'),
  created_at   timestamptz not null default now(),
  unique (org_id)
);

-- Each published update: a title, a date, and an ordered array of content
-- blocks stored as JSON. blocks is the whole body; kpis is pulled out separately
-- so it can be read as a time series without parsing every block.
create table if not exists public.newsroom_updates (
  id            uuid primary key default gen_random_uuid(),
  newsroom_id   uuid not null references public.newsrooms(id) on delete cascade,
  title         text not null default 'Untitled update',
  status        text not null default 'draft',      -- draft | published
  blocks        jsonb not null default '[]'::jsonb,  -- ordered content blocks
  kpis          jsonb not null default '[]'::jsonb,  -- [{key,label,value,unit}]
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists newsroom_updates_room_idx
  on public.newsroom_updates (newsroom_id, published_at desc);

alter table public.newsrooms         enable row level security;
alter table public.newsroom_updates  enable row level security;

-- Owners manage their own org's newsroom. Mirrors how deals are scoped.
drop policy if exists newsrooms_owner on public.newsrooms;
create policy newsrooms_owner on public.newsrooms
  for all to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));

drop policy if exists updates_owner on public.newsroom_updates;
create policy updates_owner on public.newsroom_updates
  for all to authenticated
  using (newsroom_id in (select id from public.newsrooms where org_id in (select public.my_org_ids())))
  with check (newsroom_id in (select id from public.newsrooms where org_id in (select public.my_org_ids())));

-- ── Owner: get or create my org's newsroom ─────────────────────────────────
create or replace function public.newsroom_mine()
returns public.newsrooms
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_row public.newsrooms;
begin
  select id into v_org from public.organizations
   where id in (select public.my_org_ids()) order by created_at limit 1;
  if v_org is null then raise exception 'no organization'; end if;

  select * into v_row from public.newsrooms where org_id = v_org;
  if not found then
    insert into public.newsrooms (org_id) values (v_org) returning * into v_row;
  end if;
  return v_row;
end;
$$;

grant execute on function public.newsroom_mine() to authenticated;

-- ── Public (anon): read a published newsroom + its updates by share token ───
-- Only published updates, only the fields a reader needs. Drafts never leave the
-- database. This is the anon-safe read the public page calls.
create or replace function public.newsroom_public(p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room public.newsrooms;
  v_org  public.organizations;
  result jsonb;
begin
  select * into v_room from public.newsrooms where share_token = p_token;
  if not found then return null; end if;

  select * into v_org from public.organizations where id = v_room.org_id;

  select jsonb_build_object(
    'title',      v_room.title,
    'company',    v_org.name,
    'logo_url',   v_org.logo_url,
    'brand_from', v_org.brand_from,
    'brand_to',   v_org.brand_to,
    'updates', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',           u.id,
        'title',        u.title,
        'blocks',       u.blocks,
        'kpis',         u.kpis,
        'published_at', u.published_at
      ) order by u.published_at desc), '[]'::jsonb)
      from public.newsroom_updates u
      where u.newsroom_id = v_room.id and u.status = 'published'
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.newsroom_public(text) to anon, authenticated;

commit;

select 'newsroom phase 1a ready' as status;
