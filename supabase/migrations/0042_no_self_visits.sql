-- ============================================================================
-- Your own visits do not count.
--
-- A founder opens their own room constantly: to check a change, to show it to
-- someone, to test the gate. Every one of those was landing in
-- dealstudio_visits, so the founder appeared in their own pipeline, their own
-- deck views padded the analytics, and Total Visits counted the person who built
-- the deck.
--
-- The check is on the SERVER, not the client. The investor page calls this RPC
-- anonymously, so a client-side "am I the owner" test would be a suggestion, not
-- a rule, and would break the moment someone opened the room in a private window
-- while signed in elsewhere.
--
-- Who is skipped:
--   * anyone in an org that owns this deal (org_members)
--   * any platform admin
-- Matched on EMAIL, because the email is the only identity the room has: the
-- visitor is anonymous to Postgres even when they are signed in to the admin
-- console in another tab.
--
-- This is the only change to 0040's function. Everything else is 0040 verbatim.
-- Safe to re-run.
-- ============================================================================
begin;

create or replace function public.dealstudio_record_visit(
  p_slug          text,
  p_email         text,
  p_sections      jsonb,
  p_total_seconds numeric,
  p_deck_views    integer,
  p_session       text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_deal    uuid;
  v_org     uuid;
  v_email   text;
  v_session text;
  v_visits  integer;
  v_deck    integer;
  v_secs    numeric;
  v_sections jsonb;
begin
  select id, org_id into v_deal, v_org from public.dealstudios
   where lower(slug) = lower(trim(p_slug)) and is_active;
  if v_deal is null then return; end if;

  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null then return; end if;

  -- The deal's own people are not visitors to it.
  if exists (
    select 1
      from public.org_members m
      join auth.users u on u.id = m.auth_user_id
     where m.org_id = v_org
       and lower(u.email) = v_email
  ) or exists (
    select 1
      from public.platform_admins pa
      join auth.users u on u.id = pa.auth_user_id
     where lower(u.email) = v_email
  ) then
    return;
  end if;

  v_session := nullif(trim(coalesce(p_session, '')), '');
  if v_session is null then
    v_session := 'legacy-' || to_char(now(), 'YYYY-MM-DD');
  end if;

  insert into public.dealstudio_visit_sessions
    (dealstudio_id, email, session_token, deck_views, total_seconds, sections, last_seen_at)
  values
    (v_deal, v_email, v_session,
     greatest(coalesce(p_deck_views, 0), 0),
     greatest(coalesce(p_total_seconds, 0), 0),
     coalesce(p_sections, '{}'::jsonb),
     now())
  on conflict (dealstudio_id, email, session_token) do update set
    deck_views    = greatest(public.dealstudio_visit_sessions.deck_views, excluded.deck_views),
    total_seconds = greatest(public.dealstudio_visit_sessions.total_seconds, excluded.total_seconds),
    sections      = case
                      when excluded.sections = '{}'::jsonb
                        then public.dealstudio_visit_sessions.sections
                      else excluded.sections
                    end,
    last_seen_at  = now();

  select count(*),
         coalesce(sum(s.deck_views), 0),
         coalesce(sum(s.total_seconds), 0)
    into v_visits, v_deck, v_secs
    from public.dealstudio_visit_sessions s
   where s.dealstudio_id = v_deal and s.email = v_email;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
    into v_sections
    from (
      select e.key as k, sum((e.value)::numeric) as v
        from public.dealstudio_visit_sessions s,
             jsonb_each(s.sections) e
       where s.dealstudio_id = v_deal and s.email = v_email
       group by e.key
    ) t;

  insert into public.dealstudio_visits
    (dealstudio_id, email, page_views, deck_views, total_seconds, sections, last_seen_at)
  values (v_deal, v_email, v_visits, v_deck, v_secs, v_sections, now())
  on conflict (dealstudio_id, email) do update set
    page_views    = excluded.page_views,
    deck_views    = excluded.deck_views,
    total_seconds = excluded.total_seconds,
    sections      = excluded.sections,
    last_seen_at  = now();
end;
$$;

grant execute on function public.dealstudio_record_visit(text, text, jsonb, numeric, integer, text)
  to anon, authenticated;

commit;

select 'self visits no longer counted' as status;
