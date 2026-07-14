-- ============================================================================
-- CATCH-UP: migrations 0030 through 0041, concatenated in order.
--
-- Nothing from 0030 onward is in the database. Rather than opening twelve
-- files, paste this whole thing into the Supabase SQL editor and run it once.
--
-- Every file below is safe to re-run: constraints and policies are dropped
-- before they are created, tables are if-not-exists, functions are create or
-- replace. Each carries its own begin/commit, so they apply as twelve
-- transactions in sequence. If one throws, fix it and run the whole thing
-- again; the ones that already landed will simply re-apply.
--
-- Order is load-bearing in two places. 0036 creates the tables 0037's
-- functions read, and 0041 must come after 0037, or admin_deal_people loses
-- last_note_at again.
-- ============================================================================


-- ===========================================================================
-- 0030_company_handles.sql
-- ===========================================================================
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


-- ===========================================================================
-- 0031_comped_and_dashboard.sql
-- ===========================================================================
-- ============================================================================
-- 1. Comped no longer means unlimited.
-- 2. A platform activity dashboard for the master admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- COMPED IS NOT UNLIMITED
--
-- Comping an account waived the PLAN fee and, by accident, every seat and deal
-- limit with it: a comped org could add unlimited teammates and unlimited deal
-- rooms. Comped now means "the plan is free", nothing more. Extra seats and
-- extra deal rooms are granted one at a time, on purpose, through add-ons.
-- ---------------------------------------------------------------------------
begin;

create or replace function public.add_org_member(p_org uuid, p_email text, p_role text default 'admin')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user  uuid;
  v_seats record;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not authorized';
  end if;

  -- No comped exemption. A comped plan is a free plan, not a free-for-all.
  select * into v_seats from public.org_seat_status(p_org);

  if not v_seats.can_add then
    raise exception 'SEAT_REQUIRED: % of % seats used', v_seats.used, v_seats.allowed;
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));

  if v_user is null then
    insert into public.org_invites (org_id, email, role, invited_by)
    values (p_org, lower(trim(p_email)), p_role, auth.uid())
    on conflict (org_id, lower(email)) do nothing;
    return jsonb_build_object('ok', true, 'invited', true);
  end if;

  insert into public.org_members (org_id, auth_user_id, role)
  values (p_org, v_user, p_role)
  on conflict (org_id, auth_user_id) do nothing;

  return jsonb_build_object('ok', true, 'invited', false);
end;
$$;

grant execute on function public.add_org_member(uuid, text, text) to authenticated;

