/**
 * LandingEditor — the platform admin's page builder for the marketing site.
 *
 * Blocks are ordered and typed. Nothing is live until Publish, so a half-edited
 * page never reaches visitors. Deleting every block restores the built-in page
 * rather than leaving a blank site.
 */

import { useEffect, useState } from 'react';
import { CustomLanding } from './CustomLanding';
import {
  Loader2, Plus, Trash2, ChevronUp, ChevronDown, Upload, Eye, Check, Pencil,
} from 'lucide-react';
import {
  fetchLanding, saveLanding, uploadSiteImage, blankBlock, BLOCK_LABELS, DEFAULT_LANDING,
  type LandingBlock, type BlockType, type LandingItem,
} from '../../lib/siteContent';
import { FEATURE_ICONS, FEATURE_ICON_KEYS } from '../dealstudio/featureIcons';

const card =
  'rounded-2xl bg-white border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';
const field =
  'w-full bg-[#f5f6f8] rounded-xl px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const lbl = 'block text-xs font-semibold uppercase tracking-wider text-[var(--ds-accent-ink)] mb-1.5';

export function LandingEditor() {
  const [blocks, setBlocks] = useState<LandingBlock[] | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { void fetchLanding().then(setBlocks); }, []);

  const set = (i: number, patch: Partial<LandingBlock>) =>
    setBlocks(bs => (bs ?? []).map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  const add = (type: BlockType) =>
    setBlocks(bs => [...(bs ?? []), blankBlock(type)]);

  const remove = (i: number) =>
    setBlocks(bs => (bs ?? []).filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) =>
    setBlocks(bs => {
      const next = [...(bs ?? [])];
      const j = i + dir;
      if (j < 0 || j >= next.length) return next;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const setItem = (bi: number, ii: number, patch: Partial<LandingItem>) =>
    setBlocks(bs => (bs ?? []).map((b, idx) => {
      if (idx !== bi) return b;
      const items = [...(b.items ?? [])];
      items[ii] = { ...items[ii], ...patch };
      return { ...b, items };
    }));

  const addItem = (bi: number) =>
    setBlocks(bs => (bs ?? []).map((b, idx) =>
      idx === bi ? { ...b, items: [...(b.items ?? []), { title: '', body: '' }] } : b));

  const removeItem = (bi: number, ii: number) =>
    setBlocks(bs => (bs ?? []).map((b, idx) =>
      idx === bi ? { ...b, items: (b.items ?? []).filter((_, x) => x !== ii) } : b));

  const pickImage = async (file: File | undefined, apply: (url: string) => void) => {
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError('Choose an image file'); return; }
    if (file.size > 4 * 1024 * 1024) { setError('Keep images under 4MB'); return; }
    setBusy('img'); setError('');
    try {
      apply(await uploadSiteImage(file));
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setBusy('');
    }
  };

  const publish = async () => {
    setBusy('save'); setError(''); setNote('');
    try {
      await saveLanding(blocks ?? []);
      setNote(
        (blocks ?? []).length === 0
          ? 'Cleared. The built-in page is showing again.'
          : 'Published. The landing page is live.'
      );
    } catch (e: any) {
      setError(e?.message || 'Could not publish');
    } finally {
      setBusy('');
    }
  };

  if (blocks === null) {
    return <div className="p-5"><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div>
            <h2 className="font-bold text-[#191f1d]">Landing page</h2>
            <p className="text-sm text-[#7f8c85]">
              {blocks.length === 0
                ? 'No custom blocks. The built-in page is showing.'
                : `${blocks.length} block${blocks.length === 1 ? '' : 's'}. Changes go live when you publish.`}
            </p>
          </div>

          <div className="sm:ml-auto flex items-center gap-2">
            {/* Preview renders the real page component with the current blocks,
                so what you see here is what publishing produces. */}
            {blocks.length > 0 && (
              <div className="inline-flex bg-[#f5f6f8] border border-[#edf0f3] rounded-xl p-1 gap-0.5">
                {([['edit', 'Edit', Pencil], ['preview', 'Preview', Eye]] as const).map(([m, label, Icon]) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-semibold transition ${
                      mode === m
                        ? 'bg-white text-[#191f1d] shadow-sm'
                        : 'text-[#7f8c85] hover:text-[#191f1d]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            )}

            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
            >
              <Eye className="w-4 h-4" /> Live
            </a>
            <button
              onClick={() => void publish()}
              disabled={busy === 'save'}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] disabled:opacity-60"
            >
              {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Publish
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        {note && <p className="text-sm text-[var(--ds-accent-ink)] mt-3">{note}</p>}

        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#edf0f3]">
          {(Object.keys(BLOCK_LABELS) as BlockType[]).map(t => (
            <button
              key={t}
              onClick={() => add(t)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
            >
              <Plus className="w-4 h-4" /> {BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Preview: the actual page component, driven by the blocks being edited.
          Not a mock-up of it, so it cannot drift from what publishing produces. */}
      {mode === 'preview' && blocks.length > 0 && (
        <div className={`${card} p-0 overflow-hidden`}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#edf0f3] bg-[#f5f6f8]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#e6e8ee]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#e6e8ee]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#e6e8ee]" />
            <span className="ml-2 text-xs text-[#9ca3af]">dealstudio.io</span>
            <span className="ml-auto text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wide">
              Not published yet
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            <CustomLanding blocks={blocks} />
          </div>
        </div>
      )}

      {mode === 'edit' && blocks.map((b, i) => (
        <div key={b.id} className={`${card} p-5`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--ds-accent-ink)]">
              {BLOCK_LABELS[b.type]}
            </span>
            <span className="text-xs text-[#c7cdd4]">#{i + 1}</span>

            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Move up"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f6f8] disabled:opacity-30"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === blocks.length - 1}
                aria-label="Move down"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:bg-[#f5f6f8] disabled:opacity-30"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <button
                onClick={() => remove(i)}
                aria-label="Delete block"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {b.type === 'hero' && (
            <>
              <label className={lbl}>Eyebrow</label>
              <input className={field} value={b.eyebrow ?? ''} onChange={e => set(i, { eyebrow: e.target.value })} placeholder="Small line above the headline" />
            </>
          )}

          {b.type !== 'image' && (
            <>
              <label className={`${lbl} mt-3`}>Heading</label>
              <input className={field} value={b.title ?? ''} onChange={e => set(i, { title: e.target.value })} placeholder="Heading" />

              <label className={`${lbl} mt-3`}>Body</label>
              <textarea className={`${field} min-h-[80px] resize-y`} value={b.body ?? ''} onChange={e => set(i, { body: e.target.value })} placeholder="Supporting copy" />
            </>
          )}

          {(b.type === 'hero' || b.type === 'cta') && (
            <>
              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className={lbl}>Button label</label>
                  <input className={field} value={b.ctaLabel ?? ''} onChange={e => set(i, { ctaLabel: e.target.value })} placeholder="Start free for 30 days" />
                </div>
                <div>
                  <label className={lbl}>Button link</label>
                  <input className={field} value={b.ctaHref ?? ''} onChange={e => set(i, { ctaHref: e.target.value })} placeholder="/signup" />
                </div>
              </div>

              {/* The hero has a second button on the live page (the demo link).
                  Leave the label blank to hide it. */}
              {b.type === 'hero' && (
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={lbl}>Second button label</label>
                    <input className={field} value={b.cta2Label ?? ''} onChange={e => set(i, { cta2Label: e.target.value })} placeholder="See a live demo" />
                  </div>
                  <div>
                    <label className={lbl}>Second button link</label>
                    <input className={field} value={b.cta2Href ?? ''} onChange={e => set(i, { cta2Href: e.target.value })} placeholder="/d/investors" />
                  </div>
                </div>
              )}
            </>
          )}

          {(b.type === 'image' || b.type === 'hero') && (
            <div className="mt-3">
              <label className={lbl}>Image</label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[#edf0f3] bg-[#f5f6f8] flex items-center justify-center">
                  {b.image
                    ? <img src={b.image} alt="" className="h-full w-full object-cover" />
                    : <span className="text-xs text-[#c7cdd4]">None</span>}
                </div>
                <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-sm font-medium text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] ${busy === 'img' ? 'opacity-60' : 'cursor-pointer hover:brightness-110'}`}>
                  {busy === 'img' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { void pickImage(e.target.files?.[0], url => set(i, { image: url })); e.currentTarget.value = ''; }}
                  />
                </label>
                {b.image && (
                  <button onClick={() => set(i, { image: '' })} className="text-sm text-[#7f8c85] hover:text-red-600">
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          {(b.type === 'features' || b.type === 'stats') && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <label className={lbl}>{b.type === 'stats' ? 'Stats' : 'Cards'}</label>
                <button
                  onClick={() => addItem(i)}
                  className="ml-auto inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border border-[#edf0f3] text-xs font-medium text-[#191f1d] hover:bg-[#f5f6f8]"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>

              <div className="space-y-2">
                {(b.items ?? []).map((it, ii) => (
                  <div key={ii} className="rounded-xl bg-[#f5f6f8] border border-[#edf0f3] p-3">
                    <div className="flex items-center gap-2">
                      <input
                        className="flex-1 bg-white rounded-lg px-3 py-2 text-sm font-semibold text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                        value={it.title}
                        onChange={e => setItem(i, ii, { title: e.target.value })}
                        placeholder={b.type === 'stats' ? 'Value (e.g. $20)' : 'Card title'}
                      />
                      <button
                        onClick={() => removeItem(i, ii)}
                        aria-label="Remove"
                        className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#7f8c85] hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      className="w-full mt-2 bg-white rounded-lg px-3 py-2 text-sm text-[#191f1d] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30"
                      value={it.body}
                      onChange={e => setItem(i, ii, { body: e.target.value })}
                      placeholder={b.type === 'stats' ? 'Label (e.g. per month)' : 'Card description'}
                    />

                    {/* Icons only make sense on feature cards. A stat is a
                        number, and hanging an icon on it just adds noise. */}
                    {b.type === 'features' && (
                      <div className="mt-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1.5">
                          Icon
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => setItem(i, ii, { icon: '' })}
                            aria-label="No icon"
                            title="No icon"
                            className={`h-9 w-9 rounded-lg flex items-center justify-center text-xs font-semibold transition ${
                              !it.icon
                                ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                                : 'bg-white text-[#9ca3af] hover:bg-[#eef0f3]'
                            }`}
                          >
                            None
                          </button>

                          {FEATURE_ICON_KEYS.map(key => {
                            const Icon = FEATURE_ICONS[key];
                            const on = it.icon === key;
                            return (
                              <button
                                key={key}
                                onClick={() => setItem(i, ii, { icon: key })}
                                aria-label={key}
                                title={key}
                                aria-pressed={on}
                                className={`h-9 w-9 rounded-lg flex items-center justify-center transition ${
                                  on
                                    ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                                    : 'bg-white text-[#7f8c85] hover:bg-[#eef0f3] hover:text-[#191f1d]'
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {b.type === 'cta' && (
            <label className="mt-3 flex items-center gap-2 text-sm text-[#191f1d] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!b.dark}
                onChange={e => set(i, { dark: e.target.checked })}
                className="h-4 w-4 rounded border-[var(--ds-brd)]"
              />
              Dark background
            </label>
          )}
        </div>
      ))}

      {blocks.length === 0 && (
        <div className={`${card} p-10 text-center`}>
          <p className="text-sm text-[#7f8c85]">
            Nothing published yet, so visitors are seeing the built-in page.
          </p>
          <button
            onClick={() => setBlocks(DEFAULT_LANDING.map(b => ({ ...b })))}
            className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
          >
            Load current page to edit
          </button>
          <p className="text-xs text-[#9ca3af] mt-3">
            Loads the live copy as blocks so you can edit it, rather than starting from scratch.
          </p>
        </div>
      )}
    </div>
  );
}
