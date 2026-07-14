/**
 * DisplayOrder — the order sections appear, in the admin tabs AND in the
 * investor room.
 *
 * This is deliberately an explicit list rather than a drag gesture on the tab
 * bar. It changes what investors see, and a setting with that much consequence
 * should not be something you can trigger by fumbling a click on a tab you were
 * only trying to open.
 *
 * Details is pinned first and Deal Flow and Settings are pinned last, so they
 * are shown here greyed rather than hidden: seeing that they cannot move is
 * more useful than wondering where they went.
 */

import { ChevronUp, ChevronDown, Lock, RotateCcw } from 'lucide-react';
import {
  SECTION_LABELS, DEFAULT_SECTION_ORDER, type SectionKey,
} from '../../lib/dealStudio';

export function DisplayOrder({
  order,
  onChange,
}: {
  order: SectionKey[];
  onChange: (next: SectionKey[]) => void;
}) {
  const isDefault =
    order.length === DEFAULT_SECTION_ORDER.length &&
    order.every((k, i) => k === DEFAULT_SECTION_ORDER[i]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-4">
      {/* The one header. Bold 14px title, 12px muted line on what it is FOR.
          This was an uppercase grey label, which is the style used for FIELD
          labels, so a panel title and a form label looked like the same thing. */}
      <h3 className="text-sm font-bold text-[#191f1d]">Display Order</h3>
      <p className="text-xs text-[#7f8c85] mt-0.5 mb-3">
        The order investors scroll through your room.
      </p>

      {/* Pinned first. */}
      <div className="flex items-center gap-2 rounded-xl bg-[#f5f6f8] px-3 py-2 mb-1.5">
        <Lock className="w-3 h-3 shrink-0 text-[#c7cdd4]" />
        <span className="text-sm text-[#9ca3af]">Details</span>
      </div>

      <div className="space-y-1.5">
        {order.map((k, i) => (
          <div
            key={k}
            className="flex items-center gap-1 rounded-xl border border-[#edf0f3] bg-white px-3 py-2"
          >
            <span className="w-5 shrink-0 text-xs font-bold text-[var(--ds-accent-ink)]">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#191f1d]">
              {SECTION_LABELS[k]}
            </span>

            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move ${SECTION_LABELS[k]} up`}
              className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[#c7cdd4] hover:text-[#191f1d] hover:bg-[#f5f6f8] disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === order.length - 1}
              aria-label={`Move ${SECTION_LABELS[k]} down`}
              className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-[#c7cdd4] hover:text-[#191f1d] hover:bg-[#f5f6f8] disabled:opacity-25 disabled:hover:bg-transparent"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {!isDefault && (
        <button
          onClick={() => onChange([...DEFAULT_SECTION_ORDER])}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ds-accent-ink)] hover:underline"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Restore default order
        </button>
      )}

      {/* Pinned last. Admin only: an investor never sees these. */}
      <div className="mt-1.5 space-y-1.5">
        {['Deal Flow', 'Settings'].map(label => (
          <div key={label} className="flex items-center gap-2 rounded-xl bg-[#f5f6f8] px-3 py-2">
            <Lock className="w-3 h-3 shrink-0 text-[#c7cdd4]" />
            <span className="text-sm text-[#9ca3af]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
