/**
 * AdminShell — persistent chrome for every authenticated surface.
 * Desktop: a fixed left sidebar.
 * Mobile: a top bar (hamburger left, wordmark centre, user right) that opens a
 * slide-in drawer for navigation and a small menu for the account.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutGrid, Presentation, Palette, Settings, LogOut, Menu, X, User, CreditCard, Shield } from 'lucide-react';
import { useAdminAuth } from './AdminGate';
import { isPlatformAdmin } from '../../lib/billing';

const DEAL_NAV = [
  { to: '/admin', label: 'Deal Studio', Icon: Presentation, end: true },
  { to: '/admin/deals', label: 'Deal Manager', Icon: LayoutGrid, end: false },
  { to: '/admin/interface', label: 'Interface Studio', Icon: Palette, end: false },
];
const BILLING_NAV  = { to: '/admin/billing', label: 'Billing', Icon: CreditCard, end: false };
const MASTER_NAV   = { to: '/admin/master', label: 'User Management', Icon: Shield, end: false };
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
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => { void isPlatformAdmin().then(setIsMaster); }, []);
  const NAV = isMaster
    ? [...DEAL_NAV, MASTER_NAV, SETTINGS_NAV]
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
        <button onClick={() => nav('/admin')} className="flex items-center gap-2.5">
          <span className="font-bold text-[19px] text-[#191f1d]">DealStudio&trade;</span>
        </button>


        <div className="ml-auto relative">
          <button
            onClick={() => setUserMenu((v) => !v)}
            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-[#f5f6f8]"
          >
            <span className="w-9 h-9 rounded-full overflow-hidden border border-[#edf0f3] bg-white flex items-center justify-center shrink-0">
              {org?.logo_url
                ? <img src={org.logo_url} alt="" className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white text-[13px] font-semibold">{initial}</span>}
            </span>
            <span className="text-left leading-tight">
              <span className="block text-sm font-bold text-[#191f1d] truncate max-w-[180px]">{org?.name || 'Company'}</span>
              <span className="block text-xs text-[#7f8c85]">Admin</span>
            </span>
          </button>

          {userMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 top-14 z-20 w-52 rounded-2xl bg-white border border-[#edf0f3] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18)] p-1.5">
                <button onClick={() => nav('/admin/settings')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                  <User className="w-4 h-4" /> Account
                </button>
                <button onClick={() => void signOut()}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]">
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="md:flex md:min-h-[calc(100vh-68px)]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[#edf0f3] bg-white">
        <div className="sticky top-[68px] flex flex-col h-[calc(100vh-68px)]">
        <nav className="flex-1 p-3 space-y-1 pt-4">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkCls}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-[#edf0f3]">
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
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
                  </div>
                )}
                <button
                  onClick={() => nav('/admin/settings')}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
                >
                  <User className="w-4 h-4" /> Account
                </button>
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
      </div>
    </div>
  );
}
