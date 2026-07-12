-- ============================================================================
-- DealStudio Phase 2: multi-tenancy.
-- Organizations own deals. Members belong to organizations. RLS scopes every
-- authenticated read/write to the caller's organization. Public investor pages
-- keep working through the existing anonymous RPCs, unchanged.
-- Safe to re-run.
-- ============================================================================
begin;

-- ── Organizations ────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null default 'My Company',
  slug                   text unique,
  logo_url               text,

  -- Interface Studio (Phase 4). Defaults are the DealStudio brand.
  brand_from             text not null default '#627FD9',
  brand_to               text not null default '#0030CD',
  brand_accent           text not null default '#04B6C0',

  -- Billing (Phase 5). Present now so nothing needs migrating later.
  stripe_customer_id     text,
  stripe_subscription_id text,
  plan                   text not null default 'trial',
  subscription_status    text not null default 'trialing',
  trial_ends_at          timestamptz not null default (now() + interval '14 days'),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table if not exists public.org_members (
  org_id       uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner','admin','member')),
  created_at   timestamptz not null default now(),
  primary key (org_id, auth_user_id)
);
create index if not exists org_members_user_idx on public.org_members (auth_user_id);

-- Deals belong to an organization.
alter table public.dealstudios
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
create index if not exists dealstudios_org_idx on public.dealstudios (org_id);

-- ── Helpers (SECURITY DEFINER so they can read membership under RLS) ─────────

create or replace function public.my_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from public.org_members where auth_user_id = auth.uid();
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where auth_user_id = auth.uid() and org_id = p_org
  );
$$;

