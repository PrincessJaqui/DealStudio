/**
 * PillTabs — the rounded pill tab bar, shared.
 *
 * It was written inline in Master Admin, and Settings and Deal Studio used a
 * different component entirely, so the three pages looked like three products.
 * One component now, so they cannot drift.
 *
 * THE SCROLL HINT
 * Deal Studio has more tabs than fit on a phone, and there is nothing to tell you
 * the bar scrolls: it just looks like the last tab is the last tab. On the first
 * visit the bar nudges left and back, once, so the overflow announces itself.
 *
 * It is remembered per key in localStorage, because a hint that fires every time
 * is not a hint, it is a twitch. It also only fires when the bar ACTUALLY
 * overflows, and never when the person has asked for reduced motion.
 */

import { useEffect, useRef } from 'react';

export function PillTabs<T extends string>({
  tabs, value, onChange, hintKey,
}: {
  tabs: readonly (readonly [T, string])[];
  value: T;
  onChange: (t: T) => void;
  /** Unique per tab bar. The hint plays once per key, ever. */
  hintKey: string;
}) {
  const rail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;

    // Nothing to hint at if it all fits.
    if (el.scrollWidth <= el.clientWidth + 4) return;

    const seen = `ds_scrollhint_${hintKey}`;
    try {
      if (localStorage.getItem(seen)) return;
      localStorage.setItem(seen, '1');
    } catch {
      // Private mode or storage disabled. Skip the hint rather than nag forever.
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const t1 = window.setTimeout(() => {
      el.scrollTo({ left: 64, behavior: 'smooth' });
    }, 550);
    const t2 = window.setTimeout(() => {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    }, 1150);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [hintKey]);

  return (
    <div
      ref={rail}
      className="mb-5 overflow-x-auto ds-scroll-x -mx-1 px-1"
    >
      <div className="inline-flex gap-1 rounded-full bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-1.5">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`px-5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${
              value === id
                ? 'bg-gradient-to-r from-[var(--ds-accent)] to-[var(--ds-accent-to)] text-[var(--ds-on-accent)]'
                : 'text-[#7f8c85] hover:text-[#191f1d]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
