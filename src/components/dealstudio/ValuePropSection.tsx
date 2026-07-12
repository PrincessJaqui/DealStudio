/**
 * Investor-facing Value Proposition and Competition sections.
 * Read-only, and they render nothing at all when the founder has left them
 * empty, so a half-filled deal room never shows a hollow heading.
 */

import { Target, Swords, Check } from 'lucide-react';
import { useInViewOnce } from '../../lib/useInViewOnce';
import type { DealValueProp, DealCompetition } from '../../lib/dealStudio';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]';

function Heading({ icon: Icon, title }: { icon: typeof Target; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
        <Icon className="w-4.5 h-4.5" />
      </span>
      <h2 className="text-lg font-bold text-[#191f1d]">{title}</h2>
    </div>
  );
}

/* ── Value Proposition ─────────────────────────────────────────────────────── */

export function ValuePropSection({ value }: { value: DealValueProp }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const pillars = (value.pillars ?? []).filter((p) => p.title || p.description);
  const hasBody = value.headline || value.problem || value.solution || pillars.length;
  if (!hasBody) return null;

  return (
    <div ref={ref} className={inView ? 'ac-in' : 'ac-out'}>
      <Heading icon={Target} title="Value Proposition" />

      <div className={`${card} p-6`}>
        {value.headline && (
          <p className="text-xl font-bold text-[#191f1d] leading-snug">
            {value.headline}
          </p>
        )}

        {(value.problem || value.solution) && (
          <div className="grid gap-4 sm:grid-cols-2 mt-5">
            {value.problem && (
              <div className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)]">
                  The problem
                </p>
                <p className="text-sm text-[#4b5563] leading-relaxed mt-1.5 whitespace-pre-line">
                  {value.problem}
                </p>
              </div>
            )}
            {value.solution && (
              <div className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)]">
                  Our solution
                </p>
                <p className="text-sm text-[#4b5563] leading-relaxed mt-1.5 whitespace-pre-line">
                  {value.solution}
                </p>
              </div>
            )}
          </div>
        )}

        {pillars.length > 0 && (
          <div className="mt-5 space-y-3">
            {pillars.map((p, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-[var(--ds-tint)] flex items-center justify-center">
                  <Check className="w-3 h-3 text-[var(--ds-brand)]" />
                </span>
                <div className="min-w-0">
                  {p.title && (
                    <p className="text-sm font-semibold text-[#191f1d]">{p.title}</p>
                  )}
                  {p.description && (
                    <p className="text-sm text-[#7f8c85] leading-relaxed mt-0.5">
                      {p.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Competition ───────────────────────────────────────────────────────────── */

export function CompetitionSection({ value }: { value: DealCompetition }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const rows = (value.competitors ?? []).filter((c) => c.name || c.segment || c.weakness);
  const hasBody = value.overview || value.edge || rows.length;
  if (!hasBody) return null;

  return (
    <div ref={ref} className={inView ? 'ac-in' : 'ac-out'}>
      <Heading icon={Swords} title="Competition" />

      <div className={`${card} p-6`}>
        {value.overview && (
          <p className="text-sm text-[#4b5563] leading-relaxed whitespace-pre-line">
            {value.overview}
          </p>
        )}

        {rows.length > 0 && (
          <div className="mt-5 -mx-2 overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left border-b border-[#edf0f3]">
                  {['Player', 'Segment', 'The gap we work in'].map((h) => (
                    <th
                      key={h}
                      className="px-2 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i} className="border-b border-[#f2f4f6] last:border-0">
                    <td className="px-2 py-3 font-semibold text-[#191f1d] align-top">
                      {c.name || '\u2014'}
                    </td>
                    <td className="px-2 py-3 text-[#7f8c85] align-top whitespace-nowrap">
                      {c.segment || ''}
                    </td>
                    <td className="px-2 py-3 text-[#4b5563] align-top">
                      {c.weakness || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {value.edge && (
          <div className="mt-5 rounded-xl border border-[#edf0f3] bg-[var(--ds-tint)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ds-brand)]">
              Our edge
            </p>
            <p className="text-sm text-[#191f1d] leading-relaxed mt-1.5 whitespace-pre-line">
              {value.edge}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
