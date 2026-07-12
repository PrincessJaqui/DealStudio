/**
 * CompetitionEditor — builds the comparison grid investors actually read.
 *
 * Rows are the things being compared on; columns are the players. Exactly one
 * column can be marked as "you", and it is pinned first and highlighted, since
 * the entire point of the grid is the contrast against your own column.
 *
 * The status-quo prompt is deliberate. A competitive grid that omits
 * spreadsheets, or doing nothing, reads as naive to anyone who has sat on the
 * other side of the table.
 */

import { useRef, useState } from 'react';
import { Plus, Trash2, Check, X, Upload, Loader2, Star } from 'lucide-react';
import {
  EMPTY_COMPETITION, newId,
  type DealCompetition, type DealCompetitor, type CompFeature,
} from '../../lib/dealStudio';
import { uploadOrgLogo } from '../../lib/org';

const input =
  'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';
const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';

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
  const fileFor = useRef<string>('');

  const set = (patch: Partial<DealCompetition>) => onChange({ ...v, ...patch });

  /* ── features (rows) ── */
  const addFeature = () =>
    set({ features: [...features, { id: newId('f'), label: '' }] });

  const setFeature = (id: string, label: string) =>
    set({ features: features.map(f => (f.id === id ? { ...f, label } : f)) });

  const removeFeature = (id: string) =>
    set({
      features: features.filter(f => f.id !== id),
      // Drop the marks for that row so they cannot linger as orphans.
      competitors: rivals.map(c => {
        const marks = { ...c.marks };
        delete marks[id];
        return { ...c, marks };
      }),
    });

  /* ── competitors (columns) ── */
  const addRival = (isYou = false) =>
    set({
      competitors: [
        ...rivals,
        { id: newId('c'), name: isYou ? '' : '', segment: '', weakness: '', marks: {}, is_you: isYou },
      ],
    });

  const setRival = (id: string, patch: Partial<DealCompetitor>) =>
    set({ competitors: rivals.map(c => (c.id === id ? { ...c, ...patch } : c)) });

  const removeRival = (id: string) =>
    set({ competitors: rivals.filter(c => c.id !== id) });

  /** Only one column can be "you". */
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
      const url = await uploadOrgLogo(orgId, file);
      setRival(rivalId, { logo: url });
    } catch {
      /* a failed logo must not block the grid */
    } finally {
      setUploading('');
    }
  };

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

      {/* ── The grid ── */}
      <div className={card}>
        <div className="flex items-center gap-3 mb-1">
          <div>
            <p className={labelCls}>Comparison grid</p>
            <p className="text-xs text-[#9ca3af] mt-1">
              Rows are what you compete on. Columns are the players. Include the status quo
              (spreadsheets, doing nothing): leaving it out reads as naive.
            </p>
          </div>
          <div className="ml-auto flex gap-2">
            <button
              onClick={addFeature}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
            >
              <Plus className="w-4 h-4" /> Row
            </button>
            <button
              onClick={() => addRival(rivals.length === 0)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
            >
              <Plus className="w-4 h-4" /> Player
            </button>
          </div>
        </div>

        {rivals.length === 0 || features.length === 0 ? (
          <div className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-8 text-center mt-4">
            <p className="text-sm text-[#9ca3af]">
              Add at least one row and one player to build the grid.
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left p-2 min-w-[180px]" />
                  {rivals.map(c => (
                    <th key={c.id} className="p-2 min-w-[150px] align-bottom">
                      <div
                        className={`rounded-xl p-3 ${
                          c.is_you
                            ? 'bg-[var(--ds-accent-tint)] border border-[var(--ds-accent)]'
                            : 'bg-[#f5f6f8] border border-[#edf0f3]'
                        }`}
                      >
                        <div className="flex items-start gap-1">
                          <div className="h-9 w-9 shrink-0 rounded-full overflow-hidden bg-white border border-[#edf0f3] flex items-center justify-center">
                            {c.logo
                              ? <img src={c.logo} alt="" className="h-full w-full object-cover" />
                              : <span className="text-[10px] font-bold text-[#c7cdd4]">
                                  {(c.name || '?').slice(0, 2).toUpperCase()}
                                </span>}
                          </div>
                          <button
                            onClick={() => removeRival(c.id)}
                            aria-label="Remove player"
                            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <input
                          className="w-full mt-2 bg-white rounded-lg px-2 py-1.5 text-sm font-semibold text-[#191f1d] outline-none"
                          value={c.name}
                          onChange={(e) => setRival(c.id, { name: e.target.value })}
                          placeholder="Name"
                        />
                        <input
                          className="w-full mt-1 bg-white rounded-lg px-2 py-1 text-xs text-[#191f1d] outline-none"
                          value={c.url ?? ''}
                          onChange={(e) => setRival(c.id, { url: e.target.value.trim() })}
                          placeholder="Website (optional)"
                        />

                        <div className="flex items-center gap-1 mt-1.5">
                          <label
                            className={`flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-lg bg-white border border-[#edf0f3] text-[11px] font-medium text-[#7f8c85] ${
                              uploading === c.id ? 'opacity-60' : 'cursor-pointer hover:bg-[#f5f6f8]'
                            }`}
                          >
                            {uploading === c.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Upload className="w-3 h-3" />}
                            Logo
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => { void pickLogo(c.id, e.target.files?.[0]); e.currentTarget.value = ''; }}
                            />
                          </label>

                          <button
                            onClick={() => markAsYou(c.id)}
                            title="This is us"
                            className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                              c.is_you
                                ? 'bg-[var(--ds-accent)] border-[var(--ds-accent)] text-[var(--ds-on-accent)]'
                                : 'bg-white border-[#edf0f3] text-[#c7cdd4] hover:text-[var(--ds-accent-ink)]'
                            }`}
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {features.map((f, i) => (
                  <tr key={f.id} className={i % 2 ? 'bg-[#fafbfc]' : ''}>
                    <td className="sticky left-0 z-10 bg-inherit p-2">
                      <div className="flex items-center gap-1">
                        <input
                          className="flex-1 bg-[#f5f6f8] rounded-lg px-2 py-1.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                          value={f.label}
                          onChange={(e) => setFeature(f.id, e.target.value)}
                          placeholder="What you compete on"
                        />
                        <button
                          onClick={() => removeFeature(f.id)}
                          aria-label="Remove row"
                          className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>

                    {rivals.map(c => {
                      const on = !!c.marks?.[f.id];
                      return (
                        <td key={c.id} className="p-2 text-center">
                          <button
                            onClick={() => toggleMark(c.id, f.id)}
                            aria-label={on ? 'Has it' : 'Does not have it'}
                            className={`w-8 h-8 rounded-full inline-flex items-center justify-center transition ${
                              on
                                ? 'bg-[var(--ds-accent)] text-[var(--ds-on-accent)]'
                                : 'bg-[#eef0f3] text-[#9ca3af] hover:bg-[#e4e7eb]'
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
          </div>
        )}
      </div>

      <div className={card}>
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
