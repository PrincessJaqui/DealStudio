/**
 * ValuePropEditor — the admin side of the Value Proposition section.
 * Saves on change, like the other section editors.
 */

import { Plus, Trash2, GripVertical } from 'lucide-react';
import { EMPTY_VALUE_PROP, newId, type DealValueProp, type DealValuePillar, type ProblemSolution } from '../../lib/dealStudio';

const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';
const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';

export function ValuePropEditor({
  value,
  onChange,
}: {
  value: DealValueProp | null;
  onChange: (next: DealValueProp) => void;
}) {
  const v: DealValueProp = { ...EMPTY_VALUE_PROP, ...(value ?? {}) };
  const pillars: DealValuePillar[] = Array.isArray(v.pillars) ? v.pillars : [];

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
    set({ pairs: [...pairs, { id: newId('ps'), problem: '', solution: '' }] });

  const removePair = (id: string) =>
    set({ pairs: pairs.filter(p => p.id !== id) });

  const set = (patch: Partial<DealValueProp>) => onChange({ ...v, ...patch });

  const setPillar = (i: number, patch: Partial<DealValuePillar>) => {
    const next = pillars.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    set({ pillars: next });
  };

  const addPillar = () =>
    set({ pillars: [...pillars, { title: '', description: '' }] });

  const removePillar = (i: number) =>
    set({ pillars: pillars.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className={labelCls}>Problem and solution</p>
        <p className="text-xs text-[#9ca3af] mt-1 mb-2">
          A statement to open with, then each specific problem paired with what you do about it.
          Investors read the pairs, so keep each one concrete.
        </p>
        <textarea
          className={`${input} min-h-[80px] resize-y`}
          value={v.statement ?? ''}
          onChange={(e) => set({ statement: e.target.value })}
          placeholder="The statement that opens this section."
        />

        <div className="mt-4 space-y-3">
          {pairs.map((pr, i) => (
            <div key={pr.id} className="rounded-2xl bg-[#f5f6f8] border border-[#edf0f3] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--ds-accent-ink)]">
                  Pair {i + 1}
                </span>
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
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#9ca3af] mb-1">
                    Problem
                  </label>
                  <textarea
                    className={`${input} min-h-[88px] resize-y bg-white`}
                    value={pr.problem}
                    onChange={(e) => setPair(pr.id, { problem: e.target.value })}
                    placeholder="What is broken, and who feels it."
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-1">
                    Solution
                  </label>
                  <textarea
                    className={`${input} min-h-[88px] resize-y bg-white`}
                    value={pr.solution}
                    onChange={(e) => setPair(pr.id, { solution: e.target.value })}
                    placeholder="What you do about it, in plain language."
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addPair}
          className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
        >
          <Plus className="w-4 h-4" /> Add problem and solution
        </button>
      </div>

      <div className={card}>
        <div className="flex items-center gap-3 mb-1">
          <div>
            <p className={labelCls}>Why you</p>
            <p className="text-xs text-[#9ca3af] mt-1">
              Two or three reasons this is defensible. Vague claims read as filler.
            </p>
          </div>
          <button
            onClick={addPillar}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {pillars.length === 0 ? (
          <p className="text-sm text-[#9ca3af] py-4 text-center">
            No reasons added yet.
          </p>
        ) : (
          <div className="space-y-3 mt-3">
            {pillars.map((p, i) => (
              <div
                key={i}
                className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3"
              >
                <div className="flex items-center gap-2 mb-2">
                  <GripVertical className="w-4 h-4 text-[#c7cdd4] shrink-0" />
                  <input
                    className="flex-1 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                    value={p.title}
                    onChange={(e) => setPillar(i, { title: e.target.value })}
                    placeholder="Reason"
                  />
                  <button
                    onClick={() => removePillar(i)}
                    aria-label="Remove"
                    className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  className="w-full bg-white rounded-lg px-3 py-2 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30 min-h-[64px] resize-y"
                  value={p.description}
                  onChange={(e) => setPillar(i, { description: e.target.value })}
                  placeholder="Why it holds up. Evidence beats adjectives."
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
