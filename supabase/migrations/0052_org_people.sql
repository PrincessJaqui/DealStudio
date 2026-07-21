-- ============================================================================
-- Deal Flow, across every deal the org owns.
--
-- admin_deal_people(p_deal) answers "who is in the pipeline for THIS deal".
-- Promoting Deal Flow to its own page needs the same rows for ALL of a
-- founder's deals at once, each tagged with which deal it came from, so the
-- page can show a Deal column you can filter and sort by.
--
-- One RPC rather than one call per deal: a founder with six deal rooms should
-- not cost six round trips to draw one table.
--
-- Scoped by my_org_ids(), so a founder sees their own deals and nothing else.
-- ============================================================================

-- ── PROJECT GUARD ───────────────────────────────────────────────────────────
-- Aborts if this is run against the wrong Supabase project. Nothing below runs.
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'dealstudios'
  ) then
    raise exception
      E'\n\n'
      '####################################################\n'
      '#  STOP -- WRONG SUPABASE PROJECT.                 #\n'
      '#  The "dealstudios" table was not found.          #\n'
      '#  Expected project ref: fitjoizptvxposunejgz      #\n'
      '#  Migration aborted. Nothing was changed.         #\n'
      '####################################################\n';
  end if;
end $$;

begin;

create or replace function public.admin_org_people()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  select coalesce(jsonb_agg(x order by x->>'last_seen' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      -- Which deal this row belongs to. The reason this function exists.
      'deal_id',       d.id,
      'deal_slug',     d.slug,
      'deal_company',  d.company_name,

      'access_id',     a.id,
      'visit_id',      vi.id,
      'email',         coalesce(a.email, vi.email),
      'name',          a.name,
      'company_name',  a.company_name,
      'company_logo',  a.company_logo,
      'contact_photo', a.contact_photo,
      'linkedin',      a.linkedin,
      'website',       a.website,
      'stage',         coalesce(a.stage, case when vi.id is not null then 'viewed' else 'prospect' end),
      'blocked',       coalesce(a.status = 'revoked', false),
      'visits',        coalesce(vi.page_views, 0),
      'total_seconds', coalesce(vi.total_seconds, 0),
      'deck_views',    coalesce(vi.deck_views, 0),
      'doc_views',     (
        select count(*) from jsonb_each(coalesce(vi.sections, '{}'::jsonb)) e
         where e.key like 'doc:%' and (e.value)::text <> '0'
      ),
      'last_seen',     vi.last_seen_at,
      'committed',     coalesce(a.committed_amount, 0),
      'note_count',    (select count(*) from public.dealstudio_notes n where n.access_id = a.id)
    ) as x
    from public.dealstudio_access a
    full outer join public.dealstudio_visits vi
      on vi.dealstudio_id = a.dealstudio_id
     and lower(vi.email) = lower(a.email)
    join public.dealstudios d
      on d.id = coalesce(a.dealstudio_id, vi.dealstudio_id)
    -- RLS-equivalent scoping, done explicitly because this is a definer function.
    where d.org_id in (select public.my_org_ids())
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_org_people() to authenticated;

commit;

select 'cross-deal people ready' as status;
