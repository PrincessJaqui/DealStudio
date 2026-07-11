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
  return <RevenueCalculator value={bm} onChange={onChange} admin />;
}
