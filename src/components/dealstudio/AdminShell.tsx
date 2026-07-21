/**
 * AdminShell — persistent chrome for every authenticated surface.
 * Desktop: a fixed left sidebar.
 * Mobile: a top bar (hamburger left, wordmark centre, user right) that opens a
 * slide-in drawer for navigation and a small menu for the account.
 */

import { webUrl } from '../../lib/runtime';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Presentation, Palette, Settings, LogOut, Menu, X, User, UserPlus, CreditCard, Shield, Home, BarChart3, Wallet, Users2 } from 'lucide-react';
import dsMark from '../../assets/dealstudio-mark.png';
import { useAdminAuth } from './AdminGate';
import { SetupChecklist } from './SetupChecklist';
import { isPlatformAdmin } from '../../lib/billing';
import { supabase } from '../../lib/supabase';

const DEAL_NAV = [
  { to: '/admin', label: 'Deal Studio', Icon: Presentation, end: true },
  { to: '/admin/dealflow', label: 'Deal Flow', Icon: Users2, end: false },
  { to: '/admin/interface', label: 'Interface Studio', Icon: Palette, end: false },
];
const BILLING_NAV  = { to: '/admin/billing', label: 'Billing', Icon: CreditCard, end: false };

// The master console is three destinations now, not one page with tabs. Its own
// group so it reads as a distinct block at the top of a platform admin's rail.
const MASTER_NAV = [
  { to: '/admin/master',     label: 'Dashboard',       Icon: BarChart3, end: false },
  { to: '/admin/users',      label: 'User Management', Icon: Shield,    end: false },
  { to: '/admin/financials', label: 'Financials',      Icon: Wallet,    end: false },
];
const SETTINGS_NAV = { to: '/admin/settings', label: 'System Settings', Icon: Settings, end: false };

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
    isActive
      ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
      : 'text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]'
  }`;

export function AdminShell({ children }: { children: ReactNode }) {
  const { signOut, org } = useAdminAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const [drawer, setDrawer] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [invited, setInvited] = useState(false);

  /** Share the product, not the deal room. Copies the signup link, and uses the
   *  native share sheet on a phone where one exists. */
  const inviteFriends = async () => {
    const url = webUrl('/signup');
    const text = 'I am using DealStudio to run my raise. Investor deal rooms, live analytics.';

    if (navigator.share) {
      try {
        await navigator.share({ title: 'DealStudio', text, url });
        return;
      } catch {
        // Cancelled the share sheet. Fall through to copying.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setInvited(true);
      setTimeout(() => setInvited(false), 2000);
    } catch {
      /* clipboard blocked; nothing useful to do */
    }
  };
  const [isMaster, setIsMaster] = useState(false);

  // The signed-in user's own name, for the header. Doubles as an at-a-glance
  // check of WHO you are logged in as, which matters because the master-admin
  // views (Investors, Analytics) are gated on this identity being an admin.
  const [me, setMe] = useState<{ name: string | null; email: string | null }>({ name: null, email: null });

  useEffect(() => { void isPlatformAdmin().then(setIsMaster); }, []);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      setMe({
        name: (u?.user_metadata as any)?.full_name ?? null,
        email: u?.email ?? null,
      });
    });
  }, []);
  // Name if we have it, else the email, else a neutral fallback.
  const myLabel = me.name || me.email || (isMaster ? 'Master Admin' : 'Admin');
  const NAV = isMaster
    ? [...MASTER_NAV, ...DEAL_NAV, SETTINGS_NAV]
    : [...DEAL_NAV, BILLING_NAV, SETTINGS_NAV];

  // Navigating closes any open overlay, so the drawer never lingers.
  useEffect(() => { setDrawer(false); setUserMenu(false); }, [loc.pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer]);

  const initial = (org?.name || 'D').trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f5f6f8]">
      {/* Full-width top header: wordmark left, company right */}
      <header className="hidden md:flex sticky top-0 z-30 h-[68px] items-center bg-white border-b border-[#edf0f3] px-6">
        {/* Ours, deliberately. This is the product frame around the app; the
            founder's own brand appears on their deal and their investor room. */}
        <button onClick={() => nav('/admin')} className="flex items-center gap-2.5">
          <img src={dsMark} alt="" className="h-8 w-8 rounded-full object-cover shrink-0" />
          <span className="font-bold text-[19px] text-[#191f1d]">DealStudio&trade;</span>
        </button>


        <div className="ml-auto relative">
          <button
            onClick={() => setUserMenu((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-[#f5f6f8]"
          >
            <span className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white shadow-[0_4px_12px_-2px_rgba(12,16,34,0.22)] bg-white flex items-center justify-center shrink-0">
              {org?.logo_url
                ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-[13px] font-semibold">{initial}</span>}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-bold text-[#191f1d] truncate max-w-[180px]">{org?.name || 'Company'}</span>
              <span className={`block text-xs truncate max-w-[180px] ${isMaster ? 'font-semibold text-[var(--ds-brand)]' : 'text-[#7f8c85]'}`}>
                {myLabel}
              </span>
            </span>
          </button>

          {userMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 top-14 z-20 w-52 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5">
                <button onClick={() => { setUserMenu(false); void inviteFriends(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                  <UserPlus className="w-4 h-4" /> {invited ? 'Link copied' : 'Invite friends'}
                </button>
                {/* Moved out of the nav rail: it is not a place you work, it is a
                    place you leave to. */}
                <a href="/"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                  <Home className="w-4 h-4" /> View home page
                </a>
                <button onClick={() => void signOut()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="md:flex ds-rail-min-h">
      {/* Desktop sidebar.

          The height is ds-rail-h, NOT calc(100vh - 68px). body carries
          zoom: 0.9, and zoom does not scale viewport units: 100vh is computed in
          layout pixels and then painted at 0.9x, so the rail covered 90% of the
          screen and left a grey strip under it. ds-rail-h divides by the zoom
          first. See --ds-screen-h in index.css. */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[#edf0f3] bg-white sticky top-[68px] ds-rail-h">
        <div className="sticky top-[68px] flex flex-col ds-rail-h">
        <nav className="flex-1 p-3 space-y-1 pt-4">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}

        </nav>

        {/* Legal and the credit sit at the foot of the rail, out of the way of
            the work but never more than one glance from it. */}
        <div className="p-3 border-t border-[#edf0f3]">
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>

          {/* Below sign-out and legible. These used to be a whisper-grey line
              ABOVE the button, which is the one place nobody looks. */}
          <div className="mt-3 pt-3 border-t border-[#edf0f3]">
            <div className="flex items-center gap-4 px-3">
              <a href="/terms" className="text-xs font-medium text-[#7f8c85] hover:text-[#191f1d]">Terms</a>
              <a href="/privacy" className="text-xs font-medium text-[#7f8c85] hover:text-[#191f1d]">Privacy</a>
              {/* Opens their mail client, same as the site footer. */}
              <a href="mailto:hello@dealstudio.io" className="text-xs font-medium text-[#7f8c85] hover:text-[#191f1d]">Contact</a>
            </div>
            <p className="px-3 mt-2 text-xs text-[#9ca3af]">Powered by DealStudio&trade;</p>
          </div>
        </div>
        </div>
      </aside>

      {/* Mobile top bar: hamburger | wordmark | user */}
      <header className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-[#edf0f3] grid grid-cols-[1fr_auto_1fr] items-center px-2">
        <button
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          className="justify-self-start inline-flex items-center justify-center h-10 w-10 rounded-xl text-[#191f1d] hover:bg-[#f5f6f8]"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button onClick={() => nav('/admin')} className="justify-self-center font-bold text-[17px] text-[#191f1d]">
          DealStudio
        </button>

        <div className="justify-self-end relative">
          <button
            onClick={() => setUserMenu((v) => !v)}
            aria-label="Account"
            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-[13px] font-semibold"
          >
            {initial}
          </button>

          {userMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 top-11 z-20 w-52 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5">
                {org && (
                  <div className="px-3 py-2 border-b border-[#edf0f3] mb-1">
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ds-accent-ink)]">Company</p>
                    <p className="text-sm font-semibold text-[#191f1d] truncate">{org.name}</p>
                    <p className={`text-xs mt-0.5 truncate ${isMaster ? 'font-semibold text-[var(--ds-brand)]' : 'text-[#7f8c85]'}`}>
                      {myLabel}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => nav('/admin/settings')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
                >
                  <UserPlus className="w-4 h-4" /> {invited ? 'Link copied' : 'Invite friends'}
                </button>
                <a href="/"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                  <Home className="w-4 h-4" /> View home page
                </a>
                <button
                  onClick={() => void signOut()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Mobile drawer */}
      {drawer && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-72 max-w-[85%] bg-white flex flex-col shadow-2xl">
            <div className="flex items-center gap-2.5 px-4 h-14 border-b border-[#edf0f3]">
              <img src={dsMark} alt="" className="h-7 w-7 rounded-full object-cover shrink-0" />
              <span className="font-bold text-[17px] text-[#191f1d]">DealStudio&trade;</span>
              <button
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="ml-auto inline-flex items-center justify-center h-9 w-9 rounded-xl text-[#7f8c85] hover:bg-[#f5f6f8]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV.map(({ to, label, Icon, end }) => (
                <NavLink key={to} to={to} end={end} className={linkCls}>
                  <Icon className="w-4 h-4" />
                  {label}
                </NavLink>
              ))}

            </nav>

            <div className="px-3 pb-3 pt-3 border-t border-[#edf0f3]">
              <div className="flex items-center gap-4 px-3">
                <a href="/terms" className="text-xs font-medium text-[#7f8c85] hover:text-[#191f1d]">Terms</a>
                <a href="/privacy" className="text-xs font-medium text-[#7f8c85] hover:text-[#191f1d]">Privacy</a>
                <a href="mailto:hello@dealstudio.io" className="text-xs font-medium text-[#7f8c85] hover:text-[#191f1d]">Contact</a>
              </div>
              <p className="px-3 mt-2 text-xs text-[#9ca3af]">Powered by DealStudio&trade;</p>
            </div>

            {org && (
              <div className="p-3 border-t border-[#edf0f3]">
                <p className="px-3 text-[11px] uppercase tracking-wider font-semibold text-[var(--ds-accent-ink)]">Company</p>
                <p className="px-3 text-sm font-semibold text-[#191f1d] truncate">{org.name}</p>
              </div>
            )}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-14 md:pt-0 ds-page-bottom">{children}</main>
      <SetupChecklist />
      </div>
    </div>
  );
}
