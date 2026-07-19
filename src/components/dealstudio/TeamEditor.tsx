/**
 * TeamEditor — admin editor for the Team tab. Controlled: every edit flows up
 * via onChange, which the screen debounces and auto-saves (no Save button).
 * Each member has name, role, uploaded photo, bio, and labelled links; members
 * reorder with the up/down controls.
 */
import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, UploadCloud, Image as ImageIcon, FileText } from 'lucide-react';
import { SectionHeader, AddButton } from './SectionHeader';
import { RichTextEditor } from '../RichTextEditor';
import { toast } from 'sonner@2.0.3';
import { uploadDealFile, PHOTO_RATIO } from '../../lib/dealStudio';
import { LogoCropper } from './LogoCropper';
import type { DealTeamMember, DealSource } from '../../lib/dealStudio';

const card = 'rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5';
const input = 'w-full rounded-xl bg-[#f5f6f8] px-3 py-2.5 text-sm text-[#191f1d] placeholder:text-[#9ca3af] outline-none focus:ring-2 focus:ring-[var(--ds-brand)]/30';
const labelCls = 'text-xs font-semibold text-[#7f8c85] uppercase tracking-wider';

const EMPTY_MEMBER: DealTeamMember = { name: '', role: '', bio: '', photo_url: '', links: [] };

function PhotoField({ url, uploading, onPick, onClear }: { url: string; uploading: boolean; onPick: (f: File) => void; onClear: () => void }) {
  return (
    <div>
      <label className={labelCls}>Photo</label>
      <div className="mt-1 flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-[#edf0f3] bg-[var(--ds-tint)] flex items-center justify-center">
          {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="w-5 h-5 text-[var(--ds-muted)]" />}
        </div>
        <label className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 ${uploading ? 'opacity-60' : 'cursor-pointer'}`}>
          <UploadCloud className="w-4 h-4" /> {uploading ? 'Uploading...' : url ? 'Change photo' : 'Upload photo'}
          <input type="file" accept="image/*" className="hidden" disabled={uploading}
            onChange={e => { const file = e.target.files?.[0]; if (file) onPick(file); e.currentTarget.value = ''; }} />
        </label>
        {url && !uploading && (
          <button type="button" onClick={onClear} className="text-xs font-medium text-[#99a1af] hover:text-[#dc2626]">Remove</button>
        )}
      </div>
    </div>
  );
}

function ResumeField({ url, name, uploading, onPick, onLink, onClear }: { url: string; name: string; uploading: boolean; onPick: (f: File) => void; onLink: (u: string) => void; onClear: () => void }) {
  return (
    <div>
      <label className={labelCls}>Resume</label>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-brd)] bg-[var(--ds-tint)] px-3 py-2 text-sm font-medium text-[var(--ds-brand)] hover:bg-[var(--ds-tint-4)] max-w-[220px]">
            <FileText className="w-4 h-4 shrink-0" /> <span className="truncate">{name || 'View resume'}</span>
          </a>
        ) : null}
        <label className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] px-3 py-2 text-sm font-medium text-white hover:brightness-110 ${uploading ? 'opacity-60' : 'cursor-pointer'}`}>
          <UploadCloud className="w-4 h-4" /> {uploading ? 'Uploading...' : url ? 'Replace PDF' : 'Upload PDF'}
          <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploading}
            onChange={e => { const file = e.target.files?.[0]; if (file) onPick(file); e.currentTarget.value = ''; }} />
        </label>
        {url && !uploading && (
          <button type="button" onClick={onClear} className="text-xs font-medium text-[#99a1af] hover:text-[#dc2626]">Remove</button>
        )}
      </div>
      <input className={input + ' mt-2'} placeholder="Or paste a resume link (https://...)" value={name ? '' : url}
        onChange={e => onLink(e.target.value)} />
    </div>
  );
}

/**
 * The six named socials, stored in the SAME `links` array as everything else,
 * keyed by label. No new column and no migration: a social is just a link whose
 * label we control, so the investor page renders it with the existing pills.
 *
 * Clearing a field removes that link rather than leaving an empty pill behind.
 */
