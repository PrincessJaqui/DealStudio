-- ============================================================================
-- Let a master admin fix a user's NAME.
--
-- The name lives in auth.users.raw_user_meta_data. A customer on the phone
-- saying "my name is spelled wrong" previously had no fix at all: nothing in the
-- product could write to it.
--
-- We UPDATE an existing auth.users row, which is safe. We never INSERT one --
-- creating a user in SQL corrupts the identities table and breaks their login.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_set_user_name(p_user uuid, p_name text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  v_name := nullif(trim(coalesce(p_name, '')), '');

  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('full_name', to_jsonb(v_name)),
         updated_at = now()
   where id = p_user;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'No such user.');
  end if;

  return jsonb_build_object('ok', true, 'name', v_name);
end;
$$;

grant execute on function public.admin_set_user_name(uuid, text) to authenticated;

commit;
