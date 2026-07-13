/**
 * Investor-facing Value Proposition and Competition.
 *
 * Both render nothing when the founder left them empty, so a half-filled room
 * never shows a hollow heading.
 */

import { useState } from 'react';
import { Check, X, ExternalLink, ArrowRight, ChevronDown } from 'lucide-react';
import { useInViewOnce } from '../../lib/useInViewOnce';
import { psHeader } from '../../lib/dealStudio';
import type { DealValueProp, DealCompetition, ProblemSolution } from '../../lib/dealStudio';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]';



/* ── Value Proposition ─────────────────────────────────────────────────────── */

export function ValuePropSection({ value }: { value: DealValueProp }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();

  const pillars = (value.pillars ?? []).filter(p => p.title || p.description);
  if (!pillars.length) return null;

  return (
    <div ref={ref} data-section="valueprop" className={`${card} p-5 ${inView ? 'ds-animate' : ''}`}>
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Value Proposition</h2>
      <ValuePropWheel pillars={pillars} inView={inView} />
    </div>
  );
}

/* ── Problem and Solution ──────────────────────────────────────────────────── */

export function ProblemSolutionSection({ value }: { value: DealValueProp }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [open, setOpen] = useState<string | null>(null);

  const pairs = (value.pairs ?? []).filter(p => p.problem || p.solution || p.problem_title);
  const legacy = !pairs.length && (value.problem || value.solution)
    ? [{ id: 'legacy', problem: value.problem, solution: value.solution }]
    : [];
  const rows: ProblemSolution[] = pairs.length ? pairs : legacy;

  if (!rows.length && !value.statement) return null;

  return (
    <div ref={ref} data-section="problem" className={`${card} p-5 ${inView ? 'ds-animate' : ''}`}>
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Problem and Solution</h2>

      {value.statement && (
        <p className="text-sm leading-relaxed text-[#4b5563] mb-4 whitespace-pre-line">
          {value.statement}
        </p>
      )}

      {/* Collapsed to titles. An investor scans the pairs, then opens the one
          that matters to them. Showing every body at once buried the argument
          in text nobody read. */}
      <div className="space-y-2">
        {rows.map((p, i) => {
          const isOpen = open === (p.id || String(i));
          const key = p.id || String(i);

          return (
            <div
              key={key}
              className="ds-card rounded-2xl border border-[#edf0f3] bg-white overflow-hidden"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : key)}
                aria-expanded={isOpen}
                className="w-full grid gap-2 md:grid-cols-[1fr_auto_1fr] items-center p-3 text-left hover:bg-[#fafbfc] transition-colors"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#9ca3af] shrink-0">
                    Problem
                  </span>
                  <span className="text-sm font-semibold text-[#191f1d] truncate">
                    {psHeader(p.problem, p.problem_title)}
                  </span>
                </span>

                <span className="hidden md:flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white shrink-0">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>

                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ds-accent-ink)] shrink-0">
                    Solution
                  </span>
                  <span className="text-sm font-semibold text-[#191f1d] truncate">
                    {psHeader(p.solution, p.solution_title)}
                  </span>
                  <ChevronDown
                    className={`ml-auto w-4 h-4 shrink-0 text-[#c7cdd4] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>

              {isOpen && (
                <div className="grid gap-3 md:grid-cols-2 px-3 pb-3">
                  <div className="rounded-xl bg-[#f8f9fb] p-3.5">
                    <p className="text-sm leading-relaxed text-[#4b5563] whitespace-pre-line">
                      {p.problem}
                    </p>
                  </div>
                  <div className="rounded-xl bg-[var(--ds-tint)] p-3.5">
                    <p className="text-sm leading-relaxed text-[#4b5563] whitespace-pre-line">
                      {p.solution}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
                    <th
                      key={c.id}
                      className={`text-center min-w-[130px] px-3 py-3 rounded-t-2xl align-bottom ${
                        c.is_you
                          ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]'
                          : 'bg-[#f1f3f7]'
                      }`}
                    >
                      <div>
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
                          className="p-3 text-center align-middle"
                        >
                          <span
                            className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                              on
                                ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                                : 'text-[var(--ds-brand)] opacity-40'
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

const CX = 150, CY = 150, R_IN = 52, R_OUT = 138, GAP = 3, EXPLODE = 5;
/** Where a selected wedge comes to rest: top-right, with its card beside it. */
const TARGET = 45;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function midOf(i: number, n: number): number {
  const span = 360 / n;
  return (i * span + GAP / 2 + ((i + 1) * span - GAP / 2)) / 2;
}

function slice(i: number, n: number) {
  const span = 360 / n;
  const start = i * span + GAP / 2;
  const end = (i + 1) * span - GAP / 2;
  const mid = midOf(i, n);

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
    mid,
  };
}

/** Shortest way round, so the wheel never spins the long way for no reason. */
function rotationFor(i: number, n: number): number {
  let r = TARGET - midOf(i, n);
  while (r > 180) r -= 360;
  while (r < -180) r += 360;
  return r;
}

/** Walks the brand palette, so the wedges read as one family and not a rainbow. */
function sliceFill(i: number, n: number): string {
  const t = n > 1 ? i / (n - 1) : 0;
  const pct = Math.round(t * 100);
  return `color-mix(in srgb, var(--ds-grad-to) ${pct}%, var(--ds-accent) ${100 - pct}%)`;
}

/** SVG has no text wrapping, so titles are split by hand. */
function wrap(text: string, perLine = 12, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if ((cur + ' ' + w).length <= perLine) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{1}$/, '\u2026');
  }
  return lines;
}

function ValuePropWheel({
  pillars,
  inView,
}: {
  pillars: { title?: string; description?: string }[];
  inView: boolean;
}) {
  const n = pillars.length;
  const [sel, setSel] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  // With nothing picked the wheel sits where it was built. Picking one spins it
  // so that wedge lands top-right, next to its card.
  const rot = sel === null ? 0 : rotationFor(sel, n);
  const active = sel === null ? null : pillars[sel];

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr] items-center">
      <svg
        viewBox="0 0 300 300"
        className="w-full max-w-[320px] mx-auto overflow-visible"
        role="img"
        aria-label="Value proposition pillars"
      >
        <g
          style={{
            transform: inView ? `rotate(${rot}deg) scale(1)` : 'rotate(-25deg) scale(0.86)',
            opacity: inView ? 1 : 0,
            transformOrigin: '150px 150px',
            transition: 'transform 700ms cubic-bezier(0.34, 1.2, 0.64, 1), opacity 500ms ease-out',
          }}
        >
          {pillars.map((p, i) => {
            const sg = slice(i, n);
            const dim = sel !== null && sel !== i;
            const lifted = hover === i || sel === i;
            const lines = wrap(p.title || `Pillar ${i + 1}`, n > 4 ? 10 : 12);

            // Hovering pushes the wedge a little further out along its own
            // bisector, so it lifts away from the wheel rather than just
            // changing colour.
            const [hx, hy] = polar(0, 0, lifted ? 6 : 0, sg.mid);

            return (
              <g
                key={i}
                onClick={() => setSel(sel === i ? null : i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                /* Pulses until something is picked, so an investor knows the
                   wedges are live. Once they have clicked, the cue has done its
                   job and it stops. */
                className={`cursor-pointer ${sel === null && hover === null ? 'ds-wedge-pulse' : ''}`}
                style={{ animationDelay: `${i * 180}ms` }}
                style={{
                  opacity: dim ? 0.4 : 1,
                  transform: `translate(${hx}px, ${hy}px)`,
                  filter: lifted ? 'drop-shadow(0 6px 14px rgba(12,16,34,0.28))' : 'none',
                  transition: 'opacity 300ms, transform 250ms ease-out, filter 250ms',
                }}
              >
                <path d={sg.d} fill={sliceFill(i, n)} />

                {/* Counter-rotate, or the labels turn upside down as it spins. */}
                <g
                  style={{
                    transform: `rotate(${-rot}deg)`,
                    transformOrigin: `${sg.label[0]}px ${sg.label[1]}px`,
                    transition: 'transform 600ms cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  <text
                    x={sg.label[0]}
                    y={sg.label[1]}
                    textAnchor="middle"
                    className="fill-white font-bold pointer-events-none"
                    style={{ fontSize: n > 4 ? 8.5 : 9.5 }}
                  >
                    {lines.map((ln, k) => (
                      <tspan
                        key={k}
                        x={sg.label[0]}
                        dy={k === 0 ? -((lines.length - 1) * 5) : 10}
                      >
                        {ln}
                      </tspan>
                    ))}
                  </text>
                </g>
              </g>
            );
          })}
        </g>

        {/* The hub sits outside the rotating group so it never spins. */}
        <defs>
          <linearGradient id="ds-hub" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--ds-grad-from)" />
            <stop offset="100%" stopColor="var(--ds-grad-to)" />
          </linearGradient>
        </defs>

        <circle cx={CX} cy={CY} r={R_IN - 6} fill="white" />
        <circle cx={CX} cy={CY} r={R_IN - 9} fill="url(#ds-hub)" />

        {sel === null ? (
          <>
            <text
              x={CX} y={CY - 6}
              textAnchor="middle" dominantBaseline="middle"
              className="fill-white font-bold"
              style={{ fontSize: 9.5 }}
            >
              Click wedges
            </text>
            <text
              x={CX} y={CY + 6}
              textAnchor="middle" dominantBaseline="middle"
              className="fill-white/80 font-semibold"
              style={{ fontSize: 9.5 }}
            >
              to explore
            </text>
          </>
        ) : (
          <text
            x={CX} y={CY}
            textAnchor="middle" dominantBaseline="middle"
            className="fill-white font-bold"
            style={{ fontSize: 11 }}
          >
            {sel + 1} of {n}
          </text>
        )}
      </svg>

      {/* The card for whatever is selected. */}
      <div>
        {active ? (
          <div className="ds-card rounded-2xl border border-[#edf0f3] bg-white p-5 shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]">
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: sliceFill(sel!, n) }}
              >
                {sel! + 1}
              </span>
              <div className="min-w-0">
                {active.title && (
                  <h4 className="text-base font-bold text-[#191f1d] leading-snug">
                    {active.title}
                  </h4>
                )}
                {active.description && (
                  <p className="text-sm text-[#7f8c85] leading-relaxed mt-1.5">
                    {active.description}
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={() => setSel(null)}
              className="mt-4 text-xs font-semibold text-[var(--ds-accent-ink)] hover:underline"
            >
              Show all
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {pillars.map((p, i) => (
              <button
                key={i}
                onClick={() => setSel(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ animationDelay: `${i * 70}ms` }}
                className="ds-card w-full flex items-center gap-3 rounded-xl border border-[#edf0f3] bg-white px-4 py-3 text-left hover:border-[var(--ds-accent)]"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: sliceFill(i, n) }}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 text-sm font-semibold text-[#191f1d] truncate">
                  {p.title || `Pillar ${i + 1}`}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
