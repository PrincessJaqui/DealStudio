-- ============================================================================
-- Demo lead capture.
--
-- A visitor to the public demo hands over an email in exchange for access, and
-- is told plainly that this joins the mailing list. That email needs to land
-- somewhere you can actually use: as a lead row on the deal, not buried in the
-- analytics table.
--
-- The RPC is security definer and callable by anon, because the whole point is
-- that the visitor is not signed in. It only ever writes to a deal that is
-- flagged demo_mode, so it cannot be used to inject rows into a real customer's
-- investor list.
-- Safe to re-run.
-- ============================================================================
begin;

-- Where the row came from, so you can tell a demo lead from a real investor.
alter table public.dealstudio_access
  add column if not exists source text not null default 'invited';

create or replace function public.capture_demo_lead(
  p_slug  text,
  p_email text,
  p_name  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deal uuid;
  v_demo boolean;
  v_email text := lower(btrim(p_email));
begin
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  select id, demo_mode into v_deal, v_demo
    from public.dealstudios
   where slug = p_slug and is_active = true;

  if v_deal is null then
    raise exception 'deal not found';
  end if;

  -- Only ever writes to the demo room. A real customer's investor list is
  -- unreachable through this function.
  if not coalesce(v_demo, false) then
    raise exception 'not a demo deal';
  end if;

  insert into public.dealstudio_access (dealstudio_id, email, name, status, stage, source)
  values (v_deal, v_email, nullif(btrim(coalesce(p_name, '')), ''), 'approved', 'lead', 'demo')
  on conflict do nothing;

  return jsonb_build_object('captured', true);
end;
$$;

grant execute on function public.capture_demo_lead(text, text, text) to anon, authenticated;

-- One row per email per deal, so a repeat visitor does not create duplicates.
create unique index if not exists dealstudio_access_deal_email_idx
  on public.dealstudio_access (dealstudio_id, lower(email));

commit;

select 'demo lead capture ready' as status;
