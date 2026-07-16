/**
 * The platform analytics dashboard. Master admin only.
 *
 * This is the foundation of the "knowledge base that learns": before DealStudio
 * can infer anything, someone has to be able to SEE what is happening. So this
 * page answers the plain question first, what activity is in the app, over time,
 * and which deals and actions drive it, and leaves the modelling for later.
 *
 * Everything here reads two functions that are gated in the database on
 * is_platform_admin: admin_platform_stats (current totals) and
 * admin_platform_analytics (time series and leaderboards). A founder who reached
 * this component would get nulls, not another org's numbers.
 */

import { useEffect, useState } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Loader2, TrendingUp, Users, Eye, Calendar, Activity, DollarSign, Target, MousePointerClick, UserCog } from 'lucide-react';
import {
  adminPlatformStats, adminPlatformAnalytics, adminAdvancedAnalytics,
  type PlatformStats, type PlatformAnalytics, type AdvancedAnalytics,
} from '../../lib/billing';

const WINDOWS = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
] as const;

const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';
const num = (n: number | undefined) => (n ?? 0).toLocaleString();
const money = (cents: number | undefined) => '$' + Math.round((cents ?? 0) / 100).toLocaleString();

/** Same tile shape as the deal dashboard: uppercase green label, big value bottom
 *  right, no icon in the body. */
function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={`${card} p-4 flex flex-col`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--ds-brand)]">{label}</p>
      <p className="text-2xl font-bold text-[#191f1d] mt-auto pt-2 text-right">{value}</p>
      {sub && <p className="text-[11px] text-[#99a1af] text-right mt-0.5">{sub}</p>}
    </div>
  );
}

