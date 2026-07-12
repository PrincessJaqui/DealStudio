/**
 * DealDocumentCard — a "little card with a preview" for a deal document.
 * Preview is a non-interactive, scaled PDF iframe (dependency-free first-page
 * thumbnail) with a graceful icon fallback. In admin mode it shows edit/delete.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, MoreVertical, Pencil, Trash2, Download, Star, Check, Eye, Clock } from 'lucide-react';
import { DealDocument, DocStat, formatBytes, formatDuration } from '../../lib/dealStudio';
import { PdfThumbnail } from './PdfThumbnail';

interface Props {
  doc: DealDocument;
  onOpen: (doc: DealDocument) => void;
  admin?: boolean;
  onEdit?: (doc: DealDocument) => void;
  onDelete?: (doc: DealDocument) => void;
  /** Multi-select delete mode. When on, clicking the card toggles selection. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (doc: DealDocument) => void;
  /** Admin analytics for this document. */
  stat?: DocStat;
}

export function DealDocumentCard({ doc, onOpen, admin = false, onEdit, onDelete, selectMode = false, selected = false, onToggleSelect, stat }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const isPdf = (doc.file_name || doc.file_url || '').toLowerCase().endsWith('.pdf');

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = menuBtnRef.current?.getBoundingClientRect();
    if (r) setMenuPos({ top: r.bottom + 4, left: Math.max(8, r.right - 160) });
    setMenuOpen(true);
  };

  // Fixed-positioned menu can't follow scroll, so close it instead.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [menuOpen]);

  return (
    <div className={`ds-pulse ds-card group relative rounded-2xl border bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] overflow-hidden ${selected ? 'border-[var(--ds-brand)] ring-2 ring-[var(--ds-brand)]/40' : 'border-[#edf0f3]'}`}>
      {/* Preview */}
      <button
        type="button"
        onClick={() => (selectMode ? onToggleSelect?.(doc) : onOpen(doc))}
        className="block w-full h-40 bg-white relative overflow-hidden"
        aria-label={selectMode ? `Select ${doc.title}` : `Open ${doc.title}`}
      >
        {/* Real first-page preview for PDFs (falls back to a white faux page) */}
        {isPdf
          ? <PdfThumbnail url={doc.file_url} />
          : (
            <span className="absolute inset-0 flex items-center justify-center bg-white">
              <span className="w-[88px] h-28 rounded-md bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] border border-[#edf0f3] p-2.5 flex flex-col gap-1.5">
                <span className="h-2 w-3/4 rounded bg-[var(--ds-brand)]/40" />
                <span className="h-1.5 w-full rounded bg-[#eef1f4]" />
                <span className="h-1.5 w-full rounded bg-[#eef1f4]" />
                <span className="h-1.5 w-5/6 rounded bg-[#eef1f4]" />
                <span className="mt-auto flex items-center gap-1 text-[var(--ds-brand)]"><FileText className="w-3 h-3" /><span className="text-[8px] font-bold tracking-wide">FILE</span></span>
              </span>
            </span>
          )}
        {selectMode && (
          <span className={`absolute top-2 right-2 w-6 h-6 rounded-md flex items-center justify-center border-2 ${selected ? 'bg-[var(--ds-brand)] border-[var(--ds-brand)]' : 'bg-white/90 border-[#edf0f3]'}`}>
            {selected && <Check className="w-4 h-4 text-white" />}
          </span>
        )}
        {doc.is_deck && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-[var(--ds-accent)] to-[var(--ds-accent-to)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ds-on-accent)] shadow">
            <Star className="w-3 h-3" /> Deck
          </span>
        )}
      </button>

      {/* Meta */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <p title={doc.title} className="text-sm font-bold text-[#191f1d] break-words">{doc.title}</p>
          {admin && !selectMode && (
            <div className="relative shrink-0">
              <button
                ref={menuBtnRef}
                type="button"
                onClick={openMenu}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"
                aria-label="Document actions"
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {menuOpen && menuPos && createPortal(
                <>
                  <button type="button" aria-label="Close" className="fixed inset-0 z-[60] cursor-default" onClick={() => setMenuOpen(false)} />
                  <div style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }} className="z-[61] w-[160px] bg-white rounded-xl shadow-lg border border-[#e8ecef] overflow-hidden">
                    <button type="button" onClick={() => { setMenuOpen(false); onEdit?.(doc); }} className="w-full text-left px-4 py-2.5 text-[13px] text-[#191f1d] hover:bg-[#f5f7f3] flex items-center gap-2"><Pencil className="w-3.5 h-3.5" /> Edit</button>
                    <a href={doc.file_url} target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)} className="w-full text-left px-4 py-2.5 text-[13px] text-[#191f1d] hover:bg-[#f5f7f3] flex items-center gap-2"><Download className="w-3.5 h-3.5" /> Download</a>
                    <button type="button" onClick={() => { setMenuOpen(false); onDelete?.(doc); }} className="w-full text-left px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 flex items-center gap-2 border-t border-[#f0f0f0]"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                  </div>
                </>,
                document.body,
              )}
            </div>
          )}
        </div>
        {doc.description && <p className="text-xs text-[#7f8c85] line-clamp-2 mt-0.5">{doc.description}</p>}
        <p title={doc.file_name || ''} className="text-[11px] text-[#99a1af] mt-1.5 break-all">
          {[doc.file_name, formatBytes(doc.file_size), doc.version > 1 ? `v${doc.version}` : ''].filter(Boolean).join(' · ')}
        </p>
        {admin && stat && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-[#f0f0f0] text-[11px] text-[var(--ds-brand)] font-medium">
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {stat.views} view{stat.views === 1 ? '' : 's'}</span>
            {stat.avgSeconds > 0 && <span className="flex items-center gap-1 text-[#7f8c85]"><Clock className="w-3 h-3" /> {formatDuration(stat.avgSeconds)} avg</span>}
          </div>
        )}
      </div>
    </div>
  );
}
