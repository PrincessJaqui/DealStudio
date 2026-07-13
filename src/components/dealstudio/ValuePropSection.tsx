/**
 * Investor-facing Value Proposition and Competition.
 *
 * Both render nothing when the founder left them empty, so a half-filled room
 * never shows a hollow heading.
 */

import { useState } from 'react';
import { Check, X, ExternalLink } from 'lucide-react';
import { useInViewOnce } from '../../lib/useInViewOnce';
import type { DealValueProp, DealCompetition } from '../../lib/dealStudio';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]';



/* ── Value Proposition ─────────────────────────────────────────────────────── */

export function ValuePropSection({ value }: { value: DealValueProp }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const pillars = (value.pillars ?? []).filter(p => p.title || p.description);
  const hasBody = value.headline || value.problem || value.solution || pillars.length;
  if (!hasBody) return null;

  return (
    <div ref={ref} className={`${card} p-5 ${inView ? 'ac-in' : 'ac-out'}`}>
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Value Proposition</h2>

      <div>
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

        {pillars.length > 0 && <ValuePropWheel pillars={pillars} />}
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
    <div ref={ref} className={`${card} p-5 ${inView ? 'ac-in' : 'ac-out'}`}>
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Competitive Landscape</h2>

      <div>
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
                        className={`rounded-t-2xl px-3 py-3 ${
                          c.is_you
                            ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]'
                            : 'bg-[#f1f3f7]'
                        }`}
                      >
                        {c.logo && (
                          <div className="h-9 w-9 mx-auto mb-1 rounded-full overflow-hidden bg-white border border-[#edf0f3]">
                            <img src={c.logo} alt="" className="h-full w-full object-cover" />
                          </div>
                        )}

                        <p className={`text-sm font-bold leading-tight ${c.is_you ? 'text-white' : 'text-[#191f1d]'}`}>
                          {c.url ? (
                            <a
                              href={/^https?:\/\//i.test(c.url) ? c.url : `https://${c.url}`}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 ${c.is_you ? 'hover:text-white/80' : 'hover:text-[var(--ds-accent-ink)]'}`}
                            >
                              {c.name}
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          ) : c.name}
                        </p>

                        {c.segment && (
                          <p className={`text-[11px] mt-0.5 ${c.is_you ? 'text-white/70' : 'text-[#9ca3af]'}`}>
                            {c.segment}
                          </p>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {features.map((f, i) => (
                  <tr key={f.id} className={i % 2 ? 'bg-[#f8f9fb]' : ''}>
                    <td className="p-3 font-medium text-[#191f1d] align-middle">{f.label}</td>
                    {cols.map(c => {
                      const on = !!c.marks?.[f.id];
                      return (
                        <td
                          key={c.id}
                          className={`p-3 text-center align-middle ${c.is_you ? 'bg-[var(--ds-accent-tint)]' : ''}`}
                        >
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                              on
                                ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                                : 'bg-[#fdeaea] text-[#e05252]'
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

/* ── The value proposition wheel ───────────────────────────────────────────── */

const CX = 150, CY = 150, R_IN = 58, R_OUT = 132, GAP = 3, EXPLODE = 5;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/**
 * One slice of the wheel, nudged out along its own bisector so the segments
 * read as separate pieces rather than a single pie.
 */
function slice(i: number, n: number) {
  const span = 360 / n;
  const start = i * span + GAP / 2;
  const end = (i + 1) * span - GAP / 2;
  const mid = (start + end) / 2;

  const [ox, oy] = polar(0, 0, EXPLODE, mid);
  const cx = CX + ox, cy = CY + oy;

  const [x1, y1] = polar(cx, cy, R_OUT, start);
  const [x2, y2] = polar(cx, cy, R_OUT, end);
  const [x3, y3] = polar(cx, cy, R_IN, end);
  const [x4, y4] = polar(cx, cy, R_IN, start);
  const large = end - start > 180 ? 1 : 0;

  return {
    d: `M ${x1} ${y1} A ${R_OUT} ${R_OUT} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${R_IN} ${R_IN} 0 ${large} 0 ${x4} ${y4} Z`,
    label: polar(cx, cy, (R_IN + R_OUT) / 2, mid),
  };
}

/** Walks the brand palette so the slices read as one family, not a rainbow. */
function sliceFill(i: number, n: number): string {
  const t = n > 1 ? i / (n - 1) : 0;
  const pct = Math.round(t * 100);
  return `color-mix(in srgb, var(--ds-grad-to) ${pct}%, var(--ds-accent) ${100 - pct}%)`;
}

function ValuePropWheel({ pillars }: { pillars: { title?: string; description?: string }[] }) {
  const n = pillars.length;
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[300px_1fr] items-center">
      <svg
        viewBox="0 0 300 300"
        className="w-full max-w-[300px] mx-auto"
        role="img"
        aria-label="Value proposition pillars"
      >
        {pillars.map((p, i) => {
          const sg = slice(i, n);
          const on = active === null || active === i;
          return (
            <g
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className="cursor-default transition-opacity"
              style={{ opacity: on ? 1 : 0.35 }}
            >
              <path d={sg.d} fill={sliceFill(i, n)} />
              <text
                x={sg.label[0]}
                y={sg.label[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white font-bold"
                style={{ fontSize: n > 4 ? 11 : 13 }}
              >
                {i + 1}
              </text>
            </g>
          );
        })}

        {/* The hub. Deliberately empty: the pillars are the content, and a
            label here would compete with them. */}
        <circle cx={CX} cy={CY} r={R_IN - 12} fill="white" />
        <circle
          cx={CX} cy={CY} r={R_IN - 12}
          fill="none"
          stroke="var(--ds-accent-tint)"
          strokeWidth="2"
        />
      </svg>

      <div className="space-y-3">
        {pillars.map((p, i) => {
          const on = active === null || active === i;
          return (
            <div
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className="flex gap-3 rounded-xl p-3 transition"
              style={{
                opacity: on ? 1 : 0.45,
                background: active === i ? 'var(--ds-accent-tint)' : 'transparent',
              }}
            >
              <span
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: sliceFill(i, n) }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                {p.title && (
                  <p className="text-sm font-bold text-[#191f1d] leading-snug">{p.title}</p>
                )}
                {p.description && (
                  <p className="text-sm text-[#7f8c85] leading-relaxed mt-0.5">
                    {p.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
