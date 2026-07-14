/**
 * ValuePropEditor: the admin side of the Value Proposition section.
 * Saves on change, like the other section editors.
 *
 * Header card on top, then one container per reason. Reasons used to be gray
 * sub-boxes stacked inside the header card, which is the one shape this product
 * does not use anywhere else.
 */

import { Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { EMPTY_VALUE_PROP, type DealValueProp, type DealValuePillar } from '../../lib/dealStudio';
import { SectionHeader, AddButton } from './SectionHeader';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';

export function ValuePropEditor({
  value,
  onChange,
}: {
  value: DealValueProp | null;
  onChange: (next: DealValueProp) => void;
}) {
  const v: DealValueProp = { ...EMPTY_VALUE_PROP, ...(value ?? {}) };
  const pillars: DealValuePillar[] = Array.isArray(v.pillars) ? v.pillars : [];

  const set = (patch: Partial<DealValueProp>) => onChange({ ...v, ...patch });

  const setPillar = (i: number, patch: Partial<DealValuePillar>) => {
    const next = pillars.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    set({ pillars: next });
  };

  const addPillar = () => set({ pillars: [...pillars, { title: '', description: '' }] });

  const removePillar = (i: number) => set({ pillars: pillars.filter((_, idx) => idx !== i) });

  /** The order here is the order investors read. Drag needed a library; two
   *  buttons need nothing, and match the Team tab. */
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= pillars.length) return;
    const next = pillars.slice();
    [next[i], next[j]] = [next[j], next[i]];
    set({ pillars: next });
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Value Proposition"
        summary="Two or three reasons this is defensible. Vague claims read as filler."
        action={<AddButton label="Reason" onClick={addPillar} />}
      />

      {pillars.length === 0 ? (
        <div className={card}>
          <p className="text-sm text-[#99a1af]">No reasons yet. Add the first one investors should remember.</p>
        </div>
      ) : (
        pillars.map((p, i) => (
          <div key={i} className={card}>
            <div className="flex items-center justify-between mb-3">
              <span className={labelCls}>Reason {i + 1}</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="rounded-lg p-2 text-[#99a1af] hover:bg-[#f5f7f9] disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === pillars.length - 1}
                  className="rounded-lg p-2 text-[#99a1af] hover:bg-[#f5f7f9] disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" onClick={() => removePillar(i)}
                  className="rounded-lg p-2 text-[#99a1af] hover:bg-[#fef2f2] hover:text-[#dc2626]" aria-label="Remove reason"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="grid gap-3">
              <div>
                <label className={labelCls}>Reason</label>
                <input
                  className="w-full mt-1 rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm font-semibold text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                  value={p.title}
                  onChange={(e) => setPillar(i, { title: e.target.value })}
                  placeholder="Why this is defensible"
                />
              </div>
              <div>
                <label className={labelCls}>Evidence</label>
                <textarea
                  className="w-full mt-1 min-h-[80px] resize-y rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                  value={p.description}
                  onChange={(e) => setPillar(i, { description: e.target.value })}
                  placeholder="Why it holds up. Evidence beats adjectives."
                />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