create or replace function public.create_deal(p_org uuid, p_name text, p_slug text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_slug  text;
  v_deal  uuid;
  n       int := 0;
  v_deals record;
begin
  if not public.is_org_member(p_org) then raise exception 'not authorized'; end if;

  -- Same rule: comped does not buy extra deal rooms.
  select * into v_deals from public.org_deal_status(p_org);

  if not v_deals.can_add then
    raise exception 'DEAL_LIMIT: % of % deal rooms used', v_deals.used, v_deals.allowed;
  end if;

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

grant execute on function public.create_deal(uuid, text, text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- PLATFORM DASHBOARD
-- One call, so the screen does not fan out into a dozen round trips.
-- Platform admins only: this is every customer's activity in one place.
-- ---------------------------------------------------------------------------
begin;

create or replace function public.admin_platform_stats()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'users', jsonb_build_object(
      'total',        (select count(*) from auth.users),
      'confirmed',    (select count(*) from auth.users where email_confirmed_at is not null),
      'new_30d',      (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'active_7d',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'active_30d',   (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      -- Never signed in: created, but never came back. The number that tells you
      -- whether activation is working.
      'never_signed_in', (select count(*) from auth.users where last_sign_in_at is null)
    ),

    'companies', jsonb_build_object(
      'total',     (select count(*) from public.organizations),
      'paying',    (select count(*) from public.organizations
                     where subscription_status = 'active' and not coalesce(comped, false)),
      'trialing',  (select count(*) from public.organizations
                     where coalesce(subscription_status,'') <> 'active'
                       and trial_ends_at > now() and not coalesce(comped, false)),
      'comped',    (select count(*) from public.organizations where coalesce(comped, false)),
      'expired',   (select count(*) from public.organizations
                     where coalesce(subscription_status,'') <> 'active'
                       and coalesce(trial_ends_at, now() - interval '1 day') <= now()
                       and not coalesce(comped, false))
    ),

    'deals', jsonb_build_object(
      'total',   (select count(*) from public.dealstudios),
      'active',  (select count(*) from public.dealstudios where is_active),
      'draft',   (select count(*) from public.dealstudios where not is_active)
    ),

    'engagement', jsonb_build_object(
      'investor_sessions',   (select count(*) from public.dealstudio_visits),
      'sessions_7d',         (select count(*) from public.dealstudio_visits
                               where last_seen_at > now() - interval '7 days'),
      'total_page_views',    (select coalesce(sum(page_views), 0) from public.dealstudio_visits),
      'total_deck_views',    (select coalesce(sum(deck_views), 0) from public.dealstudio_visits),
      'investors_tracked',   (select count(*) from public.dealstudio_access),
      'committed_cents',     (select coalesce(sum(committed_amount), 0) from public.dealstudio_access)
    ),

    -- Per-deal, so the master admin can see WHICH rooms investors actually open,
    -- not just that some of them do.
    'per_deal', (
      select coalesce(jsonb_agg(x order by x->>'views' desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
                 'slug',     d.slug,
                 'company',  o.name,
                 'active',   d.is_active,
                 'sessions', count(distinct v.id),
                 'views',    coalesce(sum(v.page_views), 0),
                 'investors',(select count(*) from public.dealstudio_access a
                               where a.dealstudio_id = d.id)
               ) as x
          from public.dealstudios d
          join public.organizations o on o.id = d.org_id
          left join public.dealstudio_visits v on v.dealstudio_id = d.id
         group by d.id, d.slug, d.is_active, o.name
         limit 50
      ) t
    )
  ) into v;

  return v;
end;
$$;

grant execute on function public.admin_platform_stats() to authenticated;

commit;


-- ===========================================================================
-- 0032_stripe_price_ids.sql
-- ===========================================================================
-- ============================================================================
-- Let Pricing Setup store Stripe price IDs.
--
-- plans.stripe_price_id and plan_addons.stripe_price_id already exist, and
-- api/stripe/checkout.ts refuses to start a checkout without them -- it even
-- says "Add it in Pricing Setup". But the save functions never accepted the
-- field, so there was no way to add it. The column, the error message, and the
-- UI disagreed with each other.
--
-- A Stripe price ID (price_...) is NOT a secret. It is sent to the browser on
-- every checkout. The SECRET key never touches the database or this repo: it
-- lives only in Vercel's environment.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_save_plan(
  p_id        uuid,
  p_name      text,
  p_desc      text,
  p_price     integer,
  p_unit_type text,
  p_interval  text,
  p_public    boolean,
  p_stripe_price text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_id is null then
    insert into public.plans (name, description, price_cents, unit_type, interval, is_public, stripe_price_id)
    values (trim(p_name), p_desc, p_price, p_unit_type, p_interval, p_public,
            nullif(trim(coalesce(p_stripe_price, '')), ''))
    returning id into v_id;
  else
    update public.plans
       set name            = trim(p_name),
           description     = p_desc,
           price_cents     = p_price,
           unit_type       = p_unit_type,
           interval        = p_interval,
           is_public       = p_public,
           stripe_price_id = nullif(trim(coalesce(p_stripe_price, '')), '')
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_save_plan(uuid, text, text, integer, text, text, boolean, text) to authenticated;

create or replace function public.admin_save_addon(
  p_id        uuid,
  p_plan      uuid,
  p_name      text,
  p_desc      text,
  p_price     integer,
  p_unit      text,
  p_unit_type text,
  p_interval  text,
  p_stripe_price text default null,
  p_grants_seats boolean default null,
  p_grants_deals boolean default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if p_id is null then
    insert into public.plan_addons
      (plan_id, name, description, price_cents, unit, unit_type, interval,
       stripe_price_id, grants_seats, grants_deals)
    values
      (p_plan, trim(p_name), p_desc, p_price, p_unit, p_unit_type, p_interval,
       nullif(trim(coalesce(p_stripe_price, '')), ''),
       coalesce(p_grants_seats, false), coalesce(p_grants_deals, false))
    returning id into v_id;
  else
    update public.plan_addons
       set plan_id         = p_plan,
           name            = trim(p_name),
           description     = p_desc,
           price_cents     = p_price,
           unit            = p_unit,
           unit_type       = p_unit_type,
           interval        = p_interval,
           stripe_price_id = nullif(trim(coalesce(p_stripe_price, '')), ''),
           grants_seats    = coalesce(p_grants_seats, grants_seats),
           grants_deals    = coalesce(p_grants_deals, grants_deals)
     where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function public.admin_save_addon(uuid, uuid, text, text, integer, text, text, text, text, boolean, boolean) to authenticated;

commit;


-- ===========================================================================
-- 0033_admin_org_owner.sql
-- ===========================================================================
-- ============================================================================
-- The companies table needs the owner's NAME and the company LOGO.
--
-- It only had owner_email, so the master admin was looking at a list of email
-- addresses with no idea who anyone actually is.
--
-- The name comes from user metadata (full_name), which is what
-- adminCreateUser writes when a master admin creates an account. It can be
-- null -- someone who signed up themselves never gave one -- and the UI has to
-- cope with that rather than printing "null".
--
-- Safe to re-run.
-- ============================================================================
begin;

drop function if exists public.admin_list_orgs();

create or replace function public.admin_list_orgs()
returns table (
  id uuid,
  name text,
  logo_url text,
  handle text,
  owner_email text,
  owner_name text,
  owner_id uuid,
  plan text,
  plan_name text,
  subscription_status text,
  suspended boolean,
  comped boolean,
  trial_ends_at timestamptz,
  deal_count bigint,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    o.id,
    o.name,
    o.logo_url,
    -- handle only exists once 0030 has run; guard so this works either way.
    (case when exists (
       select 1 from information_schema.columns
        where table_schema='public' and table_name='organizations' and column_name='handle'
     ) then (select h.handle from public.organizations h where h.id = o.id) else null end)::text,
    owner.email::text,
    nullif(trim(coalesce(
      owner.raw_user_meta_data->>'full_name',
      owner.raw_user_meta_data->>'name',
      ''
    )), '')::text,
    owner.id,
    o.plan,
    p.name,
    o.subscription_status,
    o.suspended,
    o.comped,
    o.trial_ends_at,
    (select count(*) from public.dealstudios d where d.org_id = o.id),
    o.created_at
  from public.organizations o
  left join public.plans p on p.id = o.plan_id
  left join lateral (
    -- The owner is the earliest owner-role member. A company always has one.
    select u.id, u.email, u.raw_user_meta_data
      from public.org_members m
      join auth.users u on u.id = m.auth_user_id
     where m.org_id = o.id
     order by (m.role = 'owner') desc
     limit 1
  ) owner on true
  where public.is_platform_admin()
  order by o.created_at desc;
$$;

grant execute on function public.admin_list_orgs() to authenticated;

commit;


-- ===========================================================================
-- 0034_admin_edit_user.sql
-- ===========================================================================
-- ============================================================================
-- Let a master admin fix a user's NAME.
--
-- The name lives in auth.users.raw_user_meta_data. A customer on the phone
-- saying "my name is spelled wrong" previously had no fix at all: nothing in the
-- product could write to it.
--
-- We UPDATE an existing auth.users row, which is safe. We never INSERT one --
-- creating a user in SQL corrupts the identities table and breaks their login.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_set_user_name(p_user uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('full_name', to_jsonb(v_name)),
         updated_at = now()
   where id = p_user;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'No such user.');
  end if;

  return jsonb_build_object('ok', true, 'name', v_name);
end;
$$;

grant execute on function public.admin_set_user_name(uuid, text) to authenticated;

commit;


-- ===========================================================================
-- 0035_viewer_controls.sql
-- ===========================================================================
-- ============================================================================
-- Viewer controls for Deal Flow: delete, reset, block.
--
-- A founder running a raise needs to be able to say "that person should not be
-- in here". Until now the only options were to leave them or to delete the whole
-- room.
--
-- Blocking sets the access status to 'revoked'. That is not decoration:
-- dealstudio_verify_access only lets someone in when status = 'approved', so a
-- revoked viewer is genuinely locked out at the gate, not merely hidden from a
-- list.
--
-- Safe to re-run.
-- ============================================================================
begin;

-- Who owns this deal? Every function below is gated on it.
create or replace function public.owns_deal(p_deal uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.dealstudios d
     where d.id = p_deal
       and public.is_org_member(d.org_id)
  );
$$;

grant execute on function public.owns_deal(uuid) to authenticated;


-- ── Permanently delete a viewer ─────────────────────────────────────────────
-- Removes the visit record entirely. Their analytics go with them, which is the
-- point: this is for the test visits and the mistakes, not for hiding a real
-- investor you would rather forget.
create or replace function public.admin_delete_visit(p_visit uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
begin
  select dealstudio_id into v_deal from public.dealstudio_visits where id = p_visit;
  if v_deal is null then
    return jsonb_build_object('ok', false, 'message', 'No such viewer.');
  end if;
  if not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  delete from public.dealstudio_visits where id = p_visit;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_visit(uuid) to authenticated;


-- ── Reset a viewer's counts ─────────────────────────────────────────────────
-- Keeps the person, zeroes the numbers. For when you have been testing against
-- your own deck and do not want your own 40 views in the analytics.
create or replace function public.admin_reset_visit(p_visit uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
begin
  select dealstudio_id into v_deal from public.dealstudio_visits where id = p_visit;
  if v_deal is null then
    return jsonb_build_object('ok', false, 'message', 'No such viewer.');
  end if;
  if not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  update public.dealstudio_visits
     set page_views    = 0,
         deck_views    = 0,
         total_seconds = 0,
         sections      = '{}'::jsonb
   where id = p_visit;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_reset_visit(uuid) to authenticated;


-- ── Block or unblock a viewer by email ──────────────────────────────────────
-- Creates the access row if there is not one, so you can block someone who only
-- ever showed up as a visit.
create or replace function public.admin_block_viewer(
  p_deal uuid,
  p_email text,
  p_blocked boolean
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if not public.owns_deal(p_deal) then
    raise exception 'not authorized';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return jsonb_build_object('ok', false, 'message', 'That viewer has no email to block.');
  end if;

  if p_blocked then
    -- 'revoked' is what the gate already refuses. Reusing it means blocking
    -- cannot drift out of sync with the thing that enforces it.
    insert into public.dealstudio_access (dealstudio_id, email, status, source)
    values (p_deal, v_email, 'revoked', 'blocked')
    on conflict (dealstudio_id, lower(email))
      do update set status = 'revoked';
  else
    update public.dealstudio_access
       set status = 'pending'
     where dealstudio_id = p_deal
       and lower(email) = v_email
       and status = 'revoked';
  end if;

  return jsonb_build_object('ok', true, 'blocked', p_blocked);
end;
$$;

grant execute on function public.admin_block_viewer(uuid, text, boolean) to authenticated;

commit;


-- ===========================================================================
-- 0036_deal_people.sql
-- ===========================================================================
-- ============================================================================
-- One table of people per deal: pipeline and viewers merged.
--
-- TWO WORDS THAT MEAN DIFFERENT THINGS, AND MUST STAY SEPARATE:
--   status  = the ACCESS GATE. approved / revoked. dealstudio_verify_access
--             only lets in 'approved'. Blocking sets 'revoked'.
--   stage   = the PIPELINE. prospect, met, viewed, lead, ... closed, passed.
--
-- The UI calls the pipeline column "Status", which is fine for a founder, but
-- collapsing them in the database would mean marking someone "passed" silently
-- locked them out of the room, or that blocking someone reset their pipeline.
-- They stay separate.
--
-- Safe to re-run.
-- ============================================================================
begin;

-- ── Pipeline stages ─────────────────────────────────────────────────────────
alter table public.dealstudio_access drop constraint if exists dealstudio_access_stage_check;

-- Old values map forward: reached_out -> met, engaged -> interested.
update public.dealstudio_access set stage = 'met'        where stage = 'reached_out';
update public.dealstudio_access set stage = 'interested' where stage = 'engaged';

alter table public.dealstudio_access
  add constraint dealstudio_access_stage_check
  check (stage in (
    'prospect',     -- founder added them by hand
    'met',          -- founder has spoken to them
    'viewed',       -- set automatically the first time they open the room
    'lead',         -- founder moved them into the pipeline
    'interested',
    'negotiating',
    'committed',
    'closed',
    'passed'
  ));

alter table public.dealstudio_access alter column stage set default 'prospect';

-- ── Who they are ────────────────────────────────────────────────────────────
alter table public.dealstudio_access
  add column if not exists company_name  text,
  add column if not exists company_logo  text,
  add column if not exists linkedin      text,
  add column if not exists website       text,
  -- Their own link. Anyone opening the room with this token is either them or
  -- someone they forwarded it to.
  add column if not exists share_token   uuid default gen_random_uuid();

update public.dealstudio_access set share_token = gen_random_uuid() where share_token is null;

create unique index if not exists dealstudio_access_share_token_key
  on public.dealstudio_access (share_token);

-- ── Notes, as real rows ─────────────────────────────────────────────────────
-- A note per row, not a blob in a text column: they need ordering, editing, and
-- an honest record of who changed a stage and why.
create table if not exists public.dealstudio_notes (
  id          uuid primary key default gen_random_uuid(),
  access_id   uuid not null references public.dealstudio_access(id) on delete cascade,
  body        text not null,
  -- 'note' = written by hand. 'stage' = written automatically when the stage
  -- changed, so the history explains itself later.
  kind        text not null default 'note' check (kind in ('note', 'stage')),
  author      uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists dealstudio_notes_access_idx
  on public.dealstudio_notes (access_id, created_at desc);

alter table public.dealstudio_notes enable row level security;

drop policy if exists notes_owner_all on public.dealstudio_notes;
create policy notes_owner_all on public.dealstudio_notes
  for all to authenticated
  using (exists (
    select 1 from public.dealstudio_access a
     where a.id = access_id and public.owns_deal(a.dealstudio_id)
  ))
  with check (exists (
    select 1 from public.dealstudio_access a
     where a.id = access_id and public.owns_deal(a.dealstudio_id)
  ));

-- ── Forward tracking ────────────────────────────────────────────────────────
-- Every distinct browser that opens someone's personal link. The FIRST is the
-- investor. Any others are people the link reached that we never sent it to.
--
-- This is a proxy for sharing, not a measurement of it: the same investor on a
-- phone and a laptop looks like one forward, and a forward nobody opens looks
-- like none. The UI says "Forwards" for exactly that reason.
create table if not exists public.dealstudio_share_opens (
  id             uuid primary key default gen_random_uuid(),
  access_id      uuid not null references public.dealstudio_access(id) on delete cascade,
  session_token  text not null,
  first_seen_at  timestamptz not null default now()
);

create unique index if not exists dealstudio_share_opens_uniq
  on public.dealstudio_share_opens (access_id, session_token);

alter table public.dealstudio_share_opens enable row level security;

drop policy if exists share_opens_owner_read on public.dealstudio_share_opens;
create policy share_opens_owner_read on public.dealstudio_share_opens
  for select to authenticated
  using (exists (
    select 1 from public.dealstudio_access a
     where a.id = access_id and public.owns_deal(a.dealstudio_id)
  ));

commit;


-- ===========================================================================
-- 0037_deal_people_fns.sql
-- ===========================================================================
-- ============================================================================
-- Functions for the merged people table.
-- Safe to re-run.
-- ============================================================================
begin;

-- ── One row per person, pipeline and viewers merged ─────────────────────────
-- A viewer who is not in the pipeline still appears, because "someone opened
-- your deck and you have never spoken to them" is the single most useful row on
-- this screen.
create or replace function public.admin_deal_people(p_deal uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.owns_deal(p_deal) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'last_seen' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'access_id',     a.id,
      'visit_id',      vi.id,
      'email',         coalesce(a.email, vi.email),
      'name',          a.name,
      'company_name',  a.company_name,
      'company_logo',  a.company_logo,
      'linkedin',      a.linkedin,
      'website',       a.website,
      'stage',         coalesce(a.stage, case when vi.id is not null then 'viewed' else 'prospect' end),
      -- The access GATE, separate from the pipeline stage above.
      -- coalesce: a pure viewer has no access row, so a.status is null and
      -- (null = 'revoked') is null, not false. A null here renders as an empty
      -- cell that looks like a bug.
      'blocked',       coalesce(a.status = 'revoked', false),
      'share_token',   a.share_token,
      'visits',        coalesce(vi.page_views, 0),
      'total_seconds', coalesce(vi.total_seconds, 0),
      'deck_views',    coalesce(vi.deck_views, 0),
      'sections',      coalesce(vi.sections, '{}'::jsonb),
      'doc_views',     (
        select count(*) from jsonb_each(coalesce(vi.sections, '{}'::jsonb)) e
         where e.key like 'doc:%' and (e.value)::text <> '0'
      ),
      'last_seen',     vi.last_seen_at,
      'committed',     coalesce(a.committed_amount, 0),
      'note_count',    (select count(*) from public.dealstudio_notes n where n.access_id = a.id),
      'forwards',      greatest(0, (
        select count(*) - 1 from public.dealstudio_share_opens so where so.access_id = a.id
      ))
    ) as x
    from public.dealstudio_access a
    full outer join public.dealstudio_visits vi
      on vi.dealstudio_id = a.dealstudio_id
     and lower(vi.email) = lower(a.email)
   where coalesce(a.dealstudio_id, vi.dealstudio_id) = p_deal
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_deal_people(uuid) to authenticated;


-- ── Change a stage. A note is REQUIRED. ─────────────────────────────────────
-- The note is the point: three weeks later "why is this one marked passed" has
-- an answer. Recording the change without a reason is how a pipeline becomes
-- a list of colours nobody trusts.
create or replace function public.admin_set_stage(
  p_access uuid,
  p_stage  text,
  p_note   text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
  v_old  text;
begin
  select dealstudio_id, stage into v_deal, v_old
    from public.dealstudio_access where id = p_access;

  if v_deal is null then
    return jsonb_build_object('ok', false, 'message', 'No such person.');
  end if;
  if not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is null then
    return jsonb_build_object('ok', false, 'message', 'Add a note explaining the change.');
  end if;

  update public.dealstudio_access set stage = p_stage where id = p_access;

  insert into public.dealstudio_notes (access_id, body, kind, author)
  values (
    p_access,
    format('%s to %s. %s', coalesce(v_old, 'new'), p_stage, trim(p_note)),
    'stage',
    auth.uid()
  );

  return jsonb_build_object('ok', true, 'stage', p_stage);
end;
$$;

grant execute on function public.admin_set_stage(uuid, text, text) to authenticated;


-- ── Notes ───────────────────────────────────────────────────────────────────
create or replace function public.admin_deal_notes(p_access uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
  v jsonb;
begin
  select dealstudio_id into v_deal from public.dealstudio_access where id = p_access;
  if v_deal is null or not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', n.id, 'body', n.body, 'kind', n.kind,
           'created_at', n.created_at, 'updated_at', n.updated_at
         ) order by n.created_at desc), '[]'::jsonb)
    into v
    from public.dealstudio_notes n
   where n.access_id = p_access;

  return v;
end;
$$;

grant execute on function public.admin_deal_notes(uuid) to authenticated;


-- ── Forward tracking: called by the investor page, anonymously ──────────────
create or replace function public.track_invite_open(p_token uuid, p_session text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_access uuid;
begin
  select id into v_access from public.dealstudio_access where share_token = p_token;
  if v_access is null then return; end if;

  insert into public.dealstudio_share_opens (access_id, session_token)
  values (v_access, coalesce(nullif(trim(p_session), ''), 'unknown'))
  on conflict (access_id, session_token) do nothing;
end;
$$;

grant execute on function public.track_invite_open(uuid, text) to anon, authenticated;

commit;


-- ===========================================================================
-- 0038_public_committed.sql
-- ===========================================================================
-- ============================================================================
-- Expose the live committed total to the investor page -- but ONLY when the
-- founder has actually chosen to show it.
--
-- The Committed stat tile used to be a number typed by hand. It drifted: an
-- investor commits, the pipeline updates, and the investor page still shows last
-- month's figure. Now it reads the same sum Deal Flow does.
--
-- The condition matters. Putting the committed total in the public payload
-- unconditionally would hand it to every visitor even when the founder never
-- chose to display it. It is only included when a stat slot asks for it.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.deal_committed_total(p_slug text)
returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1
        from public.dealstudios d,
             jsonb_array_elements(coalesce(d.stat_slots, '[]'::jsonb)) s
       where lower(d.slug) = lower(trim(p_slug))
         and d.is_active
         and s->>'kind' = 'total_raised'
    )
    then coalesce((
      select sum(a.committed_amount)
        from public.dealstudio_access a
        join public.dealstudios d2 on d2.id = a.dealstudio_id
       where lower(d2.slug) = lower(trim(p_slug))
         and a.stage = 'committed'
    ), 0)
    -- Not displayed, so not disclosed.
    else null
  end;
$$;

grant execute on function public.deal_committed_total(text) to anon, authenticated;

commit;


-- ===========================================================================
-- 0039_delete_confirm.sql
-- ===========================================================================
-- ============================================================================
-- Delete confirmation: type DELETE.
--
-- It used to require the deal's own slug. That is a stronger guard -- it forces
-- you to look at WHICH deal you are on, and cannot be typed from habit -- but
-- Jaqui asked for DELETE, so DELETE it is.
--
-- The server still checks something: a client cannot delete a deal by accident
-- or by a stray call, it has to deliberately send the word. The slug is still
-- accepted too, so nothing that already worked stops working.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.delete_deal(p_deal uuid, p_confirm_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid;
  v_slug text;
  v_name text;
begin
  select org_id, slug, company_name into v_org, v_slug, v_name
    from public.dealstudios where id = p_deal;

  if v_org is null then
    return jsonb_build_object('deleted', false, 'name', '', 'slug', '');
  end if;

  if not public.is_org_member(v_org) then
    raise exception 'not authorized';
  end if;

  -- Either the literal word DELETE, or the deal's slug. Both are a deliberate
  -- act; neither can happen by accident.
  if upper(trim(coalesce(p_confirm_slug, ''))) <> 'DELETE'
     and lower(trim(coalesce(p_confirm_slug, ''))) <> lower(v_slug) then
    raise exception 'CONFIRM_MISMATCH: type DELETE to confirm';
  end if;

  delete from public.deal_documents    where dealstudio_id = p_deal;
  delete from public.dealstudio_visits where dealstudio_id = p_deal;
  delete from public.dealstudio_access  where dealstudio_id = p_deal;
  delete from public.dealstudios        where id = p_deal;

  return jsonb_build_object('deleted', true, 'name', v_name, 'slug', v_slug);
end;
$$;

grant execute on function public.delete_deal(uuid, text) to authenticated;

commit;


-- ===========================================================================
-- 0040_accurate_visits.sql
-- ===========================================================================
-- ============================================================================
-- Make visit counting correct.
--
-- WHAT WAS WRONG
-- The client flushes its tally on beforeunload, on pagehide, and on every
-- visibilitychange to hidden. The old RPC then did:
--     page_views = page_views + 1
--     deck_views = deck_views + excluded.deck_views
--
-- 1. page_views counted FLUSHES, not visits. One investor tabbing between the
--    deck and their inbox logged six or seven "visits" in a single sitting.
-- 2. deck_views was cumulative on the client but ADDED on the server. The
--    client resends its running total on every flush, so opening the deck three
--    times and tabbing away four times recorded twelve deck views.
--
-- The two compound, and they punish focus: an investor who never leaves the tab
-- looks disengaged next to one who keeps alt-tabbing. Numbers that rank your
-- pipeline backwards are worse than no numbers.
--
-- WHAT IS RIGHT
-- Record each SESSION's running totals, replacing them (not adding), then roll a
-- person's row up from the sum of their sessions. Flushing ten times in one
-- sitting now changes nothing, because the tenth flush overwrites the ninth.
--
--   visits        = number of distinct sessions
--   deck_views    = sum of each session's deck opens
--   total_seconds = sum of each session's seconds
--   sections      = per-key sum across sessions
--
-- Safe to re-run.
-- ============================================================================
begin;

create table if not exists public.dealstudio_visit_sessions (
  dealstudio_id  uuid not null references public.dealstudios(id) on delete cascade,
  email          text not null,
  session_token  text not null,
  deck_views     integer not null default 0,
  total_seconds  numeric not null default 0,
  sections       jsonb   not null default '{}'::jsonb,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (dealstudio_id, email, session_token)
);

alter table public.dealstudio_visit_sessions enable row level security;

drop policy if exists visit_sessions_owner_read on public.dealstudio_visit_sessions;
create policy visit_sessions_owner_read on public.dealstudio_visit_sessions
  for select to authenticated
  using (public.owns_deal(dealstudio_id));


create or replace function public.dealstudio_record_visit(
  p_slug          text,
  p_email         text,
  p_sections      jsonb,
  p_total_seconds numeric,
  p_deck_views    integer,
  p_session       text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_deal    uuid;
  v_email   text;
  v_session text;
  v_visits  integer;
  v_deck    integer;
  v_secs    numeric;
  v_sections jsonb;
begin
  select id into v_deal from public.dealstudios
   where lower(slug) = lower(trim(p_slug)) and is_active;
  if v_deal is null then return; end if;

  v_email   := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null then return; end if;

  -- No session token means an older client. Fall back to a per-day bucket so it
  -- still cannot inflate: every flush that day lands on the same row.
  v_session := nullif(trim(coalesce(p_session, '')), '');
  if v_session is null then
    v_session := 'legacy-' || to_char(now(), 'YYYY-MM-DD');
  end if;

  -- SET, not add. The client sends its running total for THIS session, so the
  -- latest flush is the truth and replaces the previous one.
  insert into public.dealstudio_visit_sessions
    (dealstudio_id, email, session_token, deck_views, total_seconds, sections, last_seen_at)
  values
    (v_deal, v_email, v_session,
     greatest(coalesce(p_deck_views, 0), 0),
     greatest(coalesce(p_total_seconds, 0), 0),
     coalesce(p_sections, '{}'::jsonb),
     now())
  on conflict (dealstudio_id, email, session_token) do update set
    -- greatest() guards against an out-of-order flush arriving late and
    -- rewinding the session's totals.
    deck_views    = greatest(public.dealstudio_visit_sessions.deck_views, excluded.deck_views),
    total_seconds = greatest(public.dealstudio_visit_sessions.total_seconds, excluded.total_seconds),
    sections      = case
                      when excluded.sections = '{}'::jsonb
                        then public.dealstudio_visit_sessions.sections
                      else excluded.sections
                    end,
    last_seen_at  = now();

  -- Roll the person's row up from their sessions.
  select count(*),
         coalesce(sum(s.deck_views), 0),
         coalesce(sum(s.total_seconds), 0)
    into v_visits, v_deck, v_secs
    from public.dealstudio_visit_sessions s
   where s.dealstudio_id = v_deal and s.email = v_email;

  -- Sum each section key across the person's sessions.
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    into v_sections
    from (
      select e.key as k, sum((e.value)::numeric) as v
        from public.dealstudio_visit_sessions s,
             jsonb_each(s.sections) e
       where s.dealstudio_id = v_deal and s.email = v_email
       group by e.key
    ) t;

  insert into public.dealstudio_visits
    (dealstudio_id, email, page_views, deck_views, total_seconds, sections, last_seen_at)
  values (v_deal, v_email, v_visits, v_deck, v_secs, v_sections, now())
  on conflict (dealstudio_id, email) do update set
    page_views    = excluded.page_views,
    deck_views    = excluded.deck_views,
    total_seconds = excluded.total_seconds,
    sections      = excluded.sections,
    last_seen_at  = now();
end;
$$;

grant execute on function public.dealstudio_record_visit(text, text, jsonb, numeric, integer, text)
  to anon, authenticated;

commit;


-- ===========================================================================
-- 0041_deal_flow_last_note.sql
-- ===========================================================================
-- ============================================================================
-- Deal Flow: the people table is now the whole tab, so it carries the columns
-- the old pipeline card used to carry.
--
-- Only change: admin_deal_people also returns last_note_at, the date of the
-- most recent note. The table shows "Last Note" as a date, and a count alone
-- cannot answer "when did I last touch this one".
--
-- Everything else in this function is byte-for-byte 0037. Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_deal_people(p_deal uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.owns_deal(p_deal) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'last_seen' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'access_id',     a.id,
      'visit_id',      vi.id,
      'email',         coalesce(a.email, vi.email),
      'name',          a.name,
      'company_name',  a.company_name,
      'company_logo',  a.company_logo,
      'linkedin',      a.linkedin,
      'website',       a.website,
      'stage',         coalesce(a.stage, case when vi.id is not null then 'viewed' else 'prospect' end),
      -- The access GATE, separate from the pipeline stage above.
      'blocked',       coalesce(a.status = 'revoked', false),
      'share_token',   a.share_token,
      'visits',        coalesce(vi.page_views, 0),
      'total_seconds', coalesce(vi.total_seconds, 0),
      'deck_views',    coalesce(vi.deck_views, 0),
      'sections',      coalesce(vi.sections, '{}'::jsonb),
      'doc_views',     (
        select count(*) from jsonb_each(coalesce(vi.sections, '{}'::jsonb)) e
         where e.key like 'doc:%' and (e.value)::text <> '0'
      ),
      'last_seen',     vi.last_seen_at,
      'committed',     coalesce(a.committed_amount, 0),
      'note_count',    (select count(*) from public.dealstudio_notes n where n.access_id = a.id),
      'last_note_at',  (select max(n.created_at) from public.dealstudio_notes n where n.access_id = a.id),
      'forwards',      greatest(0, (
        select count(*) - 1 from public.dealstudio_share_opens so where so.access_id = a.id
      ))
    ) as x
    from public.dealstudio_access a
    full outer join public.dealstudio_visits vi
      on vi.dealstudio_id = a.dealstudio_id
     and lower(vi.email) = lower(a.email)
   where coalesce(a.dealstudio_id, vi.dealstudio_id) = p_deal
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_deal_people(uuid) to authenticated;

commit;

select 'deal flow last_note_at ready' as status;


-- PostgREST caches the function list. Without this the app keeps 404ing on
-- admin_deal_people even though the function now exists.
notify pgrst, 'reload schema';
