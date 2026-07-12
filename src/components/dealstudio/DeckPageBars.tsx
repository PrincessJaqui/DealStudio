/**
 * DeckPageBars — DocSend-style "time spent per page" chart for a single viewer.
 * Columns are scaled to the viewer's longest page. Tapping a bar reveals the
 * actual slide image for that page (when a deck URL is provided).
 */

import { useEffect, useState } from 'react';
import { PageStat, adminFetchDeckPageStats, formatDuration } from '../../lib/dealStudio';
import { PdfThumbnail } from './PdfThumbnail';

const compact = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`);

export function DeckPageBars({ roomId, deckId, email, deckUrl }: { roomId: string; deckId: string; email: string; deckUrl?: string }) {
  const [pages, setPages] = useState<PageStat[] | null>(null);
  const [openPage, setOpenPage] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    adminFetchDeckPageStats(roomId, deckId, email).then(p => { if (alive) setPages(p); });
    return () => { alive = false; };
  }, [roomId, deckId, email]);

  if (pages === null) return <div className="h-32 rounded-lg bg-[#f0f0f0] animate-pulse" />;
  if (pages.length === 0) return <p className="text-xs text-[#99a1af] py-4 text-center">No page-level data for this viewer yet.</p>;

  const max = Math.max(1, ...pages.map(p => p.avgSeconds));

  return (
    <div>
      <p className="text-xs font-semibold text-[#7f8c85] mb-3">Time on deck by page{deckUrl ? ' · tap a bar to see the slide' : ''}</p>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-end gap-2 h-40 min-w-max">
          {pages.map(p => {
            const h = Math.max(6, Math.round((p.avgSeconds / max) * 112));
            const active = openPage === p.page;
            return (
              <button
                key={p.page}
                type="button"
                onClick={() => deckUrl && setOpenPage(active ? null : p.page)}
                className={`flex flex-col items-center gap-1 w-8 group ${deckUrl ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="text-[10px] font-medium text-[#7f8c85] tabular-nums leading-none whitespace-nowrap">{compact(p.avgSeconds)}</span>
                <div
                  className={`w-6 rounded-t-md transition-colors ${active ? 'bg-[var(--ds-brand-dark)]' : 'bg-gradient-to-t from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] group-hover:from-[var(--ds-brand-dark)] group-hover:to-[var(--ds-grad-from)]'}`}
                  style={{ height: h }}
                  title={`Page ${p.page} · ${formatDuration(p.avgSeconds)} avg · ${p.views} view${p.views === 1 ? '' : 's'}`}
                />
                <span className={`text-[10px] tabular-nums leading-none ${active ? 'text-[var(--ds-brand-dark)] font-bold' : 'text-[#99a1af]'}`}>{p.page}</span>
              </button>
            );
          })}
        </div>
      </div>
      {openPage !== null && deckUrl && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-[#7f8c85] mb-1.5">Page {openPage}</p>
          <div className="relative w-full max-w-xs aspect-[16/9] rounded-lg border border-[#edf0f3] overflow-hidden bg-white">
            <PdfThumbnail url={deckUrl} page={openPage} />
          </div>
        </div>
      )}
      <p className="text-[10px] text-[#99a1af] mt-2">Bar height is average time on each page. Hover a bar for views.</p>
    </div>
  );
}
