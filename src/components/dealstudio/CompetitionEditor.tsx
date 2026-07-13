/**
 * CompetitionEditor — the comparison card.
 *
 * Everything is edited in place: click a label and type, click a cell to flip it
 * between yes and no. There is no separate form, because the grid IS the form.
 *
 * Your own column is pinned first and filled with the brand gradient. The whole
 * point of the card is the contrast against it, so it should not be possible to
 * lose track of which column is yours.
 */

import { useRef, useState } from 'react';
import { Plus, Trash2, Check, X, Pencil, Upload, Loader2 } from 'lucide-react';
import {
  EMPTY_COMPETITION, newId,
  type DealCompetition, type DealCompetitor, type CompFeature,
} from '../../lib/dealStudio';
import { uploadOrgLogo } from '../../lib/org';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)]';
const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';

export function CompetitionEditor({
  orgId,
  value,
  onChange,
}: {
  orgId?: string;
  value: DealCompetition | null;
  onChange: (next: DealCompetition) => void;
}) {
  const v: DealCompetition = { ...EMPTY_COMPETITION, ...(value ?? {}) };
  const features: CompFeature[] = Array.isArray(v.features) ? v.features : [];
  const rivals: DealCompetitor[] = Array.isArray(v.competitors) ? v.competitors : [];
  const [uploading, setUploading] = useState('');
  const nameRef = useRef<Record<string, HTMLInputElement | null>>({});

  const set = (patch: Partial<DealCompetition>) => onChange({ ...v, ...patch });

  // Your column first. Everything else keeps the order it was added in.
  const cols = [...rivals].sort((a, b) => Number(!!b.is_you) - Number(!!a.is_you));

  /* ── rows ── */
  const addFeature = () =>
    set({ features: [...features, { id: newId('f'), label: '' }] });

  const setFeature = (id: string, label: string) =>
    set({ features: features.map(f => (f.id === id ? { ...f, label } : f)) });

  const removeFeature = (id: string) =>
    set({
      features: features.filter(f => f.id !== id),
      competitors: rivals.map(c => {
        const marks = { ...c.marks };
        delete marks[id];   // do not leave orphan marks behind
        return { ...c, marks };
      }),
    });

  /* ── columns ── */
  const addRival = () => {
    // The first column added is you, since a grid with no "you" has no point.
    const isFirst = rivals.length === 0;
    const id = newId('c');
    set({
      competitors: [
        ...rivals,
        { id, name: '', segment: '', weakness: '', marks: {}, is_you: isFirst },
      ],
    });
    setTimeout(() => nameRef.current[id]?.focus(), 40);
  };

  const setRival = (id: string, patch: Partial<DealCompetitor>) =>
    set({ competitors: rivals.map(c => (c.id === id ? { ...c, ...patch } : c)) });

  const removeRival = (id: string) =>
    set({ competitors: rivals.filter(c => c.id !== id) });

  const markAsYou = (id: string) =>
    set({ competitors: rivals.map(c => ({ ...c, is_you: c.id === id })) });

  const toggleMark = (rivalId: string, featureId: string) => {
    const c = rivals.find(r => r.id === rivalId);
    if (!c) return;
    setRival(rivalId, { marks: { ...c.marks, [featureId]: !c.marks?.[featureId] } });
  };

  const pickLogo = async (rivalId: string, file?: File) => {
    if (!file || !orgId) return;
    setUploading(rivalId);
    try {
      setRival(rivalId, { logo: await uploadOrgLogo(orgId, file) });
    } catch {
      /* a failed logo must never block the grid */
    } finally {
      setUploading('');
    }
  };

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <p className={labelCls}>Landscape</p>
        <textarea
          className={`${input} mt-2 min-h-[80px] resize-y`}
          value={v.overview}
          onChange={(e) => set({ overview: e.target.value })}
          placeholder="How the market is served today, in a sentence or two."
        />
      </div>

      {/* ── The comparison card ── */}
      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-3 p-5 pb-4">
          <div className="min-w-0">
            <h3 className="font-bold text-[#191f1d]">Competitive Analysis</h3>
            <p className="text-sm text-[#7f8c85]">
              Click any label to edit. Click a cell to switch it on or off.
            </p>
          </div>
          <button
            onClick={addRival}
            className="ml-auto shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
          >
            <Plus className="w-4 h-4" /> Add New Competitor
          </button>
        </div>

        {cols.length === 0 ? (
          <div className="px-5 pb-8 pt-2 text-center">
            <p className="text-sm text-[#9ca3af]">
              Add a competitor to start. The first one you add is you.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="w-[220px] min-w-[190px] bg-[#f8f9fb] border-b border-[#edf0f3]" />

                  {cols.map(c => (
                    <th
                      key={c.id}
                      className={`min-w-[170px] p-4 align-top border-b border-[#edf0f3] ${
                        c.is_you
                          ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]'
                          : 'bg-[#f8f9fb]'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1">
                        {/* The logo is optional. The circle is the upload target. */}
                        <label
                          title="Upload logo"
                          className={`h-7 w-7 shrink-0 rounded-full overflow-hidden flex items-center justify-center cursor-pointer ${
                            c.is_you ? 'bg-white/20' : 'bg-white border border-[#edf0f3]'
                          }`}
                        >
                          {uploading === c.id ? (
                            <Loader2 className={`w-3 h-3 animate-spin ${c.is_you ? 'text-white' : 'text-[#9ca3af]'}`} />
                          ) : c.logo ? (
                            <img src={c.logo} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Upload className={`w-3 h-3 ${c.is_you ? 'text-white/70' : 'text-[#c7cdd4]'}`} />
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => { void pickLogo(c.id, e.target.files?.[0]); e.currentTarget.value = ''; }}
                          />
                        </label>

                        <input
                          ref={(el) => { nameRef.current[c.id] = el; }}
                          value={c.name}
                          onChange={(e) => setRival(c.id, { name: e.target.value })}
                          placeholder="Competitor"
                          className={`min-w-0 flex-1 bg-transparent text-center text-[15px] font-bold outline-none rounded-lg px-1 py-0.5 ${
                            c.is_you
                              ? 'text-white placeholder:text-white/50 focus:bg-white/15'
                              : 'text-[#191f1d] placeholder:text-[#c7cdd4] focus:bg-white'
                          }`}
                        />

                        {!c.is_you && (
                          <button
                            onClick={() => removeRival(c.id)}
                            aria-label="Remove competitor"
                            className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[#c7cdd4] hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <input
                        value={c.url ?? ''}
                        onChange={(e) => setRival(c.id, { url: e.target.value.trim() })}
                        placeholder="www.website.com"
                        className={`w-full mt-2 rounded-lg px-2 py-1.5 text-xs text-center outline-none ${
                          c.is_you
                            ? 'bg-transparent text-white/90 placeholder:text-white/50 focus:bg-white/15'
                            : 'bg-white border border-[#edf0f3] text-[#191f1d] placeholder:text-[#c7cdd4]'
                        }`}
                      />

                      {!c.is_you && (
                        <button
                          onClick={() => markAsYou(c.id)}
                          className="mt-1.5 w-full text-[11px] font-semibold text-[#9ca3af] hover:text-[var(--ds-accent-ink)]"
                        >
                          This is us
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {features.map((f, i) => (
                  <tr key={f.id} className={i % 2 ? 'bg-[#f8f9fb]' : 'bg-white'}>
                    <td className="p-3 pl-5 border-b border-[#f2f4f6]">
                      <div className="group flex items-center gap-1">
                        <input
                          value={f.label}
                          onChange={(e) => setFeature(f.id, e.target.value)}
                          placeholder={`Feature ${i + 1}`}
                          className="min-w-0 flex-1 bg-transparent text-sm font-medium text-[#191f1d] placeholder:text-[#c7cdd4] outline-none rounded-lg px-1.5 py-1 focus:bg-white focus:ring-2 focus:ring-[var(--ds-brand)]/25"
                        />
                        <Pencil className="w-3.5 h-3.5 shrink-0 text-[#c7cdd4]" />
                        <button
                          onClick={() => removeFeature(f.id)}
                          aria-label="Remove feature"
                          className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-transparent group-hover:text-[#c7cdd4] hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {cols.map(c => {
                      const on = !!c.marks?.[f.id];
                      return (
                        <td
                          key={c.id}
                          className={`p-3 text-center border-b border-[#f2f4f6] ${
                            c.is_you ? 'bg-[var(--ds-accent-tint)]' : ''
                          }`}
                        >
                          <button
                            onClick={() => toggleMark(c.id, f.id)}
                            aria-label={on ? 'Yes' : 'No'}
                            title={on ? 'Yes. Click to switch off.' : 'No. Click to switch on.'}
                            className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition hover:scale-110 ${
                              on
                                ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white shadow-sm'
                                : 'bg-[#fdeaea] text-[#e05252]'
                            }`}
                          >
                            {on ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            <button
              onClick={addFeature}
              className="inline-flex items-center gap-1.5 m-4 text-sm font-semibold text-[var(--ds-brand)] hover:underline"
            >
              <Plus className="w-4 h-4" /> Add more features
            </button>
          </div>
        )}
      </div>

      <div className={`${card} p-5`}>
        <p className={labelCls}>Your edge</p>
        <p className="text-xs text-[#9ca3af] mt-1 mb-2">
          Why you win, stated plainly. Investors discount claims they cannot check.
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
