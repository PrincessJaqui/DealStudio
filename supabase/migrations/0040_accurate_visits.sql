-- ============================================================================
-- Make visit counting correct.
--
-- WHAT WAS WRONG
-- The client flushes its tally on beforeunload, on pagehide, and on every
-- visibilitychange to hidden. The old RPC then did:
--     page_views = page_views + 1
--     deck_views = deck_views + excluded.deck_views
--
-- 1. page_views counted FLUSHES, not visits. One investor tabbing between the
--    deck and their inbox logged six or seven "visits" in a single sitting.
-- 2. deck_views was cumulative on the client but ADDED on the server. The
--    client resends its running total on every flush, so opening the deck three
--    times and tabbing away four times recorded twelve deck views.
--
-- The two compound, and they punish focus: an investor who never leaves the tab
-- looks disengaged next to one who keeps alt-tabbing. Numbers that rank your
-- pipeline backwards are worse than no numbers.
--
-- WHAT IS RIGHT
-- Record each SESSION's running totals, replacing them (not adding), then roll a
-- person's row up from the sum of their sessions. Flushing ten times in one
-- sitting now changes nothing, because the tenth flush overwrites the ninth.
--
--   visits        = number of distinct sessions
--   deck_views    = sum of each session's deck opens
--   total_seconds = sum of each session's seconds
--   sections      = per-key sum across sessions
--
-- Safe to re-run.
-- ============================================================================
begin;

create table if not exists public.dealstudio_visit_sessions (
  dealstudio_id  uuid not null references public.dealstudios(id) on delete cascade,
  email          text not null,
  session_token  text not null,
  deck_views     integer not null default 0,
  total_seconds  numeric not null default 0,
  sections       jsonb   not null default '{}'::jsonb,
  started_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (dealstudio_id, email, session_token)
);

alter table public.dealstudio_visit_sessions enable row level security;

drop policy if exists visit_sessions_owner_read on public.dealstudio_visit_sessions;
create policy visit_sessions_owner_read on public.dealstudio_visit_sessions
  for select to authenticated
  using (public.owns_deal(dealstudio_id));


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
  v_email   text;
  v_session text;
  v_visits  integer;
  v_deck    integer;
  v_secs    numeric;
  v_sections jsonb;
begin
  select id into v_deal from public.dealstudios
   where lower(slug) = lower(trim(p_slug)) and is_active;
  if v_deal is null then return; end if;

  v_email   := lower(nullif(trim(coalesce(p_email, '')), ''));
  if v_email is null then return; end if;

  -- No session token means an older client. Fall back to a per-day bucket so it
  -- still cannot inflate: every flush that day lands on the same row.
  v_session := nullif(trim(coalesce(p_session, '')), '');
  if v_session is null then
    v_session := 'legacy-' || to_char(now(), 'YYYY-MM-DD');
  end if;

  -- SET, not add. The client sends its running total for THIS session, so the
  -- latest flush is the truth and replaces the previous one.
  insert into public.dealstudio_visit_sessions
    (dealstudio_id, email, session_token, deck_views, total_seconds, sections, last_seen_at)
  values
    (v_deal, v_email, v_session,
     greatest(coalesce(p_deck_views, 0), 0),
     greatest(coalesce(p_total_seconds, 0), 0),
     coalesce(p_sections, '{}'::jsonb),
     now())
  on conflict (dealstudio_id, email, session_token) do update set
    -- greatest() guards against an out-of-order flush arriving late and
    -- rewinding the session's totals.
    deck_views    = greatest(public.dealstudio_visit_sessions.deck_views, excluded.deck_views),
    total_seconds = greatest(public.dealstudio_visit_sessions.total_seconds, excluded.total_seconds),
    sections      = case
                      when excluded.sections = '{}'::jsonb
                        then public.dealstudio_visit_sessions.sections
                      else excluded.sections
                    end,
    last_seen_at  = now();

  -- Roll the person's row up from their sessions.
  select count(*),
         coalesce(sum(s.deck_views), 0),
         coalesce(sum(s.total_seconds), 0)
    into v_visits, v_deck, v_secs
    from public.dealstudio_visit_sessions s
   where s.dealstudio_id = v_deal and s.email = v_email;

  -- Sum each section key across the person's sessions.
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
