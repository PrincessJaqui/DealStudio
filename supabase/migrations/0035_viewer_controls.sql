-- ============================================================================
-- Viewer controls for Deal Flow: delete, reset, block.
--
-- A founder running a raise needs to be able to say "that person should not be
-- in here". Until now the only options were to leave them or to delete the whole
-- room.
--
-- Blocking sets the access status to 'revoked'. That is not decoration:
-- dealstudio_verify_access only lets someone in when status = 'approved', so a
-- revoked viewer is genuinely locked out at the gate, not merely hidden from a
-- list.
--
-- Safe to re-run.
-- ============================================================================
begin;

-- Who owns this deal? Every function below is gated on it.
create or replace function public.owns_deal(p_deal uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.dealstudios d
     where d.id = p_deal
       and public.is_org_member(d.org_id)
  );
$$;

grant execute on function public.owns_deal(uuid) to authenticated;


-- ── Permanently delete a viewer ─────────────────────────────────────────────
-- Removes the visit record entirely. Their analytics go with them, which is the
-- point: this is for the test visits and the mistakes, not for hiding a real
-- investor you would rather forget.
create or replace function public.admin_delete_visit(p_visit uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
begin
  select dealstudio_id into v_deal from public.dealstudio_visits where id = p_visit;
  if v_deal is null then
    return jsonb_build_object('ok', false, 'message', 'No such viewer.');
  end if;
  if not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  delete from public.dealstudio_visits where id = p_visit;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_delete_visit(uuid) to authenticated;


-- ── Reset a viewer's counts ─────────────────────────────────────────────────
-- Keeps the person, zeroes the numbers. For when you have been testing against
-- your own deck and do not want your own 40 views in the analytics.
create or replace function public.admin_reset_visit(p_visit uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_deal uuid;
begin
  select dealstudio_id into v_deal from public.dealstudio_visits where id = p_visit;
  if v_deal is null then
    return jsonb_build_object('ok', false, 'message', 'No such viewer.');
  end if;
  if not public.owns_deal(v_deal) then
    raise exception 'not authorized';
  end if;

  update public.dealstudio_visits
     set page_views    = 0,
         deck_views    = 0,
         total_seconds = 0,
         sections      = '{}'::jsonb
   where id = p_visit;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_reset_visit(uuid) to authenticated;


-- ── Block or unblock a viewer by email ──────────────────────────────────────
-- Creates the access row if there is not one, so you can block someone who only
-- ever showed up as a visit.
create or replace function public.admin_block_viewer(
  p_deal uuid,
  p_email text,
  p_blocked boolean
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if not public.owns_deal(p_deal) then
    raise exception 'not authorized';
  end if;

  v_email := lower(trim(coalesce(p_email, '')));
  if v_email = '' then
    return jsonb_build_object('ok', false, 'message', 'That viewer has no email to block.');
  end if;

  if p_blocked then
    -- 'revoked' is what the gate already refuses. Reusing it means blocking
    -- cannot drift out of sync with the thing that enforces it.
    insert into public.dealstudio_access (dealstudio_id, email, status, source)
    values (p_deal, v_email, 'revoked', 'blocked')
    on conflict (dealstudio_id, lower(email))
      do update set status = 'revoked';
  else
    update public.dealstudio_access
       set status = 'pending'
     where dealstudio_id = p_deal
       and lower(email) = v_email
       and status = 'revoked';
  end if;

  return jsonb_build_object('ok', true, 'blocked', p_blocked);
end;
$$;

grant execute on function public.admin_block_viewer(uuid, text, boolean) to authenticated;

commit;
