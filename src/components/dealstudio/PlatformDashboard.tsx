/**
 * PlatformDashboard — what is actually happening in the product.
 *
 * One RPC, not a dozen round trips. Every number here is platform-wide, which is
 * exactly why the SQL refuses to answer for anyone who is not a platform admin.
 *
 * The numbers are chosen to answer real questions rather than to look busy:
 *   - "never signed in" is the activation number. A pile of created accounts that
 *     never came back means the confirmation email is broken, which has already
 *     happened once.
 *   - per-deal views tell you WHICH rooms investors open, not just that some do.
 *     A deal with no views is a customer about to churn.
 */

import { useEffect, useState } from 'react';
import { Loader2, Users, Building2, Presentation, Eye } from 'lucide-react';
import { adminPlatformStats, money, type PlatformStats } from '../../lib/billing';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';

function Stat({
  label, value, hint,
}: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl bg-[#f5f6f8] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ds-accent-ink)]">
        {label}
      </p>
      <p className="text-2xl font-bold text-[#191f1d] mt-1 leading-none">{value}</p>
      {hint && <p className="text-xs text-[#9ca3af] mt-1.5">{hint}</p>}
    </div>
  );
}

function Group({
  title, Icon, children,
}: { title: string; Icon: typeof Users; children: React.ReactNode }) {
  return (
    <div className={`${card} p-5`}>
      <p className="font-bold text-[#191f1d] flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--ds-brand)]" /> {title}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  );
}

export function PlatformDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setStats(await adminPlatformStats());
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className={`${card} p-8 flex items-center justify-center`}>
        <Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`${card} p-5`}>
        <p className="text-sm text-[#7f8c85]">Could not load activity right now.</p>
      </div>
    );
  }

  const { users, companies, deals, engagement, per_deal } = stats;

  return (
    <div className="space-y-5">
      <Group title="Users" Icon={Users}>
        <Stat label="Total" value={users.total} />
        <Stat
          label="Active this week"
          value={users.active_7d}
          hint={`${users.active_30d} in the last 30 days`}
        />
        <Stat label="New this month" value={users.new_30d} />
        <Stat label="Confirmed" value={users.confirmed} />
        <Stat
          label="Never signed in"
          value={users.never_signed_in}
          hint={users.never_signed_in > 0 ? 'Check the confirmation email is landing' : 'Everyone made it in'}
        />
      </Group>

      <Group title="Companies" Icon={Building2}>
        <Stat label="Total" value={companies.total} />
        <Stat label="Paying" value={companies.paying} />
        <Stat label="Trialing" value={companies.trialing} />
        <Stat label="Comped" value={companies.comped} />
        <Stat
          label="Expired"
          value={companies.expired}
          hint={companies.expired > 0 ? 'Locked out until they subscribe' : undefined}
        />
      </Group>

      <Group title="Deal rooms" Icon={Presentation}>
        <Stat label="Total" value={deals.total} />
        <Stat label="Live" value={deals.active} />
        <Stat label="Draft" value={deals.draft} hint="Not yet shared with investors" />
      </Group>

      <Group title="Investor engagement" Icon={Eye}>
        <Stat
          label="Sessions"
          value={engagement.investor_sessions}
          hint={`${engagement.sessions_7d} this week`}
        />
        <Stat label="Page views" value={engagement.total_page_views} />
        <Stat label="Deck views" value={engagement.total_deck_views} />
        <Stat label="Investors tracked" value={engagement.investors_tracked} />
        <Stat label="Committed" value={money(engagement.committed_cents)} />
      </Group>

      <div className={card}>
        <div className="p-5 border-b border-[#edf0f3]">
          <p className="font-bold text-[#191f1d]">Views per deal room</p>
          <p className="text-sm text-[#7f8c85]">
            A live room with no views is a customer about to leave.
          </p>
        </div>

        {per_deal.length === 0 ? (
          <p className="p-5 text-sm text-[#99a1af]">No deal rooms yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-[#7f8c85] border-b border-[#edf0f3]">
                  <th className="px-5 py-2.5">Deal</th>
                  <th className="px-5 py-2.5">Company</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Sessions</th>
                  <th className="px-5 py-2.5 text-right">Views</th>
                  <th className="px-5 py-2.5 text-right">Investors</th>
                </tr>
              </thead>
              <tbody>
                {per_deal.map((d) => (
                  <tr key={d.slug} className="border-b border-[#f5f6f8] last:border-0">
                    <td className="px-5 py-3 font-semibold text-[#191f1d]">{d.slug}</td>
                    <td className="px-5 py-3 text-[#7f8c85]">{d.company}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          d.active
                            ? 'bg-[var(--ds-accent-tint)] text-[var(--ds-accent-ink)]'
                            : 'bg-[#f5f6f8] text-[#9ca3af]'
                        }`}
                      >
                        {d.active ? 'Live' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{d.sessions}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{d.views}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{d.investors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
