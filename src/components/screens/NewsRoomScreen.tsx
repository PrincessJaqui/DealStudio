/**
 * NewsRoom composer, Phase 1a.
 *
 * Left: the update being edited, as a stack of content blocks the founder can
 * add, reorder, fill in, and remove. Right: the list of updates (drafts and
 * published) as cards, the blog-style archive. Publishing freezes an update and
 * makes it visible on the public page; the share link opens that page.
 *
 * No email, no investor selector, no gating yet. Those arrive with Phase 2.
 * Edits autosave (debounced), matching the rest of the admin.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Loader2, Check, Send, Copy,
  Link2, GripVertical, FileText,
} from 'lucide-react';
import {
  fetchMyNewsroom, fetchUpdates, createUpdate, saveUpdate, publishUpdate, deleteUpdate,
  emptyBlock, BLOCK_LABEL,
  type NewsRoom, type NewsUpdate, type NewsBlock, type BlockType,
} from '../../lib/newsroom';
import { webUrl } from '../../lib/runtime';

const ALL_BLOCKS: BlockType[] = [
  'overview', 'kpis', 'revenue', 'highlights', 'challenges',
  'team', 'news', 'gbu', 'quote', 'signature',
];

const card = 'bg-white rounded-2xl border border-[#edf0f3] shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)]';
const field = 'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const lbl = 'block text-[11px] font-semibold uppercase tracking-wider text-[#7f8c85] mb-1';

export function NewsRoomScreen() {
  const [room, setRoom] = useState<NewsRoom | null>(null);
  const [updates, setUpdates] = useState<NewsUpdate[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const r = await fetchMyNewsroom();
      if (!live || !r) { setLoading(false); return; }
      setRoom(r);
      const u = await fetchUpdates(r.id);
      if (!live) return;
      setUpdates(u);
      setActiveId(u[0]?.id ?? null);
      setLoading(false);
    })();
    return () => { live = false; };
  }, []);

  const active = useMemo(() => updates.find(u => u.id === activeId) ?? null, [updates, activeId]);

  // Autosave the active update, debounced.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!active) return;
    if (!mounted.current) { mounted.current = true; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void saveUpdate(active.id, { title: active.title, blocks: active.blocks, kpis: active.kpis })
        .then(ok => { if (ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); } });
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.title, active?.blocks, active?.kpis]);

  const patchActive = (patch: Partial<NewsUpdate>) =>
    setUpdates(list => list.map(u => (u.id === activeId ? { ...u, ...patch } : u)));

  const patchBlock = (blockId: string, data: any) =>
    patchActive({ blocks: (active?.blocks ?? []).map(b => (b.id === blockId ? { ...b, data } : b)) });

  const addBlock = (type: BlockType) =>
    patchActive({ blocks: [...(active?.blocks ?? []), emptyBlock(type)] });

  const removeBlock = (blockId: string) =>
    patchActive({ blocks: (active?.blocks ?? []).filter(b => b.id !== blockId) });

  const moveBlock = (i: number, dir: -1 | 1) => {
    const blocks = [...(active?.blocks ?? [])];
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    patchActive({ blocks });
  };

  const newDraft = async () => {
    if (!room) return;
    const seed = updates.find(u => u.status === 'published') ?? updates[0];
    const u = await createUpdate(room.id, seed);
    if (u) { setUpdates(list => [u, ...list]); setActiveId(u.id); }
  };

  const publish = async () => {
    if (!active) return;
    await saveUpdate(active.id, { title: active.title, blocks: active.blocks, kpis: active.kpis });
    const ok = await publishUpdate(active.id);
    if (ok) patchActive({ status: 'published', published_at: new Date().toISOString() });
  };

  const removeUpdate = async (id: string) => {
    const ok = await deleteUpdate(id);
    if (ok) {
      setUpdates(list => {
        const next = list.filter(u => u.id !== id);
        if (activeId === id) setActiveId(next[0]?.id ?? null);
        return next;
      });
    }
  };

  const copyLink = () => {
    if (!room) return;
    navigator.clipboard?.writeText(webUrl(`/news/${room.share_token}`));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 py-16 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-[var(--ds-brand)]" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 pb-16">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[#191f1d] leading-tight">NewsRoom</h1>
          <p className="text-sm text-[#7f8c85]">Publish traction updates your investors can follow over time.</p>
        </div>
        <div className="flex items-center gap-2">
          {room && (
            <button onClick={copyLink} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-[#edf0f3] text-sm font-medium text-[#191f1d] hover:bg-[#f5f6f8]">
              {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Link2 className="w-4 h-4" /> Share link</>}
            </button>
          )}
          <button onClick={() => void newDraft()} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110">
            <Plus className="w-4 h-4" /> New update
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        {/* Editor */}
        <div className="space-y-4 order-2 lg:order-1">
          {!active ? (
            <div className={`${card} p-10 text-center`}>
              <FileText className="w-8 h-8 mx-auto text-[#c7cdd4]" />
              <p className="mt-3 text-sm text-[#7f8c85]">No updates yet. Create your first one to get started.</p>
              <button onClick={() => void newDraft()} className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]">
                <Plus className="w-4 h-4" /> New update
              </button>
            </div>
          ) : (
            <>
              <div className={`${card} p-5`}>
                <label className={lbl}>Update title</label>
                <input
                  value={active.title}
                  onChange={e => patchActive({ title: e.target.value })}
                  placeholder="e.g. March 2026 Investor Update"
                  className={`${field} text-base font-semibold`}
                />
                <div className="flex items-center justify-between mt-3">
                  <span className={`text-xs font-medium ${active.status === 'published' ? 'text-[var(--ds-brand)]' : 'text-[#99a1af]'}`}>
                    {active.status === 'published' ? 'Published' : 'Draft'}
                    {saved && <span className="ml-2 text-[#7f8c85]"><Check className="w-3 h-3 inline" /> Saved</span>}
                  </span>
                  <button onClick={() => void publish()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] hover:brightness-110">
                    <Send className="w-4 h-4" /> {active.status === 'published' ? 'Republish' : 'Publish'}
                  </button>
                </div>
              </div>

              {active.blocks.map((b, i) => (
                <BlockEditor
                  key={b.id}
                  block={b}
                  onChange={data => patchBlock(b.id, data)}
                  onRemove={() => removeBlock(b.id)}
                  onUp={() => moveBlock(i, -1)}
                  onDown={() => moveBlock(i, 1)}
                  isFirst={i === 0}
                  isLast={i === active.blocks.length - 1}
                />
              ))}

              {/* Add-block bar */}
              <div className={`${card} p-4`}>
                <p className={lbl}>Add a section</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_BLOCKS.map(t => (
                    <button
                      key={t}
                      onClick={() => addBlock(t)}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-full text-xs font-medium text-[#191f1d] bg-[#f5f6f8] hover:bg-[#edf0f3]"
                    >
                      <Plus className="w-3 h-3" /> {BLOCK_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Update list (blog archive) */}
        <div className="order-1 lg:order-2">
          <div className={`${card} p-4 lg:sticky lg:top-4`}>
            <p className={lbl}>Updates</p>
            {updates.length === 0 ? (
              <p className="text-sm text-[#99a1af] py-3">Nothing yet.</p>
            ) : (
              <div className="space-y-1.5">
                {updates.map(u => (
                  <div
                    key={u.id}
                    className={`group rounded-xl px-3 py-2.5 cursor-pointer transition ${u.id === activeId ? 'bg-[var(--ds-tint)]' : 'hover:bg-[#f5f6f8]'}`}
                    onClick={() => setActiveId(u.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-[#191f1d] truncate">{u.title}</span>
                      <button
                        onClick={e => { e.stopPropagation(); void removeUpdate(u.id); }}
                        className="opacity-0 group-hover:opacity-100 text-[#c7cdd4] hover:text-red-500 shrink-0"
                        aria-label="Delete update"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className={`text-[11px] ${u.status === 'published' ? 'text-[var(--ds-brand)]' : 'text-[#99a1af]'}`}>
                      {u.status === 'published'
                        ? new Date(u.published_at || u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'Draft'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Per-block editors ─────────────────────────────────────────────────────────

function BlockEditor({
  block, onChange, onRemove, onUp, onDown, isFirst, isLast,
}: {
  block: NewsBlock; onChange: (d: any) => void; onRemove: () => void;
  onUp: () => void; onDown: () => void; isFirst: boolean; isLast: boolean;
}) {
  const d = block.data;
  const list = (items: string[], set: (v: string[]) => void, placeholder: string) => (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={it}
            onChange={e => set(items.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={placeholder}
            className={field}
          />
          <button onClick={() => set(items.filter((_, j) => j !== i))} className="shrink-0 w-9 h-9 rounded-xl bg-[#f5f6f8] hover:bg-[#edf0f3] flex items-center justify-center text-[#99a1af]" aria-label="Remove">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button onClick={() => set([...items, ''])} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)]">
        <Plus className="w-3 h-3" /> Add
      </button>
    </div>
  );

  return (
    <div className={`${card} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-[#c7cdd4]" />
          <h3 className="text-sm font-bold text-[#191f1d]">{BLOCK_LABEL[block.type]}</h3>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onUp} disabled={isFirst} className="w-7 h-7 rounded-lg hover:bg-[#f5f6f8] disabled:opacity-30 flex items-center justify-center" aria-label="Move up"><ChevronUp className="w-4 h-4" /></button>
          <button onClick={onDown} disabled={isLast} className="w-7 h-7 rounded-lg hover:bg-[#f5f6f8] disabled:opacity-30 flex items-center justify-center" aria-label="Move down"><ChevronDown className="w-4 h-4" /></button>
          <button onClick={onRemove} className="w-7 h-7 rounded-lg hover:bg-red-50 text-[#c7cdd4] hover:text-red-500 flex items-center justify-center" aria-label="Remove section"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>

      {block.type === 'overview' && (
        <textarea value={d.text} onChange={e => onChange({ text: e.target.value })} placeholder="A short narrative for this update." className={`${field} min-h-[100px] resize-y`} />
      )}

      {block.type === 'kpis' && (
        <div className="space-y-2">
          {(d.items as any[]).map((k, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input value={k.label} onChange={e => onChange({ items: d.items.map((x: any, j: number) => j === i ? { ...x, label: e.target.value } : x) })} placeholder="Metric (e.g. Revenue)" className={field} />
              <input value={k.value} onChange={e => onChange({ items: d.items.map((x: any, j: number) => j === i ? { ...x, value: e.target.value } : x) })} placeholder="Value" className={field} />
              <button onClick={() => onChange({ items: d.items.filter((_: any, j: number) => j !== i) })} className="w-9 h-9 rounded-xl bg-[#f5f6f8] hover:bg-[#edf0f3] flex items-center justify-center text-[#99a1af]" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => onChange({ items: [...d.items, { key: crypto.randomUUID(), label: '', value: '' }] })} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)]"><Plus className="w-3 h-3" /> Add metric</button>
          <p className="text-[11px] text-[#99a1af]">Trends across updates come in a later release; values are saved now so history builds up.</p>
        </div>
      )}

      {block.type === 'revenue' && (
        <div className="grid sm:grid-cols-2 gap-3">
          {[['qualified', 'Qualified leads'], ['closed', 'Closed'], ['mrr', 'MRR'], ['arr', 'ARR'], ['oneTime', 'One-time'], ['projection', 'Projection from qualified']].map(([k, label]) => (
            <div key={k}><label className={lbl}>{label}</label><input value={d[k]} onChange={e => onChange({ ...d, [k]: e.target.value })} className={field} /></div>
          ))}
          <div className="sm:col-span-2"><label className={lbl}>Note</label><input value={d.note} onChange={e => onChange({ ...d, note: e.target.value })} placeholder="Up or down since last period, and why." className={field} /></div>
        </div>
      )}

      {block.type === 'highlights' && list(d.items, items => onChange({ items }), 'A win this period.')}
      {block.type === 'challenges' && list(d.items, items => onChange({ items }), 'A challenge you are working through.')}

      {block.type === 'team' && (
        <textarea value={d.text} onChange={e => onChange({ ...d, text: e.target.value })} placeholder="Team news: hires, changes, shout-outs." className={`${field} min-h-[80px] resize-y`} />
      )}

      {block.type === 'news' && (
        <div className="space-y-2">
          {(d.items as any[]).map((n, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input value={n.title} onChange={e => onChange({ items: d.items.map((x: any, j: number) => j === i ? { ...x, title: e.target.value } : x) })} placeholder="Headline" className={field} />
              <input value={n.url} onChange={e => onChange({ items: d.items.map((x: any, j: number) => j === i ? { ...x, url: e.target.value } : x) })} placeholder="https://..." className={field} />
              <button onClick={() => onChange({ items: d.items.filter((_: any, j: number) => j !== i) })} className="w-9 h-9 rounded-xl bg-[#f5f6f8] hover:bg-[#edf0f3] flex items-center justify-center text-[#99a1af]" aria-label="Remove"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
          <button onClick={() => onChange({ items: [...d.items, { title: '', url: '' }] })} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)]"><Plus className="w-3 h-3" /> Add link</button>
        </div>
      )}

      {block.type === 'gbu' && (
        <div className="space-y-3">
          {[['good', 'Good'], ['bad', 'Bad'], ['ugly', 'Ugly']].map(([k, label]) => (
            <div key={k}><label className={lbl}>{label}</label><textarea value={d[k]} onChange={e => onChange({ ...d, [k]: e.target.value })} className={`${field} min-h-[60px] resize-y`} /></div>
          ))}
        </div>
      )}

      {block.type === 'quote' && (
        <div className="space-y-2">
          <textarea value={d.text} onChange={e => onChange({ ...d, text: e.target.value })} placeholder="A quote to feature." className={`${field} min-h-[70px] resize-y`} />
          <input value={d.attribution} onChange={e => onChange({ ...d, attribution: e.target.value })} placeholder="Attribution" className={field} />
        </div>
      )}

      {block.type === 'signature' && (
        <div className="space-y-2">
          <input value={d.name} onChange={e => onChange({ ...d, name: e.target.value })} placeholder="Name" className={field} />
          <input value={d.role} onChange={e => onChange({ ...d, role: e.target.value })} placeholder="Role" className={field} />
          <textarea value={d.text} onChange={e => onChange({ ...d, text: e.target.value })} placeholder="Closing note." className={`${field} min-h-[60px] resize-y`} />
        </div>
      )}
    </div>
  );
}
