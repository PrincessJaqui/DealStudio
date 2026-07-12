-- ============================================================================
-- Value Proposition + Competition sections.
--
-- Both follow the existing Market/Team pattern: a jsonb column on the deal,
-- surfaced to the public room through get_dealstudio_extras. Nothing here is
-- sensitive, so the public payload carries them as-is.
-- Safe to re-run.
-- ============================================================================
begin;

alter table public.dealstudios
  add column if not exists value_prop  jsonb,
  add column if not exists competition jsonb;

-- Extras now carry the two new sections alongside market and team.
create or replace function public.get_dealstudio_extras(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'market',      d.market,
    'team',        d.team,
    'value_prop',  d.value_prop,
    'competition', d.competition
  )
  from public.dealstudios d
  where d.slug = p_slug and d.is_active = true
  limit 1;
$$;

grant execute on function public.get_dealstudio_extras(text) to anon, authenticated;

commit;

select 'value_prop + competition columns ready' as status,
       to_regclass('public.dealstudios') is not null as table_ok;
