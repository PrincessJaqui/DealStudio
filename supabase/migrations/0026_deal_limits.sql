-- ============================================================================
-- Paid deal rooms.
--
-- A plan includes a number of deals. Beyond that, each additional deal room
-- requires a purchased add-on. Same shape as paid seats (0023), and enforced in
-- the SAME place: inside create_deal, not in the UI. A customer can call the RPC
-- directly, so a client-side check is decoration rather than enforcement.
--
-- Comped orgs are exempt: they are not billed at all, so charging them for a
-- deal room would be incoherent.
--
-- Safe to re-run.
-- ============================================================================
begin;

-- How many deal rooms a plan includes.
alter table public.plans
  add column if not exists included_deals int not null default 1;

-- Which add-on grants extra deal rooms. Quantity on org_addons is how many.
alter table public.plan_addons
  add column if not exists grants_deals boolean not null default false;

-- ---------------------------------------------------------------------------
-- Deal accounting for one org.
-- ---------------------------------------------------------------------------
create or replace function public.org_deal_status(p_org uuid)
returns table (included int, purchased int, allowed int, used int, can_add boolean)
language sql stable security definer set search_path = public as $$
  with inc as (
    select coalesce(p.included_deals, 1) as n
      from public.organizations o
      left join public.plans p on p.id = o.plan_id
     where o.id = p_org
  ),
  bought as (
    select coalesce(sum(oa.quantity), 0)::int as n
      from public.org_addons oa
      join public.plan_addons pa on pa.id = oa.addon_id
     where oa.org_id = p_org
       and oa.quantity > 0
       and pa.grants_deals
  ),
  consumed as (
    select count(*)::int as n
      from public.dealstudios
     where org_id = p_org
  )
  select
    inc.n,
    bought.n,
    inc.n + bought.n,
    consumed.n,
    consumed.n < inc.n + bought.n
  from inc, bought, consumed;
$$;

grant execute on function public.org_deal_status(uuid) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Enforce the limit where deals are actually created.
-- This is the existing create_deal with the allowance check added; everything
-- else (slug generation, uniqueness loop) is unchanged.
-- ---------------------------------------------------------------------------
begin;

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

  -- The allowance check. Comped orgs are exempt.
  select * into v_deals from public.org_deal_status(p_org);

  if not v_deals.can_add
     and not exists (select 1 from public.organizations
                      where id = p_org and comped) then
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

-- Pro includes two deal rooms, with a $10 add-on for each one after that.
update public.plans
   set included_deals = 2
 where lower(name) like 'pro%';

insert into public.plan_addons (plan_id, name, price_cents, unit, interval, grants_deals)
select p.id, 'Additional deal room', 1000, 'each', 'month', true
  from public.plans p
 where lower(p.name) like 'pro%'
   and not exists (
     select 1 from public.plan_addons a
      where a.plan_id = p.id and a.grants_deals
   );

commit;
