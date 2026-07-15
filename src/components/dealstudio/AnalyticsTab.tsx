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
import { Loader2, TrendingUp, Users, Eye, Calendar, Activity } from 'lucide-react';
import {
  adminPlatformStats, adminPlatformAnalytics,
  type PlatformStats, type PlatformAnalytics,
} from '../../lib/billing';

const WINDOWS = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
] as const;

const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';
const num = (n: number | undefined) => (n ?? 0).toLocaleString();

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void (async () => {
      const [s, a] = await Promise.all([adminPlatformStats(), adminPlatformAnalytics(days)]);
      if (!live) return;
      setStats(s);
      setData(a);
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
    </div>
  );
}
