/**
 * BusinessModelEditor — admin editor for the Business Model tab. Renders the
 * shared Revenue Model Calculator in admin mode; edits flow up via onChange,
 * which the screen debounces and auto-saves.
 */
import { EMPTY_BUSINESS_MODEL } from '../../lib/dealStudio';
import type { DealBusinessModel } from '../../lib/dealStudio';
import { RevenueCalculator } from './RevenueCalculator';

export function BusinessModelEditor({ value, onChange }: { value: DealBusinessModel | null | undefined; onChange: (v: DealBusinessModel) => void }) {
  const bm: DealBusinessModel = { ...EMPTY_BUSINESS_MODEL, ...(value || {}) };
  return (
    <div className="space-y-3">
      {/* Every tab says what it is FOR, not what it is called. This one was the
          only editor rendering straight into a calculator with no framing. */}
      <div>
        <h3 className="text-sm font-bold text-[#191f1d]">Business Model</h3>
        <p className="text-xs text-[#7f8c85] mt-0.5">
          Set the revenue streams behind your projection. Investors can change a price or a
          customer count in the room and watch the numbers move.
        </p>
      </div>
      <RevenueCalculator value={bm} onChange={onChange} admin />
    </div>
  );
}
