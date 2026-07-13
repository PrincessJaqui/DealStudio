-- ============================================================================
-- Pricing setup: unit type and frequency.
--
-- Plans and add-ons both gain:
--   unit_type  currency | percentage   (a flat fee, or a share of something)
--   interval   month | year            (how often it recurs)
--
-- Add-ons already point at a plan, which is what lets the editor nest them
-- under the plan they belong to rather than listing them separately.
--
-- The existing 'unit' column on plan_addons (each/seat/month) stays: it names
-- what is being counted, which is a different question from whether the price
-- is a currency amount or a percentage.
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.plans
  add column if not exists unit_type text not null default 'currency'
    check (unit_type in ('currency', 'percentage'));

alter table public.plan_addons
  add column if not exists unit_type text not null default 'currency'
    check (unit_type in ('currency', 'percentage')),
  add column if not exists interval text not null default 'month'
    check (interval in ('month', 'year'));

-- Save a plan, including the new fields. Platform admins only.
create or replace function public.admin_save_plan(
  p_id        uuid,
  p_name      text,
  p_desc      text,
  p_price     integer,
  p_unit_type text,
  p_interval  text,
  p_public    boolean
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'a plan name is required'; end if;
  if p_price < 0 then raise exception 'price cannot be negative'; end if;
  if coalesce(p_unit_type, 'currency') not in ('currency', 'percentage') then
    raise exception 'unit type must be currency or percentage';
  end if;
  if coalesce(p_interval, 'month') not in ('month', 'year') then
    raise exception 'frequency must be month or year';
  end if;

  if p_id is null then
    insert into public.plans (name, description, price_cents, unit_type, interval, is_public)
    values (btrim(p_name), coalesce(p_desc, ''), p_price,
            coalesce(p_unit_type, 'currency'), coalesce(p_interval, 'month'),
            coalesce(p_public, true))
    returning id into v_id;
  else
    update public.plans
       set name        = btrim(p_name),
           description = coalesce(p_desc, ''),
           price_cents = p_price,
           unit_type   = coalesce(p_unit_type, 'currency'),
           interval    = coalesce(p_interval, 'month'),
           is_public   = coalesce(p_public, true)
     where id = p_id
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

create or replace function public.admin_delete_plan(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;

  -- Refuse to delete a plan somebody is on: it would leave that account with a
  -- dangling plan_id and no price. Move them first.
  if exists (select 1 from public.organizations where plan_id = p_id) then
    raise exception 'accounts are on this plan; move them to another plan first';
  end if;

  delete from public.plans where id = p_id;
  return jsonb_build_object('deleted', true);
end;
$$;

-- Add-on save, now carrying unit type and frequency.
create or replace function public.admin_save_addon(
  p_id uuid, p_plan uuid, p_name text, p_desc text,
  p_price integer, p_unit text, p_unit_type text, p_interval text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'not authorized'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'a name is required'; end if;
  if p_price < 0 then raise exception 'price cannot be negative'; end if;

  if p_id is null then
    insert into public.plan_addons (plan_id, name, description, price_cents, unit, unit_type, interval)
    values (p_plan, btrim(p_name), coalesce(p_desc, ''), p_price,
            coalesce(p_unit, 'each'), coalesce(p_unit_type, 'currency'),
            coalesce(p_interval, 'month'))
    returning id into v_id;
  else
    update public.plan_addons
       set plan_id = p_plan, name = btrim(p_name), description = coalesce(p_desc, ''),
           price_cents = p_price, unit = coalesce(p_unit, 'each'),
           unit_type = coalesce(p_unit_type, 'currency'),
           interval  = coalesce(p_interval, 'month')
     where id = p_id
    returning id into v_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

grant execute on function public.admin_save_plan(uuid, text, text, integer, text, text, boolean) to authenticated;
grant execute on function public.admin_delete_plan(uuid) to authenticated;
grant execute on function public.admin_save_addon(uuid, uuid, text, text, integer, text, text, text) to authenticated;

commit;