const SOCIALS = ['LinkedIn', 'Instagram', 'X', 'Facebook', 'Threads', 'TikTok'] as const;

const SOCIAL_HINT: Record<string, string> = {
  LinkedIn:  'https://linkedin.com/in/...',
  Instagram: 'https://instagram.com/...',
  X:         'https://x.com/...',
  Facebook:  'https://facebook.com/...',
  Threads:   'https://threads.net/@...',
  TikTok:    'https://tiktok.com/@...',
};

function SocialLinks({ links, onChange }: { links: DealSource[]; onChange: (l: DealSource[]) => void }) {
  const valueOf = (name: string) => links.find(l => l.label === name)?.url ?? '';

  const setSocial = (name: string, url: string) => {
    const rest = links.filter(l => l.label !== name);
    onChange(url.trim() ? [...rest, { label: name, url: url.trim() }] : rest);
  };

  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {SOCIALS.map(name => (
        <div key={name}>
          <label className="block text-[11px] font-semibold text-[#7f8c85] mb-1">{name}</label>
          <input
            className={input}
            placeholder={SOCIAL_HINT[name]}
            value={valueOf(name)}
            onChange={e => setSocial(name, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function LinkList({ links, onChange }: { links: DealSource[]; onChange: (l: DealSource[]) => void }) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <input className={input + ' flex-[2]'} placeholder="Label (e.g. LinkedIn)" value={l.label}
            onChange={e => onChange(links.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
          <input className={input + ' flex-[3]'} placeholder="https://..." value={l.url}
            onChange={e => onChange(links.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
          <button type="button" onClick={() => onChange(links.filter((_, j) => j !== i))}
            className="shrink-0 rounded-lg p-2 text-[#99a1af] hover:bg-[#fef2f2] hover:text-[#dc2626]" aria-label="Remove link">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...links, { label: '', url: '' }])}
        className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-semibold text-[#191f1d] bg-[#f5f6f8] hover:bg-[#edf0f3] transition">
        <Plus className="w-4 h-4" /> Link
      </button>
    </div>
  );
}

export function TeamEditor({ value, onChange }: { value: DealTeamMember[] | null | undefined; onChange: (t: DealTeamMember[]) => void }) {
  const team: DealTeamMember[] = Array.isArray(value) ? value.map(x => ({ ...EMPTY_MEMBER, ...x })) : [];
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  // A picked photo is cropped to a square before it is uploaded. Head-and-
  // shoulders photos arrive at every aspect ratio, and an un-cropped one makes
  // the team row look broken.
  const [crop, setCrop] = useState<{ index: number; file: File } | null>(null);
  const [resumeUploading, setResumeUploading] = useState<Record<number, boolean>>({});
  const setMember = (i: number, patch: Partial<DealTeamMember>) => onChange(team.map((mm, j) => j === i ? { ...mm, ...patch } : mm));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= team.length) return;
    const next = team.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };

  return (
    <>
      <div className="space-y-4">
      {/* The header this tab already had, now the shared one, so it cannot drift
          from the other tabs again. */}
      <SectionHeader
        title="Team members"
        summary="The people investors are backing. The order here is the order they see."
        action={<AddButton label="Member" onClick={() => onChange([...team, { ...EMPTY_MEMBER }])} />}
      />

      {team.length === 0 ? (
        <div className={card}><p className="text-sm text-[#99a1af]">No team members yet.</p></div>
      ) : team.map((m, i) => (
        <div key={i} className={card}>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-bold text-[#191f1d]">Member {i + 1}</h4>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                className="rounded-lg p-2 text-[#99a1af] hover:bg-[#f5f7f9] disabled:opacity-30" aria-label="Move up"><ArrowUp className="w-4 h-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === team.length - 1}
                className="rounded-lg p-2 text-[#99a1af] hover:bg-[#f5f7f9] disabled:opacity-30" aria-label="Move down"><ArrowDown className="w-4 h-4" /></button>
              <button type="button" onClick={() => onChange(team.filter((_, j) => j !== i))}
                className="rounded-lg p-2 text-[#99a1af] hover:bg-[#fef2f2] hover:text-[#dc2626]" aria-label="Remove member"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Name</label><input className={input + ' mt-1'} placeholder="Jane Doe" value={m.name} onChange={e => setMember(i, { name: e.target.value })} /></div>
              <div><label className={labelCls}>Role</label><input className={input + ' mt-1'} placeholder="Co-founder &amp; CEO" value={m.role} onChange={e => setMember(i, { role: e.target.value })} /></div>
            </div>
            <PhotoField
              url={m.photo_url}
              uploading={!!uploading[i]}
              onPick={(file) => setCrop({ index: i, file })}
              onClear={() => setMember(i, { photo_url: '' })}
            />

            {/* Shape. The width in the investor view never changes -- the ratio
                changes the height -- so a row of cards keeps a straight edge
                whatever each founder picks. */}
            <div>
              <label className={labelCls}>Photo shape</label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {(['1x1', '2x3', '9x16'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setMember(i, { photo_ratio: r })}
                    className={`h-8 px-3 rounded-lg text-xs font-semibold border transition ${
                      (m.photo_ratio ?? '1x1') === r
                        ? 'bg-[var(--ds-tint)] text-[var(--ds-brand)] border-[var(--ds-brand)]/30'
                        : 'bg-white text-[#7f8c85] border-[#edf0f3] hover:text-[#191f1d]'
                    }`}
                  >
                    {PHOTO_RATIO[r].label}
                  </button>
                ))}

                <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-[#7f8c85] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={m.photo_ring !== false}
                    onChange={(e) => setMember(i, { photo_ring: e.target.checked })}
                    className="accent-[var(--ds-brand)]"
                  />
                  Ring and shadow
                </label>
              </div>
            </div>
            <div><label className={labelCls}>Bio</label><div className="mt-1"><RichTextEditor value={m.bio} onChange={(html) => setMember(i, { bio: html })} placeholder="Short bio." /></div></div>
            <ResumeField
              url={m.resume_url || ''}
              name={m.resume_name || ''}
              uploading={!!resumeUploading[i]}
              onPick={async (file) => {
                setResumeUploading(u => ({ ...u, [i]: true }));
                const r = await uploadDealFile(file);
                setResumeUploading(u => ({ ...u, [i]: false }));
                if (r) setMember(i, { resume_url: r.url, resume_name: r.name || file.name });
                else toast.error('Resume upload failed');
              }}
              onLink={(u) => setMember(i, { resume_url: u, resume_name: '' })}
              onClear={() => setMember(i, { resume_url: '', resume_name: '' })}
            />
            <div>
              <label className={labelCls}>Social links</label>
              <div className="mt-2">
                <SocialLinks links={m.links} onChange={l => setMember(i, { links: l })} />
              </div>
            </div>

            {/* Anything that is not one of the six named socials. Filtered so a
                social does not also appear here as an editable free-text row. */}
            <div>
              <label className={labelCls}>Other links</label>
              <div className="mt-2">
                <LinkList
                  links={m.links.filter(l => !SOCIALS.includes(l.label as typeof SOCIALS[number]))}
                  onChange={others => setMember(i, {
                    links: [
                      ...m.links.filter(l => SOCIALS.includes(l.label as typeof SOCIALS[number])),
                      ...others,
                    ],
                  })}
                />
              </div>
            </div>
          </div>
        </div>
      ))}
      </div>

      {crop && (
        <LogoCropper
          file={crop.file}
          onCancel={() => setCrop(null)}
          onCropped={async (blob) => {
            const i = crop.index;
            setCrop(null);
            setUploading(u => ({ ...u, [i]: true }));
            // Name and type come from the BLOB, not from a guess. The cropper now
            // exports WebP where the browser supports it, and uploading WebP bytes
            // under a PNG content type gives you a file no browser will render.
            const ext = blob.type === 'image/webp' ? 'webp' : 'png';
            const file = new File([blob], `photo.${ext}`, { type: blob.type });
            const r = await uploadDealFile(file);
            setUploading(u => ({ ...u, [i]: false }));
            if (r) setMember(i, { photo_url: r.url });
            else toast.error('Photo upload failed');
          }}
        />
      )}
    </>
  );
}
