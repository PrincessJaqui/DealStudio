/**
 * DealDocumentModal — add or edit deal documents.
 *  - Add mode: choose one OR many files. Each file's title defaults to its file
 *    name (extension stripped) and is editable per row; one file can be flagged
 *    as the pitch deck. All are uploaded + created on save.
 *  - Edit mode (existing): rename / replace a single document. Replacing the
 *    file archives the original version (handled in adminUpdateDocument).
 */

import { useState } from 'react';
import { X, UploadCloud, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../ui/button';
import {
  DealDocument, uploadDealFile, adminCreateDocument, adminUpdateDocument,
} from '../../lib/dealStudio';

interface Props {
  roomId: string;
  existing: DealDocument | null;
  defaultIsDeck?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const stripExt = (name: string) => name.replace(/\.[^/.]+$/, '');

interface PendingFile { file: File; title: string; }

export function DealDocumentModal({ roomId, existing, defaultIsDeck, onClose, onSaved }: Props) {
  const isEdit = !!existing;

  // Edit-mode state
  const [title, setTitle] = useState(existing?.title || (defaultIsDeck ? 'Pitch Deck' : ''));
  const [description, setDescription] = useState(existing?.description || '');
  const [isDeck, setIsDeck] = useState(existing?.is_deck ?? defaultIsDeck ?? false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  // Add-mode state (one or many)
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [deckIndex, setDeckIndex] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const next = Array.from(list).map(f => ({ file: f, title: stripExt(f.name) }));
    setPending(prev => {
      const merged = [...prev, ...next];
      // Default the deck to the first file when the modal was opened for the deck.
      if (defaultIsDeck && deckIndex === null && merged.length > 0) setDeckIndex(0);
      return merged;
    });
  };

  const saveEdit = async () => {
    if (!existing) return;
    if (!title.trim()) { toast.error('Give the document a title'); return; }
    setSaving(true);
    try {
      let uploaded: { url: string; size: number; name: string } | undefined;
      if (replaceFile) {
        const up = await uploadDealFile(replaceFile, roomId);
        if (!up) { toast.error('Upload failed'); setSaving(false); return; }
        uploaded = up;
      }
      const r = await adminUpdateDocument(existing, { title: title.trim(), description, is_deck: isDeck }, uploaded);
      if (!r.success) { toast.error('Save failed'); setSaving(false); return; }
      toast.success(uploaded ? 'Document replaced (original archived)' : 'Document updated');
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  const saveAdd = async () => {
    if (pending.length === 0) { toast.error('Choose one or more files'); return; }
    if (pending.some(p => !p.title.trim())) { toast.error('Every document needs a title'); return; }
    setSaving(true);
    try {
      let ok = 0;
      for (let i = 0; i < pending.length; i++) {
        const p = pending[i];
        const up = await uploadDealFile(p.file, roomId);
        if (!up) continue;
        const r = await adminCreateDocument({
          dealstudio_id: roomId, title: p.title.trim(), description: '',
          is_deck: deckIndex === i, file_url: up.url, file_name: up.name, file_size: up.size,
        });
        if (r.success) ok++;
      }
      if (ok === 0) { toast.error('Upload failed'); setSaving(false); return; }
      toast.success(ok === 1 ? 'Document added' : `${ok} documents added`);
      onSaved(); onClose();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-[#edf0f3] overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#edf0f3]">
          <h3 className="text-lg font-bold text-[#191f1d]">{isEdit ? 'Edit document' : 'Add documents'}</h3>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f7f9]"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {isEdit ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full h-11 rounded-xl bg-[#f5f6f8] px-3 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40" placeholder="Pitch Deck" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full rounded-xl bg-[#f5f6f8] px-3 py-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40 resize-none" placeholder="Optional summary investors see on the card" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#7f8c85] mb-1">Replace file (optional)</label>
                <label className="flex items-center gap-3 rounded-xl border border-dashed border-[#d7dde2] bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] px-4 py-3 cursor-pointer hover:border-[var(--ds-brand)]">
                  <UploadCloud className="w-5 h-5 text-[var(--ds-brand)]" />
                  <span className="text-sm text-[#7f8c85] truncate">{replaceFile ? replaceFile.name : existing?.file_name || 'Keep current file'}</span>
                  <input type="file" accept="application/pdf,image/*" className="hidden" onChange={e => setReplaceFile(e.target.files?.[0] || null)} />
                </label>
                {replaceFile && <p className="text-[11px] text-[#b45309] mt-1">The current version will be archived and stays viewable in history.</p>}
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isDeck} onChange={e => setIsDeck(e.target.checked)} className="w-4 h-4 accent-[var(--ds-brand)]" />
                <span className="text-sm text-[#191f1d]">Feature as the pitch deck (shown at the top)</span>
              </label>
            </>
          ) : (
            <>
              {/* The label sits on the blue brand gradient, so everything on it has
                  to be white. The icon was --ds-brand, which is dark blue ON blue:
                  it was nearly invisible, and the dashed border was a pale grey
                  meant for a white card. */}
              <label className="flex items-center gap-3 rounded-xl border border-dashed border-white/40 bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] px-4 py-3 cursor-pointer hover:border-white/70">
                <UploadCloud className="w-5 h-5 text-white" />
                <span className="text-sm font-medium text-white">Choose one or more files (PDF)</span>
                <input type="file" accept="application/pdf,image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
              </label>

              {pending.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#7f8c85]">{pending.length} file{pending.length > 1 ? 's' : ''} &mdash; names default to the file name, edit as needed</p>
                  {pending.map((p, i) => (
                    <div key={i} className="rounded-xl bg-[#f5f6f8] p-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          value={p.title}
                          onChange={e => setPending(prev => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          className="flex-1 h-9 rounded-lg bg-white border border-[#edf0f3] px-2.5 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/40"
                          placeholder="Document title"
                        />
                        <button type="button" onClick={() => { setPending(prev => prev.filter((_, j) => j !== i)); setDeckIndex(d => d === i ? null : (d !== null && d > i ? d - 1 : d)); }} className="w-9 h-9 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-white"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 px-0.5">
                        <span className="text-[11px] text-[#99a1af] truncate">{p.file.name}</span>
                        <label className="flex items-center gap-1.5 text-[11px] text-[#191f1d] cursor-pointer shrink-0">
                          <input type="radio" name="deck" checked={deckIndex === i} onChange={() => setDeckIndex(i)} className="accent-[var(--ds-brand)]" /> Pitch deck
                        </label>
                      </div>
                    </div>
                  ))}
                  {deckIndex !== null && (
                    <button type="button" onClick={() => setDeckIndex(null)} className="text-xs text-[#7f8c85] hover:underline">Clear deck selection</button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#edf0f3]">
          <Button onClick={onClose} className="h-10 rounded-xl bg-[#f5f7f9] text-[#191f1d] hover:bg-[#edf0f3]">Cancel</Button>
          <Button onClick={isEdit ? saveEdit : saveAdd} disabled={saving} className="h-10 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white hover:bg-[var(--ds-brand-hover)] disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? 'Save' : pending.length > 1 ? `Add ${pending.length} documents` : 'Add document'}
          </Button>
        </div>
      </div>
    </div>
  );
}
