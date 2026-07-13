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
