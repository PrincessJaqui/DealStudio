/**
 * DealViewerAnalytics — a single viewer's full engagement: total time, visits,
 * deck views, time by section, documents opened, and per-deck-page dwell.
 * Built from the viewer's dealstudio_visits row plus per-viewer deck-page events.
 */

import { useEffect, useState } from 'react';
import { X, Eye, Clock, Calendar } from 'lucide-react';
import { DealVisitRow, DealDocument, PageStat, adminFetchDeckPageStats, formatDuration } from '../../lib/dealStudio';

interface Props {
  roomId: string;
  visit: DealVisitRow;
  name?: string | null;
  docs: DealDocument[];
  onClose: () => void;
}

const SECTION_LABELS: Record<string, string> = {
  deck: 'Deck', header: 'Overview', deal_info: 'Deal information', about: 'About',
  industries: 'Industry', documents: 'Documents', calendar: 'Availability', hq: 'Headquarters',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function DealViewerAnalytics({ roomId, visit, name, docs, onClose }: Props) {
  const [pages, setPages] = useState<PageStat[]>([]);
  const deck = docs.find(d => d.is_deck);

  useEffect(() => {
    if (deck && visit.email) adminFetchDeckPageStats(roomId, deck.id, visit.email).then(setPages);
  }, [roomId, deck, visit.email]);

  const label = (k: string) => k.startsWith('doc:') ? (docs.find(d => d.id === k.slice(4))?.title || 'Document') : (SECTION_LABELS[k] || k.replace(/_/g, ' '));
  const sections = Object.entries(visit.sections || {}).filter(([, s]) => (s as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number));
  const docSections = sections.filter(([k]) => k.startsWith('doc:'));
  const maxSection = Math.max(1, ...sections.map(([, s]) => s as number));
  const maxPage = Math.max(1, ...pages.map(p => p.avgSeconds));

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[90vh] bg-white rounded-2xl shadow-2xl border border-[#edf0f3] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#edf0f3]">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#191f1d] truncate">{name || visit.email || 'Anonymous viewer'}</h3>
            {visit.email && name && <p className="text-xs text-[#7f8c85] truncate">{visit.email}</p>}
            <p className="text-xs text-[#99a1af] mt-0.5 flex items-center gap-1"><Calendar className="w-3 h-3" /> Last seen {fmtDate(visit.last_seen_at)}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9] shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Total time', formatDuration(visit.total_seconds)],
              ['Visits', String(visit.page_views)],
              ['Deck views', String(visit.deck_views)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#503DBB]">{l}</p>
                <p className="text-lg font-bold text-[#191f1d] mt-1">{v}</p>
              </div>
            ))}
          </div>

          {/* Time by section */}
          {sections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#7f8c85] mb-2 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Time by section</p>
              <div className="space-y-2">
                {sections.map(([k, s]) => (
                  <div key={k} className="flex items-center gap-3">
                    <span className="text-xs text-[#191f1d] w-28 shrink-0 truncate">{label(k)}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F1EFFB] overflow-hidden"><div className="h-full bg-gradient-to-r from-[#242473] to-[#503DBB]" style={{ width: `${Math.max(4, Math.round(((s as number) / maxSection) * 100))}%` }} /></div>
                    <span className="text-xs text-[#7f8c85] w-12 text-right tabular-nums">{formatDuration(s as number)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents opened */}
          {docSections.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#7f8c85] mb-2 flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> Documents opened</p>
              <div className="flex flex-wrap gap-2">
                {docSections.map(([k, s]) => (
                  <span key={k} className="text-[11px] text-[#242473] bg-[#F1EFFB] rounded-full px-2.5 py-1">{label(k)} · {formatDuration(s as number)}</span>
                ))}
              </div>
            </div>
          )}

          {/* Per-deck-page */}
          {pages.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#7f8c85] mb-2">Deck — time per page</p>
              <div className="space-y-2">
                {pages.map(p => (
                  <div key={p.page} className="flex items-center gap-3">
                    <span className="text-xs text-[#7f8c85] w-14 shrink-0">Page {p.page}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F1EFFB] overflow-hidden"><div className="h-full bg-gradient-to-r from-[#242473] to-[#503DBB]" style={{ width: `${Math.max(4, Math.round((p.avgSeconds / maxPage) * 100))}%` }} /></div>
                    <span className="text-xs text-[#7f8c85] w-12 text-right tabular-nums">{formatDuration(p.avgSeconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sections.length === 0 && pages.length === 0 && (
            <p className="text-sm text-[#99a1af] text-center py-4">No engagement recorded for this viewer yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
