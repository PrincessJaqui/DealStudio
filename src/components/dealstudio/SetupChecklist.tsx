/**
 * Setup checklist. The guided path from "I just signed up" to "my deal room is
 * live and shared".
 *
 * Every step reads its done state from REAL data, never from a box the founder
 * ticked. A checklist you can satisfy by clicking is a to-do list; one that
 * watches the actual deal is a progress meter. So "Upload your pitch deck" goes
 * green when a deck document exists, and goes back to open if they delete it.
 *
 * Placement rules, per the brief:
 *   Desktop  drag it anywhere by the header, position remembered. It floats over
 *            the app, so it must be movable when it covers something.
 *   Mobile   pinned to the bottom edge as a sheet, no dragging (there is nowhere
 *            to drag to), and it minimizes to a small pill instead.
 *
 * It disappears on its own once every step is done, and stays gone. Nobody wants
 * a permanent reminder that they finished.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, GripVertical, Minus, X } from 'lucide-react';
import { adminFetchDealStudio, type DealStudio } from '../../lib/dealStudio';
import { useAdminAuth } from './AdminGate';

const POS_KEY = 'ds-setup-pos';
const MIN_KEY = 'ds-setup-min';
const HIDE_KEY = 'ds-setup-hidden';

type Step = { key: string; title: string; desc: string; done: boolean; to: string };

/** Does this schedule have at least one real opening? */
function hasAvailability(deal: DealStudio | null): boolean {
  const av: any = deal?.availability;
  if (!av) return false;
  const dates = Array.isArray(av) ? av : (av.dates ?? av.days ?? []);
  return Array.isArray(dates) && dates.length > 0;
}

function buildSteps(deal: DealStudio | null, logoUrl: string | null): Step[] {
  // No deal yet: the only thing that matters is creating one.
  if (!deal) {
    return [{
      key: 'create',
      title: 'Create your deal room',
      desc: 'Start with your company name and raise.',
      done: false,
      to: '/admin',
    }];
  }

  return [
    {
      key: 'logo',
      title: 'Add your company logo',
      desc: 'How investors recognise you.',
      done: !!logoUrl,
      to: '/admin/settings',
    },
    {
      key: 'basics',
      title: 'Name your company and write a one-liner',
      desc: 'The first line an investor reads.',
      done: !!deal.company_name?.trim() && !!deal.one_liner?.trim(),
      to: '/admin#details',
    },
    {
      key: 'raise',
      title: 'Set your raise details',
      desc: 'Goal, round, and key numbers.',
      done: Number(deal.raise_goal) > 0,
      to: '/admin#details',
    },
    {
      key: 'deck',
      title: 'Upload your pitch deck',
      desc: 'The first thing most investors open.',
      done: !!deal.deck_document_id,
      to: '/admin#documents',
    },
    {
      key: 'team',
      title: 'Add your team',
      desc: 'Photos, roles, and links.',
      done: (deal.team?.length ?? 0) > 0,
      to: '/admin#team',
    },
    {
      key: 'calendar',
      title: 'Open your meeting calendar',
      desc: 'Let investors book time with you.',
      done: !!deal.meeting_enabled && hasAvailability(deal),
      to: '/admin#settings',
    },
    {
      key: 'share',
      title: 'Share your deal room',
      desc: 'Send the link and start tracking who reads.',
      done: !!deal.is_active && !!deal.allow_share,
      to: '/admin#settings',
    },
  ];
}

