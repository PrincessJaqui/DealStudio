/**
 * TeamSection — investor-facing team. Cards with photo, name, role, and links;
 * the bio expands in place so the grid stays scannable but the detail is there
 * for anyone who wants it.
 */
import { useState } from 'react';
import { ArrowUpRight, FileText } from 'lucide-react';
import { RichTextRenderer } from '../RichTextEditor';
import { PHOTO_RATIO, type DealTeamMember } from '../../lib/dealStudio';
import { useInViewOnce } from '../../lib/useInViewOnce';

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('');
}

function MemberCard({ m }: { m: DealTeamMember }) {
  const [open, setOpen] = useState(false);
  const longBio = (m.bio || '').length > 120;
  return (
    <div className="ds-pulse ds-card overflow-hidden rounded-xl border border-[#edf0f3] bg-white p-4">
      {/* A FLOAT, not a flex row. In a flex row the text sits in its own column and
          keeps that column's width even after the photo ends, which on a narrow
          phone leaves a tall empty gap under the photo. Floating the photo lets the
          name/role/bio wrap alongside it and then reclaim the FULL width once the
          text passes the bottom of the photo. Works for any photo ratio: a short
          logo releases the text sooner, a tall one later, automatically. */}
      <div
        className={`float-left mr-4 mb-2 w-24 sm:w-28 overflow-hidden bg-[#f5f6f8] flex items-center justify-center ${
          PHOTO_RATIO[m.photo_ratio ?? '1x1'].cls
        } ${
          (m.photo_ratio ?? '1x1') === '1x1' ? 'rounded-full' : 'rounded-2xl'
        } ${
          m.photo_ring === false
            ? ''
            : 'ring-8 ring-white shadow-[0_6px_18px_-3px_rgba(12,16,34,0.26)]'
        }`}
      >
        {m.photo_url
          ? <img
              src={m.photo_url}
              alt={m.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          : <span className="text-lg font-bold text-[#7f8c85]">{initials(m.name) || '·'}</span>}
      </div>
      <div className="min-w-0">
        <p className="text-base font-bold text-[#191f1d]">{m.name || 'Unnamed'}</p>
        {m.role && <p className="text-xs text-[#7f8c85]">{m.role}</p>}

        {m.bio && (
          <RichTextRenderer html={m.bio} className={`mt-2 text-sm leading-relaxed text-[#4a5565] ${open || !longBio ? '' : 'line-clamp-3'}`} />
        )}
        {longBio && (
          <div className="mt-1 flex justify-end">
            <button onClick={() => setOpen(o => !o)} className="text-xs font-semibold text-[var(--ds-brand)] hover:underline">
              {open ? 'Show less' : 'Read more'}
            </button>
          </div>
        )}

        {(m.links || []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {m.links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-[var(--ds-brd)] bg-white px-3 py-1 text-xs font-medium text-[var(--ds-brand)] hover:bg-[var(--ds-tint)] transition-colors"
              >
                {l.label || 'Link'} <ArrowUpRight className="w-3 h-3" />
              </a>
            ))}
          </div>
        )}
        {m.resume_url && (
          <div className="mt-2">
            <a href={m.resume_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-brd)] bg-white px-3 py-1 text-xs font-medium text-[var(--ds-brand)] hover:bg-[var(--ds-tint)] transition-colors">
              <FileText className="w-3.5 h-3.5" /> Resume
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function TeamSection({ team }: { team: DealTeamMember[] }) {
  const members = (team || []).filter(m => m && (m.name || m.role || m.bio));
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  if (members.length === 0) return null;
  return (
    <div ref={ref} data-section="team" className={`rounded-2xl border border-[#edf0f3] bg-white shadow-[0_8px_28px_-6px_rgba(12,16,34,0.14)] p-5 ${inView ? 'ds-animate' : ''}`}>
      <h2 className="text-sm font-bold text-[#191f1d] mb-3">Team</h2>
      <div className="space-y-3">
        {members.map((m, i) => <MemberCard key={i} m={m} />)}
      </div>
    </div>
  );
}
