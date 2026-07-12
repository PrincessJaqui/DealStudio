-- ============================================================================
-- DealStudio: deal deletion + Demo Deal rename.
--
-- Deleting a deal cascades to its documents, investor list, visit history and
-- meetings. The RPC therefore reports what will be destroyed *before* the fact
-- (deal_delete_preview) so the UI can show it, and refuses to run for anyone
-- outside the owning organization.  Safe to re-run.
-- ============================================================================
begin;

/** What a delete would destroy. Read-only; used to populate the confirm dialog. */
create or replace function public.deal_delete_preview(p_deal uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name',      d.company_name,
    'slug',      d.slug,
    'documents', (select count(*) from public.deal_documents   x where x.dealstudio_id = d.id),
    'investors', (select count(*) from public.dealstudio_access x where x.dealstudio_id = d.id),
    'visits',    (select count(*) from public.dealstudio_visits x where x.dealstudio_id = d.id),
    'meetings',  (select count(*) from public.deal_meetings     x where x.dealstudio_id = d.id)
  )
  from public.dealstudios d
  where d.id = p_deal
    and (d.org_id in (select public.my_org_ids()) or public.is_platform_admin());
$$;

/**
 * Permanently deletes a deal and everything attached to it.
 * Guarded three ways: the caller must belong to the owning org (or be a
 * platform admin), the deal must exist, and the caller must pass the deal's
 * own slug as confirmation, so a stray call cannot destroy the wrong room.
 */
create or replace function public.delete_deal(p_deal uuid, p_confirm_slug text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org  uuid;
  v_slug text;
  v_name text;
begin
  select org_id, slug, company_name into v_org, v_slug, v_name
    from public.dealstudios where id = p_deal;

  if v_org is null then
    raise exception 'deal not found';
  end if;

  if not (public.is_org_member(v_org) or public.is_platform_admin()) then
    raise exception 'not authorized';
  end if;

  if p_confirm_slug is distinct from v_slug then
    raise exception 'confirmation did not match';
  end if;

  delete from public.dealstudios where id = p_deal;  -- children cascade

  return jsonb_build_object('deleted', true, 'name', v_name, 'slug', v_slug);
end;
$$;

grant execute on function public.deal_delete_preview(uuid)     to authenticated;
grant execute on function public.delete_deal(uuid, text)       to authenticated;

-- ── The platform owner's own deal becomes the Demo Deal ──────────────────────
-- Renames only; the slug is left alone so existing share links keep working.

update public.dealstudios d
   set company_name = 'Demo Deal',
       updated_at   = now()
  from public.organizations o
 where o.id = d.org_id
   and o.name = 'DealStudio'
   and d.company_name in ('DealStudio', '');

commit;
