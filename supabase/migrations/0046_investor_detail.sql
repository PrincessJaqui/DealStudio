-- ============================================================================
-- Investor directory, enriched for the reshaped table.
--
-- The old admin_all_investors returned email, name, company, a deal count, and a
-- flat list of deal slugs. The new table needs more:
--
--   * company_logo + linkedin  -> avatars and a LinkedIn column
--   * last_login               -> "Last login" = last time they opened ANY room
--   * deals[] with per-deal     -> the "Details" drill-down: for each deal this
--     analytics                   investor touched, their visits, page views, and
--                                 when they last opened it
--
-- Still master-admin only, still one function. The per-deal detail is built in
-- the same pass so the drill-down needs no second round-trip.
-- ============================================================================
begin;

create or replace function public.admin_all_investors()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'last_login' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'email',        e.email,
      'name',         max(e.name),
      'company_name', max(e.company_name),
      -- First non-null avatar/linkedin we have for this investor across any deal.
      'company_logo', max(e.company_logo),
      'linkedin',     max(e.linkedin),
      'deal_count',   count(distinct e.deal_id),
      'total_visits', coalesce(sum(e.visits), 0),
      -- "Last login" for an investor = last time they opened any deal room.
      'last_login',   max(e.last_seen),
      -- Per-deal breakdown for the Details drill-down. One object per deal, with
      -- this investor's own numbers on it.
      'deals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'slug',       d2.slug,
          'company',    d2.company_name,
          'visits',     coalesce(sub.visits, 0),
          'page_views', coalesce(sub.page_views, 0),
          'last_seen',  sub.last_seen
        ) order by sub.last_seen desc nulls last), '[]'::jsonb)
        from (
          select vi.dealstudio_id,
                 count(*)                    as visits,
                 sum(vi.page_views)          as page_views,
                 max(vi.last_seen_at)        as last_seen
            from public.dealstudio_visits vi
           where lower(vi.email) = e.email
           group by vi.dealstudio_id
        ) sub
        join public.dealstudios d2 on d2.id = sub.dealstudio_id
      )
    ) as x
    from (
      select lower(a.email) as email, a.name, a.company_name,
             a.company_logo, a.linkedin,
             a.dealstudio_id as deal_id,
             0 as visits, null::timestamptz as last_seen
        from public.dealstudio_access a
       where a.email is not null and trim(a.email) <> ''

      union all

      select lower(vi.email) as email, null::text, null::text,
             null::text, null::text,
             vi.dealstudio_id as deal_id,
             coalesce(vi.page_views, 0) as visits, vi.last_seen_at as last_seen
        from public.dealstudio_visits vi
       where vi.email is not null and trim(vi.email) <> ''
    ) e
    group by e.email
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_all_investors() to authenticated;

commit;

select 'investor directory enriched' as status;
