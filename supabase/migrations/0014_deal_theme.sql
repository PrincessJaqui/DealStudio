-- ============================================================================
-- Per-deal branding.
--
-- Each deal room can carry its own colours and logo. Where a deal leaves them
-- unset, the room falls back to the company's branding, and where that is unset
-- too, to the DealStudio defaults:
--
--     deal  ->  company  ->  default
--
-- Nulls mean "inherit". A deal with brand_from = null follows its company, so
-- changing the company updates every deal that has not overridden it.
--
-- The public payload has to carry the RESOLVED theme, because an anonymous
-- visitor cannot read the organizations table.
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists brand_from   text,
  add column if not exists brand_to     text,
  add column if not exists brand_accent text,
  add column if not exists accent_to    text,
  add column if not exists logo_url     text;

create or replace function public.get_dealstudio_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(d) - 'shared_password_hash' - 'org_id'
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
              )
            )
    from public.dealstudios d
    join public.organizations o on o.id = d.org_id
   where d.slug = p_slug and d.is_active = true
   limit 1;
$$;

grant execute on function public.get_dealstudio_public(text) to anon, authenticated;

commit;
