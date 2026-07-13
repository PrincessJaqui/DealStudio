/**
 * LandingScreen - public marketing page for DealStudio.
 * Header is auth-aware: shows Log in / Get started when signed out, and
 * Dashboard + avatar + Log out when an admin session exists. Includes a
 * light/dark toggle persisted per browser.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLanding, type LandingBlock } from '../../lib/siteContent';
import { CustomLanding } from './CustomLanding';
import { PublicHeader } from '../dealstudio/PublicHeader';
import { SiteFooter } from '../dealstudio/SiteFooter';
import { Lock, BarChart3, Eye, Moon, Sun, ArrowRight } from 'lucide-react';
import { HeroMockup } from '../dealstudio/HeroMockup';
import { supabase } from '../../lib/supabase';
import { useInViewOnce } from '../../lib/useInViewOnce';

const GRAD = 'bg-gradient-to-br from-[var(--ds-grad-from)] via-[var(--ds-grad-mid)] to-[var(--ds-grad-to)]';

function useTheme() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('dealstudio_theme');
    const isDark = saved === 'dark';
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

export function LandingScreen() {
  const [custom, setCustom] = useState<LandingBlock[] | null>(null);

  // Published blocks replace the built-in page. Until they load we render the
  // built-in one, so the page never flashes empty.
  useEffect(() => { void fetchLanding().then(setCustom); }, []);

  const nav = useNavigate();
  const { dark, toggle } = useTheme();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setEmail(session?.user?.email ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };
  const initials = (email || '?').slice(0, 2).toUpperCase();

  const { ref: featuresRef, inView } = useInViewOnce<HTMLElement>();

  // A published custom page replaces the built-in one entirely. The header and
  // footer stay, so branding and the copyright line remain consistent.
  if (custom && custom.length > 0) {
    return (
      <div className="min-h-screen bg-[#f5f6f8] dark:bg-[#0b0e1a] text-[#0c1022] dark:text-[#eef1fa]">
        <PublicHeader darkToggle />
        <CustomLanding blocks={custom} />
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] dark:bg-[#0b0e1a] text-[#0c1022] dark:text-[#eef1fa]">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[#e6e8ee] dark:border-[#242c47] bg-[#f5f6f8]/85 dark:bg-[#0b0e1a]/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 h-[68px] flex items-center gap-7">
          <button onClick={() => nav('/')} className="flex items-center gap-2.5 font-bold text-[21px] tracking-tight">
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

            {email ? (
              <>
                <button
                  onClick={() => nav('/admin')}
                  className="rounded-xl border border-[#e6e8ee] dark:border-[#242c47] px-4 py-2.5 text-[15px] font-semibold hover:bg-white dark:hover:bg-[#141a2e]"
                >
                  Dashboard
                </button>
                <span className={`w-[34px] h-[34px] rounded-full ${GRAD} text-white text-[13px] font-semibold flex items-center justify-center`}>
                  {initials}
                </span>
                <button onClick={signOut} className="px-2 py-2.5 text-[15px] font-semibold text-[#5b6478] dark:text-[#9aa4be] hover:text-[#0c1022] dark:hover:text-white">
                  Log out
                </button>
              </>
            ) : (
              <>
                <button onClick={() => nav('/admin')} className="px-2 py-2.5 text-[15px] font-semibold">
                  Log in
                </button>
                <button onClick={() => nav('/admin')} className={`rounded-xl ${GRAD} text-white px-[18px] py-2.5 text-[15px] font-semibold shadow-[0_10px_24px_-10px_rgba(80,61,187,0.6)] hover:brightness-110 transition`}>
                  Get started
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-12 items-center pt-[74px] pb-20">
        <div>
          <h1 className="text-[clamp(38px,5vw,58px)] font-bold leading-[1.08] tracking-tight">
            Your Studio,{' '}
            <span className="bg-gradient-to-br from-[var(--ds-grad-from)] via-[var(--ds-grad-mid)] to-[var(--ds-grad-to)] bg-clip-text text-transparent">
              Your Raise.
            </span>
          </h1>
          <p className="mt-5 text-[18px] text-[#5b6478] dark:text-[#9aa4be] max-w-[38ch]">
            Build your deal, upload your deck, and manage investor access from a single command center.
          </p>
          <div className="mt-7 flex flex-wrap gap-3.5">
            <button onClick={() => nav('/signup')} className={`rounded-xl ${GRAD} text-white px-[18px] py-3 font-semibold shadow-[0_10px_24px_-10px_rgba(80,61,187,0.6)] hover:brightness-110 hover:-translate-y-0.5 transition inline-flex items-center gap-2`}>
              Start free for 30 days <ArrowRight className="w-4 h-4" />
            </button>
            <button onClick={() => nav('/d/investors')} className="rounded-xl border border-[#e6e8ee] dark:border-[#242c47] bg-white dark:bg-[#141a2e] px-[18px] py-3 font-semibold hover:-translate-y-0.5 transition">
              See a live demo
            </button>
          </div>
        </div>

        <HeroMockup />

      </section>

      {/* Features */}
      <section ref={featuresRef} className={`mx-auto max-w-6xl px-6 py-20 ${inView ? 'ds-animate' : ''}`}>
        <div className="max-w-[760px] mx-auto text-center mb-12">
          <h2 className="text-[clamp(28px,3.4vw,38px)] font-bold tracking-tight">The Professional Command Center for Your Raise</h2>
          <p className="mt-3.5 text-[17px] text-[#5b6478] dark:text-[#9aa4be]">
            Your Studio provides a private, centralized space to manage your deck, business model, and deal terms. Deliver a polished experience that keeps investors informed with live updates and granular access control, ensuring your materials are always current and secure.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {[
            { Icon: Lock, tint: GRAD, iconColor: 'text-white', title: 'Gated access', body: 'Password, invite-only, or a private share link. Revoke anytime. You decide who sees what, per investor.' },
            { Icon: BarChart3, tint: 'bg-[var(--ds-accent)]', iconColor: 'text-[#08423b]', title: 'Live business model', body: 'An interactive revenue model and market funnel investors can explore. Edit once, everyone sees the latest.' },
            { Icon: Eye, tint: 'bg-gradient-to-br from-[var(--ds-grad-from)] to-[var(--ds-grad-mid)]', iconColor: 'text-white', title: 'Investor analytics', body: 'See who opened the deck, what they read, and how long. Follow up on the ones leaning in.' },
          ].map(({ Icon, tint, iconColor, title, body }) => (
            <div
              key={title}
              className="ds-card rounded-2xl bg-white dark:bg-[#141a2e] border border-[#e6e8ee] dark:border-[#242c47] shadow-[0_8px_30px_-12px_rgba(23,20,60,0.10)] p-6"
            >
              <div className={`w-11 h-11 rounded-xl ${tint} flex items-center justify-center mb-4`}>
                <Icon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <h3 className="text-[19px] font-semibold">{title}</h3>
              <p className="mt-2 text-[15px] text-[#5b6478] dark:text-[#9aa4be]">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className={`relative overflow-hidden rounded-3xl ${GRAD} px-10 py-14 text-center text-white`}>
          <span className="absolute -right-10 -top-16 w-72 h-72 rounded-full bg-[var(--ds-accent)] opacity-30 blur-3xl" />
          <h2 className="relative text-[clamp(28px,3.4vw,38px)] font-bold tracking-tight">Ready to open your deal room?</h2>
          <p className="relative mt-3 text-[17px] text-white/80">Publish a private, always-current investor page in minutes.</p>
          <button onClick={() => nav('/signup')} className="relative mt-6 rounded-xl bg-white text-[var(--ds-brand)] px-[18px] py-3 font-semibold hover:-translate-y-0.5 transition">
            Start free for 30 days
          </button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
