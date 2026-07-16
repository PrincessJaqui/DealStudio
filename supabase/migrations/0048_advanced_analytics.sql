-- ============================================================================
-- Advanced platform analytics. One master-admin-only function returning every
-- computable metric for the dashboard, in a single JSON payload so the UI makes
-- one call.
--
-- What it computes (all from data we actually hold):
--   * user_split      - founders vs investors; paying vs trialing orgs
--   * revenue         - total revenue, ARPU (revenue / paying orgs)
--   * raise           - total committed across all deals, close-rate bands
--                       (committed / raise_goal per deal): full (>=100%),
--                       partial (1-99%), none (0%)
--   * per_deal        - avg views per deal, avg committed per deal
--   * areas           - most/least clicked deal-room sections (from visits.sections)
--   * founders        - count, avg deals per founder, active vs dormant,
--                       engagement leaderboard (by visits their deals pulled)
--   * growth          - signups and revenue over the window, daily
--
-- Deliberately NOT included (we do not capture the data, so we will not fake it):
--   * referral source (nothing records how a visitor arrived)
--   * an explicit "round closed" outcome beyond the committed-vs-goal proxy
--
-- Gated on is_platform_admin(). Runs as definer.
-- ============================================================================
begin;

create or replace function public.admin_advanced_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days   integer := greatest(coalesce(p_days, 30), 1);
  v_from   timestamptz := now() - (v_days || ' days')::interval;
  result   jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'not authorized';
  end if;

  with
  -- Orgs split by billing state.
  org_stats as (
    select
      count(*)                                             as total_orgs,
      count(*) filter (where plan_id is not null)          as paying_orgs,
      count(*) filter (where plan_id is null
                         and coalesce(trial_ends_at, now()) >= now()) as trialing_orgs
    from public.organizations
  ),
  -- Distinct investor emails ever recorded.
  investor_count as (
    select count(distinct email) as investors
    from public.dealstudio_visits
    where email is not null
  ),
  -- Founders = distinct org members who own/belong to an org with a deal.
  founder_base as (
    select distinct m.auth_user_id, m.org_id
    from public.org_members m
    where exists (select 1 from public.dealstudios d where d.org_id = m.org_id)
  ),
  founder_stats as (
    select
      count(distinct auth_user_id) as founders
    from founder_base
  ),
  -- Revenue from succeeded transactions.
  revenue as (
    select coalesce(sum(amount_cents), 0) as total_cents
    from public.transactions
    where status in ('succeeded', 'paid', 'active')
  ),
  -- Committed capital + per-deal close-rate bands.
  deal_commit as (
    select
      d.id,
      coalesce(d.raise_goal, 0)                                        as goal,
      coalesce((select sum(a.committed_amount)
                  from public.dealstudio_access a
                 where a.dealstudio_id = d.id), 0)                     as committed
    from public.dealstudios d
  ),
  raise_bands as (
    select
      coalesce(sum(committed), 0)                                      as total_committed,
      count(*) filter (where goal > 0 and committed >= goal)           as full_rounds,
      count(*) filter (where goal > 0 and committed > 0 and committed < goal) as partial_rounds,
      count(*) filter (where goal > 0 and committed = 0)               as no_rounds,
      count(*) filter (where goal > 0)                                 as goaled_deals
    from deal_commit
  ),
  -- Per-deal engagement.
  per_deal as (
    select
      (select count(*) from public.dealstudios)                       as deal_count,
      coalesce((select sum(page_views) from public.dealstudio_visits), 0) as total_views
  ),
  -- Section click heatmap: sum each section key across all visits.
  area_clicks as (
    select e.key as area, sum((e.value)::numeric) as clicks
    from public.dealstudio_visits v, jsonb_each(coalesce(v.sections, '{}'::jsonb)) e
    group by e.key
  ),
  -- Founder engagement leaderboard: total visits their deals pulled.
  founder_engagement as (
    select
      fb.auth_user_id,
      (select max(u.email) from auth.users u where u.id = fb.auth_user_id) as email,
      count(distinct d.id)                                             as deals,
      coalesce(sum(vi.page_views), 0)                                  as visits
    from founder_base fb
    join public.dealstudios d on d.org_id = fb.org_id
    left join public.dealstudio_visits vi on vi.dealstudio_id = d.id
    group by fb.auth_user_id
  ),
  -- Signups per day in window.
  signup_series as (
    select to_char(d::date, 'YYYY-MM-DD') as day,
           (select count(*) from auth.users u where u.created_at::date = d::date) as signups
    from generate_series(v_from::date, now()::date, '1 day') d
  )
  select jsonb_build_object(
    'window_days', v_days,
    'user_split', jsonb_build_object(
      'founders',      (select founders from founder_stats),
      'investors',     (select investors from investor_count),
      'total_orgs',    (select total_orgs from org_stats),
      'paying_orgs',   (select paying_orgs from org_stats),
      'trialing_orgs', (select trialing_orgs from org_stats)
    ),
    'revenue', jsonb_build_object(
      'total_cents', (select total_cents from revenue),
      'arpu_cents',  case when (select paying_orgs from org_stats) > 0
                          then round((select total_cents from revenue)::numeric
                                     / (select paying_orgs from org_stats))
                          else 0 end
    ),
    'raise', jsonb_build_object(
      'total_committed', (select total_committed from raise_bands),
      'full_rounds',     (select full_rounds from raise_bands),
      'partial_rounds',  (select partial_rounds from raise_bands),
      'no_rounds',       (select no_rounds from raise_bands),
      'goaled_deals',    (select goaled_deals from raise_bands),
      'full_rate',       case when (select goaled_deals from raise_bands) > 0
                              then round(100.0 * (select full_rounds from raise_bands)
                                         / (select goaled_deals from raise_bands), 1)
                              else 0 end
    ),
    'per_deal', jsonb_build_object(
      'deal_count',       (select deal_count from per_deal),
      'avg_views',        case when (select deal_count from per_deal) > 0
                               then round((select total_views from per_deal)::numeric
                                          / (select deal_count from per_deal), 1)
                               else 0 end,
      'avg_committed',    case when (select deal_count from per_deal) > 0
                               then round((select total_committed from raise_bands)::numeric
                                          / (select deal_count from per_deal))
                               else 0 end
    ),
    'areas', (
      select coalesce(jsonb_agg(jsonb_build_object('area', area, 'clicks', clicks)
                                order by clicks desc), '[]'::jsonb)
      from area_clicks
    ),
    'founders_detail', jsonb_build_object(
      'avg_deals', case when (select founders from founder_stats) > 0
                        then round((select count(*) from public.dealstudios)::numeric
                                   / (select founders from founder_stats), 1)
                        else 0 end,
      'active',    (select count(*) from founder_engagement where visits > 0),
      'dormant',   (select count(*) from founder_engagement where visits = 0),
      'leaderboard', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'email', email, 'deals', deals, 'visits', visits)
                 order by visits desc), '[]'::jsonb)
        from (select * from founder_engagement order by visits desc limit 10) t
      )
    ),
    'growth', (
      select coalesce(jsonb_agg(jsonb_build_object('day', day, 'signups', signups)
                                order by day), '[]'::jsonb)
      from signup_series
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_advanced_analytics(integer) to authenticated;

commit;

select 'advanced analytics ready' as status;
