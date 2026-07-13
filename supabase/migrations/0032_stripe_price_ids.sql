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