export function SetupChecklist() {
  const { org } = useAdminAuth();
  const nav = useNavigate();

  const [deal, setDeal] = useState<DealStudio | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [min, setMin] = useState(() => {
    try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; }
  });
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });

  const cardRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const d = await adminFetchDealStudio();
      if (!live) return;
      setDeal(d);
      setLoaded(true);
    })();
    return () => { live = false; };
  }, []);

  useEffect(() => { try { localStorage.setItem(MIN_KEY, min ? '1' : '0'); } catch { /* private mode */ } }, [min]);
  useEffect(() => { try { localStorage.setItem(HIDE_KEY, hidden ? '1' : '0'); } catch { /* private mode */ } }, [hidden]);

  const steps = buildSteps(deal, org?.logo_url ?? null);
  const done = steps.filter(s => s.done).length;
  const total = steps.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const complete = done === total;

  // Finished, and stays finished. Written once so it does not come back.
  useEffect(() => {
    if (loaded && complete && !hidden) {
      const t = setTimeout(() => setHidden(true), 2600);
      return () => clearTimeout(t);
    }
  }, [loaded, complete, hidden]);

  // Drag, desktop only. Clamped so it can never be dropped off-screen.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (window.matchMedia('(max-width: 767px)').matches) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    const el = cardRef.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(e.clientX - d.dx, window.innerWidth - r.width - 8));
    const y = Math.max(8, Math.min(e.clientY - d.dy, window.innerHeight - r.height - 8));
    setPos({ x, y });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setPos(p => {
      if (p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* private mode */ } }
      return p;
    });
  }, []);

  if (!loaded || hidden) return null;

  // Desktop uses the remembered position; mobile always sits at the bottom edge.
  const deskStyle = pos
    ? { left: pos.x, top: pos.y, right: 'auto' as const, bottom: 'auto' as const }
    : { right: 24, bottom: 24 };

  if (min) {
    return (
      <button
        onClick={() => setMin(false)}
        style={deskStyle}
        className="fixed z-[60] max-md:left-1/2 max-md:-translate-x-1/2 max-md:bottom-5 max-md:right-auto max-md:top-auto
                   inline-flex items-center gap-2.5 rounded-full px-4 py-2.5 text-white
                   bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]
                   shadow-[0_18px_44px_-12px_rgba(12,16,34,0.28)] hover:brightness-110 transition"
      >
        <span className="relative w-[22px] h-[22px] shrink-0">
          <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90">
            <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="11" cy="11" r="9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 9}
              strokeDashoffset={(2 * Math.PI * 9) * (1 - pct / 100)}
            />
          </svg>
        </span>
        <span className="text-[12.5px] font-bold whitespace-nowrap">Finish setup, {done}/{total}</span>
      </button>
    );
  }

  return (
    <section
      ref={cardRef as any}
      style={deskStyle}
      className="fixed z-[60] w-[340px] max-md:w-auto max-md:left-0 max-md:right-0 max-md:bottom-0 max-md:top-auto
                 bg-white border border-[#edf0f3] rounded-[18px] max-md:rounded-b-none max-md:rounded-t-[18px]
                 shadow-[0_18px_44px_-12px_rgba(12,16,34,0.28)] overflow-hidden"
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex items-center gap-2.5 px-3.5 pt-3.5 pb-3 text-white select-none
                   md:cursor-grab md:active:cursor-grabbing
                   bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]"
      >
        <GripVertical className="w-3.5 h-3.5 opacity-70 shrink-0 max-md:hidden" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight">
            {complete ? 'Your deal room is ready' : 'Set up your deal room'}
          </p>
          <p className="text-[11px] opacity-85 mt-0.5">{done} of {total} done</p>
        </div>
        <div className="ml-auto flex gap-0.5 shrink-0">
          <button
            onClick={() => setMin(true)}
            aria-label="Minimize"
            className="w-7 h-7 rounded-[9px] bg-white/15 hover:bg-white/25 grid place-items-center transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setHidden(true)}
            aria-label="Hide setup checklist"
            className="w-7 h-7 rounded-[9px] bg-white/15 hover:bg-white/25 grid place-items-center transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      <div className="px-3.5 pt-3 pb-1">
        <div className="h-1.5 rounded-full bg-[#f5f6f8] overflow-hidden">
          <i
            className="block h-full rounded-full bg-gradient-to-r from-[var(--ds-accent)] to-[var(--ds-accent-to)] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-[#7f8c85]">
          <span><b className="text-[#191f1d]">{done}</b> of <b className="text-[#191f1d]">{total}</b> complete</span>
          <span>{pct}%</span>
        </div>
      </div>

      <div className="px-1.5 pb-2.5 pt-1 max-h-[320px] max-md:max-h-[46vh] overflow-y-auto">
        {steps.map(s => (
          <button
            key={s.key}
            onClick={() => { nav(s.to); }}
            className="w-full flex items-start gap-2.5 px-2 py-2.5 rounded-[11px] text-left hover:bg-[#f5f6f8] transition"
          >
            <span
              className={`w-[19px] h-[19px] shrink-0 rounded-full mt-0.5 grid place-items-center transition-all ${
                s.done
                  ? 'bg-gradient-to-br from-[var(--ds-accent)] to-[var(--ds-accent-to)]'
                  : 'border-[1.8px] border-[#d7dbe0]'
              }`}
            >
              {s.done && <Check className="w-3 h-3 text-[var(--ds-on-accent)]" strokeWidth={3} />}
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-semibold leading-snug ${s.done ? 'text-[#99a1af] line-through decoration-[#d7dbe0]' : 'text-[#191f1d]'}`}>
                {s.title}
              </span>
              <span className={`block text-[11px] mt-0.5 leading-snug ${s.done ? 'text-[#c7cdd4]' : 'text-[#7f8c85]'}`}>
                {s.desc}
              </span>
            </span>
          </button>
        ))}
      </div>

      <p className="border-t border-[#edf0f3] px-3.5 py-2.5 text-[11px] text-[#99a1af] max-md:hidden">
        Drag the header to move this anywhere.
      </p>
    </section>
  );
}
