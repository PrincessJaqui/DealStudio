-- ============================================================================
-- Company team members.
--
--   owner - full access, including team management
--   admin - can edit deals, cannot manage the team
--
-- org_members has a composite primary key (org_id, auth_user_id), and that key
-- is load-bearing: my_org_ids() and every RLS policy sit on it. So instead of
-- making auth_user_id nullable to hold pending invites, invites get their own
-- table and graduate into org_members when the person signs up.
--
-- Two rules enforced server-side, not merely in the UI:
--   1. Only an owner may add, remove, or re-role anyone.
--   2. The last owner cannot be removed or demoted, or the company would be
--      left with nobody able to administer it.
-- Safe to re-run.
-- ============================================================================
begin;

create table if not exists public.org_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  email      text not null,
  role       text not null default 'admin' check (role in ('owner','admin')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists org_invites_email_idx
  on public.org_invites (org_id, lower(email));

alter table public.org_invites enable row level security;

drop policy if exists invites_read on public.org_invites;
create policy invites_read on public.org_invites for select to authenticated
  using (org_id in (select public.my_org_ids()));

create or replace function public.is_org_owner(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org and auth_user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.list_org_members()
returns table (
  ref uuid, email text, role text, is_you boolean, pending boolean, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select m.auth_user_id, u.email, m.role,
         (m.auth_user_id = auth.uid()), false, m.created_at
    from public.org_members m
    join auth.users u on u.id = m.auth_user_id
   where m.org_id in (select public.my_org_ids())
  union all
  select i.id, i.email, i.role, false, true, i.created_at
    from public.org_invites i
   where i.org_id in (select public.my_org_ids())
   order by 5, 6;
$$;

create or replace function public.add_org_member(p_email text, p_role text default 'admin')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_uid   uuid;
  v_email text := lower(btrim(p_email));
begin
  select org_id into v_org from public.org_members
   where auth_user_id = auth.uid() limit 1;

  if v_org is null then raise exception 'no organization'; end if;
  if not public.is_org_owner(v_org) then
    raise exception 'only an owner can add team members';
  end if;
  if p_role not in ('owner','admin') then
    raise exception 'role must be owner or admin';
  end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'a valid email is required';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email;

  if v_uid is not null then
    if exists (select 1 from public.org_members
                where org_id = v_org and auth_user_id = v_uid) then
      return jsonb_build_object('added', false, 'reason', 'already on the team');
    end if;
    if exists (select 1 from public.org_members where auth_user_id = v_uid) then
      raise exception 'that person already belongs to another company';
    end if;

    insert into public.org_members (org_id, auth_user_id, role)
    values (v_org, v_uid, p_role);
    return jsonb_build_object('added', true, 'pending', false);
  end if;

  insert into public.org_invites (org_id, email, role, invited_by)
  values (v_org, v_email, p_role, auth.uid())
  on conflict (org_id, lower(email)) do update set role = excluded.role;

  return jsonb_build_object('added', true, 'pending', true);
end;
$$;

create or replace function public.remove_org_member(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_role text; v_owners int;
begin
  select org_id, role into v_org, v_role
    from public.org_members
   where auth_user_id = p_user and org_id in (select public.my_org_ids())
   limit 1;

  if v_org is null then raise exception 'member not found'; end if;
  if not public.is_org_owner(v_org) then
    raise exception 'only an owner can remove team members';
  end if;

  select count(*) into v_owners
    from public.org_members where org_id = v_org and role = 'owner';

  if v_role = 'owner' and v_owners <= 1 then
    raise exception 'this is the last owner; make someone else an owner first';
  end if;

  delete from public.org_members where org_id = v_org and auth_user_id = p_user;
  return jsonb_build_object('removed', true);
end;
$$;

create or replace function public.revoke_org_invite(p_invite uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.org_invites where id = p_invite;
  if v_org is null then raise exception 'invite not found'; end if;
  if not public.is_org_owner(v_org) then
    raise exception 'only an owner can revoke invites';
  end if;
  delete from public.org_invites where id = p_invite;
  return jsonb_build_object('revoked', true);
end;
$$;

create or replace function public.set_org_member_role(p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_role text; v_owners int;
begin
  select org_id, role into v_org, v_role
    from public.org_members
   where auth_user_id = p_user and org_id in (select public.my_org_ids())
   limit 1;

  if v_org is null then raise exception 'member not found'; end if;
  if not public.is_org_owner(v_org) then
    raise exception 'only an owner can change roles';
  end if;
  if p_role not in ('owner','admin') then
    raise exception 'role must be owner or admin';
  end if;

  select count(*) into v_owners
    from public.org_members where org_id = v_org and role = 'owner';

  if v_role = 'owner' and p_role <> 'owner' and v_owners <= 1 then
    raise exception 'this is the last owner; make someone else an owner first';
  end if;

  update public.org_members set role = p_role
   where org_id = v_org and auth_user_id = p_user;

  return jsonb_build_object('updated', true);
end;
$$;

create or replace function public.claim_pending_invites()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_email text; v_inv record;
begin
  if v_uid is null then return jsonb_build_object('claimed', 0); end if;
  if exists (select 1 from public.org_members where auth_user_id = v_uid) then
    return jsonb_build_object('claimed', 0);
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null then return jsonb_build_object('claimed', 0); end if;

  select * into v_inv from public.org_invites
   where lower(email) = v_email order by created_at limit 1;
  if v_inv is null then return jsonb_build_object('claimed', 0); end if;

  insert into public.org_members (org_id, auth_user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict do nothing;

  delete from public.org_invites where id = v_inv.id;
  return jsonb_build_object('claimed', 1, 'org_id', v_inv.org_id);
end;
$$;

grant select on public.org_invites to authenticated;
grant execute on function public.is_org_owner(uuid)              to authenticated;
grant execute on function public.list_org_members()              to authenticated;
grant execute on function public.add_org_member(text, text)      to authenticated;
grant execute on function public.remove_org_member(uuid)         to authenticated;
grant execute on function public.revoke_org_invite(uuid)         to authenticated;
grant execute on function public.set_org_member_role(uuid, text) to authenticated;
grant execute on function public.claim_pending_invites()         to authenticated;

commit;
