/**
 * HeroMockup — the deal room preview in the landing hero.
 *
 * Lived inside LandingScreen, which meant the editable landing (CustomLanding)
 * rendered a hero with no picture. One copy now, used by both, so they cannot
 * drift apart.
 *
 * The figures are illustrative and deliberately not real: this is a picture of
 * the product, not a claim about a company.
 */

import { Lock } from 'lucide-react';

const GRAD =
  'bg-gradient-to-br from-[var(--ds-grad-from)] via-[var(--ds-grad-mid)] to-[var(--ds-grad-to)]';

export function HeroMockup() {
  return (
    <div className="rounded-[22px] bg-white dark:bg-[#141a2e] border border-[#e6e8ee] dark:border-[#242c47] shadow-[0_18px_50px_-20px_rgba(23,20,60,0.18)] p-4 hover:-translate-y-1 transition duration-300">
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="w-2 h-2 rounded-full bg-[#e6e8ee] dark:bg-[#242c47]" />
        <span className="w-2 h-2 rounded-full bg-[#e6e8ee] dark:bg-[#242c47]" />
        <span className="w-2 h-2 rounded-full bg-[#e6e8ee] dark:bg-[#242c47]" />
        <span className="ml-2 flex-1 flex items-center gap-2 bg-[#eef0f4] dark:bg-[#1a2137] border border-[#e6e8ee] dark:border-[#242c47] rounded-lg px-3 py-1.5 text-[12.5px] text-[#5b6478] dark:text-[#9aa4be]">
          <Lock className="w-3 h-3 text-[var(--ds-accent-ink)] dark:text-[var(--ds-accent)]" />
          dealstudio.io/investors
          <span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-[var(--ds-accent-ink)] dark:text-[var(--ds-accent)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--ds-accent)] animate-pulse" />
            live
          </span>
        </span>
      </div>

      <div className="rounded-2xl bg-[#f5f6f8] dark:bg-[#0f1424] border border-[#e6e8ee] dark:border-[#242c47] p-4">
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-full ${GRAD} text-white font-bold flex items-center justify-center`}>N</span>
          <div>
            <div className="font-semibold">Northwind Robotics</div>
            <div className="text-[12.5px] text-[#5b6478] dark:text-[#9aa4be]">Seed / $750K on a SAFE</div>
          </div>
          <span className="ml-auto text-[11.5px] font-semibold text-[var(--ds-brand)] dark:text-[var(--ds-muted)] bg-[var(--ds-tint)] dark:bg-[#1a2137] px-2.5 py-1 rounded-full">
            Invite only
          </span>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          {[['Valuation cap', '$8.0M'], ['Committed', '$430K']].map(([lab, val]) => (
            <div key={lab} className="rounded-xl bg-white dark:bg-[#141a2e] border border-[#e6e8ee] dark:border-[#242c47] px-3 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wider font-semibold text-[var(--ds-accent-ink)] dark:text-[var(--ds-accent)]">{lab}</div>
              <div className="mt-0.5 font-bold text-[19px] tabular-nums">{val}</div>
            </div>
          ))}
        </div>

        <div className="mt-3.5 flex items-end gap-1.5 h-[52px]">
          {[34, 52, 44, 70, 61, 88, 100].map((h, i) => (
            <span key={i} className="flex-1 rounded-t-md bg-[var(--ds-accent)]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
