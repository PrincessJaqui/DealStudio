-- ============================================================================
-- Two features in one migration, both about how investors reach people and how
-- the platform sees them.
--
-- 1. dealstudios.contact_email
--    The address the investor-facing "Email" button opens a message to. Per
--    deal, because a founder running two raises may route them to different
--    people. Nullable: when it is empty the button falls back to the deal
--    owner's login email, so the button always works even on an old deal created
--    before this field existed.
--
-- 2. admin_all_investors()
--    The cross-org investor directory, master admin ONLY. Every person who has
--    been added to or has opened ANY deal on the platform, with a count of how
--    many distinct deals each has seen. This is the contact graph: the one asset
--    a competitor cannot copy into existence. It reaches across org boundaries,
--    which normal RLS forbids, so it is security definer and gated hard on
--    is_platform_admin() -- a founder calling it gets 'not authorized', not a
--    filtered list.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists contact_email text;

create or replace function public.admin_all_investors()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  -- Hard gate. This crosses every org on the platform, so it is master-admin
  -- only, full stop. No org member ever sees another org's investors.
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select coalesce(jsonb_agg(x order by x->>'last_seen' desc nulls last), '[]'::jsonb)
    into v
  from (
    select jsonb_build_object(
      'email',        e.email,
      'name',         max(e.name),
      'company_name', max(e.company_name),
      -- Distinct deals this investor has any relationship with, across all orgs.
      'deal_count',   count(distinct e.deal_id),
      -- The deals themselves, so the row can list what they have seen.
      'deals',        jsonb_agg(distinct jsonb_build_object('slug', e.slug, 'company', e.deal_company)),
      'total_visits', coalesce(sum(e.visits), 0),
      'last_seen',    max(e.last_seen)
    ) as x
    from (
      -- People added to the pipeline by hand.
      select lower(a.email) as email, a.name, a.company_name,
             a.dealstudio_id as deal_id, d.slug, d.company_name as deal_company,
             0 as visits, null::timestamptz as last_seen
        from public.dealstudio_access a
        join public.dealstudios d on d.id = a.dealstudio_id
       where a.email is not null and trim(a.email) <> ''

      union all

      -- People who opened a room, whether or not they were ever added by hand.
      select lower(vi.email) as email, null::text, null::text,
             vi.dealstudio_id as deal_id, d.slug, d.company_name as deal_company,
             coalesce(vi.page_views, 0) as visits, vi.last_seen_at as last_seen
        from public.dealstudio_visits vi
        join public.dealstudios d on d.id = vi.dealstudio_id
       where vi.email is not null and trim(vi.email) <> ''
    ) e
    group by e.email
  ) t;

  return v;
end;
$$;

grant execute on function public.admin_all_investors() to authenticated;

-- ---------------------------------------------------------------------------
-- get_dealstudio_public gains 'contact_resolved': the address the Email button
-- should use, worked out on the SERVER so the owner's login email is never sent
-- to the browser unless it is actually the chosen fallback. Preference:
--   1. the deal's contact_email, if set
--   2. otherwise the org owner's login email
-- Everything else in this function is unchanged from 0019.
-- ---------------------------------------------------------------------------
create or replace function public.get_dealstudio_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(d) - 'shared_password_hash' - 'shared_password_plain' - 'org_id'
         || jsonb_build_object(
              'documents',
              coalesce((
                select jsonb_agg(to_jsonb(doc) order by doc.sort_order)
                  from public.deal_documents doc
                 where doc.dealstudio_id = d.id and doc.is_archived = false
              ), '[]'::jsonb),
              'theme', jsonb_build_object(
                'brand_from',   coalesce(d.brand_from,   o.brand_from),
                'brand_to',     coalesce(d.brand_to,     o.brand_to),
                'brand_accent', coalesce(d.brand_accent, o.brand_accent),
                'accent_to',    coalesce(d.accent_to,    o.accent_to),
                'logo_url',     coalesce(d.logo_url,     o.logo_url)
              ),
              'contact_resolved', coalesce(
                nullif(trim(d.contact_email), ''),
                (select u.email
                   from public.org_members m
                   join auth.users u on u.id = m.auth_user_id
                  where m.org_id = d.org_id
                  order by m.created_at
                  limit 1)
              )
            )
    from public.dealstudios d
    join public.organizations o on o.id = d.org_id
   where d.slug = p_slug and d.is_active = true
   limit 1;
$$;

grant execute on function public.get_dealstudio_public(text) to anon, authenticated;

commit;

select 'deal contact email + investor directory ready' as status;
