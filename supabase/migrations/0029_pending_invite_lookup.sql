-- ============================================================================
-- Does the signed-in user have an invite waiting?
--
-- A user with no company is now offered a "name your company" screen. That is
-- right for someone a master admin created, and WRONG for someone invited to an
-- existing company whose claim did not go through (out of seats, say): they
-- would quietly create a second, separate company instead of joining the one
-- that invited them.
--
-- claim_pending_invites DELETES the invite row once it is claimed, so a row that
-- still exists is by definition still pending. There is no accepted_at column.
--
-- Returns the inviting company's name, or null.
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.my_pending_invite()
returns text
language sql stable security definer set search_path = public as $$
  select o.name
    from public.org_invites i
    join public.organizations o on o.id = i.org_id
   where lower(i.email) = lower((select u.email from auth.users u where u.id = auth.uid()))
   order by i.created_at
   limit 1;
$$;

grant execute on function public.my_pending_invite() to authenticated;

commit;
