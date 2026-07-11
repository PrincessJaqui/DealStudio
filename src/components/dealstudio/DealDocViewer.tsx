/**
 * DealDocViewer — in-app document viewer modal. Shows the full document name,
 * renders the deck as a click-through (PdfDeckViewer) and other PDFs as a
 * scrollable page, with an open-in-new-tab escape hatch.
 */

import { ExternalLink, X } from 'lucide-react';
import { DealDocument, formatBytes } from '../../lib/dealStudio';
import { PdfDeckViewer } from './PdfDeckViewer';

interface Props {
  doc: DealDocument;
  onClose: () => void;
  onPageView?: (page: number, seconds: number) => void;
}

export function DealDocViewer({ doc, onClose, onPageView }: Props) {
  const isPdf = (doc.file_name || doc.file_url || '').toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl border border-[#edf0f3] overflow-hidden flex flex-col">
        {/* Header — full name, never truncated */}
        <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-[#edf0f3]">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[#191f1d] break-words">{doc.title}</h3>
            <p className="text-xs text-[#99a1af] break-all">{[doc.file_name, formatBytes(doc.file_size)].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a href={doc.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm text-[#191f1d] hover:bg-[#f5f7f9]"><ExternalLink className="w-4 h-4" /> Open</a>
            <button onClick={onClose} className="w-9 h-9 rounded-xl flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-auto bg-[#f5f7f9] flex items-start justify-center p-3 sm:p-5">
          {doc.is_deck && isPdf ? (
            <div className="w-full rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.10)]">
              <PdfDeckViewer url={doc.file_url} onPageView={onPageView} />
            </div>
          ) : isPdf ? (
            <iframe src={`${doc.file_url}#view=FitH`} title={doc.title} className="w-full h-[78vh] rounded-xl border border-[#edf0f3] bg-white" />
          ) : (
            <img src={doc.file_url} alt={doc.title} className="max-w-full rounded-xl" />
          )}
        </div>
      </div>
    </div>
  );
}
