/**
 * PublicHeader — the shared chrome for every unauthenticated surface: landing,
 * sign in, sign up, and investor deal rooms.
 *
 * On a paying customer's deal room we deliberately do NOT market to their
 * investors: the header falls back to a quiet "Powered by DealStudio" instead
 * of a Get started button. The demo room is ours, so there the CTA belongs.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import dsMark from '../../assets/dealstudio-mark.png';
import { supabase } from '../../lib/supabase';
import { fetchMyOrg, type Organization } from '../../lib/org';
import { isPlatformAdmin } from '../../lib/billing';

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const isDark = localStorage.getItem('dealstudio_theme') === 'dark';
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      localStorage.setItem('dealstudio_theme', next ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };
  return { dark, toggle };
}

export function PublicHeader({
  variant = 'full',
  darkToggle = false,
}: {
  /** 'full' shows Log in / Get started. 'quiet' is for a customer's deal room. */
  variant?: 'full' | 'quiet';
  /**
   * Off by default, and opt-in on purpose. Only the landing pages have dark:
   * styles. Everywhere else this button flipped the theme class and left the
   * page half-dark and unreadable, so it is only shown where dark mode actually
   * exists.
   */
  darkToggle?: boolean;
}) {
  const nav = useNavigate();
  const { dark, toggle } = useTheme();
  const [email, setEmail] = useState<string | null>(null);
  const [myOrg, setMyOrg] = useState<Organization | null>(null);
  const [isMaster, setIsMaster] = useState(false);

  // Only when signed in. An investor viewing a deal room must never trigger this.
  useEffect(() => {
    if (!email) { setMyOrg(null); setIsMaster(false); return; }
    let alive = true;
    void (async () => {
      const [o, m] = await Promise.all([fetchMyOrg(), isPlatformAdmin()]);
      if (!alive) return;
      setMyOrg(o);
      setIsMaster(!!m);
    })();
    return () => { alive = false; };
  }, [email]);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setEmail(session?.user?.email ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const initials = (email || '?').slice(0, 2).toUpperCase();
  const GRAD = 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-to)]';

  return (
    <header className="sticky top-0 z-30 border-b border-[#e6e8ee] dark:border-[#242c47] bg-[#f5f6f8]/85 dark:bg-[#0b0e1a]/85 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 h-[68px] flex items-center gap-4">
        <button
          onClick={() => nav('/')}
          className="flex items-center gap-2 sm:gap-2.5 font-bold text-[17px] sm:text-[21px] tracking-tight text-[#0c1022] dark:text-[#eef1fa] whitespace-nowrap"
        >
          <img
            src={dsMark}
            alt=""
            className="h-9 w-9 rounded-full object-cover shrink-0"
          />
          DealStudio&trade;
        </button>

        <div className="ml-auto flex items-center gap-3">
          {darkToggle && (
            <button
              onClick={toggle}
              aria-label="Toggle theme"
              className="w-9 h-9 rounded-xl border border-[#e6e8ee] dark:border-[#242c47] flex items-center justify-center text-[#5b6478] dark:text-[#9aa4be] hover:text-[#0c1022] dark:hover:text-white"
            >
              {/* The icon names the mode you are IN, not the one you would switch
                  to. In light mode you see a sun. */}
              {dark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          )}

          {variant === 'quiet' ? (
            /* An investor on a gated room. The credit moved to the footer; this
               spot now offers the way IN, so a founder who lands here (or an
               investor curious about the product) can sign up or log in. */
            <>
              <button
                onClick={() => nav('/admin')}
                className="px-1.5 sm:px-2 py-2.5 text-[13px] sm:text-[15px] font-semibold text-[#0c1022] dark:text-[#eef1fa] whitespace-nowrap"
              >
                Log in
              </button>
              <button
                onClick={() => nav('/signup')}
                className={`rounded-xl ${GRAD} text-white px-3 sm:px-[18px] py-2.5 text-[13px] sm:text-[15px] font-semibold hover:brightness-110 transition whitespace-nowrap`}
              >
                Sign up
              </button>
            </>
          ) : email ? (
            /* Signed in: show the same profile block as the admin shell, so the
               home page does not feel like a different product. Clicking it goes
               back to the dashboard, which is also what the browser back button
               should do -- but a person reaches for whatever is visible. */
            <button
              onClick={() => nav('/admin')}
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 hover:bg-white/60 dark:hover:bg-[#141a2e]"
            >
              <span className="w-9 h-9 rounded-full overflow-hidden border border-[#e6e8ee] bg-white flex items-center justify-center shrink-0">
                {myOrg?.logo_url
                  ? <img src={myOrg.logo_url} alt="" className="w-full h-full object-cover" />
                  : <span className={`w-full h-full flex items-center justify-center ${GRAD} text-white text-[13px] font-semibold`}>{initials}</span>}
              </span>
              <span className="text-left leading-tight hidden sm:block">
                <span className="block text-sm font-bold text-[#0c1022] dark:text-[#eef1fa] truncate max-w-[160px]">
                  {myOrg?.name || 'Dashboard'}
                </span>
                <span className={`block text-xs ${isMaster ? 'font-semibold text-[var(--ds-brand)]' : 'text-[#5b6478] dark:text-[#9aa4be]'}`}>
                  {isMaster ? 'Master Admin' : 'Admin'}
                </span>
              </span>
            </button>
          ) : (
            <>
              <button
                onClick={() => nav('/admin')}
                className="px-1.5 sm:px-2 py-2.5 text-[13px] sm:text-[15px] font-semibold text-[#0c1022] dark:text-[#eef1fa] whitespace-nowrap"
              >
                Log in
              </button>
              <button
                onClick={() => nav('/signup')}
                className={`rounded-xl ${GRAD} text-white px-3 sm:px-[18px] py-2.5 text-[13px] sm:text-[15px] font-semibold hover:brightness-110 transition whitespace-nowrap`}
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
