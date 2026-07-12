-- ============================================================================
-- Master Admin: expose the owner's user id so the console can act on them
-- (reset password), and let a platform admin set an org's plan.
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_list_orgs()
returns table (
  id uuid, name text, owner_email text, owner_id uuid, plan text, plan_id uuid,
  plan_name text, subscription_status text, suspended boolean, comped boolean,
  trial_ends_at timestamptz, deal_count bigint, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    o.id, o.name,
    (select u.email from public.org_members m
       join auth.users u on u.id = m.auth_user_id
      where m.org_id = o.id order by m.created_at limit 1) as owner_email,
    (select m.auth_user_id from public.org_members m
      where m.org_id = o.id order by m.created_at limit 1) as owner_id,
    o.plan, o.plan_id,
    (select p.name from public.plans p where p.id = o.plan_id) as plan_name,
    o.subscription_status, o.suspended, o.comped, o.trial_ends_at,
    (select count(*) from public.dealstudios d where d.org_id = o.id) as deal_count,
    o.created_at
  from public.organizations o
  where public.is_platform_admin()
  order by o.created_at desc;
$$;

grant execute on function public.admin_list_orgs() to authenticated;

commit;