-- The org that owns a given deal (used by child-table policies).
create or replace function public.deal_org(p_deal uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.dealstudios where id = p_deal;
$$;

-- ── Onboarding: create an org for the signed-in user, with their first deal ──

create or replace function public.create_org_for_current_user(
  p_name text, p_deal_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_slug text;
  v_deal uuid;
  n int := 0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  -- Already a member somewhere: return that org rather than making a second.
  select org_id into v_org from public.org_members where auth_user_id = v_uid limit 1;
  if v_org is not null then
    return jsonb_build_object('org_id', v_org, 'created', false);
  end if;

  insert into public.organizations (name) values (coalesce(nullif(trim(p_name),''), 'My Company'))
  returning id into v_org;

  insert into public.org_members (org_id, auth_user_id, role)
  values (v_org, v_uid, 'owner');

  -- First deal. Slugs are globally unique (short share links), so de-dupe.
  v_slug := regexp_replace(lower(coalesce(nullif(trim(p_deal_slug),''), 'deal')), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'deal'; end if;
  while exists (select 1 from public.dealstudios where slug = v_slug) loop
    n := n + 1;
    v_slug := regexp_replace(v_slug, '-[0-9]+$', '') || '-' || n::text;
  end loop;

  insert into public.dealstudios (org_id, slug, company_name, is_active)
  values (v_org, v_slug, coalesce(nullif(trim(p_name),''), 'My Company'), false)
  returning id into v_deal;

  return jsonb_build_object('org_id', v_org, 'deal_id', v_deal, 'slug', v_slug, 'created', true);
end;
$$;

-- Create an additional deal inside the caller's org (Deal Manager, Phase 3).
create or replace function public.create_deal(p_org uuid, p_name text, p_slug text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_slug text; v_deal uuid; n int := 0;
begin
  if not public.is_org_member(p_org) then raise exception 'not authorized'; end if;

  v_slug := regexp_replace(lower(coalesce(nullif(trim(p_slug),''), nullif(trim(p_name),''), 'deal')), '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := 'deal'; end if;
  while exists (select 1 from public.dealstudios where slug = v_slug) loop
    n := n + 1;
    v_slug := regexp_replace(v_slug, '-[0-9]+$', '') || '-' || n::text;
  end loop;

  insert into public.dealstudios (org_id, slug, company_name, is_active)
  values (p_org, v_slug, coalesce(nullif(trim(p_name),''), 'New Deal'), false)
  returning id into v_deal;

  return jsonb_build_object('deal_id', v_deal, 'slug', v_slug);
end;
$$;

-- ── RLS: authenticated access is scoped to the caller's organization ─────────

alter table public.organizations enable row level security;
alter table public.org_members   enable row level security;

drop policy if exists org_read   on public.organizations;
create policy org_read   on public.organizations for select to authenticated
  using (public.is_org_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (public.is_org_member(id)) with check (public.is_org_member(id));

drop policy if exists members_read on public.org_members;
create policy members_read on public.org_members for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- Deals: replace the old global-admin policy with org scoping.
drop policy if exists admin_all on public.dealstudios;
drop policy if exists org_deals on public.dealstudios;
create policy org_deals on public.dealstudios for all to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));

-- Child tables inherit their org through the parent deal.
drop policy if exists admin_all  on public.deal_documents;
drop policy if exists org_docs   on public.deal_documents;
create policy org_docs on public.deal_documents for all to authenticated
  using (public.deal_org(dealstudio_id) in (select public.my_org_ids()))
  with check (public.deal_org(dealstudio_id) in (select public.my_org_ids()));

drop policy if exists admin_all   on public.dealstudio_access;
drop policy if exists org_access  on public.dealstudio_access;
create policy org_access on public.dealstudio_access for all to authenticated
  using (public.deal_org(dealstudio_id) in (select public.my_org_ids()))
  with check (public.deal_org(dealstudio_id) in (select public.my_org_ids()));

drop policy if exists admin_read   on public.dealstudio_visits;
drop policy if exists org_visits   on public.dealstudio_visits;
create policy org_visits on public.dealstudio_visits for select to authenticated
  using (public.deal_org(dealstudio_id) in (select public.my_org_ids()));

drop policy if exists admin_read     on public.deal_meetings;
drop policy if exists org_meetings   on public.deal_meetings;
create policy org_meetings on public.deal_meetings for select to authenticated
  using (public.deal_org(dealstudio_id) in (select public.my_org_ids()));

-- ── Admin RPCs must now authorize by organization, not the global role ───────

create or replace function public.dealstudio_invite(
  p_room_id uuid, p_email text, p_name text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_org_member(public.deal_org(p_room_id)) then
    raise exception 'not authorized';
  end if;
  insert into public.dealstudio_access
    (dealstudio_id, email, name, status, invited, access_password_hash, approved_at, stage)
  values
    (p_room_id, lower(trim(p_email)), p_name, 'approved', true,
     case when nullif(p_password,'') is null then null else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
     now(), 'engaged')
  on conflict (dealstudio_id, email) do update set
    name                 = coalesce(excluded.name, public.dealstudio_access.name),
    status               = 'approved',
    invited              = true,
    access_password_hash = coalesce(excluded.access_password_hash, public.dealstudio_access.access_password_hash),
    approved_at          = now();
end;
$$;

create or replace function public.dealstudio_set_access_password(
  p_access_id uuid, p_password text, p_status text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_deal uuid;
begin
  select dealstudio_id into v_deal from public.dealstudio_access where id = p_access_id;
  if v_deal is null or not public.is_org_member(public.deal_org(v_deal)) then
    raise exception 'not authorized';
  end if;
  update public.dealstudio_access set
    access_password_hash = case when nullif(p_password,'') is null then null
                                else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
    status               = coalesce(nullif(p_status,''), status),
    approved_at          = case when p_status = 'approved' then now() else approved_at end
  where id = p_access_id;
end;
$$;

create or replace function public.dealstudio_set_shared_password(p_slug text, p_password text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_org uuid;
begin
  select org_id into v_org from public.dealstudios where slug = p_slug;
  if v_org is null or not public.is_org_member(v_org) then
    raise exception 'not authorized';
  end if;
  update public.dealstudios set
    shared_password_hash = case when nullif(p_password,'') is null then null
                                else extensions.crypt(p_password, extensions.gen_salt('bf')) end,
    updated_at = now()
  where slug = p_slug;
end;
$$;

-- ── Grants ───────────────────────────────────────────────────────────────────

grant select, update on public.organizations to authenticated;
grant select on public.org_members to authenticated;
grant execute on function public.my_org_ids()                              to authenticated;
grant execute on function public.is_org_member(uuid)                       to authenticated;
grant execute on function public.deal_org(uuid)                            to authenticated;
grant execute on function public.create_org_for_current_user(text,text)    to authenticated;
grant execute on function public.create_deal(uuid,text,text)               to authenticated;

-- ── Adopt existing data: give the current deal an organization ───────────────

do $$
declare v_org uuid;
begin
  if exists (select 1 from public.dealstudios where org_id is null) then
    select id into v_org from public.organizations where name = 'DealStudio' limit 1;
    if v_org is null then
      insert into public.organizations (name, slug, plan, subscription_status)
      values ('DealStudio', 'dealstudio', 'owner', 'active')
      returning id into v_org;
    end if;

    update public.dealstudios set org_id = v_org where org_id is null;

    -- Existing logins become owners of that org.
    insert into public.org_members (org_id, auth_user_id, role)
    select v_org, u.id, 'owner' from auth.users u
    where u.email in ('hello@dealstudio.io', 'jaquimccarthy@gmail.com')
    on conflict (org_id, auth_user_id) do nothing;
  end if;
end $$;

-- Public payload must not expose internal tenant identifiers.
create or replace function public.get_dealstudio_public(p_slug text)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select to_jsonb(d) - 'shared_password_hash' - 'org_id' || jsonb_build_object(
    'documents',
    coalesce((
      select jsonb_agg(to_jsonb(doc) order by doc.sort_order)
      from public.deal_documents doc
      where doc.dealstudio_id = d.id and doc.is_archived = false
    ), '[]'::jsonb)
  )
  from public.dealstudios d
  where d.slug = p_slug and d.is_active = true
  limit 1;
$$;
grant execute on function public.get_dealstudio_public(text) to anon, authenticated;

commit;
