-- ============================================================================
-- Platform analytics for the master-admin dashboard.
--
-- admin_platform_stats (migration 0031) already returns the CURRENT totals:
-- users, companies, deals, engagement. This adds the two things a dashboard
-- needs that a snapshot cannot give:
--
--   1. TIME SERIES. Daily activity over a window, so you can see whether the
--      line is going up. Signups, investor sessions, and events per day.
--   2. LEADERBOARDS. The most-viewed deals and the busiest days, so "what is
--      happening in the app" has specifics, not just a count.
--
-- This is the aggregation layer, not machine learning. It reads events that are
-- already flowing into analytics_events and dealstudio_visits and rolls them up.
-- It is the foundation the graph would later stand on: you cannot learn what
-- keeps investors engaged until you can see engagement over time.
--
-- Master admin only, like everything platform-wide. p_days bounds the window so
-- a growing events table never turns this into a full-table scan.
-- ============================================================================
begin;

create or replace function public.admin_platform_analytics(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz := now() - make_interval(days => v_days);
  v jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'window_days', v_days,

    -- ── Headline counts over the window ────────────────────────────────────
    'totals', jsonb_build_object(
      'signups',          (select count(*) from auth.users where created_at >= v_since),
      'investor_sessions',(select count(*) from public.dealstudio_visits where last_seen_at >= v_since),
      'events',           (select count(*) from public.analytics_events where created_at >= v_since),
      'deals_created',    (select count(*) from public.dealstudios where created_at >= v_since),
      'meetings',         (select count(*) from public.analytics_events
                            where created_at >= v_since and event_name = 'dealstudio_request_meeting')
    ),

    -- ── Daily series. One row per day in the window, zero-filled, so a chart
    --    never has a gap that reads as "no data" when it means "no activity".
    'daily', (
      with days as (
        select generate_series(
          date_trunc('day', v_since),
          date_trunc('day', now()),
          interval '1 day'
        )::date as d
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'date',     to_char(days.d, 'YYYY-MM-DD'),
        'signups',  coalesce(su.n, 0),
        'sessions', coalesce(se.n, 0),
        'events',   coalesce(ev.n, 0)
      ) order by days.d), '[]'::jsonb)
      from days
      left join (
        select created_at::date as d, count(*) n
          from auth.users where created_at >= v_since group by 1
      ) su on su.d = days.d
      left join (
        select last_seen_at::date as d, count(*) n
          from public.dealstudio_visits where last_seen_at >= v_since group by 1
      ) se on se.d = days.d
      left join (
        select created_at::date as d, count(*) n
          from public.analytics_events where created_at >= v_since group by 1
      ) ev on ev.d = days.d
    ),

    -- ── The deals getting the most attention in the window ─────────────────
    'top_deals', (
      select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'slug',    d.slug,
          'company', d.company_name,
          'views',   coalesce(sum(vi.page_views), 0),
          'visitors',count(distinct vi.email)
        ) as x
        from public.dealstudios d
        join public.dealstudio_visits vi on vi.dealstudio_id = d.id
        where vi.last_seen_at >= v_since
        group by d.id, d.slug, d.company_name
        order by coalesce(sum(vi.page_views), 0) desc
        limit 10
      ) t
    ),

    -- ── What events fire most. Tells you what people actually DO in the app,
    --    which is the raw material the learning engine will later model.
    'top_events', (
      select coalesce(jsonb_agg(jsonb_build_object('name', event_name, 'count', n)
                      order by n desc), '[]'::jsonb)
      from (
        select coalesce(event_name, event_type) as event_name, count(*) n
          from public.analytics_events
         where created_at >= v_since
         group by 1
         order by n desc
         limit 12
      ) t
    )
  ) into v;

  return v;
end;
$$;

grant execute on function public.admin_platform_analytics(int) to authenticated;

commit;

select 'platform analytics ready' as status;
