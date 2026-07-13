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
import { supabase } from '../../lib/supabase';

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
}: {
  /** 'full' shows Log in / Get started. 'quiet' is for a customer's deal room. */
  variant?: 'full' | 'quiet';
}) {
  const nav = useNavigate();
  const { dark, toggle } = useTheme();
  const [email, setEmail] = useState<string | null>(null);

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
          className="flex items-center gap-2.5 font-bold text-[21px] tracking-tight text-[#0c1022] dark:text-[#eef1fa]"
        >
          DealStudio&trade;
        </button>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-9 h-9 rounded-xl border border-[#e6e8ee] dark:border-[#242c47] flex items-center justify-center text-[#5b6478] dark:text-[#9aa4be] hover:text-[#0c1022] dark:hover:text-white"
          >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {variant === 'quiet' ? (
            <span className="text-[13px] text-[#5b6478] dark:text-[#9aa4be]">Powered by DealStudio&trade;</span>
          ) : email ? (
            <>
              <button
                onClick={() => nav('/admin')}
                className="rounded-xl border border-[#e6e8ee] dark:border-[#242c47] px-4 py-2.5 text-[15px] font-semibold text-[#0c1022] dark:text-[#eef1fa] hover:bg-white dark:hover:bg-[#141a2e]"
              >
                Dashboard
              </button>
              <span className={`w-[34px] h-[34px] rounded-full ${GRAD} text-white text-[13px] font-semibold flex items-center justify-center`}>
                {initials}
              </span>
            </>
          ) : (
            <>
              <button
                onClick={() => nav('/admin')}
                className="px-2 py-2.5 text-[15px] font-semibold text-[#0c1022] dark:text-[#eef1fa]"
              >
                Log in
              </button>
              <button
                onClick={() => nav('/signup')}
                className={`rounded-xl ${GRAD} text-white px-[18px] py-2.5 text-[15px] font-semibold hover:brightness-110 transition`}
              >
                Get started
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
