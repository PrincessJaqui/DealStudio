-- ============================================================================
-- The companies table gains TEAM SIZE and LAST LOGIN.
--
--   member_count - how many people belong to the org (org_members). Replaces the
--                  "Owner" column with something quantitative.
--   last_login   - the owner's most recent sign-in (auth.users.last_sign_in_at),
--                  so a master admin can see who is actually active.
--
-- Everything else is carried over unchanged from 0033. Safe to re-run.
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
  member_count bigint,
  last_login timestamptz,
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
    (select count(*) from public.org_members m where m.org_id = o.id),
    owner.last_sign_in_at,
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
    select u.id, u.email, u.raw_user_meta_data, u.last_sign_in_at
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

select 'orgs list: team size + last login' as status;
