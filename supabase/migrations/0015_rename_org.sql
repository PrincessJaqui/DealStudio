-- ============================================================================
-- Renaming a company propagates to its deals.
--
-- A deal carries its own company_name, which is the name investors see in the
-- room. Renaming the organization used to leave every deal showing the old
-- name, so the header said one thing and the investor page said another.
--
-- The rule here mirrors how theming inherits: a deal that was FOLLOWING the
-- company name (its company_name equalled the old name, or was blank) gets
-- updated. A deal that has been deliberately renamed to something else keeps
-- its own name, because that was a choice and we should not overwrite it.
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.rename_org(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org      uuid;
  v_old      text;
  v_new      text := btrim(p_name);
  v_deals    int;
begin
  if v_new = '' then
    raise exception 'a company name is required';
  end if;

  select org_id into v_org
    from public.org_members
   where auth_user_id = auth.uid()
   limit 1;

  if v_org is null then raise exception 'no organization'; end if;

  select name into v_old from public.organizations where id = v_org;

  update public.organizations
     set name = v_new, updated_at = now()
   where id = v_org;

  -- Only deals that were tracking the company name follow the rename.
  update public.dealstudios
     set company_name = v_new,
         updated_at   = now()
   where org_id = v_org
     and (company_name = v_old or coalesce(btrim(company_name), '') = '');

  get diagnostics v_deals = row_count;

  return jsonb_build_object(
    'renamed', true,
    'from', v_old,
    'to', v_new,
    'deals_updated', v_deals
  );
end;
$$;

grant execute on function public.rename_org(text) to authenticated;

commit;
