/**
 * DeleteDealDialog — a deliberate speed bump. Deleting a deal cascades to its
 * documents, investor list, visit history and meetings, so the dialog states
 * exactly what will be destroyed and requires the word DELETE to be typed.
 * The SQL checks it too, so a stray client call cannot delete a deal.
 * The server re-checks that slug, so the guard is not merely cosmetic.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { previewDeleteDeal, deleteDeal, type OrgDeal } from '../../lib/org';

export function DeleteDealDialog({
  deal, onClose, onDeleted,
}: {
  deal: OrgDeal;
  onClose: () => void;
  onDeleted: (deal: OrgDeal) => void;
}) {
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewDeleteDeal>>>(null);
  const [typed, setTyped] = useState('');

  // Case-insensitive: nobody should be blocked by caps lock while trying to
  // delete their own deal. The SQL accepts either case too.
  const confirmed = typed.trim().toUpperCase() === 'DELETE';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    previewDeleteDeal(deal.id)
      .then(setPreview)
      .catch((e) => setError(e?.message || 'Could not load deal'));
  }, [deal.id]);

  const confirm = async () => {
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await deleteDeal(deal.id, typed);
      onDeleted(deal);
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
      setBusy(false);
    }
  };

  const losses = preview
    ? ([
        ['document', preview.documents],
        ['investor', preview.investors],
        ['recorded visit', preview.visits],
        ['meeting', preview.meetings],
      ] as const).filter(([, n]) => n > 0)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={busy ? undefined : onClose} />

      <div className="relative w-full max-w-md rounded-2xl bg-white border border-[#edf0f3] shadow-[0_24px_60px_-12px_rgba(0,0,0,0.3)] p-6">
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="absolute right-4 top-4 text-[#7f8c85] hover:text-[#191f1d] disabled:opacity-40"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>

        <h2 className="text-lg font-bold text-[#191f1d]">
          Delete "{deal.company_name || deal.slug}"?
        </h2>
        <p className="text-sm text-[#7f8c85] mt-1">
          This cannot be undone. Every link to this deal room stops working, and
          its documents, analytics and investor list go with it.
        </p>

        {preview === null && !error ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-[#7f8c85]">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking what this would remove
          </div>
        ) : losses.length > 0 ? (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-sm font-semibold text-red-700">This will also permanently delete:</p>
            <ul className="mt-1.5 space-y-0.5">
              {losses.map(([noun, n]) => (
                <li key={noun} className="text-sm text-red-700">
                  {n} {noun}{n === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          </div>
        ) : preview ? (
          <p className="mt-4 text-sm text-[#7f8c85]">This deal has no documents or investors attached.</p>
        ) : null}

        <label className="block text-xs font-semibold text-[#7f8c85] mt-4 mb-1.5">
          Type <span className="font-mono text-[#191f1d]">DELETE</span> to confirm
        </label>
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && confirmed) void confirm(); }}
          autoFocus
          spellCheck={false}
          className="w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm font-mono text-[#191f1d] outline-none focus:ring-2 focus:ring-red-500/30"
          placeholder="DELETE"
        />

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="flex-1 h-10 rounded-xl border border-[#edf0f3] text-sm font-semibold text-[#7f8c85] hover:text-[#191f1d] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void confirm()}
            disabled={busy || !confirmed}
            className="flex-1 h-10 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Delete forever
          </button>
        </div>
      </div>
    </div>
  );
}
