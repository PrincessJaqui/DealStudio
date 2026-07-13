-- ============================================================================
-- Delete confirmation: type DELETE.
--
-- It used to require the deal's own slug. That is a stronger guard -- it forces
-- you to look at WHICH deal you are on, and cannot be typed from habit -- but
-- Jaqui asked for DELETE, so DELETE it is.
--
-- The server still checks something: a client cannot delete a deal by accident
-- or by a stray call, it has to deliberately send the word. The slug is still
-- accepted too, so nothing that already worked stops working.
--
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.delete_deal(p_deal uuid, p_confirm_slug text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid;
  v_slug text;
  v_name text;
begin
  select org_id, slug, company_name into v_org, v_slug, v_name
    from public.dealstudios where id = p_deal;

  if v_org is null then
    return jsonb_build_object('deleted', false, 'name', '', 'slug', '');
  end if;

  if not public.is_org_member(v_org) then
    raise exception 'not authorized';
  end if;

  -- Either the literal word DELETE, or the deal's slug. Both are a deliberate
  -- act; neither can happen by accident.
  if upper(trim(coalesce(p_confirm_slug, ''))) <> 'DELETE'
     and lower(trim(coalesce(p_confirm_slug, ''))) <> lower(v_slug) then
    raise exception 'CONFIRM_MISMATCH: type DELETE to confirm';
  end if;

  delete from public.deal_documents    where dealstudio_id = p_deal;
  delete from public.dealstudio_visits where dealstudio_id = p_deal;
  delete from public.dealstudio_access  where dealstudio_id = p_deal;
  delete from public.dealstudios        where id = p_deal;

  return jsonb_build_object('deleted', true, 'name', v_name, 'slug', v_slug);
end;
$$;

grant execute on function public.delete_deal(uuid, text) to authenticated;

commit;