export function AnalyticsTab() {
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [data, setData] = useState<PlatformAnalytics | null>(null);
  const [adv, setAdv] = useState<AdvancedAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void (async () => {
      const [s, a, x] = await Promise.all([adminPlatformStats(), adminPlatformAnalytics(days), adminAdvancedAnalytics(days)]);
      if (!live) return;
      setStats(s);
      setData(a);
      setAdv(x);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [days]);

  if (loading && !data) {
    return <div className={`${card} p-10 flex justify-center`}><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  if (!data) {
    return (
      <div className={`${card} p-8 text-center`}>
        <p className="text-sm font-semibold text-[#191f1d]">Analytics unavailable.</p>
        <p className="mt-1 text-xs text-[#7f8c85] max-w-md mx-auto">
          The analytics function is not installed on the database yet. Run migration
          0045_platform_analytics.sql, then reload.
        </p>
      </div>
    );
  }

  const chartData = data.daily.map(d => ({
    date: d.date.slice(5), // MM-DD
    Sessions: d.sessions,
    Events: d.events,
    Signups: d.signups,
  }));

  return (
    <div className="space-y-5">
      {/* Header + window selector */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#191f1d]">Platform Analytics</h3>
          <p className="text-xs text-[#7f8c85] mt-0.5">What is happening across DealStudio, over time.</p>
        </div>
        <div className="sm:ml-auto inline-flex items-center gap-1 rounded-full bg-[#f5f6f8] p-1">
          {WINDOWS.map(([d, label]) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                days === d ? 'bg-white text-[#191f1d] shadow-sm' : 'text-[#7f8c85] hover:text-[#191f1d]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row. Lifetime totals from stats, windowed totals from analytics. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Signups" value={num(data.totals.signups)} sub={`in ${data.window_days} days`} />
        <Kpi label="Investor Sessions" value={num(data.totals.investor_sessions)} sub={`in ${data.window_days} days`} />
        <Kpi label="Events" value={num(data.totals.events)} sub={`in ${data.window_days} days`} />
        <Kpi label="Meetings Booked" value={num(data.totals.meetings)} sub={`in ${data.window_days} days`} />
      </div>

      {/* Lifetime context strip, small, so the windowed numbers above have an anchor. */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Total Users" value={num(stats.users?.total)} sub={`${num(stats.users?.active_7d)} active this week`} />
          <Kpi label="Companies" value={num(stats.companies?.total)} sub={`${num(stats.companies?.paying)} paying`} />
          <Kpi label="Deals" value={num(stats.deals?.total)} sub={`${num(stats.deals?.active)} active`} />
          <Kpi label="Investors Tracked" value={num(stats.engagement?.investors_tracked)} />
        </div>
      )}

      {/* Activity over time */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-[var(--ds-brand)]" />
          <h4 className="text-sm font-bold text-[#191f1d]">Activity over time</h4>
        </div>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
              <defs>
                <linearGradient id="gSessions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ds-brand)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--ds-brand)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gEvents" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--ds-accent)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--ds-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#edf0f3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#99a1af' }} tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={{ fontSize: 11, fill: '#99a1af' }} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: '1px solid #edf0f3', fontSize: 12, boxShadow: '0 8px 28px -6px rgba(12,16,34,0.18)' }}
              />
              <Area type="monotone" dataKey="Sessions" stroke="var(--ds-brand)" strokeWidth={2} fill="url(#gSessions)" />
              <Area type="monotone" dataKey="Events" stroke="var(--ds-accent)" strokeWidth={2} fill="url(#gEvents)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Two leaderboards side by side */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-[var(--ds-brand)]" />
            <h4 className="text-sm font-bold text-[#191f1d]">Most-viewed deals</h4>
          </div>
          {data.top_deals.length === 0 ? (
            <p className="text-sm text-[#99a1af] py-6 text-center">No deal activity in this window.</p>
          ) : (
            <div className="space-y-1">
              {data.top_deals.map((d, i) => (
                <div key={d.slug} className="flex items-center gap-3 py-2 border-b border-[#f5f6f8] last:border-0">
                  <span className="w-5 text-xs font-bold text-[#c7cdd4] tabular-nums">{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[#191f1d]">{d.company || d.slug}</span>
                  <span className="text-xs text-[#7f8c85] tabular-nums shrink-0">
                    <Eye className="w-3 h-3 inline mr-1 -mt-0.5" />{num(d.views)}
                  </span>
                  <span className="text-xs text-[#99a1af] tabular-nums shrink-0 w-16 text-right">
                    <Users className="w-3 h-3 inline mr-1 -mt-0.5" />{num(d.visitors)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-[var(--ds-brand)]" />
            <h4 className="text-sm font-bold text-[#191f1d]">What people do</h4>
          </div>
          {data.top_events.length === 0 ? (
            <p className="text-sm text-[#99a1af] py-6 text-center">No events in this window.</p>
          ) : (
            <div className="space-y-1">
              {data.top_events.map((e) => (
                <div key={e.name} className="flex items-center gap-3 py-2 border-b border-[#f5f6f8] last:border-0">
                  <span className="flex-1 min-w-0 truncate text-sm text-[#191f1d]">
                    {e.name.replace(/^dealstudio_/, '').replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-[#7f8c85] tabular-nums shrink-0">{num(e.count)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Advanced metrics ─────────────────────────────────────────────────
          Everything below reads admin_advanced_analytics. If that migration
          hasn't run, adv is null and this whole block is skipped, so the
          foundation dashboard above still works on its own. */}
      {adv && (
        <>
          <div className="pt-2">
            <h3 className="text-sm font-bold text-[#191f1d]">Revenue &amp; growth</h3>
            <p className="text-xs text-[#7f8c85] mt-0.5">The money and the funnel behind it.</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Total Revenue" value={money(adv.revenue.total_cents)} />
            <Kpi label="ARPU" value={money(adv.revenue.arpu_cents)} sub="per paying company" />
            <Kpi label="Paying" value={num(adv.user_split.paying_orgs)} sub={`${num(adv.user_split.trialing_orgs)} on trial`} />
            <Kpi label="Committed Capital" value={money(adv.raise.total_committed * 100)} sub="across all deals" />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Founders" value={num(adv.user_split.founders)} sub={`${adv.founders_detail.avg_deals} deals each avg`} />
            <Kpi label="Investors" value={num(adv.user_split.investors)} />
            <Kpi label="Views / Deal" value={String(adv.per_deal.avg_views)} sub={`${num(adv.per_deal.deal_count)} deals`} />
            <Kpi label="Avg Committed / Deal" value={money(adv.per_deal.avg_committed * 100)} />
          </div>

          {/* Close rates + founder split, two cards */}
          <div className="grid lg:grid-cols-2 gap-5">
            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-[var(--ds-brand)]" />
                <h4 className="text-sm font-bold text-[#191f1d]">Round close rates</h4>
              </div>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-3xl font-bold text-[#191f1d]">{adv.raise.full_rate}%</span>
                <span className="text-xs text-[#7f8c85] mb-1">of deals with a goal fully committed</span>
              </div>
              {/* Stacked bar: full / partial / none */}
              {adv.raise.goaled_deals > 0 ? (
                <>
                  <div className="flex h-3 rounded-full overflow-hidden bg-[#f5f6f8]">
                    <div style={{ width: `${100 * adv.raise.full_rounds / adv.raise.goaled_deals}%` }} className="bg-[var(--ds-brand)]" />
                    <div style={{ width: `${100 * adv.raise.partial_rounds / adv.raise.goaled_deals}%` }} className="bg-[var(--ds-accent)]" />
                    <div style={{ width: `${100 * adv.raise.no_rounds / adv.raise.goaled_deals}%` }} className="bg-[#e0e4ea]" />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--ds-brand)]" /> Full: {num(adv.raise.full_rounds)}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[var(--ds-accent)]" /> Partial: {num(adv.raise.partial_rounds)}</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#e0e4ea]" /> None: {num(adv.raise.no_rounds)}</span>
                  </div>
                  <p className="text-[11px] text-[#99a1af] mt-3">Based on committed capital vs each deal's stated raise goal ({num(adv.raise.goaled_deals)} deals with a goal set).</p>
                </>
              ) : (
                <p className="text-sm text-[#99a1af] py-4 text-center">No deals have a raise goal set yet.</p>
              )}
            </div>

            <div className={`${card} p-5`}>
              <div className="flex items-center gap-2 mb-4">
                <UserCog className="w-4 h-4 text-[var(--ds-brand)]" />
                <h4 className="text-sm font-bold text-[#191f1d]">Founder activity</h4>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-[#f5f6f8] p-3 text-center">
                  <p className="text-2xl font-bold text-[#191f1d]">{num(adv.founders_detail.active)}</p>
                  <p className="text-[11px] text-[#7f8c85] mt-0.5">active (deals viewed)</p>
                </div>
                <div className="rounded-xl bg-[#f5f6f8] p-3 text-center">
                  <p className="text-2xl font-bold text-[#191f1d]">{num(adv.founders_detail.dormant)}</p>
                  <p className="text-[11px] text-[#7f8c85] mt-0.5">dormant (no views yet)</p>
                </div>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] mb-2">Top founders by engagement</p>
              {adv.founders_detail.leaderboard.length === 0 ? (
                <p className="text-sm text-[#99a1af] py-3 text-center">No founder engagement yet.</p>
              ) : (
                <div className="space-y-1">
                  {adv.founders_detail.leaderboard.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 border-b border-[#f5f6f8] last:border-0">
                      <span className="w-4 text-xs font-bold text-[#c7cdd4] tabular-nums">{i + 1}</span>
                      <span className="flex-1 min-w-0 truncate text-sm text-[#191f1d]">{f.email || 'Unknown'}</span>
                      <span className="text-xs text-[#99a1af] tabular-nums shrink-0">{num(f.deals)} deals</span>
                      <span className="text-xs text-[#7f8c85] tabular-nums shrink-0 w-14 text-right"><Eye className="w-3 h-3 inline mr-1 -mt-0.5" />{num(f.visits)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Deal-room area heatmap */}
          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-4">
              <MousePointerClick className="w-4 h-4 text-[var(--ds-brand)]" />
              <h4 className="text-sm font-bold text-[#191f1d]">Most-clicked deal-room areas</h4>
            </div>
            {adv.areas.length === 0 ? (
              <p className="text-sm text-[#99a1af] py-6 text-center">No section activity recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {adv.areas.map((a) => {
                  const max = Math.max(...adv.areas.map(x => x.clicks), 1);
                  return (
                    <div key={a.area} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs font-medium text-[#191f1d] capitalize">{a.area}</span>
                      <div className="flex-1 h-6 rounded-lg bg-[#f5f6f8] overflow-hidden">
                        <div style={{ width: `${100 * a.clicks / max}%` }} className="h-full bg-gradient-to-r from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] rounded-lg" />
                      </div>
                      <span className="w-14 shrink-0 text-right text-xs text-[#7f8c85] tabular-nums">{num(a.clicks)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
