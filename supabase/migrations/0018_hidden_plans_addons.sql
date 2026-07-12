-- ============================================================================
-- Hidden plans and plan add-ons.
--
-- Two things here:
--
--  1. Hidden plans. A plan with is_public = false never appears to customers
--     and cannot be self-selected. It only applies to an account you put on it
--     deliberately. This is how a bespoke price for one customer works without
--     leaking it to everyone else.
--
--  2. Add-ons. A priced extra that layers on top of a plan, for example
--     "Additional team member" at $5/month. An add-on can be attached to one
--     plan or left global (plan_id null = available on any plan). What a
--     specific account actually has is recorded per-org with a quantity, so
--     three extra seats is one row with quantity 3, not three rows.
--
-- Only platform admins can read or write any of this. Customers never see
-- hidden plans, even by querying directly.
-- Safe to re-run.
-- ============================================================================
begin;

-- 1. Hidden plans -----------------------------------------------------------
alter table public.plans
  add column if not exists is_public boolean not null default true;

comment on column public.plans.is_public is
  'false = never shown to customers; only applies when assigned to an account.';

-- 2. Add-ons ----------------------------------------------------------------
create table if not exists public.plan_addons (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid references public.plans(id) on delete cascade,  -- null = any plan
  name            text not null,
  description     text not null default '',
  price_cents     integer not null default 0,
  unit            text not null default 'each',   -- 'each', 'seat', 'month'
  stripe_price_id text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- What a given account actually has switched on.
create table if not exists public.org_addons (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  addon_id   uuid not null references public.plan_addons(id) on delete cascade,
  quantity   integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  primary key (org_id, addon_id)
);

alter table public.plan_addons enable row level security;
alter table public.org_addons  enable row level security;

-- A customer may see the add-ons they are actually paying for, and nothing else.
drop policy if exists org_addons_read_own on public.org_addons;
create policy org_addons_read_own on public.org_addons
  for select to authenticated
  using (org_id in (select public.my_org_ids()) or public.is_platform_admin());

-- Add-on definitions are readable by signed-in users so a customer can see the
-- name and price of what they have. Writes are platform-admin only.
drop policy if exists plan_addons_read on public.plan_addons;
create policy plan_addons_read on public.plan_addons
  for select to authenticated using (true);

drop policy if exists plan_addons_write on public.plan_addons;
create policy plan_addons_write on public.plan_addons
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists org_addons_write on public.org_addons;
create policy org_addons_write on public.org_addons
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

/**
 * Plans a CUSTOMER may choose. Hidden plans are excluded, unless the customer
 * is already on one, in which case they can still see the plan they are paying
 * for. Anything else would show them a blank plan name on their own bill.
 */
create or replace function public.list_plans_for_me()
returns setof public.plans
language sql stable security definer set search_path = public as $$
  select p.* from public.plans p
   where p.is_active = true
     and (
       p.is_public = true
       or p.id in (
         select o.plan_id from public.organizations o
          where o.id in (select public.my_org_ids())
       )
     )
   order by p.price_cents;
$$;

/** Every plan, hidden ones included. Platform admins only. */
create or replace function public.admin_list_plans()
returns setof public.plans
language sql stable security definer set search_path = public as $$
  select * from public.plans
   where public.is_platform_admin()
   order by is_public desc, price_cents;
$$;

/** Add-on definitions. Platform admins only. */
create or replace function public.admin_list_addons()
returns setof public.plan_addons
language sql stable security definer set search_path = public as $$
  select * from public.plan_addons
   where public.is_platform_admin()
   order by created_at;
$$;

create or replace function public.admin_save_addon(
  p_id uuid, p_plan uuid, p_name text, p_desc text,
  p_price integer, p_unit text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'a name is required'; end if;
  if p_price < 0 then raise exception 'price cannot be negative'; end if;

  if p_id is null then
    insert into public.plan_addons (plan_id, name, description, price_cents, unit)
    values (p_plan, btrim(p_name), coalesce(p_desc, ''), p_price, coalesce(p_unit, 'each'))
    returning id into v_id;
  else
    update public.plan_addons
       set plan_id = p_plan, name = btrim(p_name), description = coalesce(p_desc, ''),
           price_cents = p_price, unit = coalesce(p_unit, 'each')
     where id = p_id
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.admin_delete_addon(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  delete from public.plan_addons where id = p_id;
  return jsonb_build_object('deleted', true);
end;
$$;

/** Add-ons switched on for one account, with their definitions. */
create or replace function public.admin_org_addons(p_org uuid)
returns table (
  addon_id uuid, name text, price_cents integer, unit text, quantity integer
)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.price_cents, a.unit, coalesce(oa.quantity, 0)
    from public.plan_addons a
    left join public.org_addons oa
      on oa.addon_id = a.id and oa.org_id = p_org
   where public.is_platform_admin() and a.is_active = true
   order by a.name;
$$;

/** Switches an add-on on (quantity > 0) or off (quantity = 0) for one account. */
create or replace function public.admin_set_org_addon(
  p_org uuid, p_addon uuid, p_qty integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  if coalesce(p_qty, 0) <= 0 then
    delete from public.org_addons where org_id = p_org and addon_id = p_addon;
    return jsonb_build_object('quantity', 0);
  end if;

  insert into public.org_addons (org_id, addon_id, quantity)
  values (p_org, p_addon, p_qty)
  on conflict (org_id, addon_id) do update set quantity = excluded.quantity;

  return jsonb_build_object('quantity', p_qty);
end;
$$;

/**
 * What an account actually costs: plan + every add-on times its quantity.
 * One number, so the billing screen and the admin console cannot disagree.
 */
create or replace function public.org_monthly_total(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select p.price_cents from public.organizations o
                     join public.plans p on p.id = o.plan_id
                    where o.id = p_org), 0)
       + coalesce((select sum(a.price_cents * oa.quantity)::int
                     from public.org_addons oa
                     join public.plan_addons a on a.id = oa.addon_id
                    where oa.org_id = p_org), 0);
$$;

grant select on public.plan_addons, public.org_addons to authenticated;
grant execute on function public.list_plans_for_me()                          to authenticated;
grant execute on function public.admin_list_plans()                           to authenticated;
grant execute on function public.admin_list_addons()                          to authenticated;
grant execute on function public.admin_save_addon(uuid, uuid, text, text, integer, text) to authenticated;
grant execute on function public.admin_delete_addon(uuid)                     to authenticated;
grant execute on function public.admin_org_addons(uuid)                       to authenticated;
grant execute on function public.admin_set_org_addon(uuid, uuid, integer)     to authenticated;
grant execute on function public.org_monthly_total(uuid)                      to authenticated;

commit;
