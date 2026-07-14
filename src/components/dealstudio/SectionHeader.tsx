/**
 * SectionHeader and AddButton: the top of a Deal Studio tab, in one place.
 *
 * Every editor had invented its own. Team had a bold title and a gradient
 * button, Value Prop had an uppercase gray label and an outlined "Add", Industry
 * Reading had a text link, Competition had an h3. Four tabs, four headers, one
 * product. This is the header, and this is the add button, and there is nowhere
 * else to write either one.
 *
 * The shape: bold 14px title, 12px muted line saying what the section is FOR
 * (never a restatement of the title), action on the right. Items the founder
 * adds go in their own containers BELOW this card, not inside it.
 */

import { Plus } from 'lucide-react';

export function AddButton({
  label, onClick, disabled,
}: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110 transition disabled:opacity-50"
    >
      <Plus className="w-4 h-4" /> {label}
    </button>
  );
}

export function SectionHeader({
  title, summary, action, children,
}: {
  title: string;
  /** One line on what this section is for. If it needs two, the section is doing too much. */
  summary?: string;
  action?: React.ReactNode;
  /** Rare. A hint or a toolbar that genuinely belongs to the header, not to an item. */
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#191f1d]">{title}</h3>
          {summary && <p className="text-xs text-[#7f8c85] mt-0.5">{summary}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
