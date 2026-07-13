-- ============================================================================
-- Master admin: set a user's password.
--
-- Supabase stores a bcrypt hash in auth.users.encrypted_password, and pgcrypto
-- (in the extensions schema) produces exactly that format, so this writes a hash
-- GoTrue will accept on the next sign-in.
--
-- WHY THIS EXISTS
-- Confirmation and reset emails are the normal path, and they should stay the
-- normal path. But when the mail is misconfigured, bounces, or a customer is
-- locked out mid-raise, there has to be a way in that does not involve waiting
-- on an inbox.
--
-- THIS IS A SERIOUS CAPABILITY. It sets a credential for someone else's account.
-- Platform admins only, and it forces a minimum length so an admin in a hurry
-- cannot set "1234" on a customer's deal room.
--
-- Resending a magic link and sending a reset email do NOT need SQL: they are
-- ordinary client calls with the anon key. Only setting a password outright has
-- to happen here.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_set_user_password(
  p_email    text,
  p_password text
)
returns jsonb
language plpgsql security definer
set search_path = public, extensions as $$
declare
  v_user uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  if length(coalesce(p_password, '')) < 8 then
    return jsonb_build_object(
      'ok', false,
      'message', 'Password must be at least 8 characters.'
    );
  end if;

  select id into v_user
    from auth.users
   where lower(email) = lower(trim(p_email));

  if v_user is null then
    return jsonb_build_object(
      'ok', false,
      'message', 'No account with that email. They must sign up first.'
    );
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         -- A password is useless if the account is still unconfirmed, so setting
         -- one confirms it. Otherwise the admin fixes one lock and leaves another.
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         confirmed_at       = coalesce(confirmed_at, now()),
         updated_at         = now()
   where id = v_user;

  return jsonb_build_object('ok', true, 'user_id', v_user);
end;
$$;

grant execute on function public.admin_set_user_password(text, text) to authenticated;

commit;
