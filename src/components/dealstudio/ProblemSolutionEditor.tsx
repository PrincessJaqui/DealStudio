/**
 * ProblemSolutionEditor — the specific problems, each paired with the thing you
 * do about it.
 *
 * Split out of the value proposition because they are different arguments. The
 * pillars say why you win; these say what is broken and what you did.
 */

import { Trash2 } from 'lucide-react';
import { SectionHeader, AddButton } from './SectionHeader';
import {
  EMPTY_VALUE_PROP, newId,
  type DealValueProp, type ProblemSolution,
} from '../../lib/dealStudio';

const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';
const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';

export function ProblemSolutionEditor({
  value,
  onChange,
}: {
  value: DealValueProp | null;
  onChange: (next: DealValueProp) => void;
}) {
  const v: DealValueProp = { ...EMPTY_VALUE_PROP, ...(value ?? {}) };
  const set = (patch: Partial<DealValueProp>) => onChange({ ...v, ...patch });

  // Fold any legacy single problem/solution into the first pair, so a deal that
  // already had text does not appear to have lost it.
  const pairs: ProblemSolution[] =
    Array.isArray(v.pairs) && v.pairs.length
      ? v.pairs
      : (v.problem || v.solution)
        ? [{ id: newId('ps'), problem: v.problem, solution: v.solution }]
        : [];

  const setPair = (id: string, patch: Partial<ProblemSolution>) =>
    set({ pairs: pairs.map(p => (p.id === id ? { ...p, ...patch } : p)) });

  const addPair = () =>
    set({ pairs: [...pairs, { id: newId('ps'), problem_title: '', problem: '', solution_title: '', solution: '' }] });

  const removePair = (id: string) =>
    set({ pairs: pairs.filter(p => p.id !== id) });

  return (
    <div className="space-y-4">
      {/* Header container: the title, the add button, and the statement, which is
          the one field that belongs to the SECTION rather than to any one pair.
          Every pair below gets its own container, like Team and Value Prop. */}
      <SectionHeader
        title="Problem and Solution"
        summary="A statement to open with, then each problem paired with what you do about it."
        action={<AddButton label="Pair" onClick={addPair} />}
      >
        <label className={labelCls}>Opening statement</label>
        <textarea
          className={`${input} mt-1 min-h-[80px] resize-y`}
          value={v.statement ?? ''}
          onChange={(e) => set({ statement: e.target.value })}
          placeholder="The statement that opens this section."
        />
        <p className="mt-2 text-xs text-[#99a1af]">
          The short titles are all an investor sees until they tap to expand, so make them
          carry the point on their own.
        </p>
      </SectionHeader>

      {pairs.length === 0 ? (
        <div className={card}>
          <p className="text-sm text-[#99a1af]">No pairs yet. Add the first problem you solve.</p>
        </div>
      ) : (
        pairs.map((pr, i) => (
          <div key={pr.id} className={card}>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-bold text-[#191f1d]">Pair {i + 1}</h4>
              <button
                onClick={() => removePair(pr.id)}
                aria-label="Remove pair"
                className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className={labelCls}>Problem</label>
                <input
                  className={`${input} mt-1 mb-2 font-semibold`}
                  value={pr.problem_title ?? ''}
                  onChange={(e) => setPair(pr.id, { problem_title: e.target.value })}
                  placeholder="Short title, e.g. Fragmented assets"
                />
                <textarea
                  className={`${input} min-h-[88px] resize-y`}
                  value={pr.problem}
                  onChange={(e) => setPair(pr.id, { problem: e.target.value })}
                  placeholder="What is broken, and who feels it."
                />
              </div>
              <div>
                <label className={labelCls}>Solution</label>
                <input
                  className={`${input} mt-1 mb-2 font-semibold`}
                  value={pr.solution_title ?? ''}
                  onChange={(e) => setPair(pr.id, { solution_title: e.target.value })}
                  placeholder="Short title, e.g. Central deal hub"
                />
                <textarea
                  className={`${input} min-h-[88px] resize-y`}
                  value={pr.solution}
                  onChange={(e) => setPair(pr.id, { solution: e.target.value })}
                  placeholder="What you do about it, in plain language."
                />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
