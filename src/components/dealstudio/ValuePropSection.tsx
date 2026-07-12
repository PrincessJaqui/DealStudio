/**
 * Investor-facing Value Proposition and Competition.
 *
 * Both render nothing when the founder left them empty, so a half-filled room
 * never shows a hollow heading.
 */

import { Target, Swords, Check, X, ExternalLink } from 'lucide-react';
import { useInViewOnce } from '../../lib/useInViewOnce';
import type { DealValueProp, DealCompetition } from '../../lib/dealStudio';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]';

function Heading({ icon: Icon, title }: { icon: typeof Target; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
        <Icon className="w-[18px] h-[18px]" />
      </span>
      <h2 className="text-lg font-bold text-[#191f1d]">{title}</h2>
    </div>
  );
}

/* ── Value Proposition ─────────────────────────────────────────────────────── */

export function ValuePropSection({ value }: { value: DealValueProp }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const pillars = (value.pillars ?? []).filter(p => p.title || p.description);
  const hasBody = value.headline || value.problem || value.solution || pillars.length;
  if (!hasBody) return null;

  return (
    <div ref={ref} className={inView ? 'ac-in' : 'ac-out'}>
      <Heading icon={Target} title="Value Proposition" />

      <div className={`${card} p-6`}>
        {value.headline && (
          <p className="text-xl font-bold text-[#191f1d] leading-snug text-center max-w-3xl mx-auto">
            {value.headline}
          </p>
        )}

        {(value.problem || value.solution) && (
          <div className="grid gap-4 sm:grid-cols-2 mt-6">
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

        {/* Circular pillars: each reason gets equal visual weight, which is the
            point. A ranked list implies a hierarchy the founder did not intend. */}
        {pillars.length > 0 && (
          <div
            className="grid gap-6 mt-8"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}
          >
            {pillars.map((p, i) => {
              // Walk the brand gradient across the circles so they read as a set.
              const t = pillars.length > 1 ? i / (pillars.length - 1) : 0;
              return (
                <div key={i} className="text-center">
                  <span
                    className="mx-auto mb-3 flex h-[86px] w-[86px] items-center justify-center rounded-full text-white text-xl font-bold shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]"
                    style={{
                      background: `linear-gradient(135deg,
                        color-mix(in srgb, var(--ds-accent) ${100 - t * 100}%, var(--ds-grad-to) ${t * 100}%),
                        color-mix(in srgb, var(--ds-accent-to) ${100 - t * 100}%, var(--ds-grad-from) ${t * 100}%))`,
                    }}
                  >
                    {i + 1}
                  </span>
                  {p.title && (
                    <p className="text-sm font-bold text-[#191f1d] leading-snug">{p.title}</p>
                  )}
                  {p.description && (
                    <p className="text-sm text-[#7f8c85] leading-relaxed mt-1.5">
                      {p.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Competition ───────────────────────────────────────────────────────────── */

export function CompetitionSection({ value }: { value: DealCompetition }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const features = (value.features ?? []).filter(f => f.label);
  const rivals = (value.competitors ?? []).filter(c => c.name);
  // The founder's own column is pinned first, because the grid exists to show
  // the contrast against it.
  const cols = [...rivals].sort((a, b) => Number(!!b.is_you) - Number(!!a.is_you));

  const hasGrid = features.length > 0 && cols.length > 0;
  const hasBody = value.overview || value.edge || hasGrid;
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

        {hasGrid && (
          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm min-w-[560px]">
              <thead>
                <tr>
                  <th className="text-left p-3 min-w-[180px]" />
                  {cols.map(c => (
                    <th key={c.id} className="p-3 text-center min-w-[130px]">
                      <div
                        className={`rounded-xl px-3 py-3 ${
                          c.is_you
                            ? 'bg-[var(--ds-accent-tint)] border border-[var(--ds-accent)]'
                            : 'border border-transparent'
                        }`}
                      >
                        <div className="h-10 w-10 mx-auto rounded-full overflow-hidden bg-[#f5f6f8] border border-[#edf0f3] flex items-center justify-center">
                          {c.logo
                            ? <img src={c.logo} alt="" className="h-full w-full object-cover" />
                            : <span className="text-[11px] font-bold text-[#9ca3af]">
                                {c.name.slice(0, 2).toUpperCase()}
                              </span>}
                        </div>

                        <p className="mt-2 text-sm font-bold text-[#191f1d] leading-tight">
                          {c.url ? (
                            <a
                              href={/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-[var(--ds-accent-ink)]"
                            >
                              {c.name}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : c.name}
                        </p>

                        {c.segment && (
                          <p className="text-[11px] text-[#9ca3af] mt-0.5">{c.segment}</p>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {features.map((f, i) => (
                  <tr key={f.id} className={i % 2 ? 'bg-[#fafbfc]' : ''}>
                    <td className="p-3 font-medium text-[#191f1d] align-middle">{f.label}</td>
                    {cols.map(c => {
                      const on = !!c.marks?.[f.id];
                      return (
                        <td key={c.id} className="p-3 text-center align-middle">
                          <span
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                              on
                                ? 'bg-[var(--ds-accent)] text-[var(--ds-on-accent)]'
                                : 'bg-[#eef0f3] text-[#b6bcc4]'
                            }`}
                          >
                            {on ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* The "gap we work in" notes, for any competitor that has one. */}
        {cols.some(c => c.weakness && !c.is_you) && (
          <div className="mt-6 space-y-2">
            {cols.filter(c => c.weakness && !c.is_you).map(c => (
              <div key={c.id} className="flex gap-3 text-sm">
                <span className="font-semibold text-[#191f1d] shrink-0 min-w-[110px]">{c.name}</span>
                <span className="text-[#7f8c85]">{c.weakness}</span>
              </div>
            ))}
          </div>
        )}

        {value.edge && (
          <div className="mt-6 rounded-xl border border-[#edf0f3] bg-[var(--ds-tint)] p-4">
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
