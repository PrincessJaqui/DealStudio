-- ============================================================================
-- Paid team seats.
--
-- A plan includes a number of seats. Beyond that, each additional team member
-- requires a purchased seat add-on. The check lives in add_org_member, NOT in
-- the UI, because a customer can call the RPC directly and a client-side check
-- is decoration, not enforcement.
--
-- A seat is consumed by an accepted member AND by a pending invite. Otherwise a
-- company could invite twenty people on a one-seat plan and only get billed when
-- they happened to accept.
--
-- Safe to re-run.
-- ============================================================================
begin;

-- 1. How many seats a plan includes. One means the owner only.
alter table public.plans
  add column if not exists included_seats int not null default 1;

-- 1b. An invite must be unique per company, or the same person could be invited
--     twice and eat two seats.
create unique index if not exists org_invites_org_email_key
  on public.org_invites (org_id, lower(email));

-- 2. Which add-on grants extra seats. A plan can only have one seat add-on;
--    quantity on org_addons is how many extra seats were bought.
alter table public.plan_addons
  add column if not exists grants_seats boolean not null default false;

-- ---------------------------------------------------------------------------
-- Seat accounting for one org: what they are allowed, and what they have used.
-- ---------------------------------------------------------------------------
create or replace function public.org_seat_status(p_org uuid)
returns table (included int, purchased int, allowed int, used int, can_add boolean)
language sql stable security definer set search_path = public as $$
  with inc as (
    select coalesce(p.included_seats, 1) as n
      from public.organizations o
      left join public.plans p on p.id = o.plan_id
     where o.id = p_org
  ),
  bought as (
    -- Extra seats the org has actually paid for. There is no enabled flag on
    -- org_addons: a quantity above zero IS the grant.
    select coalesce(sum(oa.quantity), 0)::int as n
      from public.org_addons oa
      join public.plan_addons pa on pa.id = oa.addon_id
     where oa.org_id = p_org
       and oa.quantity > 0
       and pa.grants_seats
  ),
  consumed as (
    -- Accepted members plus outstanding invites: an invite holds a seat.
    select (
      (select count(*) from public.org_members  where org_id = p_org)
    + (select count(*) from public.org_invites  where org_id = p_org)
    )::int as n
  )
  select
    inc.n,
    bought.n,
    inc.n + bought.n,
    consumed.n,
    consumed.n < inc.n + bought.n
  from inc, bought, consumed;
$$;

grant execute on function public.org_seat_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enforce it where members are actually added.
-- ---------------------------------------------------------------------------
create or replace function public.add_org_member(p_email text, p_role text default 'admin')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org    uuid;
  v_user   uuid;
  v_seats  record;
begin
  select om.org_id into v_org
    from public.org_members om
   where om.auth_user_id = auth.uid()
   limit 1;

  if v_org is null then
    raise exception 'No organization';
  end if;

  -- The seat check. Comped orgs are exempt: they are not being billed at all,
  -- so charging them for a seat would be incoherent.
  select * into v_seats from public.org_seat_status(v_org);

  if not v_seats.can_add
     and not exists (select 1 from public.organizations
                      where id = v_org and comped) then
    raise exception 'SEAT_REQUIRED: % of % seats used', v_seats.used, v_seats.allowed;
  end if;

  select id into v_user from auth.users where lower(email) = lower(p_email);

  if v_user is null then
    -- They have no account yet. Hold a seat with a pending invite: an invite
    -- consumes a seat, or a company could invite twenty people on one seat and
    -- only get billed if they happened to accept.
    insert into public.org_invites (org_id, email, role)
    values (v_org, lower(p_email), p_role)
    on conflict (org_id, lower(email)) do nothing;
    return jsonb_build_object('added', true, 'pending', true);
  end if;

  insert into public.org_members (org_id, auth_user_id, role)
  values (v_org, v_user, p_role)
  on conflict (org_id, auth_user_id) do update set role = excluded.role;

  return jsonb_build_object('added', true, 'pending', false);
end;
$$;

grant execute on function public.add_org_member(text, text) to authenticated;

commit;

select 'plans.included_seats and plan_addons.grants_seats added' as result;
