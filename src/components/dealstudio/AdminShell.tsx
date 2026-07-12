/**
 * AdminShell — persistent sidebar chrome for every authenticated surface.
 * Holds the company identity, the section nav, and sign out. Screens render
 * into the content area so the chrome never remounts on navigation.
 */

import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutGrid, Presentation, Palette, Settings, LogOut } from 'lucide-react';
import { useAdminAuth } from './AdminGate';
import dsMark from '../../assets/dealstudio-mark.png';

const NAV = [
  { to: '/admin', label: 'Deal Studio', Icon: Presentation, end: true },
  { to: '/admin/deals', label: 'Deal Manager', Icon: LayoutGrid, end: false },
  { to: '/admin/interface', label: 'Interface Studio', Icon: Palette, end: false },
  { to: '/admin/settings', label: 'System Settings', Icon: Settings, end: false },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { signOut, org } = useAdminAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-[#edf0f3] bg-white">
        <button
          onClick={() => nav('/admin')}
          className="flex items-center gap-2.5 px-5 h-[68px] border-b border-[#edf0f3]"
        >
          <img src={dsMark} alt="" className="w-7 h-7 rounded-lg" />
          <span className="font-bold text-[17px] text-[#191f1d]">DealStudio</span>
        </button>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition ${
                  isActive
                    ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                    : 'text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-[#edf0f3]">
          {org && (
            <div className="px-3 pb-3">
              <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--ds-accent-ink)]">Company</p>
              <p className="text-sm font-semibold text-[#191f1d] truncate">{org.name}</p>
            </div>
          )}
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium text-[#7f8c85] hover:bg-[#f5f6f8] hover:text-[#191f1d]"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-white border-b border-[#edf0f3] flex items-center gap-2 px-4 h-14">
        <img src={dsMark} alt="" className="w-7 h-7 rounded-lg" />
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            aria-label={label}
            className={({ isActive }) =>
              `inline-flex items-center justify-center h-9 w-9 rounded-lg ${
                isActive
                  ? 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)] text-white'
                  : 'text-[#7f8c85]'
              }`
            }
          >
            <Icon className="w-4 h-4" />
          </NavLink>
        ))}
        <button onClick={() => void signOut()} className="ml-auto text-[#7f8c85]">
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      <main className="flex-1 min-w-0 pt-14 md:pt-0">{children}</main>
    </div>
  );
}
