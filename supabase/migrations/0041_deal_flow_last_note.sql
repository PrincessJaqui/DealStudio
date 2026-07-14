-- ============================================================================
-- Deal Flow: the people table is now the whole tab, so it carries the columns
-- the old pipeline card used to carry.
--
-- Only change: admin_deal_people also returns last_note_at, the date of the
-- most recent note. The table shows "Last Note" as a date, and a count alone
-- cannot answer "when did I last touch this one".
--
-- Everything else in this function is byte-for-byte 0037. Safe to re-run.
-- ============================================================================
begin;

create or replace function public.admin_deal_people(p_deal uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  if not public.owns_deal(p_deal) then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'last_seen' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'access_id',     a.id,
      'visit_id',      vi.id,
      'email',         coalesce(a.email, vi.email),
      'name',          a.name,
      'company_name',  a.company_name,
      'company_logo',  a.company_logo,
      'linkedin',      a.linkedin,
      'website',       a.website,
      'stage',         coalesce(a.stage, case when vi.id is not null then 'viewed' else 'prospect' end),
      -- The access GATE, separate from the pipeline stage above.
      'blocked',       coalesce(a.status = 'revoked', false),
      'share_token',   a.share_token,
      'visits',        coalesce(vi.page_views, 0),
      'total_seconds', coalesce(vi.total_seconds, 0),
      'deck_views',    coalesce(vi.deck_views, 0),
      'sections',      coalesce(vi.sections, '{}'::jsonb),
      'doc_views',     (
        select count(*) from jsonb_each(coalesce(vi.sections, '{}'::jsonb)) e
         where e.key like 'doc:%' and (e.value)::text <> '0'
      ),
      'last_seen',     vi.last_seen_at,
      'committed',     coalesce(a.committed_amount, 0),
      'note_count',    (select count(*) from public.dealstudio_notes n where n.access_id = a.id),
      'last_note_at',  (select max(n.created_at) from public.dealstudio_notes n where n.access_id = a.id),
      'forwards',      greatest(0, (
        select count(*) - 1 from public.dealstudio_share_opens so where so.access_id = a.id
      ))
    ) as x
    from public.dealstudio_access a
    full outer join public.dealstudio_visits vi
      on vi.dealstudio_id = a.dealstudio_id
     and lower(vi.email) = lower(a.email)
   where coalesce(a.dealstudio_id, vi.dealstudio_id) = p_deal
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_deal_people(uuid) to authenticated;

commit;

select 'deal flow last_note_at ready' as status;
