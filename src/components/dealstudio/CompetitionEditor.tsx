/**
 * CompetitionEditor — the admin side of the Competition section.
 *
 * The "status quo" prompt is deliberate: a competitive table that omits
 * spreadsheets, or doing nothing, tends to read as naive to investors.
 */

import { Plus, Trash2 } from 'lucide-react';
import { EMPTY_COMPETITION, type DealCompetition, type DealCompetitor } from '../../lib/dealStudio';

const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';
const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';

export function CompetitionEditor({
  value,
  onChange,
}: {
  value: DealCompetition | null;
  onChange: (next: DealCompetition) => void;
}) {
  const v: DealCompetition = { ...EMPTY_COMPETITION, ...(value ?? {}) };
  const rows: DealCompetitor[] = Array.isArray(v.competitors) ? v.competitors : [];

  const set = (patch: Partial<DealCompetition>) => onChange({ ...v, ...patch });

  const setRow = (i: number, patch: Partial<DealCompetitor>) =>
    set({ competitors: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });

  const addRow = () =>
    set({ competitors: [...rows, { name: '', segment: '', weakness: '' }] });

  const removeRow = (i: number) =>
    set({ competitors: rows.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-4">
      <div className={card}>
        <p className={labelCls}>Landscape</p>
        <textarea
          className={`${input} mt-2 min-h-[80px] resize-y`}
          value={v.overview}
          onChange={(e) => set({ overview: e.target.value })}
          placeholder="How the market is served today, in a sentence or two."
        />
      </div>

      <div className={card}>
        <div className="flex items-center gap-3">
          <div>
            <p className={labelCls}>Competitors</p>
            <p className="text-xs text-[#9ca3af] mt-1">
              Include the status quo (spreadsheets, doing nothing). Leaving it out reads as naive.
            </p>
          </div>
          <button
            onClick={addRow}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
          >
            <Plus className="w-4 h-4" /> Add
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-[#9ca3af] py-4 text-center">No competitors added yet.</p>
        ) : (
          <div className="space-y-3 mt-4">
            {rows.map((r, i) => (
              <div key={i} className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                    value={r.name}
                    onChange={(e) => setRow(i, { name: e.target.value })}
                    placeholder="Who"
                  />
                  <input
                    className="w-40 bg-white rounded-lg px-3 py-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                    value={r.segment}
                    onChange={(e) => setRow(i, { segment: e.target.value })}
                    placeholder="Segment"
                  />
                  <button
                    onClick={() => removeRow(i)}
                    aria-label="Remove"
                    className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <input
                  className="w-full mt-2 bg-white rounded-lg px-3 py-2 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                  value={r.weakness}
                  onChange={(e) => setRow(i, { weakness: e.target.value })}
                  placeholder="The gap you work in"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={card}>
        <p className={labelCls}>Your edge</p>
        <p className="text-xs text-[#9ca3af] mt-1 mb-2">
          Why you win, stated plainly. Investors discount claims that cannot be checked.
        </p>
        <textarea
          className={`${input} min-h-[80px] resize-y`}
          value={v.edge}
          onChange={(e) => set({ edge: e.target.value })}
          placeholder="What you do that the players above structurally cannot."
        />
      </div>
    </div>
  );
}
