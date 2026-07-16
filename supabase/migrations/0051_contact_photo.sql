-- ============================================================================
-- Separate the CONTACT PHOTO from the COMPANY LOGO.
--
-- dealstudio_access has had one image field, company_logo, used for both the
-- person and their company. They are different things: a company logo belongs on
-- the company, a person's photo on the person. This adds contact_photo so the two
-- can diverge.
--
-- Also surfaces contact_photo in admin_all_investors so the investor directory
-- can show the person's own image on the investor avatar, and keep company_logo
-- for the company column.
-- ============================================================================
begin;

alter table public.dealstudio_access
  add column if not exists contact_photo text;

-- Re-declare admin_all_investors with contact_photo carried through.
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
      'email',         e.email,
      'name',          max(e.name),
      'company_name',  max(e.company_name),
      'company_logo',  max(e.company_logo),
      'contact_photo', max(e.contact_photo),
      'linkedin',      max(e.linkedin),
      'website',       max(e.website),
      'deal_count',    count(distinct e.deal_id),
      'total_visits',  coalesce(sum(e.visits), 0),
      'last_login',    max(e.last_seen),
      'deals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'slug',           d2.slug,
          'company',        d2.company_name,
          'status',         coalesce(acc.stage, case when sub.visits > 0 then 'viewed' else 'prospect' end),
          'page_views',     coalesce(sub.page_views, 0),
          'deck_views',     coalesce(sub.deck_views, 0),
          'document_views', coalesce(sub.document_views, 0),
          'total_seconds',  coalesce(sub.total_seconds, 0),
          'last_seen',      sub.last_seen
        ) order by sub.last_seen desc nulls last), '[]'::jsonb)
        from (
          select vi.dealstudio_id,
                 count(*)                                          as visits,
                 sum(vi.page_views)                                as page_views,
                 sum(vi.deck_views)                                as deck_views,
                 sum(coalesce((vi.sections->>'documents')::numeric, 0)) as document_views,
                 sum(vi.total_seconds)                             as total_seconds,
                 max(vi.last_seen_at)                              as last_seen
            from public.dealstudio_visits vi
           where lower(vi.email) = e.email
           group by vi.dealstudio_id
        ) sub
        join public.dealstudios d2 on d2.id = sub.dealstudio_id
        left join public.dealstudio_access acc
               on acc.dealstudio_id = sub.dealstudio_id
              and lower(acc.email) = e.email
      )
    ) as x
    from (
      select lower(a.email) as email, a.name, a.company_name,
             a.company_logo, a.contact_photo, a.linkedin, a.website,
             a.dealstudio_id as deal_id,
             0 as visits, null::timestamptz as last_seen
        from public.dealstudio_access a
       where a.email is not null and trim(a.email) <> ''

      union all

      select lower(vi.email) as email, null::text, null::text,
             null::text, null::text, null::text, null::text,
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

select 'contact photo separated from company logo' as status;
