/**
 * DealTheme — per-deal colour overrides.
 *
 * Empty means inherit. A deal with no colours of its own follows the company's
 * branding, so changing the company still updates every deal that has not
 * deliberately broken away. That is why "Clear" exists as a first-class action
 * rather than an afterthought: it is how a deal returns to the company default.
 */

import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export type DealColors = {
  brand_from?: string | null;
  brand_to?: string | null;
  brand_accent?: string | null;
  accent_to?: string | null;
};

const FIELDS: { key: keyof DealColors; label: string; hint: string }[] = [
  { key: 'brand_from',   label: 'Brand from',  hint: 'Buttons and headings' },
  { key: 'brand_to',     label: 'Brand to',    hint: 'Gradient end' },
  { key: 'brand_accent', label: 'Accent from', hint: 'Tabs and highlights' },
  { key: 'accent_to',    label: 'Accent to',   hint: 'Gradient end' },
];

export function DealThemeEditor({
  value,
  orgFallback,
  onChange,
}: {
  value: DealColors;
  /** Shown as the placeholder so it is obvious what "inherit" resolves to. */
  orgFallback: DealColors;
  onChange: (patch: DealColors) => void;
}) {
  const [local, setLocal] = useState<DealColors>(value);

  const set = (key: keyof DealColors, v: string) => {
    const next = { ...local, [key]: v };
    setLocal(next);
    if (v === '' || HEX.test(v)) onChange({ [key]: v === '' ? null : v } as DealColors);
  };

  const clearAll = () => {
    setLocal({});
    onChange({ brand_from: null, brand_to: null, brand_accent: null, accent_to: null });
  };

  const overridden = FIELDS.some(f => local[f.key]);

  /** What a colour actually resolves to: this deal, then the company, then default. */
  const res = (key: keyof DealColors): string => {
    const v = local[key] || orgFallback[key];
    if (v && HEX.test(v)) return v;
    return key === 'brand_from' ? '#627FD9'
      : key === 'brand_to' ? '#0030CD'
      : key === 'brand_accent' ? '#00c2c8'
      : '#00d6af';
  };

  return (
    <div className="rounded-2xl bg-white border border-[#edf0f3] shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5">
      <div className="flex items-center gap-3 mb-1">
        <div>
          <h3 className="font-bold text-[#191f1d]">Deal Branding</h3>
          <p className="text-sm text-[#7f8c85] mt-0.5">
            {overridden
              ? 'This deal uses its own colours.'
              : 'Following your company colours.'}
          </p>
        </div>
        {overridden && (
          <button
            onClick={clearAll}
            className="ml-auto inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#7f8c85] hover:text-[#191f1d]"
          >
            <RotateCcw className="w-4 h-4" /> Use company colours
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        {FIELDS.map(f => {
          const current = local[f.key] ?? '';
          const inherited = orgFallback[f.key] ?? '#627FD9';
          const shown = current || inherited;
          const valid = current === '' || HEX.test(current);

          return (
            <div key={f.key} className="flex items-center gap-3">
              <input
                type="color"
                value={HEX.test(shown) ? shown : '#627FD9'}
                onChange={(e) => set(f.key, e.target.value)}
                aria-label={f.label}
                className="h-10 w-12 shrink-0 rounded-xl border border-[#edf0f3] bg-white p-1 cursor-pointer"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#7f8c85]">{f.label}</p>
                <input
                  value={current}
                  onChange={(e) => set(f.key, e.target.value.trim())}
                  spellCheck={false}
                  placeholder={inherited}
                  className={`w-full bg-[#f5f6f8] rounded-lg px-2 py-1 text-sm font-mono text-[#191f1d] outline-none focus:ring-2 ${
                    valid ? 'focus:ring-[var(--ds-brand)]/30' : 'ring-2 ring-red-400'
                  }`}
                />
                <p className="text-[11px] text-[#9ca3af] mt-0.5">
                  {current ? f.hint : `Inherits ${inherited}`}
                </p>
              </div>
              {current && valid && <Check className="w-4 h-4 shrink-0 text-[var(--ds-accent-ink)]" />}
            </div>
          );
        })}
      </div>

      {/* Preview: the resolved colours, so the effect is visible without
          opening the investor room in another tab. */}
      <div className="mt-5 pt-5 border-t border-[#edf0f3]">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#7f8c85] mb-3">
          Preview
        </p>

        <div className="rounded-2xl border border-[#edf0f3] bg-[#f5f6f8] p-4">
          <div
            className="rounded-xl px-4 py-3 text-white font-semibold text-sm"
            style={{ background: `linear-gradient(135deg, ${res('brand_from')}, ${res('brand_to')})` }}
          >
            Primary button
          </div>

          <div className="flex items-center gap-2 mt-3">
            <span
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{
                background: `linear-gradient(135deg, ${res('brand_accent')}, ${res('accent_to')})`,
                color: '#04333A',
              }}
            >
              Active tab
            </span>
            <span className="rounded-full bg-white border border-[#edf0f3] px-3 py-1 text-xs text-[#7f8c85]">
              Inactive
            </span>
            <span
              className="ml-auto text-sm font-bold"
              style={{ color: res('brand_to') }}
            >
              $750K
            </span>
          </div>

          <div className="mt-3 h-2 rounded-full bg-white overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: '62%',
                background: `linear-gradient(90deg, ${res('brand_accent')}, ${res('accent_to')})`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
