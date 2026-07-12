/**
 * TeamEditor — admin editor for the Team tab. Controlled: every edit flows up
 * via onChange, which the screen debounces and auto-saves (no Save button).
 * Each member has name, role, uploaded photo, bio, and labelled links; members
 * reorder with the up/down controls.
 */
import { useState } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, UploadCloud, Image as ImageIcon, FileText } from 'lucide-react';
import { RichTextEditor } from '../RichTextEditor';
import { toast } from 'sonner@2.0.3';
import { uploadDealFile } from '../../lib/dealStudio';
import type { DealTeamMember, DealSource } from '../../lib/dealStudio';

const card = 'rounded-2xl border border-[#edf0f3] bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.06)] p-5';
const input = 'w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-sm text-[#191f1d] placeholder:text-[#9ca3af] focus:outline-none focus:border-[var(--ds-brand)]';
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
        <label className={`inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-brd)] bg-white px-3 py-2 text-sm font-medium text-[var(--ds-brand)] ${uploading ? 'opacity-60' : 'hover:bg-[var(--ds-tint)] cursor-pointer'}`}>
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
        <label className={`inline-flex items-center gap-1.5 rounded-xl border border-[var(--ds-brd)] bg-white px-3 py-2 text-sm font-medium text-[var(--ds-brand)] ${uploading ? 'opacity-60' : 'hover:bg-[var(--ds-tint)] cursor-pointer'}`}>
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
        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline">
        <Plus className="w-3.5 h-3.5" /> Add link
      </button>
    </div>
  );
}

export function TeamEditor({ value, onChange }: { value: DealTeamMember[] | null | undefined; onChange: (t: DealTeamMember[]) => void }) {
  const team: DealTeamMember[] = Array.isArray(value) ? value.map(x => ({ ...EMPTY_MEMBER, ...x })) : [];
  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [resumeUploading, setResumeUploading] = useState<Record<number, boolean>>({});
  const setMember = (i: number, patch: Partial<DealTeamMember>) => onChange(team.map((mm, j) => j === i ? { ...mm, ...patch } : mm));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir; if (j < 0 || j >= team.length) return;
    const next = team.slice(); [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  };

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-[#191f1d]">Team members</span>
          <button type="button" onClick={() => onChange([...team, { ...EMPTY_MEMBER }])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ds-brand)] hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add member
          </button>
        </div>
        <p className="mt-2 text-xs text-[#99a1af]">Upload a photo for each member. Order here is the order investors see. Changes save automatically.</p>
      </div>

      {team.length === 0 ? (
        <div className={card}><p className="text-sm text-[#99a1af]">No team members yet.</p></div>
      ) : team.map((m, i) => (
        <div key={i} className={card}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-[#7f8c85] uppercase tracking-wider">Member {i + 1}</span>
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
              onPick={async (file) => {
                setUploading(u => ({ ...u, [i]: true }));
                const r = await uploadDealFile(file);
                setUploading(u => ({ ...u, [i]: false }));
                if (r) setMember(i, { photo_url: r.url });
                else toast.error('Photo upload failed');
              }}
              onClear={() => setMember(i, { photo_url: '' })}
            />
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
            <div><label className={labelCls}>Links</label><div className="mt-2"><LinkList links={m.links} onChange={l => setMember(i, { links: l })} /></div></div>
          </div>
        </div>
      ))}
    </div>
  );
}
