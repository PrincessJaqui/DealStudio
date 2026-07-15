-- ============================================================================
-- Self-service account deletion. Apple guideline 5.1.1(v): an app that creates
-- accounts must let the user delete theirs from inside the app, not by emailing
-- support. This is the function behind that button.
--
-- What it removes, and the one careful decision in it:
--
--   * If the user is the SOLE member of their org, the org and everything under
--     it (deals, documents, visitors, notes) goes too. The org exists only for
--     them; leaving it orphaned would strand investor data with no owner.
--
--   * If the org has OTHER members, the org and its deals STAY. Only this user's
--     membership and their auth identity are removed. One founder leaving a team
--     must not delete the team's deal room out from under everyone else.
--
-- It deletes the auth.users row last. That cascades to anything keyed on the user
-- via auth, and it is the step that makes the account genuinely gone rather than
-- just logged out. Running as the caller (auth.uid()), so a user can only ever
-- delete THEMSELF: there is no user-id parameter to abuse.
-- ============================================================================
begin;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_members int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org
    from public.org_members
   where auth_user_id = v_uid
   limit 1;

  if v_org is not null then
    select count(*) into v_members
      from public.org_members
     where org_id = v_org;

    if v_members <= 1 then
      -- Last one out. The org and everything hanging off it goes. Deals cascade
      -- to their documents, visitors and notes through existing foreign keys, so
      -- deleting the org row is enough; being explicit about deals keeps this
      -- readable and independent of cascade wiring.
      delete from public.dealstudios where org_id = v_org;
      delete from public.orgs where id = v_org;
    else
      -- Others remain. Take only this person's seat.
      delete from public.org_members where auth_user_id = v_uid and org_id = v_org;
    end if;
  end if;

  -- Last. This is the step that makes the account gone rather than dormant.
  delete from auth.users where id = v_uid;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

commit;

select 'self-service account deletion ready' as status;
