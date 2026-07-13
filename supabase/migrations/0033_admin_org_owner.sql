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
