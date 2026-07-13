-- ============================================================================
-- Master admin: activate a user, and attach them to a company.
--
-- WHY THIS EXISTS
-- Email confirmation is on. If the confirmation email is misconfigured (or the
-- link is dead, or it lands in spam), a real customer is stuck at the door with
-- no way in. This gives the master admin a way to let them through.
--
-- WHAT IT DOES NOT DO
-- It does NOT insert into auth.users. Creating an auth user by raw SQL corrupts
-- the identities table and produces a 500 on the next login. The user must sign
-- up themselves (or be created in the dashboard). This only CONFIRMS an account
-- that already exists, and attaches an org to it.
--
-- Platform admins only. A customer calling this gets nothing.
-- Safe to re-run.
-- ============================================================================
begin;

-- ---------------------------------------------------------------------------
-- Confirm a user's email so they can sign in.
-- ---------------------------------------------------------------------------
create or replace function public.admin_activate_user(p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user     uuid;
  v_already  boolean;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select id, (email_confirmed_at is not null)
    into v_user, v_already
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_user is null then
    -- Deliberate: we do not create the account. See the header.
    return jsonb_build_object(
      'ok', false,
      'reason', 'no_account',
      'message', 'No account with that email. They must sign up first.'
    );
  end if;

  if v_already then
    return jsonb_build_object('ok', true, 'already', true, 'user_id', v_user);
  end if;

  update auth.users
     set email_confirmed_at = now(),
         confirmed_at       = coalesce(confirmed_at, now())
   where id = v_user;

  return jsonb_build_object('ok', true, 'already', false, 'user_id', v_user);
end;
$$;

grant execute on function public.admin_activate_user(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Activate AND place them in a company, in one step. This is the whole job:
-- a confirmed user with no org is still locked out.
-- ---------------------------------------------------------------------------
create or replace function public.admin_activate_and_assign(
  p_email   text,
  p_company text default null,
  p_org     uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid;
  v_org  uuid;
  v_act  jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  v_act := public.admin_activate_user(p_email);
  if not (v_act->>'ok')::boolean then
    return v_act;
  end if;

  v_user := (v_act->>'user_id')::uuid;

  -- Already in a company? Leave it alone. Moving someone between orgs by
  -- accident would hand one customer's deal rooms to another.
  select org_id into v_org from public.org_members
   where auth_user_id = v_user limit 1;

  if v_org is not null then
    return jsonb_build_object('ok', true, 'user_id', v_user, 'org_id', v_org,
                              'note', 'already in a company');
  end if;

  if p_org is not null then
    v_org := p_org;
  elsif coalesce(trim(p_company), '') <> '' then
    insert into public.organizations (name, trial_ends_at)
    values (trim(p_company), now() + interval '30 days')
    returning id into v_org;
  else
    return jsonb_build_object('ok', false, 'reason', 'no_company',
                              'message', 'Give a company name or pick an existing one.');
  end if;

  insert into public.org_members (org_id, auth_user_id, role)
  values (v_org, v_user, 'owner')
  on conflict (org_id, auth_user_id) do nothing;

  return jsonb_build_object('ok', true, 'user_id', v_user, 'org_id', v_org);
end;
$$;

grant execute on function public.admin_activate_and_assign(text, text, uuid) to authenticated;

commit;
